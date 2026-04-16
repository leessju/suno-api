'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'

interface Channel {
  id: number
  channel_name: string
  youtube_channel_id: string
  channel_handle?: string
}

interface ChannelContextValue {
  channels: Channel[]
  selectedChannel: Channel | null
  setSelectedChannel: (channel: Channel) => void
  isLoading: boolean
  channelThumbnails: Record<number, string>
  fetchThumbnail: (id: number) => void
}

const ChannelContext = createContext<ChannelContextValue>({
  channels: [],
  selectedChannel: null,
  setSelectedChannel: () => {},
  isLoading: true,
  channelThumbnails: {},
  fetchThumbnail: () => {},
})

export function useChannel() {
  return useContext(ChannelContext)
}

export function ChannelProvider({ children }: { children: ReactNode }) {
  const [channels, setChannels] = useState<Channel[]>([])
  const [selectedChannel, setSelectedChannelState] = useState<Channel | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [channelThumbnails, setChannelThumbnails] = useState<Record<number, string>>({})

  useEffect(() => {
    fetch('/api/music-gen/channels')
      .then(r => r.json())
      .then(data => {
        const list: Channel[] = data.data ?? data ?? []
        setChannels(list)

        const savedId = localStorage.getItem('selectedChannelId')
        const saved = savedId ? list.find(c => c.id === Number(savedId)) : null
        setSelectedChannelState(saved ?? list[0] ?? null)
      })
      .catch(console.error)
      .finally(() => setIsLoading(false))
  }, [])

  const fetchThumbnail = useCallback((id: number) => {
    if (channelThumbnails[id] !== undefined) return
    fetch(`/api/music-gen/channels/${id}/youtube-info`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const info = data?.data ?? data
        if (info?.thumbnail) {
          setChannelThumbnails(prev => ({ ...prev, [id]: info.thumbnail }))
        } else {
          setChannelThumbnails(prev => ({ ...prev, [id]: '' }))
        }
      })
      .catch(() => setChannelThumbnails(prev => ({ ...prev, [id]: '' })))
  }, [channelThumbnails])

  const setSelectedChannel = useCallback((channel: Channel) => {
    setSelectedChannelState(channel)
    localStorage.setItem('selectedChannelId', String(channel.id))
  }, [])

  return (
    <ChannelContext.Provider value={{ channels, selectedChannel, setSelectedChannel, isLoading, channelThumbnails, fetchThumbnail }}>
      {children}
    </ChannelContext.Provider>
  )
}
