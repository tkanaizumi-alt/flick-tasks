-- 本人が調整した作業量 (AI の判定から 1 段階まで)。NULL なら AI の判定 (weight) を使う
ALTER TABLE tasks ADD COLUMN weight_user TEXT;
