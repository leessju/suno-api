import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/music-gen/db'

export const dynamic = 'force-dynamic'

// GET /api/music-gen/tracks
// 새 파라미터 (draft_songs 기반): workspaceId, midiId, confirmed
// 구 파라미터 (workspace_tracks 기반): workspace_id, channel_id, is_checked, q
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl

  // 새 draft_songs 기반 쿼리 (workspaceId 또는 midiId 있으면 신규 모드)
  const workspaceId = searchParams.get('workspaceId')
  const midiId = searchParams.get('midiId')
  const confirmed = searchParams.get('confirmed')  // '' | '1' | '0'

  {
    try {
      const db = getDb()
      let sql = `
        SELECT ds.*,
               mdr.workspace_midi_id,
               mdr.lyrics as draft_lyrics,
               mdr.selected_style as draft_selected_style,
               mdr.image_key as draft_image_key,
               wm.workspace_id,
               w.name as workspace_name,
               wm.label as midi_label
        FROM draft_songs ds
        JOIN midi_draft_rows mdr ON mdr.id = ds.draft_row_id
        JOIN workspace_midis wm ON wm.id = mdr.workspace_midi_id
        JOIN workspaces w ON w.id = wm.workspace_id
        WHERE 1=1
      `
      const params: (string | number)[] = []
      if (workspaceId) { sql += ' AND wm.workspace_id = ?'; params.push(workspaceId) }
      if (midiId) { sql += ' AND mdr.workspace_midi_id = ?'; params.push(midiId) }
      if (confirmed !== null && confirmed !== '') { sql += ' AND ds.is_confirmed = ?'; params.push(Number(confirmed)) }
      sql += ' ORDER BY CASE WHEN ds.is_confirmed = 1 AND ds.sort_order > 0 THEN 0 ELSE 1 END ASC, ds.sort_order ASC, ds.is_confirmed DESC, ds.created_at DESC LIMIT 500'

      const songs = db.prepare(sql).all(...params)
      return NextResponse.json({ data: songs })
    } catch (e) {
      console.error('[tracks/draft_songs]', e)
      return NextResponse.json({ data: [] })
    }
  }

  // 구 workspace_tracks 기반 (하위 호환)
  const legacyWorkspaceId = searchParams.get('workspace_id')
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
    if (legacyWorkspaceId) { sql += ' AND wt.workspace_id = ?'; params.push(String(legacyWorkspaceId)) }
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
