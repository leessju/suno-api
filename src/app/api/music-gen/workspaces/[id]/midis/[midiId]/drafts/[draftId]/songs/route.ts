import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'
import { getQueue } from '@/lib/queue'

type Params = { params: Promise<{ id: string; midiId: string; draftId: string }> }
type DraftSongGeneratePayload = {
  draft_row_id: string
  draft_song_ids: string[]
  workspace_id: string
  midi_id: string
  account_id: number
}

// GET /songs — draft_row의 song 목록
export async function GET(
  _req: NextRequest,
  { params }: Params
) {
  try {
    const { midiId, draftId } = await params
    const db = getDb()

    // draft_row 소유권 확인
    const draft = db.prepare(
      'SELECT id FROM midi_draft_rows WHERE id = ? AND workspace_midi_id = ? AND deleted_at IS NULL'
    ).get(draftId, midiId)
    if (!draft) return err('NOT_FOUND', 'draft row not found', 404)

    const songs = db.prepare(
      'SELECT * FROM draft_songs WHERE draft_row_id = ? AND deleted_at IS NULL ORDER BY created_at ASC'
    ).all(draftId)

    return ok(songs)
  } catch (e) {
    return handleError(e)
  }
}

// POST /songs — pending 행 2개 즉시 INSERT (Suno 1호출 = clip 2개 반환 대응)
export async function POST(
  req: NextRequest,
  { params }: Params
) {
  try {
    const { id: workspaceId, midiId, draftId } = await params
    const db = getDb()

    // draft_row 소유권 확인
    const draft = db.prepare(
      'SELECT id FROM midi_draft_rows WHERE id = ? AND workspace_midi_id = ? AND deleted_at IS NULL'
    ).get(draftId, midiId)
    if (!draft) return err('NOT_FOUND', 'draft row not found', 404)

    const body = await req.json().catch(() => ({}))
    const styleUsed: string = body.style_used ?? ''
    const originalRatio: number | null = body.original_ratio ?? null
    const styleWeight: number | null = body.style_weight ?? null
    const weirdness: number | null = body.weirdness ?? null
    const vocalGender: string | null = body.vocal_gender ?? null

    // 이전 실패한 songs 정리 (새 생성 시 깨끗한 상태)
    db.prepare(
      "DELETE FROM draft_songs WHERE draft_row_id = ? AND status IN ('failed', 'pending')"
    ).run(draftId)

    const now = Date.now()
    const songs = [
      { id: crypto.randomUUID(), sort_order: 0 },
      { id: crypto.randomUUID(), sort_order: 1 },
    ]

    const insert = db.prepare(`
      INSERT INTO draft_songs (id, draft_row_id, style_used, original_ratio, style_weight, weirdness, vocal_gender, sort_order, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `)

    const insertMany = db.transaction(() => {
      for (const s of songs) {
        insert.run(s.id, draftId, styleUsed, originalRatio, styleWeight, weirdness, vocalGender, s.sort_order, now + s.sort_order)
      }
    })
    insertMany()

    const inserted = db.prepare(
      `SELECT * FROM draft_songs WHERE id IN (${songs.map(() => '?').join(',')}) AND deleted_at IS NULL ORDER BY created_at ASC`
    ).all(...songs.map(s => s.id))

    // job enqueue (best-effort — songs INSERT는 이미 완료됨)
    try {
      getQueue().enqueue<DraftSongGeneratePayload>({
        type: 'draft_song.generate',
        payload: {
          draft_row_id: draftId,
          draft_song_ids: songs.map(s => s.id),
          workspace_id: workspaceId,
          midi_id: midiId,
          account_id: 1,
        },
      })
    } catch (enqueueErr) {
      console.error('[songs] job enqueue 실패 (songs는 정상 INSERT됨):', enqueueErr)
    }

    return ok(inserted, 201)
  } catch (e) {
    return handleError(e)
  }
}
