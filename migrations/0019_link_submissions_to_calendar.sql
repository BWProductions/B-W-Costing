-- migration 0019: explicit FK from field_submissions to calendar_events
-- Default behaviour stays "fuzzy match by date" — this column is for hard-pinning
-- when there are multiple events on the same day.

ALTER TABLE field_submissions ADD COLUMN calendar_event_id INTEGER REFERENCES calendar_events(id);
CREATE INDEX IF NOT EXISTS idx_submissions_calendar_event ON field_submissions(calendar_event_id);
