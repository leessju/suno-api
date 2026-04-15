import { getDb } from '../db';
import { randomUUID } from 'crypto';

export interface Message {
  id: string;
  session_id: string;
  role: string;
  content: string;
  token_count: number;
  summarized: number;
  status: string;
  created_at: number;
}

export type MessageRole = 'user' | 'assistant' | 'system';
export type MessageStatus = 'pending' | 'complete' | 'failed';

export interface AppendMessageInput {
  sessionId: string;
  role: MessageRole;
  content: string;
  tokenCount?: number;
  status?: MessageStatus;
}

export function append(input: AppendMessageInput): Message {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();
  const tokenCount = input.tokenCount ?? Math.ceil(input.content.length / 4);
  db.prepare(`
    INSERT INTO messages (id, session_id, role, content, token_count, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, input.sessionId, input.role, input.content, tokenCount, input.status ?? 'complete', now);
  return findById(id)!;
}

export function findById(id: string): Message | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as Message | undefined;
}

export function listRecent(sessionId: string, n: number): Message[] {
  const db = getDb();
  // Fetch last N messages in chronological order
  return (db.prepare(`
    SELECT * FROM messages
    WHERE session_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(sessionId, n) as Message[]).reverse();
}

export function listUnsummarized(sessionId: string): Message[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM messages
    WHERE session_id = ? AND summarized = 0
    ORDER BY created_at ASC
  `).all(sessionId) as Message[];
}

export function countUnsummarized(sessionId: string): number {
  const db = getDb();
  const row = db.prepare(
    'SELECT COUNT(*) as cnt FROM messages WHERE session_id = ? AND summarized = 0'
  ).get(sessionId) as { cnt: number };
  return row.cnt;
}

export function markSummarized(ids: string[]): void {
  if (ids.length === 0) return;
  const db = getDb();
  const placeholders = ids.map(() => '?').join(', ');
  db.prepare(`UPDATE messages SET summarized = 1 WHERE id IN (${placeholders})`).run(...ids);
}

export function updateStatus(id: string, status: MessageStatus): void {
  const db = getDb();
  db.prepare('UPDATE messages SET status = ? WHERE id = ?').run(status, id);
}
