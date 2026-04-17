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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">대시보드</h1>
          <p className="text-sm text-muted-foreground mt-1">안녕하세요, {session?.user.name ?? session?.user.email}!</p>
        </div>
        <Link
          href="/workspaces/new"
          className="px-4 py-2 bg-primary hover:opacity-90 text-primary-foreground text-sm font-medium rounded-md transition-colors self-start sm:self-auto"
        >
          + 새 작업
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-6 bg-background border border-border rounded-lg shadow-sm">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">활성 Job</p>
          <p className="text-4xl font-bold text-foreground">{stats.activeJobs}</p>
        </div>
        <div className="p-6 bg-background border border-border rounded-lg shadow-sm">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">대기 결재</p>
          <p className="text-4xl font-bold text-foreground">{stats.pendingApprovals}</p>
        </div>
        <div className="p-6 bg-background border border-border rounded-lg shadow-sm">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">오늘 LLM 비용</p>
          <p className="text-4xl font-bold text-foreground">${stats.todayCost.toFixed(4)}</p>
        </div>
      </div>

      {stats.recentWorkspaces.length > 0 && (
        <div>
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">최근 워크스페이스</h2>
          <div className="bg-background border border-border rounded-lg shadow-sm divide-y divide-gray-200 dark:divide-gray-800">
            {stats.recentWorkspaces.map(ws => (
              <Link
                key={ws.id}
                href={`/workspaces/${ws.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-accent dark:hover:bg-accent transition-colors first:rounded-t-lg last:rounded-b-lg"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{ws.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{ws.channel_name ?? '채널 없음'}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  ws.status === 'active'
                    ? 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                    : ws.status === 'archived'
                    ? 'bg-accent text-muted-foreground'
                    : 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                }`}>{ws.status}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
