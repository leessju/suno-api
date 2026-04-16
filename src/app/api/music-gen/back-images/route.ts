import { NextRequest } from 'next/server';
import { uploadObject } from '@/lib/r2';
import * as repo from '@/lib/music-gen/repositories/back-images';
import { ok, err, options, handleError } from '@/lib/music-gen/api-helpers';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return options();
}

export async function GET(req: NextRequest) {
  try {
    const channelId = parseInt(req.nextUrl.searchParams.get('channel_id') ?? '', 10);
    if (isNaN(channelId)) return err('INVALID_INPUT', 'channel_id must be a number', 400);

    const imageType = req.nextUrl.searchParams.get('type'); // 'video' | 'thumbnail' | null
    let images = repo.list(channelId);

    // type 파라미터로 필터: r2_key 경로의 폴더 prefix로 구분
    if (imageType === 'video') {
      images = images.filter(img =>
        img.r2_key.includes(`/${channelId}/video/`) || !img.r2_key.includes(`/${channelId}/thumbnail/`)
      );
    } else if (imageType === 'thumbnail') {
      images = images.filter(img => img.r2_key.includes(`/${channelId}/thumbnail/`));
    }

    return ok(images);
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const channelIdRaw = formData.get('channel_id');
    const imageType = String(formData.get('image_type') ?? 'video'); // 'video' | 'thumbnail'

    if (!file) return err('INVALID_INPUT', 'file is required', 400);
    if (!channelIdRaw) return err('INVALID_INPUT', 'channel_id is required', 400);

    const channelId = parseInt(String(channelIdRaw), 10);
    if (isNaN(channelId)) return err('INVALID_INPUT', 'channel_id must be a number', 400);

    const filename = file.name;
    const folder = imageType === 'thumbnail' ? 'thumbnail' : 'video';
    const r2Key = `back_images/${channelId}/${folder}/${crypto.randomUUID()}-${filename}`;
    const buffer = new Uint8Array(await file.arrayBuffer());

    await uploadObject(r2Key, buffer, file.type || 'application/octet-stream');

    const record = repo.create(channelId, r2Key, filename);
    return ok(record, 201);
  } catch (e) {
    return handleError(e);
  }
}
