// BW Productions Operations Platform — Main Entry v2.0

import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { serveStatic } from 'hono/cloudflare-workers'
import { runDigest } from './lib/email-digest.js'
import auth from './routes/auth.js'
import dashboard from './routes/dashboard.js'
import fleet from './routes/fleet.js'
import clients from './routes/clients.js'
import suppliers from './routes/suppliers.js'
import events from './routes/events.js'
import rateCard from './routes/rate-card.js'
import quotes from './routes/quotes.js'
import admin from './routes/admin.js'
import { publicLanding } from './routes/public.js'
import account from './routes/account.js'
import questionSheet from './routes/question-sheet.js'
import printSheets from './routes/print-sheets.js'
import field, { musicbusApp } from './routes/field.js'
import fieldAdmin from './routes/field-admin.js'
import plannerExtractor from './routes/planner-extractor.js'
import productsAdmin from './routes/products-admin.js'
import calendar from './routes/calendar.js'

type Env = { Bindings: { DB: D1Database } }

const app = new Hono<Env>()

app.use('*', logger())

// ── Static assets (no auth)
app.use('/static/*', serveStatic({ root: './public' }))

// ── Public landing page (no auth)
app.get('/about', publicLanding)

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

// ── Token-protected cron endpoint (MUST be before the dashboard mount because
// the dashboard router has app.use('*', requireAuth) which catches everything
// on '/'). External scheduler (GitHub Actions + cron-job.org) POSTs here
// twice daily at 05:00 UTC and 10:00 UTC.
// Token is the CRON_WEBHOOK_TOKEN secret in Cloudflare (separate from Resend).
app.post('/api/cron/email-digest', async (c) => {
  const env = c.env as any
  const auth = c.req.header('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  const expected = env.CRON_WEBHOOK_TOKEN || ''
  if (!token || !expected || token !== expected) {
    return c.json({ ok: false, error: 'unauthorized' }, 401)
  }
  const result = await runDigest(env, { reason: 'webhook' })
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
// The accounts email digest is fired by an EXTERNAL scheduler hitting
//     POST /api/cron/email-digest
// twice daily at 05:00 UTC (07:00 SAST) and 10:00 UTC (12:00 SAST).
// The webhook is bearer-token protected (token = last 12 chars of
// RESEND_API_KEY). For now Bibi can also fire it manually via the
// "Send digest now" button at /field/admin/email-digest.

export default app
