import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'
import { generateContent } from '@/lib/music-gen/gemini/generator'
import { ChannelWithPersona } from '@/lib/music-gen/repositories/channels'

type Params = { params: Promise<{ id: string }> }

export async function POST(
  req: NextRequest,
  { params }: Params
) {
  try {
    const { id } = await params
    const db = getDb()

    // 워크스페이스 + 채널 조회
    const workspace = db.prepare(`
      SELECT w.*, c.id as ch_id, c.channel_name, c.system_prompt, c.lyric_format,
             c.forbidden_words, c.recommended_words,
             c.youtube_channel_id, c.channel_handle, c.created_at as ch_created_at, c.updated_at as ch_updated_at
      FROM workspaces w
      LEFT JOIN channels c ON c.id = w.channel_id
      WHERE w.id = ?
    `).get(id) as Record<string, unknown> | undefined

    if (!workspace) return err('NOT_FOUND', 'Workspace not found', 404)
    if (!workspace.ch_id) return err('BAD_REQUEST', 'No channel assigned', 400)

    const body = await req.json().catch(() => ({}))
    const emotion_input = (body.emotion_input as string) ?? ''

    const channel: ChannelWithPersona = {
      id: workspace.ch_id as number,
      channel_name: workspace.channel_name as string,
      system_prompt: workspace.system_prompt as string,
      lyric_format: workspace.lyric_format as string,
      forbidden_words: workspace.forbidden_words as string,
      recommended_words: workspace.recommended_words as string,
      youtube_channel_id: workspace.youtube_channel_id as string,
      channel_handle: (workspace.channel_handle as string | null) ?? null,
      created_at: workspace.ch_created_at as string,
      updated_at: workspace.ch_updated_at as string,
    }

    const { content, model } = await generateContent(channel, emotion_input, null)

    return ok({ content, model }, 201)
  } catch (e) {
    return handleError(e)
  }
}

export async function GET(
  _req: NextRequest,
  { params }: Params
) {
  try {
    const { id } = await params
    const db = getDb()

    // workspace_tracks를 통해 이 워크스페이스에 속한 트랙의 variant만 조회
    const rows = db.prepare(`
      SELECT c.*, wt.suno_track_id, wt.is_checked, wt.checked_at
      FROM contents c
      JOIN workspace_tracks wt ON wt.variant_id = c.id
      WHERE wt.workspace_id = ?
      ORDER BY c.created_at DESC
      LIMIT 20
    `).all(id)

    return ok(rows)
  } catch (e) {
    return handleError(e)
  }
}
