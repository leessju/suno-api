import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const { status } = body as { status?: string }

    if (!status || !['done', 'failed'].includes(status)) {
      return err('VALIDATION_ERROR', 'status must be "done" or "failed"', 400)
    }

    const db = getDb()
    // draft.variants 타입만 클라이언트 ack 허용 (보안: 실제 워커 job 상태 임의 변경 방지)
    const job = db.prepare('SELECT type FROM job_queue WHERE id = ?').get(id) as { type: string } | undefined
    if (!job) return err('NOT_FOUND', 'Job not found', 404)
    if (job.type !== 'draft.variants') {
      return err('FORBIDDEN', 'Only draft.variants jobs can be acked via this endpoint', 403)
    }

    const now = Date.now()
    const result = db
      .prepare(`UPDATE job_queue SET status = ?, done_at = ? WHERE id = ? AND status IN ('pending', 'running')`)
      .run(status, now, id)

    if (result.changes === 0) {
      return err('NOT_FOUND', 'Job not found or already terminal', 404)
    }

    return ok({ id, status })
  } catch (e) {
    return handleError(e)
  }
}
