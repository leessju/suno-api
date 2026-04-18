import { getDb } from '../db';

export interface SunoAccount {
  id: number;
  label: string;
  cookie: string;
  is_active: number;
  created_at: number;
  updated_at: number;
}

export function listActive(): SunoAccount[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM suno_accounts WHERE is_active = 1 AND deleted_at IS NULL ORDER BY id')
    .all() as SunoAccount[];
}

export function findById(id: number): SunoAccount | undefined {
  const db = getDb();
  return db
    .prepare('SELECT * FROM suno_accounts WHERE id = ? AND deleted_at IS NULL')
    .get(id) as SunoAccount | undefined;
}

export function upsert(
  account: Omit<SunoAccount, 'created_at' | 'updated_at'>,
): SunoAccount {
  const db = getDb();
  const now = Date.now();
  db.prepare(`
    INSERT INTO suno_accounts (id, label, cookie, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      label      = excluded.label,
      cookie     = excluded.cookie,
      is_active  = excluded.is_active,
      updated_at = excluded.updated_at
  `).run(account.id, account.label, account.cookie, account.is_active, now, now);
  return findById(account.id)!;
}

export function deactivate(id: number): void {
  const db = getDb();
  db.prepare(
    'UPDATE suno_accounts SET is_active = 0, updated_at = ? WHERE id = ?',
  ).run(Date.now(), id);
}
