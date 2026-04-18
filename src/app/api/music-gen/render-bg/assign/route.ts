import { NextRequest } from 'next/server'
import { ok, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'
import { requireUser } from '@/lib/auth/guards'
import * as channelsRepo from '@/lib/music-gen/repositories/channels'

export const dynamic = 'force-dynamic'

// POST /api/music-gen/render-bg/assign
// body: { workspace_id: string, channel_id: number }
export async function POST(req: NextRequest) {
  try {
    const { response } = await requireUser()
    if (response) return response

    const { workspace_id, channel_id } = await req.json()
    if (!workspace_id || !channel_id) {
      return handleError(new Error('workspace_id and channel_id are required'))
    }

    const channel = channelsRepo.findById(channel_id)
    const youtubeId = channel?.youtube_channel_id.toLowerCase()
    if (!youtubeId) return handleError(new Error('Channel not found or missing youtube_channel_id'))

    const db = getDb()

    // 확정곡 조회 (3-way JOIN)
    const songs = db.prepare(`
      SELECT ds.id, ds.suno_id, ds.sort_order
      FROM draft_songs ds
      JOIN midi_draft_rows mdr ON mdr.id = ds.draft_row_id AND mdr.deleted_at IS NULL
      JOIN workspace_midis wm ON wm.id = mdr.workspace_midi_id AND wm.deleted_at IS NULL
      WHERE wm.workspace_id = ?
        AND ds.is_confirmed = 1
        AND ds.audio_url IS NOT NULL
        AND ds.deleted_at IS NULL
      ORDER BY ds.sort_order ASC
    `).all(workspace_id) as Array<{ id: string; suno_id: string; sort_order: number }>

    if (songs.length === 0) {
      return ok({ assignments: [] })
    }

    // thumbnail 이미지 (least-used-first)
    const thumbnailImages = db.prepare(`
      SELECT bi.id, bi.r2_key, COALESCE(u.cnt, 0) as use_count
      FROM back_images bi
      LEFT JOIN (
        SELECT back_image_id, COUNT(*) as cnt
        FROM render_image_usage
        WHERE channel_id = ? AND image_category = 'thumbnail'
        GROUP BY back_image_id
      ) u ON u.back_image_id = bi.id
      WHERE bi.channel_id = ?
        AND bi.r2_key LIKE ?
        AND bi.deleted_at IS NULL
      ORDER BY use_count ASC, RANDOM()
    `).all(channel_id, channel_id, `%/${youtubeId}/thumbnail/%`) as Array<{ id: number; r2_key: string; use_count: number }>

    // video 이미지 (least-used-first)
    const videoImages = db.prepare(`
      SELECT bi.id, bi.r2_key, COALESCE(u.cnt, 0) as use_count
      FROM back_images bi
      LEFT JOIN (
        SELECT back_image_id, COUNT(*) as cnt
        FROM render_image_usage
        WHERE channel_id = ? AND image_category = 'video'
        GROUP BY back_image_id
      ) u ON u.back_image_id = bi.id
      WHERE bi.channel_id = ?
        AND bi.r2_key NOT LIKE ?
        AND bi.deleted_at IS NULL
      ORDER BY use_count ASC, RANDOM()
    `).all(channel_id, channel_id, `%/${youtubeId}/thumbnail/%`) as Array<{ id: number; r2_key: string; use_count: number }>

    const updateStmt = db.prepare(`UPDATE draft_songs SET render_bg_key = ? WHERE id = ?`)

    const assignments: Array<{
      song_id: string
      suno_id: string
      back_image_id: number
      r2_key: string
      category: string
    }> = []

    const usedVideoIds = new Set<number>()

    for (let i = 0; i < songs.length; i++) {
      const song = songs[i]
      const isFirst = i === 0

      if (isFirst) {
        // 첫 번째 곡: thumbnail 이미지 중 최소 사용 랜덤 1개
        const img = thumbnailImages[0]
        if (!img) continue
        updateStmt.run(img.r2_key, song.id)
        assignments.push({
          song_id: song.id,
          suno_id: song.suno_id,
          back_image_id: img.id,
          r2_key: img.r2_key,
          category: 'thumbnail',
        })
      } else {
        // 나머지 곡: video 이미지 중 배치 내 중복 없이
        const img = videoImages.find(v => !usedVideoIds.has(v.id))
        if (!img) {
          // 모두 사용된 경우 중복 허용
          const fallback = videoImages[0]
          if (!fallback) continue
          updateStmt.run(fallback.r2_key, song.id)
          assignments.push({
            song_id: song.id,
            suno_id: song.suno_id,
            back_image_id: fallback.id,
            r2_key: fallback.r2_key,
            category: 'video',
          })
        } else {
          usedVideoIds.add(img.id)
          updateStmt.run(img.r2_key, song.id)
          assignments.push({
            song_id: song.id,
            suno_id: song.suno_id,
            back_image_id: img.id,
            r2_key: img.r2_key,
            category: 'video',
          })
        }
      }
    }

    return ok({ assignments })
  } catch (e) {
    return handleError(e)
  }
}
