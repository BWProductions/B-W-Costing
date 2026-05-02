-- B&W Productions Seed Data
-- Passwords are hashed: "bw2024!" for all users (bcrypt-style, stored as SHA-256 hex for edge compat)

-- USERS — only Bibi active by default. Others added via Admin panel.
INSERT OR IGNORE INTO users (email, password_hash, name, role, active) VALUES
  ('info@bwproductions.co.za',   'a0f84805401eee2818103c11866808a1fec4206ff6c29d542a7529c50fe05a43', 'Bibi Burness',    'founder',          1),
  ('brian@bwproductions.co.za',  'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2', 'Brian Ndlovu',    'ops_director',     0),
  ('bernie@bwproductions.co.za', 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2', 'Bernie Burness',  'finance_director', 0),
  ('revel@bwproductions.co.za',  'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2', 'Revel Ravenhill', 'account_director', 0);

-- CLIENTS
INSERT OR IGNORE INTO clients (name, type, vat_number, payment_terms, contact_primary, contact_email, contact_phone) VALUES
  ('SAB Miller', 'sab', '4500123456', 30, 'Thabo Mokoena', 'thabo@sabmiller.co.za', '011 881 0000'),
  ('Diageo South Africa', 'corporate', '4610234567', 30, 'Sarah Dlamini', 'sarah.d@diageo.com', '011 555 0100'),
  ('Red Bull SA', 'corporate', '4720345678', 14, 'Mike van der Berg', 'mike@redbull.co.za', '021 555 0200'),
  ('MTN SA', 'corporate', '4830456789', 30, 'Nomsa Khumalo', 'nomsa@mtn.co.za', '083 555 0300'),
  ('Nando''s SA', 'corporate', '4940567890', 30, 'James Ferreira', 'james@nandos.co.za', '011 555 0400'),
  ('City of Johannesburg', 'government', '4060678901', 60, 'Zanele Sithole', 'zsithole@joburg.org.za', '011 555 0500');

-- FLEET (13 vehicles)
INSERT OR IGNORE INTO fleet (reg_number, description, vehicle_type, payload_kg, daily_hire_rate, fuel_rate_per_km, truck_class, sab_restricted, status, next_maintenance, replacement_horizon) VALUES
  ('FC 89 PN GP', 'MAN TGS 26.440 10t Truck',      '10t',    10000, 3500, 4.80, 'L4', 1, 'available', '2025-06-01', '2028-01-01'),
  ('BW 01 GP',    'Isuzu NPR 400 4t Truck (1)',     '4t',     4000,  1800, 3.20, 'L2', 0, 'available', '2025-05-15', '2026-06-01'),
  ('BW 02 GP',    'Isuzu NPR 400 4t Truck (2)',     '4t',     4000,  1800, 3.20, 'L2', 0, 'available', '2025-06-10', '2026-08-01'),
  ('BW 03 GP',    'Isuzu FRR 550 8t Truck (1)',     '8t',     8000,  2800, 4.10, 'L3', 0, 'available', '2025-05-20', '2027-01-01'),
  ('BW 04 GP',    'Isuzu FRR 550 8t Truck (2)',     '8t',     8000,  2800, 4.10, 'L3', 0, 'available', '2025-07-01', '2027-03-01'),
  ('BW 05 GP',    'Toyota Hilux D/C Bakkie (1)',    'bakkie', 800,   850,  2.10, 'L1', 0, 'available', '2025-05-01', '2025-12-01'),
  ('BW 06 GP',    'Toyota Hilux D/C Bakkie (2)',    'bakkie', 800,   850,  2.10, 'L1', 0, 'available', '2025-06-01', '2025-12-01'),
  ('BW 07 GP',    'Toyota Hilux D/C Bakkie (3)',    'bakkie', 800,   850,  2.10, 'L1', 0, 'available', '2025-07-01', '2026-01-01'),
  ('BW 08 GP',    'Ford Ranger 4x4 Bakkie',         'bakkie', 900,   950,  2.20, 'L1', 0, 'available', '2025-05-15', '2026-03-01'),
  ('BW 09 GP',    'Ford Ranger 4x4 Bakkie (2)',     'bakkie', 900,   950,  2.20, 'L1', 0, 'available', '2025-06-15', '2026-05-01'),
  ('BW 10 GP',    'Isuzu D-Max Single Cab',         'bakkie', 1000,  800,  2.00, 'L1', 0, 'available', '2025-08-01', '2026-06-01'),
  ('BW 11 GP',    'Mercedes Sprinter 3.5t Panel',   '4t',     3500,  1600, 2.80, 'L2', 0, 'available', '2025-05-30', '2026-09-01'),
  ('BW 12 GP',    'Isuzu NQR 500 8t Flatdeck',      '8t',     7500,  2600, 3.90, 'L3', 0, 'available', '2025-06-20', '2027-06-01');

-- SUPPLIERS
INSERT OR IGNORE INTO suppliers (name, role, vat_registered, vat_number, payment_terms, contact_name, contact_email, contact_phone) VALUES
  ('Events Guys',       'COS',          1, '4100111222', 30, 'Gary Pretorius',   'gary@eventsguys.co.za',      '082 555 1001'),
  ('Stage One',         'COS',          1, '4200222333', 30, 'Tanya Olivier',    'tanya@stageone.co.za',        '083 555 1002'),
  ('Inkredible Print',  'Expendable',   1, '4300333444', 14, 'Kevin Naidoo',     'kevin@inkredible.co.za',      '084 555 1003'),
  ('PowerGen SA',       'OPEX',         1, '4400444555', 30, 'Fanie du Plessis', 'fanie@powergen.co.za',        '085 555 1004'),
  ('CoolZone Rentals',  'Pass-Through', 1, '4500555666', 30, 'Lindiwe Moyo',     'lindiwe@coolzone.co.za',      '086 555 1005'),
  ('Pro Staffing SA',   'COS',          1, '4600666777', 7,  'David Khumalo',    'david@prostaffing.co.za',     '082 555 1006'),
  ('Rapid Fencing',     'Expendable',   1, '4700777888', 30, 'Christo Botha',    'christo@rapidfencing.co.za',  '083 555 1007'),
  ('BW Internal',       'OPEX',         1, '4790261301', 0,  'Bibi Burness',     'info@bwproductions.co.za',    '082 555 1000');

-- LOAD CLASSES
INSERT OR IGNORE INTO load_classes (class, label, pax_min, pax_max, pallet_min, pallet_max, truck_class, disbursement_multiplier, notes) VALUES
  ('L1', 'Light — Bakkie Load',     1,   200,  0,    4,    'L1', 1.05, 'Single bakkie, small activation'),
  ('L2', 'Medium — 4t Load',       201,  500,  4.1,  12,   'L2', 1.08, '4t truck, standard activation'),
  ('L3', 'Heavy — 8t Load',        501,  1500, 12.1, 28,   'L3', 1.10, '8t truck, large activation'),
  ('L4', 'XL — 10t / Multi-truck', 1501, 9999, 28.1, 999,  'L4', 1.12, '10t MAN or multi-truck convoy');

-- RATE CARD
INSERT OR IGNORE INTO rate_card (category, line_item, unit, base_rate, discount_pct, supplier_id, notes) VALUES
  -- Structures
  ('Structures', 'Marquee 6x6m',           'unit', 4500,  0, 1, 'Events Guys supply'),
  ('Structures', 'Marquee 9x9m',           'unit', 7200,  0, 1, 'Events Guys supply'),
  ('Structures', 'Marquee 12x12m',         'unit', 9800,  0, 1, 'Events Guys supply'),
  ('Structures', 'Snowpeak 6m',            'unit', 3200,  0, 1, 'Events Guys supply'),
  ('Structures', 'Pagoda 5x5m',            'unit', 2800,  0, 1, 'Events Guys supply'),
  ('Structures', 'Shade Sail (branded)',   'unit', 1800,  0, 3, 'Inkredible Print branded'),
  -- Furniture
  ('Furniture',  'Beer Bench Set (1.8m)',  'set',  350,   0, 1, 'Bench + 2 seats'),
  ('Furniture',  'Round Table + 5 chairs', 'set',  480,   0, 1, NULL),
  ('Furniture',  'Cocktail Table',         'unit', 220,   0, 1, NULL),
  ('Furniture',  'Bar Unit (branded)',     'unit', 1200,  0, 1, NULL),
  ('Furniture',  'Poseur Table',           'unit', 180,   0, 1, NULL),
  -- Power
  ('Power',      'Generator 15kVA',        'day',  1800,  0, 4, 'PowerGen SA'),
  ('Power',      'Generator 30kVA',        'day',  2800,  0, 4, 'PowerGen SA'),
  ('Power',      'Generator 60kVA',        'day',  4200,  0, 4, 'PowerGen SA'),
  ('Power',      'Distribution Board',     'day',  450,   0, 4, NULL),
  ('Power',      'Cable Run (50m)',         'set',  380,   0, 4, NULL),
  -- Staging
  ('Staging',    'Stage Deck 1m x 2m',     'unit', 650,   0, 2, 'Stage One supply'),
  ('Staging',    'Stage Stairs (3-step)',   'unit', 480,   0, 2, 'Stage One supply'),
  ('Staging',    'Staging Legs (0.6m)',     'set',  220,   0, 2, NULL),
  ('Staging',    'LED Screen 3x2m',        'day',  8500,  0, 2, 'Stage One supply'),
  ('Staging',    'Sound System (mid)',      'day',  6500,  0, 2, 'Stage One supply'),
  -- Fencing
  ('Fencing',    'Crowd Barrier 2.2m',     'unit', 85,    0, 7, 'Rapid Fencing'),
  ('Fencing',    'Pedestrian Gate',        'unit', 320,   0, 7, NULL),
  ('Fencing',    'Vehicle Gate (4m)',      'unit', 650,   0, 7, NULL),
  -- Labour — Setup (NEVER bundle with Strike)
  ('Labour',     'Setup — Event Crew (6hr)', 'person', 380, 0, 6, 'Pro Staffing SA — setup shift'),
  ('Labour',     'Setup — Supervisor (6hr)', 'person', 620, 0, 8, 'BW Internal supervisor'),
  ('Labour',     'Setup — Forklift Operator','person', 550, 0, 6, 'Certified operator'),
  -- Labour — Strike (separate line, always)
  ('Labour',     'Strike — Event Crew (6hr)','person', 380, 0, 6, 'Pro Staffing SA — strike shift'),
  ('Labour',     'Strike — Supervisor (6hr)','person', 620, 0, 8, 'BW Internal supervisor'),
  -- Transport
  ('Transport',  'Bakkie Day Rate',         'day',  850,   0, 8, 'BW fleet — bakkie'),
  ('Transport',  '4t Truck Day Rate',       'day',  1800,  0, 8, 'BW fleet — 4t'),
  ('Transport',  '8t Truck Day Rate',       'day',  2800,  0, 8, 'BW fleet — 8t'),
  ('Transport',  '10t Truck Day Rate',      'day',  3500,  0, 8, 'BW fleet — MAN (SAB only)'),
  ('Transport',  'Fuel & Tolls (est)',       'trip', 1200,  0, 8, 'Estimate — adjust per event'),
  -- Branding
  ('Branding',   'Pull-Up Banner',          'unit', 850,   0, 3, 'Inkredible Print'),
  ('Branding',   'Backdrop 3x2m (print)',   'unit', 1800,  0, 3, 'Inkredible Print'),
  ('Branding',   'Table Runner (branded)',  'unit', 320,   0, 3, 'Inkredible Print'),
  ('Branding',   'Gazebo Branding Kit',     'set',  2200,  0, 3, 'Inkredible Print'),
  -- Cooling
  ('Cooling',    'Portable Cooler Unit',    'day',  1200,  0, 5, 'CoolZone Rentals'),
  ('Cooling',    'Ice Bar Unit',            'day',  2400,  0, 5, 'CoolZone Rentals'),
  -- Consumables
  ('Consumables','Cable Ties (pack)',       'pack', 45,    0, 8, NULL),
  ('Consumables','Gaffer Tape (roll)',      'roll', 85,    0, 8, NULL),
  ('Consumables','Safety Signage Set',     'set',  380,   0, 8, NULL);

-- SAMPLE EVENTS
INSERT OR IGNORE INTO events (client_id, name, event_date, venue, venue_city, pax, status, is_sab_event, created_by) VALUES
  (1, 'Castle Lager Heritage Fest 2025',     '2025-09-20', 'Johannesburg Expo Centre', 'Johannesburg', 2500, 'brief',  1, 1),
  (2, 'Diageo Trade Launch Q3',              '2025-07-15', 'Sandton Convention Centre','Sandton',       350,  'quoted', 0, 4),
  (3, 'Red Bull Soundclash Johannesburg',   '2025-08-02', 'Constitution Hill',        'Johannesburg', 800,  'won',    0, 4),
  (4, 'MTN Staff Year-End 2025',             '2025-11-28', 'Kyalami Estate',           'Midrand',       600,  'brief',  0, 1),
  (5, 'Nando''s Franchisee Awards',          '2025-06-12', 'Gallagher Convention Ctr', 'Midrand',       400,  'delivered',0, 4);

-- SAMPLE QUOTE (for Red Bull Soundclash)
INSERT OR IGNORE INTO quotes (event_id, quote_number, version, status, load_class, fleet_id, disbursement_multiplier, vat_rate, created_by) VALUES
  (3, 'BW-2025-0003', 1, 'accepted', 'L3', 4, 1.10, 15.0, 1);

-- SAB KPI PLACEHOLDERS (V2 hooks)
INSERT OR IGNORE INTO sab_kpis (kpi_code, kpi_name, category, priority_weight) VALUES
  ('K01', 'On-Time Delivery Rate',           'Delivery',   1.5),
  ('K02', 'Asset Availability %',            'Assets',     1.3),
  ('K03', 'Service Credit Exposure',         'Financial',  1.4),
  ('K04', 'Wheel Spend vs Budget',           'Financial',  1.2),
  ('K05', 'Crew Incident Rate',              'Safety',     1.5),
  ('K06', 'Client Satisfaction Score',       'Quality',    1.3),
  ('K07', 'Fixed Monthly vs Variable Spend', 'Financial',  1.1),
  ('K08', 'B-BBEE Supplier Spend %',         'Compliance', 1.0);
