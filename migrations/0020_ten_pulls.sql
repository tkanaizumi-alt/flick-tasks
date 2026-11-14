-- 宝箱の 10 連ガチャを回した回数 (実績「一攫千金」用)
ALTER TABLE players ADD COLUMN ten_pulls INTEGER NOT NULL DEFAULT 0;
