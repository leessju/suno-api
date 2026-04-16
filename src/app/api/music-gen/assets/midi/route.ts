import { getDb } from '@/lib/music-gen/db';
import { ok, handleError } from '@/lib/music-gen/api-helpers';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = getDb();
    const midis = db.prepare(
      'SELECT * FROM midi_masters ORDER BY usage_count DESC, created_at DESC LIMIT 50'
    ).all();
    return ok(midis);
  } catch (e) {
    return handleError(e);
  }
}
