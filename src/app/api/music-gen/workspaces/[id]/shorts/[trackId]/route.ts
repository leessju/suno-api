import { NextRequest } from 'next/server'
import { ok, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'
import { randomUUID } from 'crypto'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; trackId: string }> }
) {
  try {
    const { id: workspaceId, trackId } = await params
    const body = await req.json()
    const { title, description, pinned_comment, hashtags } = body
    const db = getDb()
    const existing = db.prepare(
      'SELECT id FROM shorts WHERE workspace_id = ? AND suno_track_id = ?'
    ).get(workspaceId, trackId) as { id: string } | undefined
    const id = existing?.id ?? randomUUID()
    const now = Date.now()
    if (existing) {
      const updates: string[] = []
      const vals: unknown[] = []
      if (title !== undefined) { updates.push('title = ?'); vals.push(title) }
      if (description !== undefined) { updates.push('description = ?'); vals.push(description) }
      if (pinned_comment !== undefined) { updates.push('pinned_comment = ?'); vals.push(pinned_comment) }
      if (hashtags !== undefined) { updates.push('hashtags = ?'); vals.push(hashtags) }
      if (updates.length > 0) {
        db.prepare(`UPDATE shorts SET ${updates.join(', ')} WHERE id = ?`).run(...vals, id)
      }
    } else {
      db.prepare(`
        INSERT INTO shorts (id, workspace_id, suno_track_id, title, description, pinned_comment, hashtags, upload_status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
      `).run(id, workspaceId, trackId, title ?? null, description ?? null, pinned_comment ?? null, hashtags ?? null, now)
    }
    const updated = db.prepare('SELECT * FROM shorts WHERE id = ?').get(id)
    return ok(updated)
  } catch (e) {
    return handleError(e)
  }
}
