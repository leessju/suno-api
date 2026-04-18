import { NextRequest } from 'next/server'
import { ok, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'

export const dynamic = 'force-dynamic'

// GET /api/music-gen/channels/[id]/sessions
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const channelId = parseInt(id, 10)
    if (isNaN(channelId)) {
      return ok([])
    }

    const db = getDb()
    const sessions = db.prepare(`
      SELECT s.*,
        (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) as message_count
      FROM sessions s
      WHERE s.channel_id = ?
      ORDER BY s.updated_at DESC
      LIMIT 50
    `).all(channelId)

    return ok(sessions)
  } catch (e) {
    return handleError(e)
  }
}
