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
  const schemaPath = path.join(process.cwd(), 'src/lib/music-gen/schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schema);
}
