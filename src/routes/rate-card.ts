// Rate Card routes

import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth.js'
import { layout } from '../lib/layout.js'
import { formatZAR } from '../lib/format.js'
import type { AuthUser } from '../lib/auth.js'

type Env = { Bindings: { DB: D1Database }; Variables: { user: AuthUser } }

const rateCard = new Hono<Env>()
rateCard.use('*', requireAuth)

rateCard.get('/', async (c) => {
  const user = c.get('user')
  const msg = c.req.query('msg')
  const filterCat = c.req.query('cat') ?? ''

  const rows = await c.env.DB.prepare(
    `SELECT rc.*, s.name as supplier_name FROM rate_card rc
     LEFT JOIN suppliers s ON rc.supplier_id = s.id
     WHERE rc.active=1 ${filterCat ? 'AND rc.category=?' : ''}
     ORDER BY rc.category, rc.line_item`
  ).bind(...(filterCat ? [filterCat] : [])).all<any>()

  const cats = await c.env.DB.prepare(
    'SELECT DISTINCT category FROM rate_card WHERE active=1 ORDER BY category'
  ).all<any>()

  const byCategory: Record<string, any[]> = {}
  for (const row of rows.results) {
    if (!byCategory[row.category]) byCategory[row.category] = []
    byCategory[row.category].push(row)
  }

  const catFilters = ['', ...cats.results.map((r: any) => r.category)].map(cat => `
    <a href="/rate-card${cat ? '?cat='+encodeURIComponent(cat) : ''}" class="btn btn-sm ${filterCat===cat ? 'btn-gold' : 'btn-outline'}">
      ${cat || 'All'}
    </a>`).join('')

  const sections = Object.entries(byCategory).map(([cat, items]) => `
    <div class="card" style="margin-bottom:16px">
      <div class="card-header">
        <span class="card-title">${catEmoji(cat)} ${cat}</span>
        <span class="text-muted" style="font-size:12px">${items.length} items</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Line Item</th>
            <th>Unit</th>
            <th class="text-right">Base Rate</th>
            <th class="text-right hide-mobile">Disc %</th>
            <th class="text-right">Effective Rate</th>
            <th class="hide-mobile">Supplier</th>
            <th>Actions</th>
          </tr></thead>
          <tbody>
            ${items.map(item => `
              <tr>
                <td style="font-weight:500">${item.line_item}</td>
                <td class="muted">${item.unit}</td>
                <td class="text-right">${formatZAR(item.base_rate)}</td>
                <td class="text-right hide-mobile ${item.discount_pct>0?'text-warn':'text-muted'}">${item.discount_pct ?? 0}%</td>
                <td class="text-right font-bold ${item.discount_pct>0?'text-gold':''}">${formatZAR(item.effective_rate ?? item.base_rate)}</td>
                <td class="muted hide-mobile" style="font-size:12px">${item.supplier_name || '—'}</td>
                <td>
                  <a href="/rate-card/${item.id}/edit" class="btn btn-outline btn-sm">Edit</a>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`).join('')

  const body = `
    ${msg === 'saved' ? '<div class="alert alert-success">✅ Rate card item saved.</div>' : ''}
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">
      <div style="display:flex;gap:6px;flex-wrap:wrap">${catFilters}</div>
      <a href="/rate-card/new" class="btn btn-gold btn-sm"><i class="fas fa-plus"></i> Add Item</a>
    </div>
    <div class="card" style="margin-bottom:16px;padding:12px 20px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span class="text-muted" style="font-size:13px">
          📋 <strong style="color:var(--bw-white)">${rows.results.length}</strong> active line items
          across <strong style="color:var(--bw-white)">${Object.keys(byCategory).length}</strong> categories
        </span>
        <span class="text-muted" style="font-size:12px">All rates in ZAR · excl. VAT</span>
      </div>
    </div>
    ${sections || '<div class="card"><p class="text-muted" style="padding:24px;text-align:center">No rate card items. <a href="/rate-card/new" style="color:var(--bw-gold)">Add first item →</a></p></div>'}
    <div class="alert alert-info" style="font-size:12px">
      💡 <strong>Tip:</strong> Setup and Strike labour are always separate line items — never bundled. This is policy, not a preference.
    </div>`

  return c.html(layout('Rate Card', body, user, 'rate-card'))
})

rateCard.get('/new', async (c) => {
  const user = c.get('user')
  const suppliers = await c.env.DB.prepare('SELECT id, name FROM suppliers WHERE active=1 ORDER BY name').all<any>()
  return c.html(layout('New Rate Card Item', rateCardForm(null, suppliers.results), user, 'rate-card'))
})

rateCard.get('/:id/edit', async (c) => {
  const user = c.get('user')
  const item = await c.env.DB.prepare(
    'SELECT rc.*, s.name as supplier_name FROM rate_card rc LEFT JOIN suppliers s ON rc.supplier_id=s.id WHERE rc.id=?'
  ).bind(c.req.param('id')).first<any>()
  if (!item) return c.redirect('/rate-card')
  const suppliers = await c.env.DB.prepare('SELECT id, name FROM suppliers WHERE active=1 ORDER BY name').all<any>()
  return c.html(layout(`Edit — ${item.line_item}`, rateCardForm(item, suppliers.results), user, 'rate-card'))
})

rateCard.post('/new', async (c) => {
  const b = await c.req.parseBody()
  await c.env.DB.prepare(`
    INSERT INTO rate_card (category, line_item, unit, base_rate, discount_pct, supplier_id, load_class, notes)
    VALUES (?,?,?,?,?,?,?,?)`
  ).bind(b.category, b.line_item, b.unit||'each', Number(b.base_rate)||0,
    Number(b.discount_pct)||0, b.supplier_id ? Number(b.supplier_id) : null,
    b.load_class||'any', b.notes||null).run()
  return c.redirect('/rate-card?msg=saved')
})

rateCard.post('/:id/edit', async (c) => {
  const b = await c.req.parseBody()
  await c.env.DB.prepare(`
    UPDATE rate_card SET category=?, line_item=?, unit=?, base_rate=?, discount_pct=?,
    supplier_id=?, load_class=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
  ).bind(b.category, b.line_item, b.unit||'each', Number(b.base_rate)||0,
    Number(b.discount_pct)||0, b.supplier_id ? Number(b.supplier_id) : null,
    b.load_class||'any', b.notes||null, c.req.param('id')).run()
  return c.redirect('/rate-card?msg=saved')
})

rateCard.post('/:id/delete', async (c) => {
  await c.env.DB.prepare('UPDATE rate_card SET active=0 WHERE id=?').bind(c.req.param('id')).run()
  return c.redirect('/rate-card?msg=saved')
})

// API: return rate card items as JSON (used by quote builder)
rateCard.get('/api/items', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT rc.id, rc.category, rc.line_item, rc.unit, rc.base_rate, rc.discount_pct,
     rc.effective_rate, rc.supplier_id, s.name as supplier_name
     FROM rate_card rc LEFT JOIN suppliers s ON rc.supplier_id=s.id
     WHERE rc.active=1 ORDER BY rc.category, rc.line_item`
  ).all<any>()
  return c.json(rows.results)
})

function rateCardForm(item: any, suppliers: any[]): string {
  const isEdit = !!item
  const categories = ['Structures','Furniture','Power','Staging','Fencing','Labour','Transport','Branding','Cooling','Consumables','Other']
  const units = ['each','day','set','person','pack','roll','trip','unit','hour','m2']

  return `
    <div style="max-width:640px">
      <div style="margin-bottom:16px"><a href="/rate-card" class="btn btn-outline btn-sm">← Back to Rate Card</a></div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">${isEdit ? `Edit — ${item.line_item}` : 'New Rate Card Item'}</span>
        </div>
        <form method="POST" action="${isEdit ? `/rate-card/${item.id}/edit` : '/rate-card/new'}">
          <div class="form-grid">
            <div class="form-group">
              <label>Category *</label>
              <select name="category" required>
                ${categories.map(cat => `<option value="${cat}" ${item?.category===cat?'selected':''}>${cat}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Unit</label>
              <select name="unit">
                ${units.map(u => `<option value="${u}" ${item?.unit===u?'selected':''}>${u}</option>`).join('')}
              </select>
            </div>
            <div class="form-group full">
              <label>Line Item Description *</label>
              <input name="line_item" value="${item?.line_item??''}" required placeholder="e.g. Marquee 6x6m">
            </div>
            <div class="form-group">
              <label>Base Rate (R, excl. VAT) *</label>
              <input type="number" name="base_rate" value="${item?.base_rate??''}" required min="0" step="0.01" placeholder="4500">
            </div>
            <div class="form-group">
              <label>Discount %</label>
              <input type="number" name="discount_pct" value="${item?.discount_pct??0}" min="0" max="100" step="0.5">
            </div>
            <div class="form-group">
              <label>Supplier</label>
              <select name="supplier_id">
                <option value="">— No supplier —</option>
                ${suppliers.map(s => `<option value="${s.id}" ${item?.supplier_id===s.id?'selected':''}>${s.name}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Load Class</label>
              <select name="load_class">
                ${['any','L1','L2','L3','L4'].map(cls => `<option value="${cls}" ${item?.load_class===cls?'selected':''}>${cls}</option>`).join('')}
              </select>
            </div>
            <div class="form-group full">
              <label>Notes</label>
              <textarea name="notes" placeholder="Any notes, specifications, or conditions…">${item?.notes??''}</textarea>
            </div>
          </div>
          <div style="margin-top:20px;display:flex;gap:10px">
            <button type="submit" class="btn btn-gold">${isEdit ? '💾 Save Changes' : '➕ Add Item'}</button>
            <a href="/rate-card" class="btn btn-outline">Cancel</a>
            ${isEdit ? `
              <form method="POST" action="/rate-card/${item.id}/delete" style="margin-left:auto">
                <button type="submit" class="btn btn-danger btn-sm" onclick="return confirm('Archive this item?')">Archive</button>
              </form>` : ''}
          </div>
        </form>
      </div>
    </div>`
}

function catEmoji(cat: string): string {
  const m: Record<string,string> = {
    Structures:'⛺', Furniture:'🪑', Power:'⚡', Staging:'🎤', Fencing:'🚧',
    Labour:'👷', Transport:'🚛', Branding:'🎨', Cooling:'❄️', Consumables:'📦', Other:'🔧'
  }
  return m[cat] ?? '📋'
}

export default rateCard
