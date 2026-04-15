import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import Link from 'next/link'

const NAV_ITEMS = [
  { href: '/', label: '대시보드', icon: '⊞' },
  { href: '/workspaces/new', label: '새 작업', icon: '+' },
  { href: '/queue', label: 'Job 큐', icon: '≡' },
  { href: '/assets', label: '에셋', icon: '♪' },
  { href: '/tracks', label: '트랙', icon: '▶' },
  { href: '/openclaw', label: 'OpenClaw', icon: '⚡' },
  { href: '/settings/telegram', label: '텔레그램', icon: '✉' },
]

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      {/* 사이드바 */}
      <aside className="w-56 border-r border-gray-800 flex flex-col">
        <div className="h-14 flex items-center px-4 border-b border-gray-800">
          <span className="font-bold text-lg">Suno Studio</span>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/60 transition-colors text-sm"
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t border-gray-800">
          <p className="text-xs text-gray-500 truncate px-3">{session.user.email}</p>
        </div>
      </aside>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 overflow-auto">
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  )
}
