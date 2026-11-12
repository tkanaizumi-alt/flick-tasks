-- SP のタネで増えた SP と、ショップで最後にタネを買った週 (1 週間に 1 個まで)
ALTER TABLE players ADD COLUMN bonus_sp INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN seed_week TEXT;
