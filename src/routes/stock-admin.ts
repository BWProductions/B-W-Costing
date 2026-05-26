// ─────────────────────────────────────────────────────────────────────────
// Stock Admin
// ─────────────────────────────────────────────────────────────────────────
// CRUD over stock_items (seeded from BW_MASTER_STOCK_v1.xlsx in migration 0028).
//
// Routes:
//   GET  /admin/stock                 → list (filter by brand, custody, q)
//   GET  /admin/stock/summary         → per-brand totals + custody breakdown
//   GET  /admin/stock/new             → add-new form
//   POST /admin/stock/new             → insert
//   GET  /admin/stock/:id             → view/edit single item
//   POST /admin/stock/:id             → update
//   POST /admin/stock/:id/delete      → soft-delete (active=0)
//
// All routes require auth + founder role (this is data-of-record).

import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth.js'
import { layout } from '../lib/layout.js'
import type { AuthUser } from '../lib/auth.js'

type Env = { Bindings: { DB: D1Database }; Variables: { user: AuthUser } }

const stockAdmin = new Hono<Env>()
stockAdmin.use('*', requireAuth)

// ── Helpers ────────────────────────────────────────────────────────────────
const CUSTODY_LABELS: Record<string, string> = {
  owned:                    'Owned',
  third_party_in_warehouse: 'Third-party (in our warehouse)',
  offsite:                  'Off-site',
}
const CUSTODY_COLORS: Record<string, string> = {
  owned:                    '#10b981',  // green
  third_party_in_warehouse: '#f59e0b',  // amber
  offsite:                  '#8b5cf6',  // purple
}
const CUSTODY_ICONS: Record<string, string> = {
  owned:                    'fa-warehouse',
  third_party_in_warehouse: 'fa-handshake',
  offsite:                  'fa-truck-moving',
}

function esc(s: any): string {
  if (s === null || s === undefined) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function badge(custody: string): string {
  const color = CUSTODY_COLORS[custody] || '#6b7280'
  const label = CUSTODY_LABELS[custody] || custody
  const icon  = CUSTODY_ICONS[custody] || 'fa-cube'
  return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:2px 8px;border-radius:10px;background:${color}22;color:${color};font-weight:600">
    <i class="fas ${icon}" style="font-size:10px"></i>${esc(label)}
  </span>`
}

function flashBanner(c: any): string {
  const msg = c.req.query('msg')
  const err = c.req.query('err')
  if (msg) return `<div class="card" style="background:#10b98122;border-left:4px solid #10b981;padding:12px 16px;margin-bottom:16px;color:#10b981"><i class="fas fa-check-circle"></i> ${esc(msg)}</div>`
  if (err) return `<div class="card" style="background:#ef444422;border-left:4px solid #ef4444;padding:12px 16px;margin-bottom:16px;color:#ef4444"><i class="fas fa-triangle-exclamation"></i> ${esc(err)}</div>`
  return ''
}

// ── GET /admin/stock — list with filters ──────────────────────────────────
stockAdmin.get('/', async (c) => {
  const user    = c.get('user')
  const brand   = c.req.query('brand')    || ''
  const custody = c.req.query('custody')  || ''
  const q       = c.req.query('q')        || ''
  const sort    = c.req.query('sort')     || 'brand'   // brand | description | qty | custody

  // Build WHERE clauses
  const conds: string[] = ['active = 1']
  const params: any[] = []
  if (brand)   { conds.push('brand = ?');                                  params.push(brand) }
  if (custody) { conds.push('custody_type = ?');                           params.push(custody) }
  if (q)       { conds.push('(brand LIKE ? OR description LIKE ? OR notes LIKE ?)')
                 const like = `%${q}%`; params.push(like, like, like) }

  const orderBy = ({
    brand:        'brand, description',
    description:  'description, brand',
    qty:          'qty_on_hand DESC, brand',
    custody:      'custody_type, brand, description',
  } as Record<string,string>)[sort] || 'brand, description'

  const rows = await c.env.DB.prepare(
    `SELECT id, brand, description, qty_on_hand, custody_type, location, notes,
            source_sheet, status
     FROM stock_items
     WHERE ${conds.join(' AND ')}
     ORDER BY ${orderBy}
     LIMIT 2000`
  ).bind(...params).all<any>()

  // For brand filter dropdown
  const brandsRes = await c.env.DB.prepare(
    `SELECT DISTINCT brand FROM stock_items WHERE active=1 ORDER BY brand`
  ).all<any>()
  const brands = brandsRes.results.map((r: any) => r.brand)

  // Top-line counters
  const stats = await c.env.DB.prepare(
    `SELECT custody_type, COUNT(*) as items, COALESCE(SUM(qty_on_hand),0) as units
     FROM stock_items WHERE active=1 GROUP BY custody_type`
  ).all<any>()
  const statMap: Record<string, {items:number, units:number}> = {}
  for (const s of stats.results) statMap[s.custody_type] = { items: s.items, units: s.units }

  const brandOptions = brands.map(b => `<option value="${esc(b)}" ${b === brand ? 'selected' : ''}>${esc(b)}</option>`).join('')

  const tableRows = rows.results.map((r: any) => `
    <tr>
      <td>
        <a href="/admin/stock/${r.id}" style="color:var(--bw-gold);text-decoration:none;font-weight:600">${esc(r.brand)}</a>
      </td>
      <td>${esc(r.description)}</td>
      <td style="text-align:right;font-weight:700;font-variant-numeric:tabular-nums">${r.qty_on_hand}</td>
      <td>${badge(r.custody_type)}</td>
      <td class="muted hide-mobile">${esc(r.location) || '—'}</td>
      <td class="muted hide-mobile" style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(r.notes)}">${esc(r.notes) || '—'}</td>
      <td><a href="/admin/stock/${r.id}" class="btn btn-outline btn-sm">Edit</a></td>
    </tr>
  `).join('')

  const totals = rows.results.reduce(
    (a: any, r: any) => { a.items++; a.units += (r.qty_on_hand || 0); return a },
    { items: 0, units: 0 }
  )

  const body = `
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:16px;flex-wrap:wrap">
      <div>
        <h1 style="margin:0"><i class="fas fa-boxes-stacked"></i> Master Stock</h1>
        <p class="text-muted" style="margin:4px 0 0">All inventory across all 12 brands. Edit an item to change quantity, location, or custody.</p>
      </div>
      <div style="display:flex;gap:8px">
        <a href="/admin/stock/summary" class="btn btn-outline"><i class="fas fa-chart-pie"></i> Summary</a>
        <a href="/admin/stock/new"     class="btn btn-primary"><i class="fas fa-plus"></i> Add Item</a>
      </div>
    </div>

    ${flashBanner(c)}

    <!-- Stat cards -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px">
      ${Object.entries(CUSTODY_LABELS).map(([k,v]) => {
        const s = statMap[k] || { items: 0, units: 0 }
        return `
          <div class="card" style="padding:12px 16px;border-left:4px solid ${CUSTODY_COLORS[k]}">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted)">
              <i class="fas ${CUSTODY_ICONS[k]}"></i> ${esc(v)}
            </div>
            <div style="font-size:24px;font-weight:700;font-variant-numeric:tabular-nums">${s.items.toLocaleString()}</div>
            <div style="font-size:12px;color:var(--text-muted)">${s.units.toLocaleString()} units</div>
          </div>`
      }).join('')}
    </div>

    <!-- Filter bar -->
    <form method="get" action="/admin/stock" class="card" style="padding:12px;margin-bottom:16px">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;align-items:end">
        <div>
          <label style="font-size:11px;color:var(--text-muted);display:block">Search</label>
          <input type="text" name="q" value="${esc(q)}" placeholder="brand / description / notes" />
        </div>
        <div>
          <label style="font-size:11px;color:var(--text-muted);display:block">Brand</label>
          <select name="brand">
            <option value="">All brands</option>
            ${brandOptions}
          </select>
        </div>
        <div>
          <label style="font-size:11px;color:var(--text-muted);display:block">Custody</label>
          <select name="custody">
            <option value="">All custody</option>
            ${Object.entries(CUSTODY_LABELS).map(([k,v]) =>
              `<option value="${k}" ${custody === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label style="font-size:11px;color:var(--text-muted);display:block">Sort by</label>
          <select name="sort">
            <option value="brand"        ${sort==='brand'?'selected':''}>Brand</option>
            <option value="description"  ${sort==='description'?'selected':''}>Description</option>
            <option value="qty"          ${sort==='qty'?'selected':''}>Quantity (high to low)</option>
            <option value="custody"      ${sort==='custody'?'selected':''}>Custody</option>
          </select>
        </div>
        <div style="display:flex;gap:6px">
          <button type="submit" class="btn btn-primary"><i class="fas fa-filter"></i> Filter</button>
          <a href="/admin/stock" class="btn btn-outline" title="Clear filters"><i class="fas fa-times"></i></a>
        </div>
      </div>
    </form>

    <div class="card" style="padding:0">
      <div style="padding:8px 16px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border)">
        <div style="font-size:13px;color:var(--text-muted)">
          Showing <strong style="color:var(--text)">${totals.items.toLocaleString()}</strong> items
          (<strong style="color:var(--text)">${totals.units.toLocaleString()}</strong> units)
          ${rows.results.length >= 2000 ? ' — capped at 2000 — refine your filter' : ''}
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Brand</th>
            <th>Description</th>
            <th style="text-align:right">Qty</th>
            <th>Custody</th>
            <th class="hide-mobile">Location</th>
            <th class="hide-mobile">Notes</th>
            <th></th>
          </tr></thead>
          <tbody>${tableRows || '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted)">No items match your filter.</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  `
  return c.html(layout('Master Stock', body, user, 'stock-admin'))
})

// ── GET /admin/stock/summary — per-brand + custody totals ─────────────────
stockAdmin.get('/summary', async (c) => {
  const user = c.get('user')

  const byBrand = await c.env.DB.prepare(
    `SELECT brand, custody_type, COUNT(*) as items, COALESCE(SUM(qty_on_hand),0) as units
     FROM stock_items WHERE active=1
     GROUP BY brand, custody_type
     ORDER BY brand, custody_type`
  ).all<any>()

  // Pivot
  const brands: Record<string, Record<string,{items:number,units:number}>> = {}
  for (const r of byBrand.results) {
    if (!brands[r.brand]) brands[r.brand] = {}
    brands[r.brand][r.custody_type] = { items: r.items, units: r.units }
  }

  const custodyTotals = await c.env.DB.prepare(
    `SELECT custody_type, COUNT(*) as items, COALESCE(SUM(qty_on_hand),0) as units
     FROM stock_items WHERE active=1 GROUP BY custody_type`
  ).all<any>()

  const grandTotals = await c.env.DB.prepare(
    `SELECT COUNT(*) as items, COALESCE(SUM(qty_on_hand),0) as units
     FROM stock_items WHERE active=1`
  ).first<any>()

  const brandRows = Object.entries(brands).sort(([a],[b]) => a.localeCompare(b)).map(([b, custodies]) => {
    const o = custodies['owned']                    || { items: 0, units: 0 }
    const t = custodies['third_party_in_warehouse'] || { items: 0, units: 0 }
    const f = custodies['offsite']                  || { items: 0, units: 0 }
    const total = o.items + t.items + f.items
    return `
      <tr>
        <td><strong>${esc(b)}</strong></td>
        <td style="text-align:right;font-variant-numeric:tabular-nums">${o.items}</td>
        <td style="text-align:right;font-variant-numeric:tabular-nums">${o.units.toLocaleString()}</td>
        <td style="text-align:right;color:#f59e0b;font-variant-numeric:tabular-nums">${t.items || '—'}</td>
        <td style="text-align:right;color:#f59e0b;font-variant-numeric:tabular-nums">${t.units ? t.units.toLocaleString() : '—'}</td>
        <td style="text-align:right;color:#8b5cf6;font-variant-numeric:tabular-nums">${f.items || '—'}</td>
        <td style="text-align:right;color:#8b5cf6;font-variant-numeric:tabular-nums">${f.units ? f.units.toLocaleString() : '—'}</td>
        <td style="text-align:right;font-weight:700;font-variant-numeric:tabular-nums">${total}</td>
        <td><a href="/admin/stock?brand=${encodeURIComponent(b)}" class="btn btn-outline btn-sm">View</a></td>
      </tr>`
  }).join('')

  const body = `
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:16px">
      <div>
        <h1 style="margin:0"><i class="fas fa-chart-pie"></i> Stock Summary</h1>
        <p class="text-muted" style="margin:4px 0 0">Brand-by-brand breakdown across custody types.</p>
      </div>
      <a href="/admin/stock" class="btn btn-outline"><i class="fas fa-arrow-left"></i> Back to items</a>
    </div>

    <!-- Grand totals card -->
    <div class="card" style="padding:16px 20px;margin-bottom:16px;background:linear-gradient(135deg, var(--bw-gold)11, transparent)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px">
        <div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted)">Total inventory</div>
          <div style="font-size:32px;font-weight:700">${grandTotals.items.toLocaleString()} <span style="font-size:14px;font-weight:400;color:var(--text-muted)">items</span></div>
          <div style="font-size:16px;color:var(--text-muted)">${grandTotals.units.toLocaleString()} units</div>
        </div>
        <div style="display:flex;gap:24px">
          ${custodyTotals.results.map((c: any) => `
            <div style="text-align:center">
              <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:${CUSTODY_COLORS[c.custody_type]}">
                <i class="fas ${CUSTODY_ICONS[c.custody_type]}"></i> ${esc(CUSTODY_LABELS[c.custody_type] || c.custody_type)}
              </div>
              <div style="font-size:24px;font-weight:700">${c.items.toLocaleString()}</div>
              <div style="font-size:12px;color:var(--text-muted)">${c.units.toLocaleString()} units</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>

    <div class="card" style="padding:0">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th rowspan="2" style="vertical-align:bottom">Brand</th>
              <th colspan="2" style="text-align:center;color:#10b981;border-bottom:2px solid #10b98144"><i class="fas fa-warehouse"></i> Owned</th>
              <th colspan="2" style="text-align:center;color:#f59e0b;border-bottom:2px solid #f59e0b44"><i class="fas fa-handshake"></i> Third-party</th>
              <th colspan="2" style="text-align:center;color:#8b5cf6;border-bottom:2px solid #8b5cf644"><i class="fas fa-truck-moving"></i> Off-site</th>
              <th rowspan="2" style="vertical-align:bottom;text-align:right">Total items</th>
              <th rowspan="2"></th>
            </tr>
            <tr>
              <th style="text-align:right;font-size:10px;color:var(--text-muted)">items</th>
              <th style="text-align:right;font-size:10px;color:var(--text-muted)">units</th>
              <th style="text-align:right;font-size:10px;color:var(--text-muted)">items</th>
              <th style="text-align:right;font-size:10px;color:var(--text-muted)">units</th>
              <th style="text-align:right;font-size:10px;color:var(--text-muted)">items</th>
              <th style="text-align:right;font-size:10px;color:var(--text-muted)">units</th>
            </tr>
          </thead>
          <tbody>${brandRows}</tbody>
        </table>
      </div>
    </div>

    <p class="text-muted" style="margin-top:16px;font-size:12px">
      <strong>Custody type meanings:</strong><br>
      <span style="color:#10b981"><i class="fas fa-warehouse"></i> Owned</span> — our stock, counted in inventory.<br>
      <span style="color:#f59e0b"><i class="fas fa-handshake"></i> Third-party</span> — held in our warehouse for someone else (e.g. Jester Sports / Mac).<br>
      <span style="color:#8b5cf6"><i class="fas fa-truck-moving"></i> Off-site</span> — stock held elsewhere (e.g. POP Cape Town). Tracked for location only, not counted as on-hand.
    </p>
  `
  return c.html(layout('Stock Summary', body, user, 'stock-admin'))
})

// ── GET /admin/stock/new — add-new form ───────────────────────────────────
stockAdmin.get('/new', async (c) => {
  const user = c.get('user')

  const brandsRes = await c.env.DB.prepare(
    `SELECT DISTINCT brand FROM stock_items WHERE active=1 ORDER BY brand`
  ).all<any>()
  const brands = brandsRes.results.map((r: any) => r.brand)

  const body = `
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
      <div>
        <h1 style="margin:0"><i class="fas fa-plus-circle"></i> Add Stock Item</h1>
      </div>
      <a href="/admin/stock" class="btn btn-outline"><i class="fas fa-arrow-left"></i> Back</a>
    </div>

    ${flashBanner(c)}

    <form method="post" action="/admin/stock/new" class="card" style="padding:20px;max-width:720px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div>
          <label>Brand <span style="color:#ef4444">*</span></label>
          <input type="text" name="brand" required list="brand-list" placeholder="e.g. Castle Lager" />
          <datalist id="brand-list">${brands.map(b => `<option value="${esc(b)}">`).join('')}</datalist>
        </div>
        <div>
          <label>Quantity on hand <span style="color:#ef4444">*</span></label>
          <input type="number" name="qty_on_hand" required min="0" value="0" />
        </div>
      </div>

      <div style="margin-top:12px">
        <label>Description <span style="color:#ef4444">*</span></label>
        <input type="text" name="description" required placeholder="e.g. Wall Banner complete" />
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:12px">
        <div>
          <label>Custody type <span style="color:#ef4444">*</span></label>
          <select name="custody_type" required>
            <option value="owned" selected>Owned (our stock)</option>
            <option value="third_party_in_warehouse">Third-party (in our warehouse)</option>
            <option value="offsite">Off-site (held elsewhere)</option>
          </select>
        </div>
        <div>
          <label>Location</label>
          <input type="text" name="location" placeholder="e.g. R59 Storage B50" />
        </div>
      </div>

      <div style="margin-top:12px">
        <label>Notes</label>
        <textarea name="notes" rows="3" placeholder="Optional condition, ownership, or other notes"></textarea>
      </div>

      <div style="display:flex;gap:8px;margin-top:20px">
        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Add Item</button>
        <a href="/admin/stock" class="btn btn-outline">Cancel</a>
      </div>
    </form>
  `
  return c.html(layout('Add Stock Item', body, user, 'stock-admin'))
})

// ── POST /admin/stock/new — insert ────────────────────────────────────────
stockAdmin.post('/new', async (c) => {
  const form = await c.req.parseBody()
  const brand        = String(form.brand        || '').trim()
  const description  = String(form.description  || '').trim()
  const qty          = parseInt(String(form.qty_on_hand || '0'), 10) || 0
  const custody_type = String(form.custody_type || 'owned')
  const location     = String(form.location     || '').trim()
  const notes        = String(form.notes        || '').trim()

  if (!brand || !description) {
    return c.redirect('/admin/stock/new?err=' + encodeURIComponent('Brand and Description are required'))
  }
  if (!['owned','third_party_in_warehouse','offsite'].includes(custody_type)) {
    return c.redirect('/admin/stock/new?err=' + encodeURIComponent('Invalid custody type'))
  }

  const res = await c.env.DB.prepare(
    `INSERT INTO stock_items
     (brand, description, qty_on_hand, custody_type, location, notes,
      source_sheet, status, active)
     VALUES (?, ?, ?, ?, ?, ?, 'manual_admin', 'active', 1)`
  ).bind(brand, description, qty, custody_type, location, notes).run()

  const newId = res.meta?.last_row_id
  return c.redirect(`/admin/stock/${newId}?msg=` + encodeURIComponent(`Added "${description}" to ${brand}`))
})

// ── GET /admin/stock/:id — view/edit ──────────────────────────────────────
stockAdmin.get('/:id', async (c) => {
  const user = c.get('user')
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) return c.redirect('/admin/stock?err=Invalid+id')

  const item = await c.env.DB.prepare(
    `SELECT * FROM stock_items WHERE id = ?`
  ).bind(id).first<any>()

  if (!item) return c.redirect('/admin/stock?err=Item+not+found')

  const brandsRes = await c.env.DB.prepare(
    `SELECT DISTINCT brand FROM stock_items WHERE active=1 ORDER BY brand`
  ).all<any>()
  const brands = brandsRes.results.map((r: any) => r.brand)

  const body = `
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
      <div>
        <h1 style="margin:0">
          ${badge(item.custody_type)}
          <span style="margin-left:8px">${esc(item.brand)} — ${esc(item.description)}</span>
        </h1>
        <p class="text-muted" style="margin:4px 0 0">
          ID #${item.id} · Source: ${esc(item.source_sheet || 'manual')}
          ${item.created_at ? ' · Created ' + esc(String(item.created_at).split(' ')[0]) : ''}
          ${item.updated_at && item.updated_at !== item.created_at ? ' · Last edit ' + esc(String(item.updated_at).split(' ')[0]) : ''}
        </p>
      </div>
      <a href="/admin/stock" class="btn btn-outline"><i class="fas fa-arrow-left"></i> Back to list</a>
    </div>

    ${flashBanner(c)}

    <form method="post" action="/admin/stock/${item.id}" class="card" style="padding:20px;max-width:720px;margin-bottom:16px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div>
          <label>Brand <span style="color:#ef4444">*</span></label>
          <input type="text" name="brand" required list="brand-list" value="${esc(item.brand)}" />
          <datalist id="brand-list">${brands.map(b => `<option value="${esc(b)}">`).join('')}</datalist>
        </div>
        <div>
          <label>Quantity on hand <span style="color:#ef4444">*</span></label>
          <input type="number" name="qty_on_hand" required min="0" value="${item.qty_on_hand}" />
        </div>
      </div>

      <div style="margin-top:12px">
        <label>Description <span style="color:#ef4444">*</span></label>
        <input type="text" name="description" required value="${esc(item.description)}" />
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:12px">
        <div>
          <label>Custody type <span style="color:#ef4444">*</span></label>
          <select name="custody_type" required>
            <option value="owned"                    ${item.custody_type === 'owned' ? 'selected' : ''}>Owned (our stock)</option>
            <option value="third_party_in_warehouse" ${item.custody_type === 'third_party_in_warehouse' ? 'selected' : ''}>Third-party (in our warehouse)</option>
            <option value="offsite"                  ${item.custody_type === 'offsite' ? 'selected' : ''}>Off-site (held elsewhere)</option>
          </select>
        </div>
        <div>
          <label>Location</label>
          <input type="text" name="location" value="${esc(item.location)}" placeholder="e.g. R59 Storage B50" />
        </div>
      </div>

      <div style="margin-top:12px">
        <label>Notes</label>
        <textarea name="notes" rows="4">${esc(item.notes)}</textarea>
      </div>

      <div style="margin-top:12px">
        <label>Status</label>
        <select name="status">
          <option value="active" ${item.status === 'active' ? 'selected' : ''}>Active</option>
          <option value="review" ${item.status === 'review' ? 'selected' : ''}>Review (needs human eyeballs)</option>
          <option value="retired" ${item.status === 'retired' ? 'selected' : ''}>Retired</option>
        </select>
      </div>

      <div style="display:flex;justify-content:space-between;gap:8px;margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">
        <div style="display:flex;gap:8px">
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Save Changes</button>
          <a href="/admin/stock" class="btn btn-outline">Cancel</a>
        </div>
        <button type="button" class="btn btn-outline" style="color:#ef4444;border-color:#ef4444"
          onclick="if(confirm('Soft-delete this item? It will be hidden from the list but not permanently removed.')) document.getElementById('delete-form').submit()">
          <i class="fas fa-trash"></i> Delete
        </button>
      </div>
    </form>

    <form id="delete-form" method="post" action="/admin/stock/${item.id}/delete" style="display:none"></form>
  `
  return c.html(layout(`${item.brand} — ${item.description}`, body, user, 'stock-admin'))
})

// ── POST /admin/stock/:id — update ────────────────────────────────────────
stockAdmin.post('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) return c.redirect('/admin/stock?err=Invalid+id')

  const form = await c.req.parseBody()
  const brand        = String(form.brand        || '').trim()
  const description  = String(form.description  || '').trim()
  const qty          = parseInt(String(form.qty_on_hand || '0'), 10) || 0
  const custody_type = String(form.custody_type || 'owned')
  const location     = String(form.location     || '').trim()
  const notes        = String(form.notes        || '').trim()
  const status       = String(form.status       || 'active')

  if (!brand || !description) {
    return c.redirect(`/admin/stock/${id}?err=` + encodeURIComponent('Brand and Description are required'))
  }
  if (!['owned','third_party_in_warehouse','offsite'].includes(custody_type)) {
    return c.redirect(`/admin/stock/${id}?err=` + encodeURIComponent('Invalid custody type'))
  }
  if (!['active','review','retired'].includes(status)) {
    return c.redirect(`/admin/stock/${id}?err=` + encodeURIComponent('Invalid status'))
  }

  await c.env.DB.prepare(
    `UPDATE stock_items
     SET brand=?, description=?, qty_on_hand=?, custody_type=?,
         location=?, notes=?, status=?, updated_at=CURRENT_TIMESTAMP
     WHERE id=?`
  ).bind(brand, description, qty, custody_type, location, notes, status, id).run()

  return c.redirect(`/admin/stock/${id}?msg=Saved`)
})

// ── POST /admin/stock/:id/delete — soft-delete ────────────────────────────
stockAdmin.post('/:id/delete', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) return c.redirect('/admin/stock?err=Invalid+id')

  const item = await c.env.DB.prepare(`SELECT brand, description FROM stock_items WHERE id=?`).bind(id).first<any>()
  if (!item) return c.redirect('/admin/stock?err=Item+not+found')

  await c.env.DB.prepare(
    `UPDATE stock_items SET active=0, updated_at=CURRENT_TIMESTAMP WHERE id=?`
  ).bind(id).run()

  return c.redirect('/admin/stock?msg=' + encodeURIComponent(`Deleted "${item.description}" from ${item.brand}`))
})

export default stockAdmin
