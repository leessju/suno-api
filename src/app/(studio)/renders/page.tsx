'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface RenderItem {
  id: string
  workspace_id: string
  workspace_name: string | null
  suno_track_id: string
  r2_key: string | null
  source_url: string | null
  source_type: string
  assigned_at: number
  title_jp: string | null
  title_en: string | null
  suno_song_id: string | null
  is_confirmed: number
}

interface Workspace {
  id: string
  name: string
}

function formatDate(ts: number) {
  const d = new Date(ts)
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`
}

export default function RendersPage() {
  const [items, setItems] = useState<RenderItem[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [filterWorkspaceId, setFilterWorkspaceId] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/music-gen/workspaces')
      .then(r => r.json())
      .then(d => setWorkspaces(Array.isArray(d) ? d : (d.data ?? [])))
      .catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filterWorkspaceId) params.set('workspace_id', filterWorkspaceId)
    fetch(`/api/music-gen/renders?${params}`)
      .then(r => r.json())
      .then(d => setItems(Array.isArray(d) ? d : (d.data ?? [])))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [filterWorkspaceId])

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">렌더영상</h1>
          <p className="text-sm text-muted-foreground mt-1">이미지가 배정된 트랙 목록</p>
        </div>
      </div>

      {/* 워크스페이스 필터 */}
      {workspaces.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground flex-shrink-0">워크스페이스</span>
          <Select value={filterWorkspaceId || '__all__'} onValueChange={v => setFilterWorkspaceId(v === '__all__' ? '' : v)}>
            <SelectTrigger className="h-8 text-sm w-auto min-w-[160px]">
              <SelectValue placeholder="전체" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">전체</SelectItem>
              {workspaces.map(ws => <SelectItem key={ws.id} value={ws.id}>{ws.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-accent rounded-lg animate-pulse" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <svg className="w-10 h-10 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <p>이미지가 배정된 트랙이 없습니다.</p>
          <p className="text-xs mt-1">워크스페이스에서 트랙에 이미지를 배정하세요.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map(item => (
            <Link
              key={item.id}
              href={`/workspaces/${item.workspace_id}`}
              className="flex items-center gap-3 bg-background border border-border rounded-lg px-4 py-3 hover:border-foreground/30 transition-colors"
            >
              {/* 이미지 미리보기 */}
              <div className="w-14 h-10 bg-accent rounded border border-border flex-shrink-0 overflow-hidden flex items-center justify-center">
                {item.source_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.source_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <svg className="w-5 h-5 text-muted-foreground/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                  </svg>
                )}
              </div>

              {/* 정보 */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {item.title_jp ?? item.title_en ?? item.suno_track_id}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.workspace_name ?? item.workspace_id}</p>
              </div>

              {/* 확인 상태 */}
              {item.is_confirmed === 1 && (
                <span className="flex-shrink-0 px-2 py-0.5 text-xs rounded-full bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 font-medium">
                  확인됨
                </span>
              )}

              {/* 날짜 */}
              <span className="hidden sm:block text-[11px] text-muted-foreground tabular-nums flex-shrink-0">
                {formatDate(item.assigned_at)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
