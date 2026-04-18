import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'
import { requireUser } from '@/lib/auth/guards'
import { UpdateSunoAccountSchema } from '@/contracts/schemas/suno-account'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { user, response } = await requireUser()
    if (response) return response

    const db = getDb()
    const account = db.prepare(
      'SELECT id, user_id FROM suno_accounts WHERE id = ? AND deleted_at IS NULL'
    ).get(Number(id)) as { id: number; user_id: string | null } | undefined

    if (!account) return err('NOT_FOUND', 'Suno 계정을 찾을 수 없습니다.', 404)
    if (account.user_id && account.user_id !== user.id) {
      return err('FORBIDDEN', '접근 권한이 없습니다.', 403)
    }

    const body = await req.json()
    const parsed = UpdateSunoAccountSchema.safeParse(body)
    if (!parsed.success) return err('VALIDATION_ERROR', parsed.error.message, 400)

    const { label, is_active, cookie } = parsed.data
    const sets: string[] = []
    const vals: unknown[] = []

    if (label !== undefined) { sets.push('label = ?'); vals.push(label) }
    if (is_active !== undefined) { sets.push('is_active = ?'); vals.push(is_active ? 1 : 0) }
    if (cookie !== undefined) { sets.push('cookie = ?'); vals.push(cookie) }

    if (sets.length === 0) return err('VALIDATION_ERROR', '변경할 항목이 없습니다.', 400)
    vals.push(account.id)

    db.prepare(`UPDATE suno_accounts SET ${sets.join(', ')} WHERE id = ?`).run(...vals)

    const updated = db.prepare(
      'SELECT id, user_id, label, is_active, created_at FROM suno_accounts WHERE id = ?'
    ).get(account.id)
    return ok(updated)
  } catch (e) {
    return handleError(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { user, response } = await requireUser()
    if (response) return response

    const db = getDb()
    const account = db.prepare(
      'SELECT id, user_id FROM suno_accounts WHERE id = ? AND deleted_at IS NULL'
    ).get(Number(id)) as { id: number; user_id: string | null } | undefined

    if (!account) return err('NOT_FOUND', 'Suno 계정을 찾을 수 없습니다.', 404)
    if (account.user_id && account.user_id !== user.id) {
      return err('FORBIDDEN', '접근 권한이 없습니다.', 403)
    }

    // 해당 계정이 사용 중인 워크스페이스 확인
    const usedBy = db.prepare(
      'SELECT COUNT(*) as cnt FROM workspaces WHERE suno_account_id = ?'
    ).get(account.id) as { cnt: number }
    if (usedBy.cnt > 0) {
      return err('CONFLICT', `${usedBy.cnt}개의 워크스페이스에서 사용 중입니다. 먼저 워크스페이스를 이전하세요.`, 409)
    }

    db.prepare('UPDATE suno_accounts SET deleted_at = unixepoch() WHERE id = ?').run(account.id)
    return ok({ deleted: true })
  } catch (e) {
    return handleError(e)
  }
}
