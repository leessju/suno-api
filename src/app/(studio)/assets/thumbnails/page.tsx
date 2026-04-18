'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface CoverImage {
  id: number
  channel_id: number
  channel_name: string
  r2_key: string
  filename: string
  is_cover: number
  display_order: number
  created_at: number
}

function buildImageUrl(r2Key: string) {
  return `/api/r2/object/${r2Key}`
}

export default function ThumbnailsPage() {
  const [images, setImages] = useState<CoverImage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // back_images 전체 조회 (모든 채널) - is_cover 포함
    fetch('/api/music-gen/back-images/covers')
      .then(r => r.json())
      .then(d => setImages(Array.isArray(d) ? d : (d.data ?? [])))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/assets" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← 에셋
        </Link>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-xl font-semibold text-foreground">썸네일 관리</h1>
      </div>
      <p className="text-sm text-muted-foreground -mt-4">채널별 커버 이미지 (YouTube 썸네일)</p>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="aspect-video bg-accent rounded-lg animate-pulse" />
          ))}
        </div>
      ) : images.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <svg className="w-10 h-10 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
          </svg>
          <p>등록된 썸네일이 없습니다.</p>
          <p className="text-xs mt-1">채널 에셋 관리에서 커버 이미지를 추가하세요.</p>
          <Link href="/assets" className="mt-3 inline-block text-xs text-primary hover:underline">
            에셋 관리 →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {images.map(img => (
            <div key={img.id} className="group relative bg-background border border-border rounded-lg overflow-hidden hover:border-foreground/30 transition-colors">
              <div className="aspect-video bg-accent overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={buildImageUrl(img.r2_key)}
                  alt={img.filename}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              </div>
              <div className="p-2">
                <p className="text-xs font-medium text-foreground truncate">{img.channel_name}</p>
                <p className="text-[10px] text-muted-foreground truncate mt-0.5">{img.filename}</p>
              </div>
              {/* 채널 링크 */}
              <Link
                href={`/channels/${img.channel_id}`}
                className="absolute inset-0 opacity-0"
                aria-label={`${img.channel_name} 채널 보기`}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
