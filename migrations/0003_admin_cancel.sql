-- Add cancellation and status columns to field_submissions
ALTER TABLE field_submissions ADD COLUMN status TEXT DEFAULT 'active';
ALTER TABLE field_submissions ADD COLUMN cancelled_by TEXT;
ALTER TABLE field_submissions ADD COLUMN cancelled_at DATETIME;
ALTER TABLE field_submissions ADD COLUMN cancel_reason TEXT;
