-- Migration 0020: Dispatch screen token
-- Single global token for the warehouse big-screen view.
-- Stored as a system setting so it can be rotated from admin without code changes.

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed with a placeholder; will be replaced with a real random token via the admin UI
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('dispatch_token', 'CHANGE_ME_VIA_ADMIN');
