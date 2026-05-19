// Dashboard route — BW Productions CI v2.0

import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth.js'
import { layout } from '../lib/layout.js'
import { formatZAR, formatDate, statusBadge } from '../lib/format.js'
import type { AuthUser } from '../lib/auth.js'
import { can } from '../lib/auth.js'

type Env = { Bindings: { DB: D1Database }; Variables: { user: AuthUser } }

const dashboard = new Hono<Env>()
dashboard.use('*', requireAuth)

dashboard.get('/', async (c) => {
  const user = c.get('user')
  const db = c.env.DB

  const [eventStats, quoteStats, fleetStats, recentEvents] = await Promise.all([
    db.prepare(`SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status='brief' THEN 1 ELSE 0 END) as briefs,
      SUM(CASE WHEN status='quoted' THEN 1 ELSE 0 END) as quoted,
      SUM(CASE WHEN status='won' THEN 1 ELSE 0 END) as won,
      SUM(CASE WHEN status='delivered' THEN 1 ELSE 0 END) as delivered
      FROM events WHERE status != 'cancelled'`).first<any>(),

    db.prepare(`SELECT
      COUNT(*) as total,
      SUM(total) as pipeline_value,
      SUM(CASE WHEN status='accepted' THEN total ELSE 0 END) as won_value
      FROM quotes WHERE status != 'superseded'`).first<any>(),

    db.prepare(`SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status='available' THEN 1 ELSE 0 END) as available,
      SUM(CASE WHEN status='allocated' THEN 1 ELSE 0 END) as allocated,
      SUM(CASE WHEN status='maintenance' THEN 1 ELSE 0 END) as maintenance
      FROM fleet WHERE active=1`).first<any>(),

    db.prepare(`SELECT e.id, e.name, e.event_date, e.status, e.pax, e.is_sab_event,
      c.name as client_name FROM events e
      JOIN clients c ON e.client_id = c.id
      WHERE e.status != 'cancelled'
      ORDER BY e.event_date ASC LIMIT 8`).all<any>()
  ])

  const es = eventStats as any
  const qs = quoteStats as any
  const fs = fleetStats as any
  const events = recentEvents.results

  const upcomingRows = events.map((e: any) => `
    <tr>
      <td>
        <a href="/events/${e.id}" style="color:var(--gold-lt);text-decoration:none;font-weight:600">
          ${e.name}
        </a>
        ${e.is_sab_event ? ' <span class="badge badge-sab">SAB</span>' : ''}
      </td>
      <td class="muted">${e.client_name}</td>
      <td class="muted">${formatDate(e.event_date)}</td>
      <td>${e.pax?.toLocaleString() ?? '—'}</td>
      <td>${statusBadge(e.status)}</td>
      <td><a href="/events/${e.id}" class="btn btn-outline btn-sm">View</a></td>
    </tr>`).join('')

  // Open actions data (hardcoded from session data — will be DB-driven in v2)
  const openActionsHigh = [
    { label: 'EG 60-day terms', detail: 'Get written confirmation — 7-day printed term is only enforceable one', owner: 'Brian (Sipho)' },
    { label: 'Inkredible Print VAT', detail: '0% VAT on ~R21k — request corrected tax invoice', owner: 'Finance' },
    { label: 'Stage One reclassify', detail: 'Instruct accountant to move 8-ton asset to Fixed Asset register', owner: 'Finance' },
    { label: 'FAW 2nd reg number', detail: 'Second FAW 8-ton reg outstanding — needed for insurance & dispatch', owner: 'Brian (Sipho)' },
    { label: 'Toyota Dyna GVM', detail: 'Verify actual GVM — currently unconfirmed, affects load class', owner: 'Brian (Sipho)' },
    { label: 'Control A contact', detail: 'Castle Lite items off-site since Feb — no cover on 60+ items', owner: 'Brian (Sipho)' },
    { label: 'Stella recount', detail: '33 SKUs on hold — physical recount required', owner: 'Warehouse' },
    { label: 'Vouchers — CLOSED', detail: 'Voucher system is closed. No new vouchers to be issued or processed.', owner: 'Finance' },
  ]

  const actionRows = openActionsHigh.map(a => `
    <tr>
      <td><span class="priority-high"><i class="fas fa-circle-exclamation" style="font-size:10px"></i></span></td>
      <td style="font-weight:600;color:var(--white)">${a.label}</td>
      <td class="muted" style="font-size:12px">${a.detail}</td>
      <td><span class="badge badge-warn">${a.owner}</span></td>
    </tr>`).join('')

  // Fleet summary (from verified data)
  const fleetSummary = [
    { reg: 'KB250-01 / KB250-02', type: 'Isuzu KB 250 D-TEQ × 2', class: 'L1 — 1-ton', status: '✅ Active', rate: 'R950/day' },
    { reg: 'Various (6 units)',    type: 'L2 Mix (Hyundai EX8, Hino, Tata, Dyna)', class: 'L2 — ~4-ton', status: '✅ Active', rate: 'R3,500/trip' },
    { reg: 'FAW-001 / pending',   type: 'FAW 15.180FL × 2', class: 'L3 — 8-ton', status: '⚠ 2nd Reg', rate: 'R4,500/trip' },
    { reg: 'Atego-01 / Atego-02', type: 'Mercedes Atego 1418 × 2', class: 'L4 — 14-ton GVM', status: '✅ Active — BW Owned', rate: 'R5,000/trip' },
    { reg: 'FAW-10T / MAN-10T',   type: 'FAW 10-ton / MAN 10-ton', class: 'L4 — 10-ton', status: '✅ Active', rate: 'R10,900/trip' },
  ]

  const fleetRows = fleetSummary.map(f => `
    <tr>
      <td class="mono" style="font-size:11px;color:var(--muted)">${f.reg}</td>
      <td style="font-weight:500">${f.type}</td>
      <td><span class="badge badge-info" style="font-size:9px">${f.class}</span></td>
      <td style="font-size:12px">${f.status}</td>
      <td class="gold">${f.rate}</td>
    </tr>`).join('')

  const body = `
    <!-- GREETING BANNER -->
    <div style="
      background: linear-gradient(135deg, rgba(201,168,76,0.06) 0%, rgba(204,24,232,0.04) 50%, rgba(24,217,255,0.06) 100%);
      border: 1px solid rgba(201,168,76,0.12);
      border-radius: 16px;
      padding: 24px 28px;
      margin-bottom: 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    ">
      <div>
        <h2 style="font-size:22px;font-weight:800;color:var(--white);font-family:'Cinzel',serif;letter-spacing:0.02em">
          ${greeting()}, ${user.name.split(' ')[0]}
        </h2>
        <p style="color:var(--muted);font-size:13px;margin-top:5px">
          ${new Date().toLocaleDateString('en-ZA', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
          &nbsp;·&nbsp; BW Productions Ops Platform v2
        </p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <a href="/quotes/new" class="btn btn-gold"><i class="fas fa-plus"></i> New Quote</a>
        <a href="/events/new" class="btn btn-outline"><i class="fas fa-calendar-plus"></i> New Event</a>
      </div>
    </div>

    <!-- FLAME DIVIDER -->
    <div class="flame-divider"></div>

    <!-- STATS -->
    <div class="stats-grid">
      <div class="stat-card stat-gold">
        <div class="stat-label"><i class="fas fa-calendar-days" style="margin-right:5px"></i>Active Events</div>
        <div class="stat-value">${es?.total ?? 0}</div>
        <div class="stat-sub">${es?.won ?? 0} won &nbsp;·&nbsp; ${es?.briefs ?? 0} in brief</div>
      </div>
      <div class="stat-card stat-green">
        <div class="stat-label"><i class="fas fa-chart-line" style="margin-right:5px"></i>Pipeline Value</div>
        <div class="stat-value" style="font-size:20px">
          ${can(user,'viewMargins') ? formatZAR(qs?.pipeline_value ?? 0) : '— — —'}
        </div>
        <div class="stat-sub">
          ${can(user,'viewMargins') ? formatZAR(qs?.won_value ?? 0) + ' confirmed' : 'Finance access only'}
        </div>
      </div>
      <div class="stat-card stat-warn">
        <div class="stat-label"><i class="fas fa-truck" style="margin-right:5px"></i>Fleet Available</div>
        <div class="stat-value">
          ${fs?.available ?? 0}
          <span style="font-size:16px;color:var(--muted);font-weight:400"> / ${fs?.total ?? 0}</span>
        </div>
        <div class="stat-sub">${fs?.allocated ?? 0} allocated &nbsp;·&nbsp; ${fs?.maintenance ?? 0} in maint.</div>
      </div>
      <div class="stat-card stat-flame">
        <div class="stat-label"><i class="fas fa-file-invoice" style="margin-right:5px"></i>Quotes Issued</div>
        <div class="stat-value">${qs?.total ?? 0}</div>
        <div class="stat-sub">This pipeline</div>
      </div>
    </div>

    <!-- OPEN ACTIONS — HIGH PRIORITY -->
    <div class="card card-glow" style="border-color:rgba(239,68,68,0.2)">
      <div class="card-header">
        <div class="card-title">
          <div class="card-title-icon" style="background:rgba(239,68,68,0.12);color:#f87171">
            <i class="fas fa-triangle-exclamation"></i>
          </div>
          High-Priority Open Actions
          <span class="badge badge-danger">${openActionsHigh.length} open</span>
        </div>
        <a href="/admin" class="btn btn-outline btn-sm">View All</a>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th style="width:24px"></th>
              <th>Action</th>
              <th>Detail</th>
              <th>Owner</th>
            </tr>
          </thead>
          <tbody>${actionRows}</tbody>
        </table>
      </div>
    </div>

    <!-- UPCOMING EVENTS -->
    <div class="card card-glow">
      <div class="card-header">
        <div class="card-title">
          <div class="card-title-icon"><i class="fas fa-calendar-days"></i></div>
          Events — Upcoming &amp; Active
        </div>
        <a href="/events" class="btn btn-outline btn-sm">View All</a>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Event</th>
              <th>Client</th>
              <th>Date</th>
              <th>Pax</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${upcomingRows || `
              <tr><td colspan="6" style="text-align:center;padding:28px;color:var(--muted)">
                No events yet — <a href="/events/new" style="color:var(--gold)">create one</a>
              </td></tr>`}
          </tbody>
        </table>
      </div>
    </div>

    <!-- FLEET SUMMARY -->
    <div class="card card-glow">
      <div class="card-header">
        <div class="card-title">
          <div class="card-title-icon"><i class="fas fa-truck"></i></div>
          Fleet Register — Verified Load Classes
        </div>
        <a href="/fleet" class="btn btn-outline btn-sm">Full Register</a>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Reg</th>
              <th>Vehicle</th>
              <th>Class</th>
              <th>Status</th>
              <th>EG Rate</th>
            </tr>
          </thead>
          <tbody>${fleetRows}</tbody>
        </table>
      </div>
    </div>

    <!-- KEY FINANCIALS -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-bottom:20px">
      <!-- EG Pricing -->
      <div class="card card-glow" style="margin-bottom:0">
        <div class="card-header">
          <div class="card-title">
            <div class="card-title-icon" style="background:rgba(24,217,255,0.1);color:var(--cyan)">
              <i class="fas fa-tags"></i>
            </div>
            EG Rate Tiers
          </div>
          <a href="/rate-card" class="btn btn-outline btn-sm">Rate Card</a>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${[
            ['L1 Bakkie', 'R1,950/trip', 'R1,500/day'],
            ['L2 ~4-ton', 'R3,500/trip', '—'],
            ['L3 8-ton FAW', 'R4,500/trip', '—'],
            ['L4 14-ton Merc', 'R5,000/trip', '—'],
            ['Mega Event Tier', 'R10,900/trip', '—'],
          ].map(([label, eg, bw]) => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--navy-border)">
              <span style="font-size:12px;color:var(--muted)">${label}</span>
              <div style="display:flex;gap:8px;align-items:center">
                <span class="badge badge-info" style="font-size:10px">${eg}</span>
                ${bw !== '—' ? `<span class="badge badge-gold" style="font-size:10px">${bw}</span>` : ''}
              </div>
            </div>`).join('')}
        </div>
      </div>

      <!-- Financial Flags -->
      <div class="card card-glow" style="margin-bottom:0;border-color:rgba(245,158,11,0.15)">
        <div class="card-header">
          <div class="card-title">
            <div class="card-title-icon" style="background:rgba(245,158,11,0.1);color:var(--warn)">
              <i class="fas fa-flag"></i>
            </div>
            Financial Flags
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${[
            { icon: 'fa-receipt',     color: '#f87171', label: 'Inkredible Print VAT',     val: '~R21k unreclaimed',   sev: 'danger' },
            { icon: 'fa-car',         color: '#fcd34d', label: 'Event cars (60 × 7 days)', val: 'Pricing to raise',    sev: 'warn'   },
            { icon: 'fa-building',    color: '#fcd34d', label: 'Stage One — Fixed Asset',  val: 'Reclassify needed',   sev: 'warn'   },
            { icon: 'fa-file-circle-question', color: '#93c5fd', label: 'EG written terms', val: '60-day verbal only', sev: 'info'   },
          ].map(f => `
            <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--navy-border)">
              <i class="fas ${f.icon}" style="color:${f.color};font-size:13px;width:16px;text-align:center"></i>
              <div style="flex:1">
                <div style="font-size:12px;font-weight:500;color:var(--white)">${f.label}</div>
                <div style="font-size:11px;color:var(--muted)">${f.val}</div>
              </div>
              <span class="badge badge-${f.sev}" style="font-size:9px">${f.sev.toUpperCase()}</span>
            </div>`).join('')}
        </div>
      </div>
    </div>

    <!-- SAB V2 HOOK -->
    <div class="card" style="border-color:rgba(59,130,246,0.2);background:rgba(30,58,95,0.15)">
      <div class="card-header">
        <div class="card-title" style="color:#60a5fa">
          <div class="card-title-icon" style="background:rgba(59,130,246,0.1);color:#60a5fa">
            <i class="fas fa-circle-nodes"></i>
          </div>
          SAB SOW Compliance — V2
          <span class="badge badge-sab">In Development</span>
        </div>
      </div>
      <p style="color:#475569;font-size:13px;line-height:1.6">
        46-KPI dashboard &nbsp;·&nbsp; Service Credit tracker &nbsp;·&nbsp; Wheel Spend Reports
        &nbsp;·&nbsp; Sage sync — hooks are in the schema, UI is next.
      </p>
    </div>
  `

  return c.html(layout('Dashboard', body, user, 'dashboard'))
})

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default dashboard
