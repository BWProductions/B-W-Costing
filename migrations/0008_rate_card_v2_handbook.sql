-- ============================================================================
-- BW Productions Master Rules Handbook v2.0 — Rate Card Import
-- Source: BW_Master_Rules_Handbook_v2_0- changes.docx
-- Effective: 05 May 2026 · Owner: Bibi Burness · Supersedes v1.0 (12 Apr 2026)
-- Strategy 1A: WIPE rate_card and reinsert. Rules in dedicated table + notes.
-- ============================================================================

-- ── 1. WIPE existing rate_card ──────────────────────────────────────────────
DELETE FROM rate_card;

-- ── 2. NEW: rate_card_rules table for handbook prose rules ──────────────────
CREATE TABLE IF NOT EXISTS rate_card_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section TEXT NOT NULL,           -- e.g. '§01', '§08', 'Rule 1.1'
  rule_code TEXT,                  -- e.g. '1.1', '8.1', '14.1'
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  severity TEXT DEFAULT 'info' CHECK(severity IN ('info','warning','critical','flag')),
  effective_date TEXT DEFAULT '2026-05-05',
  active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
DELETE FROM rate_card_rules;

CREATE INDEX IF NOT EXISTS idx_rate_card_rules_section ON rate_card_rules(section);
CREATE INDEX IF NOT EXISTS idx_rate_card_rules_active ON rate_card_rules(active);

-- ============================================================================
-- §01 — LOGISTICS · B&W FLEET (registration-level rates)
-- ============================================================================

INSERT INTO rate_card (category, line_item, unit, base_rate, load_class, notes, active) VALUES
  ('Logistics — B&W Fleet', 'L1 — Bakkie/Car (1t) — Daily Hire', 'day', 1500, 'L1', '4 vehicles: Isuzu ×2, BB Creta, Sipho Isuzu. Light loads, courier. Diesel ref R30/L from 05 May 2026.', 1),
  ('Logistics — B&W Fleet', 'L1 — Bakkie/Car (1t) — Per KM', 'km', 24.00, 'L1', 'R20/km normal · R24/km high-fuel. R10/km is WRONG — see Rule 1.1.', 1),
  ('Logistics — B&W Fleet', 'L2 — Small Truck (4t–6t) — Daily Hire', 'day', 3500, 'L2', '6 vehicles: Hino, Hyundai, Tatas ×2, VE Truck, Toyota. Standard event delivery.', 1),
  ('Logistics — B&W Fleet', 'L2 — Small Truck (4t–6t) — Per KM', 'km', 27.00, 'L2', 'Confirmed.', 1),
  ('Logistics — B&W Fleet', 'L3 — Medium Truck (7t–9t) — Daily Hire', 'day', 4500, 'L3', '1 vehicle: FAW No 5. Mid-tier hauls. v2.0 — tier added (was missing in v1.0).', 1),
  ('Logistics — B&W Fleet', 'L3 — Medium Truck (7t–9t) — Per KM', 'km', 30.00, 'L3', 'Confirmed.', 1),
  ('Logistics — B&W Fleet', 'L4 — Heavy Truck (10t–14t) — Daily Hire', 'day', 5500, 'L4', '4 vehicles: FAW Big, Castle Lager MAN, Mercedes ×2. Festival scale, cross-border. v1.0 had R4,000 — wrong.', 1),
  ('Logistics — B&W Fleet', 'L4 — Heavy Truck (10t–14t) — Per KM', 'km', 35.00, 'L4', 'v1.0 had R64/km — wrong. Fleet file is truth.', 1),
  ('Logistics — B&W Fleet', 'Branded Truck Premium — VE Truck (DM29KPGP)', 'event/day', 10000, 'L2', 'PLUS base L2/L4 vehicle hire. Don''t double-charge or miss the base hire — the R10k is the branding licence, the daily is the vehicle.', 1),
  ('Logistics — B&W Fleet', 'Branded Truck Premium — Castle Lager Truck (FC89PNGP)', 'event/day', 10000, 'L4', 'PLUS base L4 vehicle hire.', 1),
  ('Logistics — B&W Fleet', 'Horse Trailer Hire', 'day', 5000, 'any', 'Estimated — confirm.', 1),
  ('Logistics — B&W Fleet', 'Driver — Standard', 'day', 850, 'any', 'Confirmed. R750 is WRONG — that is setup labour. See Rule 1.2.', 1),
  ('Logistics — B&W Fleet', 'Driver — Overtime / After Hours', 'day', 950, 'any', 'Confirmed.', 1);

-- ============================================================================
-- §01b — LOGISTICS · SUB-HIRE (third-party fallback)
-- Always pass-through at cost + disbursement % per §08.
-- ============================================================================

INSERT INTO rate_card (category, line_item, unit, base_rate, load_class, notes, active) VALUES
  ('Logistics — Sub-Hire', 'Bakkie — Daily Hire', 'day', 1500, 'L1', 'Pass-through. Confirmed.', 1),
  ('Logistics — Sub-Hire', 'Bakkie — Normal Fuel /km', 'km', 20.00, 'L1', 'Pass-through. Normal fuel days.', 1),
  ('Logistics — Sub-Hire', 'Bakkie — High Fuel /km', 'km', 24.00, 'L1', 'Pass-through. High fuel days.', 1),
  ('Logistics — Sub-Hire', 'Bakkie + Trailer — Daily Hire', 'day', 2000, 'L1', 'Pass-through.', 1),
  ('Logistics — Sub-Hire', 'Bakkie + Trailer — Normal Fuel /km', 'km', 23.00, 'L1', 'Pass-through.', 1),
  ('Logistics — Sub-Hire', 'Bakkie + Trailer — High Fuel /km', 'km', 26.00, 'L1', 'Pass-through. High/daily TBC.', 1),
  ('Logistics — Sub-Hire', '4t–6t Truck — Daily Hire', 'day', 3500, 'L2', 'Pass-through. Confirmed.', 1),
  ('Logistics — Sub-Hire', '4t–6t Truck — Normal Fuel /km', 'km', 25.00, 'L2', 'Pass-through.', 1),
  ('Logistics — Sub-Hire', '4t–6t Truck — High Fuel /km', 'km', 27.00, 'L2', 'Pass-through.', 1),
  ('Logistics — Sub-Hire', '7t–10t Truck — Daily Hire', 'day', 4500, 'L3', 'Pass-through. Confirmed.', 1),
  ('Logistics — Sub-Hire', '7t–10t Truck — Normal Fuel /km', 'km', 27.00, 'L3', 'Pass-through.', 1),
  ('Logistics — Sub-Hire', '7t–10t Truck — High Fuel /km', 'km', 30.00, 'L3', 'Pass-through.', 1),
  ('Logistics — Sub-Hire', '14t Heavy — Daily Hire', 'day', 5500, 'L4', 'Pass-through. v2.0.', 1),
  ('Logistics — Sub-Hire', '14t Heavy — Per KM', 'km', 35.00, 'L4', 'Pass-through. v2.0.', 1);

-- ============================================================================
-- §02 — LABOUR (Mon–Sat 1×, Sun 1.5×, Public Hol 2×)
-- ============================================================================

INSERT INTO rate_card (category, line_item, unit, base_rate, notes, active) VALUES
  ('Labour', 'Setup Labour (Mon–Sat)', 'staff/day', 750, 'Standard. ×1.5 Sun = R1,125 · ×2 Public Hol = R1,500.', 1),
  ('Labour', 'Setup Labour (Sunday)', 'staff/day', 1125, '1.5× multiplier per Rule 2.1.', 1),
  ('Labour', 'Setup Labour (Public Holiday)', 'staff/day', 1500, '2× multiplier per Rule 2.1.', 1),
  ('Labour', 'Breakdown Labour (Mon–Sat)', 'staff/day', 750, 'Standard.', 1),
  ('Labour', 'Breakdown Labour (Sunday)', 'staff/day', 1125, '1.5×.', 1),
  ('Labour', 'Breakdown Labour (Public Holiday)', 'staff/day', 1500, '2×.', 1),
  ('Labour', 'Extra Labour (Mon–Sat)', 'staff/day', 750, 'Standard.', 1),
  ('Labour', 'Extra Labour (Sunday)', 'staff/day', 1125, '1.5×.', 1),
  ('Labour', 'Extra Labour (Public Holiday)', 'staff/day', 1500, '2×.', 1),
  ('Labour', 'Staff to Load / Offload (Mon–Sat)', 'staff/day', 750, 'Standard.', 1),
  ('Labour', 'Staff to Load / Offload (Sunday)', 'staff/day', 1125, '1.5×.', 1),
  ('Labour', 'Staff to Load / Offload (Public Holiday)', 'staff/day', 1500, '2×.', 1);

-- ============================================================================
-- §03 — SPECIALIST ROLES
-- ============================================================================

INSERT INTO rate_card (category, line_item, unit, base_rate, notes, active) VALUES
  ('Specialist Roles', 'Production Manager — Junior', 'day', 2500, 'Per day.', 1),
  ('Specialist Roles', 'Production Manager — Senior', 'day', 3875, 'Per day.', 1),
  ('Specialist Roles', 'Ops Manager — Junior', 'day', 1500, 'Per day.', 1),
  ('Specialist Roles', 'Ops Manager — Senior', 'day', 3750, 'Per day.', 1),
  ('Specialist Roles', 'Carpenter — Junior', 'day', 1500, 'Per day.', 1),
  ('Specialist Roles', 'Carpenter — Senior', 'day', 2500, 'Per day.', 1),
  ('Specialist Roles', 'Technician — Junior', 'day', 1500, 'Per day.', 1),
  ('Specialist Roles', 'Technician — Senior', 'day', 2500, 'Per day.', 1),
  ('Specialist Roles', 'Lighting Operator — Junior', 'day', 1500, 'Per day.', 1),
  ('Specialist Roles', 'Lighting Operator — Senior', 'day', 2500, 'Per day.', 1),
  ('Specialist Roles', 'Security Guard', 'guard/day', 1200, 'Senior tier only.', 1),
  ('Specialist Roles', 'Bouncer (MIB)', 'guard/day', 1850, 'Senior tier only.', 1),
  ('Specialist Roles', 'DJ — House/Internal', 'set (2hr)', 2500, 'Per 2hr set.', 1),
  ('Specialist Roles', 'DJ — Event Flat Rate', 'event', 5000, 'Per event.', 1),
  ('Specialist Roles', 'DJ — Extended/Hourly', 'hour', 1500, 'Per hour.', 1),
  ('Specialist Roles', 'MC — Standard', 'event', 15000, 'Typical (varies).', 1),
  ('Specialist Roles', 'MC — Well Known', 'event', 30000, 'Varies.', 1),
  ('Specialist Roles', 'Promoter (SAS)', 'hour', 235, 'Per hour.', 1),
  ('Specialist Roles', 'Functional Event Staff (SAS)', 'hour', 200, 'Per hour.', 1),
  ('Specialist Roles', 'Spinning Wheel Operator', 'day', 1500, 'Per day.', 1);

-- ============================================================================
-- §04 — EQUIPMENT
-- ============================================================================

INSERT INTO rate_card (category, line_item, unit, base_rate, notes, active) VALUES
  -- Core Equipment
  ('Equipment — Core', 'Bar Package (premium)', 'package', 4500, 'Bundled premium bar.', 1),
  ('Equipment — Core', '12m Bar Door Package', 'package', 4500, 'Bundled.', 1),
  ('Equipment — Core', 'Bench Set (internal stock)', 'set', 280, 'Standard hire.', 1),
  ('Equipment — Core', 'Bench Set (externally sourced)', 'set', 350, 'When stock exceeded.', 1),
  ('Equipment — Core', 'Rubber Base', 'unit', 25, '', 1),
  ('Equipment — Core', 'Equipment Maintenance', 'unit', 600, 'Standard. Scope-dependent variation R250–R1,550 acceptable when justified. See Rule 4.1.', 1),
  ('Equipment — Core', 'Noodle Wall', 'item', 2500, 'Incl touch-ups.', 1),
  ('Equipment — Core', 'Spinning Wheel (standalone)', 'event', 5000, 'Full service.', 1),
  ('Equipment — Core', 'Spinning Wheel (add-on)', 'event', 2500, 'Added to existing event.', 1),
  ('Equipment — Core', 'Generator Hire (5kva)', 'day', 1500, 'Includes fuel.', 1),
  ('Equipment — Core', 'Generator Hire (20kva)', 'day', 5500, 'Includes fuel.', 1),
  ('Equipment — Core', 'Stretch Tent (10m × 12m)', 'item', 16950, 'Outsourced. SAB Owned.', 1),
  ('Equipment — Core', 'Entrance Tunnel', 'item', 10000, 'Single benchmark.', 1),

  -- AV / Sound / Lighting
  ('Equipment — AV/Sound/Lighting', 'Parcan / Battery Parcan', 'item', 250, '', 1),
  ('Equipment — AV/Sound/Lighting', 'LED Parcan (uplighting)', 'item', 200, '', 1),
  ('Equipment — AV/Sound/Lighting', 'Gobo', 'item', 750, '', 1),
  ('Equipment — AV/Sound/Lighting', 'Laser (with logo)', 'item', 1000, '', 1),
  ('Equipment — AV/Sound/Lighting', 'Totem + Feet + Top', 'item', 550, '', 1),
  ('Equipment — AV/Sound/Lighting', 'TV Screen / TV on Totem', 'item', 850, '', 1),
  ('Equipment — AV/Sound/Lighting', 'Truss', 'item', 350, '', 1),
  ('Equipment — AV/Sound/Lighting', 'Evox 12 Speaker', 'unit', 750, '', 1),
  ('Equipment — AV/Sound/Lighting', 'DJ Controller RX3', 'unit', 750, '', 1),
  ('Equipment — AV/Sound/Lighting', 'Radio Mic', 'unit', 250, '', 1),
  ('Equipment — AV/Sound/Lighting', 'LED Tube (6 in a box)', 'unit', 3000, '', 1),
  ('Equipment — AV/Sound/Lighting', 'Lighting Controller', 'item', 500, '', 1),
  ('Equipment — AV/Sound/Lighting', 'Bar Lighting', 'unit', 280, '', 1),
  ('Equipment — AV/Sound/Lighting', 'Festoon Lighting', 'unit', 24, '', 1),

  -- Décor / Specials
  ('Equipment — Décor/Specials', 'Astro Turf (per metre)', 'metre', 45, 'Or R650 per 20m roll.', 1),
  ('Equipment — Décor/Specials', 'Astro Turf (20m roll)', 'roll', 650, '', 1),
  ('Equipment — Décor/Specials', 'Balloon Arch (2× Premium 3m)', 'arch', 5200, '', 1),
  ('Equipment — Décor/Specials', 'Smoke Machine', 'unit', 300, '', 1),
  ('Equipment — Décor/Specials', 'Bubble Machine', 'unit', 500, '', 1),
  ('Equipment — Décor/Specials', 'Confetti', 'unit', 500, '', 1),
  ('Equipment — Décor/Specials', 'UV Light', 'item', 250, '', 1),
  ('Equipment — Décor/Specials', 'Photo Moment', 'item', 5500, '', 1),

  -- Furniture (when charged — see §05)
  ('Equipment — Furniture', 'Cocktail Table (Internal)', 'item', 150, 'Internal source. R0 when in stock — see §05.', 1),
  ('Equipment — Furniture', 'Cocktail Chair (Internal)', 'item', 45, 'Internal source. R0 when in stock — see §05.', 1),
  ('Equipment — Furniture', 'Cafe Table (Internal)', 'item', 135, 'Internal source. R0 when in stock — see §05.', 1),
  ('Equipment — Furniture', 'Cafe Chair (Internal)', 'item', 35, 'Internal source. R0 when in stock — see §05.', 1),
  ('Equipment — Furniture', 'Trestle Table + Cover (Internal)', 'unit', 150, 'Internal source. R0 when in stock — see §05.', 1),
  ('Equipment — Furniture', 'Round Cocktail Table (subcontract)', 'item', 204, 'External source.', 1),
  ('Equipment — Furniture', 'Xavier Barstool (White)', 'item', 113, 'External source.', 1),
  ('Equipment — Furniture', 'Double Seater Couch (White)', 'item', 1350, 'External source.', 1),
  ('Equipment — Furniture', 'Single Seater Couch (White)', 'item', 950, 'External source.', 1),
  ('Equipment — Furniture', 'Coffee Table (White)', 'item', 487, 'External source.', 1),
  ('Equipment — Furniture', 'A-Frame Marquee (10m × 35m)', 'item', 17500, 'External source.', 1),
  ('Equipment — Furniture', 'Snowpeak/Marquee Tent', 'event', 11600, 'External source.', 1);

-- ============================================================================
-- §06 — PRINTING & SIGNAGE  (handbook standard rates)
-- 🔴 A3 Correx red flag: Inkredible R75 vs handbook R45. Cross-quote ≥R5,000.
-- ============================================================================

INSERT INTO rate_card (category, line_item, unit, base_rate, notes, active) VALUES
  ('Printing & Signage', 'Small Poster', 'item', 25, 'Inkredible R25 ✅ matches.', 1),
  ('Printing & Signage', 'A3 Correx', 'item', 45, '⚠ Inkredible bills R75 (+67% breach). Cross-quote both Inkredible & Ink Street ≥R5,000.', 1),
  ('Printing & Signage', 'A3 Red Indemnity (bulk)', 'item', 46, 'Inkredible R46.', 1),
  ('Printing & Signage', 'Large Poster', 'item', 63, 'Handbook standard.', 1),
  ('Printing & Signage', 'A2 Pricing Poster (Correx)', 'item', 92, 'Handbook R92 ✅ Inkredible R92 ✅', 1),
  ('Printing & Signage', 'A1 Red Indemnity Poster', 'item', 115, 'Handbook standard.', 1),
  ('Printing & Signage', 'A1 Pricing Board (Correx)', 'item', 165, 'Handbook standard.', 1),
  ('Printing & Signage', 'Fridge Header Board (ABS) — low', 'item', 205, 'Range R205–R208.', 1),
  ('Printing & Signage', 'Fridge Header Board (ABS) — high', 'item', 208, 'Range R205–R208.', 1),
  ('Printing & Signage', 'Bar Signs Foamboard (2450×1225)', 'item', 1850, '', 1),
  ('Printing & Signage', 'Wall Decal (2400×2850)', 'item', 3762, '', 1),
  ('Printing & Signage', 'Protestor Poster (with dowel)', 'item', 131.25, 'Inkredible price.', 1),
  ('Printing & Signage', 'Protestor Poster (no dowel)', 'item', 92, 'Inkredible price.', 1),
  ('Printing & Signage', 'Table Decals (white/black)', 'item', 15.63, 'Inkredible & Ink Street both R15.63 ✅', 1),
  ('Printing & Signage', 'Flat Delivery Fee (small print)', 'job', 650, '3+ quotes confirm.', 1),
  ('Printing & Signage', 'IP Local Delivery', 'job', 175, 'Short distance.', 1),
  ('Printing & Signage', 'Travelling/Installation/Consultation — low', 'scope', 3088, 'Range R3,088–R9,850. Variable by scope.', 1),
  ('Printing & Signage', 'Travelling/Installation/Consultation — high', 'scope', 9850, 'Range R3,088–R9,850. Variable by scope.', 1);

-- ============================================================================
-- §07 — OTHER COSTS
-- ============================================================================

INSERT INTO rate_card (category, line_item, unit, base_rate, notes, active) VALUES
  ('Other Costs', 'Accommodation — In Season (peak/Dec/festivals — truck accessible)', 'room/person/night', 2050, 'Peak events, December, festivals, big weekends.', 1),
  ('Other Costs', 'Accommodation — Out of Season (truck accessible)', 'room/person/night', 1290, 'Normal months.', 1),
  ('Other Costs', 'Per Diem (standard)', 'staff/day', 225, 'Formula: rate × N staff × M days. Show all three numbers in description. See Rule 7.1.', 1),
  ('Other Costs', 'Per Diem (selected jobs)', 'staff/day', 250, 'BB discretion.', 1),
  ('Other Costs', 'Site Visit', 'visit', 750, '', 1),
  ('Other Costs', 'Courier — Local', 'shipment', 218.50, '', 1),
  ('Other Costs', 'Courier — Long Distance (e.g. CPT)', 'shipment', 2500, '', 1),
  ('Other Costs', 'Service Fee (admin)', 'service', 276, '', 1),
  ('Other Costs', 'Cross Border Permit', 'permit', 12000, '', 1),
  ('Other Costs', 'Certificate of Roadworthy', 'certificate', 1782.50, '', 1),
  ('Other Costs', 'Music Bus Event Package', 'event', 4000, '', 1),
  ('Other Costs', 'Third-Party Supplier Charge', 'package', 0, 'At cost — variable.', 1);

-- ============================================================================
-- §08 — DISBURSEMENT / MANAGEMENT FEE
-- ============================================================================

INSERT INTO rate_card (category, line_item, unit, base_rate, notes, active) VALUES
  ('Disbursement', 'Disbursement Fee — PIR (Price-It-Right)', 'percentage', 10.00, 'Floor R625 minimum. Quote header mentions PIR. Formula: MAX(subtotal × 10%, 625).', 1),
  ('Disbursement', 'Disbursement Fee — SAB/Breweries (standard)', 'percentage', 12.50, 'Floor R625 minimum. Default for all SAB jobs without PIR mention.', 1),
  ('Disbursement', 'Disbursement Fee — Other Clients (standard)', 'percentage', 12.50, 'Floor R625 minimum. Default.', 1),
  ('Disbursement', 'Disbursement Floor (minimum)', 'quote', 625, 'BB ruling 05 May 2026: floor wins over %. NO manual override below R625.', 1);

-- ============================================================================
-- §09 — LAST-MINUTE SURCHARGE
-- ============================================================================

INSERT INTO rate_card (category, line_item, unit, base_rate, notes, active) VALUES
  ('Surcharges', 'Last-Minute Surcharge (< 48hr)', 'percentage', 20.00, '+20% on TOTAL quote value if booked < 48 hours before event. Applied AFTER day-type multipliers; stacks, does not replace.', 1);

-- ============================================================================
-- §11 — VAT
-- ============================================================================

INSERT INTO rate_card (category, line_item, unit, base_rate, notes, active) VALUES
  ('VAT', 'VAT — South African clients', 'percentage', 15.00, 'Standard.', 1),
  ('VAT', 'VAT — Eswatini / Cross-border', 'percentage', 0.00, 'Zero-rated.', 1);

-- ============================================================================
-- ── 3. INSERT RULES INTO rate_card_rules ────────────────────────────────────
-- ============================================================================

INSERT INTO rate_card_rules (section, rule_code, title, body, severity) VALUES

  -- §01 Logistics
  ('§01', '1.1', 'Bakkie KM Rate',
    'R20/km on normal fuel days. R24/km on high-fuel days. R10/km is WRONG — flagged in audit (QUO0009929 = R2,080 leak). Never quote bakkie below R20/km.',
    'critical'),
  ('§01', '1.2', 'Driver Day Rate',
    'Standard R850/day. Overtime / after-hours R950/day. R750 is WRONG — that is the setup labour rate. 4 quote breaches in audit (QUO0009802, 0009835, 0009841). Driver is NEVER R750.',
    'critical'),
  ('§01', '1.3', 'Branded Truck Stack',
    'Castle Lager truck (FC89PNGP) and VE Truck (DM29KPGP) are charged at L2/L4 base hire PLUS the R10,000/event/day branded-truck premium. Don''t double-charge or miss the base hire — the R10k is the branding licence, the daily is the vehicle.',
    'warning'),
  ('§01', '1.4', 'Logistics Mode Rules',
    'Delivery & Collection: one-way × 2, 2 drivers, 1 delivery + 1 collection day. Delivery Only: one-way, 1 driver, 1 day. Collection Only: one-way, 1 driver, 1 day.',
    'info'),

  -- §02 Labour
  ('§02', '2.1', 'Day-Type Multipliers',
    'Mon–Sat: 1.0×. Sunday: 1.5×. Public Holiday: 2.0×. Multiplier applies to setup, breakdown, and all extra labour. Specialist roles (PM, Carpenter, etc.) carry their own day rate; multiplier is by exception.',
    'info'),
  ('§02', '2.2', 'Last-Minute Surcharge',
    '+20% on TOTAL quote value if booked < 48 hours before event. Applied AFTER the day-type multiplier. Stacks; does not replace.',
    'warning'),

  -- §04 Equipment
  ('§04', '4.1', 'Equipment Maintenance',
    'Standard rate R600/unit. Scope-dependent variation (R250–R1,550) is acceptable when justified by the work. R600 is the default; deviations need a note in the line item.',
    'info'),

  -- §05 Internal Stock
  ('§05', NULL, 'Internal Stock at R0',
    'Categories at R0 when in stock: Bars & Bar Equipment (Bar/Back Bar/Speed Bar, Bar Wrap, Counter Tops & Bottoms, CDM Wooden Bars); Furniture (Bench Set, Cafe Table/Chair, Cocktail Table/Chair, Conversation Table/Chair, High Sharing Table, Lounge Pod); Branding & Signage (Branded/MXD Arch, Letter Sets, Pull-up Banners, Wall Banners, Feather Banners, Flags, Fence Wrap, Light Box); Equipment (Fridge, Ice Bucket/Bin, Charging Station, Gazebo, DJ Booth, Stanchion Poles+Ropes, Throne, Umbrella); Activation/Lighting (Games Unit, Spinning Wheel, Inflatable Target, Rugby Ball, LED Light/Table Art); Décor (Green Carpet, Artificial Plants); Apparel/Consumable (Branded Staff Shirt, Cup). When stock is exceeded → externally sourced becomes priced.',
    'info'),
  ('§05', NULL, 'Budweiser DELISTED',
    'Budweiser is delisted across all B&W stock. Confirmed by BB 04 May 2026. Zero rows in Master Inventory v1.0. Do not quote.',
    'critical'),

  -- §06 Printing
  ('§06', NULL, 'A3 Correx Cross-Quote Rule',
    'Handbook standard R45. Inkredible Print bills R75 (+67% breach) — RED FLAG. Cross-quote both Inkredible and Ink Street for every print job ≥ R5,000. Prefer Ink Street for VAT-reclaim where matched.',
    'flag'),

  -- §07 Other Costs
  ('§07', '7.1', 'Per Diem Allowance',
    'R225 per staff per day. R250 on selected jobs (BB discretion). Total = rate × N staff × M days. Always show all three numbers in the description: e.g. ''Per Diems @R225/day × 5 staff × 3 days = R3,375''.',
    'info'),

  -- §08 Disbursement
  ('§08', '8.1', 'Disbursement Rates & Floor',
    'PIR contracts: 10%. Standard (SAB/Breweries/other): 12.5%. Floor R625 applies in ALL cases. Formula: disbursement = MAX(subtotal × fee_rate, 625). BB ruling 05 May 2026: FLOOR WINS over %.',
    'critical'),
  ('§08', '8.2', 'When Disbursement Is NOT Applied',
    'NO disbursement on: Deposit/Balance Payments, Additionals to existing events, Pure Logistics/Stock Movements, Replacement Purchases, Retainer Contracts, Multi-Venue Bundled, At ABInBev''s Own Premises, Artist/Performer Fees, Asset Sale/Purchase. YES on: Full Event Setup, Printing/Production, Subcontractor Pass-Through (B&W portion only).',
    'warning'),
  ('§08', NULL, 'Live Issue — R625 Floor Not Operational',
    'Audit found 21 quotes Oct 2025–Apr 2026 charging disbursement below R625. Most recent: QUO0010181 on 29 Apr 2026 (R405 charged, R625 due — R220 leak). Total leak: R5,419. Action: every quote must set disbursement = MAX(subtotal × rate, 625). NO manual override below R625.',
    'flag'),

  -- §10 Payment Terms
  ('§10', NULL, 'Payment Terms',
    'ABInBev/SAB: 90 days from invoice. Other clients (standard): 50% deposit upfront + balance before event. Established relationships: flexible at CEO discretion.',
    'info'),
  ('§10', NULL, 'Standard T&Cs',
    'Cancellation: 50% if setup personnel/vehicles have commenced preparations. Damage/shortage reporting: within 48 hours of handover. Theft/breakage: replacement falls on booking party/client. Event security: client responsibility — stated as vital on every quote.',
    'info'),

  -- §11 VAT
  ('§11', NULL, 'VAT Rules',
    'South African clients: 15%. Eswatini/cross-border clients: 0%. B&W Productions VAT No: 4790261301.',
    'info'),

  -- §12 Public Holidays
  ('§12', NULL, 'SA Public Holidays 2026 (2× labour)',
    '1 Jan New Year''s Day · 21 Mar Human Rights Day · 3 Apr Good Friday · 6 Apr Family Day · 27 Apr Freedom Day · 1 May Workers'' Day · 16 Jun Youth Day · 9 Aug Women''s Day (Sunday — Mon 10 Aug also observed) · 10 Aug Public Holiday substitute · 24 Sep Heritage Day · 16 Dec Day of Reconciliation · 25 Dec Christmas Day · 26 Dec Day of Goodwill. Sunday-Holiday Rule: if a public holiday falls on Sunday, following Monday is also observed (2× labour both days).',
    'info'),

  -- §14 Pass-Through (NEW in v2.0)
  ('§14', '14.1', 'Artist Fees Are Pass-Through',
    'Artist/performer fees on PIR and festival jobs are pass-through at cost. Disbursement % does NOT apply to the artist portion. Apply % only to B&W''s production work alongside the artist booking. Audit example: Ramfest at R1,085,000 was correctly recorded; do not apply 10% markup retrospectively.',
    'critical'),
  ('§14', '14.2', 'Don''t Lose Margin on Specialist Subs',
    'Robust Creative (William Hindle Media) sometimes invoices for Nick Lusso, Lovable SaaS, etc. as pass-through. These STILL CARRY B&W''s standard 10–12.5% disbursement on top — they are not free of markup like artist fees. Don''t conflate the two categories. Per Master Prompt v2.0 red flag #7.',
    'warning'),
  ('§14', NULL, 'Pass-Through Categories',
    'Artist/Performer Fees → pass-through at cost, NO % markup. Supplier Pass-Through (named, e.g. Nick Lusso, Lovable SaaS) → pass-through at cost, apply standard % per §08. Festival Production Pass-Through (Ramfest equipment) → itemise separately, apply % only on B&W''s portion. Permits/Roadworthy/Cross-Border → pass-through at cost, NO % markup. Specialist Subcontractor (Robust, Werner Fetke etc.) → apply standard % per §08, NOT no-markup.',
    'warning'),

  -- §15 Active Red Flags
  ('§15', NULL, 'Active Red Flag — Disbursement Floor Breach',
    '21 quotes Oct 2025–Apr 2026 below R625 floor. Most recent QUO0010181 (29 Apr 2026). Status: 🔴 Live.',
    'flag'),
  ('§15', NULL, 'Active Red Flag — A3 Correx 67% Breach',
    'Inkredible bills R75 vs handbook R45. Status: 🔴 Live — needs IS quote.',
    'flag'),
  ('§15', NULL, 'Active Red Flag — Inkredible Print 0% VAT',
    'Charging 0% on R167k+ to SA clients. ~R21k unreclaimed input VAT. Status: 🔴 Live — request VRA01.',
    'flag'),
  ('§15', NULL, 'Active Red Flag — ST Umbrella Under-Billing',
    'Branding cost not always passed to client. Revenue leak. Status: 🔴 Live — audit SAB/SD invoices.',
    'flag'),
  ('§15', NULL, 'Active Red Flag — Events Guys 7d vs 60d Terms',
    'Agreed 60d, invoices show 7d. R293,795 AP ambiguity. Status: 🔴 Live — resolve in writing.',
    'flag'),
  ('§15', NULL, 'Historic — Driver R750/day error',
    '4 lines on 3 quotes (QUO0009802, 0009835, 0009841) — confused with setup labour. Status: 🟡 Historic, watch for recurrence.',
    'warning'),
  ('§15', NULL, 'Resolved — Bakkie R10/km error',
    'QUO0009929 (Nov 2025) — single typo, R2,080 leak. Status: 🔴 Resolved (one-off).',
    'warning'),
  ('§15', NULL, 'Reissue — SKI VAT 14% on 3 invoices',
    'Should be 15%. Under-reclaimed ~R1,254.17 input VAT. Status: 🟠 Reissue request.',
    'warning'),

  -- §16 Quote Template
  ('§16', NULL, 'Standard Quote Template',
    'Header: Quote No (auto QUO00XXXXX) · Reference · Date · Due Date · Sales Rep · From: B&W Productions CC · To: Client + VAT + Address. Line 1: Header description at R0.00 (event label only). Lines 2–N: Description · Qty · Unit Price · Disc% · VAT% · Excl Total · Incl Total. Disbursement line: Always after line items. Description: ''Disbursement Fee''. Qty 1, calculated per §08 (MAX of % or R625). Totals: Total Discount · Total Exclusive · Total VAT · Grand Total · Balance Due. Footer: Bernie 0823216520 · Bibi 0729850426 · T&Cs per §10.',
    'info'),

  -- Versioning
  ('META', NULL, 'Handbook v2.0 Approval & Versioning',
    'Document: BW Productions Master Rules Handbook v2.0. Effective: 05 May 2026. Supersedes: v1.0 (Genspark, 12 April 2026). Owner: Bibi Burness, CEO. Audit basis: 332 unique quotes (Oct 2025 – May 2026), 3,166 line items, 99.7% reconciliation. Next review: 01 August 2026 (or sooner on material rule change). Distribution: Internal only. Not for client distribution.',
    'info');
