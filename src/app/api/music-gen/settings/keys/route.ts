import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'
import { requireUser } from '@/lib/auth/guards'

const VALID_KEY_TYPES = [
  'youtube_api_key',
  'telegram_bot_token',
  'telegram_chat_id',
  'gemini_api_key',
  'two_captcha_key',
  'google_oauth_client_id',
  'google_oauth_client_secret',
] as const

export async function GET() {
  try {
    const { user, response } = await requireUser()
    if (response) return response
    const db = getDb()
    const rows = db
      .prepare('SELECT key_type, key_value, updated_at FROM user_api_keys WHERE user_id = ?')
      .all(user.id) as Array<{ key_type: string; key_value: string; updated_at: number }>
    const keys: Record<string, { value: string; updated_at: number }> = {}
    for (const row of rows) {
      keys[row.key_type] = { value: row.key_value, updated_at: row.updated_at }
    }
    return ok(keys)
  } catch (e) {
    return handleError(e)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { user, response } = await requireUser()
    if (response) return response
    const { key_type, key_value } = await req.json()
    if (!VALID_KEY_TYPES.includes(key_type)) {
      return err('INVALID_INPUT', `key_type must be one of: ${VALID_KEY_TYPES.join(', ')}`, 400)
    }
    const db = getDb()
    const now = Math.floor(Date.now() / 1000)
    db.prepare(`
      INSERT INTO user_api_keys (user_id, key_type, key_value, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, key_type) DO UPDATE SET key_value = excluded.key_value, updated_at = excluded.updated_at
    `).run(user.id, key_type, key_value ?? '', now)
    return ok({ success: true })
  } catch (e) {
    return handleError(e)
  }
}
