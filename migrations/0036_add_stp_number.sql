-- Migration 0036 — Add stp_number column to field_submissions
--
-- STP = SAB outlet code, a 5 or 6 digit number that uniquely identifies
-- the tavern/bar/venue where SAB delivers. Drivers in the field were
-- typing it as part of the venue string ("Mathathon Place Stp 490066"),
-- which made the data unsearchable and unfilterable.
--
-- Going forward, the field-submission parser (src/lib/event-name-parser.ts)
-- will extract the STP code into this column while ALSO keeping it visible
-- in the venue text. Best of both worlds — humans see "Mathathon Place STP
-- 490066" on the PDF; reports can WHERE stp_number = '490066'.
--
-- Index added because we'll definitely query by STP for SAB reporting
-- (e.g. "show me all deliveries to outlet 490066 this quarter").

ALTER TABLE field_submissions ADD COLUMN stp_number TEXT;

CREATE INDEX IF NOT EXISTS idx_field_submissions_stp_number
  ON field_submissions(stp_number);
