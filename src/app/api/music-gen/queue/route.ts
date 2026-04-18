import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/music-gen/db'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  try {
    const db = getDb()

    // 1. Stats by status
    const statusRows = db.prepare(
      `SELECT status, COUNT(*) as cnt FROM job_queue GROUP BY status`
    ).all() as { status: string; cnt: number }[]

    const stats: Record<string, number> = { pending: 0, running: 0, done: 0, failed: 0 }
    for (const row of statusRows) {
      stats[row.status] = row.cnt
    }

    // 2. Active (running) jobs
    const activeJobs = db.prepare(
      `SELECT id, type, picked_at, attempts, max_attempts
       FROM job_queue
       WHERE status = 'running'
       ORDER BY picked_at ASC
       LIMIT 20`
    ).all()

    // 3. Failed jobs
    const failedJobs = db.prepare(
      `SELECT id, type, error, done_at, attempts
       FROM job_queue
       WHERE status = 'failed'
       ORDER BY done_at DESC
       LIMIT 10`
    ).all()

    // 4. Pending jobs
    const pendingJobs = db.prepare(
      `SELECT id, type, scheduled_at, attempts, max_attempts
       FROM job_queue
       WHERE status = 'pending'
       ORDER BY scheduled_at ASC
       LIMIT 20`
    ).all()

    // 5. Recent done jobs (최근 완료)
    const recentDoneJobs = db.prepare(
      `SELECT id, type, done_at, attempts
       FROM job_queue
       WHERE status = 'done'
       ORDER BY done_at DESC
       LIMIT 10`
    ).all()

    // 7. Job type breakdown
    const jobTypeBreakdown = db.prepare(
      `SELECT type, status, COUNT(*) as cnt
       FROM job_queue
       GROUP BY type, status
       ORDER BY type, status`
    ).all()

    // 6. Pipeline runs (active only)
    const pipelineRuns = db.prepare(
      `SELECT pr.id, pr.vol_name, pr.status, pr.current_phase, pr.total_songs,
              pr.started_at, pr.created_at, c.channel_name,
              COUNT(ps.id) as total_steps,
              SUM(CASE WHEN ps.status = 'completed' THEN 1 ELSE 0 END) as completed_steps,
              SUM(CASE WHEN ps.status = 'running' THEN 1 ELSE 0 END) as running_steps,
              SUM(CASE WHEN ps.status = 'failed' THEN 1 ELSE 0 END) as failed_steps
       FROM pipeline_runs pr
       LEFT JOIN channels c ON pr.channel_id = c.id
       LEFT JOIN pipeline_steps ps ON pr.id = ps.run_id
       WHERE pr.status IN ('pending', 'running', 'paused')
       GROUP BY pr.id
       ORDER BY pr.created_at DESC
       LIMIT 10`
    ).all()

    return NextResponse.json({
      stats,
      activeJobs,
      failedJobs,
      pendingJobs,
      recentDoneJobs,
      jobTypeBreakdown,
      pipelineRuns,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[queue/route]', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
