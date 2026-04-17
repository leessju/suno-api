import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/music-gen/db'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

function getSyncLensRoot(): string {
  const root = process.env.SYNC_LENS_ROOT
  if (!root) throw new Error('SYNC_LENS_ROOT 환경변수가 설정되지 않았습니다')
  return root
}

function generateId(): string {
  return crypto.randomUUID()
}

// Song steps 정의
const SONG_STEPS = [
  { code: 'S1', name: 'extract_lyrics' },
  { code: 'S2', name: 'translate_lyrics' },
  { code: 'S3', name: 'generate_cover' },
  { code: 'S4', name: 'render_song' },
  { code: 'S5', name: 'verify_audio' },
]

// Vol steps 정의
const VOL_STEPS = [
  { code: 'V1', name: 'concat_videos' },
  { code: 'V2', name: 'assign_backgrounds' },
  { code: 'V3', name: 'gen_thumbnails' },
  { code: 'V4', name: 'gen_subtitles' },
  { code: 'V5', name: 'upload_full' },
  { code: 'V6', name: 'gen_shorts' },
  { code: 'V7', name: 'upload_shorts' },
  { code: 'V8', name: 'post_comment' },
]

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const channelId = searchParams.get('channel_id')
    const status = searchParams.get('status')

    const db = getDb()
    let query = `
      SELECT pr.*, c.name as channel_name, c.sync_lens_folder,
             COUNT(ps.id) as total_steps,
             SUM(CASE WHEN ps.status = 'completed' THEN 1 ELSE 0 END) as completed_steps
      FROM pipeline_runs pr
      LEFT JOIN channels c ON pr.channel_id = c.id
      LEFT JOIN pipeline_steps ps ON pr.id = ps.run_id
    `
    const conditions: string[] = []
    const params: (string | number)[] = []

    if (channelId) { conditions.push('pr.channel_id = ?'); params.push(parseInt(channelId)) }
    if (status) { conditions.push('pr.status = ?'); params.push(status) }

    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ')
    query += ' GROUP BY pr.id ORDER BY pr.created_at DESC LIMIT 50'

    const runs = db.prepare(query).all(...params)

    // 상태별 카운트
    const stats = db.prepare(
      "SELECT status, COUNT(*) as cnt FROM pipeline_runs GROUP BY status"
    ).all() as { status: string; cnt: number }[]

    const statMap: Record<string, number> = { pending: 0, running: 0, completed: 0, failed: 0, paused: 0, cancelled: 0 }
    for (const s of stats) statMap[s.status] = (statMap[s.status] ?? 0) + s.cnt

    return NextResponse.json({ data: runs, stats: statMap })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const syncLensRoot = getSyncLensRoot()
    const body = await req.json()
    const { workspace_id, channel_id, vol_name } = body

    if (!workspace_id || !channel_id || !vol_name) {
      return NextResponse.json({ error: 'workspace_id, channel_id, vol_name 필수' }, { status: 400 })
    }

    const db = getDb()

    // channel 조회
    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channel_id) as { sync_lens_folder?: string; name: string } | undefined
    if (!channel) return NextResponse.json({ error: '채널을 찾을 수 없습니다' }, { status: 404 })

    const channelFolder = channel.sync_lens_folder || channel.name
    const syncLensPath = path.join(syncLensRoot, channelFolder, vol_name)
    const songsDir = path.join(syncLensPath, '01_songs')

    // 01_songs 디렉토리 스캔
    if (!fs.existsSync(songsDir)) {
      return NextResponse.json({ error: `01_songs 폴더를 찾을 수 없습니다: ${songsDir}` }, { status: 400 })
    }

    const mp3Files = fs.readdirSync(songsDir)
      .filter(f => f.endsWith('.mp3') && !f.includes('_vocals') && !f.includes('_origin'))
      .sort()

    if (mp3Files.length === 0) {
      return NextResponse.json({ error: '01_songs에 mp3 파일이 없습니다' }, { status: 400 })
    }

    const now = Date.now()
    const runId = generateId()

    // 트랜잭션으로 일괄 INSERT
    const insertRun = db.prepare(`
      INSERT INTO pipeline_runs (id, workspace_id, channel_id, vol_name, sync_lens_path, status, current_phase, total_songs, config_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'pending', 'song', ?, '{}', ?, ?)
    `)

    const insertStep = db.prepare(`
      INSERT INTO pipeline_steps (id, run_id, step_code, step_name, phase, song_index, song_title, status, attempts, max_attempts, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, 3, ?)
    `)

    const insertJob = db.prepare(`
      INSERT INTO job_queue (id, type, payload, status, attempts, max_attempts, scheduled_at)
      VALUES (?, ?, ?, 'pending', 0, 3, ?)
    `)

    const insertStepJobUpdate = db.prepare(`
      UPDATE pipeline_steps SET status='running', job_id=?, started_at=? WHERE id=?
    `)

    db.transaction(() => {
      insertRun.run(runId, workspace_id, channel_id, vol_name, syncLensPath, mp3Files.length, now, now)

      // Song steps 생성
      for (let i = 0; i < mp3Files.length; i++) {
        const songTitle = mp3Files[i].replace(/\.mp3$/, '')
        const songIndex = i + 1
        for (const step of SONG_STEPS) {
          insertStep.run(generateId(), runId, step.code, step.name, 'song', songIndex, songTitle, now)
        }
      }

      // Vol steps 생성
      for (const step of VOL_STEPS) {
        insertStep.run(generateId(), runId, step.code, step.name, 'vol', null, null, now)
      }

      // 첫 번째 곡의 S1 step 찾아 job enqueue
      const firstS1 = db.prepare(`
        SELECT * FROM pipeline_steps WHERE run_id=? AND phase='song' AND song_index=1 AND step_code='S1'
      `).get(runId) as { id: string; song_title: string } | undefined

      if (firstS1) {
        const jobId = generateId()
        const payload = JSON.stringify({
          run_id: runId,
          step_id: firstS1.id,
          sync_lens_path: syncLensPath,
          vol_name,
          song_index: 1,
          song_title: firstS1.song_title,
          config_json: '{}',
        })
        insertJob.run(jobId, 'synclens.extract_lyrics', payload, now)
        insertStepJobUpdate.run(jobId, now, firstS1.id)
      }

      // pipeline_runs status를 running으로 + started_at
      db.prepare("UPDATE pipeline_runs SET status='running', started_at=? WHERE id=?").run(now, runId)

    })()

    const run = db.prepare('SELECT * FROM pipeline_runs WHERE id=?').get(runId)
    return NextResponse.json({ data: run }, { status: 201 })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
