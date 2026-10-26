-- 分解元タスク (分解は 1 段まで。元タスクの XP を子タスクで分け合う)
ALTER TABLE tasks ADD COLUMN parent_id TEXT;
-- 状況フラグ: wait (確認待ち) / help (困っている) / late (遅れそう)
ALTER TABLE tasks ADD COLUMN flag TEXT;
ALTER TABLE tasks ADD COLUMN flag_note TEXT;
ALTER TABLE tasks ADD COLUMN flag_to TEXT;
ALTER TABLE tasks ADD COLUMN flag_at INTEGER;
-- 依頼: 依頼した人と、依頼した人側の後続タスク
ALTER TABLE tasks ADD COLUMN requested_by TEXT;
ALTER TABLE tasks ADD COLUMN follow_id TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_follow ON tasks(follow_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user_done ON tasks(user_id, done_at);
CREATE INDEX IF NOT EXISTS idx_activity_user_time ON activity(user_id, created_at);

-- アプリ内通知 (依頼・依頼の完了・確認待ち・困っている)
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  task_id TEXT,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  read_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at);

-- キャラクターのスキン (NULL = Google の写真)
ALTER TABLE players ADD COLUMN skin TEXT;
