---
title: "B&W Productions — Wages System Handover & Restore Point"
subtitle: "Rate rules · Review colours · Missed shifts · Payroll Excel for the auditor"
date: "15 September 2026"
---

# 1. Purpose of this document

This is the **restore point** for the wages system as approved by Bernie Burness on 15 September 2026.
If anything ever breaks or is changed by mistake, this document (plus the git tag and backup listed in §12) describes **exactly** how the system must look and behave: the pay rules, the colours and labels on the dashboard, how overlaps and reviews appear, how missed shifts are handled, and how the Payroll Excel for the auditor is laid out.

| Item | Value |
|---|---|
| Live site | https://bwprodsystem.co.za (staff: `/wages`, office: `/admin/wages`) |
| Code version live | `v2026-09-15-10` (check at `/wages-version`) |
| Cloudflare project | `bw-productions` (branch `main` = production, `realdate-test` = preview) |
| Database | Cloudflare D1 `bw-productions-db` |
| Git restore tag | `restore-2026-09-15-rate-rules-payroll-excel` |
| Previous restore point | `restore-2026-09-14-combined-sheet` (commit 807323c) |

---

# 2. What changed on 15 September 2026 (in order)

1. **Final Shift Check** shows the real date of a missed shift (not Saturday); **one tick box** instead of three.
2. **Select all → Submit selected** now really final-submits every ticked draft; skips "Submitted — locked" and out-of-window cards.
3. **✎ Edit** on every row of the combined sheet (paid rows → engine correction form; drafts → `/wages-admin/edit-draft/:id`).
4. **Calendar window**: a worker can only capture from **last payroll's Saturday to this payroll's Friday**. Older/newer dates are refused on the server and greyed out on the calendar.
5. **New B&W rate rules** (§3) applied automatically at final submission, **with the midnight split** (§3.4).
6. **Existing week (12–18 Sep) corrected** to the new rules — 14 rows changed, total R22 791,25 → R20 751,25 (before-state saved in `docs/reprice-backup-2026-09-15-week-2026-09-12-before.json`).
7. **Rate-choice review**: "warehouse" in the wording but work type not Warehouse → Bernie chooses Warehouse or Event/Venue before the rate is applied (§5.4).
8. John's two overlapping Sunday shifts put into red Review (not deleted); Erick's Monday "warehouse loading" reverted to R750 pending Bernie's choice.
9. **Payroll Excel for the auditor** — new 6-tab workbook built from the database (§8). Button "Download Payroll Excel (new)" on `/admin/wages`.
10. Excel layout tidy-up (merged title bands, one-line rows, aligned loans grid).

---

# 3. B&W pay rules (owner, 15 Sep 2026) — `OWNER_RATE_RULES_VERSION = 4`

All prices are worked out **per shift, on the actual day the hours were worked**, after the worker final-submits. The engine's own amount is overwritten by the proxy and the row is stamped `calculation_version = 4` with a note beginning `Rate rules 2026-09-15: …`.

## 3.1 General staff

| Day | Warehouse (work type *Warehouse Team*) | Event / Venue (everything else) |
|---|---|---|
| Mon–Fri | **R81,25 per hour** | **R750 fixed** for any time inside 07:00–16:00 **+ R90/h** for every hour before 07:00 or after 16:00 |
| Saturday | R95 per hour | R95 per hour |
| Sunday | R120 per hour | R120 per hour |

## 3.2 Music Bus (work type *Music Bus*)

| Day | Rule |
|---|---|
| Mon–Sat | **R750 fixed** for time inside 07:00–16:00 **+ R120/h** outside |
| Sunday | R120 per hour |

## 3.3 Petrus (staff #4, Tsotlego Petrus Malakoane)

| Day | Rule |
|---|---|
| Mon–Fri | **R650 fixed** for time inside 07:00–16:00 **+ R81,25/h** outside |
| Sat & Sun | R95 per hour |

## 3.4 Midnight split (owner instruction)

> Use the actual day the hours were worked. If a shift goes past midnight, the hours after midnight use the new day's rate. It stays **one shift on one row**; only the pay calculation splits.

Example — Friday 22:00–02:00 Event: 22:00–00:00 = Friday (2 h × R90 = R180) + 00:00–02:00 = Saturday (2 h × R95 = R190) = **R370**. Note on the row: *"… (until midnight) + Saturday: 2 h × R95 (after midnight, Sat)"*.

## 3.5 Gardeners (staff #1 Givemore, #2 Takavaudza)

House / House/Garden block keeps the engine's **gardener rate (R62,50/h)** — not recalculated. Their Team block (Warehouse Team / Team Assistance) is priced as general staff.

## 3.6 Fixed weekly staff (Sharleen) — not recalculated.

## 3.7 Never again
* No R375 half day. * No old Sunday ×1.5 / ×1.2 factors. * No Music Bus R130 or R190.

## 3.8 Worked examples (all pass in the unit test)

| Shift | Amount |
|---|---|
| Warehouse Mon 08:00–16:00 | R650 |
| Event Mon 05:00–16:00 | R930 (750 + 2 × 90) |
| Event Sun 07:00–12:00 | R600 |
| Music Bus Sat 08:00–22:00 | R1 470 (750 + 6 × 120) |
| Petrus Fri 20:00–01:00 | R420 (4 × 81,25 + 1 × 95 Sat) |
| Event Sat 22:00–02:00 | R430 (2 × 95 + 2 × 120 Sun) |
| Event Sun 18:00–00:00 (ends exactly midnight) | R720 — no split |

---

# 4. Payroll week and calendar window

* Payroll week runs **Saturday → Friday**.
* Workers may capture dates from **last payroll's Saturday** up to **this payroll's Friday** only. Anything older is a red card **"OLDER THAN ONE WEEK — cannot be final-submitted. Delete it or speak to the office."**; anything later is **"NEXT PAYROLL — capture it from Saturday."** Both are refused by the server as well.
* A shift from the previous payroll week captured now is a **missed shift**: it keeps its **real date** and is paid in the **current** payroll (`payroll_week_start` = this Saturday, `missed_previous_week = 1`).

---

# 5. The office dashboard `/admin/wages` — combined sheet

## 5.1 Person header line (left → right)

| Element | Colour | Meaning |
|---|---|---|
| `NAME  Isaac Mbele` | white bold | worker |
| `76.00 hours · R6 570,00` | **yellow/gold** `#e2b93b` | **Claimed** — final-submitted and paid by the engine, before review decisions |
| `Admin approved: 58.00 hours · R5 013,75` | **green** `#86efac` | **Approved** — claimed less what Bernie's resolved reviews took off |
| `Admin approved: 3 reviews still open` | **amber** `#fbbf24` | approved figure withheld until every open review has a decision |
| `Open Isaac's worker app ↗` | gold button | opens that worker's app in a new tab (office) |

## 5.2 Pills on the header line

| Pill text | Background | Text | Meaning |
|---|---|---|---|
| `⚖ all days match pay rule` / `⚖ rule ok` | dark green `#1f5f3a` | white | pay-rule check agrees with what was paid |
| `⚖ RULE +R500,00` | dark red `#7f1d1d` | white | paid **more** than the rule says (click to open detail) |
| `⚖ RULE −R75,00` | dark blue `#1e3a8a` | white | paid **less** than the rule says |
| `⚑ 9 open reviews ▾` | orange `#b45309` | white | this person has open reviews (click to open list) |
| `⚑ REVIEW` | dark red `#7f1d1d` | white | red (action-needed) review on this person |
| `2 missed shifts · 26.00 h · R2 220,00` | pink `#fdecec` | dark red `#7f1d1d` | missed shifts from the previous payroll paid in this one |
| `fixed weekly – rule check not applied` | grey `#374151` | white | Sharleen |

## 5.3 Row pills (per shift)

| Pill | Colours | Meaning |
|---|---|---|
| `MISSED` | pink / dark red | real date is before this payroll's Saturday |
| `⚖ rule ok` | dark green / white | this day's paid amount matches the rule |
| `⚑ review` | orange / white | review open on this shift |
| `NOT FINAL-SUBMITTED` | grey `#374151` / white | draft — counts as **R0** until final-submitted |
| `next day` | dark blue / white | overnight shift ends the next day |
| `corrected` | dark green / white | manager correction recorded |

## 5.4 Review column — what the system shows

**Open review (orange)** `REVIEW – open  #9770`
> Overlap check — 2026-09-13
> Manual overlap / possible already-claimed review: the same employee has another overlapping entry on 2026-09-13 for 07:00–12:00.
> Recommended payable: 2.00 h (05:00–07:00) · already paid 7.00 h that day ← *only when the system can work it out*
> Reason to record: "07:00–16:00 on 10 Sep already paid in payroll 2026-09-05; only the early hours 05:00–07:00 are payable."
> **[Approve hours ___] [Reason ________]  [Record decision] [Pay as claimed (9.00 h)] [No issue – pay as claimed]**

**Action-needed review (dark red)** `REVIEW – ACTION NEEDED  #9758`
* **Overlapping paid shifts** — two paid rows for the same time (e.g. John Sun 13 Sep 10:00–12:00 ×2). Text: *"TWO OVERLAPPING PAID SHIFTS … Both are currently paid; neither has been deleted or changed. Bernie to decide: pay both, pay one (approve 0 h on the other), or adjust hours."*
* **Rate choice** — wording says "warehouse" but the work type is not Warehouse. Text: *"RATE CHOICE NEEDED: … Bernie must choose Warehouse (R81,25/h weekday) or Event/Venue (R750 fixed 07–16 + R90/h outside) before the rate is decided. Until then the shift stays at the engine amount."* Buttons: **[Warehouse (R81,25/h)] [Event/Venue (R750 fixed 07–16 + R90/h outside)]** → re-prices only that shift, records Bernie's name.

**Decided review (green text)** `REVIEW – RESOLVED  #9665`
> **Decided: 1.00 h** by Bernie Burness — Already built in North payroll. The Excel sheet shows this, which I've saved on file on the PC.

The review decision is stored on `wage_payroll_reviews` (status `RESOLVED`, `approved_payable_hours`, `decision_reason`, `reviewed_by_name`, `reviewed_at`). **It does not change the engine's paid row**; the green "Admin approved" figure and the Payroll Excel use the approved hours.

## 5.5 Missed-shift detail column

```
MISSED SHIFT – actual date Wed 9 Sep 2026 – Set up HQ            (pink pill)
Worked Wed 9 Sep 2026 (previous payroll), not captured that week;
final-submitted and paid in payroll 2026-09-12 to 2026-09-18.
CLEAR   worked 07:00–16:00 that day (paid); these hours are outside those times   (green pill)
   – or –
OVERLAP already paid 05:00–16:00 (Grosvenor, Sandton – setup, payroll 2026-09-05)  (pink pill)
✎ Edit shift
```

## 5.6 Grand total tiles (bottom of the sheet)

`GRAND TOTAL (incl. missed shifts) — 47 paid shifts · R28 965,01` (yellow, claimed) and **Agreed after reviews** in green (amber while any review is open).

---

# 6. Worker app `/wages` — what staff see

* Calendar limited to the window in §4; message under the picker explains the window.
* Missed-shift card: pink pill **MISSED SHIFT – actual date Thu 10 Sep 2026 – Strike HQ Evening**.
* Final Shift Check: real date shown; **one tick box** ("The times, end time and information are correct") replaces the three.
* **Select all → Submit selected** final-submits every ticked draft; locked and out-of-window cards are skipped and reported.
* After final submission the shift card shows **Submitted — locked**.

---

# 7. Missed shifts — the rule

1. Worker captures the shift with its **real date** (previous week).
2. It is paid in the **current** payroll; the dashboard shows it under the worker with the MISSED pill and the CLEAR / OVERLAP cross-check against what was already paid that day in the earlier payroll.
3. If OVERLAP, a review opens; **Bernie decides the approved hours** (the green figure).
4. The **auditor only ever sees the approved hours** (Excel block 6). The claimed hours and the reasoning stay on the dashboard and on the Missed Shifts tab notes, for answering staff questions.

---

# 8. Payroll Excel for the auditor — `/wages-admin/payroll.xlsx?from=YYYY-MM-DD`

Button **"Download Payroll Excel (new)"** on `/admin/wages`, next to the old engine export (relabelled *"Export Excel (old rules – reference only)"* — it uses the old formulas and excludes missed shifts; kept for comparison only, to be removed later).

Six tabs, in this order:

### Tab 1 · Wage Detail Linked (master — edit only the yellow cells)
`Shift ID · Employee · Date · Day · Missed shift? · Venue / Outlet · Area · Description · Work type · Start · End · Claimed hours · Approved hours (system) · Override hours (edit) · Effective hours · Amount (system) · Override amount (edit) · Effective amount · Rate used · Breakdown · Override reason (edit) · Review # · System note · Review decision`
One row per paid shift **including missed shifts** (real date). Approved hours = the green review decision, or claimed where no review. Amount = new rate rules on the approved hours. Grand total row at the bottom.

### Tab 2 · Auditor Trail Linked
```
Employee | 1 Sat | 2 Sun | 3 Mon | 4 Tue | 5 Wed | 6 Thu | 7 Fri | 6 MISSED SHIFTS | Total Hours (Sat–Fri + Missed) | Wages (linked) |
          HR Amt   HR Amt  HR Amt  HR Amt  HR Amt  HR Amt  HR Amt   HR Amt
Fixed Deductions Due | Fixed Deducted (edit) | Fixed Outstanding After Payroll |
Additional Loan Due | Additional Loan Deducted (edit) | Additional Loan Outstanding After Payroll |
Total Deducted This Period | NET WAGE
```
* **No Bonus column, no "Gross Including Bonus".**
* Sat–Fri cells are SUMIFS over Tab 1 (effective hours / effective amount, in-week rows only).
* **6 MISSED SHIFTS** = each worker's missed total pulled from Tab 6 (approved hours).
* Total Hours = Sat + Sun + Mon + Tue + Wed + Thu + Fri + Missed.
* Yellow "(edit)" cells for what was actually deducted; Net = Wages − Total Deducted.
* GRAND TOTAL row.

### Tab 3 · Auditor Summary
`Name · Days Worked · Hours (incl. missed) · Missed Shift Hours · Wages · Fixed Deductions Due / Deducted / Outstanding · Additional Loan Due / Deducted / Outstanding · Total Deducted · NET WAGE` — every cell linked to Tab 2. Grand total.

### Tab 4 · Flagged – Reviewed
`Status · Review # · Employee · Date · Shift · Flag · System note · System recommended hours · Claimed hours · Approved hours · Decision · Decided by · Decided at · Reason recorded` — OPEN rows first (pink status cell).

### Tab 5 · Loans & Deductions
Three blocks on one aligned grid: **Fixed weekly deductions** (Erick Car R1 000 · Isaac Eggs R260 · Petrus Rent R450); **Additional loans** (loan #, dates, reason, original, instalment, repaid, **outstanding balance**, due this week, status, **Check** column — flags e.g. *"Marked PAID but ledger shows only R0,00 repaid of R3 000,00 — please check"*); **Loan repayment history** (all payrolls).

### Tab 6 · Missed Shifts
`Worker · Missed shift · Approved hours · Amount · Notes`
```
Isaac Mbele   Wed 9 Sep 2026  07:00–17:00   1.00   R90,00
   Notes: Worked Wed 9 Sep 2026 (previous payroll), not captured that week; final-submitted and paid in payroll 2026-09-12 to 2026-09-18.
          OVERLAP already paid 05:00–16:00 (Grosvenor, Sandton – setup, payroll 2026-09-05)
Isaac Mbele   Thu 10 Sep 2026 07:00–23:00   7.00   R630,00
   Notes: Worked Thu 10 Sep 2026 … OVERLAP already paid 07:00–16:00 (Grosvenor, Sandton – strike, payroll 2026-09-05)
Isaac Mbele — missed total                    8.00   R720,00      ← feeds block 6 on Tab 2
…
GRAND TOTAL MISSED SHIFTS                    69.00   R6 330,00
```
Approved hours and Amount are linked to Tab 1; a change there flows to Tab 6 → Tab 2 → Tab 3.

### Formatting standard
Title row (bold 13) and one grey italic note row, both merged across the sheet; grey header row (bold, centred, wrapped); one-line data rows; yellow `#FFF2A8` = editable; light-blue `#EAF3FF` = sub-totals; pink `#FDE2E2` = needs attention; money as `R#,##0.00`; header rows frozen. Workbook recalculates on open.

### Reference figures for week 2026-09-12 → 2026-09-18 (as at 15 Sep 12:40)
47 paid shifts (18 missed) · claimed 315,5 h · **approved 260,75 h** · missed approved 69 h · wages **R27 198,76** · deductions R3 210 · **net R23 988,76** · 0 open reviews on paid rows.

---

# 9. Corrections applied to week 12–18 Sep (audit trail)

| Worker | Shift | Old | New | Rule |
|---|---|---|---|---|
| John | Sat 12 · 09:00–11:00 | R750 | R190 | Sat 2 h × R95 |
| John | Sat 12 · Music Bus 11:00–20:00 | R1 170 | R1 230 | R750 + 4 h × R120 |
| John | Sat 12 · 20:00–22:00 | R180 | R190 | Sat 2 h × R95 |
| John | Sun 13 · 10:00–12:00 (×2) | R270 each | R240 each | Sun 2 h × R120 — **in red review** |
| John | Sun 13 · Music Bus 12:00–19:00 | R1 330 | R840 | Sun 7 h × R120 |
| Erence | Sun 13 · 07:00–13:00 | R810 | R720 | Sun 6 h × R120 |
| Erick | Sun 13 · 07:00–12:00 | R675 | R600 | Sun 5 h × R120 |
| Erick | Mon 14 · "warehouse loading" | R750 | R750 (reverted) | Bernie chose **Warehouse** → R731,25 via review #9758 |
| Solomon | Sat 12 · 07:00–12:00 | R750 | R475 | Sat 5 h × R95 |
| Solomon | Sun 13 · 07:00–12:00 | R675 | R600 | Sun 5 h × R120 |
| Patrick | Sat 12 · 06:45–11:45 | R772,50 | R475 | Sat 5 h × R95 |
| Patrick | Sun 13 · 07:00–12:15 | R708,75 | R630 | Sun 5,25 h × R120 |
| Joshua | Sun 13 · 07:00–13:00 | R810 | R720 | Sun 6 h × R120 |

Each corrected row carries the note *"Rate rules 2026-09-15 (admin correction of existing row, was R…): …"*. Before-state JSON: `docs/reprice-backup-2026-09-15-week-2026-09-12-before.json`.

---

# 10. Database objects the proxy relies on (no schema changes were made to engine tables)

| Table | Used for |
|---|---|
| `wage_shifts` | paid rows; proxy updates `total_amount`, `gross_wage`, `hourly_rate_snapshot`, `calculation_version = 4`, appends to `payroll_note` |
| `wage_shift_drafts` | drafts; `payroll_week_start`, `missed_previous_week` |
| `wage_payroll_reviews` | reviews; proxy inserts `issue_key = rate_choice_warehouse_or_event\|shift:ID` (severity red) and records decisions |
| `wage_draft_real_dates` (proxy) | real date parked while the engine is told "Saturday" |
| `wage_shifts_removed_audit` (proxy) | copies of rows removed by the office |
| `wage_debug_capture` (proxy) | log of every re-price, decision and rate choice |
| `wage_recurring_deductions`, `wage_additional_loans`, `wage_additional_loan_repayments` | Excel tab 5 |

Proxy routes added: `GET /wages-admin/payroll.xlsx`, `POST /wages-admin/rate-choice`, `POST /wages-admin/review-decision`, `GET /wages-admin/edit-draft/:id`, `GET /wages-version`, `GET /wages-health`.

Source files: `src/index.tsx` (proxy), `src/payroll-excel.ts` (workbook), `src/xlsx-lite.ts` (Excel writer).

---

# 11. Open items agreed to look at later

1. Void the 4 false "self-compare" reviews (a draft compared with its own paid row): Isaac 18 Sep #9762, Petrus #9759/#9760/#9761 — **awaiting Bernie's yes**.
2. Drafts' open reviews should not block the green "Admin approved" figure — **awaiting yes**.
3. Dashboard totals still show *claimed*; Excel shows *approved*. Bringing the dashboard in line is a separate instruction.
4. Daniel's R3 000 loan is marked paid with R0 in the ledger — flagged on the Loans tab.
5. Remove the CSV button and the old "reference only" export once the new Excel has been used for a full payroll.
6. Erick's open reviews #9690 / #9691.

---

# 12. How to restore this exact state

```bash
git checkout restore-2026-09-15-rate-rules-payroll-excel
npm run build
npx wrangler pages deploy dist --project-name bw-productions --branch main --commit-dirty=true
curl https://bwprodsystem.co.za/wages-version   # must return v2026-09-15-10
```
Backup archive of the whole project (code + docs + this file) is listed in the README under "Backups". Data corrections can be reversed from the before-state JSON in `docs/`.

*Prepared for B&W Productions — Bernie Burness — 15 September 2026.*
