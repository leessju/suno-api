import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'
import { requireUser } from '@/lib/auth/guards'
import { getSystemSetting } from '@/lib/music-gen/system-settings'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { mkdirSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'

const execFileAsync = promisify(execFile)

export const dynamic = 'force-dynamic'

// POST /api/music-gen/renders/merge
// body: { render_ids: string[] }
// ffmpeg concat demuxer로 mp4 병합 → youtube_clips에 저장 → clip id 반환
export async function POST(req: NextRequest) {
  try {
    const { user, response } = await requireUser()
    if (response) return response

    const body = await req.json().catch(() => ({}))
    const render_ids: string[] = Array.isArray(body.render_ids) ? body.render_ids : []

    if (render_ids.length < 2) {
      return err('INVALID_INPUT', '병합할 영상을 2개 이상 선택하세요.', 400)
    }

    const db = getDb()

    // 소유권 확인 + video_path, render_bg_key 조회 (순서 보존)
    const placeholders = render_ids.map(() => '?').join(',')
    const rows = db.prepare(`
      SELECT rr.id, rr.video_path, rr.workspace_id,
             rr.render_bg_key as rr_bg_key,
             ds.is_confirmed, ds.sort_order, ds.created_at, ds.render_bg_key as ds_bg_key
      FROM render_results rr
      LEFT JOIN workspaces w ON w.id = rr.workspace_id
      LEFT JOIN draft_songs ds ON ds.suno_id = rr.suno_track_id AND ds.deleted_at IS NULL
      WHERE rr.id IN (${placeholders}) AND w.user_id = ? AND rr.deleted_at IS NULL
    `).all(...render_ids, user.id) as Array<{
      id: string
      video_path: string | null
      workspace_id: string
      rr_bg_key: string | null
      is_confirmed: number | null
      sort_order: number | null
      created_at: number | null
      ds_bg_key: string | null
    }>

    if (rows.length !== render_ids.length) {
      return err('NOT_FOUND', '일부 렌더 이력을 찾을 수 없거나 접근 권한이 없습니다.', 404)
    }

    // /tracks와 동일한 기준으로 병합 순서 결정
    const indexById = new Map(render_ids.map((id, idx) => [id, idx]))
    const ordered = [...rows].sort((a, b) => {
      const aHasOrder = a.is_confirmed === 1 && (a.sort_order ?? 0) > 0 ? 0 : 1
      const bHasOrder = b.is_confirmed === 1 && (b.sort_order ?? 0) > 0 ? 0 : 1
      if (aHasOrder !== bHasOrder) return aHasOrder - bHasOrder

      if (aHasOrder === 0 && bHasOrder === 0 && a.sort_order !== b.sort_order) {
        return (a.sort_order ?? 0) - (b.sort_order ?? 0)
      }

      if ((a.is_confirmed ?? 0) !== (b.is_confirmed ?? 0)) {
        return (b.is_confirmed ?? 0) - (a.is_confirmed ?? 0)
      }

      const createdDiff = (b.created_at ?? 0) - (a.created_at ?? 0)
      if (createdDiff !== 0) return createdDiff

      return (indexById.get(a.id) ?? 0) - (indexById.get(b.id) ?? 0)
    })

    const videoPaths = ordered.map(r => r.video_path).filter(Boolean) as string[]
    if (videoPaths.length < 2) {
      return err('INVALID_INPUT', '병합 가능한 영상 파일이 부족합니다.', 400)
    }

    // 첫 번째 영상의 thumbnail_key (render_results 우선, fallback: draft_songs)
    const thumbnailKey = ordered[0].rr_bg_key ?? ordered[0].ds_bg_key ?? null

    // 출력 디렉토리: {render_output_dir}/{youtube_channel_id}/merged/
    const renderOutputDir = getSystemSetting('render_output_dir') ?? 'data/renders'
    const workspaceId = ordered[0].workspace_id

    const channelRow = db.prepare(`
      SELECT c.id as channel_id, c.youtube_channel_id
      FROM workspaces ws
      LEFT JOIN channels c ON c.id = ws.channel_id
      WHERE ws.id = ?
    `).get(workspaceId) as { channel_id: number | null; youtube_channel_id: string | null } | undefined

    const channelId = channelRow?.channel_id ?? null
    const youtubeChannelId = channelRow?.youtube_channel_id?.toLowerCase() ?? null
    const mergedDir = youtubeChannelId
      ? join(renderOutputDir, youtubeChannelId, 'merged')
      : join(renderOutputDir, 'merged')

    mkdirSync(mergedDir, { recursive: true })

    const mergedFilename = `merged_${randomUUID()}.mp4`
    const outputPath = join(mergedDir, mergedFilename)

    // ffmpeg concat list 파일 생성
    const concatListPath = join(mergedDir, `concat_${randomUUID()}.txt`)
    const concatContent = videoPaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n')
    writeFileSync(concatListPath, concatContent, 'utf-8')

    try {
      try {
        // 우선 stream copy 시도 (빠름)
        await execFileAsync('ffmpeg', [
          '-y', '-f', 'concat', '-safe', '0',
          '-i', concatListPath,
          '-c', 'copy', outputPath,
        ])
      } catch {
        // 포맷 불일치 대비 fallback: 재인코딩 병합
        await execFileAsync('ffmpeg', [
          '-y', '-f', 'concat', '-safe', '0',
          '-i', concatListPath,
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
          '-movflags', '+faststart', outputPath,
        ])
      }
    } finally {
      try { unlinkSync(concatListPath) } catch { /* ignore */ }
    }

    // 병합 영상 duration 측정 (ffprobe)
    let mergedDuration: number | null = null
    try {
      const { stdout } = await execFileAsync('ffprobe', [
        '-v', 'quiet',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        outputPath,
      ])
      const parsed = parseFloat(stdout.trim())
      if (!isNaN(parsed) && parsed > 0) mergedDuration = Math.round(parsed)
    } catch { /* ffprobe 실패 시 null 유지 */ }

    // youtube_clips에 저장 + youtube_clip_renders 연결
    const clipId = randomUUID()
    const now = Date.now()

    const insertClip = db.prepare(`
      INSERT INTO youtube_clips
        (id, channel_id, title, description, thumbnail_key, video_path, duration, status, created_at, updated_at)
      VALUES (?, ?, '', '', ?, ?, ?, 'draft', ?, ?)
    `)
    const insertRender = db.prepare(`
      INSERT INTO youtube_clip_renders (clip_id, render_id, sort_order)
      VALUES (?, ?, ?)
    `)

    db.transaction(() => {
      insertClip.run(clipId, channelId, thumbnailKey, outputPath, mergedDuration, now, now)
      ordered.forEach((r, idx) => {
        insertRender.run(clipId, r.id, idx)
      })
    })()

    return ok({
      id: clipId,
      video_url: `/api/music-gen/youtube-clips/${clipId}/video`,
      named_path: mergedFilename,
    })
  } catch (e) {
    return handleError(e)
  }
}
