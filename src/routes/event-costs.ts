// ─────────────────────────────────────────────────────────────────────────
// Phase 12: Per-Event Cost Rollup — UI routes
// Mounted under /admin/costs
// ─────────────────────────────────────────────────────────────────────────

import { Hono } from 'hono'
import type { AuthUser } from '../lib/auth.js'
import { requireAuth } from '../middleware/auth.js'
import { layout } from '../lib/layout.js'
import {
  calcEventCosts,
  getCostDefaults,
  saveCostDefaults,
  saveEventOverrides,
  clearEventOverrides,
  getMonthlyPL,
} from '../lib/event-costs.js'

type Bindings = { DB: D1Database }
type Variables = { user: AuthUser }
const costs = new Hono<{ Bindings: Bindings; Variables: Variables }>()
costs.use('*', requireAuth)

function esc(s: any): string {
  if (s === null || s === undefined) return ''
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function money(v: number): string {
  return `R ${Number(v || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function marginBadge(margin: number, pct: number): string {
  if (margin > 0 && pct >= 25) return `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;background:#10b98122;color:#10b981;font-size:11px;font-weight:700;border:1px solid #10b98155">HEALTHY ${pct.toFixed(0)}%</span>`
  if (margin > 0) return `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;background:#f59e0b22;color:#f59e0b;font-size:11px;font-weight:700;border:1px solid #f59e0b55">MARGINAL ${pct.toFixed(0)}%</span>`
  if (margin === 0) return `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;background:#6b728022;color:#9ca3af;font-size:11px;font-weight:700">BREAK-EVEN</span>`
  return `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;background:#ef444422;color:#ef4444;font-size:11px;font-weight:700;border:1px solid #ef444455">LOSS</span>`
}

// ─── Index: monthly P&L ───────────────────────────────────────────────────

costs.get('/', async (c) => {
  const user = c.get('user')
  const month = c.req.query('month') || new Date().toISOString().slice(0, 7)
  const pl = await getMonthlyPL(c.env.DB, month)

  // Build month nav
  const [y, m] = month.split('-').map(Number)
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`

  const rows = pl.events.map(e => `
    <tr style="border-top:1px solid #21262d">
      <td style="padding:6px 10px"><a href="/admin/costs/${e.event_id}" style="color:#C9A84C;text-decoration:none;font-weight:700">#${e.event_id}</a></td>
      <td style="padding:6px 10px;color:#18D9FF">${esc(e.event_date)}</td>
      <td style="padding:6px 10px;color:#e5e7eb">${esc(e.event_name)}</td>
      <td style="padding:6px 10px;text-align:right;color:#e5e7eb;font-family:monospace">${money(e.revenue)}</td>
      <td style="padding:6px 10px;text-align:right;color:#9ca3af;font-family:monospace">${money(e.cost)}</td>
      <td style="padding:6px 10px;text-align:right;color:${e.margin >= 0 ? '#10b981' : '#ef4444'};font-family:monospace;font-weight:700">${money(e.margin)}</td>
      <td style="padding:6px 10px">${marginBadge(e.margin, e.revenue > 0 ? (e.margin / e.revenue) * 100 : 0)}</td>
    </tr>
  `).join('')

  const body = `
    <div style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <div>
          <h1 style="margin:0;color:#C9A84C;font-size:24px"><i class="fas fa-coins"></i> Event Costs &amp; P&amp;L</h1>
          <div style="color:#9ca3af;font-size:13px;margin-top:4px">Revenue vs cost per event — stock, crew, vehicles, damages, overrides</div>
        </div>
        <div style="display:flex;gap:8px">
          <a href="/admin/costs/defaults" class="btn btn-outline"><i class="fas fa-gear"></i> Cost defaults</a>
          <a href="/admin/stock" class="btn btn-outline"><i class="fas fa-arrow-left"></i> Back</a>
        </div>
      </div>
    </div>

    <div style="display:flex;gap:8px;align-items:center;margin-bottom:16px">
      <a href="/admin/costs?month=${prev}" class="btn btn-outline btn-sm"><i class="fas fa-chevron-left"></i></a>
      <div style="font-size:18px;font-weight:700;color:#C9A84C;min-width:160px;text-align:center">${esc(month)}</div>
      <a href="/admin/costs?month=${next}" class="btn btn-outline btn-sm"><i class="fas fa-chevron-right"></i></a>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px">
      <div class="card" style="padding:14px"><div style="font-size:11px;color:#9ca3af;text-transform:uppercase">Events</div><div style="font-size:28px;font-weight:700;color:#e5e7eb">${pl.event_count}</div></div>
      <div class="card" style="padding:14px;border-left:3px solid #18D9FF"><div style="font-size:11px;color:#9ca3af;text-transform:uppercase">Revenue</div><div style="font-size:22px;font-weight:700;color:#18D9FF;font-family:monospace">${money(pl.revenue_total)}</div></div>
      <div class="card" style="padding:14px;border-left:3px solid #f59e0b"><div style="font-size:11px;color:#9ca3af;text-transform:uppercase">Cost</div><div style="font-size:22px;font-weight:700;color:#f59e0b;font-family:monospace">${money(pl.cost_total)}</div></div>
      <div class="card" style="padding:14px;border-left:3px solid ${pl.margin_total >= 0 ? '#10b981' : '#ef4444'}"><div style="font-size:11px;color:#9ca3af;text-transform:uppercase">Margin</div><div style="font-size:22px;font-weight:700;color:${pl.margin_total >= 0 ? '#10b981' : '#ef4444'};font-family:monospace">${money(pl.margin_total)}</div><div style="font-size:11px;color:#9ca3af">${pl.margin_pct.toFixed(1)}%</div></div>
    </div>

    ${pl.events.length === 0
      ? `<div class="card" style="padding:28px;text-align:center;color:#9ca3af">No events in ${esc(month)}.</div>`
      : `<div class="card" style="padding:0;overflow:hidden">
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead style="background:#0d1117">
              <tr>
                <th style="text-align:left;padding:8px 10px;color:#9ca3af;font-size:11px;text-transform:uppercase">#</th>
                <th style="text-align:left;padding:8px 10px;color:#9ca3af;font-size:11px;text-transform:uppercase">Date</th>
                <th style="text-align:left;padding:8px 10px;color:#9ca3af;font-size:11px;text-transform:uppercase">Event</th>
                <th style="text-align:right;padding:8px 10px;color:#9ca3af;font-size:11px;text-transform:uppercase">Revenue</th>
                <th style="text-align:right;padding:8px 10px;color:#9ca3af;font-size:11px;text-transform:uppercase">Cost</th>
                <th style="text-align:right;padding:8px 10px;color:#9ca3af;font-size:11px;text-transform:uppercase">Margin</th>
                <th style="text-align:left;padding:8px 10px;color:#9ca3af;font-size:11px;text-transform:uppercase">Health</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`
    }
  `
  return c.html(layout(`Costs · ${month}`, body, user, 'stock-admin'))
})

// ─── Cost defaults editor ────────────────────────────────────────────────

costs.get('/defaults', async (c) => {
  const user = c.get('user')
  const d = await getCostDefaults(c.env.DB)
  const body = `
    <div style="margin-bottom:16px">
      <h1 style="margin:0;color:#C9A84C;font-size:22px"><i class="fas fa-gear"></i> Cost defaults</h1>
      <div style="color:#9ca3af;font-size:13px;margin-top:4px">These rates feed the per-event cost calculator unless overridden.</div>
    </div>
    <form method="POST" action="/admin/costs/defaults" class="card" style="padding:18px;max-width:540px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div><label style="display:block;font-size:11px;color:#9ca3af;text-transform:uppercase;margin-bottom:4px">Crew hourly rate (ZAR)</label>
          <input type="number" step="0.01" name="crew_hourly_rate" value="${d.crew_hourly_rate}" style="width:100%;background:#0d1117;color:#e5e7eb;border:1px solid #21262d;border-radius:6px;padding:8px 10px"></div>
        <div><label style="display:block;font-size:11px;color:#9ca3af;text-transform:uppercase;margin-bottom:4px">Driver hourly rate (ZAR)</label>
          <input type="number" step="0.01" name="driver_hourly_rate" value="${d.driver_hourly_rate}" style="width:100%;background:#0d1117;color:#e5e7eb;border:1px solid #21262d;border-radius:6px;padding:8px 10px"></div>
        <div><label style="display:block;font-size:11px;color:#9ca3af;text-transform:uppercase;margin-bottom:4px">Vehicle day rate (ZAR)</label>
          <input type="number" step="0.01" name="vehicle_day_rate" value="${d.vehicle_day_rate}" style="width:100%;background:#0d1117;color:#e5e7eb;border:1px solid #21262d;border-radius:6px;padding:8px 10px"></div>
        <div><label style="display:block;font-size:11px;color:#9ca3af;text-transform:uppercase;margin-bottom:4px">Vehicle km rate (ZAR)</label>
          <input type="number" step="0.01" name="vehicle_km_rate" value="${d.vehicle_km_rate}" style="width:100%;background:#0d1117;color:#e5e7eb;border:1px solid #21262d;border-radius:6px;padding:8px 10px"></div>
        <div style="grid-column:span 2"><label style="display:block;font-size:11px;color:#9ca3af;text-transform:uppercase;margin-bottom:4px">Default event hours</label>
          <input type="number" step="0.5" name="default_event_hours" value="${d.default_event_hours}" style="width:100%;background:#0d1117;color:#e5e7eb;border:1px solid #21262d;border-radius:6px;padding:8px 10px"></div>
      </div>
      <div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end">
        <a href="/admin/costs" class="btn btn-outline">Cancel</a>
        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Save defaults</button>
      </div>
    </form>
  `
  return c.html(layout('Cost defaults', body, user, 'stock-admin'))
})

costs.post('/defaults', async (c) => {
  const form = await c.req.parseBody()
  await saveCostDefaults(c.env.DB, {
    crew_hourly_rate:    Number(form.crew_hourly_rate)    || 250,
    driver_hourly_rate:  Number(form.driver_hourly_rate)  || 350,
    vehicle_day_rate:    Number(form.vehicle_day_rate)    || 800,
    vehicle_km_rate:     Number(form.vehicle_km_rate)     || 5,
    default_event_hours: Number(form.default_event_hours) || 8,
  })
  return c.redirect('/admin/costs/defaults')
})

// ─── Per-event cost detail ───────────────────────────────────────────────

costs.get('/:id', async (c) => {
  const user = c.get('user')
  const id = Number(c.req.param('id'))
  const b = await calcEventCosts(c.env.DB, id)
  if (!b) return c.html(layout('Event not found', `<div class="card" style="padding:24px"><p>Event #${id} not found.</p><a href="/admin/costs" class="btn btn-outline">Back</a></div>`, user, 'stock-admin'), 404)

  const body = `
    <div style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">
        <div>
          <h1 style="margin:0;color:#C9A84C;font-size:22px"><i class="fas fa-coins"></i> Costs · ${esc(b.event_name)}</h1>
          <div style="color:#9ca3af;font-size:13px;margin-top:4px">
            <a href="/calendar/${b.event_id}" style="color:#18D9FF;text-decoration:none">Event #${b.event_id}</a> · ${esc(b.event_date)} · Status: ${esc(b.status)}
            ${b.quote_id ? ` · <a href="/quotes/${b.quote_id}" style="color:#C9A84C;text-decoration:none">Quote ${esc(b.quote_number || '#' + b.quote_id)}</a>` : ''}
          </div>
        </div>
        <a href="/admin/costs" class="btn btn-outline"><i class="fas fa-arrow-left"></i> All costs</a>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px">
      <div class="card" style="padding:14px;border-left:3px solid #18D9FF"><div style="font-size:11px;color:#9ca3af;text-transform:uppercase">Revenue</div><div style="font-size:22px;font-weight:700;color:#18D9FF;font-family:monospace">${money(b.revenue)}</div><div style="font-size:11px;color:#9ca3af">source: ${b.revenue_source}</div></div>
      <div class="card" style="padding:14px;border-left:3px solid #f59e0b"><div style="font-size:11px;color:#9ca3af;text-transform:uppercase">Cost</div><div style="font-size:22px;font-weight:700;color:#f59e0b;font-family:monospace">${money(b.cost_total)}</div></div>
      <div class="card" style="padding:14px;border-left:3px solid ${b.margin >= 0 ? '#10b981' : '#ef4444'}"><div style="font-size:11px;color:#9ca3af;text-transform:uppercase">Margin</div><div style="font-size:22px;font-weight:700;color:${b.margin >= 0 ? '#10b981' : '#ef4444'};font-family:monospace">${money(b.margin)}</div><div style="font-size:11px;color:#9ca3af">${b.margin_pct.toFixed(1)}%</div></div>
      <div class="card" style="padding:14px"><div style="font-size:11px;color:#9ca3af;text-transform:uppercase">Health</div><div style="margin-top:6px">${marginBadge(b.margin, b.margin_pct)}</div></div>
    </div>

    <div class="card" style="padding:0;margin-bottom:16px;overflow:hidden">
      <div style="padding:12px 14px;border-bottom:1px solid #21262d;background:#0d1117"><div style="font-size:13px;color:#e5e7eb;font-weight:700">Cost breakdown</div></div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tbody>
          <tr style="border-top:1px solid #21262d"><td style="padding:8px 12px;color:#e5e7eb"><i class="fas fa-boxes-stacked" style="color:#C9A84C"></i> Stock${b.stock_auto ? '' : ' <span style="color:#fbbf24;font-size:10px">(override)</span>'}</td><td style="padding:8px 12px;text-align:right;color:#9ca3af">${b.stock_lines} lines · ${b.stock_units} units</td><td style="padding:8px 12px;text-align:right;color:#e5e7eb;font-family:monospace">${money(b.stock_cost)}</td></tr>
          <tr style="border-top:1px solid #21262d"><td style="padding:8px 12px;color:#e5e7eb"><i class="fas fa-people-group" style="color:#7c3aed"></i> Crew${b.crew_auto ? '' : ' <span style="color:#fbbf24;font-size:10px">(override)</span>'}</td><td style="padding:8px 12px;text-align:right;color:#9ca3af">${b.crew_count} crew × ${b.crew_hours}h</td><td style="padding:8px 12px;text-align:right;color:#e5e7eb;font-family:monospace">${money(b.crew_cost)}</td></tr>
          <tr style="border-top:1px solid #21262d"><td style="padding:8px 12px;color:#e5e7eb"><i class="fas fa-truck" style="color:#06b6d4"></i> Vehicles${b.vehicle_auto ? '' : ' <span style="color:#fbbf24;font-size:10px">(override)</span>'}</td><td style="padding:8px 12px;text-align:right;color:#9ca3af">${b.vehicle_count} vehicle${b.vehicle_count === 1 ? '' : 's'}</td><td style="padding:8px 12px;text-align:right;color:#e5e7eb;font-family:monospace">${money(b.vehicle_cost)}</td></tr>
          <tr style="border-top:1px solid #21262d"><td style="padding:8px 12px;color:#e5e7eb"><i class="fas fa-triangle-exclamation" style="color:#ef4444"></i> Damages</td><td style="padding:8px 12px;text-align:right;color:#9ca3af">${b.damages_count} report${b.damages_count === 1 ? '' : 's'}</td><td style="padding:8px 12px;text-align:right;color:#e5e7eb;font-family:monospace">${money(b.damages_cost)}</td></tr>
          ${b.other_cost > 0 ? `<tr style="border-top:1px solid #21262d"><td style="padding:8px 12px;color:#e5e7eb"><i class="fas fa-ellipsis" style="color:#9ca3af"></i> Other</td><td style="padding:8px 12px;text-align:right;color:#9ca3af">—</td><td style="padding:8px 12px;text-align:right;color:#e5e7eb;font-family:monospace">${money(b.other_cost)}</td></tr>` : ''}
          <tr style="border-top:1px solid #21262d;background:#0d1117"><td style="padding:8px 12px;color:#C9A84C;font-weight:700">TOTAL</td><td></td><td style="padding:8px 12px;text-align:right;color:#C9A84C;font-family:monospace;font-weight:700;font-size:15px">${money(b.cost_total)}</td></tr>
        </tbody>
      </table>
    </div>

    <form method="POST" action="/admin/costs/${b.event_id}/overrides" class="card" style="padding:18px;margin-bottom:16px">
      <div style="font-size:13px;color:#e5e7eb;font-weight:700;margin-bottom:12px"><i class="fas fa-pen"></i> Override values (finance only)</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">
        <div><label style="display:block;font-size:11px;color:#9ca3af;text-transform:uppercase;margin-bottom:4px">Stock cost</label><input type="number" step="0.01" name="cost_stock" placeholder="(auto)" style="width:100%;background:#0d1117;color:#e5e7eb;border:1px solid #21262d;border-radius:6px;padding:8px 10px"></div>
        <div><label style="display:block;font-size:11px;color:#9ca3af;text-transform:uppercase;margin-bottom:4px">Fleet cost</label><input type="number" step="0.01" name="cost_fleet" placeholder="(auto)" style="width:100%;background:#0d1117;color:#e5e7eb;border:1px solid #21262d;border-radius:6px;padding:8px 10px"></div>
        <div><label style="display:block;font-size:11px;color:#9ca3af;text-transform:uppercase;margin-bottom:4px">Crew cost</label><input type="number" step="0.01" name="cost_crew" placeholder="(auto)" style="width:100%;background:#0d1117;color:#e5e7eb;border:1px solid #21262d;border-radius:6px;padding:8px 10px"></div>
        <div><label style="display:block;font-size:11px;color:#9ca3af;text-transform:uppercase;margin-bottom:4px">Other cost</label><input type="number" step="0.01" name="cost_other" placeholder="0" style="width:100%;background:#0d1117;color:#e5e7eb;border:1px solid #21262d;border-radius:6px;padding:8px 10px"></div>
        <div><label style="display:block;font-size:11px;color:#9ca3af;text-transform:uppercase;margin-bottom:4px">Revenue override</label><input type="number" step="0.01" name="revenue_override" placeholder="(use quote)" style="width:100%;background:#0d1117;color:#e5e7eb;border:1px solid #21262d;border-radius:6px;padding:8px 10px"></div>
      </div>
      <div style="margin-top:12px"><label style="display:block;font-size:11px;color:#9ca3af;text-transform:uppercase;margin-bottom:4px">Notes</label><textarea name="notes" rows="2" style="width:100%;background:#0d1117;color:#e5e7eb;border:1px solid #21262d;border-radius:6px;padding:8px 10px">${esc(b.notes || '')}</textarea></div>
      <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
        ${b.overrides_present ? `<button type="submit" name="action" value="clear" formaction="/admin/costs/${b.event_id}/overrides/clear" class="btn btn-outline" style="color:#ef4444;border-color:#ef4444"><i class="fas fa-eraser"></i> Clear overrides</button>` : ''}
        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Save overrides</button>
      </div>
    </form>
  `
  return c.html(layout(`Costs · ${b.event_name}`, body, user, 'stock-admin'))
})

costs.post('/:id/overrides', async (c) => {
  const user = c.get('user')
  const id = Number(c.req.param('id'))
  const form = await c.req.parseBody()
  const parse = (k: string): number | null => {
    const v = form[k]
    if (v === undefined || v === null || v === '') return null
    const n = Number(v)
    return isNaN(n) ? null : n
  }
  await saveEventOverrides(c.env.DB, id, {
    cost_stock:       parse('cost_stock'),
    cost_fleet:       parse('cost_fleet'),
    cost_crew:        parse('cost_crew'),
    cost_other:       parse('cost_other'),
    revenue_override: parse('revenue_override'),
    notes:            (form.notes as string) || null,
  }, { id: user.id, name: user.name || user.email })
  return c.redirect(`/admin/costs/${id}`)
})

costs.post('/:id/overrides/clear', async (c) => {
  const id = Number(c.req.param('id'))
  await clearEventOverrides(c.env.DB, id)
  return c.redirect(`/admin/costs/${id}`)
})

export default costs
