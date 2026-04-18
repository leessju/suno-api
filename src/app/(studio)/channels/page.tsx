'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Channel {
  id: number
  channel_name: string
  channel_handle: string | null
  youtube_channel_id: string | null
  system_prompt: string
}

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([])
  const [thumbnails, setThumbnails] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/music-gen/channels')
      .then(r => r.json())
      .then(d => {
        const list: Channel[] = Array.isArray(d) ? d : (d.data ?? [])
        setChannels(list)
        // 각 채널 썸네일 병렬 fetch
        list.forEach(ch => {
          fetch(`/api/music-gen/channels/${ch.id}/youtube-info`)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
              const info = data?.data ?? data
              if (info?.thumbnail) {
                setThumbnails(prev => ({ ...prev, [ch.id]: info.thumbnail }))
              }
            })
            .catch(() => {})
        })
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">채널</h1>
          <p className="text-sm text-muted-foreground mt-1">YouTube 채널 및 시스템 프롬프트 관리</p>
        </div>
        <Link
          href="/channels/new"
          className="px-3 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium rounded-md transition-colors"
        >
          + 채널 추가
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 bg-accent rounded-lg animate-pulse" />
          ))}
        </div>
      ) : channels.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">채널이 없습니다. 채널을 추가하세요.</div>
      ) : (
        <div className="space-y-2">
          {channels.map(ch => {
            const thumbnail = thumbnails[ch.id] ?? null
            return (
              <Link
                key={ch.id}
                href={`/channels/${ch.youtube_channel_id}`}
                className="flex items-center gap-4 bg-background border border-border rounded-lg px-4 py-3 hover:border-foreground/40 transition-colors"
              >
                {/* 아바타 */}
                <div className="w-12 h-12 rounded-full overflow-hidden bg-accent border border-border flex-shrink-0 flex items-center justify-center">
                  {thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbnail} alt={ch.channel_name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-base font-semibold text-muted-foreground">
                      {ch.channel_name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>

                {/* 이름 + 핸들 */}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground text-sm">{ch.channel_name}</p>
                  {ch.channel_handle ? (
                    <p className="text-xs text-muted-foreground mt-0.5">@{ch.channel_handle}</p>
                  ) : ch.youtube_channel_id ? (
                    <p className="text-xs text-muted-foreground mt-0.5">{ch.youtube_channel_id}</p>
                  ) : null}
                </div>

                <svg className="w-4 h-4 text-muted-foreground flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
