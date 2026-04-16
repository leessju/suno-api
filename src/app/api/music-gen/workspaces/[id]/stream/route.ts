import { NextRequest } from 'next/server'
import { getDb } from '@/lib/music-gen/db'
import { createSSEStream } from '@/lib/sse'
import { err } from '@/lib/music-gen/api-helpers'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()

  const workspace = db.prepare('SELECT id FROM workspaces WHERE id = ?').get(id)
  if (!workspace) return err('NOT_FOUND', 'Workspace not found', 404)

  return createSSEStream(async (send) => {
    let lastSnapshot = ''

    while (true) {
      const jobs = db
        .prepare(
          `SELECT id, type, status, payload, attempts, scheduled_at, picked_at, done_at, error
           FROM job_queue
           WHERE json_extract(payload, '$.workspace_id') = ?
           ORDER BY scheduled_at ASC`
        )
        .all(id)

      const snapshot = JSON.stringify(jobs)
      if (snapshot !== lastSnapshot) {
        lastSnapshot = snapshot
        send({ event: 'jobs', data: jobs })
      }

      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
  })
}
