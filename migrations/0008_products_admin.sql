-- ============================================================================
-- Migration 0008 — Master Products Admin
-- ============================================================================
-- Adds:
--   1. field_item_aliases       — many aliases per master product (audited)
--   2. New columns on field_suggested_items for triage workflow
--   3. Index helpers
-- Idempotent — safe to re-run.
-- ============================================================================

-- Triage status + fuzzy-match metadata on suggested items
ALTER TABLE field_suggested_items ADD COLUMN status TEXT DEFAULT 'pending';
-- status values: pending | merged | created | ignored | split

ALTER TABLE field_suggested_items ADD COLUMN matched_item_id INTEGER;
ALTER TABLE field_suggested_items ADD COLUMN match_score REAL;
ALTER TABLE field_suggested_items ADD COLUMN top_candidates TEXT; -- JSON: [{item_id, name, score, reason}]
ALTER TABLE field_suggested_items ADD COLUMN decided_by TEXT;
ALTER TABLE field_suggested_items ADD COLUMN decided_at DATETIME;
ALTER TABLE field_suggested_items ADD COLUMN parent_suggestion_id INTEGER; -- for splits

-- Dedicated aliases table (richer than the JSON aliases column on field_items)
CREATE TABLE IF NOT EXISTS field_item_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  alias_text TEXT NOT NULL,
  alias_lower TEXT NOT NULL,
  source TEXT DEFAULT 'manual',         -- manual | suggestion | merge | import
  source_suggestion_id INTEGER,         -- if created from a triaged suggestion
  confirmed_by TEXT,
  confirmed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  active INTEGER DEFAULT 1,
  FOREIGN KEY (item_id) REFERENCES field_items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_aliases_lower ON field_item_aliases(alias_lower);
CREATE INDEX IF NOT EXISTS idx_aliases_item  ON field_item_aliases(item_id);
CREATE INDEX IF NOT EXISTS idx_suggestions_status ON field_suggested_items(status);
CREATE INDEX IF NOT EXISTS idx_items_active ON field_items(active);
CREATE INDEX IF NOT EXISTS idx_items_category ON field_items(category);

-- Backfill: any existing rows with reviewed=1 → status='created' (best guess)
-- and rows with reviewed=2 → status='ignored'. reviewed=0 stays as 'pending'.
UPDATE field_suggested_items SET status='created' WHERE reviewed=1 AND status='pending';
UPDATE field_suggested_items SET status='ignored' WHERE reviewed=2 AND status='pending';
