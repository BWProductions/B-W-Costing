-- ─────────────────────────────────────────────────────────────────────────
-- Phase 5: Low-stock alerts
-- ─────────────────────────────────────────────────────────────────────────
-- Per-item low-stock threshold + weekly email digest.
--
-- Threshold rules:
--   * NULL  → use global default (DEFAULT_LOW_STOCK_THRESHOLD = 5 in code)
--   * 0     → never alert on this item (explicit opt-out for "infinite" stock)
--   * N>0   → alert when qty_on_hand <= N
--
-- Snooze: alert_snoozed_until = DATE 'YYYY-MM-DD'. While today's date is
-- <= that value, the item is hidden from the alerts page and the digest.
-- NULL = not snoozed.

ALTER TABLE stock_items ADD COLUMN low_stock_threshold INTEGER;
ALTER TABLE stock_items ADD COLUMN alert_snoozed_until DATE;

-- Recipients for the weekly digest. Defaults are seeded below; admin UI can
-- add/remove later.
CREATE TABLE IF NOT EXISTS low_stock_alert_recipients (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL UNIQUE,
  name       TEXT,
  active     INTEGER NOT NULL DEFAULT 1,        -- 0 = paused, 1 = sending
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_low_stock_recipients_active
  ON low_stock_alert_recipients(active);

-- Seed default recipient (Bibi). Safe to re-run (UNIQUE on email).
INSERT OR IGNORE INTO low_stock_alert_recipients (email, name, created_by)
VALUES ('bibi@bwproductions.co.za', 'Bibi (CEO)', 'system');

-- Helpful index for the alerts query
CREATE INDEX IF NOT EXISTS idx_stock_items_low_stock
  ON stock_items(active, qty_on_hand);
