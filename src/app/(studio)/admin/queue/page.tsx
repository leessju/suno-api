'use client'

import { useEffect, useState, useCallback } from 'react'

interface QueueData {
  stats: { pending: number; running: number; done: number; failed: number }
  activeJobs: { id: string; type: string; picked_at: number; attempts: number; max_attempts: number }[]
  failedJobs: { id: string; type: string; error: string | null; done_at: number; attempts: number }[]
  pendingJobs: { id: string; type: string; scheduled_at: number; attempts: number; max_attempts: number }[]
  recentDoneJobs: { id: string; type: string; done_at: number; attempts: number }[]
  jobTypeBreakdown: { type: string; status: string; cnt: number }[]
  pipelineRuns: {
    id: string; vol_name: string; status: string; current_phase: string; total_songs: number
    channel_name: string | null; started_at: number | null; created_at: number
    total_steps: number; completed_steps: number; running_steps: number; failed_steps: number
  }[]
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${min}분 ${sec}초`
}

function formatTime(ts: number | null): string {
  if (ts == null) return '-'
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${d.getFullYear()}.${d.getMonth()+1}.${d.getDate()} ${hh}:${mm}:${ss}`
}

const statusBadgeClass: Record<string, string> = {
  pending: 'text-xs px-2 py-0.5 rounded-full font-medium bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800',
  running: 'text-xs px-2 py-0.5 rounded-full font-medium bg-accent text-foreground',
  done: 'text-xs px-2 py-0.5 rounded-full font-medium bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800',
  failed: 'text-xs px-2 py-0.5 rounded-full font-medium bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800',
}

const statusLabel: Record<string, string> = {
  pending: '대기',
  running: '실행',
  done: '완료',
  failed: '실패',
}

const jobTypeLabel: Record<string, string> = {
  'draft.variants': '가사 생성',
  'draft_song.generate': '노래 생성',
  'draft_song.poll': '노래 폴링',
  'midi.convert': 'MIDI 변환',
  'midi.analyze': 'MIDI 분석',
  'midi_draft.generate': 'MIDI 드래프트',
  'variants.generate': '바리에이션 생성',
  'suno.generate': 'Suno 생성',
  'suno.poll': 'Suno 폴링',
  'render.remotion': '렌더링',
  'upload.youtube': 'YouTube 업로드',
  'shorts.create': '쇼츠 생성',
  'shorts.upload': '쇼츠 업로드',
  'approval.run': '승인 실행',
  'telegram.send': '텔레그램 전송',
}

const statLabelClass: Record<string, string> = {
  running: 'text-blue-600 dark:text-blue-400',
  pending: 'text-amber-600 dark:text-amber-400',
  done: 'text-green-600 dark:text-green-400',
  failed: 'text-red-600 dark:text-red-400',
}

const statLabel: Record<string, string> = {
  running: '실행 중',
  pending: '대기 중',
  done: '완료',
  failed: '실패',
}

type TabKey = 'all' | 'pending' | 'failed' | 'done'

export default function QueuePage() {
  const [data, setData] = useState<QueueData | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<string>('')
  const [activeTab, setActiveTab] = useState<TabKey>('all')
  const [now, setNow] = useState(Date.now())

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/music-gen/queue')
      if (!res.ok) return
      const json: QueueData = await res.json()
      setData(json)
      setLastRefreshed(formatTime(Date.now()))
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 2000)
    return () => clearInterval(id)
  }, [fetchData])

  // Update elapsed times every second
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const stats = data?.stats ?? { pending: 0, running: 0, done: 0, failed: 0 }
  const statOrder: (keyof typeof stats)[] = ['running', 'pending', 'done', 'failed']

  // Tab-filtered job list
  const allTabJobs = [
    ...(data?.pendingJobs ?? []).map(j => ({ ...j, status: 'pending' as const, time: j.scheduled_at })),
    ...(data?.failedJobs ?? []).map(j => ({ ...j, status: 'failed' as const, time: j.done_at })),
    ...(data?.recentDoneJobs ?? []).map(j => ({ ...j, status: 'done' as const, time: j.done_at })),
  ].sort((a, b) => (b.time ?? 0) - (a.time ?? 0))
  const tabJobs = activeTab === 'all'
    ? allTabJobs
    : allTabJobs.filter(j => j.status === activeTab)

  const pipelineRuns = data?.pipelineRuns ?? []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Queue Board</h1>
        <div className="flex items-center gap-3">
          {lastRefreshed && (
            <span className="text-xs text-muted-foreground">마지막 업데이트: {lastRefreshed}</span>
          )}
          <button
            onClick={fetchData}
            className="text-xs px-3 py-1.5 rounded-md border border-border bg-background text-foreground hover:bg-accent transition-colors"
          >
            새로고침
          </button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {statOrder.map(key => (
          <div key={key} className="p-4 bg-background border border-border rounded-lg shadow-sm text-center">
            <p className={`text-xs font-medium uppercase tracking-wider mb-2 ${statLabelClass[key] ?? 'text-muted-foreground'}`}>
              {statLabel[key] ?? key}
            </p>
            <p className="text-2xl font-bold text-foreground">{stats[key]}</p>
          </div>
        ))}
      </div>

      {/* 실행 중인 Job */}
      {(data?.activeJobs ?? []).length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">실행 중인 Job</h2>
          <div className="bg-background border border-blue-500 dark:border-blue-400 rounded-lg shadow-sm divide-y divide-border">
            {(data?.activeJobs ?? []).map(job => (
              <div key={job.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {jobTypeLabel[job.type] ?? job.type}
                    {jobTypeLabel[job.type] && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{job.type}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground flex-shrink-0">
                  <span>{formatElapsed(now - job.picked_at)}</span>
                  <span>{job.attempts}/{job.max_attempts} 시도</span>
                  <span className="font-mono">{job.id.slice(0, 8)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 전체 Job 목록 with tab filter */}
      <div className="space-y-3">
        <div className="flex items-center gap-1">
          {(['all', 'pending', 'done', 'failed'] as TabKey[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background border border-border text-muted-foreground hover:bg-accent'
              }`}
            >
              {tab === 'all' ? '전체' : tab === 'pending' ? '대기' : tab === 'done' ? '완료' : '실패'}
            </button>
          ))}
        </div>
        <div className="bg-background border border-border rounded-lg shadow-sm divide-y divide-border">
          {tabJobs.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Job이 없습니다
            </div>
          ) : (
            tabJobs.map(job => (
              <div key={job.id} className="px-4 py-3 flex items-center gap-3">
                <span className={statusBadgeClass[job.status] ?? 'text-xs px-2 py-0.5 rounded-full font-medium bg-accent text-muted-foreground'}>
                  {statusLabel[job.status] ?? job.status}
                </span>
                <p className="text-sm text-foreground truncate flex-1 min-w-0">
                  {jobTypeLabel[job.type] ?? job.type}
                  {jobTypeLabel[job.type] && <span className="ml-1.5 text-xs text-muted-foreground">{job.type}</span>}
                </p>
                <span className="text-xs text-muted-foreground font-mono flex-shrink-0">{job.id.slice(0, 8)}</span>
                <span className="text-xs text-muted-foreground flex-shrink-0">{job.attempts} 시도</span>
                <span className="text-xs text-muted-foreground flex-shrink-0">{formatTime(job.time)}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 실패한 Job */}
      {(data?.failedJobs ?? []).length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">최근 실패 Job</h2>
          <div className="bg-background border border-border rounded-lg shadow-sm divide-y divide-border">
            {(data?.failedJobs ?? []).map(job => (
              <div key={job.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {jobTypeLabel[job.type] ?? job.type}
                    {jobTypeLabel[job.type] && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{job.type}</span>}
                  </p>
                  {job.error && (
                    <p className="text-xs text-red-500 dark:text-red-400 mt-0.5 truncate">{job.error}</p>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground flex-shrink-0">
                  <span>{formatTime(job.done_at)}</span>
                  <span>{job.attempts} 시도</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
