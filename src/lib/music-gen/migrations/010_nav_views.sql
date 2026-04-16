-- 010: 네비게이션용 뷰 + 유저 설정 테이블
-- telegram_config: 유저별 텔레그램 봇 설정
CREATE TABLE IF NOT EXISTS telegram_config (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  bot_token    TEXT NOT NULL DEFAULT '',
  chat_id      TEXT NOT NULL DEFAULT '',
  enabled      INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  UNIQUE(user_id)
);

-- user_profile_ext: 유저 추가 정보 (better-auth user 테이블 확장)
CREATE TABLE IF NOT EXISTS user_profile_ext (
  user_id      TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  avatar_r2_key TEXT,
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_telegram_config_user ON telegram_config(user_id);
