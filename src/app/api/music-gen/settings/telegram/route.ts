import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'
import { requireUser } from '@/lib/auth/guards'

export async function GET() {
  try {
    const { user, response } = await requireUser()
    if (response) return response
    const db = getDb()
    const row = db.prepare('SELECT bot_token, chat_id, enabled FROM telegram_config WHERE user_id = ?').get(user.id) as { bot_token: string; chat_id: string; enabled: number } | undefined
    return ok(row ?? { bot_token: '', chat_id: '', enabled: 0 })
  } catch (e) {
    return handleError(e)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { user, response } = await requireUser()
    if (response) return response
    const { bot_token, chat_id, enabled } = await req.json()
    const db = getDb()
    const now = Date.now()
    db.prepare(`
      INSERT INTO telegram_config (user_id, bot_token, chat_id, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET bot_token = excluded.bot_token, chat_id = excluded.chat_id, enabled = excluded.enabled, updated_at = excluded.updated_at
    `).run(user.id, bot_token ?? '', chat_id ?? '', enabled ? 1 : 0, now, now)
    return ok({ success: true })
  } catch (e) {
    return handleError(e)
  }
}
