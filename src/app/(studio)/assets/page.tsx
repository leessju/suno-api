'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useChannel } from '@/components/ChannelProvider'
import { Button } from '@/components/ui/button'

interface BackImage {
  id: number
  r2_key: string
  thumbnail_r2_key: string | null
  filename: string
  is_cover: number
}

interface ImageSectionProps {
  title: string
  description: string
  channelId: number | null
  imageType: 'video' | 'thumbnail'
  aspectClass: string
  hidden?: boolean
  onCountChange?: (count: number) => void
}

const PAGE_SIZE = 16

function ImageSection({ title, description, channelId, imageType, aspectClass, hidden, onCountChange }: ImageSectionProps) {
  const [images, setImages] = useState<BackImage[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const fetchImages = useCallback(async (signal?: AbortSignal) => {
    if (!channelId) return
    setImages([])
    setVisibleCount(PAGE_SIZE)
    setLoading(true)
    try {
      const res = await fetch(
        `/api/music-gen/back-images?channel_id=${channelId}&type=${imageType}`,
        { signal }
      )
      if (res.ok) {
        const data = await res.json()
        const list = Array.isArray(data) ? data : (data.data ?? [])
        setImages(list)
        onCountChange?.(list.length)
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      console.error('Failed to fetch images', e)
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [channelId, imageType])

  useEffect(() => {
    const controller = new AbortController()
    fetchImages(controller.signal)
    return () => controller.abort()
  }, [fetchImages])

  const handleUpload = async (files: File[]) => {
    if (!channelId || files.length === 0) return
    setUploading(true)
    setUploadProgress({ current: 0, total: files.length })
    let failCount = 0
    for (let i = 0; i < files.length; i++) {
      setUploadProgress({ current: i + 1, total: files.length })
      try {
        const form = new FormData()
        form.append('file', files[i])
        form.append('channel_id', String(channelId))
        form.append('image_type', imageType)
        await fetch('/api/music-gen/back-images', { method: 'POST', body: form })
      } catch (e) {
        failCount++
        console.error(`업로드 실패 (${files[i].name}):`, e)
      }
    }
    if (failCount > 0) console.error(`${failCount}개 파일 업로드 실패`)
    await fetchImages()
    setUploading(false)
    setUploadProgress(null)
  }

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        setVisibleCount(c => Math.min(c + PAGE_SIZE, images.length))
      }
    }, { threshold: 0.1 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [images.length])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => setIsDragging(false)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (uploading) return
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    if (files.length > 0) handleUpload(files)
  }

  const handleDelete = async (imageId: number) => {
    await fetch(`/api/music-gen/back-images/${imageId}`, { method: 'DELETE' })
    await fetchImages()
  }

  const header = (
    <div>
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
    </div>
  )

  if (!channelId) {
    return (
      <section className={`space-y-3${hidden ? ' hidden' : ''}`}>
        {header}
        <div className="p-8 bg-background border border-dashed border-border rounded-lg text-center text-sm text-muted-foreground">
          채널을 선택하면 이미지가 표시됩니다
        </div>
      </section>
    )
  }

  return (
    <section className={`space-y-3${hidden ? ' hidden' : ''}`}>
      {header}

      {/* 업로드 영역 */}
      <label
        className={`flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-input hover:border-foreground/40'
        } ${uploading ? 'opacity-60 cursor-not-allowed' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <span className="text-sm text-muted-foreground pointer-events-none">
          {uploading && uploadProgress
            ? `${uploadProgress.current}/${uploadProgress.total} 업로드 중...`
            : '클릭하거나 파일을 드래그 (PNG, JPG, 다중 선택 가능)'}
        </span>
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          disabled={uploading}
          onChange={e => {
            const files = Array.from(e.target.files ?? [])
            if (files.length > 0) handleUpload(files)
            e.target.value = ''
          }}
        />
      </label>

      {/* 이미지 그리드 */}
      {loading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-lg bg-accent animate-pulse aspect-video" />
          ))}
        </div>
      ) : images.length === 0 ? (
        <div className="p-8 bg-background border border-dashed border-border rounded-lg text-center text-sm text-muted-foreground">
          이미지가 없습니다
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {images.slice(0, visibleCount).map(img => (
              <div key={img.id} className="group rounded-lg overflow-hidden border border-border bg-accent">
                <div className={`${aspectClass} relative`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/r2/object/${img.thumbnail_r2_key ?? img.r2_key}`}
                    alt={img.filename}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-1.5 flex items-center justify-between gap-1">
                  <span className="text-[10px] text-muted-foreground truncate flex-1">{img.filename}</span>
                  <Button
                    variant="ghost"
                    onClick={() => handleDelete(img.id)}
                    className="flex-shrink-0 px-1.5 py-1 text-[10px] bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 rounded transition-colors"
                  >
                    삭제
                  </Button>
                </div>
              </div>
            ))}
          </div>
          {visibleCount < images.length && (
            <div ref={sentinelRef} className="flex justify-center py-4">
              <span className="text-xs text-muted-foreground">{visibleCount} / {images.length}개 로드됨</span>
            </div>
          )}
        </>
      )}
    </section>
  )
}

export default function AssetsPage() {
  const { selectedChannel } = useChannel()
  const [activeTab, setActiveTab] = useState<'video' | 'thumbnail'>('video')
  const [videoCnt, setVideoCnt] = useState<number | null>(null)
  const [thumbCnt, setThumbCnt] = useState<number | null>(null)

  const tabs = [
    { id: 'video' as const, label: '영상이미지', count: videoCnt },
    { id: 'thumbnail' as const, label: '썸네일이미지', count: thumbCnt },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-foreground">에셋 라이브러리</h1>

      <div className="flex gap-0 border-b border-border">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
            {tab.count !== null && (
              <span className="text-[11px] bg-accent text-muted-foreground px-1.5 py-0.5 rounded-full">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <ImageSection
        title="영상 이미지 업로드"
        description="YouTube 영상 배경으로 사용할 이미지 (16:9 권장)"
        channelId={selectedChannel?.id ?? null}
        imageType="video"
        aspectClass="aspect-video"
        hidden={activeTab !== 'video'}
        onCountChange={setVideoCnt}
      />
      <ImageSection
        title="썸네일이미지 업로드"
        description="YouTube 썸네일 배경으로 사용할 이미지 (1280×720 권장)"
        channelId={selectedChannel?.id ?? null}
        imageType="thumbnail"
        aspectClass="aspect-video"
        hidden={activeTab !== 'thumbnail'}
        onCountChange={setThumbCnt}
      />
    </div>
  )
}
