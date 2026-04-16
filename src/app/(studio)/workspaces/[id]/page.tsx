import { getDb } from '@/lib/music-gen/db'
import { notFound } from 'next/navigation'

export default async function WorkspacePage({ params }: { params: { id: string } }) {
  const db = getDb()
  const workspace = db.prepare(`
    SELECT w.*, c.channel_name FROM workspaces w
    LEFT JOIN channels c ON c.id = w.channel_id
    WHERE w.id = ?
  `).get(params.id) as { id: string; name: string; channel_name: string; status: string; pipeline_mode: string } | undefined

  if (!workspace) notFound()

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{workspace.name}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{workspace.channel_name} · {workspace.pipeline_mode} 모드</p>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
          workspace.status === 'active'
            ? 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400'
            : workspace.status === 'archived'
            ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
            : 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
        }`}>
          {workspace.status}
        </span>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm p-5">
        <p className="text-sm text-gray-500 dark:text-gray-400">파이프라인 구현 진행 중 (P2에서 완성)</p>
      </div>
    </div>
  )
}
