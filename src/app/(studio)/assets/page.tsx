'use client'

import { useState, useEffect, useCallback } from 'react'
import { useChannel } from '@/components/ChannelProvider'

interface BackImage {
  id: number
  r2_key: string
  filename: string
  is_cover: number
  image_type?: string
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface ImageSectionProps {
  title: string
  description: string
  channelId: number | null
  imageType: 'video' | 'thumbnail'
  aspectClass: string
}

function ImageSection({ title, description, channelId, imageType, aspectClass }: ImageSectionProps) {
  const [images, setImages] = useState<BackImage[]>([])
  const [uploading, setUploading] = useState(false)

  const fetchImages = useCallback(async () => {
    if (!channelId) return
    const res = await fetch(`/api/music-gen/back-images?channel_id=${channelId}&type=${imageType}`)
    if (res.ok) {
      const data = await res.json()
      setImages(Array.isArray(data) ? data : (data.data ?? []))
    }
  }, [channelId, imageType])

  useEffect(() => { fetchImages() }, [fetchImages])

  const handleUpload = async (file: File) => {
    if (!channelId) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('channel_id', String(channelId))
      form.append('image_type', imageType)
      await fetch('/api/music-gen/back-images', { method: 'POST', body: form })
      await fetchImages()
    } finally {
      setUploading(false)
    }
  }

  const handleSetCover = async (imageId: number) => {
    if (!channelId) return
    await fetch(`/api/music-gen/back-images/${imageId}/cover`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel_id: channelId }),
    })
    await fetchImages()
  }

  const handleDelete = async (imageId: number) => {
    await fetch(`/api/music-gen/back-images/${imageId}`, { method: 'DELETE' })
    await fetchImages()
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>

      {/* 업로드 영역 */}
      <label className={`flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-input rounded-lg cursor-pointer hover:border-foreground/40 transition-colors ${!channelId ? 'opacity-50 pointer-events-none' : ''}`}>
        <span className="text-sm text-muted-foreground">
          {uploading ? '업로드 중...' : !channelId ? '채널을 먼저 선택하세요' : '클릭하거나 파일을 드래그 (PNG, JPG)'}
        </span>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={uploading || !channelId}
          onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])}
        />
      </label>

      {/* 이미지 그리드 */}
      {images.length === 0 ? (
        <div className="p-8 bg-background border border-dashed border-border rounded-lg text-center text-sm text-muted-foreground">
          이미지가 없습니다
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {images.map(img => (
            <div key={img.id} className="group rounded-lg overflow-hidden border border-border bg-accent">
              <div className={`${aspectClass} relative`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/r2/object/${img.r2_key}`}
                  alt={img.filename}
                  className="w-full h-full object-cover"
                />
                {img.is_cover === 1 && (
                  <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-primary text-primary-foreground text-[10px] font-medium rounded">
                    커버
                  </span>
                )}
              </div>
              <div className="p-1.5 flex gap-1">
                {img.is_cover !== 1 && (
                  <button
                    onClick={() => handleSetCover(img.id)}
                    className="flex-1 px-1.5 py-1 text-[10px] bg-background border border-border hover:border-foreground/40 text-foreground rounded transition-colors"
                  >
                    커버
                  </button>
                )}
                <button
                  onClick={() => handleDelete(img.id)}
                  className="px-1.5 py-1 text-[10px] bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 rounded transition-colors"
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export default function AssetsPage() {
  const { selectedChannel } = useChannel()
  const [activeTab, setActiveTab] = useState<'images' | 'r2' | 'midi'>('images')
  const [r2Objects, setR2Objects] = useState<{ key: string; size: number; uploaded: string }[]>([])
  const [r2Loading, setR2Loading] = useState(false)

  useEffect(() => {
    if (activeTab !== 'r2') return
    setR2Loading(true)
    fetch('/api/music-gen/assets/r2')
      .then(r => r.ok ? r.json() : { data: [] })
      .then(d => setR2Objects(Array.isArray(d) ? d : (d.data ?? [])))
      .finally(() => setR2Loading(false))
  }, [activeTab])

  const tabs = [
    { id: 'images', label: '배경 이미지' },
    { id: 'r2', label: 'R2 파일' },
    { id: 'midi', label: 'MIDI' },
  ] as const

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-foreground">에셋 라이브러리</h1>

      <div className="flex gap-0 border-b border-border">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'images' && (
        <div className="space-y-8">
          <ImageSection
            title="영상 이미지 업로드"
            description="YouTube 영상 배경으로 사용할 이미지 (16:9 권장)"
            channelId={selectedChannel?.id ?? null}
            imageType="video"
            aspectClass="aspect-video"
          />
          <div className="border-t border-border" />
          <ImageSection
            title="썸네일 배경이미지 업로드"
            description="YouTube 썸네일 배경으로 사용할 이미지 (1280×720 권장)"
            channelId={selectedChannel?.id ?? null}
            imageType="thumbnail"
            aspectClass="aspect-video"
          />
        </div>
      )}

      {activeTab === 'r2' && (
        <section className="space-y-3">
          {r2Loading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-accent rounded-lg animate-pulse" />)}
            </div>
          ) : r2Objects.length === 0 ? (
            <div className="p-8 bg-background border border-dashed border-border rounded-lg text-center text-sm text-muted-foreground">
              R2 버킷이 비어 있습니다
            </div>
          ) : (
            <div className="bg-background border border-border rounded-lg divide-y divide-border">
              {r2Objects.map(obj => {
                const ext = obj.key.split('.').pop()?.toLowerCase() ?? ''
                const isAudio = ['mp3', 'wav', 'ogg', 'flac'].includes(ext)
                const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)
                const filename = obj.key.split('/').pop() ?? obj.key
                const url = `/api/r2/object/${obj.key}`
                return (
                  <div key={obj.key} className="px-4 py-3 hover:bg-accent transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{filename}</p>
                        <div className="flex gap-3 mt-0.5">
                          <span className="text-xs text-muted-foreground">{formatBytes(obj.size)}</span>
                          <span className="text-xs text-muted-foreground">{new Date(obj.uploaded).toLocaleDateString('ko-KR')}</span>
                        </div>
                      </div>
                      {!isAudio && !isImage && (
                        <a href={url} download={filename} className="text-xs text-foreground hover:text-primary font-medium ml-4">다운로드</a>
                      )}
                    </div>
                    {isAudio && <audio controls src={url} className="w-full h-8 mt-2" />}
                    {isImage && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt={filename} className="mt-2 max-h-40 rounded object-contain" />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {activeTab === 'midi' && (
        <MidiSection />
      )}
    </div>
  )
}

function MidiSection() {
  const [midis, setMidis] = useState<{ id: string; source_url: string | null; bpm: number | null; key_signature: string | null; usage_count: number; created_at: number }[]>([])

  useEffect(() => {
    fetch('/api/music-gen/assets/midi')
      .then(r => r.ok ? r.json() : { data: [] })
      .then(d => setMidis(Array.isArray(d) ? d : (d.data ?? [])))
  }, [])

  if (midis.length === 0) {
    return (
      <div className="p-8 bg-background border border-dashed border-border rounded-lg text-center text-sm text-muted-foreground">
        아직 MIDI 마스터가 없습니다
      </div>
    )
  }

  return (
    <div className="bg-background border border-border rounded-lg divide-y divide-border">
      {midis.map(midi => (
        <div key={midi.id} className="px-4 py-3 flex items-center justify-between hover:bg-accent transition-colors">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {midi.source_url ? new URL(midi.source_url).pathname.split('/').pop() : midi.id.slice(0, 12)}
            </p>
            <div className="flex gap-3 mt-0.5">
              {midi.bpm && <span className="text-xs text-muted-foreground">{midi.bpm.toFixed(0)} BPM</span>}
              {midi.key_signature && <span className="text-xs text-muted-foreground">{midi.key_signature}</span>}
              <span className="text-xs text-muted-foreground">{midi.usage_count}회 사용</span>
            </div>
          </div>
          <span className="text-xs text-muted-foreground ml-4">{new Date(midi.created_at).toLocaleDateString('ko-KR')}</span>
        </div>
      ))}
    </div>
  )
}
