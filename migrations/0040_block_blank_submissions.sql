-- Backend guard (2026-09-14): a shift draft can never be marked 'submitted'
-- unless a real paid wage_shifts record exists behind it (final_shift_id set).
-- This is what produced "blank" wages: status='submitted' with no paid shift,
-- so the worker saw 0.00 hours and the row vanished from their draft list.
-- Enforced at database level so no code path (proxy, app, manual SQL) can do it.

DROP TRIGGER IF EXISTS wage_shift_drafts_block_blank_submit_insert;
CREATE TRIGGER wage_shift_drafts_block_blank_submit_insert
BEFORE INSERT ON wage_shift_drafts
FOR EACH ROW
WHEN NEW.status = 'submitted' AND NEW.final_shift_id IS NULL
BEGIN
  SELECT RAISE(ABORT, 'BLOCKED: shift cannot be marked submitted without a paid shift record (final_shift_id). Save it as a draft and use Final Submission in the wages app.');
END;

DROP TRIGGER IF EXISTS wage_shift_drafts_block_blank_submit_update;
CREATE TRIGGER wage_shift_drafts_block_blank_submit_update
BEFORE UPDATE OF status ON wage_shift_drafts
FOR EACH ROW
WHEN NEW.status = 'submitted' AND NEW.final_shift_id IS NULL
BEGIN
  SELECT RAISE(ABORT, 'BLOCKED: shift cannot be marked submitted without a paid shift record (final_shift_id). Save it as a draft and use Final Submission in the wages app.');
END;
