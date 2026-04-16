'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { WorkspaceTree } from './WorkspaceTree'

interface Section {
  id: string
  label: string
  icon: React.ReactNode
  items: { href: string; label: string }[]
  custom?: React.ReactNode
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-3.5 h-3.5 transition-transform duration-150 ${open ? 'rotate-90' : 'rotate-0'}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  )
}

const SignalIcon = () => (
  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z" />
  </svg>
)
const FolderIcon = () => (
  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
  </svg>
)
const PianoIcon = () => (
  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
  </svg>
)
const MusicalNotesIcon = () => (
  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
  </svg>
)
const FilmIcon = () => (
  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125h-1.5m1.5-1.5v-1.5c0-.621-.504-1.125-1.125-1.125M6 5.625v1.5c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125v-1.5M6 5.625C6 5.004 6.504 4.5 7.125 4.5h9.75C17.496 4.5 18 5.004 18 5.625m0 0h-12" />
  </svg>
)
const UploadIcon = () => (
  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.338-2.32 5.75 5.75 0 011.344 11.098" />
  </svg>
)
const PhotoIcon = () => (
  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
  </svg>
)
const ShieldCheckIcon = () => (
  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
  </svg>
)
const SettingsIcon = () => (
  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)

const navItemBase = "flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors rounded-sm"
const navItemActive = "bg-accent text-foreground"
const navItemInactive = "text-muted-foreground hover:text-foreground hover:bg-accent"

const iconItemActive = "bg-accent text-foreground"
const iconItemInactive = "text-muted-foreground hover:bg-accent hover:text-foreground"

export function SideNav({ email }: { email: string }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    channel: true,
    workspace: true,
    midi: false,
    tracks: false,
    renders: false,
    uploads: false,
    assets: false,
  })

  useEffect(() => {
    try {
      const saved = localStorage.getItem('sidenavCollapsed')
      if (saved === 'true') setCollapsed(true)
    } catch {}
  }, [])

  function toggleCollapsed() {
    setCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem('sidenavCollapsed', String(next)) } catch {}
      return next
    })
  }

  function toggleSection(id: string) {
    setOpenSections(prev => ({ ...prev, [id]: !prev[id] }))
  }

  function isActive(href: string) {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  const sections: Section[] = [
    { id: 'channel', label: '채널', icon: <SignalIcon />, items: [{ href: '/channels', label: '채널 목록' }] },
    { id: 'workspace', label: '워크스페이스', icon: <FolderIcon />, items: [], custom: <WorkspaceTree /> },
    { id: 'midi', label: '미디파일', icon: <PianoIcon />, items: [{ href: '/midis', label: '전체 목록' }] },
    { id: 'tracks', label: '노래리스트', icon: <MusicalNotesIcon />, items: [{ href: '/tracks', label: '전체 트랙' }] },
    { id: 'renders', label: '렌더영상', icon: <FilmIcon />, items: [{ href: '/renders', label: '영상 목록' }] },
    { id: 'uploads', label: '업로드영상', icon: <UploadIcon />, items: [{ href: '/uploads', label: '업로드 목록' }] },
    { id: 'assets', label: '에셋관리', icon: <PhotoIcon />, items: [{ href: '/assets', label: '에셋' }] },
  ]

  const sectionHref: Record<string, string> = {
    channel: '/channels', workspace: '/workspaces', midi: '/midis',
    tracks: '/tracks', renders: '/renders', uploads: '/uploads', assets: '/assets',
  }

  // ── 접힘 모드 ──
  if (collapsed) {
    return (
      <aside className="w-12 flex-shrink-0 bg-background border-r border-border flex flex-col h-full transition-all duration-200">
        <div className="flex items-center justify-center h-12 border-b border-border">
          <button onClick={toggleCollapsed} title="메뉴 펼치기"
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <div className="flex justify-center py-2 border-b border-border">
          <Link href="/generate" title="노래 만들기"
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-foreground text-background text-sm hover:opacity-80 transition-opacity">
            ♪
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 py-2 flex flex-col items-center gap-1">
          {sections.map(section => {
            const href = sectionHref[section.id] ?? '/'
            const active = isActive(href)
            return (
              <Link key={section.id} href={href} title={section.label}
                className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${active ? iconItemActive : iconItemInactive}`}>
                {section.icon}
              </Link>
            )
          })}
        </div>

        <div className="border-t border-border py-2 flex flex-col items-center gap-1">
          <Link href="/settings" title="설정"
            className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${isActive('/settings') ? iconItemActive : iconItemInactive}`}>
            <SettingsIcon />
          </Link>
        </div>
      </aside>
    )
  }

  // ── 펼침 모드 ──
  return (
    <aside className="w-64 flex-shrink-0 bg-background border-r border-border flex flex-col h-full transition-all duration-200">
      <div className="p-3 border-b border-border flex items-center gap-2">
        <Link href="/generate"
          className="flex items-center justify-center gap-2 flex-1 py-2 px-3 rounded-lg text-sm font-semibold bg-foreground text-background hover:opacity-80 transition-opacity">
          노래 만들기
        </Link>
        <button onClick={toggleCollapsed} title="메뉴 접기"
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors flex-shrink-0">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 py-2">
        {sections.map(section => (
          <div key={section.id}>
            <button
              onClick={() => toggleSection(section.id)}
              className="w-full flex items-center justify-between px-3 py-2.5 text-sm text-foreground hover:bg-accent transition-colors"
            >
              <span className="flex items-center gap-2 text-muted-foreground">
                {section.icon}
                {section.label}
              </span>
              <span className="text-muted-foreground">
                <ChevronIcon open={openSections[section.id] ?? false} />
              </span>
            </button>

            {(openSections[section.id] ?? false) && (
              <div>
                {section.custom ? (
                  <div className="pl-2">{section.custom}</div>
                ) : (
                  section.items.map(item => (
                    <Link key={item.href} href={item.href}
                      className={`flex items-center px-3 py-2.5 pl-9 text-sm transition-colors ${
                        isActive(item.href)
                          ? 'bg-accent text-foreground border-l-2 border-foreground'
                          : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                      }`}>
                      {item.label}
                    </Link>
                  ))
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="border-t border-border py-2">
        <Link href="/settings"
          className={`${navItemBase} ${isActive('/settings') ? navItemActive : navItemInactive}`}>
          <SettingsIcon />
          설정
        </Link>
        <p className="text-xs text-muted-foreground truncate px-3 pt-1">{email}</p>
      </div>
    </aside>
  )
}
