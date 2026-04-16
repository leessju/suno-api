import { getDb } from '@/lib/music-gen/db'
import Link from 'next/link'

interface Track {
  workspace_id: string
  suno_track_id: string
  suno_account_id: number | null
  is_checked: number
  workspace_name: string | null
  channel_name: string | null
}

export const dynamic = 'force-dynamic'

export default async function TracksPage() {
  let tracks: Track[] = []
  try {
    const db = getDb()
    tracks = db.prepare(`
      SELECT wt.*, w.name as workspace_name, c.channel_name
      FROM workspace_tracks wt
      LEFT JOIN workspaces w ON w.id = wt.workspace_id
      LEFT JOIN channels c ON c.id = w.channel_id
      ORDER BY wt.checked_at DESC NULLS LAST
      LIMIT 100
    `).all() as Track[]
  } catch { /* DB not ready */ }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">트랙 목록</h1>
        <span className="text-sm text-gray-500 dark:text-gray-400">총 {tracks.length}개</span>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm divide-y divide-gray-100 dark:divide-gray-800">
        {tracks.map((t, i) => (
          <div key={`${t.workspace_id}-${t.suno_track_id}-${i}`}
               className="px-4 py-3 flex items-center gap-4">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${t.is_checked ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{t.suno_track_id}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {t.workspace_name} · {t.channel_name}
                {t.suno_account_id && ` · Account ${t.suno_account_id}`}
              </p>
            </div>
            <Link
              href={`/workspaces/${t.workspace_id}`}
              className="text-xs text-brand hover:text-brand-hover flex-shrink-0 font-medium transition-colors"
            >
              워크스페이스 →
            </Link>
          </div>
        ))}
        {tracks.length === 0 && (
          <div className="p-8 text-center text-sm text-gray-400 dark:text-gray-500">
            트랙이 없습니다
          </div>
        )}
      </div>
    </div>
  )
}
