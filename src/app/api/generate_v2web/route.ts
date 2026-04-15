import { NextResponse, NextRequest } from 'next/server';
import { sunoApi } from '@/lib/SunoApi';
import { corsHeaders, extractAccount } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, tags, prompt } = body;

    if (!title || !tags) {
      return new NextResponse(JSON.stringify({ error: 'title and tags are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const account = extractAccount(body);
    const api = await sunoApi(account);

    const result = await api.generateV2Web({
      title,
      tags,
      prompt: prompt || '',
      projectId: body.project_id,
      model: body.mv || body.model,
      makeInstrumental: body.make_instrumental,
      negativeTags: body.negative_tags,
      vocalGender: body.vocal_gender,
      weirdness: body.weirdness,
      styleWeight: body.style_weight,
      audioWeight: body.audio_weight,
      coverClipId: body.cover_clip_id,
      coverStartS: body.cover_start_s,
      coverEndS: body.cover_end_s,
      personaId: body.persona_id,
      artistClipId: body.artist_clip_id,
      artistStartS: body.artist_start_s,
      artistEndS: body.artist_end_s,
      continueClipId: body.continue_clip_id,
      continueAt: body.continue_at,
    });

    return new NextResponse(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    console.error('Error generating v2-web:', error);
    return new NextResponse(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 200, headers: corsHeaders });
}
