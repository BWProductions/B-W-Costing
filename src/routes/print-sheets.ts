// Print Sheets — Rate Card vs Handbook comparison (A4 printable) — BW Productions v2

import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth.js'
import { layout } from '../lib/layout.js'
import { formatZAR } from '../lib/format.js'
import type { AuthUser } from '../lib/auth.js'

type Env = { Bindings: { DB: D1Database }; Variables: { user: AuthUser } }

const printSheets = new Hono<Env>()
printSheets.use('*', requireAuth)

// ── RATE CARD PRINT SHEET ────────────────────────────────────────────────────
printSheets.get('/rate-card-print', async (c) => {
  const user = c.get('user')

  const rows = await c.env.DB.prepare(
    `SELECT rc.category, rc.line_item, rc.unit, rc.base_rate, rc.discount_pct,
     rc.effective_rate, rc.notes, s.name as supplier_name
     FROM rate_card rc
     LEFT JOIN suppliers s ON rc.supplier_id = s.id
     WHERE rc.active = 1
     ORDER BY rc.category, rc.line_item`
  ).all<any>()

  const byCategory: Record<string, any[]> = {}
  for (const row of rows.results) {
    if (!byCategory[row.category]) byCategory[row.category] = []
    byCategory[row.category].push(row)
  }

  const catEmojis: Record<string, string> = {
    Structures:'⛺', Furniture:'🪑', Power:'⚡', Staging:'🎤', Fencing:'🚧',
    Labour:'👷', Transport:'🚛', Branding:'🎨', Cooling:'❄️', Consumables:'📦', Other:'🔧'
  }

  const sections = Object.entries(byCategory).map(([cat, items]) => `
    <div class="ps-section">
      <div class="ps-cat-header">
        <span class="ps-cat-icon">${catEmojis[cat] ?? '📋'}</span>
        <span class="ps-cat-name">${cat}</span>
        <span class="ps-cat-count">${items.length} items</span>
      </div>
      <table class="ps-table">
        <thead>
          <tr>
            <th class="col-item">Line Item</th>
            <th class="col-unit">Unit</th>
            <th class="col-rate">Base Rate</th>
            <th class="col-disc">Disc %</th>
            <th class="col-eff">Effective Rate</th>
            <th class="col-sup">Supplier</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item, i) => `
          <tr class="${i % 2 === 1 ? 'alt' : ''}">
            <td class="col-item">
              <span class="item-name">${item.line_item}</span>
              ${item.notes ? `<span class="item-note">${item.notes}</span>` : ''}
            </td>
            <td class="col-unit muted">${item.unit}</td>
            <td class="col-rate">${formatZAR(item.base_rate)}</td>
            <td class="col-disc ${item.discount_pct > 0 ? 'disc-active' : 'muted'}">${item.discount_pct > 0 ? item.discount_pct + '%' : '—'}</td>
            <td class="col-eff ${item.discount_pct > 0 ? 'eff-gold' : ''}">${formatZAR(item.effective_rate ?? item.base_rate)}</td>
            <td class="col-sup muted">${item.supplier_name ?? '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`).join('')

  const today = new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })
  const totalItems = rows.results.length
  const totalCats  = Object.keys(byCategory).length

  const body = `
    <!-- TOOLBAR (screen only) -->
    <div class="no-print ps-toolbar">
      <div>
        <div class="ps-toolbar-title">Rate Card — Printable Sheet</div>
        <div class="ps-toolbar-sub">${totalItems} active items · ${totalCats} categories · All rates excl. VAT · Generated ${today}</div>
      </div>
      <div style="display:flex;gap:8px">
        <a href="/print-sheets/handbook-print" class="btn btn-outline btn-sm">
          <i class="fas fa-book-open"></i> Handbook Sheet
        </a>
        <button onclick="window.print()" class="btn btn-gold">
          <i class="fas fa-print"></i> Print / PDF
        </button>
      </div>
    </div>

    <!-- PRINT HEADER -->
    <div class="print-only ps-letterhead">
      <div class="ps-lh-brand">BW PRODUCTIONS</div>
      <div class="ps-lh-title">RATE CARD — SUPPLIER PRICE SCHEDULE</div>
      <div class="ps-lh-meta">
        <span>Printed: ${today}</span>
        <span>VAT No: 4790261301</span>
        <span>All rates excl. VAT (15%)</span>
        <span>CONFIDENTIAL — Internal Use Only</span>
      </div>
    </div>

    <div class="ps-summary-bar">
      <div class="ps-summary-chip">
        <i class="fas fa-list-check"></i> ${totalItems} Active Items
      </div>
      <div class="ps-summary-chip">
        <i class="fas fa-folder-open"></i> ${totalCats} Categories
      </div>
      <div class="ps-summary-chip">
        <i class="fas fa-percent"></i> VAT Excluded
      </div>
      <div class="ps-summary-chip">
        <i class="fas fa-calendar-day"></i> ${today}
      </div>
    </div>

    ${sections}

    <!-- FOOTER (print) -->
    <div class="print-only ps-footer">
      <div>BW Productions (Pty) Ltd · VAT 4790261301 · Randvaal, 1943 · info@bwproductions.co.za</div>
      <div>This rate card is confidential and for internal pricing use only. Rates subject to change — always verify against current quote.</div>
    </div>

    ${rateCardPrintStyles()}
  `

  return c.html(layout('Rate Card — Print Sheet', body, user, 'rate-card'))
})


// ── HANDBOOK PRINT SHEET ─────────────────────────────────────────────────────
printSheets.get('/handbook-print', async (c) => {
  const user = c.get('user')

  // Load all data we need for handbook
  const [fleetRows, loadClasses, supplierRows, topRateCard] = await Promise.all([
    c.env.DB.prepare(
      `SELECT reg_number, description, model, tonnage, vehicle_type, colour,
       box_length_m, box_width_m, box_height_m, box_volume_m3,
       daily_hire_rate, fuel_rate_per_km, experiential, status, notes
       FROM fleet WHERE active = 1 ORDER BY experiential, vehicle_type, reg_number`
    ).all<any>(),
    c.env.DB.prepare(
      `SELECT class, label, pax_min, pax_max, pallet_min, pallet_max, truck_class, disbursement_multiplier, notes
       FROM load_classes ORDER BY class`
    ).all<any>(),
    c.env.DB.prepare(
      `SELECT name, role, vat_registered, payment_terms, contact_name, contact_email, contact_phone
       FROM suppliers WHERE active = 1 ORDER BY role, name`
    ).all<any>(),
    c.env.DB.prepare(
      `SELECT category, line_item, unit, effective_rate, notes
       FROM rate_card WHERE active = 1
       ORDER BY category, effective_rate DESC`
    ).all<any>(),
  ])

  const today = new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })

  // Fleet table
  const fleetHtml = fleetRows.results.map((v: any) => {
    const dims = (v.box_length_m && v.box_width_m && v.box_height_m)
      ? `${v.box_length_m} × ${v.box_width_m} × ${v.box_height_m} m`
      : '—'
    return `
    <tr>
      <td class="mono">${v.reg_number}</td>
      <td>${v.description}${v.model ? `<br><span class="small-note">${v.model}</span>` : ''}</td>
      <td class="center">${v.tonnage ?? '—'}</td>
      <td class="center">${v.colour ?? '—'}</td>
      <td class="center">${dims}</td>
      <td class="center">${formatZAR(v.daily_hire_rate ?? 0)}</td>
      <td class="center ${v.status === 'available' ? 'status-ok' : v.status === 'maintenance' ? 'status-warn' : 'status-muted'}">${v.status}</td>
      <td class="center">${v.experiential ? '🎪 Exp.' : '—'}</td>
    </tr>`
  }).join('')

  // Load class table
  const lcHtml = loadClasses.results.map((lc: any) => `
    <tr>
      <td class="bold">${lc.class}</td>
      <td>${lc.label}</td>
      <td class="center">${lc.pax_min ?? '—'} – ${lc.pax_max ?? '—'}</td>
      <td class="center">${lc.pallet_min ?? '—'} – ${lc.pallet_max ?? '—'}</td>
      <td class="center">${lc.truck_class}</td>
      <td class="center">${lc.disbursement_multiplier ? lc.disbursement_multiplier + '×' : '—'}</td>
    </tr>`).join('')

  // Suppliers
  const roleOrder = ['COS', 'CAPEX', 'OPEX', 'Pass-Through', 'Expendable']
  const byRole: Record<string, any[]> = {}
  for (const s of supplierRows.results) {
    const r = s.role ?? 'Other'
    if (!byRole[r]) byRole[r] = []
    byRole[r].push(s)
  }

  const supplierHtml = roleOrder.concat(Object.keys(byRole).filter(r => !roleOrder.includes(r))).map(role => {
    const group = byRole[role]
    if (!group || !group.length) return ''
    return `
      <tr class="group-header"><td colspan="5">${role}</td></tr>
      ${group.map((s: any) => `
      <tr>
        <td class="bold">${s.name}</td>
        <td>${s.contact_name ?? '—'}</td>
        <td>${s.contact_phone ?? '—'}</td>
        <td>${s.contact_email ?? '—'}</td>
        <td class="center">${s.payment_terms ? s.payment_terms + ' days' : '—'}${s.vat_registered ? ' · VAT' : ''}</td>
      </tr>`).join('')}`
  }).join('')

  // Top-line rate card summary (just key items, max 30)
  const keyItems = topRateCard.results.slice(0, 36)
  const rcSummaryHtml = keyItems.map((item: any, i: number) => `
    <tr class="${i % 2 === 1 ? 'alt' : ''}">
      <td class="muted small">${item.category}</td>
      <td>${item.line_item}</td>
      <td class="muted small">${item.unit}</td>
      <td class="right bold">${formatZAR(item.effective_rate ?? 0)}</td>
    </tr>`).join('')

  const body = `
    <!-- TOOLBAR -->
    <div class="no-print ps-toolbar">
      <div>
        <div class="ps-toolbar-title">Operations Handbook — Printable Reference Sheet</div>
        <div class="ps-toolbar-sub">Fleet · Load Classes · Suppliers · Rate Summary · Generated ${today}</div>
      </div>
      <div style="display:flex;gap:8px">
        <a href="/print-sheets/rate-card-print" class="btn btn-outline btn-sm">
          <i class="fas fa-tags"></i> Rate Card Sheet
        </a>
        <button onclick="window.print()" class="btn btn-gold">
          <i class="fas fa-print"></i> Print / PDF
        </button>
      </div>
    </div>

    <!-- PRINT HEADER -->
    <div class="print-only ps-letterhead">
      <div class="ps-lh-brand">BW PRODUCTIONS</div>
      <div class="ps-lh-title">OPERATIONS HANDBOOK — QUICK REFERENCE</div>
      <div class="ps-lh-meta">
        <span>Printed: ${today}</span>
        <span>VAT No: 4790261301</span>
        <span>CONFIDENTIAL — Internal Use Only</span>
        <span>For latest data: bw-productions.pages.dev</span>
      </div>
    </div>

    <!-- ══ SECTION A: FLEET REGISTER ══ -->
    <div class="hb-section">
      <div class="hb-section-header">
        <span class="hb-sec-icon">🚛</span>
        <span class="hb-sec-title">A — Fleet Register</span>
        <span class="hb-sec-note no-print">All active vehicles · reg numbers · load class · rates</span>
      </div>
      <table class="ps-table">
        <thead>
          <tr>
            <th>Reg #</th>
            <th>Vehicle</th>
            <th class="center">Tonnage</th>
            <th class="center">Colour</th>
            <th class="center">Box (L × W × H)</th>
            <th class="center">Day Rate</th>
            <th class="center">Status</th>
            <th class="center">Use</th>
          </tr>
        </thead>
        <tbody>${fleetHtml || '<tr><td colspan="8" class="muted center">No fleet data</td></tr>'}</tbody>
      </table>

      <div class="hb-inline-note" style="margin-top:10px">
        <strong>🎪 Experiential vehicles</strong> (Castle Lager truck FC89PNGP, V-Truck DM29KPGP) are tagged for brand activations only — excluded from delivery / collection vehicle dropdowns.
        &nbsp;·&nbsp; <strong>Box dimensions pending</strong> on Small FAW No 5 (MB39CRGP) and Hino Snowy No 6 (CZ41WWGP).
      </div>
    </div>

    <!-- ══ SECTION B: LOAD CLASSES ══ -->
    <div class="hb-section">
      <div class="hb-section-header">
        <span class="hb-sec-icon">📦</span>
        <span class="hb-sec-title">B — Load Classes</span>
        <span class="hb-sec-note no-print">L1–L4 definitions · pax thresholds · disbursement multipliers</span>
      </div>
      <table class="ps-table">
        <thead>
          <tr>
            <th>Class</th>
            <th>Label</th>
            <th class="center">Pax Range</th>
            <th class="center">Pallet Range</th>
            <th class="center">Truck</th>
            <th class="center">Disbursement ×</th>
          </tr>
        </thead>
        <tbody>
          ${lcHtml || `
          <tr><td>L1</td><td>Light — Bakkie / 1-ton</td><td class="center">1 – 99</td><td class="center">0 – 1</td><td class="center">L1</td><td class="center">1.0×</td></tr>
          <tr class="alt"><td>L2</td><td>Medium — 4-ton truck</td><td class="center">100 – 299</td><td class="center">1 – 4</td><td class="center">L2</td><td class="center">1.15×</td></tr>
          <tr><td>L3</td><td>Heavy — 8-ton truck</td><td class="center">300 – 699</td><td class="center">4 – 8</td><td class="center">L3</td><td class="center">1.25×</td></tr>
          <tr class="alt"><td>L4</td><td>Mega — 10/14-ton truck</td><td class="center">700+</td><td class="center">8+</td><td class="center">L4</td><td class="center">1.35×</td></tr>`}
        </tbody>
      </table>
    </div>

    <!-- ══ SECTION C: SUPPLIERS ══ -->
    <div class="hb-section">
      <div class="hb-section-header">
        <span class="hb-sec-icon">🤝</span>
        <span class="hb-sec-title">C — Supplier Directory</span>
        <span class="hb-sec-note no-print">Grouped by role · contact details · payment terms</span>
      </div>
      <table class="ps-table">
        <thead>
          <tr>
            <th>Supplier</th>
            <th>Contact</th>
            <th>Phone</th>
            <th>Email</th>
            <th class="center">Terms / VAT</th>
          </tr>
        </thead>
        <tbody>${supplierHtml || '<tr><td colspan="5" class="muted center">No supplier data</td></tr>'}</tbody>
      </table>
    </div>

    <!-- ══ SECTION D: RATE CARD SUMMARY ══ -->
    <div class="hb-section">
      <div class="hb-section-header">
        <span class="hb-sec-icon">💰</span>
        <span class="hb-sec-title">D — Rate Card Summary</span>
        <span class="hb-sec-note no-print">Top ${keyItems.length} items · full list at /rate-card · all excl. VAT</span>
      </div>
      <table class="ps-table">
        <thead>
          <tr>
            <th>Category</th>
            <th>Line Item</th>
            <th>Unit</th>
            <th class="right">Effective Rate</th>
          </tr>
        </thead>
        <tbody>${rcSummaryHtml || '<tr><td colspan="4" class="muted center">No rate card data</td></tr>'}</tbody>
      </table>
      <div class="hb-inline-note" style="margin-top:8px">
        All rates excl. VAT (15%). Setup and Strike labour are always separate line items — never bundled. Full rate card: <strong>/rate-card</strong>
      </div>
    </div>

    <!-- ══ SECTION E: KEY POLICIES ══ -->
    <div class="hb-section">
      <div class="hb-section-header">
        <span class="hb-sec-icon">📋</span>
        <span class="hb-sec-title">E — Key Policies & Flags</span>
      </div>
      <table class="ps-table">
        <tbody>
          <tr><td class="bold" style="width:30%;color:#ef4444">VOUCHERS — CLOSED</td><td>No new vouchers to be issued or processed. All spend pre-approved and invoiced through standard supplier process. Queries → Finance Director.</td></tr>
          <tr class="alt"><td class="bold">Isuzu KB 250 D-TEQ</td><td>KB 250 trucks are L1-class (1-ton payload, GVM 2,850kg) and are signed-off — these vehicles can be dispatched without secondary authorisation on L1 loads.</td></tr>
          <tr><td class="bold">SAB Restriction</td><td>MAN TGS (FC 89 PN GP) is restricted to SAB events only. Never auto-allocate to non-SAB jobs.</td></tr>
          <tr class="alt"><td class="bold">EG Written Terms</td><td>60-day payment terms with Events Guys are verbal only. Get written confirmation — 7-day printed term is the only enforceable term.</td></tr>
          <tr><td class="bold">Inkredible Print VAT</td><td>~R21k in 0% VAT on Inkredible Print invoices — request corrected tax invoices. Owner: Finance.</td></tr>
          <tr class="alt"><td class="bold">Stage One — Asset</td><td>Stage One 8-ton asset must be moved to Fixed Asset register by accountant. Owner: Finance.</td></tr>
          <tr><td class="bold">FAW 2nd Reg</td><td>Second FAW 8-ton registration outstanding — needed for insurance and dispatch. Owner: Brian (Sipho).</td></tr>
          <tr class="alt"><td class="bold">Event Cars Pricing</td><td>60 event cars × 7 days — pricing needs to be raised with vendor due to fluctuating costs. Owner: Ops.</td></tr>
          <tr><td class="bold">Control A / Castle Lite</td><td>Castle Lite items off-site since Feb — no cover on 60+ items. Contact Control A urgently. Owner: Brian (Sipho).</td></tr>
          <tr class="alt"><td class="bold">Setup / Strike Labour</td><td>Always quoted as separate line items. Never bundled. This is policy, not a preference.</td></tr>
          <tr><td class="bold">VAT</td><td>BW Productions VAT No: 4790261301. All quotes and invoices must show VAT at 15% separately.</td></tr>
        </tbody>
      </table>
    </div>

    <!-- FOOTER (print) -->
    <div class="print-only ps-footer">
      <div>BW Productions (Pty) Ltd · VAT 4790261301 · Randvaal, 1943 · info@bwproductions.co.za</div>
      <div>Printed: ${today} · This handbook is confidential and for internal use only. Verify critical details against the live platform before quoting.</div>
    </div>

    ${handbookPrintStyles()}
  `

  return c.html(layout('Operations Handbook — Print', body, user, 'handbook'))
})


// ── SHARED STYLES ─────────────────────────────────────────────────────────────
function rateCardPrintStyles(): string {
  return `<style>
    .ps-toolbar {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 20px; flex-wrap: wrap; gap: 10px;
    }
    .ps-toolbar-title { font-size: 16px; font-weight: 700; color: var(--white); }
    .ps-toolbar-sub   { font-size: 12px; color: var(--muted); margin-top: 3px; }

    .ps-letterhead { margin-bottom: 20px; text-align: center; padding-bottom: 12px; border-bottom: 2px solid #C9A84C; }
    .ps-lh-brand   { font-family: Georgia, serif; font-size: 24px; font-weight: 900; color: #C9A84C; letter-spacing: 0.08em; }
    .ps-lh-title   { font-size: 13px; font-weight: 700; letter-spacing: 0.1em; margin: 4px 0; }
    .ps-lh-meta    { display: flex; gap: 20px; justify-content: center; font-size: 10px; color: #666; flex-wrap: wrap; margin-top: 4px; }

    .ps-summary-bar {
      display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 18px;
    }
    .ps-summary-chip {
      display: flex; align-items: center; gap: 6px;
      padding: 6px 14px; border-radius: 20px;
      background: rgba(201,168,76,0.08); border: 1px solid rgba(201,168,76,0.2);
      font-size: 12px; color: var(--gold-lt); font-weight: 500;
    }
    .ps-summary-chip i { font-size: 11px; }

    .ps-section {
      background: var(--navy-card); border: 1px solid var(--navy-border);
      border-radius: 10px; margin-bottom: 16px; overflow: hidden;
    }
    .ps-cat-header {
      display: flex; align-items: center; gap: 10px;
      padding: 12px 16px; background: rgba(201,168,76,0.05);
      border-bottom: 1px solid var(--navy-border);
    }
    .ps-cat-icon  { font-size: 16px; }
    .ps-cat-name  { font-family: 'Cinzel', serif; font-size: 13px; font-weight: 700; color: var(--gold-lt); flex: 1; }
    .ps-cat-count { font-size: 11px; color: var(--muted); }

    .ps-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .ps-table thead th {
      padding: 8px 12px; text-align: left; font-size: 9px; font-weight: 700;
      color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em;
      border-bottom: 1px solid var(--navy-border); background: rgba(255,255,255,0.02);
    }
    .ps-table tbody td { padding: 8px 12px; border-bottom: 1px solid rgba(33,38,45,0.5); vertical-align: top; }
    .ps-table tbody tr:last-child td { border-bottom: none; }
    .ps-table tbody tr.alt td { background: rgba(255,255,255,0.015); }
    .ps-table td.muted      { color: var(--muted); }
    .ps-table td.center     { text-align: center; }
    .ps-table td.right      { text-align: right; }
    .ps-table td.bold       { font-weight: 600; }
    .ps-table td.small      { font-size: 11px; }
    .ps-table td.mono       { font-family: 'Courier New', monospace; font-size: 11px; }
    .ps-table td.disc-active{ color: #fcd34d; font-weight: 600; }
    .ps-table td.eff-gold   { color: var(--gold); font-weight: 700; }
    .ps-table td.status-ok  { color: var(--success); }
    .ps-table td.status-warn{ color: var(--warn); }
    .ps-table td.status-muted { color: var(--muted); }

    .item-name  { display: block; font-weight: 500; color: var(--white); }
    .item-note  { display: block; font-size: 10px; color: var(--muted); margin-top: 2px; }
    .small-note { font-size: 10px; color: var(--muted); }

    .col-item { width: 35%; }
    .col-unit { width: 8%; }
    .col-rate { width: 13%; text-align: right; }
    .col-disc { width: 8%; text-align: center; }
    .col-eff  { width: 14%; text-align: right; font-weight: 600; }
    .col-sup  { width: 16%; }

    .ps-footer { margin-top: 24px; text-align: center; font-size: 10px; color: #666; line-height: 1.6; }

    @media print {
      .no-print { display: none !important; }
      .sidebar, .topbar, .main > .topbar { display: none !important; }
      .main { margin-left: 0 !important; }
      .content { padding: 4px !important; }
      body { background: #fff !important; color: #111 !important; }
      .ps-section {
        background: #fff !important; border: 1px solid #ccc !important;
        border-radius: 3px !important; page-break-inside: avoid;
        margin-bottom: 8px !important;
      }
      .ps-cat-header { background: #f5f0e0 !important; padding: 7px 10px !important; }
      .ps-cat-name { color: #8B6914 !important; font-size: 11px !important; }
      .ps-cat-count { color: #999 !important; }
      .ps-summary-bar { display: none !important; }
      .ps-table { font-size: 10px !important; }
      .ps-table thead th { background: #f9f9f9 !important; color: #666 !important; padding: 5px 8px !important; font-size: 8px !important; }
      .ps-table tbody td { padding: 5px 8px !important; border-bottom: 1px solid #e5e5e5 !important; color: #111 !important; }
      .ps-table td.muted { color: #666 !important; }
      .ps-table td.eff-gold { color: #8B6914 !important; }
      .item-name { color: #111 !important; }
      .item-note { color: #777 !important; }
      .ps-letterhead { display: block !important; }
      .print-only { display: block !important; }
      .ps-footer { display: block !important; border-top: 1px solid #ccc; padding-top: 8px; }
      @page { margin: 12mm 10mm; size: A4; }
    }
    @media screen { .print-only { display: none; } }
  </style>`
}

function handbookPrintStyles(): string {
  return `<style>
    .ps-toolbar {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 20px; flex-wrap: wrap; gap: 10px;
    }
    .ps-toolbar-title { font-size: 16px; font-weight: 700; color: var(--white); }
    .ps-toolbar-sub   { font-size: 12px; color: var(--muted); margin-top: 3px; }

    .ps-letterhead { margin-bottom: 20px; text-align: center; padding-bottom: 12px; border-bottom: 2px solid #C9A84C; }
    .ps-lh-brand   { font-family: Georgia, serif; font-size: 24px; font-weight: 900; color: #C9A84C; letter-spacing: 0.08em; }
    .ps-lh-title   { font-size: 13px; font-weight: 700; letter-spacing: 0.1em; margin: 4px 0; }
    .ps-lh-meta    { display: flex; gap: 20px; justify-content: center; font-size: 10px; color: #666; flex-wrap: wrap; margin-top: 4px; }

    .hb-section {
      background: var(--navy-card); border: 1px solid var(--navy-border);
      border-radius: 10px; margin-bottom: 18px; overflow: hidden;
    }
    .hb-section-header {
      display: flex; align-items: center; gap: 10px;
      padding: 13px 18px; background: rgba(201,168,76,0.05);
      border-bottom: 1px solid var(--navy-border);
    }
    .hb-sec-icon  { font-size: 18px; }
    .hb-sec-title { font-family: 'Cinzel', serif; font-size: 14px; font-weight: 700; color: var(--gold-lt); flex: 1; letter-spacing: 0.03em; }
    .hb-sec-note  { font-size: 11px; color: var(--muted); }

    .hb-inline-note {
      margin: 0; padding: 10px 16px;
      background: rgba(201,168,76,0.04); border-top: 1px solid rgba(201,168,76,0.1);
      font-size: 11px; color: var(--muted); line-height: 1.6;
    }

    .ps-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .ps-table thead th {
      padding: 8px 12px; text-align: left; font-size: 9px; font-weight: 700;
      color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em;
      border-bottom: 1px solid var(--navy-border); background: rgba(255,255,255,0.02);
    }
    .ps-table thead th.center, .ps-table thead th.right { text-align: center; }
    .ps-table thead th.right { text-align: right; }
    .ps-table tbody td { padding: 8px 12px; border-bottom: 1px solid rgba(33,38,45,0.5); vertical-align: top; }
    .ps-table tbody tr:last-child td { border-bottom: none; }
    .ps-table tbody tr.alt td { background: rgba(255,255,255,0.015); }
    .ps-table tbody tr.group-header td {
      background: rgba(201,168,76,0.08); font-size: 10px; font-weight: 700;
      color: var(--gold); text-transform: uppercase; letter-spacing: 0.1em;
      padding: 6px 12px; border-bottom: 1px solid rgba(201,168,76,0.15);
    }
    .ps-table td.muted  { color: var(--muted); }
    .ps-table td.center { text-align: center; }
    .ps-table td.right  { text-align: right; }
    .ps-table td.bold   { font-weight: 600; }
    .ps-table td.small  { font-size: 11px; }
    .ps-table td.mono   { font-family: 'Courier New', monospace; font-size: 11px; color: var(--gold); }
    .ps-table td.status-ok  { color: var(--success); font-weight: 600; }
    .ps-table td.status-warn{ color: var(--warn); font-weight: 600; }
    .ps-table td.status-muted { color: var(--muted); }
    .small-note { font-size: 10px; color: var(--muted); }

    .ps-footer { margin-top: 24px; text-align: center; font-size: 10px; color: #666; line-height: 1.6; }

    @media print {
      .no-print { display: none !important; }
      .sidebar, .topbar, .main > .topbar { display: none !important; }
      .main { margin-left: 0 !important; }
      .content { padding: 4px !important; }
      body { background: #fff !important; color: #111 !important; }
      .hb-section {
        background: #fff !important; border: 1px solid #ccc !important;
        border-radius: 3px !important; page-break-inside: avoid; margin-bottom: 10px !important;
      }
      .hb-section-header { background: #f5f0e0 !important; padding: 7px 12px !important; }
      .hb-sec-title { color: #8B6914 !important; font-size: 12px !important; }
      .hb-sec-note { display: none; }
      .hb-inline-note { background: #fffdf5 !important; border-color: #e0c870 !important; color: #555 !important; font-size: 10px !important; }
      .ps-table { font-size: 10px !important; }
      .ps-table thead th { background: #f9f9f9 !important; color: #666 !important; padding: 5px 8px !important; font-size: 8px !important; }
      .ps-table tbody td { padding: 5px 8px !important; border-bottom: 1px solid #e5e5e5 !important; color: #111 !important; }
      .ps-table td.muted { color: #666 !important; }
      .ps-table tbody tr.group-header td { background: #f5f0e0 !important; color: #8B6914 !important; }
      .ps-table td.mono { color: #8B6914 !important; }
      .ps-table td.status-ok { color: #065f46 !important; }
      .ps-table td.status-warn { color: #92400e !important; }
      .ps-letterhead, .print-only { display: block !important; }
      .ps-footer { display: block !important; border-top: 1px solid #ccc; padding-top: 8px; }
      .small-note { color: #888 !important; }
      @page { margin: 12mm 10mm; size: A4; }
    }
    @media screen { .print-only { display: none; } }
  </style>`
}

export default printSheets
