import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; trackId: string }> }
) {
  try {
    const { id, trackId } = await params
    const db = getDb()
    const result = db.prepare(
      'DELETE FROM track_images WHERE workspace_id = ? AND suno_track_id = ?'
    ).run(id, trackId)
    if (result.changes === 0) return err('NOT_FOUND', 'Image not found', 404)
    return ok({ deleted: true })
  } catch (e) {
    return handleError(e)
  }
}
