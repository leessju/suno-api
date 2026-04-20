import { NextRequest } from 'next/server'
import { ok, handleError, err } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'
import { requireUser } from '@/lib/auth/guards'

export const dynamic = 'force-dynamic'

// GET /api/music-gen/youtube-shorts?clip_id=
export async function GET(req: NextRequest) {
  try {
    const { user, response } = await requireUser()
    if (response) return response

    const { searchParams } = new URL(req.url)
    const clipId = searchParams.get('clip_id')

    const db = getDb()
    const conditions: string[] = ['ys.deleted_at IS NULL']
    const params: unknown[] = []

    // user 소유 채널만 반환
    conditions.push(`ys.channel_id IN (
      SELECT DISTINCT ch.id FROM channels ch
      JOIN workspaces ws ON ws.channel_id = ch.id
      WHERE ws.user_id = ? AND ws.deleted_at IS NULL
    )`)
    params.push(user.id)

    if (clipId) {
      conditions.push('ys.clip_id = ?')
      params.push(clipId)
    }

    const rows = db.prepare(`
      SELECT ys.id, ys.clip_id, ys.channel_id, ys.title, ys.description,
             ys.thumbnail_key, ys.video_path, ys.duration,
             ys.status, ys.youtube_privacy, ys.youtube_video_id,
             ys.created_at, ys.updated_at
      FROM youtube_shorts ys
      WHERE ${conditions.join(' AND ')}
      ORDER BY ys.created_at DESC
      LIMIT 200
    `).all(...params)

    return ok(rows)
  } catch (e) {
    return handleError(e)
  }
}

// POST /api/music-gen/youtube-shorts
// body: { clip_id?, channel_id, title?, description? }
export async function POST(req: NextRequest) {
  try {
    const { user, response } = await requireUser()
    if (response) return response

    const body = await req.json().catch(() => ({}))
    const { clip_id, channel_id, title = '', description = '' } = body

    if (!channel_id) return err('BAD_REQUEST', 'channel_id가 필요합니다.', 400)

    const db = getDb()

    // 소유권 확인: channels → workspaces → user_id
    const channelOwned = db.prepare(`
      SELECT ch.id FROM channels ch
      JOIN workspaces ws ON ws.channel_id = ch.id
      WHERE ch.id = ? AND ws.user_id = ? AND ws.deleted_at IS NULL
      LIMIT 1
    `).get(channel_id, user.id)
    if (!channelOwned) return err('FORBIDDEN', '접근 권한이 없습니다.', 403)

    const id = crypto.randomUUID()
    const now = Date.now()

    db.prepare(`
      INSERT INTO youtube_shorts (id, clip_id, channel_id, title, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, clip_id ?? null, channel_id, title, description, now, now)

    return ok({ id })
  } catch (e) {
    return handleError(e)
  }
}
