import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'
import { requireUser } from '@/lib/auth/guards'
import { sunoApi } from '@/lib/SunoApi'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { user, response } = await requireUser()
    if (response) return response

    const db = getDb()
    const account = db.prepare(
      'SELECT id, user_id FROM suno_accounts WHERE id = ?'
    ).get(Number(id)) as { id: number; user_id: string | null } | undefined

    if (!account) return err('NOT_FOUND', 'Suno 계정을 찾을 수 없습니다.', 404)
    if (account.user_id && account.user_id !== user.id) {
      return err('FORBIDDEN', '접근 권한이 없습니다.', 403)
    }

    const api = await sunoApi(account.id)
    const credits = await api.getCredits() as {
      credits_left: number
      period: string
      monthly_limit: number
      monthly_usage: number
    }

    return ok(credits)
  } catch (e) {
    return handleError(e)
  }
}
