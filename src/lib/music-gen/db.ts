import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const dbPath = process.env.MUSIC_GEN_DB_PATH ?? './data/music-gen.db';

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
    _db = new Database(dbPath);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    runMigrations(_db);
  }
  return _db;
}

function runMigrations(db: Database.Database): void {
  // __dirname resolves incorrectly under Next.js webpack; use process.cwd() instead
  const base = path.join(process.cwd(), 'src/lib/music-gen');

  // 001: 기존 베이스 스키마
  const schema = fs.readFileSync(path.join(base, 'schema.sql'), 'utf-8');
  db.exec(schema);

  // 002: 프로덕트 레이어 (IF NOT EXISTS — 멱등)
  const migration002 = fs.readFileSync(
    path.join(base, 'migrations/002_product_layer.sql'),
    'utf-8',
  );
  db.exec(migration002);

  // channels.resource_path 컬럼 추가 (SQLite는 IF NOT EXISTS를 미지원 → pragma로 체크)
  const channelCols = db
    .pragma('table_info(channels)') as Array<{ name: string }>;
  const hasResourcePath = channelCols.some((col) => col.name === 'resource_path');
  if (!hasResourcePath) {
    db.exec('ALTER TABLE channels ADD COLUMN resource_path TEXT;');
  }
}
