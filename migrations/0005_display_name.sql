-- 管理者が付けた表示名。Google の名前 (ログインのたびに更新される) より優先して表示する
ALTER TABLE users ADD COLUMN display_name TEXT;
