'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface UserProfileMenuProps {
  name: string
  email: string
  isAdmin?: boolean
}

export function UserProfileMenu({ name, email }: UserProfileMenuProps) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    fetch('/api/user/profile')
      .then(r => r.json())
      .then(d => {
        if (d.avatar_r2_key) setAvatarUrl(`/api/r2/object/${d.avatar_r2_key}?t=${Date.now()}`)
      })
      .catch(() => {})

    function handleAvatarUpdate(e: Event) {
      const url = (e as CustomEvent<string | null>).detail
      setAvatarUrl(url)
    }
    window.addEventListener('profileAvatarUpdated', handleAvatarUpdate)
    return () => window.removeEventListener('profileAvatarUpdated', handleAvatarUpdate)
  }, [])

  async function handleSignOut() {
    await fetch('/api/auth/sign-out', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  const displayName = name || email.split('@')[0] || '프로필'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
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
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-52">
        <div className="px-3 py-2.5 border-b border-border">
          <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
          <p className="text-xs text-muted-foreground truncate mt-0.5">{email}</p>
        </div>

        <DropdownMenuItem asChild>
          <Link href="/settings/profile" className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground cursor-pointer">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            프로필 편집
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleSignOut}
          className="flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400 focus:bg-red-50 dark:focus:bg-red-900/20 cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          로그아웃
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
