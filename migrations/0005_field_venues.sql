-- Field Venues — typeahead-backed venue/address directory
-- Sources: BW_SAB_Sites.csv, BW_Rugby_2026.csv, BW_Deliveries.csv

CREATE TABLE IF NOT EXISTS field_venues (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL,
  name_lower        TEXT NOT NULL,                 -- for fast case-insensitive search
  address           TEXT DEFAULT '',
  region            TEXT DEFAULT '',               -- Gauteng, Western Cape, Argentina, etc.
  postal_code       TEXT DEFAULT '',
  attention_default TEXT DEFAULT '',               -- on-site contact (from deliveries CSV)
  notes             TEXT DEFAULT '',
  source            TEXT DEFAULT 'manual',         -- sab|rugby|deliveries|manual
  venue_type        TEXT DEFAULT '',               -- depot|brewery|stadium|mall|collection|venue
  use_count         INTEGER DEFAULT 0,             -- bubble frequently-used to top
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_field_venues_name_lower ON field_venues(name_lower);
CREATE INDEX IF NOT EXISTS idx_field_venues_use_count  ON field_venues(use_count DESC);
CREATE INDEX IF NOT EXISTS idx_field_venues_region     ON field_venues(region);

-- Add venue_address back onto submissions (was previously removed)
ALTER TABLE field_submissions ADD COLUMN venue_address TEXT DEFAULT '';
