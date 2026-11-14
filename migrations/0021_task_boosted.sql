-- 完了したときに XP 2 倍チケットを使ったか (完了を戻したらチケットを返すため)
ALTER TABLE tasks ADD COLUMN boosted INTEGER NOT NULL DEFAULT 0;
