import { z } from 'zod'

export const JobTypeSchema = z.enum([
  'midi.convert',
  'variants.generate',
  'suno.generate',
  'suno.poll',
  'render.remotion',
  'upload.youtube',
  'approval.run',
  'telegram.send',
])
export type JobType = z.infer<typeof JobTypeSchema>

export const MidiConvertPayloadSchema = z.object({
  workspace_id: z.string(),
  source_audio_path: z.string(),
  soundfont: z.string().optional(),
})

export const VariantsGeneratePayloadSchema = z.object({
  workspace_id: z.string(),
  midi_master_id: z.string(),
  channel_id: z.number(),
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
  channel_id: z.number(),
})

export const UploadYoutubePayloadSchema = z.object({
  workspace_id: z.string(),
  suno_track_id: z.string(),
  video_path: z.string(),
  thumbnail_path: z.string(),
  channel_id: z.number(),
})
