---
title: "B&W Productions — Wages System: Complete Hard-Copy Handover"
subtitle: "Every rule, every change, every colour, the auditor Excel — and the actual wage figures for payroll week 12–18 September 2026"
date: "16 September 2026 (restore point restore-2026-09-15-approved · live v2026-09-15-11)"
---

# Part A — How the system works today

## A1. Where things are
| Item | Value |
|---|---|
| Staff app | https://bwprodsystem.co.za/wages (name + PIN) |
| Office dashboard | https://bwprodsystem.co.za/admin/wages |
| Auditor Excel | button **"Download Payroll Excel (new)"** on the dashboard (`/wages-admin/payroll.xlsx?from=YYYY-MM-DD`) |
| Live code version | **v2026-09-15-11** — check at `/wages-version` |
| Health check | `/wages-health` |
| Restore point | git tag `restore-2026-09-15-approved` · backup https://www.genspark.ai/api/files/s/88tvTUey |
| Payroll week | **Saturday → Friday** |

## A2. Pay rules (B&W rate rules, owner 15 Sep 2026 — version 4)
Applied automatically when a worker presses **Final Submission**. Priced **per shift on the actual day worked**; the row is stamped `Rate rules 2026-09-15: …` with the breakdown.

**General staff**

| Day | Warehouse (work type *Warehouse Team*) | Event / Venue (all other work) |
|---|---|---|
| Monday–Friday | **R81,25 per hour** | **R750 fixed** for any time inside 07:00–16:00 **+ R90 per hour** before 07:00 / after 16:00 |
| Saturday | R95 per hour | R95 per hour |
| Sunday | R120 per hour | R120 per hour |

**Music Bus** (work type *Music Bus*): Mon–Sat **R750 fixed** (07:00–16:00) **+ R120/h** outside · Sunday **R120/h**.

**Petrus (Tsotlego Petrus Malakoane)**: Mon–Fri **R650 fixed** (07:00–16:00) **+ R81,25/h** outside · Sat & Sun **R95/h**.

**Gardeners (Givemore, Takavaudza)**: House / House/Garden work stays on the **gardener rate R62,50/h** (not recalculated). Their Warehouse Team / Team Assistance work is priced as general staff.

**Sharleen Ndlovu**: fixed weekly **R3 000** — not recalculated.

**Midnight rule**: a shift that passes midnight stays **one shift on one row**; hours before 00:00 use the start day's rate, hours after 00:00 use the next day's rate. Example Fri 22:00–02:00 Event = 2 h × R90 (Fri) + 2 h × R95 (Sat) = **R370**.

**"Warehouse" only in the wording** (work type not Warehouse): the system does **not** decide — it opens a red **Rate choice** review and Bernie clicks **Warehouse (R81,25/h)** or **Event/Venue (R750 + R90/h)**. Until then the shift keeps the system amount.

**Never**: R375 half day · old Sunday ×1.5 / ×1.2 · Music Bus R130 or R190.

Worked examples: Warehouse Mon 08–16 = R650 · Event Mon 05–16 = R930 · Event Sun 07–12 = R600 · Music Bus Sat 08–22 = R1 470 · Petrus Fri 20:00–01:00 = R420 · Event Sat 22:00–02:00 = R430 · Event Sun 18:00–00:00 = R720 (no split).

## A3. Staff and their base rates on the system
| Staff | Base rate | Rule | Work-type rates |
|---|---|---|---|
| Bhekizitha Maphosa | R90,00/h | hourly (rate rules v4) | Normal R90,00/h; Music Bus R130,00/h |
| Brian Ndlovu | R90,00/h | hourly (rate rules v4) | Normal R90,00/h; Music Bus R130,00/h |
| Daniel Motaung | R90,00/h | hourly (rate rules v4) | — |
| Erence Mngomezulu | R90,00/h | hourly (rate rules v4) | — |
| Erick Mpho Molefe | R90,00/h | hourly (rate rules v4) | — |
| Givemore Chifetete Kuziwa | R62,50/h | hourly (rate rules v4) | House R62,50/h; Team Assistance R90,00/h |
| Isaac Mbele | R90,00/h | hourly (rate rules v4) | — |
| John Simbarashe Mhlanga | R90,00/h | hourly (rate rules v4) | Normal R90,00/h; Music Bus R130,00/h |
| Joshua Motsamai Nteo | R90,00/h | hourly (rate rules v4) | Normal R90,00/h; Music Bus R130,00/h |
| Lebo Lebo | R62,50/h | hourly (rate rules v4) | — |
| Patrick Ngozo | R90,00/h | hourly (rate rules v4) | — |
| Sharleen Ndlovu | R0,00/h | fixed weekly R3 000,00 | — |
| Solomon Moyo | R90,00/h | hourly (rate rules v4) | — |
| Takavaudza Chokuda | R90,00/h | hourly (rate rules v4) | House/Garden R62,50/h; Warehouse Team R90,00/h |
| Thandanani Nkala | R90,00/h | hourly (rate rules v4) | — |
| Thina Dyani | R90,00/h | hourly (rate rules v4) | — |
| Tsotlego Petrus Malakoane | R81,25/h | hourly (rate rules v4) | — |

## A4. Capturing rules for staff
* Calendar allows **last payroll's Saturday → this payroll's Friday** only. Older dates: red card *"OLDER THAN ONE WEEK — cannot be final-submitted. Delete it or speak to the office."* Later dates: *"NEXT PAYROLL — capture it from Saturday."* The server refuses both.
* A previous-week date captured now is a **missed shift**: real date kept, paid in the **current** payroll, pink pill **MISSED SHIFT – actual date Thu 10 Sep 2026 – Strike HQ Evening**.
* Final Shift Check shows the real date and has **one tick box**.
* **Select all for Final Submission → Submit selected** final-submits every ticked draft; locked and out-of-window cards are skipped.
* After Final Submission the card shows **Submitted — locked**. Locked missed shifts move down into **Finally submitted shifts** (top of the list) with the note *"…final-submitted, locked and paid in this payroll — do not capture them again."*
* A draft is **R0** until it is final-submitted.

## A5. Office dashboard — colours and labels
| What you see | Colour | Meaning |
|---|---|---|
| `76.00 hours · R6 570,00` after the name | **yellow/gold** | **Claimed** — what the system paid at final submission, before your decisions |
| `Admin approved: 58.00 hours · R5 013,75` | **green** | **Approved** — claimed less what your resolved reviews took off |
| `Admin approved: 3 reviews still open` | **amber** | approved figure withheld until every open review is decided |
| `⚖ all days match pay rule` / `⚖ rule ok` | dark green pill | paid amount matches the rule |
| `⚖ RULE +R500,00` | dark red pill | paid more than the rule (click for detail) |
| `⚖ RULE −R75,00` | dark blue pill | paid less than the rule |
| `⚑ 9 open reviews ▾` / `⚑ review` | orange pill | open review(s) |
| `⚑ REVIEW` / `REVIEW – ACTION NEEDED` | dark red pill | review needing your decision (overlapping paid shifts / rate choice) |
| `MISSED` · `2 missed shifts · 26.00 h · R2 220,00` | pink pill, dark-red text | missed shifts from previous payroll paid in this one |
| `OVERLAP already paid 05:00–16:00 (…, payroll 2026-09-05)` | pink pill | hours clash with something already paid that day |
| `CLEAR worked 07:00–16:00 that day (paid); these hours are outside those times` | green pill | no clash |
| `NOT FINAL-SUBMITTED` | grey pill | draft — counts R0 |
| `Submitted — locked` | grey pill (staff app) | final-submitted and paid |
| `REVIEW – open #9770` | orange | open review with Approve hours / Reason / **Record decision** / **Pay as claimed** / **No issue – pay as claimed** |
| `REVIEW – RESOLVED #9665 · Decided: 1.00 h by Bernie Burness — …` | green text | your recorded decision |
| `✎ Edit shift` | gold outline button | paid row → engine correction form; draft → worker edit page |
| `Open Isaac's worker app ↗` | gold button | opens that worker's app |

**The auditor only ever sees approved hours.** Your review decision is stored on the review; the dashboard row keeps the claimed figure (so the OVER list can look alarming), but the **green figure and the Payroll Excel use your approved hours**.

## A6. Payroll Excel for the auditor — 6 tabs
1. **Wage Detail Linked** (master; yellow = editable): Shift ID · Employee · Date · Day · Missed? · Venue · Area · Description · Work type · Start · End · Claimed hours · Approved hours · Override hours · Effective hours · Amount · Override amount · Effective amount · Rate used · Breakdown · Override reason · Review # · System note · Review decision.
2. **Auditor Trail Linked**: Employee · 1 Sat · 2 Sun · 3 Mon · 4 Tue · 5 Wed · 6 Thu · 7 Fri (HR · Amount each) · **6 MISSED SHIFTS** (HR · Amount) · **Total Hours (Sat–Fri + Missed)** · Wages · Fixed Deductions Due / Deducted (edit) / Outstanding · Additional Loan Due / Deducted (edit) / Outstanding · Total Deducted · **NET WAGE**. No Bonus, no Gross-incl-bonus.
3. **Auditor Summary**: one line per worker, Net wage, grand total.
4. **Flagged – Reviewed**: every review, the flag, system note, claimed vs approved, your decision, name, time, reason.
5. **Loans & Deductions**: fixed deductions, loans with balances, repayment history, "Check" column.
6. **Missed Shifts**: Worker · Missed shift · **Approved hours** · Amount · Notes (dashboard wording + OVERLAP/CLEAR line). Each worker's missed total feeds block 6 on the Trail.
Everything is formula-linked: change a yellow cell on tab 1 and tabs 6 → 2 → 3 recalculate. Yellow = editable, light-blue = sub-total, pink = attention. Old engine export kept as *"Export Excel (old rules – reference only)"*.

## A7. Everything changed on 15 September 2026
1. Final Shift Check shows the real date; one tick box.
2. Select all → Submit selected really submits; skips locked / out-of-window.
3. ✎ Edit on every dashboard row.
4. Calendar window last Sat → this Fri, enforced server and client.
5. New rate rules v4 with midnight split, applied at final submission.
6. This week's existing rows corrected to the rules (14 rows, then Patrick Sat 12 Sep R772,50 → R475).
7. Rate-choice review for "warehouse" wording; Bernie chose Warehouse for Erick Mon 14, Isaac Wed 16 / Thu 17 / Fri 18.
8. John's two Sunday 10–12 rows put in red review (not deleted); one approved 0 h.
9. Payroll Excel (6 tabs) built; layout tidied (merged title bands, one-line rows).
10. Locked missed shifts shown under *Finally submitted shifts* (staff were re-capturing them).
11. Duplicates removed with audit copies: Givemore Tue 15 & Fri 18 second copies, Givemore "Test FNB" ×2 on 5 Sep; Erick "Water cabin" 13 Sep and Botanical Garden 15 Sep drafts.
12. Handover PDF + restore points `restore-2026-09-15-rate-rules-payroll-excel` and `restore-2026-09-15-approved`.

# Part B — Actual wage figures, payroll week Sat 12 → Fri 18 September 2026
*Taken from the Payroll Excel at the restore point (16 Sep 07:06). All hours are approved hours.*

## B1. Summary per worker
| Worker | Days | Hours (incl. missed) | Missed hrs | Wages | Fixed ded. | Loan ded. | Total ded. | **NET** |
|---|---|---|---|---|---|---|---|---|
| Bhekizitha Maphosa | 6 | 59.00 | 7.00 | R5 190,00 | R0,00 | R0,00 | R0,00 | R5 190,00 |
| Daniel Motaung | 7 | 58.00 | 0.00 | R5 111,25 | R0,00 | R0,00 | R0,00 | R5 111,25 |
| Erence Mngomezulu | 6 | 66.00 | 15.00 | R5 782,50 | R0,00 | R0,00 | R0,00 | R5 782,50 |
| Erick Mpho Molefe | 3 | 23.00 | 1.00 | R2 090,00 | R1 000,00 | R500,00 | R1 500,00 | R590,00 |
| Givemore Chifetete Kuziwa | 5 | 38.50 | 0.00 | R2 500,00 | R0,00 | R0,00 | R0,00 | R2 500,00 |
| Isaac Mbele | 6 | 58.00 | 8.00 | R5 013,75 | R260,00 | R1 000,00 | R1 260,00 | R3 753,75 |
| John Simbarashe Mhlanga | 3 | 35.00 | 4.00 | R3 800,00 | R0,00 | R0,00 | R0,00 | R3 800,00 |
| Joshua Motsamai Nteo | 6 | 70.00 | 17.50 | R6 243,75 | R0,00 | R0,00 | R0,00 | R6 243,75 |
| Patrick Ngozo | 4 | 36.50 | 7.00 | R3 295,00 | R0,00 | R0,00 | R0,00 | R3 295,00 |
| Sharleen Ndlovu | 0 | 0.00 | 0.00 | R3 000,00 | R0,00 | R0,00 | R0,00 | R3 000,00 |
| Solomon Moyo | 7 | 66.00 | 11.00 | R5 777,50 | R0,00 | R0,00 | R0,00 | R5 777,50 |
| Takavaudza Chokuda | 6 | 62.00 | 9.00 | R5 282,50 | R0,00 | R0,00 | R0,00 | R5 282,50 |
| Thandanani Nkala | 6 | 64.50 | 13.00 | R5 492,50 | R0,00 | R0,00 | R0,00 | R5 492,50 |
| Thina Dyani | 0 | 5.50 | 5.50 | R495,00 | R0,00 | R0,00 | R0,00 | R495,00 |
| Tsotlego Petrus Malakoane | 6 | 52.75 | 0.00 | R3 951,90 | R450,00 | R0,00 | R450,00 | R3 501,90 |
| **GRAND TOTAL** | 71 | 694.75 | 98.00 | R63 025,65 | R1 710,00 | R1 500,00 | R3 210,00 | **R59 815,65** |

## B2. Day-by-day (Auditor Trail) — hours · amount
| Worker | Sat 12 | Sun 13 | Mon 14 | Tue 15 | Wed 16 | Thu 17 | Fri 18 | Missed | Total hrs | Wages |
|---|---|---|---|---|---|---|---|---|---|---|
| Bhekizitha Maphosa | – | 6.00 · R720,00 | 9.00 · R750,00 | 10.00 · R840,00 | 9.00 · R750,00 | 9.00 · R750,00 | 9.00 · R750,00 | 7.00 · R630,00 | 59.00 | R5 190,00 |
| Daniel Motaung | 6.00 · R570,00 | 6.00 · R720,00 | 9.00 · R731,25 | 10.00 · R840,00 | 9.00 · R750,00 | 9.00 · R750,00 | 9.00 · R750,00 | – | 58.00 | R5 111,25 |
| Erence Mngomezulu | – | 6.00 · R720,00 | 9.00 · R750,00 | 9.00 · R731,25 | 9.00 · R750,00 | 9.00 · R750,00 | 9.00 · R731,25 | 15.00 · R1 350,00 | 66.00 | R5 782,50 |
| Erick Mpho Molefe | – | 5.00 · R600,00 | 8.00 · R650,00 | 9.00 · R750,00 | – | – | – | 1.00 · R90,00 | 23.00 | R2 090,00 |
| Givemore Chifetete Kuziwa | 6.50 · R500,00 | – | 8.00 · R500,00 | 8.00 · R500,00 | 8.00 · R500,00 | 8.00 · R500,00 | – | – | 38.50 | R2 500,00 |
| Isaac Mbele | – | 5.00 · R600,00 | 9.00 · R750,00 | 9.00 · R750,00 | 9.00 · R731,25 | 9.00 · R731,25 | 9.00 · R731,25 | 8.00 · R720,00 | 58.00 | R5 013,75 |
| John Simbarashe Mhlanga | 13.00 · R1 610,00 | 9.00 · R1 080,00 | 9.00 · R750,00 | – | – | – | – | 4.00 · R360,00 | 35.00 | R3 800,00 |
| Joshua Motsamai Nteo | – | 6.00 · R720,00 | 9.00 · R750,00 | 10.50 · R885,00 | 9.00 · R731,25 | 9.00 · R731,25 | 9.00 · R731,25 | 17.50 · R1 695,00 | 70.00 | R6 243,75 |
| Patrick Ngozo | 5.00 · R475,00 | 5.00 · R600,00 | 10.00 · R795,00 | 9.50 · R795,00 | – | – | – | 7.00 · R630,00 | 36.50 | R3 295,00 |
| Sharleen Ndlovu | – | – | – | – | – | – | – | – | 0.00 | R3 000,00 |
| Solomon Moyo | 5.00 · R475,00 | 5.00 · R600,00 | 9.00 · R731,25 | 9.00 · R731,25 | 9.00 · R750,00 | 9.00 · R750,00 | 9.00 · R750,00 | 11.00 · R990,00 | 66.00 | R5 777,50 |
| Takavaudza Chokuda | – | 7.00 · R813,75 | 9.00 · R731,25 | 10.00 · R812,50 | 9.00 · R731,25 | 9.00 · R731,25 | 9.00 · R731,25 | 9.00 · R731,25 | 62.00 | R5 282,50 |
| Thandanani Nkala | 5.00 · R475,00 | – | 9.00 · R750,00 | 10.50 · R885,00 | 9.00 · R750,00 | 9.00 · R731,25 | 9.00 · R731,25 | 13.00 · R1 170,00 | 64.50 | R5 492,50 |
| Thina Dyani | – | – | – | – | – | – | – | 5.50 · R495,00 | 5.50 | R495,00 |
| Tsotlego Petrus Malakoane | 5.25 · R498,75 | – | 9.50 · R690,63 | 9.50 · R690,63 | 9.50 · R690,63 | 9.50 · R690,63 | 9.50 · R690,63 | – | 52.75 | R3 951,90 |
| **GRAND TOTAL** | 45.75 · R4 603,75 | 60.00 · R7 173,75 | 116.50 · R9 329,38 | 114.00 · R9 210,63 | 89.50 · R7 134,38 | 89.50 · R7 115,63 | 81.50 · R6 596,88 | 98.00 · R8 861,25 | 694.75 | R63 025,65 |

## B3. Missed shifts from the previous payroll (paid this week on approved hours)
| Worker | Missed shift | Approved hrs | Amount | Notes |
|---|---|---|---|---|
| Bhekizitha Maphosa | Thu 10 Sep 2026  16:00–23:00 | 7.00 | R630,00 | Worked Thu 10 Sep 2026 (previous payroll), not captured that week; final-submitted and paid in payroll 2026-09-12 to 2026-09-18. — CLEAR worked 07:00–16:00 that day (paid); these hours are outside those times |
| Erence Mngomezulu | Wed 9 Sep 2026  05:00–07:00 | 2.00 | R180,00 | Worked Wed 9 Sep 2026 (previous payroll), not captured that week; final-submitted and paid in payroll 2026-09-12 to 2026-09-18. — CLEAR worked 07:00–16:00 that day (paid); these hours are outside those times |
| Erence Mngomezulu | Wed 9 Sep 2026  16:00–20:00 | 4.00 | R360,00 | Worked Wed 9 Sep 2026 (previous payroll), not captured that week; final-submitted and paid in payroll 2026-09-12 to 2026-09-18. — CLEAR worked 07:00–16:00 that day (paid); these hours are outside those times |
| Erence Mngomezulu | Thu 10 Sep 2026  05:00–07:00 | 2.00 | R180,00 | Worked Thu 10 Sep 2026 (previous payroll), not captured that week; final-submitted and paid in payroll 2026-09-12 to 2026-09-18. — CLEAR worked 07:00–16:00 that day (paid); these hours are outside those times |
| Erence Mngomezulu | Thu 10 Sep 2026  16:00–23:00 | 7.00 | R630,00 | Worked Thu 10 Sep 2026 (previous payroll), not captured that week; final-submitted and paid in payroll 2026-09-12 to 2026-09-18. — CLEAR worked 07:00–16:00 that day (paid); these hours are outside those times |
| Erick Mpho Molefe | Wed 9 Sep 2026  05:00–19:00 | 1.00 | R90,00 | Worked Wed 9 Sep 2026 (previous payroll), not captured that week; final-submitted and paid in payroll 2026-09-12 to 2026-09-18. — OVERLAP already paid 05:00–16:00 (SAB grosgovenor, payroll 2026-09-05) |
| Erick Mpho Molefe | Thu 10 Sep 2026  07:00–23:00 | 0.00 | R0,00 | Worked Thu 10 Sep 2026 (previous payroll), not captured that week; final-submitted and paid in payroll 2026-09-12 to 2026-09-18. — OVERLAP already paid 07:00–16:00 (Warehouse, payroll 2026-09-05) |
| Isaac Mbele | Wed 9 Sep 2026  07:00–17:00 | 1.00 | R90,00 | Worked Wed 9 Sep 2026 (previous payroll), not captured that week; final-submitted and paid in payroll 2026-09-12 to 2026-09-18. — OVERLAP already paid 05:00–16:00 (Grosvenor, Sandton – setup, payroll 2026-09-05) |
| Isaac Mbele | Thu 10 Sep 2026  07:00–23:00 | 7.00 | R630,00 | Worked Thu 10 Sep 2026 (previous payroll), not captured that week; final-submitted and paid in payroll 2026-09-12 to 2026-09-18. — OVERLAP already paid 07:00–16:00 (Grosvenor, Sandton – strike, payroll 2026-09-05) |
| John Simbarashe Mhlanga | Fri 11 Sep 2026  16:00–18:00 | 2.00 | R180,00 | Worked Fri 11 Sep 2026 (previous payroll), not captured that week; final-submitted and paid in payroll 2026-09-12 to 2026-09-18. — OVERLAP already paid 13:00–19:00 (Burlington village, payroll 2026-09-05) |
| John Simbarashe Mhlanga | Fri 11 Sep 2026  19:00–21:00 | 2.00 | R180,00 | Worked Fri 11 Sep 2026 (previous payroll), not captured that week; final-submitted and paid in payroll 2026-09-12 to 2026-09-18. — CLEAR worked 13:00–19:00 that day (paid); these hours are outside those times |
| Joshua Motsamai Nteo | Mon 7 Sep 2026  16:00–18:00 | 2.00 | R180,00 | Worked Mon 7 Sep 2026 (previous payroll), not captured that week; final-submitted and paid in payroll 2026-09-12 to 2026-09-18. — OVERLAP already paid 16:00–18:30 (Warehouse/ extra hours, payroll 2026-09-05) |
| Joshua Motsamai Nteo | Thu 10 Sep 2026  05:00–14:00 | 9.00 | R930,00 | Worked Thu 10 Sep 2026 (previous payroll), not captured that week; final-submitted and paid in payroll 2026-09-12 to 2026-09-18. — OVERLAP already paid 07:00–16:00 (Warehouse, payroll 2026-09-05) |
| Joshua Motsamai Nteo | Thu 10 Sep 2026  17:00–23:30 | 6.50 | R585,00 | Worked Thu 10 Sep 2026 (previous payroll), not captured that week; final-submitted and paid in payroll 2026-09-12 to 2026-09-18. — CLEAR worked 07:00–16:00 that day (paid); these hours are outside those times |
| Patrick Ngozo | Thu 10 Sep 2026  16:00–23:00 | 7.00 | R630,00 | Worked Thu 10 Sep 2026 (previous payroll), not captured that week; final-submitted and paid in payroll 2026-09-12 to 2026-09-18. — CLEAR worked 06:30–16:00 that day (paid); these hours are outside those times |
| Solomon Moyo | Wed 9 Sep 2026  05:00–07:00 | 2.00 | R180,00 | Worked Wed 9 Sep 2026 (previous payroll), not captured that week; final-submitted and paid in payroll 2026-09-12 to 2026-09-18. — CLEAR worked 14:00–15:00, 07:00–16:00 that day (paid); these hours are outside those times |
| Solomon Moyo | Thu 10 Sep 2026  05:00–07:00 | 2.00 | R180,00 | Worked Thu 10 Sep 2026 (previous payroll), not captured that week; final-submitted and paid in payroll 2026-09-12 to 2026-09-18. — CLEAR worked 07:00–16:00 that day (paid); these hours are outside those times |
| Solomon Moyo | Thu 10 Sep 2026  16:00–23:00 | 7.00 | R630,00 | Worked Thu 10 Sep 2026 (previous payroll), not captured that week; final-submitted and paid in payroll 2026-09-12 to 2026-09-18. — CLEAR worked 07:00–16:00 that day (paid); these hours are outside those times |
| Takavaudza Chokuda | Tue 8 Sep 2026  16:00–17:00 | 1.00 | R81,25 | Worked Tue 8 Sep 2026 (previous payroll), not captured that week; final-submitted and paid in payroll 2026-09-12 to 2026-09-18. — CLEAR worked 07:00–16:00 that day (paid); these hours are outside those times |
| Takavaudza Chokuda | Thu 10 Sep 2026  17:00–01:00 | 8.00 | R650,00 | Worked Thu 10 Sep 2026 (previous payroll), not captured that week; final-submitted and paid in payroll 2026-09-12 to 2026-09-18. — CLEAR worked 07:00–16:00 that day (paid); these hours are outside those times |
| Thandanani Nkala | Wed 9 Sep 2026  16:00–20:00 | 4.00 | R360,00 | Worked Wed 9 Sep 2026 (previous payroll), not captured that week; final-submitted and paid in payroll 2026-09-12 to 2026-09-18. — CLEAR worked 05:00–16:00 that day (paid); these hours are outside those times |
| Thandanani Nkala | Thu 10 Sep 2026  05:00–07:00 | 2.00 | R180,00 | Worked Thu 10 Sep 2026 (previous payroll), not captured that week; final-submitted and paid in payroll 2026-09-12 to 2026-09-18. — CLEAR worked 07:00–16:00 that day (paid); these hours are outside those times |
| Thandanani Nkala | Thu 10 Sep 2026  16:00–23:00 | 7.00 | R630,00 | Worked Thu 10 Sep 2026 (previous payroll), not captured that week; final-submitted and paid in payroll 2026-09-12 to 2026-09-18. — CLEAR worked 07:00–16:00 that day (paid); these hours are outside those times |
| Thina Dyani | Thu 10 Sep 2026  17:30–23:00 | 5.50 | R495,00 | Worked Thu 10 Sep 2026 (previous payroll), not captured that week; final-submitted and paid in payroll 2026-09-12 to 2026-09-18. — CLEAR nothing else paid for this day |

## B4. Every paid shift (101 rows)
| # | Worker | Date | Day | Missed | Venue / description | Type | Time | Claimed | Approved | Amount | How it was worked out | Review |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 9733 | Bhekizitha Maphosa | 2026-09-10 | Thu | YES | 56 Grosvenor SAB INBEV Bryanston — Break down | Normal | 16:00–23:00 | 7.00 | 7.00 | R630,00 | Weekday: no 07–16 time + 7 h outside × R90 |  |
| 9732 | Bhekizitha Maphosa | 2026-09-13 | Sun |  | Padstal Lynnwood Pretoria — Break down | Normal | 07:00–13:00 | 6.00 | 6.00 | R720,00 | Sunday: 6 h × R120 |  |
| 9731 | Bhekizitha Maphosa | 2026-09-14 | Mon |  | Botanical garden Pretoria — Setup | Normal | 07:00–16:00 | 9.00 | 9.00 | R750,00 | Weekday: R750 fixed 07–16 |  |
| 9730 | Bhekizitha Maphosa | 2026-09-15 | Tue |  | Botanical garden Pretoria — Setup | Normal | 07:00–17:00 | 10.00 | 10.00 | R840,00 | Weekday: R750 fixed 07–16 + 1 h outside × R90 |  |
| 9729 | Bhekizitha Maphosa | 2026-09-16 | Wed |  | FNB Stadium — Loading and setup | Normal | 07:00–16:00 | 9.00 | 9.00 | R750,00 | Weekday: R750 fixed 07–16 |  |
| 9728 | Bhekizitha Maphosa | 2026-09-17 | Thu |  | Botanical garden Pretoria — Break down | Normal | 07:00–16:00 | 9.00 | 9.00 | R750,00 | Weekday: R750 fixed 07–16 |  |
| 9727 | Bhekizitha Maphosa | 2026-09-18 | Fri |  | Loftus Versfeld Stadium — Setup | Normal | 07:00–16:00 | 9.00 | 9.00 | R750,00 | Weekday: R750 fixed 07–16 |  |
| 9725 | Daniel Motaung | 2026-09-12 | Sat |  | Silver Oaks — Set Up | Normal | 07:00–13:00 | 6.00 | 6.00 | R570,00 | Saturday: 6 h × R95 |  |
| 9724 | Daniel Motaung | 2026-09-13 | Sun |  | Silver Oaks — Breakdown | Normal | 07:00–13:00 | 6.00 | 6.00 | R720,00 | Sunday: 6 h × R120 |  |
| 9723 | Daniel Motaung | 2026-09-14 | Mon |  | Warehouse — Loading | Normal | 07:00–16:00 | 9.00 | 9.00 | R731,25 | Warehouse weekday: 9 h × R81,25 | #9840 |
| 9722 | Daniel Motaung | 2026-09-15 | Tue |  | Bonitical Garden — Set Up | Normal | 07:00–17:00 | 10.00 | 10.00 | R840,00 | Weekday: R750 fixed 07–16 + 1 h outside × R90 |  |
| 9721 | Daniel Motaung | 2026-09-16 | Wed |  | Clarence — Set Up | Normal | 07:00–16:00 | 9.00 | 9.00 | R750,00 | Weekday: R750 fixed 07–16 |  |
| 9720 | Daniel Motaung | 2026-09-17 | Thu |  | Clarence — Set Up | Normal | 07:00–16:00 | 9.00 | 9.00 | R750,00 | Weekday: R750 fixed 07–16 |  |
| 9719 | Daniel Motaung | 2026-09-18 | Fri |  | Clarence — Breakdown | Normal | 07:00–16:00 | 9.00 | 9.00 | R750,00 | Weekday: R750 fixed 07–16 |  |
| 9632 | Erence Mngomezulu | 2026-09-09 | Wed | YES | Head office missing hours SAB HQ Set up — Set up HQ | Normal | 05:00–07:00 | 2.00 | 2.00 | R180,00 | Weekday: no 07–16 time + 2 h outside × R90 |  |
| 9633 | Erence Mngomezulu | 2026-09-09 | Wed | YES | SAB HQ missed hours set up — set up HQ | Normal | 16:00–20:00 | 4.00 | 4.00 | R360,00 | Weekday: no 07–16 time + 4 h outside × R90 |  |
| 9634 | Erence Mngomezulu | 2026-09-10 | Thu | YES | Missing hours SAB HQ Strike — Strike SAB | Normal | 05:00–07:00 | 2.00 | 2.00 | R180,00 | Weekday: no 07–16 time + 2 h outside × R90 |  |
| 9635 | Erence Mngomezulu | 2026-09-10 | Thu | YES | SAB HQ missed hours stirke evening — Strike HQ Evening | Normal | 16:00–23:00 | 7.00 | 7.00 | R630,00 | Weekday: no 07–16 time + 7 h outside × R90 |  |
| 9631 | Erence Mngomezulu | 2026-09-13 | Sun |  | Oscar Mbos Event Escape Strike Down — Strike - Oscar Mbos Event Escape Strike Down | Normal | 07:00–13:00 | 6.00 | 6.00 | R720,00 | Sunday: 6 h × R120 |  |
| 9666 | Erence Mngomezulu | 2026-09-14 | Mon |  | Bonitical gardens — Setup | Normal | 07:00–16:00 | 9.00 | 9.00 | R750,00 | Weekday: R750 fixed 07–16 |  |
| 9726 | Erence Mngomezulu | 2026-09-15 | Tue |  | Warehouse — Loading/offloading/cleaning and packing | Normal | 07:00–16:00 | 9.00 | 9.00 | R731,25 | Warehouse weekday: 9 h × R81,25 | #9844 |
| 9756 | Erence Mngomezulu | 2026-09-16 | Wed |  | Parys golf & country Estate — Setup | Normal | 07:00–16:00 | 9.00 | 9.00 | R750,00 | Weekday: R750 fixed 07–16 |  |
| 9757 | Erence Mngomezulu | 2026-09-17 | Thu |  | Parys golf & country Estate — Setup | Normal | 07:00–16:00 | 9.00 | 9.00 | R750,00 | Weekday: R750 fixed 07–16 |  |
| 9758 | Erence Mngomezulu | 2026-09-18 | Fri |  | Warehouse — Loading/offloading/cleaning and packing | Normal | 07:00–16:00 | 9.00 | 9.00 | R731,25 | Warehouse weekday: 9 h × R81,25 | #9890 |
| 9643 | Erick Mpho Molefe | 2026-09-09 | Wed | YES | Headoffice SAB — set up missed shifts | Normal | 05:00–19:00 | 14.00 | 1.00 | R90,00 | Approved 1 h priced as 18:00–19:00: Weekday: no 07–16 time + 1 h outside × R90 | #9645 |
| 9642 | Erick Mpho Molefe | 2026-09-10 | Thu | YES | SAB Grosvenor — strike down missed shifts | Normal | 07:00–23:00 | 16.00 | 0.00 | R0,00 | Approved 0 h — nothing payable | #9639 |
| 9641 | Erick Mpho Molefe | 2026-09-13 | Sun |  | The river Cabin — Striking down | Normal | 07:00–12:00 | 5.00 | 5.00 | R600,00 | Sunday: 5 h × R120 | #9631 |
| 9644 | Erick Mpho Molefe | 2026-09-14 | Mon |  | warehouse — loading | Normal | 07:00–16:00 | 9.00 | 8.00 | R650,00 | Approved 8 h priced as 08:00–16:00: Warehouse weekday: 8 h × R81,25 | #9647 |
| 9688 | Erick Mpho Molefe | 2026-09-15 | Tue |  | Botanical Garden — Loading and set up | Normal | 07:00–16:00 | 9.00 | 9.00 | R750,00 | Weekday: R750 fixed 07–16 |  |
| 9701 | Givemore Chifetete Kuziwa | 2026-09-12 | Sat |  | Garden — Cleaning | House/Garden | 08:00–14:30 | 6.50 | 6.50 | R500,00 | System amount kept (gardener rate) |  |
| 9702 | Givemore Chifetete Kuziwa | 2026-09-14 | Mon |  | Garden — Cleaning | House/Garden | 08:00–16:00 | 8.00 | 8.00 | R500,00 | System amount kept (gardener rate) |  |
| 9703 | Givemore Chifetete Kuziwa | 2026-09-15 | Tue |  | Garden — Cleaning | House/Garden | 08:00–16:00 | 8.00 | 8.00 | R500,00 | System amount kept (gardener rate) |  |
| 9704 | Givemore Chifetete Kuziwa | 2026-09-16 | Wed |  | Garden — Painting the washing room | House/Garden | 08:00–16:00 | 8.00 | 8.00 | R500,00 | System amount kept (gardener rate) |  |
| 9705 | Givemore Chifetete Kuziwa | 2026-09-17 | Thu |  | Garden — Cleaning | House/Garden | 08:00–16:00 | 8.00 | 8.00 | R500,00 | System amount kept (gardener rate) |  |
| 9706 | Givemore Chifetete Kuziwa | 2026-09-18 | Fri |  | Garden — Cleaning | House/Garden | 08:00–16:00 | 8.00 | 0.00 | R0,00 | Approved 0 h — nothing payable | #9808 |
| 9652 | Isaac Mbele | 2026-09-09 | Wed | YES | HQ SAB — SAB Head office HQ | Normal | 07:00–17:00 | 10.00 | 1.00 | R90,00 | Approved 1 h priced as 16:00–17:00: Weekday: no 07–16 time + 1 h outside × R90 | #9665 |
| 9653 | Isaac Mbele | 2026-09-10 | Thu | YES | PADSTAL — Setup of event | Normal | 07:00–23:00 | 16.00 | 7.00 | R630,00 | Approved 7 h priced as 16:00–23:00: Weekday: no 07–16 time + 7 h outside × R90 | #9669 |
| 9698 | Isaac Mbele | 2026-09-13 | Sun |  | Pretoria — Breakdown | Normal | 07:00–12:00 | 5.00 | 5.00 | R600,00 | Sunday: 5 h × R120 |  |
| 9697 | Isaac Mbele | 2026-09-14 | Mon |  | Botanical Gardens — SetUp | Normal | 07:00–16:00 | 9.00 | 9.00 | R750,00 | Weekday: R750 fixed 07–16 |  |
| 9696 | Isaac Mbele | 2026-09-15 | Tue |  | Botanical Gardens — Setup | Normal | 07:00–16:00 | 9.00 | 9.00 | R750,00 | Weekday: R750 fixed 07–16 |  |
| 9695 | Isaac Mbele | 2026-09-16 | Wed |  | Warehouse — warehouse loading | Normal | 07:00–16:00 | 9.00 | 9.00 | R731,25 | Warehouse weekday: 9 h × R81,25 | #9767 |
| 9694 | Isaac Mbele | 2026-09-17 | Thu |  | Warehouse — warehouse loading | Normal | 07:00–16:00 | 9.00 | 9.00 | R731,25 | Warehouse weekday: 9 h × R81,25 | #9765 |
| 9693 | Isaac Mbele | 2026-09-18 | Fri |  | Warehouse — Warehouse loading | Normal | 07:00–16:00 | 9.00 | 9.00 | R731,25 | Warehouse weekday: 9 h × R81,25 | #9763 |
| 9674 | John Simbarashe Mhlanga | 2026-09-11 | Fri | YES | Extra Driving Time for Music busses — Extra Driving Mpumalanga | Normal | 16:00–18:00 | 2.00 | 2.00 | R180,00 | Weekday: no 07–16 time + 2 h outside × R90 | #9717 |
| 9673 | John Simbarashe Mhlanga | 2026-09-11 | Fri | YES | Dropping Promoters Music Buss Carolina Mpumalanga — Dropping Promoters off | Normal | 19:00–21:00 | 2.00 | 2.00 | R180,00 | Weekday: no 07–16 time + 2 h outside × R90 |  |
| 9670 | John Simbarashe Mhlanga | 2026-09-12 | Sat |  | Carolina Mpumalanga Music busses Extra Driving — driving 2hrs to outlet | Normal | 09:00–11:00 | 2.00 | 2.00 | R190,00 | Saturday: 2 h × R95 |  |
| 9672 | John Simbarashe Mhlanga | 2026-09-12 | Sat |  | Caroline Mpumalanga — Music Busses | Music Bus | 11:00–20:00 | 9.00 | 9.00 | R1 230,00 | Music Bus: R750 fixed 07–16 + 4 h outside × R120 |  |
| 9671 | John Simbarashe Mhlanga | 2026-09-12 | Sat |  | Carolina Mpumalanga Extra riving from outlet drop promoters — Dropping of promoters extra horus | Normal | 20:00–22:00 | 2.00 | 2.00 | R190,00 | Saturday: 2 h × R95 |  |
| 9668 | John Simbarashe Mhlanga | 2026-09-13 | Sun |  | music buss driving back 2hrs extra — Driving back to accomodation | Normal | 10:00–12:00 | 2.00 | 0.00 | R0,00 | Approved 0 h — nothing payable | #9708 |
| 9669 | John Simbarashe Mhlanga | 2026-09-13 | Sun |  | driving to outlets extra hours music buss Mpumalanga — driving to outlets extra hours | Normal | 10:00–12:00 | 2.00 | 2.00 | R240,00 | Sunday: 2 h × R120 |  |
| 9667 | John Simbarashe Mhlanga | 2026-09-13 | Sun |  | Carolina Mpumalanga music busses — Music busses | Music Bus | 12:00–19:00 | 7.00 | 7.00 | R840,00 | Music Bus Sunday: 7 h × R120 |  |
| 9675 | John Simbarashe Mhlanga | 2026-09-14 | Mon |  | Botanical gardens setup — Setting up | Normal | 07:00–16:00 | 9.00 | 9.00 | R750,00 | Weekday: R750 fixed 07–16 |  |
| 9637 | Joshua Motsamai Nteo | 2026-09-07 | Mon | YES | Late Offload — offloading late at night | Normal | 16:00–18:00 | 2.00 | 2.00 | R180,00 | Weekday: no 07–16 time + 2 h outside × R90 | #9616 |
| 9639 | Joshua Motsamai Nteo | 2026-09-10 | Thu | YES | SAB HQ — Set up | Normal | 05:00–14:00 | 9.00 | 9.00 | R930,00 | Weekday: R750 fixed 07–16 + 2 h outside × R90 | #9622 |
| 9636 | Joshua Motsamai Nteo | 2026-09-10 | Thu | YES | SAB HQ - extra hours Strikedown — Stike HQ | Normal | 17:00–23:30 | 6.50 | 6.50 | R585,00 | Weekday: no 07–16 time + 6.5 h outside × R90 |  |
| 9638 | Joshua Motsamai Nteo | 2026-09-13 | Sun |  | Pastdal pub — Strikedown | Normal | 07:00–13:00 | 6.00 | 6.00 | R720,00 | Sunday: 6 h × R120 | #9618 |
| 9651 | Joshua Motsamai Nteo | 2026-09-14 | Mon |  | Botanical gardens — Setup MXD | Normal | 07:00–16:00 | 9.00 | 9.00 | R750,00 | Weekday: R750 fixed 07–16 | #9661 |
| 9743 | Joshua Motsamai Nteo | 2026-09-15 | Tue |  | Botanical garden — Setup | Normal | 07:00–17:30 | 10.50 | 10.50 | R885,00 | Weekday: R750 fixed 07–16 + 1.5 h outside × R90 |  |
| 9744 | Joshua Motsamai Nteo | 2026-09-16 | Wed |  | Warehouse — Offloading trucks | Normal | 07:00–16:00 | 9.00 | 9.00 | R731,25 | Warehouse weekday: 9 h × R81,25 | #9870 |
| 9745 | Joshua Motsamai Nteo | 2026-09-17 | Thu |  | Warehouse — Loading | Normal | 07:00–16:00 | 9.00 | 9.00 | R731,25 | Warehouse weekday: 9 h × R81,25 | #9872 |
| 9746 | Joshua Motsamai Nteo | 2026-09-18 | Fri |  | Warehouse — Offloading | Normal | 07:00–16:00 | 9.00 | 9.00 | R731,25 | Warehouse weekday: 9 h × R81,25 | #9874 |
| 9645 | Patrick Ngozo | 2026-09-10 | Thu | YES | 56 Grosvenor — Breakdown | Normal | 16:00–23:00 | 7.00 | 7.00 | R630,00 | Weekday: no 07–16 time + 7 h outside × R90 |  |
| 9625 | Patrick Ngozo | 2026-09-12 | Sat |  | Monte casino and Malt silverlakes — Set up T.Vs screens | Normal | 06:45–11:45 | 5.00 | 5.00 | R475,00 | Saturday: 5 h × R95 |  |
| 9624 | Patrick Ngozo | 2026-09-13 | Sun |  | River cabin groovy escape — Breakdown | Normal | 07:00–12:15 | 5.25 | 5.00 | R600,00 | Approved 5 h priced as 07:15–12:15: Sunday: 5 h × R120 | #9538 |
| 9650 | Patrick Ngozo | 2026-09-14 | Mon |  | Botanical gardens — Set up MXD Bar | Normal | 06:30–16:00 | 9.50 | 10.00 | R795,00 | Approved 10 h priced as 06:30–16:00: Weekday: R750 fixed 07–16 + 0.5 h outside × R90 | #9823 |
| 9700 | Patrick Ngozo | 2026-09-15 | Tue |  | Wearhouse — Loading | Normal | 06:30–16:00 | 9.50 | 9.50 | R795,00 | Weekday: R750 fixed 07–16 + 0.5 h outside × R90 |  |
| 9656 | Solomon Moyo | 2026-09-09 | Wed | YES | SAB HQ — SET UP additonal hours | Normal | 05:00–07:00 | 2.00 | 2.00 | R180,00 | Weekday: no 07–16 time + 2 h outside × R90 |  |
| 9630 | Solomon Moyo | 2026-09-10 | Thu | YES | SAB HQ — SAB HQ additonal hours | Normal | 05:00–07:00 | 2.00 | 2.00 | R180,00 | Weekday: no 07–16 time + 2 h outside × R90 |  |
| 9629 | Solomon Moyo | 2026-09-10 | Thu | YES | SAB HQ — Strike HQ | Normal | 16:00–23:00 | 7.00 | 7.00 | R630,00 | Weekday: no 07–16 time + 7 h outside × R90 |  |
| 9658 | Solomon Moyo | 2026-09-12 | Sat |  | Malt screen set up — Set up | Normal | 07:00–12:00 | 5.00 | 5.00 | R475,00 | Saturday: 5 h × R95 | #9676 |
| 9657 | Solomon Moyo | 2026-09-13 | Sun |  | Malt Midrand. & Malt Monte — Set up | Normal | 07:00–12:00 | 5.00 | 5.00 | R600,00 | Sunday: 5 h × R120 | #9675 |
| 9718 | Solomon Moyo | 2026-09-14 | Mon |  | Warehouse — Loading & Deliveries | Normal | 07:00–16:00 | 9.00 | 9.00 | R731,25 | Warehouse weekday: 9 h × R81,25 | #9834 |
| 9717 | Solomon Moyo | 2026-09-15 | Tue |  | Warehouse — Loading | Normal | 07:00–16:00 | 9.00 | 9.00 | R731,25 | Warehouse weekday: 9 h × R81,25 | #9832 |
| 9716 | Solomon Moyo | 2026-09-16 | Wed |  | Parys Country Club — Set up | Normal | 07:00–16:00 | 9.00 | 9.00 | R750,00 | Weekday: R750 fixed 07–16 |  |
| 9715 | Solomon Moyo | 2026-09-17 | Thu |  | Parys Country Club — Set up & Breakdown | Normal | 07:00–16:00 | 9.00 | 9.00 | R750,00 | Weekday: R750 fixed 07–16 |  |
| 9714 | Solomon Moyo | 2026-09-18 | Fri |  | Loftus — Set up | Normal | 07:00–16:00 | 9.00 | 9.00 | R750,00 | Weekday: R750 fixed 07–16 |  |
| 9742 | Takavaudza Chokuda | 2026-09-08 | Tue | YES | Warehouse (missed shift,) — Loading for HQ | Warehouse Team | 16:00–17:00 | 1.00 | 1.00 | R81,25 | Warehouse weekday: 1 h × R81,25 |  |
| 9741 | Takavaudza Chokuda | 2026-09-10 | Thu | YES | HQ — Strikedown | Warehouse Team | 17:00–01:00 | 8.00 | 8.00 | R650,00 | Warehouse weekday: 7 h × R81,25 (until midnight) + Warehouse weekday: 1 h × R81,25 (after midnight, Fri) |  |
| 9740 | Takavaudza Chokuda | 2026-09-13 | Sun |  | Pad stall — Strikedown | Warehouse Team | 07:00–13:00 | 6.00 | 6.00 | R720,00 | Sunday: 6 h × R120 |  |
| 9739 | Takavaudza Chokuda | 2026-09-13 | Sun |  | Henry on-klip — Normal | House/Garden | 13:00–14:00 | 1.00 | 1.00 | R93,75 | System amount kept (gardener rate) |  |
| 9738 | Takavaudza Chokuda | 2026-09-14 | Mon |  | Botanical — Setup | Warehouse Team | 07:00–16:00 | 9.00 | 9.00 | R731,25 | Warehouse weekday: 9 h × R81,25 |  |
| 9734 | Takavaudza Chokuda | 2026-09-15 | Tue |  | Botanical — Set up | Warehouse Team | 07:00–17:00 | 10.00 | 10.00 | R812,50 | Warehouse weekday: 10 h × R81,25 |  |
| 9737 | Takavaudza Chokuda | 2026-09-16 | Wed |  | Botanical — Polishing up | Warehouse Team | 07:00–16:00 | 9.00 | 9.00 | R731,25 | Warehouse weekday: 9 h × R81,25 |  |
| 9736 | Takavaudza Chokuda | 2026-09-17 | Thu |  | Warehouse — Normal | Warehouse Team | 07:00–16:00 | 9.00 | 9.00 | R731,25 | Warehouse weekday: 9 h × R81,25 |  |
| 9735 | Takavaudza Chokuda | 2026-09-18 | Fri |  | Warehouse — Sorting out warehouse | Warehouse Team | 07:00–16:00 | 9.00 | 9.00 | R731,25 | Warehouse weekday: 9 h × R81,25 |  |
| 9747 | Thandanani Nkala | 2026-09-09 | Wed | YES | SAB HQ — Set up | Normal | 16:00–20:00 | 4.00 | 4.00 | R360,00 | Weekday: no 07–16 time + 4 h outside × R90 |  |
| 9749 | Thandanani Nkala | 2026-09-10 | Thu | YES | SAB Supplier Summit extra hours — Strike down SAB headquaters | Normal | 05:00–07:00 | 2.00 | 2.00 | R180,00 | Weekday: no 07–16 time + 2 h outside × R90 |  |
| 9748 | Thandanani Nkala | 2026-09-10 | Thu | YES | SAB HQ extra hours — Strike doen SAB headquatoers additonal hours | Normal | 16:00–23:00 | 7.00 | 7.00 | R630,00 | Weekday: no 07–16 time + 7 h outside × R90 |  |
| 9750 | Thandanani Nkala | 2026-09-12 | Sat |  | The River  Cabin Fourways missed shift — Strike Down Double Malt | Normal | 07:00–12:00 | 5.00 | 5.00 | R475,00 | Saturday: 5 h × R95 |  |
| 9751 | Thandanani Nkala | 2026-09-14 | Mon |  | Botanical Gardens Lente Dag — Set Up for Lente Dag | Normal | 07:00–16:00 | 9.00 | 9.00 | R750,00 | Weekday: R750 fixed 07–16 |  |
| 9752 | Thandanani Nkala | 2026-09-15 | Tue |  | Pretoria Botanical Gardes — Loading and Set Up | Normal | 07:00–17:30 | 10.50 | 10.50 | R885,00 | Weekday: R750 fixed 07–16 + 1.5 h outside × R90 |  |
| 9753 | Thandanani Nkala | 2026-09-16 | Wed |  | FNB Stadium — Loading and Set Up for Scorpion Kings | Normal | 07:00–16:00 | 9.00 | 9.00 | R750,00 | Weekday: R750 fixed 07–16 |  |
| 9754 | Thandanani Nkala | 2026-09-17 | Thu |  | Warehouse — Cleaning and Loading | Normal | 07:00–16:00 | 9.00 | 9.00 | R731,25 | Warehouse weekday: 9 h × R81,25 | #9884 |
| 9755 | Thandanani Nkala | 2026-09-18 | Fri |  | Warehouse — Cleaning and Loading  and Offloading | Normal | 07:00–16:00 | 9.00 | 9.00 | R731,25 | Warehouse weekday: 9 h × R81,25 | #9886 |
| 9699 | Thina Dyani | 2026-09-10 | Thu | YES | 5.5 hour additional shift at Bryanston SAB head office on 10/09/2026 — Strike down | Normal | 17:30–23:00 | 5.50 | 5.50 | R495,00 | Weekday: no 07–16 time + 5.5 h outside × R90 |  |
| 9691 | Tsotlego Petrus Malakoane | 2026-09-12 | Sat |  | Silveroaks & Queens Wood — Screens setup | Warehouse Team | 06:45–12:00 | 5.25 | 5.25 | R498,75 | Petrus Saturday: 5.25 h × R95 |  |
| 9690 | Tsotlego Petrus Malakoane | 2026-09-14 | Mon |  | Warehouse — Loading and offloading & Recieving | Warehouse Team | 06:30–16:00 | 9.50 | 9.50 | R690,63 | Petrus weekday: R650 fixed 07–16 + 0.5 h outside × R81,25 |  |
| 9692 | Tsotlego Petrus Malakoane | 2026-09-15 | Tue |  | Warehouse — Loading &, Re-packing | Warehouse Team | 06:30–16:00 | 9.50 | 9.50 | R690,63 | Petrus weekday: R650 fixed 07–16 + 0.5 h outside × R81,25 |  |
| 9711 | Tsotlego Petrus Malakoane | 2026-09-16 | Wed |  | Warehouse — Cleaning, recieving and help load or offload | Warehouse Team | 06:30–16:00 | 9.50 | 9.50 | R690,63 | Petrus weekday: R650 fixed 07–16 + 0.5 h outside × R81,25 |  |
| 9712 | Tsotlego Petrus Malakoane | 2026-09-17 | Thu |  | Warehouse — Re-pack, cleaning & Recieving | Normal | 06:30–16:00 | 9.50 | 9.50 | R690,63 | Petrus weekday: R650 fixed 07–16 + 0.5 h outside × R81,25 |  |
| 9713 | Tsotlego Petrus Malakoane | 2026-09-18 | Fri |  | Warehouse — Helping with equipment dispatch | Warehouse Team | 06:30–16:00 | 9.50 | 9.50 | R690,63 | Petrus weekday: R650 fixed 07–16 + 0.5 h outside × R81,25 |  |

## B5. Review decisions recorded this payroll
| Status | # | Worker | Date | Shift | Flag | Claimed | Approved | Decided by | When | Reason |
|---|---|---|---|---|---|---|---|---|---|---|
| RESOLVED | 9858 | Bhekizitha Maphosa | 2026-09-13 | 07:00–13:00 Padstal Lynnwood Pretoria | Manual overlap review | 6.00 |  | Bernie Burness | 2026-09-16 06:16 | APPROVED |
| RESOLVED | 9857 | Bhekizitha Maphosa | 2026-09-14 | 07:00–16:00 Botanical garden Pretoria | Manual overlap review | 9.00 |  | Bernie Burness | 2026-09-16 06:16 | APPROVED |
| RESOLVED | 9856 | Bhekizitha Maphosa | 2026-09-15 | 07:00–17:00 Botanical garden Pretoria | Manual overlap review | 10.00 |  | Bernie Burness | 2026-09-16 06:16 | APPROVED |
| RESOLVED | 9855 | Bhekizitha Maphosa | 2026-09-16 | 07:00–16:00 FNB Stadium | Manual overlap review | 9.00 |  | Bernie Burness | 2026-09-16 06:16 | APPROVED |
| RESOLVED | 9854 | Bhekizitha Maphosa | 2026-09-17 | 07:00–16:00 Botanical garden Pretoria | Manual overlap review | 9.00 |  | Bernie Burness | 2026-09-16 06:16 | APPROVED |
| RESOLVED | 9853 | Bhekizitha Maphosa | 2026-09-18 | 07:00–16:00 Loftus Versfeld Stadium | Manual overlap review | 9.00 |  | Bernie Burness | 2026-09-16 06:16 | APPROVED |
| RESOLVED | 9842 | Daniel Motaung | 2026-09-12 | 07:00–13:00 Silver Oaks | Manual overlap review | 6.00 |  | Bernie Burness | 2026-09-16 06:25 | APPROVED |
| RESOLVED | 9841 | Daniel Motaung | 2026-09-13 | 07:00–13:00 Silver Oaks | Manual overlap review | 6.00 |  | Bernie Burness | 2026-09-16 06:25 | APPROVED |
| RESOLVED | 9839 | Daniel Motaung | 2026-09-14 | 07:00–16:00 Warehouse | Manual overlap review | 9.00 |  | Bernie Burness | 2026-09-16 06:25 | APPROVED |
| RESOLVED | 9840 | Daniel Motaung | 2026-09-14 | 07:00–16:00 Warehouse | Rate choice: Warehouse or Event/Venue | 9.00 |  | Bernie Burness | 2026-09-16 06:25 | Warehouse rate chosen — shift #9723 R750,00 → R731,25 (Warehouse weekday: 9 h × R81,25) |
| RESOLVED | 9838 | Daniel Motaung | 2026-09-15 | 07:00–17:00 Bonitical Garden | Manual overlap review | 10.00 |  | Bernie Burness | 2026-09-16 06:25 | APPROVED |
| RESOLVED | 9837 | Daniel Motaung | 2026-09-16 | 07:00–16:00 Clarence | Manual overlap review | 9.00 |  | Bernie Burness | 2026-09-16 06:26 | APPROVED |
| RESOLVED | 9836 | Daniel Motaung | 2026-09-17 | 07:00–16:00 Clarence | Manual overlap review | 9.00 |  | Bernie Burness | 2026-09-16 06:26 | APPROVED |
| RESOLVED | 9835 | Daniel Motaung | 2026-09-18 | 07:00–16:00 Clarence | Manual overlap review | 9.00 |  | Bernie Burness | 2026-09-16 06:26 | APPROVED |
| RESOLVED | 9597 | Erence Mngomezulu | 2026-09-13 | 07:00–13:00 Oscar Mbos Event Escape Strike Down | Manual overlap review | 6.00 |  | Bernie Burness | 2026-09-14 14:54 | its correct |
| RESOLVED | 9696 | Erence Mngomezulu | 2026-09-14 | 07:00–16:00 Bonitical gardens | Manual overlap review | 9.00 |  | Bernie Burness | 2026-09-15 11:13 | approved |
| RESOLVED | 9843 | Erence Mngomezulu | 2026-09-15 | 07:00–16:00 Warehouse | Manual overlap review | 9.00 |  | Bernie Burness | 2026-09-16 06:26 | APPROVED |
| RESOLVED | 9844 | Erence Mngomezulu | 2026-09-15 | 07:00–16:00 Warehouse | Rate choice: Warehouse or Event/Venue | 9.00 |  | Bernie Burness | 2026-09-16 06:26 | Warehouse rate chosen — shift #9726 R750,00 → R731,25 (Warehouse weekday: 9 h × R81,25) |
| RESOLVED | 9887 | Erence Mngomezulu | 2026-09-16 | 07:00–16:00 Parys golf & country Estate | Manual overlap review | 9.00 |  | Bernie Burness | 2026-09-16 06:27 | APPROVED |
| RESOLVED | 9888 | Erence Mngomezulu | 2026-09-17 | 07:00–16:00 Parys golf & country Estate | Manual overlap review | 9.00 |  | Bernie Burness | 2026-09-16 06:27 | APPROVED |
| RESOLVED | 9889 | Erence Mngomezulu | 2026-09-18 | 07:00–16:00 Warehouse | Manual overlap review | 9.00 |  | Bernie Burness | 2026-09-16 06:27 | APPROVED |
| RESOLVED | 9890 | Erence Mngomezulu | 2026-09-18 | 07:00–16:00 Warehouse | Rate choice: Warehouse or Event/Venue | 9.00 |  | Bernie Burness | 2026-09-16 06:27 | Warehouse rate chosen — shift #9758 R750,00 → R731,25 (Warehouse weekday: 9 h × R81,25) |
| RESOLVED | 9645 | Erick Mpho Molefe | 2026-09-09 | 05:00–19:00 Headoffice SAB | Manual overlap review | 14.00 | 1.00 | Bernie Burness | 2026-09-14 15:49 | Already claimed last week check wages xcel marked pink |
| RESOLVED | 9639 | Erick Mpho Molefe | 2026-09-10 | 07:00–23:00 SAB Grosvenor | Manual overlap review | 16.00 | 0.00 | Bernie Burness | 2026-09-14 15:59 | claimed last week |
| RESOLVED | 9631 | Erick Mpho Molefe | 2026-09-13 | 07:00–12:00 The river Cabin | Manual overlap review | 5.00 | 5.00 | Bernie Burness | 2026-09-14 16:01 | approved |
| RESOLVED | 9647 | Erick Mpho Molefe | 2026-09-14 | 07:00–16:00 warehouse | Manual overlap review | 9.00 | 8.00 | Bernie Burness | 2026-09-14 16:01 | approved |
| RESOLVED | 9758 | Erick Mpho Molefe | 2026-09-14 | 07:00–16:00 warehouse | Rate choice: Warehouse or Event/Venue | 9.00 |  | Bernie Burness | 2026-09-15 10:41 | Warehouse rate chosen — shift #9644 R750,00 → R731,25 (Warehouse weekday: 9 h × R81,25) |
| RESOLVED | 9753 | Erick Mpho Molefe | 2026-09-15 | 07:00–16:00 Botanical Garden | Manual overlap review | 9.00 |  | Bernie Burness | 2026-09-15 11:14 | approved |
| RESOLVED | 9778 | Givemore Chifetete Kuziwa | 2026-09-12 | 08:00–14:30 Garden | Manual overlap review | 6.50 |  | Bernie Burness | 2026-09-15 12:39 | approved |
| RESOLVED | 9783 | Givemore Chifetete Kuziwa | 2026-09-14 | 08:00–16:00 Garden | Manual overlap review | 8.00 |  | Bernie Burness | 2026-09-15 12:39 | approved |
| RESOLVED | 9793 | Givemore Chifetete Kuziwa | 2026-09-15 | 08:00–16:00 Garden | Manual overlap review | 8.00 |  | Bernie Burness | 2026-09-15 12:40 | approved |
| RESOLVED | 9798 | Givemore Chifetete Kuziwa | 2026-09-16 | 08:00–16:00 Garden | Manual overlap review | 8.00 |  | Bernie Burness | 2026-09-15 12:56 | appproved |
| RESOLVED | 9803 | Givemore Chifetete Kuziwa | 2026-09-17 | 08:00–16:00 Garden | Manual overlap review | 8.00 |  | Bernie Burness | 2026-09-15 12:56 | approved |
| RESOLVED | 9808 | Givemore Chifetete Kuziwa | 2026-09-18 | 08:00–16:00 Garden | Manual overlap review | 8.00 | 0.00 | Bernie Burness | 2026-09-15 12:57 | Already claimed, so it's an error. |
| RESOLVED | 9665 | Isaac Mbele | 2026-09-09 | 07:00–17:00 HQ SAB | Manual overlap review | 10.00 | 1.00 | Bernie Burness | 2026-09-14 16:40 | Already built in North payroll. The Excel sheet shows this, which I've saved on file on the PC. |
| RESOLVED | 9669 | Isaac Mbele | 2026-09-10 | 07:00–23:00 PADSTAL | Manual overlap review | 16.00 | 7.00 | Bernie Burness | 2026-09-14 16:40 | Was already paid from 7 to 4 last week, as per the Excel sheet on the PC and payment received. |
| RESOLVED | 9770 | Isaac Mbele | 2026-09-13 | 07:00–12:00 Pretoria | Manual overlap review | 5.00 |  | Bernie Burness | 2026-09-15 11:21 | approved |
| RESOLVED | 9769 | Isaac Mbele | 2026-09-14 | 07:00–16:00 Botanical Gardens | Manual overlap review | 9.00 |  | Bernie Burness | 2026-09-15 11:21 | approved |
| RESOLVED | 9768 | Isaac Mbele | 2026-09-15 | 07:00–16:00 Botanical Gardens | Manual overlap review | 9.00 |  | Bernie Burness | 2026-09-15 11:22 | approved |
| RESOLVED | 9766 | Isaac Mbele | 2026-09-16 | 07:00–16:00 Warehouse | Manual overlap review | 9.00 |  | Bernie Burness | 2026-09-15 11:22 | approved |
| RESOLVED | 9767 | Isaac Mbele | 2026-09-16 | 07:00–16:00 Warehouse | Rate choice: Warehouse or Event/Venue | 9.00 |  | Bernie Burness | 2026-09-15 11:22 | Warehouse rate chosen — shift #9695 R750,00 → R731,25 (Warehouse weekday: 9 h × R81,25) |
| RESOLVED | 9764 | Isaac Mbele | 2026-09-17 | 07:00–16:00 Warehouse | Manual overlap review | 9.00 |  | Bernie Burness | 2026-09-15 11:22 | approved |
| RESOLVED | 9765 | Isaac Mbele | 2026-09-17 | 07:00–16:00 Warehouse | Rate choice: Warehouse or Event/Venue | 9.00 |  | Bernie Burness | 2026-09-15 11:22 | Warehouse rate chosen — shift #9694 R750,00 → R731,25 (Warehouse weekday: 9 h × R81,25) |
| RESOLVED | 9762 | Isaac Mbele | 2026-09-18 | 07:00–16:00 Warehouse | Manual overlap review | 9.00 |  | Bernie Burness | 2026-09-15 11:23 | approved |
| RESOLVED | 9763 | Isaac Mbele | 2026-09-18 | 07:00–16:00 Warehouse | Rate choice: Warehouse or Event/Venue | 9.00 |  | Bernie Burness | 2026-09-15 11:22 | Warehouse rate chosen — shift #9693 R750,00 → R731,25 (Warehouse weekday: 9 h × R81,25) |
| RESOLVED | 9717 | John Simbarashe Mhlanga | 2026-09-11 | 16:00–18:00 Extra Driving Time for Music busses | Manual overlap review | 2.00 | 2.00 | Bernie Burness | 2026-09-15 10:42 | approved |
| RESOLVED | 9710 | John Simbarashe Mhlanga | 2026-09-12 | 09:00–11:00 Carolina Mpumalanga Music busses Extra Driving | Manual overlap review | 2.00 |  | Bernie Burness | 2026-09-15 10:43 | approved |
| RESOLVED | 9711 | John Simbarashe Mhlanga | 2026-09-12 | 20:00–22:00 Carolina Mpumalanga Extra riving from outlet drop promoters | Manual overlap review | 2.00 |  | Bernie Burness | 2026-09-15 11:11 | approved |
| RESOLVED | 9712 | John Simbarashe Mhlanga | 2026-09-12 | 11:00–20:00 Caroline Mpumalanga | Manual overlap review | 9.00 |  | Bernie Burness | 2026-09-15 10:43 | approved |
| RESOLVED | 9704 | John Simbarashe Mhlanga | 2026-09-13 | 12:00–19:00 Carolina Mpumalanga music busses | Manual overlap review | 7.00 |  | Bernie Burness | 2026-09-15 11:11 | approved |
| RESOLVED | 9708 | John Simbarashe Mhlanga | 2026-09-13 | 10:00–12:00 music buss driving back 2hrs extra | Overlapping paid shifts – Bernie to decide | 2.00 | 0.00 | Bernie Burness | 2026-09-15 10:41 | approved |
| RESOLVED | 9709 | John Simbarashe Mhlanga | 2026-09-13 | 10:00–12:00 driving to outlets extra hours music buss Mpumalanga | Overlapping paid shifts – Bernie to decide | 2.00 |  | Bernie Burness | 2026-09-15 10:42 | approved |
| RESOLVED | 9718 | John Simbarashe Mhlanga | 2026-09-14 | 07:00–16:00 Botanical gardens setup | Manual overlap review | 9.00 |  | Bernie Burness | 2026-09-15 11:12 | approved |
| RESOLVED | 9616 | Joshua Motsamai Nteo | 2026-09-07 | 16:00–18:00 Late Offload | Double claim — already paid | 2.00 | 2.00 | Bernie Burness | 2026-09-14 14:53 | Not payable — same hours already paid in payroll 2026-09-05 (7 Sep 16:00–18:30, Warehouse / extra hours). Double claim. |
| RESOLVED | 9622 | Joshua Motsamai Nteo | 2026-09-10 | 05:00–14:00 SAB HQ | Partial overlap — 7 of 9 hours already paid | 9.00 | 9.00 | Bernie Burness | 2026-09-14 14:53 | 07:00–16:00 on 10 Sep already paid in payroll 2026-09-05; only the early hours 05:00–07:00 are payable. |
| RESOLVED | 9618 | Joshua Motsamai Nteo | 2026-09-13 | 07:00–13:00 Pastdal pub | Manual overlap review | 6.00 | 6.00 | Bernie Burness | 2026-09-14 15:58 | will double check |
| RESOLVED | 9661 | Joshua Motsamai Nteo | 2026-09-14 | 07:00–16:00 Botanical gardens | Manual overlap review | 9.00 | 9.00 | Bernie Burness | 2026-09-14 16:39 | Approved. |
| RESOLVED | 9868 | Joshua Motsamai Nteo | 2026-09-15 | 07:00–17:30 Botanical garden | Manual overlap review | 10.50 |  | Bernie Burness | 2026-09-16 06:29 | APPROVED |
| RESOLVED | 9869 | Joshua Motsamai Nteo | 2026-09-16 | 07:00–16:00 Warehouse | Manual overlap review | 9.00 |  | Bernie Burness | 2026-09-16 06:29 | APPROVED |
| RESOLVED | 9870 | Joshua Motsamai Nteo | 2026-09-16 | 07:00–16:00 Warehouse | Rate choice: Warehouse or Event/Venue | 9.00 |  | Bernie Burness | 2026-09-16 06:29 | Warehouse rate chosen — shift #9744 R750,00 → R731,25 (Warehouse weekday: 9 h × R81,25) |
| RESOLVED | 9871 | Joshua Motsamai Nteo | 2026-09-17 | 07:00–16:00 Warehouse | Manual overlap review | 9.00 |  | Bernie Burness | 2026-09-16 06:29 | APPROVED |
| RESOLVED | 9872 | Joshua Motsamai Nteo | 2026-09-17 | 07:00–16:00 Warehouse | Rate choice: Warehouse or Event/Venue | 9.00 |  | Bernie Burness | 2026-09-16 06:29 | Warehouse rate chosen — shift #9745 R750,00 → R731,25 (Warehouse weekday: 9 h × R81,25) |
| RESOLVED | 9873 | Joshua Motsamai Nteo | 2026-09-18 | 07:00–16:00 Warehouse | Manual overlap review | 9.00 |  | Bernie Burness | 2026-09-16 06:29 | APPROVED |
| RESOLVED | 9874 | Joshua Motsamai Nteo | 2026-09-18 | 07:00–16:00 Warehouse | Rate choice: Warehouse or Event/Venue | 9.00 |  | Bernie Burness | 2026-09-16 06:29 | Warehouse rate chosen — shift #9746 R750,00 → R731,25 (Warehouse weekday: 9 h × R81,25) |
| RESOLVED | 9822 | Patrick Ngozo | 2026-09-12 | 06:45–11:45 Monte casino and Malt silverlakes | Manual overlap review | 5.00 |  | Bernie Burness | 2026-09-15 12:49 | approved |
| RESOLVED | 9538 | Patrick Ngozo | 2026-09-13 | 07:00–12:15 River cabin groovy escape | Manual overlap review | 5.25 | 5.00 | Bernie Burness | 2026-09-14 15:53 | approved |
| RESOLVED | 9823 | Patrick Ngozo | 2026-09-14 | 06:30–16:00 Botanical gardens | Manual overlap review | 9.50 | 10.00 | Bernie Burness | 2026-09-15 12:50 | approved |
| RESOLVED | 9772 | Patrick Ngozo | 2026-09-15 | 06:30–16:00 Wearhouse | Manual overlap review | 9.50 |  | Bernie Burness | 2026-09-15 11:28 | approved |
| RESOLVED | 9676 | Solomon Moyo | 2026-09-12 | 07:00–12:00 Malt screen set up | Manual overlap review | 5.00 | 5.00 | Bernie Burness | 2026-09-15 05:54 | approve |
| RESOLVED | 9675 | Solomon Moyo | 2026-09-13 | 07:00–12:00 Malt Midrand. & Malt Monte | Manual overlap review | 5.00 | 5.00 | Bernie Burness | 2026-09-15 05:54 | approve |
| RESOLVED | 9833 | Solomon Moyo | 2026-09-14 | 07:00–16:00 Warehouse | Manual overlap review | 9.00 |  | Bernie Burness | 2026-09-16 06:30 | APPROVED |
| RESOLVED | 9834 | Solomon Moyo | 2026-09-14 | 07:00–16:00 Warehouse | Rate choice: Warehouse or Event/Venue | 9.00 |  | Bernie Burness | 2026-09-16 06:30 | Warehouse rate chosen — shift #9718 R750,00 → R731,25 (Warehouse weekday: 9 h × R81,25) |
| RESOLVED | 9831 | Solomon Moyo | 2026-09-15 | 07:00–16:00 Warehouse | Manual overlap review | 9.00 |  | Bernie Burness | 2026-09-16 06:30 | APPROVED |
| RESOLVED | 9832 | Solomon Moyo | 2026-09-15 | 07:00–16:00 Warehouse | Rate choice: Warehouse or Event/Venue | 9.00 |  | Bernie Burness | 2026-09-16 06:30 | Warehouse rate chosen — shift #9717 R750,00 → R731,25 (Warehouse weekday: 9 h × R81,25) |
| RESOLVED | 9830 | Solomon Moyo | 2026-09-16 | 07:00–16:00 Parys Country Club | Manual overlap review | 9.00 |  | Bernie Burness | 2026-09-16 06:30 | APPROVED |
| RESOLVED | 9829 | Solomon Moyo | 2026-09-17 | 07:00–16:00 Parys Country Club | Manual overlap review | 9.00 |  | Bernie Burness | 2026-09-16 06:30 | APPROVED |
| RESOLVED | 9828 | Solomon Moyo | 2026-09-18 | 07:00–16:00 Loftus | Manual overlap review | 9.00 |  | Bernie Burness | 2026-09-16 06:30 | APPROVED |
| RESOLVED | 9865 | Takavaudza Chokuda | 2026-09-13 | 13:00–14:00 Henry on-klip | Manual overlap review | 1.00 |  | Bernie Burness | 2026-09-16 06:31 | APPROVED |
| RESOLVED | 9866 | Takavaudza Chokuda | 2026-09-13 | 07:00–13:00 Pad stall | Manual overlap review | 6.00 |  | Bernie Burness | 2026-09-16 06:31 | APPROVED |
| RESOLVED | 9864 | Takavaudza Chokuda | 2026-09-14 | 07:00–16:00 Botanical | Manual overlap review | 9.00 |  | Bernie Burness | 2026-09-16 06:31 | APPROVED |
| RESOLVED | 9860 | Takavaudza Chokuda | 2026-09-15 | 07:00–17:00 Botanical | Manual overlap review | 10.00 |  | Bernie Burness | 2026-09-16 06:31 | APPROVED |
| RESOLVED | 9863 | Takavaudza Chokuda | 2026-09-16 | 07:00–16:00 Botanical | Manual overlap review | 9.00 |  | Bernie Burness | 2026-09-16 06:31 | APPROVED |
| RESOLVED | 9862 | Takavaudza Chokuda | 2026-09-17 | 07:00–16:00 Warehouse | Manual overlap review | 9.00 |  | Bernie Burness | 2026-09-16 06:31 | APPROVED |
| RESOLVED | 9861 | Takavaudza Chokuda | 2026-09-18 | 07:00–16:00 Warehouse | Manual overlap review | 9.00 |  | Bernie Burness | 2026-09-16 06:31 | APPROVED |
| RESOLVED | 9879 | Thandanani Nkala | 2026-09-12 | 07:00–12:00 The River  Cabin Fourways missed shift | Manual overlap review | 5.00 |  | Bernie Burness | 2026-09-16 06:32 | APPROVED |
| RESOLVED | 9880 | Thandanani Nkala | 2026-09-14 | 07:00–16:00 Botanical Gardens Lente Dag | Manual overlap review | 9.00 |  | Bernie Burness | 2026-09-16 06:32 | APPROVED |
| RESOLVED | 9881 | Thandanani Nkala | 2026-09-15 | 07:00–17:30 Pretoria Botanical Gardes | Manual overlap review | 10.50 |  | Bernie Burness | 2026-09-16 06:32 | APPROVED |
| RESOLVED | 9882 | Thandanani Nkala | 2026-09-16 | 07:00–16:00 FNB Stadium | Manual overlap review | 9.00 |  | Bernie Burness | 2026-09-16 06:32 | APPROVED |
| RESOLVED | 9883 | Thandanani Nkala | 2026-09-17 | 07:00–16:00 Warehouse | Manual overlap review | 9.00 |  | Bernie Burness | 2026-09-16 06:32 | APPROVED |
| RESOLVED | 9884 | Thandanani Nkala | 2026-09-17 | 07:00–16:00 Warehouse | Rate choice: Warehouse or Event/Venue | 9.00 |  | Bernie Burness | 2026-09-16 06:35 | Warehouse rate chosen — shift #9754 R750,00 → R731,25 (Warehouse weekday: 9 h × R81,25) |
| RESOLVED | 9885 | Thandanani Nkala | 2026-09-18 | 07:00–16:00 Warehouse | Manual overlap review | 9.00 |  | Bernie Burness | 2026-09-16 06:33 | APPROVED |
| RESOLVED | 9886 | Thandanani Nkala | 2026-09-18 | 07:00–16:00 Warehouse | Rate choice: Warehouse or Event/Venue | 9.00 |  | Bernie Burness | 2026-09-16 06:33 | Warehouse rate chosen — shift #9755 R750,00 → R731,25 (Warehouse weekday: 9 h × R81,25) |
| RESOLVED | 9760 | Tsotlego Petrus Malakoane | 2026-09-12 | 06:45–12:00 Silveroaks & Queens Wood | Manual overlap review | 5.25 |  | Bernie Burness | 2026-09-15 11:26 | approved |
| RESOLVED | 9759 | Tsotlego Petrus Malakoane | 2026-09-14 | 06:30–16:00 Warehouse | Manual overlap review | 9.50 |  | Bernie Burness | 2026-09-15 11:27 | approved |
| RESOLVED | 9761 | Tsotlego Petrus Malakoane | 2026-09-15 | 06:30–16:00 Warehouse | Manual overlap review | 9.50 |  | Bernie Burness | 2026-09-15 11:27 | approved |
| RESOLVED | 9825 | Tsotlego Petrus Malakoane | 2026-09-16 | 06:30–16:00 Warehouse | Manual overlap review | 9.50 |  | Bernie Burness | 2026-09-16 06:33 | APPROVED |
| RESOLVED | 9826 | Tsotlego Petrus Malakoane | 2026-09-17 | 06:30–16:00 Warehouse | Manual overlap review | 9.50 |  | Bernie Burness | 2026-09-16 06:33 | APPROVED |
| RESOLVED | 9827 | Tsotlego Petrus Malakoane | 2026-09-18 | 06:30–16:00 Warehouse | Manual overlap review | 9.50 |  | Bernie Burness | 2026-09-16 06:33 | APPROVED |

## B6. Loans and fixed deductions on the system
**Additional loans**

| # | Worker | Original | Given | Instalment | Repaid | Outstanding | Status |
|---|---|---|---|---|---|---|---|
| 5 | Daniel Motaung | R3 000,00 | 2026-08-23 | R500,00/wk | R0,00 | **R0,00** | paid |
| 1 | Erick Mpho Molefe | R2 000,00 | 2026-08-08 | R500,00/wk | R1 500,00 | **R500,00** | active |
| 2 | Isaac Mbele | R900,00 | 2026-08-11 | R250,00/wk | R550,00 | **R350,00** | active |
| 3 | Isaac Mbele | R600,00 | 2026-08-16 | R250,00/wk | R450,00 | **R150,00** | active |
| 6 | Isaac Mbele | R600,00 | 2026-09-01 | R600,00/wk | R0,00 | **R600,00** | active |

**Fixed weekly deductions**

| Worker | Type | Amount | Since |
|---|---|---|---|
| Isaac Mbele | Eggs | R260,00 | 2026-08-01 |
| Tsotlego Petrus Malakoane | Rent | R450,00 | 2026-08-01 |
| Erick Mpho Molefe | Car Payment | R1 000,00 | 2026-08-01 |

*Note: Daniel Motaung's R3 000 loan is marked paid but the ledger shows R0 repaid — flagged on the Loans tab for checking.*

## B7. Rows removed by the office (audit copies kept — reversible)
| Shift # | Worker | Date | Time | Hrs | Amount | Venue | Removed | Reason |
|---|---|---|---|---|---|---|---|---|
| 9665 | Erick Mpho Molefe | 2026-08-22 | 07:00–00:00 | 17.00 | R1 470,00 | Ellispark | 2026-09-14 17:30 | Owner instruction 2026-09-14: swept in by Select-all at 17:13; August/3 Sep outside one-week window & already paid; 9 Sep/13 Sep duplicates  |
| 9664 | Erick Mpho Molefe | 2026-08-23 | 06:00–14:00 | 8.00 | R840,00 | Elisspark strike | 2026-09-14 17:30 | Owner instruction 2026-09-14: swept in by Select-all at 17:13; August/3 Sep outside one-week window & already paid; 9 Sep/13 Sep duplicates  |
| 9661 | Erick Mpho Molefe | 2026-09-03 | 07:00–16:00 | 9.00 | R750,00 | Fnb stadium | 2026-09-14 17:30 | Owner instruction 2026-09-14: swept in by Select-all at 17:13; August/3 Sep outside one-week window & already paid; 9 Sep/13 Sep duplicates  |
| 9662 | Erick Mpho Molefe | 2026-09-03 | 07:00–16:00 | 9.00 | R750,00 | Fnb stadium set up | 2026-09-14 17:30 | Owner instruction 2026-09-14: swept in by Select-all at 17:13; August/3 Sep outside one-week window & already paid; 9 Sep/13 Sep duplicates  |
| 9663 | Erick Mpho Molefe | 2026-09-03 | 07:00–16:00 | 9.00 | R750,00 | Fnb stadium set up | 2026-09-14 17:30 | Owner instruction 2026-09-14: swept in by Select-all at 17:13; August/3 Sep outside one-week window & already paid; 9 Sep/13 Sep duplicates  |
| 9659 | Erick Mpho Molefe | 2026-09-09 | 05:00–19:00 | 14.00 | R1 200,00 | Headoffice SAB | 2026-09-14 17:30 | Owner instruction 2026-09-14: swept in by Select-all at 17:13; August/3 Sep outside one-week window & already paid; 9 Sep/13 Sep duplicates  |
| 9660 | Erick Mpho Molefe | 2026-09-13 | 07:00–12:00 | 5.00 | R675,00 | The water cabin | 2026-09-14 17:30 | Owner instruction 2026-09-14: swept in by Select-all at 17:13; August/3 Sep outside one-week window & already paid; 9 Sep/13 Sep duplicates  |
| 9708 | Givemore Chifetete Kuziwa | 2026-09-05 | 07:00–14:00 | 7.00 | R665,00 | Test FNB | 2026-09-16 06:52 | Test FNB 5 Sep 07:00-14:00 - day already paid as Soweto 08:00-17:00 in payroll 2026-09-05 - owner instruction 2026-09-15 |
| 9709 | Givemore Chifetete Kuziwa | 2026-09-05 | 13:00–16:00 | 3.00 | R285,00 | Test FNB | 2026-09-16 06:52 | Test FNB 5 Sep 13:00-16:00 - day already paid as Soweto 08:00-17:00 in payroll 2026-09-05 - owner instruction 2026-09-15 |
| 9707 | Givemore Chifetete Kuziwa | 2026-09-15 | 08:00–16:00 | 8.00 | R500,00 | Garden | 2026-09-16 06:52 | Duplicate of shift 9703 (Givemore Tue 15 Sep 08:00-16:00) - owner instruction 2026-09-15 |
| 9710 | Givemore Chifetete Kuziwa | 2026-09-18 | 08:00–16:00 | 8.00 | R500,00 | Garden | 2026-09-16 06:52 | Duplicate of shift 9706 (Givemore Fri 18 Sep 08:00-16:00) - owner instruction 2026-09-15; had manager correction #34 (Bernie, "Approved.") removed with it |

## B8. Corrections made to this week's amounts (old → new)
| Worker | Shift | Old | New | Rule |
|---|---|---|---|---|
| John | Sat 12 · 09:00–11:00 | R750 | R190 | Sat 2 h × R95 |
| John | Sat 12 · Music Bus 11:00–20:00 | R1 170 | R1 230 | R750 + 4 h × R120 |
| John | Sat 12 · 20:00–22:00 | R180 | R190 | Sat 2 h × R95 |
| John | Sun 13 · 10:00–12:00 (×2) | R270 each | R240 each | Sun 2 h × R120 (2nd copy approved 0 h) |
| John | Sun 13 · Music Bus 12:00–19:00 | R1 330 | R840 | Sun 7 h × R120 |
| Erence | Sun 13 · 07:00–13:00 | R810 | R720 | Sun 6 h × R120 |
| Erick | Sun 13 · 07:00–12:00 | R675 | R600 | Sun 5 h × R120 |
| Erick | Mon 14 · warehouse loading | R750 | R731,25 | Bernie chose Warehouse (review #9758); 8 h approved → R650 in Excel |
| Isaac | Wed 16 / Thu 17 / Fri 18 warehouse | R750 each | R731,25 each | Bernie chose Warehouse |
| Solomon | Sat 12 · 07:00–12:00 | R750 | R475 | Sat 5 h × R95 |
| Solomon | Sun 13 · 07:00–12:00 | R675 | R600 | Sun 5 h × R120 |
| Patrick | Sat 12 · 06:45–11:45 | R772,50 | R475 | Sat 5 h × R95 |
| Patrick | Sun 13 · 07:00–12:15 | R708,75 | R630 | Sun 5,25 h × R120 |
| Joshua | Sun 13 · 07:00–13:00 | R810 | R720 | Sun 6 h × R120 |

# Part C — Restoring this exact state
```
git checkout restore-2026-09-15-approved
npm run build
npx wrangler pages deploy dist --project-name bw-productions --branch main --commit-dirty=true
curl https://bwprodsystem.co.za/wages-version      # expect v2026-09-15-11
```
Data snapshot (paid rows, reviews, drafts, removed audit, loans, and the Excel) is in `docs/restore-2026-09-15-approved/`. Any row's money can be put back from `paid_rows.json` with a single update; removed duplicates can be re-inserted from `removed_audit.json`.

## Open items (agreed to look at later)
1. Void the false "self-compare" reviews (draft compared with its own paid row) — awaiting yes.
2. Drafts' open reviews not blocking the green figure — awaiting yes.
3. Rule-check panel should skip gardener-rate rows (display only).
4. Daniel's R3 000 loan — check.
5. Remove CSV and "old rules" export buttons after one clean payroll.

*Prepared for B&W Productions — Bernie Burness — 16 September 2026.*
