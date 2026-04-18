import { NextRequest, NextResponse } from 'next/server';
import { downloadObject } from '@/lib/r2';
import { corsHeaders } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params
    const key = path.join('/');
    const r2Res = await downloadObject(key);

    if (r2Res.status === 404) {
      return NextResponse.json(
        { error: 'Object not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    const filename = key.split('/').pop() ?? 'file';
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    const mimeMap: Record<string, string> = {
      mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
      json: 'application/json', txt: 'text/plain',
    };
    const contentType = mimeMap[ext] ?? r2Res.headers.get('content-type') ?? 'application/octet-stream';
    const contentLength = r2Res.headers.get('content-length');

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${filename}"`,
      ...corsHeaders,
    };
    if (contentLength) {
      headers['Content-Length'] = contentLength;
    }

    return new Response(r2Res.body, {
      status: r2Res.status,
      headers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('R2 proxy error:', message);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: corsHeaders });
}
