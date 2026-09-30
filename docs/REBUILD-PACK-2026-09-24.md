---
title: "B&W Productions Wages System — REBUILD PACK"
subtitle: "Everything needed to check a payroll, go back to a previous payroll, or rebuild the whole system (rules, look & feel, flagging) if this chat is ever lost"
date: "24 September 2026 · live version v2026-09-23-13 · git tag restore-2026-09-24-joshua-car · GitHub BWProductions/B-W-Costing (pushed 24 Sep)"
---

> **How to use this pack.** If a new chat/developer has to take over, give them this file (or the PDF) plus access to the GitHub repo and Cloudflare account. Section A is the checklist Bernie uses every week. Section B is how to go back. Section C is the complete rule book. Sections D–F are the technical rebuild.

---

# A — WEEKLY TRIPLE-CHECK (Bernie's checklist, every Wednesday before the auditor Excel)

Work **alphabetically, one worker at a time**, on `/admin/wages`. For each worker:

1. **Open reviews** — the orange **⚑ N open reviews** pill must be **0** before the Excel is pulled. Every red/orange review needs one click (see C7 for what each means).
2. **Duplicates** — same day, two rows? Scan the day columns. Same date + same or overlapping hours = one is a duplicate → **✎ Edit shift** → amount **R0** with the reason "duplicate of #…" (or **🗑 Delete draft** if it was never final-submitted).
3. **Already paid last week?** — any row marked **MISSED SHIFT – actual date …** (a date before last Saturday): was that date already in last week's payroll? The **ALREADY PAID** review will say so with the paid row as proof. Only the **difference** is paid (C5).
4. **Place = rate** — every "Warehouse Team" row: does the venue / area / description name a place that is *not* the warehouse (FNB, Riverside, Pretoria, a stadium, a house/garden)? Then it is a **venue** (R95/h) or **garden** (R62,50/h), not warehouse. The system flags it (**WAREHOUSE CLAIMED BUT THE ENTRY NAMES "…"**); click WAREHOUSE / VENUE.
5. **Meeting deducted** — Mon–Fri warehouse rows that start at or before 07:00 must show *"7,50 h paid (8,00 clocked)"* in the hours column. Applies on public holidays too. Petrus too.
6. **Sunday** — warehouse R97,50/h, venue R114/h (×1.2). Gardener House work R75/h (R62,50 × 1.2). Petrus Sunday is **held** until you approve.
7. **Public holiday** — every entry is a red review; approve at the holiday rule (C4). If you set everyone's hours for the day (e.g. "07–15 warehouse"), the next Monday's **follow-up panel** asks the real end time per person; **only underpayments** get a top-up.
8. **Green figure** — the green *Admin approved: N hours · R…* must equal what you intend to pay. Yellow = claimed, green = approved.
9. **Deductions & loans** — the **Fixed deductions** and **Additional loans** panels near the bottom: is what is due this week right? (Erick car R1 000 · Isaac eggs R260 · Joshua car R1 000 from 26 Sep · loan instalments per C9.)
10. **Pull the Excel** — **Download Payroll Excel (new)** (`/wages-admin/payroll.xlsx`). Check the **Auditor Summary** grand total against the dashboard total. Save a copy as `docs/BW_Payroll_<from>_to_<to>_AUDITOR.xlsx`. Send to the auditors.
11. **Stamp** — ask the assistant to write "WEEK APPROVED R…" on the worker rows (payroll note) and to make a restore point (git tag + JSON snapshot of `wage_shifts`, `wage_payroll_reviews`, loans/deductions).

**Never**: type a rate by hand · change a row in a closed (already-paid) payroll · pay anything twice for the same hours · pay Sunday ×1.5 · pay R375 half-days or R650/R750 fixed days to general staff.

---

# B — GOING BACK TO A PREVIOUS PAYROLL / PREVIOUS VERSION

## B1 — Just LOOK at a previous payroll (no change)
Dashboard: `https://bwprodsystem.co.za/admin/wages?from=2026-09-12` (any payroll Saturday). Excel: `/wages-admin/payroll.xlsx?from=2026-09-12`. Closed payrolls render read-only in effect — rule 7 says never change them.

Payroll Saturdays so far: 2026-08-01 … 08-29 · **09-05** · **09-12** (paid 17 Sep, R71 096,90 approved) · **09-19** (auditors 23 Sep, R64 933,86 gross) · **09-26** (next).

## B2 — Go back to a previous CODE version (look & feel / rules as they were)
```bash
git clone https://github.com/BWProductions/B-W-Costing.git webapp && cd webapp
npm install
git checkout <tag>                # see table below
npm run build
npx wrangler pages deploy dist --project-name bw-productions --branch main --commit-dirty=true
curl https://bwprodsystem.co.za/wages-version     # must print the version in the table
```
Deploying code **never changes data**. Rows, reviews, loans stay as they are.

| Tag | Version | What you get |
|---|---|---|
| `restore-2026-09-24-joshua-car` | v2026-09-23-13 | **Current live.** Everything in this pack. |
| `restore-2026-09-23-payroll-final` | v2026-09-23-13 | Same code; data snapshot of the 19–25 Sep payroll as sent to auditors |
| `restore-2026-09-23-difference` | v2026-09-23-2 | Difference-only WAREHOUSE/VENUE buttons (4-line sum, before the owner's single APPROVE wording) |
| `restore-2026-09-23-reopen` | v2026-09-22-16 | Reopen button, area-aware crew check |
| `restore-2026-09-22-rules-v9` | v2026-09-22-8 | Hourly-by-place + Sunday ×1.2 + meeting; before crew check / holidays |
| `restore-2026-09-22-rules-v8` | v2026-09-22-7 | Hourly-by-place (first version) |
| `restore-2026-09-22-petrus-v6` | v2026-09-22-6 | Petrus R640 set day rule |
| `restore-2026-09-21-already-paid` | v2026-09-21-2 | Already-paid rule; old Petrus rule; general staff still R750/R375 days |
| `restore-2026-09-18-rolled-back` | v2026-09-16-2 | Before any already-paid / crew logic; Excel with editable HR cells |
| `restore-2026-09-15-approved` | v2026-09-15-x | Rate rules v4 + first Payroll Excel |
| `weekly-wages-working-platform-baseline-2026-09-12` | — | Baseline before this work started |

## B3 — Go back to previous DATA (undo a row/decision)
Every change session has a `docs/restore-<date>-<topic>/` folder with `*_before.json` (the rows as they were). To undo, the assistant runs `UPDATE wage_shifts SET … WHERE id = …` from that JSON. Deleted drafts/rows are also copied into `wage_debug_capture` / `wage_deleted_shifts` / `wage_shifts_removed_audit`. Folders: `restore-2026-09-15-approved`, `-09-21-before-paid-before`, `-09-22-{petrus,rules-v8,stale-draft-720}`, `-09-23-{givemore,john,john2,joshua,holiday,final,loans}`, `-09-24-joshua-car`.

## B4 — Undo the most common single things
| Undo… | SQL the assistant runs |
|---|---|
| Petrus rent deduction removal | `UPDATE wage_recurring_deductions SET active=1, effective_to=NULL WHERE id=2` |
| Joshua car deduction | `UPDATE wage_recurring_deductions SET active=0, effective_to='<last day>' WHERE id=5` |
| A review decision | click **↺ Reopen** on the dashboard (no SQL) |
| A row amount | **✎ Edit shift** with a reason (writes `manager_update_reason`; Excel shows "OWNER CORRECTION") |
| Planned end time for a day | `DELETE FROM wage_planned_hours WHERE work_date='2026-09-24'` |

---

# C — THE COMPLETE RULE BOOK (as live on 24 Sep 2026)

## C1 — Payroll calendar
* Payroll week **Saturday → Friday**. Auditor Excel pulled **Wednesday**; Wed–Sun hours are best guesses, corrected by staff the following week (that is why the *Already paid* rule exists).
* Staff calendar allows **last Saturday → this Friday**. Older = "OLDER THAN ONE WEEK — cannot be final-submitted". Later = "NEXT PAYROLL — capture it from Saturday".
* A previous-week date captured now = **MISSED SHIFT**: real date kept, paid in the current payroll, pink pill, checked against last payroll.
* A draft is **R0** until Final Submission. After it: **Submitted — locked**.

## C2 — General staff (hourly by place — rate rules v10)
Bhekizitha, Brian, Daniel, Erence, Erick, Isaac, John, Joshua, Patrick, Solomon, Thandanani, Thina (+ Givemore/Takavaudza when not doing House work; Lebo).

| Place (from work type, cross-checked against venue/area/description) | Mon–Sat | Sunday ×1.2 | Public holiday ×2 |
|---|---|---|---|
| **Warehouse** | **R81,25/h** (R650 ÷ 8) | **R97,50/h** | **R162,50/h** |
| **Venue / event** (anything not warehouse) | **R95/h** | **R114/h** | **R190/h** |

* **Staff meeting 07:00–07:30 Mon–Fri unpaid** on warehouse entries (max 30 min = R40,63). Not on venue entries, not Saturday/Sunday. **Deducted on public holidays too** (deduct first, then ×2). Applies to Petrus too.
* Paid **to the hour**, no rounding to days. Warehouse hours at R81,25 and venue hours at R95 are separate entries; travel gaps unpaid; overlapping entries counted once.
* **Midnight** split: hours before 00:00 at that day's rate, after at the next day's (Sat 22:00–Sun 02:00 = 2×R95 + 2×R114 = R418).
* **"Warehouse Team" only means warehouse when the PLACE says warehouse.** Venue/area/description naming FNB, Riverside, Pretoria, a stadium, botanical garden, a client's house → venue (or garden). Anything that is not Meyerton / Henley / Randvaal / the warehouse address is "a place". System flags; Bernie clicks.
* Examples: Wh Mon 06–16 = 9,5 h × 81,25 = **R771,88** · Wh Mon 07–16 = 8,5 h = **R690,63** · Wh Mon 08–16 = **R650** · Wh Sat 06–16 = **R812,50** · Wh Sun 06–14 = 8 × 97,50 = **R780** · Venue Mon 06–16 = **R950** · Venue Sun 08–16 = **R912** · Wh 06–12 + Venue 12–20 = R446,88 + R760 = **R1 206,88**.

**Sunday ×1.2 and public holiday ×2 apply to EVERY place — confirmed by the owner 24 Sep 2026:**

| Place | Mon–Sat | Sunday (×1.2) | Public holiday (×2, held for approval) |
|---|---|---|---|
| Garden / House (gardeners) | R62,50/h | **R75/h** | **R125/h** |
| Warehouse | R81,25/h (Mon–Fri meeting 07:00–07:30 unpaid) | **R97,50/h** | **R162,50/h** (Mon–Fri meeting deducted first) |
| Venue / event | R95/h | **R114/h** | **R190/h** |
| Petrus | R640 set day 06–16 (+R55/h held Mon–Fri, +R80/h Sat) | held: R640 + R80/h outside | **R160/h** every hour, meeting deducted |
| **Lebo (student)** — any place | **R50/h** every clocked hour — **no meeting deduction** | **R60/h** | **R100/h** |
| Music Bus | R750 fixed 07–16 + R120/h outside | R120/h | R750 fixed 07–16 + R180/h outside |
A public holiday that falls on a Sunday is priced as a public holiday (×2), not ×2 × 1.2.

## C3 — Special people
| Who | Rule |
|---|---|
| **Music Bus** (work type, usually John) | Mon–Sat **R750 fixed** for 07–16 **+ R120/h** outside · Sunday **R120/h** · Holiday R750 + **R180/h** outside. Sat 08–22 = R750 + 6×120 = R1 470. |
| **Petrus** (Tsotlego Petrus Malakoane, staff 4) | **R640 set day** for 06:00–16:00 Mon–Sat, whatever time he arrives. Mon–Fri outside 06–16: **R55/h held** (red review: approve / other rate / R0). Saturday outside: **R80/h automatic**. **Sunday: whole entry HELD** (recommend R640 + R80/h outside; approve / other / decline). Holiday: **R160/h** every hour, meeting deducted, no fixed day (06:30–14:00 = 7 h = R1 120). **No deductions, no loans** (rent R450 ended 18 Sep). |
| **Gardeners** (Givemore staff 1, Takavaudza staff 2) | House / House-Garden work **R62,50/h Mon–Sat; Sunday ×1.2 = R75/h** (owner 24 Sep). Holiday **R125/h** (held). Their Warehouse Team / Team Assistance work = general staff by place. Takavaudza Sun 20 Sep #9821 "Installing lights and garden work" → **VENUE R684** (6 h × R114; owner 24 Sep — was R375 garden flat, then R450 garden Sunday). |
| **Sharleen Ndlovu** (staff 17) | **Fixed weekly R3 000** (`payroll_rule = fixed_weekly`). |
| **John** Wed 16 Sep | one-off owner correction R105/h (historic). |

**🎓 Lebo — paid on his own schedule (owner 24 Sep 2026, v2026-09-24-4).** Owner: *"Lebo works differently as he's a student … keep showing me his wages from Thursday the 24th going forward with a Paid button so I can push it when he's been paid and it disappears. Sometimes weekly, other times fortnightly or monthly."* Lebo (staff 16) is registered in `wage_own_schedule_staff` (from 2026-09-24). The dashboard shows a blue **"Paid on his own schedule"** panel listing every Lebo shift from that date not yet marked paid — **across payroll weeks** — date, times, hours, place, rand, a **✔ Paid** button per line and **✔ Paid — all N shifts R…** for the lot, and **TOTAL STILL TO PAY**. Pressing Paid stamps the row (`own_schedule_paid_at/by`, payroll note "PAID to worker (own schedule) by … on …") and the line leaves the list. R0 rows with an undecided review show "held — decide the review first" with no button. Amounts are never changed here (still ✎ Edit shift / reviews). Route `/wages-admin/own-schedule-paid` (accepts one id or a comma list). Lebo still appears in the normal per-worker sections and the auditor Excel as before. **Lebo's rate (owner 24 Sep, v2026-09-24-7): R50/h at any place, EVERY clocked hour — NO 07:00–07:30 meeting deduction** (owner: *"because the wages are so little … his rate is far less than anyone else's"*). Sunday ×1.2 = **R60/h**, public holiday ×2 = **R100/h** (held for approval). `ownerPayKind` → `student` / `student_warehouse` for staff 16; `STUDENT_HOURLY = 50`. State on 24 Sep: Thu 24 Sep Heritage 07:00–13:25 (owner: 13:25 is right, the 11:00 confirmation withdrawn and correction line #9864 removed) 6,42 h × R100 = **R641,67** (no meeting deduction) · Fri 25 Sep venue 9 h × R50 = **R450** · Sat 26 Sep venue 06:00–13:00 (owner: 13:00 per the Saturday note, was 12:40) 7 h × R50 = **R350** = **R1 441,67 unpaid** (rows were R0 / R855 / R633,33 under the general-staff rule before the correction). Backups `docs/restore-2026-09-24-lebo/`. **Pay date (owner 24 Sep, v2026-09-24-6): ONE payment on Tue 6 Oct 2026** for everything from 24 Sep (`wage_own_schedule_staff.next_pay_date`); the panel shows a green "ONE PAYMENT DUE TUE 6 OCT 2026" banner; every clocked hour is paid. To add another own-schedule worker: insert into `wage_own_schedule_staff`.

## C4 — Public holidays
Official gov.za list + Election Day **Wed 4 Nov 2026** (in `SA_PUBLIC_HOLIDAYS` in `src/index.tsx` and table `wage_public_holidays`). 2026 left: 4 Nov · 16 Dec · 25 Dec · 26 Dec. 2027 loaded.
* **Never paid automatically** — every entry is a red review: **Approve public holiday — R…** / Other amount / Decline R0.
* Rates: Warehouse R162,50/h (meeting off first) · Venue R190/h · Petrus R160/h (meeting off) · Music Bus R750 + R180/h · Gardener R125/h.
* **Owner sets the day** (e.g. Heritage Day: "everyone warehouse 07:00–15:00") → planned end stored in `wage_planned_hours` (2026-09-24 → 15:00) → any entry past it gets red **⏰ CLAIMED PAST 15:00** → the following week's dashboard shows the **Public-holiday follow-up panel**: per person, what was paid, dropdown of real end times 11:00–18:00 (half-hourly) each labelled *as paid* / *UNDERPAID, top-up +R…* / *worked less, nothing recovered*, **Confirm**.
* **Owner rule (23 Sep, verbatim): "Even if they worked less, I don't want anything to be done. I only want something to be done if we underpaid them."** Top-up row only; never a recovery; answer written on the row (*HOLIDAY HOURS CONFIRMED*).
* Heritage Day 24 Sep 2026 as approved: 9 men 07–15 wh **R1 218,75** · Patrick 06:30 **R1 300** · Petrus 06:30–14:00 **R1 120** · Givemore garden 08–15 **R875** · John wh 07–12 R731,25 + Music Bus 12–18 R1 110.

**📌 Owner's note panel (v2026-09-24-3, owner 24 Sep).** Any planned end time set for a day in the CURRENT payroll week (`wage_planned_hours`) shows at the top of the dashboard as a yellow note — *"Sat 26 Sep 2026 — work ended 13:00 (everyone at the warehouse …)"* — with a live count of entries in so far and how many claim past the time. Entries past it carry the red ⏰ CLAIMED PAST pill. To add a note for a day, the assistant inserts a row into `wage_planned_hours` (work_date, planned_end, note, set_by). First use: Sat 26 Sep 2026 → 13:00. Sun 27 Sep 2026 → 11:40 (owner: everyone finished 11:40).

**📌 Owner DAY RULES (owner 27 Sep 2026, v2026-09-27-1).** Table `wage_owner_day_rules(work_date PK, force_kind, staff_off_json, note, set_by)`. Two things the owner can set for a date:
1. **Forced place** — e.g. Sun 27 Sep: *"all the staff that select warehouse today will use the venue rate — they're building and fixing for a venue event."* `force_kind = 'event'` → every Warehouse Team / warehouse-wording entry that day is priced as **venue** (R95/h; Sunday R114/h) at Final Submission, on the dashboard green figure and in the Excel; the row's note says "OWNER DAY RULE …". (`force_kind = 'warehouse'` does the reverse.)
2. **Staff OFF** — e.g. *"Daniel, Thina and Patrick are off — not allowed to claim Sunday."* `staff_off_json = [10,3,13]`. An entry from them on that date is **held at R0** at Final Submission with a red review **"⛔ You marked X OFF on this day … If he did work: … = R…"** and buttons **He did work — approve R…** / Other amount / **He was OFF — decline, R0** (route `/wages-admin/petrus-extra`, key `staff_off|shift:ID`).
3. **Per-person START and END time** (v2026-09-27-2/-3; `staff_start_json` + `staff_end_json`, e.g. Takavaudza Sun 27 Sep 12:30–14:14 from the Life360 "left 52 The Avenue HOUSE at 14:14" alert) — e.g. *"Takavaudza's Sunday garden shift: he only arrived at 12:30 — can only claim from 12:30 onwards."* `staff_start_json = {"2":"12:30"}`. If he enters an earlier start, the row is **priced from the owner's time** (his clocked times stay on the row; note "OWNER START … paid from 12:30 only"; `manager_update_reason` set so the green figure and Excel keep it) and a red review **"🕧 You recorded that X only arrived at 12:30 … paid from 12:30 (R…). If he really was there from 10:00 the earlier hours would add R…"** offers **OVERRIDE — he was there, add R…** / Other amount / **Keep 12:30 start — nothing more** (key `owner_start|shift:ID`). Live-tested on the preview (Taka 10:00–15:00 garden Sunday → 2,5 h × R75 = R187,50; override → R375), test rows removed.
The **📌 Owner's notes for this week** panel at the top of the dashboard lists each day rule (forced place, names off, "⚠ N of them entered a shift anyway") together with the planned-end notes. First use: **Sun 27 Sep 2026 — venue rate for all; Daniel, Thina, Patrick OFF.** Live-tested on the preview with temporary drafts (Daniel → held R0 + review; Bhekizitha warehouse → R684 venue Sunday), test rows removed.

## C5 — Already paid → pay only the DIFFERENCE (rule of 21 Sep, wording of 23 Sep)
When a current-payroll entry overlaps a **paid** row from an earlier payroll, one red review with proof and one sum, in the owner's words:

> **Paid last week** 08:00–16:00 · House/Garden · 8,00 h × R62,50 **R500,00** (shift #9705, payroll 12–18 Sep)
> **06:00–18:00 at a venue** 12,00 h × R95 **R1 140,00**
> **Less the Garden already paid** **− R500,00**
> **WHAT YOU SHOULD PAY THIS WEEK R640,00**
> **[ ✔ APPROVE R640,00 — VENUE R95/h ]** *(small: No — he was in the warehouse instead (R434,38))*

Approve pays the difference **on this week's row** (last week's row never touched), writes "DIFFERENCE ONLY: …" into the payroll note and Excel, voids the hour-based overlap reviews as superseded. Nothing due → R0. "Change the hours" fold-out re-prices live at the same rate; **Bernie never types a rate**. Guard rails: current unpaid payroll only, only against paid rows, dashboard/Excel only, never the staff app.

**Garden entry whose wording sounds like EVENT work — the office is asked (owner 24 Sep 2026, v2026-09-24-2).** Owner: *"Installing lights in a garden — you should have asked me if that's a warehouse or a venue, because installing the lights could be a venue or garden work."* Every gardener House / House-Garden entry (Givemore, Takavaudza) is now read for event words — lights/lighting, install, set-up, strike/breakdown, rig, stage, sound, décor, draping, marquee/tent, function, wedding, party, event, tables/chairs, dance floor, festoon/fairy — and flagged red **GARDEN CLAIMED BUT THE WORK SOUNDS LIKE A VENUE JOB** with two buttons: **GARDEN — R62,50/h (Sunday R75)** or **VENUE / FUNCTION — R95/h (Sunday R114)**, each showing the rand. Works on paid rows (re-prices now) and drafts (applied at Final Submission). First case: Takavaudza Sun 20 Sep #9821 "Installing lights and garden work" — **owner decided VENUE: R684,00** (6 h × R95 × 1.2). Paid R375 on 23 Sep → shortfall R309 corrected on the same row.

## C6 — Duplicates / double-tap (v-11, 23 Sep)
1. **Phone lock**: first press greys all buttons → "Saving… please wait", full-screen overlay "Do not press again"; further presses swallowed; unlocks after 20 s.
2. **Save block**: new draft with same date + start + end as an existing draft or paid row is refused: *"This shift (…) is ALREADY SAVED — it was not lost. Open it below and press Final Submission once."* Editing an existing draft is never blocked.
3. **Final-submit block**: draft whose hours lie inside a paid row (this or an earlier payroll) is refused: *"Not final-submitted: you have ALREADY been paid for … Enter only the extra hours."*
4. **Office catch**: Already-paid / overlap / crew reviews with the difference and one APPROVE; **🗑 Delete draft**; ⏰ planned-end pill; stale drafts (before the window) in red with Delete.
5. **Excel = system**: R0 duplicates and approved differences appear identically in the Excel.
Every refusal is logged in `wage_debug_capture`.

## C7 — Reviews the office sees and what to click
| Review | Colour | Click |
|---|---|---|
| **ALREADY PAID — …** (paid_before) | red | APPROVE the difference / Nothing due R0 / change hours |
| **WAREHOUSE CLAIMED BUT THE ENTRY NAMES "…"** (crew_pattern, area-aware) | red | WAREHOUSE R81,25 / VENUE R95 (each shows the rand) |
| **CREW PATTERN: 7 of 8 say Warehouse … X says venue** | orange | WAREHOUSE / VENUE |
| **VENUE NOT NAMED** | red | ask the worker; WAREHOUSE / VENUE |
| **GARDEN CLAIMED BUT THE WORK SOUNDS LIKE A VENUE JOB** (gardener entry mentions lights / install / set-up / strike / function …) — owner 24 Sep | red | GARDEN R62,50 (Sun R75) / VENUE R95 (Sun R114) |
| **Rate choice: Warehouse or Event/Venue** ("warehouse"/"wearhouse" wording, other work type) | red | Warehouse / Event-Venue |
| **Public holiday — …** | red | Approve R… / Other amount / Decline |
| **Petrus: time outside 06–16 on a weekday** / **Petrus: Sunday entry** | red | Approve R55/h · other rate · R0 / Approve Sunday · other · Decline |
| **Manual overlap review** (engine) — with "What overlaps what" proof box | orange | Approve only uncovered hours / Pay as claimed / No issue |
| **Double claim — already paid** (engine, catch-up > 1 week) | red | 0 h |
| **STALE DRAFT** (before capture window) | red | 🗑 Delete draft |
| **⏰ CLAIMED PAST hh:mm** | red pill | follow-up panel next week |
| Every decided review | green "Decided: …" | **↺ Reopen** if you need to change it |

Self-compare reviews (draft vs its own paid row) are auto-voided. Decided flags never re-open by themselves; flags void themselves when the entry is deleted/corrected. **Pay-rule check panel retired 23 Sep** — do not rebuild it.

## C8 — What the auditor sees (Excel, 6 tabs)
1 **Wage Detail Linked** (per shift: claimed/approved/effective hours & rand, rate, breakdown, review #, decision; yellow editable) · 2 **Auditor Trail Linked** (Sat…Fri HR/Amount, 6 missed shifts, hours, wages, fixed deductions due/deducted/outstanding, loans due/deducted/outstanding, total deducted, **NET WAGE**; formula-linked) · 3 **Auditor Summary** · 4 **Flagged – Reviewed** (every review, decision, who, when; per-worker pastel band, OPEN pink) · 5 **Loans & Deductions** (fixed deductions in force, every loan with balance and due-this-week, repayment history) · 6 **Missed Shifts**.
Pricing precedence in the Excel: **owner correction on the row (`manager_update_reason`) is final** → RESOLVED rand decision (already-paid / difference) → RESOLVED approved hours priced by place → claimed. Fixed deduction counts in a week when `effective_from <= weekEnd` and (`effective_to` null or `>= weekStart`). Loan counts when active and `deduction_start_date <= weekEnd`, `min(deduction_amount, outstanding)`.

## C9 — Deductions & loans on the books (24 Sep 2026)
**Fixed (weekly, ongoing)**: #3 Erick Car Payment R1 000 (from 1 Aug) · #1 Isaac Eggs R260 (from 1 Aug) · **#5 Joshua Car Payment R1 000 — from the 26 Sep payroll** (paid over to Joshua on the 25th monthly). Ended: #2 Petrus Rent R450 (18 Sep) · #4 Isaac Car R500 (23 Aug).
**Additional loans**: #1 Erick R2 000 → R500 left, R500/wk · #2 Isaac R900 → R350 left, R250/wk · #3 Isaac R600 → R150 left · #6 Isaac R600 (kids' trip) → R600 due 19–25 Sep, left as scheduled · **#7 Erick R500** (22 Sep, asked R600) → R500 once, 26 Sep payroll · **#8 Isaac R500** fuel (22 Sep) → R250 on 26 Sep + R250 on 3 Oct · #5 Daniel R3 000 CT scan → **paid in full outside payroll**, no deductions.
**Open question for Bernie**: Isaac's 26 Sep week would total R1 250 of loan deductions (+ R260 eggs) — cap or leave?

## C10 — Standing rules (owner's, never to be broken)
1 Never break the staff flow — all checks on the office side. 2 Dashboard stays up while work is done. 3 Nothing is paid/unpaid/changed automatically — Bernie clicks. 4 A review must carry proof (the paid row: times, place, hours, rand, payroll). 5 Already paid → only the difference. 6 Rate comes from the place/work type; Bernie changes hours, never types a rate. 7 **Closed payrolls are closed** — corrections are a visible line in the current payroll. 8 Wednesday rule (estimates corrected next week). 9 Restore point + preview test with real cases + show Bernie before deploying; report old → new. 10 Keep the old CSV/Excel buttons until told. 11 Warehouse Team = warehouse only if the place says so. 12 Meeting deducted on holidays too. 13 Owner-set day → follow-up panel → only underpayments corrected. 14 One shift, one row. 15 An owner correction on a row is final.

---

# D — TECHNICAL: WHAT THE SYSTEM IS

## D1 — Architecture
* **Domain** `https://bwprodsystem.co.za` → Cloudflare Pages project **`bw-productions`** (branch `main` = production; branch `realdate-test` = preview).
* The project is a **Hono / TypeScript proxy** (`src/index.tsx`, ~5 800 lines). It sits in front of the original wages engine (`UPSTREAM_ORIGIN = https://3c3bcb89.bw-productions.pages.dev`, an older deployment of the same Pages project) and **rewrites its HTML with HTMLRewriter** to inject the new look, panels, buttons and rules, and adds its own routes. The engine still stores drafts/shifts and does the raw Final Submission; the proxy re-prices at submission (`applyOwnerRatesToFinalSubmission`) and writes the owner rules into the same D1 tables.
* **Database**: Cloudflare D1 **`bw-productions-db`** (id `4781960f-5bd6-4381-93fd-d8caf72f0c53`), binding `DB`. R2 bucket `bw-productions-pdfs` (binding `PDF_BUCKET`, older PDF feature).
* **Stack**: Hono ^4, Vite 5 + `@hono/vite-cloudflare-pages`, Wrangler 3, TypeScript 5, `fflate` + `xlsx` (Excel written by `src/xlsx-lite.ts` / `payroll-excel.ts`). Frontend is server-rendered HTML + inline CSS/JS (no framework); gold `#c9a84c` accent, logo `public/static/bw-logo.png`.
* **Auth**: office cookie `bw_session` = `base64(json{id,name,email,role,exp}).hmacSHA256hex` with `ADMIN_SESSION_SECRET` in `index.tsx` (`adminUserFromCookie`). Worker session `bw_wage_session` (engine, name + PIN). Office can open a worker's draft via `/wages-admin/edit-draft/:id` (issues a 2 h worker session).

## D2 — Source files
| File | Purpose |
|---|---|
| `src/index.tsx` | proxy, all injectors, rate engine (`ownerPayForShift`, `ownerPayKind`, constants `WAREHOUSE_HOURLY=81.25`, `VENUE_HOURLY=95`, `SUNDAY_FACTOR=1.2`, `MEETING_START/END=07:00/07:30`, `PETRUS_DAY=640`, `PETRUS_EXTRA_RATE=55`, `PETRUS_WEEKEND_EXTRA_RATE=80`, `HOLIDAY_FACTOR=2`, `PETRUS_HOLIDAY_HOURLY=160`, `MUSICBUS_HOLIDAY_EXTRA=180`, `SA_PUBLIC_HOLIDAYS`), dashboard rendering (`/admin/wages` injector: reviews, pills, panels, green figure), all `/wages-admin/*` routes, double-tap protection, `WAGES_UI_VERSION` |
| `src/paid-before.ts` | Already-paid engine: `rowToEntry`, `rowToPaid`, `priceAgainstPaid(deps, subject, paidRows, forceKind)` → rate correction + extra hours + stillDue |
| `src/crew-pattern.ts` | Crew majority check, `VENUE_WORDS`, `wordingNamesAVenue`, `venueEvidence`, `placeOf` (→ `'ambiguous_area'`), flag texts |
| `src/payroll-excel.ts` | 6-tab auditor Excel, pricing precedence (owner correction final), fixed deductions & loans due |
| `src/xlsx-lite.ts` | minimal xlsx writer with styles/formulas |
| `docs/handover-2026-09-22-complete-rules.md/.pdf` | long-form handover (history 12–24 Sep, every decision) |
| `docs/REBUILD-PACK-2026-09-24.md/.pdf` | this file |
| `docs/restore-*/` | JSON before/after snapshots |
| `docs/BW_Payroll_2026-09-19_to_25_AUDITOR.xlsx` | file sent to auditors |

## D3 — Routes added by the proxy
| Route | Does |
|---|---|
| `GET /wages-version` · `GET /wages-health` | version string / health |
| `GET /admin/wages?from=YYYY-MM-DD` | office dashboard (proxied + injected) |
| `GET /wages-admin/payroll.xlsx?from=` | auditor Excel |
| `POST /wages-admin/review-decision` | approve hours / R0 / pay as claimed on a review |
| `POST /wages-admin/rate-choice` | WAREHOUSE / VENUE click (full day, or **difference only** when an earlier-payroll overlap exists) |
| `POST /wages-admin/paid-before-decision` | Already-paid: approve recommended / nothing due / changed hours |
| `POST /wages-admin/petrus-extra` · `/wages-admin/holiday-decision` | Petrus outside-hours / Sunday; public-holiday approve/other/decline |
| `POST /wages-admin/reopen-review` | ↺ Reopen (keeps `decisionHistory`, reverses add-ons) |
| `POST /wages-admin/delete-draft` | 🗑 Delete draft (copy to `wage_debug_capture`, voids reviews) |
| `POST /wages-admin/confirm-holiday-hours` | follow-up panel Confirm (top-up row only if diff > 0) |
| `POST /wages-admin/manager-update` (✎ Edit shift) | owner correction on a paid row (`manager_update_reason`) |
| `GET /wages-admin/edit-draft/:id` | open a worker's draft as the office |
| Worker `/wages/*` | proxied; Save/Final Submission intercepted for the duplicate & already-paid blocks and re-pricing |

## D4 — Database tables (D1) that matter
`wage_staff` (id, display_name, payroll_rule hourly/fixed_weekly, standard_weekly_amount) · `wage_work_rates` (staff|work type own rates e.g. House 62.5) · `wage_shift_drafts` · `wage_shifts` (paid rows: start/end, work_type, venue, area, description, amount, hourly_rate_snapshot, normal_hours, payroll_week_start, **manager_update_reason**, **payroll_note**, calculation_version, source_draft_id) · `wage_payroll_reviews` (issue_key unique e.g. `paid_before|shift:ID`, `crew_pattern|draft:ID`, `holiday|shift:ID`, `petrus_extra|shift:ID`; status OPEN/RESOLVED/VOID; approved_hours/amount; **system_snapshot_json** with placeDecision, differenceOnly, differenceText, approvedExtraAmount, decisionHistory, followUpNextWeek, ownerEndTime) · `wage_planned_hours` (work_date PK, planned_end, note, set_by) · `wage_public_holidays` · `wage_recurring_deductions` (fixed: type, amount, effective_from/to, active) · `wage_weekly_deductions` · `wage_additional_loans` (+ `_repayments`) · `wage_debug_capture` (every block/deletion logged) · `wage_deleted_shifts`, `wage_shifts_removed_audit` · `wage_payroll_periods` · `wage_sessions`, `wage_login_attempts`.
Staff ids: Givemore 1 · Takavaudza 2 · Thina 3 · Petrus 4 · Bhekizitha 5 · Isaac 6 · John 7 · Erence 8 · Erick 9 · Daniel 10 · Solomon 11 · Brian 12 · Patrick 13 · Thandanani 14 · Joshua 15 · Lebo 16 · Sharleen 17.

## D5 — Look & feel (so it can be recreated)
* Staff app: big white cards, gold accent `#c9a84c`, 19 px bold names, chevrons; one form per shift (date, start, end, work type, venue, area, description); **Final Shift Check** with real dates and tick boxes; *Submitted — locked* cards; *Finally submitted shifts* list; red banner messages for refusals.
* Office dashboard, top to bottom: header with **Download Payroll Excel (new)** + old export buttons · red **Public-holiday follow-up panel** (only the week after an owner-set holiday) · per-worker sections alphabetically: name, yellow claimed pill `59.00 hours · R5 190,00`, green **Admin approved** pill (amber "N reviews still open"), orange **⚑ N open reviews ▾**; rows per day with pink **MISSED SHIFT**, red **REVIEW – ACTION NEEDED**, orange **REVIEW – open**, green **REVIEW – RESOLVED** + **↺ Reopen**, red **⏰ CLAIMED PAST**, grey hours column "7,50 h paid (8,00 clocked)", gold **✎ Edit shift** / **Open X's worker app ↗**, red **STALE DRAFT** + 🗑; review cells = white box with proof lines and big green APPROVE button · bottom: **Fixed deductions** and **Additional loan deductions to review** tables (read-only preview, grand total still to deduct).
* No Pay-rule check panel (retired).

---

# E — REBUILD FROM SCRATCH (if the repo is lost too)
1. Create Cloudflare Pages project `bw-productions` bound to D1 `bw-productions-db` (existing data — never recreate the DB; if it is gone, the auditor Excel files in `docs/` are the record of every paid payroll).
2. Hono + Vite Cloudflare Pages template; copy `wrangler.jsonc` from D1 above; `npm i hono fflate xlsx`.
3. Implement in this order, testing each on the preview branch with real rows: (a) proxy + HTMLRewriter shell and version endpoint → (b) rate engine C2–C4 with the constants in D2 and unit examples in C2/C4 → (c) Final Submission re-pricing + midnight split → (d) dashboard injector: pills, green figure, ✎ Edit → (e) reviews framework (`wage_payroll_reviews`, issue_key, decision routes, Reopen) → (f) Already-paid engine (C5) → (g) crew/area check (C7) → (h) public holidays + planned hours + follow-up panel → (i) double-tap protection (C6) → (j) Excel (C8) → (k) deductions/loans panels.
4. Verify: `npx tsc --noEmit` clean of new errors; Excel vs DB 0 mismatches script; live test with temporary drafts, always deleted afterwards.
5. Tag, snapshot data JSON into `docs/restore-…`, update this pack.

---

# F — WHERE THE COPIES ARE
* **GitHub**: `https://github.com/BWProductions/B-W-Costing` — `main` pushed 24 Sep 2026 with all tags (first push since 12 Sep; keep pushing after every session: `git push origin main --tags`).
* **Cloudflare**: production deployment history in the Pages project (each deploy is roll-back-able from the Cloudflare dashboard too).
* **Docs in the repo**: this pack, the long handover, auditor Excel files, restore JSONs.
* **Sent to Bernie**: PDF of this pack and of the handover (Genspark file links in chat).

*Prepared for B&W Productions — Bernie Burness — 24 September 2026.*

### Owner notes ON EVERY ROW (v2026-09-27-6, 27 Sep 2026)
Bernie: "I asked you to show notes for me for Sundays… the warehouse doesn't show the message… it doesn't give me the times."
Every owner note for a day is printed **on the row itself** (paid rows AND not-final-submitted drafts), not only in the panel at the top:
- 📌 forced place (e.g. "everyone at the VENUE rate today — this Warehouse entry is priced as venue, Sunday R114/h");
- ⛔ worker marked OFF that day (held at R0 with red review when final-submitted);
- 🕧 per-person window (e.g. Taka 12:30–14:14): green "inside your window ✔", red "starts before / ends after" (trimmed to the window at final submission);
- 🚫 entry ENTIRELY outside the per-person window (e.g. Taka draft 931 Warehouse 07:00–12:00 vs 12:30–14:14): **held at R0** at final submission with the staff-off style red review (approve if he did work / decline). Not merely trimmed.
- ⏰ general finish time for the day (Sat 26 Sep 13:00, Sun 27 Sep 11:40): green within / red "x h past your time — ask what time he really finished". A per-person window overrides the general finish time for that person.
Helper: `ownerNotesForRow()` in src/index.tsx; final-submission rule `outsideWindowNote` in `applyOwnerRatesToFinalSubmission`.

### Several owner windows per person per day (v2026-09-27-7)
`wage_owner_day_rules.staff_windows_json = {"<staff_id>":[{"start":"07:00","end":"11:30","place":"Warehouse"},{"start":"12:30","end":"14:14","place":"House/Garden"}]}`.
At final submission an entry is paid for the piece inside a window only (red review to override); entirely outside all windows → held R0.
Sun 27 Sep 2026: everyone left the warehouse at 11:30 (planned_end 11:30); Taka warehouse 07:00–11:30 + house 12:30–14:14.
Lebo ledger: tick boxes + "Mark the TICKED shifts as PAID"; lines show NOT PAID until ticked. Lebo Heritage Day = 07:00–15:00 R800 (owner 27 Sep).

### Office edit form re-prices under the owner rules (v2026-09-28-1)
Bernie 28 Sep: "I'm trying to make changes. It's not allowing me." The engine's Edit Wage Shift form DID save the times, but
re-priced the row with its old base formula (R90/h × engine Saturday loading = R840 for Patrick #9869), so the owner rules were lost
and it looked as if the change had not taken. Now after every accepted POST /admin/wages/shifts/:id/edit the proxy calls
`repriceAfterManagerEdit()` (src/index.tsx): place from work type / wording / office decision / day rule, Sunday ×1.2, holiday ×2,
warehouse meeting, student, gardener; stamps calculation_version 10 and appends "Re-priced after office edit …" to payroll_note.
Rows carrying an owner decision (held at R0, owner-times cap, already-paid difference) are left as saved. The green message after
Save now reads "… Priced under your rules: Venue/event: 7 h × R95 = R665,00 (the engine had put R840,00)."

### Lebo Sunday ×1.5 (v2026-09-28-2, owner 28 Sep 2026)
Lebo (student, staff 16) Sunday = R50 × 1.5 = **R75/h** — Lebo only; the rest of the team stays on Sunday ×1.2. `STUDENT_SUNDAY_FACTOR = 1.5`
in src/index.tsx. Sun 27 Sep #9867 re-priced 4,5 h × R75 = R337,50 (was R270). Lebo ledger total due 6 Oct: R1 937,50.
The day-rule "everyone at the venue rate" note on Lebo's rows says he stays on his student rate.

### Owner amounts 28 Sep 2026 (v2026-09-28-4)
- Givemore #9794 Heritage Day Thu 24 Sep: owner set **R950,00** (formula gave R875 = 7 h × R62,50 × 2). Owner amount — do not re-price.
- Thina (staff 3, fixed weekly) #9876: **R650,00** Heritage Day weekend allowance (owner 28 Sep). Real date 24 Sep, paid in payroll
  26 Sep–2 Oct as a manager line with 0 hours, 00:00–00:00. Dashboard shows an "OWNER AMOUNT – for Thu 24 Sep" pill instead of the
  missed-shift / time checks (`isOwnerAmountLine`: hours 0 and start == end → no planned-end / owner-note checks).

### "CATCH-UP" replaces "MISSED SHIFT" everywhere the owner sees it (v2026-09-28-5, owner 28 Sep 2026)
Bernie: "CATCH-UP — use this term, but you always need to explain it, because I can't read your mind."
Definition shown with the label every time: a shift the worker did in a PREVIOUS payroll week (already paid out) but only entered
afterwards; paid now, in the current payroll, showing the real date worked; checked against what was already paid that day
(OVERLAP / CLEAR) so no hour is paid twice. "The day was not missed — the entry was late."
Where: admin dashboard legend `#bw-catchup-legend`, CATCH-UP pill (hover text), per-row "What CATCH-UP means" line on paid rows and
drafts, totals ("of which CATCH-UPS"), Excel (column header, sheet 6 title/headers), worker app locked-section heading and card text.
Internal DB marker `missed_previous_week` / description prefix "MISSED SHIFT - actual date …" is unchanged (the engine relies on it).

### Petrus fixed weekly wage — R3 840 guarantee (v2026-09-28-7, owner 28 Sep 2026)
Owner: "It's a fixed day rate, Monday to Saturday. No changes unless I tell you. Public holidays are different, but it doesn't apply
to Saturday and Sunday. If there's a public holiday on Saturday/Sunday we take 640 × 6 and put it in 5 days. You must always clear
3 840. We put it over 6 days for UIF and VAT purposes."
- Constants `PETRUS_STAFF_ID = 4`, `PETRUS_DAY = 640`, `PETRUS_WEEK_DAYS = 6`, `PETRUS_WEEK_GUARANTEE = 3840`.
- `ownerPayForShift`: for kind 'petrus' a Sat/Sun date is never treated as a public holiday (ordinary R640 Saturday; Sunday held as before).
  Mon–Fri public holiday keeps the holiday rule (hours − meeting × R160, held for approval) — that week clears MORE than R3 840.
- Dashboard panel `#bw-petrus-week`: the 6 days Mon–Sat of the payroll week, each paid / draft / today / still to come / nothing in;
  "In this payroll so far" vs the guarantee (R3 840, or R3 840 − R640 + holiday amount when a weekday holiday is priced).
  Button "Top up the missing day(s)" → POST /wages-admin/petrus-guarantee adds an owner line (event_name 'Petrus weekly guarantee',
  0 h, R640) for each fully-past Mon–Sat day with no paid row and no draft. Only days before today count as missing.
- Week 19–25 Sep check: 5 × R640 + Heritage Day R1 120 = R4 320 ✔.

### No "Final Shift Check" page — FINAL SUBMISSION submits immediately (v2026-09-28-8, owner 28 Sep 2026)
Owner: "I've told you multiple times we don't want this anymore. When you push final submit, it just finally submits it."
The worker's FINAL SUBMISSION button is a GET link to /wages/drafts/:id/final-check (engine's confirmation page with tick boxes).
The proxy now treats that GET like the confirmation POST: rewrites it to POST /final-submit with the engine's three yes-answers
(time_correct / end_time_correct / information_complete), runs the normal final-submit handling (Saturday parking, real date,
owner-rule re-pricing) and redirects to /wages/me?submitted=1. The check page is never shown. Errors go to /wages/me?error=….
Escape hatch for debugging only: ?bw_show_check=1 still renders the engine page. Tested 29 Sep with a throwaway draft (removed).

### Owner corrections 29 Sep 2026 (v2026-09-29-1)
1. Holiday follow-up panel ("REALLY WORKED UNTIL") excludes owner-amount lines (0 h, start = end, e.g. Thina R650) and fixed-weekly
   staff — those were paid properly and need no re-check.
2. Petrus on a Mon–Fri public holiday: the owner MUST approve (was he actually there?). Review offers two buttons:
   "Approve public holiday rates — R…" (hours − meeting × R160) or "Approve fixed rate — R640,00" (choice `fixed_day`), plus other amount / R0.
3. Planned finish time (Sat 26 13:00, Sun 27 11:30 etc.) applies to WAREHOUSE and VENUE staff only — never to Music Bus entries
   (work type / venue contains "music bus") and never to Petrus. `planEndApplies()` gates both the CLAIMED PAST pill and the on-row note.

### Lebo venue rate + Sonop 14:00 (v2026-09-29-3, owner 29 Sep 2026)
Lebo: R50/h is WAREHOUSE ONLY. Venue / collection / setup / event = R75/h (`STUDENT_EVENT_HOURLY`). Sunday R75/h anywhere. Holiday R100/h.
Sat 26 Sep Sonop team (Solomon, Bhekizitha, Daniel, Lebo, Thandanani, Erence) worked to 14:00 — rows re-timed and re-priced; Patrick/Joshua
were NOT at Sonop and stay 13:00. A per-person owner window overrides the general planned-end pill. Full detail: docs/restore-2026-09-29-sonop-lebo/.

### Update 29 Sep (v2026-09-29-4)
- Daniel #9897 Sat 26: NOT on the Sonop team (only 07:00 starter; enters 07:00 on every shift) — reverted to 07:00–13:00 = R570 (owner option B).
  Sonop 14:00 team is: Solomon, Bhekizitha, Lebo, Thandanani, Erence.
- Lebo rate is read from WHAT HE WRITES (owner: "just read what he writes"): `studentKindFromWording()` —
  event words (collect / setup / deliver / drop-off / breakdown / strike / standby / activation / event / venue / golf / stadium / hotel /
  arena / festival / wedding / function / install / rig) → R75, and they WIN over the word "warehouse";
  otherwise warehouse words (load / offload / prepar / pack / clean / wash / sort / stock / receiv / warehouse) or Warehouse work type → R50;
  anything else → R75. No owner question needed.
