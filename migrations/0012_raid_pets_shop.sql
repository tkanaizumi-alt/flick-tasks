-- 装備の強化段階 (+1〜+5)
ALTER TABLE items ADD COLUMN plus INTEGER NOT NULL DEFAULT 0;
-- 連れているペット / XP 2 倍チケットの残り回数
ALTER TABLE players ADD COLUMN pet TEXT;
ALTER TABLE players ADD COLUMN boost_left INTEGER NOT NULL DEFAULT 0;
-- 週替わりのレイドボスの報酬 (1 週 1 回)
CREATE TABLE IF NOT EXISTS raid_claims (
  user_id TEXT NOT NULL,
  week TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, week)
);
