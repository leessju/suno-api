import { NextRequest, NextResponse } from 'next/server'

// 인증이 필요 없는 경로
const PUBLIC_PATHS = [
  '/api/auth',
  '/login',
  '/api/health',
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // public 경로 통과
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // 기존 Suno API routes 통과 (하위 호환)
  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/music-gen') && !pathname.startsWith('/api/internal')) {
    return NextResponse.next()
  }

  // 세션 쿠키 확인
  const sessionCookie = request.cookies.get('better-auth.session_token')
  if (!sessionCookie) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.png|public).*)',
  ],
}
