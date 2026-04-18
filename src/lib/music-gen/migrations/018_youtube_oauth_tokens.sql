CREATE TABLE IF NOT EXISTS youtube_oauth_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  channel_name TEXT NOT NULL,
  youtube_channel_id TEXT,
  youtube_channel_title TEXT,
  youtube_channel_handle TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  client_id TEXT NOT NULL,
  client_secret TEXT NOT NULL,
  scopes TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, channel_name)
);

CREATE INDEX IF NOT EXISTS idx_youtube_oauth_tokens_user_id ON youtube_oauth_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_youtube_oauth_tokens_channel_name ON youtube_oauth_tokens(channel_name);
