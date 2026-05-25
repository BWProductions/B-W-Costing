-- Migration 0021: Foundation layer
-- Company settings (single-row global config), audit log, role enum

-- ── Company settings (single row keyed by 'singleton') ────────────────────
CREATE TABLE IF NOT EXISTS company_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  legal_name TEXT NOT NULL,
  registration_number TEXT,
  vat_number TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  address_line3 TEXT,
  postal_code TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  website TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO company_settings (
  id, legal_name, registration_number, vat_number,
  address_line1, address_line2, address_line3, postal_code,
  contact_name, contact_phone, contact_email
) VALUES (
  1,
  'B&W Productions CC',
  '2009/189046/23',
  '4790261301',
  'Unit 1, No 19 Kransvalk Road',
  'Highbury',
  'Meyerton',
  '1961',
  'Bernie',
  '082 321 6520',
  'bibi@bwproductions.co.za'
);

-- ── Audit log: every meaningful CREATE/UPDATE/DELETE ────────────────────
-- Designed to be append-only. Filterable by entity, user, date.
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  user_id INTEGER,                    -- NULL for system actions (cron, etc.)
  user_email TEXT,                    -- denormalised for survival across user changes
  action TEXT NOT NULL,               -- 'create' | 'update' | 'delete' | 'override' | 'login' | 'logout'
  entity_type TEXT NOT NULL,          -- 'calendar_event' | 'quote' | 'supplier' | 'stock_item' | 'user' | ...
  entity_id INTEGER,                  -- the affected row id (NULL for collection actions)
  field_changes TEXT,                 -- JSON: { "field": { "from": "x", "to": "y" }, ... }
  reason TEXT,                        -- human-supplied reason (for override actions especially)
  ip_address TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);

-- ── Role enum (extend existing users.role column) ────────────────────────
-- Existing roles in DB: 'founder', 'ops_director'
-- New canonical set: founder | ops_director | accounts | crew | read_only
-- (No data migration needed — existing users keep their current role.)
-- Just document the canonical set for application logic to reference.
INSERT OR REPLACE INTO system_settings (key, value, updated_at)
  VALUES ('roles_canonical', 'founder,ops_director,accounts,crew,read_only', CURRENT_TIMESTAMP);

-- ── PO / Shopping cart on calendar events (for SAB/AB InBev workflow) ────
-- Office can enter a shopping cart number first, then update to PO when client converts.
-- We keep both numbers so the conversion is traceable.
ALTER TABLE calendar_events ADD COLUMN shopping_cart_number TEXT;
ALTER TABLE calendar_events ADD COLUMN purchase_order_number TEXT;
