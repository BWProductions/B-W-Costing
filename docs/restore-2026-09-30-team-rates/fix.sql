-- Sat 26: Isaac warehouse 07:00-13:00, 6 h. Team check: Taka warehouse 7h R568,75 & John 4h R325 = R81,25/h, no Saturday meeting deduction
UPDATE wage_shifts SET hourly_rate_snapshot=81.25, normal_amount=487.5, total_amount=487.5, gross_wage=487.5, calculation_version=10,
 manager_update_reason='Owner 30 Sep 2026: warehouse fixing Sat 07:00–13:00 = 6 h × R81,25 = R487,50 (engine flat R750 was wrong for 6 h). Same as Taka/John warehouse Saturday rate.',
 payroll_note=COALESCE(payroll_note||' | ','')||'OWNER 30 Sep 2026 (Bernie Burness): Warehouse Saturday: 6 h × R81,25 = R487,50 (was R750 unpriced)', updated_at=CURRENT_TIMESTAMP WHERE id=9964;

-- Mon 28: strike-down day. Whole team (Bhekizitha, Daniel, Erence, Erick, John, Joshua, Solomon, Taka) = 9 h × R95 = R855
UPDATE wage_shifts SET hourly_rate_snapshot=95, normal_amount=855, total_amount=855, gross_wage=855, calculation_version=10,
 manager_update_reason='Owner 30 Sep 2026: same team, same rate — Mon 28 Sep strike-down (Orlando / Wanderers / Sonop) team all 9 h × R95 = R855. Was R750 unpriced.',
 payroll_note=COALESCE(payroll_note||' | ','')||'OWNER 30 Sep 2026 (Bernie Burness): Venue/event strike-down: 9 h × R95 = R855 (was R750 unpriced) — same as Bhekizitha, Daniel, Erence, Erick, John, Joshua, Solomon, Taka', updated_at=CURRENT_TIMESTAMP WHERE id IN (9959, 9965);

-- Tue 29: everyone loading at the warehouse for Sunbet. Owner already chose WAREHOUSE for Patrick, Bhekizitha, Daniel, Erence, Taka → all the same: 8.5 h × R81,25 = R690,63
UPDATE wage_shifts SET hourly_rate_snapshot=81.25, normal_amount=690.63, total_amount=690.63, gross_wage=690.63, calculation_version=10,
 manager_update_reason='Owner 30 Sep 2026: same team, same rate — Tue 29 Sep whole team loading at the warehouse for Sunbet = Warehouse 9 h − 0.5 h meeting = 8.5 h × R81,25 = R690,63 (owner chose Warehouse for Patrick, Bhekizitha, Daniel, Erence, Taka the same day).',
 payroll_note=COALESCE(payroll_note||' | ','')||'OWNER 30 Sep 2026 (Bernie Burness): Warehouse: 9 h − 0.5 h staff meeting 07:00–07:30 (unpaid) = 8.5 h × R81,25 = R690,63 — same as the rest of the Tuesday loading team', updated_at=CURRENT_TIMESTAMP WHERE id IN (9966, 9941, 9935, 9919, 9958, 9944);

-- Sat 26: Erick claims Sonop 07:00-16:00. Owner ruled Sonop team finished 14:00 → cap 07:00-14:00 = 7 h × R95 = R665
UPDATE wage_shifts SET end_time='14:00', final_end_time='14:00', hours_worked=7, normal_hours=7, final_hours=7, hourly_rate_snapshot=95, normal_amount=665, total_amount=665, gross_wage=665, calculation_version=10,
 manager_update_reason='Owner 30 Sep 2026: Sonop set-up team finished 14:00 on Sat 26 Sep (owner ruling 29 Sep). Erick claimed 16:00 — capped to the team finish: 07:00–14:00 = 7 h × R95 = R665 (was 9 h R855).',
 payroll_note=COALESCE(payroll_note||' | ','')||'OWNER 30 Sep 2026 (Bernie Burness): Sonop team finish 14:00 — 07:00–14:00 = 7 h × R95 = R665 (claimed 16:00, R855)', updated_at=CURRENT_TIMESTAMP WHERE id=9924;

-- Thu 1 / Fri 2: John "Middleburg Activations" = Music Bus work → R750 fixed 07:00–16:00 (rate rule 15 Sep)
UPDATE wage_shifts SET work_type='Music Bus', hourly_rate_snapshot=130, normal_amount=750, total_amount=750, gross_wage=750, calculation_version=10,
 manager_update_reason='Owner 30 Sep 2026: Middleburg activations = Music Bus work → R750 fixed for 07:00–16:00 (rate rule 15 Sep), not venue R95/h. Pre-submitted — hours outside 07–16 (R120/h) to be added if worked.',
 payroll_note=COALESCE(payroll_note||' | ','')||'OWNER 30 Sep 2026 (Bernie Burness): Music Bus: R750 fixed 07–16 (was priced Venue 9 h × R95 = R855)', updated_at=CURRENT_TIMESTAMP WHERE id IN (9962, 9963);

-- Close the matching open reviews
UPDATE wage_payroll_reviews SET status='RESOLVED', decision_type='approve_adjusted', decision_reason='Owner 30 Sep 2026: rate set by team/date rule (Sunbet set-up = event; same team same day = same rate). See row note.', reviewed_by_name='Bernie Burness (via assistant)', reviewed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
 WHERE status='OPEN' AND subject_shift_id IN (9964,9965,9966,9941,9935,9919,9958,9959) AND subject_source='shift';
UPDATE wage_payroll_reviews SET status='VOID', void_reason='Auto: the "other overlapping entry" is this entry itself — the draft became this paid row on Final Submission. Nothing was billed twice.', voided_by_name='system self-compare check', voided_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
 WHERE status='OPEN' AND issue_key LIKE 'manual_overlap_review|draft:%' AND subject_shift_id IN (SELECT id FROM wage_shift_drafts WHERE final_shift_id IS NOT NULL AND CAST(final_shift_id AS INTEGER)=CAST(compared_shift_id AS INTEGER));
