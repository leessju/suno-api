import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/music-gen/api-helpers'
import { sunoApi } from '@/lib/SunoApi'

/**
 * POST /api/music-gen/suno-proxy/project-clips
 * Suno workspace에 clip을 추가합니다.
 * Body: { project_id: string, clip_ids: string[], account_id?: number }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { project_id, clip_ids, account_id } = body

    if (!project_id || !clip_ids?.length) {
      return err('BAD_REQUEST', 'project_id and clip_ids required', 400)
    }

    const api = await sunoApi(account_id ?? undefined)
    await api.moveClipsToWorkspace(project_id, clip_ids)

    return ok({ success: true, project_id, clip_count: clip_ids.length })
  } catch (e) {
    const fs = await import('fs')
    const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e)
    fs.writeFileSync('/tmp/project-clips-error.log', `${new Date().toISOString()}\n${msg}\n`, { flag: 'a' })
    return handleError(e)
  }
}
