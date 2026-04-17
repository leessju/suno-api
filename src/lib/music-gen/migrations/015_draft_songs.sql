-- 015: draft_songs 테이블 — midi_draft_rows 1:N draft_songs
-- Suno 1회 호출 = clip 2개 반환, 같은 가사로 반복 호출 지원

CREATE TABLE IF NOT EXISTS draft_songs (
  id               TEXT PRIMARY KEY,               -- app-level UUID (crypto.randomUUID())
  draft_row_id     TEXT NOT NULL REFERENCES midi_draft_rows(id) ON DELETE CASCADE,
  suno_id          TEXT,                           -- Suno clip.id (v1, chirp-v4.5 또는 chirp-fenix)
  suno_v2_id       TEXT,                           -- v5.5 Cover 업그레이드 후 clip.id (선택)
  title            TEXT,                           -- clip.title (Suno 생성 제목)
  lyric            TEXT,                           -- clip.lyric (Suno 실제 가사)
  audio_url        TEXT,                           -- clip.audio_url
  image_url        TEXT,                           -- clip.image_url (커버 썸네일)
  duration         REAL,                           -- clip.duration (초 단위)
  style_used       TEXT,                           -- 생성 시점 스타일 스냅샷
  is_confirmed     INTEGER NOT NULL DEFAULT 0,     -- 사용자 확정 여부 (1=확정) — 영상 만들기 대상
  custom_image_key TEXT,                           -- 개별 배경 오버라이드 (null이면 draft_row.image_key 상속)
  sort_order       INTEGER NOT NULL DEFAULT 0,     -- 플레이리스트 순서
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK(status IN ('pending','processing','done','failed')),
  error_msg        TEXT,
  created_at       INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_draft_songs_row  ON draft_songs(draft_row_id);
CREATE INDEX IF NOT EXISTS idx_draft_songs_suno ON draft_songs(suno_id);
