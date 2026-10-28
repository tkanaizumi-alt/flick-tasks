-- よく使うタスクのセット (テンプレート)。items は件名の JSON 配列
CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  items TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS templates_user ON templates (user_id, created_at);
-- カレンダー配信 (iCal) の URL に入れる合言葉。1 人 1 つ
CREATE TABLE IF NOT EXISTS cal_tokens (
  user_id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
-- 機能の使われ方とゴールドの増減 (管理者の集計用。90 日で消す)
CREATE TABLE IF NOT EXISTS usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  feature TEXT NOT NULL,
  gold INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS usage_time ON usage (created_at);
