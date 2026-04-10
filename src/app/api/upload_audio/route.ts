import { NextResponse, NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { sunoApi } from '@/lib/SunoApi';
import { corsHeaders } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const filename = formData.get('filename') as string || file?.name || 'audio.mp3';
    const extension = filename.split('.').pop() || 'mp3';
    const title = formData.get('title') as string || filename.replace(/\.[^.]+$/, '');

    if (!file) {
      return new NextResponse(JSON.stringify({ error: 'file is required (multipart form)' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const cookie = (await cookies()).toString();
    const api = await sunoApi(cookie);

    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadResult = await api.uploadAudio(buffer, filename, extension);

    // Set metadata if clip ID available
    const clipId = (uploadResult as any).clip?.id;
    if (clipId && title) {
      await api.setUploadMetadata(clipId, title);
      await api.acceptAudioDescription(clipId);
    }

    return new NextResponse(JSON.stringify({ success: true, ...uploadResult }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    console.error('Error uploading audio:', error);
    return new NextResponse(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 200, headers: corsHeaders });
}
