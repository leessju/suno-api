'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

interface Content {
  id: number
  title_en: string
  title_jp: string
  lyrics: string
  suno_style_prompt: string
  emotion_input: string
  narrative: string
}

interface WorkspaceMidi {
  id: number
  workspace_id: string
  midi_master_id: number
  label: string
  bpm: number | null
  key_signature: string | null
  created_at: number
}

export default function VariantsPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [contents, setContents] = useState<Content[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [generating, setGenerating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [midis, setMidis] = useState<WorkspaceMidi[]>([])
  const [midiId, setMidiId] = useState<number | null>(() => {
    const raw = searchParams.get('midi_id')
    return raw ? Number(raw) : null
  })

  async function loadVariants() {
    const url = midiId
      ? `/api/music-gen/workspaces/${params.id}/variants?workspace_midi_id=${midiId}`
      : `/api/music-gen/workspaces/${params.id}/variants`
    const res = await fetch(url)
    const data = await res.json()
    setContents(data.data ?? [])
    setLoading(false)
  }

  async function loadMidis() {
    const res = await fetch(`/api/music-gen/workspaces/${params.id}/midis`)
    const data = await res.json()
    const list: WorkspaceMidi[] = data.data ?? []
    setMidis(list)
    if (!midiId && list.length > 0) setMidiId(list[0].id)
  }

  useEffect(() => {
    loadVariants()
    loadMidis()
  }, [])

  async function generateVariants() {
    if (!midiId) return
    setGenerating(true)
    try {
      await fetch(`/api/music-gen/workspaces/${params.id}/variants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emotion_input: '', workspace_midi_id: midiId }),
      })
      await loadVariants()
    } catch (e) {
      console.error(e)
    } finally {
      setGenerating(false)
    }
  }

  function toggleSelect(id: number) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  async function proceedToGeneration() {
    // P2에서 Suno 생성 job enqueue
    const items = contents.filter(c => selected.has(c.id))
    for (const item of items) {
      await fetch('/api/music-gen/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'suno.generate',
          payload: {
            workspace_id: params.id,
            variant_id: String(item.id),
          },
        }),
      })
    }
    router.push(`/workspaces/${params.id}`)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Variants 선택</h1>
          <p className="text-muted-foreground text-sm mt-1">생성할 곡의 스타일을 선택하세요</p>
        </div>
        <button
          onClick={generateVariants}
          disabled={generating}
          className="px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm rounded-lg transition-colors"
        >
          {generating ? '생성 중...' : 'Gemini로 생성'}
        </button>
      </div>

      {midiId && (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-accent border border-border rounded-full text-xs text-muted-foreground">
          <span className="font-medium">MIDI 범위:</span>
          <span>{midiId}</span>
        </div>
      )}

      {loading && <div className="text-muted-foreground text-sm">로딩 중...</div>}

      {contents.length === 0 && !loading && (
        <div className="p-6 bg-background rounded-xl border border-border text-center">
          <p className="text-muted-foreground">아직 variants가 없습니다. 위 버튼으로 생성하세요.</p>
        </div>
      )}

      <div className="grid gap-3">
        {contents.map(c => (
          <div
            key={c.id}
            onClick={() => toggleSelect(c.id)}
            className={`p-4 rounded-xl border cursor-pointer transition-colors ${
              selected.has(c.id)
                ? 'border-primary bg-accent/20'
                : 'border-input bg-background hover:border-input'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`mt-1 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
                selected.has(c.id) ? 'border-primary bg-primary' : 'border-input'
              }`}>
                {selected.has(c.id) && (
                  <svg className="w-3 h-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-primary-foreground text-sm">{c.title_jp}</p>
                <p className="text-muted-foreground text-xs">{c.title_en}</p>
                <p className="text-muted-foreground text-xs mt-1 truncate">{c.suno_style_prompt}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {selected.size > 0 && (
        <div className="fixed bottom-6 right-6">
          <button
            onClick={proceedToGeneration}
            className="px-6 py-3 bg-green-600 hover:bg-green-500 text-primary-foreground font-medium rounded-xl shadow-lg transition-colors"
          >
            {selected.size}개 선택 → Suno 생성 시작
          </button>
        </div>
      )}
    </div>
  )
}
