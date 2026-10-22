-- 装備枠を 頭 / 胴体 / 靴 / 武器 に (旧: 防具 → 胴体、お守り → 頭)
ALTER TABLE players RENAME COLUMN eq_armor TO eq_body;
ALTER TABLE players RENAME COLUMN eq_charm TO eq_head;
ALTER TABLE players ADD COLUMN eq_feet TEXT;

UPDATE items SET slot = 'body' WHERE slot = 'armor';
UPDATE items SET slot = 'head' WHERE slot = 'charm';
UPDATE items SET name = '鋼の鎧' WHERE name = '鋼の盾';
UPDATE items SET name = '革の帽子' WHERE name = '幸運のお守り';
UPDATE items SET name = '鉄の兜' WHERE name = '四つ葉';
UPDATE items SET name = '騎士の兜' WHERE name = '星のかけら';
UPDATE items SET name = '竜の兜' WHERE name = '女神の涙';
UPDATE items SET name = '王者の冠' WHERE name = '王の冠';
UPDATE items SET icon = slot;

-- 冒険職。職業ごとに XP を持つ
ALTER TABLE players ADD COLUMN job TEXT NOT NULL DEFAULT 'warrior';
CREATE TABLE IF NOT EXISTS player_jobs (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, job_id)
);
-- これまでの XP は初期職業 (戦士) の経験として引き継ぐ
INSERT OR IGNORE INTO player_jobs (user_id, job_id, xp) SELECT user_id, 'warrior', xp FROM players;

-- 完了時にどの職業へ XP を入れたか (取り消し用)
ALTER TABLE tasks ADD COLUMN xp_job TEXT;
-- 付与したゴールド (ボーナスで XP の半分と一致しないため個別に記録)
ALTER TABLE tasks ADD COLUMN gold_awarded INTEGER NOT NULL DEFAULT 0;
UPDATE tasks SET gold_awarded = (xp_awarded + 1) / 2 WHERE xp_awarded > 0;
