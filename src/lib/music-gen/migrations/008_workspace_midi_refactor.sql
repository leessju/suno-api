-- 008_workspace_midi_refactor.sql
-- workspace_midis 테이블 신설 (워크스페이스당 N개 MIDI 관리)

CREATE TABLE IF NOT EXISTS workspace_midis (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  midi_master_id  TEXT REFERENCES midi_masters(id),
  source_type     TEXT NOT NULL CHECK(source_type IN ('youtube_video', 'mp3_file', 'direct_midi')),
  source_ref      TEXT,
  label           TEXT,
  gen_mode        TEXT NOT NULL DEFAULT 'auto' CHECK(gen_mode IN ('auto', 'manual')),
  original_ratio  INTEGER NOT NULL DEFAULT 50 CHECK(original_ratio BETWEEN 0 AND 100),
  -- 0 = 순수 스타일, 50 = 균형, 100 = 순수 원곡
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK(status IN ('pending','converting','ready','generating','done','error')),
  error_message   TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspace_midis_ws ON workspace_midis(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_midis_status ON workspace_midis(status);

-- workspace_tracks에 workspace_midi_id 연결 컬럼 추가
ALTER TABLE workspace_tracks ADD COLUMN workspace_midi_id TEXT REFERENCES workspace_midis(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workspace_tracks_midi ON workspace_tracks(workspace_midi_id);

-- 기존 워크스페이스 데이터 마이그레이션:
-- cover_midi_id가 설정된 워크스페이스에 대해 workspace_midis 레코드 자동 생성
INSERT OR IGNORE INTO workspace_midis (id, workspace_id, midi_master_id, source_type, source_ref, label, gen_mode, original_ratio, status, created_at, updated_at)
SELECT
  'wm_' || lower(hex(randomblob(8))),
  w.id,
  w.cover_midi_id,
  COALESCE(w.source_type, 'youtube_video'),
  w.source_ref,
  '기존 MIDI',
  'auto',
  50,
  CASE WHEN w.cover_midi_id IS NOT NULL THEN 'ready' ELSE 'pending' END,
  COALESCE(w.created_at, strftime('%s', 'now')),
  strftime('%s', 'now')
FROM workspaces w
WHERE w.cover_midi_id IS NOT NULL OR w.source_ref IS NOT NULL;
