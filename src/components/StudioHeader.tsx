'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { Menu } from 'lucide-react'
import { useChannel } from './ChannelProvider'
import { useSunoAccount } from './SunoAccountProvider'
import { ThemeToggle } from './ThemeToggle'
import { UserProfileMenu } from './UserProfileMenu'
import { Breadcrumb } from './Breadcrumb'
import { useSideNav } from './SideNavProvider'
import { useJobStats } from '@/hooks/useJobStats'
import { GlobalPlayBar } from './GlobalPlayBar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface StudioHeaderProps {
  userName: string
  userEmail: string
  isAdmin?: boolean
}

export function StudioHeader({ userName, userEmail, isAdmin }: StudioHeaderProps) {
  const { channels, selectedChannel, setSelectedChannel, isLoading: channelLoading } = useChannel()
  const { accounts, selectedAccount, setSelectedAccount, isLoading: accountLoading } = useSunoAccount()
  const { collapsed, toggleCollapsed, toggleMobile } = useSideNav()
  const jobStats = useJobStats()
  const [mounted, setMounted] = useState(false)
  const [channelThumbnails, setChannelThumbnails] = useState<Record<number, string>>({})

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

  const channelThumbnail = selectedChannel ? (channelThumbnails[selectedChannel.id] ?? null) : null

  function prefetchChannelThumbnails() {
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
  }

  return (
    <header className="h-16 flex-shrink-0 bg-background border-b border-border flex z-10">
      {/* 좌측: 로고 영역 (사이드바 폭과 동기화) */}
      <div className={`flex-shrink-0 flex items-center md:border-r border-border transition-all duration-200 ${collapsed ? 'w-12 justify-center px-0' : 'w-auto md:w-64 px-4'}`}>
        {/* 모바일 햄버거 버튼 */}
        <button
          onClick={toggleMobile}
          className="md:hidden p-1.5 mr-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors flex-shrink-0"
          aria-label="메뉴 열기"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <Link href="/" className="flex items-center gap-2 text-foreground overflow-hidden">
          <svg width="36" height="36" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="flex-shrink-0">
            <path d="M20 5C11.7157 5 5 11.7157 5 20C5 28.2843 11.7157 35 20 35C28.2843 35 35 28.2843 35 20" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/>
            <circle cx="20" cy="20" r="4" fill="#00E5FF"/>
            <path d="M20 12V8" stroke="#00E5FF" strokeWidth="3" strokeLinecap="round"/>
            <path d="M28 20H32" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.3"/>
          </svg>
          <span className={`hidden md:inline font-inter text-xl tracking-[0.04em] whitespace-nowrap transition-all duration-200 ${collapsed ? 'opacity-0 w-0' : 'opacity-100'}`} style={{ fontWeight: 400 }}>SyncLens</span>
        </Link>
        {!collapsed && (
          <button onClick={toggleCollapsed} title="메뉴 접기"
            className="hidden md:flex ml-auto p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors flex-shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        )}
      </div>

      {/* 우측: 브레드크럼 + 컨트롤 */}
      <div className="flex-1 min-w-0 flex items-center px-3 sm:px-6 lg:px-8 gap-2">
        <div className="hidden md:block min-w-0 overflow-hidden flex-shrink">
          <Breadcrumb />
        </div>

        <div className="ml-auto flex items-center gap-3">
          {/* 글로벌 플레이어 (컴팩트) — 데스크탑 전용 */}
          <div className="hidden md:flex">
            <GlobalPlayBar />
          </div>

          {/* 모바일: 크레딧 배지 */}
          {mounted && !accountLoading && selectedAccount?.credits != null && (() => {
            const c = selectedAccount.credits.credits_left
            const level = c <= 50 ? 'critical' : c <= 100 ? 'warning' : 'ok'
            const styles = {
              ok:       { badge: 'bg-emerald-500/10 border-emerald-500/20', num: 'text-emerald-500', sub: 'text-emerald-500/70' },
              warning:  { badge: 'bg-orange-500/10 border-orange-500/30',   num: 'text-orange-500', sub: 'text-orange-500/70'   },
              critical: { badge: 'bg-red-500/10 border-red-500/30',          num: 'text-red-500',    sub: 'text-red-500/70'      },
            }[level]
            return (
              <span className={`sm:hidden inline-flex items-center gap-1 px-2 py-0.5 rounded-full whitespace-nowrap border ${styles.badge}`}>
                {level === 'critical' && (
                  <svg className="w-3 h-3 text-red-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                )}
                <span className={`text-xs font-bold tabular-nums ${styles.num}`}>{c.toLocaleString()}</span>
                <span className={`text-[10px] font-medium ${styles.sub}`}>cr</span>
              </span>
            )
          })()}

          {/* Suno 계정 선택 + 크레딧 (마운트 후, 계정 있을 때만) */}
          {mounted && !accountLoading && accounts.length > 0 && (
            <div className="hidden sm:flex items-center gap-2">
              {selectedAccount?.credits != null && (() => {
                const c = selectedAccount.credits.credits_left
                const level = c <= 50 ? 'critical' : c <= 100 ? 'warning' : 'ok'
                const styles = {
                  ok:       { badge: 'bg-emerald-500/10 border-emerald-500/20', num: 'text-emerald-500', sub: 'text-emerald-500/70' },
                  warning:  { badge: 'bg-orange-500/10 border-orange-500/30',   num: 'text-orange-500', sub: 'text-orange-500/70'   },
                  critical: { badge: 'bg-red-500/10 border-red-500/30',          num: 'text-red-500',    sub: 'text-red-500/70'      },
                }[level]
                return (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full whitespace-nowrap border ${styles.badge}`}>
                    {level === 'critical' && (
                      <svg className="w-3 h-3 text-red-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                      </svg>
                    )}
                    <span className={`text-xs font-bold tabular-nums ${styles.num}`}>{c.toLocaleString()}</span>
                    <span className={`text-[10px] font-medium ${styles.sub}`}>credits</span>
                  </span>
                )
              })()}
              <Select
                value={selectedAccount?.id?.toString() ?? ''}
                onValueChange={val => {
                  const acc = accounts.find(a => a.id === Number(val))
                  if (acc) setSelectedAccount(acc)
                }}
              >
                <SelectTrigger className="h-7 text-xs max-w-[160px]">
                  <SelectValue placeholder="계정 선택" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map(a => (
                    <SelectItem key={a.id} value={a.id.toString()} className="text-xs">
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="hidden md:block h-4 w-px bg-border" />
            </div>
          )}

          {/* 채널 선택 — shadcn DropdownMenu */}
          {mounted && (
            <div className="relative">
              {channelLoading ? (
                <div className="h-7 w-36 bg-muted rounded animate-pulse" />
              ) : (
                <DropdownMenu onOpenChange={open => { if (open) prefetchChannelThumbnails() }}>
                  <DropdownMenuTrigger asChild>
                    <button className="h-7 flex items-center gap-1.5 pl-1.5 pr-2 rounded-md border border-input bg-background text-foreground hover:border-foreground/40 transition-colors text-sm cursor-pointer">
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
                      <span className="hidden sm:inline max-w-[120px] truncate">
                        {selectedChannel?.channel_handle
                          ? `@${selectedChannel.channel_handle}`
                          : selectedChannel?.channel_name ?? '채널 선택'}
                      </span>
                      <svg className="w-3 h-3 text-muted-foreground flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    {channels.map(ch => {
                      const thumb = channelThumbnails[ch.id] ?? null
                      const isSelected = ch.id === selectedChannel?.id
                      return (
                        <DropdownMenuItem
                          key={ch.id}
                          onClick={() => setSelectedChannel(ch)}
                          className={`flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer ${isSelected ? 'bg-accent' : ''}`}
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
                        </DropdownMenuItem>
                      )
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )}

          <div className="hidden md:block h-4 w-px bg-border" />

          <UserProfileMenu name={userName} email={userEmail} isAdmin={isAdmin} />

          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
