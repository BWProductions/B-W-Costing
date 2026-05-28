// ─────────────────────────────────────────────────────────────────────────
// Phase 14: Quote ↔ Calendar Event handshake
// Mounted under /admin/quote-link
// ─────────────────────────────────────────────────────────────────────────
//
// Two-way linker between quotes and calendar_events.
// Adds:
//   GET  /admin/quote-link                 — list of orphan quotes / events
//   POST /admin/quote-link/:quoteId/to/:eventId  — link quote → event
//   POST /admin/quote-link/:quoteId/unlink      — unlink

import { Hono } from 'hono'
import type { AuthUser } from '../lib/auth.js'
import { requireAuth } from '../middleware/auth.js'
import { layout } from '../lib/layout.js'

type Bindings = { DB: D1Database }
type Variables = { user: AuthUser }
const ql = new Hono<{ Bindings: Bindings; Variables: Variables }>()
ql.use('*', requireAuth)

function esc(s: any): string {
  if (s === null || s === undefined) return ''
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

ql.get('/', async (c) => {
  const user = c.get('user')

  // Quotes without a calendar_event link
  const orphanQuotes = await c.env.DB.prepare(`
    SELECT q.id, q.quote_number, q.status, q.total, q.created_at,
           e.name AS event_name, c.name AS client_name
    FROM quotes q
    LEFT JOIN events e   ON e.id = q.event_id
    LEFT JOIN clients c  ON c.id = e.client_id
    WHERE q.calendar_event_id IS NULL
      AND q.status IN ('accepted', 'sent', 'draft')
    ORDER BY q.created_at DESC
    LIMIT 100
  `).all<any>().catch(() => ({ results: [] as any[] }))

  // Calendar events without a linked quote
  const orphanEvents = await c.env.DB.prepare(`
    SELECT ce.id, ce.event_date, ce.event_name, ce.status, ce.brand
    FROM calendar_events ce
    WHERE ce.quote_id IS NULL
      AND ce.status != 'cancelled'
    ORDER BY ce.event_date DESC
    LIMIT 100
  `).all<any>().catch(() => ({ results: [] as any[] }))

  // Linked pairs
  const linked = await c.env.DB.prepare(`
    SELECT q.id AS quote_id, q.quote_number, q.total, q.status AS quote_status,
           ce.id AS event_id, ce.event_date, ce.event_name, ce.status AS event_status
    FROM quotes q
    JOIN calendar_events ce ON ce.id = q.calendar_event_id
    ORDER BY ce.event_date DESC
    LIMIT 100
  `).all<any>().catch(() => ({ results: [] as any[] }))

  const eventOptions = (orphanEvents.results || []).map((e: any) =>
    `<option value="${e.id}">${esc(e.event_date)} · ${esc(e.event_name)}</option>`
  ).join('')

  const quoteRows = (orphanQuotes.results || []).map((q: any) => `
    <tr style="border-top:1px solid #21262d">
      <td style="padding:6px 10px"><a href="/quotes/${q.id}" style="color:#C9A84C;text-decoration:none;font-weight:700">${esc(q.quote_number || `#${q.id}`)}</a></td>
      <td style="padding:6px 10px;color:#e5e7eb">${esc(q.event_name || '—')}</td>
      <td style="padding:6px 10px;color:#9ca3af">${esc(q.client_name || '—')}</td>
      <td style="padding:6px 10px;color:#9ca3af">${esc(q.status)}</td>
      <td style="padding:6px 10px;text-align:right;color:#e5e7eb;font-family:monospace">R ${Number(q.total || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</td>
      <td style="padding:6px 10px">
        <form method="POST" action="/admin/quote-link/${q.id}/link" style="display:flex;gap:4px">
          <select name="event_id" required style="background:#0d1117;color:#e5e7eb;border:1px solid #21262d;border-radius:4px;padding:4px 6px;font-size:11px;max-width:200px">
            <option value="">— pick event —</option>
            ${eventOptions}
          </select>
          <button type="submit" class="btn btn-primary" style="font-size:11px;padding:4px 8px"><i class="fas fa-link"></i></button>
        </form>
      </td>
    </tr>
  `).join('')

  const linkedRows = (linked.results || []).map((l: any) => `
    <tr style="border-top:1px solid #21262d">
      <td style="padding:6px 10px"><a href="/quotes/${l.quote_id}" style="color:#C9A84C;text-decoration:none;font-weight:700">${esc(l.quote_number || `#${l.quote_id}`)}</a></td>
      <td style="padding:6px 10px;color:#9ca3af"><i class="fas fa-arrow-right"></i></td>
      <td style="padding:6px 10px"><a href="/calendar/${l.event_id}" style="color:#18D9FF;text-decoration:none">${esc(l.event_name)}</a></td>
      <td style="padding:6px 10px;color:#9ca3af">${esc(l.event_date)}</td>
      <td style="padding:6px 10px;text-align:right;color:#e5e7eb;font-family:monospace">R ${Number(l.total || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</td>
      <td style="padding:6px 10px">
        <a href="/admin/costs/${l.event_id}" class="btn btn-outline" style="font-size:11px;padding:4px 8px"><i class="fas fa-coins"></i> P&amp;L</a>
        <form method="POST" action="/admin/quote-link/${l.quote_id}/unlink" style="display:inline" onsubmit="return confirm('Unlink this quote from the event?')">
          <button class="btn btn-outline" style="font-size:11px;padding:4px 8px;color:#ef4444;border-color:#ef4444"><i class="fas fa-link-slash"></i></button>
        </form>
      </td>
    </tr>
  `).join('')

  const body = `
    <div style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <div>
          <h1 style="margin:0;color:#C9A84C;font-size:22px"><i class="fas fa-link"></i> Quote ↔ Event Links</h1>
          <div style="color:#9ca3af;font-size:13px;margin-top:4px">Connect quotes to calendar events for P&amp;L tracking.</div>
        </div>
        <a href="/admin/costs" class="btn btn-outline"><i class="fas fa-arrow-left"></i> Back to Costs</a>
      </div>
    </div>

    <div class="card" style="padding:0;margin-bottom:16px;overflow:hidden">
      <div style="padding:12px 14px;border-bottom:1px solid #21262d;background:#0d1117">
        <div style="font-size:13px;color:#e5e7eb;font-weight:700">Linked quotes &amp; events (${linked.results?.length || 0})</div>
      </div>
      ${linked.results?.length
        ? `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead style="background:#0d1117"><tr><th style="text-align:left;padding:8px 10px;color:#9ca3af;font-size:11px;text-transform:uppercase">Quote</th><th></th><th style="text-align:left;padding:8px 10px;color:#9ca3af;font-size:11px;text-transform:uppercase">Event</th><th style="text-align:left;padding:8px 10px;color:#9ca3af;font-size:11px;text-transform:uppercase">Date</th><th style="text-align:right;padding:8px 10px;color:#9ca3af;font-size:11px;text-transform:uppercase">Value</th><th></th></tr></thead><tbody>${linkedRows}</tbody></table></div>`
        : `<div style="padding:24px;text-align:center;color:#9ca3af">No quote↔event links yet.</div>`
      }
    </div>

    <div class="card" style="padding:0;overflow:hidden">
      <div style="padding:12px 14px;border-bottom:1px solid #21262d;background:#0d1117">
        <div style="font-size:13px;color:#e5e7eb;font-weight:700">Orphan quotes (${orphanQuotes.results?.length || 0})</div>
        <div style="font-size:11px;color:#9ca3af">Pick a calendar event to link each quote to.</div>
      </div>
      ${orphanQuotes.results?.length
        ? `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead style="background:#0d1117"><tr><th style="text-align:left;padding:8px 10px;color:#9ca3af;font-size:11px;text-transform:uppercase">#</th><th style="text-align:left;padding:8px 10px;color:#9ca3af;font-size:11px;text-transform:uppercase">Legacy event</th><th style="text-align:left;padding:8px 10px;color:#9ca3af;font-size:11px;text-transform:uppercase">Client</th><th style="text-align:left;padding:8px 10px;color:#9ca3af;font-size:11px;text-transform:uppercase">Status</th><th style="text-align:right;padding:8px 10px;color:#9ca3af;font-size:11px;text-transform:uppercase">Total</th><th style="text-align:left;padding:8px 10px;color:#9ca3af;font-size:11px;text-transform:uppercase">Link to</th></tr></thead><tbody>${quoteRows}</tbody></table></div>`
        : `<div style="padding:24px;text-align:center;color:#9ca3af">No orphan quotes — every quote is linked.</div>`
      }
    </div>
  `
  return c.html(layout('Quote ↔ Event Links', body, user, 'stock-admin'))
})

ql.post('/:id/link', async (c) => {
  const id = Number(c.req.param('id'))
  const form = await c.req.parseBody()
  const eventId = Number(form.event_id)
  if (!eventId) return c.redirect('/admin/quote-link')

  // Fetch quote number for denormalised storage on calendar_events
  const q = await c.env.DB.prepare(`SELECT quote_number FROM quotes WHERE id = ?`).bind(id).first<{ quote_number: string }>()
  await c.env.DB.prepare(`UPDATE quotes SET calendar_event_id = ? WHERE id = ?`).bind(eventId, id).run()
  await c.env.DB.prepare(`UPDATE calendar_events SET quote_id = ?, quote_number = ? WHERE id = ?`).bind(id, q?.quote_number || null, eventId).run()
  return c.redirect('/admin/quote-link')
})

ql.post('/:id/unlink', async (c) => {
  const id = Number(c.req.param('id'))
  // Find linked event first
  const link = await c.env.DB.prepare(`SELECT calendar_event_id FROM quotes WHERE id = ?`).bind(id).first<{ calendar_event_id: number }>()
  await c.env.DB.prepare(`UPDATE quotes SET calendar_event_id = NULL WHERE id = ?`).bind(id).run()
  if (link?.calendar_event_id) {
    await c.env.DB.prepare(`UPDATE calendar_events SET quote_id = NULL, quote_number = NULL WHERE id = ?`).bind(link.calendar_event_id).run()
  }
  return c.redirect('/admin/quote-link')
})

export default ql
