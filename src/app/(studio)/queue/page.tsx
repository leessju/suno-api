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

  const statusClass: Record<string, string> = {
    pending: 'text-xs px-2 py-0.5 rounded-full font-medium bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800',
    running: 'text-xs px-2 py-0.5 rounded-full font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    done:    'text-xs px-2 py-0.5 rounded-full font-medium bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400',
    failed:  'text-xs px-2 py-0.5 rounded-full font-medium bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400',
  }

  const statLabelClass: Record<string, string> = {
    pending: 'text-amber-600 dark:text-amber-400',
    running: 'text-blue-600 dark:text-blue-400',
    done:    'text-green-600 dark:text-green-400',
    failed:  'text-red-600 dark:text-red-400',
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Job 큐</h1>

      {/* 통계 */}
      <div className="grid grid-cols-4 gap-3">
        {Object.entries(stats).map(([status, cnt]) => (
          <div key={status} className="p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm text-center">
            <p className={`text-xs font-medium uppercase tracking-wider mb-2 ${statLabelClass[status] ?? 'text-gray-500 dark:text-gray-400'}`}>{status}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{cnt}</p>
          </div>
        ))}
      </div>

      {/* Job 목록 */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm divide-y divide-gray-200 dark:divide-gray-800">
        {jobs.map(job => (
          <div key={job.id} className="px-4 py-3 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={statusClass[job.status] ?? 'text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}>
                  {job.status}
                </span>
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{job.type}</p>
              </div>
              {job.error && (
                <p className="text-xs text-red-500 dark:text-red-400 mt-1 truncate">{job.error}</p>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xs text-gray-500 dark:text-gray-400">{job.attempts}/{job.max_attempts} 시도</p>
              <p className="text-xs text-gray-400 dark:text-gray-600 mt-0.5 font-mono">{job.id.slice(0, 8)}</p>
            </div>
          </div>
        ))}
        {jobs.length === 0 && (
          <div className="p-8 text-center border border-dashed border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-400 dark:text-gray-500">
            Job이 없습니다
          </div>
        )}
      </div>
    </div>
  )
}
