-- ── 0024 — Add JF64SDGP vehicle + add Bhekie to crew ────────────────────────

-- 1) Add new vehicle: JF 64 SD GP
--    Stored without spaces to match existing fleet format (FC89PNGP, CB55PVGP, etc.)
INSERT INTO fleet (reg_number, description, vehicle_type, active, experiential, status, created_at, updated_at)
SELECT 'JF64SDGP', 'NEW VEHICLE - JF64SDGP', 'unknown', 1, 0, 'available', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM fleet WHERE reg_number = 'JF64SDGP');

-- 2) Add Bhekie to field_people as active crew
--    (No existing 'Beki' row found in DB — this is a fresh add.)
INSERT INTO field_people (name, crew_type, active, deliveries_disabled)
SELECT 'Bhekie', 'crew', 1, 0
WHERE NOT EXISTS (SELECT 1 FROM field_people WHERE LOWER(name) IN ('bhekie','beki','bheki'));

-- Bump schema version
INSERT OR REPLACE INTO system_settings (key, value, updated_at)
VALUES ('schema_version', '24', CURRENT_TIMESTAMP);
