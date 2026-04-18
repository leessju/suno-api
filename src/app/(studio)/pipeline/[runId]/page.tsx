import Link from 'next/link'
import { getDb } from '@/lib/music-gen/db'
import { notFound } from 'next/navigation'
import { AutoRefresh } from '../_components/AutoRefresh'

export const dynamic = 'force-dynamic'

interface PipelineStep {
  id: string
  run_id: string
  step_code: string
  step_name: string
  phase: string
  song_index: number | null
  song_title: string | null
  status: string
  job_id: string | null
  attempts: number
  error: string | null
  started_at: number | null
  completed_at: number | null
}

interface PipelineEvent {
  id: number
  run_id: string
  step_id: string | null
  event_type: string
  message: string | null
  created_at: number
}

const STATUS_ICON: Record<string, string> = {
  pending:   '·',
  running:   '🔄',
  completed: '✅',
  failed:    '❌',
  retrying:  '🔁',
  skipped:   '⏭',
}

const STATUS_BADGE: Record<string, string> = {
  pending:   'bg-slate-100 dark:bg-slate-800 text-slate-500',
  running:   'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
  completed: 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400',
  failed:    'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400',
  retrying:  'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
  skipped:   'bg-slate-50 dark:bg-slate-900 text-slate-400',
}

const SONG_STEPS = ['S1', 'S2', 'S3', 'S4', 'S5']
const VOL_STEPS  = ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8']
const STEP_LABEL: Record<string, string> = {
  S1: '가사추출', S2: '번역', S3: '커버생성', S4: '렌더', S5: '검증',
  V1: 'Concat', V2: '배경할당', V3: '썸네일', V4: '자막',
  V5: '풀업로드', V6: '쇼츠생성', V7: '쇼츠업로드', V8: '댓글',
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default async function PipelineDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>
}) {
  const { runId } = await params

  let run: Record<string, unknown> | null = null
  let steps: PipelineStep[] = []
  let events: PipelineEvent[] = []

  try {
    const db = getDb()
    run = db.prepare(`
      SELECT pr.*, c.name as channel_name
      FROM pipeline_runs pr
      LEFT JOIN channels c ON pr.channel_id = c.id
      WHERE pr.id = ?
    `).get(runId) as Record<string, unknown> | null

    if (!run) notFound()

    steps = db.prepare(
      'SELECT * FROM pipeline_steps WHERE run_id=? ORDER BY song_index ASC, step_code ASC'
    ).all(runId) as PipelineStep[]

    events = db.prepare(
      'SELECT * FROM pipeline_events WHERE run_id=? ORDER BY created_at DESC LIMIT 50'
    ).all(runId) as PipelineEvent[]
  } catch {
    notFound()
  }

  // Song steps를 곡별로 그룹화
  const songSteps = steps.filter(s => s.phase === 'song')
  const volSteps  = steps.filter(s => s.phase === 'vol')

  const songs: Record<number, Record<string, PipelineStep>> = {}
  const songTitles: Record<number, string> = {}
  for (const step of songSteps) {
    const idx = step.song_index ?? 0
    if (!songs[idx]) songs[idx] = {}
    songs[idx][step.step_code] = step
    if (step.song_title) songTitles[idx] = step.song_title
  }
  const songIndices = Object.keys(songs).map(Number).sort((a, b) => a - b)

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <AutoRefresh />
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Link href="/pipeline" className="text-muted-foreground hover:text-foreground text-sm">← 목록</Link>
        <h1 className="text-xl font-semibold text-foreground">{String(run.vol_name)}</h1>
        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[String(run.status)] ?? ''}`}>
          {String(run.status)}
        </span>
        {String(run.channel_name ?? '') && (
          <span className="text-sm text-muted-foreground">{String(run.channel_name)}</span>
        )}
      </div>

      {/* Song Phase 매트릭스 */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Song Phase</h2>
        <div className="bg-card border border-border rounded-lg overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-2.5 text-muted-foreground font-medium min-w-[180px]">곡명</th>
                {SONG_STEPS.map(code => (
                  <th key={code} className="text-center px-3 py-2.5 text-muted-foreground font-medium min-w-[70px]">
                    <div>{code}</div>
                    <div className="text-xs font-normal">{STEP_LABEL[code]}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {songIndices.map(idx => (
                <tr key={idx} className="border-b border-border last:border-0 hover:bg-accent/30">
                  <td className="px-4 py-2.5 text-foreground truncate max-w-[200px]">
                    <span className="text-muted-foreground mr-2 text-xs">{idx}.</span>
                    {songTitles[idx] ?? `Track ${idx}`}
                  </td>
                  {SONG_STEPS.map(code => {
                    const step = songs[idx]?.[code]
                    const status = step?.status ?? 'pending'
                    return (
                      <td key={code} className="text-center px-3 py-2.5">
                        <div title={step?.error ?? undefined} className="flex flex-col items-center gap-0.5">
                          <span className="text-base leading-none">{STATUS_ICON[status] ?? '·'}</span>
                          {step?.error && (
                            <span className="text-xs text-red-500 truncate max-w-[60px]" title={step.error}>!</span>
                          )}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Vol Phase 타임라인 */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Vol Phase</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {VOL_STEPS.map(code => {
            const step = volSteps.find(s => s.step_code === code)
            const status = step?.status ?? 'pending'
            return (
              <div key={code} className={`bg-card border rounded-lg p-3 ${status === 'failed' ? 'border-red-300 dark:border-red-800' : 'border-border'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono text-muted-foreground">{code}</span>
                  <span className="text-base">{STATUS_ICON[status] ?? '·'}</span>
                </div>
                <p className="text-sm font-medium text-foreground">{STEP_LABEL[code]}</p>
                {step?.error && (
                  <p className="text-xs text-red-500 mt-1 truncate" title={step.error}>{step.error}</p>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 이벤트 로그 */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">이벤트 로그</h2>
        <div className="bg-card border border-border rounded-lg divide-y divide-border">
          {events.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">이벤트 없음</p>
          ) : events.map(ev => (
            <div key={ev.id} className="px-4 py-2.5 flex items-start gap-3 text-sm">
              <span className="text-muted-foreground text-xs font-mono flex-shrink-0 mt-0.5">
                {formatTime(ev.created_at)}
              </span>
              <span className="text-xs font-medium text-foreground flex-shrink-0">{ev.event_type}</span>
              {ev.message && <span className="text-muted-foreground">{ev.message}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
