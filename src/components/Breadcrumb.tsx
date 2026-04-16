'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

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

function getLabel(segment: string): string {
  return PATH_LABELS[segment] ?? segment
}

export function Breadcrumb() {
  const pathname = usePathname()

  // 루트면 표시 안 함
  if (!pathname || pathname === '/') return null

  const segments = pathname.split('/').filter(Boolean)

  // 동적 세그먼트(UUID 등)는 생략
  const isDynamic = (s: string) => /^[0-9a-f-]{8,}$/.test(s) || /^\d+$/.test(s)

  const crumbs: { label: string; href: string }[] = []
  let built = ''
  for (const seg of segments) {
    built += `/${seg}`
    if (!isDynamic(seg)) {
      crumbs.push({ label: getLabel(seg), href: built })
    }
  }

  if (crumbs.length === 0) return null

  return (
    <nav className="flex items-center gap-1 text-sm text-muted-foreground">
      <Link href="/" className="hover:text-foreground transition-colors">
        홈
      </Link>
      {crumbs.map((crumb, i) => (
        <span key={crumb.href} className="flex items-center gap-1">
          <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          {i === crumbs.length - 1 ? (
            <span className="text-foreground font-medium">{crumb.label}</span>
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
