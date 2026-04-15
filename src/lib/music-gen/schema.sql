-- music-gen schema (IF NOT EXISTS — idempotent, safe to re-run)

CREATE TABLE IF NOT EXISTS channels (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_name        TEXT NOT NULL,
  youtube_channel_id  TEXT NOT NULL UNIQUE,
  channel_handle      TEXT,
  system_prompt       TEXT NOT NULL,
  forbidden_words     TEXT NOT NULL DEFAULT '[]',
  recommended_words   TEXT NOT NULL DEFAULT '[]',
  lyric_format        TEXT NOT NULL DEFAULT 'jp2_en1',
  created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contents (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  title_en            TEXT NOT NULL,
  title_jp            TEXT NOT NULL,
  lyrics              TEXT NOT NULL,
  narrative           TEXT NOT NULL,
  suno_style_prompt   TEXT NOT NULL,
  emotion_input       TEXT NOT NULL,
  gemini_model        TEXT,
  created_at          DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS content_channels (
  content_id      INTEGER NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  channel_ref_id  INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  PRIMARY KEY (content_id, channel_ref_id)
);

CREATE INDEX IF NOT EXISTS idx_contents_created   ON contents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cc_channel         ON content_channels(channel_ref_id);
CREATE INDEX IF NOT EXISTS idx_channels_yt_id     ON channels(youtube_channel_id);

-- Context layer (additive — v3 tables above are never altered)

CREATE TABLE IF NOT EXISTS sessions (
  id                  TEXT PRIMARY KEY,
  channel_id          INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  title               TEXT,
  status              TEXT NOT NULL DEFAULT 'active',
  summary             TEXT,
  summary_version     INTEGER NOT NULL DEFAULT 0,
  constraints_json    TEXT,
  media_analysis      TEXT,
  media_ref           TEXT,
  last_summary_error  TEXT,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_channel ON sessions(channel_id);

CREATE TABLE IF NOT EXISTS messages (
  id           TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role         TEXT NOT NULL,
  content      TEXT NOT NULL,
  token_count  INTEGER NOT NULL DEFAULT 0,
  summarized   INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'complete',
  created_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);
