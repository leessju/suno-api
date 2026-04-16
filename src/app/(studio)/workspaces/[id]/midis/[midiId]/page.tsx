'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface MidiDetail {
  id: string
  label: string | null
  source_type: string
  source_ref: string | null
  gen_mode: string
  original_ratio: number
  status: string
  error_message: string | null
  track_count?: number
  created_at: number
  updated_at: number
  midi_master?: {
    title?: string
    bpm?: number
    key_signature?: string
    duration?: number
  } | null
  tracks?: Array<{ id: string; title: string | null; suno_track_id: string; status: string }>
}

const PIPELINE = [
  { key: 'converting', label: 'MIDI 변환' },
  { key: 'ready', label: '분석 완료' },
  { key: 'generating', label: 'Variants 생성' },
  { key: 'done', label: '완료' },
]

const STATUS_ORDER = ['pending', 'converting', 'ready', 'generating', 'done']

export default function MidiDetailPage() {
  const { id, midiId } = useParams<{ id: string; midiId: string }>()
  const [midi, setMidi] = useState<MidiDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const loadMidi = useCallback(async () => {
    const res = await fetch(`/api/music-gen/workspaces/${id}/midis/${midiId}`)
    const data = await res.json()
    setMidi(data.data)
    setLoading(false)
  }, [id, midiId])

  useEffect(() => { loadMidi() }, [loadMidi])

  async function updateField(field: string, value: unknown) {
    setSaving(true)
    try {
      const res = await fetch(`/api/music-gen/workspaces/${id}/midis/${midiId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      const data = await res.json()
      if (res.ok) setMidi(prev => prev ? { ...prev, ...data.data } : null)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="space-y-4">
      <div className="h-8 bg-accent rounded animate-pulse w-40" />
      <div className="h-48 bg-accent rounded-lg animate-pulse" />
    </div>
  )

  if (!midi) return <div className="text-muted-foreground">MIDI를 찾을 수 없습니다.</div>

  const statusIdx = STATUS_ORDER.indexOf(midi.status)

  return (
    <div className="space-y-5 w-full">
      {/* 브레드크럼 */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link href={`/workspaces/${id}`} className="hover:text-foreground  transition-colors">워크스페이스</Link>
        <span>›</span>
        <span className="text-foreground">{midi.label ?? 'MIDI'}</span>
      </div>

      {/* 미니 파이프라인 */}
      <div className="flex items-center gap-2">
        {PIPELINE.map((step, i) => {
          const stepIdx = STATUS_ORDER.indexOf(step.key)
          const isDone = statusIdx > stepIdx
          const isActive = midi.status === step.key
          return (
            <div key={step.key} className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                isDone ? 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                : isActive ? 'bg-accent text-foreground'
                : 'bg-accent text-muted-foreground'
              }`}>
                {isDone && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                {step.label}
              </div>
              {i < PIPELINE.length - 1 && <span className="text-muted-foreground">›</span>}
            </div>
          )
        })}
      </div>

      {/* 소스 정보 */}
      <div className="bg-background border border-border rounded-lg p-5 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold text-foreground">소스 정보</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-xs text-muted-foreground">타입</span>
            <p className="text-foreground font-medium mt-0.5">
              {({ youtube_video: 'YouTube', mp3_file: 'MP3', direct_midi: 'MIDI' } as Record<string, string>)[midi.source_type] ?? midi.source_type}
            </p>
          </div>
          {midi.midi_master && (
            <>
              {midi.midi_master.bpm && <div><span className="text-xs text-muted-foreground">BPM</span><p className="text-foreground font-medium mt-0.5">{midi.midi_master.bpm}</p></div>}
              {midi.midi_master.key_signature && <div><span className="text-xs text-muted-foreground">키</span><p className="text-foreground font-medium mt-0.5">{midi.midi_master.key_signature}</p></div>}
            </>
          )}
        </div>
        {midi.source_ref && (
          <p className="text-xs text-muted-foreground truncate">{midi.source_ref}</p>
        )}
        {midi.error_message && (
          <div className="p-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-600 dark:text-red-400 text-xs">
            {midi.error_message}
          </div>
        )}
      </div>

      {/* Gen Mode + Ratio 설정 */}
      <div className="bg-background border border-border rounded-lg p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-foreground">생성 설정</h2>

        {/* Gen Mode 토글 */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-2">생성 모드</label>
          <div className="flex gap-2">
            {(['auto', 'manual'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => updateField('gen_mode', mode)}
                disabled={saving}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  midi.gen_mode === mode
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-accent text-muted-foreground hover:bg-accent'
                }`}
              >
                {mode === 'auto' ? '자동' : '수동'}
              </button>
            ))}
          </div>
        </div>

        {/* 원곡:스타일 비율 슬라이더 */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-2">
            원곡:스타일 비율 — {midi.original_ratio}% 원곡
          </label>
          <input
            type="range"
            min={0} max={100} step={5}
            value={midi.original_ratio}
            onChange={e => setMidi(prev => prev ? { ...prev, original_ratio: Number(e.target.value) } : null)}
            onMouseUp={e => updateField('original_ratio', Number((e.target as HTMLInputElement).value))}
            onTouchEnd={e => updateField('original_ratio', Number((e.target as HTMLInputElement).value))}
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
            <span>순수 스타일</span>
            <span>균형</span>
            <span>원곡 밀착</span>
          </div>
        </div>
      </div>

      {/* 액션 버튼 */}
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/workspaces/${id}/variants?midi_id=${midiId}`}
          className="px-4 py-2 bg-primary hover:bg-primary text-primary-foreground text-sm rounded-lg transition-colors"
        >
          Variants 생성
        </Link>
        <Link
          href={`/workspaces/${id}/variants?midi_id=${midiId}&view=list`}
          className="px-4 py-2 bg-background border border-border hover:border-input  text-foreground text-sm rounded-lg transition-colors"
        >
          트랙 보기 ({(midi.tracks ?? []).length})
        </Link>
      </div>
    </div>
  )
}
