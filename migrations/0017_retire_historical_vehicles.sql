-- migration 0017: backfill retired historical vehicles
-- These names appeared frequently in pre-2024 schedules but are no longer in service.
-- Adding them with status='retired' so manual back-entry of historical events
-- can still link cleanly against the fleet table.
-- Uses placeholder RETIRED-* reg numbers where the original reg is unknown.

INSERT OR IGNORE INTO fleet (reg_number, description, model, vehicle_type, status, active, notes)
VALUES
  ('RETIRED-HD72',    'HYUNDAI HD72 TRUCK',          'Hyundai HD72',     'truck',  'retired', 0, 'Historical fleet (pre-2024)'),
  ('RETIRED-QUANTUM', 'TOYOTA QUANTUM',              'Toyota Quantum',   'van',    'retired', 0, 'Historical fleet (pre-2024)'),
  ('RETIRED-H100',    'HYUNDAI H100 BAKKIE',         'Hyundai H100',     'bakkie', 'retired', 0, 'Historical fleet (pre-2024)'),
  ('RETIRED-BOXER',   'MAHINDRA BOXER',              'Mahindra Boxer',   'bakkie', 'retired', 0, 'Historical fleet (pre-2024)'),
  ('RETIRED-CARRA',   'CARRA CARRA BAKKIE',          'Nissan Carra',     'bakkie', 'retired', 0, 'Historical fleet (pre-2024)'),
  ('RETIRED-PEUGEOT', 'PEUGEOT VAN',                 'Peugeot',          'van',    'retired', 0, 'Historical fleet (pre-2024)'),
  ('RETIRED-ATEGO',   'MERCEDES ATEGO',              'Mercedes Atego',   'truck',  'retired', 0, 'Historical fleet (pre-2024)'),
  ('RETIRED-DYNA',    'TOYOTA DYNA',                 'Toyota Dyna',      'truck',  'retired', 0, 'Historical fleet (pre-2024) — replaced due to GVM'),
  ('RETIRED-TRAILER', 'BAKKIE TRAILER',              'Trailer',          'trailer','retired', 0, 'Historical fleet (pre-2024)');
