import { NextRequest } from 'next/server';
import { z } from 'zod';
import * as settingsRepo from '@/lib/music-gen/repositories/global-settings';
import { ok, err, options, handleError } from '@/lib/music-gen/api-helpers';

type Params = { params: Promise<{ key: string }> };

export async function OPTIONS() { return options(); }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { key } = await params;
    const setting = settingsRepo.get(key);
    if (!setting) return err('NOT_FOUND', `Setting ${key} not found`, 404);
    return ok(setting);
  } catch (e) { return handleError(e); }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { key } = await params;
    const body = await req.json();
    const schema = z.object({ value: z.string().min(1).max(10000) });
    const parsed = schema.safeParse(body);
    if (!parsed.success) return err('INVALID_INPUT', parsed.error.message, 400);
    const setting = settingsRepo.set(key, parsed.data.value);
    return ok(setting);
  } catch (e) { return handleError(e); }
}
