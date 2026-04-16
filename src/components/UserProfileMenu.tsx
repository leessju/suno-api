'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface UserProfileMenuProps {
  name: string
  email: string
  isAdmin?: boolean
}

export function UserProfileMenu({ name, email, isAdmin }: UserProfileMenuProps) {
  const [open, setOpen] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    // 마운트 시 아바타 로드
    fetch('/api/user/profile')
      .then(r => r.json())
      .then(d => {
        if (d.avatar_r2_key) setAvatarUrl(`/api/r2/object/${d.avatar_r2_key}?t=${Date.now()}`)
      })
      .catch(() => {})

    // 프로필 페이지에서 아바타 변경 시 즉시 반영
    function handleAvatarUpdate(e: Event) {
      const url = (e as CustomEvent<string | null>).detail
      setAvatarUrl(url)
    }
    window.addEventListener('profileAvatarUpdated', handleAvatarUpdate)

    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)

    return () => {
      window.removeEventListener('profileAvatarUpdated', handleAvatarUpdate)
      document.removeEventListener('mousedown', handleClick)
    }
  }, [])

  async function handleSignOut() {
    await fetch('/api/auth/sign-out', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  const displayName = name || email.split('@')[0] || '프로필'

  return (
    <div className="relative" ref={ref}>
      {/* 트리거: 이름 + chevron */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-8 h-8 rounded-full overflow-hidden bg-white dark:bg-neutral-200 flex items-center justify-center hover:opacity-80 transition-opacity flex-shrink-0 border border-border"
        title={displayName}
      >
        {avatarUrl ? (
          <Image src={avatarUrl} alt={displayName} width={32} height={32} className="object-cover w-full h-full" unoptimized />
        ) : (
          <svg className="w-5 h-5 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
        )}
      </button>

      {/* 드롭다운 */}
      {open && (
        <div className="absolute right-0 top-9 w-52 bg-background border border-border rounded-lg shadow-lg py-1 z-50">
          {/* 유저 정보 */}
          <div className="px-3 py-2.5 border-b border-border">
            <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
            <p className="text-xs text-muted-foreground truncate mt-0.5">{email}</p>
          </div>

          <Link
            href="/settings/profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-accent"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            프로필 편집
          </Link>

          <Link
            href="/settings/suno-accounts"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-accent"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
            </svg>
            Suno 계정 관리
          </Link>

          <Link
            href="/settings/telegram"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-accent"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
            텔레그램 설정
          </Link>

          {isAdmin && (
            <div className="border-t border-border mt-1 pt-1">
              <p className="px-3 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">관리</p>
              <Link
                href="/admin/users"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-accent"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
                회원 권한 관리
              </Link>
              <Link
                href="/admin/queue"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-accent"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
                </svg>
                Job 큐
              </Link>
            </div>
          )}

          <div className="border-t border-border mt-1 pt-1">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-left"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              로그아웃
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
