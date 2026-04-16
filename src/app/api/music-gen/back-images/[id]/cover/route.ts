import { NextRequest } from 'next/server';
import * as repo from '@/lib/music-gen/repositories/back-images';
import { ok, err, options, handleError } from '@/lib/music-gen/api-helpers';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function OPTIONS() {
  return options();
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const imageId = parseInt(id, 10);
    if (isNaN(imageId)) return err('INVALID_INPUT', 'id must be a number', 400);

    const body = await req.json();
    const channelId = parseInt(String(body?.channel_id ?? ''), 10);
    if (isNaN(channelId)) return err('INVALID_INPUT', 'channel_id must be a number', 400);

    const record = repo.findById(imageId);
    if (!record) return err('NOT_FOUND', `BackImage ${imageId} not found`, 404);

    repo.setCover(imageId, channelId);
    return ok({});
  } catch (e) {
    return handleError(e);
  }
}
