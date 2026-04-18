import { NextRequest } from 'next/server';
import sharp from 'sharp';
import { uploadObject } from '@/lib/r2';
import * as repo from '@/lib/music-gen/repositories/back-images';
import * as channelsRepo from '@/lib/music-gen/repositories/channels';
import { ok, err, options, handleError } from '@/lib/music-gen/api-helpers';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return options();
}

export async function GET(req: NextRequest) {
  try {
    const channelId = parseInt(req.nextUrl.searchParams.get('channel_id') ?? '', 10);
    if (isNaN(channelId)) return err('INVALID_INPUT', 'channel_id must be a number', 400);

    const channel = channelsRepo.findById(channelId);
    if (!channel) return err('CHANNEL_NOT_FOUND', `Channel ${channelId} not found`, 404);
    const youtubeId = channel.youtube_channel_id.toLowerCase();

    const imageType = req.nextUrl.searchParams.get('type'); // 'video' | 'thumbnail' | null
    let images = repo.list(channelId);

    // type 파라미터로 필터: r2_key 경로의 폴더 prefix로 구분
    if (imageType === 'video') {
      images = images.filter(img =>
        img.r2_key.includes(`/${youtubeId}/video/`) || !img.r2_key.includes(`/${youtubeId}/thumbnail/`)
      );
    } else if (imageType === 'thumbnail') {
      images = images.filter(img => img.r2_key.includes(`/${youtubeId}/thumbnail/`));
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

    const channel = channelsRepo.findById(channelId);
    if (!channel) return err('CHANNEL_NOT_FOUND', `Channel ${channelId} not found`, 404);
    const youtubeId = channel.youtube_channel_id.toLowerCase();

    const filename = file.name;
    const folder = imageType === 'thumbnail' ? 'thumbnail' : 'video';
    const uuid = crypto.randomUUID();
    const r2Key = `back_images/${youtubeId}/${folder}/${uuid}-${filename}`;
    const buffer = new Uint8Array(await file.arrayBuffer());

    await uploadObject(r2Key, buffer, file.type || 'application/octet-stream');

    // 썸네일 생성 (400px WebP) — 실패 시 null fallback
    let thumbnailR2Key: string | null = null;
    try {
      const thumbBuffer = await sharp(buffer).resize({ width: 400 }).webp({ quality: 80 }).toBuffer();
      const thumbKey = `back_images/${youtubeId}/${folder}/thumbs/${uuid}.webp`;
      await uploadObject(thumbKey, new Uint8Array(thumbBuffer), 'image/webp');
      thumbnailR2Key = thumbKey;
    } catch { /* silent — 원본은 정상 저장됨 */ }

    const record = repo.create(channelId, r2Key, filename, thumbnailR2Key);
    return ok(record, 201);
  } catch (e) {
    return handleError(e);
  }
}
