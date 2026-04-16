import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'
import { requireUser } from '@/lib/auth/guards'

export async function GET(req: NextRequest) {
  try {
    const { user, response } = await requireUser()
    if (response) return response
    const db = getDb()
    const ext = db.prepare('SELECT avatar_r2_key FROM user_profile_ext WHERE user_id = ?').get(user.id) as { avatar_r2_key: string | null } | undefined
    const userRow = db.prepare('SELECT name, email, image FROM user WHERE id = ?').get(user.id) as { name: string; email: string; image: string | null } | undefined
    return ok({ ...userRow, avatar_r2_key: ext?.avatar_r2_key ?? null })
  } catch (e) {
    return handleError(e)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { user, response } = await requireUser()
    if (response) return response
    const { name } = await req.json()
    if (typeof name !== 'string' || !name.trim()) return err('VALIDATION_ERROR', 'name required', 400)
    const db = getDb()
    db.prepare('UPDATE user SET name = ?, updatedAt = ? WHERE id = ?').run(name.trim(), Date.now(), user.id)
    return ok({ success: true })
  } catch (e) {
    return handleError(e)
  }
}
