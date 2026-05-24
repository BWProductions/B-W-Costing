-- Migration 0015: Email digest + calendar quick-notes
-- Adds notification tracking to field_submissions, email_log table,
-- and a calendar_notes table for quick-stub calendar entries.

-- Notification tracking on deliveries
ALTER TABLE field_submissions ADD COLUMN notified_at TEXT;
ALTER TABLE field_submissions ADD COLUMN notified_attempts INTEGER DEFAULT 0;
ALTER TABLE field_submissions ADD COLUMN notified_error TEXT;

-- Email send log
CREATE TABLE IF NOT EXISTS email_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sent_at TEXT NOT NULL,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_id TEXT,
  error TEXT,
  delivery_ids TEXT,
  delivery_count INTEGER DEFAULT 0,
  total_size_kb INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_email_log_sent_at ON email_log(sent_at DESC);

-- Calendar quick-notes (lightweight entries that aren't full events)
CREATE TABLE IF NOT EXISTS calendar_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_date TEXT NOT NULL,
  title TEXT NOT NULL,
  client_id INTEGER,
  notes TEXT,
  color TEXT,
  created_by INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_calendar_notes_date ON calendar_notes(event_date);
