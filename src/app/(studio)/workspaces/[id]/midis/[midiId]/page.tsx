'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAudioPlayer, type AudioTrack } from '@/components/AudioPlayerProvider'
import Link from 'next/link'
import { getMidiThumbnail } from '@/lib/youtube-utils'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Combobox } from '@/components/ui/combobox'
import { useSunoAccount } from '@/components/SunoAccountProvider'

interface MidiDetail {
  id: string
  label: string | null
  source_type: string
  source_ref: string | null
  cover_image?: string | null
  audio_url?: string | null
  suno_cover_clip_id?: string | null
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
  original_ratio: number | null
  rating: number  // 0~5 별점
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
  vocalGender: 'f' | 'm' | ''
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
  vocal_gender: string | null
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
    selectedStyle: r.selected_style || prompts[0] || '',
    originalRatio: r.original_ratio,
    imageKey: r.image_key,
    lyricsOpen: false,
    checked: false,
    loading: r.status === 'loading',
    making: r.status === 'making',
    error: (r.status === 'done' || r.status === 'ready' || r.status === 'making') ? undefined : (r.error_msg ?? undefined),
    madeTitle: r.made_title ?? undefined,
    madeTitleVideo: r.made_title_video ?? undefined,
    vocalGender: (r.vocal_gender as 'f' | 'm' | '') || '',
    songs,
  }
}

function WaveformBar({ audioUrl, isDone }: { audioUrl: string | null; isDone: boolean }) {
  const [bars, setBars] = useState<number[] | null>(null)
  const fetched = useRef(false)

  useEffect(() => {
    if (!isDone || !audioUrl || fetched.current) return
    fetched.current = true
    fetch(audioUrl)
      .then(r => r.arrayBuffer())
      .then(buf => new AudioContext().decodeAudioData(buf))
      .then(decoded => {
        const raw = decoded.getChannelData(0)
        const barCount = 80
        const step = Math.floor(raw.length / barCount)
        const sampled = Array.from({ length: barCount }, (_, i) => {
          let sum = 0
          for (let j = 0; j < step; j++) sum += Math.abs(raw[i * step + j] ?? 0)
          return sum / step
        })
        const max = Math.max(...sampled, 0.001)
        setBars(sampled.map(v => v / max))
      })
      .catch(() => { setBars([]) })
  }, [isDone, audioUrl])

  if (!isDone || bars === null) {
    return <div className="flex flex-1 min-w-[80px] max-w-[250px] h-8 flex-shrink bg-accent/30 rounded items-center justify-center">
      {isDone ? <span className="text-[9px] text-muted-foreground">waveform 로딩...</span> : null}
    </div>
  }

  if (bars.length === 0) {
    return <div className="flex-1 min-w-[80px] max-w-[250px] h-8 flex-shrink bg-accent/20 rounded" />
  }

  return (
    <div className="flex flex-1 min-w-[80px] max-w-[250px] h-8 flex-shrink items-end gap-px rounded overflow-hidden bg-accent/20 px-0.5">
      {bars.map((v, i) => (
        <div
          key={i}
          className="flex-1 bg-primary/60 rounded-t-sm min-h-[1px]"
          style={{ height: `${Math.max(v * 100, 4)}%` }}
        />
      ))}
    </div>
  )
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

  const [songDeleteTarget, setSongDeleteTarget] = useState<string | null>(null)

  const setRating = async (song: DraftSong, value: number) => {
    const newRating = song.rating === value ? 0 : value  // 같은 별 클릭 시 해제
    onSongUpdate(song.id, { rating: newRating })
    await fetch(`${basePath}/${song.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: newRating }),
    }).catch(() => {})
  }

  const handleSongDeleteClick = (song: DraftSong) => {
    if (song.suno_id || song.audio_url) {
      setSongDeleteTarget(song.id)
      return
    }
    executeSongDelete(song.id)
  }

  const executeSongDelete = async (songId: string) => {
    setSongDeleteTarget(null)
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
        const confirmed = song.is_confirmed === 1

        return (
          <div key={song.id} className={`px-3 py-2 bg-background hover:bg-accent/30 transition-colors ${confirmed ? 'ring-1 ring-inset ring-green-400/40' : ''}`}>
            {/* 상단: 체크박스 + 이미지 + 제목 + 버튼 */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={isLoading || isFailed}
                onChange={() => toggleConfirm(song)}
                className="w-4 h-4 accent-primary flex-shrink-0"
              />

              {song.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={song.image_url}
                  alt={label}
                  className="w-10 h-10 object-cover rounded flex-shrink-0 border border-border"
                />
              ) : (
                <div className="w-10 h-10 bg-accent rounded flex-shrink-0 border border-border flex items-center justify-center">
                  <svg className="w-4 h-4 text-muted-foreground/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
                  </svg>
                </div>
              )}

              <div className="flex-1 min-w-0">
                {isLoading ? (
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <svg className="w-3 h-3 animate-spin text-primary flex-shrink-0" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    {song.title ? <span className="text-foreground font-medium truncate block">{song.title}</span> : `${label} 생성 중...`}
                  </div>
                ) : isFailed ? (
                  <p className="text-[11px] text-red-500 truncate">{song.error_msg || `${label} 실패`}</p>
                ) : (
                  <div>
                    <p className="text-[11px] font-medium text-foreground truncate">{song.title || label}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {song.duration != null && `${Math.floor(song.duration / 60)}:${String(Math.round(song.duration % 60)).padStart(2, '0')}`}
                      {song.duration != null && song.original_ratio != null && ' · '}
                      {song.original_ratio != null && `${song.original_ratio}%`}
                    </p>
                  </div>
                )}
              </div>

              {/* Waveform — 데스크탑 인라인 (재생버튼 왼쪽) */}
              {isDone && (
                <div className="hidden sm:block w-[200px] flex-shrink-0">
                  <WaveformBar audioUrl={song.audio_url} isDone={isDone} />
                </div>
              )}

              {isDone && song.audio_url ? (
                <SongPlayButton song={song} label={song.title || label} />
              ) : (
                <div style={{ width: '40px' }} className="flex-shrink-0" />
              )}

              {/* 별점 — 데스크탑 */}
              {isDone && (
                <div className="hidden sm:flex items-center gap-0 flex-shrink-0">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      onClick={() => setRating(song, star)}
                      className="p-0 w-5 h-5 flex items-center justify-center hover:scale-125 transition-transform"
                      title={`${star}점`}
                    >
                      <svg className={`w-3.5 h-3.5 ${star <= (song.rating || 0) ? 'text-yellow-400' : 'text-muted-foreground/40'}`} viewBox="0 0 20 20" fill={star <= (song.rating || 0) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.5}>
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    </button>
                  ))}
                </div>
              )}

              <button
                onClick={() => toggleConfirm(song)}
                disabled={isLoading || isFailed}
                className={`hidden sm:inline-flex px-2 py-1 text-[11px] font-medium rounded border transition-colors flex-shrink-0 ${
                  confirmed
                    ? 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-400/40 hover:bg-green-500/20'
                    : 'bg-background text-muted-foreground border-border hover:bg-accent hover:text-foreground'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
                title="확정 (영상 만들기 대상)"
              >
                {confirmed ? '확정됨' : '확정'}
              </button>

              <button
                onClick={() => handleSongDeleteClick(song)}
                className="p-1 text-muted-foreground hover:text-red-500 transition-colors flex-shrink-0"
                title="삭제"
              >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
            </div>

            {/* 하단: Waveform — 모바일만 */}
            {isDone && (
              <div className="mt-1.5 ml-8 sm:hidden">
                <WaveformBar audioUrl={song.audio_url} isDone={isDone} />
              </div>
            )}
          </div>
        )
      })}

      {/* Song 삭제 확인 (suno_id 또는 audio 존재 시) */}
      <AlertDialog open={!!songDeleteTarget} onOpenChange={open => { if (!open) setSongDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cover곡 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              생성된 Cover곡을 삭제합니다. 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => songDeleteTarget && executeSongDelete(songDeleteTarget)}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** 썸네일 클릭 → YouTube 인라인 재생 */
function ThumbnailPlayer({ thumbnail, sourceType, sourceRef, label }: {
  thumbnail: string | null
  sourceType: string
  sourceRef: string | null
  label: string | null
}) {
  const [playing, setPlaying] = useState(false)
  const videoId = sourceType === 'youtube_video' && sourceRef
    ? sourceRef.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1] ?? null
    : null

  if (playing && videoId) {
    return (
      <div className="w-28 h-[63px] rounded flex-shrink-0 border border-border overflow-hidden relative">
        <iframe
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
          title="YouTube"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="w-full h-full"
        />
      </div>
    )
  }

  return (
    <button
      onClick={() => videoId && setPlaying(true)}
      className="w-28 h-[63px] rounded flex-shrink-0 border border-border overflow-hidden relative group"
      title={videoId ? '클릭하여 재생' : undefined}
    >
      {thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbnail} alt={label ?? ''} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full bg-accent flex items-center justify-center">
          <svg className="w-6 h-6 text-muted-foreground/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
          </svg>
        </div>
      )}
      {videoId && (
        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <svg className="w-6 h-6 text-white drop-shadow" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      )}
    </button>
  )
}

/** 커스텀 미니 오디오 플레이어 — 플레이 버튼 + 시간만, 글로벌 플레이리스트 분리 */
function LocalAudioPlayer({ src, label }: { src: string; label: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)

  const toggle = () => {
    const el = audioRef.current
    if (!el) return
    if (el.paused) { el.play().catch(() => {}) } else { el.pause() }
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        data-no-bridge
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={e => setTime((e.target as HTMLAudioElement).currentTime)}
      />
      <span className="text-[11px] font-medium text-foreground">{label}</span>
      <button
        onClick={toggle}
        className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
          playing ? 'bg-primary text-primary-foreground' : 'bg-accent text-foreground hover:bg-accent/80'
        }`}
      >
        {playing ? (
          <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
        ) : (
          <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        )}
      </button>
      <span className="text-[10px] text-muted-foreground tabular-nums">{fmt(time)}</span>
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
  const { refreshCredits } = useSunoAccount()
  const [midi, setMidi] = useState<MidiDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [confirmResetOpen, setConfirmResetOpen] = useState(false)
  const [draftDeleteTarget, setDraftDeleteTarget] = useState<string | null>(null)

  const [analysisOpen, setAnalysisOpen] = useState(false)


  // Cover곡 만들기 팝업 상태 (localStorage 복원)
  const [showMakePopup, setShowMakePopup] = useState(false)
  const [songCount, setSongCount] = useState<number>(() => Number(typeof window !== 'undefined' && localStorage.getItem('mk_songCount')) || 3)
  const [globalRatio, setGlobalRatio] = useState<number>(() => Number(typeof window !== 'undefined' && localStorage.getItem('mk_ratio')) || 70)
  const [globalStyleWeight, setGlobalStyleWeight] = useState<number>(() => Number(typeof window !== 'undefined' && localStorage.getItem('mk_styleWeight')) || 50)
  const [globalWeirdness, setGlobalWeirdness] = useState<number>(() => Number(typeof window !== 'undefined' && localStorage.getItem('mk_weirdness')) || 50)
  const [globalVocalGender, setGlobalVocalGender] = useState<'f' | 'm' | ''>(() => (typeof window !== 'undefined' ? (localStorage.getItem('mk_vocalGender') as 'f' | 'm' | '') : '') ?? '')
  const [globalInjectionType, setGlobalInjectionType] = useState<'A' | 'B' | 'C'>(() => (typeof window !== 'undefined' ? (localStorage.getItem('mk_injectionType') as 'A' | 'B' | 'C') : null) ?? 'A')
  const [globalLyricLang, setGlobalLyricLang] = useState<'en' | 'ja' | 'ko' | 'zh' | 'inst' | null>(() => (typeof window !== 'undefined' ? (localStorage.getItem('mk_lyricLang') as 'en' | 'ja' | 'ko' | 'zh' | 'inst' | null) : null) ?? 'inst')
  const [globalLyricTrans, setGlobalLyricTrans] = useState<'en' | 'ja' | 'ko' | 'zh' | 'none'>(() => (typeof window !== 'undefined' ? (localStorage.getItem('mk_lyricTrans') as 'en' | 'ja' | 'ko' | 'zh' | 'none') : null) ?? 'none')

  // 팝업 설정값 localStorage 저장
  useEffect(() => { localStorage.setItem('mk_songCount', String(songCount)) }, [songCount])
  useEffect(() => { localStorage.setItem('mk_ratio', String(globalRatio)) }, [globalRatio])
  useEffect(() => { localStorage.setItem('mk_styleWeight', String(globalStyleWeight)) }, [globalStyleWeight])
  useEffect(() => { localStorage.setItem('mk_weirdness', String(globalWeirdness)) }, [globalWeirdness])
  useEffect(() => { localStorage.setItem('mk_vocalGender', globalVocalGender) }, [globalVocalGender])
  useEffect(() => { localStorage.setItem('mk_injectionType', globalInjectionType) }, [globalInjectionType])
  useEffect(() => { if (globalLyricLang !== null) localStorage.setItem('mk_lyricLang', globalLyricLang); else localStorage.removeItem('mk_lyricLang') }, [globalLyricLang])
  useEffect(() => { localStorage.setItem('mk_lyricTrans', globalLyricTrans) }, [globalLyricTrans])

  // N곡 생성 상태
  const [generating, setGenerating] = useState(false)
  const [genProgress, setGenProgress] = useState({ done: 0, total: 0 })
  const [generatedRows, setGeneratedRows] = useState<GeneratedRow[]>([])

  // 수노 스타일 즐겨찾기 (추후 DB 연동 예정 — 현재는 세션 메모리만)
  const [styleFavorites, setStyleFavorites] = useState<string[]>([])
  const saveFavorites = (newFavorites: string[]) => {
    setStyleFavorites(newFavorites)
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

    // Queue Board에 변환 진행 표시용 job enqueue
    let variantJobId: string | null = null
    try {
      const enqRes = await fetch('/api/music-gen/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'draft.variants',
          payload: { midiId, workspaceId: id, songCount },
          max_attempts: 1,
          // idempotency_key를 매번 고유하게 → 반복 생성 시 기존 done job 반환 방지
          idempotency_key: `draft.variants-${midiId}-${Date.now()}`,
          // scheduled_at을 1시간 미래로 설정 → Python worker가 pick하지 않음
          // 클라이언트가 완료 시 직접 PATCH /api/music-gen/jobs/[id]로 ack 처리
          scheduled_at: Date.now() + 3_600_000,
        }),
      })
      if (enqRes.ok) {
        const enqData = await enqRes.json()
        variantJobId = enqData?.id ?? null
      } else {
        console.warn('[draft.variants enqueue] 실패:', enqRes.status)
      }
    } catch (e) {
      console.warn('[draft.variants enqueue] 네트워크 오류:', e)
    }

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
      vocalGender: globalVocalGender,
      songs: [],
    }))

    // DB에 skeleton N개 일괄 INSERT
    try {
      const insertRes = await fetch(`/api/music-gen/workspaces/${id}/midis/${midiId}/drafts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: skeletonRows.map((r, i) => ({
            id: r.id,
            imageKey: r.imageKey,
            originalRatio: r.originalRatio,
            vocalGender: r.vocalGender || null,
            sortOrder: i,
          })),
        }),
      })
      if (!insertRes.ok) console.warn('[drafts INSERT] 실패:', insertRes.status)
    } catch (e) {
      console.warn('[drafts INSERT] 네트워크 오류:', e)
    }

    setGeneratedRows(prev => [...prev, ...skeletonRows])
    setGenProgress({ done: 0, total: songCount })

    // 각 row에 대해 variants API 순차 호출 (곡당 2.5초 딜레이)
    for (let idx = 0; idx < skeletonRows.length; idx++) {
      if (idx > 0) await new Promise(resolve => setTimeout(resolve, 2500))
      const r = skeletonRows[idx]
      const i = idx
      await (async () => {
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
      })()
    }

    generatingRef.current = false
    setGenerating(false)

    // 생성 완료 후 DB에서 전체 리로드 (프론트 state 타이밍 이슈 해소)
    await loadDrafts()

    // Queue Board job ack
    if (variantJobId) {
      fetch(`/api/music-gen/jobs/${variantJobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      }).catch(() => {})
    }
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
    setGeneratedRows(prev => prev.map(r => r.id === rowId ? { ...r, making: true, error: undefined } : r))
    // DB에 'making' 즉시 반영 (await — 에러 PATCH와 순서 충돌 방지)
    await fetch(`/api/music-gen/workspaces/${id}/midis/${midiId}/drafts/${rowId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'making', error_msg: null }),
    }).catch(() => {})
    try {
      // clip_id 없으면 자동 업로드
      if (!midi?.suno_cover_clip_id) {
        const uploadRes = await fetch(`/api/music-gen/workspaces/${id}/midis/${midiId}/suno-upload`, {
          method: 'POST',
        })
        const uploadData = await uploadRes.json()
        if (!uploadRes.ok) throw new Error(uploadData.error?.message ?? 'Suno 업로드 실패')
        const clipId: string = uploadData?.data?.clip_id ?? uploadData?.clip_id
        setMidi(prev => prev ? { ...prev, suno_cover_clip_id: clipId } as MidiDetail : prev)
      }

      const res = await fetch(
        `/api/music-gen/workspaces/${id}/midis/${midiId}/drafts/${rowId}/songs`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ style_used: row.selectedStyle, original_ratio: row.originalRatio, style_weight: globalStyleWeight, weirdness: globalWeirdness, vocal_gender: row.vocalGender || null }),
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
      // 노래 큐잉 성공 — DB를 'done'으로 업데이트 (새로고침 시 making 유지 방지)
      await fetch(`/api/music-gen/workspaces/${id}/midis/${midiId}/drafts/${rowId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done', error_msg: null }),
      }).catch(() => {})
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : '실패'
      setGeneratedRows(prev => prev.map(r =>
        r.id === rowId ? { ...r, making: false, error: errorMsg } : r
      ))
      // DB를 'error'로 업데이트 (새로고침 시 making 유지 방지)
      await fetch(`/api/music-gen/workspaces/${id}/midis/${midiId}/drafts/${rowId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'error', error_msg: errorMsg }),
      }).catch(() => {})
    }
  }

  const handleSongUpdate = (draftRowId: string, songId: string, patch: Partial<DraftSong>) => {
    setGeneratedRows(prev => prev.map(r =>
      r.id === draftRowId
        ? { ...r, songs: r.songs.map(s => s.id === songId ? { ...s, ...patch } : s) }
        : r
    ))
  }

  const handleDraftDelete = (rowId: string) => {
    const row = generatedRows.find(r => r.id === rowId)
    if (row && row.songs.length > 0) {
      setDraftDeleteTarget(rowId)
      return
    }
    executeDraftDelete(rowId)
  }

  const executeDraftDelete = async (rowId: string) => {
    setDraftDeleteTarget(null)
    setGeneratedRows(prev => prev.filter(r => r.id !== rowId))
    await fetch(`/api/music-gen/workspaces/${id}/midis/${midiId}/drafts/${rowId}`, { method: 'DELETE' })
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
    if ('vocalGender' in patch) dbPatch.vocal_gender = patch.vocalGender || null
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
        if (!res.ok) return  // API 오류 시 state 보존
        const data = await res.json()
        const rows: DbDraftRow[] = data?.data ?? data ?? []
        if (rows.length === 0) return  // 빈 응답 시 state 보존
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
          // making: DB가 'making'이어도 로컬에 에러가 있으면 false 유지 (race condition 방지)
          return {
            ...newRow,
            lyricsOpen: existing?.lyricsOpen ?? false,
            checked: existing?.checked ?? false,
            selectedStyle: existing?.selectedStyle ?? newRow.selectedStyle,
            making: newRow.making && !existing?.error,
            error: newRow.error,
          }
        }))
        const stillLoadingRows = rows.some(r => r.status === 'loading' || r.status === 'making')
        const stillLoadingSongs = songsResults.flat().some(s => s.status === 'pending' || s.status === 'processing')
        if (!stillLoadingRows && !stillLoadingSongs) {
          clearInterval(draftPollRef.current!)
          draftPollRef.current = null
          setGenerating(false)
          // 곡 완성 → Suno 크레딧 강제 갱신
          refreshCredits(true)
        }
      }, 5000)
    } else if (!hasLoading && draftPollRef.current) {
      clearInterval(draftPollRef.current)
      draftPollRef.current = null
    }
    return () => {
      if (draftPollRef.current) {
        clearInterval(draftPollRef.current)
        draftPollRef.current = null
      }
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
    <div className="space-y-0 w-full">
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

      {/* Draft 삭제 확인 (하위 mp3 존재 시) */}
      <AlertDialog open={!!draftDeleteTarget} onOpenChange={open => { if (!open) setDraftDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>가사 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              하위에 생성된 mp3가 {generatedRows.find(r => r.id === draftDeleteTarget)?.songs.length ?? 0}곡 있습니다. 모두 삭제됩니다. 계속하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => draftDeleteTarget && executeDraftDelete(draftDeleteTarget)}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 브레드크럼 */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link href={`/workspaces/${id}`} className="hover:text-foreground transition-colors">워크스페이스</Link>
        <span>›</span>
        <span className="text-foreground">{midi.label ?? 'MIDI'}</span>
      </div>

      {/* 메인 카드 */}
      <div className="bg-background border border-border rounded-lg p-4 space-y-3">
        {/* 상단: 썸네일 + 기본 정보 + 파이프라인 (우측) */}
        <div className="flex flex-col sm:flex-row sm:items-start gap-3">
          {/* 썸네일 + 정보 (모바일에서도 한 줄 유지) */}
          <div className="flex items-start gap-3 flex-1 min-w-0">
          {/* 썸네일 / YouTube 인라인 플레이어 */}
          <ThumbnailPlayer
            thumbnail={thumbnail}
            sourceType={midi.source_type}
            sourceRef={midi.source_ref}
            label={midi.label}
          />
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
            {/* 오디오 플레이어 (YouTube 링크 아래) */}
            {isReady && (
              <div className="flex items-center gap-3 mt-1.5">
                {midi.midi_master?.mp3_r2_key && !midi.midi_master.mp3_r2_key.startsWith('/') && (
                  <LocalAudioPlayer
                    src={`/api/r2/object/${midi.midi_master.mp3_r2_key}`}
                    label="MIDI"
                  />
                )}
                {midi.audio_url && !midi.audio_url.startsWith('data/') && (
                  <LocalAudioPlayer
                    src={midi.audio_url.startsWith('/') ? midi.audio_url : `/api/r2/object/${midi.audio_url}`}
                    label="원본"
                  />
                )}
              </div>
            )}
          </div>
          </div>{/* 썸네일 + 정보 끝 */}

          {/* 파이프라인 */}
          <div className="flex items-center gap-1 flex-shrink-0 flex-wrap">
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
        </div>

        {/* 액션 버튼 */}
        {isReady && (
          <div className="flex items-center gap-2 flex-wrap">
            {midi.midi_master?.mp3_r2_key && !midi.midi_master.mp3_r2_key.startsWith('/') && (
              <a
                href={`/api/r2/object/${midi.midi_master.mp3_r2_key}`}
                download="chords.mp3"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent/80 text-foreground text-xs rounded-md transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                MIDI
              </a>
            )}
            {midi.audio_url && !midi.audio_url.startsWith('/') && !midi.audio_url.startsWith('data/') && (
              <a
                href={`/api/r2/object/${midi.audio_url}`}
                download="source.mp3"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent/80 text-foreground text-xs rounded-md transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                원본
              </a>
            )}
            <button
              onClick={() => setShowMakePopup(true)}
              className="px-3 py-1.5 bg-primary hover:opacity-90 text-primary-foreground text-xs rounded-md transition-opacity"
            >
              Cover곡 만들기
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="ml-auto px-3 py-1.5 bg-accent hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 text-xs rounded-md transition-colors disabled:opacity-50"
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
                    <span className="text-muted-foreground tabular-nums flex-shrink-0 w-28">
                      {String(Math.floor(s.start_time / 60)).padStart(2, '0')}:{String(Math.floor(s.start_time % 60)).padStart(2, '0')} ~ {String(Math.floor(s.end_time / 60)).padStart(2, '0')}:{String(Math.floor(s.end_time % 60)).padStart(2, '0')}
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

      {/* Cover곡 만들기 팝업 */}
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
              <p className="text-sm font-semibold text-foreground">Cover곡 만들기</p>
              <button onClick={() => setShowMakePopup(false)} className="text-muted-foreground hover:text-foreground text-xs">✕</button>
            </div>

            {/* Injection 타입 */}
            <div>
              <label className="text-xs font-medium text-foreground mb-1.5 block">Injection 타입</label>
              <div className="flex gap-1">
                {([
                  ['A', 'A  기본/코드+채널', 'green'],
                  ['B', 'B  원음+채널', 'orange'],
                  ['C', 'C  원음+공통스타일', 'red'],
                ] as const).map(([val, label, color]) => {
                  const colors = {
                    green: globalInjectionType === val
                      ? 'bg-green-600 text-white border-green-600'
                      : 'bg-background text-green-600 border-green-500/40 hover:border-green-500',
                    orange: globalInjectionType === val
                      ? 'bg-orange-500 text-white border-orange-500'
                      : 'bg-background text-orange-500 border-orange-400/40 hover:border-orange-400',
                    red: globalInjectionType === val
                      ? 'bg-red-500 text-white border-red-500'
                      : 'bg-background text-red-500 border-red-400/40 hover:border-red-400',
                  }
                  return (
                    <button key={val} type="button" onClick={() => setGlobalInjectionType(val)}
                      className={`px-2 py-1.5 text-[11px] rounded-md border transition-colors ${colors[color]}`}>
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 곡수 + 보컬 — 한 줄 */}
            <div className="flex gap-3 items-end">
              <div className="flex-1 min-w-[80px]">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-foreground">곡수</label>
                  <span className="text-xs text-muted-foreground tabular-nums">{songCount}곡</span>
                </div>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={songCount}
                  onChange={e => setSongCount(Math.min(30, Math.max(1, Number(e.target.value))))}
                  className="w-full px-3 py-2 text-sm bg-background border border-input rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium text-foreground mb-1.5 block">보컬</label>
                <div className="flex gap-1">
                  {([['', '자동'], ['f', '여성'], ['m', '남성']] as const).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setGlobalVocalGender(val as 'f' | 'm' | '')}
                      className={`px-2 py-1.5 text-xs rounded-md border transition-colors ${
                        globalVocalGender === val
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-muted-foreground border-input hover:border-foreground/30'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 가사 언어 */}
            <div>
              <label className="text-xs font-medium text-foreground mb-1.5 block">가사 언어</label>
              <div className="flex flex-wrap gap-1">
                {([['en', '영어'], ['ja', '일본어(한자+독음)'], ['ko', '한국어'], ['zh', '중국어'], ['inst', 'Inst.']] as const).map(([val, label]) => (
                  <button key={val} type="button" onClick={() => {
                    setGlobalLyricLang(val)
                    if (val === 'inst') {
                      setGlobalLyricTrans('none')
                    } else if (globalLyricLang === null || globalLyricTrans === val) {
                      setGlobalLyricTrans('none')
                    }
                  }}
                    className={`px-2 py-1.5 text-[11px] rounded-md border transition-colors ${
                      globalLyricLang === val
                        ? val === 'inst' ? 'bg-red-500 text-white border-red-500' : 'bg-primary text-primary-foreground border-primary'
                        : val === 'inst' ? 'bg-background text-red-500 border-red-400/40 hover:border-red-400' : 'bg-background text-muted-foreground border-input hover:border-foreground/30'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* 가사 번역 */}
            <div>
              <label className={`text-xs font-medium mb-1.5 block ${!globalLyricLang || globalLyricLang === 'inst' ? 'text-muted-foreground/40' : 'text-foreground'}`}>가사 번역</label>
              <div className="flex flex-wrap gap-1">
                {([['en', '영어'], ['ja', '일본어'], ['ko', '한국어'], ['zh', '중국어'], ['none', '없음']] as const).map(([val, label]) => {
                  const transDisabled = !globalLyricLang || globalLyricLang === 'inst'
                  const sameLang = val !== 'none' && val === globalLyricLang
                  const isDisabled = transDisabled || sameLang
                  return (
                    <button key={val} type="button"
                      disabled={isDisabled}
                      onClick={() => setGlobalLyricTrans(val)}
                      className={`px-2 py-1.5 text-[11px] rounded-md border transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                        !isDisabled && globalLyricTrans === val
                          ? val === 'none' ? 'bg-red-500 text-white border-red-500' : 'bg-primary text-primary-foreground border-primary'
                          : val === 'none' ? 'bg-background text-red-500 border-red-400/40 hover:border-red-400' : 'bg-background text-muted-foreground border-input hover:border-foreground/30'
                      }`}>
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 독창성 · 스타일 반영 · 원곡적용률 — 한 줄 */}
            <div className="flex gap-3">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-medium text-foreground">독창성</label>
                  <span className="text-[11px] text-muted-foreground tabular-nums">{globalWeirdness}%</span>
                </div>
                <input type="range" min={0} max={100} value={globalWeirdness} onChange={e => setGlobalWeirdness(Number(e.target.value))} className="w-full accent-primary" />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                  <span>안정적</span><span>실험적</span>
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-medium text-foreground">스타일 반영</label>
                  <span className="text-[11px] text-muted-foreground tabular-nums">{globalStyleWeight}%</span>
                </div>
                <input type="range" min={0} max={100} value={globalStyleWeight} onChange={e => setGlobalStyleWeight(Number(e.target.value))} className="w-full accent-primary" />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                  <span>자유롭게</span><span>태그 충실</span>
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-medium text-foreground">원곡적용률</label>
                  <span className="text-[11px] text-muted-foreground tabular-nums">{globalRatio}%</span>
                </div>
                <input type="range" min={0} max={100} value={globalRatio} onChange={e => setGlobalRatio(Number(e.target.value))} className="w-full accent-primary" />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                  <span>창작 위주</span><span>원곡 유지</span>
                </div>
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
        <div className="bg-background border border-border rounded-lg">
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
          <div className="hidden lg:grid grid-cols-[28px_120px_0.7fr_0.8fr_120px_130px] border-b border-border bg-accent/30">
            <div className="px-2 py-2 flex items-center justify-center">
              <input
                type="checkbox"
                onChange={e => setGeneratedRows(prev => prev.map(r => ({ ...r, checked: e.target.checked })))}
                className="w-3.5 h-3.5 accent-primary"
              />
            </div>
            <div className="px-2 py-2 text-[10px] font-medium text-muted-foreground">제목</div>
            <div className="px-2 py-2 text-[10px] font-medium text-muted-foreground">가사</div>
            <div className="px-2 py-2 text-[10px] font-medium text-muted-foreground">스타일 + 요약</div>
            <div className="px-2 py-2 text-[10px] font-medium text-muted-foreground">원곡적용률</div>
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
              <div className="hidden lg:grid grid-cols-[28px_120px_0.7fr_0.8fr_120px_130px] items-start">
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

                {/* 제목 */}
                <div className="px-2 py-2">
                  {row.loading ? (
                    <div className="h-2.5 bg-accent animate-pulse rounded w-3/4" />
                  ) : (
                    <>
                      {row.title_en && <p className="text-[11px] font-medium text-foreground break-words leading-tight">{row.title_en}</p>}
                      {row.title_jp && <p className="text-[10px] text-muted-foreground break-words leading-tight mt-0.5">{row.title_jp}</p>}
                    </>
                  )}
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
                  ) : (
                    <>
                      {row.error && (
                        <p className="text-[11px] text-red-500 mb-1">{row.error}</p>
                      )}
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
                        key={`${row.id}-${row.selectedStyle}`}
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

                {/* 원곡적용률 + 성별 */}
                <div className="px-2 py-2">
                  {row.loading ? (
                    <div className="space-y-1.5">
                      <div className="h-2.5 bg-accent animate-pulse rounded w-8" />
                      <div className="h-2 bg-accent animate-pulse rounded" />
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground tabular-nums flex-shrink-0">{row.originalRatio}%</span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={row.originalRatio}
                          onChange={e => updateRow(row.id, { originalRatio: Number(e.target.value) })}
                          className="w-16 accent-primary"
                        />
                      </div>
                      <div className="flex gap-1">
                        {([['', 'A'], ['m', 'M'], ['f', 'F']] as const).map(([val, label]) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => updateRow(row.id, { vocalGender: val as 'f' | 'm' | '' })}
                            className={`px-2 py-0.5 text-[9px] rounded border transition-colors ${
                              row.vocalGender === val
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-background text-muted-foreground border-input hover:border-foreground/30'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 만들기 */}
                <div className="px-2 py-2 space-y-1">
                  {row.loading ? (
                    <div className="space-y-1">
                      <div className="h-6 bg-accent animate-pulse rounded" />
                      <div className="h-6 bg-accent animate-pulse rounded" />
                      <button
                        onClick={() => handleDraftDelete(row.id)}
                        className="w-full px-2 py-1.5 bg-transparent hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 dark:text-red-400 text-[11px] rounded-md transition-colors"
                      >
                        삭제
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => handleMakeRow(row.id)}
                        disabled={!!row.making}
                        className="w-full px-2 py-1.5 bg-primary hover:opacity-90 disabled:opacity-50 text-primary-foreground text-[11px] rounded-md transition-opacity"
                      >
                        {row.making ? '생성 중...' : row.songs.length > 0 ? '+ Cover곡 추가' : 'Cover곡 만들기'}
                      </button>
                      <button
                        onClick={() => handleDraftDelete(row.id)}
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
                  <div className="flex-1 min-w-0">
                    {row.loading ? (
                      <div className="space-y-1.5">
                        <div className="h-3 bg-accent animate-pulse rounded w-3/4" />
                        <div className="h-2.5 bg-accent animate-pulse rounded w-1/2" />
                      </div>
                    ) : row.title_en ? (
                      <>
                        <p className="text-xs font-medium text-foreground break-words leading-tight">{row.title_en}</p>
                        {row.title_jp && <p className="text-[10px] text-muted-foreground break-words leading-tight">{row.title_jp}</p>}
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
                  ) : (
                    <>
                      {row.error && (
                        <p className="text-[11px] text-red-500 mb-1">{row.error}</p>
                      )}
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
                        key={`${row.id}-${row.selectedStyle}`}
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

                {/* 원곡적용률 + 성별 */}
                <div>
                  {row.loading ? (
                    <div className="space-y-1.5">
                      <div className="h-2.5 bg-accent animate-pulse rounded w-16" />
                      <div className="h-2 bg-accent animate-pulse rounded" />
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">원곡적용률 {row.originalRatio}%</span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={row.originalRatio}
                          onChange={e => updateRow(row.id, { originalRatio: Number(e.target.value) })}
                          className="flex-1 accent-primary"
                        />
                        <div className="flex gap-1 flex-shrink-0">
                          {([['', 'A'], ['m', 'M'], ['f', 'F']] as const).map(([val, label]) => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => updateRow(row.id, { vocalGender: val as 'f' | 'm' | '' })}
                              className={`px-2 py-0.5 text-[9px] rounded border transition-colors ${
                                row.vocalGender === val
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-background text-muted-foreground border-input hover:border-foreground/30'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* 만들기 버튼 */}
                <div className="flex gap-2 flex-wrap">
                  {row.loading ? (
                    <>
                      <div className="flex-1 h-8 bg-accent animate-pulse rounded" />
                      <div className="flex-1 h-8 bg-accent animate-pulse rounded" />
                      <button
                        onClick={() => handleDraftDelete(row.id)}
                        className="px-3 py-1.5 bg-transparent hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 dark:text-red-400 text-[11px] rounded-md transition-colors"
                      >
                        삭제
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleMakeRow(row.id)}
                        disabled={!!row.making}
                        className="flex-1 px-2 py-2 bg-primary hover:opacity-90 disabled:opacity-50 text-primary-foreground text-[11px] rounded-md transition-opacity"
                      >
                        {row.making ? '생성 중...' : row.songs.length > 0 ? '+ Cover곡 추가' : 'Cover곡 만들기'}
                      </button>
                      <button
                        onClick={() => handleDraftDelete(row.id)}
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

function SongPlayButton({ song, label }: { song: DraftSong; label: string }) {
  const { play, currentTrack, isPlaying } = useAudioPlayer()
  const isActive = currentTrack?.id === song.id

  function handleClick() {
    if (!song.audio_url) return
    play({
      id: song.id,
      title: song.title || label,
      audioUrl: song.audio_url,
      imageUrl: song.image_url ?? undefined,
    })
  }

  return (
    <button
      onClick={handleClick}
      className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
        isActive
          ? 'bg-primary text-primary-foreground'
          : 'bg-accent text-muted-foreground hover:bg-primary/20 hover:text-foreground'
      }`}
      title={isActive && isPlaying ? '일시정지' : '재생'}
    >
      {isActive && isPlaying ? (
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
      ) : (
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
      )}
    </button>
  )
}
