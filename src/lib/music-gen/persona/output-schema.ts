import { z } from 'zod';

export const generatedContentSchema = z.object({
  emotion_theme: z.string().min(1),
  title_en: z.string().min(1),
  title_jp: z.string().min(1),
  lyrics: z.string().min(1),
  narrative: z.string().min(1),
  suno_style_prompts: z.array(z.string().min(1)).min(1).max(5),
  total_duration_sec: z.number().optional(),
});

export type GeneratedContent = z.infer<typeof generatedContentSchema>;
