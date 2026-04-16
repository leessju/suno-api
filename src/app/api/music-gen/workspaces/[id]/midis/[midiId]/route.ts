import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'
import { requireUser } from '@/lib/auth/guards'
import { UpdateWorkspaceMidiSchema } from '@/contracts/schemas/workspace'

type Params = { params: Promise<{ id: string; midiId: string }> }

async function getMidiWithAuth(workspaceId: string, midiId: string, userId: string) {
  const db = getDb()
  const ws = db.prepare(
    'SELECT id FROM workspaces WHERE id = ? AND (user_id = ? OR user_id IS NULL)'
  ).get(workspaceId, userId)
  if (!ws) return null

  return db.prepare(
    'SELECT * FROM workspace_midis WHERE id = ? AND workspace_id = ?'
  ).get(midiId, workspaceId) as Record<string, unknown> | undefined
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id, midiId } = await params
    const { user, response } = await requireUser()
    if (response) return response

    const midi = await getMidiWithAuth(id, midiId, user.id)
    if (!midi) return err('NOT_FOUND', 'MIDI를 찾을 수 없습니다.', 404)

    const db = getDb()
    const tracks = db.prepare(
      'SELECT * FROM workspace_tracks WHERE workspace_midi_id = ?'
    ).all(midiId)

    // midi_master 정보 포함
    let midiMaster = null
    if (midi.midi_master_id) {
      midiMaster = db.prepare('SELECT * FROM midi_masters WHERE id = ?').get(midi.midi_master_id as string)
    }

    return ok({ ...midi, tracks, midi_master: midiMaster })
  } catch (e) {
    return handleError(e)
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id, midiId } = await params
    const { user, response } = await requireUser()
    if (response) return response

    const midi = await getMidiWithAuth(id, midiId, user.id)
    if (!midi) return err('NOT_FOUND', 'MIDI를 찾을 수 없습니다.', 404)

    const body = await req.json()
    const parsed = UpdateWorkspaceMidiSchema.safeParse(body)
    if (!parsed.success) return err('VALIDATION_ERROR', parsed.error.message, 400)

    const now = Date.now()
    const sets: string[] = ['updated_at = ?']
    const vals: unknown[] = [now]

    const { label, gen_mode, original_ratio, status } = parsed.data
    if (label !== undefined) { sets.push('label = ?'); vals.push(label) }
    if (gen_mode !== undefined) { sets.push('gen_mode = ?'); vals.push(gen_mode) }
    if (original_ratio !== undefined) { sets.push('original_ratio = ?'); vals.push(original_ratio) }
    if (status !== undefined) { sets.push('status = ?'); vals.push(status) }

    vals.push(midiId)
    const db = getDb()
    db.prepare(`UPDATE workspace_midis SET ${sets.join(', ')} WHERE id = ?`).run(...vals)

    const updated = db.prepare('SELECT * FROM workspace_midis WHERE id = ?').get(midiId)
    return ok(updated)
  } catch (e) {
    return handleError(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id, midiId } = await params
    const { user, response } = await requireUser()
    if (response) return response

    const midi = await getMidiWithAuth(id, midiId, user.id)
    if (!midi) return err('NOT_FOUND', 'MIDI를 찾을 수 없습니다.', 404)

    const db = getDb()
    // 관련 트랙 workspace_midi_id NULL 처리
    db.prepare('UPDATE workspace_tracks SET workspace_midi_id = NULL WHERE workspace_midi_id = ?').run(midiId)
    db.prepare('DELETE FROM workspace_midis WHERE id = ?').run(midiId)

    return ok({ deleted: true })
  } catch (e) {
    return handleError(e)
  }
}
