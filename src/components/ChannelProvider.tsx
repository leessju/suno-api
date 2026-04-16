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
}

const ChannelContext = createContext<ChannelContextValue>({
  channels: [],
  selectedChannel: null,
  setSelectedChannel: () => {},
  isLoading: true,
})

export function useChannel() {
  return useContext(ChannelContext)
}

export function ChannelProvider({ children }: { children: ReactNode }) {
  const [channels, setChannels] = useState<Channel[]>([])
  const [selectedChannel, setSelectedChannelState] = useState<Channel | null>(null)
  const [isLoading, setIsLoading] = useState(true)

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

  const setSelectedChannel = useCallback((channel: Channel) => {
    setSelectedChannelState(channel)
    localStorage.setItem('selectedChannelId', String(channel.id))
  }, [])

  return (
    <ChannelContext.Provider value={{ channels, selectedChannel, setSelectedChannel, isLoading }}>
      {children}
    </ChannelContext.Provider>
  )
}
