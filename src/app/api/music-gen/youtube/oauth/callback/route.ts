import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/music-gen/db'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state') || ''
  const error = req.nextUrl.searchParams.get('error')
  const baseUrl = req.nextUrl.origin

  if (error || !code) {
    return NextResponse.redirect(`${baseUrl}/settings/keys?youtube_auth=error&reason=${error || 'no_code'}`)
  }

  const [channelName, userId] = state.split(':')
  if (!channelName || !userId) {
    return NextResponse.redirect(`${baseUrl}/settings/keys?youtube_auth=error&reason=invalid_state`)
  }

  const db = getDb()
  const getKey = (type: string) =>
    (db.prepare('SELECT key_value FROM user_api_keys WHERE user_id = ? AND key_type = ?').get(userId, type) as { key_value: string } | undefined)?.key_value || ''

  const clientId = getKey('google_oauth_client_id') || process.env.GOOGLE_OAUTH_CLIENT_ID || ''
  const clientSecret = getKey('google_oauth_client_secret') || process.env.GOOGLE_OAUTH_CLIENT_SECRET || ''
  const redirectUri = `${baseUrl}/api/music-gen/youtube/oauth/callback`

  // code → tokens 교환
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  if (!tokenRes.ok) {
    const errText = await tokenRes.text()
    console.error('[youtube oauth callback] token exchange failed:', errText)
    return NextResponse.redirect(`${baseUrl}/settings/keys?youtube_auth=error&reason=token_exchange`)
  }

  const tokenData = await tokenRes.json() as {
    access_token: string
    refresh_token?: string
    scope: string
  }

  const now = Math.floor(Date.now() / 1000)
  const scopes = tokenData.scope || ''

  db.prepare(`
    INSERT INTO youtube_oauth_tokens
      (user_id, channel_name, access_token, refresh_token, client_id, client_secret, scopes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, channel_name) DO UPDATE SET
      access_token = excluded.access_token,
      refresh_token = CASE WHEN excluded.refresh_token != '' THEN excluded.refresh_token ELSE refresh_token END,
      client_id = excluded.client_id,
      client_secret = excluded.client_secret,
      scopes = excluded.scopes,
      updated_at = excluded.updated_at
  `).run(
    userId,
    channelName,
    tokenData.access_token,
    tokenData.refresh_token || '',
    clientId,
    clientSecret,
    scopes,
    now,
    now,
  )

  return NextResponse.redirect(`${baseUrl}/settings/keys?youtube_auth=success&channel=${channelName}`)
}
