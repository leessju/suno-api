import { getDb } from '../db';
import { randomUUID } from 'crypto';

export interface Session {
  id: string;
  channel_id: number;
  title: string | null;
  status: string;
  summary: string | null;
  summary_version: number;
  constraints_json: string | null;
  media_analysis: string | null;
  media_ref: string | null;
  last_summary_error: string | null;
  created_at: number;
  updated_at: number;
}

export interface CreateSessionInput {
  channel_id: number;
  title?: string;
  constraints_json?: string;
}

export function create(input: CreateSessionInput): Session {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();
  db.prepare(`
    INSERT INTO sessions (id, channel_id, title, constraints_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, input.channel_id, input.title ?? null, input.constraints_json ?? null, now, now);
  return findById(id)!;
}

export function findById(id: string): Session | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session | undefined;
}

export function listByChannel(channelId: number, limit = 50): Session[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM sessions WHERE channel_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(channelId, limit) as Session[];
}

export function listAll(limit = 100): Session[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM sessions ORDER BY created_at DESC LIMIT ?'
  ).all(limit) as Session[];
}

export interface UpdateSummaryInput {
  sessionId: string;
  newSummary: string;
  expectedVersion: number;
}

/** CAS update — returns true if updated, false if concurrent write detected */
export function updateSummary(input: UpdateSummaryInput): boolean {
  const db = getDb();
  const result = db.prepare(`
    UPDATE sessions
    SET summary = ?, summary_version = summary_version + 1, last_summary_error = NULL, updated_at = ?
    WHERE id = ? AND summary_version = ?
  `).run(input.newSummary, Date.now(), input.sessionId, input.expectedVersion);
  return result.changes > 0;
}

export function setLastSummaryError(sessionId: string, error: string): void {
  const db = getDb();
  db.prepare('UPDATE sessions SET last_summary_error = ?, updated_at = ? WHERE id = ?')
    .run(error, Date.now(), sessionId);
}

export function updateMediaAnalysis(
  sessionId: string,
  mediaAnalysis: string,
  mediaRef: string,
): void {
  const db = getDb();
  db.prepare('UPDATE sessions SET media_analysis = ?, media_ref = ?, updated_at = ? WHERE id = ?')
    .run(mediaAnalysis, mediaRef, Date.now(), sessionId);
}

/**
 * Find the most recently updated session for a channel that has media_analysis.
 * If multiple candidates exist, the newest by updated_at is returned and a warning is logged.
 */
export function findActiveSessionByChannel(channelId: number): Session | undefined {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM sessions
    WHERE channel_id = ? AND media_analysis IS NOT NULL AND media_analysis != ''
    ORDER BY updated_at DESC
    LIMIT 2
  `).all(channelId) as Session[];

  if (rows.length === 0) return undefined;
  if (rows.length > 1) {
    console.warn(
      `[sessions] findActiveSessionByChannel: ${rows.length} candidates for channel ${channelId}, using most recent (id=${rows[0].id})`,
    );
  }
  return rows[0];
}
