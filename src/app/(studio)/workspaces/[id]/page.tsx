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
          <h1 className="text-2xl font-bold">{workspace.name}</h1>
          <p className="text-gray-400 text-sm mt-1">{workspace.channel_name} · {workspace.pipeline_mode} 모드</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
          workspace.status === 'active' ? 'bg-green-900/50 text-green-400' :
          workspace.status === 'archived' ? 'bg-gray-800 text-gray-400' :
          'bg-yellow-900/50 text-yellow-400'
        }`}>
          {workspace.status}
        </span>
      </div>

      <div className="p-6 bg-gray-900 rounded-xl border border-gray-800">
        <p className="text-gray-400 text-sm">파이프라인 구현 진행 중 (P2에서 완성)</p>
      </div>
    </div>
  )
}
