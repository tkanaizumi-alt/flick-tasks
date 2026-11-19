-- 装備の強さの見直し (2 回目): UR は上げずに、下のレア度を下げる形にする
--   レア度の倍率: N 1 / R 1.7 / SR 2.85 / SSR 4.8 / UR 8.1 (0024) → N 1 / R 1.55 / SR 2.25 / SSR 3.3 / UR 4.8 (UR は見直し前と同じ)
--   強化 1 段階: +4% → +3% (積み重ね)
-- 強化前の強さ (base_*) をレア度の倍率の比で直し、今の強さ = round(base × 1.03^plus) で計算し直す
UPDATE items SET
  base_atk = CASE WHEN base_atk > 0 THEN MAX(1, CAST(round(base_atk * (CASE rarity WHEN 'R' THEN 1.55 / 1.7 WHEN 'SR' THEN 2.25 / 2.85 WHEN 'SSR' THEN 3.3 / 4.8 WHEN 'UR' THEN 4.8 / 8.1 ELSE 1 END)) AS INTEGER)) ELSE 0 END,
  base_hp = CASE WHEN base_hp > 0 THEN MAX(1, CAST(round(base_hp * (CASE rarity WHEN 'R' THEN 1.55 / 1.7 WHEN 'SR' THEN 2.25 / 2.85 WHEN 'SSR' THEN 3.3 / 4.8 WHEN 'UR' THEN 4.8 / 8.1 ELSE 1 END)) AS INTEGER)) ELSE 0 END,
  base_crit = CASE WHEN base_crit > 0 THEN MAX(1, CAST(round(base_crit * (CASE rarity WHEN 'R' THEN 1.55 / 1.7 WHEN 'SR' THEN 2.25 / 2.85 WHEN 'SSR' THEN 3.3 / 4.8 WHEN 'UR' THEN 4.8 / 8.1 ELSE 1 END)) AS INTEGER)) ELSE 0 END,
  base_heal = CASE WHEN base_heal > 0 THEN MAX(1, CAST(round(base_heal * (CASE rarity WHEN 'R' THEN 1.55 / 1.7 WHEN 'SR' THEN 2.25 / 2.85 WHEN 'SSR' THEN 3.3 / 4.8 WHEN 'UR' THEN 4.8 / 8.1 ELSE 1 END)) AS INTEGER)) ELSE 0 END;

UPDATE items SET
  atk = CASE WHEN base_atk > 0 THEN CAST(round(base_atk * pow(1.03, COALESCE(plus, 0))) AS INTEGER) ELSE 0 END,
  hp = CASE WHEN base_hp > 0 THEN CAST(round(base_hp * pow(1.03, COALESCE(plus, 0))) AS INTEGER) ELSE 0 END,
  crit = CASE WHEN base_crit > 0 THEN CAST(round(base_crit * pow(1.03, COALESCE(plus, 0))) AS INTEGER) ELSE 0 END,
  heal = CASE WHEN base_heal > 0 THEN CAST(round(base_heal * pow(1.03, COALESCE(plus, 0))) AS INTEGER) ELSE 0 END;
