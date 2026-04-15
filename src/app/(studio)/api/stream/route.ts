import { createSSEStream } from '@/lib/sse'
import { getDb } from '@/lib/music-gen/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /studio/api/stream?workspace_id=ws_xxx
 * 워크스페이스의 job 상태를 SSE로 스트리밍
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const workspaceId = url.searchParams.get('workspace_id')

  return createSSEStream(async (send) => {
    send({ event: 'connected', data: { workspace_id: workspaceId, ts: Date.now() } })

    if (!workspaceId) {
      send({ event: 'error', data: { message: 'workspace_id required' } })
      return
    }

    // 30초간 job 상태 폴링 (실제로는 P2+에서 더 정교하게 구현)
    const db = getDb()
    const start = Date.now()
    const timeout = 30_000

    while (Date.now() - start < timeout) {
      const jobs = db.prepare(`
        SELECT id, type, status, attempts, error
        FROM job_queue
        WHERE json_extract(payload, '$.workspace_id') = ?
        ORDER BY scheduled_at DESC
        LIMIT 20
      `).all(workspaceId)

      send({ event: 'jobs', data: jobs })

      // 1초 대기
      await new Promise(r => setTimeout(r, 1000))
    }

    send({ event: 'timeout', data: { message: 'Stream timeout. Reconnect to continue.' } })
  })
}
