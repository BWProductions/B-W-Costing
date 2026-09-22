---
title: "B&W Productions — Wages System: Complete Rules & Handover"
subtitle: "Every agreed rule and regulation, everything built and changed 12–22 September 2026, how the office reviews work, and how to restore"
date: "22 September 2026 · live version v2026-09-22-11 · restore tag restore-2026-09-22-petrus-v5"
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

# Part 2 — Pay rules (B&W rate rules v9 — general staff HOURLY BY PLACE, owner 22 Sep 2026; Petrus rule 22 Sep 2026)

General staff are paid **by the hour, to the hour, at the rate of the place they worked**. No fixed day; no before/after premium.

| Place (chosen by the work type) | Mon–Sat | Sunday (×1.2) |
|---|---|---|
| **Warehouse** (work type "Warehouse Team") | **R81,25 / h** (R650 ÷ 8) | **R97,50 / h** |
| **Venue / event** (any other work type) | **R95 / h** | **R114 / h** |

* **Staff meeting 07:00–07:30, Mon–Fri, is not paid.** A warehouse entry covering that time loses the overlap (max 30 min = R40,63 at R81,25; 15 min if he arrives 07:15). Venue entries are not touched (he is not at the office). Saturday has no meeting. Petrus's R640 set day is not touched.
* A man who moves from the warehouse to a venue is paid the warehouse hours at R81,25 and the venue hours at R95, each as its own entry. Gaps (travel) are not paid. Overlapping entries are counted once.
* Midnight: hours before 00:00 at that day's rate, after 00:00 at the next day's (Sat 22:00–Sun 02:00 = 2 × R95 + 2 × R114 = R418).

Examples: Warehouse Mon 06–16 = 10 h − 0,5 h meeting = 9,5 h × R81,25 = **R771,88** · Warehouse Mon 06–12 = 5,5 h × R81,25 = R446,88 · Warehouse Mon 08–16 (no meeting) = R650 · Warehouse Sat 06–16 = R812,50 · Warehouse Sun 06–14 = 8 h × R97,50 = R780 · Venue Mon 06–16 = R950 · Venue Mon 12–20 = R760 · Venue Sun 08–16 = 8 h × R114 = R912 · Warehouse 06–12 then Venue 12–20 = R446,88 + R760 = R1 206,88.

Owner's reasoning (22 Sep): "R650 ÷ 8 = R81,25. Take the time worked at the warehouse at R81,25, and the difference at R95 if it's at the venue. Stay with an hourly rate, but to the hour. Sundays are the 1.2 rule. 6 to 7 would only be 30 minutes — the 30 minutes for the meeting is not paid, R40,62."

* **Music Bus** (work type *Music Bus*): Mon–Sat **R750 fixed** (07–16) **+ R120/h** outside · Sunday **R120/h**.
* **Petrus (Tsotlego Petrus Malakoane) — NEW RULE from 22 Sep 2026 (rate rules v6)**: **set day rate R640,00** for 06:00–16:00, Monday–Saturday. Sunday is never automatic.

  | Day | Inside 06:00–16:00 | Before 06:00 / after 16:00 |
  |---|---|---|
  | Monday–Friday | **R640,00 set day rate** for the complete day, whatever time he arrives (he only starts at 06:00) | **R55 / h — not paid automatically.** Held and flagged red ("Petrus: time outside 06:00–16:00 on a weekday — approve and set the rate"). Office clicks **Approve at R55/h — R…**, types **another rate**, or **Not payable — R0**. Only then is it added to the shift and the Excel. |
  | Saturday | **R640,00 set day rate** | **R80 / h**, paid automatically |
  | **Sunday** | **Nothing automatic — the whole entry is HELD.** Red flag "Petrus: Sunday entry — owner to approve or decline" with the recommendation (R640 set day rate + R80/h outside 06–16). Buttons: **Approve Sunday — R…** · **Other amount** · **Decline — R0**. R0 is paid until Bernie decides. | (included in the recommendation at R80/h) |

  Examples: Mon 06:30–16:00 = R640 · Mon 06:30–16:30 = R640 paid + 0,5 h held (R27,50 if approved at R55) · Wed 04:50–16:00 = R640 paid + 1,17 h held · Fri 18:00–22:00 (no day time) = R0 paid + 4 h held · Sat 06:45–13:00 = R640 · **Sat 05:00–17:00 = R800 (day + 2 h × R80)** · Sun 07:00–12:00 = R0 until approved (R640 recommended) · Sun 04:00–18:00 = R0 until approved (R960 recommended) · Sat 20:00–01:00 = R320 paid (Saturday 4 h × R80) + Sunday 1 h held (R80 recommended).
  Rows paid before 22 Sep under the old Petrus rule (R650 for 07–16 + R81,25/h; Sat/Sun R95/h) are **not** recalculated (closed payrolls are closed).
* **Petrus — NO DEDUCTIONS from 22 Sep 2026.** Owner: "All deductions are removed. We no longer deduct anything from him going forward … unless an additional loan is made, but for now it's zero." The R450 "Rent" weekly deduction (#2) is ended (`active = 0`, effective to 2026-09-18) and he has **no loans**. Nothing is deducted on the dashboard, Loans & Deductions tab or Auditor Trail. Backup: `docs/restore-2026-09-22-petrus/rent_deduction_before.json`.
* **Gardeners (Givemore, Takavaudza)**: House / House-Garden work at **R62,50/h**. Their Warehouse Team / Team Assistance work is priced as general staff.
* **Sharleen Ndlovu**: fixed weekly **R3 000**.
* **Midnight rule**: one row; hours before 00:00 at the start day's rate, after 00:00 at the next day's.
* **"Warehouse" only in the wording** (work type not Warehouse): red **Rate-choice** review; Bernie clicks Warehouse (R81,25/h, meeting time unpaid, Sun R97,50) or Venue/Event (R95/h, Sun R114). Also catches the "Wearhouse" misspelling.
* **Never**: R375 half day · R750/R650 fixed days for general staff · Sunday ×1.5 · Music Bus R130 / R190.

Music Bus example: Sat 08–22 = R750 + 6 h × R120 = R1 470 · Sun 07–12 = R600.

**Staff**: Bhekizitha, Brian, Daniel, Erence, Erick, Isaac, John, Joshua, Patrick, Solomon, Thandanani, Thina — general R90 base. Givemore — House R62,50 / Team Assistance R90. Takavaudza — House-Garden R62,50 / Warehouse Team R90. Lebo — R62,50. Petrus — R640 set day rate (see above). Sharleen — fixed weekly.

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

# Part 5b — CREW PATTERN & VENUE-NAME CHECK (owner 22 Sep 2026) — LIVE

**Why**: under the hourly-by-place rule the *place* decides the pay (Warehouse R81,25/h · Venue R95/h). "If 90 % say warehouse and 10 % say venue, ask: were they at the venue? They must give a specific name. No name — there's a problem."

**What the system does** (current unpaid payroll only, on every dashboard load / Excel download, never in the staff app):
1. **Venue must be named — RED.** Any entry priced at the venue rate whose venue field is blank or generic ("venue", "event", "site", "n/a", "x" …) is flagged: *"VENUE NOT NAMED: … claims the venue rate (R95/h) … but the venue field is (blank). Ask the worker where he was; if it was the warehouse, re-price at R81,25/h."*
2. **Crew pattern — ORANGE.** On any day with 4 or more workers, if the minority place is 25 % or less of the crew, each minority entry is flagged with the names: *"CREW PATTERN: 7 of 8 workers say Warehouse on Mon 21 Sep (names) — X says venue 'FNB Stadium'. Was he really there? Confirm the venue, or re-price as Warehouse."* And the reverse: *"5 of 6 were at a venue (FNB Stadium) — X says Warehouse. Check he was not at the venue (R95/h would be due)."*
3. **Decision — two unambiguous buttons, on paid rows AND drafts**: *"Where was he? Worker selected 'Warehouse Team' at 'Warehouse'. Your click decides the place and the rate:"* **WAREHOUSE — R81,25/h · R650,00 (8 h × R81,25)** or **VENUE — R95/h · R760,00 (8 h × R95)**. Each button shows the rate and the rand it produces. On a paid row the row is re-priced immediately. On a draft the place is recorded with your name; **when the worker final-submits, the rate you chose is used automatically, whatever work type he picked**, and the paid row's note says "Place decided by office (review #…, name): WAREHOUSE R81,25/h". Nothing is paid before Final Submission.
4. **Excluded**: Petrus, gardener House work, Music Bus, Sharleen (own rules). A row that already has a Rate-choice flag is not flagged twice. Decided flags never re-open; flags void themselves when the entry is corrected or deleted.

First live run (22 Sep): one flag — #9955 Takavaudza, Mon 21 Sep, "5 of 6 at a venue (FNB Stadium), this one says Warehouse" — a genuine question for the office.

# Part 5c — OVERLAP REVIEWS SHOW THE FULL BREAKDOWN (owner 22 Sep 2026) — LIVE

Owner: *"I cannot record a decision if I don't know if it was already billed. Give me a full breakdown so I know exactly what the hour is that I must approve."*

Every overlap / possible-duplicate review now carries a **"What overlaps what"** box:

* **ALREADY BILLED** — day, date, times, hours, work type, venue, description, **rand amount**, shift number and **which payroll it was paid in** (e.g. "PAID in payroll 2026-09-12 → 2026-09-18 (closed)" or "in THIS payroll, not yet paid").
* **THIS ENTRY** — the same facts for the entry under review (draft or paid row).
* **Overlap by the clock** — the exact overlapping window and hours (e.g. "06:30–12:00 = 5.50 h overlap") and **"Not covered by the other entry"** (e.g. "12:00–16:00 (4.00 h) after it").
* **Recommendation in yellow**, one of:
  * *DIFFERENT DAYS: … same clock times, but not the same day — nothing billed twice. Recommended: pay as claimed.*
  * *Identical times and place — looks like a DUPLICATE. Recommended: approve 0 h (the other one already pays X h).*
  * *Recommended: approve only the hours NOT already covered — 4.00 h (12:00–16:00). The 5.50 h overlap is already billed on shift #….*
  * *This is the SAME entry (the draft became this paid row) — nothing billed twice.*

The Approve-hours box, reason and Record decision buttons sit directly under it.

**Self-compare reviews are auto-voided.** The engine sometimes opens an overlap review comparing a draft with the very paid row it became on Final Submission (Patrick #9943 and #9951 were this). The dashboard now voids these automatically with the reason recorded — nothing was billed twice, no decision needed.

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
* **Petrus rate rules v6** (table in Part 2): R640 set day rate for 06–16 Mon–Sat; Saturday extras R80/h automatic; **Sunday whole entry held for owner approval** (approve as recommended / other amount / decline); **Mon–Fri time outside 06–16 (R55/h) held for office approval and rate decision** (review key `petrus_extra|shift:ID`, route `/wages-admin/petrus-extra`). Earlier the same day the rule was briefly R633,33/day (v2026-09-22-2/-3) — superseded before any Petrus row was paid under it. Applies to every Petrus row final-submitted from 22 Sep; the dashboard rule summary and Excel breakdown text read "R640 set day rate (06–16)".
* **Petrus: all deductions removed** — R450 Rent ended, no loans (see Part 2).
* **General staff → HOURLY BY PLACE (v2026-09-22-7, rate rules v8)**: Warehouse Team R81,25/h, Venue/Event R95/h, every hour, every day. Replaces every fixed-day rule for general staff (v7's R650/R750 fixed days lasted about an hour and priced no rows). Patrick's 4 venue rows already in the 19–25 Sep payroll re-priced to R95/h (R795→R902,50; R180→R190; R90→R95; R360→R380; backup `docs/restore-2026-09-22-rules-v8/patrick_rows_before.json`); his 22 Sep "Wearhouse — Loading" row (work type Normal) got a Rate-choice flag #9954 (Warehouse R771,88 or Venue R902,50; stays R795 until chosen). Closed payrolls untouched.
* **Sunday ×1.2 and the unpaid 07:00–07:30 staff meeting (v2026-09-22-8, rate rules v9)**: Warehouse Sun R97,50/h, Venue Sun R114/h; Mon–Fri warehouse entries lose the meeting overlap. Rate-choice #9954 for Patrick's 22 Sep row now reads Warehouse R731,25 (9 h after the meeting) or Venue R902,50.
* **Crew pattern & venue-name check (v2026-09-22-9)** — see Part 5b. Module `src/crew-pattern.ts`, review key `crew_pattern|shift:ID` / `crew_pattern|draft:ID`.
* **Overlap reviews show the full breakdown; self-compare reviews auto-voided (v2026-09-22-10)** — see Part 5c. Patrick #9943 / #9951 voided (draft vs its own paid row).
* **Place decision buttons (v2026-09-22-11)**: every Rate-choice / Crew-pattern review — paid row or draft — offers WAREHOUSE R81,25/h and VENUE R95/h with the rand each produces; a draft decision is applied automatically on Final Submission (owner: "pay as claimed doesn't tell me which one is warehouse and which is venue").

# Part 8 — Payroll 12–18 Sep 2026 (paid 17 Sep) — final figures
111 paid rows (24 missed) · claimed 843,50 h · R72 438,15 · **approved 793,75 h · R71 096,90** · missed 98,00 h · R8 861,25 · deductions R3 210,00 · **net R67 886,90**. Full detail: `handover-2026-09-16-complete-hardcopy.pdf`.

# Part 9 — Restore points
| Tag / folder | State |
|---|---|
| `restore-2026-09-22-petrus-v5` | **Live now (v2026-09-22-11)** — Petrus v5 rule + rent deduction removed. To undo only the deduction removal: `UPDATE wage_recurring_deductions SET active = 1, effective_to = NULL WHERE id = 2` |
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
curl https://bwprodsystem.co.za/wages-version      # expect v2026-09-22-11
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
