-- 014: MIDI 상세 페이지 생성 결과 draft 저장
-- GeneratedRow를 1:1 매핑 — 새로고침 후 복원 지원

CREATE TABLE IF NOT EXISTS midi_draft_rows (
  id                  TEXT PRIMARY KEY,                  -- 클라이언트 UUID
  workspace_midi_id   TEXT NOT NULL REFERENCES workspace_midis(id) ON DELETE CASCADE,
  title_en            TEXT NOT NULL DEFAULT '',
  title_jp            TEXT NOT NULL DEFAULT '',
  lyrics              TEXT NOT NULL DEFAULT '',
  narrative           TEXT NOT NULL DEFAULT '',
  suno_style_prompts  TEXT NOT NULL DEFAULT '[]',        -- JSON array
  selected_style      TEXT NOT NULL DEFAULT '',
  image_key           TEXT,
  original_ratio      INTEGER NOT NULL DEFAULT 50,
  status              TEXT NOT NULL DEFAULT 'loading'
                        CHECK(status IN ('loading','ready','making','done','error')),
  error_msg           TEXT,
  made_title          TEXT,
  made_title_video    TEXT,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_at          INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at          INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_midi_draft_rows_midi ON midi_draft_rows(workspace_midi_id, sort_order);
