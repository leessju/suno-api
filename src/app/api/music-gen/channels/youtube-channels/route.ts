import { ok, handleError } from '@/lib/music-gen/api-helpers'
import { requireUser } from '@/lib/auth/guards'
import { getDb } from '@/lib/music-gen/db'
import * as channelsRepo from '@/lib/music-gen/repositories/channels'

interface YouTubeOAuthToken {
  id: number
  user_id: string
  channel_name: string
  youtube_channel_id: string | null
  youtube_channel_title: string | null
  youtube_channel_handle: string | null
  access_token: string
  refresh_token: string
  client_id: string
  client_secret: string
  scopes: string
  created_at: number
  updated_at: number
}

interface YouTubeChannel {
  id: string
  title: string
  handle: string | null
  thumbnail: string | null
  subscriberCount: number | null
  videoCount: number | null
  tokenName: string
  registered: boolean
  registeredId?: number
  tokenExpired: boolean
}

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { user, response } = await requireUser()
    if (response) return response

    const db = getDb()
    const tokens = db.prepare(
      'SELECT * FROM youtube_oauth_tokens WHERE user_id = ?'
    ).all(user.id) as YouTubeOAuthToken[]

    if (tokens.length === 0) {
      return ok([])
    }

    // 등록된 채널 목록 (ID, 핸들, 이름으로 매칭)
    const registeredChannels = channelsRepo.list() as Array<{
      id: number
      youtube_channel_id: string
      channel_handle?: string
      channel_name: string
    }>
    function findRegistered(youtubeId: string, handle: string | null): number | undefined {
      const lowerId = youtubeId.toLowerCase()
      for (const ch of registeredChannels) {
        if (ch.youtube_channel_id.toLowerCase() === lowerId) return ch.id
        if (handle && ch.channel_handle === handle) return ch.id
      }
      return undefined
    }

    const channels: YouTubeChannel[] = []

    for (const token of tokens) {
      try {
        // Access token 갱신
        const refreshBody = new URLSearchParams({
          client_id: token.client_id,
          client_secret: token.client_secret,
          refresh_token: token.refresh_token,
          grant_type: 'refresh_token',
        })

        const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          body: refreshBody,
        })

        if (!refreshRes.ok) {
          channels.push({
            id: token.youtube_channel_id || '',
            title: token.youtube_channel_title || token.channel_name,
            handle: token.youtube_channel_handle,
            thumbnail: null,
            subscriberCount: null,
            videoCount: null,
            tokenName: token.channel_name,
            registered: false,
            tokenExpired: true,
          })
          continue
        }

        const newToken = await refreshRes.json() as { access_token: string }
        const accessToken = newToken.access_token

        // 새 access_token DB 업데이트
        const now = Math.floor(Date.now() / 1000)
        db.prepare(
          'UPDATE youtube_oauth_tokens SET access_token = ?, updated_at = ? WHERE id = ?'
        ).run(accessToken, now, token.id)

        // YouTube Data API로 채널 정보 가져오기
        const ytRes = await fetch(
          'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true',
          { headers: { Authorization: `Bearer ${accessToken}` } }
        )

        if (!ytRes.ok) {
          channels.push({
            id: token.youtube_channel_id || '',
            title: token.youtube_channel_title || token.channel_name,
            handle: token.youtube_channel_handle,
            thumbnail: null,
            subscriberCount: null,
            videoCount: null,
            tokenName: token.channel_name,
            registered: false,
            tokenExpired: true,
          })
          continue
        }

        const ytData = await ytRes.json() as {
          items?: Array<{
            id: string
            snippet: {
              title: string
              customUrl?: string
              thumbnails?: { default?: { url: string } }
            }
            statistics?: { subscriberCount?: string; videoCount?: string }
          }>
        }

        for (const item of ytData.items || []) {
          const snippet = item.snippet
          const stats = item.statistics || {}
          const youtubeId = item.id
          const handle = snippet.customUrl?.replace('@', '') || null
          const regId = findRegistered(youtubeId, handle)

          // DB에 채널 정보 캐싱 업데이트
          db.prepare(
            'UPDATE youtube_oauth_tokens SET youtube_channel_id = ?, youtube_channel_title = ?, youtube_channel_handle = ?, updated_at = ? WHERE id = ?'
          ).run(youtubeId, snippet.title, handle, Math.floor(Date.now() / 1000), token.id)

          channels.push({
            id: youtubeId,
            title: snippet.title,
            handle,
            thumbnail: snippet.thumbnails?.default?.url || null,
            subscriberCount: stats.subscriberCount ? Number(stats.subscriberCount) : null,
            videoCount: stats.videoCount ? Number(stats.videoCount) : null,
            tokenName: token.channel_name,
            registered: regId !== undefined,
            registeredId: regId,
            tokenExpired: false,
          })
        }
      } catch {
        channels.push({
          id: token.youtube_channel_id || '',
          title: token.youtube_channel_title || token.channel_name,
          handle: token.youtube_channel_handle,
          thumbnail: null,
          subscriberCount: null,
          videoCount: null,
          tokenName: token.channel_name,
          registered: false,
          tokenExpired: true,
        })
      }
    }

    return ok(channels)
  } catch (e) {
    return handleError(e)
  }
}
