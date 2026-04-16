import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'
import { requireUser } from '@/lib/auth/guards'
import { UpdateWorkspaceSchema } from '@/contracts/schemas/workspace'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { user, response } = await requireUser()
    if (response) return response

    const db = getDb()
    const workspace = db.prepare(`
      SELECT w.*, c.channel_name, c.youtube_channel_id, c.resource_path,
             sa.label as suno_account_label
      FROM workspaces w
      LEFT JOIN channels c ON c.id = w.channel_id
      LEFT JOIN suno_accounts sa ON sa.id = w.suno_account_id
      WHERE w.id = ? AND (w.user_id = ? OR w.user_id IS NULL)
    `).get(id, user.id)

    if (!workspace) return err('NOT_FOUND', '워크스페이스를 찾을 수 없습니다.', 404)

    const midis = db.prepare(`
      SELECT wm.*, mm.bpm, mm.key_signature, mm.chord_json,
             (SELECT COUNT(*) FROM workspace_tracks wt WHERE wt.workspace_midi_id = wm.id) as track_count
      FROM workspace_midis wm
      LEFT JOIN midi_masters mm ON mm.id = wm.midi_master_id
      WHERE wm.workspace_id = ?
      ORDER BY wm.created_at ASC
    `).all(id) as unknown[]

    return ok({ ...(workspace as object), midis })
  } catch (e) {
    return handleError(e)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { user, response } = await requireUser()
    if (response) return response

    const db = getDb()
    const ws = db.prepare(
      'SELECT id, user_id, suno_workspace_id, suno_account_id FROM workspaces WHERE id = ? AND (user_id = ? OR user_id IS NULL)'
    ).get(id, user.id) as { id: string; user_id: string | null; suno_workspace_id: string | null; suno_account_id: number | null } | undefined

    if (!ws) return err('NOT_FOUND', '워크스페이스를 찾을 수 없습니다.', 404)

    const body = await req.json()
    const parsed = UpdateWorkspaceSchema.safeParse(body)
    if (!parsed.success) return err('VALIDATION_ERROR', parsed.error.message, 400)

    const { name, channel_id, pipeline_mode } = parsed.data
    const now = Date.now()
    const sets: string[] = ['updated_at = ?']
    const vals: unknown[] = [now]

    if (name !== undefined) { sets.push('name = ?'); vals.push(name) }
    if (channel_id !== undefined) { sets.push('channel_id = ?'); vals.push(channel_id) }
    if (pipeline_mode !== undefined) { sets.push('pipeline_mode = ?'); vals.push(pipeline_mode) }

    vals.push(id)
    db.prepare(`UPDATE workspaces SET ${sets.join(', ')} WHERE id = ?`).run(...vals)

    // name 변경 시 Suno 싱크
    if (name !== undefined && ws.suno_workspace_id && ws.suno_account_id) {
      try {
        const acctRow = db.prepare(
          'SELECT cookie FROM suno_accounts WHERE id = ?'
        ).get(ws.suno_account_id) as { cookie: string } | undefined

        if (acctRow?.cookie) {
          const { sunoApi } = await import('@/lib/SunoApi')
          const api = await sunoApi(acctRow.cookie)
          await api.updateWorkspace(ws.suno_workspace_id, name)
          db.prepare(
            "UPDATE workspaces SET suno_sync_status = 'synced', suno_synced_at = ? WHERE id = ?"
          ).run(Date.now(), id)
        }
      } catch {
        db.prepare(
          "UPDATE workspaces SET suno_sync_status = 'sync_failed' WHERE id = ?"
        ).run(id)
      }
    }

    const updated = db.prepare(`
      SELECT w.*, c.channel_name FROM workspaces w
      LEFT JOIN channels c ON c.id = w.channel_id
      WHERE w.id = ?
    `).get(id)
    return ok(updated)
  } catch (e) {
    return handleError(e)
  }
}
