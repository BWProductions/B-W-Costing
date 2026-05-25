-- ─────────────────────────────────────────────────────────────────────────
-- Migration 0022 — Event Operations + Stock Foundation
--
-- Builds the rails for:
--   1. Real crew + vehicle assignment on calendar events (replaces team_text/vehicle_text)
--   2. Proper event timeline (setup / event / strike / collection)
--   3. Equipment list on events (free-type now, stock-linked once 0023 imports)
--   4. Stock master tables (items + aliases + movements) — ready for Excel import
--   5. Double-booking override audit trail
--
-- Backwards compatible: existing team_text / vehicle_text columns stay as
-- read-only historical fields. New join tables are the source of truth.
-- ─────────────────────────────────────────────────────────────────────────

-- ── 1) field_people: classify crew vs office, flag SCA-no-delivery ─────────
ALTER TABLE field_people ADD COLUMN crew_type TEXT NOT NULL DEFAULT 'crew';
-- crew_type values: 'crew' | 'driver' | 'office' | 'inactive'

ALTER TABLE field_people ADD COLUMN deliveries_disabled INTEGER NOT NULL DEFAULT 0;
-- When 1, person is hidden from the SCA / delivery-crew picker by default.
-- Bibi: deliveries_disabled = 1 (won't show in driver/delivery dropdowns).

-- Seed crew_type for existing 19 rows.
-- Office = Bibi, Marna, Jocelyn, Shane (Shane' / Sinead)
-- Everyone else = crew (you can promote individuals to 'driver' later via admin UI)
UPDATE field_people SET crew_type = 'office'   WHERE id IN (1, 2, 17, 18);  -- Shane, Bibi, Marna, Jocelyn
UPDATE field_people SET crew_type = 'inactive' WHERE active = 0;            -- Orthana Nanny
UPDATE field_people SET deliveries_disabled = 1 WHERE id = 2;               -- Bibi: no SCA deliveries

-- ── 2) calendar_events: proper timeline columns ────────────────────────────
ALTER TABLE calendar_events ADD COLUMN setup_time        TEXT;  -- 'HH:MM' or NULL
ALTER TABLE calendar_events ADD COLUMN event_start       TEXT;
ALTER TABLE calendar_events ADD COLUMN event_end         TEXT;
ALTER TABLE calendar_events ADD COLUMN strike_time       TEXT;
ALTER TABLE calendar_events ADD COLUMN collection_time   TEXT;
-- Stored as text 'HH:MM' for simplicity. Date comes from event_date column already.

-- ── 3) calendar_event_crew: ensure clean FK + override flag ────────────────
-- Table already exists from a prior migration but never used. Reshape if needed.
-- We'll DROP and recreate to be sure of the schema (it's empty: COUNT=0 confirmed).
DROP TABLE IF EXISTS calendar_event_crew;
CREATE TABLE calendar_event_crew (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id        INTEGER NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  person_id       INTEGER NOT NULL REFERENCES field_people(id),
  role            TEXT,                                 -- 'lead' | 'crew' | 'driver' | NULL
  override_reason TEXT,                                 -- non-null = founder overrode double-booking
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by      INTEGER REFERENCES users(id),
  UNIQUE (event_id, person_id)
);
CREATE INDEX idx_cec_event  ON calendar_event_crew(event_id);
CREATE INDEX idx_cec_person ON calendar_event_crew(person_id);

-- ── 4) calendar_event_vehicles: same treatment ─────────────────────────────
DROP TABLE IF EXISTS calendar_event_vehicles;
CREATE TABLE calendar_event_vehicles (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id        INTEGER NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  fleet_id        INTEGER NOT NULL REFERENCES fleet(id),
  role            TEXT,                                 -- 'primary' | 'support' | NULL
  override_reason TEXT,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by      INTEGER REFERENCES users(id),
  UNIQUE (event_id, fleet_id)
);
CREATE INDEX idx_cev_event ON calendar_event_vehicles(event_id);
CREATE INDEX idx_cev_fleet ON calendar_event_vehicles(fleet_id);

-- ── 5) calendar_event_equipment: free-type now, stock-linked later ─────────
CREATE TABLE IF NOT EXISTS calendar_event_equipment (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id        INTEGER NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  stock_item_id   INTEGER REFERENCES stock_items(id),   -- NULL = free-typed, not yet linked
  description     TEXT NOT NULL,                        -- always populated (mirrors stock_items.description when linked)
  quantity        REAL NOT NULL DEFAULT 1,
  notes           TEXT,
  override_reason TEXT,                                 -- non-null = founder overrode stock shortage
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by      INTEGER REFERENCES users(id)
);
CREATE INDEX idx_cee_event ON calendar_event_equipment(event_id);
CREATE INDEX idx_cee_stock ON calendar_event_equipment(stock_item_id);

-- ── 6) STOCK MASTER ────────────────────────────────────────────────────────
-- One row per distinct piece of equipment B&W owns.
-- Imported from the brand Excel sheets (Castle Lager, MXD, Stella, etc.).
CREATE TABLE IF NOT EXISTS stock_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  brand           TEXT NOT NULL,                        -- 'Castle Lager', 'MXD', 'Stella', etc.
  description     TEXT NOT NULL,                        -- 'Complete umbrellas - New'
  qty_on_hand     INTEGER NOT NULL DEFAULT 0,           -- current physical count (gospel)
  location        TEXT,                                 -- 'BW Warehouse', 'R59 Storage B50', etc.
  notes           TEXT,                                 -- preserved from Excel notes column
  source_sheet    TEXT,                                 -- e.g. 'Castle_Lager.xlsx' for traceability
  source_row      INTEGER,                              -- original row number in the Excel
  status          TEXT NOT NULL DEFAULT 'active',       -- 'active' | 'review' | 'retired'
  -- 'review' = imported but needs human eyeballing (no qty, ambiguous, duplicate suspect)
  active          INTEGER NOT NULL DEFAULT 1,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_stock_brand     ON stock_items(brand);
CREATE INDEX idx_stock_status    ON stock_items(status);
CREATE INDEX idx_stock_brand_desc ON stock_items(brand, description);

-- ── 7) STOCK ALIASES ───────────────────────────────────────────────────────
-- Maps free-typed delivery-note descriptions to canonical stock items.
-- e.g. 'castle larger umbrellas' → stock_items.id for 'Castle Lager / Complete umbrellas'
CREATE TABLE IF NOT EXISTS stock_aliases (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  alias_text      TEXT NOT NULL,                        -- the messy version
  stock_item_id   INTEGER NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
  source          TEXT,                                 -- 'import' | 'manual' | 'suggested'
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by      INTEGER REFERENCES users(id),
  UNIQUE (alias_text)
);
CREATE INDEX idx_alias_stock ON stock_aliases(stock_item_id);

-- ── 8) STOCK MOVEMENTS ─────────────────────────────────────────────────────
-- Append-only ledger of every stock change. Source of truth for "where is gear right now".
CREATE TABLE IF NOT EXISTS stock_movements (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  stock_item_id   INTEGER NOT NULL REFERENCES stock_items(id),
  movement_type   TEXT NOT NULL,                        -- 'import' | 'booking' | 'return' | 'damage' | 'theft' | 'adjustment' | 'restock'
  quantity_delta  REAL NOT NULL,                        -- +5 = added, -3 = removed
  event_id        INTEGER REFERENCES calendar_events(id),
  notes           TEXT,
  performed_by    INTEGER REFERENCES users(id),
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_mvt_stock ON stock_movements(stock_item_id);
CREATE INDEX idx_mvt_event ON stock_movements(event_id);
CREATE INDEX idx_mvt_type  ON stock_movements(movement_type);

-- ── 9) STOCK IMPORT BATCHES ────────────────────────────────────────────────
-- Audit trail of every Excel import. Roll-back-able if we need to.
CREATE TABLE IF NOT EXISTS stock_import_batches (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  filename        TEXT NOT NULL,
  brand_hint      TEXT,
  rows_imported   INTEGER NOT NULL DEFAULT 0,
  rows_to_review  INTEGER NOT NULL DEFAULT 0,
  rows_skipped    INTEGER NOT NULL DEFAULT 0,
  imported_by     INTEGER REFERENCES users(id),
  raw_payload     TEXT,                                 -- the parsed JSON of what was imported (for rollback)
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── 10) STOCK SHORTAGES / OVERRIDES — for "we forced a booking" tracking ──
-- (Lives in audit_log too, but this gives ops a quick "what's outstanding" view.)
CREATE TABLE IF NOT EXISTS stock_shortages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  stock_item_id   INTEGER NOT NULL REFERENCES stock_items(id),
  event_id        INTEGER NOT NULL REFERENCES calendar_events(id),
  quantity_short  REAL NOT NULL,
  resolution      TEXT,                                 -- 'sub-rental' | 'fix-by-event' | 'override' | NULL pending
  resolved_at     DATETIME,
  resolved_by     INTEGER REFERENCES users(id),
  notes           TEXT,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_shortage_status ON stock_shortages(resolution);
CREATE INDEX idx_shortage_event  ON stock_shortages(event_id);

-- ── 11) Mark migration applied ─────────────────────────────────────────────
INSERT OR REPLACE INTO system_settings (key, value, updated_at)
  VALUES ('schema_version', '22', CURRENT_TIMESTAMP);
