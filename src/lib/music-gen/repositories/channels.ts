import { getDb } from '../db';

export interface Channel {
  id: number;
  channel_name: string;
  youtube_channel_id: string;
  channel_handle: string | null;
  lyric_format: string;
  created_at: string;
  updated_at: string;
}

export interface ChannelWithPersona extends Channel {
  system_prompt: string;
  forbidden_words: string;
  recommended_words: string;
}

export interface CreateChannelInput {
  channel_name: string;
  youtube_channel_id: string;
  channel_handle?: string;
  system_prompt: string;
  forbidden_words?: string[];
  recommended_words?: string[];
  lyric_format?: string;
}

export interface UpdateChannelInput {
  channel_name?: string;
  system_prompt?: string;
  forbidden_words?: string[];
  recommended_words?: string[];
  lyric_format?: string;
  channel_handle?: string;
}

export function findById(id: number): ChannelWithPersona | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM channels WHERE id = ?').get(id) as ChannelWithPersona | undefined;
}

export function findByYoutubeId(youtubeChannelId: string): ChannelWithPersona | undefined {
  const db = getDb();
  return db
    .prepare('SELECT * FROM channels WHERE LOWER(youtube_channel_id) = LOWER(?)')
    .get(youtubeChannelId) as ChannelWithPersona | undefined;
}

export function create(input: CreateChannelInput): ChannelWithPersona {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO channels (channel_name, youtube_channel_id, channel_handle, system_prompt, forbidden_words, recommended_words, lyric_format)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.channel_name,
    input.youtube_channel_id,
    input.channel_handle ?? null,
    input.system_prompt,
    JSON.stringify(input.forbidden_words ?? []),
    JSON.stringify(input.recommended_words ?? []),
    input.lyric_format ?? 'jp2_en1',
  );
  return findById(result.lastInsertRowid as number)!;
}

export function update(id: number, input: UpdateChannelInput): ChannelWithPersona | undefined {
  const db = getDb();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (input.channel_name !== undefined) { fields.push('channel_name = ?'); values.push(input.channel_name); }
  if (input.system_prompt !== undefined) { fields.push('system_prompt = ?'); values.push(input.system_prompt); }
  if (input.forbidden_words !== undefined) { fields.push('forbidden_words = ?'); values.push(JSON.stringify(input.forbidden_words)); }
  if (input.recommended_words !== undefined) { fields.push('recommended_words = ?'); values.push(JSON.stringify(input.recommended_words)); }
  if (input.lyric_format !== undefined) { fields.push('lyric_format = ?'); values.push(input.lyric_format); }
  if (input.channel_handle !== undefined) { fields.push('channel_handle = ?'); values.push(input.channel_handle); }

  if (fields.length === 0) return findById(id);

  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);

  db.prepare(`UPDATE channels SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return findById(id);
}

export function list(): Channel[] {
  const db = getDb();
  return db.prepare(
    'SELECT id, channel_name, youtube_channel_id, channel_handle, lyric_format, created_at, updated_at FROM channels ORDER BY created_at DESC'
  ).all() as Channel[];
}

export function deleteById(id: number): void {
  const db = getDb();
  db.prepare('DELETE FROM channels WHERE id = ?').run(id);
}
