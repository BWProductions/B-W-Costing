-- ─────────────────────────────────────────────────────────────────────────
-- Phase 6: Bulk CSV Import (with undo)
-- ─────────────────────────────────────────────────────────────────────────
-- Workflow:
--   1. User pastes/uploads CSV → preview job stored (status='preview')
--   2. User confirms          → job committed (status='committed', changes
--                               written to stock_items, audit rows logged
--                               with action='bulk_import')
--   3. User clicks Undo (≤24h) → reverse using bulk_import_rows snapshot,
--                               job marked status='undone', audit rows
--                               logged with action='bulk_import_undo'.
--
-- Each row of the CSV gets a bulk_import_rows record with:
--   * raw_data         — JSON of the parsed CSV row (for traceability)
--   * matched_item_id  — NULL if new, else the stock_items.id we matched/touched
--   * before_snapshot  — JSON of the stock_items row BEFORE we touched it
--                        (NULL for inserts). Used by Undo to restore.
--   * after_snapshot   — JSON of fields written. Used to verify nothing else
--                        changed before reverting.
--   * action_taken     — 'insert' | 'update' | 'skip' (skip = no-op match)
--   * match_score      — 0..1 from fuzzy engine (NULL for exact/insert)
--   * notes            — free text (e.g. "duplicate of #393", "fuzzy 0.92")

CREATE TABLE IF NOT EXISTS bulk_imports (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  status          TEXT NOT NULL DEFAULT 'preview',  -- 'preview' | 'committed' | 'undone' | 'discarded'
  source_name     TEXT,                              -- filename if uploaded, or 'paste' / 'paste:NNN_rows'
  raw_csv         TEXT,                              -- original CSV body (for traceability)
  detected_cols   TEXT,                              -- JSON: { brand:0, description:1, qty:2, ... }
  total_rows      INTEGER NOT NULL DEFAULT 0,
  insert_count    INTEGER NOT NULL DEFAULT 0,
  update_count    INTEGER NOT NULL DEFAULT 0,
  skip_count      INTEGER NOT NULL DEFAULT 0,
  fuzzy_count     INTEGER NOT NULL DEFAULT 0,        -- rows matched via fuzzy (not exact)
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by_id   INTEGER,
  created_by_name TEXT,
  committed_at    DATETIME,
  undone_at       DATETIME,
  undone_by_name  TEXT,
  notes           TEXT
);

CREATE INDEX IF NOT EXISTS idx_bulk_imports_status
  ON bulk_imports(status, created_at DESC);

CREATE TABLE IF NOT EXISTS bulk_import_rows (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  import_id       INTEGER NOT NULL,
  row_number      INTEGER NOT NULL,                  -- 1-based, post-header
  raw_data        TEXT,                              -- JSON of parsed row
  action_taken    TEXT NOT NULL,                     -- 'insert' | 'update' | 'skip'
  matched_item_id INTEGER,                           -- stock_items.id (NULL for skip-on-error)
  match_score     REAL,                              -- 0..1 (NULL if exact / insert / skip)
  match_reason    TEXT,                              -- 'exact_brand_desc' | 'fuzzy_0.92' | 'new' | 'skipped'
  before_snapshot TEXT,                              -- JSON of stock_items row pre-change (NULL for insert)
  after_snapshot  TEXT,                              -- JSON of fields written
  fields_touched  TEXT,                              -- CSV list of column names actually modified
  qty_delta       INTEGER,                           -- new_qty - old_qty (NULL if qty not touched)
  notes           TEXT,
  FOREIGN KEY (import_id) REFERENCES bulk_imports(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_bulk_import_rows_import
  ON bulk_import_rows(import_id, row_number);

CREATE INDEX IF NOT EXISTS idx_bulk_import_rows_item
  ON bulk_import_rows(matched_item_id);
