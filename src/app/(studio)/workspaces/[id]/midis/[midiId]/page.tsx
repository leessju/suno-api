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

  // 음원 만들기 폼 상태
  const [showMakeForm, setShowMakeForm] = useState(false)
  const [makeMode, setMakeMode] = useState<'auto' | 'manual'>('auto')
  const [originalRatio, setOriginalRatio] = useState(50)
  const [lyrics, setLyrics] = useState('')
  const [sunoStyle, setSunoStyle] = useState('')
  const [title, setTitle] = useState('')
  const [making, setMaking] = useState(false)
  const [makeError, setMakeError] = useState('')
  const [makeSuccess, setMakeSuccess] = useState(false)

  // midi 로드 후 original_ratio 동기화
  useEffect(() => {
    if (midi?.original_ratio !== undefined) setOriginalRatio(midi.original_ratio)
  }, [midi?.original_ratio])

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  const handleMake = async () => {
    setMakeError('')
    setMaking(true)
    try {
      const res = await fetch(`/api/music-gen/workspaces/${id}/variants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_midi_id: midiId,
          gen_mode: makeMode,
          original_ratio: originalRatio,
          ...(makeMode === 'manual' ? { lyrics, suno_style: sunoStyle, title } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message ?? '생성 실패')
      setMakeSuccess(true)
      setShowMakeForm(false)
    } catch (e) {
      setMakeError(e instanceof Error ? e.message : '오류가 발생했습니다')
    } finally {
      setMaking(false)
    }
  }

  useEffect(() => {
    loadMidi()
    return () => { if (pollRef.current) clearTimeout(pollRef.current) }
  }, [loadMidi])

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
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent/80 text-foreground text-xs rounded-md transition-colors"
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
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent/80 text-foreground text-xs rounded-md transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                원본 오디오
              </a>
            )}
            <button
              onClick={() => { setShowMakeForm(true); setMakeSuccess(false) }}
              className="px-3 py-1.5 bg-primary hover:opacity-90 text-primary-foreground text-xs rounded-md transition-opacity"
            >
              음원 만들기
            </button>
            <Link
              href={`/workspaces/${id}/variants?midi_id=${midiId}&view=list`}
              className="px-3 py-1.5 bg-accent hover:bg-accent/80 text-foreground text-xs rounded-md transition-colors"
            >
              트랙 보기 ({(midi.tracks ?? []).length})
            </Link>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-3 py-1.5 bg-accent hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 text-xs rounded-md transition-colors disabled:opacity-50"
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

      {/* 분석 결과 (ready 이상일 때) */}
      {isReady && midi.midi_master && (
        <div className="bg-background border border-border rounded-lg p-4 space-y-4">
          <p className="text-xs font-medium text-muted-foreground">분석 결과</p>

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

      {/* 음원 만들기 폼 */}
      {isReady && (
        <div className="space-y-2">
          {/* 음원 만들기 폼 */}
          {showMakeForm && (
            <div className="bg-background border border-border rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">음원 만들기</p>
                <button onClick={() => setShowMakeForm(false)} className="text-muted-foreground hover:text-foreground text-xs">취소</button>
              </div>

              {makeError && (
                <div className="p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-600 dark:text-red-400 text-xs">{makeError}</div>
              )}

              {/* 모드 선택 */}
              <div>
                <p className="text-xs text-muted-foreground mb-2">생성 방식</p>
                <div className="flex gap-3">
                  {([['auto', '자동'], ['manual', '수동']] as const).map(([val, label]) => (
                    <label key={val} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        value={val}
                        checked={makeMode === val}
                        onChange={() => setMakeMode(val)}
                        className="accent-primary w-3.5 h-3.5"
                      />
                      <span className="text-sm text-foreground">{label}</span>
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  {makeMode === 'auto' ? 'Gemini가 가사·스타일·제목을 자동 생성하고 Suno로 음원까지 만듭니다.' : '가사, 스타일, 제목을 직접 입력합니다.'}
                </p>
              </div>

              {/* 수동 입력 */}
              {makeMode === 'manual' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">제목</label>
                    <input
                      type="text"
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      placeholder="예: My Way - Korean Ver."
                      className="w-full px-3 py-2 text-sm bg-background border border-input rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">Suno 스타일</label>
                    <input
                      type="text"
                      value={sunoStyle}
                      onChange={e => setSunoStyle(e.target.value)}
                      placeholder="예: k-pop, emotional, piano ballad"
                      className="w-full px-3 py-2 text-sm bg-background border border-input rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">가사</label>
                    <textarea
                      value={lyrics}
                      onChange={e => setLyrics(e.target.value)}
                      placeholder="가사를 입력하세요..."
                      rows={6}
                      className="w-full px-3 py-2 text-sm bg-background border border-input rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                    />
                  </div>
                </div>
              )}

              {/* 원복 적용률 */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-foreground">원복 적용률</label>
                  <span className="text-xs text-muted-foreground tabular-nums">{originalRatio}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={originalRatio}
                  onChange={e => setOriginalRatio(Number(e.target.value))}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                  <span>창작 위주</span>
                  <span>원곡 유지</span>
                </div>
              </div>

              <button
                onClick={handleMake}
                disabled={making || (makeMode === 'manual' && !title.trim())}
                className="w-full py-2 bg-primary hover:opacity-90 disabled:opacity-50 text-primary-foreground text-sm rounded-lg transition-opacity font-medium"
              >
                {making ? '생성 중...' : '만들기'}
              </button>
            </div>
          )}

          {makeSuccess && (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded text-green-700 dark:text-green-400 text-xs">
              생성 요청이 완료되었습니다.{' '}
              <Link href={`/workspaces/${id}/variants?midi_id=${midiId}&view=list`} className="underline">트랙 보기</Link>
            </div>
          )}
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
