import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'
import { requireUser } from '@/lib/auth/guards'
import { randomUUID } from 'crypto'

export async function POST(req: NextRequest) {
  try {
    const { user, response } = await requireUser()
    if (response) return response

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const workspaceId = formData.get('workspace_id') as string | null
    const label = (formData.get('label') as string | null) || null

    if (!file || !workspaceId) {
      return err('VALIDATION_ERROR', 'file and workspace_id required', 400)
    }

    const db = getDb()
    const ws = db.prepare(
      'SELECT id FROM workspaces WHERE id = ? AND (user_id = ? OR user_id IS NULL)'
    ).get(workspaceId, user.id)
    if (!ws) return err('NOT_FOUND', '워크스페이스를 찾을 수 없습니다.', 404)

    const id = `wm_${randomUUID()}`
    const now = Date.now()

    db.prepare(`
      INSERT INTO workspace_midis
        (id, workspace_id, source_type, source_ref, label, status, created_at, updated_at)
      VALUES (?, ?, 'mp3_file', ?, ?, 'pending', ?, ?)
    `).run(id, workspaceId, file.name, label, now, now)

    const midi = db.prepare('SELECT * FROM workspace_midis WHERE id = ?').get(id)
    return ok(midi, 201)
  } catch (e) {
    return handleError(e)
  }
}
