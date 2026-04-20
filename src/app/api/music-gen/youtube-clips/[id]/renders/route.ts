import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'
import { requireUser } from '@/lib/auth/guards'

type Params = { params: Promise<{ id: string }> }

// GET /api/music-gen/youtube-clips/[id]/renders
// 클립에 병합된 render_results 목록 반환
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const { user, response } = await requireUser()
    if (response) return response

    const db = getDb()

    // 소유권 확인
    const clip = db.prepare(`
      SELECT yc.id FROM youtube_clips yc
      JOIN channels c ON c.id = yc.channel_id
      JOIN workspaces ws ON ws.channel_id = c.id
      WHERE yc.id = ? AND ws.user_id = ? AND yc.deleted_at IS NULL
    `).get(id, user.id)
    if (!clip) return err('NOT_FOUND', '클립을 찾을 수 없습니다.', 404)

    const rows = db.prepare(`
      SELECT
        ycr.sort_order,
        rr.id          as render_id,
        rr.named_path,
        rr.rendered_at,
        rr.render_bg_key,
        rr.lyric_lang,
        rr.lyric_trans,
        ds.render_bg_key as ds_bg_key,
        COALESCE(rr.render_bg_key, ds.render_bg_key) as bg_key,
        mdr.title_jp,
        mdr.title_en,
        ds.duration
      FROM youtube_clip_renders ycr
      JOIN render_results rr ON rr.id = ycr.render_id
      LEFT JOIN draft_songs ds ON ds.suno_id = rr.suno_track_id AND ds.deleted_at IS NULL
      LEFT JOIN midi_draft_rows mdr ON mdr.id = ds.draft_row_id AND mdr.deleted_at IS NULL
      WHERE ycr.clip_id = ?
      ORDER BY ycr.sort_order ASC
    `).all(id)

    return ok(rows)
  } catch (e) {
    return handleError(e)
  }
}
