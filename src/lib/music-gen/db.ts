import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const dbPath = process.env.DB_PATH ?? './data/music-gen.db';

// Next.js dev hot-reload 시 모듈이 재평가돼도 DB 연결을 재사용하기 위해
// global 객체에 싱글톤을 보존 (process 수준 단일 연결 보장)
const globalForDb = global as unknown as { _musicGenDb?: Database.Database };

export function getDb(): Database.Database {
  if (!globalForDb._musicGenDb) {
    fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    globalForDb._musicGenDb = db;
  }
  return globalForDb._musicGenDb;
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

  // workspace_midis.cover_image 컬럼 추가
  const workspaceMidiCols = db.pragma('table_info(workspace_midis)') as Array<{ name: string }>
  if (!workspaceMidiCols.some(c => c.name === 'cover_image')) {
    db.exec('ALTER TABLE workspace_midis ADD COLUMN cover_image TEXT;')
  }
  // workspace_midis.audio_url 컬럼 추가 (원본 소스 오디오 R2 key)
  if (!workspaceMidiCols.some(c => c.name === 'audio_url')) {
    db.exec('ALTER TABLE workspace_midis ADD COLUMN audio_url TEXT;')
  }

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

  // 013: workspace_midis에 'midi_generating' 상태 추가
  const migration013 = fs.readFileSync(
    path.join(base, 'migrations/013_midi_generating_status.sql'),
    'utf-8',
  );
  try { db.exec(migration013); } catch { /* 이미 존재 */ }

  // 014: midi_draft_rows 테이블 (IF NOT EXISTS — 멱등)
  const migration014 = fs.readFileSync(
    path.join(base, 'migrations/014_midi_draft_rows.sql'),
    'utf-8',
  );
  db.exec(migration014);
  // 014-patch: updated_at 컬럼 추가 (기존 DB 대응)
  try { db.exec('ALTER TABLE midi_draft_rows ADD COLUMN updated_at INTEGER NOT NULL DEFAULT (unixepoch())'); } catch { /* column already exists */ }

  // 012: workspace_midis에 'analyzing' 상태 추가 (CHECK 제약 재생성)
  // 'analyzing'이 이미 유효한 status인지 테스트 INSERT로 확인 후 필요 시 마이그레이션 실행
  try {
    db.prepare(
      "INSERT OR ROLLBACK INTO workspace_midis(id,workspace_id,source_type,status,gen_mode,original_ratio,created_at,updated_at) VALUES('__test_analyzing__','__test__','youtube_video','analyzing','auto',50,0,0)"
    ).run()
    db.prepare("DELETE FROM workspace_midis WHERE id='__test_analyzing__'").run()
    // 여기까지 도달하면 analyzing 상태가 이미 지원됨 — 마이그레이션 불필요
  } catch {
    // analyzing이 CHECK 제약에 없음 → 마이그레이션 실행
    const migration012 = fs.readFileSync(
      path.join(base, 'migrations/012_analyzing_status.sql'),
      'utf-8',
    )
    try {
      db.exec(migration012)
    } catch (e) {
      console.warn('[db] migration 012 skipped:', e)
    }
  }

  // 015: draft_songs 테이블 (IF NOT EXISTS — 멱등)
  const migration015 = fs.readFileSync(
    path.join(base, 'migrations/015_draft_songs.sql'),
    'utf-8',
  )
  db.exec(migration015)

  // 015-patch: workspaces.suno_project_id 컬럼 추가
  const workspaceColsV3 = db.pragma('table_info(workspaces)') as Array<{ name: string }>
  if (!workspaceColsV3.some(c => c.name === 'suno_project_id')) {
    db.exec('ALTER TABLE workspaces ADD COLUMN suno_project_id TEXT;')
  }

  // 015-patch: workspace_midis.suno_cover_clip_id 컬럼 추가
  const workspaceMidiColsV2 = db.pragma('table_info(workspace_midis)') as Array<{ name: string }>
  if (!workspaceMidiColsV2.some(c => c.name === 'suno_cover_clip_id')) {
    db.exec('ALTER TABLE workspace_midis ADD COLUMN suno_cover_clip_id TEXT;')
  }

  // 016: SyncLens 파이프라인 테이블
  const migration016 = fs.readFileSync(
    path.join(base, 'migrations/016_synclens_pipeline.sql'),
    'utf-8',
  );
  db.exec(migration016);

  // channels — SyncLens 전용 컬럼 추가
  const channelColsSync = db.pragma('table_info(channels)') as Array<{ name: string }>;
  if (!channelColsSync.some(c => c.name === 'sync_lens_folder')) {
    db.exec('ALTER TABLE channels ADD COLUMN sync_lens_folder TEXT;');
  }
  if (!channelColsSync.some(c => c.name === 'youtube_token_path')) {
    db.exec('ALTER TABLE channels ADD COLUMN youtube_token_path TEXT;');
  }

  // 017-patch: draft_songs.original_ratio 컬럼 추가
  const draftSongCols = db.pragma('table_info(draft_songs)') as Array<{ name: string }>;
  if (!draftSongCols.some(c => c.name === 'original_ratio')) {
    db.exec('ALTER TABLE draft_songs ADD COLUMN original_ratio INTEGER;');
  }

  // 018-patch: draft_songs.rating 컬럼 추가 (0~5 별점)
  if (!draftSongCols.some(c => c.name === 'rating')) {
    db.exec('ALTER TABLE draft_songs ADD COLUMN rating INTEGER NOT NULL DEFAULT 0;');
  }

  // 019-patch: draft_songs.style_weight, weirdness 컬럼 추가 (0~100 정수, Suno에 /100으로 전달)
  if (!draftSongCols.some(c => c.name === 'style_weight')) {
    db.exec('ALTER TABLE draft_songs ADD COLUMN style_weight INTEGER;');
  }
  if (!draftSongCols.some(c => c.name === 'weirdness')) {
    db.exec('ALTER TABLE draft_songs ADD COLUMN weirdness INTEGER;');
  }

  // 021-patch: draft_songs.vocal_gender 컬럼 추가 ('f'|'m'|null)
  if (!draftSongCols.some(c => c.name === 'vocal_gender')) {
    db.exec('ALTER TABLE draft_songs ADD COLUMN vocal_gender TEXT;');
  }

  // 022-patch: midi_draft_rows.vocal_gender 컬럼 추가 ('f'|'m'|null)
  const draftRowCols = db.pragma('table_info(midi_draft_rows)') as Array<{ name: string }>;
  if (!draftRowCols.some(c => c.name === 'vocal_gender')) {
    db.exec('ALTER TABLE midi_draft_rows ADD COLUMN vocal_gender TEXT;');
  }

  // 020-patch: draft_songs.waveform_data 컬럼 추가 (JSON 문자열로 캐시)
  if (!draftSongCols.some(c => c.name === 'waveform_data')) {
    db.exec('ALTER TABLE draft_songs ADD COLUMN waveform_data TEXT;');
  }

  // 023-patch: back_images.thumbnail_r2_key 컬럼 추가
  const backImageCols = db.pragma('table_info(back_images)') as Array<{ name: string }>;
  if (!backImageCols.some(c => c.name === 'thumbnail_r2_key')) {
    db.exec('ALTER TABLE back_images ADD COLUMN thumbnail_r2_key TEXT;');
  }

  // 024-patch: job_queue.progress 컬럼 추가 (렌더 파이프라인 진행률)
  const jobQueueCols = db.pragma('table_info(job_queue)') as Array<{ name: string }>;
  if (!jobQueueCols.some(c => c.name === 'progress')) {
    db.exec('ALTER TABLE job_queue ADD COLUMN progress TEXT;');
  }

  // 031-patch: job_queue.cancel_requested_at 컬럼 추가 (렌더 취소 신호)
  if (!jobQueueCols.some(c => c.name === 'cancel_requested_at')) {
    db.exec('ALTER TABLE job_queue ADD COLUMN cancel_requested_at INTEGER;');
  }

  // 025: user_api_keys 테이블 (IF NOT EXISTS — 멱등)
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      key_type TEXT NOT NULL,
      key_value TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(user_id, key_type)
    );
    CREATE INDEX IF NOT EXISTS idx_user_api_keys_user_id ON user_api_keys(user_id);
  `);

  // 026: gemini_accounts 테이블 — Gemini API 키 그룹 관리 (우선순위 + rate-limit fallback)
  db.exec(`
    CREATE TABLE IF NOT EXISTS gemini_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('gemini-api', 'vertex-ai-apikey')),
      api_key TEXT NOT NULL,
      project TEXT,
      location TEXT DEFAULT 'us-central1',
      priority INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(user_id, name)
    );
    CREATE INDEX IF NOT EXISTS idx_gemini_accounts_user_id ON gemini_accounts(user_id);
  `);

  // 018: youtube_oauth_tokens 테이블 — YouTube OAuth 토큰 DB 저장 (파일 → DB 전환)
  const migration018 = fs.readFileSync(
    path.join(base, 'migrations/018_youtube_oauth_tokens.sql'),
    'utf-8',
  );
  db.exec(migration018);

  // 027: render_image_usage 테이블 — 렌더 배경이미지 사용 이력 (균등 분배용)
  db.exec(`
    CREATE TABLE IF NOT EXISTS render_image_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER NOT NULL,
      back_image_id INTEGER NOT NULL,
      image_category TEXT NOT NULL CHECK(image_category IN ('thumbnail', 'video')),
      used_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_render_image_usage_channel
      ON render_image_usage(channel_id, image_category);
  `);

  // 027-patch: draft_songs.render_bg_key 컬럼 (렌더용 배경이미지 r2_key)
  if (!draftSongCols.some(c => c.name === 'render_bg_key')) {
    db.exec('ALTER TABLE draft_songs ADD COLUMN render_bg_key TEXT;');
  }

  // 028: soft delete — deleted_at 컬럼 추가 (8개 테이블)
  const softDeleteTables = [
    'draft_songs', 'midi_draft_rows', 'workspace_midis', 'back_images',
    'channels', 'suno_accounts', 'gemini_accounts', 'track_images',
  ];
  for (const table of softDeleteTables) {
    const cols = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
    if (!cols.some(c => c.name === 'deleted_at')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN deleted_at INTEGER;`);
    }
  }

  // 019: music_analysis_system_prompt — 전체 하드코딩 프롬프트를 DB로 이관
  const migration019 = fs.readFileSync(
    path.join(base, 'migrations/019_system_prompts.sql'),
    'utf-8',
  );
  try { db.exec(migration019); } catch { /* 이미 최신 값 존재 */ }

  // 020: background_analysis_system_prompt 초기 시드
  const migration020 = fs.readFileSync(
    path.join(base, 'migrations/020_background_analysis_prompt.sql'),
    'utf-8',
  );
  db.exec(migration020);

  // 021-patch: midi_draft_rows.lyric_lang, lyric_trans 컬럼 추가
  const draftRowColsV2 = db.pragma('table_info(midi_draft_rows)') as Array<{ name: string }>;
  if (!draftRowColsV2.some(c => c.name === 'lyric_lang')) {
    db.exec("ALTER TABLE midi_draft_rows ADD COLUMN lyric_lang TEXT CHECK(lyric_lang IN ('en','ja','ko','zh','inst'));");
  }
  if (!draftRowColsV2.some(c => c.name === 'lyric_trans')) {
    db.exec("ALTER TABLE midi_draft_rows ADD COLUMN lyric_trans TEXT CHECK(lyric_trans IN ('en','ja','ko','zh','none'));");
  }

  // 029-patch: midi_masters.background_mp3_r2_key, background_analysis_json 컬럼 추가 (배경음 분석)
  const midiMasterCols = db.pragma('table_info(midi_masters)') as Array<{ name: string }>;
  if (!midiMasterCols.some(c => c.name === 'background_mp3_r2_key')) {
    db.exec('ALTER TABLE midi_masters ADD COLUMN background_mp3_r2_key TEXT;');
  }
  if (!midiMasterCols.some(c => c.name === 'background_analysis_json')) {
    db.exec('ALTER TABLE midi_masters ADD COLUMN background_analysis_json TEXT;');
  }

  // 030-patch: midi_draft_rows.injection_type 컬럼 추가 (A=MIDI분석+채널, B=배경음+채널, C=배경음+공통)
  const draftRowColsV3 = db.pragma('table_info(midi_draft_rows)') as Array<{ name: string }>;
  if (!draftRowColsV3.some(c => c.name === 'injection_type')) {
    db.exec("ALTER TABLE midi_draft_rows ADD COLUMN injection_type TEXT DEFAULT 'A';");
  }

  // 022-patch: workspaces.deleted_at 컬럼 추가 (soft delete)
  const workspaceColsDeleted = db.pragma('table_info(workspaces)') as Array<{ name: string }>;
  if (!workspaceColsDeleted.some(c => c.name === 'deleted_at')) {
    db.exec('ALTER TABLE workspaces ADD COLUMN deleted_at INTEGER;');
  }

  // E2E 테스트 워크스페이스 정리 (이름 패턴 기준 soft delete)
  db.exec(`
    UPDATE workspaces SET deleted_at = unixepoch() * 1000
    WHERE deleted_at IS NULL AND (name LIKE '%e2e%' OR name LIKE 'E2E%' OR name LIKE 'e2e%')
  `);

  // 031: render_results 테이블 — 렌더 완료 이력 저장
  db.exec(`
    CREATE TABLE IF NOT EXISTS render_results (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      suno_track_id TEXT NOT NULL,
      video_path TEXT,
      named_path TEXT,
      lyric_lang TEXT,
      lyric_trans TEXT,
      rendered_at INTEGER NOT NULL,
      deleted_at INTEGER,
      UNIQUE(workspace_id, suno_track_id)
    );
    CREATE INDEX IF NOT EXISTS idx_render_results_workspace ON render_results(workspace_id);
  `);
  // 031-patch: render_results.deleted_at 컬럼 추가 (기존 DB 대응)
  const renderResultCols = db.pragma('table_info(render_results)') as Array<{ name: string }>;
  if (!renderResultCols.some(c => c.name === 'deleted_at')) {
    db.exec('ALTER TABLE render_results ADD COLUMN deleted_at INTEGER;');
  }
}
