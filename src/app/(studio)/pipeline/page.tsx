import Link from 'next/link'
import { getDb } from '@/lib/music-gen/db'
import { AutoRefresh } from './_components/AutoRefresh'

export const dynamic = 'force-dynamic'

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

const STATUS_BADGE: Record<string, string> = {
  pending:   'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800',
  running:   'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800',
  paused:    'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700',
  completed: 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800',
  failed:    'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800',
  cancelled: 'bg-slate-50 dark:bg-slate-900/30 text-slate-500 dark:text-slate-500 border border-slate-200 dark:border-slate-700',
}

const STATUS_LABEL: Record<string, string> = {
  pending: '대기', running: '실행중', paused: '일시정지',
  completed: '완료', failed: '실패', cancelled: '취소',
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}초`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}분 ${s % 60}초`
  return `${Math.floor(m / 60)}시간 ${m % 60}분`
}

export default async function PipelinePage() {
  let runs: PipelineRun[] = []
  let stats = { pending: 0, running: 0, completed: 0, failed: 0, paused: 0, cancelled: 0 }

  try {
    const db = getDb()
    runs = db.prepare(`
      SELECT pr.*, c.name as channel_name,
             COUNT(ps.id) as total_steps,
             SUM(CASE WHEN ps.status = 'completed' THEN 1 ELSE 0 END) as completed_steps
      FROM pipeline_runs pr
      LEFT JOIN channels c ON pr.channel_id = c.id
      LEFT JOIN pipeline_steps ps ON pr.id = ps.run_id
      GROUP BY pr.id
      ORDER BY pr.created_at DESC
      LIMIT 50
    `).all() as PipelineRun[]

    const statRows = db.prepare(
      "SELECT status, COUNT(*) as cnt FROM pipeline_runs GROUP BY status"
    ).all() as { status: string; cnt: number }[]
    for (const r of statRows) (stats as Record<string, number>)[r.status] = r.cnt
  } catch { /* DB not ready */ }

  const statCards = [
    { key: 'running',   label: '실행중',  color: 'text-blue-600 dark:text-blue-400' },
    { key: 'pending',   label: '대기',    color: 'text-amber-600 dark:text-amber-400' },
    { key: 'completed', label: '완료',    color: 'text-green-600 dark:text-green-400' },
    { key: 'failed',    label: '실패',    color: 'text-red-600 dark:text-red-400' },
  ]

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <AutoRefresh />
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">SyncLens 파이프라인</h1>
          <p className="text-sm text-muted-foreground mt-0.5">영상 제작 자동화 현황</p>
        </div>
      </div>

      {/* 상태 카운트 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {statCards.map(({ key, label, color }) => (
          <div key={key} className="bg-card border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{(stats as Record<string, number>)[key] ?? 0}</p>
          </div>
        ))}
      </div>

      {/* 실행 목록 */}
      {runs.length === 0 ? (
        <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
          <p className="text-muted-foreground">아직 파이프라인 실행이 없습니다.</p>
          <p className="text-sm text-muted-foreground mt-1">채널과 Vol을 등록한 후 파이프라인을 시작하세요.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map(run => {
            const progress = run.total_steps > 0
              ? Math.round((run.completed_steps / run.total_steps) * 100)
              : 0
            const duration = run.completed_at && run.started_at
              ? formatDuration(run.completed_at - run.started_at)
              : run.started_at ? formatDuration(Date.now() - run.started_at) : null

            return (
              <div key={run.id} className="bg-card border border-border rounded-lg p-4 hover:border-foreground/20 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-foreground truncate">{run.vol_name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[run.status] ?? ''}`}>
                        {STATUS_LABEL[run.status] ?? run.status}
                      </span>
                      {run.channel_name && (
                        <span className="text-xs text-muted-foreground">{run.channel_name}</span>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{run.total_songs}곡</span>
                      <span>{run.current_phase === 'song' ? 'Song 단계' : 'Vol 단계'}</span>
                      {duration && <span>{duration}</span>}
                      <span>{run.completed_steps}/{run.total_steps} 단계</span>
                    </div>
                    {/* 진행 바 */}
                    <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
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
    </div>
  )
}
