import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/music-gen/api-helpers'
import { requireUser } from '@/lib/auth/guards'
import { getDb } from '@/lib/music-gen/db'
import { pollSession, destroySession } from '@/lib/music-gen/browser-login'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params
    const { user, response } = await requireUser()
    if (response) return response

    const result = await pollSession(sessionId, user.id)

    if (result.status === 'not_found') {
      return err('NOT_FOUND', '세션을 찾을 수 없습니다.', 404)
    }

    if (result.status === 'logged_in' && result.cookie) {
      // 쿠키를 DB에 자동 저장
      const db = getDb()
      const label = result.label || `Suno (브라우저 로그인 ${new Date().toLocaleDateString('ko-KR')})`

      // 같은 label(이메일)의 계정이 이미 있으면 쿠키 업데이트, 없으면 INSERT
      const existing = db.prepare(
        'SELECT id FROM suno_accounts WHERE label = ? AND user_id = ?'
      ).get(label, user.id) as { id: number } | undefined

      let accountId: number

      if (existing) {
        const now = Date.now()
        db.prepare('UPDATE suno_accounts SET cookie = ?, updated_at = ? WHERE id = ?')
          .run(result.cookie, now, existing.id)
        accountId = existing.id
      } else {
        const now = Date.now()
        const insertResult = db.prepare(`
          INSERT INTO suno_accounts (label, cookie, is_active, user_id, created_at, updated_at)
          VALUES (?, ?, 1, ?, ?, ?)
        `).run(label, result.cookie, user.id, now, now)
        accountId = Number(insertResult.lastInsertRowid)
      }

      // 세션 정리
      await destroySession(sessionId, user.id)

      return ok({
        status: 'logged_in',
        accountId,
        label,
        isNew: !existing,
      })
    }

    return ok({ status: result.status })
  } catch (e) {
    return handleError(e)
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params
    const { user, response } = await requireUser()
    if (response) return response

    const destroyed = await destroySession(sessionId, user.id)
    if (!destroyed) {
      return err('NOT_FOUND', '세션을 찾을 수 없습니다.', 404)
    }

    return ok({ destroyed: true })
  } catch (e) {
    return handleError(e)
  }
}
