const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const BUCKET = process.env.R2_BUCKET_NAME;

function getBaseUrl(): string {
  if (!ACCOUNT_ID) throw new Error('CLOUDFLARE_ACCOUNT_ID is not set');
  if (!API_TOKEN) throw new Error('CLOUDFLARE_API_TOKEN is not set');
  if (!BUCKET) throw new Error('R2_BUCKET_NAME is not set');
  return `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET}/objects`;
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${API_TOKEN}`,
  };
}

/**
 * Upload an object to R2.
 * body accepts Uint8Array (Buffer is a subclass), Blob, or string.
 */
export async function uploadObject(
  key: string,
  body: Uint8Array | Blob | string,
  contentType: string
): Promise<{ key: string; etag: string; size: string }> {
  const base = getBaseUrl();
  const url = `${base}/${encodeURIComponent(key)}`;

  let byteSize: number;
  if (typeof body === 'string') {
    byteSize = new TextEncoder().encode(body).byteLength;
  } else if (body instanceof Blob) {
    byteSize = body.size;
  } else {
    byteSize = body.byteLength;
  }

  // Convert Uint8Array to ArrayBuffer for BodyInit compatibility
  // Use a plain ArrayBuffer copy to avoid SharedArrayBuffer type issues
  let fetchBody: BodyInit;
  if (body instanceof Uint8Array) {
    const ab = new ArrayBuffer(body.byteLength);
    new Uint8Array(ab).set(body);
    fetchBody = ab;
  } else {
    fetchBody = body;
  }

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      ...authHeaders(),
      'Content-Type': contentType,
    },
    body: fetchBody,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`R2 upload failed [${res.status}]: ${text}`);
  }

  const etag = res.headers.get('etag') ?? '';
  const size = res.headers.get('content-length') ?? String(byteSize);

  return { key, etag, size };
}

export async function downloadObject(key: string): Promise<Response> {
  const base = getBaseUrl();
  const url = `${base}/${encodeURIComponent(key)}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: authHeaders(),
  });

  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`R2 download failed [${res.status}]: ${text}`);
  }

  return res;
}

export async function deleteObject(key: string): Promise<void> {
  const base = getBaseUrl();
  const url = `${base}/${encodeURIComponent(key)}`;

  const res = await fetch(url, {
    method: 'DELETE',
    headers: authHeaders(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`R2 delete failed [${res.status}]: ${text}`);
  }
}

export async function listObjects(
  prefix?: string
): Promise<Array<{ key: string; size: number; uploaded: string }>> {
  const base = getBaseUrl();
  const url = new URL(`${base}/`);
  if (prefix) url.searchParams.set('prefix', prefix);

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: authHeaders(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`R2 list failed [${res.status}]: ${text}`);
  }

  const json = (await res.json()) as {
    result?: {
      objects?: Array<{ key: string; size: number; uploaded: string }>;
    };
  };

  return json.result?.objects ?? [];
}

export function getObjectUrl(key: string): string {
  return `/api/r2/object/${key}`;
}
