import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/music-gen/db'

// localhost only 체크 (기존 /api/internal 패턴과 동일)
function isLocalhost(req: NextRequest): boolean {
  const forwarded = req.headers.get('x-forwarded-for')
  const host = req.headers.get('host') ?? ''
  if (forwarded) return false
  return host.startsWith('localhost') || host.startsWith('127.0.0.1')
}

interface YouTubeOAuthToken {
  id: number
  user_id: string
  channel_name: string
  youtube_channel_id: string | null
  access_token: string
  refresh_token: string
  client_id: string
  client_secret: string
  scopes: string
}

/**
 * GET /api/internal/youtube-token?channel_name=phonk
 * GET /api/internal/youtube-token?channel_id=3
 *
 * Python worker가 호출. access_token을 자동 갱신 후 반환.
 */
export async function GET(req: NextRequest) {
  if (!isLocalhost(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const channelName = req.nextUrl.searchParams.get('channel_name')
  const channelIdParam = req.nextUrl.searchParams.get('channel_id')

  if (!channelName && !channelIdParam) {
    return NextResponse.json({ error: 'channel_name or channel_id required' }, { status: 400 })
  }

  try {
    const db = getDb()
    let resolvedChannelName = channelName

    // channel_id로 조회 시 channels 테이블에서 channel_name 매핑
    if (!resolvedChannelName && channelIdParam) {
      const channelId = parseInt(channelIdParam, 10)
      const row = db.prepare(
        'SELECT channel_name FROM channels WHERE id = ? AND deleted_at IS NULL'
      ).get(channelId) as { channel_name: string } | undefined

      if (!row) {
        return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
      }
      // channel_name 정규화 (upload.py 기존 로직과 동일)
      resolvedChannelName = row.channel_name.toLowerCase().replace(/\s+/g, '')
    }

    // youtube_oauth_tokens에서 channel_name으로 조회 (전체 유저 대상 — internal API)
    const token = db.prepare(
      'SELECT * FROM youtube_oauth_tokens WHERE channel_name = ? ORDER BY updated_at DESC LIMIT 1'
    ).get(resolvedChannelName) as YouTubeOAuthToken | undefined

    if (!token) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 })
    }

    // refresh_token으로 새 access_token 발급
    const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: token.client_id,
        client_secret: token.client_secret,
        refresh_token: token.refresh_token,
        grant_type: 'refresh_token',
      }),
    })

    if (!refreshRes.ok) {
      const errText = await refreshRes.text()
      console.error('[internal/youtube-token] refresh failed:', errText)
      return NextResponse.json({ error: 'Token refresh failed' }, { status: 502 })
    }

    const refreshData = await refreshRes.json() as { access_token: string }
    const newAccessToken = refreshData.access_token

    // DB 업데이트
    const now = Math.floor(Date.now() / 1000)
    db.prepare(
      'UPDATE youtube_oauth_tokens SET access_token = ?, updated_at = ? WHERE id = ?'
    ).run(newAccessToken, now, token.id)

    return NextResponse.json({
      access_token: newAccessToken,
      refresh_token: token.refresh_token,
      client_id: token.client_id,
      client_secret: token.client_secret,
      token_uri: 'https://oauth2.googleapis.com/token',
      scopes: token.scopes ? token.scopes.split(' ') : [],
    })
  } catch (e) {
    console.error('[internal/youtube-token]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
