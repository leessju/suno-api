'use client'

import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import { useChannel } from './ChannelProvider'
import { useSunoAccount } from './SunoAccountProvider'
import { ThemeToggle } from './ThemeToggle'
import { UserProfileMenu } from './UserProfileMenu'
import { Breadcrumb } from './Breadcrumb'
import { useSideNav } from './SideNavProvider'

interface StudioHeaderProps {
  userName: string
  userEmail: string
  isAdmin?: boolean
}

export function StudioHeader({ userName, userEmail, isAdmin }: StudioHeaderProps) {
  const { channels, selectedChannel, setSelectedChannel, isLoading: channelLoading } = useChannel()
  const { accounts, selectedAccount, setSelectedAccount, isLoading: accountLoading } = useSunoAccount()
  const { collapsed } = useSideNav()
  const [mounted, setMounted] = useState(false)
  const [channelThumbnails, setChannelThumbnails] = useState<Record<number, string>>({})
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setMounted(true) }, [])

  // 채널별 썸네일 캐시
  useEffect(() => {
    if (!selectedChannel || channelThumbnails[selectedChannel.id] !== undefined) return
    fetch(`/api/music-gen/channels/${selectedChannel.id}/youtube-info`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const info = data?.data ?? data
        if (info?.thumbnail) {
          setChannelThumbnails(prev => ({ ...prev, [selectedChannel.id]: info.thumbnail }))
        }
      })
      .catch(() => {})
  }, [selectedChannel?.id])

  // 드롭다운 열릴 때 모든 채널 썸네일 프리패치
  useEffect(() => {
    if (!dropdownOpen) return
    channels.forEach(ch => {
      if (channelThumbnails[ch.id] !== undefined) return
      fetch(`/api/music-gen/channels/${ch.id}/youtube-info`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          const info = data?.data ?? data
          if (info?.thumbnail) {
            setChannelThumbnails(prev => ({ ...prev, [ch.id]: info.thumbnail }))
          }
        })
        .catch(() => {})
    })
  }, [dropdownOpen])

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const channelThumbnail = selectedChannel ? (channelThumbnails[selectedChannel.id] ?? null) : null

  return (
    <header className="h-16 flex-shrink-0 bg-background border-b border-border flex z-10">
      {/* 좌측: 로고 영역 (사이드바 폭과 동기화) */}
      <div className={`flex-shrink-0 flex items-center border-r border-border transition-all duration-200 ${collapsed ? 'w-12 justify-center px-0' : 'w-64 px-4'}`}>
        <Link href="/" className="flex items-center gap-2 text-foreground overflow-hidden">
          <svg width="36" height="36" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="flex-shrink-0">
            <path d="M20 5C11.7157 5 5 11.7157 5 20C5 28.2843 11.7157 35 20 35C28.2843 35 35 28.2843 35 20" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/>
            <circle cx="20" cy="20" r="4" fill="#00E5FF"/>
            <path d="M20 12V8" stroke="#00E5FF" strokeWidth="3" strokeLinecap="round"/>
            <path d="M28 20H32" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.3"/>
          </svg>
          <span className={`font-inter text-xl tracking-[0.04em] whitespace-nowrap transition-all duration-200 ${collapsed ? 'opacity-0 w-0' : 'opacity-100'}`} style={{ fontWeight: 400 }}>SyncLens</span>
        </Link>
      </div>

      {/* 우측: 브레드크럼 + 컨트롤 */}
      <div className="flex-1 min-w-0 flex items-center px-4 sm:px-6 lg:px-8 gap-3">
        <Breadcrumb />

        <div className="ml-auto flex items-center gap-3">
          {/* Suno 계정 선택 + 크레딧 (마운트 후, 계정 있을 때만) */}
          {mounted && !accountLoading && accounts.length > 0 && (
            <>
              <div className="flex items-center gap-2">
                {selectedAccount?.credits != null && (
                  <span className="text-xs font-semibold text-foreground tabular-nums whitespace-nowrap">
                    {selectedAccount.credits.credits_left.toLocaleString()} credits
                  </span>
                )}
                <select
                  value={selectedAccount?.id ?? ''}
                  onChange={e => {
                    const acc = accounts.find(a => a.id === Number(e.target.value))
                    if (acc) setSelectedAccount(acc)
                  }}
                  className="h-7 pl-2 pr-6 text-xs rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer max-w-[160px] truncate"
                >
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.label}</option>
                  ))}
                </select>
              </div>

              <div className="h-4 w-px bg-border" />
            </>
          )}

          {/* 채널 선택 — 커스텀 드롭다운 */}
          {mounted && (
            <div className="relative" ref={dropdownRef}>
              {channelLoading ? (
                <div className="h-7 w-36 bg-muted rounded animate-pulse" />
              ) : (
                <>
                  <button
                    onClick={() => setDropdownOpen(o => !o)}
                    className="h-7 flex items-center gap-1.5 pl-1.5 pr-2 rounded-md border border-input bg-background text-foreground hover:border-foreground/40 transition-colors text-sm cursor-pointer"
                  >
                    <div className="w-5 h-5 rounded-full overflow-hidden bg-accent border border-border flex-shrink-0 flex items-center justify-center">
                      {channelThumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={channelThumbnail} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[9px] font-medium text-muted-foreground">
                          {selectedChannel?.channel_name?.charAt(0).toUpperCase() ?? 'C'}
                        </span>
                      )}
                    </div>
                    <span className="max-w-[120px] truncate">
                      {selectedChannel?.channel_handle
                        ? `@${selectedChannel.channel_handle}`
                        : selectedChannel?.channel_name ?? '채널 선택'}
                    </span>
                    <svg className="w-3 h-3 text-muted-foreground flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {dropdownOpen && (
                    <div className="absolute right-0 top-full mt-1 w-52 bg-background border border-border rounded-lg shadow-lg overflow-hidden z-50">
                      {channels.map(ch => {
                        const thumb = channelThumbnails[ch.id] ?? null
                        const isSelected = ch.id === selectedChannel?.id
                        return (
                          <button
                            key={ch.id}
                            onClick={() => {
                              setSelectedChannel(ch)
                              setDropdownOpen(false)
                            }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                              isSelected
                                ? 'bg-accent text-foreground'
                                : 'text-foreground hover:bg-accent'
                            }`}
                          >
                            <div className="w-7 h-7 rounded-full overflow-hidden bg-accent border border-border flex-shrink-0 flex items-center justify-center">
                              {thumb ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={thumb} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-[10px] font-medium text-muted-foreground">
                                  {ch.channel_name?.charAt(0).toUpperCase()}
                                </span>
                              )}
                            </div>
                            <div className="min-w-0 text-left">
                              <p className="font-medium truncate text-xs">{ch.channel_name}</p>
                              {ch.channel_handle && (
                                <p className="text-[10px] text-muted-foreground truncate">@{ch.channel_handle}</p>
                              )}
                            </div>
                            {isSelected && (
                              <svg className="w-3.5 h-3.5 text-foreground flex-shrink-0 ml-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div className="h-4 w-px bg-border" />

          <UserProfileMenu name={userName} email={userEmail} isAdmin={isAdmin} />

          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
