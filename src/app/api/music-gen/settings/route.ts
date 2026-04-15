import * as settingsRepo from '@/lib/music-gen/repositories/global-settings';
import { ok, options, handleError } from '@/lib/music-gen/api-helpers';

export async function OPTIONS() { return options(); }

export async function GET() {
  try {
    return ok(settingsRepo.list());
  } catch (e) { return handleError(e); }
}
