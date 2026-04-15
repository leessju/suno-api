import { getDb } from '../db';

export interface GlobalSetting {
  key: string;
  value: string;
  updated_at: number;
}

export function get(key: string): GlobalSetting | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM gem_global_settings WHERE key = ?').get(key) as GlobalSetting | undefined;
}

export function set(key: string, value: string): GlobalSetting {
  const db = getDb();
  const now = Date.now();
  db.prepare(`
    INSERT INTO gem_global_settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value, now);
  return get(key)!;
}

export function list(): GlobalSetting[] {
  const db = getDb();
  return db.prepare('SELECT * FROM gem_global_settings ORDER BY key').all() as GlobalSetting[];
}
