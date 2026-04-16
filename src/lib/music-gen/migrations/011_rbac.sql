-- 011_rbac.sql
CREATE TABLE IF NOT EXISTS user_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'common' CHECK(role IN ('admin','common')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(user_id)
);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);

-- seed: nicejames@gmail.com → admin
INSERT OR IGNORE INTO user_roles (user_id, role)
SELECT id, 'admin' FROM user WHERE email = 'nicejames@gmail.com';
