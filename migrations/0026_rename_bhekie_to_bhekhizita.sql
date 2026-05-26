-- ── 0026 — Rename "Beki"/"Bhekie"/"Bheki" → "Bhekhizita" everywhere ─────────
-- One person, three spellings across three tables and historical records.
-- Canonical full name: Bhekhizita

-- 1) field_people: rename the live row (id=21). Table has no updated_at column.
UPDATE field_people
   SET name = 'Bhekhizita'
 WHERE id = 21
   AND name IN ('Bhekie', 'Beki', 'Bheki');

-- 2) music_bus_drivers: rename the live row (id=23)
UPDATE music_bus_drivers
   SET name = 'Bhekhizita',
       updated_at = CURRENT_TIMESTAMP
 WHERE id = 23
   AND name IN ('Bheki', 'Beki', 'Bhekie', 'Joshua/Bheki');

-- 3) Historical field_submissions — keep driver/preparedby/receivedby accurate
UPDATE field_submissions SET driver       = 'Bhekhizita' WHERE driver       IN ('Beki', 'Bhekie', 'Bheki');
UPDATE field_submissions SET prepared_by  = 'Bhekhizita' WHERE prepared_by  IN ('Beki', 'Bhekie', 'Bheki');
UPDATE field_submissions SET received_by  = 'Bhekhizita' WHERE received_by  IN ('Beki', 'Bhekie', 'Bheki');

-- Bump schema version
INSERT OR REPLACE INTO system_settings (key, value, updated_at)
VALUES ('schema_version', '26', CURRENT_TIMESTAMP);
