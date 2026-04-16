import { listObjects } from '@/lib/r2';
import { ok, handleError } from '@/lib/music-gen/api-helpers';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const objects = await listObjects();
    return ok(objects);
  } catch (e) {
    return handleError(e);
  }
}
