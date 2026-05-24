-- migration 0018: per-user ICS feed tokens
-- Allows each user to subscribe their personal Google/Apple/Outlook calendar
-- to the B&W events feed at a token-protected URL.

ALTER TABLE users ADD COLUMN ics_token TEXT;
CREATE INDEX IF NOT EXISTS idx_users_ics_token ON users(ics_token);
