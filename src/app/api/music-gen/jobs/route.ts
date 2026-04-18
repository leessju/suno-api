import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/music-gen/api-helpers'
import { getQueue } from '@/lib/queue'
import { JobTypeSchema } from '@/contracts/schemas/job'
import { z } from 'zod'

const EnqueueBodySchema = z.object({
  type: JobTypeSchema,
  payload: z.record(z.string(), z.unknown()),
  idempotency_key: z.string().optional(),
  scheduled_at: z.number().optional(),
  max_attempts: z.number().int().min(1).max(10).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = EnqueueBodySchema.safeParse(body)
    if (!parsed.success) return err('VALIDATION_ERROR', parsed.error.message, 400)

    const queue = getQueue()
    const job = queue.enqueue(parsed.data)
    return ok(job, 201)
  } catch (e) {
    return handleError(e)
  }
}

export async function GET() {
  try {
    const queue = getQueue()
    return ok(queue.stats())
  } catch (e) {
    return handleError(e)
  }
}
