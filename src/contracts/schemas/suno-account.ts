import { z } from 'zod'

export const SunoAccountSchema = z.object({
  id: z.number(),
  user_id: z.string().nullable(),
  label: z.string(),
  is_active: z.boolean(),
  created_at: z.number().optional(),
})

export const CreateSunoAccountSchema = z.object({
  label: z.string().min(1).max(200),
  cookie: z.string().min(10),
})

export const UpdateSunoAccountSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  is_active: z.boolean().optional(),
  cookie: z.string().min(10).optional(),
})

export type SunoAccount = z.infer<typeof SunoAccountSchema>
export type CreateSunoAccount = z.infer<typeof CreateSunoAccountSchema>
export type UpdateSunoAccount = z.infer<typeof UpdateSunoAccountSchema>
