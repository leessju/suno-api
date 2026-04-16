import { getDb } from '@/lib/music-gen/db';

export interface BackImage {
  id: number;
  channel_id: number;
  r2_key: string;
  filename: string;
  is_cover: number;
  display_order: number;
  created_at: number;
}

export function list(channelId: number): BackImage[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM back_images WHERE channel_id = ? ORDER BY display_order ASC, id ASC')
    .all(channelId) as BackImage[];
}

export function create(channelId: number, r2Key: string, filename: string): BackImage {
  const db = getDb();
  const result = db
    .prepare('INSERT INTO back_images (channel_id, r2_key, filename) VALUES (?, ?, ?) RETURNING *')
    .get(channelId, r2Key, filename) as BackImage;
  return result;
}

export function findById(id: number): BackImage | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM back_images WHERE id = ?').get(id) as BackImage | undefined;
}

export function remove(id: number): void {
  const db = getDb();
  db.prepare('DELETE FROM back_images WHERE id = ?').run(id);
}

export function setCover(id: number, channelId: number): void {
  const db = getDb();
  const setCovers = db.transaction(() => {
    db.prepare('UPDATE back_images SET is_cover = 0 WHERE channel_id = ?').run(channelId);
    db.prepare('UPDATE back_images SET is_cover = 1 WHERE id = ?').run(id);
  });
  setCovers();
}
