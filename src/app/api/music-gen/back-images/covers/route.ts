import { ok, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'

export const dynamic = 'force-dynamic'

// GET /api/music-gen/back-images/covers
// 모든 채널의 커버 이미지(is_cover=1)를 채널 이름과 함께 반환
export async function GET() {
  try {
    const db = getDb()
    const rows = db.prepare(`
      SELECT bi.id, bi.channel_id, bi.r2_key, bi.filename,
             bi.is_cover, bi.display_order, bi.created_at,
             c.channel_name
      FROM back_images bi
      JOIN channels c ON c.id = bi.channel_id AND c.deleted_at IS NULL
      WHERE bi.is_cover = 1 AND bi.deleted_at IS NULL
      ORDER BY c.channel_name ASC, bi.display_order ASC
    `).all()
    return ok(rows)
  } catch (e) {
    return handleError(e)
  }
}
