-- Migration 0036: Collection discrepancy tracking
--
-- Adds expected_quantity to field_line_items so a Collection Note can record
-- BOTH what was originally delivered (expected_quantity) and what the crew
-- physically counted on collection (quantity). When the two differ we surface
-- it on the Discrepancy Report and warn the crew live on site.
--
-- expected_quantity is NULL for every form type except collection notes
-- (deliveries, repairs, inspections, shortlists never set it).

ALTER TABLE field_line_items ADD COLUMN expected_quantity INTEGER;

-- Index to speed up the Discrepancy Report scan (collection lines where
-- counted != delivered). Partial-index syntax kept simple for D1/SQLite.
CREATE INDEX IF NOT EXISTS idx_field_line_items_expected
  ON field_line_items(submission_id, expected_quantity);

-- Marker so the "5-day uncollected delivery" alert only ever fires ONCE per
-- delivery note. NULL = never alerted; a timestamp = the alert has been sent.
ALTER TABLE field_submissions ADD COLUMN uncollected_alert_sent_at TEXT;

-- Index for the uncollected-delivery scan. We index only columns guaranteed to
-- exist here (collection_status is created/managed elsewhere in production), to
-- keep this migration safe on both fresh and existing databases.
CREATE INDEX IF NOT EXISTS idx_field_submissions_uncollected
  ON field_submissions(form_type, uncollected_alert_sent_at);
