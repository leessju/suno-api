import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'
import { requireUser } from '@/lib/auth/guards'
import { CreateSunoAccountSchema } from '@/contracts/schemas/suno-account'

export async function GET() {
  try {
    const { user, response } = await requireUser()
    if (response) return response

    const db = getDb()
    const accounts = db.prepare(`
      SELECT id, user_id, label, is_active, created_at
      FROM suno_accounts
      WHERE (user_id = ? OR user_id IS NULL) AND deleted_at IS NULL
      ORDER BY is_active DESC, id ASC
    `).all(user.id)

    return ok(accounts)
  } catch (e) {
    return handleError(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, response } = await requireUser()
    if (response) return response

    const body = await req.json()
    const parsed = CreateSunoAccountSchema.safeParse(body)
    if (!parsed.success) {
      return err('VALIDATION_ERROR', parsed.error.message, 400)
    }

    const { label, cookie } = parsed.data
    const db = getDb()

    // 같은 유저의 동일 label 중복 방지
    const existing = db.prepare(
      'SELECT id FROM suno_accounts WHERE user_id = ? AND label = ? AND deleted_at IS NULL'
    ).get(user.id, label)
    if (existing) {
      return err('DUPLICATE', '이미 같은 이름의 Suno 계정이 있습니다.', 409)
    }

    const now = Date.now()
    const result = db.prepare(`
      INSERT INTO suno_accounts (label, cookie, is_active, user_id, created_at, updated_at)
      VALUES (?, ?, 1, ?, ?, ?)
    `).run(label, cookie, user.id, now, now)

    const account = db.prepare(
      'SELECT id, user_id, label, is_active, created_at FROM suno_accounts WHERE id = ?'
    ).get(result.lastInsertRowid)

    return ok(account, 201)
  } catch (e) {
    return handleError(e)
  }
}
