-- ─────────────────────────────────────────────────────────────────────────
-- Batch B+C+D migration: Phases 12, 14, 17, 16
--   Phase 12 — Per-Event Cost Rollup (event_cost_overrides + crew/vehicle rates)
--   Phase 14 — Quote ↔ Event handshake (link columns)
--   Phase 17 — Brand owner digest subscriptions
--   Phase 16 — Login history (audit log already exists)
-- ─────────────────────────────────────────────────────────────────────────
-- Phase 15 needs no schema changes (reuses Phase 7 tables).
-- Phase 13 (client-facing brand pages) gets share_tokens here too.

-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 12 — Per-event cost overrides
-- ═══════════════════════════════════════════════════════════════════════════
-- Optional finance adjustments per event (e.g. "we ate the petrol on this one").
-- All other costs come from existing tables via JOINs (no schema needed).
CREATE TABLE IF NOT EXISTS event_cost_overrides (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id        INTEGER NOT NULL UNIQUE,             -- → calendar_events(id)
  cost_stock      REAL,                                 -- override for stock cost (NULL = auto)
  cost_fleet      REAL,                                 -- override for fleet cost
  cost_crew       REAL,                                 -- override for crew cost
  cost_other      REAL DEFAULT 0,                       -- misc / disbursements
  revenue_override REAL,                                -- if quote isn't linked, set revenue manually
  notes           TEXT,
  updated_by      INTEGER,
  updated_by_name TEXT,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_eco_event ON event_cost_overrides(event_id);

-- Default unit rates for crew & fleet (single-row config table).
-- Per-event overrides can come from calendar_event_crew.role/notes later.
CREATE TABLE IF NOT EXISTS cost_defaults (
  id                   INTEGER PRIMARY KEY CHECK (id = 1),
  crew_hourly_rate     REAL NOT NULL DEFAULT 250,       -- ZAR/hour default
  driver_hourly_rate   REAL NOT NULL DEFAULT 350,
  vehicle_day_rate     REAL NOT NULL DEFAULT 800,       -- ZAR/day per vehicle (catch-all)
  vehicle_km_rate      REAL NOT NULL DEFAULT 5,
  default_event_hours  REAL NOT NULL DEFAULT 8,
  updated_at           DATETIME DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO cost_defaults (id) VALUES (1);

-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 14 — Quote ↔ Event handshake
-- ═══════════════════════════════════════════════════════════════════════════
-- Quotes already link to legacy 'events' table. Add modern calendar_event link.
-- New SAB-style flow: quote accepted → birth a calendar_events row with allocations.
ALTER TABLE quotes ADD COLUMN calendar_event_id INTEGER;
ALTER TABLE calendar_events ADD COLUMN quote_id INTEGER;
ALTER TABLE calendar_events ADD COLUMN quote_number TEXT;

CREATE INDEX IF NOT EXISTS idx_quotes_cal_event ON quotes(calendar_event_id);
CREATE INDEX IF NOT EXISTS idx_cal_event_quote ON calendar_events(quote_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 13 — Brand share tokens (client-facing brand pages)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS brand_share_tokens (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  brand             TEXT NOT NULL,                      -- canonical brand name
  token             TEXT NOT NULL UNIQUE,               -- random URL token
  label             TEXT,                                -- e.g. "SAB Brand Marketing"
  recipient_email   TEXT,                                -- who we shared with
  active            INTEGER NOT NULL DEFAULT 1,
  view_count        INTEGER NOT NULL DEFAULT 0,
  last_viewed_at    DATETIME,
  last_viewed_ip    TEXT,
  created_by        INTEGER,
  created_by_name   TEXT,
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  revoked_at        DATETIME,
  revoked_by        INTEGER
);
CREATE INDEX IF NOT EXISTS idx_bst_brand  ON brand_share_tokens(brand);
CREATE INDEX IF NOT EXISTS idx_bst_token  ON brand_share_tokens(token);
CREATE INDEX IF NOT EXISTS idx_bst_active ON brand_share_tokens(active, created_at DESC);

-- View log for share tokens (audit trail of who looked + when)
CREATE TABLE IF NOT EXISTS brand_share_views (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  token_id    INTEGER NOT NULL,
  ip_address  TEXT,
  user_agent  TEXT,
  referrer    TEXT,
  viewed_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bsv_token ON brand_share_views(token_id, viewed_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 17 — Brand owner digest subscriptions
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS brand_digest_subscriptions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  brand             TEXT NOT NULL,
  email             TEXT NOT NULL,
  name              TEXT,                                -- recipient name
  frequency         TEXT NOT NULL DEFAULT 'weekly',      -- 'weekly' | 'monthly' (future)
  active            INTEGER NOT NULL DEFAULT 1,
  last_sent_at      DATETIME,
  created_by        INTEGER,
  created_by_name   TEXT,
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (brand, email)
);
CREATE INDEX IF NOT EXISTS idx_bds_brand  ON brand_digest_subscriptions(brand);
CREATE INDEX IF NOT EXISTS idx_bds_active ON brand_digest_subscriptions(active, frequency);

-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 16 — Login history (audit_log already exists)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS login_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER,
  email       TEXT,
  success     INTEGER NOT NULL DEFAULT 0,                -- 1 if login succeeded, 0 if failed
  ip_address  TEXT,
  user_agent  TEXT,
  failure_reason TEXT,                                    -- 'wrong_password', 'no_user', etc.
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_login_user ON login_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_email ON login_history(email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_success ON login_history(success, created_at DESC);
