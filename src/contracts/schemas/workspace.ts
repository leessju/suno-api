import { z } from 'zod'

export const WorkspaceSourceTypeSchema = z.enum(['youtube_video', 'mp3_file', 'album_list'])
export const WorkspaceStatusSchema = z.enum(['draft', 'active', 'archived'])
export const PipelineModeSchema = z.enum(['step', 'auto'])

export const CreateWorkspaceSchema = z.object({
  name: z.string().min(1).max(200),
  source_type: WorkspaceSourceTypeSchema,
  source_ref: z.string().optional(),
  channel_id: z.number().int().positive(),
  pipeline_mode: PipelineModeSchema.default('step'),
})

export const WorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  source_type: WorkspaceSourceTypeSchema,
  source_ref: z.string().nullable(),
  cover_midi_id: z.string().nullable(),
  pipeline_mode: PipelineModeSchema,
  status: WorkspaceStatusSchema,
  channel_id: z.number().nullable(),
  created_at: z.number(),
  updated_at: z.number(),
})

export type Workspace = z.infer<typeof WorkspaceSchema>
export type CreateWorkspace = z.infer<typeof CreateWorkspaceSchema>
