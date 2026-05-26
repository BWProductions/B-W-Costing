-- ── 0025 — Repair contacts (Takka the repair guy + future expansions) ──────
-- Lightweight contact directory for "who to WhatsApp when X happens".
-- For now: just Takka, who gets all repair notes.
-- Future: can be filtered by brand, vehicle_type, item_category, etc.

CREATE TABLE IF NOT EXISTS repair_contacts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'repair',     -- 'repair' | 'mechanic' | 'panel_beater' | 'electrician'
  phone           TEXT NOT NULL,                       -- E.164 preferred: +27782045663
  whatsapp_phone  TEXT,                                -- optional if different from phone
  notes           TEXT,
  is_primary      INTEGER NOT NULL DEFAULT 0,         -- exactly one row per role should be primary
  active          INTEGER NOT NULL DEFAULT 1,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_repair_contacts_role_primary
  ON repair_contacts(role, is_primary, active);

-- Seed Takka as the primary repair contact
INSERT INTO repair_contacts (name, role, phone, whatsapp_phone, is_primary, active, notes)
SELECT 'Takka', 'repair', '+27782045663', '+27782045663', 1, 1,
       'Primary repair guy — auto-suggested on every Repair Note'
WHERE NOT EXISTS (SELECT 1 FROM repair_contacts WHERE name = 'Takka');

-- Bump schema version
INSERT OR REPLACE INTO system_settings (key, value, updated_at)
VALUES ('schema_version', '25', CURRENT_TIMESTAMP);
