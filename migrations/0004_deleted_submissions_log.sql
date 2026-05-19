-- Audit log for deleted submissions
CREATE TABLE IF NOT EXISTS field_deleted_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL,
  form_number TEXT,
  form_type TEXT,
  reason TEXT NOT NULL,
  deleted_by TEXT,
  deleted_at DATETIME DEFAULT (datetime('now'))
);
