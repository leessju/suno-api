import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'
import { requireUser } from '@/lib/auth/guards'

type Params = { params: Promise<{ id: string }> }

// PATCH /api/music-gen/youtube-shorts/[id]
// body: { title?, description?, thumbnail_key?, status?, youtube_privacy?, deleted? }
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const { user, response } = await requireUser()
    if (response) return response

    const db = getDb()

    // 소유권 확인: channels → workspaces → user_id
    const short = db.prepare(`
      SELECT ys.id FROM youtube_shorts ys
      JOIN channels c ON c.id = ys.channel_id
      JOIN workspaces ws ON ws.channel_id = c.id
      WHERE ys.id = ? AND ws.user_id = ? AND ys.deleted_at IS NULL
    `).get(id, user.id)
    if (!short) return err('NOT_FOUND', '쇼츠를 찾을 수 없습니다.', 404)

    const body = await req.json().catch(() => ({}))
    const now = Date.now()

    if (body.deleted === true) {
      db.prepare('UPDATE youtube_shorts SET deleted_at = ?, updated_at = ? WHERE id = ?')
        .run(now, now, id)
      return ok({ id })
    }

    const allowed = ['title', 'description', 'thumbnail_key', 'status', 'youtube_privacy'] as const
    const sets: string[] = ['updated_at = ?']
    const vals: unknown[] = [now]

    for (const key of allowed) {
      if (body[key] !== undefined) {
        sets.push(`${key} = ?`)
        vals.push(body[key])
      }
    }

    if (sets.length > 1) {
      db.prepare(`UPDATE youtube_shorts SET ${sets.join(', ')} WHERE id = ?`)
        .run(...vals, id)
    }

    return ok({ id })
  } catch (e) {
    return handleError(e)
  }
}
