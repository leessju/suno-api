'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Content {
  id: number
  title_en: string
  title_jp: string
  lyrics: string
  suno_style_prompt: string
  emotion_input: string
  narrative: string
}

export default function VariantsPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [contents, setContents] = useState<Content[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [generating, setGenerating] = useState(false)
  const [loading, setLoading] = useState(true)

  async function loadVariants() {
    const res = await fetch(`/api/music-gen/workspaces/${params.id}/variants`)
    const data = await res.json()
    setContents(data.data ?? [])
    setLoading(false)
  }

  useEffect(() => { loadVariants() }, [])

  async function generateVariants() {
    setGenerating(true)
    try {
      await fetch(`/api/music-gen/workspaces/${params.id}/variants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emotion_input: '' }),
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
          <p className="text-gray-400 text-sm mt-1">생성할 곡의 스타일을 선택하세요</p>
        </div>
        <button
          onClick={generateVariants}
          disabled={generating}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
        >
          {generating ? '생성 중...' : 'Gemini로 생성'}
        </button>
      </div>

      {loading && <div className="text-gray-400 text-sm">로딩 중...</div>}

      {contents.length === 0 && !loading && (
        <div className="p-6 bg-gray-900 rounded-xl border border-gray-800 text-center">
          <p className="text-gray-400">아직 variants가 없습니다. 위 버튼으로 생성하세요.</p>
        </div>
      )}

      <div className="grid gap-3">
        {contents.map(c => (
          <div
            key={c.id}
            onClick={() => toggleSelect(c.id)}
            className={`p-4 rounded-xl border cursor-pointer transition-colors ${
              selected.has(c.id)
                ? 'border-blue-500 bg-blue-900/20'
                : 'border-gray-700 bg-gray-900 hover:border-gray-600'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`mt-1 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
                selected.has(c.id) ? 'border-blue-500 bg-blue-500' : 'border-gray-600'
              }`}>
                {selected.has(c.id) && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-white text-sm">{c.title_jp}</p>
                <p className="text-gray-400 text-xs">{c.title_en}</p>
                <p className="text-gray-500 text-xs mt-1 truncate">{c.suno_style_prompt}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {selected.size > 0 && (
        <div className="fixed bottom-6 right-6">
          <button
            onClick={proceedToGeneration}
            className="px-6 py-3 bg-green-600 hover:bg-green-500 text-white font-medium rounded-xl shadow-lg transition-colors"
          >
            {selected.size}개 선택 → Suno 생성 시작
          </button>
        </div>
      )}
    </div>
  )
}
