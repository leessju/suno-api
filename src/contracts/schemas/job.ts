import { z } from 'zod'

export const JobTypeSchema = z.enum([
  'midi.convert',
  'midi_draft.generate',
  'midi.analyze',
  'variants.generate',
  'suno.generate',
  'suno.poll',
  'draft_song.generate',
  'draft_song.poll',
  'draft.variants',
  'render.remotion',
  'upload.youtube',
  'approval.run',
  'telegram.send',
  'shorts.create',
  'shorts.upload',
])
export type JobType = z.infer<typeof JobTypeSchema>

export const MidiConvertPayloadSchema = z.object({
  workspace_id: z.string(),
  workspace_midi_id: z.string(),
  source_audio_path: z.string(),
  soundfont: z.string().optional(),
})

export const VariantsGeneratePayloadSchema = z.object({
  workspace_id: z.string(),
  workspace_midi_id: z.string(),
  midi_master_id: z.string(),
  channel_id: z.number(),
  original_ratio: z.number().int().min(0).max(100),
})

export const SunoGeneratePayloadSchema = z.object({
  workspace_id: z.string(),
  variant_id: z.string(),
  account_id: z.number().optional(),
  cover_clip_id: z.string().optional(),
})

export const RenderPayloadSchema = z.object({
  workspace_id: z.string(),
  suno_track_id: z.string(),
  audio_url: z.string(),
  image_url: z.string().nullable(),
  style_used: z.string().nullable(),
  title: z.string().nullable(),
  sort_order: z.number().int(),
})

export const UploadYoutubePayloadSchema = z.object({
  workspace_id: z.string(),
  suno_track_id: z.string(),
  video_path: z.string(),
  thumbnail_path: z.string(),
  channel_id: z.number(),
})

export const ShortsCreatePayloadSchema = z.object({
  workspace_id: z.string(),
  suno_track_id: z.string(),
})

export const ShortsUploadPayloadSchema = z.object({
  workspace_id: z.string(),
  suno_track_id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  pinned_comment: z.string().optional(),
})
