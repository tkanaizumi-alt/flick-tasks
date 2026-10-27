-- 本番で起きたエラーの記録 (サーバー・画面の両方)。管理者の集計画面で見る。30 日で消す
CREATE TABLE IF NOT EXISTS errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  path TEXT,
  message TEXT NOT NULL,
  stack TEXT,
  user_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_errors_time ON errors(created_at);
