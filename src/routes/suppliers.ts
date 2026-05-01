// Suppliers routes

import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth.js'
import { layout } from '../lib/layout.js'
import type { AuthUser } from '../lib/auth.js'

type Env = { Bindings: { DB: D1Database }; Variables: { user: AuthUser } }

const suppliers = new Hono<Env>()
suppliers.use('*', requireAuth)

suppliers.get('/', async (c) => {
  const user = c.get('user')
  const msg = c.req.query('msg')
  const rows = await c.env.DB.prepare(
    `SELECT s.*, COUNT(rc.id) as rate_card_items
     FROM suppliers s LEFT JOIN rate_card rc ON rc.supplier_id=s.id
     WHERE s.active=1 GROUP BY s.id ORDER BY s.role, s.name`
  ).all<any>()

  // Group by role
  const byRole: Record<string, any[]> = {}
  for (const s of rows.results) {
    if (!byRole[s.role]) byRole[s.role] = []
    byRole[s.role].push(s)
  }

  const roleOrder = ['COS','CAPEX','Expendable','Pass-Through','OPEX']
  const roleColors: Record<string,string> = {
    COS: '#10b981', CAPEX: '#3b82f6', Expendable: '#f59e0b',
    'Pass-Through': '#8b5cf6', OPEX: '#6b7280'
  }

  const sections = roleOrder.map(role => {
    const sups = byRole[role] ?? []
    if (!sups.length) return ''
    const supRows = sups.map((s: any) => `
      <tr>
        <td>
          <a href="/suppliers/${s.id}/edit" style="color:var(--bw-gold);text-decoration:none;font-weight:600">${s.name}</a>
          ${!s.vat_registered ? '<br><span style="font-size:10px;color:var(--bw-danger)">⚠ Not VAT registered</span>' : ''}
        </td>
        <td class="muted hide-mobile">${s.vat_number || '—'}</td>
        <td class="muted hide-mobile">${s.payment_terms ?? 30} days</td>
        <td class="muted hide-mobile">${s.contact_name || '—'}</td>
        <td class="muted hide-mobile">${s.contact_phone || '—'}</td>
        <td>${s.rate_card_items ?? 0}</td>
        <td>
          ${vatFlag(s)}
          ${paymentFlag(s)}
        </td>
        <td>
          <a href="/suppliers/${s.id}/edit" class="btn btn-outline btn-sm">Edit</a>
        </td>
      </tr>`).join('')

    return `
      <div class="card" style="margin-bottom:16px">
        <div class="card-header">
          <span class="card-title" style="display:flex;align-items:center;gap:8px">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${roleColors[role] ?? '#888'}"></span>
            ${role} <span class="text-muted" style="font-size:12px;font-weight:400">(${sups.length})</span>
          </span>
          <span class="text-muted" style="font-size:12px">${roleDesc(role)}</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Supplier</th>
              <th class="hide-mobile">VAT No.</th>
              <th class="hide-mobile">Terms</th>
              <th class="hide-mobile">Contact</th>
              <th class="hide-mobile">Phone</th>
              <th>Rate Items</th>
              <th>Flags</th>
              <th></th>
            </tr></thead>
            <tbody>${supRows}</tbody>
          </table>
        </div>
      </div>`
  }).join('')

  const vatIssues = rows.results.filter((s: any) => !s.vat_registered).length
  const body = `
    ${msg === 'saved' ? '<div class="alert alert-success">✅ Supplier saved.</div>' : ''}
    ${vatIssues > 0 ? `<div class="alert alert-warn">⚠ ${vatIssues} supplier(s) not VAT-registered — check before raising tax invoices.</div>` : ''}

    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <div class="stats-grid" style="flex:1;margin-bottom:0;grid-template-columns:repeat(5,1fr)">
        ${roleOrder.map(r => `
          <div class="stat-card" style="border-left:3px solid ${roleColors[r]??'#888'}">
            <div class="stat-label">${r}</div>
            <div class="stat-value">${(byRole[r]??[]).length}</div>
          </div>`).join('')}
      </div>
      <div style="margin-left:16px;flex-shrink:0">
        <a href="/suppliers/new" class="btn btn-gold btn-sm"><i class="fas fa-plus"></i> Add Supplier</a>
      </div>
    </div>

    ${sections || '<div class="card"><p class="text-muted" style="text-align:center;padding:24px">No suppliers yet.</p></div>'}

    <div class="card" style="background:rgba(16,185,129,0.05);border-color:rgba(16,185,129,0.3)">
      <div class="card-title" style="margin-bottom:8px;font-size:13px">Supplier Role Legend</div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:var(--bw-muted)">
        <span><strong style="color:#10b981">COS</strong> — Cost of Sales (direct event costs)</span>
        <span><strong style="color:#3b82f6">CAPEX</strong> — Capital expenditure items</span>
        <span><strong style="color:#f59e0b">Expendable</strong> — Single-use consumables</span>
        <span><strong style="color:#8b5cf6">Pass-Through</strong> — Passed to client at cost</span>
        <span><strong style="color:#6b7280">OPEX</strong> — Operational overhead</span>
      </div>
    </div>`

  return c.html(layout('Suppliers', body, user, 'suppliers'))
})

suppliers.get('/new', (c) => {
  const user = c.get('user')
  return c.html(layout('New Supplier', supplierForm(null), user, 'suppliers'))
})

suppliers.get('/:id/edit', async (c) => {
  const user = c.get('user')
  const s = await c.env.DB.prepare('SELECT * FROM suppliers WHERE id=?').bind(c.req.param('id')).first<any>()
  if (!s) return c.redirect('/suppliers')
  return c.html(layout(`Edit — ${s.name}`, supplierForm(s), user, 'suppliers'))
})

suppliers.post('/new', async (c) => {
  const b = await c.req.parseBody()
  await c.env.DB.prepare(`
    INSERT INTO suppliers (name,role,vat_registered,vat_number,payment_terms,contact_name,contact_email,contact_phone,account_number,bank_name,bank_branch,notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(b.name,b.role,b.vat_registered==='on'?1:0,b.vat_number||null,
    Number(b.payment_terms)||30,b.contact_name||null,b.contact_email||null,
    b.contact_phone||null,b.account_number||null,b.bank_name||null,b.bank_branch||null,b.notes||null).run()
  return c.redirect('/suppliers?msg=saved')
})

suppliers.post('/:id/edit', async (c) => {
  const b = await c.req.parseBody()
  await c.env.DB.prepare(`
    UPDATE suppliers SET name=?,role=?,vat_registered=?,vat_number=?,payment_terms=?,
    contact_name=?,contact_email=?,contact_phone=?,account_number=?,bank_name=?,bank_branch=?,notes=?
    WHERE id=?`
  ).bind(b.name,b.role,b.vat_registered==='on'?1:0,b.vat_number||null,
    Number(b.payment_terms)||30,b.contact_name||null,b.contact_email||null,
    b.contact_phone||null,b.account_number||null,b.bank_name||null,b.bank_branch||null,
    b.notes||null,c.req.param('id')).run()
  return c.redirect('/suppliers?msg=saved')
})

function supplierForm(s: any): string {
  const isEdit = !!s
  return `
    <div style="max-width:720px">
      <div style="margin-bottom:16px"><a href="/suppliers" class="btn btn-outline btn-sm">← Back to Suppliers</a></div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">${isEdit ? `Edit — ${s.name}` : 'New Supplier'}</span>
        </div>
        <form method="POST" action="${isEdit ? `/suppliers/${s.id}/edit` : '/suppliers/new'}">
          <div class="form-grid">
            <div class="form-group full"><label>Supplier Name *</label>
              <input name="name" value="${s?.name??''}" required placeholder="e.g. Events Guys"></div>
            <div class="form-group"><label>Role / Category *</label>
              <select name="role" required>
                ${['COS','CAPEX','Expendable','Pass-Through','OPEX'].map(r =>
                  `<option value="${r}" ${s?.role===r?'selected':''}>${r}</option>`).join('')}
              </select></div>
            <div class="form-group"><label>Payment Terms (days)</label>
              <input type="number" name="payment_terms" value="${s?.payment_terms??30}" min="0"></div>
            <div class="form-group"><label>VAT Number</label>
              <input name="vat_number" value="${s?.vat_number??''}" placeholder="4XXXXXXXXX"></div>
            <div class="form-group"><label>Contact Name</label>
              <input name="contact_name" value="${s?.contact_name??''}" placeholder="Full name"></div>
            <div class="form-group"><label>Email</label>
              <input type="email" name="contact_email" value="${s?.contact_email??''}" placeholder="contact@supplier.co.za"></div>
            <div class="form-group"><label>Phone</label>
              <input name="contact_phone" value="${s?.contact_phone??''}" placeholder="082 555 0000"></div>
            <div class="form-group"><label>Account Number</label>
              <input name="account_number" value="${s?.account_number??''}" placeholder="Bank account number"></div>
            <div class="form-group"><label>Bank Name</label>
              <input name="bank_name" value="${s?.bank_name??''}" placeholder="e.g. FNB"></div>
            <div class="form-group"><label>Branch Code</label>
              <input name="bank_branch" value="${s?.bank_branch??''}" placeholder="e.g. 250655"></div>
            <div class="form-group full"><label>Notes</label>
              <textarea name="notes" placeholder="Payment notes, quirks, flags…">${s?.notes??''}</textarea></div>
            <div class="form-group full">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;text-transform:none;font-size:13px">
                <input type="checkbox" name="vat_registered" ${s?.vat_registered!==0?'checked':''} style="width:auto">
                <span>VAT Registered (deselect if not VAT-registered — will flag red)</span>
              </label>
            </div>
          </div>
          <div style="margin-top:20px;display:flex;gap:10px">
            <button type="submit" class="btn btn-gold">${isEdit ? '💾 Save Changes' : '➕ Add Supplier'}</button>
            <a href="/suppliers" class="btn btn-outline">Cancel</a>
          </div>
        </form>
      </div>
    </div>`
}

function vatFlag(s: any): string {
  if (!s.vat_registered) return '<span style="font-size:11px;color:var(--bw-danger)">⚠ No VAT</span>'
  if (!s.vat_number) return '<span style="font-size:11px;color:var(--bw-warn)">⚠ No VAT #</span>'
  return ''
}

function paymentFlag(s: any): string {
  if (s.payment_terms < 7) return '<span style="font-size:11px;color:var(--bw-warn)">⚡ COD</span>'
  return ''
}

function roleDesc(role: string): string {
  const m: Record<string,string> = {
    COS: 'Direct cost of sales',
    CAPEX: 'Capital expenditure',
    Expendable: 'Single-use items',
    'Pass-Through': 'Client pass-through',
    OPEX: 'Operational overhead'
  }
  return m[role] ?? ''
}

export default suppliers
