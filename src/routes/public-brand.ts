// ─────────────────────────────────────────────────────────────────────────
// Phase 13: Client-facing brand pages — PUBLIC viewer
// ─────────────────────────────────────────────────────────────────────────
//
// CRITICAL: This route is mounted in index.tsx BEFORE the global auth
// middleware. No login required — access is gated by share token only.
//
// What's shown (read-only, watermarked):
//   - Brand name + ownership
//   - High-level stats (item count, units, open shortages, upcoming events)
//   - Upcoming events list (date + name only, no internal financials)
//   - Open shortages count (so brand owner knows when supply is tight)
//   - Recent activity summary
//
// What's deliberately HIDDEN:
//   - Internal financials (cost prices, margins)
//   - Quote numbers / amounts
//   - Stock movements ledger (too granular)
//   - User identities
//   - Any links into the admin app

import { Hono } from 'hono'
import { getActiveToken, logShareView } from '../lib/brand-shares.js'
import { getBrandDashboard } from '../lib/brand-stats.js'

type Bindings = { DB: D1Database }
const publicBrand = new Hono<{ Bindings: Bindings }>()

// ─── helpers ────────────────────────────────────────────────────────────────

function esc(s: any): string {
  if (s === null || s === undefined) return ''
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return ''
  return String(s).slice(0, 10)
}

// ─── ROUTES ─────────────────────────────────────────────────────────────────

// Health check / token validation — useful for debugging
publicBrand.get('/check/:token', async (c) => {
  const tokenStr = c.req.param('token')
  const tok = await getActiveToken(c.env.DB, tokenStr)
  if (!tok) return c.json({ valid: false }, 404)
  return c.json({ valid: true, brand: tok.brand })
})

// Main public dashboard
publicBrand.get('/:token', async (c) => {
  const tokenStr = c.req.param('token')
  const tok = await getActiveToken(c.env.DB, tokenStr)

  if (!tok) {
    return c.html(`
      <!DOCTYPE html>
      <html><head><meta charset="UTF-8"><title>Link not active</title>
      <script src="https://cdn.tailwindcss.com"></script></head>
      <body class="bg-gray-100 min-h-screen flex items-center justify-center p-6">
        <div class="bg-white rounded shadow p-8 max-w-md text-center">
          <div class="text-5xl mb-4">🔒</div>
          <h1 class="text-2xl font-bold mb-2">Link not active</h1>
          <p class="text-gray-600">
            This share link has expired or been revoked.
            Please contact B&amp;W Productions for an updated link.
          </p>
        </div>
      </body></html>
    `, 404)
  }

  // Log the view — best effort, won't block serving
  const ip = c.req.header('cf-connecting-ip')
            || c.req.header('x-forwarded-for')
            || null
  const ua = c.req.header('user-agent') || null
  const ref = c.req.header('referer') || null
  await logShareView(c.env.DB, {
    token_id: tok.id,
    ip_address: ip,
    user_agent: ua,
    referrer: ref,
  })

  const dash = await getBrandDashboard(c.env.DB, tok.brand)
  if (!dash) {
    return c.html(`
      <!DOCTYPE html><html><body><h1>Brand not found</h1></body></html>
    `, 404)
  }

  // Upcoming events — show date + name only, no internal IDs
  const upcomingRows = dash.upcoming_events.map(e => `
    <tr class="hover:bg-blue-50">
      <td class="px-4 py-2 border-b font-medium">${fmtDate(e.event_date)}</td>
      <td class="px-4 py-2 border-b">${esc(e.event_name)}</td>
      <td class="px-4 py-2 border-b text-center text-gray-600">${e.total_qty}</td>
    </tr>
  `).join('')

  // Top items (no internal stock IDs shown)
  const itemRows = dash.items_top.slice(0, 15).map(i => `
    <tr class="hover:bg-blue-50">
      <td class="px-4 py-2 border-b">${esc(i.description)}</td>
      <td class="px-4 py-2 border-b text-center">${i.qty_on_hand}</td>
      <td class="px-4 py-2 border-b text-gray-600">${esc(i.location || '—')}</td>
    </tr>
  `).join('')

  const lowStockRows = dash.low_stock_items.slice(0, 10).map(l => `
    <tr class="hover:bg-amber-50">
      <td class="px-4 py-2 border-b">${esc(l.description)}</td>
      <td class="px-4 py-2 border-b text-center text-red-600 font-medium">${l.qty_on_hand}</td>
      <td class="px-4 py-2 border-b text-center text-gray-500">${l.low_stock_threshold}</td>
      <td class="px-4 py-2 border-b text-center text-red-600">−${l.deficit}</td>
    </tr>
  `).join('')

  return c.html(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>${esc(dash.brand)} — Stock Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <style>
    .watermark {
      position: fixed;
      bottom: 1rem;
      right: 1rem;
      background: rgba(255,255,255,0.95);
      padding: 0.5rem 0.75rem;
      border-radius: 0.5rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      font-size: 0.75rem;
      color: #6b7280;
      pointer-events: none;
      z-index: 10;
    }
  </style>
</head>
<body class="bg-gray-50 min-h-screen pb-16">
  <!-- Header -->
  <header class="bg-white shadow">
    <div class="max-w-6xl mx-auto p-6 flex items-center justify-between">
      <div>
        <div class="text-xs uppercase tracking-wider text-gray-500 mb-1">B&amp;W Productions · Brand Dashboard</div>
        <h1 class="text-3xl font-bold text-gray-900">${esc(dash.brand)}</h1>
        ${dash.ownership ? `<div class="text-sm text-gray-600 mt-1">${esc(dash.ownership)}</div>` : ''}
      </div>
      <div class="text-right text-xs text-gray-500">
        <div>Read-only view</div>
        <div>Updated ${new Date().toISOString().slice(0, 10)}</div>
        ${tok.label ? `<div class="mt-1">Shared with: <strong>${esc(tok.label)}</strong></div>` : ''}
      </div>
    </div>
  </header>

  <main class="max-w-6xl mx-auto p-6 space-y-6">

    <!-- Stat tiles -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="bg-white rounded shadow p-4">
        <div class="text-xs uppercase text-gray-500">Distinct Items</div>
        <div class="text-3xl font-bold text-gray-900 mt-1">${dash.item_count}</div>
      </div>
      <div class="bg-white rounded shadow p-4">
        <div class="text-xs uppercase text-gray-500">Total Units</div>
        <div class="text-3xl font-bold text-gray-900 mt-1">${dash.unit_count}</div>
      </div>
      <div class="bg-white rounded shadow p-4">
        <div class="text-xs uppercase text-gray-500">Upcoming Events (30d)</div>
        <div class="text-3xl font-bold text-blue-600 mt-1">${dash.upcoming_events.length}</div>
      </div>
      <div class="bg-white rounded shadow p-4">
        <div class="text-xs uppercase text-gray-500">Open Shortages</div>
        <div class="text-3xl font-bold ${dash.open_shortages.length > 0 ? 'text-red-600' : 'text-green-600'} mt-1">
          ${dash.open_shortages.length}
        </div>
      </div>
    </div>

    <!-- Upcoming events -->
    <section class="bg-white rounded shadow">
      <div class="px-6 py-4 border-b">
        <h2 class="text-lg font-semibold">
          <i class="fas fa-calendar-alt text-blue-600 mr-2"></i>
          Upcoming Events
        </h2>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-2 text-left border-b">Date</th>
              <th class="px-4 py-2 text-left border-b">Event</th>
              <th class="px-4 py-2 text-center border-b">Units Allocated</th>
            </tr>
          </thead>
          <tbody>
            ${upcomingRows || '<tr><td colspan="3" class="px-4 py-6 text-center text-gray-500">No upcoming events scheduled.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>

    <!-- Top stock items -->
    <section class="bg-white rounded shadow">
      <div class="px-6 py-4 border-b">
        <h2 class="text-lg font-semibold">
          <i class="fas fa-boxes text-green-600 mr-2"></i>
          Stock Holdings
        </h2>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-2 text-left border-b">Item</th>
              <th class="px-4 py-2 text-center border-b">Qty on Hand</th>
              <th class="px-4 py-2 text-left border-b">Location</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows || '<tr><td colspan="3" class="px-4 py-6 text-center text-gray-500">No items recorded.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>

    ${dash.low_stock_items.length > 0 ? `
    <!-- Low stock -->
    <section class="bg-white rounded shadow border-l-4 border-amber-500">
      <div class="px-6 py-4 border-b">
        <h2 class="text-lg font-semibold">
          <i class="fas fa-exclamation-triangle text-amber-600 mr-2"></i>
          Low Stock Items
        </h2>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-2 text-left border-b">Item</th>
              <th class="px-4 py-2 text-center border-b">Qty on Hand</th>
              <th class="px-4 py-2 text-center border-b">Threshold</th>
              <th class="px-4 py-2 text-center border-b">Deficit</th>
            </tr>
          </thead>
          <tbody>${lowStockRows}</tbody>
        </table>
      </div>
    </section>
    ` : ''}

    <!-- Activity summary -->
    <section class="bg-white rounded shadow p-6">
      <h2 class="text-lg font-semibold mb-3">
        <i class="fas fa-chart-line text-purple-600 mr-2"></i>
        Recent Activity (30 days)
      </h2>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        ${Object.entries(dash.field_counts_30d).map(([type, count]) => `
          <div class="bg-gray-50 rounded p-3">
            <div class="text-xs uppercase text-gray-500">${esc(type.replace(/_/g, ' '))}</div>
            <div class="text-2xl font-semibold mt-1">${count}</div>
          </div>
        `).join('') || '<div class="text-gray-500 col-span-4">No recent activity recorded.</div>'}
      </div>
    </section>

    <footer class="text-center text-xs text-gray-400 pt-8">
      This is a confidential, read-only view shared with you by B&amp;W Productions.<br>
      Data refreshes in real time. Do not share this URL.
    </footer>
  </main>

  <div class="watermark">
    <i class="fas fa-eye mr-1"></i> Shared view · B&amp;W Productions
  </div>
</body>
</html>
  `)
})

export default publicBrand
