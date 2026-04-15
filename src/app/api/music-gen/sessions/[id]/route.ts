import { NextRequest } from 'next/server';
import * as sessionsRepo from '@/lib/music-gen/repositories/sessions';
import { getDb } from '@/lib/music-gen/db';
import { ok, err, options, handleError } from '@/lib/music-gen/api-helpers';

type Params = { params: Promise<{ id: string }> };

export async function OPTIONS() {
  return options();
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const session = sessionsRepo.findById(id);
    if (!session) return err('SESSION_NOT_FOUND', `Session ${id} not found`, 404);

    const db = getDb();
    const counts = db.prepare(
      'SELECT COUNT(*) as total FROM messages WHERE session_id = ?'
    ).get(id) as { total: number };

    return ok({ ...session, message_count: counts.total });
  } catch (e) {
    return handleError(e);
  }
}

