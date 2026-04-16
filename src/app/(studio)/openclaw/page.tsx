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
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">OpenClaw 루프</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Claude Agent SDK 자동 작곡 루프</p>
        </div>
        <button
          className="px-4 py-2 bg-brand hover:bg-brand-hover text-white text-sm font-medium rounded-md transition-colors opacity-50 cursor-not-allowed"
          disabled
        >
          + 새 루프 (P4에서 활성화)
        </button>
      </div>

      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <p className="text-blue-700 dark:text-blue-300 text-sm font-medium">OpenClaw 개요</p>
        <p className="text-blue-600 dark:text-blue-400 text-xs mt-1">
          Claude Opus가 기획하고 Sonnet이 실행하며 Haiku가 분류하는 자동 작곡 파이프라인.
          cron 스케줄에 따라 자동으로 워크스페이스를 생성하고 YouTube까지 업로드합니다.
        </p>
      </div>

      {loops.length > 0 ? (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm divide-y divide-gray-100 dark:divide-gray-800">
          {loops.map(loop => (
            <div key={loop.id} className="px-4 py-4">
              <div className="flex items-center justify-between mb-1.5">
                <p className="font-medium text-sm text-gray-900 dark:text-white">{loop.name}</p>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    loop.enabled
                      ? 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                  }`}>
                    {loop.enabled ? '활성' : '비활성'}
                  </span>
                </div>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{loop.schedule_cron}</p>
              {loop.last_run_at && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  마지막 실행: {new Date(loop.last_run_at).toLocaleString('ko-KR')}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm">
          <div className="p-8 text-center text-sm text-gray-400 dark:text-gray-500">
            등록된 루프가 없습니다
            <p className="text-xs mt-1">DB에 openclaw_loops 행을 추가하면 표시됩니다</p>
          </div>
        </div>
      )}
    </div>
  )
}
