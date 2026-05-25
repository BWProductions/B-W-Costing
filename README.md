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

Both webhooks use bearer-token auth via Cloudflare Pages secrets:
- `CRON_WEBHOOK_TOKEN` — email digest
- `BACKUP_WEBHOOK_TOKEN` — D1 backup

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

## Roadmap
- **Phase 2** — Vendor verification (VAT, BEE, tax clearance, banking confirmation, expiry tracking)
- **Phase 3** — Stock system (Excel import, hard-block over-bookings, sub-rental flagging)
- **Phase 4** — Security polish (price masking for crew, banking masking for non-founder, optional 2FA)
- **WhatsApp** — Twilio integration (pending Twilio approval + business card)
