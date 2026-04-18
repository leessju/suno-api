import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'

type Params = { params: Promise<{ id: string; midiId: string; draftId: string; songId: string }> }

// PATCH /songs/[songId] — 개별 song 업데이트 (is_confirmed, status, suno_id 등)
export async function PATCH(
  req: NextRequest,
  { params }: Params
) {
  try {
    const { songId, draftId } = await params
    const db = getDb()

    const existing = db.prepare(
      'SELECT id FROM draft_songs WHERE id = ? AND draft_row_id = ?'
    ).get(songId, draftId)
    if (!existing) return err('NOT_FOUND', 'song not found', 404)

    const body = await req.json().catch(() => ({}))

    const allowed = [
      'suno_id', 'suno_v2_id', 'title', 'lyric', 'audio_url', 'image_url',
      'duration', 'style_used', 'is_confirmed', 'custom_image_key', 'original_ratio', 'sort_order',
      'status', 'error_msg', 'rating',
    ] as const
    type AllowedKey = typeof allowed[number]

    const sets: string[] = []
    const values: unknown[] = []
    for (const key of allowed) {
      if (key in body) {
        sets.push(`${key} = ?`)
        values.push(body[key as AllowedKey])
      }
    }

    if (!sets.length) return err('BAD_REQUEST', 'no fields to update', 400)

    values.push(songId)
    db.prepare(`UPDATE draft_songs SET ${sets.join(', ')} WHERE id = ?`).run(...values)

    const updated = db.prepare('SELECT * FROM draft_songs WHERE id = ?').get(songId)
    return ok(updated)
  } catch (e) {
    return handleError(e)
  }
}

// DELETE /songs/[songId] — 단일 song 삭제
export async function DELETE(
  _req: NextRequest,
  { params }: Params
) {
  try {
    const { songId, draftId } = await params
    const db = getDb()

    const result = db.prepare(
      'DELETE FROM draft_songs WHERE id = ? AND draft_row_id = ?'
    ).run(songId, draftId)

    if (!result.changes) return err('NOT_FOUND', 'song not found', 404)
    return ok({ deleted: songId })
  } catch (e) {
    return handleError(e)
  }
}
