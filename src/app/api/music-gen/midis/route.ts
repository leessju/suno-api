import { NextRequest } from 'next/server'
import { ok, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'
import { requireUser } from '@/lib/auth/guards'

export async function GET(req: NextRequest) {
  try {
    const { user, response } = await requireUser()
    if (response) return response

    const { searchParams } = new URL(req.url)
    const workspace_id = searchParams.get('workspace_id')
    const source_type = searchParams.get('source_type')

    const db = getDb()
    const conditions = ['(w.user_id = ? OR w.user_id IS NULL)']
    const params: unknown[] = [user.id]

    if (workspace_id) {
      conditions.push('wm.workspace_id = ?')
      params.push(workspace_id)
    }
    if (source_type) {
      conditions.push('wm.source_type = ?')
      params.push(source_type)
    }

    const rows = db.prepare(`
      SELECT wm.*, w.name as workspace_name
      FROM workspace_midis wm
      LEFT JOIN workspaces w ON w.id = wm.workspace_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY wm.created_at DESC
      LIMIT 200
    `).all(...params)
    return ok(rows)
  } catch (e) {
    return handleError(e)
  }
}
