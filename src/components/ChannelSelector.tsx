'use client'

import { useEffect, useState } from 'react'

interface Channel {
  id: number
  channel_name: string
  youtube_channel_id: string
  channel_handle: string | null
  system_prompt: string
  resource_path: string | null
}

interface Props {
  value: number | null
  onChange: (channelId: number) => void
}

export function ChannelSelector({ value, onChange }: Props) {
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/music-gen/channels')
      .then(r => r.json())
      .then(data => setChannels(data.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="h-10 bg-accent rounded-lg animate-pulse" />
  }

  if (channels.length === 0) {
    return (
      <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg text-amber-700 dark:text-amber-400 text-sm">
        등록된 채널이 없습니다. 먼저 채널을 생성하세요.
      </div>
    )
  }

  return (
    <div className="grid gap-2">
      {channels.map(ch => (
        <button
          key={ch.id}
          onClick={() => onChange(ch.id)}
          className={`p-3 rounded-lg border text-left transition-colors ${
            value === ch.id
              ? 'border-foreground bg-accent text-foreground'
              : 'border-border bg-background/50 text-foreground hover:border-input '
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center text-xs font-bold text-foreground">
              {ch.channel_name[0]}
            </div>
            <div>
              <p className="font-medium text-sm">{ch.channel_name}</p>
              {ch.channel_handle && (
                <p className="text-xs text-muted-foreground">{ch.channel_handle}</p>
              )}
            </div>
            {value === ch.id && (
              <div className="ml-auto w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                <svg className="w-3 h-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
          </div>
        </button>
      ))}
    </div>
  )
}
