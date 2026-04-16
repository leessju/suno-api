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

  // 003: Suno 계정 DB 관리 (IF NOT EXISTS — 멱등)
  const migration003 = fs.readFileSync(
    path.join(base, 'migrations/003_suno_accounts.sql'),
    'utf-8',
  );
  db.exec(migration003);

  // 004: better-auth 테이블 (IF NOT EXISTS — 멱등)
  const migration004 = fs.readFileSync(
    path.join(base, 'migrations/004_better_auth.sql'),
    'utf-8',
  );
  db.exec(migration004);

  // 005: gem_global_settings
  const migration005 = fs.readFileSync(
    path.join(base, 'migrations/005_global_settings.sql'),
    'utf-8',
  );
  db.exec(migration005);

  // 006: pipeline UI 테이블 (track_images, shorts, upload_results) + workspaces 컬럼 확장
  const migration006 = fs.readFileSync(
    path.join(base, 'migrations/006_pipeline_ui.sql'),
    'utf-8',
  );
  // ALTER TABLE은 중복 시 오류 발생 → CREATE TABLE만 exec 후 ALTER는 pragma로 체크
  const migration006Creates = migration006
    .split(';')
    .filter(s => s.replace(/--[^\n]*/g, '').trim().toUpperCase().startsWith('CREATE TABLE'))
    .join(';');
  if (migration006Creates.trim()) db.exec(migration006Creates + ';');
  const workspaceCols = db.pragma('table_info(workspaces)') as Array<{ name: string }>;
  if (!workspaceCols.some(c => c.name === 'current_step')) {
    db.exec('ALTER TABLE workspaces ADD COLUMN current_step INTEGER NOT NULL DEFAULT 1;');
  }
  if (!workspaceCols.some(c => c.name === 'merge_order')) {
    db.exec('ALTER TABLE workspaces ADD COLUMN merge_order TEXT;');
  }

  // 007: back_images 테이블
  const migration007 = fs.readFileSync(
    path.join(base, 'migrations/007_back_images.sql'),
    'utf-8',
  );
  db.exec(migration007);

  // 008: workspace_midis 테이블 (IF NOT EXISTS — 멱등)
  // 순서: ① workspace_midis CREATE TABLE + 관련 인덱스
  //       ② workspace_tracks ALTER TABLE (workspace_midi_id 컬럼 추가)
  //       ③ workspace_tracks.workspace_midi_id 인덱스
  const migration008 = fs.readFileSync(
    path.join(base, 'migrations/008_workspace_midi_refactor.sql'),
    'utf-8',
  );
  // workspace_midis 테이블과 그 인덱스만 (workspace_tracks 인덱스 제외)
  const migration008MidiOnly = migration008
    .split(';')
    .filter(s => {
      const clean = s.replace(/--[^\n]*/g, '').trim().toUpperCase();
      return (clean.startsWith('CREATE TABLE') || clean.startsWith('CREATE INDEX')) &&
             !clean.includes('WORKSPACE_TRACKS');
    })
    .join(';');
  if (migration008MidiOnly.trim()) db.exec(migration008MidiOnly + ';');

  // workspace_tracks.workspace_midi_id 컬럼 추가
  const workspaceTrackCols = db.pragma('table_info(workspace_tracks)') as Array<{ name: string }>;
  if (!workspaceTrackCols.some(c => c.name === 'workspace_midi_id')) {
    db.exec('ALTER TABLE workspace_tracks ADD COLUMN workspace_midi_id TEXT REFERENCES workspace_midis(id) ON DELETE SET NULL;');
  }
  // workspace_tracks.workspace_midi_id 인덱스 (컬럼 추가 후)
  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_workspace_tracks_midi ON workspace_tracks(workspace_midi_id);');
  } catch { /* 이미 존재 */ }

  // 009: 멀티 유저 지원 + Suno 싱크 컬럼 추가
  const migration009 = fs.readFileSync(
    path.join(base, 'migrations/009_multi_user_suno_sync.sql'),
    'utf-8',
  );
  // 인덱스만 실행 (ALTER TABLE은 아래 pragma 체크로)
  const migration009Indexes = migration009
    .split(';')
    .filter(s => s.trim().toUpperCase().startsWith('CREATE INDEX'))
    .join(';');
  if (migration009Indexes.trim()) {
    try { db.exec(migration009Indexes + ';'); } catch { /* 이미 존재 */ }
  }

  // suno_accounts.user_id
  const sunoAccountCols = db.pragma('table_info(suno_accounts)') as Array<{ name: string }>;
  if (!sunoAccountCols.some(c => c.name === 'user_id')) {
    db.exec('ALTER TABLE suno_accounts ADD COLUMN user_id TEXT REFERENCES user(id);');
  }

  // workspaces 신규 컬럼들
  const workspaceColsV2 = db.pragma('table_info(workspaces)') as Array<{ name: string }>;
  if (!workspaceColsV2.some(c => c.name === 'user_id')) {
    db.exec('ALTER TABLE workspaces ADD COLUMN user_id TEXT REFERENCES user(id);');
  }
  if (!workspaceColsV2.some(c => c.name === 'suno_account_id')) {
    db.exec('ALTER TABLE workspaces ADD COLUMN suno_account_id INTEGER REFERENCES suno_accounts(id);');
  }
  if (!workspaceColsV2.some(c => c.name === 'suno_workspace_id')) {
    db.exec('ALTER TABLE workspaces ADD COLUMN suno_workspace_id TEXT;');
  }
  if (!workspaceColsV2.some(c => c.name === 'suno_sync_status')) {
    db.exec("ALTER TABLE workspaces ADD COLUMN suno_sync_status TEXT DEFAULT 'local_only' CHECK(suno_sync_status IN ('local_only','synced','sync_failed'));");
  }
  if (!workspaceColsV2.some(c => c.name === 'suno_synced_at')) {
    db.exec('ALTER TABLE workspaces ADD COLUMN suno_synced_at INTEGER;');
  }

  // 010: 네비게이션용 뷰 + 유저 설정 테이블
  const migration010 = fs.readFileSync(
    path.join(base, 'migrations/010_nav_views.sql'),
    'utf-8',
  );
  db.exec(migration010);

  // channels.resource_path 컬럼 추가 (SQLite는 IF NOT EXISTS를 미지원 → pragma로 체크)
  const channelCols = db
    .pragma('table_info(channels)') as Array<{ name: string }>;
  const hasResourcePath = channelCols.some((col) => col.name === 'resource_path');
  if (!hasResourcePath) {
    db.exec('ALTER TABLE channels ADD COLUMN resource_path TEXT;');
  }

  // 011: RBAC — user_roles 테이블 + admin 시드 (IF NOT EXISTS — 멱등)
  const migration011 = fs.readFileSync(
    path.join(base, 'migrations/011_rbac.sql'),
    'utf-8',
  );
  db.exec(migration011);
}
