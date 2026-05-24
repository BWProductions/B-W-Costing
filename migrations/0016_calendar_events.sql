-- migration 0016: operational calendar events
-- Separate from the quoting `events` table — this is the warehouse / dispatch view.
-- Lifecycle: booking → preloaded → delivered (simple 3-stage)
-- Substage: load / leave / setup / event / strike / collect (detail inside cards)

CREATE TABLE IF NOT EXISTS calendar_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  event_date      TEXT NOT NULL,                         -- YYYY-MM-DD
  event_name      TEXT NOT NULL,
  address         TEXT,
  time_text       TEXT,                                  -- free text like "10:00 - 2pm"
  team_text       TEXT,                                  -- raw team string from sheet (hybrid: kept as-is)
  vehicle_text    TEXT,                                  -- raw vehicle string from sheet (hybrid: kept as-is)
  brand           TEXT,                                  -- detected brand keyword (Castle / Stella / MXD ...)
  region          TEXT,                                  -- detected region (Polokwane / Gauteng ...)
  client_id       INTEGER REFERENCES clients(id),        -- optional match against clients table
  status          TEXT NOT NULL DEFAULT 'booking'
                  CHECK(status IN ('booking','preloaded','delivered','cancelled')),
  substage        TEXT
                  CHECK(substage IS NULL OR substage IN ('load','leave','setup','event','strike','collect')),
  notes           TEXT,
  source          TEXT NOT NULL DEFAULT 'manual'
                  CHECK(source IN ('manual','import_passed','import_current','quote_event')),
  source_ref      TEXT,                                  -- row number from sheet or quote event id, for traceability
  created_by      INTEGER REFERENCES users(id),
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cal_events_date    ON calendar_events(event_date);
CREATE INDEX IF NOT EXISTS idx_cal_events_status  ON calendar_events(status);
CREATE INDEX IF NOT EXISTS idx_cal_events_client  ON calendar_events(client_id);
CREATE INDEX IF NOT EXISTS idx_cal_events_brand   ON calendar_events(brand);
CREATE INDEX IF NOT EXISTS idx_cal_events_region  ON calendar_events(region);


-- Hybrid (C): join tables for resolved crew & vehicles
-- The raw string remains on calendar_events.team_text / vehicle_text for display.
-- These tables hold the matched references so we can filter "all of Sipho's events"
-- or "where is Snowy this week".

CREATE TABLE IF NOT EXISTS calendar_event_crew (
  event_id     INTEGER NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  person_id    INTEGER NOT NULL REFERENCES field_people(id),
  matched_from TEXT,           -- the raw token we matched (e.g. "tandanani" → field_people "Thandanani")
  PRIMARY KEY (event_id, person_id)
);

CREATE INDEX IF NOT EXISTS idx_cal_crew_event  ON calendar_event_crew(event_id);
CREATE INDEX IF NOT EXISTS idx_cal_crew_person ON calendar_event_crew(person_id);


CREATE TABLE IF NOT EXISTS calendar_event_vehicles (
  event_id     INTEGER NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  fleet_id     INTEGER NOT NULL REFERENCES fleet(id),
  matched_from TEXT,           -- the raw token we matched (e.g. "snowy" → fleet "Snowy")
  PRIMARY KEY (event_id, fleet_id)
);

CREATE INDEX IF NOT EXISTS idx_cal_veh_event  ON calendar_event_vehicles(event_id);
CREATE INDEX IF NOT EXISTS idx_cal_veh_fleet  ON calendar_event_vehicles(fleet_id);
