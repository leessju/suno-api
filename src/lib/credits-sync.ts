import { getDb } from './music-gen/db'

interface CreditSnapshot {
  account_id: number
  label: string | null
  credits: number
}

/** Suno 응답에서 크레딧 업데이트 (이벤트 기반, 주 경로) */
export function syncCreditsFromResponse(accountId: number, creditsRemaining: number, label?: string) {
  try {
    const db = getDb()
    const now = Math.floor(Date.now() / 1000)
    db.prepare(`
      INSERT INTO gem_credit_snapshots (account_id, label, credits, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(account_id) DO UPDATE SET
        credits = excluded.credits,
        label = COALESCE(excluded.label, label),
        updated_at = excluded.updated_at
    `).run(accountId, label ?? null, creditsRemaining, now)
  } catch (e) {
    console.error('[credits-sync] syncCreditsFromResponse failed:', e)
  }
}

/** 크레딧 스냅샷 조회 (Python worker용 — staleness 체크 포함) */
export function getCreditSnapshots(stalenessThresholdSec = 300): CreditSnapshot[] {
  try {
    const db = getDb()
    const now = Math.floor(Date.now() / 1000)
    return db.prepare(`
      SELECT account_id, label, credits
      FROM gem_credit_snapshots
      WHERE updated_at > ?
      ORDER BY credits DESC
    `).all(now - stalenessThresholdSec) as CreditSnapshot[]
  } catch {
    return []
  }
}

/** 5분 주기 안전망 cron — next.js cron handler에서 호출 */
export async function refreshAllCredits() {
  // SunoApi의 getLimit()를 계정별로 호출
  // P2에서 실제 구현
  console.log('[credits-sync] refreshAllCredits called (stub)')
}
