# 30 Sep 2026 — Loan deductions recorded for payroll 26 Sep – 2 Oct (owner)

Owner: "Erick: deduct the last R500 on the August loan, record it, then zero from next week. The 22 Sep WhatsApp R500 is deducted this week, then 0 next week. Isaac: same — deduct what is left if it is less than the instalment, then make it 0 for the ones appearing this week." Joshua: fixed R1 000 car in full.

| Loan | Before | Deducted this week | After | Status |
|---|---|---|---|---|
| Erick #1 R2 000 (8 Aug) | R500 left | R500 | R0 | paid |
| Erick #7 R500 (22 Sep WhatsApp) | R500 | R500 | R0 | paid |
| Isaac #2 R900 (11 Aug) | R350 | R250 (instalment) | R100 → next week | active |
| Isaac #3 R600 (16 Aug) | R150 | R150 (left < instalment) | R0 | paid |
| Isaac #6 R600 (1 Sep) | R600 | R600 | R0 | paid |
| Isaac #8 R500 (22 Sep WhatsApp) | R500 | R250 | R250 → next week | active |

Fixed: Erick car R1 000; Isaac eggs R260; Joshua car R1 000 (from 26 Sep). Totals: Erick R2 000 → net R3 193,63; Isaac R1 510 → net R3 088,13; Joshua R1 000 → net R4 288,63.
Next week (3–9 Oct) loans due: Isaac #2 R100 + #8 R250 = R350 only; Erick R0.

Ledger rows written to `wage_additional_loan_repayments` (payroll_week_start 2026-09-26); `wage_additional_loans` balances/status updated (`next_due_date` is NOT NULL — paid loans set to 2026-10-02). Backup before: `loans_before.json`.
Excel (`payroll-excel.ts`, v2026-09-30-4): when the week has recorded repayments, "Additional Loan Due/Deducted" = the recorded amounts and "Outstanding after" = balance after; otherwise falls back to due-from-balance. Loans tab "Due this week" likewise.
Note: 12 Sep and 19 Sep sheets showed the same loan balances as due because the ledger was not written those weeks — owner instructed to proceed on the ledger as it stands.

## Owner closing rule (30 Sep, later)
Erick: 26 Sep = LAST loan deductions (#1, #7 closed) — only fixed R1 000 vehicle continues. Isaac: deduct as normal until R0 then close (#2 R100, #8 R250 left). Fixed vehicle deductions for Erick and Joshua continue. Rule stamped on each loan's reason field.


### CORRECTION 30 Sep 2026 (owner) — Erick loans
Owner did NOT approve R500 + R500. Approved: **R250 on #1 (August car repair) + R250 on #7 (22 Sep WhatsApp) in the 26 Sep payroll; another R250 + R250 in the 3–9 Oct payroll**, then both closed. Erick this week: fixed R1 000 vehicle + R500 loans = R1 500 → net **R3 693,63**. Next week: fixed R1 000 + R500 loans (final). Ledger and loan records corrected (instalment R250, R250 left each).

## 1 Oct 2026 (owner) — Isaac this week limited to R1 000
Owner: "I've got R1 000 only." Lines: Eggs R260 · #2 R350 (all left, CLOSED) · #3 R150 (all left, CLOSED) · #6 kids' trip R240 (R360 left, R250/week from 3 Oct) · #8 fuel R0 this week (R500 left, R250/week from 3 Oct). Total R1 000 → net R3 598,13. Ledger rows for 26 Sep updated (#8 result 'deferred'). Notes column shows "NOTHING taken this week by owner decision" for #8 (v2026-10-01-1).
Owner also asked to see last week per line: ledger has no loan entries for 12 Sep or 19 Sep (only 5 Sep and 26 Sep recorded).

## 1 Oct 2026 (owner) — auditor note shows ONLY what is deducted this week
Isaac's note lists lines 1–4 (eggs 260, #2 350 closed, #3 150 closed, #6 240 → R360 carried). Line 5 (#8, nothing taken) is NOT written — it belongs to next week. Code: a loan with a 0/deferred repayment this week is omitted from `deductionNotes`.
Next week (3–9 Oct) set by owner: #6 remaining **R360 in full**, #8 **R500 in full** → Isaac then has only the fixed eggs. (`deduction_amount` set to 360 / 500.) Erick next week: #1 R250 + #7 R250 (final) + fixed R1 000.
