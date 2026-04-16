import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/guards'
import { isAdmin } from '@/lib/auth/rbac'
import { getDb } from '@/lib/music-gen/db'
import { ok, err } from '@/lib/music-gen/api-helpers'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { user, response } = await requireUser()
  if (response) return response

  if (!isAdmin(user.id)) {
    return err('FORBIDDEN', '관리자 권한이 필요합니다.', 403)
  }

  const { id } = await params

  let body: { role?: unknown }
  try {
    body = await request.json()
  } catch {
    return err('BAD_REQUEST', '요청 본문이 올바르지 않습니다.', 400)
  }

  const role = body.role
  if (role !== 'admin' && role !== 'common') {
    return err('BAD_REQUEST', "role은 'admin' 또는 'common'이어야 합니다.", 400)
  }

  try {
    const db = getDb()
    db.prepare(
      'INSERT OR REPLACE INTO user_roles (user_id, role) VALUES (?, ?)'
    ).run(id, role)

    return ok({ success: true })
  } catch (e) {
    console.error('[admin/users/role]', e)
    return err('INTERNAL_ERROR', '역할 변경에 실패했습니다.', 500)
  }
}
