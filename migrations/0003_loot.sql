-- ゴールドと装備スロット
ALTER TABLE players ADD COLUMN gold INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN eq_weapon TEXT;
ALTER TABLE players ADD COLUMN eq_armor TEXT;
ALTER TABLE players ADD COLUMN eq_charm TEXT;

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot TEXT NOT NULL,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  rarity TEXT NOT NULL,
  atk INTEGER NOT NULL DEFAULT 0,
  hp INTEGER NOT NULL DEFAULT 0,
  crit INTEGER NOT NULL DEFAULT 0,
  heal INTEGER NOT NULL DEFAULT 0,
  effect TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_user ON items(user_id);

-- 日ごとのバトル回数と受け取り済みミッション
CREATE TABLE IF NOT EXISTS daily (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day INTEGER NOT NULL,
  battles INTEGER NOT NULL DEFAULT 0,
  claimed TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (user_id, day)
);

-- 7 日経過した完了タスクの削除用
CREATE INDEX IF NOT EXISTS idx_tasks_status_done ON tasks(status, done_at);
