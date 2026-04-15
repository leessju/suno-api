import { NextRequest } from 'next/server';
import { z } from 'zod';
import * as channelsRepo from '@/lib/music-gen/repositories/channels';
import * as sessionsRepo from '@/lib/music-gen/repositories/sessions';
import { ok, err, options, handleError } from '@/lib/music-gen/api-helpers';

const createSessionSchema = z.object({
  channel_id: z.number().int().positive(),
  title: z.string().optional(),
  constraints_json: z.string().optional(),
});

export async function OPTIONS() {
  return options();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = createSessionSchema.safeParse(body);
    if (!parsed.success) return err('INVALID_INPUT', parsed.error.message, 400);

    const channel = channelsRepo.findById(parsed.data.channel_id);
    if (!channel) return err('CHANNEL_NOT_FOUND', `Channel ${parsed.data.channel_id} not found`, 404);

    const session = sessionsRepo.create({
      channel_id: parsed.data.channel_id,
      title: parsed.data.title,
      constraints_json: parsed.data.constraints_json,
    });

    return ok(session, 201);
  } catch (e) {
    return handleError(e);
  }
}
