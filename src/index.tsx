// B&W Productions Operations Platform — Main Entry

import { Hono } from 'hono'
import { logger } from 'hono/logger'
import auth from './routes/auth.js'
import dashboard from './routes/dashboard.js'
import fleet from './routes/fleet.js'
import clients from './routes/clients.js'
import suppliers from './routes/suppliers.js'
import events from './routes/events.js'
import rateCard from './routes/rate-card.js'
import quotes from './routes/quotes.js'

type Env = { Bindings: { DB: D1Database } }

const app = new Hono<Env>()

app.use('*', logger())

// Auth routes (no auth required)
app.route('/', auth)

// App routes
app.route('/', dashboard)
app.route('/fleet', fleet)
app.route('/clients', clients)
app.route('/suppliers', suppliers)
app.route('/events', events)
app.route('/rate-card', rateCard)
app.route('/quotes', quotes)

// Rate card API (for quote builder)
app.get('/api/rate-card', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT rc.id, rc.category, rc.line_item, rc.unit, rc.base_rate,
     rc.effective_rate, s.name as supplier_name
     FROM rate_card rc LEFT JOIN suppliers s ON rc.supplier_id=s.id
     WHERE rc.active=1 ORDER BY rc.category, rc.line_item`
  ).all()
  return c.json(rows.results)
})

// Load class suggestion API
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

// Health check
app.get('/health', (c) => c.json({ status: 'ok', service: 'B&W Productions Ops', ts: new Date().toISOString() }))

// 404
app.notFound((c) => c.html(`
  <html><body style="font-family:sans-serif;background:#0a0a0a;color:#f5f5f5;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center">
    <div>
      <div style="font-size:48px;margin-bottom:16px">🚛</div>
      <h1 style="font-size:24px;color:#d4a843">404 — Lost in transit</h1>
      <p style="color:#888;margin:8px 0 20px">That page doesn't exist on our route sheet.</p>
      <a href="/" style="background:#d4a843;color:#000;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600">Back to Dashboard</a>
    </div>
  </body></html>`, 404))

export default app
