import { NextResponse, NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { sunoApi } from '@/lib/SunoApi';
import { corsHeaders } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const page = Number(url.searchParams.get('page') || '1');
    const sort = url.searchParams.get('sort') || 'max_created_at_last_updated_clip';
    const showTrashed = url.searchParams.get('show_trashed') === 'true';
    const projectId = url.searchParams.get('id');
    const cookie = (await cookies()).toString();

    const api = await sunoApi(cookie);
    const data = projectId
      ? await api.getWorkspace(projectId)
      : await api.getWorkspaces(page, sort, showTrashed);

    return new NextResponse(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    console.error('Error fetching workspaces:', error);
    return new NextResponse(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const cookie = (await cookies()).toString();
    const api = await sunoApi(cookie);

    const { action } = body;

    if (action === 'create') {
      const { name, description } = body;
      if (!name) {
        return new NextResponse(JSON.stringify({ error: 'name is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
      const data = await api.createWorkspace(name, description);
      return new NextResponse(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    if (action === 'trash' || action === 'restore') {
      const { project_id } = body;
      if (!project_id) {
        return new NextResponse(JSON.stringify({ error: 'project_id is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
      const data = await api.trashWorkspace(project_id, action === 'restore');
      return new NextResponse(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    if (action === 'move_clips') {
      const { project_id, clip_ids } = body;
      if (!project_id || !clip_ids?.length) {
        return new NextResponse(JSON.stringify({ error: 'project_id and clip_ids are required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
      await api.moveClipsToWorkspace(project_id, clip_ids);
      return new NextResponse(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    return new NextResponse(JSON.stringify({ error: 'Invalid action. Use: create, trash, restore, move_clips' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    console.error('Error in workspace action:', error);
    return new NextResponse(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 200, headers: corsHeaders });
}
