// ─────────────────────────────────────────────────────────────────────────
// Phase 9: Stock Returns & Reconciliation — UI routes
// Mounted under /admin/stock/returns
// ─────────────────────────────────────────────────────────────────────────

import { Hono } from 'hono'
import type { AuthUser } from '../lib/auth.js'
import { layout } from '../lib/layout.js'
import {
  listPendingReturns,
  listAllReturns,
  getReturn,
  createDraftForEvent,
  saveReturnLines,
  completeReturn,
  cancelReturn,
  type ReturnLineInput,
} from '../lib/returns.js'

type Bindings = { DB: D1Database }
type Variables = { user: AuthUser }
const returns = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// ─── helpers ─────────────────────────────────────────────────────────────

function esc(s: any): string {
  if (s === null || s === undefined) return ''
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function statusBadge(status: string): string {
  const map: Record<string, { c: string; bg: string }> = {
    draft:     { c: '#f59e0b', bg: '#f59e0b22' },
    completed: { c: '#10b981', bg: '#10b98122' },
    cancelled: { c: '#6b7280', bg: '#6b728022' },
  }
  const s = map[status] || { c: '#9ca3af', bg: '#9ca3af22' }
  return `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;background:${s.bg};color:${s.c};font-size:11px;font-weight:700;border:1px solid ${s.c}55">${esc(status.toUpperCase())}</span>`
}

function fmtDateTime(s: string | null | undefined): string {
  if (!s) return ''
  return String(s).replace('T', ' ').replace(/\.\d+Z?$/, '').slice(0, 16)
}

// ─── Index: pending + history ────────────────────────────────────────────

returns.get('/', async (c) => {
  const user = c.get('user')
  const db = c.env.DB

  const pending = await listPendingReturns(db)
  const all = await listAllReturns(db, 50)

  // Count states for stat strip
  const drafts = all.filter(r => r.status === 'draft').length
  const completed = all.filter(r => r.status === 'completed').length
  const overduePending = pending.filter(p => p.days_since_event >= 1 && !p.existing_return_id).length

  const statCards = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px">
      <div class="card" style="padding:14px;${overduePending > 0 ? 'border-left:3px solid #ff7a66' : ''}">
        <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px">Pending returns</div>
        <div style="font-size:28px;font-weight:700;color:${overduePending > 0 ? '#ff7a66' : '#10b981'}">${overduePending}</div>
        <div style="font-size:11px;color:#9ca3af">events ≥1 day past without a return</div>
      </div>
      <div class="card" style="padding:14px">
        <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px">Drafts in progress</div>
        <div style="font-size:28px;font-weight:700;color:#f59e0b">${drafts}</div>
      </div>
      <div class="card" style="padding:14px">
        <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px">Completed (all-time)</div>
        <div style="font-size:28px;font-weight:700;color:#10b981">${completed}</div>
      </div>
    </div>
  `

  const pendingTable = pending.length === 0
    ? `<div class="card" style="padding:24px;text-align:center;color:#9ca3af"><i class="fas fa-check-circle" style="font-size:28px;color:#10b981"></i><div style="margin-top:8px">No events waiting for returns — you're up to date.</div></div>`
    : `
    <div class="card" style="padding:0;margin-bottom:16px;overflow:hidden">
      <div style="padding:12px 14px;border-bottom:1px solid #21262d;background:#0d1117">
        <div style="font-size:13px;color:#e5e7eb;font-weight:700"><i class="fas fa-clock"></i> Events awaiting reconciliation</div>
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead style="background:#0d1117">
            <tr>
              <th style="text-align:left;padding:8px 12px;color:#9ca3af;font-size:11px;text-transform:uppercase">Event</th>
              <th style="text-align:left;padding:8px 12px;color:#9ca3af;font-size:11px;text-transform:uppercase">Date</th>
              <th style="text-align:right;padding:8px 12px;color:#9ca3af;font-size:11px;text-transform:uppercase">Days ago</th>
              <th style="text-align:right;padding:8px 12px;color:#9ca3af;font-size:11px;text-transform:uppercase">Lines</th>
              <th style="text-align:right;padding:8px 12px;color:#9ca3af;font-size:11px;text-transform:uppercase">Units</th>
              <th style="text-align:left;padding:8px 12px;color:#9ca3af;font-size:11px;text-transform:uppercase">Status</th>
              <th style="text-align:right;padding:8px 12px;color:#9ca3af;font-size:11px;text-transform:uppercase">Action</th>
            </tr>
          </thead>
          <tbody>
            ${pending.map(p => `
              <tr style="border-top:1px solid #21262d">
                <td style="padding:8px 12px;color:#e5e7eb">
                  <a href="/calendar/${p.event_id}" style="color:#e5e7eb;text-decoration:none">${esc(p.event_name)}</a>
                </td>
                <td style="padding:8px 12px;color:#18D9FF">${esc(p.event_date)}</td>
                <td style="padding:8px 12px;text-align:right;color:${p.days_since_event >= 3 ? '#ff7a66' : '#9ca3af'};font-weight:${p.days_since_event >= 3 ? '700' : '400'}">${p.days_since_event}</td>
                <td style="padding:8px 12px;text-align:right;color:#9ca3af">${p.allocated_lines}</td>
                <td style="padding:8px 12px;text-align:right;color:#C9A84C;font-weight:700">${p.allocated_units}</td>
                <td style="padding:8px 12px">${p.existing_return_id ? statusBadge(p.existing_return_status || 'draft') : '<span style="color:#6b7280;font-size:11px">—</span>'}</td>
                <td style="padding:8px 12px;text-align:right">
                  ${p.existing_return_id
                    ? `<a href="/admin/stock/returns/${p.existing_return_id}" class="btn btn-outline" style="font-size:11px;padding:4px 10px">Open draft</a>`
                    : `<form method="POST" action="/admin/stock/returns/new" style="display:inline">
                         <input type="hidden" name="event_id" value="${p.event_id}">
                         <button type="submit" class="btn btn-primary" style="font-size:11px;padding:4px 10px"><i class="fas fa-plus"></i> Start return</button>
                       </form>`
                  }
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `

  const historyTable = all.length === 0 ? '' : `
    <div class="card" style="padding:0;margin-bottom:16px;overflow:hidden">
      <div style="padding:12px 14px;border-bottom:1px solid #21262d;background:#0d1117">
        <div style="font-size:13px;color:#e5e7eb;font-weight:700"><i class="fas fa-clock-rotate-left"></i> Recent returns</div>
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead style="background:#0d1117">
            <tr>
              <th style="text-align:left;padding:8px 12px;color:#9ca3af;font-size:11px;text-transform:uppercase">#</th>
              <th style="text-align:left;padding:8px 12px;color:#9ca3af;font-size:11px;text-transform:uppercase">Event</th>
              <th style="text-align:left;padding:8px 12px;color:#9ca3af;font-size:11px;text-transform:uppercase">Return date</th>
              <th style="text-align:left;padding:8px 12px;color:#9ca3af;font-size:11px;text-transform:uppercase">Status</th>
              <th style="text-align:right;padding:8px 12px;color:#9ca3af;font-size:11px;text-transform:uppercase">OK</th>
              <th style="text-align:right;padding:8px 12px;color:#9ca3af;font-size:11px;text-transform:uppercase">Broken</th>
              <th style="text-align:right;padding:8px 12px;color:#9ca3af;font-size:11px;text-transform:uppercase">Missing</th>
              <th style="text-align:right;padding:8px 12px;color:#9ca3af;font-size:11px;text-transform:uppercase">Lost</th>
              <th style="text-align:left;padding:8px 12px;color:#9ca3af;font-size:11px;text-transform:uppercase">By</th>
            </tr>
          </thead>
          <tbody>
            ${all.map(r => `
              <tr style="border-top:1px solid #21262d">
                <td style="padding:8px 12px"><a href="/admin/stock/returns/${r.id}" style="color:#C9A84C;text-decoration:none;font-weight:700">#${r.id}</a></td>
                <td style="padding:8px 12px;color:#e5e7eb">${esc(r.event_name || `Event ${r.event_id}`)}</td>
                <td style="padding:8px 12px;color:#18D9FF">${esc(r.return_date)}</td>
                <td style="padding:8px 12px">${statusBadge(r.status)}</td>
                <td style="padding:8px 12px;text-align:right;color:#10b981">${r.total_returned}</td>
                <td style="padding:8px 12px;text-align:right;color:${r.total_broken > 0 ? '#f59e0b' : '#6b7280'}">${r.total_broken}</td>
                <td style="padding:8px 12px;text-align:right;color:${r.total_missing > 0 ? '#ff7a66' : '#6b7280'}">${r.total_missing}</td>
                <td style="padding:8px 12px;text-align:right;color:${r.total_lost > 0 ? '#ef4444' : '#6b7280'}">${r.total_lost}</td>
                <td style="padding:8px 12px;color:#9ca3af;font-size:11px">${esc(r.created_by_name || '—')}<br><span style="color:#6b7280">${esc(fmtDateTime(r.created_at))}</span></td>
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
          <h1 style="margin:0;color:#C9A84C;font-size:24px"><i class="fas fa-rotate-left"></i> Stock Returns</h1>
          <div style="color:#9ca3af;font-size:13px;margin-top:4px">Reconcile what came back from each event — usable, broken, missing, lost</div>
        </div>
        <div style="display:flex;gap:8px"><a href="/admin/stock" class="btn btn-outline"><i class="fas fa-arrow-left"></i> Back to Stock Admin</a></div>
      </div>
    </div>
    ${statCards}
    ${pendingTable}
    ${historyTable}
  `
  return c.html(layout('Stock Returns', body, user, 'stock-admin'))
})

// ─── Start a new draft return for an event ────────────────────────────────

returns.post('/new', async (c) => {
  const user = c.get('user')
  const form = await c.req.parseBody()
  const eventId = Number(form.event_id)
  if (!eventId) return c.redirect('/admin/stock/returns')
  const id = await createDraftForEvent(c.env.DB, eventId, { id: user.id, name: user.name || user.email })
  return c.redirect(`/admin/stock/returns/${id}`)
})

// ─── Single return: edit lines / complete / cancel ───────────────────────

returns.get('/:id', async (c) => {
  const user = c.get('user')
  const id = Number(c.req.param('id'))
  const r = await getReturn(c.env.DB, id)
  if (!r) return c.html(layout('Return not found', `<div class="card" style="padding:24px"><p>Return #${id} not found.</p><a href="/admin/stock/returns" class="btn btn-outline">Back</a></div>`, user, 'stock-admin'), 404)

  const { header, lines } = r
  const editable = header.status === 'draft'

  const linesRows = lines.map((l, idx) => `
    <tr style="border-top:1px solid #21262d">
      <td style="padding:6px 10px;color:#e5e7eb">
        ${l.stock_item_id ? `<a href="/admin/stock/${l.stock_item_id}" style="color:#e5e7eb;text-decoration:none">${esc(l.description)}</a>` : `<span style="color:#9ca3af">${esc(l.description)}</span> <span style="color:#6b7280;font-size:10px">(free-text)</span>`}
      </td>
      <td style="padding:6px 10px;text-align:right;color:#C9A84C;font-weight:700">${l.qty_allocated}</td>
      <td style="padding:6px 10px;text-align:right"><input type="number" name="ok_${l.id}" value="${l.returned_ok}" min="0" max="${l.qty_allocated}" ${editable ? '' : 'readonly'} style="width:60px;text-align:right;background:${editable ? '#0d1117' : '#161b22'};color:#10b981;border:1px solid #21262d;border-radius:4px;padding:3px 6px;font-weight:700"></td>
      <td style="padding:6px 10px;text-align:right"><input type="number" name="broken_${l.id}" value="${l.returned_broken}" min="0" max="${l.qty_allocated}" ${editable ? '' : 'readonly'} style="width:60px;text-align:right;background:${editable ? '#0d1117' : '#161b22'};color:#f59e0b;border:1px solid #21262d;border-radius:4px;padding:3px 6px;font-weight:700"></td>
      <td style="padding:6px 10px;text-align:right"><input type="number" name="missing_${l.id}" value="${l.missing}" min="0" max="${l.qty_allocated}" ${editable ? '' : 'readonly'} style="width:60px;text-align:right;background:${editable ? '#0d1117' : '#161b22'};color:#ff7a66;border:1px solid #21262d;border-radius:4px;padding:3px 6px;font-weight:700"></td>
      <td style="padding:6px 10px;text-align:right"><input type="number" name="lost_${l.id}" value="${l.lost_on_site}" min="0" max="${l.qty_allocated}" ${editable ? '' : 'readonly'} style="width:60px;text-align:right;background:${editable ? '#0d1117' : '#161b22'};color:#ef4444;border:1px solid #21262d;border-radius:4px;padding:3px 6px;font-weight:700"></td>
      <td style="padding:6px 10px"><input type="text" name="notes_${l.id}" value="${esc(l.damage_notes || '')}" placeholder="${editable ? 'damage notes…' : ''}" ${editable ? '' : 'readonly'} style="width:100%;min-width:160px;background:${editable ? '#0d1117' : '#161b22'};color:#e5e7eb;border:1px solid #21262d;border-radius:4px;padding:4px 8px;font-size:12px"></td>
    </tr>
  `).join('')

  // Totals strip
  const total = lines.reduce((s, l) => s + l.qty_allocated, 0)
  const totalOk = lines.reduce((s, l) => s + l.returned_ok, 0)
  const totalBroken = lines.reduce((s, l) => s + l.returned_broken, 0)
  const totalMissing = lines.reduce((s, l) => s + l.missing, 0)
  const totalLost = lines.reduce((s, l) => s + l.lost_on_site, 0)
  const accountedFor = totalOk + totalBroken + totalMissing + totalLost
  const unaccounted = total - accountedFor

  const stats = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:16px">
      <div class="card" style="padding:10px"><div style="font-size:10px;color:#9ca3af;text-transform:uppercase">Allocated</div><div style="font-size:22px;font-weight:700;color:#C9A84C">${total}</div></div>
      <div class="card" style="padding:10px;border-left:3px solid #10b981"><div style="font-size:10px;color:#9ca3af;text-transform:uppercase">Returned OK</div><div style="font-size:22px;font-weight:700;color:#10b981">${totalOk}</div></div>
      <div class="card" style="padding:10px;border-left:3px solid #f59e0b"><div style="font-size:10px;color:#9ca3af;text-transform:uppercase">Broken</div><div style="font-size:22px;font-weight:700;color:#f59e0b">${totalBroken}</div></div>
      <div class="card" style="padding:10px;border-left:3px solid #ff7a66"><div style="font-size:10px;color:#9ca3af;text-transform:uppercase">Missing</div><div style="font-size:22px;font-weight:700;color:#ff7a66">${totalMissing}</div></div>
      <div class="card" style="padding:10px;border-left:3px solid #ef4444"><div style="font-size:10px;color:#9ca3af;text-transform:uppercase">Lost on site</div><div style="font-size:22px;font-weight:700;color:#ef4444">${totalLost}</div></div>
      <div class="card" style="padding:10px;${unaccounted !== 0 ? 'border-left:3px solid #fbbf24' : ''}"><div style="font-size:10px;color:#9ca3af;text-transform:uppercase">Unaccounted</div><div style="font-size:22px;font-weight:700;color:${unaccounted === 0 ? '#10b981' : '#fbbf24'}">${unaccounted}</div></div>
    </div>
  `

  const actionButtons = editable
    ? `<div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="submit" form="returnForm" name="action" value="save" class="btn btn-outline" style="color:#C9A84C;border-color:#C9A84C"><i class="fas fa-save"></i> Save draft</button>
        <button type="submit" form="returnForm" name="action" value="complete" class="btn btn-primary" onclick="return confirm('Complete this return? This will update stock_on_hand and create damage records — cannot be undone.')"><i class="fas fa-check"></i> Complete return</button>
        <button type="submit" form="returnForm" name="action" value="cancel" class="btn btn-outline" style="color:#ff7a66;border-color:#ff7a66" onclick="return confirm('Cancel this draft return? Lines will be discarded.')"><i class="fas fa-xmark"></i> Cancel draft</button>
       </div>`
    : `<div style="color:#9ca3af;font-size:13px;font-style:italic">${header.status === 'completed' ? `Completed ${esc(fmtDateTime(header.completed_at))}` : 'Cancelled'}</div>`

  const body = `
    <div style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">
        <div>
          <h1 style="margin:0;color:#C9A84C;font-size:22px"><i class="fas fa-rotate-left"></i> Return #${header.id} ${statusBadge(header.status)}</h1>
          <div style="color:#9ca3af;font-size:13px;margin-top:4px">
            Event: <a href="/calendar/${header.event_id}" style="color:#18D9FF;text-decoration:none">${esc(header.event_name || `#${header.event_id}`)}</a>
            ${header.event_date ? ` · ${esc(header.event_date)}` : ''}
            · Created by ${esc(header.created_by_name || '—')} at ${esc(fmtDateTime(header.created_at))}
          </div>
        </div>
        <a href="/admin/stock/returns" class="btn btn-outline"><i class="fas fa-arrow-left"></i> All returns</a>
      </div>
    </div>

    ${stats}

    <form id="returnForm" method="POST" action="/admin/stock/returns/${header.id}/save">
      <div class="card" style="padding:0;margin-bottom:16px;overflow:hidden">
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead style="background:#0d1117">
              <tr>
                <th style="text-align:left;padding:8px 10px;color:#9ca3af;font-size:11px;text-transform:uppercase">Item</th>
                <th style="text-align:right;padding:8px 10px;color:#9ca3af;font-size:11px;text-transform:uppercase">Sent</th>
                <th style="text-align:right;padding:8px 10px;color:#9ca3af;font-size:11px;text-transform:uppercase">OK</th>
                <th style="text-align:right;padding:8px 10px;color:#9ca3af;font-size:11px;text-transform:uppercase">Broken</th>
                <th style="text-align:right;padding:8px 10px;color:#9ca3af;font-size:11px;text-transform:uppercase">Missing</th>
                <th style="text-align:right;padding:8px 10px;color:#9ca3af;font-size:11px;text-transform:uppercase">Lost</th>
                <th style="text-align:left;padding:8px 10px;color:#9ca3af;font-size:11px;text-transform:uppercase">Damage notes</th>
              </tr>
            </thead>
            <tbody>${linesRows || `<tr><td colspan="7" style="padding:24px;text-align:center;color:#9ca3af">No allocations on this event.</td></tr>`}</tbody>
          </table>
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <textarea name="header_notes" placeholder="Overall return notes…" ${editable ? '' : 'readonly'}
          style="flex:1;min-width:280px;min-height:38px;background:${editable ? '#0d1117' : '#161b22'};color:#e5e7eb;border:1px solid #21262d;border-radius:6px;padding:8px 12px;font-size:13px">${esc(header.notes || '')}</textarea>
        ${actionButtons}
      </div>
    </form>

    <div style="margin-top:16px;padding-top:12px;border-top:1px solid #21262d;font-size:11px;color:#6b7280">
      Return ID #${header.id} · Lines: ${header.total_lines} · ${header.status === 'completed' ? `Completed by user #${header.completed_by} at ${esc(fmtDateTime(header.completed_at))}` : ''}
    </div>
  `

  return c.html(layout(`Return #${header.id}`, body, user, 'stock-admin'))
})

// ─── Save / complete / cancel ─────────────────────────────────────────────

returns.post('/:id/save', async (c) => {
  const user = c.get('user')
  const id = Number(c.req.param('id'))
  const form = await c.req.parseBody()
  const action = String(form.action || 'save')

  const r = await getReturn(c.env.DB, id)
  if (!r) return c.redirect('/admin/stock/returns')

  if (action === 'cancel') {
    await cancelReturn(c.env.DB, id, { id: user.id, name: user.name || user.email })
    return c.redirect('/admin/stock/returns')
  }

  // Collect line edits
  const lines: ReturnLineInput[] = r.lines.map(l => ({
    id: l.id,
    stock_item_id: l.stock_item_id,
    description: l.description,
    qty_allocated: l.qty_allocated,
    returned_ok:     Math.max(0, Number(form[`ok_${l.id}`])      || 0),
    returned_broken: Math.max(0, Number(form[`broken_${l.id}`])  || 0),
    missing:         Math.max(0, Number(form[`missing_${l.id}`]) || 0),
    lost_on_site:    Math.max(0, Number(form[`lost_${l.id}`])    || 0),
    damage_notes:    (form[`notes_${l.id}`] as string) || null,
  }))

  try {
    await saveReturnLines(c.env.DB, id, lines, { id: user.id, name: user.name || user.email })
  } catch (e: any) {
    return c.html(layout('Save failed', `<div class="card" style="padding:24px"><h2 style="color:#ff7a66">Save failed</h2><p>${esc(e?.message || 'Unknown error')}</p><a href="/admin/stock/returns/${id}" class="btn btn-outline">Back</a></div>`, user, 'stock-admin'), 400)
  }

  // Also save header notes
  await c.env.DB.prepare(`UPDATE stock_returns SET notes = ? WHERE id = ?`).bind(String(form.header_notes || ''), id).run()

  if (action === 'complete') {
    try {
      const result = await completeReturn(c.env.DB, id, { id: user.id, name: user.name || user.email })
      const body = `
        <div style="max-width:520px;margin:48px auto">
          <div class="card" style="padding:24px;border-left:3px solid #10b981">
            <h2 style="color:#10b981;margin:0"><i class="fas fa-check-circle"></i> Return #${id} completed</h2>
            <ul style="color:#e5e7eb;margin-top:12px;line-height:1.8">
              <li>${result.moved} stock movements written</li>
              <li>${result.damages} damage records created</li>
              <li>${result.shortagesResolved} shortage${result.shortagesResolved === 1 ? '' : 's'} auto-resolved</li>
            </ul>
            <div style="margin-top:16px;display:flex;gap:8px">
              <a href="/admin/stock/returns/${id}" class="btn btn-outline">View return</a>
              <a href="/admin/stock/returns" class="btn btn-primary">All returns</a>
            </div>
          </div>
        </div>
      `
      return c.html(layout('Return completed', body, user, 'stock-admin'))
    } catch (e: any) {
      return c.html(layout('Complete failed', `<div class="card" style="padding:24px"><h2 style="color:#ff7a66">Complete failed</h2><p>${esc(e?.message || 'Unknown error')}</p><a href="/admin/stock/returns/${id}" class="btn btn-outline">Back</a></div>`, user, 'stock-admin'), 400)
    }
  }

  return c.redirect(`/admin/stock/returns/${id}`)
})

export default returns
