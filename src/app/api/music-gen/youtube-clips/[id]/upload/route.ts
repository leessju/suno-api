import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'
import { requireUser } from '@/lib/auth/guards'
import { statSync, createReadStream } from 'fs'
import { Readable } from 'stream'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5분 — 대용량 영상 업로드

type Params = { params: Promise<{ id: string }> }

// POST /api/music-gen/youtube-clips/[id]/upload
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const { user, response } = await requireUser()
    if (response) return response

    const db = getDb()

    // 소유권 + 클립 정보
    const clip = db.prepare(`
      SELECT yc.id, yc.title, yc.description, yc.video_path, yc.youtube_privacy, yc.channel_id,
             c.channel_name
      FROM youtube_clips yc
      JOIN channels c ON c.id = yc.channel_id
      JOIN workspaces ws ON ws.channel_id = c.id
      WHERE yc.id = ? AND ws.user_id = ? AND yc.deleted_at IS NULL
    `).get(id, user.id) as {
      id: string; title: string; description: string; video_path: string | null
      youtube_privacy: string | null; channel_id: number; channel_name: string
    } | undefined

    if (!clip) return err('NOT_FOUND', '클립을 찾을 수 없습니다.', 404)
    if (!clip.video_path) return err('NO_VIDEO', '영상 파일이 없습니다.', 400)

    // 채널별 YouTube OAuth 토큰
    const normalizedName = clip.channel_name.toLowerCase().replace(/\s+/g, '')
    const tokenRow = db.prepare(`
      SELECT access_token, refresh_token, client_id, client_secret
      FROM youtube_oauth_tokens
      WHERE channel_name = ?
      ORDER BY updated_at DESC LIMIT 1
    `).get(normalizedName) as {
      access_token: string; refresh_token: string
      client_id: string; client_secret: string
    } | undefined

    if (!tokenRow) {
      return err('NO_TOKEN', 'YouTube 인증 토큰이 없습니다. 채널 설정에서 YouTube 연결을 완료해주세요.', 400)
    }

    // access_token 갱신
    const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: tokenRow.client_id,
        client_secret: tokenRow.client_secret,
        refresh_token: tokenRow.refresh_token,
        grant_type: 'refresh_token',
      }),
    })

    if (!refreshRes.ok) {
      const msg = await refreshRes.text()
      return err('TOKEN_REFRESH_FAILED', `YouTube 토큰 갱신 실패: ${msg}`, 502)
    }

    const { access_token } = await refreshRes.json() as { access_token: string }
    db.prepare('UPDATE youtube_oauth_tokens SET access_token = ?, updated_at = ? WHERE channel_name = ?')
      .run(access_token, Date.now(), normalizedName)

    // 영상 파일 크기
    const { size: videoSize } = statSync(clip.video_path)

    // YouTube resumable upload 초기화
    const initRes = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${access_token}`,
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': 'video/mp4',
          'X-Upload-Content-Length': String(videoSize),
        },
        body: JSON.stringify({
          snippet: {
            title: clip.title || 'Untitled',
            description: clip.description || '',
            categoryId: '10', // Music
          },
          status: {
            privacyStatus: clip.youtube_privacy || 'private',
            selfDeclaredMadeForKids: false,
          },
        }),
      }
    )

    if (!initRes.ok) {
      const msg = await initRes.text()
      return err('YOUTUBE_INIT_FAILED', `YouTube 업로드 초기화 실패: ${msg}`, 502)
    }

    const uploadUrl = initRes.headers.get('Location')
    if (!uploadUrl) return err('NO_UPLOAD_URL', 'YouTube 업로드 URL을 받지 못했습니다.', 502)

    // 스트리밍 업로드
    const fileStream = createReadStream(clip.video_path)
    const readableStream = Readable.toWeb(fileStream) as ReadableStream

    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(videoSize),
      },
      body: readableStream,
      // @ts-ignore — Node.js fetch duplex 필요
      duplex: 'half',
    })

    if (!uploadRes.ok) {
      const msg = await uploadRes.text()
      return err('YOUTUBE_UPLOAD_FAILED', `YouTube 업로드 실패: ${msg}`, 502)
    }

    const uploadData = await uploadRes.json() as { id: string }
    const youtubeVideoId = uploadData.id

    // DB 반영
    const now = Date.now()
    db.prepare(`
      UPDATE youtube_clips
      SET youtube_video_id = ?, status = 'uploaded', updated_at = ?
      WHERE id = ?
    `).run(youtubeVideoId, now, id)

    return ok({ youtube_video_id: youtubeVideoId })
  } catch (e) {
    return handleError(e)
  }
}
