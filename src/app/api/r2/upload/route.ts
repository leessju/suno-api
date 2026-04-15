import { NextRequest, NextResponse } from 'next/server';
import { uploadObject, getObjectUrl } from '@/lib/r2';
import { corsHeaders } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'file field is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    const providedKey = formData.get('key') as string | null;
    const key = providedKey || `uploads/${Date.now()}-${file.name}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadObject(key, buffer, file.type || 'application/octet-stream');

    return NextResponse.json(
      {
        key: result.key,
        url: getObjectUrl(result.key),
        etag: result.etag,
        size: result.size,
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('R2 upload error:', message);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: corsHeaders });
}
