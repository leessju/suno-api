import { NextResponse, NextRequest } from 'next/server';
import { sunoApi } from '@/lib/SunoApi';
import { corsHeaders, extractAccount } from '@/lib/utils';

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

    const accountParam = formData.get('account') as string | null;
    const account = accountParam !== null && !isNaN(Number(accountParam)) && Number(accountParam) >= 0
      ? Number(accountParam) : undefined;
    const projectId = formData.get('project_id') as string | null;
    const api = await sunoApi(account);

    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadResult = await api.uploadAudio(buffer, filename, extension);

    // Set metadata if clip ID available (optional — Suno may auto-populate)
    const clipId = (uploadResult as any).clip?.id;
    if (clipId && title) {
      try {
        await api.setUploadMetadata(clipId, title);
        await api.acceptAudioDescription(clipId);
      } catch (metaErr) {
        console.warn('setUploadMetadata/acceptAudioDescription failed (non-fatal):', metaErr instanceof Error ? metaErr.message : metaErr);
      }
    }

    // Move clip to workspace if project_id provided
    if (clipId && projectId) {
      try {
        await api.moveClipsToWorkspace(projectId, [clipId]);
      } catch (wsErr) {
        console.warn('moveClipsToWorkspace failed (non-fatal):', wsErr instanceof Error ? wsErr.message : wsErr);
      }
    }

    return new NextResponse(JSON.stringify({ success: true, ...uploadResult }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : '';
    console.error('Error uploading audio:', errMsg, errStack);
    return new NextResponse(
      JSON.stringify({ error: errMsg }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 200, headers: corsHeaders });
}
