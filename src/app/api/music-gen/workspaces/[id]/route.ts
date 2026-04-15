import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const db = getDb()
    const workspace = db.prepare(`
      SELECT w.*, c.channel_name, c.youtube_channel_id, c.resource_path
      FROM workspaces w
      LEFT JOIN channels c ON c.id = w.channel_id
      WHERE w.id = ?
    `).get(params.id)
    if (!workspace) return err('NOT_FOUND', 'Workspace not found', 404)
    return ok(workspace)
  } catch (e) {
    return handleError(e)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    const db = getDb()
    const allowedFields = ['name', 'status', 'pipeline_mode', 'cover_midi_id']
    const updates = Object.entries(body)
      .filter(([k]) => allowedFields.includes(k))
      .map(([k, v]) => ({ key: k, val: v }))

    if (updates.length === 0) return err('VALIDATION_ERROR', 'No valid fields', 400)

    const setClause = updates.map(u => `${u.key} = ?`).join(', ')
    const values = [...updates.map(u => u.val), Date.now(), params.id]

    db.prepare(`UPDATE workspaces SET ${setClause}, updated_at = ? WHERE id = ?`).run(...values)
    const updated = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(params.id)
    return ok(updated)
  } catch (e) {
    return handleError(e)
  }
}
