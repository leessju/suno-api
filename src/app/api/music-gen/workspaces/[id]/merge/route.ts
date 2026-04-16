import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = getDb()
    const workspace = db.prepare('SELECT merge_order FROM workspaces WHERE id = ?').get(id) as { merge_order: string | null } | undefined
    if (!workspace) return err('NOT_FOUND', 'Workspace not found', 404)
    const tracks = db.prepare(`
      SELECT suno_track_id, variant_id, checked_at
      FROM workspace_tracks
      WHERE workspace_id = ? AND is_checked = 1
      ORDER BY checked_at ASC
    `).all(id)
    return ok({ tracks, merge_order: workspace.merge_order ? JSON.parse(workspace.merge_order) : null })
  } catch (e) {
    return handleError(e)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const { order } = body
    if (!Array.isArray(order)) return err('VALIDATION_ERROR', 'order must be an array', 400)
    const db = getDb()
    db.prepare('UPDATE workspaces SET merge_order = ? WHERE id = ?').run(JSON.stringify(order), id)
    return ok({ merge_order: order })
  } catch (e) {
    return handleError(e)
  }
}
