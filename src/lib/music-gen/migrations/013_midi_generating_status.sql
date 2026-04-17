-- 013: workspace_midis에 'midi_generating' 상태 추가
-- YouTube 흐름: converting → midi_generating → analyzing → ready
-- MP3 흐름: midi_generating → analyzing → ready

CREATE TABLE IF NOT EXISTS workspace_midis_new2 (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  midi_master_id  TEXT REFERENCES midi_masters(id),
  source_type     TEXT NOT NULL CHECK(source_type IN ('youtube_video','mp3_file','direct_midi')),
  source_ref      TEXT,
  label           TEXT,
  gen_mode        TEXT NOT NULL DEFAULT 'auto',
  original_ratio  INTEGER NOT NULL DEFAULT 50 CHECK(original_ratio BETWEEN 0 AND 100),
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK(status IN ('pending','converting','midi_generating','analyzing','ready','generating','done','error')),
  error_message   TEXT,
  created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
  updated_at      INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);
INSERT OR IGNORE INTO workspace_midis_new2 SELECT * FROM workspace_midis;
DROP TABLE workspace_midis;
ALTER TABLE workspace_midis_new2 RENAME TO workspace_midis;
CREATE INDEX IF NOT EXISTS idx_workspace_midis_ws ON workspace_midis(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_midis_status ON workspace_midis(status);
