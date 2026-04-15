import { NextRequest } from 'next/server';
import * as contentsRepo from '@/lib/music-gen/repositories/contents';
import { ok, err, options, handleError } from '@/lib/music-gen/api-helpers';

export async function OPTIONS() {
  return options();
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const channelIdStr = searchParams.get('channel_id');
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0', 10);

    if (!channelIdStr) return err('INVALID_INPUT', 'channel_id query param is required', 400);

    const channelId = parseInt(channelIdStr, 10);
    if (isNaN(channelId)) return err('INVALID_INPUT', 'channel_id must be a number', 400);

    const contents = contentsRepo.listByChannel(channelId, limit, offset);
    return ok({ contents, limit, offset });
  } catch (e) {
    return handleError(e);
  }
}
