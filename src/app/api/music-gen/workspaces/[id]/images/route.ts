import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'
import { randomUUID } from 'crypto'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = getDb()
    const images = db.prepare(`
      SELECT ti.*
      FROM track_images ti
      INNER JOIN workspace_tracks wt
        ON wt.workspace_id = ti.workspace_id AND wt.suno_track_id = ti.suno_track_id
      WHERE ti.workspace_id = ? AND wt.is_checked = 1 AND ti.deleted_at IS NULL
    `).all(id)
    return ok(images)
  } catch (e) {
    return handleError(e)
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const { suno_track_id, source_type, r2_key, source_url, local_path } = body
    if (!suno_track_id || !source_type) {
      return err('VALIDATION_ERROR', 'suno_track_id and source_type are required', 400)
    }
    const db = getDb()
    const imageId = randomUUID()
    db.prepare(`
      INSERT OR REPLACE INTO track_images (id, workspace_id, suno_track_id, source_type, r2_key, source_url, local_path, assigned_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(imageId, id, suno_track_id, source_type, r2_key ?? null, source_url ?? null, local_path ?? null, Date.now())
    const inserted = db.prepare('SELECT * FROM track_images WHERE workspace_id = ? AND suno_track_id = ?').get(id, suno_track_id)
    return ok(inserted, 201)
  } catch (e) {
    return handleError(e)
  }
}
