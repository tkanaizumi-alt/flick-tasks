-- 過去のボスとの再戦 (1 日の回数を数える)
ALTER TABLE daily ADD COLUMN rematches INTEGER NOT NULL DEFAULT 0;
