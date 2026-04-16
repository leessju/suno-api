'use client'

import { useState, useEffect, useRef } from 'react'

interface MidiFile {
  id: string
  label: string | null
  workspace_name: string | null
  source_type: string
  source_ref: string | null
  status: string
}

interface GeneratedContent {
  id: number
  title_jp: string
  title_en: string
  lyrics: string
  suno_style_prompt: string
  audio_url?: string | null
  _generating?: boolean
  _generated?: boolean
}

type GenMode = 'auto' | 'manual'
type CountOption = 5 | 10 | 'custom'

export default function GeneratePage() {
  const [midis, setMidis] = useState<MidiFile[]>([])
  const [selectedMidiId, setSelectedMidiId] = useState<string>('')
  const [mode, setMode] = useState<GenMode>('manual')
  const [countOption, setCountOption] = useState<CountOption>(5)
  const [customCount, setCustomCount] = useState(5)
  const [generating, setGenerating] = useState(false)
  const [contents, setContents] = useState<GeneratedContent[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [expandedLyrics, setExpandedLyrics] = useState<Set<number>>(new Set())
  const [channelId, setChannelId] = useState<number | null>(null)
  const [channels, setChannels] = useState<{ id: number; channel_name: string }[]>([])

  const count = countOption === 'custom' ? customCount : countOption

  useEffect(() => {
    fetch('/api/music-gen/midis')
      .then(r => r.json())
      .then(d => setMidis(Array.isArray(d) ? d : (d.data ?? [])))
    fetch('/api/music-gen/channels')
      .then(r => r.json())
      .then(d => {
        const list = Array.isArray(d) ? d : (d.data ?? [])
        setChannels(list)
        if (list.length > 0) setChannelId(list[0].id)
      })
  }, [])

  async function handleGenerate() {
    if (!channelId) return
    setGenerating(true)
    setContents([])
    setSelected(new Set())
    try {
      const results: GeneratedContent[] = []
      for (let i = 0; i < count; i++) {
        const res = await fetch('/api/music-gen/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel_id: channelId,
            emotion_input: '',
          }),
        })
        const data = await res.json()
        if (data.content) {
          results.push(data.content as GeneratedContent)
        }
      }
      setContents(results)

      if (mode === 'auto') {
        setSelected(new Set(results.map((c: GeneratedContent) => c.id)))
        for (const item of results) {
          generateSuno(item.id)
        }
      }
    } catch (e) {
      console.error(e)
    } finally {
      setGenerating(false)
    }
  }

  async function generateSuno(variantId: number) {
    setContents(prev => prev.map(c => c.id === variantId ? { ...c, _generating: true } : c))
    try {
      await fetch('/api/music-gen/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'suno.generate',
          payload: { variant_id: String(variantId) },
        }),
      })
      await pollForAudio(variantId)
    } catch {
      setContents(prev => prev.map(c => c.id === variantId ? { ...c, _generating: false } : c))
    }
  }

  async function pollForAudio(variantId: number, attempts = 0) {
    if (attempts > 30) return
    await new Promise(r => setTimeout(r, 3000))
    try {
      const res = await fetch(`/api/music-gen/variants/${variantId}`)
      const data = await res.json()
      if (data.audio_url) {
        setContents(prev => prev.map(c => c.id === variantId
          ? { ...c, audio_url: data.audio_url, _generating: false, _generated: true }
          : c
        ))
      } else {
        await pollForAudio(variantId, attempts + 1)
      }
    } catch {
      await pollForAudio(variantId, attempts + 1)
    }
  }

  async function downloadAudio(url: string, title: string) {
    const res = await fetch(url)
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${title}.mp3`
    a.click()
  }

  function toggleLyrics(id: number) {
    setExpandedLyrics(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">노래 만들기</h1>
        <p className="text-sm text-muted-foreground mt-1">미디파일 분석을 기반으로 노래를 생성합니다</p>
      </div>

      {/* 설정 카드 */}
      <div className="bg-background border border-border rounded-xl p-5 space-y-4">
        {/* 채널 선택 */}
        <div>
          <label className="text-sm font-medium text-foreground block mb-1.5">채널</label>
          <select
            value={channelId ?? ''}
            onChange={e => setChannelId(Number(e.target.value))}
            className="w-full h-9 px-3 text-sm rounded-lg border border-border bg-background text-foreground"
          >
            <option value="">채널 선택</option>
            {channels.map(ch => (
              <option key={ch.id} value={ch.id}>{ch.channel_name}</option>
            ))}
          </select>
        </div>

        {/* 미디파일 선택 (선택 없어도 됨) */}
        <div>
          <label className="text-sm font-medium text-foreground block mb-1.5">
            미디파일 <span className="text-muted-foreground font-normal">(선택 없이도 생성 가능)</span>
          </label>
          <select
            value={selectedMidiId}
            onChange={e => setSelectedMidiId(e.target.value)}
            className="w-full h-9 px-3 text-sm rounded-lg border border-border bg-background text-foreground"
          >
            <option value="">미디파일 없이 생성</option>
            {midis.map(m => (
              <option key={m.id} value={m.id}>
                {m.label ?? m.source_ref ?? m.id} {m.workspace_name ? `(${m.workspace_name})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* 생성 모드 */}
        <div>
          <label className="text-sm font-medium text-foreground block mb-1.5">생성 모드</label>
          <div className="flex gap-2">
            {(['auto', 'manual'] as GenMode[]).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-2 text-sm rounded-lg border transition-colors ${
                  mode === m
                    ? 'border-primary bg-accent dark:bg-accent text-foreground font-medium'
                    : 'border-border text-muted-foreground hover:border-input'
                }`}
              >
                {m === 'auto' ? '자동 (한 번에 생성)' : '수동 (미리보기 후 선택)'}
              </button>
            ))}
          </div>
        </div>

        {/* 곡수 선택 */}
        <div>
          <label className="text-sm font-medium text-foreground block mb-1.5">생성 곡수</label>
          <div className="flex gap-2 items-center">
            {([5, 10, 'custom'] as CountOption[]).map(c => (
              <button
                key={String(c)}
                onClick={() => setCountOption(c)}
                className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                  countOption === c
                    ? 'border-primary bg-accent dark:bg-accent text-foreground font-medium'
                    : 'border-border text-muted-foreground'
                }`}
              >
                {c === 'custom' ? '직접 입력' : `${c}곡`}
              </button>
            ))}
            {countOption === 'custom' && (
              <input
                type="number" min={1} max={20} value={customCount}
                onChange={e => setCustomCount(Math.min(20, Math.max(1, Number(e.target.value))))}
                className="w-20 h-9 px-3 text-sm rounded-lg border border-border bg-background text-foreground text-center"
              />
            )}
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={generating || !channelId}
          className="w-full py-2.5 text-sm font-semibold text-primary-foreground rounded-lg transition-opacity disabled:opacity-50 hover:opacity-90 bg-primary"
        >
          {generating ? '생성 중...' : `${count}곡 생성 시작`}
        </button>
      </div>

      {/* 결과 리스트 */}
      {contents.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">생성 결과 ({contents.length}곡)</h2>
            {mode === 'manual' && selected.size > 0 && (
              <button
                onClick={() => { selected.forEach(id => generateSuno(id)) }}
                className="px-4 py-1.5 text-sm font-medium text-primary-foreground rounded-lg bg-green-600 hover:bg-green-500"
              >
                {selected.size}곡 Suno 생성
              </button>
            )}
          </div>

          {contents.map(c => (
            <div key={c.id} className="bg-background border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                {mode === 'manual' && (
                  <input type="checkbox" checked={selected.has(c.id)}
                    onChange={() => {
                      const next = new Set(selected)
                      next.has(c.id) ? next.delete(c.id) : next.add(c.id)
                      setSelected(next)
                    }}
                    className="mt-1 w-4 h-4 rounded accent-primary"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground text-sm">{c.title_jp}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{c.title_en}</p>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{c.suno_style_prompt}</p>
                </div>
                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {mode === 'manual' && !c._generated && !c._generating && (
                    <button
                      onClick={() => generateSuno(c.id)}
                      className="px-3 py-1 text-xs font-medium rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground"
                    >
                      Suno 생성
                    </button>
                  )}
                  {c._generating && (
                    <span className="text-xs text-muted-foreground animate-pulse">생성 중...</span>
                  )}
                  {c.audio_url && (
                    <button
                      onClick={() => downloadAudio(c.audio_url!, c.title_jp)}
                      className="px-3 py-1 text-xs font-medium rounded-lg bg-green-600 hover:bg-green-500 text-primary-foreground"
                    >
                      다운로드
                    </button>
                  )}
                </div>
              </div>

              {/* Waveform + Audio Player */}
              {c.audio_url && (
                <div className="space-y-2">
                  <WaveformPlayer audioUrl={c.audio_url} />
                </div>
              )}

              {/* 가사 접기/펼치기 */}
              <div>
                <button
                  onClick={() => toggleLyrics(c.id)}
                  className="text-xs text-muted-foreground hover:text-muted-foreground dark:hover:text-muted-foreground flex items-center gap-1"
                >
                  {expandedLyrics.has(c.id) ? '▲ 가사 접기' : '▼ 가사 펼치기'}
                </button>
                {expandedLyrics.has(c.id) && (
                  <pre className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap font-sans bg-accent rounded-lg p-3 max-h-48 overflow-y-auto">
                    {c.lyrics}
                  </pre>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Waveform 시각바 컴포넌트
function WaveformPlayer({ audioUrl }: { audioUrl: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  // Simulated waveform bars (random amplitudes for visual effect)
  const bars = Array.from({ length: 60 }, (_, i) => Math.sin(i * 0.3) * 0.4 + Math.random() * 0.6)

  function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    if (playing) { audio.pause(); setPlaying(false) }
    else { audio.play(); setPlaying(true) }
  }

  function handleTimeUpdate() {
    const audio = audioRef.current
    if (!audio) return
    setProgress(audio.currentTime / audio.duration)
  }

  return (
    <div className="space-y-2">
      <audio ref={audioRef} src={audioUrl} onTimeUpdate={handleTimeUpdate} onEnded={() => setPlaying(false)} />
      {/* Waveform bars */}
      <div className="flex items-center gap-0.5 h-12 cursor-pointer" onClick={togglePlay}>
        <button className="mr-2 w-8 h-8 rounded-full bg-primary hover:bg-primary/90 flex items-center justify-center text-primary-foreground flex-shrink-0">
          {playing ? (
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          ) : (
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          )}
        </button>
        {bars.map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-full transition-colors"
            style={{
              height: `${Math.max(4, h * 48)}px`,
              backgroundColor: i / bars.length < progress ? 'hsl(var(--primary))' : '#e5e7eb',
            }}
          />
        ))}
      </div>
    </div>
  )
}
