export type JobStatus = 'pending' | 'running' | 'done' | 'failed'

export interface Job<T = unknown> {
  id: string
  type: string
  payload: T
  status: JobStatus
  idempotency_key: string | null
  attempts: number
  max_attempts: number
  scheduled_at: number
  picked_at: number | null
  done_at: number | null
  error: string | null
}

export interface EnqueueOptions<T> {
  type: string
  payload: T
  /** 없으면 자동 생성: sha256(type + "|" + canonical_json(payload)) */
  idempotency_key?: string
  /** 미래 실행 시각 (Unix ms). 기본: now */
  scheduled_at?: number
  max_attempts?: number
}
