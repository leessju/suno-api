-- youtube_clips: 유튜브 업로드용 클립 관리 테이블
-- render_results(렌더영상)과 완전 분리. 쇼츠 등 파생 영상의 부모 테이블.
CREATE TABLE IF NOT EXISTS youtube_clips (
  id            TEXT    PRIMARY KEY,
  channel_id    INTEGER REFERENCES channels(id),
  title         TEXT    NOT NULL DEFAULT '',
  description   TEXT    NOT NULL DEFAULT '',
  thumbnail_key TEXT,                           -- R2 오브젝트 키
  video_path    TEXT,                           -- 로컬 병합 영상 경로
  duration      INTEGER,                        -- 초 단위
  status        TEXT    NOT NULL DEFAULT 'draft'
                CHECK(status IN ('draft','ready','uploading','uploaded','failed')),
  youtube_video_id TEXT,                        -- 업로드 후 YouTube video ID
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  deleted_at    INTEGER
);

-- youtube_clip_renders: 어떤 render_results가 이 클립에 포함됐는지 연결
CREATE TABLE IF NOT EXISTS youtube_clip_renders (
  clip_id       TEXT NOT NULL REFERENCES youtube_clips(id),
  render_id     TEXT NOT NULL REFERENCES render_results(id),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (clip_id, render_id)
);
