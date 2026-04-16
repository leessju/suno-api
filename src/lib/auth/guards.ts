import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

export type AuthUser = {
  id: string
  email: string
  name: string
}

/**
 * API route에서 인증된 유저를 가져옵니다.
 * 세션이 없으면 401 응답을 반환합니다.
 *
 * 사용법:
 * const { user, response } = await requireUser()
 * if (response) return response
 */
export async function requireUser(): Promise<
  { user: AuthUser; response: null } | { user: null; response: NextResponse }
> {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
      return {
        user: null,
        response: NextResponse.json(
          { error: { code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' } },
          { status: 401 }
        ),
      }
    }
    return { user: session.user as AuthUser, response: null }
  } catch {
    return {
      user: null,
      response: NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: '인증 오류가 발생했습니다.' } },
        { status: 401 }
      ),
    }
  }
}
