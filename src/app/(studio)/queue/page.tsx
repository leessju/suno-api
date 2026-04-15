import { getDb } from '@/lib/music-gen/db'

interface JobRow {
  id: string
  type: string
  status: string
  attempts: number
  max_attempts: number
  error: string | null
  scheduled_at: number
  picked_at: number | null
  done_at: number | null
}

export const dynamic = 'force-dynamic'

export default async function QueuePage() {
  let jobs: JobRow[] = []
  let stats = { pending: 0, running: 0, done: 0, failed: 0 }

  try {
    const db = getDb()
    jobs = db.prepare(`
      SELECT id, type, status, attempts, max_attempts, error, scheduled_at, picked_at, done_at
      FROM job_queue
      ORDER BY scheduled_at DESC
      LIMIT 100
    `).all() as JobRow[]

    const statRows = db.prepare(
      "SELECT status, COUNT(*) as cnt FROM job_queue GROUP BY status"
    ).all() as { status: string; cnt: number }[]
    for (const r of statRows) {
      (stats as Record<string, number>)[r.status] = r.cnt
    }
  } catch { /* DB not ready */ }

  const statusColor: Record<string, string> = {
    pending: 'text-yellow-400 bg-yellow-900/30',
    running: 'text-blue-400 bg-blue-900/30',
    done: 'text-green-400 bg-green-900/30',
    failed: 'text-red-400 bg-red-900/30',
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Job 큐</h1>

      {/* 통계 */}
      <div className="grid grid-cols-4 gap-3">
        {Object.entries(stats).map(([status, cnt]) => (
          <div key={status} className="p-3 bg-gray-900 rounded-xl border border-gray-800 text-center">
            <p className="text-xs text-gray-400 mb-1">{status}</p>
            <p className="text-xl font-bold">{cnt}</p>
          </div>
        ))}
      </div>

      {/* Job 목록 */}
      <div className="space-y-2">
        {jobs.map(job => (
          <div key={job.id} className="p-3 bg-gray-900 rounded-lg border border-gray-800 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[job.status] ?? 'text-gray-400 bg-gray-800'}`}>
                  {job.status}
                </span>
                <p className="text-sm font-medium text-white truncate">{job.type}</p>
              </div>
              {job.error && (
                <p className="text-xs text-red-400 mt-1 truncate">{job.error}</p>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xs text-gray-500">{job.attempts}/{job.max_attempts} 시도</p>
              <p className="text-xs text-gray-600">{job.id.slice(0, 8)}</p>
            </div>
          </div>
        ))}
        {jobs.length === 0 && (
          <div className="p-6 bg-gray-900 rounded-xl border border-gray-800 text-center text-gray-400 text-sm">
            Job이 없습니다
          </div>
        )}
      </div>
    </div>
  )
}
