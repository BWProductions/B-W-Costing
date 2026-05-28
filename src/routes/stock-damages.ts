// ─────────────────────────────────────────────────────────────────────────
// Phase 11: Damages & Write-offs Register — UI routes
// Mounted under /admin/stock/damages
// ─────────────────────────────────────────────────────────────────────────

import { Hono } from 'hono'
import type { AuthUser } from '../lib/auth.js'
import { layout } from '../lib/layout.js'
import {
  listDamages,
  getDamage,
  getDamageStats,
  createDamage,
  approveDamage,
  writeOffDamage,
  recoverDamage,
  cancelDamage,
} from '../lib/damages.js'

type Bindings = { DB: D1Database }
type Variables = { user: AuthUser }
const damages = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// ─── helpers ─────────────────────────────────────────────────────────────

function esc(s: any): string {
  if (s === null || s === undefined) return ''
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function fmtDateTime(s: string | null | undefined): string {
  if (!s) return ''
  return String(s).replace('T', ' ').replace(/\.\d+Z?$/, '').slice(0, 16)
}

function moneyZAR(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  return `R ${Number(v).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function typeBadge(t: string): string {
  const map: Record<string, { c: string; label: string }> = {
    broken:       { c: '#f59e0b', label: 'BROKEN' },
    missing:      { c: '#ff7a66', label: 'MISSING' },
    lost_on_site: { c: '#ef4444', label: 'LOST ON SITE' },
  }
  const m = map[t] || { c: '#9ca3af', label: t.toUpperCase() }
  return `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;background:${m.c}22;color:${m.c};font-size:10px;font-weight:700;border:1px solid ${m.c}55">${m.label}</span>`
}

function statusBadge(s: string): string {
  const map: Record<string, { c: string; label: string }> = {
    open:        { c: '#f59e0b', label: 'OPEN' },
    approved:    { c: '#3b82f6', label: 'APPROVED' },
    written_off: { c: '#7c2d12', label: 'WRITTEN OFF' },
    recovered:   { c: '#10b981', label: 'RECOVERED' },
    cancelled:   { c: '#6b7280', label: 'CANCELLED' },
  }
  const m = map[s] || { c: '#9ca3af', label: s.toUpperCase() }
  return `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;background:${m.c}22;color:${m.c};font-size:11px;font-weight:700;border:1px solid ${m.c}55">${m.label}</span>`
}

// ─── Index page ──────────────────────────────────────────────────────────

damages.get('/', async (c) => {
  const user = c.get('user')
  const db = c.env.DB
  const status = c.req.query('status') || ''
  const type = c.req.query('type') || ''

  const stats = await getDamageStats(db)
  const items = await listDamages(db, { status: status || undefined, type: type || undefined, limit: 200 })

  const filterChip = (label: string, qs: string, active: boolean): string =>
    `<a href="/admin/stock/damages${qs}" class="btn btn-outline" style="font-size:11px;padding:4px 10px;${active ? 'background:#21262d;color:#C9A84C' : ''}">${esc(label)}</a>`

  const statCards = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px">
      <div class="card" style="padding:14px;border-left:3px solid #f59e0b">
        <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px">Open damages</div>
        <div style="font-size:28px;font-weight:700;color:#f59e0b">${stats.open_count}</div>
        <div style="font-size:11px;color:#9ca3af">${stats.open_units} units · ${moneyZAR(stats.open_value)}</div>
      </div>
      <div class="card" style="padding:14px;border-left:3px solid #3b82f6">
        <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px">Approved (pending write-off)</div>
        <div style="font-size:28px;font-weight:700;color:#3b82f6">${stats.approved_count}</div>
        <div style="font-size:11px;color:#9ca3af">${moneyZAR(stats.approved_value)}</div>
      </div>
      <div class="card" style="padding:14px;border-left:3px solid #7c2d12">
        <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px">Written off (30 days)</div>
        <div style="font-size:28px;font-weight:700;color:#9ca3af">${stats.writtenoff_30d_count}</div>
        <div style="font-size:11px;color:#9ca3af">${moneyZAR(stats.writtenoff_30d_value)}</div>
      </div>
    </div>
  `

  const byType = `
    <div class="card" style="padding:14px;margin-bottom:16px">
      <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Open & approved by type</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${(['broken','missing','lost_on_site']).map(t => {
          const s = stats.by_type[t] || { count: 0, units: 0 }
          return `<div style="background:#0d1117;border:1px solid #21262d;border-radius:8px;padding:10px 14px;min-width:140px">
            <div>${typeBadge(t)}</div>
            <div style="font-size:18px;font-weight:700;color:#e5e7eb;margin-top:6px">${s.count} report${s.count === 1 ? '' : 's'}</div>
            <div style="font-size:12px;color:#9ca3af">${s.units} units</div>
          </div>`
        }).join('')}
      </div>
    </div>
  `

  const filters = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center">
      <span style="font-size:11px;color:#9ca3af;text-transform:uppercase">Status:</span>
      ${filterChip('All', '', !status)}
      ${filterChip('Open', '?status=open', status === 'open')}
      ${filterChip('Approved', '?status=approved', status === 'approved')}
      ${filterChip('Written off', '?status=written_off', status === 'written_off')}
      ${filterChip('Recovered', '?status=recovered', status === 'recovered')}
      <span style="font-size:11px;color:#9ca3af;text-transform:uppercase;margin-left:12px">Type:</span>
      ${filterChip('All', status ? `?status=${status}` : '', !type)}
      ${filterChip('Broken', `?type=broken${status ? `&status=${status}` : ''}`, type === 'broken')}
      ${filterChip('Missing', `?type=missing${status ? `&status=${status}` : ''}`, type === 'missing')}
      ${filterChip('Lost', `?type=lost_on_site${status ? `&status=${status}` : ''}`, type === 'lost_on_site')}
    </div>
  `

  const table = items.length === 0
    ? `<div class="card" style="padding:24px;text-align:center;color:#9ca3af">No damages match this filter.</div>`
    : `
    <div class="card" style="padding:0;overflow:hidden">
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead style="background:#0d1117">
            <tr>
              <th style="text-align:left;padding:8px 10px;color:#9ca3af;font-size:11px;text-transform:uppercase">#</th>
              <th style="text-align:left;padding:8px 10px;color:#9ca3af;font-size:11px;text-transform:uppercase">Item</th>
              <th style="text-align:left;padding:8px 10px;color:#9ca3af;font-size:11px;text-transform:uppercase">Type</th>
              <th style="text-align:right;padding:8px 10px;color:#9ca3af;font-size:11px;text-transform:uppercase">Qty</th>
              <th style="text-align:left;padding:8px 10px;color:#9ca3af;font-size:11px;text-transform:uppercase">Cause</th>
              <th style="text-align:left;padding:8px 10px;color:#9ca3af;font-size:11px;text-transform:uppercase">Event</th>
              <th style="text-align:right;padding:8px 10px;color:#9ca3af;font-size:11px;text-transform:uppercase">Value</th>
              <th style="text-align:left;padding:8px 10px;color:#9ca3af;font-size:11px;text-transform:uppercase">Status</th>
              <th style="text-align:left;padding:8px 10px;color:#9ca3af;font-size:11px;text-transform:uppercase">Reported</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(d => `
              <tr style="border-top:1px solid #21262d">
                <td style="padding:6px 10px"><a href="/admin/stock/damages/${d.id}" style="color:#C9A84C;text-decoration:none;font-weight:700">#${d.id}</a></td>
                <td style="padding:6px 10px;color:#e5e7eb">
                  <a href="/admin/stock/${d.stock_item_id}" style="color:#e5e7eb;text-decoration:none">
                    ${esc(d.description || `item #${d.stock_item_id}`)}
                    ${d.brand ? `<div style="font-size:10px;color:#9ca3af">${esc(d.brand)}</div>` : ''}
                  </a>
                </td>
                <td style="padding:6px 10px">${typeBadge(d.damage_type)}</td>
                <td style="padding:6px 10px;text-align:right;color:#C9A84C;font-weight:700">${d.quantity}</td>
                <td style="padding:6px 10px;color:#9ca3af;font-size:11px;max-width:200px">${esc((d.cause || '').slice(0, 80))}${(d.cause && d.cause.length > 80) ? '…' : ''}</td>
                <td style="padding:6px 10px;color:#18D9FF;font-size:11px">${d.event_id ? `<a href="/calendar/${d.event_id}" style="color:#18D9FF;text-decoration:none">${esc(d.event_name || `#${d.event_id}`)}</a>` : '—'}</td>
                <td style="padding:6px 10px;text-align:right;color:#e5e7eb;font-family:monospace">${moneyZAR(d.total_value)}</td>
                <td style="padding:6px 10px">${statusBadge(d.status)}</td>
                <td style="padding:6px 10px;color:#9ca3af;font-size:11px">${esc(d.reported_by_name || '—')}<br><span style="color:#6b7280">${esc(fmtDateTime(d.created_at))}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `

  const body = `
    <div style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <div>
          <h1 style="margin:0;color:#C9A84C;font-size:24px"><i class="fas fa-triangle-exclamation"></i> Damages & Write-offs</h1>
          <div style="color:#9ca3af;font-size:13px;margin-top:4px">Broken, missing, and lost stock — tracked from incident through write-off</div>
        </div>
        <div style="display:flex;gap:8px"><a href="/admin/stock/damages/new" class="btn btn-primary"><i class="fas fa-plus"></i> Report damage</a><a href="/admin/stock" class="btn btn-outline"><i class="fas fa-arrow-left"></i> Back to Stock Admin</a></div>
      </div>
    </div>
    ${statCards}
    ${byType}
    ${filters}
    ${table}
  `
  return c.html(layout('Damages & Write-offs', body, user, 'stock-admin'))
})

// ─── New damage form ─────────────────────────────────────────────────────

damages.get('/new', async (c) => {
  const user = c.get('user')
  const presetItem = c.req.query('stock_item_id')

  // Fetch a small set of stock items for picker
  const stockRes = await c.env.DB.prepare(
    `SELECT id, brand, description, qty_on_hand FROM stock_items WHERE active = 1 ORDER BY brand, description LIMIT 1000`
  ).all<any>()
  const stockOpts = (stockRes.results || []).map((s: any) =>
    `<option value="${s.id}" ${String(s.id) === presetItem ? 'selected' : ''}>${esc(s.brand)} · ${esc(s.description)} (qty ${s.qty_on_hand})</option>`
  ).join('')

  const body = `
    <div style="margin-bottom:16px">
      <h1 style="margin:0;color:#C9A84C;font-size:22px"><i class="fas fa-triangle-exclamation"></i> Report damage</h1>
      <div style="color:#9ca3af;font-size:13px;margin-top:4px">Create a damage record. For broken stock, units stay owned but move to qty_damaged. Missing/lost reduce qty_on_hand immediately.</div>
    </div>

    <form method="POST" action="/admin/stock/damages/new" class="card" style="padding:18px;max-width:720px">
      <div style="margin-bottom:14px">
        <label style="display:block;font-size:11px;color:#9ca3af;text-transform:uppercase;margin-bottom:4px">Stock item *</label>
        <select name="stock_item_id" required class="form-select" style="width:100%;background:#0d1117;color:#e5e7eb;border:1px solid #21262d;border-radius:6px;padding:8px 10px">
          <option value="">— select stock item —</option>
          ${stockOpts}
        </select>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
        <div>
          <label style="display:block;font-size:11px;color:#9ca3af;text-transform:uppercase;margin-bottom:4px">Damage type *</label>
          <select name="damage_type" required class="form-select" style="width:100%;background:#0d1117;color:#e5e7eb;border:1px solid #21262d;border-radius:6px;padding:8px 10px">
            <option value="broken">Broken — physically damaged</option>
            <option value="missing">Missing — fate unknown</option>
            <option value="lost_on_site">Lost on site — confirmed left at venue/client</option>
          </select>
        </div>
        <div>
          <label style="display:block;font-size:11px;color:#9ca3af;text-transform:uppercase;margin-bottom:4px">Quantity *</label>
          <input type="number" name="quantity" min="1" required style="width:100%;background:#0d1117;color:#e5e7eb;border:1px solid #21262d;border-radius:6px;padding:8px 10px">
        </div>
      </div>
      <div style="margin-bottom:14px">
        <label style="display:block;font-size:11px;color:#9ca3af;text-transform:uppercase;margin-bottom:4px">Cause / description</label>
        <textarea name="cause" rows="3" placeholder="What happened?" style="width:100%;background:#0d1117;color:#e5e7eb;border:1px solid #21262d;border-radius:6px;padding:8px 10px;font-size:13px"></textarea>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
        <div>
          <label style="display:block;font-size:11px;color:#9ca3af;text-transform:uppercase;margin-bottom:4px">Event ID (optional)</label>
          <input type="number" name="event_id" placeholder="e.g. 123" style="width:100%;background:#0d1117;color:#e5e7eb;border:1px solid #21262d;border-radius:6px;padding:8px 10px">
        </div>
        <div>
          <label style="display:block;font-size:11px;color:#9ca3af;text-transform:uppercase;margin-bottom:4px">Unit value (ZAR)</label>
          <input type="number" step="0.01" name="unit_value" placeholder="e.g. 250.00" style="width:100%;background:#0d1117;color:#e5e7eb;border:1px solid #21262d;border-radius:6px;padding:8px 10px">
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <a href="/admin/stock/damages" class="btn btn-outline">Cancel</a>
        <button type="submit" class="btn btn-primary"><i class="fas fa-plus"></i> Create damage report</button>
      </div>
    </form>
  `
  return c.html(layout('Report damage', body, user, 'stock-admin'))
})

damages.post('/new', async (c) => {
  const user = c.get('user')
  const form = await c.req.parseBody()

  const stockItemId = Number(form.stock_item_id)
  const quantity = Number(form.quantity)
  const damageType = String(form.damage_type) as 'broken' | 'missing' | 'lost_on_site'
  const cause = String(form.cause || '')
  const eventId = form.event_id ? Number(form.event_id) : null
  const unitValue = form.unit_value ? Number(form.unit_value) : null

  if (!stockItemId || !quantity || !damageType) {
    return c.redirect('/admin/stock/damages/new')
  }

  try {
    const id = await createDamage(c.env.DB, {
      stock_item_id: stockItemId, quantity, damage_type: damageType,
      cause, event_id: eventId, unit_value: unitValue,
    }, { id: user.id, name: user.name || user.email })
    return c.redirect(`/admin/stock/damages/${id}`)
  } catch (e: any) {
    return c.html(layout('Create failed', `<div class="card" style="padding:24px"><h2 style="color:#ff7a66">Create failed</h2><p>${esc(e?.message)}</p><a href="/admin/stock/damages/new" class="btn btn-outline">Back</a></div>`, user, 'stock-admin'), 400)
  }
})

// ─── Single damage ──────────────────────────────────────────────────────

damages.get('/:id', async (c) => {
  const user = c.get('user')
  const id = Number(c.req.param('id'))
  const d = await getDamage(c.env.DB, id)
  if (!d) return c.html(layout('Damage not found', `<div class="card" style="padding:24px"><p>Damage report #${id} not found.</p><a href="/admin/stock/damages" class="btn btn-outline">Back</a></div>`, user, 'stock-admin'), 404)

  const actions = (() => {
    const buttons: string[] = []
    if (d.status === 'open') {
      buttons.push(`<form method="POST" action="/admin/stock/damages/${id}/approve" style="display:inline"><button class="btn btn-outline" style="color:#3b82f6;border-color:#3b82f6"><i class="fas fa-check"></i> Approve</button></form>`)
    }
    if (d.status === 'open' || d.status === 'approved') {
      buttons.push(`<form method="POST" action="/admin/stock/damages/${id}/writeoff" style="display:inline" onsubmit="return confirm('Write off this damage? This removes the units from the asset register permanently.')"><button class="btn btn-primary" style="background:#7c2d12;border-color:#7c2d12"><i class="fas fa-fire"></i> Write off</button></form>`)
      buttons.push(`<form method="POST" action="/admin/stock/damages/${id}/recover" style="display:inline"><button class="btn btn-outline" style="color:#10b981;border-color:#10b981"><i class="fas fa-rotate-left"></i> Recovered</button></form>`)
      buttons.push(`<form method="POST" action="/admin/stock/damages/${id}/cancel" style="display:inline" onsubmit="return confirm('Cancel this damage report? Stock quantities will be restored.')"><button class="btn btn-outline" style="color:#ff7a66;border-color:#ff7a66"><i class="fas fa-xmark"></i> Cancel</button></form>`)
    }
    return buttons.join(' ')
  })()

  const body = `
    <div style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">
        <div>
          <h1 style="margin:0;color:#C9A84C;font-size:22px"><i class="fas fa-triangle-exclamation"></i> Damage #${d.id} ${statusBadge(d.status)}</h1>
          <div style="color:#9ca3af;font-size:13px;margin-top:4px">
            ${typeBadge(d.damage_type)} ·
            <a href="/admin/stock/${d.stock_item_id}" style="color:#e5e7eb;text-decoration:none">${esc(d.description || `item #${d.stock_item_id}`)}</a>
            ${d.brand ? `<span style="color:#9ca3af"> (${esc(d.brand)})</span>` : ''}
          </div>
        </div>
        <a href="/admin/stock/damages" class="btn btn-outline"><i class="fas fa-arrow-left"></i> All damages</a>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:16px">
      <div class="card" style="padding:10px"><div style="font-size:10px;color:#9ca3af;text-transform:uppercase">Quantity</div><div style="font-size:22px;font-weight:700;color:#C9A84C">${d.quantity}</div></div>
      <div class="card" style="padding:10px"><div style="font-size:10px;color:#9ca3af;text-transform:uppercase">Unit value</div><div style="font-size:22px;font-weight:700;color:#e5e7eb">${moneyZAR(d.unit_value)}</div></div>
      <div class="card" style="padding:10px"><div style="font-size:10px;color:#9ca3af;text-transform:uppercase">Total value</div><div style="font-size:22px;font-weight:700;color:#7c2d12">${moneyZAR(d.total_value)}</div></div>
    </div>

    <div class="card" style="padding:18px;margin-bottom:16px">
      <div style="margin-bottom:10px"><strong style="color:#9ca3af;font-size:11px;text-transform:uppercase">Cause</strong><div style="color:#e5e7eb;margin-top:4px">${esc(d.cause || '—')}</div></div>
      ${d.event_id ? `<div style="margin-bottom:10px"><strong style="color:#9ca3af;font-size:11px;text-transform:uppercase">Event</strong><div><a href="/calendar/${d.event_id}" style="color:#18D9FF;text-decoration:none">${esc(d.event_name || `Event #${d.event_id}`)}</a></div></div>` : ''}
      ${d.return_id ? `<div style="margin-bottom:10px"><strong style="color:#9ca3af;font-size:11px;text-transform:uppercase">Linked return</strong><div><a href="/admin/stock/returns/${d.return_id}" style="color:#C9A84C;text-decoration:none">Return #${d.return_id}</a></div></div>` : ''}
      ${d.resolution_notes ? `<div><strong style="color:#9ca3af;font-size:11px;text-transform:uppercase">Resolution notes</strong><div style="color:#e5e7eb;margin-top:4px">${esc(d.resolution_notes)}</div></div>` : ''}
    </div>

    <div class="card" style="padding:14px;margin-bottom:16px">
      <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;margin-bottom:8px">Timeline</div>
      <div style="color:#e5e7eb;font-size:13px;line-height:1.8">
        Created by ${esc(d.reported_by_name || '—')} on ${esc(fmtDateTime(d.created_at))}<br>
        ${d.approved_at ? `Approved on ${esc(fmtDateTime(d.approved_at))}<br>` : ''}
        ${d.written_off_at ? `Written off on ${esc(fmtDateTime(d.written_off_at))}<br>` : ''}
      </div>
    </div>

    <div style="display:flex;gap:8px;flex-wrap:wrap">${actions}</div>
  `

  return c.html(layout(`Damage #${d.id}`, body, user, 'stock-admin'))
})

// ─── State transition routes ─────────────────────────────────────────────

damages.post('/:id/approve', async (c) => {
  const user = c.get('user'); const id = Number(c.req.param('id'))
  try { await approveDamage(c.env.DB, id, { id: user.id, name: user.name || user.email }) } catch {}
  return c.redirect(`/admin/stock/damages/${id}`)
})

damages.post('/:id/writeoff', async (c) => {
  const user = c.get('user'); const id = Number(c.req.param('id'))
  try { await writeOffDamage(c.env.DB, id, { id: user.id, name: user.name || user.email }) } catch {}
  return c.redirect(`/admin/stock/damages/${id}`)
})

damages.post('/:id/recover', async (c) => {
  const user = c.get('user'); const id = Number(c.req.param('id'))
  try { await recoverDamage(c.env.DB, id, { id: user.id, name: user.name || user.email }) } catch {}
  return c.redirect(`/admin/stock/damages/${id}`)
})

damages.post('/:id/cancel', async (c) => {
  const user = c.get('user'); const id = Number(c.req.param('id'))
  try { await cancelDamage(c.env.DB, id, { id: user.id, name: user.name || user.email }) } catch {}
  return c.redirect(`/admin/stock/damages/${id}`)
})

export default damages
