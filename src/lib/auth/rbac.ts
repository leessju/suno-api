import { getDb } from '@/lib/music-gen/db'

export type UserRole = 'admin' | 'common'

export function getUserRole(userId: string): UserRole {
  try {
    const db = getDb()
    const row = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').get(userId) as { role: string } | undefined
    return (row?.role as UserRole) ?? 'common'
  } catch {
    return 'common'
  }
}

export function isAdmin(userId: string): boolean {
  return getUserRole(userId) === 'admin'
}
