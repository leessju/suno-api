'use client'

import { useState, useEffect, useCallback } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface DraftSong {
  id: string
  draft_row_id: string
  suno_id: string | null
  title: string | null
  audio_url: string | null
  image_url: string | null
  duration: number | null
  style_used: string | null
  is_confirmed: number
  sort_order: number
  status: 'pending' | 'processing' | 'done' | 'failed'
  error_msg: string | null
  created_at: number
  // joined fields
  workspace_id: string
  workspace_name: string | null
  midi_label: string | null
  draft_lyrics: string | null
  draft_selected_style: string | null
  draft_image_key: string | null
}

interface Workspace { id: string; name: string }
interface MidiItem { id: string; label: string | null }

export default function TracksPage() {
  const [songs, setSongs] = useState<DraftSong[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [midis, setMidis] = useState<MidiItem[]>([])
  const [loading, setLoading] = useState(false)

  const [workspaceId, setWorkspaceId] = useState('')
  const [midiId, setMidiId] = useState('')
  const [confirmed, setConfirmed] = useState('')  // '' | '1' | '0'

  // 워크스페이스 목록 로드
  useEffect(() => {
    fetch('/api/music-gen/workspaces')
      .then(r => r.json())
      .then(d => setWorkspaces(d.data ?? d ?? []))
  }, [])

  // 워크스페이스 선택 시 MIDI 목록 로드
  useEffect(() => {
    setMidiId('')
    setMidis([])
    if (!workspaceId) return
    fetch(`/api/music-gen/workspaces/${workspaceId}/midis`)
      .then(r => r.json())
      .then(d => setMidis(d.data ?? d ?? []))
  }, [workspaceId])

  const loadSongs = useCallback(() => {
    if (!workspaceId && !midiId) { setSongs([]); return }
    setLoading(true)
    const params = new URLSearchParams()
    if (workspaceId) params.set('workspaceId', workspaceId)
    if (midiId) params.set('midiId', midiId)
    if (confirmed !== '') params.set('confirmed', confirmed)
    fetch(`/api/music-gen/tracks?${params}`)
      .then(r => r.json())
      .then(d => setSongs(d.data ?? []))
      .finally(() => setLoading(false))
  }, [workspaceId, midiId, confirmed])

  useEffect(() => { loadSongs() }, [loadSongs])

  const toggleConfirm = async (song: DraftSong) => {
    const newVal = song.is_confirmed ? 0 : 1
    setSongs(prev => prev.map(s => s.id === song.id ? { ...s, is_confirmed: newVal } : s))
    await fetch(`/api/music-gen/tracks/${song.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_confirmed: newVal }),
    }).catch(() => {})
  }

  const confirmedCount = songs.filter(s => s.is_confirmed === 1).length

  const formatDuration = (sec: number | null) => {
    if (!sec) return '--:--'
    return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">트랙 허브</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {songs.length}개 트랙
            {confirmedCount > 0 && ` · ${confirmedCount}개 확정`}
          </p>
        </div>
        {confirmedCount > 0 && (
          <button
            onClick={() => alert(`확정된 ${confirmedCount}곡으로 영상 렌더링을 시작합니다. (구현 예정)`)}
            className="px-4 py-2 bg-primary hover:opacity-90 text-primary-foreground text-sm rounded-lg transition-opacity font-medium"
          >
            영상 만들기 ({confirmedCount}곡)
          </button>
        )}
      </div>

      {/* 필터 */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-2">
        <Select value={workspaceId} onValueChange={setWorkspaceId}>
          <SelectTrigger className="h-8 text-sm w-full sm:w-auto min-w-[160px]">
            <SelectValue placeholder="워크스페이스 선택" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">워크스페이스 선택</SelectItem>
            {workspaces.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={midiId} onValueChange={setMidiId} disabled={!workspaceId}>
          <SelectTrigger className="h-8 text-sm w-full sm:w-auto min-w-[140px]">
            <SelectValue placeholder="전체 MIDI" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">전체 MIDI</SelectItem>
            {midis.map(m => <SelectItem key={m.id} value={m.id}>{m.label ?? m.id.slice(0, 8)}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={confirmed} onValueChange={setConfirmed}>
          <SelectTrigger className="h-8 text-sm w-full sm:w-auto min-w-[120px]">
            <SelectValue placeholder="전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">전체</SelectItem>
            <SelectItem value="1">확정만</SelectItem>
            <SelectItem value="0">미확정만</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 목록 */}
      {!workspaceId ? (
        <div className="text-center py-16 text-muted-foreground text-sm">워크스페이스를 선택하세요</div>
      ) : loading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => (
          <div key={i} className="h-14 bg-accent rounded-lg animate-pulse" />
        ))}</div>
      ) : songs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">트랙이 없습니다</div>
      ) : (
        <div className="bg-background border border-border rounded-lg overflow-hidden">
          {/* 헤더 */}
          <div className="hidden sm:grid grid-cols-[28px_56px_1fr_120px_64px_160px_28px] border-b border-border bg-accent/30 px-3 py-2 gap-2">
            <div />
            <div className="text-[10px] font-medium text-muted-foreground">이미지</div>
            <div className="text-[10px] font-medium text-muted-foreground">제목 · 스타일</div>
            <div className="text-[10px] font-medium text-muted-foreground">MIDI</div>
            <div className="text-[10px] font-medium text-muted-foreground">길이</div>
            <div className="text-[10px] font-medium text-muted-foreground">재생</div>
            <div />
          </div>

          {songs.map(song => (
            <div key={song.id} className="flex sm:grid sm:grid-cols-[28px_56px_1fr_120px_64px_160px_28px] items-center gap-2 px-3 py-2 border-b border-border last:border-0 hover:bg-accent/20 transition-colors">
              {/* 확정 체크박스 */}
              <div className="flex-shrink-0">
                <input
                  type="checkbox"
                  checked={song.is_confirmed === 1}
                  onChange={() => toggleConfirm(song)}
                  className="w-3.5 h-3.5 accent-primary"
                  title="확정 (영상 만들기 대상)"
                />
              </div>

              {/* 커버 이미지 */}
              <div className="flex-shrink-0">
                {song.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={song.image_url} alt="" className="w-10 h-10 object-cover rounded border border-border" />
                ) : song.draft_image_key ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/r2/object/${song.draft_image_key}`} alt="" className="w-10 h-10 object-cover rounded border border-border" />
                ) : (
                  <div className="w-10 h-10 bg-accent rounded border border-border flex items-center justify-center">
                    <svg className="w-4 h-4 text-muted-foreground/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
                    </svg>
                  </div>
                )}
              </div>

              {/* 제목 + 스타일 */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">
                  {song.title ?? '(제목 없음)'}
                  {song.is_confirmed === 1 && (
                    <span className="ml-1.5 text-[10px] text-green-600 dark:text-green-400">● 확정</span>
                  )}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {song.style_used ?? song.draft_selected_style ?? '—'}
                </p>
              </div>

              {/* MIDI 라벨 */}
              <p className="hidden sm:block text-[10px] text-muted-foreground truncate">
                {song.midi_label ?? '—'}
              </p>

              {/* 길이 */}
              <p className="hidden sm:block text-[10px] text-muted-foreground tabular-nums">
                {formatDuration(song.duration)}
              </p>

              {/* 오디오 재생 */}
              <div className="flex-shrink-0">
                {song.audio_url ? (
                  <audio controls src={song.audio_url} className="h-7" style={{ width: '150px' }} />
                ) : (
                  <span className="text-[10px] text-muted-foreground/50">
                    {song.status === 'pending' || song.status === 'processing' ? '생성 중...' : '—'}
                  </span>
                )}
              </div>

              {/* 상태 점 */}
              <div className="flex-shrink-0">
                <div className={`w-2 h-2 rounded-full ${
                  song.status === 'done' ? 'bg-green-500'
                  : song.status === 'failed' ? 'bg-red-500'
                  : 'bg-yellow-400 animate-pulse'
                }`} title={song.status} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
