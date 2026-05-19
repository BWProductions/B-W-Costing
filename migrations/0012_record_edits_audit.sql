-- 0012: Audit log for post-submission edits to field_submissions
-- Every time a brand/venue/received_by/etc. is corrected after the fact, we
-- write a row here. This is the paper trail for "the record was amended."

CREATE TABLE IF NOT EXISTS field_record_edits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL,
  form_number TEXT,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  reason TEXT,
  edited_by TEXT,
  edited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (submission_id) REFERENCES field_submissions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_record_edits_submission ON field_record_edits(submission_id);
CREATE INDEX IF NOT EXISTS idx_record_edits_when ON field_record_edits(edited_at);
CREATE INDEX IF NOT EXISTS idx_record_edits_field ON field_record_edits(field_name);
