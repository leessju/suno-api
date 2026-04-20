import { ChannelWithPersona } from '../repositories/channels';
import { GeneratedContent, generatedContentSchema } from '../persona/output-schema';
import { validateForbiddenWords, validateLyrics } from '../persona/validators';
import { getAccountPool, getGeminiModel } from './account-pool';
import { buildSystemPrompt, buildUserPrompt, applyLangToPrompt } from './prompt-builder';
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
    narrative:           { type: 'string', description: 'English, max 10 words, short mood summary' },
    suno_style_prompts:  { type: 'array', items: { type: 'string' }, minItems: 5, maxItems: 5 },
    total_duration_sec:  { type: 'number' },
  },
};

/**
 * Gemini 가사 후처리: 섹션 태그 줄바꿈 (공통) + ja 전용 한국어 조사→일본어 교정/한글 제거
 */
function sanitizeLyrics(lyrics: string, lyricLang?: string | null): string {
  let fixed = lyrics

  // ── ja 전용: 한국어 조사 → 일본어 조사, 한글 전체 제거 ──
  if (!lyricLang || lyricLang === 'ja') {
    const particleMap: [RegExp, string][] = [
      [/가(?=[,\s\u3000-\u9FFF])/g, 'が'],
      [/의(?=[,\s\u3000-\u9FFF])/g, 'の'],
      [/을(?=\s|,|[^\u0000-\u007F])/g, 'を'],
      [/를(?=\s|,|[^\u0000-\u007F])/g, 'を'],
      [/에(?=[,\s\u3000-\u9FFF])/g, 'に'],
      [/는(?=\s|,|[^\u0000-\u007F])/g, 'は'],
      [/도(?=\s|,|[^\u0000-\u007F])/g, 'も'],
      [/와(?=\s|,|[^\u0000-\u007F])/g, 'と'],
    ]
    for (const [pattern, replacement] of particleMap) {
      fixed = fixed.replace(pattern, replacement)
    }
    fixed = fixed.replace(/독/g, 'どく')
    fixed = fixed.replace(/[\uAC00-\uD7AF]/g, '') // 한글 전체 제거 — ja 전용
    fixed = fixed.replace(/  +/g, ' ').replace(/^ +| +$/gm, '')
  }
  // ko, en, zh, inst: 한글 제거 블록 skip — 가사 원형 보존

  // ── 공통: 섹션 태그 줄바꿈 정리 ──
  fixed = fixed.replace(/\]\s*\[/g, ']\n[')
  fixed = fixed.replace(/([^\n])\[([A-Z])/g, '$1\n[$2')

  return fixed
}

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
  existingTitles: string[] = [],
  lyricLang?: 'en' | 'ja' | 'ko' | 'zh' | 'inst' | null,
  systemPromptOverride?: string,
): Promise<{ content: GeneratedContent; model: string }> {
  const pool = getAccountPool();
  const baseModel = getGeminiModel('gemini-2.5-flash');
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

    const systemPrompt = systemPromptOverride
      ? applyLangToPrompt(systemPromptOverride, lyricLang)
      : buildSystemPrompt(channel, lyricLang);
    const userPrompt = buildUserPrompt(emotionInput, previousFailedOutput, failureReason, mediaAnalysis ?? undefined, undefined, existingTitles, lyricLang);

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

    // 가사 후처리: 섹션 태그 줄바꿈 (공통) + ja 전용 한글 교정
    validated.data.lyrics = sanitizeLyrics(validated.data.lyrics, lyricLang);

    // inst: Gemini가 가사를 생성해도 강제로 비움
    if (lyricLang === 'inst') {
      validated.data.lyrics = ''
    }

    // 비일본어: title_jp를 title_en으로 덮어쓰기 (일어 제목 방지)
    if (lyricLang && lyricLang !== 'ja') {
      validated.data.title_jp = validated.data.title_en
    }

    // 빈 가사 검증 — inst는 빈 가사가 정상이므로 skip
    if (lyricLang !== 'inst' && (!validated.data.lyrics || validated.data.lyrics.trim().length === 0)) {
      failureReason = 'EMPTY_LYRICS';
      previousFailedOutput = '';
      console.error(`${tag} attempt ${attempt}/3 실패 — 빈 가사`);
      continue;
    }

    const fw = validateForbiddenWords(validated.data.lyrics, forbiddenWords);
    if (!fw.valid) {
      failureReason = `금지어 포함: ${fw.foundWords.join(', ')}`;
      previousFailedOutput = validated.data.lyrics;
      console.error(`${tag} attempt ${attempt}/3 실패 — ${failureReason}`);
      continue;
    }

    // ja 이외 언어는 'free' 포맷으로 JP 전용 검증 bypass
    const lyricFormat = (!lyricLang || lyricLang === 'ja') ? channel.lyric_format : 'free';
    const lv = validateLyrics(validated.data.lyrics, lyricFormat);
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
