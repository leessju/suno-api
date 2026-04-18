import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/guards'
import { getDb } from '@/lib/music-gen/db'

export async function GET(req: NextRequest) {
  const { user, response } = await requireUser()
  if (response) return response

  const channelName = req.nextUrl.searchParams.get('channel_name') || 'default'

  const db = getDb()
  const getKey = (type: string) =>
    (db.prepare('SELECT key_value FROM user_api_keys WHERE user_id = ? AND key_type = ?').get(user.id, type) as { key_value: string } | undefined)?.key_value || ''

  const clientId = getKey('google_oauth_client_id') || process.env.GOOGLE_OAUTH_CLIENT_ID || ''
  const clientSecret = getKey('google_oauth_client_secret') || process.env.GOOGLE_OAUTH_CLIENT_SECRET || ''

  if (!clientId || !clientSecret) {
    const baseUrl = req.nextUrl.origin
    return NextResponse.redirect(`${baseUrl}/settings/keys?youtube_auth=no_credentials`)
  }

  const redirectUri = `${req.nextUrl.origin}/api/music-gen/youtube/oauth/callback`
  const state = `${channelName}:${user.id}`

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: [
      'https://www.googleapis.com/auth/youtube',
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.force-ssl',
    ].join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  })

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/auth?${params}`)
}
