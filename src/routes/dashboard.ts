// Dashboard route

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

  // Pull key stats
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
      <td><a href="/events/${e.id}" style="color:var(--bw-gold);text-decoration:none;font-weight:500">${e.name}</a>
        ${e.is_sab_event ? ' <span class="badge badge-sab">SAB</span>' : ''}
      </td>
      <td class="muted">${e.client_name}</td>
      <td class="muted">${formatDate(e.event_date)}</td>
      <td>${e.pax?.toLocaleString() ?? '—'}</td>
      <td>${statusBadge(e.status)}</td>
      <td>
        <a href="/events/${e.id}" class="btn btn-outline btn-sm">View</a>
      </td>
    </tr>`).join('')

  const body = `
    <!-- GREETING -->
    <div style="margin-bottom:24px">
      <h2 style="font-size:22px;font-weight:700;color:#f5f5f5">
        ${greeting()}, ${user.name.split(' ')[0]} 👋
      </h2>
      <p style="color:#888;font-size:13px;margin-top:4px">
        ${new Date().toLocaleDateString('en-ZA', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
        &nbsp;·&nbsp; B&amp;W Productions Ops Platform
      </p>
    </div>

    <!-- STATS -->
    <div class="stats-grid">
      <div class="stat-card stat-gold">
        <div class="stat-label">Active Events</div>
        <div class="stat-value">${es?.total ?? 0}</div>
        <div class="stat-sub">${es?.won ?? 0} won · ${es?.briefs ?? 0} in brief</div>
      </div>
      <div class="stat-card stat-green">
        <div class="stat-label">Pipeline Value</div>
        <div class="stat-value" style="font-size:20px">${can(user,'viewMargins') ? formatZAR(qs?.pipeline_value ?? 0) : '***'}</div>
        <div class="stat-sub">${can(user,'viewMargins') ? formatZAR(qs?.won_value ?? 0) + ' confirmed' : 'Finance only'}</div>
      </div>
      <div class="stat-card stat-warn">
        <div class="stat-label">Fleet Available</div>
        <div class="stat-value">${fs?.available ?? 0} <span style="font-size:16px;color:#888">/ ${fs?.total ?? 0}</span></div>
        <div class="stat-sub">${fs?.allocated ?? 0} allocated · ${fs?.maintenance ?? 0} in maint.</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Quotes Issued</div>
        <div class="stat-value">${qs?.total ?? 0}</div>
        <div class="stat-sub">This pipeline</div>
      </div>
    </div>

    <!-- QUICK ACTIONS -->
    <div class="card">
      <div class="card-header">
        <span class="card-title">⚡ Quick Actions</span>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <a href="/quotes/new" class="btn btn-gold">
          <i class="fas fa-plus"></i> New Quote
        </a>
        <a href="/events/new" class="btn btn-outline">
          <i class="fas fa-calendar-plus"></i> New Event
        </a>
        <a href="/fleet" class="btn btn-outline">
          <i class="fas fa-truck"></i> Fleet Status
        </a>
        <a href="/clients/new" class="btn btn-outline">
          <i class="fas fa-building"></i> Add Client
        </a>
      </div>
    </div>

    <!-- UPCOMING EVENTS TABLE -->
    <div class="card">
      <div class="card-header">
        <span class="card-title">📅 Events — Upcoming & Active</span>
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
            ${upcomingRows || '<tr><td colspan="6" class="text-muted" style="text-align:center;padding:20px">No events yet — <a href="/events/new" style="color:var(--bw-gold)">create one</a></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <!-- SAB V2 HOOK -->
    <div class="card" style="border-color:#1e3a5f;background:rgba(30,58,95,0.3)">
      <div class="card-header">
        <span class="card-title" style="color:#60a5fa">🔵 SAB SOW Compliance — V2</span>
        <span class="badge badge-sab" style="font-size:11px">Coming in 90 days</span>
      </div>
      <p style="color:#64748b;font-size:13px">
        46 KPI dashboard · Service Credit tracker · Wheel Spend Reports · Sage sync —
        all wired in. The hooks are in the schema, the UI is next.
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
