-- 期限を決めた時刻 (前日までに決めた期限を守ると XP ボーナス。NULL = この列より前に決めたもの)
ALTER TABLE tasks ADD COLUMN due_set_at INTEGER;

-- 図鑑: 一度でも手に入れた装備の名前 (売ったり合成したりしても残る)
CREATE TABLE IF NOT EXISTS codex (
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, name)
);
INSERT OR IGNORE INTO codex (user_id, name, created_at) SELECT user_id, name, MIN(created_at) FROM items GROUP BY user_id, name;
-- 装備が増えたら (宝箱・ボス・ショップ・レイドなど、どこからでも) 図鑑に載せる
CREATE TRIGGER IF NOT EXISTS codex_on_item AFTER INSERT ON items
BEGIN
  INSERT OR IGNORE INTO codex (user_id, name, created_at) VALUES (NEW.user_id, NEW.name, NEW.created_at);
END;
-- 図鑑のご褒美を受け取った数
ALTER TABLE players ADD COLUMN codex_claimed INTEGER NOT NULL DEFAULT 0;

-- ペットの進化 (★)。行がなければ ★1
CREATE TABLE IF NOT EXISTS pet_levels (
  user_id TEXT NOT NULL,
  pet_id TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, pet_id)
);

-- 週替わりの協力クエストの報酬 (1 週 1 回)
CREATE TABLE IF NOT EXISTS coop_claims (
  user_id TEXT NOT NULL,
  week TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, week)
);
