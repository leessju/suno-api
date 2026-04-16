import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/music-gen/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const workspaceId = searchParams.get('workspace_id')
  const channelId = searchParams.get('channel_id')
  const isChecked = searchParams.get('is_checked')
  const q = searchParams.get('q')

  try {
    const db = getDb()
    let sql = `
      SELECT wt.workspace_id, wt.suno_track_id, wt.suno_account_id, wt.is_checked,
             w.name as workspace_name, c.channel_name
      FROM workspace_tracks wt
      LEFT JOIN workspaces w ON w.id = wt.workspace_id
      LEFT JOIN channels c ON c.id = w.channel_id
      WHERE 1=1
    `
    const params: (string | number)[] = []
    if (workspaceId) { sql += ' AND wt.workspace_id = ?'; params.push(workspaceId) }
    if (channelId) { sql += ' AND w.channel_id = ?'; params.push(Number(channelId)) }
    if (isChecked !== null && isChecked !== '') { sql += ' AND wt.is_checked = ?'; params.push(Number(isChecked)) }
    if (q) { sql += ' AND wt.suno_track_id LIKE ?'; params.push(`%${q}%`) }
    sql += ' ORDER BY wt.checked_at DESC NULLS LAST LIMIT 200'

    const tracks = db.prepare(sql).all(...params)
    return NextResponse.json({ data: tracks })
  } catch (e) {
    console.error('[tracks]', e)
    return NextResponse.json({ data: [] })
  }
}
