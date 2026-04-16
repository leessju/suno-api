'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Track {
  workspace_id: string
  suno_track_id: string
  suno_account_id: number | null
  is_checked: number
  workspace_name: string | null
  channel_name: string | null
}

interface Workspace { id: string; name: string }

export default function TracksPage() {
  const [tracks, setTracks] = useState<Track[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [workspaceId, setWorkspaceId] = useState('')
  const [checked, setChecked] = useState('') // '' | '1' | '0'
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')

  // Load filter options
  useEffect(() => {
    fetch('/api/music-gen/workspaces').then(r => r.json()).then(d => setWorkspaces(d.data ?? []))
  }, [])

  // Load tracks with filters
  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (workspaceId) params.set('workspace_id', workspaceId)
    if (checked !== '') params.set('is_checked', checked)
    if (appliedSearch) params.set('q', appliedSearch)

    fetch(`/api/music-gen/tracks?${params}`)
      .then(r => r.json())
      .then(d => setTracks(d.data ?? []))
      .finally(() => setLoading(false))
  }, [workspaceId, checked, appliedSearch])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">노래 트랙</h1>
          <p className="text-sm text-muted-foreground mt-0.5">총 {tracks.length}개</p>
        </div>
      </div>

      {/* 필터 바 */}
      <div className="flex flex-wrap gap-2">
        <select value={workspaceId} onChange={e => setWorkspaceId(e.target.value)}
          className="h-8 px-2 text-sm rounded-md border border-border bg-background text-foreground">
          <option value="">전체 워크스페이스</option>
          {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <select value={checked} onChange={e => setChecked(e.target.value)}
          className="h-8 px-2 text-sm rounded-md border border-border bg-background text-foreground">
          <option value="">전체 상태</option>
          <option value="1">확인됨</option>
          <option value="0">미확인</option>
        </select>
        <div className="flex gap-1 flex-1 min-w-[200px]">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') setAppliedSearch(search) }}
            placeholder="트랙 ID 검색..."
            className="h-8 px-3 text-sm rounded-md border border-border bg-background text-foreground flex-1"
          />
          <button
            onClick={() => setAppliedSearch(search)}
            className="h-8 px-3 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity flex-shrink-0"
          >
            검색
          </button>
        </div>
      </div>

      {/* 트랙 목록 */}
      {loading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-accent rounded-lg animate-pulse" />)}</div>
      ) : tracks.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">트랙이 없습니다</div>
      ) : (
        <div className="bg-background border border-border rounded-lg divide-y divide-gray-100 dark:divide-gray-800">
          {tracks.map((t, i) => (
            <div key={`${t.workspace_id}-${t.suno_track_id}-${i}`} className="px-4 py-3 flex items-center gap-4">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${t.is_checked ? 'bg-green-500' : 'bg-background'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{t.suno_track_id}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t.workspace_name} · {t.channel_name}</p>
              </div>
              <Link href={`/workspaces/${t.workspace_id}`}
                className="text-xs text-foreground hover:underline flex-shrink-0">
                워크스페이스 →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
