import { NextRequest } from 'next/server';
import * as settingsRepo from '@/lib/music-gen/repositories/global-settings';
import { ok, err, options, handleError } from '@/lib/music-gen/api-helpers';
import { requireUser } from '@/lib/auth/guards';

export async function OPTIONS() { return options(); }

export async function GET() {
  try {
    return ok(settingsRepo.list());
  } catch (e) { return handleError(e); }
}

export async function PUT(req: NextRequest) {
  try {
    const { response } = await requireUser()
    if (response) return response

    const { key, value } = await req.json()
    if (!key || typeof key !== 'string') {
      return err('INVALID_INPUT', 'key는 필수입니다.', 400)
    }
    const result = settingsRepo.set(key, value ?? '')
    return ok(result)
  } catch (e) { return handleError(e); }
}
