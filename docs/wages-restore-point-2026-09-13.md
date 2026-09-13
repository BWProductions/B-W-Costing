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
- **Cloudflare Pages production deployment:** https://cadb54b4.bw-productions.pages.dev (custom domain https://bwprodsystem.co.za)

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
