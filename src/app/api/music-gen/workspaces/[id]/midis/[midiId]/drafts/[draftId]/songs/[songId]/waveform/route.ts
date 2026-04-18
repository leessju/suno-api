import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'
import { sunoApi } from '@/lib/SunoApi'

type Params = { params: Promise<{ id: string; midiId: string; draftId: string; songId: string }> }

/**
 * GET /songs/[songId]/waveform
 * Suno API에서 waveform aggregates 데이터를 가져옵니다.
 * mp3 다운로드 완료(status='done') 후에만 호출 가능합니다.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id: workspaceId, songId } = await params
    const db = getDb()

    // workspace 소유권 확인
    const ws = db.prepare('SELECT suno_account_id FROM workspaces WHERE id = ?').get(workspaceId) as { suno_account_id: number | null } | undefined
    if (!ws) return err('NOT_FOUND', 'workspace not found', 404)

    const song = db.prepare('SELECT suno_id, status, waveform_data FROM draft_songs WHERE id = ? AND deleted_at IS NULL').get(songId) as { suno_id: string | null; status: string; waveform_data: string | null } | undefined
    if (!song) return err('NOT_FOUND', 'song not found', 404)
    if (!song.suno_id) return err('BAD_REQUEST', 'suno_id 미설정', 400)
    if (song.status !== 'done') return err('BAD_REQUEST', 'mp3 생성이 완료되지 않았습니다', 400)

    // DB 캐시 확인
    if (song.waveform_data) {
      console.log(`[waveform] DB 캐시 히트: songId=${songId}`)
      return ok(JSON.parse(song.waveform_data))
    }

    console.log(`[waveform] 요청: songId=${songId}, sunoId=${song.suno_id}, accountId=${ws.suno_account_id}`)
    const api = await sunoApi(ws.suno_account_id ?? undefined)
    console.log('[waveform] sunoApi 초기화 완료')
    const waveform = await api.getWaveformAggregates(song.suno_id)
    console.log('[waveform] 응답 수신:', typeof waveform, Array.isArray(waveform) ? `${(waveform as unknown[]).length}개` : '')

    // DB에 캐시 저장
    db.prepare('UPDATE draft_songs SET waveform_data = ? WHERE id = ?').run(JSON.stringify(waveform), songId)

    return ok(waveform)
  } catch (e) {
    console.error('[waveform] 오류:', e)
    return handleError(e)
  }
}
