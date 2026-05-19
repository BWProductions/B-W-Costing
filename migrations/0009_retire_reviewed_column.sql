-- Migration 0009: Retire `reviewed` column on field_suggested_items
--
-- Background: field_suggested_items historically tracked review state via
--   `reviewed` (0=pending, 1=approved, 2=ignored). Migration 0008 introduced
--   `status` ('pending'|'created'|'ignored'|'merged'|'split') which is more
--   expressive. We've been dual-writing both for backwards compat. Time to retire.
--
-- Safety: production audit (2026-05-14) confirmed only two state combos exist:
--   status='created'/reviewed=1 (33 rows), status='ignored'/reviewed=2 (74 rows).
-- No drift. Safe to drop.

-- Final backfill in case any rows slipped through with mismatched legacy state.
UPDATE field_suggested_items SET status='created' WHERE reviewed=1 AND status='pending';
UPDATE field_suggested_items SET status='ignored' WHERE reviewed=2 AND status='pending';

-- Drop the legacy index first (SQLite requires removing dependent indexes
-- before dropping a column on some versions).
DROP INDEX IF EXISTS idx_field_suggested_reviewed;

-- Retire the column. SQLite 3.35+ supports DROP COLUMN natively.
ALTER TABLE field_suggested_items DROP COLUMN reviewed;
