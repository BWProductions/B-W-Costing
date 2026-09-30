-- Owner 30 Sep 2026: deduct this week what is left (or the instalment if less), record it, then zero from next week.
-- Erick #1: last R500 → paid
INSERT INTO wage_additional_loan_repayments (loan_id, staff_id, payroll_week_start, payroll_week_end, scheduled_amount, amount_deducted, balance_before, balance_after, total_repaid_after, result_status) VALUES (1, 9, '2026-09-26', '2026-10-02', 500, 500, 500, 0, 2000, 'deducted');
UPDATE wage_additional_loans SET total_repaid=2000, outstanding_balance=0, status='paid', next_due_date=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=1;
-- Erick #7: R500 WhatsApp 22 Sep → all this week → paid
INSERT INTO wage_additional_loan_repayments (loan_id, staff_id, payroll_week_start, payroll_week_end, scheduled_amount, amount_deducted, balance_before, balance_after, total_repaid_after, result_status) VALUES (7, 9, '2026-09-26', '2026-10-02', 500, 500, 500, 0, 500, 'deducted');
UPDATE wage_additional_loans SET total_repaid=500, outstanding_balance=0, status='paid', next_due_date=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=7;
-- Isaac #2: instalment R250, left R350 → deduct R250, R100 left for next week
INSERT INTO wage_additional_loan_repayments (loan_id, staff_id, payroll_week_start, payroll_week_end, scheduled_amount, amount_deducted, balance_before, balance_after, total_repaid_after, result_status) VALUES (2, 6, '2026-09-26', '2026-10-02', 250, 250, 350, 100, 800, 'deducted');
UPDATE wage_additional_loans SET total_repaid=800, outstanding_balance=100, next_due_date='2026-10-03', updated_at=CURRENT_TIMESTAMP WHERE id=2;
-- Isaac #3: instalment R250, left R150 → deduct R150 (less than instalment) → paid
INSERT INTO wage_additional_loan_repayments (loan_id, staff_id, payroll_week_start, payroll_week_end, scheduled_amount, amount_deducted, balance_before, balance_after, total_repaid_after, result_status) VALUES (3, 6, '2026-09-26', '2026-10-02', 250, 150, 150, 0, 600, 'deducted');
UPDATE wage_additional_loans SET total_repaid=600, outstanding_balance=0, status='paid', next_due_date=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=3;
-- Isaac #6: R600 once → all this week → paid
INSERT INTO wage_additional_loan_repayments (loan_id, staff_id, payroll_week_start, payroll_week_end, scheduled_amount, amount_deducted, balance_before, balance_after, total_repaid_after, result_status) VALUES (6, 6, '2026-09-26', '2026-10-02', 600, 600, 600, 0, 600, 'deducted');
UPDATE wage_additional_loans SET total_repaid=600, outstanding_balance=0, status='paid', next_due_date=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=6;
-- Isaac #8: R500, R250/week → R250 this week, R250 next week
INSERT INTO wage_additional_loan_repayments (loan_id, staff_id, payroll_week_start, payroll_week_end, scheduled_amount, amount_deducted, balance_before, balance_after, total_repaid_after, result_status) VALUES (8, 6, '2026-09-26', '2026-10-02', 250, 250, 500, 250, 250, 'deducted');
UPDATE wage_additional_loans SET total_repaid=250, outstanding_balance=250, next_due_date='2026-10-03', updated_at=CURRENT_TIMESTAMP WHERE id=8;
