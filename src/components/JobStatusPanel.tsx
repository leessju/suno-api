'use client'

import { useEffect, useState } from 'react'

interface Job {
  id: string
  type: string
  status: string
  error?: string | null
  scheduled_at: number
  picked_at?: number | null
  done_at?: number | null
}

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
  running: 'bg-accent text-foreground',
  done: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
  failed: 'bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400',
}

export function JobStatusPanel({ workspaceId }: { workspaceId: string }) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const es = new EventSource(`/api/music-gen/workspaces/${workspaceId}/stream`)

    es.addEventListener('jobs', (e) => {
      try {
        setJobs(JSON.parse(e.data))
        setConnected(true)
      } catch {}
    })

    es.onerror = () => setConnected(false)

    return () => es.close()
  }, [workspaceId])

  if (jobs.length === 0) {
    return (
      <div className="bg-background border border-border rounded-lg shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-foreground">Job 상태</h2>
          <span className={`inline-flex items-center gap-1 text-xs ${connected ? 'text-green-500' : 'text-muted-foreground'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-500' : 'bg-muted-foreground'}`} />
            {connected ? '연결됨' : '연결 중...'}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">이 워크스페이스에 실행된 Job이 없습니다.</p>
      </div>
    )
  }

  return (
    <div className="bg-background border border-border rounded-lg shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-foreground">Job 상태</h2>
        <span className={`inline-flex items-center gap-1 text-xs ${connected ? 'text-green-500' : 'text-muted-foreground'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground'}`} />
          {connected ? '실시간' : '연결 중...'}
        </span>
      </div>
      <div className="space-y-2">
        {jobs.map((job) => (
          <div key={job.id} className="flex items-center justify-between text-sm py-2 border-b border-border last:border-0">
            <span className="text-foreground font-mono text-xs">{job.type}</span>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[job.status] ?? 'bg-accent text-muted-foreground'}`}>
                {job.status}
              </span>
              {job.error && (
                <span className="text-xs text-red-400 truncate max-w-[120px]" title={job.error}>{job.error}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
