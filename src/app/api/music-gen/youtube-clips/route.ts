import { NextRequest } from 'next/server'
import { ok, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'
import { requireUser } from '@/lib/auth/guards'

export const dynamic = 'force-dynamic'

// GET /api/music-gen/youtube-clips?channel_id=
export async function GET(req: NextRequest) {
  try {
    const { user, response } = await requireUser()
    if (response) return response

    const { searchParams } = new URL(req.url)
    const channelId = searchParams.get('channel_id')

    const db = getDb()
    const conditions: string[] = ['yc.deleted_at IS NULL']
    const params: unknown[] = []

    // user 소유 채널만 반환
    conditions.push(`c.id IN (
      SELECT DISTINCT ch.id FROM channels ch
      JOIN workspaces ws ON ws.channel_id = ch.id
      WHERE ws.user_id = ? AND ws.deleted_at IS NULL
    )`)
    params.push(user.id)

    if (channelId) {
      conditions.push('yc.channel_id = ?')
      params.push(channelId)
    }

    const rows = db.prepare(`
      SELECT yc.id, yc.channel_id, yc.title, yc.description,
             yc.thumbnail_key, yc.video_path, yc.duration,
             yc.status, yc.youtube_privacy, yc.youtube_video_id,
             yc.created_at, yc.updated_at,
             c.channel_name, c.youtube_channel_id,
             (SELECT COUNT(*) FROM youtube_clip_renders ycr WHERE ycr.clip_id = yc.id) as render_count
      FROM youtube_clips yc
      LEFT JOIN channels c ON c.id = yc.channel_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY yc.created_at DESC
      LIMIT 200
    `).all(...params)

    return ok(rows)
  } catch (e) {
    return handleError(e)
  }
}
