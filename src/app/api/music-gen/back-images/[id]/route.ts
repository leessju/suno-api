import { NextRequest } from 'next/server';
import { deleteObject } from '@/lib/r2';
import * as repo from '@/lib/music-gen/repositories/back-images';
import { ok, err, options, handleError } from '@/lib/music-gen/api-helpers';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function OPTIONS() {
  return options();
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const imageId = parseInt(id, 10);
    if (isNaN(imageId)) return err('INVALID_INPUT', 'id must be a number', 400);

    const record = repo.findById(imageId);
    if (!record) return err('NOT_FOUND', `BackImage ${imageId} not found`, 404);

    await deleteObject(record.r2_key);
    repo.remove(imageId);

    return ok({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
