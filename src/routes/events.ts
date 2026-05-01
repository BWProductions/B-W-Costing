// Events routes

import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth.js'
import { layout } from '../lib/layout.js'
import { formatDate, statusBadge } from '../lib/format.js'
import type { AuthUser } from '../lib/auth.js'

type Env = { Bindings: { DB: D1Database }; Variables: { user: AuthUser } }

const events = new Hono<Env>()
events.use('*', requireAuth)

events.get('/', async (c) => {
  const user = c.get('user')
  const filter = c.req.query('status') ?? ''
  const msg = c.req.query('msg')

  const rows = await c.env.DB.prepare(
    `SELECT e.*, c.name as client_name,
      (SELECT COUNT(*) FROM quotes q WHERE q.event_id=e.id) as quote_count
     FROM events e JOIN clients c ON e.client_id=c.id
     ${filter ? 'WHERE e.status=?' : ''}
     ORDER BY e.event_date ASC`
  ).bind(...(filter ? [filter] : [])).all<any>()

  const statuses = ['brief','quoted','won','lost','delivered','cancelled']

  const filterTabs = ['', ...statuses].map(s => `
    <a href="/events${s ? '?status='+s : ''}" class="btn btn-sm ${filter===s ? 'btn-gold' : 'btn-outline'}">
      ${s ? s.charAt(0).toUpperCase()+s.slice(1) : 'All'}
    </a>`).join('')

  const tableRows = rows.results.map((e: any) => `
    <tr>
      <td>
        <a href="/events/${e.id}" style="color:var(--bw-gold);text-decoration:none;font-weight:600">${e.name}</a>
        ${e.is_sab_event ? ' <span class="badge badge-sab">SAB</span>' : ''}
      </td>
      <td class="muted hide-mobile">${e.client_name}</td>
      <td class="muted">${formatDate(e.event_date)}</td>
      <td class="muted hide-mobile">${e.venue || '—'}</td>
      <td>${e.pax?.toLocaleString() ?? '—'}</td>
      <td>${statusBadge(e.status)}</td>
      <td>
        <a href="/events/${e.id}" class="btn btn-outline btn-sm">View</a>
        ${e.status === 'brief' || e.status === 'quoted' ? `<a href="/quotes/new?event_id=${e.id}" class="btn btn-gold btn-sm" style="margin-left:4px">Quote</a>` : ''}
      </td>
    </tr>`).join('')

  const body = `
    ${msg === 'saved' ? '<div class="alert alert-success">✅ Event saved.</div>' : ''}
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">
      <div style="display:flex;gap:6px;flex-wrap:wrap">${filterTabs}</div>
      <a href="/events/new" class="btn btn-gold btn-sm"><i class="fas fa-plus"></i> New Event</a>
    </div>
    <div class="card">
      <div class="card-header">
        <span class="card-title">📅 Events (${rows.results.length})</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Event</th>
            <th class="hide-mobile">Client</th>
            <th>Date</th>
            <th class="hide-mobile">Venue</th>
            <th>Pax</th>
            <th>Status</th>
            <th>Actions</th>
          </tr></thead>
          <tbody>${tableRows || '<tr><td colspan="7" class="text-muted" style="text-align:center;padding:24px">No events. <a href="/events/new" style="color:var(--bw-gold)">Create one →</a></td></tr>'}</tbody>
        </table>
      </div>
    </div>`

  return c.html(layout('Events', body, user, 'events'))
})

events.get('/new', async (c) => {
  const user = c.get('user')
  const clientsList = await c.env.DB.prepare('SELECT id, name, type FROM clients WHERE active=1 ORDER BY name').all<any>()
  return c.html(layout('New Event', eventForm(null, clientsList.results), user, 'events'))
})

events.get('/:id', async (c) => {
  const user = c.get('user')
  const ev = await c.env.DB.prepare(
    `SELECT e.*, c.name as client_name, c.vat_number as client_vat, c.payment_terms as client_terms
     FROM events e JOIN clients c ON e.client_id=c.id WHERE e.id=?`
  ).bind(c.req.param('id')).first<any>()
  if (!ev) return c.redirect('/events')

  const quotes = await c.env.DB.prepare(
    `SELECT q.*, u.name as created_by_name FROM quotes q
     LEFT JOIN users u ON q.created_by=u.id
     WHERE q.event_id=? ORDER BY q.created_at DESC`
  ).bind(ev.id).all<any>()

  const quoteRows = quotes.results.map((q: any) => `
    <tr>
      <td><a href="/quotes/${q.id}" style="color:var(--bw-gold);text-decoration:none;font-weight:600">${q.quote_number}</a></td>
      <td>v${q.version}</td>
      <td>${statusBadge(q.status)}</td>
      <td>${q.load_class ? `<span class="badge badge-gold">L${q.load_class.replace('L','')}</span>` : '—'}</td>
      <td class="text-right">R ${(q.total||0).toLocaleString('en-ZA',{minimumFractionDigits:2})}</td>
      <td class="muted hide-mobile">${q.created_by_name || '—'}</td>
      <td>
        <a href="/quotes/${q.id}" class="btn btn-outline btn-sm">View</a>
      </td>
    </tr>`).join('')

  const body = `
    <div style="margin-bottom:16px;display:flex;gap:10px;align-items:center">
      <a href="/events" class="btn btn-outline btn-sm">← Events</a>
      <a href="/events/${ev.id}/edit" class="btn btn-outline btn-sm">Edit Event</a>
      <a href="/quotes/new?event_id=${ev.id}" class="btn btn-gold btn-sm">+ New Quote</a>
      <form method="POST" action="/events/${ev.id}/status" style="display:flex;gap:6px;align-items:center;margin-left:auto">
        <select name="status" onchange="this.form.submit()" style="padding:6px 10px;font-size:12px;background:var(--bw-black);border:1px solid var(--bw-border2);border-radius:6px;color:var(--bw-white)">
          <option value="">Move to…</option>
          ${['brief','quoted','won','lost','delivered','cancelled'].map(s =>
            `<option value="${s}" ${ev.status===s?'selected':''}>${s.charAt(0).toUpperCase()+s.slice(1)}</option>`
          ).join('')}
        </select>
      </form>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px" class="responsive-grid">
      <div class="card">
        <div class="card-header">
          <span class="card-title">${ev.name}</span>
          ${statusBadge(ev.status)}
        </div>
        <table style="width:100%">
          <tr><td class="muted" style="padding:6px 0;width:40%">Client</td><td><strong>${ev.client_name}</strong></td></tr>
          <tr><td class="muted" style="padding:6px 0">Date</td><td>${formatDate(ev.event_date)}</td></tr>
          <tr><td class="muted" style="padding:6px 0">Venue</td><td>${ev.venue || '—'}</td></tr>
          <tr><td class="muted" style="padding:6px 0">City</td><td>${ev.venue_city || '—'}</td></tr>
          <tr><td class="muted" style="padding:6px 0">Pax</td><td><strong>${ev.pax?.toLocaleString() ?? '—'}</strong></td></tr>
          <tr><td class="muted" style="padding:6px 0">SAB Event</td><td>${ev.is_sab_event ? '<span class="badge badge-sab">Yes — SAB</span>' : 'No'}</td></tr>
          <tr><td class="muted" style="padding:6px 0">Client VAT</td><td>${ev.client_vat || '—'}</td></tr>
          <tr><td class="muted" style="padding:6px 0">Pay Terms</td><td>${ev.client_terms ?? 30} days</td></tr>
        </table>
        ${ev.notes ? `<div style="margin-top:12px;padding:10px;background:var(--bw-black);border-radius:8px;font-size:12px;color:var(--bw-muted)">${ev.notes}</div>` : ''}
      </div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">Quotes</span>
          <a href="/quotes/new?event_id=${ev.id}" class="btn btn-gold btn-sm">+ Quote</a>
        </div>
        <table>
          <thead><tr><th>Quote #</th><th>Ver</th><th>Status</th><th>Class</th><th class="text-right">Total</th><th class="hide-mobile">By</th><th></th></tr></thead>
          <tbody>${quoteRows || '<tr><td colspan="7" class="text-muted" style="padding:16px;text-align:center">No quotes yet</td></tr>'}</tbody>
        </table>
      </div>
    </div>
    <style>.responsive-grid{grid-template-columns:1fr 1fr}@media(max-width:768px){.responsive-grid{grid-template-columns:1fr}}</style>`

  return c.html(layout(ev.name, body, user, 'events'))
})

events.get('/:id/edit', async (c) => {
  const user = c.get('user')
  const ev = await c.env.DB.prepare('SELECT * FROM events WHERE id=?').bind(c.req.param('id')).first<any>()
  if (!ev) return c.redirect('/events')
  const clientsList = await c.env.DB.prepare('SELECT id, name, type FROM clients WHERE active=1 ORDER BY name').all<any>()
  return c.html(layout('Edit Event', eventForm(ev, clientsList.results), user, 'events'))
})

events.post('/new', async (c) => {
  const user = c.get('user')
  const b = await c.req.parseBody()
  const result = await c.env.DB.prepare(`
    INSERT INTO events (client_id,name,event_date,venue,venue_city,pax,status,is_sab_event,notes,created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).bind(Number(b.client_id),b.name,b.event_date,b.venue||null,b.venue_city||null,
    Number(b.pax)||0,b.status||'brief',b.is_sab_event==='on'?1:0,b.notes||null,user.id).run()
  const id = result.meta.last_row_id
  return c.redirect(`/events/${id}?msg=saved`)
})

events.post('/:id/edit', async (c) => {
  const b = await c.req.parseBody()
  await c.env.DB.prepare(`
    UPDATE events SET client_id=?,name=?,event_date=?,venue=?,venue_city=?,pax=?,
    status=?,is_sab_event=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`
  ).bind(Number(b.client_id),b.name,b.event_date,b.venue||null,b.venue_city||null,
    Number(b.pax)||0,b.status||'brief',b.is_sab_event==='on'?1:0,
    b.notes||null,c.req.param('id')).run()
  return c.redirect(`/events/${c.req.param('id')}?msg=saved`)
})

events.post('/:id/status', async (c) => {
  const b = await c.req.parseBody()
  if (b.status) {
    await c.env.DB.prepare('UPDATE events SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .bind(b.status, c.req.param('id')).run()
  }
  return c.redirect(`/events/${c.req.param('id')}`)
})

function eventForm(ev: any, clientsList: any[]): string {
  const isEdit = !!ev
  const clientOptions = clientsList.map(cl =>
    `<option value="${cl.id}" ${ev?.client_id===cl.id?'selected':''}>${cl.name}${cl.type==='sab'?' (SAB)':''}</option>`
  ).join('')

  return `
    <div style="max-width:720px">
      <div style="margin-bottom:16px"><a href="/events" class="btn btn-outline btn-sm">← Back to Events</a></div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">${isEdit ? `Edit — ${ev.name}` : 'New Event'}</span>
        </div>
        <form method="POST" action="${isEdit ? `/events/${ev.id}/edit` : '/events/new'}">
          <div class="form-grid">
            <div class="form-group full"><label>Event Name *</label>
              <input name="name" value="${ev?.name??''}" required placeholder="e.g. Castle Lager Heritage Fest 2025"></div>
            <div class="form-group"><label>Client *</label>
              <select name="client_id" required>
                <option value="">Select client…</option>
                ${clientOptions}
              </select></div>
            <div class="form-group"><label>Event Date *</label>
              <input type="date" name="event_date" value="${ev?.event_date??''}" required></div>
            <div class="form-group"><label>Venue / Location</label>
              <input name="venue" value="${ev?.venue??''}" placeholder="e.g. Johannesburg Expo Centre"></div>
            <div class="form-group"><label>City</label>
              <input name="venue_city" value="${ev?.venue_city??''}" placeholder="e.g. Johannesburg"></div>
            <div class="form-group"><label>Expected Pax</label>
              <input type="number" name="pax" value="${ev?.pax??''}" min="0" placeholder="e.g. 500"></div>
            <div class="form-group"><label>Status</label>
              <select name="status">
                ${['brief','quoted','won','lost','delivered','cancelled'].map(s =>
                  `<option value="${s}" ${ev?.status===s?'selected':''}>${s.charAt(0).toUpperCase()+s.slice(1)}</option>`
                ).join('')}
              </select></div>
            <div class="form-group full"><label>Notes / Brief</label>
              <textarea name="notes" placeholder="Event brief, special requirements, client notes…">${ev?.notes??''}</textarea></div>
            <div class="form-group full">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;text-transform:none;font-size:13px">
                <input type="checkbox" name="is_sab_event" ${ev?.is_sab_event?'checked':''} style="width:auto">
                <span>🔵 SAB Event — enables SAB-restricted fleet (MAN truck FC 89 PN GP) and SAB KPIs</span>
              </label>
            </div>
          </div>
          <div style="margin-top:20px;display:flex;gap:10px">
            <button type="submit" class="btn btn-gold">${isEdit ? '💾 Save Changes' : '➕ Create Event'}</button>
            <a href="/events" class="btn btn-outline">Cancel</a>
          </div>
        </form>
      </div>
    </div>`
}

export default events
