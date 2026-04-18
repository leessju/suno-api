import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { isAdmin } from '@/lib/auth/rbac'
import { SideNav } from '@/components/SideNav'
import { StudioHeader } from '@/components/StudioHeader'
import { ChannelProvider } from '@/components/ChannelProvider'
import { SunoAccountProvider } from '@/components/SunoAccountProvider'
import { SideNavProvider } from '@/components/SideNavProvider'
import { AudioPlayerProvider } from '@/components/AudioPlayerProvider'
import { ToastProvider } from '@/components/Toast'
import { GlobalPlayBar } from '@/components/GlobalPlayBar'
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session) {
    redirect('/login')
  }

  return (
    <ToastProvider>
    <AudioPlayerProvider>
    <ChannelProvider>
      <SunoAccountProvider>
      <SideNavProvider>
        <div className="h-screen bg-background text-foreground flex flex-col overflow-hidden">
          {/* 전역 상단 헤더 */}
          <StudioHeader userName={session.user.name ?? ''} userEmail={session.user.email ?? ''} isAdmin={isAdmin(session.user.id)} />

          {/* 사이드바 + 콘텐츠 */}
          <div className="flex flex-1 min-h-0">
            <SideNav email={session.user.email ?? ''} />

            {/* 메인 콘텐츠 */}
            <main className="flex-1 min-w-0 overflow-auto bg-background flex flex-col">
              <div className="w-full px-4 py-6 pb-20 sm:px-6 md:pb-6 lg:px-8 flex-1 flex flex-col">
                {children}
              </div>
            </main>
          </div>
        </div>
      </SideNavProvider>
      </SunoAccountProvider>
    </ChannelProvider>
    {/* 모바일 하단 플레이바 */}
    <GlobalPlayBar variant="mobile" />
    </AudioPlayerProvider>
    </ToastProvider>
  )
}
