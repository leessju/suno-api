import { NextRequest } from 'next/server'
import { ok, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'

export async function GET(req: NextRequest) {
  try {
    const db = getDb()
    const url = new URL(req.url)
    const workspaceId = url.searchParams.get('workspace_id')
    const period = url.searchParams.get('period') ?? 'today' // today | week | all

    const now = Math.floor(Date.now() / 1000)
    const periodStart = period === 'today'
      ? now - 86400
      : period === 'week'
        ? now - 604800
        : 0

    const where = workspaceId
      ? 'WHERE workspace_id = ? AND ts > ?'
      : 'WHERE ts > ?'
    const params = workspaceId ? [workspaceId, periodStart] : [periodStart]

    const rows = db.prepare(`
      SELECT provider, model,
             SUM(input_tokens) as total_input,
             SUM(output_tokens) as total_output,
             SUM(cost_usd) as total_cost,
             COUNT(*) as call_count
      FROM gem_llm_usage
      ${where}
      GROUP BY provider, model
      ORDER BY total_cost DESC
    `).all(...params)

    const totalCost = (rows as { total_cost: number }[])
      .reduce((sum, r) => sum + (r.total_cost ?? 0), 0)

    return ok({ rows, total_cost_usd: totalCost, period })
  } catch (e) {
    return handleError(e)
  }
}
