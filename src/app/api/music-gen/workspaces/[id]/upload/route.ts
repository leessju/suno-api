import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'
import { randomUUID } from 'crypto'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = getDb()
    const results = db.prepare(
      'SELECT * FROM upload_results WHERE workspace_id = ? ORDER BY created_at DESC'
    ).all(id)
    return ok(results)
  } catch (e) {
    return handleError(e)
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const { title, description } = body
    if (!title) return err('VALIDATION_ERROR', 'title is required', 400)
    const db = getDb()
    const uploadId = randomUUID()
    const jobId = randomUUID()
    const now = Date.now()
    db.prepare(`
      INSERT INTO upload_results (id, workspace_id, title, description, status, created_at)
      VALUES (?, ?, ?, ?, 'pending', ?)
    `).run(uploadId, id, title, description ?? null, now)
    db.prepare(`
      INSERT INTO job_queue (id, type, payload, status, scheduled_at)
      VALUES (?, 'upload.youtube', ?, 'pending', ?)
    `).run(jobId, JSON.stringify({ workspace_id: id, upload_result_id: uploadId, title, description }), now)
    const inserted = db.prepare('SELECT * FROM upload_results WHERE id = ?').get(uploadId)
    return ok(inserted, 201)
  } catch (e) {
    return handleError(e)
  }
}
