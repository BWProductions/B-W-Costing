// Clients routes

import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth.js'
import { layout } from '../lib/layout.js'
import { formatDate, statusBadge } from '../lib/format.js'
import type { AuthUser } from '../lib/auth.js'

type Env = { Bindings: { DB: D1Database }; Variables: { user: AuthUser } }

const clients = new Hono<Env>()
clients.use('*', requireAuth)

clients.get('/', async (c) => {
  const user = c.get('user')
  const msg = c.req.query('msg')
  const rows = await c.env.DB.prepare(
    `SELECT c.*, COUNT(e.id) as event_count
     FROM clients c LEFT JOIN events e ON e.client_id=c.id
     WHERE c.active=1 GROUP BY c.id ORDER BY c.name`
  ).all<any>()

  const tableRows = rows.results.map((cl: any) => `
    <tr>
      <td>
        <a href="/clients/${cl.id}" style="color:var(--bw-gold);text-decoration:none;font-weight:600">${cl.name}</a>
        ${cl.type === 'sab' ? ' <span class="badge badge-sab">SAB</span>' : ''}
      </td>
      <td class="muted hide-mobile">${clientTypeLabel(cl.type)}</td>
      <td class="muted hide-mobile">${cl.vat_number || '—'}</td>
      <td class="muted hide-mobile">${cl.payment_terms ?? 30} days</td>
      <td>${cl.event_count ?? 0}</td>
      <td class="muted hide-mobile">${cl.contact_primary || '—'}</td>
      <td>
        <a href="/clients/${cl.id}/edit" class="btn btn-outline btn-sm">Edit</a>
      </td>
    </tr>`).join('')

  const body = `
    ${msg === 'saved' ? '<div class="alert alert-success">✅ Client saved.</div>' : ''}
    <div class="card">
      <div class="card-header">
        <span class="card-title">🏢 All Clients (${rows.results.length})</span>
        <a href="/clients/new" class="btn btn-gold btn-sm"><i class="fas fa-plus"></i> Add Client</a>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Client Name</th>
              <th class="hide-mobile">Type</th>
              <th class="hide-mobile">VAT No.</th>
              <th class="hide-mobile">Payment Terms</th>
              <th>Events</th>
              <th class="hide-mobile">Contact</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${tableRows || '<tr><td colspan="7" class="text-muted" style="text-align:center;padding:24px">No clients yet</td></tr>'}</tbody>
        </table>
      </div>
    </div>`

  return c.html(layout('Clients', body, user, 'clients'))
})

clients.get('/new', (c) => {
  const user = c.get('user')
  return c.html(layout('New Client', clientForm(null), user, 'clients'))
})

clients.get('/:id', async (c) => {
  const user = c.get('user')
  const cl = await c.env.DB.prepare('SELECT * FROM clients WHERE id=?').bind(c.req.param('id')).first<any>()
  if (!cl) return c.redirect('/clients')
  const events = await c.env.DB.prepare(
    'SELECT * FROM events WHERE client_id=? ORDER BY event_date DESC LIMIT 10'
  ).bind(cl.id).all<any>()

  const evRows = events.results.map((e: any) => `
    <tr>
      <td><a href="/events/${e.id}" style="color:var(--bw-gold);text-decoration:none">${e.name}</a></td>
      <td class="muted">${formatDate(e.event_date)}</td>
      <td>${e.pax?.toLocaleString() ?? '—'}</td>
      <td>${statusBadge(e.status)}</td>
    </tr>`).join('')

  const body = `
    <div style="margin-bottom:16px"><a href="/clients" class="btn btn-outline btn-sm">← Back to Clients</a></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px" class="responsive-grid">
      <div class="card">
        <div class="card-header">
          <span class="card-title">${cl.name}</span>
          <a href="/clients/${cl.id}/edit" class="btn btn-outline btn-sm">Edit</a>
        </div>
        <table style="width:100%">
          <tr><td class="muted" style="padding:6px 0;width:40%">Type</td><td>${clientTypeLabel(cl.type)}</td></tr>
          <tr><td class="muted" style="padding:6px 0">VAT No.</td><td>${cl.vat_number || '—'}</td></tr>
          <tr><td class="muted" style="padding:6px 0">Reg No.</td><td>${cl.reg_number || '—'}</td></tr>
          <tr><td class="muted" style="padding:6px 0">Payment Terms</td><td>${cl.payment_terms ?? 30} days</td></tr>
          <tr><td class="muted" style="padding:6px 0">Contact</td><td>${cl.contact_primary || '—'}</td></tr>
          <tr><td class="muted" style="padding:6px 0">Email</td><td>${cl.contact_email || '—'}</td></tr>
          <tr><td class="muted" style="padding:6px 0">Phone</td><td>${cl.contact_phone || '—'}</td></tr>
        </table>
        ${cl.notes ? `<div style="margin-top:12px;padding:10px;background:var(--bw-black);border-radius:8px;font-size:12px;color:var(--bw-muted)">${cl.notes}</div>` : ''}
      </div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">Events</span>
          <a href="/events/new" class="btn btn-gold btn-sm">+ New Event</a>
        </div>
        <table><thead><tr><th>Name</th><th>Date</th><th>Pax</th><th>Status</th></tr></thead>
        <tbody>${evRows || '<tr><td colspan="4" class="text-muted" style="padding:16px;text-align:center">No events yet</td></tr>'}</tbody></table>
      </div>
    </div>
    <style>.responsive-grid{grid-template-columns:1fr 1fr}@media(max-width:768px){.responsive-grid{grid-template-columns:1fr}}</style>`

  return c.html(layout(cl.name, body, user, 'clients'))
})

clients.get('/:id/edit', async (c) => {
  const user = c.get('user')
  const cl = await c.env.DB.prepare('SELECT * FROM clients WHERE id=?').bind(c.req.param('id')).first<any>()
  if (!cl) return c.redirect('/clients')
  return c.html(layout('Edit Client', clientForm(cl), user, 'clients'))
})

clients.post('/new', async (c) => {
  const b = await c.req.parseBody()
  await c.env.DB.prepare(`
    INSERT INTO clients (name,type,vat_number,reg_number,payment_terms,credit_limit,contact_primary,contact_email,contact_phone,billing_address,notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(b.name,b.type,b.vat_number||null,b.reg_number||null,Number(b.payment_terms)||30,
    Number(b.credit_limit)||0,b.contact_primary||null,b.contact_email||null,
    b.contact_phone||null,b.billing_address||null,b.notes||null).run()
  return c.redirect('/clients?msg=saved')
})

clients.post('/:id/edit', async (c) => {
  const b = await c.req.parseBody()
  await c.env.DB.prepare(`
    UPDATE clients SET name=?,type=?,vat_number=?,reg_number=?,payment_terms=?,
    credit_limit=?,contact_primary=?,contact_email=?,contact_phone=?,billing_address=?,notes=?
    WHERE id=?`
  ).bind(b.name,b.type,b.vat_number||null,b.reg_number||null,Number(b.payment_terms)||30,
    Number(b.credit_limit)||0,b.contact_primary||null,b.contact_email||null,
    b.contact_phone||null,b.billing_address||null,b.notes||null,c.req.param('id')).run()
  return c.redirect(`/clients/${c.req.param('id')}?msg=saved`)
})

function clientForm(cl: any): string {
  const isEdit = !!cl
  return `
    <div style="max-width:720px">
      <div style="margin-bottom:16px"><a href="/clients" class="btn btn-outline btn-sm">← Back</a></div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">${isEdit ? `Edit — ${cl.name}` : 'New Client'}</span>
        </div>
        <form method="POST" action="${isEdit ? `/clients/${cl.id}/edit` : '/clients/new'}">
          <div class="form-grid">
            <div class="form-group full"><label>Client Name *</label>
              <input name="name" value="${cl?.name??''}" required placeholder="e.g. SAB Miller"></div>
            <div class="form-group"><label>Client Type</label>
              <select name="type">
                ${[['corporate','Corporate'],['sab','SAB'],['agency','Agency'],['government','Government'],['ngo','NGO'],['private','Private']].map(([v,l]) =>
                  `<option value="${v}" ${cl?.type===v?'selected':''}>${l}</option>`).join('')}
              </select></div>
            <div class="form-group"><label>Payment Terms (days)</label>
              <input type="number" name="payment_terms" value="${cl?.payment_terms??30}" min="0"></div>
            <div class="form-group"><label>VAT Number</label>
              <input name="vat_number" value="${cl?.vat_number??''}" placeholder="4XXXXXXXXX"></div>
            <div class="form-group"><label>Company Reg No.</label>
              <input name="reg_number" value="${cl?.reg_number??''}" placeholder="2009/XXXXXX/XX"></div>
            <div class="form-group"><label>Primary Contact</label>
              <input name="contact_primary" value="${cl?.contact_primary??''}" placeholder="Name"></div>
            <div class="form-group"><label>Email</label>
              <input type="email" name="contact_email" value="${cl?.contact_email??''}" placeholder="email@company.co.za"></div>
            <div class="form-group"><label>Phone</label>
              <input name="contact_phone" value="${cl?.contact_phone??''}" placeholder="082 555 0000"></div>
            <div class="form-group full"><label>Billing Address</label>
              <textarea name="billing_address" placeholder="Street, City, Postal Code">${cl?.billing_address??''}</textarea></div>
            <div class="form-group full"><label>Notes</label>
              <textarea name="notes" placeholder="Any notes about payment history, preferences, etc.">${cl?.notes??''}</textarea></div>
          </div>
          <div style="margin-top:20px;display:flex;gap:10px">
            <button type="submit" class="btn btn-gold">${isEdit ? '💾 Save Changes' : '➕ Add Client'}</button>
            <a href="/clients" class="btn btn-outline">Cancel</a>
          </div>
        </form>
      </div>
    </div>`
}

function clientTypeLabel(t: string): string {
  const m: Record<string,string> = { corporate:'Corporate', sab:'SAB', agency:'Agency', government:'Government', ngo:'NGO', private:'Private' }
  return m[t] ?? t
}

export default clients
