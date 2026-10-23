-- タスクの期限 (YYYY-MM-DD)。本人以外も設定でき、設定した人を記録する
ALTER TABLE tasks ADD COLUMN due_date TEXT;
ALTER TABLE tasks ADD COLUMN due_by TEXT;

-- デイリーミッション用: その日の追加件数・進行中にした件数・宝箱を開けた回数
ALTER TABLE daily ADD COLUMN adds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE daily ADD COLUMN doings INTEGER NOT NULL DEFAULT 0;
ALTER TABLE daily ADD COLUMN chests INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_activity_kind_time ON activity(kind, created_at);
