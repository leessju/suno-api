import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/guards'
import { isAdmin } from '@/lib/auth/rbac'
import { getDb } from '@/lib/music-gen/db'
import { ok, err } from '@/lib/music-gen/api-helpers'

export async function GET(): Promise<NextResponse> {
  const { user, response } = await requireUser()
  if (response) return response

  if (!isAdmin(user.id)) {
    return err('FORBIDDEN', '관리자 권한이 필요합니다.', 403)
  }

  try {
    const db = getDb()
    const rows = db
      .prepare(
        `SELECT u.id, u.name, u.email, u.createdAt as created_at,
                COALESCE(r.role, 'common') as role
         FROM user u
         LEFT JOIN user_roles r ON u.id = r.user_id
         ORDER BY u.createdAt DESC`
      )
      .all() as { id: string; name: string; email: string; created_at: string; role: string }[]

    return ok({ data: rows })
  } catch (e) {
    console.error('[admin/users]', e)
    return err('INTERNAL_ERROR', '유저 목록을 불러오는 데 실패했습니다.', 500)
  }
}
