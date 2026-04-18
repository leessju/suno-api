import { z } from 'zod'

/** @deprecated workspace_midis.source_type 으로 이전됨 */
export const WorkspaceSourceTypeSchema = z.enum(['youtube_video', 'mp3_file', 'album_list'])
export const WorkspaceStatusSchema = z.enum(['draft', 'active', 'archived'])
export const PipelineModeSchema = z.enum(['step', 'auto'])
export const SunoSyncStatusSchema = z.enum(['local_only', 'synced', 'sync_failed'])

// workspace_midis 관련 스키마
export const MidiSourceTypeSchema = z.enum(['youtube_video', 'mp3_file', 'direct_midi'])
export const GenModeSchema = z.enum(['auto', 'manual'])
export const WorkspaceMidiStatusSchema = z.enum(['pending', 'converting', 'ready', 'generating', 'done', 'error'])

/** 워크스페이스 생성 — channel_id/suno_account_id는 ChannelProvider/SunoAccountProvider에서 주입 */
export const CreateWorkspaceSchema = z.object({
  name: z.string().min(1).max(200),
  pipeline_mode: PipelineModeSchema.default('step'),
  channel_id: z.number().int().positive().optional(),       // ChannelProvider에서 주입
  suno_account_id: z.number().int().positive().optional(),  // SunoAccountProvider에서 주입
})

export const UpdateWorkspaceSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  pipeline_mode: PipelineModeSchema.optional(),
  channel_id: z.number().int().positive().optional(),
  suno_project_id: z.string().nullable().optional(),
})

export const CreateWorkspaceMidiSchema = z.object({
  source_type: MidiSourceTypeSchema,
  source_ref: z.string().optional(),
  label: z.string().optional(),
  gen_mode: GenModeSchema.optional(),
  original_ratio: z.number().int().min(0).max(100).optional(),
  cover_image: z.string().optional(),
})

export const UpdateWorkspaceMidiSchema = z.object({
  label: z.string().optional(),
  gen_mode: GenModeSchema.optional(),
  original_ratio: z.number().int().min(0).max(100).optional(),
  status: WorkspaceMidiStatusSchema.optional(),
  suno_cover_clip_id: z.string().nullable().optional(),
})

export const WorkspaceMidiSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  midi_master_id: z.string().nullable(),
  source_type: MidiSourceTypeSchema,
  source_ref: z.string().nullable(),
  label: z.string().nullable(),
  gen_mode: GenModeSchema,
  original_ratio: z.number().int(),
  status: WorkspaceMidiStatusSchema,
  error_message: z.string().nullable(),
  created_at: z.number(),
  updated_at: z.number(),
})

export const WorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  pipeline_mode: PipelineModeSchema,
  status: WorkspaceStatusSchema,
  channel_id: z.number().nullable(),
  user_id: z.string().nullable(),
  suno_account_id: z.number().nullable(),
  suno_workspace_id: z.string().nullable(),
  suno_sync_status: SunoSyncStatusSchema.default('local_only'),
  suno_synced_at: z.number().nullable(),
  created_at: z.number(),
  updated_at: z.number(),
})

export type Workspace = z.infer<typeof WorkspaceSchema>
export type CreateWorkspace = z.infer<typeof CreateWorkspaceSchema>
export type UpdateWorkspace = z.infer<typeof UpdateWorkspaceSchema>
export type WorkspaceMidi = z.infer<typeof WorkspaceMidiSchema>
export type CreateWorkspaceMidi = z.infer<typeof CreateWorkspaceMidiSchema>
export type UpdateWorkspaceMidi = z.infer<typeof UpdateWorkspaceMidiSchema>
