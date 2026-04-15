import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/music-gen/db'

// localhost only 체크
function isLocalhost(req: NextRequest): boolean {
  const forwarded = req.headers.get('x-forwarded-for')
  const host = req.headers.get('host') ?? ''
  if (forwarded) return false // 프록시를 통한 외부 요청
  return host.startsWith('localhost') || host.startsWith('127.0.0.1')
}

export async function GET(req: NextRequest) {
  if (!isLocalhost(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const db = getDb()
    const snapshots = db.prepare('SELECT * FROM gem_credit_snapshots ORDER BY account_id').all()
    return NextResponse.json({ data: snapshots })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!isLocalhost(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    // { account_id: number, credits: number, label?: string }[]
    const updates = Array.isArray(body) ? body : [body]

    const db = getDb()
    const now = Math.floor(Date.now() / 1000)

    const upsert = db.prepare(`
      INSERT INTO gem_credit_snapshots (account_id, label, credits, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(account_id) DO UPDATE SET
        credits = excluded.credits,
        label = COALESCE(excluded.label, label),
        updated_at = excluded.updated_at
    `)

    const tx = db.transaction(() => {
      for (const u of updates) {
        upsert.run(u.account_id, u.label ?? null, u.credits, now)
      }
    })
    tx()

    return NextResponse.json({ ok: true, updated: updates.length })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
