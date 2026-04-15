import { getDb } from '@/lib/music-gen/db'

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">OpenClaw 루프</h1>
          <p className="text-gray-400 text-sm mt-1">Claude Agent SDK 자동 작곡 루프</p>
        </div>
        <button className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors opacity-50 cursor-not-allowed" disabled>
          + 새 루프 (P4에서 활성화)
        </button>
      </div>

      <div className="p-4 bg-blue-900/20 border border-blue-700 rounded-xl">
        <p className="text-blue-300 text-sm font-medium">OpenClaw 개요</p>
        <p className="text-blue-400/70 text-xs mt-1">
          Claude Opus가 기획하고 Sonnet이 실행하며 Haiku가 분류하는 자동 작곡 파이프라인.
          cron 스케줄에 따라 자동으로 워크스페이스를 생성하고 YouTube까지 업로드합니다.
        </p>
      </div>

      {loops.length > 0 ? (
        <div className="space-y-3">
          {loops.map(loop => (
            <div key={loop.id} className="p-4 bg-gray-900 rounded-xl border border-gray-800">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-white">{loop.name}</p>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${loop.enabled ? 'bg-green-500' : 'bg-gray-600'}`} />
                  <span className="text-xs text-gray-400">{loop.enabled ? '활성' : '비활성'}</span>
                </div>
              </div>
              <p className="text-xs text-gray-500 font-mono">{loop.schedule_cron}</p>
              {loop.last_run_at && (
                <p className="text-xs text-gray-600 mt-1">
                  마지막 실행: {new Date(loop.last_run_at).toLocaleString('ko-KR')}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="p-6 bg-gray-900 rounded-xl border border-gray-800 text-center">
          <p className="text-gray-400 text-sm">등록된 루프가 없습니다</p>
          <p className="text-gray-600 text-xs mt-1">DB에 openclaw_loops 행을 추가하면 표시됩니다</p>
        </div>
      )}
    </div>
  )
}
