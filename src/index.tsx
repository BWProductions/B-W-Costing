// BW Productions Operations Platform — Main Entry v2.0

import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { serveStatic } from 'hono/cloudflare-workers'
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

type Env = { Bindings: { DB: D1Database } }

const app = new Hono<Env>()

app.use('*', logger())

// ── Static assets (no auth)
app.use('/static/*', serveStatic({ root: './public' }))

// ── Public landing page (no auth)
app.get('/about', publicLanding)

// ── Auth routes (login / logout — no auth required)
app.route('/', auth)

// ── Protected app routes
app.route('/', dashboard)
app.route('/fleet', fleet)
app.route('/clients', clients)
app.route('/suppliers', suppliers)
app.route('/events', events)
app.route('/rate-card', rateCard)
app.route('/quotes', quotes)
app.route('/admin', admin)

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

// ── Health
app.get('/health', (c) => c.json({
  status: 'ok',
  service: 'BW Productions Ops',
  version: '2.0',
  ts: new Date().toISOString()
}))

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
      <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" overflow="visible" width="100" height="100">
        <defs>
          <filter id="g" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <linearGradient id="r" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#CC18E8"/>
            <stop offset="33%" stop-color="#FF7A00"/>
            <stop offset="66%" stop-color="#7CFF2B"/>
            <stop offset="100%" stop-color="#18D9FF"/>
          </linearGradient>
          <linearGradient id="gd" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#B67A3A"/>
            <stop offset="50%" stop-color="#F0D080"/>
            <stop offset="100%" stop-color="#8A5A2B"/>
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r="52" fill="none" stroke="url(#r)" stroke-width="6" filter="url(#g)" opacity="0.9"/>
        <text x="60" y="70" text-anchor="middle" font-family="Georgia,serif" font-size="26" font-weight="900"
          fill="#0d1117" stroke="#0d1117" stroke-width="4">BW</text>
        <text x="60" y="70" text-anchor="middle" font-family="Georgia,serif" font-size="26" font-weight="900"
          fill="url(#gd)" filter="url(#g)">BW</text>
      </svg>
    </div>
    <h1>Lost in Transit</h1>
    <p>That route isn't on the load sheet.<br>Let's get you back on track.</p>
    <a href="/">← Back to Dashboard</a>
  </div>
</body>
</html>`, 404))

export default app
