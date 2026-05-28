// ─────────────────────────────────────────────────────────────────────────
// Stock Admin
// ─────────────────────────────────────────────────────────────────────────
// CRUD over stock_items (seeded from BW_MASTER_STOCK_v1.xlsx in migration 0028).
//
// Routes:
//   GET  /admin/stock                    → list (filter by brand, custody, q)
//   GET  /admin/stock/summary            → per-brand totals + custody breakdown
//   GET  /admin/stock/export.csv         → CSV export honoring same filters
//   GET  /admin/stock/movements          → global audit log
//   GET  /admin/stock/new                → add-new form
//   POST /admin/stock/new                → insert
//   POST /admin/stock/bulk               → bulk update (custody/status/qty/delete)
//   GET  /admin/stock/:id                → view/edit single item
//   POST /admin/stock/:id                → update
//   GET  /admin/stock/:id/history        → per-item movement history
//   POST /admin/stock/:id/delete         → soft-delete (active=0)
//
// All routes require auth + founder/ops_director role.

import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth.js'
import { layout } from '../lib/layout.js'
import type { AuthUser } from '../lib/auth.js'
import stockScan from './stock-scan.js'
import stockAlerts from './stock-alerts.js'
import stockBulkImport from './stock-bulk-import.js'
import {
  countOpenShortages, listOpenShortages, listRecentResolvedShortages,
  resolveShortage, reopenShortage, getCommitmentsForItem,
  SHORTAGE_RESOLUTIONS,
} from '../lib/allocations.js'

type Env = { Bindings: { DB: D1Database; RESEND_API_KEY?: string }; Variables: { user: AuthUser } }

const stockAdmin = new Hono<Env>()
stockAdmin.use('*', requireAuth)

// Phase 4: stock-take scan mode — mounted under /admin/stock/scan
// Phase 5: low-stock alerts        — mounted under /admin/stock/alerts
// Phase 6: bulk CSV import         — mounted under /admin/stock/import
// Auth middleware above covers all three. Mounted FIRST so /:id below doesn't swallow them.
stockAdmin.route('/scan', stockScan)
stockAdmin.route('/alerts', stockAlerts)
stockAdmin.route('/import', stockBulkImport)

// ── Helpers ────────────────────────────────────────────────────────────────
const CUSTODY_LABELS: Record<string, string> = {
  owned:                    'Owned',
  third_party_in_warehouse: 'Third-party (in our warehouse)',
  offsite:                  'Off-site',
}
const CUSTODY_COLORS: Record<string, string> = {
  owned:                    '#10b981',
  third_party_in_warehouse: '#f59e0b',
  offsite:                  '#8b5cf6',
}
const CUSTODY_ICONS: Record<string, string> = {
  owned:                    'fa-warehouse',
  third_party_in_warehouse: 'fa-handshake',
  offsite:                  'fa-truck-moving',
}

const ACTION_LABELS: Record<string, string> = {
  create:      'Created',
  update:      'Updated',
  delete:      'Deleted',
  restore:     'Restored',
  bulk_update: 'Bulk update',
  stocktake:   'Stock-take',
  bulk_import: 'Bulk import',
  bulk_import_undo: 'Bulk undo',
  allocate:    'Allocated',
  deallocate:  'De-allocated',
}
const ACTION_COLORS: Record<string, string> = {
  create:      '#10b981',
  update:      '#3b82f6',
  delete:      '#ef4444',
  restore:     '#8b5cf6',
  bulk_update: '#f59e0b',
  stocktake:   '#06b6d4',
  bulk_import: '#a855f7',
  bulk_import_undo: '#dc2626',
  allocate:    '#0ea5e9',
  deallocate:  '#64748b',
}
const ACTION_ICONS: Record<string, string> = {
  create:      'fa-plus-circle',
  update:      'fa-pen',
  delete:      'fa-trash',
  restore:     'fa-rotate-left',
  bulk_update: 'fa-layer-group',
  stocktake:   'fa-clipboard-check',
  bulk_import: 'fa-file-import',
  bulk_import_undo: 'fa-rotate-left',
  allocate:    'fa-calendar-check',
  deallocate:  'fa-calendar-xmark',
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

function actionBadge(action: string): string {
  const color = ACTION_COLORS[action] || '#6b7280'
  const label = ACTION_LABELS[action] || action
  const icon  = ACTION_ICONS[action] || 'fa-circle'
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

// CSV-safe quote: wrap in "..." and double any internal quotes
function csvCell(v: any): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

// Log one or more changes against a stock item. Cheap fire-and-forget pattern.
async function logMovement(
  c: any,
  stockItemId: number,
  action: string,
  field: string | null,
  oldValue: any,
  newValue: any,
  reason: string | null = null,
): Promise<void> {
  const user: AuthUser | undefined = c.get('user')
  let delta: number | null = null
  if (field === 'qty_on_hand') {
    const o = parseInt(String(oldValue ?? '0'), 10)
    const n = parseInt(String(newValue ?? '0'), 10)
    if (Number.isFinite(o) && Number.isFinite(n)) delta = n - o
  }
  await c.env.DB.prepare(
    `INSERT INTO stock_movements
     (stock_item_id, action, field_changed, old_value, new_value, delta, reason, user_id, user_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    stockItemId,
    action,
    field,
    oldValue === null || oldValue === undefined ? null : String(oldValue),
    newValue === null || newValue === undefined ? null : String(newValue),
    delta,
    reason,
    user?.id ?? null,
    user?.name ?? null,
  ).run()
}

// Compare two row snapshots and log every field that changed.
async function logDiffs(
  c: any,
  stockItemId: number,
  before: Record<string, any>,
  after: Record<string, any>,
  fields: string[],
  reason: string | null = null,
): Promise<number> {
  let changed = 0
  for (const f of fields) {
    const b = before[f]
    const a = after[f]
    // Normalize for comparison (treat '' and null the same)
    const bs = (b === null || b === undefined) ? '' : String(b)
    const as = (a === null || a === undefined) ? '' : String(a)
    if (bs !== as) {
      await logMovement(c, stockItemId, 'update', f, b, a, reason)
      changed++
    }
  }
  return changed
}

// ── GET /admin/stock — list with filters ──────────────────────────────────
stockAdmin.get('/', async (c) => {
  const user    = c.get('user')
  const brand   = c.req.query('brand')    || ''
  const custody = c.req.query('custody')  || ''
  const q       = c.req.query('q')        || ''
  const sort    = c.req.query('sort')     || 'brand'
  // show=active (default) | deleted | all  — controls the active-flag filter
  const show    = (c.req.query('show')    || 'active').toLowerCase()

  const conds: string[] = []
  if (show === 'deleted')      conds.push('active = 0')
  else if (show !== 'all')     conds.push('active = 1')  // default = active only
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

  // Edge case: with no conds at all (which can only happen if a future change
  // adds a path that empties conds), SQL would fail with "WHERE ". Inject 1=1.
  const whereClause = conds.length ? conds.join(' AND ') : '1=1'

  const rows = await c.env.DB.prepare(
    `SELECT id, brand, description, qty_on_hand, custody_type, location, notes,
            source_sheet, status, active
     FROM stock_items
     WHERE ${whereClause}
     ORDER BY ${orderBy}
     LIMIT 2000`
  ).bind(...params).all<any>()

  const brandsRes = await c.env.DB.prepare(
    `SELECT DISTINCT brand FROM stock_items WHERE active=1 ORDER BY brand`
  ).all<any>()
  const brands = brandsRes.results.map((r: any) => r.brand)

  // Count of soft-deleted items — drives the visibility of the "Show deleted" link
  const deletedCountRow = await c.env.DB.prepare(
    `SELECT COUNT(*) as n FROM stock_items WHERE active=0`
  ).first<any>()
  const deletedCount = deletedCountRow?.n || 0

  const stats = await c.env.DB.prepare(
    `SELECT custody_type, COUNT(*) as items, COALESCE(SUM(qty_on_hand),0) as units
     FROM stock_items WHERE active=1 GROUP BY custody_type`
  ).all<any>()
  const statMap: Record<string, {items:number, units:number}> = {}
  for (const s of stats.results) statMap[s.custody_type] = { items: s.items, units: s.units }

  // Phase 5: live count of items currently triggering an alert (for header badge)
  const today = new Date().toISOString().slice(0, 10)
  const alertCountRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM stock_items
     WHERE active = 1
       AND COALESCE(low_stock_threshold, 5) > 0
       AND qty_on_hand <= COALESCE(low_stock_threshold, 5)
       AND (alert_snoozed_until IS NULL OR alert_snoozed_until < ?)`
  ).bind(today).first<{ n: number }>()
  const alertCount = alertCountRow?.n ?? 0

  // Phase 7: count of open shortages for header badge
  const shortageCount = await countOpenShortages(c.env.DB)

  const brandOptions = brands.map(b => `<option value="${esc(b)}" ${b === brand ? 'selected' : ''}>${esc(b)}</option>`).join('')

  // Preserve current filters in CSV export URL (note: CSV always exports active)
  const qs = new URLSearchParams()
  if (brand)   qs.set('brand', brand)
  if (custody) qs.set('custody', custody)
  if (q)       qs.set('q', q)
  if (sort)    qs.set('sort', sort)
  if (show && show !== 'active') qs.set('show', show)
  const csvHref = `/admin/stock/export.csv${qs.toString() ? '?' + qs.toString() : ''}`

  const tableRows = rows.results.map((r: any) => {
    const deleted = r.active === 0
    const rowStyle = deleted ? 'opacity:0.55;background:rgba(239,68,68,0.04)' : ''
    // IMPORTANT: HTML forbids nested <form>. The table is inside the bulk-form,
    // so the Restore button uses the HTML5 form="restore-form-{id}" attribute
    // to bind to an external form that we render AFTER </form> of bulk-form.
    const actionCell = deleted
      ? `<button type="submit" form="restore-form-${r.id}" class="btn btn-sm"
                 style="background:#10b981;color:#000;border-color:#10b981;cursor:pointer"
                 title="Undelete this item"
                 onclick="return confirm('Restore this item to active stock?')">
           <i class="fas fa-rotate-left"></i> Restore
         </button>`
      : `<a href="/admin/stock/${r.id}" class="btn btn-outline btn-sm">Edit</a>`
    const brandLink = deleted
      ? `<span style="color:#ef4444;text-decoration:line-through;font-weight:600" title="Soft-deleted — click Restore to recover">${esc(r.brand)}</span>`
      : `<a href="/admin/stock/${r.id}" style="color:var(--bw-gold);text-decoration:none;font-weight:600">${esc(r.brand)}</a>`
    return `
    <tr data-id="${r.id}" style="${rowStyle}">
      <td style="width:32px">${deleted ? '' : `<input type="checkbox" class="row-check" value="${r.id}" />`}</td>
      <td>${brandLink}</td>
      <td>${esc(r.description)}${deleted ? ' <span style="font-size:10px;background:#ef4444;color:#fff;padding:1px 6px;border-radius:3px;margin-left:6px;text-transform:uppercase;letter-spacing:0.5px">deleted</span>' : ''}</td>
      <td style="text-align:right;font-weight:700;font-variant-numeric:tabular-nums">${r.qty_on_hand}</td>
      <td>${badge(r.custody_type)}</td>
      <td class="muted hide-mobile">${esc(r.location) || '—'}</td>
      <td class="muted hide-mobile" style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(r.notes)}">${esc(r.notes) || '—'}</td>
      <td>${actionCell}</td>
    </tr>`
  }).join('')

  // Restore forms — one per deleted item — rendered OUTSIDE the bulk-form
  // (nested <form> is invalid HTML and browsers silently drop the inner one).
  // The submit buttons in the table reference these via the form="..." attribute.
  const restoreForms = rows.results
    .filter((r: any) => r.active === 0)
    .map((r: any) => `<form id="restore-form-${r.id}" method="post" action="/admin/stock/${r.id}/restore" style="display:none"></form>`)
    .join('')

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
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <a href="/admin/stock/alerts"    class="btn btn-outline" style="${alertCount > 0 ? 'color:#dc2626;border-color:#dc2626' : 'color:#10b981;border-color:#10b981'}">
          <i class="fas fa-bell"></i> Alerts${alertCount > 0 ? ` <span style="display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;background:#dc2626;color:#fff;border-radius:9px;font-size:11px;font-weight:700;margin-left:4px">${alertCount}</span>` : ''}
        </a>
        <a href="/admin/stock/scan"      class="btn btn-outline" style="color:#06b6d4;border-color:#06b6d4"><i class="fas fa-barcode"></i> Stock-take</a>
        <a href="/admin/stock/import"    class="btn btn-outline" style="color:#a855f7;border-color:#a855f7"><i class="fas fa-file-import"></i> Bulk Import</a>
        <a href="/admin/brands"          class="btn btn-outline" style="color:#C9A84C;border-color:#C9A84C"><i class="fas fa-tags"></i> Brands</a>
        <a href="/admin/stock/shortages" class="btn btn-outline" style="${shortageCount > 0 ? 'color:#ff7a66;border-color:#ff7a66' : 'color:#9ca3af;border-color:#9ca3af'}">
          <i class="fas fa-triangle-exclamation"></i> Shortages${shortageCount > 0 ? ` <span style="display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;background:#ff7a66;color:#1a1004;border-radius:9px;font-size:11px;font-weight:700;margin-left:4px">${shortageCount}</span>` : ''}
        </a>
        <a href="/admin/stock/movements" class="btn btn-outline"><i class="fas fa-clock-rotate-left"></i> Movements</a>
        <a href="/admin/stock/summary"   class="btn btn-outline"><i class="fas fa-chart-pie"></i> Summary</a>
        <a href="${csvHref}"             class="btn btn-outline"><i class="fas fa-file-csv"></i> Export CSV</a>
        <a href="/admin/stock/new"       class="btn btn-primary"><i class="fas fa-plus"></i> Add Item</a>
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

    <!-- Bulk action form wraps the table -->
    <form id="bulk-form" method="post" action="/admin/stock/bulk">
      <div class="card" style="padding:0">
        <div style="padding:8px 16px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border);flex-wrap:wrap;gap:8px">
          <div style="font-size:13px;color:var(--text-muted)">
            Showing <strong style="color:var(--text)">${totals.items.toLocaleString()}</strong> ${show === 'deleted' ? '<span style="color:#ef4444;font-weight:600">deleted</span>' : show === 'all' ? '<span style="color:var(--bw-gold);font-weight:600">total</span>' : ''} items
            (<strong style="color:var(--text)">${totals.units.toLocaleString()}</strong> units)
            ${rows.results.length >= 2000 ? ' — capped at 2000 — refine your filter' : ''}
            <span id="selected-count" style="margin-left:12px;color:var(--bw-gold);display:none">
              · <strong id="selected-n">0</strong> selected
            </span>
          </div>
          <div style="font-size:12px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            ${show === 'active'  ? '<span style="color:var(--text-muted)">Active only</span>' : `<a href="/admin/stock${(() => { const p = new URLSearchParams(qs); p.delete('show'); return p.toString() ? '?' + p.toString() : '' })()}" style="color:var(--bw-gold)">Active only</a>`}
            ·
            ${show === 'deleted' ? `<span style="color:#ef4444;font-weight:600">Deleted (${deletedCount})</span>` : `<a href="/admin/stock${(() => { const p = new URLSearchParams(qs); p.set('show','deleted'); return '?' + p.toString() })()}" style="color:${deletedCount > 0 ? '#ef4444' : 'var(--text-muted)'}">Deleted${deletedCount > 0 ? ` (${deletedCount})` : ''}</a>`}
            ·
            ${show === 'all'     ? '<span style="color:var(--bw-gold);font-weight:600">All</span>' : `<a href="/admin/stock${(() => { const p = new URLSearchParams(qs); p.set('show','all'); return '?' + p.toString() })()}" style="color:var(--text-muted)">All</a>`}
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th style="width:32px"><input type="checkbox" id="check-all" title="Select all" /></th>
              <th>Brand</th>
              <th>Description</th>
              <th style="text-align:right">Qty</th>
              <th>Custody</th>
              <th class="hide-mobile">Location</th>
              <th class="hide-mobile">Notes</th>
              <th></th>
            </tr></thead>
            <tbody>${tableRows || '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-muted)">No items match your filter.</td></tr>'}</tbody>
          </table>
        </div>
      </div>

      <!-- Floating bulk action bar -->
      <div id="bulk-bar" style="position:sticky;bottom:0;margin-top:12px;background:var(--bg);border:1px solid var(--bw-gold);border-radius:8px;padding:12px 16px;display:none;box-shadow:0 -4px 12px rgba(0,0,0,0.3)">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <strong style="color:var(--bw-gold)"><i class="fas fa-layer-group"></i> Bulk action on <span id="bulk-n">0</span> items:</strong>

          <select name="bulk_action" id="bulk-action" required style="min-width:200px">
            <option value="">— choose action —</option>
            <option value="set_custody">Set custody type to…</option>
            <option value="set_status">Set status to…</option>
            <option value="adjust_qty">Adjust quantity by (±)</option>
            <option value="set_qty">Set quantity to…</option>
            <option value="delete">Soft-delete (hide)</option>
          </select>

          <select name="bulk_custody" id="bulk-custody" style="display:none">
            <option value="owned">Owned</option>
            <option value="third_party_in_warehouse">Third-party (in our warehouse)</option>
            <option value="offsite">Off-site</option>
          </select>

          <select name="bulk_status" id="bulk-status" style="display:none">
            <option value="active">Active</option>
            <option value="review">Review</option>
            <option value="retired">Retired</option>
          </select>

          <input type="number" name="bulk_qty_delta" id="bulk-qty-delta" placeholder="e.g. -5 or 10" style="display:none;width:140px" />
          <input type="number" name="bulk_qty_set"   id="bulk-qty-set"   placeholder="new qty"      style="display:none;width:140px" min="0" />

          <input type="text" name="bulk_reason" placeholder="Reason (optional)" style="flex:1;min-width:160px" />

          <button type="submit" class="btn btn-primary"><i class="fas fa-check"></i> Apply</button>
          <button type="button" class="btn btn-outline" onclick="clearSelection()">Cancel</button>
        </div>
        <input type="hidden" name="ids" id="bulk-ids" />
        <input type="hidden" name="return_qs" value="${esc(qs.toString())}" />
      </div>
    </form>

    ${restoreForms}

    <script>
      (function() {
        const checkAll  = document.getElementById('check-all')
        const rowChecks = () => document.querySelectorAll('.row-check')
        const bulkBar   = document.getElementById('bulk-bar')
        const bulkN     = document.getElementById('bulk-n')
        const selCount  = document.getElementById('selected-count')
        const selN      = document.getElementById('selected-n')
        const bulkIds   = document.getElementById('bulk-ids')
        const action    = document.getElementById('bulk-action')
        const inputs = {
          set_custody: 'bulk-custody',
          set_status:  'bulk-status',
          adjust_qty:  'bulk-qty-delta',
          set_qty:     'bulk-qty-set',
        }

        function updateBulk() {
          const checked = Array.from(rowChecks()).filter(c => c.checked)
          const ids = checked.map(c => c.value)
          bulkIds.value = ids.join(',')
          bulkN.textContent = ids.length
          selN.textContent  = ids.length
          if (ids.length) {
            bulkBar.style.display  = 'block'
            selCount.style.display = 'inline'
          } else {
            bulkBar.style.display  = 'none'
            selCount.style.display = 'none'
          }
        }

        function clearSelection() {
          rowChecks().forEach(c => c.checked = false)
          checkAll.checked = false
          updateBulk()
        }
        window.clearSelection = clearSelection

        checkAll && checkAll.addEventListener('change', () => {
          rowChecks().forEach(c => c.checked = checkAll.checked)
          updateBulk()
        })
        document.addEventListener('change', (e) => {
          if (e.target && e.target.classList && e.target.classList.contains('row-check')) updateBulk()
        })

        action.addEventListener('change', () => {
          // Hide all conditional inputs first
          Object.values(inputs).forEach(id => {
            const el = document.getElementById(id)
            if (el) { el.style.display = 'none'; el.required = false }
          })
          const targetId = inputs[action.value]
          if (targetId) {
            const el = document.getElementById(targetId)
            if (el) { el.style.display = 'inline-block'; el.required = true }
          }
        })

        document.getElementById('bulk-form').addEventListener('submit', (e) => {
          if (!bulkIds.value) { e.preventDefault(); alert('No items selected'); return }
          if (!action.value)  { e.preventDefault(); alert('Choose an action'); return }
          if (action.value === 'delete') {
            if (!confirm('Soft-delete ' + bulkN.textContent + ' items? They will be hidden but recoverable from the audit log.')) {
              e.preventDefault()
            }
          }
        })
      })()
    </script>
  `
  return c.html(layout('Master Stock', body, user, 'stock-admin'))
})

// ── GET /admin/stock/export.csv — download filtered list ──────────────────
// Registered BEFORE /:id so it doesn't get caught as an id param.
stockAdmin.get('/export.csv', async (c) => {
  const brand   = c.req.query('brand')    || ''
  const custody = c.req.query('custody')  || ''
  const q       = c.req.query('q')        || ''
  const sort    = c.req.query('sort')     || 'brand'

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
            source_sheet, status, created_at, updated_at
     FROM stock_items
     WHERE ${conds.join(' AND ')}
     ORDER BY ${orderBy}`
  ).bind(...params).all<any>()

  const headers = ['id','brand','description','qty_on_hand','custody_type','location','notes','source_sheet','status','created_at','updated_at']
  const lines: string[] = [headers.join(',')]
  for (const r of rows.results) {
    lines.push(headers.map(h => csvCell((r as any)[h])).join(','))
  }
  // BOM for Excel UTF-8 compatibility
  const csv = '\uFEFF' + lines.join('\r\n') + '\r\n'

  const ts = new Date().toISOString().slice(0,10)
  const tag = [brand, custody, q].filter(Boolean).join('_').replace(/[^a-z0-9_-]/gi,'_').slice(0,40)
  const filename = `bw_stock_${ts}${tag ? '_' + tag : ''}.csv`

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
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

// ── GET /admin/stock/movements.csv — download filtered audit log ─────────
// MUST be registered BEFORE /movements so the literal path wins over the
// broader /movements handler. Also before /:id so it isn't caught as a param.
stockAdmin.get('/movements.csv', async (c) => {
  const action = c.req.query('action') || ''
  const itemQ  = c.req.query('item')   || ''
  const userQ  = c.req.query('user')   || ''

  const conds: string[] = ['1=1']
  const params: any[] = []
  if (action) { conds.push('m.action = ?');     params.push(action) }
  if (itemQ)  { conds.push('(s.brand LIKE ? OR s.description LIKE ?)'); params.push(`%${itemQ}%`, `%${itemQ}%`) }
  if (userQ)  { conds.push('m.user_name LIKE ?'); params.push(`%${userQ}%`) }

  // No LIMIT — audit log exports need full coverage of filtered set.
  // Practical safety net at 50,000 rows (~10MB CSV — comfortable for Excel).
  const rows = await c.env.DB.prepare(
    `SELECT m.id, m.created_at, m.action, m.stock_item_id,
            m.field_changed, m.old_value, m.new_value, m.delta,
            m.reason, m.user_id, m.user_name,
            s.brand, s.description
     FROM stock_movements m
     LEFT JOIN stock_items s ON s.id = m.stock_item_id
     WHERE ${conds.join(' AND ')}
     ORDER BY m.created_at DESC, m.id DESC
     LIMIT 50000`
  ).bind(...params).all<any>()

  // 13 columns — analyst-friendly: timestamps first, who/what/why last
  const headers = [
    'id','created_at','action','stock_item_id','brand','description',
    'field_changed','old_value','new_value','delta','reason','user_id','user_name'
  ]
  const lines: string[] = [headers.join(',')]
  for (const r of rows.results) {
    lines.push(headers.map(h => csvCell((r as any)[h])).join(','))
  }
  // BOM for Excel UTF-8 compatibility (matches stock CSV export)
  const csv = '\uFEFF' + lines.join('\r\n') + '\r\n'

  const ts = new Date().toISOString().slice(0,10)
  const tag = [action, itemQ, userQ].filter(Boolean).join('_').replace(/[^a-z0-9_-]/gi,'_').slice(0,40)
  const filename = `bw_movements_${ts}${tag ? '_' + tag : ''}.csv`

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
})

// ── GET /admin/stock/movements — global audit log ─────────────────────────
stockAdmin.get('/movements', async (c) => {
  const user   = c.get('user')
  const action = c.req.query('action') || ''
  const itemQ  = c.req.query('item')   || ''
  const userQ  = c.req.query('user')   || ''

  const conds: string[] = ['1=1']
  const params: any[] = []
  if (action) { conds.push('m.action = ?');     params.push(action) }
  if (itemQ)  { conds.push('(s.brand LIKE ? OR s.description LIKE ?)'); params.push(`%${itemQ}%`, `%${itemQ}%`) }
  if (userQ)  { conds.push('m.user_name LIKE ?'); params.push(`%${userQ}%`) }

  const rows = await c.env.DB.prepare(
    `SELECT m.id, m.stock_item_id, m.action, m.field_changed,
            m.old_value, m.new_value, m.delta, m.reason,
            m.user_name, m.created_at,
            s.brand, s.description
     FROM stock_movements m
     LEFT JOIN stock_items s ON s.id = m.stock_item_id
     WHERE ${conds.join(' AND ')}
     ORDER BY m.created_at DESC, m.id DESC
     LIMIT 500`
  ).bind(...params).all<any>()

  const tableRows = rows.results.map((r: any) => {
    const itemLink = r.brand
      ? `<a href="/admin/stock/${r.stock_item_id}" style="color:var(--bw-gold);text-decoration:none">${esc(r.brand)} — ${esc(r.description)}</a>`
      : `<span class="muted">#${r.stock_item_id} (deleted)</span>`
    const delta = (r.delta !== null && r.delta !== undefined)
      ? `<strong style="color:${r.delta >= 0 ? '#10b981' : '#ef4444'}">${r.delta >= 0 ? '+' : ''}${r.delta}</strong>`
      : ''
    const change = r.field_changed
      ? `<code style="font-size:11px;background:var(--surface);padding:1px 6px;border-radius:4px">${esc(r.field_changed)}</code>
         <span class="muted" style="font-size:11px">${esc(String(r.old_value ?? '').slice(0,30))}</span>
         <span style="color:var(--text-muted)">→</span>
         <span style="font-size:11px">${esc(String(r.new_value ?? '').slice(0,30))}</span>
         ${delta ? ' ' + delta : ''}`
      : ''
    return `
      <tr>
        <td class="muted" style="font-size:11px;white-space:nowrap">${esc(String(r.created_at).replace('T',' ').slice(0,16))}</td>
        <td>${actionBadge(r.action)}</td>
        <td>${itemLink}</td>
        <td>${change}</td>
        <td class="muted" style="font-size:11px">${esc(r.reason) || ''}</td>
        <td class="muted" style="font-size:11px;white-space:nowrap">${esc(r.user_name) || '—'}</td>
        <td>${r.stock_item_id ? `<a href="/admin/stock/${r.stock_item_id}/history" class="btn btn-outline btn-sm" title="Item history">↳</a>` : ''}</td>
      </tr>`
  }).join('')

  // Build CSV export URL that respects current filters
  const csvQs = new URLSearchParams()
  if (action) csvQs.set('action', action)
  if (itemQ)  csvQs.set('item', itemQ)
  if (userQ)  csvQs.set('user', userQ)
  const csvHref = `/admin/stock/movements.csv${csvQs.toString() ? '?' + csvQs.toString() : ''}`
  const filterActive = !!(action || itemQ || userQ)

  const body = `
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:16px;flex-wrap:wrap">
      <div>
        <h1 style="margin:0"><i class="fas fa-clock-rotate-left"></i> Stock Movements</h1>
        <p class="text-muted" style="margin:4px 0 0">Audit trail of every change. Showing most recent 500 entries on screen; export captures up to 50,000.</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <a href="${csvHref}" class="btn btn-outline" title="${filterActive ? 'Export filtered audit log' : 'Export full audit log'}"><i class="fas fa-file-csv"></i> Export CSV${filterActive ? ' (filtered)' : ''}</a>
        <a href="/admin/stock" class="btn btn-outline"><i class="fas fa-arrow-left"></i> Back to stock</a>
      </div>
    </div>

    <form method="get" action="/admin/stock/movements" class="card" style="padding:12px;margin-bottom:16px">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;align-items:end">
        <div>
          <label style="font-size:11px;color:var(--text-muted);display:block">Item search</label>
          <input type="text" name="item" value="${esc(itemQ)}" placeholder="brand or description" />
        </div>
        <div>
          <label style="font-size:11px;color:var(--text-muted);display:block">Action</label>
          <select name="action">
            <option value="">All actions</option>
            ${Object.entries(ACTION_LABELS).map(([k,v]) =>
              `<option value="${k}" ${action===k?'selected':''}>${esc(v)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label style="font-size:11px;color:var(--text-muted);display:block">User</label>
          <input type="text" name="user" value="${esc(userQ)}" placeholder="user name" />
        </div>
        <div style="display:flex;gap:6px">
          <button type="submit" class="btn btn-primary"><i class="fas fa-filter"></i> Filter</button>
          <a href="/admin/stock/movements" class="btn btn-outline" title="Clear"><i class="fas fa-times"></i></a>
        </div>
      </div>
    </form>

    <div class="card" style="padding:0">
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>When</th>
            <th>Action</th>
            <th>Item</th>
            <th>Change</th>
            <th>Reason</th>
            <th>User</th>
            <th></th>
          </tr></thead>
          <tbody>${tableRows || '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted)">No movements yet.</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  `
  return c.html(layout('Stock Movements', body, user, 'stock-admin'))
})

// ─────────────────────────────────────────────────────────────────────────
// Phase 7: Shortages dashboard + per-item allocations view
// Registered BEFORE /:id so literal paths win.
// ─────────────────────────────────────────────────────────────────────────

// ── GET /admin/stock/shortages — open shortages dashboard ─────────────────
stockAdmin.get('/shortages', async (c) => {
  const user = c.get('user')
  const open = await listOpenShortages(c.env.DB)
  const resolved = await listRecentResolvedShortages(c.env.DB, 30)

  const renderResolutionLabel = (r: string | null) => {
    if (!r) return '—'
    const map: Record<string, string> = {
      sub_rental: 'Sub-rental',
      fix_by_event: 'Fix-by-event',
      override: 'Override',
      cancelled: 'Cancelled',
      self_resolved: 'Self-resolved',
    }
    return map[r] || r
  }
  const resolutionBadge = (r: string | null) => {
    const colors: Record<string, string> = {
      sub_rental: '#0ea5e9', fix_by_event: '#10b981',
      override: '#f59e0b', cancelled: '#6b7280', self_resolved: '#10b981',
    }
    const bg = r ? (colors[r] || '#6b7280') : '#dc2626'
    return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:${bg};color:#fff;font-size:11px;font-weight:700">${esc(renderResolutionLabel(r))}</span>`
  }

  const openRows = open.length === 0 ? `<tr><td colspan="7" style="padding:30px;text-align:center;opacity:0.6">🎉 No open shortages right now.</td></tr>`
    : open.map(s => /*html*/ `
      <tr style="border-top:1px solid rgba(255,255,255,0.06)">
        <td style="padding:10px 12px;white-space:nowrap">${esc(s.event_date)}</td>
        <td style="padding:10px 12px"><a href="/calendar/event/${s.event_id}" style="color:inherit;text-decoration:underline">${esc(s.event_name)}</a></td>
        <td style="padding:10px 12px"><a href="/admin/stock/${s.stock_item_id}" style="color:inherit;text-decoration:underline">${esc(s.brand)} — ${esc(s.description)}</a></td>
        <td style="padding:10px 12px;font-family:monospace;text-align:right;color:#ff7a66;font-weight:700">${s.quantity_short}</td>
        <td style="padding:10px 12px;font-family:monospace;text-align:right;opacity:0.7">${s.qty_on_hand}</td>
        <td style="padding:10px 12px">${esc(s.notes || '')}</td>
        <td style="padding:10px 12px;text-align:right">
          <form method="post" action="/admin/stock/shortages/${s.id}/resolve" style="display:inline-flex;gap:4px;align-items:center">
            <select name="resolution" style="padding:4px 6px;border-radius:4px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.15);color:inherit;font-size:12px">
              <option value="sub_rental">Sub-rental</option>
              <option value="fix_by_event">Fix-by-event</option>
              <option value="override">Override</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <input type="text" name="notes" placeholder="notes…" style="padding:4px 6px;border-radius:4px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.15);color:inherit;font-size:12px;width:140px">
            <button type="submit" class="btn" style="padding:4px 10px;font-size:12px;background:#10b981;color:#fff;border:none">Resolve</button>
          </form>
        </td>
      </tr>
    `).join('')

  const resolvedRows = resolved.length === 0 ? '' : resolved.map(s => /*html*/ `
    <tr style="border-top:1px solid rgba(255,255,255,0.06);opacity:0.85">
      <td style="padding:8px 12px;white-space:nowrap;font-size:12px">${esc(s.event_date)}</td>
      <td style="padding:8px 12px;font-size:12px"><a href="/calendar/event/${s.event_id}" style="color:inherit;text-decoration:underline">${esc(s.event_name)}</a></td>
      <td style="padding:8px 12px;font-size:12px"><a href="/admin/stock/${s.stock_item_id}" style="color:inherit;text-decoration:underline">${esc(s.brand)} — ${esc(s.description)}</a></td>
      <td style="padding:8px 12px;font-family:monospace;text-align:right;font-size:12px">${s.quantity_short}</td>
      <td style="padding:8px 12px;font-size:12px">${resolutionBadge(s.resolution)}</td>
      <td style="padding:8px 12px;font-size:12px;white-space:nowrap;opacity:0.7">${esc((s.resolved_at || '').replace('T', ' ').replace(/\.\d+Z?$/, ''))}</td>
      <td style="padding:8px 12px;font-size:12px;opacity:0.7">${esc(s.notes || '')}</td>
      <td style="padding:8px 12px;text-align:right">
        <form method="post" action="/admin/stock/shortages/${s.id}/reopen" style="display:inline">
          <button type="submit" class="btn" style="padding:3px 9px;font-size:11px;background:transparent;border:1px solid rgba(255,255,255,0.2);color:inherit">Reopen</button>
        </form>
      </td>
    </tr>
  `).join('')

  const body = /*html*/ `
    <div style="max-width:1400px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;flex-wrap:wrap;gap:12px">
        <h1 style="margin:0">⚠ Stock Shortages</h1>
        <a href="/admin/stock" class="btn btn-outline"><i class="fas fa-arrow-left"></i> Back to stock</a>
      </div>

      <div style="background:rgba(255,122,102,0.08);border:1px solid rgba(255,122,102,0.3);border-radius:8px;padding:14px;margin-bottom:20px;font-size:13px;line-height:1.6">
        <strong style="color:#ff7a66">How shortages work:</strong> when you commit more units of an owned item than you have, a shortage row is auto-created. Resolve each one:
        <strong>Sub-rental</strong> = sub-renting in to cover, <strong>Fix-by-event</strong> = will be returned/repaired in time, <strong>Override</strong> = no fix coming, just acknowledging, <strong>Cancelled</strong> = event cancelled or item swapped out.
        Shortages that disappear on their own (e.g. you removed an equipment line) are auto-flagged <em>self-resolved</em>.
      </div>

      <h2 style="font-size:17px;margin:18px 0 8px 0;color:#ff7a66">Open (${open.length})</h2>
      <div style="overflow-x:auto;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:8px">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead style="background:rgba(255,255,255,0.05)">
            <tr>
              <th style="text-align:left;padding:10px 12px">Event date</th>
              <th style="text-align:left;padding:10px 12px">Event</th>
              <th style="text-align:left;padding:10px 12px">Item</th>
              <th style="text-align:right;padding:10px 12px">Short by</th>
              <th style="text-align:right;padding:10px 12px">On hand</th>
              <th style="text-align:left;padding:10px 12px">Notes</th>
              <th style="text-align:right;padding:10px 12px">Resolve</th>
            </tr>
          </thead>
          <tbody>${openRows}</tbody>
        </table>
      </div>

      ${resolved.length > 0 ? `
      <h2 style="font-size:17px;margin:24px 0 8px 0;opacity:0.85">Recently resolved (${resolved.length})</h2>
      <div style="overflow-x:auto;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:8px">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead style="background:rgba(255,255,255,0.05)">
            <tr>
              <th style="text-align:left;padding:8px 12px">Event date</th>
              <th style="text-align:left;padding:8px 12px">Event</th>
              <th style="text-align:left;padding:8px 12px">Item</th>
              <th style="text-align:right;padding:8px 12px">Short</th>
              <th style="text-align:left;padding:8px 12px">Resolution</th>
              <th style="text-align:left;padding:8px 12px">When</th>
              <th style="text-align:left;padding:8px 12px">Notes</th>
              <th style="text-align:right;padding:8px 12px"></th>
            </tr>
          </thead>
          <tbody>${resolvedRows}</tbody>
        </table>
      </div>` : ''}
    </div>
  `
  return c.html(layout('Shortages — Stock Admin', body, user, 'stock-admin'))
})

// ── POST /admin/stock/shortages/:id/resolve ───────────────────────────────
stockAdmin.post('/shortages/:id/resolve', async (c) => {
  const user = c.get('user')
  const id = parseInt(c.req.param('id'), 10)
  if (!Number.isFinite(id)) return c.notFound()
  const form = await c.req.parseBody()
  const resolution = String(form.resolution || '').trim() as any
  const notes = (String(form.notes || '').trim() || null) as string | null
  if (!SHORTAGE_RESOLUTIONS.includes(resolution)) {
    return c.redirect('/admin/stock/shortages', 303)
  }
  await resolveShortage(c.env.DB, id, resolution, notes, user)
  return c.redirect('/admin/stock/shortages', 303)
})

// ── POST /admin/stock/shortages/:id/reopen ────────────────────────────────
stockAdmin.post('/shortages/:id/reopen', async (c) => {
  const id = parseInt(c.req.param('id'), 10)
  if (!Number.isFinite(id)) return c.notFound()
  await reopenShortage(c.env.DB, id)
  return c.redirect('/admin/stock/shortages', 303)
})

// ── GET /admin/stock/:id/allocations — per-item commitment view ───────────
// Registered BEFORE /:id so it doesn't get caught as part of the param.
stockAdmin.get('/:id/allocations', async (c) => {
  const user = c.get('user')
  const id = parseInt(c.req.param('id'), 10)
  if (!Number.isFinite(id)) return c.notFound()

  const item = await c.env.DB.prepare(
    `SELECT id, brand, description, qty_on_hand, custody_type, status, active, low_stock_threshold
     FROM stock_items WHERE id = ?`
  ).bind(id).first<any>()
  if (!item) return c.notFound()

  // Default window: today → +90 days
  const today = new Date().toISOString().slice(0, 10)
  const horizon = new Date(Date.now() + 90 * 86400 * 1000).toISOString().slice(0, 10)
  const commits = await getCommitmentsForItem(c.env.DB, id, today, horizon)

  // Build a per-date roll-up
  const byDate = new Map<string, Array<typeof commits[0]>>()
  for (const cm of commits) {
    const arr = byDate.get(cm.event_date) || []
    arr.push(cm)
    byDate.set(cm.event_date, arr)
  }

  const onHand = item.qty_on_hand
  const countsTowardAvail = item.active === 1 && item.status === 'active' && item.custody_type === 'owned'

  const rows = Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, list]) => {
      const total = list.reduce((s, c) => s + c.quantity, 0)
      const left = countsTowardAvail ? onHand - total : null
      const isShort = countsTowardAvail && total > onHand
      const cellColor = isShort ? '#ff7a66' : (countsTowardAvail && total === onHand ? '#fbbf24' : '#a8ff7a')
      return /*html*/ `
        <tr style="border-top:1px solid rgba(255,255,255,0.06)">
          <td style="padding:10px 12px;font-family:monospace;white-space:nowrap">${esc(date)}</td>
          <td style="padding:10px 12px">
            ${list.map(c => `
              <div style="display:flex;gap:8px;align-items:center;margin:2px 0">
                <span style="font-family:monospace;color:${cellColor};min-width:40px;text-align:right">${c.quantity}×</span>
                <a href="/calendar/event/${c.event_id}" style="color:inherit;text-decoration:underline;font-size:13px">${esc(c.event_name)}</a>
                <span style="font-size:11px;opacity:0.6">${esc(c.status)}</span>
                ${c.override_reason ? `<span style="font-size:10px;padding:1px 5px;background:rgba(245,158,11,0.15);color:#fbbf24;border-radius:4px" title="${esc(c.override_reason)}">override</span>` : ''}
              </div>
            `).join('')}
          </td>
          <td style="padding:10px 12px;text-align:right;font-family:monospace;color:${cellColor};font-weight:700">${total}</td>
          <td style="padding:10px 12px;text-align:right;font-family:monospace;color:${cellColor}">${left === null ? '—' : left}</td>
        </tr>
      `
    }).join('')

  const body = /*html*/ `
    <div style="max-width:1100px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;gap:12px;flex-wrap:wrap">
        <div>
          <h1 style="margin:0 0 6px 0">📅 Allocations — ${esc(item.brand)} · ${esc(item.description)}</h1>
          <div style="font-size:13px;opacity:0.75">
            On hand: <strong>${onHand}</strong> ·
            Custody: <strong>${esc(item.custody_type)}</strong> ·
            Status: <strong>${esc(item.status)}</strong> ·
            ${countsTowardAvail
              ? '<span style="color:#a8ff7a">counts toward availability</span>'
              : '<span style="color:#fbbf24">does NOT count toward availability (not owned-active)</span>'}
          </div>
        </div>
        <div style="display:flex;gap:8px">
          <a href="/admin/stock/${id}" class="btn btn-outline"><i class="fas fa-pen"></i> Edit item</a>
          <a href="/admin/stock" class="btn btn-outline"><i class="fas fa-arrow-left"></i> Back</a>
        </div>
      </div>

      ${commits.length === 0 ? `
        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:30px;text-align:center;opacity:0.6">
          No allocations for this item in the next 90 days.
        </div>
      ` : `
        <div style="overflow-x:auto;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:8px">
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead style="background:rgba(255,255,255,0.05)">
              <tr>
                <th style="text-align:left;padding:10px 12px">Date</th>
                <th style="text-align:left;padding:10px 12px">Events / committed</th>
                <th style="text-align:right;padding:10px 12px">Total committed</th>
                <th style="text-align:right;padding:10px 12px">Remaining</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `}
    </div>
  `
  return c.html(layout(`Allocations — ${item.brand} ${item.description}`, body, user, 'stock-admin'))
})

// ── POST /admin/stock/bulk — bulk action on selected ids ──────────────────
// Registered BEFORE /:id paths.
stockAdmin.post('/bulk', async (c) => {
  const form = await c.req.parseBody()
  const idsRaw   = String(form.ids || '')
  const action   = String(form.bulk_action || '')
  const reason   = String(form.bulk_reason || '').trim() || null
  const returnQs = String(form.return_qs || '')
  const returnUrl = '/admin/stock' + (returnQs ? '?' + returnQs : '')

  const ids = idsRaw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n) && n > 0)
  if (!ids.length) return c.redirect(returnUrl + (returnUrl.includes('?') ? '&' : '?') + 'err=' + encodeURIComponent('No items selected'))

  const placeholders = ids.map(() => '?').join(',')
  const items = await c.env.DB.prepare(
    `SELECT id, brand, description, qty_on_hand, custody_type, status, active
     FROM stock_items WHERE id IN (${placeholders})`
  ).bind(...ids).all<any>()

  if (!items.results.length) {
    return c.redirect(returnUrl + (returnUrl.includes('?') ? '&' : '?') + 'err=' + encodeURIComponent('No matching items'))
  }

  let changed = 0
  const sep = (s: string) => s.includes('?') ? '&' : '?'

  if (action === 'set_custody') {
    const v = String(form.bulk_custody || '')
    if (!['owned','third_party_in_warehouse','offsite'].includes(v)) {
      return c.redirect(returnUrl + sep(returnUrl) + 'err=' + encodeURIComponent('Invalid custody type'))
    }
    for (const it of items.results) {
      if (it.custody_type === v) continue
      await c.env.DB.prepare(`UPDATE stock_items SET custody_type=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(v, it.id).run()
      await logMovement(c, it.id, 'bulk_update', 'custody_type', it.custody_type, v, reason)
      changed++
    }
  } else if (action === 'set_status') {
    const v = String(form.bulk_status || '')
    if (!['active','review','retired'].includes(v)) {
      return c.redirect(returnUrl + sep(returnUrl) + 'err=' + encodeURIComponent('Invalid status'))
    }
    for (const it of items.results) {
      if (it.status === v) continue
      await c.env.DB.prepare(`UPDATE stock_items SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(v, it.id).run()
      await logMovement(c, it.id, 'bulk_update', 'status', it.status, v, reason)
      changed++
    }
  } else if (action === 'adjust_qty') {
    const delta = parseInt(String(form.bulk_qty_delta || '0'), 10)
    if (!Number.isFinite(delta) || delta === 0) {
      return c.redirect(returnUrl + sep(returnUrl) + 'err=' + encodeURIComponent('Adjustment must be a non-zero number'))
    }
    for (const it of items.results) {
      const newQty = Math.max(0, (it.qty_on_hand || 0) + delta)
      if (newQty === it.qty_on_hand) continue
      await c.env.DB.prepare(`UPDATE stock_items SET qty_on_hand=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(newQty, it.id).run()
      await logMovement(c, it.id, 'bulk_update', 'qty_on_hand', it.qty_on_hand, newQty, reason)
      changed++
    }
  } else if (action === 'set_qty') {
    const v = parseInt(String(form.bulk_qty_set || ''), 10)
    if (!Number.isFinite(v) || v < 0) {
      return c.redirect(returnUrl + sep(returnUrl) + 'err=' + encodeURIComponent('Quantity must be 0 or more'))
    }
    for (const it of items.results) {
      if (it.qty_on_hand === v) continue
      await c.env.DB.prepare(`UPDATE stock_items SET qty_on_hand=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(v, it.id).run()
      await logMovement(c, it.id, 'bulk_update', 'qty_on_hand', it.qty_on_hand, v, reason)
      changed++
    }
  } else if (action === 'delete') {
    for (const it of items.results) {
      if (!it.active) continue
      await c.env.DB.prepare(`UPDATE stock_items SET active=0, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(it.id).run()
      await logMovement(c, it.id, 'delete', 'active', 1, 0, reason)
      changed++
    }
  } else {
    return c.redirect(returnUrl + sep(returnUrl) + 'err=' + encodeURIComponent('Unknown bulk action'))
  }

  return c.redirect(returnUrl + sep(returnUrl) + 'msg=' + encodeURIComponent(`Bulk ${action.replace('_',' ')}: ${changed} item(s) updated`))
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

  const newId = Number(res.meta?.last_row_id)
  if (Number.isFinite(newId)) {
    await logMovement(c, newId, 'create', 'multiple', null, `${brand} — ${description} (qty ${qty}, custody ${custody_type})`, 'created via admin')
  }
  return c.redirect(`/admin/stock/${newId}?msg=` + encodeURIComponent(`Added "${description}" to ${brand}`))
})

// ── GET /admin/stock/:id/history — per-item movements ─────────────────────
// Registered BEFORE /:id so it doesn't get swallowed.
stockAdmin.get('/:id/history', async (c) => {
  const user = c.get('user')
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) return c.redirect('/admin/stock?err=Invalid+id')

  const item = await c.env.DB.prepare(`SELECT * FROM stock_items WHERE id = ?`).bind(id).first<any>()
  if (!item) return c.redirect('/admin/stock?err=Item+not+found')

  const rows = await c.env.DB.prepare(
    `SELECT id, action, field_changed, old_value, new_value, delta, reason, user_name, created_at
     FROM stock_movements
     WHERE stock_item_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT 200`
  ).bind(id).all<any>()

  const tableRows = rows.results.map((r: any) => {
    const delta = (r.delta !== null && r.delta !== undefined)
      ? `<strong style="color:${r.delta >= 0 ? '#10b981' : '#ef4444'}">${r.delta >= 0 ? '+' : ''}${r.delta}</strong>`
      : ''
    const change = r.field_changed
      ? `<code style="font-size:11px;background:var(--surface);padding:1px 6px;border-radius:4px">${esc(r.field_changed)}</code>
         <span class="muted" style="font-size:11px">${esc(String(r.old_value ?? '').slice(0,40))}</span>
         <span style="color:var(--text-muted)">→</span>
         <span style="font-size:11px">${esc(String(r.new_value ?? '').slice(0,40))}</span>
         ${delta ? ' ' + delta : ''}`
      : ''
    return `
      <tr>
        <td class="muted" style="font-size:11px;white-space:nowrap">${esc(String(r.created_at).replace('T',' ').slice(0,16))}</td>
        <td>${actionBadge(r.action)}</td>
        <td>${change}</td>
        <td class="muted" style="font-size:11px">${esc(r.reason) || ''}</td>
        <td class="muted" style="font-size:11px">${esc(r.user_name) || '—'}</td>
      </tr>`
  }).join('')

  const body = `
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:16px;flex-wrap:wrap">
      <div>
        <h1 style="margin:0">
          <i class="fas fa-clock-rotate-left"></i>
          History: ${esc(item.brand)} — ${esc(item.description)}
        </h1>
        <p class="text-muted" style="margin:4px 0 0">All changes to item #${item.id}. Most recent first.</p>
      </div>
      <div style="display:flex;gap:8px">
        <a href="/admin/stock/${item.id}"     class="btn btn-outline"><i class="fas fa-pen"></i> Edit item</a>
        <a href="/admin/stock"                class="btn btn-outline"><i class="fas fa-arrow-left"></i> Back to list</a>
      </div>
    </div>

    <div class="card" style="padding:0">
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>When</th>
            <th>Action</th>
            <th>Change</th>
            <th>Reason</th>
            <th>User</th>
          </tr></thead>
          <tbody>${tableRows || '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted)">No history yet — changes from now on will be logged here.</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  `
  return c.html(layout(`History — ${item.brand}`, body, user, 'stock-admin'))
})

// ── GET /admin/stock/:id — view/edit ──────────────────────────────────────
stockAdmin.get('/:id', async (c) => {
  const user = c.get('user')
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) return c.redirect('/admin/stock?err=Invalid+id')

  // Capture where the user came from so Back / Cancel / Save return there
  // (preserves page, filters, search, view toggles).
  // Priority: explicit ?from=  →  Referer header  →  /admin/stock
  const explicitFrom = c.req.query('from')
  const referer = c.req.header('referer') || ''
  let backUrl = '/admin/stock'
  if (explicitFrom && explicitFrom.startsWith('/admin/stock')) {
    backUrl = explicitFrom
  } else if (referer) {
    try {
      const refUrl = new URL(referer)
      // only honour same-origin referers that point at the stock list (not another edit page)
      const path = refUrl.pathname + refUrl.search
      if (/^\/admin\/stock(\/?$|\/?\?)/.test(refUrl.pathname + (refUrl.search ? '?' : ''))) {
        backUrl = path
      } else if (/^\/admin\/stock\/movements/.test(refUrl.pathname)) {
        backUrl = path
      }
    } catch { /* ignore malformed referers */ }
  }

  const item = await c.env.DB.prepare(
    `SELECT * FROM stock_items WHERE id = ?`
  ).bind(id).first<any>()

  if (!item) return c.redirect('/admin/stock?err=Item+not+found')

  const brandsRes = await c.env.DB.prepare(
    `SELECT DISTINCT brand FROM stock_items WHERE active=1 ORDER BY brand`
  ).all<any>()
  const brands = brandsRes.results.map((r: any) => r.brand)

  // Latest 5 movements for this item — inline preview
  const recentRes = await c.env.DB.prepare(
    `SELECT action, field_changed, old_value, new_value, delta, user_name, created_at
     FROM stock_movements WHERE stock_item_id = ?
     ORDER BY created_at DESC, id DESC LIMIT 5`
  ).bind(id).all<any>()
  const recent = recentRes.results

  const recentBlock = recent.length ? `
    <div class="card" style="padding:12px 16px;max-width:720px;margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <strong><i class="fas fa-clock-rotate-left"></i> Recent activity</strong>
        <a href="/admin/stock/${item.id}/history" class="btn btn-outline btn-sm">Full history</a>
      </div>
      <ul style="margin:0;padding:0;list-style:none;font-size:12px">
        ${recent.map((r: any) => `
          <li style="padding:4px 0;border-bottom:1px dashed var(--border)">
            <span class="muted">${esc(String(r.created_at).replace('T',' ').slice(0,16))}</span>
            ${actionBadge(r.action)}
            ${r.field_changed ? `
              <code style="font-size:10px;background:var(--surface);padding:1px 4px;border-radius:3px">${esc(r.field_changed)}</code>
              <span class="muted">${esc(String(r.old_value ?? '').slice(0,30))}</span> →
              <span>${esc(String(r.new_value ?? '').slice(0,30))}</span>
              ${(r.delta !== null && r.delta !== undefined) ? `<strong style="color:${r.delta >= 0 ? '#10b981' : '#ef4444'}">${r.delta >= 0 ? '+' : ''}${r.delta}</strong>` : ''}
            ` : ''}
            <span class="muted" style="float:right">${esc(r.user_name) || '—'}</span>
          </li>
        `).join('')}
      </ul>
    </div>
  ` : ''

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
      <div style="display:flex;gap:8px">
        <a href="/admin/stock/${item.id}/history" class="btn btn-outline"><i class="fas fa-clock-rotate-left"></i> History</a>
        <a href="${esc(backUrl)}"                 class="btn btn-outline"><i class="fas fa-arrow-left"></i> Back to list</a>
      </div>
    </div>

    ${flashBanner(c)}

    <form method="post" action="/admin/stock/${item.id}" class="card" style="padding:20px;max-width:720px;margin-bottom:16px">
      <input type="hidden" name="__back" value="${esc(backUrl)}" />
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

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:12px">
        <div>
          <label>Status</label>
          <select name="status">
            <option value="active" ${item.status === 'active' ? 'selected' : ''}>Active</option>
            <option value="review" ${item.status === 'review' ? 'selected' : ''}>Review (needs human eyeballs)</option>
            <option value="retired" ${item.status === 'retired' ? 'selected' : ''}>Retired</option>
          </select>
        </div>
        <div>
          <label>Low-stock threshold
            <span class="muted" style="font-weight:400;font-size:11px">— alert when qty ≤ this. Blank = use default of 5. 0 = never alert.</span>
          </label>
          <input type="number" name="low_stock_threshold" min="0" step="1"
                 value="${item.low_stock_threshold === null || item.low_stock_threshold === undefined ? '' : item.low_stock_threshold}"
                 placeholder="5 (default)" />
        </div>
      </div>

      <div style="margin-top:12px">
        <label>Reason for change <span class="muted" style="font-weight:400">(optional, shown in audit log)</span></label>
        <input type="text" name="reason" placeholder="e.g. stock count correction, broken items removed, etc." />
      </div>

      <div style="display:flex;justify-content:space-between;gap:8px;margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">
        <div style="display:flex;gap:8px">
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Save Changes</button>
          <a href="${esc(backUrl)}" class="btn btn-outline">Cancel</a>
        </div>
        <button type="button" class="btn btn-outline" style="color:#ef4444;border-color:#ef4444"
          onclick="if(confirm('Soft-delete this item? It will be hidden from the list but kept in the audit log.')) document.getElementById('delete-form').submit()">
          <i class="fas fa-trash"></i> Delete
        </button>
      </div>
    </form>

    ${recentBlock}

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
  const reason       = String(form.reason       || '').trim() || null

  // Low-stock threshold: blank → NULL (use default); otherwise integer ≥0
  const rawThreshold = String(form.low_stock_threshold ?? '').trim()
  let low_stock_threshold: number | null = null
  if (rawThreshold !== '') {
    const n = parseInt(rawThreshold, 10)
    if (Number.isFinite(n) && n >= 0) low_stock_threshold = n
  }

  // Where to return after save — honour hidden __back input from edit form
  const rawBack = String(form.__back || '/admin/stock')
  const backUrl = rawBack.startsWith('/admin/stock') ? rawBack : '/admin/stock'

  if (!brand || !description) {
    return c.redirect(`/admin/stock/${id}?err=` + encodeURIComponent('Brand and Description are required'))
  }
  if (!['owned','third_party_in_warehouse','offsite'].includes(custody_type)) {
    return c.redirect(`/admin/stock/${id}?err=` + encodeURIComponent('Invalid custody type'))
  }
  if (!['active','review','retired'].includes(status)) {
    return c.redirect(`/admin/stock/${id}?err=` + encodeURIComponent('Invalid status'))
  }

  // Read before-snapshot for diff logging
  const before = await c.env.DB.prepare(`SELECT * FROM stock_items WHERE id=?`).bind(id).first<any>()
  if (!before) return c.redirect('/admin/stock?err=Item+not+found')

  await c.env.DB.prepare(
    `UPDATE stock_items
     SET brand=?, description=?, qty_on_hand=?, custody_type=?,
         location=?, notes=?, status=?, low_stock_threshold=?,
         updated_at=CURRENT_TIMESTAMP
     WHERE id=?`
  ).bind(brand, description, qty, custody_type, location, notes, status, low_stock_threshold, id).run()

  const after = { brand, description, qty_on_hand: qty, custody_type, location, notes, status, low_stock_threshold }
  const n = await logDiffs(c, id, before, after,
    ['brand','description','qty_on_hand','custody_type','location','notes','status','low_stock_threshold'],
    reason)

  const sep = backUrl.includes('?') ? '&' : '?'
  const msg = n ? `Saved "${description}" (${n} change${n===1?'':'s'} logged)` : `No changes to "${description}"`
  return c.redirect(`${backUrl}${sep}msg=` + encodeURIComponent(msg))
})

// ── POST /admin/stock/:id/delete — soft-delete ────────────────────────────
stockAdmin.post('/:id/delete', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) return c.redirect('/admin/stock?err=Invalid+id')

  const item = await c.env.DB.prepare(`SELECT brand, description, active FROM stock_items WHERE id=?`).bind(id).first<any>()
  if (!item) return c.redirect('/admin/stock?err=Item+not+found')

  await c.env.DB.prepare(
    `UPDATE stock_items SET active=0, updated_at=CURRENT_TIMESTAMP WHERE id=?`
  ).bind(id).run()

  await logMovement(c, id, 'delete', 'active', item.active ?? 1, 0, null)

  return c.redirect('/admin/stock?msg=' + encodeURIComponent(`Deleted "${item.description}" from ${item.brand}`))
})

// ── POST /admin/stock/:id/restore — undelete a soft-deleted item ──────────
// Flips active back to 1, writes an audit row, and bounces back to wherever
// the user came from (via the show param if present, default = active list).
stockAdmin.post('/:id/restore', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) return c.redirect('/admin/stock?err=Invalid+id')

  const item = await c.env.DB.prepare(
    `SELECT brand, description, active FROM stock_items WHERE id=?`
  ).bind(id).first<any>()
  if (!item) return c.redirect('/admin/stock?err=Item+not+found')

  // Idempotent: if already active, log nothing, just bounce with a notice
  if (item.active === 1) {
    return c.redirect('/admin/stock?msg=' + encodeURIComponent(`"${item.description}" is already active`))
  }

  await c.env.DB.prepare(
    `UPDATE stock_items SET active=1, updated_at=CURRENT_TIMESTAMP WHERE id=?`
  ).bind(id).run()

  // Use the 'restore' action so it stands out in the movements log
  await logMovement(c, id, 'restore', 'active', 0, 1, null)

  // Stay on the deleted view if user came from there (helps batch restores)
  const referer = c.req.header('referer') || ''
  const backToDeleted = /[?&]show=deleted/.test(referer)
  const target = backToDeleted ? '/admin/stock?show=deleted' : '/admin/stock'
  return c.redirect(target + (target.includes('?') ? '&' : '?') + 'msg=' + encodeURIComponent(`Restored "${item.description}" from ${item.brand}`))
})

export default stockAdmin
