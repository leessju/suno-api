import { NextRequest } from 'next/server'
import { ok, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'
import { requireUser } from '@/lib/auth/guards'

export const dynamic = 'force-dynamic'

// GET /api/music-gen/uploads?workspace_id=&type=full|short&status=
export async function GET(req: NextRequest) {
  try {
    const { user, response } = await requireUser()
    if (response) return response

    const { searchParams } = new URL(req.url)
    const workspace_id = searchParams.get('workspace_id')
    const type = searchParams.get('type') // 'full' | 'short'
    const status = searchParams.get('status')

    const db = getDb()

    // Full uploads (upload_results)
    let fullRows: unknown[] = []
    if (!type || type === 'full') {
      const conds = ['w.user_id = ?']
      const params: unknown[] = [user.id]
      if (workspace_id) { conds.push('ur.workspace_id = ?'); params.push(workspace_id) }
      if (status) { conds.push('ur.status = ?'); params.push(status) }
      fullRows = db.prepare(`
        SELECT ur.id, ur.workspace_id, ur.youtube_video_id, ur.title,
               ur.description, ur.status, ur.error_message, ur.uploaded_at, ur.created_at,
               w.name as workspace_name,
               'full' as upload_type
        FROM upload_results ur
        LEFT JOIN workspaces w ON w.id = ur.workspace_id
        WHERE ${conds.join(' AND ')}
        ORDER BY ur.created_at DESC
        LIMIT 200
      `).all(...params)
    }

    // Shorts uploads
    let shortRows: unknown[] = []
    if (!type || type === 'short') {
      const conds = ['w.user_id = ?']
      const params: unknown[] = [user.id]
      if (workspace_id) { conds.push('s.workspace_id = ?'); params.push(workspace_id) }
      if (status) { conds.push('s.upload_status = ?'); params.push(status) }
      shortRows = db.prepare(`
        SELECT s.id, s.workspace_id, s.youtube_short_id as youtube_video_id, s.title,
               s.description, s.upload_status as status, NULL as error_message,
               NULL as uploaded_at, s.created_at,
               w.name as workspace_name,
               'short' as upload_type,
               s.suno_track_id, s.pinned_comment, s.hashtags
        FROM shorts s
        LEFT JOIN workspaces w ON w.id = s.workspace_id
        WHERE ${conds.join(' AND ')}
        ORDER BY s.created_at DESC
        LIMIT 200
      `).all(...params)
    }

    const combined = [...fullRows, ...shortRows].sort((a: any, b: any) => {
      return (b.created_at ?? 0) - (a.created_at ?? 0)
    })

    return ok(combined)
  } catch (e) {
    return handleError(e)
  }
}
