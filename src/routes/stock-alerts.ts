// ─────────────────────────────────────────────────────────────────────────
// Phase 5: Low-stock alerts dashboard + recipient management
// ─────────────────────────────────────────────────────────────────────────
// Mounted under /admin/stock/alerts.
// Sub-routes:
//   GET  /alerts                       — dashboard with filterable item list
//   GET  /alerts.csv                   — CSV export
//   POST /alerts/:id/snooze            — snooze one item for N days
//   POST /alerts/:id/unsnooze          — clear snooze
//   POST /alerts/recipients/add        — add an email recipient
//   POST /alerts/recipients/:rid/toggle — pause/resume one recipient
//   POST /alerts/recipients/:rid/delete — delete a recipient
//   POST /alerts/test                  — fire digest now (uses current settings)

import { Hono } from 'hono'
import type { AuthUser } from '../lib/auth.js'
import { layout } from '../lib/layout.js'
import { fetchLowStockItems, fetchActiveRecipients, runLowStockDigest, DEFAULT_LOW_STOCK_THRESHOLD } from '../lib/low-stock.js'

type Bindings = { DB: D1Database; RESEND_API_KEY?: string }
type Variables = { user: AuthUser }
const alerts = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// ── helpers (local copies; tiny enough not to pull from shared) ────────────
function esc(s: any): string {
  if (s === null || s === undefined) return ''
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function flash(c: any): string {
  const msg = c.req.query('msg')
  const err = c.req.query('err')
  if (msg) return `<div class="card" style="background:#10b98122;border-left:4px solid #10b981;padding:12px 16px;margin-bottom:16px;color:#10b981"><i class="fas fa-check-circle"></i> ${esc(msg)}</div>`
  if (err) return `<div class="card" style="background:#ef444422;border-left:4px solid #ef4444;padding:12px 16px;margin-bottom:16px;color:#ef4444"><i class="fas fa-triangle-exclamation"></i> ${esc(err)}</div>`
  return ''
}

function csvCell(v: any): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

// ── GET /admin/stock/alerts — dashboard ────────────────────────────────────
alerts.get('/', async (c) => {
  const user = c.get('user')
  const brand = (c.req.query('brand') || '').trim() || undefined
  const custody = (c.req.query('custody') || '').trim() || undefined
  const includeSnoozed = c.req.query('snoozed') === '1'

  const rows = await fetchLowStockItems(c.env, { brand, custody, includeSnoozed })
  const recipients = await c.env.DB.prepare(
    `SELECT id, email, name, active, created_at, created_by FROM low_stock_alert_recipients ORDER BY active DESC, id`
  ).all<any>()

  // Brand + custody dropdown options
  const brandsRes = await c.env.DB.prepare(`SELECT DISTINCT brand FROM stock_items WHERE active=1 ORDER BY brand`).all<{brand:string}>()
  const brands = brandsRes.results.map(r => r.brand)

  const outN = rows.filter(r => r.status === 'out').length
  const lowN = rows.filter(r => r.status === 'low').length
  const today = new Date().toISOString().slice(0, 10)

  const rowsHtml = rows.length === 0
    ? `<tr><td colspan="8" class="muted" style="text-align:center;padding:24px;font-style:italic">No items below threshold${brand || custody ? ' for current filter' : ''} ✓</td></tr>`
    : rows.map(r => {
        const snoozed = r.alert_snoozed_until && r.alert_snoozed_until >= today
        const colour = r.status === 'out' ? '#dc2626' : '#d97706'
        const label = r.status === 'out' ? 'OUT' : 'LOW'
        const thresholdLabel = r.low_stock_threshold === null
          ? `<span class="muted">${r.effective_threshold} (default)</span>`
          : r.low_stock_threshold === 0
            ? `<span class="muted">— (opted out)</span>`
            : `<strong>${r.low_stock_threshold}</strong>`
        return `<tr style="${snoozed ? 'opacity:.55' : ''}">
          <td><a href="/admin/stock/${r.id}" style="color:var(--bw-gold);text-decoration:none"><strong>${esc(r.brand)}</strong></a></td>
          <td>${esc(r.description)}</td>
          <td style="text-align:right;font-family:monospace;font-size:16px"><strong style="color:${colour}">${r.qty_on_hand}</strong></td>
          <td style="text-align:right;font-family:monospace">${thresholdLabel}</td>
          <td><span style="font-size:11px;padding:2px 8px;border-radius:10px;background:${colour}22;color:${colour};font-weight:600">${label}</span>${snoozed ? ` <span class="muted" style="font-size:10px">snoozed → ${esc(r.alert_snoozed_until)}</span>` : ''}</td>
          <td class="muted" style="font-size:12px">${esc(r.location) || '—'}</td>
          <td class="muted" style="font-size:11px">${esc(r.custody_type)}</td>
          <td style="text-align:right;white-space:nowrap">
            ${snoozed
              ? `<button type="submit" form="unsnooze-${r.id}" class="btn btn-outline btn-sm" title="Cancel snooze"><i class="fas fa-bell"></i> Wake</button>`
              : `<button type="submit" form="snooze-${r.id}" class="btn btn-outline btn-sm" title="Snooze 7 days"><i class="fas fa-bed"></i> Snooze</button>`}
            <a href="/admin/stock/${r.id}" class="btn btn-outline btn-sm">Edit</a>
          </td>
        </tr>`
      }).join('')

  // Hidden forms for snooze actions (avoid nested forms)
  const snoozeForms = rows.map(r => {
    const snoozed = r.alert_snoozed_until && r.alert_snoozed_until >= today
    if (snoozed) {
      return `<form id="unsnooze-${r.id}" method="post" action="/admin/stock/alerts/${r.id}/unsnooze" style="display:none"></form>`
    }
    return `<form id="snooze-${r.id}" method="post" action="/admin/stock/alerts/${r.id}/snooze" style="display:none"><input type="hidden" name="days" value="7"></form>`
  }).join('')

  const recipientRows = recipients.results.length === 0
    ? `<tr><td colspan="4" class="muted" style="text-align:center;padding:12px;font-style:italic">No recipients yet — add one below.</td></tr>`
    : recipients.results.map((r: any) => `
        <tr style="${r.active ? '' : 'opacity:.5'}">
          <td><strong>${esc(r.email)}</strong>${r.name ? `<div class="muted" style="font-size:11px">${esc(r.name)}</div>` : ''}</td>
          <td><span style="font-size:11px;padding:2px 8px;border-radius:10px;background:${r.active ? '#10b98122' : '#6b728022'};color:${r.active ? '#10b981' : '#6b7280'};font-weight:600">${r.active ? 'Active' : 'Paused'}</span></td>
          <td class="muted" style="font-size:11px">${esc(String(r.created_at || '').replace('T',' ').slice(0,16))} · ${esc(r.created_by) || '—'}</td>
          <td style="text-align:right;white-space:nowrap">
            <form method="post" action="/admin/stock/alerts/recipients/${r.id}/toggle" style="display:inline">
              <button class="btn btn-outline btn-sm">${r.active ? 'Pause' : 'Resume'}</button>
            </form>
            <form method="post" action="/admin/stock/alerts/recipients/${r.id}/delete" style="display:inline" onsubmit="return confirm('Delete ${esc(r.email)}?')">
              <button class="btn btn-outline btn-sm" style="color:#ef4444;border-color:#ef4444"><i class="fas fa-trash"></i></button>
            </form>
          </td>
        </tr>`).join('')

  const body = `
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:8px">
      <div>
        <h1 style="margin:0"><i class="fas fa-bell"></i> Low-stock alerts</h1>
        <p class="text-muted" style="margin:4px 0 0">
          Items at or below their threshold. Default threshold ${DEFAULT_LOW_STOCK_THRESHOLD} (override per item on the edit page).
          Weekly digest emails active recipients every Monday.
        </p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <a href="/admin/stock/alerts/export.csv${brand || custody || includeSnoozed ? '?' + new URLSearchParams({...(brand?{brand}:{}),...(custody?{custody}:{}),...(includeSnoozed?{snoozed:'1'}:{})}).toString() : ''}" class="btn btn-outline"><i class="fas fa-file-csv"></i> Export CSV</a>
        <form method="post" action="/admin/stock/alerts/test" style="display:inline" onsubmit="return confirm('Send a digest email right now to all active recipients?')">
          <button class="btn btn-outline" style="color:#06b6d4;border-color:#06b6d4"><i class="fas fa-paper-plane"></i> Send digest now</button>
        </form>
        <a href="/admin/stock" class="btn btn-outline"><i class="fas fa-arrow-left"></i> Back to stock</a>
      </div>
    </div>

    ${flash(c)}

    <!-- Stat cards -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:16px">
      <div class="card" style="padding:14px 18px;border-left:4px solid #dc2626">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted)"><i class="fas fa-circle-exclamation"></i> Out of stock</div>
        <div style="font-size:28px;font-weight:700">${outN}</div>
      </div>
      <div class="card" style="padding:14px 18px;border-left:4px solid #d97706">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted)"><i class="fas fa-triangle-exclamation"></i> Below threshold</div>
        <div style="font-size:28px;font-weight:700">${lowN}</div>
      </div>
      <div class="card" style="padding:14px 18px;border-left:4px solid #10b981">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted)"><i class="fas fa-envelope"></i> Active recipients</div>
        <div style="font-size:28px;font-weight:700">${recipients.results.filter((r:any) => r.active).length}</div>
      </div>
    </div>

    <!-- Filter bar -->
    <form method="get" action="/admin/stock/alerts" class="card" style="padding:12px;margin-bottom:16px">
      <div style="display:grid;grid-template-columns:1fr 1fr auto auto;gap:8px;align-items:end">
        <div>
          <label style="font-size:11px;color:var(--text-muted);display:block">Brand</label>
          <select name="brand">
            <option value="">All brands</option>
            ${brands.map(b => `<option value="${esc(b)}" ${b === brand ? 'selected' : ''}>${esc(b)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label style="font-size:11px;color:var(--text-muted);display:block">Custody</label>
          <select name="custody">
            <option value="">All custody types</option>
            <option value="owned" ${custody === 'owned' ? 'selected' : ''}>Owned</option>
            <option value="third_party_in_warehouse" ${custody === 'third_party_in_warehouse' ? 'selected' : ''}>Third-party (in warehouse)</option>
            <option value="offsite" ${custody === 'offsite' ? 'selected' : ''}>Off-site</option>
          </select>
        </div>
        <div>
          <label style="display:flex;align-items:center;gap:6px;font-size:12px"><input type="checkbox" name="snoozed" value="1" ${includeSnoozed ? 'checked' : ''}> Include snoozed</label>
        </div>
        <div style="display:flex;gap:6px">
          <button type="submit" class="btn btn-primary btn-sm">Filter</button>
          <a href="/admin/stock/alerts" class="btn btn-outline btn-sm">Reset</a>
        </div>
      </div>
    </form>

    <!-- Alert items table -->
    <div class="card" style="padding:0;overflow:hidden;margin-bottom:24px">
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:var(--surface);text-align:left">
          <th style="padding:10px 12px">Brand</th>
          <th style="padding:10px 12px">Description</th>
          <th style="padding:10px 12px;text-align:right">Qty</th>
          <th style="padding:10px 12px;text-align:right">Threshold</th>
          <th style="padding:10px 12px">Status</th>
          <th style="padding:10px 12px">Location</th>
          <th style="padding:10px 12px">Custody</th>
          <th style="padding:10px 12px;text-align:right">Actions</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    ${snoozeForms}

    <!-- Recipients management -->
    <h2 style="margin:24px 0 8px;font-size:18px"><i class="fas fa-envelope"></i> Digest recipients</h2>
    <p class="text-muted" style="margin:0 0 12px;font-size:13px">Active recipients get the weekly low-stock digest every Monday at 07:00 SAST.</p>

    <div class="card" style="padding:16px;margin-bottom:12px;max-width:720px">
      <form method="post" action="/admin/stock/alerts/recipients/add" style="display:grid;grid-template-columns:2fr 2fr auto;gap:8px;align-items:end">
        <div>
          <label style="font-size:11px">Email <span style="color:#ef4444">*</span></label>
          <input type="email" name="email" required placeholder="someone@bwproductions.co.za" />
        </div>
        <div>
          <label style="font-size:11px">Name <span class="muted" style="font-weight:400">(optional)</span></label>
          <input type="text" name="name" placeholder="Jane Smith" />
        </div>
        <button type="submit" class="btn btn-primary"><i class="fas fa-plus"></i> Add recipient</button>
      </form>
    </div>

    <div class="card" style="padding:0;overflow:hidden;max-width:720px">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:var(--surface);text-align:left">
          <th style="padding:8px 12px">Email</th>
          <th style="padding:8px 12px">Status</th>
          <th style="padding:8px 12px">Added</th>
          <th style="padding:8px 12px;text-align:right">Actions</th>
        </tr></thead>
        <tbody>${recipientRows}</tbody>
      </table>
    </div>
  `
  return c.html(layout('Low-stock alerts', body, user, 'stock-admin'))
})

// ── GET /admin/stock/alerts/export.csv — CSV download ──────────────────────
alerts.get('/export.csv', async (c) => {
  const brand = (c.req.query('brand') || '').trim() || undefined
  const custody = (c.req.query('custody') || '').trim() || undefined
  const includeSnoozed = c.req.query('snoozed') === '1'

  const rows = await fetchLowStockItems(c.env, { brand, custody, includeSnoozed })
  const today = new Date().toISOString().slice(0, 10)
  const headers = ['id','brand','description','qty_on_hand','threshold','effective_threshold','status','custody_type','location','snoozed_until']
  const out = ['\uFEFF' + headers.join(',')]
  for (const r of rows) {
    out.push([
      r.id, r.brand, r.description, r.qty_on_hand,
      r.low_stock_threshold === null ? 'default' : r.low_stock_threshold,
      r.effective_threshold, r.status, r.custody_type, r.location || '',
      r.alert_snoozed_until || '',
    ].map(csvCell).join(','))
  }
  const csv = out.join('\r\n') + '\r\n'
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="low_stock_alerts_${today}.csv"`,
    },
  })
})

// ── POST /admin/stock/alerts/:id/snooze — snooze N days ────────────────────
alerts.post('/:id/snooze', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) return c.redirect('/admin/stock/alerts?err=Invalid+id')
  const form = await c.req.parseBody()
  const days = parseInt(String(form.days || '7'), 10) || 7
  const until = new Date(Date.now() + days * 86400 * 1000).toISOString().slice(0, 10)

  const item = await c.env.DB.prepare(`SELECT id, brand, description FROM stock_items WHERE id=?`).bind(id).first<any>()
  if (!item) return c.redirect('/admin/stock/alerts?err=Item+not+found')

  await c.env.DB.prepare(`UPDATE stock_items SET alert_snoozed_until=? WHERE id=?`).bind(until, id).run()
  return c.redirect('/admin/stock/alerts?msg=' + encodeURIComponent(`Snoozed "${item.description}" until ${until}`))
})

// ── POST /admin/stock/alerts/:id/unsnooze ──────────────────────────────────
alerts.post('/:id/unsnooze', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) return c.redirect('/admin/stock/alerts?err=Invalid+id')

  const item = await c.env.DB.prepare(`SELECT id, brand, description FROM stock_items WHERE id=?`).bind(id).first<any>()
  if (!item) return c.redirect('/admin/stock/alerts?err=Item+not+found')

  await c.env.DB.prepare(`UPDATE stock_items SET alert_snoozed_until=NULL WHERE id=?`).bind(id).run()
  return c.redirect('/admin/stock/alerts?msg=' + encodeURIComponent(`Snooze cleared for "${item.description}"`))
})

// ── POST /admin/stock/alerts/recipients/add ────────────────────────────────
alerts.post('/recipients/add', async (c) => {
  const user = c.get('user')
  const form = await c.req.parseBody()
  const email = String(form.email || '').trim().toLowerCase()
  const name  = String(form.name || '').trim() || null

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return c.redirect('/admin/stock/alerts?err=' + encodeURIComponent('Valid email required'))
  }

  try {
    await c.env.DB.prepare(
      `INSERT INTO low_stock_alert_recipients (email, name, created_by) VALUES (?, ?, ?)`
    ).bind(email, name, user?.name || null).run()
    return c.redirect('/admin/stock/alerts?msg=' + encodeURIComponent(`Added ${email} to recipients`))
  } catch (e: any) {
    if (String(e?.message || '').includes('UNIQUE')) {
      return c.redirect('/admin/stock/alerts?err=' + encodeURIComponent(`${email} is already a recipient`))
    }
    return c.redirect('/admin/stock/alerts?err=' + encodeURIComponent('Failed to add recipient'))
  }
})

// ── POST /admin/stock/alerts/recipients/:rid/toggle ────────────────────────
alerts.post('/recipients/:rid/toggle', async (c) => {
  const rid = Number(c.req.param('rid'))
  if (!Number.isFinite(rid)) return c.redirect('/admin/stock/alerts?err=Invalid+id')
  await c.env.DB.prepare(`UPDATE low_stock_alert_recipients SET active = 1 - active WHERE id=?`).bind(rid).run()
  return c.redirect('/admin/stock/alerts?msg=' + encodeURIComponent('Recipient updated'))
})

// ── POST /admin/stock/alerts/recipients/:rid/delete ────────────────────────
alerts.post('/recipients/:rid/delete', async (c) => {
  const rid = Number(c.req.param('rid'))
  if (!Number.isFinite(rid)) return c.redirect('/admin/stock/alerts?err=Invalid+id')
  await c.env.DB.prepare(`DELETE FROM low_stock_alert_recipients WHERE id=?`).bind(rid).run()
  return c.redirect('/admin/stock/alerts?msg=' + encodeURIComponent('Recipient deleted'))
})

// ── POST /admin/stock/alerts/test — fire digest immediately ────────────────
alerts.post('/test', async (c) => {
  const result = await runLowStockDigest(c.env, {
    reason: 'manual-test',
    dashboardUrl: new URL('/admin/stock/alerts', c.req.url).toString(),
    skipIfEmpty: false,
  })
  if (!result.ok) {
    return c.redirect('/admin/stock/alerts?err=' + encodeURIComponent(`Send failed: ${result.error || 'unknown error'}`))
  }
  const msg = result.items === 0
    ? `Test sent — no items below threshold, sent "all OK" mail to ${result.sent} recipient(s)`
    : `Sent ${result.items} item${result.items === 1 ? '' : 's'} to ${result.sent} recipient(s)`
  return c.redirect('/admin/stock/alerts?msg=' + encodeURIComponent(msg))
})

export default alerts
