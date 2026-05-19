-- Field Operations App — B&W Productions
-- Migration 0002

-- People list (drivers, prepared-by)
CREATE TABLE IF NOT EXISTS field_people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  active INTEGER DEFAULT 1,
  is_default INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed canonical people list
INSERT OR IGNORE INTO field_people (name, is_default) VALUES
  ('Shane', 1),
  ('Bibi', 0),
  ('Patrick', 0),
  ('Thandi', 0),
  ('Tina', 0),
  ('Erance', 0),
  ('Isaac', 0),
  ('Eric', 0),
  ('Solly', 0),
  ('Sipho', 0),
  ('Jay', 0),
  ('Orthana Nanny', 0),
  ('Tucker', 0),
  ('Daniel', 0),
  ('Joshua', 0);

-- Master items list with category
CREATE TABLE IF NOT EXISTS field_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  aliases TEXT,
  active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed master items
INSERT OR IGNORE INTO field_items (category, name) VALUES
  ('Umbrellas','Umbrella — Stella'),
  ('Umbrellas','Umbrella — Castle Lite'),
  ('Umbrellas','Umbrella — Castle Lager'),
  ('Umbrellas','Umbrella — MxD'),
  ('Umbrellas','Umbrella — Carling Black Label'),
  ('Umbrellas','Umbrella — Hansa'),
  ('Umbrellas','Umbrella — Flying Fish'),
  ('Umbrellas','Umbrella — Corona'),
  ('Umbrellas','Umbrella — Brutal Fruit'),
  ('Umbrellas','Umbrella — Generic'),
  ('Umbrellas','Umbrella Base — Rubber'),
  ('Umbrellas','Umbrella Base — Concrete'),
  ('Furniture','Bench Set'),
  ('Furniture','Couch — 3 Seater'),
  ('Furniture','Couch — 2 Seater'),
  ('Furniture','Couch — 1 Seater'),
  ('Furniture','Cushions'),
  ('Furniture','Lounge Pod Set (3+2+1 + Coffee Table)'),
  ('Furniture','Cafe Table'),
  ('Furniture','Cafe Chair'),
  ('Furniture','Cafe Round Table'),
  ('Furniture','Side Table'),
  ('Furniture','Conversation Table'),
  ('Furniture','Cocktail Chair'),
  ('Furniture','Coffee Table'),
  ('Furniture','Trestle Table'),
  ('Furniture','Welcome Mat'),
  ('Furniture','Branded Runner'),
  ('Furniture','Rug'),
  ('Furniture','Carpet'),
  ('Furniture','Red Carpet'),
  ('Furniture','60-Seater Wooden Furniture Set'),
  ('Furniture','Set of Couch Pockets'),
  ('Furniture','Scatter Pillows'),
  ('Furniture','Blue Mat'),
  ('Structures','Gazebo'),
  ('Structures','Stretch Tent 10x15m'),
  ('Structures','Stage'),
  ('Structures','DJ Booth'),
  ('Structures','Photo Moment + Couch'),
  ('Structures','Throne'),
  ('Structures','Big White Throne (Snowflake)'),
  ('Structures','Side Table for Throne'),
  ('Structures','Entrance Arch + Lights'),
  ('Structures','Wall Banner / Media Wall 3mx2m'),
  ('Structures','Backwall'),
  ('Structures','Pool Noodle Wall'),
  ('Structures','Set Truss 3m'),
  ('Structures','Telescopics + Bases'),
  ('Structures','Totem Truss'),
  ('Structures','2m Totems with Stands'),
  ('Structures','Tower Poles'),
  ('Bar','Speed Bar'),
  ('Bar','Speed Bar Wrap'),
  ('Bar','Premium Bar'),
  ('Bar','Premium Bar with Fronts'),
  ('Bar','Premium Bar Fronts'),
  ('Bar','Premium Front Bar'),
  ('Bar','Back of Bar'),
  ('Bar','LED Back of Bar'),
  ('Bar','Bar Counter'),
  ('Bar','Bar Counter Top'),
  ('Bar','Bar Counter Bottom'),
  ('Bar','Bar Door 16/16'),
  ('Bar','Steel Tops'),
  ('Bar','4m Premium Bar with Back of Bar'),
  ('Bar','CBL DJ Box'),
  ('Bar','CBL Setup'),
  ('Bar','Premium CBL DJ Box'),
  ('Cold Storage','Fridge'),
  ('Cold Storage','MxD Fridge'),
  ('Cold Storage','Ice Bin'),
  ('Cold Storage','Ice Bucket'),
  ('Cold Storage','MxD Ice Bucket'),
  ('Branding & Signage','Pull-up Banner'),
  ('Branding & Signage','Wall Banner / Media Wall'),
  ('Branding & Signage','Feather Banner / Teardrop / Flag'),
  ('Branding & Signage','Hanging Banner 1m'),
  ('Branding & Signage','Hanging Banner 2m'),
  ('Branding & Signage','Set of Letters'),
  ('Branding & Signage','Castle Lite Letters'),
  ('Branding & Signage','Bar Wrap — Castle Lite'),
  ('Branding & Signage','Bar Wrap — Castle Lager'),
  ('Branding & Signage','Bar Wrap — MxD'),
  ('Branding & Signage','Bar Wrap — Generic'),
  ('Branding & Signage','Wristbands'),
  ('Branding & Signage','Sticker Pack'),
  ('Branding & Signage','T-Shirts'),
  ('Branding & Signage','16GB Memory Sticks'),
  ('Branding & Signage','Drink Vouchers'),
  ('Branding & Signage','Promoter Outfits'),
  ('Branding & Signage','Graffiti Wall'),
  ('Branding & Signage','PIR Branded Clothing'),
  ('Branding & Signage','SAB Shop Signage'),
  ('Branding & Signage','Welcome to Retailer Signage'),
  ('Branding & Signage','Table Talkers'),
  ('Lighting & AV','Moving Heads'),
  ('Lighting & AV','Gobo Lights'),
  ('Lighting & AV','Globe Lights'),
  ('Lighting & AV','Clay Party (Gobo)'),
  ('Lighting & AV','UV Lights'),
  ('Lighting & AV','Tube Lights'),
  ('Lighting & AV','Parcans'),
  ('Lighting & AV','Battery Parcans'),
  ('Lighting & AV','Hazer'),
  ('Lighting & AV','Smoke Machine + Liquid'),
  ('Lighting & AV','Steamer'),
  ('Lighting & AV','LED Screen'),
  ('Lighting & AV','LED Bar'),
  ('Lighting & AV','LED Table Art'),
  ('Lighting & AV','Sound Equipment'),
  ('Lighting & AV','PA System'),
  ('Lighting & AV','Mic Cables'),
  ('Lighting & AV','Mics + Receivers'),
  ('Lighting & AV','JBL SRX Speakers'),
  ('Lighting & AV','Event Lighting'),
  ('Lighting & AV','Stage Lighting'),
  ('Lighting & AV','Fishing Gut (Rigging)'),
  ('Lighting & AV','55" TV Screen'),
  ('Crowd Control','Stanchion Poles — Silver'),
  ('Crowd Control','Stanchion Poles — Standard'),
  ('Crowd Control','Stanchion Rope — Red'),
  ('Crowd Control','Stanchion Rope — White'),
  ('Crowd Control','Stanchion Rope — Green'),
  ('Crowd Control','Red Ropes'),
  ('Crowd Control','Extension Poles'),
  ('Crowd Control','Picket Fence Panels'),
  ('Power','Multiplugs'),
  ('Power','20m Extension'),
  ('Power','Kettle Plugs'),
  ('Power','Bunded Generator'),
  ('Power','Fuel Card'),
  ('Activations & Games','MxD Spinning Wheel'),
  ('Activations & Games','Plinka Machine'),
  ('Activations & Games','Push Button Game'),
  ('Activations & Games','View Finder'),
  ('Activations & Games','Kiosk Box + Prizes'),
  ('Activations & Games','Tromel Draw Drum'),
  ('Activations & Games','3-Bowl Slush Machine'),
  ('Activations & Games','Cups + Straws'),
  ('Activations & Games','Donkey Kong Arcade'),
  ('Activations & Games','Super Mario Arcade'),
  ('Activations & Games','Pac-Man Arcade'),
  ('Activations & Games','2-Player Button Box'),
  ('Activations & Games','Lollipop Stand'),
  ('Activations & Games','Prize Examples'),
  ('Activations & Games','MxD Stock Prizes'),
  ('Activations & Games','3D Print Ultra Floor Sensor'),
  ('Logistics','Set of Keys (Vehicle/Generator)'),
  ('Logistics','iPads'),
  ('Logistics','Wall Banner Frames'),
  ('Logistics','Jerry Cans'),
  ('Logistics','Backdrops (Bunded)'),
  ('Logistics','Slings in a Box'),
  ('Logistics','Black Bags'),
  ('Logistics','Boxes for Cups');

-- Form submissions (all 5 form types)
CREATE TABLE IF NOT EXISTS field_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  form_type TEXT NOT NULL, -- delivery|collection|repair|inspection|shortlist
  form_number TEXT NOT NULL,
  prepared_by TEXT NOT NULL,
  driver TEXT,
  vehicle_reg TEXT,
  client TEXT DEFAULT 'South African Breweries',
  brand TEXT,
  venue TEXT,
  event_name TEXT,
  address TEXT,
  attention TEXT,
  contact_number TEXT,
  delivery_date TEXT,
  collection_date TEXT,
  received_by TEXT,
  signature_data TEXT, -- base64 canvas or name fallback
  letterhead TEXT DEFAULT 'bw', -- bw|sab
  notes TEXT,
  form_data TEXT NOT NULL, -- full JSON blob of all fields
  whatsapp_sent INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Line items for each submission
CREATE TABLE IF NOT EXISTS field_line_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL,
  item_name TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  brand TEXT,
  condition TEXT DEFAULT 'Checked',
  comments TEXT,
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (submission_id) REFERENCES field_submissions(id)
);

-- Suggested new items (from "Other" free text)
CREATE TABLE IF NOT EXISTS field_suggested_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER,
  description TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  suggested_by TEXT,
  reviewed INTEGER DEFAULT 0, -- 0=pending, 1=approved, 2=ignored
  promoted_to_item_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Vehicles (for auto-suggest)
CREATE TABLE IF NOT EXISTS field_vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reg_number TEXT NOT NULL UNIQUE,
  description TEXT,
  active INTEGER DEFAULT 1
);

-- Auto-increment counters per form type
CREATE TABLE IF NOT EXISTS field_counters (
  form_type TEXT PRIMARY KEY,
  last_number INTEGER DEFAULT 0
);

INSERT OR IGNORE INTO field_counters (form_type, last_number) VALUES
  ('delivery', 0),
  ('collection', 0),
  ('repair', 0),
  ('inspection', 0),
  ('shortlist', 0);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_field_submissions_type ON field_submissions(form_type);
CREATE INDEX IF NOT EXISTS idx_field_submissions_date ON field_submissions(created_at);
CREATE INDEX IF NOT EXISTS idx_field_line_items_sub ON field_line_items(submission_id);
CREATE INDEX IF NOT EXISTS idx_field_suggested_reviewed ON field_suggested_items(reviewed);
