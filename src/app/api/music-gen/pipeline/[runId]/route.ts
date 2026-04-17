import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/music-gen/db'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params
    const db = getDb()

    const run = db.prepare(`
      SELECT pr.*, c.name as channel_name, c.sync_lens_folder
      FROM pipeline_runs pr
      LEFT JOIN channels c ON pr.channel_id = c.id
      WHERE pr.id = ?
    `).get(runId)

    if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const steps = db.prepare(
      'SELECT * FROM pipeline_steps WHERE run_id=? ORDER BY phase DESC, song_index ASC, step_code ASC'
    ).all(runId)

    const events = db.prepare(
      'SELECT * FROM pipeline_events WHERE run_id=? ORDER BY created_at DESC LIMIT 50'
    ).all(runId)

    return NextResponse.json({ data: { run, steps, events } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params
    const body = await req.json()
    const { action } = body // 'pause' | 'resume' | 'cancel'

    const db = getDb()
    const run = db.prepare('SELECT * FROM pipeline_runs WHERE id=?').get(runId) as { status: string } | undefined
    if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const now = Date.now()
    let newStatus: string

    if (action === 'pause') {
      if (run.status !== 'running') return NextResponse.json({ error: '실행 중인 파이프라인만 일시정지 가능' }, { status: 400 })
      newStatus = 'paused'
    } else if (action === 'resume') {
      if (run.status !== 'paused') return NextResponse.json({ error: '일시정지된 파이프라인만 재개 가능' }, { status: 400 })
      newStatus = 'running'
    } else if (action === 'cancel') {
      if (['completed', 'cancelled'].includes(run.status)) {
        return NextResponse.json({ error: '이미 종료된 파이프라인' }, { status: 400 })
      }
      newStatus = 'cancelled'
    } else {
      return NextResponse.json({ error: '알 수 없는 action' }, { status: 400 })
    }

    db.prepare('UPDATE pipeline_runs SET status=?, updated_at=? WHERE id=?').run(newStatus, now, runId)
    const updated = db.prepare('SELECT * FROM pipeline_runs WHERE id=?').get(runId)
    return NextResponse.json({ data: updated })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
