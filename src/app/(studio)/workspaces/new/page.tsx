'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChannelSelector } from '@/components/ChannelSelector'

type SourceType = 'youtube_video' | 'mp3_file' | 'album_list'
type PipelineMode = 'step' | 'auto'

export default function NewWorkspacePage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [sourceType, setSourceType] = useState<SourceType>('youtube_video')
  const [sourceRef, setSourceRef] = useState('')
  const [channelId, setChannelId] = useState<number | null>(null)
  const [pipelineMode, setPipelineMode] = useState<PipelineMode>('step')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!channelId) { setError('채널을 선택하세요'); return }
    if (!name.trim()) { setError('워크스페이스 이름을 입력하세요'); return }

    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/music-gen/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          source_type: sourceType,
          source_ref: sourceRef.trim() || undefined,
          channel_id: channelId,
          pipeline_mode: pipelineMode,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message ?? 'Failed to create workspace')
      router.push(`/workspaces/${data.data.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">새 작업 시작</h1>
        <p className="text-gray-400 mt-1 text-sm">채널과 소스를 선택하고 파이프라인을 시작하세요</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* 워크스페이스 이름 */}
        <div>
          <label className="block text-sm text-gray-300 mb-2">워크스페이스 이름</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="예: J-Pop Vol.5 2026-04"
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* 채널 선택 */}
        <div>
          <label className="block text-sm text-gray-300 mb-2">YouTube 채널</label>
          <ChannelSelector value={channelId} onChange={setChannelId} />
        </div>

        {/* 소스 타입 */}
        <div>
          <label className="block text-sm text-gray-300 mb-2">입력 소스</label>
          <div className="grid grid-cols-3 gap-2">
            {([
              ['youtube_video', 'YouTube URL'],
              ['mp3_file', 'MP3 파일'],
              ['album_list', '앨범 리스트'],
            ] as [SourceType, string][]).map(([type, label]) => (
              <button
                key={type}
                type="button"
                onClick={() => setSourceType(type)}
                className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                  sourceType === type
                    ? 'border-blue-500 bg-blue-900/30 text-white'
                    : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 소스 참조 */}
        {(sourceType === 'youtube_video' || sourceType === 'album_list') && (
          <div>
            <label className="block text-sm text-gray-300 mb-2">
              {sourceType === 'youtube_video' ? 'YouTube URL' : '앨범 리스트 (URL 또는 텍스트)'}
            </label>
            <input
              type="text"
              value={sourceRef}
              onChange={e => setSourceRef(e.target.value)}
              placeholder={sourceType === 'youtube_video' ? 'https://youtu.be/...' : '앨범 URL 또는 키워드'}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        )}

        {/* 파이프라인 모드 */}
        <div>
          <label className="block text-sm text-gray-300 mb-2">파이프라인 모드</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setPipelineMode('step')}
              className={`p-4 rounded-xl border text-left transition-colors ${
                pipelineMode === 'step'
                  ? 'border-blue-500 bg-blue-900/30'
                  : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
              }`}
            >
              <p className="font-medium text-sm text-white">단계별 (Step)</p>
              <p className="text-xs text-gray-400 mt-1">각 단계에서 확인 후 진행</p>
            </button>
            <button
              type="button"
              onClick={() => setPipelineMode('auto')}
              className={`p-4 rounded-xl border text-left transition-colors ${
                pipelineMode === 'auto'
                  ? 'border-green-500 bg-green-900/30'
                  : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
              }`}
            >
              <p className="font-medium text-sm text-white">원클릭 (Auto)</p>
              <p className="text-xs text-gray-400 mt-1">YouTube 업로드까지 자동 완료</p>
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !channelId}
          className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors"
        >
          {loading ? '생성 중...' : '파이프라인 시작'}
        </button>
      </form>
    </div>
  )
}
