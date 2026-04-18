import { getDb } from '@/lib/music-gen/db'
import { Button } from '@/components/ui/button'

interface Loop {
  id: string
  name: string
  schedule_cron: string
  enabled: number
  last_run_at: number | null
  config_json: string
}

export const dynamic = 'force-dynamic'

export default async function OpenClawPage() {
  let loops: Loop[] = []
  try {
    const db = getDb()
    loops = db.prepare('SELECT * FROM openclaw_loops ORDER BY name').all() as Loop[]
  } catch { /* DB not ready */ }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">OpenClaw 루프</h1>
          <p className="text-sm text-muted-foreground mt-1">Claude Agent SDK 자동 작곡 루프</p>
        </div>
        <Button
          className="px-4 py-2 bg-brand hover:bg-brand-hover text-primary-foreground text-sm font-medium rounded-md transition-colors opacity-50 cursor-not-allowed"
          disabled
        >
          + 새 루프 (P4에서 활성화)
        </Button>
      </div>

      <div className="p-4 bg-accent dark:bg-accent border border-border rounded-lg">
        <p className="text-foreground text-sm font-medium">OpenClaw 개요</p>
        <p className="text-muted-foreground text-xs mt-1">
          Claude Opus가 기획하고 Sonnet이 실행하며 Haiku가 분류하는 자동 작곡 파이프라인.
          cron 스케줄에 따라 자동으로 워크스페이스를 생성하고 YouTube까지 업로드합니다.
        </p>
      </div>

      {loops.length > 0 ? (
        <div className="bg-background border border-border rounded-lg shadow-sm divide-y divide-gray-100 dark:divide-gray-800">
          {loops.map(loop => (
            <div key={loop.id} className="px-4 py-4">
              <div className="flex items-center justify-between mb-1.5">
                <p className="font-medium text-sm text-foreground">{loop.name}</p>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    loop.enabled
                      ? 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                      : 'bg-accent text-muted-foreground'
                  }`}>
                    {loop.enabled ? '활성' : '비활성'}
                  </span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground font-mono">{loop.schedule_cron}</p>
              {loop.last_run_at && (
                <p className="text-xs text-muted-foreground mt-1">
                  마지막 실행: {((d) => `${d.getFullYear()}.${d.getMonth()+1}.${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`)(new Date(loop.last_run_at))}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-background border border-border rounded-lg shadow-sm">
          <div className="m-4 p-8 border-2 border-dashed border-border rounded-lg text-center text-sm text-muted-foreground">
            등록된 루프가 없습니다
            <p className="text-xs mt-1">DB에 openclaw_loops 행을 추가하면 표시됩니다</p>
          </div>
        </div>
      )}
    </div>
  )
}
