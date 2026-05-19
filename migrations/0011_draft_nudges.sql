-- 0011: Draft Nudge backbone
-- Adds email column to field_people + audit table for every nudge ever sent.
-- Idempotent: safe to re-run via individual statements.

-- 1) Email column on field_people (nullable; people without an email simply don't get nudged)
ALTER TABLE field_people ADD COLUMN email TEXT;

-- 2) Phone column too (for future SMS, costs nothing to add now)
ALTER TABLE field_people ADD COLUMN phone TEXT;

-- 3) Audit table — every nudge attempt is logged.
--    status values: 'pending' (queued, ready to send) | 'sent' | 'no_email' | 'dismissed' | 'failed'
CREATE TABLE IF NOT EXISTS field_draft_nudges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL,
  form_number TEXT,
  form_type TEXT,
  prepared_by TEXT,
  recipient_email TEXT,
  draft_age_days INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  email_subject TEXT,
  email_preview TEXT,
  triggered_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME,
  FOREIGN KEY (submission_id) REFERENCES field_submissions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_draft_nudges_status ON field_draft_nudges(status);
CREATE INDEX IF NOT EXISTS idx_draft_nudges_submission ON field_draft_nudges(submission_id);
CREATE INDEX IF NOT EXISTS idx_draft_nudges_created ON field_draft_nudges(created_at);

-- 4) Config table for system settings (last-run timestamps, feature flags, etc.)
CREATE TABLE IF NOT EXISTS field_system_config (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO field_system_config (key, value) VALUES
  ('email_enabled', '0'),
  ('email_from', 'noreply@bwprodsystem.co.za'),
  ('email_cc_admin', '1'),
  ('admin_cc_email', ''),
  ('draft_nudge_threshold_days', '5'),
  ('draft_nudge_last_run', ''),
  ('draft_nudge_lazy_trigger_enabled', '1');
