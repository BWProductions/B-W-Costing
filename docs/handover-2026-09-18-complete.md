---
title: "B&W Productions — Wages System: Complete Handover"
subtitle: "All system rules, everything built and changed 12–18 September 2026, what is live, what is parked for the next pay run, and how to restore"
date: "18 September 2026 · live version v2026-09-16-2 · restore tag restore-2026-09-18-rolled-back"
---

# Part A — The system as it is live today

## A1. Where things are
| Item | Value |
|---|---|
| Staff app | https://bwprodsystem.co.za/wages (name + PIN) |
| Office dashboard | https://bwprodsystem.co.za/admin/wages (any logged-in office user) |
| Payroll Excel (auditor) | button **Download Payroll Excel (new)** on the dashboard · `/wages-admin/payroll.xlsx?from=YYYY-MM-DD` |
| Old export | **Export Excel (old rules – reference only)** and CSV — kept for now |
| Live code version | **v2026-09-16-2** — check at `/wages-version` |
| Health | `/wages-health` |
| Payroll week | **Saturday → Friday** |
| Database | Cloudflare D1 `bw-productions-db` |
| Code | git branch `main`, tag `restore-2026-09-18-rolled-back` |

## A2. Pay rules (B&W rate rules v4, owner 15 Sep 2026) — LIVE
Applied automatically the moment a worker presses **Final Submission**; priced **per shift on the actual day worked**. The paid row is stamped `Rate rules 2026-09-15: …` with the breakdown.

**General staff**

| Day | Warehouse (work type *Warehouse Team*) | Event / Venue (everything else) |
|---|---|---|
| Monday–Friday | **R81,25 / h** | **R750 fixed** for any time inside 07:00–16:00 **+ R90 / h** before 07:00 or after 16:00 |
| Saturday | R95 / h | R95 / h |
| Sunday | R120 / h | R120 / h |

* **Music Bus** (work type *Music Bus*): Mon–Sat **R750 fixed** (07–16) **+ R120/h** outside · Sunday **R120/h**.
* **Petrus (Tsotlego Petrus Malakoane)**: Mon–Fri **R650 fixed** (07–16) **+ R81,25/h** outside · Sat & Sun **R95/h**.
* **Gardeners (Givemore, Takavaudza)**: House / House-Garden work stays on **R62,50/h** (not recalculated). Their Warehouse Team / Team Assistance work is priced as general staff.
* **Sharleen Ndlovu**: fixed weekly **R3 000** — never recalculated.
* **Midnight rule**: a shift passing midnight stays **one row**; hours before 00:00 use the start day's rate, hours after use the next day's. *Fri 22:00–02:00 Event = 2 h × R90 + 2 h × R95 = R370.*
* **"Warehouse" only in the wording** (work type not Warehouse): the system does **not** decide — it opens a **red Rate-choice review**; Bernie clicks **Warehouse (R81,25/h)** or **Event/Venue (R750 + R90/h)**. Until then the shift keeps the system amount.
* **Never again**: R375 half day · Sunday ×1.5 / ×1.2 factors · Music Bus R130 or R190.

Worked examples: Warehouse Mon 08–16 = R650 · Event Mon 05–16 = R930 · Event Sun 07–12 = R600 · Music Bus Sat 08–22 = R1 470 · Petrus Fri 20:00–01:00 = R420 · Event Sat 22:00–02:00 = R430.

## A3. Staff on the system
| Staff | Base rate | Rule |
|---|---|---|
| Bhekizitha Maphosa · Brian Ndlovu · Daniel Motaung · Erence Mngomezulu · Erick Mpho Molefe · Isaac Mbele · John Simbarashe Mhlanga · Joshua Motsamai Nteo · Patrick Ngozo · Solomon Moyo · Thandanani Nkala · Thina Dyani | R90/h | General staff rules (v4) |
| Givemore Chifetete Kuziwa | R62,50/h House · R90 Team Assistance | Gardener / general |
| Takavaudza Chokuda | R62,50/h House-Garden · R90 Warehouse Team | Gardener / general |
| Lebo Lebo | R62,50/h | General staff rules |
| Tsotlego Petrus Malakoane | R81,25/h | Petrus rule |
| Sharleen Ndlovu | — | Fixed weekly R3 000 |

## A4. Capturing rules for staff — LIVE
1. Calendar allows **last payroll's Saturday → this payroll's Friday** only. Older: red card *"OLDER THAN ONE WEEK — cannot be final-submitted. Delete it or speak to the office."* Later: *"NEXT PAYROLL — capture it from Saturday."* The server refuses both.
2. A previous-week date captured now is a **missed shift**: real date kept, paid in the **current** payroll, pink pill **MISSED SHIFT – actual date … – description**.
3. Final Shift Check shows the real date and has **one tick box**. **Select all → Submit selected** final-submits every ticked draft; locked / out-of-window cards are skipped.
4. After Final Submission the card shows **Submitted — locked**. Locked **missed shifts move into "Finally submitted shifts"** with the note *"…final-submitted, locked and paid in this payroll — do not capture them again."*
5. A draft is **R0** until final-submitted. Staff never see reviews or the office dashboard.

## A5. Office dashboard — colours and labels — LIVE
| What you see | Colour | Meaning |
|---|---|---|
| `59.00 hours · R5 190,00` after the name | **yellow/gold** | **Claimed** — what the system paid at final submission |
| `Admin approved: 59.00 hours · R5 190,00` | **green** | **Approved** — claimed less what your resolved reviews took off. Turns **amber "N reviews still open"** while a decision is outstanding |
| **⚑ N open reviews ▾** pill by the name | orange | Click: this worker's open reviews drop down |
| **REVIEW – ACTION NEEDED** | red | Needs your decision (rate choice, double claim) |
| **REVIEW – open** | orange | Manual check (overlap) |
| **REVIEW – RESOLVED** | green | Decided — shows hours, your name, reason |
| **MISSED SHIFT – actual date …** | pink | Previous-week date paid this week; below it **OVERLAP** (red) or **CLEAR** (green) against last payroll |
| **RULE +R240,00 / –R…** | red/blue | Pay-rule check: this row differs from the v4 rule by that amount (display only) |
| **⚖ all days match pay rule** | green | Worker's week agrees with the rules |
| **✎ Edit shift** | gold outline | Opens the engine's manager-correction form (asks reason, keeps audit) |
| **Open Bernie's worker app ↗** | gold | Opens that worker's own page as the office |

**Review decision form** (every review): *Approve hours* box (pre-filled with the system's recommendation) · *Reason* (pre-filled, editable) · **Record decision** · **Pay as claimed (X h)** · **No issue – pay as claimed**. Recording a decision never changes the paid row — the **approved hours** flow to the green figure and the Excel.

**Approved-hours rule (the figure the auditor sees):** for each paid shift, the **latest RESOLVED review with approved hours** (excluding rate-choice reviews) — otherwise the claimed hours. Amount for adjusted hours is repriced on the rule where the window is known, otherwise proportionally (marked ≈).

## A6. Payroll Excel for the auditor — 6 tabs — LIVE
1. **Wage Detail Linked** (master; yellow = editable): Shift ID · Employee · Date · Day · Missed? · Venue · Area · Description · Work type · Start · End · Claimed h · Approved h · Override h · **Effective h** · Amount · Override amount · **Effective amount** · Rate used · Breakdown · Override reason · Review # · System note · Review decision.
2. **Auditor Trail Linked**: Employee · 1 Sat … 7 Fri (**HR** yellow-editable · Amount) · **6 MISSED SHIFTS** (HR · Amount) · **Total Hours (Sat–Fri + Missed)** · Wages · Fixed Deductions Due / Deducted (edit) / Outstanding · Additional Loan Due / Deducted (edit) / Outstanding · Total Deducted · **NET WAGE**. **No Bonus, no Gross-incl-bonus.** Typing hours into an HR cell re-prices the amount proportionally (720/6 = 120 × 4 = R480) and flows to Summary.
3. **Auditor Summary**: one line per worker, net wage, grand total — linked to the Trail.
4. **Flagged – Reviewed**: every review on a paid shift: status, #, employee, date, shift, flag, system note, recommended / claimed / approved hours, decision, by whom, when, reason. **Each worker in a different light shade** (blue → green → cream → lilac → rose → aqua, repeating); OPEN status cells pink.
5. **Loans & Deductions**: fixed deductions, loans with balances, repayment history, Check column — aligned grid.
6. **Missed Shifts**: Worker · Missed shift · **Approved hours** (yellow, editable) · Amount · Notes (dashboard wording + OVERLAP/CLEAR). Per-worker shading. Each worker's missed total feeds block 6 on the Trail.

Colour key: **yellow = editable · light-blue = sub-total · pink = attention · pastel bands = one worker.** All tabs are formula-linked; the file opens with full recalculation on.

## A7. Reviews the live system raises
| Review | When | Colour | Recommended hours |
|---|---|---|---|
| **Rate choice: Warehouse or Event/Venue** | wording says "warehouse" but work type is not Warehouse | red | — (you choose the rate) |
| **Manual overlap review** (engine) | same worker has another entry overlapping this one (this week or last) | orange | none pre-filled |
| **Double claim — already paid** (engine) | catch-up entry older than one week / already paid | red | 0 h |
| **Overlapping paid shifts – Bernie to decide** | two paid rows of the same worker overlap this week | red | 0 h on the second |

Known quirk (documented, not changed): the engine sometimes compares a draft with **its own** final-submitted shift and raises a "manual overlap" review. Those are not double charges — decide **No issue – pay as claimed**.

# Part B — Everything done 12–18 September 2026 (in order)

## B1. 12–14 September (baseline, already handed over separately)
Working platform baseline · missed-shift tint · Final Shift Check real date · ✎ Edit buttons · calendar window. Handover: `docs/weekly-wages-working-platform-handover-2026-09-12.md`.

## B2. 15 September — rate rules and Payroll Excel (LIVE)
1. Rate rules v4 with midnight split, applied at Final Submission.
2. This week's rows corrected to the rules (14 rows; old → new reported). Patrick Sat 12 Sep R772,50 → R475.
3. Rate-choice review for "warehouse" wording. Bernie chose Warehouse for Erick Mon 14, Isaac Wed 16 / Thu 17 / Fri 18.
4. John's two Sunday 10–12 rows put in **red review** (not deleted); Bernie approved 0 h on one.
5. **Payroll Excel** (6 tabs) built to the owner's specification; layout fixed (merged title bands, one-line rows, aligned loans grid).
6. Missed shifts included in the Excel; auditor sees **approved hours only**.
7. Locked missed shifts shown under **Finally submitted shifts** in the worker app.
8. Duplicates removed **with audit copies**: Givemore Tue 15 & Fri 18 second copies; Givemore "Test FNB" ×2 on 5 Sep; Erick "Water cabin" 13 Sep and Botanical Garden 15 Sep drafts.
9. Triple-check that the system pays only approved hours — passed (3 independent checks).
10. Givemore Friday showing R0 — cause: a 0 h review sat on the surviving row; voided (#9808, #9896, #9897). Re-check of every staff member: **0 mismatches** between Excel and database.
11. Handover PDFs: `handover-2026-09-15-rate-rules-payroll-excel.pdf`, `handover-2026-09-16-complete-hardcopy.pdf` (all wage figures for week 12–18 Sep). Restore points `restore-2026-09-15-rate-rules-payroll-excel`, `restore-2026-09-15-approved`.

## B3. 16 September — Excel editability and shading (LIVE)
12. **v2026-09-16-1**: HR cells on Auditor Trail (Sat–Fri + Missed) and Approved hours on Missed Shifts are **editable (yellow)**; Amount recalculates from the typed hours and flows to totals and Summary. Verified: Erence Sun 6 → 4 h gives R480 and the Summary follows.
13. **v2026-09-16-2**: **each worker in a different light shade** on Flagged – Reviewed and Missed Shifts. Verified render; OPEN cells stay pink. **← this is the version live now.**

## B4. 18 September — review logic built, then rolled back (NOT LIVE)
Built and briefly live as v2026-09-16-3 … -7, then **fully rolled back the same morning** at the owner's instruction because it raised reviews against payroll 12–18 Sep, which had **already been paid**.

What was built (kept on git branch `review-logic-2026-09-18`, never to run on a closed payroll):

**a) Same-venue crew check** — groups everyone at the same venue on the same date at the same time (matching venue, event, **area, description**, misspellings: Botanical/Bonitical, Padstal/Pastdal/Pad stall, Wearhouse/Wharehouse, HQ/Head office); crew hours = the figure most people claimed; flags **more than the crew** (recommended = crew hours), **under-claim** (possible underpayment), **no majority** (lists every name and hours, names who claimed most), **venue not clear** (only a town typed). Orange reviews, crew table with names/hours/times on the dashboard.

**b) Overlap reviews showing both sides** — *This claim* vs *Already on record*: times, venue, area, description, type, hours, rand, payroll week, paid or draft; overlap window ("the WHOLE of this claim is inside the earlier entry" / "7,00 h of this claim is outside it"); same / different venue; **self-compare** labelled *not a double charge*.

**c) Proof rule** — an overlap review counts as open only when a **paid** entry really overlaps it; self-compare, deleted counterpart, draft-only counterpart or non-overlapping times → **"No duplication proven — no decision needed"**, not counted. Audit of 108 reviews for weeks 5–18 Sep: **only 21 had a paid, overlapping counterpart**; 77 were self-compares.

**d) Duplicate catcher** — same worker, same real date, overlapping **paid** rows (both final-submitted) → **red review, recommended = only the difference** (0 h for a straight duplicate), e.g. Erick Thu 10 Sep: paid 07–16 (9 h) last week, claimed 07–23 (16 h) this week → **7 h**. Always flags "**ALREADY BILLED LAST WEEK**" even if an earlier review was decided, and spells out what changed between the two entries (venue, area, description, type).

**Why it was rolled back:** all 25 reviews it created (17 crew + 8 duplicate, #9916–#9940) were on shifts already paid on 17 Sep and already decided in that payroll. They were **deleted** (backup `docs/rollback-2026-09-18/removed_new_check_reviews.json`), the code returned to v2026-09-16-2, and the reviews table was verified **identical** to the snapshot taken before the logic (157 rows · 40 open · 113 resolved). No shift, hour or amount changed at any point.

**Rule for re-introducing it (agreed):** it must run **only on the current, unpaid payroll week — never on a closed or paid one** — and only when the owner says go.

# Part C — Payroll week 12–18 September 2026 (paid 17 Sep) — final figures
| | |
|---|---|
| Paid shifts | 111 rows (incl. 24 missed-shift rows from the previous payroll) |
| Claimed | 843,50 h · R72 438,15 (system paid at final submission) |
| **Approved (after your reviews)** | **793,75 h · R71 096,90** |
| Missed shifts (approved) | 98,00 h · R8 861,25 |
| Deductions | R3 210,00 (fixed R1 710 + loans R1 500) |
| **Net wages** | **R67 886,90** |
| Open reviews at close | 0 (40 engine-raised items remain open in the table but none on this payroll's paid rows) |

Per-worker figures, every paid row, every review decision, loans and removed rows are in `handover-2026-09-16-complete-hardcopy.pdf` (Part B) and the data snapshot `docs/restore-2026-09-15-approved/`.

# Part D — Restore points and how to roll back
| Tag / folder | State |
|---|---|
| `restore-2026-09-18-rolled-back` | **Current live code (v2026-09-16-2)** after the 18 Sep rollback |
| `restore-2026-09-15-approved` | Approved state 15 Sep + data snapshot (`docs/restore-2026-09-15-approved/`: paid rows, reviews, drafts, removed audit, loans, Excel) |
| `restore-2026-09-15-rate-rules-payroll-excel` | Rate rules + first Payroll Excel |
| `docs/restore-2026-09-16-before-crew-check/reviews.json` | Reviews table before any 18 Sep logic (157 rows) |
| `docs/rollback-2026-09-18/removed_new_check_reviews.json` | The 25 review rows removed on 18 Sep |
| branch `review-logic-2026-09-18` | Crew check, duplicate catcher, proof rule, overlap wording — **not deployed** |

```
git checkout restore-2026-09-18-rolled-back
npm run build
npx wrangler pages deploy dist --project-name bw-productions --branch main --commit-dirty=true
curl https://bwprodsystem.co.za/wages-version      # expect v2026-09-16-2
```

Project backups (tar.gz): https://www.genspark.ai/api/files/s/88tvTUey (15 Sep approved).

# Part E — Rules of engagement (owner's standing instructions)
1. **Never break the staff flow.** Staff must always be able to log in and capture wages; all checks run on the office dashboard only.
2. **The dashboard stays available to every office user** during any work.
3. **Nothing is ever paid, unpaid or changed automatically.** The system may flag and recommend; **Bernie decides** on every review.
4. **A review must carry proof** — the actual earlier entry (times, venue, area, description, type, hours, rand, payroll). No proof, no review.
5. **Duplicates:** when the same date is already paid, flag **"already billed"**, show both entries and what changed, and recommend **only the difference**.
6. **Closed payrolls are closed.** No new reviews on a payroll that has been paid.
7. **Always take a restore point** (code tag + data snapshot) before anything goes live, and report old → new for any corrected figure.
8. Keep the CSV and old Excel buttons until told otherwise.

## Open items (for the next pay run, on your say-so)
1. Re-introduce the review logic (Part B4) restricted to the **current unpaid week only**.
2. Void the engine's false self-compare reviews automatically at creation (currently they show and you click *No issue*).
3. Drafts' open reviews not blocking the green figure.
4. Rule-check panel to skip gardener-rate rows (display only).
5. Daniel's R3 000 loan — check.
6. Remove CSV / old-rules export after one clean payroll.

*Prepared for B&W Productions — Bernie Burness — 18 September 2026.*
