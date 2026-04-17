'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { getMidiThumbnail } from '@/lib/youtube-utils'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Combobox } from '@/components/ui/combobox'

interface MidiDetail {
  id: string
  label: string | null
  source_type: string
  source_ref: string | null
  cover_image?: string | null
  audio_url?: string | null
  gen_mode: string
  original_ratio: number
  status: string
  error_message: string | null
  track_count?: number
  created_at: number
  updated_at: number
  midi_master?: {
    bpm?: number
    key_signature?: string
    mp3_r2_key?: string | null
    midi_r2_key?: string | null
    chord_json?: Array<{ time: number; chord: string }> | string | null
    analysis_json?: string | null
  } | null
  tracks?: Array<{ suno_track_id: string }>
}

interface DraftSong {
  id: string
  draft_row_id: string
  suno_id: string | null
  suno_v2_id: string | null
  title: string | null
  lyric: string | null
  audio_url: string | null
  image_url: string | null
  duration: number | null
  style_used: string | null
  is_confirmed: number  // 0 | 1 (SQLite INTEGER)
  custom_image_key: string | null
  sort_order: number
  status: 'pending' | 'processing' | 'done' | 'failed'
  error_msg: string | null
  created_at: number
}

interface GeneratedRow {
  id: string
  title_en: string
  title_jp: string
  lyrics: string
  narrative: string
  suno_style_prompts: string[]
  selectedStyle: string
  originalRatio: number
  imageKey: string | null
  lyricsOpen: boolean
  checked: boolean
  loading?: boolean
  error?: string
  making?: boolean
  makingVideo?: boolean
  madeTitle?: string
  madeTitleVideo?: string
  songs: DraftSong[]
}

interface DbDraftRow {
  id: string
  workspace_midi_id: string
  title_en: string
  title_jp: string
  lyrics: string
  narrative: string
  suno_style_prompts: string   // JSON
  selected_style: string
  image_key: string | null
  original_ratio: number
  status: 'loading' | 'ready' | 'making' | 'done' | 'error'
  error_msg: string | null
  made_title: string | null
  made_title_video: string | null
  sort_order: number
}

function dbRowToGeneratedRow(r: DbDraftRow, songs: DraftSong[] = []): GeneratedRow {
  let prompts: string[] = []
  try { prompts = JSON.parse(r.suno_style_prompts) } catch { /* noop */ }
  return {
    id: r.id,
    title_en: r.title_en,
    title_jp: r.title_jp,
    lyrics: r.lyrics,
    narrative: r.narrative,
    suno_style_prompts: prompts,
    selectedStyle: r.selected_style,
    originalRatio: r.original_ratio,
    imageKey: r.image_key,
    lyricsOpen: false,
    checked: false,
    loading: r.status === 'loading',
    making: r.status === 'making',
    error: r.error_msg ?? undefined,
    madeTitle: r.made_title ?? undefined,
    madeTitleVideo: r.made_title_video ?? undefined,
    songs,
  }
}

function DraftSongList({
  songs,
  workspaceId,
  midiId,
  draftId,
  onSongUpdate,
  onSongDelete,
}: {
  songs: DraftSong[]
  workspaceId: string
  midiId: string
  draftId: string
  onSongUpdate: (songId: string, patch: Partial<DraftSong>) => void
  onSongDelete: (songId: string) => void
}) {
  if (songs.length === 0) return null

  const basePath = `/api/music-gen/workspaces/${workspaceId}/midis/${midiId}/drafts/${draftId}/songs`

  const toggleConfirm = async (song: DraftSong) => {
    const newVal = song.is_confirmed ? 0 : 1
    onSongUpdate(song.id, { is_confirmed: newVal })
    await fetch(`${basePath}/${song.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_confirmed: newVal }),
    }).catch(() => {})
  }

  const deleteSong = async (songId: string) => {
    onSongDelete(songId)
    await fetch(`${basePath}/${songId}`, { method: 'DELETE' }).catch(() => {})
  }

  return (
    <div className="mt-2 border border-border rounded-md overflow-hidden divide-y divide-border">
      {songs.map((song, idx) => {
        const isLoading = song.status === 'pending' || song.status === 'processing'
        const isFailed = song.status === 'failed'
        const isDone = song.status === 'done'
        const label = `버전 ${String.fromCharCode(65 + idx)}`  // A, B, C...

        return (
          <div key={song.id} className="flex items-center gap-2 px-3 py-2 bg-background hover:bg-accent/30 transition-colors">
            {/* 확정 체크박스 */}
            <input
              type="checkbox"
              checked={song.is_confirmed === 1}
              disabled={isLoading || isFailed}
              onChange={() => toggleConfirm(song)}
              className="w-3.5 h-3.5 accent-primary flex-shrink-0"
              title="확정 (영상 만들기 대상)"
            />

            {/* 커버 이미지 */}
            {song.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={song.image_url}
                alt={label}
                className="w-8 h-8 object-cover rounded flex-shrink-0 border border-border"
              />
            ) : (
              <div className="w-8 h-8 bg-accent rounded flex-shrink-0 border border-border flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-muted-foreground/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
                </svg>
              </div>
            )}

            {/* 제목 + 상태 */}
            <div className="flex-1 min-w-0">
              {isLoading ? (
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <svg className="w-3 h-3 animate-spin text-primary flex-shrink-0" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  {label} 생성 중...
                </div>
              ) : isFailed ? (
                <p className="text-[11px] text-red-500">{song.error_msg || `${label} 생성 실패`}</p>
              ) : (
                <div>
                  <p className="text-[11px] font-medium text-foreground truncate">
                    {song.title || label}
                    {song.is_confirmed === 1 && (
                      <span className="ml-1.5 text-[10px] text-green-600 dark:text-green-400 font-normal">● 확정</span>
                    )}
                  </p>
                  {song.duration && (
                    <p className="text-[10px] text-muted-foreground">
                      {Math.floor(song.duration / 60)}:{String(Math.round(song.duration % 60)).padStart(2, '0')}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* 오디오 재생 */}
            {isDone && song.audio_url && (
              <audio
                controls
                src={song.audio_url}
                className="h-7 flex-shrink-0"
                style={{ width: '140px' }}
              />
            )}

            {/* 삭제 */}
            <button
              onClick={() => deleteSong(song.id)}
              className="p-1 text-muted-foreground hover:text-red-500 transition-colors flex-shrink-0"
              title="삭제"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        )
      })}
    </div>
  )
}

function getPipeline(sourceType: string) {
  if (sourceType === 'youtube_video') {
    return [
      { key: 'converting',      label: 'MP3 변환' },
      { key: 'midi_generating', label: 'MIDI 생성' },
      { key: 'analyzing',       label: '분석' },
      { key: 'ready',           label: '완료' },
    ]
  }
  return [
    { key: 'midi_generating', label: 'MIDI 생성' },
    { key: 'analyzing',       label: '분석' },
    { key: 'ready',           label: '완료' },
  ]
}

const STATUS_ORDER = ['pending', 'converting', 'midi_generating', 'analyzing', 'ready', 'generating', 'done']

export default function MidiDetailPage() {
  const { id, midiId } = useParams<{ id: string; midiId: string }>()
  const router = useRouter()
  const [midi, setMidi] = useState<MidiDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [confirmResetOpen, setConfirmResetOpen] = useState(false)

  const [analysisOpen, setAnalysisOpen] = useState(false)

  // 음원 만들기 팝업 상태
  const [showMakePopup, setShowMakePopup] = useState(false)
  const [songCount, setSongCount] = useState(3)
  const [globalRatio, setGlobalRatio] = useState(50)

  // N곡 생성 상태
  const [generating, setGenerating] = useState(false)
  const [genProgress, setGenProgress] = useState({ done: 0, total: 0 })
  const [generatedRows, setGeneratedRows] = useState<GeneratedRow[]>([])

  // 수노 스타일 즐겨찾기 (localStorage)
  const FAVORITES_KEY = `suno-style-favorites-${id}`
  const [styleFavorites, setStyleFavorites] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try { return JSON.parse(localStorage.getItem(`suno-style-favorites-${id}`) ?? '[]') } catch { return [] }
  })
  const saveFavorites = (newStyles: string[]) => {
    setStyleFavorites(prev => {
      const merged = Array.from(new Set([...prev, ...newStyles]))
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(merged))
      return merged
    })
  }

  // midi 로드 후 globalRatio 동기화
  useEffect(() => {
    if (midi?.original_ratio !== undefined) setGlobalRatio(midi.original_ratio)
  }, [midi?.original_ratio])

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draftPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const generatingRef = useRef(false)

  const loadMidi = useCallback(async () => {
    const res = await fetch(`/api/music-gen/workspaces/${id}/midis/${midiId}`)
    const data = await res.json()
    const midi = data?.data ?? data
    setMidi(midi)
    setLoading(false)
    if (['converting', 'midi_generating', 'analyzing', 'generating'].includes(midi?.status ?? '')) {
      pollRef.current = setTimeout(loadMidi, 5000)
    }
  }, [id, midiId])

  const handleDelete = () => setConfirmDeleteOpen(true)

  const confirmDelete = async () => {
    setDeleting(true)
    await fetch(`/api/music-gen/workspaces/${id}/midis/${midiId}`, { method: 'DELETE' })
    window.dispatchEvent(new CustomEvent('midi:deleted', { detail: { midiId, workspaceId: id } }))
    router.refresh()
    router.push(`/workspaces/${id}`)
  }

  const handleGenerate = async () => {
    setShowMakePopup(false)
    generatingRef.current = true
    setGenerating(true)

    // R2 이미지 목록 먼저 가져오기
    let imageKeys: string[] = []
    try {
      const res = await fetch('/api/music-gen/assets/r2')
      const data = await res.json()
      const list: Array<{ key: string }> = data?.data ?? data ?? []
      imageKeys = list
        .map(o => o.key)
        .filter(k => /\.(jpg|jpeg|png|webp|gif)$/i.test(k))
    } catch { /* 이미지 없어도 계속 */ }

    // N개 skeleton 행 생성
    const skeletonRows: GeneratedRow[] = Array.from({ length: songCount }, () => ({
      id: crypto.randomUUID(),
      title_en: '', title_jp: '', lyrics: '', narrative: '',
      suno_style_prompts: [], selectedStyle: '',
      originalRatio: globalRatio,
      imageKey: imageKeys.length > 0
        ? imageKeys[Math.floor(Math.random() * imageKeys.length)]
        : null,
      lyricsOpen: false,
      checked: false,
      loading: true,
      songs: [],
    }))

    // DB에 skeleton N개 일괄 INSERT
    await fetch(`/api/music-gen/workspaces/${id}/midis/${midiId}/drafts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows: skeletonRows.map((r, i) => ({
          id: r.id,
          imageKey: r.imageKey,
          originalRatio: r.originalRatio,
          sortOrder: i,
        })),
      }),
    }).catch(() => { /* silent — UI는 계속 진행 */ })

    setGeneratedRows(skeletonRows)
    setGenProgress({ done: 0, total: songCount })

    // 각 row에 대해 variants API 직접 호출 (병렬)
    await Promise.all(
      skeletonRows.map(async (r, i) => {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 120_000)
        try {
          const res = await fetch(`/api/music-gen/workspaces/${id}/variants`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ emotion_input: '' }),
            signal: controller.signal,
          })
          clearTimeout(timer)
          let data: Record<string, unknown> = {}
          try { data = await res.json() } catch { /* HTML 응답 등 */ }
          if (!res.ok) throw new Error((data.error as { message?: string })?.message ?? `HTTP ${res.status}`)
          const content = ((data?.data as Record<string, unknown>)?.content ?? data?.content ?? {}) as Record<string, unknown>
          const prompts: string[] = (content.suno_style_prompts as string[] | undefined) ?? []
          const patch: Partial<GeneratedRow> = {
            title_en: (content.title_en as string | undefined) ?? '',
            title_jp: (content.title_jp as string | undefined) ?? '',
            lyrics: (content.lyrics as string | undefined) ?? '',
            narrative: (content.narrative as string | undefined) ?? '',
            suno_style_prompts: prompts,
            selectedStyle: prompts[0] ?? '',
            loading: false,
          }
          setGeneratedRows(prev => prev.map(row => row.id === r.id ? { ...row, ...patch } : row))
          setGenProgress(p => ({ ...p, done: p.done + 1 }))
          // DB 업데이트
          fetch(`/api/music-gen/workspaces/${id}/midis/${midiId}/drafts/${r.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title_en: patch.title_en,
              title_jp: patch.title_jp,
              lyrics: patch.lyrics,
              narrative: patch.narrative,
              suno_style_prompts: JSON.stringify(prompts),
              selected_style: patch.selectedStyle,
              original_ratio: r.originalRatio,
              sort_order: i,
              status: 'ready',
            }),
          }).catch(() => {})
        } catch (e) {
          clearTimeout(timer)
          const rawMsg = e instanceof Error ? e.message : ''
          const errorMsg = e instanceof Error && e.name === 'AbortError'
            ? '시간 초과 (120초)'
            : rawMsg || '생성 실패'
          setGeneratedRows(prev => prev.map(row => row.id === r.id ? { ...row, loading: false, error: errorMsg } : row))
          fetch(`/api/music-gen/workspaces/${id}/midis/${midiId}/drafts/${r.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'error', error_msg: errorMsg }),
          }).catch(() => {})
        }
      })
    )

    generatingRef.current = false
    setGenerating(false)
  }

  const patchDraft = useCallback((rowId: string, body: Record<string, unknown>) => {
    fetch(`/api/music-gen/workspaces/${id}/midis/${midiId}/drafts/${rowId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => { /* silent */ })
  }, [id, midiId])

  const handleMakeRow = async (rowId: string) => {
    const row = generatedRows.find(r => r.id === rowId)
    if (!row) return
    setGeneratedRows(prev => prev.map(r => r.id === rowId ? { ...r, making: true } : r))
    patchDraft(rowId, { status: 'making' })
    try {
      const res = await fetch(
        `/api/music-gen/workspaces/${id}/midis/${midiId}/drafts/${rowId}/songs`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ style_used: row.selectedStyle }),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message ?? '생성 실패')
      const newSongs: DraftSong[] = data?.data ?? data ?? []
      setGeneratedRows(prev => prev.map(r =>
        r.id === rowId
          ? { ...r, making: false, songs: [...(r.songs ?? []), ...newSongs] }
          : r
      ))
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : '실패'
      setGeneratedRows(prev => prev.map(r =>
        r.id === rowId ? { ...r, making: false, error: errorMsg } : r
      ))
      patchDraft(rowId, { status: 'error', error_msg: errorMsg })
    }
  }

  const handleSongUpdate = (draftRowId: string, songId: string, patch: Partial<DraftSong>) => {
    setGeneratedRows(prev => prev.map(r =>
      r.id === draftRowId
        ? { ...r, songs: r.songs.map(s => s.id === songId ? { ...s, ...patch } : s) }
        : r
    ))
  }

  const handleSongDelete = (draftRowId: string, songId: string) => {
    setGeneratedRows(prev => prev.map(r =>
      r.id === draftRowId
        ? { ...r, songs: r.songs.filter(s => s.id !== songId) }
        : r
    ))
  }

  const loadDrafts = useCallback(async () => {
    const res = await fetch(`/api/music-gen/workspaces/${id}/midis/${midiId}/drafts`)
    if (!res.ok) return
    const data = await res.json()
    const rows: DbDraftRow[] = data?.data ?? data ?? []
    if (rows.length === 0) return
    // 각 row의 songs를 병렬 로드
    const songsResults = await Promise.all(
      rows.map(async r => {
        const sRes = await fetch(`/api/music-gen/workspaces/${id}/midis/${midiId}/drafts/${r.id}/songs`)
        if (!sRes.ok) return [] as DraftSong[]
        const sData = await sRes.json()
        return (sData?.data ?? sData ?? []) as DraftSong[]
      })
    )
    setGeneratedRows(rows.map((r, i) => dbRowToGeneratedRow(r, songsResults[i] ?? [])))
  }, [id, midiId])

  const updateRow = (rowId: string, patch: Partial<GeneratedRow>) => {
    setGeneratedRows(prev => prev.map(r => r.id === rowId ? { ...r, ...patch } : r))
    // selected_style / original_ratio 변경은 즉시 DB 반영
    const dbPatch: Record<string, unknown> = {}
    if ('selectedStyle' in patch) dbPatch.selected_style = patch.selectedStyle
    if ('originalRatio' in patch) dbPatch.original_ratio = patch.originalRatio
    if (Object.keys(dbPatch).length > 0) {
      fetch(`/api/music-gen/workspaces/${id}/midis/${midiId}/drafts/${rowId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dbPatch),
      }).catch(() => { /* silent */ })
    }
  }

  useEffect(() => {
    loadMidi()
    loadDrafts()
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current)
      if (draftPollRef.current) clearInterval(draftPollRef.current)
    }
  }, [loadMidi, loadDrafts])

  useEffect(() => {
    const hasLoading = generatedRows.some(r =>
      r.loading || r.making ||
      r.songs.some(s => s.status === 'pending' || s.status === 'processing')
    )
    if (hasLoading && !draftPollRef.current) {
      draftPollRef.current = setInterval(async () => {
        if (generatingRef.current) return  // 직접 생성 중엔 덮어쓰기 금지
        const res = await fetch(`/api/music-gen/workspaces/${id}/midis/${midiId}/drafts`)
        const data = await res.json()
        const rows: DbDraftRow[] = data?.data ?? data ?? []
        const songsResults = await Promise.all(
          rows.map(async r => {
            const sRes = await fetch(`/api/music-gen/workspaces/${id}/midis/${midiId}/drafts/${r.id}/songs`)
            if (!sRes.ok) return [] as DraftSong[]
            const sData = await sRes.json()
            return (sData?.data ?? sData ?? []) as DraftSong[]
          })
        )
        setGeneratedRows(prev => rows.map((r, i) => {
          const existing = prev.find(p => p.id === r.id)
          const newRow = dbRowToGeneratedRow(r, songsResults[i] ?? [])
          // 사용자 편집 상태 보존 (lyricsOpen, checked, selectedStyle)
          return {
            ...newRow,
            lyricsOpen: existing?.lyricsOpen ?? false,
            checked: existing?.checked ?? false,
            selectedStyle: existing?.selectedStyle ?? newRow.selectedStyle,
          }
        }))
        const stillLoadingRows = rows.some(r => r.status === 'loading' || r.status === 'making')
        const stillLoadingSongs = songsResults.flat().some(s => s.status === 'pending' || s.status === 'processing')
        if (!stillLoadingRows && !stillLoadingSongs) {
          clearInterval(draftPollRef.current!)
          draftPollRef.current = null
          setGenerating(false)
        }
      }, 5000)
    } else if (!hasLoading && draftPollRef.current) {
      clearInterval(draftPollRef.current)
      draftPollRef.current = null
    }
    return () => {
      if (draftPollRef.current) clearInterval(draftPollRef.current)
    }
  }, [generatedRows, id, midiId])

  if (loading) return (
    <div className="space-y-3">
      <div className="h-5 bg-accent rounded animate-pulse w-32" />
      <div className="h-20 bg-accent rounded-lg animate-pulse" />
    </div>
  )

  if (!midi) return <div className="text-sm text-muted-foreground">MIDI를 찾을 수 없습니다.</div>

  const statusIdx = STATUS_ORDER.indexOf(midi.status)
  const thumbnail = getMidiThumbnail(midi.source_type, midi.source_ref, midi.cover_image)
  const pipeline = getPipeline(midi.source_type)
  const isProcessing = ['converting', 'midi_generating', 'analyzing'].includes(midi.status)
  const isReady = statusIdx >= STATUS_ORDER.indexOf('ready')

  // analysis_json 파싱 → chord_progression 우선, fallback chord_json
  const analysisData = (() => {
    if (!midi.midi_master?.analysis_json) return null
    try { return JSON.parse(midi.midi_master.analysis_json as string) } catch { return null }
  })()

  const chordProgression: string[] | null = analysisData?.chord_progression ?? null

  const chords = (() => {
    if (!midi.midi_master?.chord_json) return null
    if (Array.isArray(midi.midi_master.chord_json)) return midi.midi_master.chord_json
    try { return JSON.parse(midi.midi_master.chord_json as string) } catch { return null }
  })()

  const sourceLabel = midi.source_type === 'youtube_video' ? 'YouTube' : midi.source_type === 'mp3_file' ? 'MP3' : 'MIDI'

  return (
    <div className="space-y-3 w-full">
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>MIDI 삭제</AlertDialogTitle>
            <AlertDialogDescription>이 MIDI를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700 text-white">삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmResetOpen} onOpenChange={setConfirmResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>생성 결과 초기화</AlertDialogTitle>
            <AlertDialogDescription>생성된 {generatedRows.length}곡의 데이터가 모두 삭제됩니다. 이 작업은 되돌릴 수 없습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setGeneratedRows([])
                await fetch(`/api/music-gen/workspaces/${id}/midis/${midiId}/drafts`, { method: 'DELETE' })
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              초기화
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 브레드크럼 */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link href={`/workspaces/${id}`} className="hover:text-foreground transition-colors">워크스페이스</Link>
        <span>›</span>
        <span className="text-foreground truncate max-w-[200px]">{midi.label ?? 'MIDI'}</span>
      </div>

      {/* 메인 카드 */}
      <div className="bg-background border border-border rounded-lg p-4 space-y-3">
        {/* 상단: 썸네일 + 기본 정보 */}
        <div className="flex items-start gap-3">
          {/* 썸네일 */}
          {thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbnail}
              alt={midi.label ?? ''}
              className="w-28 h-[63px] object-cover rounded flex-shrink-0 border border-border"
            />
          ) : (
            <div className="w-28 h-[63px] bg-accent rounded flex-shrink-0 flex items-center justify-center border border-border">
              <svg className="w-6 h-6 text-muted-foreground/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
              </svg>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm text-foreground truncate">{midi.label ?? 'MIDI'}</p>
              <span className="px-1.5 py-0.5 bg-accent text-muted-foreground text-[10px] rounded font-medium flex-shrink-0">
                {sourceLabel}
              </span>
            </div>
            {midi.source_type === 'youtube_video' && midi.source_ref && (
              <a
                href={midi.source_ref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-primary hover:underline truncate block mt-0.5"
              >
                {midi.source_ref}
              </a>
            )}
            {midi.source_type === 'mp3_file' && midi.source_ref && (
              <p className="text-[11px] text-muted-foreground truncate mt-0.5">{midi.source_ref}</p>
            )}
          </div>
        </div>

        {/* 파이프라인 */}
        <div className="flex items-center gap-1 flex-wrap">
          {pipeline.map((step, i) => {
            const stepIdx = STATUS_ORDER.indexOf(step.key)
            const isLastStep = i === pipeline.length - 1
            const isDone = isLastStep ? statusIdx >= stepIdx : statusIdx > stepIdx
            const isActive = !isDone && midi.status === step.key
            return (
              <div key={step.key} className="flex items-center gap-1">
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium transition-colors ${
                  isDone ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                  : isActive ? 'bg-primary/10 text-primary ring-1 ring-primary/20'
                  : 'text-muted-foreground/40'
                }`}>
                  {isDone ? (
                    <span className="flex items-center gap-0.5">
                      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      {step.label}
                    </span>
                  ) : step.label}
                </span>
                {i < pipeline.length - 1 && <span className="text-muted-foreground/20 text-[10px]">›</span>}
              </div>
            )
          })}
          {isProcessing && (
            <svg className="w-3 h-3 text-amber-500 animate-spin ml-1 flex-shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          )}
        </div>


        {/* 다운로드 + 액션 */}
        {isReady && (
          <div className="flex items-center gap-2 flex-wrap">
            {midi.midi_master?.mp3_r2_key && (
              <a
                href={`/api/r2/object/${midi.midi_master.mp3_r2_key}`}
                download
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent/80 text-foreground text-xs rounded-md transition-colors flex-shrink-0"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                chords.mp3
              </a>
            )}
            {midi.audio_url && (
              <a
                href={`/api/r2/object/${midi.audio_url}`}
                download
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent/80 text-foreground text-xs rounded-md transition-colors flex-shrink-0"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                원본 오디오
              </a>
            )}
            <button
              onClick={() => setShowMakePopup(true)}
              className="px-3 py-1.5 bg-primary hover:opacity-90 text-primary-foreground text-xs rounded-md transition-opacity flex-shrink-0"
            >
              음원 만들기
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-3 py-1.5 bg-accent hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 text-xs rounded-md transition-colors disabled:opacity-50 flex-shrink-0"
            >
              {deleting ? '삭제 중...' : '삭제'}
            </button>
          </div>
        )}

        {/* 에러 */}
        {midi.error_message && (
          <div className="p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-600 dark:text-red-400 text-xs">
            {midi.error_message}
          </div>
        )}
      </div>

      {/* 분석 결과 (ready 이상일 때) — 아코디언 */}
      {isReady && midi.midi_master && (
        <div className="bg-background border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => setAnalysisOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors"
          >
            <span className="text-xs font-medium text-muted-foreground">분석 결과</span>
            <svg
              className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ${analysisOpen ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {analysisOpen && (
          <div className="px-4 pb-4 space-y-4">

          {/* BPM + 조성 + 에너지 + 박자 */}
          <div className="flex items-center gap-5 flex-wrap">
            {midi.midi_master.bpm && (
              <div>
                <p className="text-[10px] text-muted-foreground">BPM</p>
                <p className="text-sm font-semibold text-foreground">{Math.round(midi.midi_master.bpm)}</p>
              </div>
            )}
            {midi.midi_master.key_signature && (
              <div>
                <p className="text-[10px] text-muted-foreground">조성</p>
                <p className="text-sm font-semibold text-foreground">{midi.midi_master.key_signature}</p>
              </div>
            )}
            {analysisData?.time_signature && (
              <div>
                <p className="text-[10px] text-muted-foreground">박자</p>
                <p className="text-sm font-semibold text-foreground">{analysisData.time_signature}</p>
              </div>
            )}
            {analysisData?.energy_level && (
              <div>
                <p className="text-[10px] text-muted-foreground">에너지</p>
                <p className="text-sm font-semibold text-foreground">{analysisData.energy_level}<span className="text-muted-foreground font-normal">/10</span></p>
              </div>
            )}
          </div>

          {/* 분위기 */}
          {analysisData?.mood?.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1.5">분위기</p>
              <div className="flex flex-wrap gap-1">
                {analysisData.mood.map((m: string, i: number) => (
                  <span key={i} className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full text-[11px]">{m}</span>
                ))}
              </div>
            </div>
          )}

          {/* 감정 키워드 */}
          {analysisData?.emotional_keywords?.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1.5">감정 키워드</p>
              <div className="flex flex-wrap gap-1">
                {analysisData.emotional_keywords.map((k: string, i: number) => (
                  <span key={i} className="px-2 py-0.5 bg-accent rounded-full text-[11px] text-muted-foreground">{k}</span>
                ))}
              </div>
            </div>
          )}

          {/* 악기 편성 */}
          {analysisData?.instrumentation?.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1.5">악기</p>
              <div className="flex flex-wrap gap-1">
                {analysisData.instrumentation.map((inst: string, i: number) => (
                  <span key={i} className="px-2 py-0.5 bg-accent rounded text-[11px] text-foreground">{inst}</span>
                ))}
              </div>
            </div>
          )}

          {/* 코드 진행 */}
          {chordProgression && chordProgression.length > 0 ? (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1.5">코드 진행</p>
              <div className="flex flex-wrap gap-1">
                {chordProgression.map((chord, i) => (
                  <span key={i} className="px-1.5 py-0.5 bg-accent rounded text-[11px] font-mono text-foreground">{chord}</span>
                ))}
              </div>
              {analysisData?.chord_character && (
                <p className="text-[11px] text-muted-foreground mt-1.5">{analysisData.chord_character}</p>
              )}
            </div>
          ) : Array.isArray(chords) && chords.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1.5">코드 진행</p>
              <div className="flex flex-wrap gap-1">
                {(chords as Array<{ chord?: string; name?: string }>).slice(0, 24).map((c, i) => (
                  <span key={i} className="px-1.5 py-0.5 bg-accent rounded text-[11px] font-mono text-foreground">
                    {c.chord ?? c.name ?? String(c)}
                  </span>
                ))}
                {chords.length > 24 && (
                  <span className="px-1.5 py-0.5 text-[11px] text-muted-foreground">+{chords.length - 24}</span>
                )}
              </div>
            </div>
          )}

          {/* 보컬 추천 */}
          {analysisData?.vocal_recommendation && (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">보컬 추천</p>
              <p className="text-[11px] text-foreground leading-relaxed">{analysisData.vocal_recommendation}</p>
            </div>
          )}

          {/* 곡 구조 */}
          {analysisData?.song_sections?.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1.5">곡 구조 ({analysisData.song_sections.length}섹션)</p>
              <div className="space-y-1">
                {analysisData.song_sections.map((s: { name: string; start_time: number; end_time: number; energy: number; characteristics: string }, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-[11px]">
                    <span className="text-muted-foreground tabular-nums flex-shrink-0 w-24">
                      {String(Math.floor(s.start_time / 60)).padStart(2, '0')}:{String(s.start_time % 60).padStart(2, '0')} ~ {String(Math.floor(s.end_time / 60)).padStart(2, '0')}:{String(s.end_time % 60).padStart(2, '0')}
                    </span>
                    <span className="font-medium text-foreground flex-shrink-0">{s.name}</span>
                    <span className="text-muted-foreground/60">E{s.energy}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          </div>
          )}
        </div>
      )}

      {/* 음원 만들기 팝업 */}
      {showMakePopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setShowMakePopup(false)}
        >
          <div
            className="bg-background border border-border rounded-xl p-6 w-full max-w-sm shadow-xl space-y-4 mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">음원 만들기</p>
              <button onClick={() => setShowMakePopup(false)} className="text-muted-foreground hover:text-foreground text-xs">✕</button>
            </div>

            {/* 곡수 */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-foreground">곡수</label>
                <span className="text-xs text-muted-foreground tabular-nums">{songCount}곡</span>
              </div>
              <input
                type="number"
                min={1}
                max={10}
                value={songCount}
                onChange={e => setSongCount(Math.min(10, Math.max(1, Number(e.target.value))))}
                className="w-full px-3 py-2 text-sm bg-background border border-input rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* MIDI 적용율 */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-foreground">MIDI 적용율</label>
                <span className="text-xs text-muted-foreground tabular-nums">{globalRatio}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={globalRatio}
                onChange={e => setGlobalRatio(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                <span>창작 위주</span>
                <span>원곡 유지</span>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowMakePopup(false)}
                className="flex-1 py-2 bg-accent hover:bg-accent/80 text-foreground text-sm rounded-lg transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleGenerate}
                className="flex-1 py-2 bg-primary hover:opacity-90 text-primary-foreground text-sm rounded-lg transition-opacity font-medium"
              >
                만들기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 생성 결과 그리드 */}
      {generatedRows.length > 0 && (
        <div className="bg-background border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
              {generating ? (
                <>
                  <svg className="w-3 h-3 animate-spin text-primary flex-shrink-0" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  가사 생성 중 — {genProgress.done}/{genProgress.total}곡 완료
                </>
              ) : (
                `생성 결과 (${generatedRows.length}곡)`
              )}
            </p>
            <button
              onClick={() => setConfirmResetOpen(true)}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              초기화
            </button>
          </div>

          {/* 데스크톱 테이블 헤더 (lg 이상) */}
          <div className="hidden lg:grid grid-cols-[28px_80px_1fr_1fr_90px_110px] border-b border-border bg-accent/30">
            <div className="px-2 py-2 flex items-center justify-center">
              <input
                type="checkbox"
                onChange={e => setGeneratedRows(prev => prev.map(r => ({ ...r, checked: e.target.checked })))}
                className="w-3.5 h-3.5 accent-primary"
              />
            </div>
            <div className="px-2 py-2 text-[10px] font-medium text-muted-foreground">배경</div>
            <div className="px-2 py-2 text-[10px] font-medium text-muted-foreground">가사</div>
            <div className="px-2 py-2 text-[10px] font-medium text-muted-foreground">스타일 + 요약</div>
            <div className="px-2 py-2 text-[10px] font-medium text-muted-foreground">적용율</div>
            <div className="px-2 py-2 text-[10px] font-medium text-muted-foreground">만들기</div>
          </div>

          {/* 모바일 전체 선택 (lg 미만) */}
          <div className="lg:hidden px-3 py-2 border-b border-border bg-accent/30 flex items-center gap-2">
            <input
              type="checkbox"
              onChange={e => setGeneratedRows(prev => prev.map(r => ({ ...r, checked: e.target.checked })))}
              className="w-3.5 h-3.5 accent-primary"
            />
            <span className="text-[10px] text-muted-foreground">전체 선택</span>
          </div>

          {/* 행 */}
          {generatedRows.map(row => (
            <div key={row.id} className="border-b border-border last:border-0">

              {/* 데스크톱 행 (lg 이상) */}
              <div className="hidden lg:grid grid-cols-[28px_80px_1fr_1fr_90px_110px] items-start">
                {/* 체크박스 */}
                <div className="px-2 py-3 flex justify-center">
                  <input
                    type="checkbox"
                    checked={row.checked}
                    disabled={row.loading}
                    onChange={e => updateRow(row.id, { checked: e.target.checked })}
                    className="w-3.5 h-3.5 accent-primary"
                  />
                </div>

                {/* 배경이미지 */}
                <div className="px-2 py-2">
                  {row.imageKey ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/r2/object/${row.imageKey}`}
                      alt="배경"
                      className="w-full aspect-video object-cover rounded border border-border"
                    />
                  ) : (
                    <div className="w-full aspect-video bg-accent rounded border border-border flex items-center justify-center">
                      <svg className="w-4 h-4 text-muted-foreground/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
                      </svg>
                    </div>
                  )}
                  {row.loading ? (
                    <div className="h-2.5 bg-accent animate-pulse rounded mt-1.5 w-3/4" />
                  ) : row.title_en ? (
                    <p className="text-[10px] text-muted-foreground mt-1 truncate" title={row.title_jp}>{row.title_en}</p>
                  ) : null}
                </div>

                {/* 가사 */}
                <div className="px-2 py-2">
                  {row.loading ? (
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <svg className="w-3 h-3 animate-spin text-primary flex-shrink-0" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      가사 생성 중...
                    </div>
                  ) : row.error ? (
                    <p className="text-[11px] text-red-500">{row.error}</p>
                  ) : (
                    <>
                      <button
                        onClick={() => updateRow(row.id, { lyricsOpen: !row.lyricsOpen })}
                        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground mb-1"
                      >
                        <svg className={`w-3 h-3 transition-transform ${row.lyricsOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                        {row.lyricsOpen ? '접기' : '펼치기'}
                      </button>
                      {row.lyricsOpen ? (
                        <pre className="text-[10px] text-foreground whitespace-pre-wrap font-sans leading-relaxed max-h-48 overflow-y-auto">{row.lyrics}</pre>
                      ) : (
                        <p className="text-[10px] text-muted-foreground line-clamp-2">{row.lyrics.slice(0, 80)}{row.lyrics.length > 80 ? '...' : ''}</p>
                      )}
                    </>
                  )}
                </div>

                {/* 스타일 + 요약 */}
                <div className="px-2 py-2 space-y-1.5">
                  {row.loading ? (
                    <div className="space-y-1.5">
                      <div className="h-7 bg-accent animate-pulse rounded" />
                      <div className="h-2.5 bg-accent animate-pulse rounded w-full" />
                      <div className="h-2.5 bg-accent animate-pulse rounded w-5/6" />
                    </div>
                  ) : (
                    <>
                      <Combobox
                        options={row.suno_style_prompts}
                        value={row.selectedStyle}
                        onChange={v => updateRow(row.id, { selectedStyle: v })}
                        placeholder="스타일 선택/입력"
                        favorites={styleFavorites}
                        onSaveFavorites={saveFavorites}
                      />
                      {row.narrative && (
                        <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-3">{row.narrative}</p>
                      )}
                    </>
                  )}
                </div>

                {/* 적용율 */}
                <div className="px-2 py-2">
                  {row.loading ? (
                    <div className="space-y-1.5">
                      <div className="h-2.5 bg-accent animate-pulse rounded w-8" />
                      <div className="h-2 bg-accent animate-pulse rounded" />
                    </div>
                  ) : (
                    <>
                      <span className="text-[10px] text-muted-foreground tabular-nums block mb-1">{row.originalRatio}%</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={row.originalRatio}
                        onChange={e => updateRow(row.id, { originalRatio: Number(e.target.value) })}
                        className="w-full accent-primary"
                      />
                    </>
                  )}
                </div>

                {/* 만들기 */}
                <div className="px-2 py-2 space-y-1">
                  {row.loading ? (
                    <div className="space-y-1">
                      <div className="h-6 bg-accent animate-pulse rounded" />
                      <div className="h-6 bg-accent animate-pulse rounded" />
                      <button
                        onClick={async () => {
                          setGeneratedRows(prev => prev.filter(r => r.id !== row.id))
                          await fetch(`/api/music-gen/workspaces/${id}/midis/${midiId}/drafts/${row.id}`, { method: 'DELETE' })
                        }}
                        className="w-full px-2 py-1.5 bg-transparent hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 dark:text-red-400 text-[11px] rounded-md transition-colors"
                      >
                        삭제
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => handleMakeRow(row.id)}
                        disabled={!!row.making || !!row.error}
                        className="w-full px-2 py-1.5 bg-primary hover:opacity-90 disabled:opacity-50 text-primary-foreground text-[11px] rounded-md transition-opacity"
                      >
                        {row.making ? '생성 중...' : row.songs.length > 0 ? '+ mp3 추가' : 'mp3 만들기'}
                      </button>
                      <button
                        onClick={async () => {
                          setGeneratedRows(prev => prev.filter(r => r.id !== row.id))
                          await fetch(`/api/music-gen/workspaces/${id}/midis/${midiId}/drafts/${row.id}`, { method: 'DELETE' })
                        }}
                        className="w-full px-2 py-1.5 bg-transparent hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 dark:text-red-400 text-[11px] rounded-md transition-colors"
                      >
                        삭제
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Songs 목록 (데스크톱 — 행 전체 폭) */}
              {row.songs.length > 0 && (
                <div className="hidden lg:block px-3 pb-3 col-span-6">
                  <DraftSongList
                    songs={row.songs}
                    workspaceId={id}
                    midiId={midiId}
                    draftId={row.id}
                    onSongUpdate={(songId, patch) => handleSongUpdate(row.id, songId, patch)}
                    onSongDelete={songId => handleSongDelete(row.id, songId)}
                  />
                </div>
              )}

              {/* 모바일 카드 뷰 (lg 미만) */}
              <div className="lg:hidden p-3 space-y-3">
                {/* 카드 상단: 체크 + 배경이미지 + 타이틀 */}
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={row.checked}
                    disabled={row.loading}
                    onChange={e => updateRow(row.id, { checked: e.target.checked })}
                    className="w-3.5 h-3.5 accent-primary mt-1 flex-shrink-0"
                  />
                  {row.imageKey ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/r2/object/${row.imageKey}`}
                      alt="배경"
                      className="w-20 aspect-video object-cover rounded border border-border flex-shrink-0"
                    />
                  ) : (
                    <div className="w-20 aspect-video bg-accent rounded border border-border flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-muted-foreground/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
                      </svg>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    {row.loading ? (
                      <div className="space-y-1.5">
                        <div className="h-3 bg-accent animate-pulse rounded w-3/4" />
                        <div className="h-2.5 bg-accent animate-pulse rounded w-1/2" />
                      </div>
                    ) : row.title_en ? (
                      <>
                        <p className="text-xs font-medium text-foreground truncate">{row.title_en}</p>
                        {row.title_jp && <p className="text-[10px] text-muted-foreground truncate">{row.title_jp}</p>}
                      </>
                    ) : null}
                  </div>
                </div>

                {/* 가사 */}
                <div>
                  {row.loading ? (
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <svg className="w-3 h-3 animate-spin text-primary flex-shrink-0" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      가사 생성 중...
                    </div>
                  ) : row.error ? (
                    <p className="text-[11px] text-red-500">{row.error}</p>
                  ) : (
                    <>
                      <button
                        onClick={() => updateRow(row.id, { lyricsOpen: !row.lyricsOpen })}
                        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground mb-1"
                      >
                        <svg className={`w-3 h-3 transition-transform ${row.lyricsOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                        가사 {row.lyricsOpen ? '접기' : '펼치기'}
                      </button>
                      {row.lyricsOpen ? (
                        <pre className="text-[10px] text-foreground whitespace-pre-wrap font-sans leading-relaxed max-h-48 overflow-y-auto">{row.lyrics}</pre>
                      ) : (
                        <p className="text-[10px] text-muted-foreground line-clamp-2">{row.lyrics.slice(0, 80)}{row.lyrics.length > 80 ? '...' : ''}</p>
                      )}
                    </>
                  )}
                </div>

                {/* 스타일 + 요약 */}
                <div className="space-y-1.5">
                  {row.loading ? (
                    <div className="space-y-1.5">
                      <div className="h-7 bg-accent animate-pulse rounded" />
                      <div className="h-2.5 bg-accent animate-pulse rounded w-full" />
                    </div>
                  ) : (
                    <>
                      <Combobox
                        options={row.suno_style_prompts}
                        value={row.selectedStyle}
                        onChange={v => updateRow(row.id, { selectedStyle: v })}
                        placeholder="스타일 선택/입력"
                        favorites={styleFavorites}
                        onSaveFavorites={saveFavorites}
                      />
                      {row.narrative && (
                        <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-3">{row.narrative}</p>
                      )}
                    </>
                  )}
                </div>

                {/* 적용율 */}
                <div>
                  {row.loading ? (
                    <div className="space-y-1.5">
                      <div className="h-2.5 bg-accent animate-pulse rounded w-16" />
                      <div className="h-2 bg-accent animate-pulse rounded" />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">MIDI 적용율 {row.originalRatio}%</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={row.originalRatio}
                        onChange={e => updateRow(row.id, { originalRatio: Number(e.target.value) })}
                        className="flex-1 accent-primary"
                      />
                    </div>
                  )}
                </div>

                {/* 만들기 버튼 */}
                <div className="flex gap-2 flex-wrap">
                  {row.loading ? (
                    <>
                      <div className="flex-1 h-8 bg-accent animate-pulse rounded" />
                      <div className="flex-1 h-8 bg-accent animate-pulse rounded" />
                      <button
                        onClick={async () => {
                          setGeneratedRows(prev => prev.filter(r => r.id !== row.id))
                          await fetch(`/api/music-gen/workspaces/${id}/midis/${midiId}/drafts/${row.id}`, { method: 'DELETE' })
                        }}
                        className="px-3 py-1.5 bg-transparent hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 dark:text-red-400 text-[11px] rounded-md transition-colors"
                      >
                        삭제
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleMakeRow(row.id)}
                        disabled={!!row.making || !!row.error}
                        className="flex-1 px-2 py-2 bg-primary hover:opacity-90 disabled:opacity-50 text-primary-foreground text-[11px] rounded-md transition-opacity"
                      >
                        {row.making ? '생성 중...' : row.songs.length > 0 ? '+ mp3 추가' : 'mp3 만들기'}
                      </button>
                      <button
                        onClick={async () => {
                          setGeneratedRows(prev => prev.filter(r => r.id !== row.id))
                          await fetch(`/api/music-gen/workspaces/${id}/midis/${midiId}/drafts/${row.id}`, { method: 'DELETE' })
                        }}
                        className="px-3 py-2 bg-transparent hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 dark:text-red-400 text-[11px] rounded-md transition-colors"
                      >
                        삭제
                      </button>
                    </>
                  )}
                </div>

                {/* Songs 목록 (모바일) */}
                {row.songs.length > 0 && (
                  <DraftSongList
                    songs={row.songs}
                    workspaceId={id}
                    midiId={midiId}
                    draftId={row.id}
                    onSongUpdate={(songId, patch) => handleSongUpdate(row.id, songId, patch)}
                    onSongDelete={songId => handleSongDelete(row.id, songId)}
                  />
                )}
              </div>

            </div>
          ))}
        </div>
      )}

      {/* ready 이전 — 삭제만 */}
      {!isReady && (
        <div className="flex">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-4 py-2 bg-background border border-red-300 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg transition-colors disabled:opacity-50"
          >
            {deleting ? '삭제 중...' : '삭제'}
          </button>
        </div>
      )}
    </div>
  )
}
