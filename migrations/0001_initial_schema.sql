-- B&W Productions Operations Platform
-- Initial Schema v1.0

-- 1. USERS & AUTH
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('founder','ops_director','finance_director','account_director','crew')),
  active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. CLIENTS
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT CHECK(type IN ('corporate','agency','government','ngo','private','sab')),
  vat_number TEXT,
  reg_number TEXT,
  payment_terms INTEGER DEFAULT 30,
  credit_limit REAL DEFAULT 0,
  contact_primary TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  billing_address TEXT,
  notes TEXT,
  active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. EVENTS
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  name TEXT NOT NULL,
  event_date TEXT NOT NULL,
  venue TEXT,
  venue_city TEXT,
  pax INTEGER DEFAULT 0,
  status TEXT DEFAULT 'brief' CHECK(status IN ('brief','quoted','won','lost','delivered','cancelled')),
  is_sab_event INTEGER DEFAULT 0,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. FLEET
CREATE TABLE IF NOT EXISTS fleet (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reg_number TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL,
  vehicle_type TEXT CHECK(vehicle_type IN ('bakkie','4t','8t','10t','trailer','other')),
  payload_kg REAL DEFAULT 0,
  daily_hire_rate REAL DEFAULT 0,
  fuel_rate_per_km REAL DEFAULT 0,
  truck_class TEXT CHECK(truck_class IN ('L1','L2','L3','L4','any')),
  sab_restricted INTEGER DEFAULT 0,
  status TEXT DEFAULT 'available' CHECK(status IN ('available','allocated','maintenance','retired')),
  next_maintenance TEXT,
  replacement_horizon TEXT,
  notes TEXT,
  active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. SUPPLIERS
CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT CHECK(role IN ('COS','CAPEX','Expendable','Pass-Through','OPEX')),
  vat_registered INTEGER DEFAULT 1,
  vat_number TEXT,
  payment_terms INTEGER DEFAULT 30,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  account_number TEXT,
  bank_name TEXT,
  bank_branch TEXT,
  notes TEXT,
  active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 6. RATE CARD
CREATE TABLE IF NOT EXISTS rate_card (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  line_item TEXT NOT NULL,
  unit TEXT DEFAULT 'each',
  base_rate REAL NOT NULL,
  discount_pct REAL DEFAULT 0,
  effective_rate REAL GENERATED ALWAYS AS (base_rate * (1 - discount_pct / 100)) STORED,
  supplier_id INTEGER REFERENCES suppliers(id),
  load_class TEXT DEFAULT 'any',
  notes TEXT,
  active INTEGER DEFAULT 1,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 7. LOAD CLASSES
CREATE TABLE IF NOT EXISTS load_classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class TEXT UNIQUE NOT NULL CHECK(class IN ('L1','L2','L3','L4')),
  label TEXT NOT NULL,
  pax_min INTEGER,
  pax_max INTEGER,
  pallet_min REAL,
  pallet_max REAL,
  truck_class TEXT NOT NULL,
  disbursement_multiplier REAL DEFAULT 1.0,
  notes TEXT
);

-- 8. QUOTES
CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id),
  quote_number TEXT UNIQUE NOT NULL,
  version INTEGER DEFAULT 1,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft','sent','accepted','declined','superseded')),
  load_class TEXT,
  fleet_id INTEGER REFERENCES fleet(id),
  subtotal REAL DEFAULT 0,
  disbursement_multiplier REAL DEFAULT 1.0,
  disbursement_amount REAL DEFAULT 0,
  vat_rate REAL DEFAULT 15.0,
  vat_amount REAL DEFAULT 0,
  total REAL DEFAULT 0,
  internal_cost REAL DEFAULT 0,
  margin REAL DEFAULT 0,
  notes TEXT,
  terms TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 9. QUOTE LINE ITEMS
CREATE TABLE IF NOT EXISTS quote_line_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  rate_card_id INTEGER REFERENCES rate_card(id),
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  unit TEXT DEFAULT 'each',
  quantity REAL DEFAULT 1,
  unit_rate REAL NOT NULL,
  line_total REAL GENERATED ALWAYS AS (quantity * unit_rate) STORED,
  is_setup INTEGER DEFAULT 0,
  is_strike INTEGER DEFAULT 0,
  supplier_id INTEGER REFERENCES suppliers(id),
  cost_rate REAL DEFAULT 0,
  cost_total REAL GENERATED ALWAYS AS (quantity * cost_rate) STORED,
  visible_to_client INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0
);

-- 10. SAB KPI PLACEHOLDERS (V2 hook)
CREATE TABLE IF NOT EXISTS sab_kpis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kpi_code TEXT UNIQUE NOT NULL,
  kpi_name TEXT NOT NULL,
  category TEXT,
  target_value REAL,
  unit TEXT,
  priority_weight REAL DEFAULT 1.0,
  active INTEGER DEFAULT 1,
  notes TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_events_client ON events(client_id);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);
CREATE INDEX IF NOT EXISTS idx_quotes_event ON quotes(event_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quote_lines_quote ON quote_line_items(quote_id);
CREATE INDEX IF NOT EXISTS idx_rate_card_category ON rate_card(category);
CREATE INDEX IF NOT EXISTS idx_fleet_status ON fleet(status);
