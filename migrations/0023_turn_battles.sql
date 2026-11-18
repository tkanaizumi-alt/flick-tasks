-- ターン制バトル: 乱数の種 (画面には出さない)・始めたときのキャラの強さ・選んだ行動の列。毎回はじめから計算し直す
CREATE TABLE IF NOT EXISTS turn_battles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  stage INTEGER NOT NULL,
  seed INTEGER NOT NULL,
  snapshot TEXT NOT NULL,
  enemy TEXT NOT NULL,
  actions TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_turn_battles_user ON turn_battles(user_id, status);
