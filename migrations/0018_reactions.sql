-- 他の人のタスクへのリアクション (1 人 1 種類につき 1 つ。もう一度押すと取り消し)
CREATE TABLE IF NOT EXISTS reactions (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (task_id, user_id, kind)
);
