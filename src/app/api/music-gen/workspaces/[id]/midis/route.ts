import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'
import { requireUser } from '@/lib/auth/guards'
import { CreateWorkspaceMidiSchema } from '@/contracts/schemas/workspace'
import { randomUUID } from 'crypto'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: workspaceId } = await params
    const { user, response } = await requireUser()
    if (response) return response

    const db = getDb()
    // 워크스페이스 소유권 확인
    const ws = db.prepare(
      'SELECT id FROM workspaces WHERE id = ? AND (user_id = ? OR user_id IS NULL)'
    ).get(workspaceId, user.id)
    if (!ws) return err('NOT_FOUND', '워크스페이스를 찾을 수 없습니다.', 404)

    const midis = db.prepare(`
      SELECT wm.*,
             mm.bpm, mm.key_signature,
             (SELECT COUNT(*) FROM workspace_tracks wt WHERE wt.workspace_midi_id = wm.id) as track_count
      FROM workspace_midis wm
      LEFT JOIN midi_masters mm ON mm.id = wm.midi_master_id
      WHERE wm.workspace_id = ?
      ORDER BY wm.created_at ASC
    `).all(workspaceId)

    return ok(midis)
  } catch (e) {
    return handleError(e)
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: workspaceId } = await params
    const { user, response } = await requireUser()
    if (response) return response

    const db = getDb()
    const ws = db.prepare(
      'SELECT id FROM workspaces WHERE id = ? AND (user_id = ? OR user_id IS NULL)'
    ).get(workspaceId, user.id)
    if (!ws) return err('NOT_FOUND', '워크스페이스를 찾을 수 없습니다.', 404)

    const body = await req.json()
    const parsed = CreateWorkspaceMidiSchema.safeParse(body)
    if (!parsed.success) return err('VALIDATION_ERROR', parsed.error.message, 400)

    const { source_type, source_ref, label, gen_mode, original_ratio, cover_image } = parsed.data
    const id = `wm_${randomUUID()}`
    const now = Date.now()

    db.prepare(`
      INSERT INTO workspace_midis
        (id, workspace_id, source_type, source_ref, label, gen_mode, original_ratio, cover_image, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(
      id, workspaceId, source_type,
      source_ref ?? null,
      label ?? null,
      gen_mode ?? 'auto',
      original_ratio ?? 50,
      cover_image ?? null,
      now, now
    )

    const midi = db.prepare('SELECT * FROM workspace_midis WHERE id = ?').get(id)
    return ok(midi, 201)
  } catch (e) {
    return handleError(e)
  }
}
