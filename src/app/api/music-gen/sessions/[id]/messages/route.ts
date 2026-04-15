import { NextRequest } from 'next/server';
import * as sessionsRepo from '@/lib/music-gen/repositories/sessions';
import * as messagesRepo from '@/lib/music-gen/repositories/messages';
import { ok, err, options, handleError } from '@/lib/music-gen/api-helpers';

type Params = { params: Promise<{ id: string }> };

export async function OPTIONS() {
  return options();
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const session = sessionsRepo.findById(id);
    if (!session) return err('SESSION_NOT_FOUND', `Session ${id} not found`, 404);

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 100);
    const messages = messagesRepo.listRecent(id, limit);
    return ok({ messages });
  } catch (e) {
    return handleError(e);
  }
}
