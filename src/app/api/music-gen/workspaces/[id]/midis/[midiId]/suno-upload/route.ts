import fs from 'fs'
import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'
import { requireUser } from '@/lib/auth/guards'
import { downloadObject } from '@/lib/r2'

type Params = { params: Promise<{ id: string; midiId: string }> }

/**
 * POST /suno-upload
 * MIDI 오디오를 Suno에 업로드하여 cover_clip_id를 받아 저장.
 * audio_url(R2) 없으면 midi_master.mp3_r2_key(로컬/R2) 폴백.
 * 이미 suno_cover_clip_id가 있으면 재사용.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { id: workspaceId, midiId } = await params
    const { user, response } = await requireUser()
    if (response) return response

    const db = getDb()

    // 워크스페이스 + 계정 확인
    const ws = db.prepare(`
      SELECT w.id, w.suno_account_id, w.suno_project_id, sa.cookie
      FROM workspaces w
      LEFT JOIN suno_accounts sa ON sa.id = w.suno_account_id
      WHERE w.id = ? AND (w.user_id = ? OR w.user_id IS NULL)
    `).get(workspaceId, user.id) as { id: string; suno_account_id: number | null; suno_project_id: string | null; cookie: string | null } | undefined

    if (!ws) return err('NOT_FOUND', '워크스페이스를 찾을 수 없습니다.', 404)
    if (!ws.cookie) return err('MISSING_CONFIG', 'Suno 계정이 설정되지 않았습니다.', 400)

    // MIDI + midi_master 확인
    const midi = db.prepare(`
      SELECT wm.id, wm.audio_url, wm.label, wm.suno_cover_clip_id,
             mm.mp3_r2_key AS master_mp3_key
      FROM workspace_midis wm
      LEFT JOIN midi_masters mm ON mm.id = wm.midi_master_id
      WHERE wm.id = ? AND wm.workspace_id = ?
    `).get(midiId, workspaceId) as {
      id: string
      audio_url: string | null
      label: string | null
      suno_cover_clip_id: string | null
      master_mp3_key: string | null
    } | undefined

    if (!midi) return err('NOT_FOUND', 'MIDI를 찾을 수 없습니다.', 404)

    // 이미 업로드된 경우 재사용
    if (midi.suno_cover_clip_id) {
      return ok({ clip_id: midi.suno_cover_clip_id, reused: true })
    }

    // 오디오 소스 결정: master_mp3_key(chords.mp3) 우선 → audio_url(원본) 폴백
    const audioKey = midi.master_mp3_key || midi.audio_url
    if (!audioKey) return err('MISSING_AUDIO', '오디오 파일이 없습니다. MIDI 분석을 먼저 완료하세요.', 400)

    // 로컬 경로 vs R2 key 분기
    let audioBuffer: Buffer
    if (audioKey.startsWith('/')) {
      // 로컬 파일 경로 (개발 환경)
      if (!fs.existsSync(audioKey)) return err('FILE_NOT_FOUND', `오디오 파일을 찾을 수 없습니다: ${audioKey}`, 500)
      audioBuffer = fs.readFileSync(audioKey)
    } else {
      const audioRes = await downloadObject(audioKey)
      if (!audioRes.ok) return err('R2_ERROR', '오디오 파일을 가져올 수 없습니다.', 500)
      audioBuffer = Buffer.from(await audioRes.arrayBuffer())
    }

    const filename = `${midi.label ?? midiId}.mp3`

    // Suno 업로드
    const { sunoApi } = await import('@/lib/SunoApi')
    const api = await sunoApi(ws.cookie)
    const uploadResult = await api.uploadAudio(audioBuffer, filename)

    const r = uploadResult as Record<string, unknown>
    const clip = r.clip as Record<string, unknown> | undefined
    const clipId: string = (clip?.id ?? clip?.clip_id ?? r.uploadId) as string

    if (!clipId) return err('UPLOAD_FAILED', 'Suno 업로드 후 clip_id를 받지 못했습니다.', 500)

    // 업로드된 클립을 워크스페이스로 이동
    if (ws.suno_project_id) {
      try {
        await api.moveClipsToWorkspace(ws.suno_project_id, [clipId])
      } catch (moveErr) {
        console.warn('[suno-upload] workspace 이동 실패 (업로드는 성공):', moveErr)
      }
    }

    // DB 저장
    db.prepare(
      'UPDATE workspace_midis SET suno_cover_clip_id = ?, updated_at = ? WHERE id = ?'
    ).run(clipId, Date.now(), midiId)

    return ok({ clip_id: clipId, reused: false })
  } catch (e) {
    const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e)
    console.error('[suno-upload] 에러:', msg)
    fs.writeFileSync('/tmp/suno-upload-error.log', `${new Date().toISOString()}\n${msg}\n`, { flag: 'a' })
    return handleError(e)
  }
}
