-- ─────────────────────────────────────────────────────────────────────────
-- Batch A migration: Phases 9 + 10 + 11
--   Phase 9  — Stock Returns & Reconciliation
--   Phase 10 — Movement Reasons & Categorisation
--   Phase 11 — Damages & Write-offs Register
-- ─────────────────────────────────────────────────────────────────────────
--
-- Design (confirmed with Bibi):
--   * Damage taxonomy: broken | missing | lost_on_site
--     (plus mechanical baselines: returned_ok, damaged_writeoff)
--   * Returns are per-event: pick an event → reconcile each allocated line
--   * Reasons categorise every stock_movement so brand dashboards mean something
--   * Damaged stock is tracked separately from on-hand qty (not deducted, but
--     flagged so finance can see "value at risk")
--
-- This migration is additive — no existing rows are touched, no breaking changes.

-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 9 — Stock Returns
-- ═══════════════════════════════════════════════════════════════════════════

-- Header row: one per "return event" (an event being reconciled).
-- An event can have multiple returns (partial returns over multiple days).
CREATE TABLE IF NOT EXISTS stock_returns (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id          INTEGER NOT NULL,                    -- → calendar_events(id)
  return_date       TEXT    NOT NULL,                    -- YYYY-MM-DD (when stock physically returned)
  status            TEXT    NOT NULL DEFAULT 'draft',    -- 'draft' | 'completed' | 'cancelled'
  notes             TEXT,                                -- free-text reconciliation notes
  total_lines       INTEGER NOT NULL DEFAULT 0,          -- denormalised: count of return lines
  total_returned    INTEGER NOT NULL DEFAULT 0,          -- denormalised: sum of returned_ok
  total_broken      INTEGER NOT NULL DEFAULT 0,
  total_missing     INTEGER NOT NULL DEFAULT 0,
  total_lost        INTEGER NOT NULL DEFAULT 0,          -- 'lost_on_site' shorthand
  created_by        INTEGER,                             -- user_id
  created_by_name   TEXT,                                -- denormalised user name
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at      DATETIME,                            -- set when status flips to completed
  completed_by      INTEGER
);

CREATE INDEX IF NOT EXISTS idx_returns_event   ON stock_returns(event_id);
CREATE INDEX IF NOT EXISTS idx_returns_status  ON stock_returns(status, return_date DESC);
CREATE INDEX IF NOT EXISTS idx_returns_created ON stock_returns(created_at DESC);

-- Line rows: one per stock item being reconciled within a return.
-- Source-of-truth for the question: "of N units sent out, how many came back?"
CREATE TABLE IF NOT EXISTS stock_return_lines (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  return_id           INTEGER NOT NULL,                  -- → stock_returns(id)
  event_id            INTEGER NOT NULL,                  -- denormalised for fast joins (→ calendar_events)
  stock_item_id       INTEGER,                           -- nullable: free-text lines have no FK
  description         TEXT NOT NULL,                     -- snapshot at return time (survives item rename)
  qty_allocated       INTEGER NOT NULL DEFAULT 0,        -- snapshot of calendar_event_equipment.quantity
  returned_ok         INTEGER NOT NULL DEFAULT 0,        -- came back, usable
  returned_broken     INTEGER NOT NULL DEFAULT 0,        -- came back, damaged
  missing             INTEGER NOT NULL DEFAULT 0,        -- never came back, fate unknown
  lost_on_site        INTEGER NOT NULL DEFAULT 0,        -- confirmed left at venue / client
  damage_notes        TEXT,                              -- "left handle snapped", "stolen during teardown" etc.
  unit_value          REAL,                              -- optional finance hint at write-off time (R / unit)
  created_at          DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_return_lines_return ON stock_return_lines(return_id);
CREATE INDEX IF NOT EXISTS idx_return_lines_event  ON stock_return_lines(event_id);
CREATE INDEX IF NOT EXISTS idx_return_lines_item   ON stock_return_lines(stock_item_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 10 — Movement Reasons & Categorisation
-- ═══════════════════════════════════════════════════════════════════════════

-- Add a structured reason category to stock_movements.
-- Existing 'reason' column stays (free-text). 'reason_category' is the taxonomy.
ALTER TABLE stock_movements ADD COLUMN reason_category TEXT;
ALTER TABLE stock_movements ADD COLUMN return_id INTEGER;       -- FK hint when movement was driven by a return
ALTER TABLE stock_movements ADD COLUMN event_id  INTEGER;       -- FK hint for event-driven movements

CREATE INDEX IF NOT EXISTS idx_mov_reason_cat ON stock_movements(reason_category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mov_return     ON stock_movements(return_id);
CREATE INDEX IF NOT EXISTS idx_mov_event      ON stock_movements(event_id);

-- Reason taxonomy is enforced in app code, not DB constraint (D1 ALTER limitations).
-- Allowed values (single source of truth in src/lib/movement-reasons.ts):
--   replenishment        — new stock arrived
--   stock_transfer       — moved between locations
--   stocktake_correction — physical count adjustment
--   manual_adjustment    — admin fix-up, reason free-text required
--   event_allocate       — stock committed to an event (Phase 7)
--   event_deallocate     — allocation removed before event
--   event_return_ok      — stock came back from event, usable
--   event_return_broken  — came back damaged → moves to damages
--   event_missing        — never came back, fate unknown
--   event_lost_on_site   — confirmed left at venue/client
--   damaged_writeoff     — write-off after damages review
--   sale                 — stock sold out of inventory

-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 11 — Damages & Write-offs Register
-- ═══════════════════════════════════════════════════════════════════════════

-- Track damaged units separately from qty_on_hand so finance can see what's
-- "owned but unusable" without losing it from the asset register.
ALTER TABLE stock_items ADD COLUMN qty_damaged INTEGER NOT NULL DEFAULT 0;

-- Damages register: every incident tracked individually for finance audit.
CREATE TABLE IF NOT EXISTS stock_damages (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  stock_item_id     INTEGER NOT NULL,                    -- → stock_items(id)
  quantity          INTEGER NOT NULL,                    -- units affected by this damage report
  damage_type       TEXT    NOT NULL,                    -- 'broken' | 'missing' | 'lost_on_site'
  cause             TEXT,                                -- free-text description of what happened
  event_id          INTEGER,                             -- nullable → if damage came from an event
  return_id         INTEGER,                             -- nullable → if linked to a specific return
  return_line_id    INTEGER,                             -- nullable → source line on the return
  unit_value        REAL,                                -- R per unit (for write-off valuation)
  total_value       REAL,                                -- quantity * unit_value (denormalised)
  status            TEXT NOT NULL DEFAULT 'open',        -- 'open' | 'approved' | 'written_off' | 'recovered' | 'cancelled'
  resolution_notes  TEXT,
  reported_by       INTEGER,                             -- user_id
  reported_by_name  TEXT,                                -- denormalised
  approved_by       INTEGER,                             -- user_id of finance approver
  approved_at       DATETIME,
  written_off_at    DATETIME,                            -- when finance signed off the write-off
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_damages_item    ON stock_damages(stock_item_id);
CREATE INDEX IF NOT EXISTS idx_damages_status  ON stock_damages(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_damages_event   ON stock_damages(event_id);
CREATE INDEX IF NOT EXISTS idx_damages_return  ON stock_damages(return_id);
CREATE INDEX IF NOT EXISTS idx_damages_type    ON stock_damages(damage_type);

-- Done. No data migration needed — all new tables/columns are additive
-- and the existing 646 stock items pick up qty_damaged=0 by default.
