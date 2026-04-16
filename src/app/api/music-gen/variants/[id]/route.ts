import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'

type Params = { params: Promise<{ id: string }> }

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: Params
) {
  try {
    const { id } = await params
    const variantId = parseInt(id, 10)
    if (isNaN(variantId)) return err('BAD_REQUEST', 'Invalid variant id', 400)

    const db = getDb()

    // Get content row
    const content = db.prepare('SELECT * FROM contents WHERE id = ?').get(variantId) as Record<string, unknown> | undefined
    if (!content) return err('NOT_FOUND', 'Variant not found', 404)

    // Check if a workspace_track is linked to this variant
    const track = db.prepare(
      "SELECT * FROM workspace_tracks WHERE variant_id = ? LIMIT 1"
    ).get(String(variantId)) as Record<string, unknown> | undefined

    // Check job_queue for suno.generate job with this variant_id
    const job = db.prepare(`
      SELECT * FROM job_queue
      WHERE type = 'suno.generate'
        AND json_extract(payload, '$.variant_id') = ?
      ORDER BY scheduled_at DESC
      LIMIT 1
    `).get(String(variantId)) as Record<string, unknown> | undefined

    return ok({
      ...content,
      suno_track_id: track?.suno_track_id ?? null,
      audio_url: null, // audio_url is served via Suno API externally; null until client fetches via suno_track_id
      job_status: job?.status ?? null,
    })
  } catch (e) {
    return handleError(e)
  }
}
