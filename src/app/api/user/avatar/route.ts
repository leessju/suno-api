import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'
import { requireUser } from '@/lib/auth/guards'
import { uploadObject, deleteObject } from '@/lib/r2'

export async function POST(req: NextRequest) {
  try {
    const { user, response } = await requireUser()
    if (response) return response

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return err('VALIDATION_ERROR', 'file required', 400)

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowed.includes(file.type)) return err('VALIDATION_ERROR', 'Invalid file type', 400)
    if (file.size > 5 * 1024 * 1024) return err('VALIDATION_ERROR', 'File too large (max 5MB)', 400)

    const ext = file.name.split('.').pop() ?? 'jpg'
    const key = `avatars/${user.id}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())
    await uploadObject(key, buffer, file.type)

    const db = getDb()
    const now = Date.now()
    db.prepare(`
      INSERT INTO user_profile_ext (user_id, avatar_r2_key, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET avatar_r2_key = excluded.avatar_r2_key, updated_at = excluded.updated_at
    `).run(user.id, key, now)

    return ok({ key })
  } catch (e) {
    return handleError(e)
  }
}

export async function DELETE(_req: NextRequest) {
  try {
    const { user, response } = await requireUser()
    if (response) return response

    const db = getDb()
    const ext = db.prepare('SELECT avatar_r2_key FROM user_profile_ext WHERE user_id = ?').get(user.id) as { avatar_r2_key: string | null } | undefined

    if (ext?.avatar_r2_key) {
      await deleteObject(ext.avatar_r2_key).catch(() => {})
      db.prepare('UPDATE user_profile_ext SET avatar_r2_key = NULL, updated_at = ? WHERE user_id = ?').run(Date.now(), user.id)
    }

    return ok({ success: true })
  } catch (e) {
    return handleError(e)
  }
}
