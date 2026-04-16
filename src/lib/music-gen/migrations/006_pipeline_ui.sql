-- 트랙별 배경 이미지 매핑
CREATE TABLE IF NOT EXISTS track_images (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  suno_track_id   TEXT NOT NULL,
  r2_key          TEXT,
  local_path      TEXT,
  source_type     TEXT NOT NULL DEFAULT 'upload',
  source_url      TEXT,
  assigned_at     INTEGER NOT NULL,
  UNIQUE(workspace_id, suno_track_id)
);

-- 쇼츠 메타데이터
CREATE TABLE IF NOT EXISTS shorts (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  suno_track_id   TEXT NOT NULL,
  title           TEXT,
  description     TEXT,
  pinned_comment  TEXT,
  hashtags        TEXT,
  r2_key          TEXT,
  upload_status   TEXT NOT NULL DEFAULT 'pending',
  youtube_short_id TEXT,
  created_at      INTEGER NOT NULL,
  UNIQUE(workspace_id, suno_track_id)
);

-- YouTube 업로드 결과
CREATE TABLE IF NOT EXISTS upload_results (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  youtube_video_id TEXT,
  title           TEXT NOT NULL,
  description     TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
  error_message   TEXT,
  uploaded_at     INTEGER,
  created_at      INTEGER NOT NULL
);

-- workspaces 테이블 확장 (ignore errors if columns already exist)
ALTER TABLE workspaces ADD COLUMN current_step INTEGER NOT NULL DEFAULT 1;
ALTER TABLE workspaces ADD COLUMN merge_order  TEXT;
