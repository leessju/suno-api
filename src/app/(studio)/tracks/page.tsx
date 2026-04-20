'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { useAudioPlayer, type AudioTrack } from '@/components/AudioPlayerProvider'
import { useChannel } from '@/components/ChannelProvider'
import { useToast } from '@/components/Toast'

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
  custom_image_key: string | null
  rating: number
  sort_order: number
  original_ratio: number | null
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
  render_bg_key: string | null
  injection_type: 'A' | 'B' | 'C' | null
  lyric_lang: 'en' | 'ja' | 'ko' | 'zh' | 'inst' | null
  lyric_trans: 'en' | 'ja' | 'ko' | 'zh' | 'none' | null
  rendered_at: number | null
}

interface Workspace { id: string; name: string }
interface MidiItem { id: string; label: string | null }

export default function TracksPage() {
  const { selectedChannel } = useChannel()
  const { toast } = useToast()
  const [songs, setSongs] = useState<DraftSong[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [midis, setMidis] = useState<MidiItem[]>([])
  const [loading, setLoading] = useState(false)
  const [bgConfirmOpen, setBgConfirmOpen] = useState(false)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [bgAssigning, setBgAssigning] = useState(false)
  const [visibleCount, setVisibleCount] = useState(20)
  const sentinelRef = useRef<HTMLDivElement>(null)

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
      .then(d => setMidis(Array.isArray(d) ? d : Array.isArray(d.data) ? d.data : []))
  }, [workspaceId])

  const loadSongs = useCallback(() => {
    setLoading(true)
    setVisibleCount(20)
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

  // 인피니티 스크롤
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        setVisibleCount(c => Math.min(c + 20, songs.length))
      }
    }, { threshold: 0.1 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [songs.length])

  const patchSong = (songId: string, body: Record<string, unknown>) =>
    fetch(`/api/music-gen/tracks/${songId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {})

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadingSongId, setUploadingSongId] = useState<string | null>(null)

  const handleImageClick = (songId: string) => {
    setUploadingSongId(songId)
    fileInputRef.current?.click()
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !uploadingSongId) return
    const songId = uploadingSongId
    setUploadingSongId(null)
    e.target.value = ''

    const fd = new FormData()
    fd.append('file', file)
    fd.append('key', `cover-images/${songId}-${Date.now()}.${file.name.split('.').pop()}`)

    try {
      const res = await fetch('/api/r2/upload', { method: 'POST', body: fd })
      if (!res.ok) return
      const data = await res.json()
      setSongs(prev => prev.map(s => s.id === songId ? { ...s, image_url: data.url, custom_image_key: data.key } : s))
      await patchSong(songId, { custom_image_key: data.key })
    } catch { /* ignore */ }
  }

  const toggleConfirm = async (song: DraftSong) => {
    const newVal = song.is_confirmed ? 0 : 1
    if (newVal === 1) {
      // 확정 시 자동 번호 부여 (현재 확정곡 최대 sort_order + 1)
      const maxOrder = songs.filter(s => s.is_confirmed === 1).reduce((m, s) => Math.max(m, s.sort_order || 0), 0)
      const nextOrder = maxOrder + 1
      setSongs(prev => prev.map(s => s.id === song.id ? { ...s, is_confirmed: 1, sort_order: nextOrder } : s))
      await patchSong(song.id, { is_confirmed: 1, sort_order: nextOrder })
    } else {
      // 해제 시 순서 제거
      setSongs(prev => prev.map(s => s.id === song.id ? { ...s, is_confirmed: 0, sort_order: 0 } : s))
      await patchSong(song.id, { is_confirmed: 0, sort_order: 0 })
    }
  }

  const setRating = async (song: DraftSong, value: number) => {
    const newRating = song.rating === value ? 0 : value
    setSongs(prev => prev.map(s => s.id === song.id ? { ...s, rating: newRating } : s))
    await patchSong(song.id, { rating: newRating })
  }

  const swapOrder = async (song: DraftSong, direction: 'up' | 'down') => {
    const confirmed = sortSongs(songs).filter(s => s.is_confirmed === 1)
    const idx = confirmed.findIndex(s => s.id === song.id)
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= confirmed.length) return

    const other = confirmed[targetIdx]
    const myOrder = song.sort_order || idx + 1
    const otherOrder = other.sort_order || targetIdx + 1

    setSongs(prev => prev.map(s => {
      if (s.id === song.id) return { ...s, sort_order: otherOrder }
      if (s.id === other.id) return { ...s, sort_order: myOrder }
      return s
    }))
    await Promise.all([
      patchSong(song.id, { sort_order: otherOrder }),
      patchSong(other.id, { sort_order: myOrder }),
    ])
  }

  const sortSongs = (list: DraftSong[]) =>
    [...list].sort((a, b) => {
      // 1. 순서번호 있는 확정곡 먼저
      const aHasOrder = a.is_confirmed === 1 && a.sort_order > 0 ? 0 : 1
      const bHasOrder = b.is_confirmed === 1 && b.sort_order > 0 ? 0 : 1
      if (aHasOrder !== bHasOrder) return aHasOrder - bHasOrder
      // 2. sort_order 오름차순
      if (aHasOrder === 0 && bHasOrder === 0 && a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
      // 3. 확정 > 미확정
      if (a.is_confirmed !== b.is_confirmed) return b.is_confirmed - a.is_confirmed
      // 4. 날짜 역순
      return b.created_at - a.created_at
    })

  const handleAssignBgClick = () => {
    if (confirmedCount === 0) return
    if (!workspaceId) {
      toast('워크스페이스를 먼저 선택하세요.')
      return
    }
    if (!selectedChannel) {
      toast('채널을 먼저 선택하세요.')
      return
    }
    setBgConfirmOpen(true)
  }

  const handleAssignBgConfirm = async () => {
    setBgConfirmOpen(false)
    if (!workspaceId || !selectedChannel) return
    setBgAssigning(true)
    try {
      const res = await fetch('/api/music-gen/render-bg/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: workspaceId, channel_id: selectedChannel.id }),
      })
      if (res.ok) {
        loadSongs()
        toast('영상이미지가 할당되었습니다.')
      }
    } finally {
      setBgAssigning(false)
    }
  }

  const [rendering, setRendering] = useState(false)
  const [renderDone, setRenderDone] = useState(false)
  const [renderConfirmOpen, setRenderConfirmOpen] = useState(false)

  const submitRender = async (invalidate_cache: 'none' | 'video_only' | 'all') => {
    if (!workspaceId || rendering) return
    setRendering(true)
    try {
      const res = await fetch('/api/music-gen/render-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: workspaceId, channel_id: selectedChannel?.id, invalidate_cache }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        const msg = body?.error?.message ?? `HTTP ${res.status}`
        console.error('[render-jobs]', res.status, msg)
        toast(msg)
        setRendering(false)
        return
      }
      setRenderDone(true)
      setTimeout(() => {
        setRenderDone(false)
        setRendering(false)
      }, 3000)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '알 수 없는 오류'
      console.error('[render-jobs]', msg)
      toast(msg)
      setRendering(false)
    }
  }

  const handleRenderClick = async () => {
    if (!workspaceId || rendering) return
    // 기존 렌더 이력 확인
    try {
      const res = await fetch(`/api/music-gen/renders?workspace_id=${workspaceId}`)
      if (res.ok) {
        const data = await res.json()
        const items = Array.isArray(data) ? data : (data.data ?? [])
        if (items.length > 0) {
          setRenderConfirmOpen(true)
          return
        }
      }
    } catch { /* 확인 실패 시 바로 실행 */ }
    submitRender('none')
  }

  const sortedSongs = sortSongs(songs)
  const confirmedCount = songs.filter(s => s.is_confirmed === 1).length
  const confirmedSongs = songs.filter(s => s.is_confirmed === 1).sort((a, b) => a.sort_order - b.sort_order)

  const formatDuration = (sec: number | null) => {
    if (!sec) return '--:--'
    return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Cover곡</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {songs.length}개 Cover곡
            {confirmedCount > 0 && ` · ${confirmedCount}개 확정`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAssignBgClick}
            disabled={!workspaceId || confirmedCount === 0 || bgAssigning}
            className="px-4 py-2 bg-black hover:bg-black/80 text-white text-sm rounded-lg transition-opacity font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {bgAssigning ? '할당 중...' : '영상이미지 변경'}
          </button>
          <button
            onClick={handleRenderClick}
            disabled={!workspaceId || !selectedChannel || confirmedCount === 0 || rendering}
            className="px-4 py-2 bg-primary hover:opacity-90 text-primary-foreground text-sm rounded-lg transition-opacity font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {rendering
              ? (renderDone ? '✓ 큐 등록됨' : '렌더 중...')
              : workspaceId && confirmedCount > 0 ? `영상 만들기 (${confirmedCount}곡)` : '영상 만들기'}
          </button>
        </div>
      </div>

      {/* 썸네일 변경용 hidden input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageUpload}
      />

      {/* 필터 */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-2">
        <Select value={workspaceId || '__all__'} onValueChange={v => setWorkspaceId(v === '__all__' ? '' : v)}>
          <SelectTrigger className="h-8 text-sm w-full sm:w-auto min-w-[160px]">
            <SelectValue placeholder="워크스페이스 선택" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">워크스페이스 선택</SelectItem>
            {workspaces.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={midiId || '__all__'} onValueChange={v => setMidiId(v === '__all__' ? '' : v)} disabled={!workspaceId}>
          <SelectTrigger className="h-8 text-sm w-full sm:w-auto min-w-[140px]">
            <SelectValue placeholder="전체 원곡" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">전체 원곡</SelectItem>
            {midis.map(m => <SelectItem key={m.id} value={m.id}>{m.label ?? m.id.slice(0, 8)}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={confirmed || '__all__'} onValueChange={v => setConfirmed(v === '__all__' ? '' : v)}>
          <SelectTrigger className="h-8 text-sm w-full sm:w-auto min-w-[120px]">
            <SelectValue placeholder="전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">전체</SelectItem>
            <SelectItem value="1">확정만</SelectItem>
            <SelectItem value="0">미확정만</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 목록 */}
      {loading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => (
          <div key={i} className="h-14 bg-accent rounded-lg animate-pulse" />
        ))}</div>
      ) : songs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Cover곡이 없습니다</div>
      ) : (
        <div className="bg-background border border-border rounded-lg overflow-hidden">
          {/* 헤더 */}
          <div className="hidden sm:grid grid-cols-[28px_48px_40px_56px_56px_28px_1fr_120px_64px_90px] border-b border-border bg-accent/30 px-3 py-2 gap-2">
            <div />
            <div className="text-[10px] font-medium text-muted-foreground text-center">영상순서</div>
            <div className="text-[10px] font-medium text-muted-foreground text-center">재생</div>
            <div className="text-[10px] font-medium text-muted-foreground text-center">커버</div>
            <div className="text-[10px] font-medium text-muted-foreground text-center">영상이미지</div>
            <div className="text-[10px] font-medium text-muted-foreground text-center">확정</div>
            <div className="text-[10px] font-medium text-muted-foreground">제목 · 스타일</div>
            <div className="text-[10px] font-medium text-muted-foreground">원곡</div>
            <div className="text-[10px] font-medium text-muted-foreground text-center">길이</div>
            <div className="text-[10px] font-medium text-muted-foreground text-center">별점</div>
          </div>

          {sortedSongs.slice(0, visibleCount).map(song => (
            <div key={song.id} className="flex sm:grid sm:grid-cols-[28px_48px_40px_56px_56px_28px_1fr_120px_64px_90px] items-center gap-2 px-3 py-2 border-b border-border last:border-0 hover:bg-accent/20 transition-colors">
              {/* 확정 체크박스 */}
              <div className="flex-shrink-0">
                <input
                  type="checkbox"
                  checked={song.is_confirmed === 1}
                  onChange={() => toggleConfirm(song)}
                  disabled={!workspaceId}
                  className="w-3.5 h-3.5 accent-primary disabled:opacity-30 disabled:cursor-not-allowed"
                  title={!workspaceId ? '워크스페이스를 선택하세요' : '확정 (영상 만들기 대상)'}
                />
              </div>

              {/* 순서 */}
              <div className="hidden sm:flex items-center justify-center gap-0.5">
                {song.is_confirmed === 1 && workspaceId ? (
                  <>
                    <button
                      onClick={() => swapOrder(song, 'up')}
                      className="p-0.5 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-20"
                      disabled={!workspaceId || sortedSongs.filter(s => s.is_confirmed === 1).findIndex(s => s.id === song.id) === 0}
                      title="위로"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <span className="text-[11px] font-medium tabular-nums w-4 text-center">{song.sort_order || '—'}</span>
                    <button
                      onClick={() => swapOrder(song, 'down')}
                      className="p-0.5 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-20"
                      disabled={!workspaceId || (() => { const c = sortedSongs.filter(s => s.is_confirmed === 1); return c.findIndex(s => s.id === song.id) === c.length - 1 })()}
                      title="아래로"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </>
                ) : (
                  <span className="text-[10px] text-muted-foreground/30">—</span>
                )}
              </div>

              {/* 오디오 재생 */}
              <div className="flex-shrink-0 flex justify-center">
                {song.audio_url ? (
                  <PlayButton song={song} />
                ) : (
                  <span className="text-[10px] text-muted-foreground/50">—</span>
                )}
              </div>

              {/* 커버 이미지 (클릭으로 변경) */}
              <button
                onClick={() => handleImageClick(song.id)}
                className="flex-shrink-0 relative group w-10 h-10 mx-auto"
                title="썸네일 변경"
              >
                {song.custom_image_key ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/r2/object/${song.custom_image_key}`} alt="" className="w-10 h-10 object-cover rounded border border-border" />
                ) : song.image_url ? (
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
                <div className="absolute inset-0 bg-black/40 rounded opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                  </svg>
                </div>
              </button>

              {/* 영상이미지 프리뷰 (확정곡만) */}
              {song.is_confirmed === 1 ? (
                song.render_bg_key ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/r2/object/${song.render_bg_key}`}
                    alt=""
                    className="w-10 h-10 object-cover rounded border border-border flex-shrink-0 mx-auto cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
                    title="클릭하여 크게 보기"
                    onClick={() => setPreviewImage(`/api/r2/object/${song.render_bg_key}`)}
                  />
                ) : (
                  <div className="w-10 h-10 bg-accent rounded border border-border flex-shrink-0 mx-auto flex items-center justify-center">
                    <svg className="w-4 h-4 text-muted-foreground/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z" />
                    </svg>
                  </div>
                )
              ) : (
                <div className="w-10 h-10 flex-shrink-0" />
              )}

              {/* 확정 표시 */}
              <div className="flex-shrink-0 flex justify-center">
                {song.is_confirmed === 1 && (
                  <div className="w-2 h-2 rounded-full bg-green-500" title="확정됨" />
                )}
              </div>

              {/* 제목 + 스타일 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 flex-wrap">
                  <p className="text-xs font-medium text-foreground truncate">
                    {song.title ?? '(제목 없음)'}
                  </p>
                  {song.lyric_lang && (
                    <span className="flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 text-[9px] font-medium leading-none">
                      {({ en:'영어', ja:'일어', ko:'한국어', zh:'중국어', inst:'Inst.' } as Record<string,string>)[song.lyric_lang] ?? song.lyric_lang}
                    </span>
                  )}
                  {song.lyric_trans && song.lyric_trans !== 'none' && (
                    <span className="flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 text-[9px] font-medium leading-none">
                      번역→{({ en:'영어', ja:'일어', ko:'한국어', zh:'중국어' } as Record<string,string>)[song.lyric_trans] ?? song.lyric_trans}
                    </span>
                  )}
                  {song.injection_type === 'B' && (
                    <span className="flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-500 text-[9px] font-medium leading-none">배경음+채널</span>
                  )}
                  {song.injection_type === 'C' && (
                    <span className="flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded bg-red-500/10 text-red-500 text-[9px] font-medium leading-none">배경음+공통</span>
                  )}
                  {song.rendered_at && (
                    <span className="flex-shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-500 text-[9px] font-medium leading-none" title={`영상 완료: ${new Date(song.rendered_at).toLocaleDateString('ko-KR')}`}>
                      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                      </svg>
                      영상완료
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground truncate">
                  {song.style_used ?? song.draft_selected_style ?? '—'}
                </p>
              </div>

              {/* MIDI 라벨 */}
              <p className="hidden sm:block text-[10px] text-muted-foreground truncate">
                {song.midi_label ?? '—'}
              </p>

              {/* 길이 */}
              <p className="hidden sm:block text-[10px] text-muted-foreground tabular-nums text-center">
                {formatDuration(song.duration)}
              </p>

              {/* 별점 */}
              <div className="hidden sm:flex items-center justify-center gap-0">
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    onClick={() => setRating(song, star)}
                    className="p-0 w-4 h-4 flex items-center justify-center hover:scale-125 transition-transform"
                    title={`${star}점`}
                  >
                    <svg className={`w-3 h-3 ${star <= (song.rating || 0) ? 'text-yellow-400' : 'text-muted-foreground/30'}`} viewBox="0 0 20 20" fill={star <= (song.rating || 0) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.5}>
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  </button>
                ))}
              </div>

            </div>
          ))}
        </div>
      )}
      {visibleCount < sortedSongs.length && (
        <div ref={sentinelRef} className="flex justify-center py-4">
          <span className="text-xs text-muted-foreground">{visibleCount} / {sortedSongs.length}개 로드됨</span>
        </div>
      )}
      <AlertDialog open={bgConfirmOpen} onOpenChange={setBgConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>영상이미지 변경</AlertDialogTitle>
            <AlertDialogDescription>
              영상에 사용할 영상이미지로 변경하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleAssignBgConfirm}>확인</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 재렌더 확인 다이얼로그 */}
      <AlertDialog open={renderConfirmOpen} onOpenChange={setRenderConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>이미 생성된 영상이 있습니다</AlertDialogTitle>
            <AlertDialogDescription>
              이 워크스페이스의 영상이 이미 존재합니다. 어떻게 하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel onClick={() => setRenderConfirmOpen(false)}>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-orange-500 hover:bg-orange-600 text-white"
              onClick={() => { setRenderConfirmOpen(false); submitRender('video_only') }}
            >
              영상만 재생성
            </AlertDialogAction>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={() => { setRenderConfirmOpen(false); submitRender('all') }}
            >
              전체 재생성
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 이미지 프리뷰 모달 */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setPreviewImage(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewImage}
            alt=""
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}

function PlayButton({ song }: { song: DraftSong }) {
  const { play, currentTrack, isPlaying } = useAudioPlayer()
  const isActive = currentTrack?.id === song.id

  function handleClick() {
    if (!song.audio_url) return
    play({
      id: song.id,
      title: song.title ?? '(제목 없음)',
      audioUrl: song.audio_url,
      imageUrl: song.image_url ?? undefined,
      subtitle: song.style_used ?? undefined,
    })
  }

  return (
    <button
      onClick={handleClick}
      className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
        isActive
          ? 'bg-primary text-primary-foreground'
          : 'bg-accent text-muted-foreground hover:bg-primary/20 hover:text-foreground'
      }`}
      title={isActive && isPlaying ? '일시정지' : '재생'}
    >
      {isActive && isPlaying ? (
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
      ) : (
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
      )}
    </button>
  )
}
