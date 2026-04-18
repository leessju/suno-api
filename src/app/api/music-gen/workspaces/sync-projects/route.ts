import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'
import { requireUser } from '@/lib/auth/guards'

/**
 * POST /api/music-gen/workspaces/sync-projects
 * Suno API의 프로젝트 목록을 가져와 로컬 workspaces의 suno_project_id를 업데이트합니다.
 */
export async function POST(_req: NextRequest) {
  try {
    const { user, response } = await requireUser()
    if (response) return response

    const db = getDb()

    // 사용자의 Suno 계정 목록 조회
    const accounts = db.prepare(
      'SELECT id, cookie FROM suno_accounts WHERE (user_id = ? OR user_id IS NULL) AND deleted_at IS NULL'
    ).all(user.id) as { id: number; cookie: string }[]

    if (accounts.length === 0) {
      return err('NOT_FOUND', 'Suno 계정이 없습니다.', 404)
    }

    const { sunoApi } = await import('@/lib/SunoApi')
    let totalUpdated = 0

    for (const account of accounts) {
      if (!account.cookie) continue

      try {
        const api = await sunoApi(account.cookie)
        const result = await api.getWorkspaces() as { items?: { id: string }[]; projects?: { id: string }[] }

        // Suno 응답 구조: items 또는 projects 배열
        const projects: { id: string }[] = result.items ?? result.projects ?? (Array.isArray(result) ? result as { id: string }[] : [])

        for (const project of projects) {
          if (!project.id) continue

          // suno_workspace_id로 로컬 워크스페이스 매칭 후 suno_project_id 업데이트
          const updated = db.prepare(
            'UPDATE workspaces SET suno_project_id = ? WHERE suno_workspace_id = ? AND (user_id = ? OR user_id IS NULL) AND suno_project_id IS NULL'
          ).run(project.id, project.id, user.id)

          totalUpdated += updated.changes
        }
      } catch (e) {
        console.error(`[sync-projects] 계정 ${account.id} Suno API 오류:`, e)
      }
    }

    return ok({ updated: totalUpdated })
  } catch (e) {
    return handleError(e)
  }
}
