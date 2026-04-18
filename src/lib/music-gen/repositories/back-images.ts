import { getDb } from '@/lib/music-gen/db';

export interface BackImage {
  id: number;
  channel_id: number;
  r2_key: string;
  thumbnail_r2_key: string | null;
  filename: string;
  is_cover: number;
  display_order: number;
  created_at: number;
}

export function list(channelId: number): BackImage[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM back_images WHERE channel_id = ? AND deleted_at IS NULL ORDER BY display_order ASC, id ASC')
    .all(channelId) as BackImage[];
}

export function create(channelId: number, r2Key: string, filename: string, thumbnailR2Key?: string | null): BackImage {
  const db = getDb();
  const result = db
    .prepare('INSERT INTO back_images (channel_id, r2_key, filename, thumbnail_r2_key) VALUES (?, ?, ?, ?) RETURNING *')
    .get(channelId, r2Key, filename, thumbnailR2Key ?? null) as BackImage;
  return result;
}

export function findById(id: number): BackImage | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM back_images WHERE id = ? AND deleted_at IS NULL').get(id) as BackImage | undefined;
}

export function remove(id: number): void {
  const db = getDb();
  db.prepare('UPDATE back_images SET deleted_at = unixepoch() WHERE id = ?').run(id);
}
