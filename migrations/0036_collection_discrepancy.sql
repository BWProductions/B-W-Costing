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
