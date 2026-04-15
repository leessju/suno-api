import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { getDb } from '@/lib/music-gen/db'
import Link from 'next/link'

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() })

  let stats = { activeJobs: 0, pendingApprovals: 0, todayCost: 0, recentWorkspaces: [] as { id: string; name: string; status: string; channel_name: string | null; created_at: number }[] }

  try {
    const db = getDb()
    const jobRow = db.prepare("SELECT COUNT(*) as cnt FROM job_queue WHERE status IN ('pending', 'running')").get() as { cnt: number }
    const approvalRow = db.prepare("SELECT COUNT(*) as cnt FROM approval_sessions WHERE status = 'pending'").get() as { cnt: number }
    const costRow = db.prepare(
      "SELECT COALESCE(SUM(cost_usd), 0) as total FROM gem_llm_usage WHERE ts > ?"
    ).get(Math.floor(Date.now() / 1000) - 86400) as { total: number }
    const workspaces = db.prepare(`
      SELECT w.id, w.name, w.status, w.created_at, c.channel_name
      FROM workspaces w LEFT JOIN channels c ON c.id = w.channel_id
      ORDER BY w.created_at DESC LIMIT 5
    `).all() as { id: string; name: string; status: string; channel_name: string | null; created_at: number }[]

    stats = {
      activeJobs: jobRow.cnt,
      pendingApprovals: approvalRow.cnt,
      todayCost: costRow.total,
      recentWorkspaces: workspaces,
    }
  } catch { /* DB 아직 초기화 전 */ }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">대시보드</h1>
          <p className="text-gray-400 mt-1 text-sm">안녕하세요, {session?.user.name ?? session?.user.email}!</p>
        </div>
        <Link
          href="/workspaces/new"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          + 새 작업
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-gray-900 rounded-xl border border-gray-800">
          <p className="text-sm text-gray-400">활성 Job</p>
          <p className="text-3xl font-bold mt-1">{stats.activeJobs}</p>
        </div>
        <div className="p-4 bg-gray-900 rounded-xl border border-gray-800">
          <p className="text-sm text-gray-400">대기 결재</p>
          <p className="text-3xl font-bold mt-1">{stats.pendingApprovals}</p>
        </div>
        <div className="p-4 bg-gray-900 rounded-xl border border-gray-800">
          <p className="text-sm text-gray-400">오늘 LLM 비용</p>
          <p className="text-3xl font-bold mt-1">${stats.todayCost.toFixed(4)}</p>
        </div>
      </div>

      {stats.recentWorkspaces.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-gray-400 mb-3">최근 워크스페이스</h2>
          <div className="space-y-2">
            {stats.recentWorkspaces.map(ws => (
              <Link
                key={ws.id}
                href={`/workspaces/${ws.id}`}
                className="flex items-center justify-between p-3 bg-gray-900 rounded-lg border border-gray-800 hover:border-gray-700 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-white">{ws.name}</p>
                  <p className="text-xs text-gray-500">{ws.channel_name ?? '채널 없음'}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  ws.status === 'active' ? 'bg-green-900/50 text-green-400' :
                  ws.status === 'archived' ? 'bg-gray-800 text-gray-500' :
                  'bg-yellow-900/50 text-yellow-400'
                }`}>{ws.status}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
