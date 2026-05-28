// BW Productions Operations Platform — Main Entry v2.0

import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { serveStatic } from 'hono/cloudflare-workers'
import { runDigest } from './lib/email-digest.js'
import { runBackup } from './lib/backup.js'
import { runLowStockDigest } from './lib/low-stock.js'
import auth from './routes/auth.js'
import dashboard from './routes/dashboard.js'
import fleet from './routes/fleet.js'
import clients from './routes/clients.js'
import suppliers from './routes/suppliers.js'
import events from './routes/events.js'
import rateCard from './routes/rate-card.js'
import quotes from './routes/quotes.js'
import admin from './routes/admin.js'
import stockAdmin from './routes/stock-admin.js'
import brands from './routes/brands.js'
import stockReturns from './routes/stock-returns.js'
import stockDamages from './routes/stock-damages.js'
import eventCosts from './routes/event-costs.js'
import quoteEventLink from './routes/quote-event-link.js'
import brandShares from './routes/brand-shares.js'
import brandDigest from './routes/brand-digest.js'
import fieldStockCheckout from './routes/field-stock-checkout.js'
import auditViewer from './routes/audit-viewer.js'
import publicBrand from './routes/public-brand.js'
import { runBrandDigest } from './lib/brand-digest.js'
import { publicLanding } from './routes/public.js'
import account from './routes/account.js'
import questionSheet from './routes/question-sheet.js'
import printSheets from './routes/print-sheets.js'
import field, { musicbusApp } from './routes/field.js'
import fieldAdmin from './routes/field-admin.js'
import plannerExtractor from './routes/planner-extractor.js'
import productsAdmin from './routes/products-admin.js'
import calendar from './routes/calendar.js'
import dispatch from './routes/dispatch.js'

type Env = { Bindings: { DB: D1Database } }

const app = new Hono<Env>()

app.use('*', logger())

// ── Static assets (no auth)
app.use('/static/*', serveStatic({ root: './public' }))

// ── Public landing page (no auth)
app.get('/about', publicLanding)

// ── Phase 13: Public brand share viewer (no auth — token-gated in handler)
//     MUST be registered BEFORE auth and dashboard mounts.
app.route('/public/brand', publicBrand)

// ── Auth routes (login / logout — no auth required)
app.route('/', auth)

// ── Planning Calendar Extractor — mounted under /field/admin/planner-extractor
//     Must be registered BEFORE the broader /field/admin and /field routes
app.route('/field/admin/planner-extractor', plannerExtractor)

// ── Master Products Admin — mounted under /field/admin/products
//     Must be registered BEFORE the broader /field/admin route
app.route('/field/admin/products', productsAdmin)

// ── Field Admin (login-protected) — MUST be before /field to avoid prefix clash
app.route('/field/admin', fieldAdmin)

// ── Phase 15: Mobile field stock checkout — MUST be before /field for prefix precedence
app.route('/field/stock-checkout', fieldStockCheckout)

// ── Field Operations App (public — no login required) — MUST be before dashboard /
app.route('/field', field)

// ── Music Bus fleet app (public — no login) — separate from B&W field ops
app.route('/musicbus', musicbusApp)

// ── Health (must be BEFORE dashboard mount to avoid the requireAuth wildcard)
app.get('/health', (c) => c.json({
  status: 'ok',
  service: 'BW Productions Ops',
  version: '2.0',
  ts: new Date().toISOString()
}))

// ── Public ICS feed (token-protected, no login) — Google/Apple/Outlook poll this
//    Pattern: /calendar/ics/:userId/:token.ics  →  token comes from users.ics_token
//    MUST be registered before /calendar mount because the calendar router has
//    app.use('*', requireAuth) which would block external pollers.
app.get('/calendar/ics/:userId/:tokenFile', async (c) => {
  const { buildICS } = await import('./lib/ics.js')
  const env = c.env as any
  const userId = parseInt(c.req.param('userId'))
  const tokenFile = c.req.param('tokenFile') // expects "{token}.ics"
  const token = tokenFile.replace(/\.ics$/i, '')
  if (!userId || !token || token.length < 16) {
    return c.text('Not found', 404)
  }

  // Verify token
  const user = await env.DB.prepare(`SELECT id, ics_token FROM users WHERE id=? AND active=1`).bind(userId).first<any>()
  if (!user || !user.ics_token || user.ics_token !== token) {
    return c.text('Not found', 404)
  }

  // Pull events from 6 months ago through 18 months out
  const today = new Date()
  const startD = new Date(today); startD.setUTCMonth(startD.getUTCMonth() - 6)
  const endD = new Date(today);   endD.setUTCMonth(endD.getUTCMonth() + 18)
  const startStr = startD.toISOString().slice(0, 10)
  const endStr = endD.toISOString().slice(0, 10)

  const rows = await env.DB.prepare(
    `SELECT ce.*, cl.name as client_name FROM calendar_events ce
     LEFT JOIN clients cl ON cl.id = ce.client_id
     WHERE event_date BETWEEN ? AND ?
       AND status != 'cancelled'
     ORDER BY event_date ASC, id ASC`
  ).bind(startStr, endStr).all<any>()

  const STATUS_TXT: Record<string, string> = {
    booking: '🟡 Booking',
    preloaded: '🟢 Pre-loaded',
    delivered: '🔵 Delivered',
    cancelled: '❌ Cancelled'
  }
  const SUBSTAGE_TXT: Record<string, string> = {
    load:'Load', leave:'Leave', setup:'Setup', event:'Event', strike:'Strike', collect:'Collect'
  }

  const icsEvents = (rows.results || []).map((e: any) => {
    const parts: string[] = []
    parts.push(STATUS_TXT[e.status] || e.status)
    if (e.substage)      parts.push(`• ${SUBSTAGE_TXT[e.substage] || e.substage}`)
    if (e.brand)         parts.push(`• ${e.brand}`)
    if (e.client_name)   parts.push(`• ${e.client_name}`)
    if (e.time_text)     parts.push(`• ${e.time_text}`)
    if (e.team_text)     parts.push(`\nCrew: ${e.team_text}`)
    if (e.vehicle_text)  parts.push(`Vehicle: ${e.vehicle_text}`)
    if (e.notes)         parts.push(`\n${e.notes}`)
    parts.push(`\nOpen: https://${new URL(c.req.url).host}/calendar/event/${e.id}`)

    const updated = e.updated_at ? new Date(e.updated_at) : new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const lastMod = `${updated.getUTCFullYear()}${pad(updated.getUTCMonth()+1)}${pad(updated.getUTCDate())}T${pad(updated.getUTCHours())}${pad(updated.getUTCMinutes())}${pad(updated.getUTCSeconds())}Z`

    return {
      uid: `bw-cal-${e.id}@bwproductions`,
      start: e.event_date,
      summary: `${STATUS_TXT[e.status]?.replace(/^[^\s]+\s/, '') ?? ''} ${e.event_name}`.trim(),
      description: parts.join(' '),
      location: e.address || e.region || undefined,
      status: e.status === 'cancelled' ? 'CANCELLED' as const :
              e.status === 'delivered' ? 'CONFIRMED' as const : 'TENTATIVE' as const,
      categories: [e.brand, e.region, e.status].filter(Boolean),
      lastModified: lastMod
    }
  })

  const ics = buildICS(icsEvents, 'B&W Productions Events')

  return new Response(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'public, max-age=900', // 15 min — Google/Apple poll on their own schedule anyway
      'Content-Disposition': 'inline; filename="bw-events.ics"'
    }
  })
})

// ── Warehouse Big-Screen Dispatch View (token-protected, no login)
//    Pattern: /dispatch/:token  →  token comes from system_settings.dispatch_token
//    MUST be registered before /' (dashboard) mount because dashboard has
//    app.use('*', requireAuth) which would block the warehouse TV.
app.route('/dispatch', dispatch)

// ── Friendly URL alias: /stock-admin/* → /admin/stock/* (301 permanent redirect)
// MUST be registered BEFORE the dashboard mount (which has app.use('*', requireAuth)
// catching everything on '/'). Catches mistyped/legacy links and forwards them
// to the canonical path. Auth gate still fires AFTER redirect at /admin/stock/*.
app.all('/stock-admin', (c) => c.redirect('/admin/stock', 301))
app.all('/stock-admin/*', (c) => {
  const url = new URL(c.req.url)
  const tail = url.pathname.replace(/^\/stock-admin/, '') // keeps leading "/"
  return c.redirect('/admin/stock' + tail + url.search, 301)
})

// ── Token-protected cron endpoint (MUST be before the dashboard mount because
// the dashboard router has app.use('*', requireAuth) which catches everything
// on '/'). External scheduler (GitHub Actions + cron-job.org) POSTs here
// twice daily at 05:00 UTC and 10:00 UTC.
// Token is the CRON_WEBHOOK_TOKEN secret in Cloudflare (separate from Resend).
app.post('/api/cron/email-digest', async (c) => {
  const env = c.env as any
  const auth = c.req.header('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  // Trim the stored secret too — Cloudflare's UI sometimes saves a trailing
  // newline/space when pasting tokens. Belt-and-braces.
  const expected = (env.CRON_WEBHOOK_TOKEN || '').trim()
  if (!token || !expected || token !== expected) {
    return c.json({ ok: false, error: 'unauthorized' }, 401)
  }
  const result = await runDigest(env, { reason: 'webhook' })
  return c.json(result)
})

// ── Token-protected weekly backup cron (D1 → R2 gzipped JSON).
// Fired by GitHub Actions every Sunday at 00:00 UTC (02:00 SAST).
// Uses a SEPARATE secret (BACKUP_WEBHOOK_TOKEN) so the backup token
// can be rotated independently of the digest token.
app.post('/api/cron/backup', async (c) => {
  const env = c.env as any
  const auth = c.req.header('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  const expected = (env.BACKUP_WEBHOOK_TOKEN || '').trim()
  if (!token || !expected || token !== expected) {
    return c.json({ ok: false, error: 'unauthorized' }, 401)
  }
  const result = await runBackup(env)
  if (!result.ok) return c.json(result, 500)
  return c.json(result)
})

// ── Phase 17: Token-protected weekly brand-owner digest cron.
// Fired by GitHub Actions every Monday at 04:00 UTC (06:00 SAST).
// Uses BRAND_DIGEST_WEBHOOK_TOKEN (separate from accounts digest).
app.post('/api/cron/brand-digest', async (c) => {
  const env = c.env as any
  const auth = c.req.header('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  const expected = (env.BRAND_DIGEST_WEBHOOK_TOKEN || '').trim()
  if (!token || !expected || token !== expected) {
    return c.json({ ok: false, error: 'unauthorized' }, 401)
  }
  let body: any = {}
  try { body = await c.req.json() } catch { /* empty body is fine */ }
  const result = await runBrandDigest(env, {
    reason: body.reason || 'cron-webhook',
    filterBrand: body.filterBrand,
  })
  return c.json(result)
})

// ── Phase 5: Token-protected weekly low-stock digest cron.
// Fired by GitHub Actions every Monday at 05:00 UTC (07:00 SAST).
// Uses LOW_STOCK_WEBHOOK_TOKEN secret (rotatable independently of other crons).
// Skips sending if no items are below threshold (set skipIfEmpty=false in
// the body to force "all OK" mail).
app.post('/api/cron/low-stock-digest', async (c) => {
  const env = c.env as any
  const auth = c.req.header('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  const expected = (env.LOW_STOCK_WEBHOOK_TOKEN || '').trim()
  if (!token || !expected || token !== expected) {
    return c.json({ ok: false, error: 'unauthorized' }, 401)
  }
  // Optional body overrides for manual testing via cURL
  let body: any = {}
  try { body = await c.req.json() } catch { /* empty body is fine */ }
  const result = await runLowStockDigest(env, {
    reason: body.reason || 'cron-webhook',
    skipIfEmpty: body.skipIfEmpty !== false,
    dashboardUrl: 'https://bwprodsystem.co.za/admin/stock/alerts',
  })
  if (!result.ok) return c.json(result, 500)
  return c.json(result)
})

// ── Protected app routes
app.route('/account', account)
app.route('/', dashboard)
app.route('/fleet', fleet)
app.route('/clients', clients)
app.route('/suppliers', suppliers)
app.route('/events', events)
app.route('/rate-card', rateCard)
app.route('/quotes', quotes)
// ── Master Stock Admin — mounted under /admin/stock
//     Must be registered BEFORE the broader /admin route
app.route('/admin/stock/returns', stockReturns)
app.route('/admin/stock/damages', stockDamages)
app.route('/admin/stock', stockAdmin)
app.route('/admin/brands', brands)
app.route('/admin/brand-shares', brandShares)
app.route('/admin/brand-digest', brandDigest)
app.route('/admin/costs', eventCosts)
app.route('/admin/quote-link', quoteEventLink)
app.route('/admin/audit', auditViewer)
app.route('/admin', admin)
app.route('/question-sheet', questionSheet)
app.route('/print-sheets', printSheets)
app.route('/calendar', calendar)

// ── API: Rate card
app.get('/api/rate-card', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT rc.id, rc.category, rc.line_item, rc.unit, rc.base_rate,
     rc.effective_rate, s.name as supplier_name
     FROM rate_card rc LEFT JOIN suppliers s ON rc.supplier_id=s.id
     WHERE rc.active=1 ORDER BY rc.category, rc.line_item`
  ).all()
  return c.json(rows.results)
})

// ── API: Load class suggestion
app.get('/api/load-class', async (c) => {
  const pax = parseInt(c.req.query('pax') ?? '0')
  const pallets = parseFloat(c.req.query('pallets') ?? '0')
  const lc = await c.env.DB.prepare(
    `SELECT * FROM load_classes WHERE
     (? >= pax_min AND ? <= pax_max) OR (? > 0 AND ? >= pallet_min AND ? <= pallet_max)
     ORDER BY class LIMIT 1`
  ).bind(pax, pax, pallets, pallets, pallets).first()
  return c.json(lc ?? null)
})



// ── 404
app.notFound((c) => c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>404 — BW Productions</title>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=Inter:wght@400;600&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Inter',sans-serif;background:#0d1117;color:#f0f4ff;
      display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px}
    .wrap{max-width:480px}
    .ring{width:100px;height:100px;margin:0 auto 28px}
    h1{font-family:'Cinzel',serif;font-size:28px;font-weight:900;
      background:linear-gradient(135deg,#B67A3A,#F0D080,#D39A52);
      -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
      margin-bottom:8px}
    p{color:#6b7589;font-size:14px;line-height:1.6;margin-bottom:28px}
    a{display:inline-flex;align-items:center;gap:8px;padding:12px 28px;border-radius:8px;
      background:linear-gradient(135deg,#8B6914,#C9A84C,#F0D080);color:#000;
      font-weight:700;text-decoration:none;font-size:14px;
      box-shadow:0 4px 16px rgba(201,168,76,0.3)}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="ring">
      <img src="/static/bw-logo.png" alt="BW Productions" width="110" height="110" style="object-fit:contain;display:block;filter:drop-shadow(0 0 18px rgba(201,168,76,0.35))">
    </div>
    <h1>Lost in Transit</h1>
    <p>That route isn't on the load sheet.<br>Let's get you back on track.</p>
    <a href="/">← Back to Dashboard</a>
  </div>
</body>
</html>`, 404))

// ─── SCHEDULER NOTES ────────────────────────────────────────────────────────
// Cloudflare Pages doesn't support native cron triggers in wrangler.jsonc.
// All scheduled jobs are fired by an EXTERNAL scheduler (GitHub Actions)
// hitting bearer-token-protected POST endpoints.
//
//   POST /api/cron/email-digest        — Twice daily 05:00 + 10:00 UTC
//                                         CRON_WEBHOOK_TOKEN
//   POST /api/cron/backup              — Sunday 00:00 UTC (02:00 SAST)
//                                         BACKUP_WEBHOOK_TOKEN
//   POST /api/cron/low-stock-digest    — Monday 05:00 UTC (07:00 SAST)
//                                         LOW_STOCK_WEBHOOK_TOKEN
//   POST /api/cron/brand-digest        — Monday 04:00 UTC (06:00 SAST)
//                                         BRAND_DIGEST_WEBHOOK_TOKEN
//
// Tokens are stored as Cloudflare Pages secrets. Bibi can also fire each one
// manually via in-UI buttons (e.g. "Send digest now" on the alerts page).

export default app
