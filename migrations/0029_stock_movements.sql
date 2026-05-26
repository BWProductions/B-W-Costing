-- ─────────────────────────────────────────────────────────────────────────
-- Stock movements: repurpose for admin audit log
-- ─────────────────────────────────────────────────────────────────────────
-- Migration 0022 created a `stock_movements` table for the original
-- event-booking ledger design (movement_type, quantity_delta, event_id).
-- That table was never wired up (0 rows, no app code uses it).
--
-- We need a richer audit log for the admin UI: every field change captured
-- with old/new values, delta, reason, user. Rather than overload the old
-- schema, we:
--   1. Park the dormant table aside as `stock_movements_legacy` (so the
--      original schema survives in case the event-ledger design is ever
--      resurrected).
--   2. Create the new audit-log `stock_movements` table.
--
-- Drop legacy indexes first to avoid name collisions when we recreate them
-- on the new table.

DROP INDEX IF EXISTS idx_mvt_stock;
DROP INDEX IF EXISTS idx_mvt_event;
DROP INDEX IF EXISTS idx_mvt_type;

ALTER TABLE stock_movements RENAME TO stock_movements_legacy;

CREATE TABLE stock_movements (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  stock_item_id   INTEGER NOT NULL,                    -- references stock_items.id (no FK so deletes don't cascade history)
  action          TEXT    NOT NULL,                    -- 'create' | 'update' | 'delete' | 'bulk_update' | 'restore'
  field_changed   TEXT,                                -- 'qty_on_hand' | 'custody_type' | 'location' | 'description' | 'brand' | 'notes' | 'status' | 'active' | 'multiple'
  old_value       TEXT,                                -- prev value, stringified
  new_value       TEXT,                                -- new value, stringified
  delta           INTEGER,                             -- for qty changes: new - old. NULL otherwise
  reason          TEXT,                                -- optional human reason (e.g. "stock count correction")
  user_id         INTEGER,                             -- who did it (from session)
  user_name       TEXT,                                -- denormalised so log survives user deletes
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_stock_mov_item    ON stock_movements(stock_item_id, created_at DESC);
CREATE INDEX idx_stock_mov_created ON stock_movements(created_at DESC);
CREATE INDEX idx_stock_mov_action  ON stock_movements(action);
