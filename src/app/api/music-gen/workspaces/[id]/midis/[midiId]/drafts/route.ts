import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'

type Params = { params: Promise<{ id: string; midiId: string }> }

// GET /drafts — 저장된 draft 행 목록 조회
export async function GET(
  _req: NextRequest,
  { params }: Params
) {
  try {
    const { midiId } = await params
    const db = getDb()
    const rows = db.prepare(`
      SELECT * FROM midi_draft_rows
      WHERE workspace_midi_id = ?
      ORDER BY sort_order ASC, created_at ASC
    `).all(midiId)
    return ok(rows)
  } catch (e) {
    return handleError(e)
  }
}

// POST /drafts — skeleton 행 N개 일괄 INSERT
export async function POST(
  req: NextRequest,
  { params }: Params
) {
  try {
    const { midiId } = await params
    const db = getDb()
    const body = await req.json().catch(() => ({}))
    const rows: Array<{
      id: string
      imageKey?: string | null
      originalRatio?: number
      vocalGender?: string | null
      sortOrder?: number
    }> = body.rows ?? []

    if (!rows.length) return err('BAD_REQUEST', 'rows is empty', 400)

    const insert = db.prepare(`
      INSERT OR REPLACE INTO midi_draft_rows
        (id, workspace_midi_id, image_key, original_ratio, vocal_gender, sort_order, status)
      VALUES (?, ?, ?, ?, ?, ?, 'loading')
    `)

    const insertMany = db.transaction((items: typeof rows) => {
      for (const r of items) {
        insert.run(r.id, midiId, r.imageKey ?? null, r.originalRatio ?? 50, r.vocalGender ?? null, r.sortOrder ?? 0)
      }
    })
    insertMany(rows)

    return ok({ inserted: rows.length }, 201)
  } catch (e) {
    return handleError(e)
  }
}

// DELETE /drafts — workspace_midi_id 기준 전체 삭제 (초기화)
export async function DELETE(
  _req: NextRequest,
  { params }: Params
) {
  try {
    const { midiId } = await params
    const db = getDb()
    const result = db.prepare('DELETE FROM midi_draft_rows WHERE workspace_midi_id = ?').run(midiId)
    return ok({ deleted: result.changes })
  } catch (e) {
    return handleError(e)
  }
}
