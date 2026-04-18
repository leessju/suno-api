import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'
import { requireUser } from '@/lib/auth/guards'
import { z } from 'zod'
import { invalidateAccountPool } from '@/lib/music-gen/gemini/account-pool'

interface GeminiAccountRow {
  id: number
  user_id: string
  name: string
  type: string
  api_key: string
  project: string | null
  location: string | null
  priority: number
  is_active: number
  created_at: number
  updated_at: number
}

const createSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['gemini-api', 'vertex-ai-apikey']),
  api_key: z.string().min(1),
  project: z.string().optional(),
  location: z.string().optional(),
  priority: z.number().int().min(0).optional(),
})

const updateSchema = z.object({
  id: z.number().int(),
  name: z.string().min(1).max(100).optional(),
  type: z.enum(['gemini-api', 'vertex-ai-apikey']).optional(),
  api_key: z.string().min(1).optional(),
  project: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  priority: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
})

function maskApiKey(key: string): string {
  if (key.length <= 8) return '****'
  return key.slice(0, 8) + '****'
}

export async function GET() {
  try {
    const { user, response } = await requireUser()
    if (response) return response

    const db = getDb()
    // 싱글 테넌트: 본인 키 + 시스템 공유 키 모두 표시
    const rows = db
      .prepare("SELECT * FROM gemini_accounts WHERE user_id = ? OR user_id = 'system' ORDER BY priority ASC, id ASC")
      .all(user.id) as GeminiAccountRow[]

    const masked = rows.map(r => ({
      ...r,
      api_key: maskApiKey(r.api_key),
      is_active: Boolean(r.is_active),
    }))

    return ok(masked)
  } catch (e) {
    return handleError(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, response } = await requireUser()
    if (response) return response

    const body = await req.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return err('INVALID_INPUT', parsed.error.message, 400)
    }

    const { name, type, api_key, project, location, priority } = parsed.data
    const db = getDb()
    const now = Math.floor(Date.now() / 1000)

    // priority가 미지정이면 현재 최대값 + 1
    let finalPriority = priority
    if (finalPriority === undefined) {
      const max = db.prepare(
        'SELECT MAX(priority) as max_p FROM gemini_accounts WHERE user_id = ?'
      ).get(user.id) as { max_p: number | null } | undefined
      finalPriority = (max?.max_p ?? -1) + 1
    }

    try {
      const result = db.prepare(`
        INSERT INTO gemini_accounts (user_id, name, type, api_key, project, location, priority, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(user.id, name, type, api_key, project ?? null, location ?? 'us-central1', finalPriority, now, now)

      invalidateAccountPool()
      return ok({ id: Number(result.lastInsertRowid), name, type, priority: finalPriority }, 201)
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes('UNIQUE constraint failed')) {
        return err('DUPLICATE_NAME', `이름 "${name}"은 이미 사용 중입니다.`, 409)
      }
      throw e
    }
  } catch (e) {
    return handleError(e)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { user, response } = await requireUser()
    if (response) return response

    const body = await req.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return err('INVALID_INPUT', parsed.error.message, 400)
    }

    const { id, ...updates } = parsed.data
    const db = getDb()

    // 본인 소유 또는 시스템 공유 키 확인
    const existing = db.prepare(
      "SELECT id FROM gemini_accounts WHERE id = ? AND (user_id = ? OR user_id = 'system')"
    ).get(id, user.id) as { id: number } | undefined
    if (!existing) {
      return err('NOT_FOUND', '계정을 찾을 수 없습니다.', 404)
    }

    const fields: string[] = []
    const values: unknown[] = []

    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name) }
    if (updates.type !== undefined) { fields.push('type = ?'); values.push(updates.type) }
    if (updates.api_key !== undefined) { fields.push('api_key = ?'); values.push(updates.api_key) }
    if (updates.project !== undefined) { fields.push('project = ?'); values.push(updates.project) }
    if (updates.location !== undefined) { fields.push('location = ?'); values.push(updates.location) }
    if (updates.priority !== undefined) { fields.push('priority = ?'); values.push(updates.priority) }
    if (updates.is_active !== undefined) { fields.push('is_active = ?'); values.push(updates.is_active ? 1 : 0) }

    if (fields.length === 0) {
      return err('INVALID_INPUT', '변경할 필드가 없습니다.', 400)
    }

    fields.push('updated_at = ?')
    values.push(Math.floor(Date.now() / 1000))
    values.push(id)

    db.prepare(`UPDATE gemini_accounts SET ${fields.join(', ')} WHERE id = ?`).run(...values)

    invalidateAccountPool()
    return ok({ success: true })
  } catch (e) {
    return handleError(e)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { user, response } = await requireUser()
    if (response) return response

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) {
      return err('INVALID_INPUT', 'id 파라미터가 필요합니다.', 400)
    }

    const db = getDb()
    const result = db.prepare(
      "DELETE FROM gemini_accounts WHERE id = ? AND (user_id = ? OR user_id = 'system')"
    ).run(Number(id), user.id)

    if (result.changes === 0) {
      return err('NOT_FOUND', '계정을 찾을 수 없습니다.', 404)
    }

    invalidateAccountPool()
    return ok({ deleted: true })
  } catch (e) {
    return handleError(e)
  }
}
