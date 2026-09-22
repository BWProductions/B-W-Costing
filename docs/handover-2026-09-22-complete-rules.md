---
title: "B&W Productions — Wages System: Complete Rules & Handover"
subtitle: "Every agreed rule and regulation, everything built and changed 12–22 September 2026, how the office reviews work, and how to restore"
date: "22 September 2026 · live version v2026-09-22-3 · restore tag restore-2026-09-22-petrus-v5"
---

# Part 1 — Where things are
| Item | Value |
|---|---|
| Staff app | https://bwprodsystem.co.za/wages (name + PIN) |
| Office dashboard | https://bwprodsystem.co.za/admin/wages (any logged-in office user) |
| Payroll Excel (auditor) | **Download Payroll Excel (new)** button on the dashboard · `/wages-admin/payroll.xlsx?from=YYYY-MM-DD` |
| Old export | **Export Excel (old rules – reference only)** + CSV — kept until told otherwise |
| Live code version | **v2026-09-21-2** — check at `/wages-version` |
| Health | `/wages-health` |
| Payroll week | **Saturday → Friday** |
| Auditor run | **Wednesday**. Hours for Wed–Sun are entered as a best guess ("a normal day"); staff correct them the following week. |
| Database | Cloudflare D1 `bw-productions-db` |
| Code | git `main`, tag `restore-2026-09-21-already-paid` |

# Part 2 — Pay rules (B&W rate rules v5 — general rules owner 15 Sep 2026; Petrus rule owner 22 Sep 2026)
Applied automatically at **Final Submission**, priced **per shift on the actual day worked**. The paid row is stamped `Rate rules 2026-09-15: …`.

**General staff**

| Day | Warehouse (work type *Warehouse Team*) | Event / Venue (all other work) |
|---|---|---|
| Monday–Friday | **R81,25 / h** | **R750 fixed** for time inside 07:00–16:00 **+ R90 / h** before 07:00 or after 16:00 |
| Saturday | R95 / h | R95 / h |
| Sunday | R120 / h | R120 / h |

* **Music Bus** (work type *Music Bus*): Mon–Sat **R750 fixed** (07–16) **+ R120/h** outside · Sunday **R120/h**.
* **Petrus (Tsotlego Petrus Malakoane) — NEW RULE from 22 Sep 2026 (rate rules v5)**: locked weekly **R3 800 for 6 days = R633,33 per day**, shown as **R633,33/day** on the auditor schedule.

  | Day | Inside 06:00–16:00 | Before 06:00 / after 16:00 |
  |---|---|---|
  | Monday–Friday | **R633,33 fixed** for the complete day, whatever time he arrives | **Not paid automatically.** Any time before 06:00 or after 16:00 is **HELD** and flagged red on the dashboard ("Petrus: time outside 06:00–16:00 on a weekday — approve and set the rate"). The office clicks **Approve at R82/h — R…**, types **another rate**, or **Not payable — R0**. Only then is the extra added to the shift and the Excel. |
  | Saturday | **R633,33 fixed** (day 6 of 6) | **R82 / h** before 06:00 and after 16:00 |
  | Sunday | **R95 / h** for every hour (R79,17 × 1.2 = R95) | — |

  Examples: Mon 06:30–16:30 = R633,33 paid + 0,5 h held (R41 if approved at R82) · Wed 04:50–16:00 = R633,33 paid + 1,17 h held · Fri 05:30–17:30 = R633,33 paid + 2 h held · Thu 07:15–15:45 = R633,33 · Fri 18:00–22:00 (no day time) = R0 paid + 4 h held · Sat 06:45–13:00 = R633,33 · Sat 05:00–17:00 = R797,33 (automatic) · Sun 07:00–12:00 = R475.
  The old Petrus rule (R650 for 07–16 + R81,25/h outside; Sat/Sun R95/h) applies to rows paid before 22 Sep and is **not** recalculated (closed payrolls are closed).
* **Petrus — R450 "Rent" fixed weekly deduction REMOVED 22 Sep 2026** (owner: "we will pay him the money and he must keep it himself for the rent"). Deduction #2 ended (`active = 0`, effective to 2026-09-18); it no longer appears on the dashboard, Loans & Deductions tab or Auditor Trail. Backup of the record: `docs/restore-2026-09-22-petrus/rent_deduction_before.json`.
* **Gardeners (Givemore, Takavaudza)**: House / House-Garden work at **R62,50/h**. Their Warehouse Team / Team Assistance work is priced as general staff.
* **Sharleen Ndlovu**: fixed weekly **R3 000**.
* **Midnight rule**: one row; hours before 00:00 at the start day's rate, after 00:00 at the next day's.
* **"Warehouse" only in the wording** (work type not Warehouse): red **Rate-choice** review; Bernie clicks Warehouse (R81,25/h) or Event/Venue (R750 + R90/h).
* **Never**: R375 half day · Sunday ×1.5 / ×1.2 · Music Bus R130 / R190.

Examples: Warehouse Mon 08–16 = R650 · Event Mon 05–16 = R930 · Event Sun 07–12 = R600 · Music Bus Sat 08–22 = R1 470 · Event Sat 22:00–02:00 = R430.

**Staff**: Bhekizitha, Brian, Daniel, Erence, Erick, Isaac, John, Joshua, Patrick, Solomon, Thandanani, Thina — general R90 base. Givemore — House R62,50 / Team Assistance R90. Takavaudza — House-Garden R62,50 / Warehouse Team R90. Lebo — R62,50. Petrus — R633,33/day rule (see above). Sharleen — fixed weekly.

# Part 3 — Rules for staff capturing
1. Calendar allows **last payroll's Saturday → this payroll's Friday** only. Older: *"OLDER THAN ONE WEEK — cannot be final-submitted."* Later: *"NEXT PAYROLL — capture it from Saturday."* Server refuses both.
2. A previous-week date captured now is a **missed shift**: real date kept, paid in the **current** payroll, pink pill **MISSED SHIFT – actual date …**.
3. Final Shift Check shows the real date; one tick box. **Select all → Submit selected** final-submits every ticked draft; locked / out-of-window skipped.
4. After Final Submission the card is **Submitted — locked**; locked missed shifts move into **Finally submitted shifts** with *"…do not capture them again."*
5. A draft is **R0** until final-submitted.
6. **Staff never see reviews or the office dashboard.** Nothing the office does can block a worker from capturing.

# Part 4 — Office dashboard: colours, labels, reviews
| What you see | Colour | Meaning |
|---|---|---|
| `59.00 hours · R5 190,00` by the name | yellow | **Claimed** — what the system paid at final submission |
| `Admin approved: 59.00 hours · R5 190,00` | green | **Approved** after your decisions · amber *"N reviews still open"* while undecided |
| **⚑ N open reviews ▾** | orange | Click: this worker's open reviews |
| **REVIEW – ACTION NEEDED** | red | Your decision needed (already paid / rate choice / double claim) |
| **REVIEW – open** | orange | Manual check (engine overlap review) |
| **REVIEW – RESOLVED** | green | Decided — hours or amount, your name, reason |
| **MISSED SHIFT – actual date …** + OVERLAP/CLEAR | pink / red / green | Previous-week date paid this week, checked against last payroll |
| **RULE +R…** / **⚖ all days match pay rule** | red-blue / green | Pay-rule check (display only) |
| **✎ Edit shift** / **Open X's worker app ↗** | gold | Manager correction form / worker's own page |

**Approved-hours rule (what the auditor sees)**: per paid shift, the latest RESOLVED review with approved hours (rate-choice excluded), else claimed. An **"already paid" review approved as a rand amount** pays exactly that amount on the entry (shown as a correction line).

**Reviews the system raises**

| Review | When | Colour | You click |
|---|---|---|---|
| **ALREADY PAID — …** (new, 21 Sep) | an entry in the current payroll overlaps a day already **paid** in an earlier payroll | red | **Approve as recommended — R…** / Nothing due / change hours |
| **Rate choice: Warehouse or Event/Venue** | "warehouse" wording, work type not Warehouse | red | Warehouse / Event-Venue |
| **Manual overlap review** (engine) | worker has another entry overlapping this one | orange | Approve hours / Pay as claimed / No issue |
| **Double claim — already paid** (engine) | catch-up older than one week | red | 0 h |

Known quirk (unchanged): the engine sometimes compares a draft with its own final-submitted shift and raises a "manual overlap" review — not a double charge; click *No issue – pay as claimed*.

# Part 5 — THE "ALREADY PAID" RULE (agreed 21 Sep 2026) — LIVE
**Why**: wages go to the auditor on Wednesday; Wed–Sun hours are a guess. The next week staff enter what really happened — sometimes different hours, sometimes a different job (Garden → Team, Warehouse → Event, Event → Music Bus). The system must find what was paid, compare it with what is now claimed, and work out **in rand** what is still owed.

**What the system does — automatically, on the office dashboard only**
1. Looks at every entry in the **current unpaid payroll** (draft or paid), inside the staff capture window (last Saturday → this Friday).
2. Finds any **paid** row for the same worker on the same date (proof — no paid row, no flag).
3. Reads times, venue, area, description and **work type** on both.
4. Prices the new claim at the **rate for the work type the worker selected this week** (weekday / Saturday / Sunday · Warehouse Team · Event/Venue · Music Bus · Petrus · gardener).
5. Splits the answer into **rate correction on the hours already paid** + **extra hours outside the paid window**, and states **Still due = full day at the correct rule − already paid**.
6. Opens **one red review** with the full story and **one button**.

**Example (real — Givemore, Thu 17 Sep 2026)**
> **ALREADY PAID — WRONG RATE + EXTRA HOURS**
> Givemore was paid Thu 17 Sep 2026 08:00–16:00 · Garden (Henley on klip) · House/Garden · "Cleaning" · 8.00 h × R62,50 = R500,00 (payroll 2026-09-12).
> He now claims 06:00–18:00 · Warehouse (Pretoria and fnb) · Warehouse Team · "Strike down and set up" · 12.00 h for the same day.
> Work type changed: House/Garden → Warehouse Team (rate R62,50 → R81,25).
> • Rate correction on the paid hours 08:00–16:00: 8.00 h — worth R650,00 at the correct rule, R500,00 was paid → +R150,00
> • Extra hours 06:00–08:00 + 16:00–18:00: 4.00 h → R325,00
> **Still due: R475,00** (full day 12.00 h at the correct rule = R975,00 − R500,00 already paid).
> **[ Approve as recommended — R475,00 ]** [ Nothing due — R0,00 ] ▸ I don't agree — change the hours

**The cases it handles (all verified against the rules)**

| Last week (guess) | This week (actual) | Result | Button |
|---|---|---|---|
| Garden 08–16 R500 | Warehouse Team 06–18 | +R150 rate correction, 4 h extra R325 | R475,00 |
| Warehouse 07–16 R731,25 | Event/Venue 07–16 | +R18,75 rate correction | R18,75 |
| Event 07–16 R750 | Music Bus 07–20 | 4 h extra at R120 | R480,00 |
| Team 08–16 R650 | Garden 08–16 | already paid more than the correct rule | R0,00 |
| Event 07–16 R750 | same shift entered again | duplicate | R0,00 |
| Event Sat 07–13 R570 | Event Sat 07–18 | 5 h extra at R95 | R475,00 |
| Event Wed 07–16 R750 | Event Wed 05–19 | 5 h extra at R90 | R450,00 |

**Your options on the review**
* **Approve as recommended — R…** — one click. Recorded with your name and time.
* **Nothing due — R0,00** — for a true duplicate.
* **I don't agree — change the hours** — type the extra hours you accept; the system re-prices **live at the same rate it chose** (e.g. system said 4 h → R475; you type 2 → R312,50; 6 → R637,50). Tick/untick *include the rate correction*. Give a reason, click **Approve these hours**. The server recalculates independently and records the working. **You never type a rate.**

**What approving does**: the approved rand amount is paid **in this payroll** on this entry and appears on the Excel as a correction line (*"CORRECTION: already paid R500 earlier; rate correction R150 + extra 4.00 h R325 = approved R475"*). The green figure follows. **Last week's paid row is never changed.**

**Guard rails**: current unpaid payroll only (never a closed/paid one — verified: loading the closed 12 Sep week creates nothing) · only against **paid** rows · office dashboard/Excel only · staff app never involved · flags void themselves if the entry is deleted or corrected · every check wrapped so a failure can't break the page.

# Part 6 — Payroll Excel for the auditor (6 tabs)
1. **Wage Detail Linked** (master; yellow = editable) — per shift: claimed / approved / override / **effective** hours and amounts, rate, breakdown, review #, system note, decision.
2. **Auditor Trail Linked** — Employee · Sat…Fri (**HR** editable · Amount) · **6 MISSED SHIFTS** · **Total Hours (Sat–Fri + Missed)** · Wages · deductions · loans · **NET WAGE**. No Bonus / Gross-incl-bonus. Typing HR re-prices proportionally and flows to Summary.
3. **Auditor Summary** — one line per worker, net, grand total.
4. **Flagged – Reviewed** — every review: flag, note, recommended / claimed / approved, decision, by whom, when, reason. **Each worker in its own light shade**; OPEN pink.
5. **Loans & Deductions** — fixed deductions, loans, balances, repayments.
6. **Missed Shifts** — Worker · shift · **Approved hours** (editable) · Amount · Notes; per-worker shading; feeds block 6 on the Trail.
Colour key: yellow editable · light-blue sub-total · pink attention · pastel bands = one worker. Fully formula-linked.

# Part 7 — Everything done 12–21 September 2026
**12–14 Sep** — working platform baseline, missed-shift tint, Final Shift Check real date, ✎ Edit buttons, calendar window.
**15 Sep** — rate rules v4 + midnight split at Final Submission; week corrected to the rules (14 rows; Patrick Sat 12 Sep R772,50 → R475); rate-choice review; John's Sunday duplicate to red review; **Payroll Excel** 6 tabs; missed shifts in the Excel; auditor sees approved hours only; locked missed shifts under *Finally submitted shifts*; duplicates removed with audit copies (Givemore ×4, Erick ×2); triple-check approved-hours-only passed; Givemore Friday R0 fixed (0 h review voided); 0 mismatches Excel vs database; handover PDFs + restore points.
**16 Sep** — Excel HR cells and Missed-Shift approved hours **editable** with auto re-price (v2026-09-16-1); **per-worker shading** (v2026-09-16-2).
**18 Sep** — review logic (crew check, both-sides overlap wording, proof rule, duplicate catcher) built, briefly live, **rolled back the same day** because it raised 25 reviews on the already-paid 12–18 Sep payroll. Rows deleted (backup kept), code returned to v2026-09-16-2, reviews table verified identical to the pre-change snapshot. Kept on branch `review-logic-2026-09-18`, not deployed. Lesson written into the rules: **closed payrolls are closed**.
**21 Sep** — **Already-paid rule** (Part 5) built, tested on preview with the real Givemore case and 7 rule cases, deployed as v2026-09-21-1; **change-the-hours** fold-out with live re-pricing added as v2026-09-21-2. First flag: Givemore Thu 17 Sep R475 (open, awaiting Bernie).

**22 Sep 2026 (v2026-09-22-1, v2026-09-22-2)**
* Approved "already paid" amounts on drafts now show immediately in the worker's green figure and row ("pays when final-submitted"), and are not re-flagged after Final Submission.
* **Petrus rate rules v5** (table in Part 2): R633,33/day for 06–16 Mon–Sat; Saturday extras R82/h automatic; Sunday R95/h; **Mon–Fri time outside 06–16 held for office approval and rate decision** (v2026-09-22-3, review key `petrus_extra|shift:ID`, route `/wages-admin/petrus-extra`). Applies to every Petrus row final-submitted from 22 Sep; the dashboard rule summary and Excel breakdown text read "R633,33 fixed day (06–16, R3 800 ÷ 6)".
* **Petrus R450 Rent deduction removed** (see Part 2).

# Part 8 — Payroll 12–18 Sep 2026 (paid 17 Sep) — final figures
111 paid rows (24 missed) · claimed 843,50 h · R72 438,15 · **approved 793,75 h · R71 096,90** · missed 98,00 h · R8 861,25 · deductions R3 210,00 · **net R67 886,90**. Full detail: `handover-2026-09-16-complete-hardcopy.pdf`.

# Part 9 — Restore points
| Tag / folder | State |
|---|---|
| `restore-2026-09-22-petrus-v5` | **Live now (v2026-09-22-3)** — Petrus v5 rule + rent deduction removed. To undo only the deduction removal: `UPDATE wage_recurring_deductions SET active = 1, effective_to = NULL WHERE id = 2` |
| `restore-2026-09-21-already-paid` | v2026-09-21-2 (already-paid rule, old Petrus rule, rent deduction still active) |
| `restore-2026-09-18-rolled-back` | v2026-09-16-2 after the 18 Sep rollback |
| `restore-2026-09-15-approved` | 15 Sep approved state + full data snapshot (`docs/restore-2026-09-15-approved/`) |
| `docs/restore-2026-09-21-before-paid-before/reviews.json` | Reviews table before the already-paid check first ran (158 rows) |
| `docs/restore-2026-09-16-before-crew-check/reviews.json` | Reviews table before any 18 Sep logic (157 rows) |
| `docs/rollback-2026-09-18/removed_new_check_reviews.json` | The 25 rows removed on 18 Sep |
| branch `review-logic-2026-09-18` | Crew check / duplicate catcher / proof rule — not deployed |

```
git checkout restore-2026-09-22-petrus-v5
npm run build
npx wrangler pages deploy dist --project-name bw-productions --branch main --commit-dirty=true
curl https://bwprodsystem.co.za/wages-version      # expect v2026-09-22-3
```
To go back to before the already-paid rule: `git checkout restore-2026-09-18-rolled-back` and deploy (expect v2026-09-16-2); any `paid_before|…` reviews can then be deleted (they are the only rows it writes).

# Part 10 — Standing rules (owner's instructions — never to be broken)
1. **Never break the staff flow.** Staff can always log in and capture; every check runs on the office dashboard only.
2. **The dashboard stays available to every office user** while work is being done.
3. **Nothing is ever paid, unpaid or changed automatically.** The system flags, works out and recommends; **Bernie decides**, one click.
4. **A review must carry proof** — the actual paid entry: times, venue, area, description, work type, hours, rand, payroll week. No proof, no review.
5. **Already paid → only the difference.** Show what was paid, what is now claimed, what changed (hours and/or work type), and recommend the rand difference: rate correction on paid hours + extra hours.
6. **The rate comes from the work type the worker selected**, priced by the day rule. Bernie changes **hours**, never types a rate; the system re-prices.
7. **Closed payrolls are closed.** No new reviews on, and no changes to, a payroll that has been paid. Corrections are paid in the current payroll as a visible line.
8. **Wednesday rule.** Auditor runs on Wednesday; Wed–Sun hours are estimates and may change the following week — the already-paid check exists for exactly this.
9. **Restore point before anything goes live**; report old → new for any corrected figure; test on the preview with real cases first; show Bernie before deploying.
10. Keep the CSV and old-rules Excel buttons until told otherwise.

## Open items (on Bernie's say-so)
1. Re-introduce the crew check (same venue, majority hours) for the current week only.
2. Auto-resolve the engine's self-compare reviews.
3. Drafts' open reviews not blocking the green figure.
4. Rule-check panel to skip gardener-rate rows.
5. Daniel's R3 000 loan — check.
6. Remove CSV / old-rules export after one clean payroll.

*Prepared for B&W Productions — Bernie Burness — 21 September 2026.*
