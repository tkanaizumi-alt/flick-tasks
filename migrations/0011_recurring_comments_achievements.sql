-- 繰り返しタスク: rule は daily (毎日) / weekdays (平日) / weekly:0-6 (毎週その曜日) / monthly:1-31 (毎月その日)
CREATE TABLE IF NOT EXISTS recurring (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  rule TEXT NOT NULL,
  priority TEXT,
  last_day TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recurring_user ON recurring(user_id);
-- 繰り返しから作られたタスク
ALTER TABLE tasks ADD COLUMN recurring_id TEXT;

-- タスクへのコメント (持ち主・他の人どちらも書ける)
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_task ON comments(task_id, created_at);

-- AI の週のふりかえり
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  period_from TEXT NOT NULL,
  period_to TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reports_user ON reports(user_id, created_at);

-- 実績 (称号) と、名前の横に出す称号
CREATE TABLE IF NOT EXISTS player_achievements (
  user_id TEXT NOT NULL,
  achievement_id TEXT NOT NULL,
  unlocked_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, achievement_id)
);
ALTER TABLE players ADD COLUMN title TEXT;
