'use client'

import { useState, useEffect } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface UploadItem {
  id: string
  workspace_id: string
  workspace_name: string | null
  youtube_video_id: string | null
  title: string | null
  description: string | null
  status: string
  error_message: string | null
  uploaded_at: number | null
  created_at: number
  upload_type: 'full' | 'short'
  suno_track_id?: string
  pinned_comment?: string | null
  hashtags?: string | null
}

interface Workspace {
  id: string
  name: string
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:   { label: '대기',         color: 'bg-accent text-muted-foreground' },
  uploading: { label: '업로드 중',    color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' },
  done:      { label: '완료',         color: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400' },
  error:     { label: '오류',         color: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400' },
}

function formatDate(ts: number | null) {
  if (!ts) return '-'
  const d = new Date(ts)
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`
}

export default function UploadsPage() {
  const [items, setItems] = useState<UploadItem[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [filterWorkspaceId, setFilterWorkspaceId] = useState('')
  const [filterType, setFilterType] = useState('')
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
    if (filterType) params.set('type', filterType)
    fetch(`/api/music-gen/uploads?${params}`)
      .then(r => r.json())
      .then(d => setItems(Array.isArray(d) ? d : (d.data ?? [])))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [filterWorkspaceId, filterType])

  const ytUrl = (videoId: string, type: 'full' | 'short') =>
    type === 'short'
      ? `https://www.youtube.com/shorts/${videoId}`
      : `https://www.youtube.com/watch?v=${videoId}`

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">업로드영상</h1>
        <p className="text-sm text-muted-foreground mt-1">YouTube 업로드 이력</p>
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap items-center gap-2">
        {workspaces.length > 0 && (
          <>
            <span className="text-xs text-muted-foreground">워크스페이스</span>
            <Select value={filterWorkspaceId || '__all__'} onValueChange={v => setFilterWorkspaceId(v === '__all__' ? '' : v)}>
              <SelectTrigger className="h-8 text-sm w-auto min-w-[160px]">
                <SelectValue placeholder="전체" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">전체</SelectItem>
                {workspaces.map(ws => <SelectItem key={ws.id} value={ws.id}>{ws.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </>
        )}
        <span className="text-xs text-muted-foreground">유형</span>
        <Select value={filterType || '__all__'} onValueChange={v => setFilterType(v === '__all__' ? '' : v)}>
          <SelectTrigger className="h-8 text-sm w-[110px]">
            <SelectValue placeholder="전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">전체</SelectItem>
            <SelectItem value="full">풀영상</SelectItem>
            <SelectItem value="short">쇼츠</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-accent rounded-lg animate-pulse" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <svg className="w-10 h-10 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p>업로드 이력이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map(item => {
            const st = STATUS_LABELS[item.status] ?? STATUS_LABELS.pending
            return (
              <div
                key={item.id}
                className="flex items-center gap-3 bg-background border border-border rounded-lg px-4 py-3"
              >
                {/* 유형 뱃지 */}
                <span className={`flex-shrink-0 px-2 py-0.5 text-xs rounded-full font-medium ${
                  item.upload_type === 'short'
                    ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400'
                    : 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                }`}>
                  {item.upload_type === 'short' ? '쇼츠' : '풀영상'}
                </span>

                {/* 제목 + 워크스페이스 */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {item.title ?? '(제목 없음)'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.workspace_name ?? item.workspace_id}</p>
                </div>

                {/* YouTube 링크 */}
                {item.youtube_video_id && (
                  <a
                    href={ytUrl(item.youtube_video_id, item.upload_type)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="flex-shrink-0 text-xs text-red-500 hover:text-red-600 underline underline-offset-2"
                  >
                    YouTube ↗
                  </a>
                )}

                {/* 날짜 */}
                <span className="hidden sm:block text-[11px] text-muted-foreground tabular-nums flex-shrink-0">
                  {formatDate(item.uploaded_at ?? item.created_at)}
                </span>

                {/* 상태 */}
                <span className={`flex-shrink-0 px-2 py-0.5 text-xs rounded-full font-medium ${st.color}`}>
                  {st.label}
                </span>

                {item.error_message && (
                  <span className="flex-shrink-0 text-xs text-red-500 truncate max-w-[140px]" title={item.error_message}>
                    {item.error_message}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
