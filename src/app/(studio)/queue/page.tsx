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
    running: 'text-xs px-2 py-0.5 rounded-full font-medium bg-accent dark:bg-accent text-foreground',
    done:    'text-xs px-2 py-0.5 rounded-full font-medium bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400',
    failed:  'text-xs px-2 py-0.5 rounded-full font-medium bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400',
  }

  const statLabelClass: Record<string, string> = {
    pending: 'text-amber-600 dark:text-amber-400',
    running: 'text-foreground',
    done:    'text-green-600 dark:text-green-400',
    failed:  'text-red-600 dark:text-red-400',
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-foreground">Job 큐</h1>

      {/* 통계 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Object.entries(stats).map(([status, cnt]) => (
          <div key={status} className="p-4 bg-background border border-border rounded-lg shadow-sm text-center">
            <p className={`text-xs font-medium uppercase tracking-wider mb-2 ${statLabelClass[status] ?? 'text-muted-foreground'}`}>{status}</p>
            <p className="text-2xl font-bold text-foreground">{cnt}</p>
          </div>
        ))}
      </div>

      {/* Job 목록 */}
      <div className="bg-background border border-border rounded-lg shadow-sm divide-y divide-gray-200 dark:divide-gray-800">
        {jobs.map(job => (
          <div key={job.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 hover:bg-accent dark:hover:bg-accent transition-colors">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={statusClass[job.status] ?? 'text-xs px-2 py-0.5 rounded-full font-medium bg-accent text-muted-foreground'}>
                  {job.status}
                </span>
                <p className="text-sm font-medium text-foreground truncate">{job.type}</p>
              </div>
              {job.error && (
                <p className="text-xs text-red-500 dark:text-red-400 mt-1 truncate">{job.error}</p>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xs text-muted-foreground">{job.attempts}/{job.max_attempts} 시도</p>
              <p className="text-xs text-muted-foreground mt-0.5 font-mono">{job.id.slice(0, 8)}</p>
            </div>
          </div>
        ))}
        {jobs.length === 0 && (
          <div className="p-8 text-center border border-dashed border-border rounded-lg text-sm text-muted-foreground">
            Job이 없습니다
          </div>
        )}
      </div>
    </div>
  )
}
