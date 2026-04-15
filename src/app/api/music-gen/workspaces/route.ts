import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'
import { CreateWorkspaceSchema } from '@/contracts/schemas/workspace'
import { randomUUID } from 'crypto'

export async function GET() {
  try {
    const db = getDb()
    const rows = db.prepare(`
      SELECT w.*, c.channel_name, c.youtube_channel_id
      FROM workspaces w
      LEFT JOIN channels c ON c.id = w.channel_id
      ORDER BY w.created_at DESC
      LIMIT 50
    `).all()
    return ok(rows)
  } catch (e) {
    return handleError(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = CreateWorkspaceSchema.safeParse(body)
    if (!parsed.success) {
      return err('VALIDATION_ERROR', parsed.error.message, 400)
    }

    const { name, source_type, source_ref, channel_id, pipeline_mode } = parsed.data
    const db = getDb()
    const id = `ws_${randomUUID()}`
    const now = Date.now()

    db.prepare(`
      INSERT INTO workspaces (id, name, source_type, source_ref, channel_id, pipeline_mode, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)
    `).run(id, name, source_type, source_ref ?? null, channel_id, pipeline_mode ?? 'step', now, now)

    const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id)
    return ok(workspace, 201)
  } catch (e) {
    return handleError(e)
  }
}
