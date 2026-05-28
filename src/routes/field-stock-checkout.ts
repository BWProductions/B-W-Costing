// ─────────────────────────────────────────────────────────────────────────
// Phase 15: Mobile field stock check-out
// ─────────────────────────────────────────────────────────────────────────
//
// Phone-friendly UI for crew on site to log gear leaving the warehouse
// for a specific event. Mounted at /field/stock-checkout.
//
// Design notes:
//   - Single-page, big-touch buttons, minimal chrome
//   - Crew picks an event from list of allocated upcoming events
//   - For each line, taps "Check out" once it's loaded on the truck
//   - Records a stock_movement (outbound, reason='event_dispatch') tied to event
//   - Reuses calendar_event_equipment allocations as the source of truth
//
// Auth: inherits requireAuth from parent admin chain (any logged-in user
// can use it; role gating is done via per-route checks if needed).
//
// Routes:
//   GET  /field/stock-checkout              — list of upcoming events with allocations
//   GET  /field/stock-checkout/event/:id    — single event pick list
//   POST /field/stock-checkout/event/:id/checkout — log one line as checked out
//   POST /field/stock-checkout/event/:id/uncheckout — undo (within session)

import { Hono } from 'hono'
import type { AuthUser } from '../lib/auth.js'
import { requireAuth } from '../middleware/auth.js'

type Bindings = { DB: D1Database }
type Variables = { user: AuthUser }
const fieldCheckout = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// Auth required: this is for logged-in crew, not public form-users
fieldCheckout.use('*', requireAuth)

function esc(s: any): string {
  if (s === null || s === undefined) return ''
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return ''
  return String(s).slice(0, 10)
}

// ─── Mobile layout helper (no admin chrome) ─────────────────────────────────

function mobileLayout(opts: { title: string; user: AuthUser; body: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="theme-color" content="#1f2937">
  <title>${esc(opts.title)} — B&amp;W Field</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <style>
    body { -webkit-tap-highlight-color: transparent; }
    .touch-row { min-height: 60px; }
    .big-btn { min-height: 56px; font-size: 1.05rem; }
  </style>
</head>
<body class="bg-gray-100 min-h-screen pb-24">
  <header class="bg-gray-900 text-white sticky top-0 z-10 shadow">
    <div class="flex items-center justify-between p-4">
      <div class="flex items-center gap-3">
        <a href="/field/stock-checkout" class="text-white hover:text-blue-200">
          <i class="fas fa-truck-loading text-xl"></i>
        </a>
        <div>
          <div class="text-xs uppercase tracking-wider opacity-70">B&amp;W Field</div>
          <div class="text-base font-semibold leading-tight">${esc(opts.title)}</div>
        </div>
      </div>
      <div class="text-right">
        <div class="text-xs opacity-70">${esc(opts.user.name || opts.user.email)}</div>
        <a href="/admin/stock" class="text-xs underline opacity-80">Desktop view</a>
      </div>
    </div>
  </header>
  <main class="p-4">${opts.body}</main>
</body>
</html>`
}

// ─── INDEX: events with allocations needing checkout ────────────────────────

fieldCheckout.get('/', async (c) => {
  const user = c.get('user')

  // Upcoming events (today + future) that have allocations
  // Compute checkout progress by counting outbound movements with reason='event_dispatch'
  const eventsResult = await c.env.DB.prepare(`
    SELECT
      ce.id,
      ce.event_date,
      ce.event_name,
      ce.status,
      ce.location,
      COUNT(DISTINCT cee.stock_item_id) AS line_count,
      COALESCE(SUM(cee.quantity), 0) AS total_qty,
      COALESCE((
        SELECT SUM(ABS(sm.delta))
        FROM stock_movements sm
        WHERE sm.event_id = ce.id AND sm.reason_category = 'event_dispatch'
      ), 0) AS dispatched_qty
    FROM calendar_events ce
    JOIN calendar_event_equipment cee ON cee.calendar_event_id = ce.id
    WHERE date(ce.event_date) >= date('now', '-1 day')
      AND ce.status NOT IN ('cancelled')
    GROUP BY ce.id
    ORDER BY ce.event_date ASC
    LIMIT 50
  `).all<{
    id: number; event_date: string; event_name: string; status: string;
    location: string | null; line_count: number; total_qty: number; dispatched_qty: number;
  }>()

  const events = eventsResult.results || []

  const rows = events.map(e => {
    const pct = e.total_qty > 0 ? Math.min(100, Math.round((e.dispatched_qty / e.total_qty) * 100)) : 0
    const done = pct >= 100
    return `
      <a href="/field/stock-checkout/event/${e.id}"
         class="block bg-white rounded-lg shadow p-4 mb-3 touch-row active:bg-gray-50">
        <div class="flex items-start justify-between gap-3">
          <div class="flex-1 min-w-0">
            <div class="font-semibold text-gray-900 truncate">${esc(e.event_name)}</div>
            <div class="text-xs text-gray-600 mt-1">
              <i class="fas fa-calendar mr-1"></i>${fmtDate(e.event_date)}
              ${e.location ? `<span class="ml-3"><i class="fas fa-map-marker-alt mr-1"></i>${esc(e.location)}</span>` : ''}
            </div>
            <div class="text-xs text-gray-500 mt-1">${e.line_count} item types · ${e.total_qty} units</div>
          </div>
          <div class="text-right flex-shrink-0">
            ${done
              ? '<div class="text-green-600 text-2xl"><i class="fas fa-check-circle"></i></div>'
              : `<div class="text-xs text-gray-500">${e.dispatched_qty}/${e.total_qty}</div>`}
          </div>
        </div>
        <div class="mt-2 w-full bg-gray-200 rounded-full h-2">
          <div class="${done ? 'bg-green-500' : 'bg-blue-500'} h-2 rounded-full" style="width:${pct}%"></div>
        </div>
      </a>
    `
  }).join('')

  return c.html(mobileLayout({
    title: 'Stock Check-Out',
    user,
    body: `
      <div class="mb-4">
        <h2 class="text-lg font-semibold mb-1">Upcoming Events</h2>
        <p class="text-xs text-gray-600">Tap an event to check out its stock as it leaves the warehouse.</p>
      </div>
      ${rows || '<div class="bg-white rounded-lg shadow p-6 text-center text-gray-500"><i class="fas fa-truck fa-2x mb-3 text-gray-300"></i><br>No upcoming events with allocations.</div>'}
    `,
  }))
})

// ─── PER-EVENT PICK LIST ────────────────────────────────────────────────────

fieldCheckout.get('/event/:id', async (c) => {
  const user = c.get('user')
  const eventId = Number(c.req.param('id'))

  const event = await c.env.DB.prepare(`
    SELECT * FROM calendar_events WHERE id = ?
  `).bind(eventId).first<{
    id: number; event_date: string; event_name: string; status: string;
    location: string | null;
  }>()
  if (!event) return c.notFound()

  // Allocations + per-item dispatched qty
  const linesResult = await c.env.DB.prepare(`
    SELECT
      cee.id AS alloc_id,
      cee.stock_item_id,
      cee.quantity AS allocated_qty,
      si.brand,
      si.description,
      si.qty_on_hand,
      si.location AS bin_location,
      COALESCE((
        SELECT SUM(ABS(sm.delta))
        FROM stock_movements sm
        WHERE sm.event_id = ? AND sm.stock_item_id = cee.stock_item_id
              AND sm.reason_category = 'event_dispatch'
      ), 0) AS dispatched
    FROM calendar_event_equipment cee
    JOIN stock_items si ON si.id = cee.stock_item_id
    WHERE cee.calendar_event_id = ?
    ORDER BY si.brand, si.description
  `).bind(eventId, eventId).all<{
    alloc_id: number; stock_item_id: number; allocated_qty: number;
    brand: string; description: string; qty_on_hand: number;
    bin_location: string | null; dispatched: number;
  }>()

  const lines = linesResult.results || []
  const success = c.req.query('success')

  const rows = lines.map(l => {
    const remaining = l.allocated_qty - l.dispatched
    const done = remaining <= 0
    return `
      <div class="bg-white rounded-lg shadow p-4 mb-3 ${done ? 'opacity-60' : ''}">
        <div class="flex items-start justify-between gap-3 mb-3">
          <div class="flex-1 min-w-0">
            <div class="text-xs uppercase tracking-wider text-gray-500">${esc(l.brand)}</div>
            <div class="font-medium text-gray-900">${esc(l.description)}</div>
            ${l.bin_location ? `<div class="text-xs text-gray-500 mt-1"><i class="fas fa-map-pin mr-1"></i>${esc(l.bin_location)}</div>` : ''}
          </div>
          <div class="text-right flex-shrink-0">
            <div class="text-2xl font-bold ${done ? 'text-green-600' : 'text-gray-900'}">
              ${l.dispatched}/${l.allocated_qty}
            </div>
            <div class="text-xs text-gray-500">checked out</div>
          </div>
        </div>
        ${done
          ? `<div class="bg-green-50 text-green-700 text-center py-2 rounded font-medium"><i class="fas fa-check-circle mr-1"></i> Fully loaded</div>`
          : `<form method="POST" action="/field/stock-checkout/event/${eventId}/checkout" class="flex gap-2">
              <input type="hidden" name="stock_item_id" value="${l.stock_item_id}">
              <input type="number" name="qty" value="${remaining}" min="1" max="${remaining}"
                     class="w-24 border-2 rounded-lg px-3 py-3 text-lg text-center font-bold">
              <button type="submit" class="big-btn flex-1 bg-blue-600 text-white rounded-lg font-semibold active:bg-blue-700">
                <i class="fas fa-arrow-right mr-1"></i> Check Out
              </button>
            </form>`}
      </div>
    `
  }).join('')

  return c.html(mobileLayout({
    title: event.event_name,
    user,
    body: `
      <div class="mb-3">
        <a href="/field/stock-checkout" class="text-sm text-blue-600">← All events</a>
      </div>
      <div class="bg-gray-900 text-white rounded-lg p-4 mb-4">
        <div class="text-xs uppercase opacity-70">${fmtDate(event.event_date)} · ${esc(event.status)}</div>
        <div class="font-bold text-lg mt-1">${esc(event.event_name)}</div>
        ${event.location ? `<div class="text-sm opacity-80 mt-1"><i class="fas fa-map-marker-alt mr-1"></i>${esc(event.location)}</div>` : ''}
      </div>
      ${success ? `<div class="bg-green-100 border border-green-300 text-green-800 rounded-lg p-3 mb-3 text-sm"><i class="fas fa-check mr-1"></i>${esc(success)}</div>` : ''}
      ${rows || '<div class="bg-white rounded-lg shadow p-6 text-center text-gray-500"><i class="fas fa-box-open fa-2x mb-3 text-gray-300"></i><br>No allocations on this event.</div>'}
    `,
  }))
})

// ─── CHECK-OUT ACTION ───────────────────────────────────────────────────────

fieldCheckout.post('/event/:id/checkout', async (c) => {
  const user = c.get('user')
  const eventId = Number(c.req.param('id'))
  const form = await c.req.formData()
  const stockItemId = Number(form.get('stock_item_id'))
  const qty = Math.abs(Number(form.get('qty') || 0))

  if (!stockItemId || qty < 1) {
    return c.redirect(`/field/stock-checkout/event/${eventId}?success=Invalid+input`)
  }

  // Verify item + allocation exist
  const alloc = await c.env.DB.prepare(`
    SELECT cee.quantity, si.description, si.qty_on_hand
    FROM calendar_event_equipment cee
    JOIN stock_items si ON si.id = cee.stock_item_id
    WHERE cee.calendar_event_id = ? AND cee.stock_item_id = ?
    LIMIT 1
  `).bind(eventId, stockItemId).first<{ quantity: number; description: string; qty_on_hand: number }>()

  if (!alloc) {
    return c.redirect(`/field/stock-checkout/event/${eventId}?success=Item+not+allocated`)
  }

  // Write outbound movement
  const oldQty = alloc.qty_on_hand
  const newQty = Math.max(0, oldQty - qty)
  await c.env.DB.prepare(`
    INSERT INTO stock_movements
      (stock_item_id, action, field_changed, old_value, new_value, delta,
       reason, reason_category, event_id, user_id, user_name)
    VALUES (?, 'field_checkout', 'qty_on_hand', ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    stockItemId,
    String(oldQty),
    String(newQty),
    -qty,
    `Field checkout for event #${eventId}`,
    'event_dispatch',
    eventId,
    user.id,
    user.name || user.email,
  ).run()

  // Decrement on-hand
  await c.env.DB.prepare(`
    UPDATE stock_items SET qty_on_hand = MAX(0, qty_on_hand - ?) WHERE id = ?
  `).bind(qty, stockItemId).run()

  return c.redirect(`/field/stock-checkout/event/${eventId}?success=Checked+out+${qty}+x+${encodeURIComponent(alloc.description.slice(0, 40))}`)
})

export default fieldCheckout
