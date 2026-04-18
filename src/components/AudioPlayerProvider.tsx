'use client'

import {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
  useMemo,
  useEffect,
  ReactNode,
} from 'react'

export interface AudioTrack {
  id: string
  title: string
  audioUrl: string
  imageUrl?: string
  subtitle?: string
}

interface TimeState {
  currentTime: number
  duration: number
}

type TimeSubscriber = (state: TimeState) => void

interface AudioPlayerContextValue {
  currentTrack: AudioTrack | null
  playlist: AudioTrack[]
  currentIndex: number
  isPlaying: boolean
  volume: number
  play: (track: AudioTrack) => void
  playList: (tracks: AudioTrack[], startIndex: number) => void
  pause: () => void
  resume: () => void
  togglePlay: () => void
  next: () => void
  previous: () => void
  seek: (time: number) => void
  setVolume: (v: number) => void
  stop: () => void
  clearQueue: () => void
  subscribe: (cb: TimeSubscriber) => () => void
}

const AudioPlayerContext = createContext<AudioPlayerContextValue | null>(null)

function filenameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname
    const parts = pathname.split('/')
    const raw = parts[parts.length - 1] ?? ''
    const decoded = decodeURIComponent(raw)
    return decoded.replace(/\.[^/.]+$/, '') || url
  } catch {
    const parts = url.split('/')
    const raw = parts[parts.length - 1] ?? ''
    return raw.replace(/\.[^/.]+$/, '') || url
  }
}

export function AudioPlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const subscribersRef = useRef<Set<TimeSubscriber>>(new Set())

  const [currentTrack, setCurrentTrack] = useState<AudioTrack | null>(null)
  const [playlist, setPlaylist] = useState<AudioTrack[]>([])
  const [currentIndex, setCurrentIndex] = useState<number>(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolumeState] = useState(1)

  // Keep refs for latest state inside callbacks to avoid stale closures
  const playlistRef = useRef<AudioTrack[]>([])
  const currentIndexRef = useRef<number>(-1)
  const isPlayingRef = useRef(false)

  useEffect(() => { playlistRef.current = playlist }, [playlist])
  useEffect(() => { currentIndexRef.current = currentIndex }, [currentIndex])
  useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])

  const loadAndPlay = useCallback((track: AudioTrack) => {
    const audio = audioRef.current
    if (!audio) return
    audio.src = track.audioUrl
    audio.volume = volume
    audio.play().catch(() => setIsPlaying(false))
    setCurrentTrack(track)
    setIsPlaying(true)
  }, [volume])

  const next = useCallback(() => {
    const list = playlistRef.current
    const idx = currentIndexRef.current
    if (idx < list.length - 1) {
      const nextIdx = idx + 1
      setCurrentIndex(nextIdx)
      loadAndPlay(list[nextIdx])
    } else {
      setIsPlaying(false)
    }
  }, [loadAndPlay])

  const play = useCallback((track: AudioTrack) => {
    if (currentTrack?.id === track.id) {
      // Same track — toggle instead
      const audio = audioRef.current
      if (!audio) return
      if (isPlayingRef.current) {
        audio.pause()
        setIsPlaying(false)
      } else {
        audio.play().catch(() => setIsPlaying(false))
        setIsPlaying(true)
      }
      return
    }
    // 새 곡을 맨 앞에 삽입하고 바로 재생, 기존 곡은 뒤로 밀림
    const rest = playlistRef.current.filter(t => t.id !== track.id)
    setPlaylist([track, ...rest])
    setCurrentIndex(0)
    loadAndPlay(track)
  }, [currentTrack, loadAndPlay])

  const playList = useCallback((tracks: AudioTrack[], startIndex: number) => {
    if (tracks.length === 0) return
    const idx = Math.max(0, Math.min(startIndex, tracks.length - 1))
    setPlaylist(tracks)
    setCurrentIndex(idx)
    loadAndPlay(tracks[idx])
  }, [loadAndPlay])

  const pause = useCallback(() => {
    audioRef.current?.pause()
    setIsPlaying(false)
  }, [])

  const resume = useCallback(() => {
    audioRef.current?.play().catch(() => setIsPlaying(false))
    setIsPlaying(true)
  }, [])

  const togglePlay = useCallback(() => {
    if (isPlayingRef.current) {
      audioRef.current?.pause()
      setIsPlaying(false)
    } else {
      audioRef.current?.play().catch(() => setIsPlaying(false))
      setIsPlaying(true)
    }
  }, [])

  const previous = useCallback(() => {
    const list = playlistRef.current
    const idx = currentIndexRef.current
    if (idx > 0) {
      const prevIdx = idx - 1
      setCurrentIndex(prevIdx)
      loadAndPlay(list[prevIdx])
    }
  }, [loadAndPlay])

  const seek = useCallback((time: number) => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = time
  }, [])

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v))
    setVolumeState(clamped)
    if (audioRef.current) {
      audioRef.current.volume = clamped
    }
  }, [])

  const stop = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.src = ''
    }
    setIsPlaying(false)
    setCurrentTrack(null)
    setPlaylist([])
    setCurrentIndex(-1)
  }, [])

  const clearQueue = useCallback(() => {
    const audio = audioRef.current
    const src = audio?.src ?? ''
    setPlaylist(prev => {
      const idx = currentIndexRef.current
      if (idx >= 0 && idx < prev.length) {
        return [prev[idx]]
      }
      // fallback: src로 현재 트랙 찾기
      const found = prev.find(t => src.includes(t.audioUrl) || t.audioUrl === src)
      return found ? [found] : prev.slice(0, 1)
    })
    setCurrentIndex(0)
  }, [])

  const subscribe = useCallback((cb: TimeSubscriber): (() => void) => {
    subscribersRef.current.add(cb)
    return () => { subscribersRef.current.delete(cb) }
  }, [])

  // Wire up audio element event listeners once on mount
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleTimeUpdate = () => {
      const state: TimeState = {
        currentTime: audio.currentTime,
        duration: isNaN(audio.duration) ? 0 : audio.duration,
      }
      subscribersRef.current.forEach(cb => cb(state))
    }

    const handleEnded = () => {
      const list = playlistRef.current
      const idx = currentIndexRef.current
      if (idx < list.length - 1) {
        const nextIdx = idx + 1
        setCurrentIndex(nextIdx)
        loadAndPlay(list[nextIdx])
      } else {
        setIsPlaying(false)
      }
    }

    const handleError = () => {
      const list = playlistRef.current
      const idx = currentIndexRef.current
      if (list.length > 1 && idx < list.length - 1) {
        const nextIdx = idx + 1
        setCurrentIndex(nextIdx)
        loadAndPlay(list[nextIdx])
      } else {
        setIsPlaying(false)
      }
    }

    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('error', handleError)

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('error', handleError)
    }
  }, [loadAndPlay])

  // Bridge: intercept rogue <audio> elements playing outside this provider
  useEffect(() => {
    const handleCapture = (e: Event) => {
      const target = e.target as HTMLElement
      if (
        target.tagName !== 'AUDIO' ||
        target.hasAttribute('data-global-player') ||
        target.hasAttribute('data-no-bridge')
      ) {
        return
      }
      const rogueAudio = target as HTMLAudioElement
      rogueAudio.pause()
      const src = rogueAudio.src || rogueAudio.currentSrc
      if (!src) return
      play({
        id: 'bridge-' + src.slice(-8),
        title: filenameFromUrl(src),
        audioUrl: src,
      })
    }

    document.addEventListener('play', handleCapture, true)
    return () => document.removeEventListener('play', handleCapture, true)
  }, [play])

  const contextValue = useMemo<AudioPlayerContextValue>(() => ({
    currentTrack,
    playlist,
    currentIndex,
    isPlaying,
    volume,
    play,
    playList,
    pause,
    resume,
    togglePlay,
    next,
    previous,
    seek,
    setVolume,
    stop,
    clearQueue,
    subscribe,
  }), [
    currentTrack,
    playlist,
    currentIndex,
    isPlaying,
    volume,
    play,
    playList,
    pause,
    resume,
    togglePlay,
    next,
    previous,
    seek,
    setVolume,
    stop,
    clearQueue,
    subscribe,
  ])

  return (
    <AudioPlayerContext.Provider value={contextValue}>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} data-global-player style={{ display: 'none' }} />
      {children}
    </AudioPlayerContext.Provider>
  )
}

export function useAudioPlayer(): AudioPlayerContextValue {
  const ctx = useContext(AudioPlayerContext)
  if (!ctx) {
    throw new Error('useAudioPlayer must be used within an AudioPlayerProvider')
  }
  return ctx
}
