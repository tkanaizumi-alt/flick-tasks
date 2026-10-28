-- メンバーと腕試し (練習試合) の記録。成績の表示用
CREATE TABLE IF NOT EXISTS spars (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  opponent_id TEXT NOT NULL,
  win INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS spars_user ON spars (user_id, created_at);
-- 季節イベントの限定ボスへの挑戦 (1 日 3 回まで、勝ったらその日は終わり)
CREATE TABLE IF NOT EXISTS event_battles (
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  event TEXT NOT NULL,
  tries INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
