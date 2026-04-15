import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { getDb } from '../music-gen/db'
import { generateIdempotencyKey } from './idempotency'
import type { Job, EnqueueOptions, JobStatus } from './types'

export class SqliteQueue {
  private db: Database.Database

  constructor() {
    this.db = getDb()
  }

  /** Job 추가. idempotency_key 충돌 시 기존 job 반환 */
  enqueue<T>(opts: EnqueueOptions<T>): Job<T> {
    const id = randomUUID()
    const ikey = opts.idempotency_key ?? generateIdempotencyKey(opts.type, opts.payload)
    const now = Date.now()
    const scheduled_at = opts.scheduled_at ?? now

    try {
      const stmt = this.db.prepare(`
        INSERT INTO job_queue (id, type, payload, status, idempotency_key, attempts, max_attempts, scheduled_at)
        VALUES (?, ?, ?, 'pending', ?, 0, ?, ?)
      `)
      stmt.run(id, opts.type, JSON.stringify(opts.payload), ikey, opts.max_attempts ?? 5, scheduled_at)

      return this.getById(id)!
    } catch (e: unknown) {
      // UNIQUE constraint (idempotency_key) → 기존 job 반환
      if (e instanceof Error && e.message.includes('UNIQUE')) {
        const existing = this.db.prepare(
          'SELECT * FROM job_queue WHERE idempotency_key = ?'
        ).get(ikey) as Record<string, unknown>
        return this.rowToJob<T>(existing)
      }
      throw e
    }
  }

  /** pending job 1개 pick → running으로 변경 */
  pick(types?: string[]): Job | null {
    const now = Date.now()
    let query = `
      SELECT * FROM job_queue
      WHERE status = 'pending' AND scheduled_at <= ?
    `
    const params: unknown[] = [now]

    if (types && types.length > 0) {
      query += ` AND type IN (${types.map(() => '?').join(',')})`
      params.push(...types)
    }

    query += ' ORDER BY scheduled_at ASC LIMIT 1'

    const row = this.db.prepare(query).get(...(params as Parameters<Database.Statement['get']>)) as Record<string, unknown> | undefined
    if (!row) return null

    const updated = this.db.prepare(`
      UPDATE job_queue SET status = 'running', picked_at = ?, attempts = attempts + 1
      WHERE id = ? AND status = 'pending'
    `).run(now, row.id as string)

    if (updated.changes === 0) return null // 경쟁 조건
    return this.getById(row.id as string)!
  }

  /** Job 완료 처리 */
  ack(id: string): void {
    this.db.prepare(`
      UPDATE job_queue SET status = 'done', done_at = ? WHERE id = ?
    `).run(Date.now(), id)
  }

  /** Job 실패 처리. max_attempts 초과 시 failed, 미만 시 pending으로 재시도 */
  fail(id: string, error: string): void {
    const job = this.getById(id)
    if (!job) return

    const backoffMs = Math.min(1000 * Math.pow(2, job.attempts - 1), 16000)
    const nextScheduled = Date.now() + backoffMs

    if (job.attempts >= job.max_attempts) {
      this.db.prepare(`
        UPDATE job_queue SET status = 'failed', error = ?, done_at = ? WHERE id = ?
      `).run(error, Date.now(), id)
    } else {
      this.db.prepare(`
        UPDATE job_queue SET status = 'pending', error = ?, scheduled_at = ? WHERE id = ?
      `).run(error, nextScheduled, id)
    }
  }

  getById<T = unknown>(id: string): Job<T> | null {
    const row = this.db.prepare('SELECT * FROM job_queue WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row ? this.rowToJob<T>(row) : null
  }

  stats(): Record<JobStatus, number> {
    const rows = this.db.prepare(
      "SELECT status, COUNT(*) as cnt FROM job_queue GROUP BY status"
    ).all() as { status: string; cnt: number }[]
    const result: Record<string, number> = { pending: 0, running: 0, done: 0, failed: 0 }
    for (const r of rows) result[r.status] = r.cnt
    return result as Record<JobStatus, number>
  }

  private rowToJob<T>(row: Record<string, unknown>): Job<T> {
    return {
      id: row.id as string,
      type: row.type as string,
      payload: JSON.parse(row.payload as string) as T,
      status: row.status as JobStatus,
      idempotency_key: row.idempotency_key as string | null,
      attempts: row.attempts as number,
      max_attempts: row.max_attempts as number,
      scheduled_at: row.scheduled_at as number,
      picked_at: row.picked_at as number | null,
      done_at: row.done_at as number | null,
      error: row.error as string | null,
    }
  }
}

// 싱글톤
let _queue: SqliteQueue | null = null
export function getQueue(): SqliteQueue {
  if (!_queue) _queue = new SqliteQueue()
  return _queue
}
