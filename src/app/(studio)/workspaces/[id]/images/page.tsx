'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

interface TrackImage {
  id: string
  suno_track_id: string
  title?: string
  audio_url?: string
  r2_key?: string
  local_path?: string
  source_type?: string
  source_url?: string
}

type DrawerTab = 'upload' | 'url'

interface DrawerState {
  trackId: string
  title: string
}

export default function ImagesPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [tracks, setTracks] = useState<TrackImage[]>([])
  const [loading, setLoading] = useState(true)
  const [drawer, setDrawer] = useState<DrawerState | null>(null)
  const [activeTab, setActiveTab] = useState<DrawerTab>('upload')
  const [urlInput, setUrlInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    try {
      const res = await fetch(`/api/music-gen/workspaces/${params.id}/images`)
      const json = await res.json()
      setTracks(json.data ?? json ?? [])
    } catch {
      setTracks([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleDelete(trackId: string) {
    await fetch(`/api/music-gen/workspaces/${params.id}/images/${trackId}`, { method: 'DELETE' })
    await load()
  }

  async function assignUrl(trackId: string, url: string) {
    setSubmitting(true)
    try {
      await fetch(`/api/music-gen/workspaces/${params.id}/images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suno_track_id: trackId, source_type: 'url', source_url: url }),
      })
      await load()
      setDrawer(null)
      setUrlInput('')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleFileUpload(trackId: string, file: File) {
    setSubmitting(true)
    try {
      const reader = new FileReader()
      reader.onload = async () => {
        const dataUrl = reader.result as string
        await fetch(`/api/music-gen/workspaces/${params.id}/images`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            suno_track_id: trackId,
            source_type: 'upload',
            source_url: dataUrl,
          }),
        })
        await load()
        setDrawer(null)
      }
      reader.readAsDataURL(file)
    } finally {
      setSubmitting(false)
    }
  }

  const assignedCount = tracks.filter(t => t.source_url || t.r2_key || t.local_path).length
  const allAssigned = tracks.length > 0 && assignedCount === tracks.length

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/workspaces/${params.id}`)}
            className="text-muted-foreground hover:text-primary-foreground transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-bold text-primary-foreground">이미지 연결</h1>
            <p className="text-sm text-muted-foreground mt-0.5">각 트랙에 배경 이미지를 배정하세요</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {allAssigned && (
            <span className="px-3 py-1 bg-green-900/40 text-green-400 text-xs rounded-full font-medium border border-green-800">
              Step 5 완료
            </span>
          )}
          <span className="text-sm text-muted-foreground">
            완료: <span className="text-primary-foreground font-medium">{assignedCount}/{tracks.length}</span> 트랙
          </span>
        </div>
      </div>

      {loading && (
        <div className="text-muted-foreground text-sm">로딩 중...</div>
      )}

      {!loading && tracks.length === 0 && (
        <div className="p-8 bg-background rounded-xl border border-border text-center">
          <p className="text-muted-foreground">체크된 트랙이 없습니다. 먼저 음악 리스트에서 트랙을 선택하세요.</p>
        </div>
      )}

      {/* 트랙 그리드 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {tracks.map(track => {
          const hasImage = !!(track.source_url || track.r2_key || track.local_path)
          const imgSrc = track.source_url || undefined

          return (
            <div
              key={track.suno_track_id}
              className="group relative"
            >
              <button
                onClick={() => {
                  setDrawer({ trackId: track.suno_track_id, title: track.title ?? track.suno_track_id })
                  setActiveTab('upload')
                  setUrlInput('')
                }}
                className={`w-full aspect-square rounded-xl border-2 flex flex-col items-center justify-center overflow-hidden transition-all ${
                  hasImage
                    ? 'border-primary hover:border-primary/70'
                    : 'border-dashed border-input hover:border-border bg-background'
                }`}
              >
                {hasImage && imgSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imgSrc} alt={track.title} className="w-full h-full object-cover" />
                ) : hasImage ? (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909" />
                    </svg>
                    <span className="text-xs">배정됨</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    <span className="text-xs">클릭하여 추가</span>
                  </div>
                )}

                {/* hover 오버레이 */}
                {hasImage && (
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center gap-3">
                    <span className="text-primary-foreground text-xs font-medium">변경</span>
                    <span className="text-muted-foreground text-xs">|</span>
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        handleDelete(track.suno_track_id)
                      }}
                      className="text-red-400 text-xs font-medium"
                    >
                      삭제
                    </button>
                  </div>
                )}
              </button>

              <p className="mt-2 text-xs text-muted-foreground text-center truncate px-1">
                {track.title ?? track.suno_track_id}
              </p>
            </div>
          )
        })}
      </div>

      {/* 이미지 소스 Drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60">
          <div className="w-full sm:w-[480px] bg-background rounded-t-2xl sm:rounded-2xl border border-input p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-primary-foreground">이미지 추가 · {drawer.title}</h2>
              <button onClick={() => setDrawer(null)} className="text-muted-foreground hover:text-primary-foreground">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 탭 */}
            <div className="flex gap-1 bg-background rounded-lg p-1">
              {(['upload', 'url'] as DrawerTab[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${
                    activeTab === tab ? 'bg-background text-primary-foreground' : 'text-muted-foreground hover:text-primary-foreground'
                  }`}
                >
                  {tab === 'upload' ? '파일 업로드' : 'URL 입력'}
                </button>
              ))}
            </div>

            {activeTab === 'upload' && (
              <div className="space-y-3">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) handleFileUpload(drawer.trackId, file)
                  }}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={submitting}
                  className="w-full py-10 border-2 border-dashed border-input rounded-xl text-muted-foreground hover:border-border hover:text-primary-foreground transition-colors disabled:opacity-50"
                >
                  {submitting ? '업로드 중...' : '클릭하여 이미지 선택'}
                </button>
              </div>
            )}

            {activeTab === 'url' && (
              <div className="space-y-3">
                <input
                  type="url"
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  placeholder="https://..."
                  className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-primary-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring"
                />
                <button
                  onClick={() => urlInput && assignUrl(drawer.trackId, urlInput)}
                  disabled={!urlInput || submitting}
                  className="w-full py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm rounded-lg transition-colors"
                >
                  {submitting ? '저장 중...' : '저장'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
