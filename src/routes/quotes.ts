// Quotes — full creation flow, view, and management

import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth.js'
import { layout } from '../lib/layout.js'
import { formatZAR, formatDate, statusBadge, loadClassBadge } from '../lib/format.js'
import type { AuthUser } from '../lib/auth.js'
import { can } from '../lib/auth.js'

type Env = { Bindings: { DB: D1Database }; Variables: { user: AuthUser } }

const quotes = new Hono<Env>()
quotes.use('*', requireAuth)

// --- LIST ---
quotes.get('/', async (c) => {
  const user = c.get('user')
  const filter = c.req.query('status') ?? ''

  const rows = await c.env.DB.prepare(
    `SELECT q.*, e.name as event_name, e.event_date, e.is_sab_event,
      c.name as client_name, u.name as created_by_name
     FROM quotes q
     JOIN events e ON q.event_id = e.id
     JOIN clients c ON e.client_id = c.id
     LEFT JOIN users u ON q.created_by = u.id
     ${filter ? 'WHERE q.status=?' : ''}
     ORDER BY q.created_at DESC`
  ).bind(...(filter ? [filter] : [])).all<any>()

  const statuses = ['draft','sent','accepted','declined']
  const filterTabs = ['', ...statuses].map(s => `
    <a href="/quotes${s ? '?status='+s : ''}" class="btn btn-sm ${filter===s ? 'btn-gold' : 'btn-outline'}">
      ${s ? s.charAt(0).toUpperCase()+s.slice(1) : 'All'}
    </a>`).join('')

  const tableRows = rows.results.map((q: any) => `
    <tr>
      <td>
        <a href="/quotes/${q.id}" style="color:var(--bw-gold);text-decoration:none;font-weight:700;font-family:'Courier New',monospace;font-size:13px">${q.quote_number}</a>
        <span style="font-size:11px;color:var(--bw-muted);margin-left:4px">v${q.version}</span>
      </td>
      <td>
        <div style="font-weight:500">${q.event_name}</div>
        <div style="font-size:11px;color:var(--bw-muted)">${q.client_name}</div>
      </td>
      <td class="muted hide-mobile">${formatDate(q.event_date)}</td>
      <td>${q.load_class ? loadClassBadge(q.load_class) : '<span class="text-muted">—</span>'}</td>
      <td>${statusBadge(q.status)}</td>
      <td class="text-right font-bold">${formatZAR(q.total ?? 0)}</td>
      <td class="muted hide-mobile" style="font-size:12px">${q.created_by_name || '—'}</td>
      <td>
        <a href="/quotes/${q.id}" class="btn btn-outline btn-sm">View</a>
      </td>
    </tr>`).join('')

  // Pipeline totals
  const pipelineTotal = rows.results.reduce((sum: number, q: any) => sum + (q.total ?? 0), 0)
  const wonTotal = rows.results.filter((q: any) => q.status === 'accepted').reduce((sum: number, q: any) => sum + (q.total ?? 0), 0)

  const body = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">
      <div style="display:flex;gap:6px;flex-wrap:wrap">${filterTabs}</div>
      <a href="/quotes/new" class="btn btn-gold btn-sm"><i class="fas fa-plus"></i> New Quote</a>
    </div>

    ${can(user, 'viewMargins') ? `
    <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));margin-bottom:20px">
      <div class="stat-card stat-gold">
        <div class="stat-label">Total Quotes</div>
        <div class="stat-value">${rows.results.length}</div>
      </div>
      <div class="stat-card stat-green">
        <div class="stat-label">Pipeline Value</div>
        <div class="stat-value" style="font-size:18px">${formatZAR(pipelineTotal)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Confirmed</div>
        <div class="stat-value" style="font-size:18px">${formatZAR(wonTotal)}</div>
        <div class="stat-sub">${rows.results.filter((q: any) => q.status==='accepted').length} quotes</div>
      </div>
    </div>` : ''}

    <div class="card">
      <div class="card-header">
        <span class="card-title">📋 Quotes (${rows.results.length})</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Quote #</th>
            <th>Event / Client</th>
            <th class="hide-mobile">Event Date</th>
            <th>Load Class</th>
            <th>Status</th>
            <th class="text-right">Total (incl. VAT)</th>
            <th class="hide-mobile">Created By</th>
            <th></th>
          </tr></thead>
          <tbody>${tableRows || '<tr><td colspan="8" class="text-muted" style="text-align:center;padding:24px">No quotes yet. <a href="/quotes/new" style="color:var(--bw-gold)">Create first quote →</a></td></tr>'}</tbody>
        </table>
      </div>
    </div>`

  return c.html(layout('Quotes', body, user, 'quotes'))
})

// --- NEW QUOTE FORM ---
quotes.get('/new', async (c) => {
  const user = c.get('user')
  const preEventId = c.req.query('event_id')
  const db = c.env.DB

  const [events, fleet, loadClasses, rateItems] = await Promise.all([
    db.prepare(`SELECT e.id, e.name, e.event_date, e.pax, e.is_sab_event, c.name as client_name
      FROM events e JOIN clients c ON e.client_id=c.id
      WHERE e.status IN ('brief','quoted') ORDER BY e.event_date`).all<any>(),
    db.prepare(`SELECT * FROM fleet WHERE active=1 AND status='available' ORDER BY vehicle_type, reg_number`).all<any>(),
    db.prepare(`SELECT * FROM load_classes ORDER BY class`).all<any>(),
    db.prepare(`SELECT rc.*, s.name as supplier_name FROM rate_card rc
      LEFT JOIN suppliers s ON rc.supplier_id=s.id
      WHERE rc.active=1 ORDER BY rc.category, rc.line_item`).all<any>(),
  ])

  const preEvent = preEventId ? events.results.find((e: any) => e.id === Number(preEventId)) : null

  const body = quoteBuilderHTML(events.results, fleet.results, loadClasses.results, rateItems.results, preEvent, user)
  return c.html(layout('New Quote', body, user, 'quotes'))
})

// --- SAVE QUOTE ---
quotes.post('/new', async (c) => {
  const user = c.get('user')
  const db = c.env.DB
  const b = await c.req.parseBody()

  // Generate quote number
  const countRow = await db.prepare('SELECT COUNT(*) as cnt FROM quotes').first<{ cnt: number }>()
  const nextNum = (countRow?.cnt ?? 0) + 1
  const quoteNumber = `BW-${new Date().getFullYear()}-${String(nextNum).padStart(4,'0')}`

  const subtotal    = Number(b.subtotal) || 0
  const disbMult    = Number(b.disbursement_multiplier) || 1.0
  const disbAmt     = subtotal * (disbMult - 1)
  const exclVat     = subtotal + disbAmt
  const vatAmt      = exclVat * 0.15
  const total       = exclVat + vatAmt
  const internalCost= Number(b.internal_cost) || 0
  const margin      = internalCost > 0 ? ((exclVat - internalCost) / exclVat) * 100 : 0

  const result = await db.prepare(`
    INSERT INTO quotes (event_id, quote_number, version, status, load_class, fleet_id,
      subtotal, disbursement_multiplier, disbursement_amount, vat_rate, vat_amount,
      total, internal_cost, margin, notes, terms, created_by)
    VALUES (?,?,1,'draft',?,?,?,?,?,15.0,?,?,?,?,?,?,?)`
  ).bind(
    Number(b.event_id), quoteNumber, b.load_class || null,
    b.fleet_id ? Number(b.fleet_id) : null,
    subtotal, disbMult, disbAmt, vatAmt, total, internalCost, margin,
    b.notes || null, b.terms || null, user.id
  ).run()

  const quoteId = result.meta.last_row_id

  // Save line items
  const lineItemsRaw = String(b.line_items || '[]')
  try {
    const lineItems: any[] = JSON.parse(lineItemsRaw)
    for (let i = 0; i < lineItems.length; i++) {
      const li = lineItems[i]
      await db.prepare(`
        INSERT INTO quote_line_items (quote_id, rate_card_id, category, description, unit,
          quantity, unit_rate, is_setup, is_strike, supplier_id, cost_rate, visible_to_client, sort_order)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        quoteId, li.rate_card_id || null, li.category, li.description, li.unit || 'each',
        Number(li.quantity) || 1, Number(li.unit_rate) || 0,
        li.is_setup ? 1 : 0, li.is_strike ? 1 : 0,
        li.supplier_id || null, Number(li.cost_rate) || 0,
        li.visible_to_client !== false ? 1 : 0, i
      ).run()
    }
  } catch (_) {}

  // Update event status to 'quoted'
  await db.prepare(`UPDATE events SET status='quoted', updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='brief'`)
    .bind(Number(b.event_id)).run()

  return c.redirect(`/quotes/${quoteId}?msg=created`)
})

// --- VIEW QUOTE ---
quotes.get('/:id', async (c) => {
  const user = c.get('user')
  const db = c.env.DB
  const msg = c.req.query('msg')

  const quote = await db.prepare(`
    SELECT q.*, e.name as event_name, e.event_date, e.venue, e.venue_city,
      e.pax, e.is_sab_event, e.notes as event_notes,
      c.name as client_name, c.vat_number as client_vat,
      c.contact_primary, c.contact_email, c.payment_terms as client_terms,
      f.reg_number as fleet_reg, f.description as fleet_desc,
      u.name as created_by_name
    FROM quotes q
    JOIN events e ON q.event_id = e.id
    JOIN clients c ON e.client_id = c.id
    LEFT JOIN fleet f ON q.fleet_id = f.id
    LEFT JOIN users u ON q.created_by = u.id
    WHERE q.id = ?`
  ).bind(c.req.param('id')).first<any>()

  if (!quote) return c.redirect('/quotes')

  const lineItems = await db.prepare(
    `SELECT qli.*, s.name as supplier_name FROM quote_line_items qli
     LEFT JOIN suppliers s ON qli.supplier_id = s.id
     WHERE qli.quote_id = ? ORDER BY qli.sort_order, qli.id`
  ).bind(quote.id).all<any>()

  const items = lineItems.results
  const clientItems  = items.filter((li: any) => li.visible_to_client)
  const internalOnly = items.filter((li: any) => !li.visible_to_client)

  // Group client items by category
  const byCategory: Record<string, any[]> = {}
  for (const li of clientItems) {
    if (!byCategory[li.category]) byCategory[li.category] = []
    byCategory[li.category].push(li)
  }

  const categorySections = Object.entries(byCategory).map(([cat, lines]) => `
    <div style="margin-bottom:4px">
      <div style="font-size:11px;font-weight:600;color:var(--bw-muted);text-transform:uppercase;letter-spacing:0.08em;padding:8px 12px 4px">${cat}</div>
      ${lines.map((li: any) => `
        <div style="display:flex;align-items:center;padding:8px 12px;border-bottom:1px solid var(--bw-border)">
          <div style="flex:1">
            <span style="font-weight:500">${li.description}</span>
            ${li.is_setup ? '<span style="font-size:10px;background:rgba(99,102,241,0.2);color:#818cf8;padding:1px 6px;border-radius:4px;margin-left:6px">Setup</span>' : ''}
            ${li.is_strike ? '<span style="font-size:10px;background:rgba(245,158,11,0.2);color:#fbbf24;padding:1px 6px;border-radius:4px;margin-left:6px">Strike</span>' : ''}
          </div>
          <div style="color:var(--bw-muted);font-size:12px;width:80px;text-align:center">${li.quantity} ${li.unit}</div>
          <div style="width:100px;text-align:right;color:var(--bw-muted);font-size:12px">${formatZAR(li.unit_rate)}</div>
          <div style="width:110px;text-align:right;font-weight:600">${formatZAR(li.line_total ?? (li.quantity * li.unit_rate))}</div>
        </div>`).join('')}
    </div>`).join('')

  const subtotal   = quote.subtotal ?? 0
  const disbAmt    = quote.disbursement_amount ?? 0
  const exclVat    = subtotal + disbAmt
  const vatAmt     = quote.vat_amount ?? 0
  const total      = quote.total ?? 0
  const showInternal = can(user, 'viewCostBuild')
  const showMargins  = can(user, 'viewMargins')

  const statusActions = `
    <form method="POST" action="/quotes/${quote.id}/status" style="display:flex;gap:6px;align-items:center">
      <select name="status" onchange="this.form.submit()" style="padding:7px 12px;font-size:13px;background:var(--bw-black);border:1px solid var(--bw-border2);border-radius:8px;color:var(--bw-white)">
        ${['draft','sent','accepted','declined'].map(s =>
          `<option value="${s}" ${quote.status===s?'selected':''}>${s.charAt(0).toUpperCase()+s.slice(1)}</option>`
        ).join('')}
      </select>
    </form>`

  const body = `
    ${msg === 'created' ? '<div class="alert alert-success">✅ Quote created successfully.</div>' : ''}
    ${msg === 'saved' ? '<div class="alert alert-success">✅ Status updated.</div>' : ''}

    <div style="margin-bottom:16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <a href="/quotes" class="btn btn-outline btn-sm">← Quotes</a>
      <a href="/events/${quote.event_id}" class="btn btn-outline btn-sm">View Event</a>
      ${statusActions}
      <div style="margin-left:auto;display:flex;gap:8px">
        <button onclick="window.print()" class="btn btn-outline btn-sm"><i class="fas fa-print"></i> Print</button>
      </div>
    </div>

    <!-- QUOTE HEADER -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px" class="responsive-grid">
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
          <div>
            <div style="font-size:22px;font-weight:800;color:var(--bw-gold);font-family:'Courier New',monospace">${quote.quote_number}</div>
            <div style="font-size:12px;color:var(--bw-muted)">Version ${quote.version} · ${formatDate(quote.created_at)}</div>
          </div>
          <div style="text-align:right">
            ${statusBadge(quote.status)}
            ${quote.load_class ? '<br><span style="margin-top:4px;display:block">'+loadClassBadge(quote.load_class)+'</span>' : ''}
          </div>
        </div>
        <div style="border-top:1px solid var(--bw-border);padding-top:12px">
          <div style="font-size:12px;color:var(--bw-muted);margin-bottom:2px">Client</div>
          <div style="font-weight:600">${quote.client_name}</div>
          <div style="font-size:12px;color:var(--bw-muted);margin-top:8px;margin-bottom:2px">Event</div>
          <div style="font-weight:500">${quote.event_name}</div>
          <div style="font-size:12px;color:var(--bw-muted)">${formatDate(quote.event_date)} · ${quote.venue || '—'}</div>
        </div>
      </div>
      <div class="card">
        <div style="font-size:13px;font-weight:600;color:var(--bw-muted);margin-bottom:12px">FINANCIAL SUMMARY</div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--bw-border)">
          <span class="text-muted">Subtotal (excl. disbursement)</span>
          <span>${formatZAR(subtotal)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--bw-border)">
          <span class="text-muted">Disbursement (×${quote.disbursement_multiplier?.toFixed(2)})</span>
          <span>${formatZAR(disbAmt)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--bw-border)">
          <span class="text-muted">Subtotal excl. VAT</span>
          <span style="font-weight:600">${formatZAR(exclVat)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--bw-border)">
          <span class="text-muted">VAT (15%)</span>
          <span>${formatZAR(vatAmt)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:10px 0;margin-top:4px">
          <span style="font-size:16px;font-weight:700">TOTAL incl. VAT</span>
          <span style="font-size:22px;font-weight:800;color:var(--bw-gold)">${formatZAR(total)}</span>
        </div>
        ${showMargins && quote.internal_cost > 0 ? `
        <div style="border-top:1px solid var(--bw-border);margin-top:8px;padding-top:8px">
          <div style="display:flex;justify-content:space-between;padding:4px 0">
            <span style="font-size:12px;color:var(--bw-muted)">Internal Cost</span>
            <span style="font-size:12px;color:var(--bw-muted)">${formatZAR(quote.internal_cost)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:4px 0">
            <span style="font-size:12px;color:var(--bw-muted)">Margin</span>
            <span style="font-size:12px;font-weight:700;color:${quote.margin > 25 ? 'var(--bw-success)' : quote.margin > 15 ? 'var(--bw-warn)' : 'var(--bw-danger)'}">${(quote.margin??0).toFixed(1)}%</span>
          </div>
        </div>` : ''}
      </div>
    </div>

    <!-- EVENT & LOGISTICS -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px" class="responsive-grid">
      <div class="card">
        <div class="card-title" style="margin-bottom:12px">Event Details</div>
        <table style="width:100%">
          <tr><td class="muted" style="padding:5px 0;width:40%">Pax</td><td><strong>${quote.pax?.toLocaleString() ?? '—'}</strong></td></tr>
          <tr><td class="muted" style="padding:5px 0">Venue</td><td>${quote.venue || '—'}</td></tr>
          <tr><td class="muted" style="padding:5px 0">City</td><td>${quote.venue_city || '—'}</td></tr>
          <tr><td class="muted" style="padding:5px 0">SAB Event</td><td>${quote.is_sab_event ? '<span class="badge badge-sab">SAB</span>' : 'No'}</td></tr>
          <tr><td class="muted" style="padding:5px 0">Client VAT</td><td>${quote.client_vat || '—'}</td></tr>
          <tr><td class="muted" style="padding:5px 0">Contact</td><td>${quote.contact_primary || '—'}</td></tr>
          <tr><td class="muted" style="padding:5px 0">Pay Terms</td><td>${quote.client_terms ?? 30} days</td></tr>
        </table>
      </div>
      <div class="card">
        <div class="card-title" style="margin-bottom:12px">Logistics</div>
        <table style="width:100%">
          <tr><td class="muted" style="padding:5px 0;width:40%">Load Class</td><td>${quote.load_class ? loadClassBadge(quote.load_class) : '—'}</td></tr>
          <tr><td class="muted" style="padding:5px 0">Allocated Truck</td><td>${quote.fleet_reg ? `<span style="font-family:'Courier New',monospace;color:var(--bw-gold)">${quote.fleet_reg}</span><br><span style="font-size:11px;color:var(--bw-muted)">${quote.fleet_desc}</span>` : '—'}</td></tr>
          <tr><td class="muted" style="padding:5px 0">Created By</td><td>${quote.created_by_name || '—'}</td></tr>
          <tr><td class="muted" style="padding:5px 0">B&W VAT</td><td style="font-family:'Courier New',monospace">4790261301</td></tr>
          <tr><td class="muted" style="padding:5px 0">B&W Reg</td><td style="font-family:'Courier New',monospace;font-size:11px">2009/189046/23</td></tr>
        </table>
        ${quote.notes ? `<div style="margin-top:12px;padding:8px;background:var(--bw-black);border-radius:6px;font-size:12px;color:var(--bw-muted)">${quote.notes}</div>` : ''}
      </div>
    </div>

    <!-- LINE ITEMS — Client view -->
    <div class="card">
      <div class="card-header">
        <span class="card-title">Line Items — Client View</span>
        <span style="font-size:12px;color:var(--bw-muted)">${clientItems.length} items · excl. VAT</span>
      </div>
      <div style="border:1px solid var(--bw-border);border-radius:8px;overflow:hidden">
        <div style="display:flex;padding:8px 12px;background:var(--bw-black);border-bottom:1px solid var(--bw-border)">
          <div style="flex:1;font-size:11px;font-weight:600;color:var(--bw-muted);text-transform:uppercase">Description</div>
          <div style="width:80px;text-align:center;font-size:11px;font-weight:600;color:var(--bw-muted);text-transform:uppercase">Qty</div>
          <div style="width:100px;text-align:right;font-size:11px;font-weight:600;color:var(--bw-muted);text-transform:uppercase">Unit Rate</div>
          <div style="width:110px;text-align:right;font-size:11px;font-weight:600;color:var(--bw-muted);text-transform:uppercase">Line Total</div>
        </div>
        ${categorySections || '<div style="padding:24px;text-align:center;color:var(--bw-muted)">No line items</div>'}
        <!-- TOTALS -->
        <div style="background:var(--bw-black);border-top:2px solid var(--bw-border);padding:0 12px">
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--bw-border)">
            <span style="color:var(--bw-muted)">Subtotal</span>
            <span style="font-weight:600">${formatZAR(subtotal)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--bw-border)">
            <span style="color:var(--bw-muted)">Disbursement & Logistics</span>
            <span>${formatZAR(disbAmt)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--bw-border)">
            <span style="color:var(--bw-muted)">VAT (15%)</span>
            <span>${formatZAR(vatAmt)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:12px 0">
            <span style="font-size:15px;font-weight:700">TOTAL</span>
            <span style="font-size:20px;font-weight:800;color:var(--bw-gold)">${formatZAR(total)}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- INTERNAL COST BUILD — finance/founder only -->
    ${showInternal ? `
    <div class="card" style="border-color:rgba(139,92,246,0.4);background:rgba(139,92,246,0.05)">
      <div class="card-header">
        <span class="card-title" style="color:#a78bfa">🔒 Internal Cost Build — Confidential</span>
        <span style="font-size:11px;color:#6b7280">Never shown to client-facing roles</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Item</th><th>Category</th><th class="text-right">Qty</th><th class="text-right">Sell Rate</th><th class="text-right">Cost Rate</th><th class="text-right">Cost Total</th><th class="text-right">Sell Total</th></tr></thead>
          <tbody>
            ${items.map((li: any) => {
              const sellTotal = li.line_total ?? (li.quantity * li.unit_rate)
              const costTotal = li.cost_total ?? (li.quantity * li.cost_rate)
              const itemMargin = sellTotal > 0 ? ((sellTotal - costTotal) / sellTotal * 100).toFixed(0) : 0
              return `<tr>
                <td>${li.description}${!li.visible_to_client?'<span style="font-size:10px;color:#818cf8;margin-left:6px">internal</span>':''}</td>
                <td class="muted" style="font-size:12px">${li.category}</td>
                <td class="text-right">${li.quantity} ${li.unit}</td>
                <td class="text-right">${formatZAR(li.unit_rate)}</td>
                <td class="text-right text-muted">${li.cost_rate > 0 ? formatZAR(li.cost_rate) : '—'}</td>
                <td class="text-right text-warn">${li.cost_rate > 0 ? formatZAR(costTotal) : '—'}</td>
                <td class="text-right font-bold">${formatZAR(sellTotal)}</td>
              </tr>`
            }).join('')}
          </tbody>
          <tfoot>
            <tr style="border-top:2px solid var(--bw-border)">
              <td colspan="5" style="padding:10px 12px;font-weight:700">TOTALS</td>
              <td class="text-right text-warn" style="padding:10px 12px;font-weight:700">${formatZAR(quote.internal_cost ?? 0)}</td>
              <td class="text-right" style="padding:10px 12px;font-weight:700;color:var(--bw-gold)">${formatZAR(exclVat)}</td>
            </tr>
            ${quote.internal_cost > 0 ? `<tr>
              <td colspan="7" style="padding:6px 12px;text-align:right">
                Gross Margin: <strong style="color:${quote.margin > 25 ? 'var(--bw-success)' : quote.margin > 15 ? 'var(--bw-warn)' : 'var(--bw-danger)'}">
                  ${(quote.margin??0).toFixed(1)}%
                </strong>
              </td>
            </tr>` : ''}
          </tfoot>
        </table>
      </div>
    </div>` : ''}

    <!-- TERMS -->
    <div class="card">
      <div class="card-title" style="margin-bottom:8px">Payment Terms</div>
      <p style="font-size:13px;color:var(--bw-muted);line-height:1.7">
        ${quote.terms || defaultTerms(quote.client_terms ?? 30)}
      </p>
    </div>

    <div style="font-size:11px;color:var(--bw-muted);text-align:center;margin-top:16px">
      B&amp;W Productions (Pty) Ltd · VAT 4790261301 · Reg 2009/189046/23 ·
      Unit 1, 19 Kransvalk Rd, Highbury, Randvaal, 1943
    </div>

    <style>
      .responsive-grid{grid-template-columns:1fr 1fr}
      @media(max-width:768px){.responsive-grid{grid-template-columns:1fr}}
      @media print {
        .sidebar,.topbar,.btn,.alert{display:none!important}
        .main{margin-left:0!important}
        .card{break-inside:avoid}
      }
    </style>`

  return c.html(layout(quote.quote_number, body, user, 'quotes'))
})

// --- STATUS UPDATE ---
quotes.post('/:id/status', async (c) => {
  const b = await c.req.parseBody()
  if (b.status) {
    await c.env.DB.prepare('UPDATE quotes SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .bind(b.status, c.req.param('id')).run()
    // If accepted, mark event as won
    if (b.status === 'accepted') {
      const q = await c.env.DB.prepare('SELECT event_id FROM quotes WHERE id=?').bind(c.req.param('id')).first<any>()
      if (q) await c.env.DB.prepare('UPDATE events SET status=\'won\',updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(q.event_id).run()
    }
  }
  return c.redirect(`/quotes/${c.req.param('id')}?msg=saved`)
})

// ---- QUOTE BUILDER HTML ----
function quoteBuilderHTML(
  events: any[], fleet: any[], loadClasses: any[], rateItems: any[],
  preEvent: any, user: AuthUser
): string {
  const eventOptions = events.map(e =>
    `<option value="${e.id}" data-pax="${e.pax}" data-sab="${e.is_sab_event}" ${preEvent?.id===e.id?'selected':''}>
      ${e.name} — ${e.client_name} (${formatDate(e.event_date)})
    </option>`).join('')

  // Group rate items by category for the picker
  const rateByCategory: Record<string, any[]> = {}
  for (const item of rateItems) {
    if (!rateByCategory[item.category]) rateByCategory[item.category] = []
    rateByCategory[item.category].push(item)
  }

  const rateOptionsJSON = JSON.stringify(rateItems)
  const loadClassesJSON = JSON.stringify(loadClasses)
  const fleetJSON       = JSON.stringify(fleet)

  const ratePickerGroups = Object.entries(rateByCategory).map(([cat, items]) =>
    `<optgroup label="${cat}">
      ${items.map(i => `<option value="${i.id}" data-rate="${i.effective_rate ?? i.base_rate}" data-unit="${i.unit}" data-cat="${i.category}" data-supplier="${i.supplier_id ?? ''}" data-cost="${i.effective_rate ? (i.effective_rate * 0.7).toFixed(2) : 0}">${i.line_item} — ${formatZAR(i.effective_rate ?? i.base_rate)}/${i.unit}</option>`).join('')}
    </optgroup>`
  ).join('')

  return `
    <div style="max-width:1100px">
      <div style="margin-bottom:16px"><a href="/quotes" class="btn btn-outline btn-sm">← Back to Quotes</a></div>

      <form method="POST" action="/quotes/new" id="quoteForm">
        <input type="hidden" name="line_items" id="lineItemsInput">
        <input type="hidden" name="subtotal" id="subtotalInput">
        <input type="hidden" name="internal_cost" id="internalCostInput">
        <input type="hidden" name="disbursement_multiplier" id="disbMult">

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px" class="responsive-grid">

          <!-- STEP 1: EVENT DETAILS -->
          <div class="card">
            <div class="card-title" style="margin-bottom:16px">① Event Details</div>
            <div class="form-group" style="margin-bottom:12px">
              <label>Select Event *</label>
              <select name="event_id" id="eventSelect" required onchange="onEventChange(this)">
                <option value="">Choose event…</option>
                ${eventOptions}
              </select>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
              <div class="form-group">
                <label>Expected Pax</label>
                <input type="number" id="paxInput" placeholder="0" min="0" onchange="suggestLoadClass()">
              </div>
              <div class="form-group">
                <label>Total Pallets</label>
                <input type="number" id="palletsInput" placeholder="0" min="0" step="0.5" onchange="suggestLoadClass()">
              </div>
            </div>
            <div id="sabWarning" style="display:none;margin-top:10px" class="alert alert-info" style="font-size:12px">
              🔵 SAB Event — SAB-restricted fleet (MAN FC 89 PN GP) available
            </div>
          </div>

          <!-- STEP 2: LOAD CLASS & TRUCK -->
          <div class="card">
            <div class="card-title" style="margin-bottom:16px">② Load Class &amp; Fleet</div>
            <div class="form-group" style="margin-bottom:12px">
              <label>Load Class (auto-suggested)</label>
              <div style="display:flex;gap:8px;align-items:center">
                <select name="load_class" id="loadClassSelect" onchange="onLoadClassChange()">
                  <option value="">— Select —</option>
                  ${loadClasses.map(lc => `<option value="${lc.class}" data-mult="${lc.disbursement_multiplier}">${lc.class} — ${lc.label}</option>`).join('')}
                </select>
                <div id="loadClassBadge" style="flex-shrink:0"></div>
              </div>
              <div id="loadClassHint" style="font-size:11px;color:var(--bw-muted);margin-top:4px"></div>
            </div>
            <div class="form-group" style="margin-bottom:12px">
              <label>Allocated Vehicle</label>
              <select name="fleet_id" id="fleetSelect">
                <option value="">— Auto / TBD —</option>
                ${fleet.filter(v => !v.experiential).map(v => `<option value="${v.id}" data-experiential="${v.experiential || 0}">${v.description} — ${v.tonnage || ''} (${v.reg_number}) — ${formatZAR(v.daily_hire_rate)}/day</option>`).join('')}
              </select>
            </div>
            <div style="font-size:11px;color:var(--bw-muted);margin-top:4px">
              🎪 Experiential vehicles (Castle Lager truck, V-Truck) are hidden from this list — they're for brand activations only.
            </div>
            <div class="form-group">
              <label>Disbursement Multiplier</label>
              <div style="display:flex;align-items:center;gap:8px">
                <input type="number" id="disbMultInput" value="1.00" min="1" max="2" step="0.01" oninput="updateCalc()" style="width:100px">
                <span style="font-size:12px;color:var(--bw-muted)">× subtotal (auto-set by load class)</span>
              </div>
            </div>
          </div>
        </div>

        <!-- STEP 3: LINE ITEMS -->
        <div class="card" style="margin-bottom:20px">
          <div class="card-header">
            <span class="card-title">③ Cost Stack — Line Items</span>
            <div style="display:flex;gap:8px;align-items:center">
              <select id="rateCardPicker" style="padding:6px 10px;font-size:12px;background:var(--bw-black);border:1px solid var(--bw-border2);border-radius:6px;color:var(--bw-white);width:320px">
                <option value="">— Add from Rate Card —</option>
                ${ratePickerGroups}
              </select>
              <button type="button" onclick="addFromRateCard()" class="btn btn-gold btn-sm">Add</button>
              <button type="button" onclick="addCustomLine()" class="btn btn-outline btn-sm">+ Custom</button>
            </div>
          </div>

          <!-- Column headers -->
          <div style="display:grid;grid-template-columns:2fr 100px 120px 120px 100px 80px 90px 36px;gap:6px;padding:6px 8px;font-size:11px;font-weight:600;color:var(--bw-muted);text-transform:uppercase;border-bottom:1px solid var(--bw-border)">
            <div>Description</div>
            <div>Category</div>
            <div class="text-right">Qty</div>
            <div class="text-right">Unit Rate (R)</div>
            <div class="text-right">Line Total</div>
            <div style="text-align:center">Setup</div>
            <div style="text-align:center">Strike</div>
            <div></div>
          </div>

          <div id="lineItemsContainer" style="min-height:80px">
            <div id="emptyState" style="padding:32px;text-align:center;color:var(--bw-muted);font-size:13px">
              Select items from the Rate Card above or add custom lines
            </div>
          </div>

          <div style="border-top:2px solid var(--bw-border);padding:12px 8px;display:flex;flex-direction:column;align-items:flex-end;gap:4px">
            <div style="display:flex;justify-content:space-between;width:320px">
              <span class="text-muted">Subtotal</span>
              <span id="displaySubtotal" style="font-weight:600">R 0.00</span>
            </div>
            <div style="display:flex;justify-content:space-between;width:320px">
              <span class="text-muted">Disbursement</span>
              <span id="displayDisb">R 0.00</span>
            </div>
            <div style="display:flex;justify-content:space-between;width:320px">
              <span class="text-muted">VAT (15%)</span>
              <span id="displayVat">R 0.00</span>
            </div>
            <div style="display:flex;justify-content:space-between;width:320px;border-top:1px solid var(--bw-border);padding-top:8px;margin-top:4px">
              <span style="font-weight:700;font-size:16px">TOTAL incl. VAT</span>
              <span id="displayTotal" style="font-size:22px;font-weight:800;color:var(--bw-gold)">R 0.00</span>
            </div>
            ${can(user,'viewMargins') ? `
            <div style="display:flex;justify-content:space-between;width:320px;margin-top:4px">
              <span class="text-muted" style="font-size:12px">Est. Margin</span>
              <span id="displayMargin" style="font-size:12px;font-weight:700">—</span>
            </div>` : ''}
          </div>
        </div>

        <!-- STEP 4: NOTES & TERMS -->
        <div class="card" style="margin-bottom:20px">
          <div class="card-title" style="margin-bottom:12px">④ Notes &amp; Terms</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px" class="responsive-grid">
            <div class="form-group">
              <label>Internal Notes</label>
              <textarea name="notes" placeholder="Operational notes, special requirements, crew notes…" style="min-height:80px"></textarea>
            </div>
            <div class="form-group">
              <label>Payment Terms (client-facing)</label>
              <textarea name="terms" placeholder="Leave blank for standard terms…" style="min-height:80px"></textarea>
            </div>
          </div>
        </div>

        <!-- SUBMIT -->
        <div style="display:flex;gap:12px;align-items:center">
          <button type="submit" class="btn btn-gold" style="font-size:15px;padding:12px 28px" onclick="prepareSubmit()">
            <i class="fas fa-file-invoice"></i> Generate Quote
          </button>
          <a href="/quotes" class="btn btn-outline">Cancel</a>
          <span style="font-size:12px;color:var(--bw-muted);margin-left:auto">
            VAT 4790261301 · Quote saved as Draft — you can update status after
          </span>
        </div>
      </form>
    </div>

    <style>
      .responsive-grid{grid-template-columns:1fr 1fr}
      @media(max-width:768px){.responsive-grid{grid-template-columns:1fr}}
      .line-row{display:grid;grid-template-columns:2fr 100px 120px 120px 100px 80px 90px 36px;gap:6px;padding:6px 8px;border-bottom:1px solid var(--bw-border);align-items:center}
      .line-row:last-child{border-bottom:none}
      .line-row input{padding:5px 8px;font-size:12px}
      .line-row select{padding:5px 8px;font-size:12px}
      @media(max-width:768px){.line-row{grid-template-columns:1fr 80px 80px 36px;gap:4px}}
    </style>

    <script>
      const RATE_ITEMS = __RATE_ITEMS_JSON__;
      const LOAD_CLASSES = __LOAD_CLASSES_JSON__;
      const FLEET = __FLEET_JSON__;

      let lineItems = [];
      let isSabEvent = false;

      function onEventChange(sel) {
        const opt = sel.options[sel.selectedIndex];
        const pax = opt.getAttribute('data-pax');
        const sab = opt.getAttribute('data-sab') === '1';
        isSabEvent = sab;
        if (pax) document.getElementById('paxInput').value = pax;
        document.getElementById('sabWarning').style.display = sab ? 'block' : 'none';
        suggestLoadClass();
        filterFleetForSab();
      }

      function filterFleetForSab() {
        const sel = document.getElementById('fleetSelect');
        Array.from(sel.options).forEach(opt => {
          if (opt.value === '') return;
          const isSabOnly = opt.getAttribute('data-sab') === '1';
          if (isSabOnly && !isSabEvent) {
            opt.disabled = true;
            opt.style.color = '#555';
          } else {
            opt.disabled = false;
            opt.style.color = '';
          }
        });
        const w = document.getElementById('sabFleetWarning');
        if (w) w.style.display = !isSabEvent ? 'block' : 'none';
      }

      function suggestLoadClass() {
        const pax = parseInt(document.getElementById('paxInput').value) || 0;
        const pallets = parseFloat(document.getElementById('palletsInput').value) || 0;
        let suggested = null;
        for (const lc of LOAD_CLASSES) {
          const paxOk = pax >= (lc.pax_min||0) && pax <= (lc.pax_max||99999);
          const palOk = pallets >= (lc.pallet_min||0) && pallets <= (lc.pallet_max||99999);
          if (paxOk || (pallets > 0 && palOk)) { suggested = lc; break; }
        }
        if (suggested) {
          const sel = document.getElementById('loadClassSelect');
          sel.value = suggested.class;
          onLoadClassChange();
          document.getElementById('loadClassHint').textContent =
            '✓ Auto-suggested: ' + suggested.label + ' · Disbursement ×' + suggested.disbursement_multiplier;
        }
      }

      function onLoadClassChange() {
        const sel = document.getElementById('loadClassSelect');
        const opt = sel.options[sel.selectedIndex];
        const mult = parseFloat(opt.getAttribute('data-mult')) || 1.0;
        document.getElementById('disbMultInput').value = mult.toFixed(2);
        const badgeEl = document.getElementById('loadClassBadge');
        const cls = sel.value;
        const colors = {L1:'#6366f1',L2:'#3b82f6',L3:'#f59e0b',L4:'#ef4444'};
        badgeEl.innerHTML = cls
          ? '<span style="display:inline-block;padding:4px 14px;border-radius:12px;font-weight:700;color:#fff;background:' + (colors[cls]||'#888') + '">' + cls + '</span>'
          : '';
        updateCalc();
      }

      function addFromRateCard() {
        const sel = document.getElementById('rateCardPicker');
        const opt = sel.options[sel.selectedIndex];
        if (!opt.value) return;
        const id = parseInt(opt.value);
        const rate = parseFloat(opt.getAttribute('data-rate')) || 0;
        const unit = opt.getAttribute('data-unit') || 'each';
        const cat  = opt.getAttribute('data-cat') || '';
        const suppId = opt.getAttribute('data-supplier') || '';
        const costRate = parseFloat(opt.getAttribute('data-cost')) || 0;
        const item = RATE_ITEMS.find(r => r.id === id);
        if (!item) return;
        lineItems.push({
          id: Date.now(), rate_card_id: id, category: cat,
          description: item.line_item, unit, unit_rate: rate,
          quantity: 1, cost_rate: costRate, supplier_id: suppId || null,
          is_setup: false, is_strike: false, visible_to_client: true
        });
        renderLines();
        sel.value = '';
      }

      function addCustomLine() {
        lineItems.push({
          id: Date.now(), rate_card_id: null, category: 'Other',
          description: '', unit: 'each', unit_rate: 0,
          quantity: 1, cost_rate: 0, supplier_id: null,
          is_setup: false, is_strike: false, visible_to_client: true
        });
        renderLines();
      }

      function removeLine(id) {
        lineItems = lineItems.filter(li => li.id !== id);
        renderLines();
      }

      function renderLines() {
        const container = document.getElementById('lineItemsContainer');
        const empty = document.getElementById('emptyState');
        if (!lineItems.length) {
          container.innerHTML = '<div id="emptyState" style="padding:32px;text-align:center;color:var(--bw-muted);font-size:13px">Select items from the Rate Card above or add custom lines</div>';
          updateCalc();
          return;
        }
        container.innerHTML = lineItems.map(li => \`
          <div class="line-row" id="row-\${li.id}">
            <input type="text" value="\${li.description}" placeholder="Description" oninput="updateLine(\${li.id},'description',this.value)">
            <select oninput="updateLine(\${li.id},'category',this.value)" style="font-size:11px">
              \${['Structures','Furniture','Power','Staging','Fencing','Labour','Transport','Branding','Cooling','Consumables','Other'].map(c => '<option value="'+c+'"'+(li.category===c?' selected':'')+'>'+c+'</option>').join('')}
            </select>
            <input type="number" value="\${li.quantity}" min="0.5" step="0.5" style="text-align:right" oninput="updateLine(\${li.id},'quantity',parseFloat(this.value)||1)">
            <input type="number" value="\${li.unit_rate}" min="0" step="0.01" style="text-align:right" oninput="updateLine(\${li.id},'unit_rate',parseFloat(this.value)||0)">
            <div style="text-align:right;font-weight:600;padding-right:4px" id="lt-\${li.id}">\${fmtZAR(li.quantity * li.unit_rate)}</div>
            <div style="text-align:center">
              <input type="checkbox" \${li.is_setup?'checked':''} onchange="updateLine(\${li.id},'is_setup',this.checked)" title="Setup labour">
            </div>
            <div style="text-align:center">
              <input type="checkbox" \${li.is_strike?'checked':''} onchange="updateLine(\${li.id},'is_strike',this.checked)" title="Strike labour">
            </div>
            <button type="button" onclick="removeLine(\${li.id})" style="background:none;border:none;color:var(--bw-danger);cursor:pointer;font-size:16px;padding:4px">×</button>
          </div>\`).join('');
        updateCalc();
      }

      function updateLine(id, field, value) {
        const li = lineItems.find(l => l.id === id);
        if (!li) return;
        li[field] = value;
        const ltEl = document.getElementById('lt-'+id);
        if (ltEl) ltEl.textContent = fmtZAR(li.quantity * li.unit_rate);
        updateCalc();
      }

      function updateCalc() {
        const subtotal = lineItems.reduce((s,li) => s + (li.quantity * li.unit_rate), 0);
        const mult = parseFloat(document.getElementById('disbMultInput').value) || 1.0;
        const disbAmt = subtotal * (mult - 1);
        const exclVat = subtotal + disbAmt;
        const vatAmt  = exclVat * 0.15;
        const total   = exclVat + vatAmt;
        const internalCost = lineItems.reduce((s,li) => s + (li.quantity * (li.cost_rate||0)), 0);
        const margin = exclVat > 0 ? ((exclVat - internalCost) / exclVat * 100) : 0;

        document.getElementById('displaySubtotal').textContent = fmtZAR(subtotal);
        document.getElementById('displayDisb').textContent = fmtZAR(disbAmt);
        document.getElementById('displayVat').textContent = fmtZAR(vatAmt);
        document.getElementById('displayTotal').textContent = fmtZAR(total);
        document.getElementById('subtotalInput').value = subtotal.toFixed(2);
        document.getElementById('internalCostInput').value = internalCost.toFixed(2);
        document.getElementById('disbMult').value = mult.toFixed(4);

        const marginEl = document.getElementById('displayMargin');
        if (marginEl) {
          marginEl.textContent = internalCost > 0 ? margin.toFixed(1) + '%' : '—';
          marginEl.style.color = margin > 25 ? 'var(--bw-success)' : margin > 15 ? 'var(--bw-warn)' : 'var(--bw-danger)';
        }
      }

      function prepareSubmit() {
        document.getElementById('lineItemsInput').value = JSON.stringify(
          lineItems.map(li => ({
            rate_card_id: li.rate_card_id, category: li.category,
            description: li.description, unit: li.unit,
            quantity: li.quantity, unit_rate: li.unit_rate,
            is_setup: li.is_setup, is_strike: li.is_strike,
            supplier_id: li.supplier_id, cost_rate: li.cost_rate,
            visible_to_client: li.visible_to_client
          }))
        );
      }

      function fmtZAR(n) {
        return 'R\\u00a0' + (n||0).toLocaleString('en-ZA',{minimumFractionDigits:2,maximumFractionDigits:2});
      }

      // Init
      filterFleetForSab();
      ${preEvent ? `
        document.getElementById('paxInput').value = '${preEvent.pax || 0}';
        isSabEvent = ${preEvent.is_sab_event ? 'true' : 'false'};
        document.getElementById('sabWarning').style.display = isSabEvent ? 'block' : 'none';
        filterFleetForSab();
        suggestLoadClass();` : ''}
    </script>`

  .replace('__RATE_ITEMS_JSON__', rateOptionsJSON)
  .replace('__LOAD_CLASSES_JSON__', loadClassesJSON)
  .replace('__FLEET_JSON__', fleetJSON)
}

function defaultTerms(days: number): string {
  return `Payment is due within ${days} days of invoice date. A deposit of 50% is required to confirm the booking. ` +
    `Cancellations within 14 days of the event date will forfeit the deposit. ` +
    `B&W Productions (Pty) Ltd · VAT Reg: 4790261301 · Reg: 2009/189046/23`
}

export default quotes
