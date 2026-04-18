'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface PipelineRun {
  id: string
  vol_name: string
  status: string
  current_phase: string
  total_songs: number
  channel_name: string | null
  total_steps: number
  completed_steps: number
  created_at: number
  started_at: number | null
  completed_at: number | null
}

interface JobStats {
  pending: number
  running: number
  done: number
  failed: number
}

interface JobRow {
  id: string
  type: string
  status: string
  attempts: number
  max_attempts: number
  error?: string | null
  scheduled_at?: number
  picked_at?: number | null
  done_at?: number | null
}

const STATUS_BADGE: Record<string, string> = {
  pending:   'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800',
  running:   'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800',
  paused:    'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700',
  completed: 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800',
  failed:    'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800',
  cancelled: 'bg-slate-50 dark:bg-slate-900/30 text-slate-500 dark:text-slate-500 border border-slate-200 dark:border-slate-700',
}

const JOB_STATUS_BADGE: Record<string, string> = {
  pending: 'text-xs px-2 py-0.5 rounded-full font-medium bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800',
  running: 'text-xs px-2 py-0.5 rounded-full font-medium bg-accent text-foreground',
  done:    'text-xs px-2 py-0.5 rounded-full font-medium bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800',
  failed:  'text-xs px-2 py-0.5 rounded-full font-medium bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800',
}

const STATUS_LABEL: Record<string, string> = {
  pending: '대기', running: '실행중', paused: '일시정지',
  completed: '완료', failed: '실패', cancelled: '취소',
}

const jobTypeLabel: Record<string, string> = {
  'draft.variants': '가사 생성',
  'draft_song.generate': '노래 생성',
  'draft_song.poll': '노래 폴링',
  'midi.convert': 'MIDI 변환',
  'midi.analyze': 'MIDI 분석',
  'midi_draft.generate': 'MIDI 드래프트',
  'suno.generate': 'Suno 생성',
  'suno.poll': 'Suno 폴링',
  'render.remotion': '렌더링',
  'upload.youtube': 'YouTube 업로드',
  'shorts.create': '쇼츠 생성',
  'shorts.upload': '쇼츠 업로드',
  'telegram.send': '텔레그램 전송',
}

const statCards = [
  { key: 'running' as const, label: '실행 중', color: 'text-blue-600 dark:text-blue-400' },
  { key: 'pending' as const, label: '대기 중', color: 'text-amber-600 dark:text-amber-400' },
  { key: 'done'    as const, label: '완료',    color: 'text-green-600 dark:text-green-400' },
  { key: 'failed'  as const, label: '실패',    color: 'text-red-600 dark:text-red-400' },
]

const pipelineStatCards = [
  { key: 'running',   label: '실행중',  color: 'text-blue-600 dark:text-blue-400' },
  { key: 'pending',   label: '대기',    color: 'text-amber-600 dark:text-amber-400' },
  { key: 'completed', label: '완료',    color: 'text-green-600 dark:text-green-400' },
  { key: 'failed',    label: '실패',    color: 'text-red-600 dark:text-red-400' },
]

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}초`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}분 ${s % 60}초`
  return `${Math.floor(m / 60)}시간 ${m % 60}분`
}

function formatTime(ts: number | null | undefined): string {
  if (!ts) return '-'
  const d = new Date(ts)
  return `${d.getFullYear()}.${d.getMonth()+1}.${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`
}

export default function PipelinePage() {
  const [runs, setRuns] = useState<PipelineRun[]>([])
  const [pipelineStats, setPipelineStats] = useState<Record<string, number>>({})
  const [jobStats, setJobStats] = useState<JobStats>({ pending: 0, running: 0, done: 0, failed: 0 })
  const [activeJobs, setActiveJobs] = useState<JobRow[]>([])
  const [failedJobs, setFailedJobs] = useState<JobRow[]>([])
  const [recentJobs, setRecentJobs] = useState<JobRow[]>([])
  const [lastRefreshed, setLastRefreshed] = useState('')

  const fetchAll = useCallback(async () => {
    try {
      const [queueRes, pipelineRes] = await Promise.all([
        fetch('/api/music-gen/queue'),
        fetch('/api/music-gen/pipeline'),
      ])

      if (queueRes.ok) {
        const q = await queueRes.json()
        setJobStats(q.stats ?? { pending: 0, running: 0, done: 0, failed: 0 })
        setActiveJobs(q.activeJobs ?? [])
        setFailedJobs(q.failedJobs ?? [])
        // pending + recent done 합쳐서 recentJobs로
        setRecentJobs([
          ...(q.pendingJobs ?? []).map((j: JobRow) => ({ ...j, status: 'pending' })),
          ...(q.recentDoneJobs ?? []).map((j: JobRow) => ({ ...j, status: 'done' })),
        ])
      }

      if (pipelineRes.ok) {
        const p = await pipelineRes.json()
        setRuns(p.data ?? [])
        setPipelineStats(p.stats ?? {})
      }

      setLastRefreshed(formatTime(Date.now()))
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    fetchAll()
    const id = setInterval(fetchAll, 5000)
    return () => clearInterval(id)
  }, [fetchAll])

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">파이프라인</h1>
          <p className="text-sm text-muted-foreground mt-1">영상 제작 자동화 현황</p>
        </div>
        {lastRefreshed && (
          <span className="text-xs text-muted-foreground">갱신: {lastRefreshed}</span>
        )}
      </div>

      {/* ───── SyncLens 파이프라인 ───── */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-foreground">SyncLens 파이프라인</h2>

        {/* 파이프라인 상태 카드 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {pipelineStatCards.map(({ key, label, color }) => (
            <div key={key} className="bg-background border border-border rounded-lg p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-2xl font-bold mt-1 ${color}`}>{pipelineStats[key] ?? 0}</p>
            </div>
          ))}
        </div>

        {runs.length === 0 ? (
          <div className="border border-dashed border-border rounded-lg p-10 text-center">
            <p className="text-sm text-muted-foreground">아직 파이프라인 실행이 없습니다.</p>
            <p className="text-xs text-muted-foreground mt-1">채널과 Vol을 등록한 후 파이프라인을 시작하세요.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {runs.map(run => {
              const progress = run.total_steps > 0
                ? Math.round((run.completed_steps / run.total_steps) * 100)
                : 0
              const duration = run.completed_at && run.started_at
                ? formatDuration(run.completed_at - run.started_at)
                : run.started_at ? formatDuration(Date.now() - run.started_at) : null

              return (
                <div key={run.id} className="bg-background border border-border rounded-lg px-4 py-3 hover:border-foreground/30 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-foreground truncate">{run.vol_name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[run.status] ?? ''}`}>
                          {STATUS_LABEL[run.status] ?? run.status}
                        </span>
                        {run.channel_name && (
                          <span className="text-xs text-muted-foreground">{run.channel_name}</span>
                        )}
                      </div>
                      <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{run.total_songs}곡</span>
                        <span>{run.current_phase === 'song' ? 'Song 단계' : 'Vol 단계'}</span>
                        {duration && <span>{duration}</span>}
                        <span>{run.completed_steps}/{run.total_steps} 단계</span>
                      </div>
                      <div className="mt-2 h-1.5 bg-accent rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${run.status === 'failed' ? 'bg-red-500' : run.status === 'completed' ? 'bg-green-500' : 'bg-blue-500'}`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                    <Link
                      href={`/pipeline/${run.id}`}
                      className="flex-shrink-0 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                    >
                      상세 보기
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ───── Job 큐 ───── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Job 큐</h2>
          <Link
            href="/admin/queue"
            className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          >
            전체 관제 →
          </Link>
        </div>

        {/* Job 상태 카드 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {statCards.map(({ key, label, color }) => (
            <div key={key} className="bg-background border border-border rounded-lg p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-2xl font-bold mt-1 ${color}`}>{jobStats[key]}</p>
            </div>
          ))}
        </div>

        {/* 실행 중인 Job */}
        {activeJobs.length > 0 && (
          <div className="space-y-1.5">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">실행 중인 Job</h3>
            <div className="bg-background border border-border rounded-lg divide-y divide-border">
              {activeJobs.map(job => (
                <div key={job.id} className="px-4 py-2.5 flex items-center gap-3">
                  <span className={JOB_STATUS_BADGE['running']}>실행중</span>
                  <span className="text-sm text-foreground truncate flex-1 min-w-0">
                    {jobTypeLabel[job.type] ?? job.type}
                  </span>
                  <span className="text-xs text-muted-foreground flex-shrink-0">{job.attempts}/{job.max_attempts} 시도</span>
                  <span className="text-xs text-muted-foreground font-mono flex-shrink-0">{job.id.slice(0, 8)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 최근 실패 Job */}
        {failedJobs.length > 0 && (
          <div className="space-y-1.5">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">최근 실패 Job</h3>
            <div className="bg-background border border-border rounded-lg divide-y divide-border">
              {failedJobs.map((job: any) => (
                <div key={job.id} className="px-4 py-2.5 flex items-center gap-3">
                  <span className={JOB_STATUS_BADGE['failed']}>실패</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{jobTypeLabel[job.type] ?? job.type}</p>
                    {job.error && <p className="text-xs text-red-500 dark:text-red-400 truncate mt-0.5">{job.error}</p>}
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0">{formatTime(job.done_at)}</span>
                  <span className="text-xs text-muted-foreground flex-shrink-0">{job.attempts} 시도</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 대기 / 완료 Job */}
        {recentJobs.length > 0 && (
          <div className="space-y-1.5">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">대기 / 완료 Job</h3>
            <div className="bg-background border border-border rounded-lg divide-y divide-border">
              {recentJobs.map((job: any) => (
                <div key={job.id} className="px-4 py-2.5 flex items-center gap-3">
                  <span className={JOB_STATUS_BADGE[job.status] ?? 'text-xs px-2 py-0.5 rounded-full font-medium bg-accent text-muted-foreground'}>
                    {job.status === 'pending' ? '대기' : '완료'}
                  </span>
                  <span className="text-sm text-foreground truncate flex-1 min-w-0">
                    {jobTypeLabel[job.type] ?? job.type}
                  </span>
                  <span className="text-xs text-muted-foreground flex-shrink-0">{job.attempts}/{job.max_attempts} 시도</span>
                  <span className="text-xs text-muted-foreground font-mono flex-shrink-0">{job.id.slice(0, 8)}</span>
                  <span className="text-xs text-muted-foreground flex-shrink-0">{formatTime(job.scheduled_at ?? job.done_at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeJobs.length === 0 && failedJobs.length === 0 && recentJobs.length === 0 && (
          <div className="border border-dashed border-border rounded-lg p-8 text-center">
            <p className="text-sm text-muted-foreground">Job이 없습니다</p>
          </div>
        )}
      </section>
    </div>
  )
}
