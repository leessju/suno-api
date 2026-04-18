import { NextRequest } from 'next/server';
import { z } from 'zod';
import * as channelsRepo from '@/lib/music-gen/repositories/channels';
import * as contentsRepo from '@/lib/music-gen/repositories/contents';
import * as sessionsRepo from '@/lib/music-gen/repositories/sessions';
import { generateContent } from '@/lib/music-gen/gemini/generator';
import { mediaAnalysisSchema } from '@/lib/music-gen/media/analyzer';
import { ok, err, options, handleError } from '@/lib/music-gen/api-helpers';

const generateSchema = z.object({
  channel_id: z.number().int().positive(),
  emotion_input: z.string().optional(), // Gemini가 분석 데이터로 테마 자체 결정
  session_id: z.string().optional(),
  style_weight: z.number().min(0).max(1).optional(), // 0.0=채널100%, 1.0=원곡100%
});

export async function OPTIONS() {
  return options();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = generateSchema.safeParse(body);
    if (!parsed.success) return err('INVALID_INPUT', parsed.error.message, 400);

    const { channel_id, emotion_input, session_id, style_weight } = parsed.data;

    const channel = channelsRepo.findById(channel_id);
    if (!channel) return err('CHANNEL_NOT_FOUND', `Channel ${channel_id} not found`, 404);

    // Resolve session for media_analysis injection
    let mediaAnalysis = null;
    if (session_id) {
      const session = sessionsRepo.findById(session_id);
      if (!session) return err('SESSION_NOT_FOUND', `Session ${session_id} not found`, 404);
      if (session.channel_id !== channel_id) {
        return err('SESSION_CHANNEL_MISMATCH', `Session ${session_id} belongs to channel ${session.channel_id}, not ${channel_id}`, 400);
      }
      if (session.media_analysis) {
        const raw = mediaAnalysisSchema.safeParse(JSON.parse(session.media_analysis));
        if (raw.success) mediaAnalysis = raw.data;
      }
    } else {
      // Auto-resolve: find the most recently updated session with media_analysis
      const activeSession = sessionsRepo.findActiveSessionByChannel(channel_id);
      if (activeSession?.media_analysis) {
        const raw = mediaAnalysisSchema.safeParse(JSON.parse(activeSession.media_analysis));
        if (raw.success) mediaAnalysis = raw.data;
      }
    }

    // 이전 제목 조회 (제목 반복 방지)
    const existingTitles = contentsRepo.findRecentTitlesByChannel(channel_id);

    const { content: generated, model: geminiModel } = await generateContent(
      channel,
      emotion_input ?? '',
      mediaAnalysis,
      existingTitles,
    );

    // suno_style_prompts 배열 → JSON 문자열로 변환해 DB 저장
    const content = contentsRepo.create({
      title_en: generated.title_en,
      title_jp: generated.title_jp,
      lyrics: generated.lyrics,
      narrative: generated.narrative,
      suno_style_prompt: JSON.stringify(generated.suno_style_prompts),
      emotion_input: generated.emotion_theme,
      gemini_model: geminiModel,
    });

    contentsRepo.linkToChannel(content.id, channel_id);

    return ok({ content, channel_id, style_weight: style_weight ?? null }, 201);
  } catch (e) {
    return handleError(e);
  }
}
