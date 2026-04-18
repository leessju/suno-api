import { NextRequest } from 'next/server'
import { ok, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'
import { requireUser } from '@/lib/auth/guards'
import * as channelsRepo from '@/lib/music-gen/repositories/channels'

export const dynamic = 'force-dynamic'

// POST /api/music-gen/render-jobs
// body: { workspace_id: string, channel_id?: number }
export async function POST(req: NextRequest) {
  try {
    const { response } = await requireUser()
    if (response) return response

    const { workspace_id, channel_id } = await req.json()
    if (!workspace_id) {
      return handleError(new Error('workspace_id is required'))
    }

    const db = getDb()

    // is_confirmed=1 이고 audio_url이 있는 draft_songs 조회 (3-way JOIN)
    const songs = db.prepare(`
      SELECT ds.id, ds.suno_id, ds.title, ds.audio_url, ds.image_url,
             ds.style_used, ds.sort_order, ds.render_bg_key
      FROM draft_songs ds
      JOIN midi_draft_rows mdr ON mdr.id = ds.draft_row_id AND mdr.deleted_at IS NULL
      JOIN workspace_midis wm ON wm.id = mdr.workspace_midi_id AND wm.deleted_at IS NULL
      WHERE wm.workspace_id = ?
        AND ds.is_confirmed = 1
        AND ds.audio_url IS NOT NULL
        AND ds.deleted_at IS NULL
      ORDER BY ds.sort_order ASC
    `).all(workspace_id) as Array<{
      id: string
      suno_id: string
      title: string | null
      audio_url: string
      image_url: string | null
      style_used: string | null
      sort_order: number
      render_bg_key: string | null
    }>

    let enqueued = 0
    let skipped = 0
    const jobs: Array<{ id: string; suno_id: string; title: string | null }> = []

    const insertStmt = db.prepare(`
      INSERT INTO job_queue (id, type, payload, status, idempotency_key, attempts, max_attempts, scheduled_at)
      VALUES (?, 'render.remotion', ?, 'pending', ?, 0, 3, ?)
    `)

    const checkStmt = db.prepare(`
      SELECT id FROM job_queue
      WHERE idempotency_key = ? AND status IN ('pending', 'running')
      LIMIT 1
    `)

    const findBackImageStmt = db.prepare(`
      SELECT id FROM back_images WHERE r2_key = ? AND deleted_at IS NULL LIMIT 1
    `)

    const insertUsageStmt = db.prepare(`
      INSERT INTO render_image_usage (channel_id, back_image_id, image_category, used_at)
      VALUES (?, ?, ?, unixepoch())
    `)

    for (const song of songs) {
      const idempotencyKey = `render.${song.suno_id}`

      // 이미 pending/running인 job이 있으면 스킵
      const existing = checkStmt.get(idempotencyKey)
      if (existing) {
        skipped++
        continue
      }

      const jobId = crypto.randomUUID()
      const payload = JSON.stringify({
        workspace_id,
        suno_track_id: song.suno_id,
        audio_url: song.audio_url,
        image_url: song.image_url ?? null,
        style_used: song.style_used ?? null,
        title: song.title ?? null,
        sort_order: song.sort_order ?? 0,
        render_bg_key: song.render_bg_key ?? null,
      })

      insertStmt.run(jobId, payload, idempotencyKey, Date.now())

      // render_bg_key가 있으면 사용 이력 저장
      if (song.render_bg_key && channel_id) {
        const backImage = findBackImageStmt.get(song.render_bg_key) as { id: number } | undefined
        if (backImage) {
          const channel = channelsRepo.findById(channel_id)
          const youtubeId = channel?.youtube_channel_id.toLowerCase()
          const isThumbnail = youtubeId
            ? song.render_bg_key.includes(`/${youtubeId}/thumbnail/`)
            : false
          const imageCategory = isThumbnail ? 'thumbnail' : 'video'
          insertUsageStmt.run(channel_id, backImage.id, imageCategory)
        }
      }

      enqueued++
      jobs.push({ id: jobId, suno_id: song.suno_id, title: song.title })
    }

    return ok({ enqueued, skipped, jobs })
  } catch (e) {
    return handleError(e)
  }
}
