-- Authoritative fleet update from FLEET_FULL_FINAL with reg and size and R Final V4 Use.xlsx
-- Source of truth provided by Bibi on 2026-05-06
-- 15 vehicles, matched by reg_number (UNIQUE)

-- 1. BIBI CAR
UPDATE fleet SET
  description='BIBI CAR', model='HYUNDAI CRETA',
  box_length_m=4.26, box_width_m=1.83, box_height_m=1.63,
  box_volume_m3=ROUND(4.26*1.83*1.63, 2),
  tonnage=1, vehicle_type='bakkie',
  daily_hire_rate=1500, fuel_rate_per_km=24.00,
  colour='BLUE', notes='BLUE',
  active=1, updated_at=CURRENT_TIMESTAMP
WHERE reg_number='FD38HVGP';

-- 2. ISUZU BAKKIE – SIPHO CAR
UPDATE fleet SET
  description='ISUZU BAKKIE - SIPHO CAR', model='ISUZU D-MAX RZ4EE5T475',
  box_length_m=5.1, box_width_m=1.74, box_height_m=1.8,
  box_volume_m3=ROUND(5.1*1.74*1.8, 2),
  tonnage=1, vehicle_type='bakkie',
  daily_hire_rate=1500, fuel_rate_per_km=24.00,
  colour='WHITE', notes='WHITE',
  active=1, updated_at=CURRENT_TIMESTAMP
WHERE reg_number='LZ56SSGP';

-- 3. ISUZU BAKKIE NO 1
INSERT INTO fleet (reg_number, description, model, box_length_m, box_width_m, box_height_m, box_volume_m3, tonnage, vehicle_type, daily_hire_rate, fuel_rate_per_km, colour, notes, active)
VALUES ('MB10JLGP', 'ISUZU BAKKIE NO 1', 'ISUZU D-MAX 4JA1HP5318', 5.2, 1.8, 2.4, ROUND(5.2*1.8*2.4,2), 1, 'bakkie', 1500, 24.00, 'WHITE', 'WHITE', 1)
ON CONFLICT(reg_number) DO UPDATE SET
  description=excluded.description, model=excluded.model,
  box_length_m=excluded.box_length_m, box_width_m=excluded.box_width_m, box_height_m=excluded.box_height_m,
  box_volume_m3=excluded.box_volume_m3, tonnage=excluded.tonnage, vehicle_type=excluded.vehicle_type,
  daily_hire_rate=excluded.daily_hire_rate, fuel_rate_per_km=excluded.fuel_rate_per_km,
  colour=excluded.colour, notes=excluded.notes, active=1, updated_at=CURRENT_TIMESTAMP;

-- 4. ISUZU BAKKIE NO 2
INSERT INTO fleet (reg_number, description, model, box_length_m, box_width_m, box_height_m, box_volume_m3, tonnage, vehicle_type, daily_hire_rate, fuel_rate_per_km, colour, notes, active)
VALUES ('MB59SBGP', 'ISUZU BAKKIE NO 2', 'ISUZU D-MAX 4JA1HP5957', 5.2, 1.8, 2.4, ROUND(5.2*1.8*2.4,2), 1, 'bakkie', 1500, 24.00, 'WHITE', 'WHITE', 1)
ON CONFLICT(reg_number) DO UPDATE SET
  description=excluded.description, model=excluded.model,
  box_length_m=excluded.box_length_m, box_width_m=excluded.box_width_m, box_height_m=excluded.box_height_m,
  box_volume_m3=excluded.box_volume_m3, tonnage=excluded.tonnage, vehicle_type=excluded.vehicle_type,
  daily_hire_rate=excluded.daily_hire_rate, fuel_rate_per_km=excluded.fuel_rate_per_km,
  colour=excluded.colour, notes=excluded.notes, active=1, updated_at=CURRENT_TIMESTAMP;

-- 5. HINO TRUCK NO 6 – SNOWY
UPDATE fleet SET
  description='HINO TRUCK NO 6 - SNOWY', model='HINO 300',
  box_length_m=6.7, box_width_m=2.45, box_height_m=3.37,
  box_volume_m3=ROUND(6.7*2.45*3.37, 2),
  tonnage=4, vehicle_type='4t',
  daily_hire_rate=3500, fuel_rate_per_km=27.00,
  colour='BLACK', notes='BLACK',
  active=1, updated_at=CURRENT_TIMESTAMP
WHERE reg_number='CZ41WWGP';

-- 6. HYUNDAI BLACK TRUCK NO 8
UPDATE fleet SET
  description='HYUNDAI BLACK TRUCK NO 8', model='HYUNDAI HD72 D4BB475588',
  box_length_m=4.92, box_width_m=2.30, box_height_m=2.30,
  box_volume_m3=ROUND(4.92*2.30*2.30, 2),
  tonnage=4, vehicle_type='4t',
  daily_hire_rate=3500, fuel_rate_per_km=27.00,
  colour='BLACK', notes='BLACK',
  active=1, updated_at=CURRENT_TIMESTAMP
WHERE reg_number='BW63NNGP';

-- 7. BLACK TATA NO 7
UPDATE fleet SET
  description='BLACK TATA NO 7', model='TATA LPT 809 EX EURO 2 PY 8708366',
  box_length_m=5.04, box_width_m=2.21, box_height_m=3.15,
  box_volume_m3=ROUND(5.04*2.21*3.15, 2),
  tonnage=4, vehicle_type='4t',
  daily_hire_rate=3500, fuel_rate_per_km=27.00,
  colour='BLACK', notes='BLACK',
  active=1, updated_at=CURRENT_TIMESTAMP
WHERE reg_number='CB55PVGP';

-- 8. BLACK TATA NO 9
UPDATE fleet SET
  description='BLACK TATA NO 9', model='TATA LPT 809EX EURO 2 8603',
  box_length_m=5.08, box_width_m=2.22, box_height_m=3.14,
  box_volume_m3=ROUND(5.08*2.22*3.14, 2),
  tonnage=4, vehicle_type='4t',
  daily_hire_rate=3500, fuel_rate_per_km=27.00,
  colour='BLACK', notes='BLACK',
  active=1, updated_at=CURRENT_TIMESTAMP
WHERE reg_number='CB55PRGP';

-- 9. VE TRUCK NO 10
UPDATE fleet SET
  description='VE TRUCK NO 10', model='HINO TK-AHO-EF948P',
  box_length_m=5.5, box_width_m=2.2, box_height_m=2.88,
  box_volume_m3=ROUND(5.5*2.2*2.88, 2),
  tonnage=4, vehicle_type='4t',
  daily_hire_rate=3500, fuel_rate_per_km=27.00,
  colour='BLACK', notes='BLACK - VE',
  active=1, updated_at=CURRENT_TIMESTAMP
WHERE reg_number='DM29KPGP';

-- 10. NEW BLACK TRUCK
UPDATE fleet SET
  description='NEW BLACK TRUCK', model='TOYOTA DYNA XZU420R',
  box_length_m=6.2, box_width_m=2.44, box_height_m=3.02,
  box_volume_m3=ROUND(6.2*2.44*3.02, 2),
  tonnage=4, vehicle_type='4t',
  daily_hire_rate=3500, fuel_rate_per_km=27.00,
  colour='BLACK', notes='BLACK',
  active=1, updated_at=CURRENT_TIMESTAMP
WHERE reg_number='VJC119GP';

-- 11. SMALL FAW TRUCK NO 5 (8 TON)
INSERT INTO fleet (reg_number, description, model, box_length_m, box_width_m, box_height_m, box_volume_m3, tonnage, vehicle_type, daily_hire_rate, fuel_rate_per_km, colour, notes, active)
VALUES ('MB39CRGP', 'SMALL FAW TRUCK NO 5', 'FAW 2024 JK6 1522FL', 7.2, 2.6, 2.8, ROUND(7.2*2.6*2.8,2), 8, '8t', 4500, 30.00, 'WHITE', 'WHITE', 1)
ON CONFLICT(reg_number) DO UPDATE SET
  description=excluded.description, model=excluded.model,
  box_length_m=excluded.box_length_m, box_width_m=excluded.box_width_m, box_height_m=excluded.box_height_m,
  box_volume_m3=excluded.box_volume_m3, tonnage=excluded.tonnage, vehicle_type=excluded.vehicle_type,
  daily_hire_rate=excluded.daily_hire_rate, fuel_rate_per_km=excluded.fuel_rate_per_km,
  colour=excluded.colour, notes=excluded.notes, active=1, updated_at=CURRENT_TIMESTAMP;

-- 12. MAN TRUCK – CASTLE LAGER (10 TON)
UPDATE fleet SET
  description='MAN TRUCK - CASTLE LAGER', model='MAN CLA 15.220BB',
  box_length_m=6.10, box_width_m=2.5, box_height_m=2.95,
  box_volume_m3=ROUND(6.10*2.5*2.95, 2),
  tonnage=10, vehicle_type='10t',
  daily_hire_rate=5500, fuel_rate_per_km=35.00,
  colour='RED', notes='RED CASTLE LAGER TRUCK',
  active=1, updated_at=CURRENT_TIMESTAMP
WHERE reg_number='FC89PNGP';

-- 13. MERCEDES NO 12 (14 TON)
UPDATE fleet SET
  description='MERCEDES NO 12', model='MERCEDES-BENZ AXOR 3258463',
  box_length_m=9.20, box_width_m=2.54, box_height_m=4.11,
  box_volume_m3=ROUND(9.20*2.54*4.11, 2),
  tonnage=14, vehicle_type='other',
  daily_hire_rate=5500, fuel_rate_per_km=35.00,
  colour='WHITE', notes='WHITE',
  active=1, updated_at=CURRENT_TIMESTAMP
WHERE reg_number='FG51RGGP';

-- 14. MERCEDES NO 13 (14 TON)
UPDATE fleet SET
  description='MERCEDES NO 13', model='MERCEDES-BENZ AXOR 2463409',
  box_length_m=9.20, box_width_m=2.55, box_height_m=4.10,
  box_volume_m3=ROUND(9.20*2.55*4.10, 2),
  tonnage=14, vehicle_type='other',
  daily_hire_rate=5500, fuel_rate_per_km=35.00,
  colour='WHITE', notes='WHITE',
  active=1, updated_at=CURRENT_TIMESTAMP
WHERE reg_number='DG59PSGP';

-- 15. BIG FAW TRUCK NO 4 (14 TON)
UPDATE fleet SET
  description='BIG FAW TRUCK NO 4', model='FAW CA SERIES JK 8 CA15.220FL',
  box_length_m=9.04, box_width_m=2.46, box_height_m=3.98,
  box_volume_m3=ROUND(9.04*2.46*3.98, 2),
  tonnage=14, vehicle_type='other',
  daily_hire_rate=5500, fuel_rate_per_km=35.00,
  colour='WHITE', notes='WHITE',
  active=1, updated_at=CURRENT_TIMESTAMP
WHERE reg_number='LS43NLGP';

-- Retire any vehicle in fleet whose reg_number is NOT in the authoritative list
UPDATE fleet SET active=0, status='retired', updated_at=CURRENT_TIMESTAMP
WHERE reg_number NOT IN (
  'FD38HVGP','LZ56SSGP','MB10JLGP','MB59SBGP','CZ41WWGP','BW63NNGP',
  'CB55PVGP','CB55PRGP','DM29KPGP','VJC119GP','MB39CRGP','FC89PNGP',
  'FG51RGGP','DG59PSGP','LS43NLGP'
);

-- Sync field_vehicles (used by field-ops auto-suggest dropdowns)
INSERT INTO field_vehicles (reg_number, description, active) VALUES
  ('FD38HVGP', 'BIBI CAR (Hyundai Creta)', 1),
  ('LZ56SSGP', 'ISUZU BAKKIE - SIPHO CAR', 1),
  ('MB10JLGP', 'ISUZU BAKKIE NO 1', 1),
  ('MB59SBGP', 'ISUZU BAKKIE NO 2', 1),
  ('CZ41WWGP', 'HINO TRUCK NO 6 - SNOWY (4T)', 1),
  ('BW63NNGP', 'HYUNDAI BLACK TRUCK NO 8 (4T)', 1),
  ('CB55PVGP', 'BLACK TATA NO 7 (4T)', 1),
  ('CB55PRGP', 'BLACK TATA NO 9 (4T)', 1),
  ('DM29KPGP', 'VE TRUCK NO 10 (4T)', 1),
  ('VJC119GP', 'NEW BLACK TRUCK (4T)', 1),
  ('MB39CRGP', 'SMALL FAW TRUCK NO 5 (8T)', 1),
  ('FC89PNGP', 'MAN TRUCK - CASTLE LAGER (10T)', 1),
  ('FG51RGGP', 'MERCEDES NO 12 (14T)', 1),
  ('DG59PSGP', 'MERCEDES NO 13 (14T)', 1),
  ('LS43NLGP', 'BIG FAW TRUCK NO 4 (14T)', 1)
ON CONFLICT(reg_number) DO UPDATE SET
  description=excluded.description, active=1;

-- Deactivate any field_vehicles not in the authoritative list
UPDATE field_vehicles SET active=0
WHERE reg_number NOT IN (
  'FD38HVGP','LZ56SSGP','MB10JLGP','MB59SBGP','CZ41WWGP','BW63NNGP',
  'CB55PVGP','CB55PRGP','DM29KPGP','VJC119GP','MB39CRGP','FC89PNGP',
  'FG51RGGP','DG59PSGP','LS43NLGP'
);
