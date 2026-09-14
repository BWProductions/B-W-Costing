# B&W Productions Wages Restore Point

## Document purpose
This document records the current working wages state as a restore-point handover snapshot.

## Date
2026-09-13

## Stable URLs
- **Team URL:** https://bwprodsystem.co.za/wages
- **Admin URL:** https://bwprodsystem.co.za/admin

## Backup archive restore point
- **Project backup (previous):** https://www.genspark.ai/api/files/s/6k3morJo
- **Code commit for this restore point:** see `git log` — "Remove orphan missed-shift helper text and pin per-worker work types"
- **Cloudflare Pages production deployment:** https://e930c675.bw-productions.pages.dev (custom domain https://bwprodsystem.co.za)

## What is working in this restore point
- Workers use a single **Add Current Shift** flow.
- Workers do **not** need a separate **Add a Missed Shift** button.
- Workers can enter shifts for dates in the previous payroll window.
- Previous-payroll entries are automatically treated as missed shifts in backend logic.
- Locked-payroll errors are suppressed from the worker-facing flow.
- Conflict / overlap / triple-billed review remains admin-side only.
- The worker-facing **View payroll week** section has been removed.
- Previous-payroll temporary saves resurface correctly in the worker list.
- Previous-payroll final submissions are supported through the same unified flow.
- Overnight shifts are automatically detected from the entered time range.
- Example: **23:00 to 02:00** is treated as a next-day / overnight shift on the backend.
- Normal same-day shifts are also accepted correctly.
- Example: **18:00 to 22:00** remains a same-day shift.
- Opening the **Team URL** now lands on the wages front page first.
- The team URL no longer auto-enters a saved worker session such as Givemore when no PIN has been entered.

## Fixes applied on 2026-09-13 (evening)
- Removed the leftover upstream **Add a missed shift** toggle row, including the confusing sentence
  "Tap the button above only when this shift belongs to last week but must be paid in this payroll."
  Workers no longer see any missed-shift button or helper text; the single calendar handles it.
- Removed the upstream helper sentences that still mentioned the missed-shift button or
  "Saturday or Monday only".
- Work-type dropdown is now pinned per worker (see table below). A worker with no special list
  always gets **Normal** only. A shared phone can no longer show the previous worker's list.

## CRITICAL FIX 2026-09-14 — Final Submission was not creating paid hours
**Symptom:** worker presses Final Submission, dashboard stays at 0.00 hours, shift disappears from draft list.
**Cause:** two changes deployed 2026-09-13 16:50–17:04 UTC made the proxy write drafts straight into D1
(“Fix wages final submission proxy fallback”, “Always direct-save previous payroll missed shifts”).
Only the upstream wages app creates paid `wage_shifts` rows (hours, overtime, Sunday, amounts).
The proxy’s direct writes produced `status='submitted'` drafts with **no** paid shift.
**Fix:**
- Proxy never intercepts `POST /wages/drafts` or `POST /wages/drafts/:id/final-submit` again. Everything is forwarded to upstream.
- Single calendar kept. A previous-payroll date is converted into the only format upstream accepts:
  booked on the **current payroll Saturday**, `missed_previous_week=1`, description prefixed
  `MISSED SHIFT - actual date <Day D Mon YYYY> - <worker text>`. Admin/export see the real date in the description.
- Migration `0039_preserve_worker_missed_flag.sql`: the 0037/0038 D1 triggers were resetting `missed_previous_week` to 0
  because upstream never sets `payroll_week_start`. Applied to production.
- Locked-payroll rejection text is now rewritten to “This shift was NOT saved…” instead of hidden.
**Verified live:** Lebo test — previous-week date saved → visible in drafts → Final Submission → paid `wage_shifts` row
(2.00 h, R125, missed flag 1) → dashboard 2.00 h. Test rows deleted afterwards.
**Rule going forward:** the proxy must never write to `wage_shift_drafts` / `wage_shifts`. Never hide upstream errors.

## Permanent backend guard (2026-09-14) — blanks are now impossible
- Migration `0040_block_blank_submissions.sql` (applied to production): two D1 `BEFORE INSERT/UPDATE` triggers on
  `wage_shift_drafts` **refuse** any row with `status='submitted'` and no `final_shift_id` (paid shift). The database
  itself rejects the write, whatever code tried it. Verified live: real Final Submission still works (status and paid
  shift are set together by the wages app); a direct attempt to create a blank is rejected with
  `BLOCKED: shift cannot be marked submitted without a paid shift record`.
- `GET https://bwprodsystem.co.za/wages-health` — read-only integrity report: guard triggers present, blank submissions
  this payroll (with worker/date/time), last paid shift time. Returns HTTP 200 `ok` or 503 `ATTENTION`.
- `/admin/wages` shows a green/red banner from that report on every load. Red lists the exact blank rows.
- Nothing for staff or admin to change. No new accounts, no new steps.

## Stale pages and work-type enforcement (2026-09-14, later)
- Every wages page carries `WAGES_UI_VERSION`. On load it asks `/wages-version`; if the server is newer the page
  reloads itself once and clears the device-stored dropdown profile. Old copies on office PCs / phone home screens
  can no longer keep showing an out-of-date form. **Bump `WAGES_UI_VERSION` in `src/index.tsx` on every deploy that
  changes the worker UI.**
- Server-side work-type enforcement (`STAFF_ALLOWED_WORK_TYPES`, keyed by the login cookie, not the page): a save with a
  work type outside the worker's list is rejected with "Work type X is not available for you. Your options are: …".
  A stale page therefore cannot bill a disallowed type even if it shows one.
- The per-worker dropdown list exists in two places and must be kept identical: `STAFF_WORK_TYPE_PROFILES` (client) and
  `STAFF_ALLOWED_WORK_TYPES` (server).

## REAL DATE kept for previous-week shifts (2026-09-14, afternoon) — supersedes the Saturday-booking note above
- Worker picks the real date (e.g. Thu 10 Sep) in the single calendar. No button, no error.
- Stored as **work_date = real date**, `payroll_week_start` = current week (paid this week), `missed_previous_week = 1`,
  note `Real work date 2026-09-10; paid in current payroll 2026-09-12 to 2026-09-18; flagged for payroll cross-check.`
  This is the same shape the wages app itself produced for earlier missed shifts (e.g. wage_shifts 9586 = Jay 4 Sep).
- How: the wages app only ACCEPTS a past date when sent as the current Saturday. The proxy sends Saturday, and once the app
  has accepted (and on Final Submission has calculated hours/amounts) the proxy writes the real date back. For edit /
  final-check / final-submit of a real-date draft, the draft is parked on Saturday for that one request then restored.
- Worker dashboard: paid missed shifts appear under "Missed shifts from last week — paid in this payroll" with the real date,
  and the week hours/count include them. Cards show `MISSED SHIFT – actual date Thu 10 Sep 2026 – Strike HQ`.
- Auditor export (Wage Detail / Auditor Review) shows the real date in the date column and the missed flag — proven with
  last week's export (Jay 2026-09-04 row).
- Duplicate checks can now compare the real date against previous payroll (review report = agreed next step).
- Converted this morning's Saturday-booked drafts back to real dates: Bheki 656, Givemore 683/684 (test rows),
  Joshua 667, Solomon 692/693/694, Takka 675/676, Thandanani 674, Thina 639.

## Missed-shift detail on every card (2026-09-14)
- Every shift card (draft and finally submitted) shows the full text
  `MISSED SHIFT – actual date Thu 10 Sep 2026 – Strike HQ` in place of the generic
  "Hours missed / not captured from last week" badge. The booked date line (e.g. `2026-09-12`) stays
  because that is the payroll week the wages app pays it in; the badge gives the real day claimed.
- Same text is stored in the shift description, so the auditor export shows it on the paid row.
- Re-saving a missed draft no longer doubles the marker in the description.
- Display only — saving, Final Submission, dropdowns, calendar unchanged.
- Known limit: the app's automatic overlap check compares against the booked Saturday, not the real date.
  Checking the real date against previous payroll is a manual office review (a read-only review report is the agreed next step).

## Sign out / Switch person (2026-09-13, later)
- The worker **Sign out** button is hidden. Workers use **‹ Switch person** only.
- **Switch person** now performs a real logout (POST `/wages/logout`, which clears the worker cookie),
  wipes the stored worker ID/profile from the device, then returns to the staff list at `/wages`.
- Cause of the "403 — Not authorised / This account does not have access to this module" screen:
  it is the **admin** system's permission page. It appeared only because the same browser was also
  logged into `/admin`; after the worker cookie was cleared the wages app saw the admin cookie.
  Workers on their own phones cannot hit it. The proxy now redirects any 403 on a worker page to
  `/wages` anyway, so it can never be shown again.

## Work-type dropdown per worker
| Worker | Dropdown |
|---|---|
| Givemore Chifetete Kuziwa | House/Garden, Warehouse Team |
| Takavaudza Chokuda (Takka) | House/Garden, Warehouse Team |
| Thina Dyani | Normal, Warehouse Team |
| Tsotlego Petrus Malakoane | Normal, Warehouse Team |
| Bhekizitha Maphosa (Bheki) | Music Bus, Normal |
| John Simbarashe Mhlanga (Jay) | Music Bus, Normal |
| Brian Ndlovu (Sipho) | Music Bus, Normal |
| Joshua Motsamai Nteo | Music Bus, Normal |
| Isaac Mbele, Erence Mngomezulu, Erick Mpho Molefe, Daniel Motaung, Solomon Moyo, Patrick Ngozo, Thandanani Nkala, Lebo Lebo | Normal |

Venue field stays free text with suggestions (Warehouse, Garden, Work with the Team, House, Music Bus, Ellis Park, FNB Stadium, Loftus, Inanda Club, Supersport Park, SAB HQ, DHL Stadium).

## Single calendar rule
- One **Date worked** calendar. It reaches back to the previous payroll week's Saturday
  (e.g. current payroll Sat 2026-09-12 to Fri 2026-09-18 -> calendar starts Sat 2026-09-05).
- Any date before the current payroll Saturday is automatically saved as a missed shift
  (`missed_previous_week = 1`, claimed against the previous payroll week) with no button and no error.

## Worker-facing rules in this version
- Workers should use only the **Team URL**.
- Workers should always use the single shift-entry flow.
- Workers do not need to choose a payroll-week rollback control.
- Workers do not need to tick a separate overnight checkbox.
- The system automatically interprets cross-midnight times as next-day shifts.

## Admin-facing rules in this version
- Admin should use only the **Admin URL**.
- Admin can review the broader system from the backend dashboard.
- Payroll review / overlap checks remain visible on the admin side rather than the worker side.

## Final handover recommendation
If a future change breaks wages, restore from the backup archive above and use this document as the reference for the expected working behavior.
