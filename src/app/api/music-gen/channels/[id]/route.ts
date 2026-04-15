import { NextRequest } from 'next/server';
import { z } from 'zod';
import * as channelsRepo from '@/lib/music-gen/repositories/channels';
import { ok, err, options, handleError } from '@/lib/music-gen/api-helpers';

const updateChannelSchema = z.object({
  channel_name: z.string().min(1).optional(),
  system_prompt: z.string().min(1).max(8000).optional(),
  forbidden_words: z.array(z.string()).optional(),
  recommended_words: z.array(z.string()).optional(),
  lyric_format: z.enum(['jp2_en1', 'free', 'jp_tagged']).optional(),
  channel_handle: z.string().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function OPTIONS() {
  return options();
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const channelId = parseInt(id, 10);
    if (isNaN(channelId)) return err('INVALID_INPUT', 'id must be a number', 400);

    const channel = channelsRepo.findById(channelId);
    if (!channel) return err('CHANNEL_NOT_FOUND', `Channel ${channelId} not found`, 404);

    return ok(channel);
  } catch (e) {
    return handleError(e);
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const channelId = parseInt(id, 10);
    if (isNaN(channelId)) return err('INVALID_INPUT', 'id must be a number', 400);

    const existing = channelsRepo.findById(channelId);
    if (!existing) return err('CHANNEL_NOT_FOUND', `Channel ${channelId} not found`, 404);

    const body = await req.json();
    const parsed = updateChannelSchema.safeParse(body);
    if (!parsed.success) return err('INVALID_INPUT', parsed.error.message, 400);

    const updated = channelsRepo.update(channelId, parsed.data);
    return ok(updated);
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const channelId = parseInt(id, 10);
    if (isNaN(channelId)) return err('INVALID_INPUT', 'id must be a number', 400);

    const existing = channelsRepo.findById(channelId);
    if (!existing) return err('CHANNEL_NOT_FOUND', `Channel ${channelId} not found`, 404);

    channelsRepo.deleteById(channelId);
    return ok({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
