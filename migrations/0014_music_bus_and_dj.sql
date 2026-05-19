-- ───────────────────────────────────────────────────────────────────────────
-- Migration 0014: Music Bus + DJ Drivers (Outlet 360 fleet)
-- ───────────────────────────────────────────────────────────────────────────
-- Adds two completely isolated fleet/driver lists for the Music Bus and DJ
-- inspection apps. These are separate from the B&W field_vehicles list so
-- music-bus drivers never see B&W vehicles and vice versa.
--
-- Two new tables (mirrored shape for music_bus and dj):
--   music_bus_vehicles  /  dj_vehicles
--   music_bus_drivers   /  dj_drivers
--
-- Inspections submit into the existing field_submissions table with a new
-- form_type value ('musicbus_inspection' / 'dj_inspection') so all the
-- existing PDF/PNG/WhatsApp/Open-Graph infrastructure works automatically.
-- ───────────────────────────────────────────────────────────────────────────

-- ─── MUSIC BUS VEHICLES ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS music_bus_vehicles (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  reg_number    TEXT NOT NULL UNIQUE,
  description   TEXT,                       -- e.g. "Toyota Quantum 2.8 LWB"
  region        TEXT,                       -- Free State / Gauteng / Limpopo / Mpumalanga / North West / Northern Cape / East Coast
  home_location TEXT,                       -- e.g. "Welkom", "Bethlehem"
  notes         TEXT,                       -- "Written off", "In repairs", etc.
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_music_bus_vehicles_region ON music_bus_vehicles(region);
CREATE INDEX IF NOT EXISTS idx_music_bus_vehicles_active ON music_bus_vehicles(active);

-- ─── MUSIC BUS DRIVERS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS music_bus_drivers (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  name               TEXT NOT NULL UNIQUE,
  phone              TEXT,                  -- cell number
  region             TEXT,                  -- region they're based in
  default_vehicle_id INTEGER,               -- FK to music_bus_vehicles (their usual bus)
  active             INTEGER NOT NULL DEFAULT 1,
  created_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (default_vehicle_id) REFERENCES music_bus_vehicles(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_music_bus_drivers_region ON music_bus_drivers(region);
CREATE INDEX IF NOT EXISTS idx_music_bus_drivers_active ON music_bus_drivers(active);

-- ─── DJ VEHICLES ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dj_vehicles (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  reg_number    TEXT NOT NULL UNIQUE,
  description   TEXT,
  region        TEXT,
  home_location TEXT,
  notes         TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dj_vehicles_region ON dj_vehicles(region);
CREATE INDEX IF NOT EXISTS idx_dj_vehicles_active ON dj_vehicles(active);

-- ─── DJ DRIVERS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dj_drivers (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  name               TEXT NOT NULL UNIQUE,
  phone              TEXT,
  region             TEXT,
  default_vehicle_id INTEGER,
  active             INTEGER NOT NULL DEFAULT 1,
  created_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (default_vehicle_id) REFERENCES dj_vehicles(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_dj_drivers_region ON dj_drivers(region);
CREATE INDEX IF NOT EXISTS idx_dj_drivers_active ON dj_drivers(active);

-- ─── SEED: MUSIC BUS VEHICLES (30 entries) ─────────────────────────────────
-- Order matches the spreadsheet sources (Central, Inland, East Coast)
INSERT OR IGNORE INTO music_bus_vehicles (reg_number, description, region, home_location, notes) VALUES
  -- Central / Free State
  ('CPV962FS',   'Mercedes-Benz Sprinter 413D',   'Free State',    'Welkom',                ''),
  ('HGG547FS',   'VW Caddy 1.6 Panel Van',        'Free State',    'Bethlehem',             ''),
  ('KJ11BGGP',   'Toyota Quantum 2.8 LWB',        'Free State',    'Bloemfontein',          'Audio controller needed'),
  ('CLV384FS',   'Mercedes-Benz Sprinter',         'Free State',    'Bloemfontein',          'In repairs'),
  -- North West / Northern Cape
  ('KJ11BKGP',   'Toyota Quantum 2.8 LWB',        'North West',    'Potchefstroom',         'Wooden partition water damage'),
  ('CLV387FS',   'Mercedes-Benz Sprinter 413D',   'Northern Cape', 'Hartswater',            'Still in repairs'),
  ('JF24GZGP',   'Toyota Quantum 2.8 SLWB',       'Northern Cape', 'Kimberley',             ''),
  ('DZC854NW',   'Mercedes-Benz Sprinter 413D',   'North West',    'Rustenburg',            ''),
  ('FLR882FS',   'VW Crafter',                     'North West',    'Mafikeng',              'Fuel card sent to SAB BFN depot (Att: Jabu Mbhele)'),
  ('111SABNW',   'Mercedes-Benz Sprinter 413D',   'Northern Cape', 'Kuruman',               'Written off'),
  -- Gauteng / Inland
  ('JD99ZGGP',   'Toyota Quantum 2.8 LWB',        'Gauteng',       'Vereeniging',           ''),
  ('JD66KKGP',   'Toyota Quantum',                 'Limpopo',       'Limpopo / Tzaneen',     ''),
  ('JF24HCGP',   'Toyota Quantum',                 'Limpopo',       'Limpopo',               ''),
  ('KW86YNGP',   'Isuzu Bakkie',                   'Limpopo',       'Tzaneen',               ''),
  ('KJ11BCGP',   'Toyota Quantum',                 'Mpumalanga',    'Witbank / Lowveld',     ''),
  ('JF44XDGP',   'Toyota Quantum',                 'Gauteng',       'Odi / Garankua',        ''),
  ('XHN570GP',   'Toyota Dyna 7-105 / Hino',       'Gauteng',       'Tshwane',               ''),
  ('JF64SDGP',   'Toyota Quantum',                 'Mpumalanga',    'Mpumalanga / Nelspruit',''),
  -- East Coast (KZN + Eastern Cape, single region per Bibi)
  ('BL28ZLZN',   'Iveco 50C15V15 PV (Mthatha bus)','East Coast',    'Mthatha',               'Currently using Bevurn vehicle'),
  ('BN43YHZN',   'Iveco 50C15V15 PV (Bevurn)',    'East Coast',    'East Coast',            ''),
  ('JG28ZSGP',   'Toyota Quantum',                 'East Coast',    'East Coast',            ''),
  ('KJ10ZYGP',   'Toyota Quantum 2.5',             'East Coast',    'Durban + Mthatha',      'Roams between two cities'),
  ('BL28WYZN',   'Iveco 50C15V15 PV',              'East Coast',    'KZN',                   'Card pending (Lindo)'),
  ('BW55TZMP',   'Hino 300 814 WB',                'East Coast',    'KZN',                   'Card pending (Lindo)'),
  ('CP91HFZH',   'Hino 300 714 LWB FC',            'East Coast',    'KZN',                   'Card pending (Lindo)');

-- ─── SEED: MUSIC BUS DRIVERS (27 entries) ──────────────────────────────────
-- Names from the spreadsheet (Central + Inland + East Coast).
-- Ladies' names removed per Bibi's instruction (none found in source data).
INSERT OR IGNORE INTO music_bus_drivers (name, phone, region) VALUES
  -- Central
  ('Mosia Letsie',        NULL,         'Free State'),
  ('Pule Mokoena',        NULL,         'Free State'),
  ('Thato Ramaphiri',     NULL,         'Free State'),
  ('Johannes Molefe',     NULL,         'North West'),
  ('Ishmael Moss',        NULL,         'Northern Cape'),
  ('Siya Mbobo',          NULL,         'Northern Cape'),
  ('Karolo Kgarodi',      NULL,         'North West'),
  ('Tlotlo Gaebee',       NULL,         'North West'),
  ('Eugene Kadi',         NULL,         'Northern Cape'),
  ('Robert Lefu Makibi',  NULL,         'Gauteng'),
  -- Inland
  ('Theipa',              '0789236300', 'Limpopo'),
  ('Errol Draught',       '0606484432', 'Limpopo'),
  ('Vegas',               '0727965189', 'Limpopo'),
  ('Oupa',                '0763662912', 'Mpumalanga'),
  ('Daniel',              '0824333512', 'Gauteng'),
  ('Esrom',               '0825835173', 'Gauteng'),
  ('Joshua/Bheki',        '0717401070', 'Mpumalanga'),
  -- East Coast (from Bibi's latest message)
  ('Ndamase',             NULL,         'East Coast'),
  ('Xaba',                NULL,         'East Coast'),
  ('Simphiwe',            NULL,         'East Coast'),
  ('Stofun',              NULL,         'East Coast'),
  ('PEX',                 NULL,         'East Coast');

-- ─── DEFAULT VEHICLE LINKS ─────────────────────────────────────────────────
-- Link each driver to their primary vehicle so dropdown auto-fills on the
-- public landing page. Done via separate UPDATEs because we need the FK ids
-- after the inserts complete.
UPDATE music_bus_drivers SET default_vehicle_id = (SELECT id FROM music_bus_vehicles WHERE reg_number='CPV962FS') WHERE name='Mosia Letsie';
UPDATE music_bus_drivers SET default_vehicle_id = (SELECT id FROM music_bus_vehicles WHERE reg_number='HGG547FS') WHERE name='Pule Mokoena';
UPDATE music_bus_drivers SET default_vehicle_id = (SELECT id FROM music_bus_vehicles WHERE reg_number='KJ11BGGP') WHERE name='Thato Ramaphiri';
UPDATE music_bus_drivers SET default_vehicle_id = (SELECT id FROM music_bus_vehicles WHERE reg_number='KJ11BKGP') WHERE name='Johannes Molefe';
UPDATE music_bus_drivers SET default_vehicle_id = (SELECT id FROM music_bus_vehicles WHERE reg_number='CLV387FS') WHERE name='Ishmael Moss';
UPDATE music_bus_drivers SET default_vehicle_id = (SELECT id FROM music_bus_vehicles WHERE reg_number='JF24GZGP') WHERE name='Siya Mbobo';
UPDATE music_bus_drivers SET default_vehicle_id = (SELECT id FROM music_bus_vehicles WHERE reg_number='DZC854NW') WHERE name='Karolo Kgarodi';
UPDATE music_bus_drivers SET default_vehicle_id = (SELECT id FROM music_bus_vehicles WHERE reg_number='FLR882FS') WHERE name='Tlotlo Gaebee';
UPDATE music_bus_drivers SET default_vehicle_id = (SELECT id FROM music_bus_vehicles WHERE reg_number='111SABNW') WHERE name='Eugene Kadi';
UPDATE music_bus_drivers SET default_vehicle_id = (SELECT id FROM music_bus_vehicles WHERE reg_number='JD99ZGGP') WHERE name='Robert Lefu Makibi';
UPDATE music_bus_drivers SET default_vehicle_id = (SELECT id FROM music_bus_vehicles WHERE reg_number='JD66KKGP') WHERE name='Theipa';
UPDATE music_bus_drivers SET default_vehicle_id = (SELECT id FROM music_bus_vehicles WHERE reg_number='JF24HCGP') WHERE name='Errol Draught';
UPDATE music_bus_drivers SET default_vehicle_id = (SELECT id FROM music_bus_vehicles WHERE reg_number='KW86YNGP') WHERE name='Vegas';
UPDATE music_bus_drivers SET default_vehicle_id = (SELECT id FROM music_bus_vehicles WHERE reg_number='KJ11BCGP') WHERE name='Oupa';
UPDATE music_bus_drivers SET default_vehicle_id = (SELECT id FROM music_bus_vehicles WHERE reg_number='JF44XDGP') WHERE name='Daniel';
UPDATE music_bus_drivers SET default_vehicle_id = (SELECT id FROM music_bus_vehicles WHERE reg_number='XHN570GP') WHERE name='Esrom';
UPDATE music_bus_drivers SET default_vehicle_id = (SELECT id FROM music_bus_vehicles WHERE reg_number='JF64SDGP') WHERE name='Joshua/Bheki';
-- East Coast: Ndamase & Xaba share BL28ZLZN (Mthatha bus)
UPDATE music_bus_drivers SET default_vehicle_id = (SELECT id FROM music_bus_vehicles WHERE reg_number='BL28ZLZN') WHERE name='Ndamase';
UPDATE music_bus_drivers SET default_vehicle_id = (SELECT id FROM music_bus_vehicles WHERE reg_number='BL28ZLZN') WHERE name='Xaba';
UPDATE music_bus_drivers SET default_vehicle_id = (SELECT id FROM music_bus_vehicles WHERE reg_number='BN43YHZN') WHERE name='Simphiwe';
UPDATE music_bus_drivers SET default_vehicle_id = (SELECT id FROM music_bus_vehicles WHERE reg_number='JG28ZSGP') WHERE name='Stofun';
UPDATE music_bus_drivers SET default_vehicle_id = (SELECT id FROM music_bus_vehicles WHERE reg_number='KJ10ZYGP') WHERE name='PEX';

-- ─── DEACTIVATE WRITTEN-OFF / RETIRED VEHICLES ─────────────────────────────
-- Kuruman bus is written off — keep in DB for historical reports, hide from dropdown
UPDATE music_bus_vehicles SET active=0 WHERE reg_number='111SABNW';
-- Eugene Kadi has no working vehicle — keep name visible, just no auto-vehicle
UPDATE music_bus_drivers SET default_vehicle_id=NULL WHERE name='Eugene Kadi';

-- ─── CONFIG SEEDS ──────────────────────────────────────────────────────────
-- For region/owner labels used in the damages report
INSERT OR IGNORE INTO field_system_config (key, value) VALUES
  ('musicbus_inspection_pin', ''),
  ('djdrivers_inspection_pin', ''),
  ('musicbus_app_label', 'Outlet 360 — Music Bus Inspection'),
  ('djdrivers_app_label', 'Outlet 360 — DJ Drivers Inspection');
