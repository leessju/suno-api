CREATE TABLE IF NOT EXISTS youtube_shorts (
  id TEXT PRIMARY KEY,
  clip_id TEXT REFERENCES youtube_clips(id) ON DELETE SET NULL,  -- nullable: 독립 쇼츠도 가능
  channel_id INTEGER REFERENCES channels(id),
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  thumbnail_key TEXT,
  video_path TEXT,
  duration REAL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','uploaded')),
  youtube_privacy TEXT DEFAULT 'private' CHECK(youtube_privacy IN ('public','private','unlisted')),
  youtube_video_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_youtube_shorts_clip_id ON youtube_shorts(clip_id);
CREATE INDEX IF NOT EXISTS idx_youtube_shorts_channel_id ON youtube_shorts(channel_id);
