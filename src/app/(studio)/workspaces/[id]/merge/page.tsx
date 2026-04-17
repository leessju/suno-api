'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'

interface Track {
  suno_track_id: string
  title: string | null
  audio_url: string | null
}

export default function MergePage({ params }: { params: { id: string } }) {
  const [tracks, setTracks] = useState<Track[]>([])
  const [order, setOrder] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/music-gen/workspaces/${params.id}/merge`)
    const data = await res.json()
    const trackList: Track[] = data.data?.tracks ?? []
    const savedOrder: string[] | null = data.data?.merge_order ?? null
    setTracks(trackList)
    if (savedOrder && savedOrder.length > 0) {
      setOrder(savedOrder)
    } else {
      setOrder(trackList.map(t => t.suno_track_id))
    }
    setLoading(false)
  }, [params.id])

  useEffect(() => { loadData() }, [loadData])

  // 순서 기반으로 정렬된 트랙 목록
  const orderedTracks = order
    .map(id => tracks.find(t => t.suno_track_id === id))
    .filter((t): t is Track => !!t)

  function moveUp(idx: number) {
    if (idx === 0) return
    const next = [...order]
    ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
    setOrder(next)
    setSaved(false)
  }

  function moveDown(idx: number) {
    if (idx === order.length - 1) return
    const next = [...order]
    ;[next[idx + 1], next[idx]] = [next[idx], next[idx + 1]]
    setOrder(next)
    setSaved(false)
  }

  function onDragStart(idx: number) {
    setDragIdx(idx)
  }

  function onDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    if (dragIdx === null || dragIdx === idx) return
    const next = [...order]
    const [removed] = next.splice(dragIdx, 1)
    next.splice(idx, 0, removed)
    setOrder(next)
    setDragIdx(idx)
    setSaved(false)
  }

  function onDragEnd() {
    setDragIdx(null)
  }

  async function saveOrder() {
    setSaving(true)
    try {
      await fetch(`/api/music-gen/workspaces/${params.id}/merge`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order }),
      })
      setSaved(true)
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">머지 순서 지정</h1>
          <p className="text-sm text-muted-foreground mt-1">
            드래그하거나 화살표 버튼으로 트랙 순서를 조정하세요
          </p>
        </div>
        <Button
          onClick={saveOrder}
          disabled={saving || order.length === 0}
          className="px-4 py-2 bg-primary hover:bg-primary disabled:opacity-50 text-primary-foreground text-sm font-medium rounded-lg transition-colors w-full sm:w-auto"
        >
          {saving ? '저장 중...' : saved ? '저장됨' : '순서 저장'}
        </Button>
      </div>

      {loading && (
        <div className="text-sm text-muted-foreground">로딩 중...</div>
      )}

      {!loading && orderedTracks.length === 0 && (
        <div className="p-6 bg-background border border-border rounded-xl text-center">
          <p className="text-sm text-muted-foreground">
            승인된 트랙이 없습니다. Suno 생성 후 트랙을 승인하면 여기에 표시됩니다.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {orderedTracks.map((track, idx) => (
          <div
            key={track.suno_track_id}
            draggable
            onDragStart={() => onDragStart(idx)}
            onDragOver={e => onDragOver(e, idx)}
            onDragEnd={onDragEnd}
            className={`flex items-center gap-3 p-4 bg-background border rounded-xl cursor-grab active:cursor-grabbing transition-colors ${
              dragIdx === idx
                ? 'border-foreground bg-accent dark:bg-accent'
                : 'border-border hover:border-input dark:hover:border-input'
            }`}
          >
            {/* 순서 번호 */}
            <span className="w-6 text-center text-sm font-medium text-muted-foreground flex-shrink-0">
              {idx + 1}
            </span>

            {/* 드래그 핸들 */}
            <svg className="w-4 h-4 text-muted-foreground flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
            </svg>

            {/* 트랙 정보 */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {track.title ?? track.suno_track_id}
              </p>
              <p className="text-xs text-muted-foreground font-mono truncate">
                {track.suno_track_id}
              </p>
            </div>

            {/* 위아래 버튼 */}
            <div className="flex flex-col gap-1 flex-shrink-0">
              <Button
                onClick={() => moveUp(idx)}
                disabled={idx === 0}
                className="p-1 rounded text-muted-foreground hover:text-foreground dark:hover:text-muted-foreground disabled:opacity-30 transition-colors"
                aria-label="위로"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              </Button>
              <Button
                onClick={() => moveDown(idx)}
                disabled={idx === orderedTracks.length - 1}
                className="p-1 rounded text-muted-foreground hover:text-foreground dark:hover:text-muted-foreground disabled:opacity-30 transition-colors"
                aria-label="아래로"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </Button>
            </div>
          </div>
        ))}
      </div>

      {saved && order.length > 0 && (
        <p className="text-sm text-green-600 dark:text-green-400">순서가 저장되었습니다.</p>
      )}
    </div>
  )
}
