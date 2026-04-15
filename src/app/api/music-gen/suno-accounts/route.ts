import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/music-gen/db'

function maskCookie(c: string) {
  return c.slice(0, 20) + '...[masked]'
}

export async function GET() {
  const db = getDb()
  const rows = db.prepare('SELECT id, label, is_active, created_at, updated_at FROM suno_accounts ORDER BY id').all()
  return NextResponse.json({ accounts: rows })
}

export async function POST(req: NextRequest) {
  const { id, label, cookie } = await req.json()
  if (!id || !cookie) return NextResponse.json({ error: 'id and cookie required' }, { status: 400 })
  const now = Math.floor(Date.now() / 1000)
  const db = getDb()
  db.prepare(`
    INSERT INTO suno_accounts (id, label, cookie, is_active, created_at, updated_at)
    VALUES (?, ?, ?, 1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      label = excluded.label,
      cookie = excluded.cookie,
      is_active = 1,
      updated_at = excluded.updated_at
  `).run(id, label || `Account ${id}`, cookie, now, now)
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const now = Math.floor(Date.now() / 1000)
  const db = getDb()
  db.prepare('UPDATE suno_accounts SET is_active = 0, updated_at = ? WHERE id = ?').run(now, Number(id))
  return NextResponse.json({ ok: true })
}
