-- ─────────────────────────────────────────────────────────────────────────
-- Phase 7: Stock Allocations on Events
-- ─────────────────────────────────────────────────────────────────────────
-- Wire calendar_event_equipment.stock_item_id (existing column, currently
-- always NULL) so we can compute "qty committed" per stock item across
-- overlapping events.
--
-- Design decisions confirmed with Bibi:
--   Q1: Use the event_date as the commit window (single day, no setup buffer)
--   Q2: Only items with active=1 AND status='active' are considered available
--   Q3: Only custody_type='owned' contributes to availability (3rd-party and
--       offsite are EXCLUDED — those need a separate request)
--   Q4: Soft warn on overbook — auto-create a stock_shortages row
--   Q5: "Link to stock" button on free-text rows (runtime concern, no schema)
--   Q6: Shortages dashboard lives at /admin/stock/shortages
--
-- The existing schemas already have what we need (created in 0022):
--   * calendar_event_equipment.stock_item_id → stock_items(id)  (nullable)
--   * stock_shortages(stock_item_id, event_id, quantity_short, resolution,
--                     resolved_at, resolved_by, notes)
-- We add: helpful indexes + a tiny "status" hint so the dashboard can filter
-- pending vs resolved without checking resolution IS NULL everywhere.

-- ── Indexes for the availability calculator ────────────────────────────────
-- The hot query: "for stock_item_id X, sum quantity across calendar_event_equipment
-- rows joined to non-cancelled calendar_events on a given date".
CREATE INDEX IF NOT EXISTS idx_cee_stock_item
  ON calendar_event_equipment(stock_item_id);

CREATE INDEX IF NOT EXISTS idx_cee_event
  ON calendar_event_equipment(event_id);

-- For the shortages dashboard
CREATE INDEX IF NOT EXISTS idx_shortages_unresolved
  ON stock_shortages(resolution, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shortages_event
  ON stock_shortages(event_id);

CREATE INDEX IF NOT EXISTS idx_shortages_item
  ON stock_shortages(stock_item_id);
