-- 004_better_auth.sql
-- better-auth 기본 테이블 (user, session, account, verification)
-- 계획서 §14.7: better-auth 인증 (email/password + Google OAuth)

CREATE TABLE IF NOT EXISTS "user" (
  "id"            TEXT NOT NULL PRIMARY KEY,
  "name"          TEXT NOT NULL,
  "email"         TEXT NOT NULL UNIQUE,
  "emailVerified" INTEGER NOT NULL DEFAULT 0,
  "image"         TEXT,
  "createdAt"     INTEGER NOT NULL,
  "updatedAt"     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS "session" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "expiresAt"   INTEGER NOT NULL,
  "token"       TEXT NOT NULL UNIQUE,
  "createdAt"   INTEGER NOT NULL,
  "updatedAt"   INTEGER NOT NULL,
  "ipAddress"   TEXT,
  "userAgent"   TEXT,
  "userId"      TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "account" (
  "id"                      TEXT NOT NULL PRIMARY KEY,
  "accountId"               TEXT NOT NULL,
  "providerId"              TEXT NOT NULL,
  "userId"                  TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "accessToken"             TEXT,
  "refreshToken"            TEXT,
  "idToken"                 TEXT,
  "accessTokenExpiresAt"    INTEGER,
  "refreshTokenExpiresAt"   INTEGER,
  "scope"                   TEXT,
  "password"                TEXT,
  "createdAt"               INTEGER NOT NULL,
  "updatedAt"               INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS "verification" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "identifier"  TEXT NOT NULL,
  "value"       TEXT NOT NULL,
  "expiresAt"   INTEGER NOT NULL,
  "createdAt"   INTEGER,
  "updatedAt"   INTEGER
);

CREATE INDEX IF NOT EXISTS idx_session_userId      ON "session"("userId");
CREATE INDEX IF NOT EXISTS idx_session_token       ON "session"("token");
CREATE INDEX IF NOT EXISTS idx_account_userId      ON "account"("userId");
CREATE INDEX IF NOT EXISTS idx_account_providerId  ON "account"("providerId", "accountId");
