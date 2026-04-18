/**
 * 기존 back_images 썸네일 백필 스크립트
 * Usage: npx ts-node scripts/backfill-thumbnails.ts
 */
import * as path from 'path';
import * as fs from 'fs';
// .env 파일 수동 로드 (dotenv 미설치 환경 대응)
for (const envFile of ['.env.local', '.env']) {
  const envPath = path.join(__dirname, '..', envFile);
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) process.env[match[1].trim()] ??= match[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

import sharp from 'sharp';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

// DB 직접 접근
import Database from 'better-sqlite3';

function getDbPath(): string {
  return process.env.DB_PATH ?? path.join(__dirname, '../data/music-gen.db');
}

function getR2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT!,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

const BUCKET = process.env.R2_BUCKET_NAME!;

async function downloadR2(client: S3Client, key: string): Promise<Uint8Array> {
  const res = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const chunks: Uint8Array[] = [];
  for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

async function uploadR2(client: S3Client, key: string, body: Uint8Array) {
  await client.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: 'image/webp' }));
}

async function main() {
  const db = new Database(getDbPath());
  const client = getR2Client();

  const rows = db
    .prepare('SELECT id, r2_key FROM back_images WHERE thumbnail_r2_key IS NULL ORDER BY id ASC')
    .all() as Array<{ id: number; r2_key: string }>;

  console.log(`썸네일 생성 대상: ${rows.length}개`);
  let success = 0;
  let fail = 0;

  for (const row of rows) {
    try {
      const original = await downloadR2(client, row.r2_key);

      // thumbs 폴더: 원본 경로에서 파일명 부분을 thumbs/{uuid}.webp로 변환
      const dir = row.r2_key.substring(0, row.r2_key.lastIndexOf('/'));
      const uuid = crypto.randomUUID();
      const thumbKey = `${dir}/thumbs/${uuid}.webp`;

      const thumbBuffer = await sharp(original).resize({ width: 400 }).webp({ quality: 80 }).toBuffer();
      await uploadR2(client, thumbKey, new Uint8Array(thumbBuffer));

      db.prepare('UPDATE back_images SET thumbnail_r2_key = ? WHERE id = ?').run(thumbKey, row.id);
      success++;
      process.stdout.write(`\r진행: ${success + fail}/${rows.length} (성공 ${success}, 실패 ${fail})`);
    } catch (e) {
      fail++;
      console.error(`\n실패 id=${row.id} key=${row.r2_key}:`, e);
    }
  }

  console.log(`\n완료 — 성공: ${success}개, 실패: ${fail}개`);
  db.close();
}

main().catch(e => { console.error(e); process.exit(1); });
