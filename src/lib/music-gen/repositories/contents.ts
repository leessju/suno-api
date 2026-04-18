import { getDb } from '../db';

export interface Content {
  id: number;
  title_en: string;
  title_jp: string;
  lyrics: string;
  narrative: string;
  suno_style_prompt: string;
  emotion_input: string;
  gemini_model: string | null;
  created_at: string;
}

export interface CreateContentInput {
  title_en: string;
  title_jp: string;
  lyrics: string;
  narrative: string;
  suno_style_prompt: string;
  emotion_input: string;
  gemini_model?: string;
}

export function create(input: CreateContentInput): Content {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO contents (title_en, title_jp, lyrics, narrative, suno_style_prompt, emotion_input, gemini_model)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.title_en,
    input.title_jp,
    input.lyrics,
    input.narrative,
    input.suno_style_prompt,
    input.emotion_input,
    input.gemini_model ?? null,
  );
  return db.prepare('SELECT * FROM contents WHERE id = ?').get(result.lastInsertRowid) as Content;
}

export function listByChannel(channelId: number, limit = 20, offset = 0): Content[] {
  const db = getDb();
  return db.prepare(`
    SELECT c.*
    FROM contents c
    JOIN content_channels cc ON cc.content_id = c.id
    WHERE cc.channel_ref_id = ?
    ORDER BY c.created_at DESC
    LIMIT ? OFFSET ?
  `).all(channelId, limit, offset) as Content[];
}

export function findRecentTitlesByChannel(channelId: number, limit = 50): string[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT DISTINCT c.title_en
    FROM contents c
    JOIN content_channels cc ON cc.content_id = c.id
    WHERE cc.channel_ref_id = ? AND c.title_en IS NOT NULL AND c.title_en != ''
    ORDER BY c.created_at DESC
    LIMIT ?
  `).all(channelId, limit) as { title_en: string }[];
  return rows.map(r => r.title_en);
}

export function linkToChannel(contentId: number, channelRefId: number): void {
  const db = getDb();
  db.prepare(
    'INSERT OR IGNORE INTO content_channels (content_id, channel_ref_id) VALUES (?, ?)'
  ).run(contentId, channelRefId);
}
