# B&W Productions Operations Platform

Internal ops platform for B&W Productions CC. Built on Cloudflare Pages + Hono + D1.

## Live URLs
- **Production**: https://bwprodsystem.co.za
- **Pages alias**: https://bw-productions.pages.dev
- **Dispatch TV (token)**: https://bwprodsystem.co.za/dispatch/977f1a849462220c7ded8634599b7b47

## Architecture
- **Hosting**: Cloudflare Pages (`bw-productions` project)
- **Backend**: Hono framework, TypeScript, built with Vite
- **Database**: Cloudflare D1 SQLite (`bw-productions-db`, id `4781960f-5bd6-4381-93fd-d8caf72f0c53`)
- **Storage**: R2 bucket `bw-productions-pdfs` (PDFs + DB backups under `backups/`)
- **Email**: Resend.com API
- **Scheduling**: GitHub Actions cron (Pages has no native cron)

## Modules
- **Calendar** — events, dispatch dates, inline editable cards, audit-logged
- **Quotes** — client-facing quote builder + PDF export
- **Clients / Suppliers / Fleet** — master data
- **Rate Card** — pricing source of truth
- **Field App** — driver-facing PWA at `/field`
- **Field Admin** — back-office for field submissions, damages, planner extractor
- **Music Bus** — separate fleet sub-app at `/musicbus`
- **Dispatch TV** — token-protected big-screen warehouse view (60s refresh)
- **Admin** — user management, exports, role permissions, **database backups** (founder-only)
- **Wages / Timesheets** — public worker flow at `/wages` with PIN login, unified shift entry, draft/final shift submission, and safe-proxy UI fixes layered in the worker

## Latest wages/timesheet fixes
- Worker PIN access itself remained online; recent failed logins were traced to regenerated worker PINs on 2026-09-09 plus a broken/awkward shared-device switch-person flow.
- Added safe-proxy UI enhancement injection on `/wages*` pages so fixes can be layered without changing the upstream wage app directly.
- Rewired **Switch person** to force a wages logout request first, then return to `/wages` for the next worker on shared devices.
- Added UI styling hooks for **Add Shift**, **Save Shift Temporarily**, and bulk **Final Submission** selection.
- Updated the worker wages styling so the primary **Add current shift** action stays dark like the approved mock-up and the worker-facing **Save Shift Temporarily** action is yellow.
- Forced proxied HTML responses under the safe-proxy flow to return `Cache-Control: no-store` headers so worker-facing wages UI changes show on normal refresh instead of only after a hard refresh.
- Tightened the logged-in wages dashboard handling so staff now use a single **Add Current Shift** entry path and do not see a separate **Add a Missed Shift** action.
- The add-shift flow now handles previous-payroll capture automatically from the single worker entry path: staff keep using **Add Current Shift**, the entered **Date worked** now drives the previous-payroll classification directly, and the worker no longer depends on a visible payroll-week control.
- Removed the old staff-side **Return to Dashboard** action; dashboard access remains admin-only at `/admin/wages`.
- Removed the unapproved worker-facing payroll rollback helpers so staff only see the approved wages dashboard actions while the proxy still preserves the backend claim/capture metadata it needs.
- Missed-shift date selection now uses a rolling range from the previous payroll week's Saturday through the current payroll's live date window, so staff can choose the physical **Date worked** they actually missed instead of only seeing Saturday/Monday catch-up dates.
- The unified shift-entry form keeps the worker-facing flow on a single page, makes the **Date worked** control larger, restores the work-type dropdown breakdown (including House / Garden, Warehouse Team, Team Assistance, and Music Bus cases), and adds venue/event suggestion dropdown support for the free-text venue field.
- Added hiding for the visible **Next Overnight Shift** prompt in the worker wages flow.
- Missed-shift forms now enforce and persist the required claim metadata: payroll week being claimed against, exact work date, venue, work type / role, description, start time, finish time, previous-payroll flag, backend-only system review notes for overlap/conflict review, and a backend manual review item when overlaps or possible already-claimed entries exist.
- Rolled-back payroll-week captures now auto-classify as missed shifts: staff can enter them from **Add Current Shift**, the UI preserves the payroll week being claimed against for review, and the proxy rewrites the live submission onto the current open payroll week so locked prior payrolls do not block saving.
- Previous-payroll rollback no longer shows the locked-payroll worker warning in the unified entry flow; the proxy/open-page handoff keeps staff on the single entry screen while backend review still marks the entry as a missed shift for office checks only.
- When the upstream worker app still tries to reject a previous-payroll temporary/final save, the proxy now writes the missed shift directly into the shared wages D1 table under the current payroll week so it reappears in worker/admin lists while preserving backend conflict review metadata.
- Added a direct proxy fallback for `POST /wages/drafts/:id/final-submit` so worker final submissions no longer crash with **Internal Server Error** when the upstream endpoint fails; the draft is marked `submitted` in the shared wages D1 table and the worker is redirected back into the wages flow.
- Fixed the mobile/shared-device staff-context bug by persisting the active staff ID separately, appending `bw_staff_id` across rewritten wages links/forms, hydrating missing `staff_id` values from query/referer on the backend, and redirecting successful direct saves back to `/wages/me` instead of dumping workers back onto the blank add-shift form.
- Fixed the live D1 overlap-review trigger so overlapping missed shifts no longer crash with a 500 before save; backend review rows now use the valid `possible_duplicate_manual_check` warning kind while workers still stay unblocked and the office still sees the manual overlap review details.
- Added direct-save/direct-final-submit error capture into `wage_debug_capture` so future worker save failures are visible even when the fallback path itself throws.
- 2026-09-13: removed the leftover upstream **Add a missed shift** toggle row and its "Tap the button above only when this shift belongs to last week..." helper sentence from the worker form; the single calendar (previous payroll Saturday onward) is the only missed-shift mechanism.
- 2026-09-13: work-type dropdowns pinned per worker (Givemore/Takka: House/Garden + Warehouse Team; Tsotlego: Normal + Warehouse Team; Thina: Normal (since 2026-09-14); Bheki/Jay/Sipho/Joshua: Music Bus + Normal; everyone else: Normal). Unknown or unlisted workers always get Normal; a shared phone can no longer inherit the previous worker's list. Full table in `docs/wages-restore-point-2026-09-13.md`.
- 2026-09-13: worker **Sign out** hidden; **Switch person** is the single exit and now really logs out (POST `/wages/logout`), clears device-stored worker context and returns to `/wages`. Any upstream 403 on a worker page is redirected to `/wages` so the admin "Not authorised" module page can never show to staff.
- 2026-09-14 CRITICAL: removed the proxy's direct D1 writes for saves/final submission (they produced 'submitted' drafts with no paid shift and 0.00 hours). All saves go to the upstream wages app again. Previous-week dates from the single calendar are converted to Saturday + `missed_previous_week=1` + `MISSED SHIFT - actual date …` description prefix. Migration 0039 stops the D1 triggers resetting the missed flag. Verified live end-to-end.
- 2026-09-14: permanent database guard (migration 0040) — a shift can never be marked submitted without a paid shift record; `GET /wages-health` integrity report; green/red integrity banner on `/admin/wages`.
- 2026-09-14: every worker shift card shows the full `MISSED SHIFT – actual date … – …` text (draft and submitted); description de-duplicated on re-save.
- 2026-09-14 (pm): previous-week shifts are stored with their REAL work date (paid in the current payroll, `missed_previous_week=1`); the proxy restores the real date after the wages app accepts the Saturday-booked save and parks/restores it around edit/final-check/final-submit. Dashboard lists them under "Missed shifts from last week — paid in this payroll".
- 2026-09-14 (later): UI version stamp + `/wages-version` — stale pages on any device auto-reload once; server-side work-type enforcement per worker on every save. Bump `WAGES_UI_VERSION` on every worker-UI deploy.
- 2026-09-14 (midday): edit-page saves no longer fail with "Choose a valid work date." (hidden `work_date` was being removed with the legacy date block; enhancer mirrors it again and the proxy fills it from the calendar fields as a safety net). Real logged-in worker is stamped server-side on every page (`data-bw-session-staff`) so a shared PC can never show another worker's dropdown. Thina is now Normal only. Any `/wages*` request on a `<hash>.bw-productions.pages.dev` address redirects to bwprodsystem.co.za and the 79 old proxy deployments were deleted (engine `3c3bcb89` untouched). Proxy log keeps 300 rows.
- 2026-09-14 (afternoon) **RESTORE POINT `restore-2026-09-14-combined-sheet`** — owner-approved combined per-person wage sheet on `/admin/wages` (in-week + real-date missed shifts, CLEAR/OVERLAP cross-check vs previous payroll, review flags with recommended hours and reason, drafts awaiting Final Submission, worker-app link per person, totals including missed shifts); on-behalf entry block hidden; final-check POST safety net (never sends a worker to the admin login). Details in `docs/wages-restore-point-2026-09-13.md`.
- **Staff link (the only one workers need): https://bwprodsystem.co.za/wages**

## Phase 1 Foundation (completed)
- `company_settings` table — single-row company details (legal name, VAT, registration, address, contact)
- `audit_log` table — append-only record of every edit (user, action, entity, before/after diff, IP, UA)
- Canonical role helpers in `src/lib/permissions.ts` — founder / ops_director / accounts / crew / read_only
- D1 → R2 weekly backup at `/api/cron/backup` (gzipped JSON of all 20 tables)
- Calendar inline edit now writes audit_log automatically
- `shopping_cart_number` + `purchase_order_number` columns on `calendar_events` (SAB/ABInBev workflow)

## Scheduled Jobs (GitHub Actions)
| Job | Cron (UTC) | SAST | Endpoint |
|---|---|---|---|
| Accounts Email Digest | `0 5 * * *`, `0 10 * * *` | 07:00, 12:00 daily | `POST /api/cron/email-digest` |
| Weekly D1 Backup | `0 0 * * 0` | Sunday 02:00 | `POST /api/cron/backup` |
| Low Stock Digest | `0 5 * * 1` | Monday 07:00 | `POST /api/cron/low-stock-digest` |
| Brand Owner Digest | `0 4 * * 1` | Monday 06:00 | `POST /api/cron/brand-digest` |
| Uncollected Delivery Alert | `5 10 * * *`, `0 14 * * *` | 12:05 + 16:00 daily | `POST /api/cron/uncollected-alert` |

All webhooks use bearer-token auth via Cloudflare Pages secrets:
- `CRON_WEBHOOK_TOKEN` — email digest
- `BACKUP_WEBHOOK_TOKEN` — D1 backup
- `LOW_STOCK_WEBHOOK_TOKEN` — low-stock digest
- `BRAND_DIGEST_WEBHOOK_TOKEN` — brand-owner digest
- `UNCOLLECTED_WEBHOOK_TOKEN` — uncollected-delivery alert

Tokens must match in **both** Cloudflare Pages secrets **and** GitHub repo Action secrets.

## Local Development
```bash
cd /home/user/webapp
npm run build
pm2 start ecosystem.config.cjs
curl http://localhost:3000/health
```

## Deploy
```bash
cd /home/user/webapp
npm run build
npx wrangler pages deploy dist --project-name bw-productions --branch main
```

## Phases 9-17 (completed)

### Phase 9 — Stock Returns (after event)
- `stock_returns` + `stock_return_lines` + `stock_damages` tables (migration 0034)
- Lifecycle: draft -> completed; on completion writes movements, updates qty_on_hand & qty_damaged, auto-creates damage records, auto-resolves matching shortages
- UI: `/admin/stock/returns` (list, new from event, edit lines, complete, cancel)

### Phase 10 — Movement Reason Taxonomy
- 12 reason categories across 5 groups (inbound / outbound / event / loss / admin) in `src/lib/movement-reasons.ts`
- `stock_movements.reason_category` column for filterable history

### Phase 11 — Damages Management
- `stock_damages` lifecycle: open -> approved -> written_off / recovered / cancelled
- UI: `/admin/stock/damages` (list, detail, approve, write-off, recover, cancel)

### Phase 12 — Event Cost P&L
- `event_cost_overrides` + `cost_defaults` tables for per-event cost adjustments (migration 0035)
- Default rates: fuel R/km, daily allowance, vehicle hire, etc.
- UI: `/admin/costs` (monthly P&L), `/admin/costs/defaults`, `/admin/costs/:id` (per-event cost detail + overrides)

### Phase 13 — Client-Facing Brand Pages
- `brand_share_tokens` + `brand_share_views` tables (migration 0035)
- Admin: `/admin/brand-shares` (create / revoke 128-bit share tokens per brand)
- Public: `/public/brand/:token` — read-only, watermarked, NO internal financials, view-logged
- View audit panel: `/admin/brand-shares/:slug/views/:id`

### Phase 14 — Quote <-> Event Linker
- `quotes.calendar_event_id` + `calendar_events.quote_id` + `calendar_events.quote_number` columns (migration 0035)
- Two-way link manager UI at `/admin/quote-link` (orphans + linked tabs, link / unlink actions)
- Leaves legacy `quotes.event_id` -> `events` table relationship untouched

### Phase 15 — Mobile Field Stock Check-Out
- Phone-optimised single-page UI at `/field/stock-checkout` (auth required)
- Big-touch buttons, per-event pick lists, progress bar
- Logs `stock_movements` (reason_category='event_dispatch') and decrements qty_on_hand on each checkout

### Phase 16 — Audit Viewer + Login History
- `login_history` table (migration 0035) capturing every login attempt (success + failure_reason + IP + UA)
- Patched `auth.ts` to log every attempt
- Admin viewer at `/admin/audit` (filter by user / entity / date range) + `/admin/audit/logins` (login history with 7-day stats)
- CSV exports: `/admin/audit/export.csv`, `/admin/audit/logins.csv`
- Restricted to founder + ops_director + finance_director

### Phase 17 — Brand Owner Weekly Digest
- `brand_digest_subscriptions` table (migration 0035) for per-brand-per-email subscriptions
- Admin: `/admin/brand-digest` (subscribe / pause / preview HTML / test-send now)
- Cron: `POST /api/cron/brand-digest` (Mondays 06:00 SAST via GitHub Actions)
- Same data philosophy as public brand viewer — no internal financials

## Roadmap (future)
- **Phase 2** — Vendor verification (VAT, BEE, tax clearance, banking confirmation, expiry tracking)
- **Phase 18** — Per-route role tightening (audit existing endpoints against PERMISSIONS matrix)
- **WhatsApp** — Twilio integration (pending Twilio approval + business card)

## Pending Spec Notes (Bibi's Backlog)
_Captured during sessions but parked for later — usually awaiting input from the
warehouse team or a follow-up product decision. Don't start these without
re-confirming the spec with Bibi._

### 1. Flight-case packaging logic (lights & similar)
**Trigger:** Stock count Monday (after which Bibi will send the full inventory list).

Certain stock items leave the warehouse only as flight cases, never as loose
units. The stock sheet must use this exact wording:
- "1 flight case including 6 PAR cans"
- "1 flight case including 8 PAR cans"
- "1 flight case including 4 LED tubes"
- "1 flight case including 6 LED tubes"
- "1 flight case including 8 LED tubes"

Confirmed items + valid box sizes so far:
- **PAR cans** (uplighting): 6 or 8 per flight case
- **LED tubes**: 4, 6, or 8 per flight case

Rule: always even numbers, never odd. Mixed counting is OK on the same item
(e.g. 1 case of 8 + 1 case of 6 = 14 PAR cans).

**Still TBC:** Full inventory list of which items are flight-cased, with
their valid box sizes. Coming from warehouse team after Monday's stock count.

### 2. Companion-item auto-suggest (delivery notes + quotes)
When certain items are added, the system suggests related kit so we don't
arrive on site with half a setup. Confirmed pairings to wire up:

| Trigger item | Suggests |
|---|---|
| Umbrella | Umbrella base (concrete or rubber) |
| Heater | Gas bottle |
| Dance floor | Trolley |

**More pairings to add later:** Bibi will list more as they come to mind.

**UX decisions (locked in):**
- **Delivery notes** — soft yellow banner with quick-add buttons (Option A)
- **Quotes** — hard modal that blocks proceeding until answered (Option B)

### 3. File attachments via Cloudflare R2
We already use R2 for auto-generated delivery note PDFs. Plan to extend to
user-uploaded attachments on:
- Delivery notes (photos of packed flight cases, damage evidence)
- Quotes (signed PO scans, client brief PDFs, floorplans)
- Calendar events (venue floorplans, supplier contracts, insurance certs)
- Suppliers (BEE certs, banking confirmation letters, sample work)

R2 supports any file size up to 5 TB per object; PDFs and photos at typical
sizes (1-10 MB) cost roughly $1.50/month per 10,000 attachments.

### Collection workflow upgrades — completed 2026-05-31
Keeps "Smart Collect" (one-tap pre-filled Collection Note from a signed Delivery
Note) but adds three things so crews must physically verify kit, not tick boxes:

1. **Quantities blanked on collection** — the Collection Note pre-fills item
   names/brands/conditions but NOT quantities (placeholder "Count it"). The crew
   must physically count and type each qty. The delivered qty is carried silently
   as `data-expected-qty` for comparison.
2. **Live on-site short-warning banner** — as they type a count, a red banner
   lists any item that's short ("delivered 6, counted 5 → short 1") so they can
   check the site *before they leave*. `field_line_items.expected_quantity`
   (migration 0036) persists the delivered figure alongside the counted `quantity`.
3. **Discrepancy Report** (`/field/admin/discrepancies` + `/export.csv`) — back
   office view of every collection where counted ≠ delivered (short or over),
   grouped per note. NOT the Shortlist — Shortlist = request for MORE kit on site.
4. **5-day uncollected-delivery alert** — `POST /api/cron/uncollected-alert`
   (12:05 + 16:00 SAST daily). If a delivery is 5+ days past its collection date with no
   signed Collection Note, emails Bernie (`bibi@bwproductions.co.za`) + Marketing
   (`marketing@bwproductions.co.za`) **once** (guarded by
   `field_submissions.uncollected_alert_sent_at`). See `src/lib/uncollected.ts`.

### 4. Delivery-edit-after-sign — completed 2026-05-29
Three named office users can re-open signed delivery notes for correction:
- Bibi (info@bwproductions.co.za)
- Bernie (bibi@bwproductions.co.za)
- Shane' (marketing@bwproductions.co.za)

Everyone else — including other founders — gets read-only success view.
All post-sign edits write a diffed audit_log row (who, when, field-level
from→to). See `EDIT_AFTER_SIGN_EMAILS` in `src/routes/field.ts`.

## Restore point 15 Sep 2026 — rate rules · rate-choice reviews · Payroll Excel
- Handover (full spec of colours, labels, rules, Excel layout): `docs/handover-2026-09-15-rate-rules-payroll-excel.md` / `.pdf`
- Git tag: `restore-2026-09-15-rate-rules-payroll-excel` · live version `v2026-09-15-10`
- New routes: `GET /wages-admin/payroll.xlsx?from=YYYY-MM-DD` (6-tab auditor workbook), `POST /wages-admin/rate-choice`
- New source files: `src/payroll-excel.ts`, `src/xlsx-lite.ts`
- Data before-state for the 12–18 Sep re-price: `docs/reprice-backup-2026-09-15-week-2026-09-12-before.json`

## Restore point 2026-09-18 (rolled back — live v2026-09-16-2)
- Live: **v2026-09-16-2** (rate rules v4, Payroll Excel 6 tabs with editable HR and per-worker shading).
- 18 Sep review logic (crew check, duplicate catcher, proof rule, overlap wording) was rolled back the same day; kept on branch `review-logic-2026-09-18`, **not deployed**. Must only ever run on the current unpaid payroll week.
- Complete handover: `docs/handover-2026-09-18-complete.md` / `.pdf`.
- Tag: `restore-2026-09-18-rolled-back`. Removed review rows backup: `docs/rollback-2026-09-18/`.
