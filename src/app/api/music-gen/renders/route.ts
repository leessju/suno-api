import { NextRequest } from 'next/server'
import { ok, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'
import { requireUser } from '@/lib/auth/guards'

export const dynamic = 'force-dynamic'

// GET /api/music-gen/renders?workspace_id=
export async function GET(req: NextRequest) {
  try {
    const { user, response } = await requireUser()
    if (response) return response

    const { searchParams } = new URL(req.url)
    const workspace_id = searchParams.get('workspace_id')

    const db = getDb()
    const conditions = ['w.user_id = ?']
    const params: unknown[] = [user.id]

    if (workspace_id) {
      conditions.push('rr.workspace_id = ?')
      params.push(workspace_id)
    }

    const rows = db.prepare(`
      SELECT rr.id, rr.workspace_id, rr.suno_track_id,
             rr.video_path, rr.named_path, rr.lyric_lang, rr.lyric_trans, rr.rendered_at,
             w.name as workspace_name,
             mdr.title_jp, mdr.title_en
      FROM render_results rr
      LEFT JOIN workspaces w ON w.id = rr.workspace_id
      LEFT JOIN draft_songs ds ON ds.suno_id = rr.suno_track_id AND ds.deleted_at IS NULL
      LEFT JOIN midi_draft_rows mdr ON mdr.id = ds.draft_row_id AND mdr.deleted_at IS NULL
      WHERE ${conditions.join(' AND ')} AND rr.deleted_at IS NULL
      ORDER BY rr.rendered_at DESC
      LIMIT 300
    `).all(...params)

    return ok(rows)
  } catch (e) {
    return handleError(e)
  }
}
