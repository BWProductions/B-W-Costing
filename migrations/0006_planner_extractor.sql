-- Planning Calendar Extractor
-- Stores pasted/uploaded planning data, parsed jobs, and approval state.

CREATE TABLE IF NOT EXISTS planner_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_filename TEXT,
  source_kind TEXT DEFAULT 'paste', -- paste|xlsx
  raw_text TEXT,
  parsed_jobs_json TEXT, -- JSON array of jobs (initial parse)
  staged_jobs_json TEXT, -- JSON array reflecting current approve/skip/edit state
  status TEXT DEFAULT 'open', -- open|committed|abandoned
  created_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  committed_at DATETIME,
  notes TEXT
);

-- Each parsed job (one per candidate delivery) and its outcome
CREATE TABLE IF NOT EXISTS planner_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL,
  job_index INTEGER NOT NULL,
  decision TEXT DEFAULT 'pending', -- pending|approved|skipped|edited
  confidence TEXT DEFAULT 'amber', -- green|amber|red
  event_name TEXT,
  venue TEXT,
  venue_address TEXT,
  brand TEXT,
  client TEXT,
  delivery_date TEXT,
  collection_date TEXT,
  attention TEXT,
  contact_number TEXT,
  driver TEXT,
  vehicle_reg TEXT,
  prepared_by TEXT,
  notes TEXT,
  items_json TEXT, -- JSON array of {item, qty, brand}
  source_rows TEXT, -- e.g. "R14-R17"
  raw_text TEXT,
  flags_json TEXT, -- JSON array of human-readable warnings/contradictions
  submission_id INTEGER, -- set after commit
  skip_reason TEXT,
  FOREIGN KEY (batch_id) REFERENCES planner_batches(id),
  FOREIGN KEY (submission_id) REFERENCES field_submissions(id)
);

-- Learned corrections — when user edits a parsed value, remember the mapping
CREATE TABLE IF NOT EXISTS planner_corrections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  field_name TEXT NOT NULL, -- event_name|venue|brand|driver|...
  original_value TEXT NOT NULL,
  corrected_value TEXT NOT NULL,
  hit_count INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_planner_jobs_batch ON planner_jobs(batch_id);
CREATE INDEX IF NOT EXISTS idx_planner_corrections_lookup ON planner_corrections(field_name, original_value);
CREATE UNIQUE INDEX IF NOT EXISTS uq_planner_correction ON planner_corrections(field_name, original_value);
