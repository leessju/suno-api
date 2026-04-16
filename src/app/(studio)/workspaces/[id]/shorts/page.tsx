'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

interface ShortTrack {
  suno_track_id: string
  variant_id: string | null
  is_checked: number
  shorts_id: string | null
  title: string | null
  description: string | null
  pinned_comment: string | null
  hashtags: string | null
  upload_status: 'pending' | 'running' | 'done' | 'failed' | null
  youtube_short_id: string | null
}

function StatusBadge({ status }: { status: ShortTrack['upload_status'] }) {
  if (!status || status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-accent text-muted-foreground">
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
        pending
      </span>
    )
  }
  if (status === 'running') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-accent text-foreground">
        <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
        업로드 중
      </span>
    )
  }
  if (status === 'done') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400">
        published ✅
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400">
      failed ❌
    </span>
  )
}

// hashtags: JSON 배열 문자열 ↔ 쉼표 구분 입력값 변환
function hashtagsToInput(raw: string | null): string {
  if (!raw) return ''
  try {
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) return arr.join(', ')
  } catch {
    // 이미 plain string이면 그대로
  }
  return raw
}

function inputToHashtags(input: string): string {
  const tags = input
    .split(',')
    .map(t => t.trim())
    .filter(Boolean)
  return JSON.stringify(tags)
}

function TrackAccordion({
  track,
  workspaceId,
  onReload,
}: {
  track: ShortTrack
  workspaceId: string
  onReload: () => void
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(track.title ?? '')
  const [description, setDescription] = useState(track.description ?? '')
  const [hashtags, setHashtags] = useState(hashtagsToInput(track.hashtags))
  const [pinnedComment, setPinnedComment] = useState(track.pinned_comment ?? '')
  const [saving, setSaving] = useState(false)
  const [saveOk, setSaveOk] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  // track prop 변경 시 폼 동기화
  useEffect(() => {
    setTitle(track.title ?? '')
    setDescription(track.description ?? '')
    setHashtags(hashtagsToInput(track.hashtags))
    setPinnedComment(track.pinned_comment ?? '')
  }, [track])

  async function save() {
    setSaving(true)
    setSaveOk(false)
    setError('')
    try {
      const res = await fetch(
        `/api/music-gen/workspaces/${workspaceId}/shorts/${track.suno_track_id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title.trim() || null,
            description: description.trim() || null,
            pinned_comment: pinnedComment.trim() || null,
            hashtags: hashtags.trim() ? inputToHashtags(hashtags) : null,
          }),
        },
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message ?? '저장 실패')
      setSaveOk(true)
      onReload()
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다')
    } finally {
      setSaving(false)
    }
  }

  async function requestUpload() {
    setUploading(true)
    setError('')
    try {
      const res = await fetch(
        `/api/music-gen/workspaces/${workspaceId}/shorts/${track.suno_track_id}/upload`,
        { method: 'POST' },
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message ?? '업로드 요청 실패')
      onReload()
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다')
    } finally {
      setUploading(false)
    }
  }

  const canUpload = track.upload_status !== 'done' && track.upload_status !== 'running'

  return (
    <div className="bg-background border border-border rounded-xl overflow-hidden">
      {/* 아코디언 헤더 */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-accent dark:hover:bg-accent transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <svg
            className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-sm font-medium text-foreground truncate">
            {track.title ?? track.suno_track_id}
          </span>
          <span className="text-xs text-muted-foreground font-mono hidden sm:inline truncate max-w-[120px]">
            {track.suno_track_id}
          </span>
        </div>
        <StatusBadge status={track.upload_status} />
      </button>

      {/* 아코디언 패널 */}
      {open && (
        <div className="border-t border-border px-5 py-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-red-600 dark:text-red-400 text-xs">
              {error}
            </div>
          )}
          {saveOk && (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md text-green-600 dark:text-green-400 text-xs">
              저장되었습니다.
            </div>
          )}

          {/* 제목 */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">제목</label>
            <input
              type="text"
              value={title}
              onChange={e => { setTitle(e.target.value); setSaveOk(false) }}
              placeholder="쇼츠 제목"
              className="w-full px-3 py-1.5 bg-background border border-input rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 text-sm"
            />
          </div>

          {/* 설명 */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">설명</label>
            <textarea
              value={description}
              onChange={e => { setDescription(e.target.value); setSaveOk(false) }}
              rows={3}
              placeholder="쇼츠 설명"
              className="w-full px-3 py-1.5 bg-background border border-input rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 text-sm resize-none"
            />
          </div>

          {/* 해시태그 */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              해시태그 <span className="text-muted-foreground font-normal">(쉼표로 구분)</span>
            </label>
            <input
              type="text"
              value={hashtags}
              onChange={e => { setHashtags(e.target.value); setSaveOk(false) }}
              placeholder="#kpop, #ai, #music"
              className="w-full px-3 py-1.5 bg-background border border-input rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 text-sm"
            />
          </div>

          {/* 고정 댓글 */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">고정 댓글</label>
            <textarea
              value={pinnedComment}
              onChange={e => { setPinnedComment(e.target.value); setSaveOk(false) }}
              rows={2}
              placeholder="고정될 댓글 내용"
              className="w-full px-3 py-1.5 bg-background border border-input rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 text-sm resize-none"
            />
          </div>

          {/* 버튼 */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-1.5 bg-primary hover:bg-primary disabled:opacity-50 text-primary-foreground text-sm font-medium rounded-md transition-colors"
            >
              {saving ? '저장 중...' : '저장'}
            </button>
            {canUpload && (
              <button
                onClick={requestUpload}
                disabled={uploading || !track.shorts_id}
                title={!track.shorts_id ? '먼저 저장하세요' : undefined}
                className="px-4 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-primary-foreground text-sm font-medium rounded-md transition-colors"
              >
                {uploading ? '요청 중...' : track.upload_status === 'failed' ? '재시도' : '이 트랙 업로드'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function ShortsPage({ params }: { params: { id: string } }) {
  const [tracks, setTracks] = useState<ShortTrack[]>([])
  const [loading, setLoading] = useState(true)
  const [bulkUploading, setBulkUploading] = useState(false)

  const loadTracks = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/music-gen/workspaces/${params.id}/shorts`)
    const data = await res.json()
    setTracks(data.data ?? [])
    setLoading(false)
  }, [params.id])

  useEffect(() => { loadTracks() }, [loadTracks])

  const pendingTracks = tracks.filter(
    t => t.shorts_id && (!t.upload_status || t.upload_status === 'pending' || t.upload_status === 'failed')
  )

  async function bulkUpload() {
    setBulkUploading(true)
    for (const track of pendingTracks) {
      await fetch(
        `/api/music-gen/workspaces/${params.id}/shorts/${track.suno_track_id}/upload`,
        { method: 'POST' },
      ).catch(() => {})
    }
    await loadTracks()
    setBulkUploading(false)
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href={`/workspaces/${params.id}`}
            className="text-muted-foreground hover:text-foreground dark:hover:text-muted-foreground transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-foreground">쇼츠 관리</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              트랙별 메타데이터를 편집하고 YouTube Shorts에 업로드하세요
            </p>
          </div>
        </div>
        {pendingTracks.length > 0 && (
          <button
            onClick={bulkUpload}
            disabled={bulkUploading}
            className="flex-shrink-0 px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-primary-foreground text-sm font-medium rounded-lg transition-colors"
          >
            {bulkUploading ? '업로드 중...' : `전체 업로드 (${pendingTracks.length})`}
          </button>
        )}
      </div>

      {/* 로딩 */}
      {loading && (
        <div className="text-sm text-muted-foreground">로딩 중...</div>
      )}

      {/* 빈 상태 */}
      {!loading && tracks.length === 0 && (
        <div className="p-6 bg-background border border-border rounded-xl text-center">
          <p className="text-sm text-muted-foreground">
            워크스페이스에 트랙이 없습니다. Suno 생성 후 트랙이 승인되면 여기에 표시됩니다.
          </p>
        </div>
      )}

      {/* 아코디언 목록 */}
      <div className="space-y-2">
        {tracks.map(track => (
          <TrackAccordion
            key={track.suno_track_id}
            track={track}
            workspaceId={params.id}
            onReload={loadTracks}
          />
        ))}
      </div>
    </div>
  )
}
