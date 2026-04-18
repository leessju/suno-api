import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSystemSetting } from '@/lib/music-gen/system-settings';

function getClient(): S3Client {
  const accessKeyId = getSystemSetting('r2_access_key_id');
  const secretAccessKey = getSystemSetting('r2_secret_access_key');
  const endpoint = getSystemSetting('r2_endpoint');

  if (!accessKeyId) throw new Error('R2_ACCESS_KEY_ID is not set');
  if (!secretAccessKey) throw new Error('R2_SECRET_ACCESS_KEY is not set');
  if (!endpoint) throw new Error('R2_ENDPOINT is not set');

  return new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function getBucket(): string {
  const bucket = getSystemSetting('r2_bucket_name');
  if (!bucket) throw new Error('R2_BUCKET_NAME is not set');
  return bucket;
}

export async function uploadObject(
  key: string,
  body: Uint8Array | Blob | string,
  contentType: string
): Promise<{ key: string; etag: string; size: string }> {
  const client = getClient();
  const bucket = getBucket();

  let bodyBytes: Uint8Array;
  if (typeof body === 'string') {
    bodyBytes = new TextEncoder().encode(body);
  } else if (body instanceof Blob) {
    bodyBytes = new Uint8Array(await body.arrayBuffer());
  } else {
    bodyBytes = body;
  }

  const res = await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: bodyBytes,
    ContentType: contentType,
  }));

  return { key, etag: res.ETag ?? '', size: String(bodyBytes.byteLength) };
}

export async function downloadObject(key: string): Promise<Response> {
  const client = getClient();
  const bucket = getBucket();

  try {
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const stream = res.Body as ReadableStream;
    return new Response(stream, {
      headers: {
        'Content-Type': res.ContentType ?? 'application/octet-stream',
        'Content-Length': String(res.ContentLength ?? ''),
      },
    });
  } catch (err: unknown) {
    const code = (err as { name?: string })?.name;
    if (code === 'NoSuchKey') {
      return new Response(null, { status: 404 });
    }
    throw err;
  }
}

export async function deleteObject(key: string): Promise<void> {
  const client = getClient();
  const bucket = getBucket();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function listObjects(
  prefix?: string
): Promise<Array<{ key: string; size: number; uploaded: string }>> {
  const client = getClient();
  const bucket = getBucket();

  const res = await client.send(new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: prefix,
  }));

  return (res.Contents ?? []).map(obj => ({
    key: obj.Key ?? '',
    size: obj.Size ?? 0,
    uploaded: obj.LastModified?.toISOString() ?? '',
  }));
}

export function getObjectUrl(key: string): string {
  return `/api/r2/object/${key}`;
}
