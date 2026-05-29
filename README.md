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

All webhooks use bearer-token auth via Cloudflare Pages secrets:
- `CRON_WEBHOOK_TOKEN` — email digest
- `BACKUP_WEBHOOK_TOKEN` — D1 backup
- `LOW_STOCK_WEBHOOK_TOKEN` — low-stock digest
- `BRAND_DIGEST_WEBHOOK_TOKEN` — brand-owner digest

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

### 4. Delivery-edit-after-sign — completed 2026-05-29
Three named office users can re-open signed delivery notes for correction:
- Bibi (info@bwproductions.co.za)
- Bernie (bibi@bwproductions.co.za)
- Shane' (marketing@bwproductions.co.za)

Everyone else — including other founders — gets read-only success view.
All post-sign edits write a diffed audit_log row (who, when, field-level
from→to). See `EDIT_AFTER_SIGN_EMAILS` in `src/routes/field.ts`.
