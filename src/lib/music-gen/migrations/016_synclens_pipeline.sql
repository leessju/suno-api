-- SyncLens 파이프라인 실행 단위
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel_id      INTEGER NOT NULL REFERENCES channels(id),
  vol_name        TEXT NOT NULL,
  sync_lens_path  TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK(status IN ('pending','running','paused','completed','failed','cancelled')),
  current_phase   TEXT DEFAULT 'song'
                  CHECK(current_phase IN ('song','vol')),
  total_songs     INTEGER NOT NULL DEFAULT 0,
  config_json     TEXT NOT NULL DEFAULT '{}',
  started_at      INTEGER,
  completed_at    INTEGER,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

-- 파이프라인 개별 단계
CREATE TABLE IF NOT EXISTS pipeline_steps (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  step_code       TEXT NOT NULL,
  step_name       TEXT NOT NULL,
  phase           TEXT NOT NULL CHECK(phase IN ('song','vol')),
  song_index      INTEGER,
  song_title      TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK(status IN ('pending','running','completed','failed','retrying','skipped')),
  job_id          TEXT REFERENCES job_queue(id),
  attempts        INTEGER NOT NULL DEFAULT 0,
  max_attempts    INTEGER NOT NULL DEFAULT 3,
  error           TEXT,
  started_at      INTEGER,
  completed_at    INTEGER,
  created_at      INTEGER NOT NULL
);

-- 파이프라인 이벤트 로그
CREATE TABLE IF NOT EXISTS pipeline_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id          TEXT NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  step_id         TEXT REFERENCES pipeline_steps(id),
  event_type      TEXT NOT NULL,
  message         TEXT,
  metadata_json   TEXT,
  created_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_workspace ON pipeline_runs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status ON pipeline_runs(status);
CREATE INDEX IF NOT EXISTS idx_pipeline_steps_run ON pipeline_steps(run_id, step_code);
CREATE INDEX IF NOT EXISTS idx_pipeline_steps_status ON pipeline_steps(status);
CREATE INDEX IF NOT EXISTS idx_pipeline_steps_job ON pipeline_steps(job_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_events_run ON pipeline_events(run_id, created_at);
