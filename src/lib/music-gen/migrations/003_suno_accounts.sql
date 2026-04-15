-- 003_suno_accounts.sql
-- Suno 계정 DB 관리 (env fallback 유지)

CREATE TABLE IF NOT EXISTS suno_accounts (
  id          INTEGER PRIMARY KEY,   -- 1~10 (SUNO_COOKIE_N과 동일 번호)
  label       TEXT NOT NULL DEFAULT '',
  cookie      TEXT NOT NULL,         -- JWT 쿠키 전체 문자열
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_suno_accounts_active ON suno_accounts(is_active);
