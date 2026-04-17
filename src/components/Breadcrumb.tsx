'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

const PATH_LABELS: Record<string, string> = {
  channels: '채널',
  workspaces: '워크스페이스',
  midis: '미디파일',
  tracks: '노래리스트',
  renders: '렌더영상',
  uploads: '업로드영상',
  assets: '에셋관리',
  generate: '노래 만들기',
  settings: '설정',
  profile: '프로필',
  'suno-accounts': 'Suno 계정',
  telegram: '텔레그램',
  admin: '관리자',
  users: '회원 권한 관리',
  queue: 'Job 큐',
  approvals: '결재',
  openclaw: 'OpenClaw',
  new: '새로 만들기',
  variants: '변형 생성',
  images: '이미지',
  merge: '병합',
  shorts: '쇼츠',
  upload: '업로드',
  api: 'API',
  docs: '문서',
}

function getLabel(segment: string, resolved?: Record<string, string>): string {
  if (resolved?.[segment]) return resolved[segment]
  return PATH_LABELS[segment] ?? segment
}

// ws_ 접두사로 시작하는 워크스페이스 ID 패턴
const isWorkspaceId = (s: string) => s.startsWith('ws_')
// 순수 UUID/숫자 동적 세그먼트 (생략 대상)
const isDynamic = (s: string) => /^[0-9a-f-]{8,}$/.test(s) || /^\d+$/.test(s) || /^wm_/.test(s)
// 해당 경로 자체에 페이지가 없는 중간 세그먼트 (링크 없이 텍스트만 표시)
const NO_LINK_SEGMENTS = new Set(['midis', 'tracks', 'renders', 'uploads'])

export function Breadcrumb() {
  const pathname = usePathname()
  const [resolved, setResolved] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!pathname) return
    const segments = pathname.split('/').filter(Boolean)
    const wsIds = segments.filter(isWorkspaceId)
    if (wsIds.length === 0) return

    const missing = wsIds.filter(id => !resolved[id])
    if (missing.length === 0) return

    Promise.all(
      missing.map(id =>
        fetch(`/api/music-gen/workspaces/${id}`)
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            const name = data?.name ?? data?.data?.name
            return name ? { id, name } : null
          })
          .catch(() => null)
      )
    ).then(results => {
      const updates: Record<string, string> = {}
      for (const r of results) {
        if (r) updates[r.id] = r.name
      }
      if (Object.keys(updates).length > 0) {
        setResolved(prev => ({ ...prev, ...updates }))
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // 루트면 표시 안 함
  if (!pathname || pathname === '/') return null

  const segments = pathname.split('/').filter(Boolean)

  const crumbs: { label: string; href: string }[] = []
  let built = ''
  for (const seg of segments) {
    built += `/${seg}`
    if (isWorkspaceId(seg)) {
      // 워크스페이스 ID는 이름으로 표시 (로딩 중엔 임시 표시 생략)
      const name = resolved[seg]
      if (name) {
        crumbs.push({ label: name, href: built })
      }
    } else if (!isDynamic(seg)) {
      crumbs.push({ label: getLabel(seg, resolved), href: built })
    }
  }

  if (crumbs.length === 0) return null

  return (
    <nav className="flex items-center gap-1 text-sm text-muted-foreground min-w-0 overflow-hidden whitespace-nowrap">
      <Link href="/" className="hover:text-foreground transition-colors flex-shrink-0">
        홈
      </Link>
      {crumbs.map((crumb, i) => (
        <span key={crumb.href} className="flex items-center gap-1 flex-shrink-0">
          <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          {i === crumbs.length - 1 || NO_LINK_SEGMENTS.has(crumb.href.split('/').pop() ?? '') ? (
            <span className={i === crumbs.length - 1 ? 'text-foreground font-medium' : ''}>{crumb.label}</span>
          ) : (
            <Link href={crumb.href} className="hover:text-foreground transition-colors">
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  )
}
