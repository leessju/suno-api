import { ChannelWithPersona } from '../repositories/channels';
import { GeneratedContent, generatedContentSchema } from '../persona/output-schema';
import { validateForbiddenWords, validateLyrics } from '../persona/validators';
import { getAccountPool } from './account-pool';
import { buildSystemPrompt, buildUserPrompt } from './prompt-builder';
import { MediaAnalysis } from '../media/analyzer';

// ── Generation parameter profiles (US-V2-005) ────────────────────────────────

export const PROFILES = {
  creative_lyrics: { temperature: 1.0, topP: 0.95 },
  structured_json: { temperature: 0.7, topP: 0.95 },
  final_polish:    { model: 'gemini-2.5-pro', temperature: 0.9, topP: 0.95 },
} as const;

// JSON Schema for responseSchema-based structured output
const GENERATED_CONTENT_SCHEMA = {
  type: 'object',
  required: ['emotion_theme', 'title_en', 'title_jp', 'lyrics', 'narrative', 'suno_style_prompts'],
  properties: {
    emotion_theme:       { type: 'string' },
    title_en:            { type: 'string' },
    title_jp:            { type: 'string' },
    lyrics:              { type: 'string' },
    narrative:           { type: 'string', description: '한국어 20자 이내 곡 분위기 요약' },
    suno_style_prompts:  { type: 'array', items: { type: 'string' }, minItems: 5, maxItems: 5 },
    total_duration_sec:  { type: 'number' },
  },
};

export class ValidationError extends Error {
  constructor(code: string) {
    super(code);
    this.name = 'ValidationError';
  }
}

export async function generateContent(
  channel: ChannelWithPersona,
  emotionInput: string,
  mediaAnalysis?: MediaAnalysis | null,
): Promise<{ content: GeneratedContent; model: string }> {
  const pool = getAccountPool();
  const baseModel = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
  const profile = PROFILES.creative_lyrics;
  const useFinalPolish = process.env.MUSIC_GEN_POLISH === '1';
  const model = useFinalPolish ? (PROFILES.final_polish.model ?? baseModel) : baseModel;
  const temperature = useFinalPolish ? PROFILES.final_polish.temperature : profile.temperature;
  const topP = useFinalPolish ? PROFILES.final_polish.topP : profile.topP;

  const forbiddenWords: string[] = JSON.parse(channel.forbidden_words);

  let attempt = 0;
  let previousFailedOutput: string | undefined;
  let failureReason: string | undefined;

  const tag = `[GEN ch=${channel.id} fmt=${channel.lyric_format}]`;

  while (attempt < 3) {
    attempt++;
    console.log(`${tag} attempt ${attempt}/3 시작${failureReason ? ` — 이전 실패: ${failureReason}` : ''}`);

    const systemPrompt = buildSystemPrompt(channel);
    const userPrompt = buildUserPrompt(emotionInput, previousFailedOutput, failureReason, mediaAnalysis ?? undefined);

    let rawText: string;
    try {
      rawText = await pool.generateMultimodal(
        [{ text: userPrompt }],
        {
          model,
          temperature,
          topP,
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json',
          responseSchema: GENERATED_CONTENT_SCHEMA,
        },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${tag} attempt ${attempt}/3 API 오류:`, msg);
      throw err;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      failureReason = 'JSON 파싱 실패';
      previousFailedOutput = rawText;
      console.error(`${tag} attempt ${attempt}/3 실패 — ${failureReason}`);
      console.error(`${tag} rawText(100자):`, rawText.slice(0, 100));
      continue;
    }

    const validated = generatedContentSchema.safeParse(parsed);
    if (!validated.success) {
      failureReason = `스키마 불일치: ${validated.error.message}`;
      previousFailedOutput = JSON.stringify(parsed);
      console.error(`${tag} attempt ${attempt}/3 실패 — ${failureReason}`);
      continue;
    }

    const fw = validateForbiddenWords(validated.data.lyrics, forbiddenWords);
    if (!fw.valid) {
      failureReason = `금지어 포함: ${fw.foundWords.join(', ')}`;
      previousFailedOutput = validated.data.lyrics;
      console.error(`${tag} attempt ${attempt}/3 실패 — ${failureReason}`);
      continue;
    }

    const lv = validateLyrics(validated.data.lyrics, channel.lyric_format);
    if (!lv.valid) {
      failureReason = `구조 위반: ${lv.violations.join('; ')}`;
      previousFailedOutput = validated.data.lyrics;
      console.error(`${tag} attempt ${attempt}/3 실패 — ${failureReason}`);
      console.error(`${tag} 위반 가사(200자):`, validated.data.lyrics.slice(0, 200));
      continue;
    }

    console.log(`${tag} attempt ${attempt}/3 성공 — model=${model}`);
    return { content: validated.data, model };
  }

  console.error(`${tag} 3회 모두 실패. 최종 원인: ${failureReason ?? '알 수 없음'}`);
  throw new ValidationError(`MAX_RETRY_EXCEEDED: ${failureReason ?? '알 수 없음'}`);
}
