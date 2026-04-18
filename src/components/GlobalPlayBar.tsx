'use client'

import { useState, useEffect } from 'react'
import { useAudioPlayer } from '@/components/AudioPlayerProvider'
import { useToast } from '@/components/Toast'

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function GlobalPlayBar({ variant = 'header' }: { variant?: 'header' | 'mobile' }) {
  const { currentTrack, playlist, currentIndex, isPlaying, togglePlay, next, previous, seek, stop, clearQueue, subscribe } =
    useAudioPlayer()

  const { toast } = useToast()
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    return subscribe(({ currentTime, duration }) => {
      setCurrentTime(currentTime)
      setDuration(duration)
    })
  }, [subscribe])

  if (!currentTrack) return null

  const title = currentTrack.title || '재생 중...'
  const showSkip = playlist.length > 1

  if (variant === 'mobile') {
    return (
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-sm px-4 py-2.5 flex items-center gap-2">
        {/* 썸네일 + 제목 */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {currentTrack.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={currentTrack.imageUrl} alt="" className="w-7 h-7 rounded object-cover flex-shrink-0" />
          )}
          <p className="text-xs font-medium truncate text-foreground leading-tight">{title}</p>
          {playlist.length > 1 && (
            <button
              onClick={() => { const cnt = playlist.length - 1; clearQueue(); toast(`대기열 ${cnt}곡 제거됨`) }}
              title="큐 비우기"
              className="text-[9px] text-muted-foreground hover:text-foreground tabular-nums flex-shrink-0 transition-colors"
            >
              {currentIndex + 1}/{playlist.length}
            </button>
          )}
        </div>

        {/* 이전 */}
        {showSkip && (
          <button onClick={previous} className="p-1 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0" aria-label="이전">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="4" y="5" width="2" height="14" rx="1" />
              <path d="M19 5l-10 7 10 7V5z" />
            </svg>
          </button>
        )}

        {/* 재생/일시정지 */}
        <button onClick={togglePlay} className="p-1.5 rounded-full bg-foreground text-background hover:opacity-80 transition-opacity flex-shrink-0" aria-label={isPlaying ? '일시정지' : '재생'}>
          {isPlaying ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <rect x="5" y="4" width="4" height="16" rx="1" />
              <rect x="15" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5 4l15 8-15 8V4z" />
            </svg>
          )}
        </button>

        {/* 다음 */}
        {showSkip && (
          <button onClick={next} className="p-1 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0" aria-label="다음">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="18" y="5" width="2" height="14" rx="1" />
              <path d="M5 5l10 7-10 7V5z" />
            </svg>
          </button>
        )}

        {/* 프로그레스 바 */}
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={currentTime}
          onChange={e => seek(Number(e.target.value))}
          className="w-20 h-1 accent-foreground cursor-pointer flex-shrink-0"
          aria-label="재생 위치"
        />

        {/* 시간 */}
        <span className="text-[10px] text-muted-foreground tabular-nums flex-shrink-0">
          {formatTime(currentTime)}/{formatTime(duration)}
        </span>

        {/* 닫기 */}
        <button onClick={stop} className="p-1 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0" aria-label="닫기">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5 h-8 px-4 py-2.5 rounded-full border border-border bg-accent/50">
      {/* 썸네일 + 제목 */}
      <div className="flex items-center gap-1.5 min-w-0 max-w-[120px]">
        {currentTrack.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={currentTrack.imageUrl} alt="" className="w-6 h-6 rounded object-cover flex-shrink-0" />
        )}
        <p className="text-xs font-medium truncate text-foreground leading-tight">{title}</p>
        {playlist.length > 1 && (
          <button onClick={() => { const cnt = playlist.length - 1; clearQueue(); toast(`대기열 ${cnt}곡 제거됨`) }} title="큐 비우기" className="text-[9px] text-muted-foreground hover:text-foreground tabular-nums flex-shrink-0 transition-colors">
            {currentIndex + 1}/{playlist.length}
          </button>
        )}
      </div>

      {/* 이전 */}
      {showSkip && (
        <button onClick={previous} className="p-0.5 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0" aria-label="이전">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <rect x="4" y="5" width="2" height="14" rx="1" />
            <path d="M19 5l-10 7 10 7V5z" />
          </svg>
        </button>
      )}

      {/* 재생/일시정지 */}
      <button onClick={togglePlay} className="p-1 rounded-full bg-foreground text-background hover:opacity-80 transition-opacity flex-shrink-0" aria-label={isPlaying ? '일시정지' : '재생'}>
        {isPlaying ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <rect x="5" y="4" width="4" height="16" rx="1" />
            <rect x="15" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M5 4l15 8-15 8V4z" />
          </svg>
        )}
      </button>

      {/* 다음 */}
      {showSkip && (
        <button onClick={next} className="p-0.5 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0" aria-label="다음">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <rect x="18" y="5" width="2" height="14" rx="1" />
            <path d="M5 5l10 7-10 7V5z" />
          </svg>
        </button>
      )}

      {/* 프로그레스 바 */}
      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={currentTime}
        onChange={e => seek(Number(e.target.value))}
        className="hidden sm:block w-12 h-1 accent-foreground cursor-pointer flex-shrink-0"
        aria-label="재생 위치"
      />

      {/* 시간 */}
      <span className="hidden sm:inline text-[10px] text-muted-foreground tabular-nums flex-shrink-0">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>

      {/* 닫기 */}
      <button onClick={stop} className="p-0.5 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0" aria-label="닫기">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  )
}
