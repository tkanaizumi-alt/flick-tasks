-- 他の人のタスクを進めたときの手伝い XP の記録 (1 つのタスク・1 人・1 段階につき 1 回だけ)
CREATE TABLE IF NOT EXISTS helps (
  task_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  xp INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (task_id, user_id, kind)
);
