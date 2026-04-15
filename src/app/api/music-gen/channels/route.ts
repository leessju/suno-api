import { NextRequest } from 'next/server';
import { z } from 'zod';
import * as channelsRepo from '@/lib/music-gen/repositories/channels';
import { ok, err, options, handleError } from '@/lib/music-gen/api-helpers';

const createChannelSchema = z.object({
  channel_name: z.string().min(1),
  youtube_channel_id: z.string().min(1),
  channel_handle: z.string().optional(),
  system_prompt: z.string().min(1).max(8000),
  forbidden_words: z.array(z.string()).optional(),
  recommended_words: z.array(z.string()).optional(),
  lyric_format: z.enum(['jp2_en1', 'free', 'jp_tagged']).optional(),
});

export async function OPTIONS() {
  return options();
}

export async function GET() {
  try {
    const channels = channelsRepo.list();
    return ok(channels);
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = createChannelSchema.safeParse(body);
    if (!parsed.success) {
      return err('INVALID_INPUT', parsed.error.message, 400);
    }

    // Validate forbidden_words / recommended_words are valid JSON arrays
    try {
      const channel = channelsRepo.create(parsed.data);
      return ok(channel, 201);
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes('UNIQUE constraint failed')) {
        return err('DUPLICATE_CHANNEL', 'A channel with this youtube_channel_id already exists.', 409);
      }
      throw e;
    }
  } catch (e) {
    return handleError(e);
  }
}
