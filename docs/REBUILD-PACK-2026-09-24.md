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
| Music Bus | R750 fixed 07–16 + R120/h outside | R120/h | R750 fixed 07–16 + R180/h outside |
A public holiday that falls on a Sunday is priced as a public holiday (×2), not ×2 × 1.2.

## C3 — Special people
| Who | Rule |
|---|---|
| **Music Bus** (work type, usually John) | Mon–Sat **R750 fixed** for 07–16 **+ R120/h** outside · Sunday **R120/h** · Holiday R750 + **R180/h** outside. Sat 08–22 = R750 + 6×120 = R1 470. |
| **Petrus** (Tsotlego Petrus Malakoane, staff 4) | **R640 set day** for 06:00–16:00 Mon–Sat, whatever time he arrives. Mon–Fri outside 06–16: **R55/h held** (red review: approve / other rate / R0). Saturday outside: **R80/h automatic**. **Sunday: whole entry HELD** (recommend R640 + R80/h outside; approve / other / decline). Holiday: **R160/h** every hour, meeting deducted, no fixed day (06:30–14:00 = 7 h = R1 120). **No deductions, no loans** (rent R450 ended 18 Sep). |
| **Gardeners** (Givemore staff 1, Takavaudza staff 2, Lebo staff 16) | House / House-Garden work **R62,50/h Mon–Sat; Sunday ×1.2 = R75/h** (owner 24 Sep). Holiday **R125/h** (held). Their Warehouse Team / Team Assistance work = general staff by place. Takavaudza Sun 20 Sep #9821 "Installing lights and garden work" → **VENUE R684** (6 h × R114; owner 24 Sep — was R375 garden flat, then R450 garden Sunday). |
| **Sharleen Ndlovu** (staff 17) | **Fixed weekly R3 000** (`payroll_rule = fixed_weekly`). |
| **John** Wed 16 Sep | one-off owner correction R105/h (historic). |

## C4 — Public holidays
Official gov.za list + Election Day **Wed 4 Nov 2026** (in `SA_PUBLIC_HOLIDAYS` in `src/index.tsx` and table `wage_public_holidays`). 2026 left: 4 Nov · 16 Dec · 25 Dec · 26 Dec. 2027 loaded.
* **Never paid automatically** — every entry is a red review: **Approve public holiday — R…** / Other amount / Decline R0.
* Rates: Warehouse R162,50/h (meeting off first) · Venue R190/h · Petrus R160/h (meeting off) · Music Bus R750 + R180/h · Gardener R125/h.
* **Owner sets the day** (e.g. Heritage Day: "everyone warehouse 07:00–15:00") → planned end stored in `wage_planned_hours` (2026-09-24 → 15:00) → any entry past it gets red **⏰ CLAIMED PAST 15:00** → the following week's dashboard shows the **Public-holiday follow-up panel**: per person, what was paid, dropdown of real end times 11:00–18:00 (half-hourly) each labelled *as paid* / *UNDERPAID, top-up +R…* / *worked less, nothing recovered*, **Confirm**.
* **Owner rule (23 Sep, verbatim): "Even if they worked less, I don't want anything to be done. I only want something to be done if we underpaid them."** Top-up row only; never a recovery; answer written on the row (*HOLIDAY HOURS CONFIRMED*).
* Heritage Day 24 Sep 2026 as approved: 9 men 07–15 wh **R1 218,75** · Patrick 06:30 **R1 300** · Petrus 06:30–14:00 **R1 120** · Givemore garden 08–15 **R875** · John wh 07–12 R731,25 + Music Bus 12–18 R1 110.

**📌 Owner's note panel (v2026-09-24-3, owner 24 Sep).** Any planned end time set for a day in the CURRENT payroll week (`wage_planned_hours`) shows at the top of the dashboard as a yellow note — *"Sat 26 Sep 2026 — work ended 13:00 (everyone at the warehouse …)"* — with a live count of entries in so far and how many claim past the time. Entries past it carry the red ⏰ CLAIMED PAST pill. To add a note for a day, the assistant inserts a row into `wage_planned_hours` (work_date, planned_end, note, set_by). First use: Sat 26 Sep 2026 → 13:00.

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
