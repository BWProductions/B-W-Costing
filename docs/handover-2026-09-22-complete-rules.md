---
title: "B&W Productions — Wages System: Complete Rules & Handover"
subtitle: "Every agreed rule and regulation, everything built and changed 12–23 September 2026, how the office reviews work, the 19–25 Sep payroll as sent to the auditors, and how to restore"
date: "23 September 2026 · live version v2026-09-23-13 · restore tag restore-2026-09-23-payroll-final"
---

# Part 1 — Where things are
| Item | Value |
|---|---|
| Staff app | https://bwprodsystem.co.za/wages (name + PIN) |
| Office dashboard | https://bwprodsystem.co.za/admin/wages (any logged-in office user) |
| Payroll Excel (auditor) | **Download Payroll Excel (new)** button on the dashboard · `/wages-admin/payroll.xlsx?from=YYYY-MM-DD` |
| Old export | **Export Excel (old rules – reference only)** + CSV — kept until told otherwise |
| Live code version | **v2026-09-23-13** — check at `/wages-version` |
| Health | `/wages-health` |
| Payroll week | **Saturday → Friday** |
| Auditor run | **Wednesday**. Hours for Wed–Sun are entered as a best guess ("a normal day"); staff correct them the following week. |
| Database | Cloudflare D1 `bw-productions-db` |
| Code | git `main`, tag `restore-2026-09-23-payroll-final` |
| Latest auditor file | `docs/BW_Payroll_2026-09-19_to_25_AUDITOR.xlsx` — 91 rows, **R61 933,86** + Sharleen R3 000 = **R64 933,86**, 0 mismatches Excel vs database, 0 open reviews |

# Part 2 — Pay rules (B&W rate rules v10 — general staff HOURLY BY PLACE, owner 22 Sep 2026; Petrus rule 22 Sep 2026)

General staff are paid **by the hour, to the hour, at the rate of the place they worked**. No fixed day; no before/after premium.

| Place (chosen by the work type) | Mon–Sat | Sunday (×1.2) |
|---|---|---|
| **Warehouse** (work type "Warehouse Team") | **R81,25 / h** (R650 ÷ 8) | **R97,50 / h** |
| **Venue / event** (any other work type) | **R95 / h** | **R114 / h** |

* **Staff meeting 07:00–07:30, Mon–Fri, is not paid.** A warehouse entry covering that time loses the overlap (max 30 min = R40,63 at R81,25; 15 min if he arrives 07:15). Venue entries are not touched (he is not at the office). Saturday has no meeting. Petrus's R640 set day is not touched. **Owner 23 Sep: the meeting is deducted on public holidays too** (Heritage Day 07:00–15:00 warehouse = 7,5 h, not 8).
* **"Warehouse Team" only means the warehouse when the PLACE says warehouse (owner 23 Sep, Takavaudza rule).** Work type Warehouse Team with venue/area/description naming FNB, Riverside, a stadium, a garden, a client's house etc. is priced by the place named: venue → R95/h, House → gardener R62,50/h. The system cross-checks every Warehouse Team entry against venue, area and description and asks the office warehouse / venue / garden (Part 5b item 4). Example: Takavaudza Sun 20 Sep "Warehouse Team" at the House, 6 h = 6 × R62,50 × 1.2 = **R450** (gardener rate with Sunday ×1.2 — corrected 24 Sep).
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
* **Gardeners (Givemore, Takavaudza)**: House / House-Garden work at **R62,50/h Mon–Sat, Sunday ×1.2 = R75/h** (owner 24 Sep: Takavaudza Sun 20 Sep 6 h = **R450**, not R375 — code fixed v2026-09-24-1). Their Warehouse Team / Team Assistance work is priced as general staff.
* **Sharleen Ndlovu**: fixed weekly **R3 000**.
* **Midnight rule**: one row; hours before 00:00 at the start day's rate, after 00:00 at the next day's.
* **"Warehouse" only in the wording** (work type not Warehouse): red **Rate-choice** review; Bernie clicks Warehouse (R81,25/h, meeting time unpaid, Sun R97,50) or Venue/Event (R95/h, Sun R114). Also catches the "Wearhouse" misspelling.
* **Never**: R375 half day · R750/R650 fixed days for general staff · Sunday ×1.5 · Music Bus R130 / R190.

Music Bus example: Sat 08–22 = R750 + 6 h × R120 = R1 470 · Sun 07–12 = R600.

**Staff**: Bhekizitha, Brian, Daniel, Erence, Erick, Isaac, John, Joshua, Patrick, Solomon, Thandanani, Thina — general R90 base. Givemore — House R62,50 / Team Assistance R90. Takavaudza — House-Garden R62,50 / Warehouse Team R90. Lebo — R62,50. Petrus — R640 set day rate (see above). Sharleen — fixed weekly.

## Public holidays (owner 22 Sep 2026, rate rules v10) — LIVE

Official gov.za list (Public Holidays Act 36 of 1994; a holiday on a Sunday makes the following Monday a holiday) **plus the proclaimed Election Day, Wednesday 4 November 2026**. 2026 remaining: Thu 24 Sep Heritage Day · Wed 4 Nov Election Day · Wed 16 Dec Reconciliation · Fri 25 Dec Christmas · Sat 26 Dec Goodwill. 2027 loaded to Day of Goodwill (observed Mon 27 Dec). The list lives in `SA_PUBLIC_HOLIDAYS` in `src/index.tsx` and in the engine table `wage_public_holidays` (Election Day added 22 Sep).

**Work on a public holiday is never paid automatically.** Every entry is a **red review** with the recommended amount and three buttons: **Approve public holiday — R…** · **Other amount** · **Decline — R0**. R0 until the owner decides. Recommended amounts:

| Who | Public-holiday rate |
|---|---|
| General staff — Warehouse | **R162,50 / h** (R81,25 × 2) · **Mon–Fri the 07:00–07:30 meeting is deducted first** (owner 23 Sep) |
| General staff — Venue | **R190 / h** (R95 × 2) |
| Petrus | **No fixed day** — **R160 / h** for every hour (R80 × 2, R80 = R640 ÷ 8) |
| Music Bus | **R750 fixed** 07–16 **+ R180 / h** outside 07–16 |
| Gardener House work (Givemore, Takavaudza) | **R125 / h** (R62,50 × 2) — owner 23 Sep |
| Sharleen | own rule, unchanged |

Examples (Heritage Day): Warehouse 07–15 = 8 h − 0,5 h meeting = 7,5 h × R162,50 = **R1 218,75** · Warehouse 06–16 = 9,5 h × R162,50 = R1 543,75 · Venue 08–18 = R1 900 · Petrus 06:30–14:00 with meeting deducted = 7 h × R160 = **R1 120** · Music Bus 12–18 = R750 + 2 h × R180 = R1 110 · Gardener 08–15 = 7 h × R125 = **R875** · Wed 23 Sep 22:00 → Thu 24 Sep 02:00 = 2 h × R95 paid + Heritage 2 h × R190 = R380 held.

**Heritage Day, Thursday 24 September 2026 — what was actually approved (owner 23 Sep).** Owner: *"Everyone is in the warehouse Thursday 07:00 to 15:00 — no set-ups. Deduct the meeting. Next week the system must ask me what time they really worked until and flag over- or under-payment."* All Heritage Day rows were set by the office to the planned day (hours in red below are the owner's guess, to be confirmed the following Monday):

| Worker | Approved hours | Rule | Amount paid this payroll |
|---|---|---|---|
| Bhekizitha, Daniel, Erence, Erick, Isaac, Joshua, Solomon, Takavaudza, Thandanani | 07:00–15:00 warehouse | 7,5 h × R162,50 (meeting off) | **R1 218,75** each |
| Patrick | 06:30–15:00 warehouse | 8 h × R162,50 | **R1 300,00** |
| Petrus | 06:30–14:00 (meeting off) | 7 h × R160 | **R1 120,00** — confirm 14:00 next week |
| Givemore (gardener) | 08:00–15:00 House/Garden | 7 h × R125 | **R875,00** — flag next week if he only worked 4 h |
| John | 07:00–12:00 warehouse **+** 12:00–18:00 Music Bus | 4,5 h × R162,50 = R731,25 + R750 + 2 h × R180 = R1 110 | **R1 841,25** |

The planned end **15:00** is recorded in the new table `wage_planned_hours` (2026-09-24 → 15:00). Any Heritage Day entry a worker captures past 15:00 is flagged red **⏰ CLAIMED PAST 15:00** on the dashboard, and from Monday 28 Sep the dashboard opens a **public-holiday follow-up panel** (Part 4) asking, per worker, "what time did he really work until?" with the rand difference worked out.

**Owner 23 Sep, verbatim: "Even if they worked less, I don't want anything to be done. I only want something to be done if we underpaid them."** So on Monday: Bernie picks the real end time per person → worked MORE than paid = top-up line at the holiday rule in the 26 Sep payroll; worked less or the same = nothing paid, nothing deducted, answer recorded only. Petrus's holiday pricing also deducts the meeting (06:30–14:00 = 7 h × R160 = R1 120 shows as "as paid").

Owner's words: "Petrus — take the hourly rate, R80, or event rate, and multiply by 2 for the hours worked. No longer a fixed rate on a public holiday. Music Bus fixed 750 for 7 to 4; anything after 4 pm R180 an hour."

# Part 3 — Rules for staff capturing
1. Calendar allows **last payroll's Saturday → this payroll's Friday** only. Older: *"OLDER THAN ONE WEEK — cannot be final-submitted."* Later: *"NEXT PAYROLL — capture it from Saturday."* Server refuses both.
2. A previous-week date captured now is a **missed shift**: real date kept, paid in the **current** payroll, pink pill **MISSED SHIFT – actual date …**.
3. Final Shift Check shows the real date; one tick box. **Select all → Submit selected** final-submits every ticked draft; locked / out-of-window skipped.
4. After Final Submission the card is **Submitted — locked**; locked missed shifts move into **Finally submitted shifts** with *"…do not capture them again."*
5. A draft is **R0** until final-submitted.
6. **Staff never see reviews or the office dashboard.** Nothing the office does can block a worker from capturing.
7. **Double-tap protection (owner 23 Sep, v2026-09-23-11).** Owner: *"Workers are pressing the button two, three, four times and the same shift lands 2–4 times."* Three layers, none of which can stop a genuine capture:
   * **In the phone**: the first press locks the form, every button greys out and reads **"Saving… please wait"**, an overlay covers the page; a second press is swallowed. Unlocks after 20 s if the network is slow.
   * **Saving a new draft** with the **same date + start + end** as a draft he already has, or as a paid row for those hours, is refused with the message *"This shift (Thu 24 Sep 07:00–15:00) is ALREADY SAVED — it was not lost. Open it below and press Final Submission once."* (or *"…has ALREADY been submitted and is in the payroll. It was not entered again. If you worked different hours that day, enter only the different hours."*). Editing an existing draft is never blocked.
   * **Final Submission** of a draft whose hours are already fully covered by a paid row (this payroll or an earlier one) is refused: *"Not final-submitted: you have ALREADY been paid for … (shift #…, payroll …)"*. Every refusal is logged in `wage_debug_capture`.
   Tested live on the preview (double-save and double-final-submit both stopped) before deployment.

**Stale drafts (owner 22 Sep 2026).** A draft the worker saved but never final-submitted, dated **before the capture window** (before last Saturday), can never be submitted and must not stay on the system — it confuses everyone and the day was usually paid already. The dashboard now shows every such draft in **red — "STALE DRAFT – … is before the capture window"** — with a **🗑 Delete draft** button. The office can also delete any other unsubmitted draft that should not be there. Deleting: asks for confirmation, keeps a full copy in the log (`wage_debug_capture`), voids any open review on it, removes it from the worker's app and the dashboard. A draft that was already final-submitted **cannot** be deleted this way (use the manager correction on the paid shift). 22 Sep: Erick's draft #720 (9 Sep, already paid as shift #9643 R1 200 in the 12 Sep payroll) removed; 14 "ghost" reviews on drafts the workers had already deleted were auto-voided (backups in `docs/restore-2026-09-22-stale-draft-720/`).

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
| `7.50 h paid (8.00 clocked)` in the hours column | grey | Hours actually paid vs hours clocked when the 07:00–07:30 meeting was deducted (v2026-09-23-5) |
| **⏰ CLAIMED PAST 15:00** | red | Entry runs past the end time the owner set for that day in `wage_planned_hours` (v2026-09-23-7) |
| **Public-holiday follow-up panel** at the top of the dashboard | red box | Appears the week after a holiday whose hours the owner set: every holiday row (one line per person, John twice: warehouse + Music Bus), what was paid, a drop-down of real end times (11:00–18:00 in half hours) each showing the rand and *UNDERPAID, top-up +R…* / *worked less, nothing recovered* / *as paid — nothing to do*, **Confirm** button. **Owner rule (23 Sep): only an UNDERPAYMENT creates a top-up line in the current payroll; if he worked less or the same, nothing is done — the answer is only written on the row** (*HOLIDAY HOURS CONFIRMED*). Route `/wages-admin/confirm-holiday-hours`. Tested live: worked-less → no row, no deduction; worked-more → +R125 top-up (test rows removed). |
| **✎ Edit shift** / **Open X's worker app ↗** | gold | Manager correction form / worker's own page |

**Retired 23 Sep (owner instruction — "remove the Pay-rule check, only that")**: the *RULE +R… / ⚖ all days match pay rule* panel and tile are gone. Every other flag (already paid, rate choice, crew pattern, overlap, holiday, Petrus, stale draft, planned end) stays.

**Approved-hours rule (what the auditor sees)**: per paid shift, the latest RESOLVED review with approved hours (rate-choice / crew-pattern / Petrus / holiday excluded), else claimed. An **"already paid" review approved as a rand amount** pays exactly that amount on the entry (shown as a correction line). **An owner correction on the row itself (✎ Edit shift with a reason, or a Heritage Day / difference decision) is final**: the Excel and the green figure show the corrected amount as *"OWNER CORRECTION: …"* and no review can override it (v2026-09-23-11/-12).

**Reviews the system raises**

| Review | When | Colour | You click |
|---|---|---|---|
| **ALREADY PAID — …** (new, 21 Sep) | an entry in the current payroll overlaps a day already **paid** in an earlier payroll | red | **Approve as recommended — R…** / Nothing due / change hours |
| **Rate choice: Warehouse or Event/Venue** | "warehouse" wording, work type not Warehouse | red | Warehouse / Event-Venue |
| **WAREHOUSE CLAIMED BUT THE ENTRY NAMES "…"** (23 Sep) | Warehouse Team selected but venue / area / description names a venue, garden or client | red | WAREHOUSE / VENUE (or the owner's one-line **APPROVE** when part of the day was paid before) |
| **Public holiday — …** (22 Sep) | any entry on a public holiday | red | Approve public holiday — R… / Other amount / Decline |
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
4. **Venue, Area AND Description are all read — RED (owner 22–23 Sep, v2026-09-22-15 → v2026-09-23-4).** Owner: *"even though he says 'warehouse' underneath, it says 'Pretoria FNB'. You should have picked up that the team was at Pretoria and FNB."* and *"Givemore writes warehouse then puts a venue name — always cross-check venue, area and description and ask me warehouse / venue / garden."* Every Warehouse Team entry is checked: if the venue, the Area box or the description names a real place (FNB, Riverside, a stadium, botanical garden, Pretoria, a client's house … anything that is not Meyerton / Henley / Randvaal / the warehouse address), it is flagged: *"WAREHOUSE CLAIMED BUT THE ENTRY NAMES "Pretoria and fnb": Givemore selected Warehouse Team at "Warehouse" … but wrote "Pretoria and fnb" — that is a venue, not the warehouse."* Same WAREHOUSE / VENUE buttons decide it; when the Area names a venue the **Venue** amount is offered as the default. First live case: Givemore Thu 17 Sep (#10073 → Venue R640 approved).
5. **Part of the day already paid in an EARLIER payroll → the buttons pay only the DIFFERENCE (owner 23 Sep, v2026-09-23-1/-2).** Owner: *"That has already been paid for the missed shift from 8 to 4, so we should only suggest paying the difference … show me your working out."* When the entry overlaps a row paid in a previous payroll, a red box lists what was paid (times, place, hours × rate = rand, shift #, payroll) and each button shows the sum **in the owner's order**:
   1. paid hours — what was paid last week (e.g. 08:00–16:00 as House/Garden, 8 h × R62,50 = R500,00)
   2. the same hours at the chosen place (8 h × R95 = R760,00)
   3. difference (2 − 1) = R260,00
   4. additional hours not yet paid at the chosen rate (4 h × R95 = R380,00; Warehouse loses the 07:00–07:30 meeting)
   **AMOUNT TO APPROVE (3 + 4)** — e.g. Givemore Thu 17 Sep: **Warehouse R434,38 · Venue R640,00**.
   **Owner's own layout (v2026-09-23-3).** Bernie asked for the sum in his words and ONE button. The review now reads, in a white box:
   > Paid last week &nbsp; 08:00–16:00 · House/Garden · 8,00 h × R62,50 &nbsp; **R500,00** (shift #9705, payroll 12–18 Sep)
   > 06:00–18:00 at a venue &nbsp; 12,00 h × R95 &nbsp; **R1 140,00**
   > Less the Garden already paid &nbsp; **− R500,00**
   > **WHAT YOU SHOULD PAY THIS WEEK &nbsp; R640,00**
   > **[ APPROVE — R640,00 ]** &nbsp; *(or: this was the warehouse — R434,38)*
   The green APPROVE pays the difference on the row (last week's row untouched), writes the sum into the row's payroll note and the Excel breakdown ("DIFFERENCE ONLY …"), and voids the hour-based overlap / already-paid reviews on the same entry as superseded. Uses the same engine as the Already-paid rule (Part 5), forced to each place. Without an earlier payment the buttons show the full-day amounts as before. **Approved on 23 Sep: Givemore Thu 17 Sep → Venue R640,00** (row #9789).
6. **Excluded**: Petrus, gardener House work, Music Bus, Sharleen (own rules). A row that already has a Rate-choice flag is not flagged twice. Decided flags never re-open; flags void themselves when the entry is corrected or deleted.

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

**↺ Reopen — change a decision (v2026-09-22-15).** Owner: *"I need to go back and edit the decided amount to 4 hours. It doesn't allow me to go back."* Every decided review now shows a small **↺ Reopen** button next to "Decided: …". Click it → the review goes back to OPEN with the same box and buttons; decide again. The previous decision is kept in the review's log (`decisionHistory`) with who reopened it. If the previous decision had added rand to a paid row (Petrus extra / public holiday), that add-on is reversed on the row and noted in the row's payroll note. Route `/wages-admin/reopen-review`.

**Approved hours are priced by place (v2026-09-22-16).** When the office approves fewer hours than claimed (e.g. 4 of 12), the payroll pays those hours at the entry's own hourly rule — Warehouse R81,25 or Venue R95, honouring any WAREHOUSE / VENUE click on that row — as the last hours of the entry (the extra hours are usually the early/late ones). The Excel and the green "Admin approved" figure agree. Example: Givemore Thu 17 Sep, 4.00 h approved → R325 as Warehouse, R380 if VENUE is clicked on #10073.

**Self-compare reviews are auto-voided.** The engine sometimes opens an overlap review comparing a draft with the very paid row it became on Final Submission (Patrick #9943 and #9951 were this). The dashboard now voids these automatically with the reason recorded — nothing was billed twice, no decision needed.

# Part 6 — Payroll Excel for the auditor (6 tabs)
1. **Wage Detail Linked** (master; yellow = editable) — per shift: claimed / approved / override / **effective** hours and amounts, rate, breakdown, review #, system note, decision.
2. **Auditor Trail Linked** — Employee · Sat…Fri (**HR** editable · Amount) · **6 MISSED SHIFTS** · **Total Hours (Sat–Fri + Missed)** · Wages · deductions · loans · **NET WAGE**. No Bonus / Gross-incl-bonus. Typing HR re-prices proportionally and flows to Summary.
3. **Auditor Summary** — one line per worker, net, grand total.
4. **Flagged – Reviewed** — every review: flag, note, recommended / claimed / approved, decision, by whom, when, reason. **Each worker in its own light shade**; OPEN pink.
5. **Loans & Deductions** — fixed deductions, loans, balances, repayments.
6. **Missed Shifts** — Worker · shift · **Approved hours** (editable) · Amount · Notes; per-worker shading; feeds block 6 on the Trail.
Colour key: yellow editable · light-blue sub-total · pink attention · pastel bands = one worker. Fully formula-linked.

# Part 6b — 19–25 Sep payroll: every decision taken with the owner on 23 Sep 2026 (alphabetical)

The owner went through **every worker** before the auditor run. All decisions are recorded on the rows (payroll note / manager reason) and in the reviews; before-states are in `docs/restore-2026-09-23-*/`.

| Worker | Decisions (old → new) |
|---|---|
| **Bhekizitha** | Thu 17 Sep FNB 16–18 (missed shift) R190 kept. Heritage Day 07–15 warehouse R1 218,75. |
| **Daniel** | Week as claimed (warehouse). Heritage Day R1 218,75. Loan #5 (R3 000 CT scan) **marked PAID IN FULL outside the payroll** — no wage deductions were or will be made. |
| **Erence** | Week as claimed. Heritage Day R1 218,75. |
| **Erick** | Mon–Wed warehouse (his Mon 21 "FNB" row was really **Thu 17 Sep 16:00–18:00 FNB** — the same shift as Bhekizitha — moved to the right date, R190 missed shift; a **Mon 21 warehouse row** was added by the office R690,63). Tue 22 / Wed 23 → warehouse R690,63 each. Heritage Day R1 218,75. **New loan #7 R500** (22 Sep). |
| **Givemore** | Thu 17 Sep: 08–16 Garden paid R500 last week; now 06–18 at Pretoria/FNB → **Venue difference R640** approved (#10073). Heritage Day gardener 08–15 → **R875** (flag next week if only 4 h). Earlier 4 duplicate rows already removed 15 Sep. |
| **Isaac** | Week as claimed. Heritage Day R1 218,75. **Loan #6 R600 deducted in full this payroll as scheduled** (owner: "leave it as is"). **New loan #8 R500** (22 Sep). |
| **John** | Wed 16 Sep: rate corrected to **R105/h** (owner correction). **Thu 17 Sep**: duplicate draft #848 deleted; only 16:00–20:00 (4 h × R120) = **R480** due (earlier hours paid last week). Mon 21 Sep duplicate → **R0**. Heritage Day 07–12 warehouse R731,25 **+** 12–18 Music Bus **R1 110** kept. Week approved **R6 461,26**. |
| **Joshua** | All shifts listed for the owner. Pastdal **Sat 13 Sep → R0** (paid in payroll 12–18 Sep). **Wed 23 Sep duplicate → R0**. Heritage Day R1 218,75. |
| **Lebo** | Stale draft removed (before capture window). |
| **Patrick** | Heritage Day 06:30–15:00 warehouse **R1 300**. Earlier Rate-choice #9954 ("Wearhouse — Loading") decided Warehouse. |
| **Petrus** | Heritage Day 06:30–14:00, meeting deducted, 7 h × R160 = **R1 120** — owner to confirm the 14:00 next week. No deductions (Part 2). |
| **Solomon** | Tue 22 Sep → **warehouse R690,63** (was venue). Heritage Day R1 218,75. |
| **Takavaudza** | Rule set (Part 2): Warehouse Team = warehouse only if the place says warehouse; FNB / Riverside = venue R95; House = garden R62,50. **Sun 20 Sep House 6 h = R375.** Heritage Day R1 218,75. |
| **Thandanani** | Two unsubmitted drafts (#905, #736) removed. Heritage Day R1 218,75. |
| **Thina** | One missed shift 5 h R475 (venue). |
| **Sharleen** | Fixed R3 000. |

Noise reviews (engine self-compare, superseded hour-based reviews once a rand decision was taken) were voided with the reason recorded. Result sent to the auditors: **0 open reviews, 0 open drafts for 12–25 Sep, Excel = database (0 mismatches)**.

**Additional loans (state after 23 Sep)**

| # | Worker | Taken | Amount | Repayment | Status |
|---|---|---|---|---|---|
| 1 | Erick | 8 Aug | R2 000 (car) | R500 / week | R500 outstanding |
| 2 | Isaac | 11 Aug | R900 | R250 / week | R350 outstanding |
| 3 | Isaac | 16 Aug | R600 | R250 / week | R150 outstanding |
| 5 | Daniel | 23 Aug | R3 000 (CT scan) | — | **PAID IN FULL outside payroll (owner 23 Sep)** |
| 6 | Isaac | 1 Sep | R600 (kids' trip) | R600 once | Deducted this payroll (19–25 Sep) — left as scheduled |
| **7** | **Erick** | **22 Sep** | **R500** (asked R600 by WhatsApp 07:15 — "please deduct all this week") | **R500 in the 26 Sep – 2 Oct payroll** | new |
| **8** | **Isaac** | **22 Sep** | **R500** (asked R600 by WhatsApp 08:15 — fuel/oil) | **R250 in 26 Sep – 2 Oct + R250 in 3 – 9 Oct** | new |

Both new loans carry the worker's WhatsApp wording in the reason and start deducting from the **26 Sep** payroll (`deduction_start_date`), so they do not touch the payroll now with the auditors. Backups: `docs/restore-2026-09-23-loans/`.

# Part 7 — Everything done 12–23 September 2026
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
* **Public holidays (v2026-09-22-12, rate rules v10)** — see Part 2 → Public holidays. Also fixed: the closed-week dashboard view had gone blank for one deploy ("too many SQL variables" on the overlap-breakdown lookup) — chunked, verified 12–18 Sep renders with 118 reviews.
* **Stale drafts & Delete draft button (v2026-09-22-13/-14)** — see Part 3. Erick #720 removed; ghost reviews auto-voided.

**23 Sep 2026 (v2026-09-22-15, v2026-09-22-16)**
* **↺ Reopen** on every decided review (Part 5c). **Area-aware crew check** (Part 5b). Overlap box now shows a draft that has since been final-submitted as "final-submitted → shift #… in this payroll (R… on the row)" instead of "not yet final-submitted"; compared drafts show their real hours/amount.
* **Approved hours priced by place** on the dashboard and in the Excel; WAREHOUSE / VENUE clicks on crew-pattern flags are honoured in the pricing, and place/Petrus/holiday reviews no longer count as an "approved hours" decision.
* **WAREHOUSE / VENUE buttons pay only the difference (v2026-09-23-1/-2)** — see Part 5b item 5. Owner rejected the full-day buttons on Givemore #10073 ("R934,38 / R1 140 is wrong — only suggest the difference"). Type-checker caught a second use-before-declaration bug before production.
* **Givemore Thu 17 Sep** (owner instruction): 08:00–16:00 already paid R500 in payroll 12–18 Sep (shift #9705); only 06:00–08:00 + 16:00–18:00 = **4.00 h due**. #9996 reopened and re-decided 4.00 h; #9944 (the earlier R475 = 4 h + R150 rate correction) voided as superseded, old decision kept in its log. Backup `docs/restore-2026-09-23-givemore/`. Fixed a bug in the area check that would have crashed the dashboard on the first area flag (caught by the type-checker before production).

**23 Sep 2026 — payroll day (v2026-09-23-3 → v2026-09-23-12), tag `restore-2026-09-23-payroll-final`**
* **v-3 Owner's one-line sum + single APPROVE** on already-paid place reviews (Part 5b item 5): "Paid last week … / 06:00–18:00 at a venue … / Less the Garden already paid / WHAT YOU SHOULD PAY THIS WEEK"; Venue offered as default when the Area names a venue. Givemore #10073 approved **R640**.
* **v-4 Cross-check every Warehouse Team entry** against venue, area and description (`crew-pattern.ts` `wordingNamesAVenue` / `venueEvidence`; flag *WAREHOUSE CLAIMED BUT THE ENTRY NAMES "…"*). Final Submission now honours an already-approved "already paid" rand amount on the draft. John Thu 17 Sep: duplicate draft #848 deleted, #9779 corrected to 4 h × R120 = **R480**.
* **v-5 Joshua**: Heritage Day approved; Pastdal Sat 13 Sep and Wed 23 Sep duplicate → R0. **Hours column shows paid vs clocked** ("7,50 h paid (8,00 clocked)"). **Final Submission blocked when the hours are already paid.**
* **v-6 Holiday rule change (owner)**: warehouse meeting 07:00–07:30 deducted first on public holidays, then ×2. Heritage Day approved for Bhekizitha / Daniel / Erence / Erick; Erick Wed 23 → warehouse.
* **v-7 Planned end time**: new table `wage_planned_hours` (2026-09-24 → 15:00, "everyone in the warehouse, no set-ups"); red **⏰ CLAIMED PAST 15:00** pill. All Heritage Day rows set to 07:00–15:00 warehouse **R1 218,75** (Patrick 06:30 R1 300; Givemore gardener 08–15 R875; Solomon → warehouse; Erick Mon → warehouse). Backups `docs/restore-2026-09-23-holiday/` (`shifts_batch1_before`, `thursday_before_1500`, `erick_9801_before`).
* **Erick's mis-dated "Monday FNB"** → Thu 17 Sep 16–18 R190 (matches Bhekizitha); Mon 21 warehouse row entered by the office R690,63.
* **John** Wed 16 Sep R105 rate correction; Mon 21 duplicate R0. **Solomon** Tue 22 warehouse R690,63. **Thandanani** drafts #905 / #736 deleted. Noise reviews voided.
* **v-11** Pay-rule check UI retired (owner: only that). **Double-tap protection** — phone lock + overlay, server duplicate-save block, final-submit block (Part 3 item 7). **Public-holiday follow-up panel** + `/wages-admin/confirm-holiday-hours` (Part 4). Excel: owner corrections final (`manager_update_reason` → "OWNER CORRECTION"), DIFFERENCE ONLY rows, paid-before R0 no longer applied to a row the owner set to a positive amount. Takavaudza venue / warehouse / Sunday House R375. Petrus Heritage Day 06:30–14:00 R1 120. Lebo stale draft removed.
* **v-12** Green "Admin approved" figure shows owner-corrected rows at the corrected amount (paid hours, R0 rows count 0 h); John #9979 noise review voided. **Verified: Excel = database, 0 mismatches, 0 open reviews** → `docs/BW_Payroll_2026-09-19_to_25_AUDITOR.xlsx` sent to the auditors (R61 933,86 + Sharleen R3 000 = **R64 933,86**). Backups `docs/restore-2026-09-23-final/`.
* **Loans**: Erick #7 R500 and Isaac #8 R500 (both 22 Sep, WhatsApp wording, deductions start 26 Sep); Daniel #5 marked paid in full; Isaac #6 R600 deducted this week as scheduled (owner: leave as is). Backups `docs/restore-2026-09-23-loans/`.
* **v-13** Follow-up panel: owner rule "only if we underpaid" — top-up only, never a recovery; half-hour end times 11:00–18:00 with UNDERPAID / worked-less labels; Petrus holiday pricing deducts the meeting. Live-tested both paths, test rows removed, DB back to 91 rows R61 933,86.
* Throughout: the type-checker (`npx tsc --noEmit`) is run before every deploy — it caught two use-before-declaration bugs (`hrs` in crew-pattern, `workRates` in index) that would have blanked the dashboard.

# Part 8 — Payroll figures

## Payroll 19–25 Sep 2026 (sent to auditors Wed 23 Sep) — final as at v2026-09-23-12

| Worker | Paid rows (missed shifts) | Hours paid | Amount |
|---|---|---|---|
| Bhekizitha Maphosa | 7 (2) | 47,00 | R4 595,01 |
| Daniel Motaung | 5 (0) | 44,00 | R4 474,38 |
| Erence Mngomezulu | 8 (3) | 51,00 | R4 975,01 |
| Erick Mpho Molefe | 6 (1) | 46,00 | R4 335,64 |
| Givemore Chifetete Kuziwa | 7 (1) | 57,00 | R4 015,00 |
| Isaac Mbele | 5 (0) | 44,00 | R3 981,27 |
| John Simbarashe Mhlanga | 10 (2) | 75,00 | R6 461,26 |
| Joshua Motsamai Nteo | 9 (3) | 63,50 | R4 737,51 |
| Patrick Ngozo | 8 (3) | 53,50 | R5 403,75 |
| Solomon Moyo | 7 (2) | 51,00 | R5 139,38 |
| Takavaudza Chokuda | 7 (1) | 52,00 | R4 785,64 (Sun 20 Sep corrected R375 → R450 on 24 Sep) |
| Thandanani Nkala | 5 (0) | 44,00 | R4 310,01 |
| Thina Dyani | 1 (1) | 5,00 | R475,00 |
| Tsotlego Petrus Malakoane | 6 (0) | 50,75 | R4 320,00 |
| **Hourly staff total** | **91 (19 missed)** | **684,75** | **R62 008,86** (was R61 933,86 before the Takavaudza Sunday correction of 24 Sep) |
| Sharleen Ndlovu (fixed weekly) | | | R3 000,00 |
| **Gross wages** | | | **R65 008,86** |

Hours are the hours actually paid (meeting deducted where it applies; R0 duplicate rows count 0 h). Heritage Day (Thu 24 Sep) is included at the approved holiday amounts in Part 2. Deductions / loans as per the **Loans & Deductions** tab (Isaac #6 R600 + scheduled instalments on #1–#3; Petrus none; Daniel none). Full detail: `docs/BW_Payroll_2026-09-19_to_25_AUDITOR.xlsx`.

**Fixed (recurring) deductions on the books** (`wage_recurring_deductions`, active):

| # | Worker | Type | Weekly | From | Note |
|---|---|---|---|---|---|
| 3 | Erick Mpho Molefe | Car Payment | R1 000 | 1 Aug 2026 | ongoing |
| 1 | Isaac Mbele | Eggs | R260 | 1 Aug 2026 | ongoing |
| 5 | Joshua Motsamai Nteo | Car Payment | R1 000 | **26 Sep 2026** | **Added 24 Sep 2026 on owner instruction.** Deducted weekly from wages; the accumulated weekly amounts are paid over to Joshua on the 25th of every month. Ongoing until Bernie ends it (set `effective_to`). **Starts with the 26 Sep – 2 Oct payroll — nothing deducted in 19–25 Sep** (Joshua's 19–25 Sep net stays R4 737,51). Backup: `docs/restore-2026-09-24-joshua-car/`. |

Retired: #2 Petrus Rent R450 (ended 18 Sep) · #4 Isaac Car R500 (ended 23 Aug).

**To confirm on Monday 28 Sep (follow-up panel):** Petrus really finished 14:00? · Givemore worked 08–15 (7 h) or only 4 h? · anybody in the warehouse past 15:00? Only an answer that shows an **under**payment creates a top-up row in the 26 Sep – 2 Oct payroll; worked-less answers are recorded and nothing is recovered (owner rule).

## Payroll 12–18 Sep 2026 (paid 17 Sep) — final figures
111 paid rows (24 missed) · claimed 843,50 h · R72 438,15 · **approved 793,75 h · R71 096,90** · missed 98,00 h · R8 861,25 · deductions R3 210,00 · **net R67 886,90**. Full detail: `handover-2026-09-16-complete-hardcopy.pdf`.

# Part 9 — Restore points
| Tag / folder | State |
|---|---|
| `restore-2026-09-23-payroll-final` | **Live now (v2026-09-23-13)** — payroll 19–25 Sep as sent to the auditors; owner sentence + single APPROVE, Warehouse-Team cross-check, double-tap protection, planned end / holiday follow-up, hours column, pay-rule check retired, owner corrections final in Excel. Data backups `docs/restore-2026-09-23-{givemore,john,john2,joshua,holiday,final,loans}/`. |
| `restore-2026-09-23-difference` | v2026-09-23-2 — WAREHOUSE / VENUE buttons pay only the DIFFERENCE when part of the day was paid in an earlier payroll (4-line sum). |
| `restore-2026-09-23-reopen` | v2026-09-22-16 — Reopen a decided review, area-aware crew check, partial hours priced by place. |
| `restore-2026-09-22-petrus-v5` | v2026-09-22-14 — Petrus v5 rule + rent deduction removed. To undo only the deduction removal: `UPDATE wage_recurring_deductions SET active = 1, effective_to = NULL WHERE id = 2` |
| `restore-2026-09-21-already-paid` | v2026-09-21-2 (already-paid rule, old Petrus rule, rent deduction still active) |
| `restore-2026-09-18-rolled-back` | v2026-09-16-2 after the 18 Sep rollback |
| `restore-2026-09-15-approved` | 15 Sep approved state + full data snapshot (`docs/restore-2026-09-15-approved/`) |
| `docs/restore-2026-09-21-before-paid-before/reviews.json` | Reviews table before the already-paid check first ran (158 rows) |
| `docs/restore-2026-09-16-before-crew-check/reviews.json` | Reviews table before any 18 Sep logic (157 rows) |
| `docs/rollback-2026-09-18/removed_new_check_reviews.json` | The 25 rows removed on 18 Sep |
| branch `review-logic-2026-09-18` | Crew check / duplicate catcher / proof rule — not deployed |

```
git checkout restore-2026-09-23-payroll-final
npm run build
npx wrangler pages deploy dist --project-name bw-productions --branch main --commit-dirty=true
curl https://bwprodsystem.co.za/wages-version      # expect v2026-09-23-13
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
11. **"Warehouse Team" only means the warehouse when the place says warehouse** (23 Sep). Venue / area / description naming FNB, Riverside, a stadium, a garden or a house decides the rate — the system asks, Bernie clicks warehouse / venue / garden. **Sunday ×1.2 applies to every hourly rate, gardener House work included (R75/h) — owner 24 Sep.**
12. **The 07:00–07:30 meeting is deducted on public holidays too** (23 Sep) — deduct first, then ×2.
13. **When the owner sets a day's hours for everybody** (e.g. "Thursday everyone in the warehouse 07:00–15:00"), the planned end goes into `wage_planned_hours`; the next week's dashboard must ask what time each man really worked until. **Only an underpayment is corrected (top-up line); if he worked less, nothing is done** — owner 23 Sep. Nothing is adjusted without Bernie's Confirm.
14. **One shift, one row.** Double presses are swallowed on the phone and refused on the server; a shift whose hours are already paid cannot be final-submitted again. A worker who worked different hours enters only the different hours.
15. **An owner correction on a row is final** for the Excel and the green figure — no automatic check may re-price it.

## Open items (on Bernie's say-so)
1. **Monday 28 Sep**: answer the public-holiday follow-up panel (Petrus 14:00? Givemore 7 h or 4 h? anyone past 15:00?).
2. Loans #7 (Erick R500) and #8 (Isaac R250 + R250) and Joshua's new fixed Car Payment R1 000/week all start deducting in the 26 Sep – 2 Oct payroll — check the Loans & Deductions tab.
3. Drafts' open reviews not blocking the green figure.
4. Remove CSV / old-rules export after one clean payroll.
5. Push `main` to GitHub (118 local commits not yet pushed; all tags exist locally).

Done and closed: crew check re-introduced for the current week only (22 Sep) · self-compare reviews auto-voided (22 Sep) · pay-rule panel removed altogether (23 Sep) · Daniel's R3 000 loan confirmed paid in full outside the payroll (23 Sep) · Joshua Car Payment R1 000/week fixed deduction added, first deduction in the 26 Sep – 2 Oct payroll (24 Sep).

*Prepared for B&W Productions — Bernie Burness — 23 September 2026 (updated 24 Sep 2026).*
