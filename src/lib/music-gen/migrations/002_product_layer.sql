-- 002_product_layer.sql
-- Product layer tables (IF NOT EXISTS — idempotent, safe to re-run)
-- 기존 channels, contents, content_channels, sessions, messages 테이블은 건드리지 않음

-- MIDI 마스터 (workspaces가 참조하므로 먼저 생성)
CREATE TABLE IF NOT EXISTS midi_masters (
  id            TEXT PRIMARY KEY,
  source_url    TEXT,
  midi_r2_key   TEXT NOT NULL,
  mp3_r2_key    TEXT NOT NULL,
  chord_json    TEXT,
  bpm           REAL,
  key_signature TEXT,
  soundfont     TEXT,
  usage_count   INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);

-- 워크스페이스
CREATE TABLE IF NOT EXISTS workspaces (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  source_type   TEXT NOT NULL CHECK(source_type IN ('youtube_video', 'mp3_file', 'album_list')),
  source_ref    TEXT,
  cover_midi_id TEXT REFERENCES midi_masters(id),
  pipeline_mode TEXT NOT NULL DEFAULT 'step' CHECK(pipeline_mode IN ('step', 'auto')),
  status        TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'active', 'archived')),
  channel_id    INTEGER REFERENCES channels(id) ON DELETE SET NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

-- 워크스페이스 트랙
CREATE TABLE IF NOT EXISTS workspace_tracks (
  workspace_id    TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  suno_track_id   TEXT NOT NULL,
  variant_id      TEXT,
  suno_account_id INTEGER,
  is_checked      INTEGER NOT NULL DEFAULT 0,
  checked_at      INTEGER,
  PRIMARY KEY (workspace_id, suno_track_id)
);

-- 결재 세션
CREATE TABLE IF NOT EXISTS approval_sessions (
  id            TEXT PRIMARY KEY,
  track_id      TEXT NOT NULL,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
  started_at    INTEGER NOT NULL,
  concluded_at  INTEGER,
  final_verdict TEXT
);

-- 결재 투표
CREATE TABLE IF NOT EXISTS approval_votes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    TEXT NOT NULL REFERENCES approval_sessions(id) ON DELETE CASCADE,
  voter_type    TEXT NOT NULL CHECK(voter_type IN ('agent', 'user')),
  voter_id      TEXT NOT NULL,
  score         REAL CHECK(score >= 0 AND score <= 100),
  verdict       TEXT CHECK(verdict IN ('approve', 'reject', 'abstain')),
  comment       TEXT,
  ts            INTEGER NOT NULL
);

-- Job 큐 (P0~P1 SQLite 기반)
CREATE TABLE IF NOT EXISTS job_queue (
  id              TEXT PRIMARY KEY,
  type            TEXT NOT NULL,
  payload         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'done', 'failed')),
  idempotency_key TEXT UNIQUE,
  attempts        INTEGER NOT NULL DEFAULT 0,
  max_attempts    INTEGER NOT NULL DEFAULT 5,
  scheduled_at    INTEGER NOT NULL,
  picked_at       INTEGER,
  done_at         INTEGER,
  error           TEXT
);

-- 웹훅 dedupe
CREATE TABLE IF NOT EXISTS processed_events (
  event_id    TEXT PRIMARY KEY,
  source      TEXT NOT NULL,
  received_at INTEGER NOT NULL
);

-- OpenClaw 루프
CREATE TABLE IF NOT EXISTS openclaw_loops (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  schedule_cron       TEXT NOT NULL,
  prompt_template     TEXT NOT NULL,
  target_workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  enabled             INTEGER NOT NULL DEFAULT 1,
  last_run_at         INTEGER,
  config_json         TEXT NOT NULL DEFAULT '{}'
);

-- Suno 계정 크레딧 스냅샷
CREATE TABLE IF NOT EXISTS gem_credit_snapshots (
  account_id   INTEGER PRIMARY KEY,
  label        TEXT,
  credits      INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

-- LLM API 호출 비용 기록
CREATE TABLE IF NOT EXISTS gem_llm_usage (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  session_id      TEXT,
  provider        TEXT NOT NULL CHECK(provider IN ('claude', 'gemini')),
  model           TEXT NOT NULL,
  input_tokens    INTEGER NOT NULL,
  output_tokens   INTEGER NOT NULL,
  cost_usd        REAL NOT NULL,
  purpose         TEXT,
  ts              INTEGER NOT NULL
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_workspaces_channel        ON workspaces(channel_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_status         ON workspaces(status);
CREATE INDEX IF NOT EXISTS idx_workspace_tracks_workspace ON workspace_tracks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_approval_sessions_workspace ON approval_sessions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_approval_votes_session    ON approval_votes(session_id);
CREATE INDEX IF NOT EXISTS idx_job_queue_status          ON job_queue(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_job_queue_idempotency     ON job_queue(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_gem_llm_usage_workspace   ON gem_llm_usage(workspace_id, ts);
CREATE INDEX IF NOT EXISTS idx_gem_llm_usage_ts          ON gem_llm_usage(ts);
