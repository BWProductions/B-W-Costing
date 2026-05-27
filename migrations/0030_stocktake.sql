-- ─────────────────────────────────────────────────────────────────────────
-- Phase 4: Stock-take scan mode
-- ─────────────────────────────────────────────────────────────────────────
-- A "stock-take session" is a discrete physical audit of the warehouse.
-- During a session, every counted item is recorded in `stocktake_counts`
-- against that session_id. When the session is closed, the recorded counts
-- are applied to `stock_items.qty_on_hand` and each change is logged as a
-- `stock_movements.action='stocktake'` row.
--
-- Multiple users can scan into the same open session.
-- Re-scanning an item within the same session overwrites the previous count.

CREATE TABLE IF NOT EXISTS stocktake_sessions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,                          -- e.g. "2026-05-27 Quarterly"
  status        TEXT    NOT NULL DEFAULT 'open',           -- 'open' | 'closed' | 'cancelled'
  notes         TEXT,
  started_by_id INTEGER,
  started_by    TEXT,                                      -- denormalised user name
  started_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  finished_at   DATETIME,
  finished_by   TEXT,
  applied_count INTEGER DEFAULT 0,                         -- how many qty updates were applied on close
  variance_sum  INTEGER DEFAULT 0                          -- sum of abs(variance) at close
);

CREATE INDEX IF NOT EXISTS idx_stocktake_sessions_status
  ON stocktake_sessions(status, started_at DESC);

CREATE TABLE IF NOT EXISTS stocktake_counts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id     INTEGER NOT NULL,
  stock_item_id  INTEGER NOT NULL,
  counted_qty    INTEGER NOT NULL,
  prev_qty       INTEGER NOT NULL,                         -- snapshot of qty_on_hand at moment of count
  variance       INTEGER NOT NULL,                         -- counted - prev (so positive = found more)
  counted_by_id  INTEGER,
  counted_by     TEXT,
  counted_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  notes          TEXT
);

-- One count per (session, item) — re-scan overwrites.
CREATE UNIQUE INDEX IF NOT EXISTS idx_stocktake_counts_session_item
  ON stocktake_counts(session_id, stock_item_id);

CREATE INDEX IF NOT EXISTS idx_stocktake_counts_session
  ON stocktake_counts(session_id, counted_at DESC);
