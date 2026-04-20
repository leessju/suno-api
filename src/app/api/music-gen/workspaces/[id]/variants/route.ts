import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/music-gen/api-helpers'
import { getDb } from '@/lib/music-gen/db'
import { generateContent } from '@/lib/music-gen/gemini/generator'
import { ChannelWithPersona } from '@/lib/music-gen/repositories/channels'
import { MediaAnalysis } from '@/lib/music-gen/media/analyzer'

type Params = { params: Promise<{ id: string }> }

function parseAnalysis(json: string | null): MediaAnalysis | null {
  if (!json) return null
  try { return JSON.parse(json) as MediaAnalysis } catch { return null }
}

export async function POST(
  req: NextRequest,
  { params }: Params
) {
  try {
    const { id } = await params
    const db = getDb()

    // 워크스페이스 + 채널 조회
    const workspace = db.prepare(`
      SELECT w.*, c.id as ch_id, c.channel_name, c.system_prompt, c.lyric_format,
             c.forbidden_words, c.recommended_words,
             c.youtube_channel_id, c.channel_handle, c.created_at as ch_created_at, c.updated_at as ch_updated_at
      FROM workspaces w
      LEFT JOIN channels c ON c.id = w.channel_id AND c.deleted_at IS NULL
      WHERE w.id = ?
    `).get(id) as Record<string, unknown> | undefined

    if (!workspace) return err('NOT_FOUND', 'Workspace not found', 404)
    if (!workspace.ch_id) return err('BAD_REQUEST', 'No channel assigned', 400)

    const body = await req.json().catch(() => ({}))
    const emotion_input = (body.emotion_input as string) ?? ''
    const lyric_lang = (body.lyric_lang as 'en' | 'ja' | 'ko' | 'zh' | 'inst' | null) ?? null
    const injection_type = (body.injection_type as 'A' | 'B' | 'C') ?? 'A'
    const analysis_json = (body.analysis_json as string | null) ?? null
    const background_analysis_json = (body.background_analysis_json as string | null) ?? null

    const channel: ChannelWithPersona = {
      id: workspace.ch_id as number,
      channel_name: workspace.channel_name as string,
      system_prompt: workspace.system_prompt as string,
      lyric_format: workspace.lyric_format as string,
      forbidden_words: workspace.forbidden_words as string,
      recommended_words: workspace.recommended_words as string,
      youtube_channel_id: workspace.youtube_channel_id as string,
      channel_handle: (workspace.channel_handle as string | null) ?? null,
      created_at: workspace.ch_created_at as string,
      updated_at: workspace.ch_updated_at as string,
    }

    // 이전 제목 조회 (제목 반복 방지)
    const existingTitles = (db.prepare(`
      SELECT DISTINCT title_en FROM midi_draft_rows
      WHERE workspace_midi_id IN (SELECT id FROM workspace_midis WHERE workspace_id = ? AND deleted_at IS NULL)
        AND title_en IS NOT NULL AND title_en != ''
        AND deleted_at IS NULL
    `).all(id) as { title_en: string }[]).map(r => r.title_en)

    // injection_type에 따라 분석 JSON 및 시스템 프롬프트 결정
    const mediaAnalysis: MediaAnalysis | null =
      injection_type === 'A' ? parseAnalysis(analysis_json)
      : parseAnalysis(background_analysis_json) // B, C 모두 배경음 분석 사용

    let systemPromptOverride: string | undefined
    if (injection_type === 'C') {
      const setting = db.prepare(
        "SELECT value FROM gem_global_settings WHERE key = 'music_lyrics_system_prompt'"
      ).get() as { value: string } | undefined
      if (setting?.value?.trim()) systemPromptOverride = setting.value.trim()
    }

    const { content, model } = await generateContent(channel, emotion_input, mediaAnalysis, existingTitles, lyric_lang, systemPromptOverride)

    return ok({ content, model }, 201)
  } catch (e) {
    return handleError(e)
  }
}

export async function GET(
  _req: NextRequest,
  { params }: Params
) {
  try {
    const { id } = await params
    const db = getDb()

    // workspace_tracks를 통해 이 워크스페이스에 속한 트랙의 variant만 조회
    const rows = db.prepare(`
      SELECT c.*, wt.suno_track_id, wt.is_checked, wt.checked_at
      FROM contents c
      JOIN workspace_tracks wt ON wt.variant_id = c.id
      WHERE wt.workspace_id = ?
      ORDER BY c.created_at DESC
      LIMIT 20
    `).all(id)

    return ok(rows)
  } catch (e) {
    return handleError(e)
  }
}
