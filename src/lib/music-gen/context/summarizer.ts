import { getDb } from '../db';
import * as sessionsRepo from '../repositories/sessions';
import * as messagesRepo from '../repositories/messages';
import { getAccountPool } from '../gemini/account-pool';
import pino from 'pino';

const logger = pino({ name: 'music-gen:summarizer' });

const SUMMARY_THRESHOLD = parseInt(process.env.MUSICGEN_SUMMARY_THRESHOLD ?? '20', 10);
const MAX_SUMMARY_TOKENS = parseInt(process.env.MUSICGEN_MAX_SUMMARY_TOKENS ?? '500', 10);

export function shouldSummarize(sessionId: string, compressionNeeded: boolean): boolean {
  if (compressionNeeded) return true;
  return messagesRepo.countUnsummarized(sessionId) >= SUMMARY_THRESHOLD;
}

export async function summarizeSession(sessionId: string): Promise<void> {
  const session = sessionsRepo.findById(sessionId);
  if (!session) return;

  const unsummarized = messagesRepo.listUnsummarized(sessionId);
  if (unsummarized.length === 0) return;

  const pool = getAccountPool();
  const model = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash';

  // Build summarizer prompt — constraints_json is NEVER included (managed separately)
  const priorSummary = session.summary
    ? `이전 요약:\n${session.summary}\n\n`
    : '';

  const newTurns = unsummarized
    .map((m) => `[${m.role}]: ${m.content}`)
    .join('\n');

  const metaPrompt = [
    `${priorSummary}새로운 대화 내용:`,
    newTurns,
    ``,
    `위 대화를 이전 요약과 합쳐 ${MAX_SUMMARY_TOKENS} 토큰 이내로 압축 요약하세요.`,
    `보존 항목: key/tempo/mood 결정사항, 거절된 방향, 확정된 가사 조각, 내러티브 결정.`,
    `제거 항목: 잡담, 재시도 과정, 덮어써진 초안.`,
    `절대 포함 금지: BPM, 금지어, 구조 제약 (이것들은 constraints_json에 별도 관리됨).`,
    `요약만 출력하고 다른 내용은 쓰지 마세요.`,
  ].join('\n');

  let newSummary: string;
  try {
    // OUTSIDE db.transaction() — network I/O (3~5s)
    newSummary = await pool.generate(
      [{ role: 'user', content: metaPrompt }],
      model,
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error({ sessionId, error: errorMsg }, 'Summarizer Gemini call failed');
    sessionsRepo.setLastSummaryError(sessionId, errorMsg);
    return; // reply already sent — don't corrupt session
  }

  const db = getDb();
  const expectedVersion = session.summary_version;
  const ids = unsummarized.map((m) => m.id);

  // INSIDE db.transaction() — SQL only (milliseconds)
  db.transaction(() => {
    const updated = sessionsRepo.updateSummary({
      sessionId,
      newSummary: newSummary.trim(),
      expectedVersion,
    });
    if (!updated) {
      // CAS miss — concurrent write detected, skip
      logger.warn({ sessionId }, 'Summarizer CAS miss — skipping');
      return;
    }
    messagesRepo.markSummarized(ids);
  })();

  logger.info({ sessionId, compressedMessages: ids.length }, 'Session summarized');
}
