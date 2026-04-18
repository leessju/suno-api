import { NextRequest } from 'next/server'
import { ok, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'
import { requireUser } from '@/lib/auth/guards'

export const dynamic = 'force-dynamic'

// GET /api/music-gen/renders?workspace_id=&type=track|merge|short
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
      conditions.push('ti.workspace_id = ?')
      params.push(workspace_id)
    }

    const rows = db.prepare(`
      SELECT ti.id, ti.workspace_id, ti.suno_track_id, ti.r2_key,
             ti.source_url, ti.source_type, ti.assigned_at,
             w.name as workspace_name,
             ds.title_jp, ds.title_en, ds.suno_song_id, ds.is_confirmed
      FROM track_images ti
      LEFT JOIN workspaces w ON w.id = ti.workspace_id
      LEFT JOIN draft_songs ds ON ds.suno_song_id = ti.suno_track_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY ti.assigned_at DESC
      LIMIT 300
    `).all(...params)

    return ok(rows)
  } catch (e) {
    return handleError(e)
  }
}
