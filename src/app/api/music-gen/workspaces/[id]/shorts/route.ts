import { NextRequest } from 'next/server'
import { ok, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = getDb()
    const tracks = db.prepare(`
      SELECT wt.suno_track_id, wt.variant_id, wt.is_checked,
             s.id as shorts_id, s.title, s.description, s.pinned_comment, s.hashtags,
             s.upload_status, s.youtube_short_id
      FROM workspace_tracks wt
      LEFT JOIN shorts s ON s.workspace_id = wt.workspace_id AND s.suno_track_id = wt.suno_track_id
      WHERE wt.workspace_id = ?
      ORDER BY wt.checked_at ASC
    `).all(id)
    return ok(tracks)
  } catch (e) {
    return handleError(e)
  }
}
