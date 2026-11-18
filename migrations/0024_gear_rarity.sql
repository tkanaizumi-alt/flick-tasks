-- 装備の強さをレア度中心に見直す (下のレア度の +10 より、上のレア度の +0 が強くなるように)
--   強化 1 段階: +10% (積み重ね) → +4% (積み重ね)
--   レア度の倍率: N 1 / R 1.6 / SR 2.4 / SSR 3.5 / UR 4.8 → N 1 / R 1.7 / SR 2.85 / SSR 4.8 / UR 8.1
-- 強化する前の強さ (base_*) を持つようにして、今の強さ = round(base × 1.04^plus) で計算し直す
ALTER TABLE items ADD COLUMN base_atk INTEGER NOT NULL DEFAULT 0;
ALTER TABLE items ADD COLUMN base_hp INTEGER NOT NULL DEFAULT 0;
ALTER TABLE items ADD COLUMN base_crit INTEGER NOT NULL DEFAULT 0;
ALTER TABLE items ADD COLUMN base_heal INTEGER NOT NULL DEFAULT 0;

-- 今の強さから強化前の強さを戻し、新しいレア度の倍率をかける (付いていないステータスは 0 のまま)
UPDATE items SET
  base_atk = CASE WHEN atk > 0 THEN MAX(1, CAST(round(atk / pow(1.1, COALESCE(plus, 0)) * (CASE rarity WHEN 'R' THEN 1.7 / 1.6 WHEN 'SR' THEN 2.85 / 2.4 WHEN 'SSR' THEN 4.8 / 3.5 WHEN 'UR' THEN 8.1 / 4.8 ELSE 1 END)) AS INTEGER)) ELSE 0 END,
  base_hp = CASE WHEN hp > 0 THEN MAX(1, CAST(round(hp / pow(1.1, COALESCE(plus, 0)) * (CASE rarity WHEN 'R' THEN 1.7 / 1.6 WHEN 'SR' THEN 2.85 / 2.4 WHEN 'SSR' THEN 4.8 / 3.5 WHEN 'UR' THEN 8.1 / 4.8 ELSE 1 END)) AS INTEGER)) ELSE 0 END,
  base_crit = CASE WHEN crit > 0 THEN MAX(1, CAST(round(crit / pow(1.1, COALESCE(plus, 0)) * (CASE rarity WHEN 'R' THEN 1.7 / 1.6 WHEN 'SR' THEN 2.85 / 2.4 WHEN 'SSR' THEN 4.8 / 3.5 WHEN 'UR' THEN 8.1 / 4.8 ELSE 1 END)) AS INTEGER)) ELSE 0 END,
  base_heal = CASE WHEN heal > 0 THEN MAX(1, CAST(round(heal / pow(1.1, COALESCE(plus, 0)) * (CASE rarity WHEN 'R' THEN 1.7 / 1.6 WHEN 'SR' THEN 2.85 / 2.4 WHEN 'SSR' THEN 4.8 / 3.5 WHEN 'UR' THEN 8.1 / 4.8 ELSE 1 END)) AS INTEGER)) ELSE 0 END;

-- 新しい強化の伸び (+4%) で今の強さを計算し直す
UPDATE items SET
  atk = CASE WHEN base_atk > 0 THEN CAST(round(base_atk * pow(1.04, COALESCE(plus, 0))) AS INTEGER) ELSE 0 END,
  hp = CASE WHEN base_hp > 0 THEN CAST(round(base_hp * pow(1.04, COALESCE(plus, 0))) AS INTEGER) ELSE 0 END,
  crit = CASE WHEN base_crit > 0 THEN CAST(round(base_crit * pow(1.04, COALESCE(plus, 0))) AS INTEGER) ELSE 0 END,
  heal = CASE WHEN base_heal > 0 THEN CAST(round(base_heal * pow(1.04, COALESCE(plus, 0))) AS INTEGER) ELSE 0 END;
