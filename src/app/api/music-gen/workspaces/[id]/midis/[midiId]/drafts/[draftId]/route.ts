import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'

type Params = { params: Promise<{ id: string; midiId: string; draftId: string }> }

// PATCH /drafts/[draftId] — 행 부분 업데이트 (Gemini 완료, 상태 변경 등)
export async function PATCH(
  req: NextRequest,
  { params }: Params
) {
  try {
    const { midiId, draftId } = await params
    const db = getDb()
    const body = await req.json().catch(() => ({}))

    const existing = db.prepare(
      'SELECT id FROM midi_draft_rows WHERE id = ? AND workspace_midi_id = ?'
    ).get(draftId, midiId)
    if (!existing) return err('NOT_FOUND', 'draft row not found', 404)

    // 허용 컬럼만 동적으로 SET 구성
    const allowed = [
      'title_en', 'title_jp', 'lyrics', 'narrative',
      'suno_style_prompts', 'selected_style', 'image_key',
      'original_ratio', 'vocal_gender', 'status', 'error_msg', 'made_title', 'made_title_video',
    ] as const
    type AllowedKey = typeof allowed[number]

    const sets: string[] = []
    const values: unknown[] = []
    for (const key of allowed) {
      if (key in body) {
        const v = body[key as AllowedKey]
        sets.push(`${key} = ?`)
        // suno_style_prompts는 배열이면 JSON으로 직렬화
        values.push(key === 'suno_style_prompts' && Array.isArray(v) ? JSON.stringify(v) : v)
      }
    }

    if (!sets.length) return err('BAD_REQUEST', 'no fields to update', 400)

    values.push(draftId)
    db.prepare(`UPDATE midi_draft_rows SET ${sets.join(', ')} WHERE id = ?`).run(...values)

    const updated = db.prepare('SELECT * FROM midi_draft_rows WHERE id = ?').get(draftId)
    return ok(updated)
  } catch (e) {
    return handleError(e)
  }
}

// DELETE /drafts/[draftId] — 단일 행 삭제
export async function DELETE(
  _req: NextRequest,
  { params }: Params
) {
  try {
    const { midiId, draftId } = await params
    const db = getDb()

    // 관련 job_queue 정리 (pending/processing 상태의 draft_song.generate/poll)
    const songIds = db.prepare(
      'SELECT id FROM draft_songs WHERE draft_row_id = ?'
    ).all(draftId) as { id: string }[]
    if (songIds.length > 0) {
      const ids = songIds.map(s => s.id)
      // payload에 해당 draft_row_id나 draft_song_ids가 포함된 pending job 삭제
      db.prepare(
        `DELETE FROM job_queue WHERE status IN ('pending','processing') AND (payload LIKE ? OR payload LIKE ?)`
      ).run(`%${draftId}%`, `%${ids[0]}%`)
    }

    const result = db.prepare(
      'DELETE FROM midi_draft_rows WHERE id = ? AND workspace_midi_id = ?'
    ).run(draftId, midiId)
    if (!result.changes) return err('NOT_FOUND', 'draft row not found', 404)
    return ok({ deleted: draftId })
  } catch (e) {
    return handleError(e)
  }
}
