import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'

type Params = { params: Promise<{ songId: string }> }

// PATCH /api/music-gen/tracks/[songId] — is_confirmed, sort_order, custom_image_key 업데이트
export async function PATCH(
  req: NextRequest,
  { params }: Params
) {
  try {
    const { songId } = await params
    const db = getDb()

    const existing = db.prepare('SELECT id FROM draft_songs WHERE id = ? AND deleted_at IS NULL').get(songId)
    if (!existing) return err('NOT_FOUND', 'song not found', 404)

    const body = await req.json().catch(() => ({}))

    const allowed = ['is_confirmed', 'sort_order', 'custom_image_key', 'rating'] as const
    type AllowedKey = typeof allowed[number]

    const sets: string[] = []
    const values: unknown[] = []
    for (const key of allowed) {
      if (key in body) {
        sets.push(`${key} = ?`)
        values.push(body[key as AllowedKey])
      }
    }

    if (!sets.length) return err('BAD_REQUEST', 'no fields to update', 400)

    values.push(songId)
    db.prepare(`UPDATE draft_songs SET ${sets.join(', ')} WHERE id = ?`).run(...values)

    const updated = db.prepare('SELECT * FROM draft_songs WHERE id = ?').get(songId)
    return ok(updated)
  } catch (e) {
    return handleError(e)
  }
}
