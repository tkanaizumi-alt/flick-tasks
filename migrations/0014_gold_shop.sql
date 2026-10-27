-- ショップで増やした持ち物の枠
ALTER TABLE players ADD COLUMN inv_extra INTEGER NOT NULL DEFAULT 0;
-- ゴールドで買ったスキン
CREATE TABLE IF NOT EXISTS owned_skins (
  user_id TEXT NOT NULL,
  skin_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, skin_id)
);
-- みんなへの差し入れ (1 日 1 回)
CREATE TABLE IF NOT EXISTS treats (
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, day)
);
