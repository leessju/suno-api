import { z } from 'zod'

export const WorkspaceTrackSchema = z.object({
  workspace_id: z.string(),
  suno_track_id: z.string(),
  variant_id: z.string().nullable(),
  suno_account_id: z.number().nullable(),
  is_checked: z.boolean(),
  checked_at: z.number().nullable(),
})

export const LlmProviderSchema = z.enum(['claude', 'gemini'])

export const LlmUsageSchema = z.object({
  id: z.string(),
  workspace_id: z.string().nullable(),
  session_id: z.string().nullable(),
  provider: LlmProviderSchema,
  model: z.string(),
  input_tokens: z.number(),
  output_tokens: z.number(),
  cost_usd: z.number(),
  purpose: z.string().nullable(),
  ts: z.number(),
})

// LLM 비용 단가 (2026-04 기준)
export const LLM_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-6':    { input: 15,  output: 75  },
  'claude-sonnet-4-6':  { input: 3,   output: 15  },
  'claude-haiku-4-5':   { input: 0.8, output: 4   },
  'gemini-2.0-flash':   { input: 0.1, output: 0.4 },
  'gemini-2.5-flash':   { input: 0.15, output: 0.6 },
}

/** cost_usd 계산 helper */
export function calcCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = LLM_PRICING[model] ?? { input: 0, output: 0 }
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000
}
