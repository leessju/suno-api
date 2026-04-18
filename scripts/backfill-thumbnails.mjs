/**
 * 기존 back_images 썸네일 백필 스크립트
 * Usage: node scripts/backfill-thumbnails.mjs
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// .env 파일 수동 로드
for (const envFile of ['.env.local', '.env']) {
  const envPath = path.join(__dirname, '..', envFile);
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) process.env[match[1].trim()] ??= match[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

const sharp = (await import('sharp')).default;
const { S3Client, GetObjectCommand, PutObjectCommand } = await import('@aws-sdk/client-s3');
const Database = require('better-sqlite3');

const BUCKET = process.env.R2_BUCKET_NAME;

function getR2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

async function downloadR2(client, key) {
  const res = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const chunks = [];
  for await (const chunk of res.Body) chunks.push(chunk);
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
  return merged;
}

async function main() {
  const dbPath = process.env.DB_PATH ?? path.join(__dirname, '../data/music-gen.db');
  const db = new Database(dbPath);
  const client = getR2Client();

  // 컬럼이 없으면 자동 추가 (migration이 아직 적용 안 된 경우 대비)
  const cols = db.pragma('table_info(back_images)').map(c => c.name);
  if (!cols.includes('thumbnail_r2_key')) {
    db.exec('ALTER TABLE back_images ADD COLUMN thumbnail_r2_key TEXT;');
    console.log('thumbnail_r2_key 컬럼 추가됨');
  }

  const rows = db
    .prepare('SELECT id, r2_key FROM back_images WHERE thumbnail_r2_key IS NULL ORDER BY id ASC')
    .all();

  console.log(`썸네일 생성 대상: ${rows.length}개`);
  let success = 0, fail = 0;

  for (const row of rows) {
    try {
      const original = await downloadR2(client, row.r2_key);
      const dir = row.r2_key.substring(0, row.r2_key.lastIndexOf('/'));
      const thumbKey = `${dir}/thumbs/${crypto.randomUUID()}.webp`;
      const thumbBuffer = await sharp(original).resize({ width: 400 }).webp({ quality: 80 }).toBuffer();
      await client.send(new PutObjectCommand({ Bucket: BUCKET, Key: thumbKey, Body: thumbBuffer, ContentType: 'image/webp' }));
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
