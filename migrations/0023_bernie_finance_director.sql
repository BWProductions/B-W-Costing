-- ── 0023 — Bernie is the Finance Director, not crew ─────────────────────────
-- She should not appear in crew/driver pickers.
-- field_people.id = 16, currently crew_type='crew' → set to 'office'.
-- Also disable deliveries for her (admin/director, not a delivery person).

UPDATE field_people
   SET crew_type = 'office',
       deliveries_disabled = 1
 WHERE id = 16
   AND name = 'Bernie';

-- Bump schema version
INSERT OR REPLACE INTO system_settings (key, value, updated_at)
VALUES ('schema_version', '23', CURRENT_TIMESTAMP);
