-- 009_multi_user_suno_sync.sql
-- 멀티 유저 지원 + Suno 워크스페이스 원격 싱크

-- suno_accounts에 user_id 추가 (better-auth user 테이블 참조)
-- ALTER TABLE은 db.ts에서 pragma 체크로 처리

-- workspaces에 user_id, suno_account_id, suno_workspace_id, suno_sync_status, suno_synced_at 추가
-- ALTER TABLE은 db.ts에서 pragma 체크로 처리

-- 인덱스 (CREATE INDEX IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_suno_accounts_user ON suno_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_user ON workspaces(user_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_suno_account ON workspaces(suno_account_id);
