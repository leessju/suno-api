import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'
import { requireUser } from '@/lib/auth/guards'
import { CreateWorkspaceSchema } from '@/contracts/schemas/workspace'
import { randomUUID } from 'crypto'

export async function GET(req: NextRequest) {
  try {
    const { user, response } = await requireUser()
    if (response) return response

    const { searchParams } = new URL(req.url)
    const suno_account_id = searchParams.get('suno_account_id')
    const channel_id = searchParams.get('channel_id')

    const db = getDb()
    const conditions: string[] = ['w.user_id = ?']
    const params: unknown[] = [user.id]

    if (suno_account_id) {
      conditions.push('w.suno_account_id = ?')
      params.push(Number(suno_account_id))
    }
    if (channel_id) {
      conditions.push('w.channel_id = ?')
      params.push(Number(channel_id))
    }

    const rows = db.prepare(`
      SELECT w.*, c.channel_name, c.youtube_channel_id,
             sa.label as suno_account_label
      FROM workspaces w
      LEFT JOIN channels c ON c.id = w.channel_id
      LEFT JOIN suno_accounts sa ON sa.id = w.suno_account_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY w.created_at DESC
      LIMIT 100
    `).all(...params)
    return ok(rows)
  } catch (e) {
    return handleError(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, response } = await requireUser()
    if (response) return response

    const body = await req.json()
    const parsed = CreateWorkspaceSchema.safeParse(body)
    if (!parsed.success) {
      return err('VALIDATION_ERROR', parsed.error.message, 400)
    }

    const { name, channel_id, suno_account_id, pipeline_mode } = parsed.data
    const db = getDb()
    const id = `ws_${randomUUID()}`
    const now = Date.now()

    // suno_account_id 유효성 확인 (해당 유저 소유)
    let validSunoAccountId: number | null = null
    if (suno_account_id) {
      const acct = db.prepare(
        'SELECT id FROM suno_accounts WHERE id = ? AND (user_id = ? OR user_id IS NULL)'
      ).get(suno_account_id, user.id)
      if (!acct) return err('FORBIDDEN', '해당 Suno 계정에 접근 권한이 없습니다.', 403)
      validSunoAccountId = suno_account_id
    }

    db.prepare(`
      INSERT INTO workspaces (id, name, source_type, channel_id, suno_account_id, user_id, pipeline_mode, status, suno_sync_status, created_at, updated_at)
      VALUES (?, ?, 'youtube_video', ?, ?, ?, ?, 'draft', 'local_only', ?, ?)
    `).run(id, name, channel_id ?? null, validSunoAccountId, user.id, pipeline_mode ?? 'step', now, now)

    // Suno API 싱크 시도 (계정이 있을 때만, 실패해도 로컬 저장은 성공)
    if (validSunoAccountId) {
      try {
        const acctRow = db.prepare(
          'SELECT cookie FROM suno_accounts WHERE id = ?'
        ).get(validSunoAccountId) as { cookie: string } | undefined

        if (acctRow?.cookie) {
          const { sunoApi } = await import('@/lib/SunoApi')
          const api = await sunoApi(acctRow.cookie)
          const sunoWs = await api.createWorkspace(name)
          const sunoWsId = (sunoWs as { id?: string })?.id ?? null
          if (sunoWsId) {
            db.prepare(
              "UPDATE workspaces SET suno_workspace_id = ?, suno_project_id = ?, suno_sync_status = 'synced', suno_synced_at = ? WHERE id = ?"
            ).run(sunoWsId, sunoWsId, Date.now(), id)
          }
        }
      } catch {
        // Suno 싱크 실패 → sync_failed 기록, 로컬 워크스페이스는 유지
        db.prepare(
          "UPDATE workspaces SET suno_sync_status = 'sync_failed' WHERE id = ?"
        ).run(id)
      }
    }

    const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id)
    return ok(workspace, 201)
  } catch (e) {
    return handleError(e)
  }
}
