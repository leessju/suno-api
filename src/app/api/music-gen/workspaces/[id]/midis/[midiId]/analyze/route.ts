import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'
import { requireUser } from '@/lib/auth/guards'
import { getQueue } from '@/lib/queue'

type Params = { params: Promise<{ id: string; midiId: string }> }

/**
 * POST /api/music-gen/workspaces/{id}/midis/{midiId}/analyze
 * MIDI 분석 시작 — status를 'converting'으로 변경 후 분석 Job 큐에 등록
 */
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { id: workspaceId, midiId } = await params
    const { user, response } = await requireUser()
    if (response) return response

    const db = getDb()

    // 워크스페이스 소유권 확인
    const ws = db.prepare(
      'SELECT id FROM workspaces WHERE id = ? AND (user_id = ? OR user_id IS NULL)'
    ).get(workspaceId, user.id)
    if (!ws) return err('NOT_FOUND', '워크스페이스를 찾을 수 없습니다.', 404)

    const midi = db.prepare(
      'SELECT * FROM workspace_midis WHERE id = ? AND workspace_id = ?'
    ).get(midiId, workspaceId) as Record<string, unknown> | undefined
    if (!midi) return err('NOT_FOUND', 'MIDI를 찾을 수 없습니다.', 404)

    // 이미 처리 중이거나 완료된 경우
    if (['converting', 'midi_generating', 'analyzing', 'ready', 'done'].includes(midi.status as string)) {
      return ok({ midi, message: `이미 ${midi.status} 상태입니다.` })
    }

    const now = Date.now()
    let autoLabel: string | null = null

    // YouTube: oEmbed로 영상 제목 자동 추출
    if (midi.source_type === 'youtube_video' && midi.source_ref) {
      try {
        const oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(midi.source_ref as string)}&format=json`
        const oRes = await fetch(oEmbedUrl, { signal: AbortSignal.timeout(5000) })
        if (oRes.ok) {
          const oData = await oRes.json()
          if (oData?.title) autoLabel = oData.title
        }
      } catch { /* oEmbed 실패 시 라벨 없이 진행 */ }
    }

    // MP3: 라벨은 Gemini 분석 완료 후 Python 워커가 업데이트
    // (분석 결과에서 제목/설명 추출 → label 컬럼 업데이트)

    const sets: string[] = ["status = 'converting'", 'updated_at = ?']
    const vals: unknown[] = [now]
    if (autoLabel && !midi.label) {
      sets.push('label = ?')
      vals.push(autoLabel)
    }
    vals.push(midiId)

    db.prepare(`UPDATE workspace_midis SET ${sets.join(', ')} WHERE id = ?`).run(...vals)

    // Job 큐에 분석 작업 등록
    const queue = getQueue()
    queue.enqueue({
      type: 'midi.convert',
      payload: {
        workspace_id: workspaceId,
        workspace_midi_id: midiId,
        source_audio_path: (midi.source_ref as string) ?? '',
      },
    })

    const updated = db.prepare('SELECT * FROM workspace_midis WHERE id = ?').get(midiId)
    return ok({ midi: updated, message: '분석을 시작했습니다.' })
  } catch (e) {
    return handleError(e)
  }
}
