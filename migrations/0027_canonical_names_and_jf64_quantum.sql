-- ── 0027 — Canonical name spellings + JF64SDGP description + Petrus dedupe ──
-- Locked-in spellings per founder:
--   Erance       -> Erence
--   Thandi       -> Thandani
--   Tina         -> Thina
--   Tucker       -> Takavaudza     (same person as repair contact 'Takka')
--   Pietrus      -> (delete - dupe of Petrus)
--   Petrus (trailing space) -> Petrus (trimmed)
--   Takka (repair_contacts) -> Takavaudza
-- New person added:
--   Girlie       -> active crew (also office per founder's "crew and office")
-- Vehicle JF64SDGP:
--   description "NEW VEHICLE - JF64SDGP" -> "Toyota Quantum"
--   vehicle_type 'unknown' -> 'lcv' (Light Commercial Vehicle)

-- ─── 1) field_people renames ────────────────────────────────────────────────
UPDATE field_people SET name = 'Erence'     WHERE id = 6  AND name = 'Erance';
UPDATE field_people SET name = 'Thandani'   WHERE id = 4  AND name = 'Thandi';
UPDATE field_people SET name = 'Thina'      WHERE id = 5  AND name = 'Tina';
UPDATE field_people SET name = 'Takavaudza' WHERE id = 13 AND name = 'Tucker';

-- ─── 2) Petrus dedupe ──────────────────────────────────────────────────────
-- Keep id=22 (trim trailing space). Delete id=20 (Pietrus dupe).
-- Safety check above confirmed no calendar_event_crew rows reference id=20.
UPDATE field_people SET name = 'Petrus' WHERE id = 22 AND name = 'Petrus ';
DELETE FROM field_people WHERE id = 20 AND name = 'Pietrus';

-- ─── 3) Add Girlie ─────────────────────────────────────────────────────────
-- Founder said "crew and office". A single crew_type column can't hold both,
-- so we make her crew (so she shows up in event-detail crew picker) AND ALSO
-- flip deliveries_disabled = 1 (since office staff don't go on the SCA).
-- Wait — that contradicts: a "crew member who shouldn't deliver" defeats the
-- purpose. Re-reading the founder's note: he said earlier "I don't deliver
-- on the SCA" about himself (Bibi, office). Girlie being "crew and office"
-- likely means she helps in BOTH worlds — appears in crew picker AND can
-- be prepared_by on field forms. We store her as crew_type='crew' so she
-- appears in the crew picker, with deliveries_disabled=0 (full crew).
-- The hardcoded PEOPLE_DIR will list her as isTeam=true so she shows in
-- the prepared_by dropdown too. Best fit for both worlds.
INSERT INTO field_people (name, crew_type, active, deliveries_disabled)
SELECT 'Girlie', 'crew', 1, 0
WHERE NOT EXISTS (SELECT 1 FROM field_people WHERE LOWER(name) = 'girlie');

-- ─── 4) repair_contacts: Takka -> Takavaudza (keep phone) ──────────────────
UPDATE repair_contacts
   SET name = 'Takavaudza',
       updated_at = CURRENT_TIMESTAMP
 WHERE id = 1 AND name = 'Takka';

-- ─── 5) Historical field_submissions — keep audit trail accurate ───────────
-- Past forms that wrote any of these old names get updated to canonical.
UPDATE field_submissions SET prepared_by = 'Erence'     WHERE prepared_by = 'Erance';
UPDATE field_submissions SET prepared_by = 'Thandani'   WHERE prepared_by = 'Thandi';
UPDATE field_submissions SET prepared_by = 'Thina'      WHERE prepared_by = 'Tina';
UPDATE field_submissions SET prepared_by = 'Takavaudza' WHERE prepared_by IN ('Tucker', 'Takka');
UPDATE field_submissions SET prepared_by = 'Petrus'     WHERE prepared_by IN ('Pietrus', 'Petrus ');

UPDATE field_submissions SET driver = 'Erence'     WHERE driver = 'Erance';
UPDATE field_submissions SET driver = 'Thandani'   WHERE driver = 'Thandi';
UPDATE field_submissions SET driver = 'Thina'      WHERE driver = 'Tina';
UPDATE field_submissions SET driver = 'Takavaudza' WHERE driver IN ('Tucker', 'Takka');
UPDATE field_submissions SET driver = 'Petrus'     WHERE driver IN ('Pietrus', 'Petrus ');

UPDATE field_submissions SET received_by = 'Erence'     WHERE received_by = 'Erance';
UPDATE field_submissions SET received_by = 'Thandani'   WHERE received_by = 'Thandi';
UPDATE field_submissions SET received_by = 'Thina'      WHERE received_by = 'Tina';
UPDATE field_submissions SET received_by = 'Takavaudza' WHERE received_by IN ('Tucker', 'Takka');
UPDATE field_submissions SET received_by = 'Petrus'     WHERE received_by IN ('Pietrus', 'Petrus ');

-- ─── 6) JF64SDGP — fleet description + LCV type ────────────────────────────
-- It's a Toyota Quantum: lives in BOTH music_bus_vehicles (already correct)
-- AND fleet (because it also does the odd delivery). Founder calls this
-- "the exception that breaks the rule" — by design.
UPDATE fleet
   SET description = 'Toyota Quantum',
       vehicle_type = 'lcv',
       updated_at = CURRENT_TIMESTAMP
 WHERE reg_number = 'JF64SDGP'
   AND description = 'NEW VEHICLE - JF64SDGP';

-- Bump schema version
INSERT OR REPLACE INTO system_settings (key, value, updated_at)
VALUES ('schema_version', '27', CURRENT_TIMESTAMP);
