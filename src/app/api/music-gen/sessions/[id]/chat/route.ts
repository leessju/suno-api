import { NextRequest } from 'next/server';
import { z } from 'zod';
import * as channelsRepo from '@/lib/music-gen/repositories/channels';
import * as sessionsRepo from '@/lib/music-gen/repositories/sessions';
import * as messagesRepo from '@/lib/music-gen/repositories/messages';
import { getDb } from '@/lib/music-gen/db';
import { buildContext } from '@/lib/music-gen/context/assembler';
import { shouldSummarize, summarizeSession } from '@/lib/music-gen/context/summarizer';
import { getAccountPool } from '@/lib/music-gen/gemini/account-pool';
import { ok, err, options, handleError } from '@/lib/music-gen/api-helpers';

const SLIDING_WINDOW = 8;
const MAX_TOKENS = 32000;
const RESERVE_FOR_RESPONSE = 4000;

const chatSchema = z.object({
  input: z.string().min(1),
});

type Params = { params: Promise<{ id: string }> };

export async function OPTIONS() {
  return options();
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id: sessionId } = await params;

    const session = sessionsRepo.findById(sessionId);
    if (!session) return err('SESSION_NOT_FOUND', `Session ${sessionId} not found`, 404);

    const channel = channelsRepo.findById(session.channel_id);
    if (!channel) return err('CHANNEL_NOT_FOUND', `Channel ${session.channel_id} not found`, 404);

    const body = await req.json();
    const parsed = chatSchema.safeParse(body);
    if (!parsed.success) return err('INVALID_INPUT', parsed.error.message, 400);

    const { input } = parsed.data;

    // Persist user message as pending BEFORE Gemini call
    const userMsg = messagesRepo.append({
      sessionId,
      role: 'user',
      content: input,
      status: 'pending',
    });

    // Assemble context
    const recentMessages = messagesRepo.listRecent(sessionId, SLIDING_WINDOW);
    let mediaAnalysis: object | null = null;
    if (session.media_analysis) {
      try { mediaAnalysis = JSON.parse(session.media_analysis) as object; } catch { /* ignore malformed JSON */ }
    }

    let forbidden: string[] = [];
    try { forbidden = JSON.parse(channel.forbidden_words); } catch { /* ignore malformed JSON */ }

    let recommended: string[] = [];
    try { recommended = JSON.parse(channel.recommended_words); } catch { /* ignore malformed JSON */ }

    const assembly = buildContext({
      channel: {
        systemPrompt: channel.system_prompt,
        forbiddenWords: forbidden,
        recommendedWords: recommended,
        lyricFormat: channel.lyric_format,
      },
      session: {
        summary: session.summary,
        constraintsJson: session.constraints_json,
        mediaAnalysis,
      },
      recentMessages: recentMessages
        .filter((m) => m.id !== userMsg.id) // exclude just-inserted pending msg
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content, tokenCount: m.token_count })),
      userInput: input,
      budget: { maxTokens: MAX_TOKENS, reserveForResponse: RESERVE_FOR_RESPONSE },
    });

    // Call Gemini via AccountPool
    const pool = getAccountPool();
    const { getGeminiModel } = require('@/lib/music-gen/gemini/account-pool');
    const model = getGeminiModel('gemini-2.0-flash');

    let assistantText: string;
    try {
      assistantText = await pool.generate(assembly.messages, model);
    } catch (e) {
      // Mark user message as failed
      messagesRepo.updateStatus(userMsg.id, 'failed');
      throw e;
    }

    // Persist user (complete) + assistant messages atomically
    const db = getDb();
    const assistantTokens = Math.ceil(assistantText.length / 4);

    const assistantMsgId = db.transaction(() => {
      messagesRepo.updateStatus(userMsg.id, 'complete');
      const aMsg = messagesRepo.append({
        sessionId,
        role: 'assistant',
        content: assistantText,
        tokenCount: assistantTokens,
        status: 'complete',
      });
      return aMsg.id;
    })();

    // Trigger summarizer
    const needsCompression = assembly.compressionNeeded;
    const needsSummary = shouldSummarize(sessionId, needsCompression);

    let summarized = false;
    if (needsSummary) {
      if (needsCompression) {
        // Await summarizer (this turn needs compression before next turn)
        await summarizeSession(sessionId);
        summarized = true;
      } else {
        // Fire-and-forget via queueMicrotask (non-blocking)
        queueMicrotask(() => { void summarizeSession(sessionId); });
      }
    }

    return ok({
      assistantMessage: { id: assistantMsgId, content: assistantText },
      tokensUsed: assembly.usedTokens + assistantTokens,
      summarized,
    });
  } catch (e) {
    return handleError(e);
  }
}
