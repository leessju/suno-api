import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'
import { randomUUID } from 'crypto'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; trackId: string }> }
) {
  try {
    const { id: workspaceId, trackId } = await params
    const db = getDb()
    const shorts = db.prepare(
      'SELECT id, title, description, pinned_comment FROM shorts WHERE workspace_id = ? AND suno_track_id = ?'
    ).get(workspaceId, trackId) as { id: string; title: string | null; description: string | null; pinned_comment: string | null } | undefined
    if (!shorts) return err('NOT_FOUND', 'Shorts record not found. PATCH first to set metadata.', 404)
    const jobId = randomUUID()
    db.prepare(`
      INSERT INTO job_queue (id, type, payload, status, scheduled_at)
      VALUES (?, 'shorts.upload', ?, 'pending', ?)
    `).run(
      jobId,
      JSON.stringify({
        workspace_id: workspaceId,
        suno_track_id: trackId,
        title: shorts.title ?? '',
        description: shorts.description ?? undefined,
        pinned_comment: shorts.pinned_comment ?? undefined,
      }),
      Date.now()
    )
    return ok({ job_id: jobId }, 201)
  } catch (e) {
    return handleError(e)
  }
}
