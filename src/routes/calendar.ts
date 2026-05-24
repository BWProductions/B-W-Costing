// Operational Events Calendar — B&W Productions
// 3-stage primary (Booking / Pre-loaded / Delivered) + 7-stage detail substage
// Warehouse-screen friendly week view + mobile agenda

import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth.js'
import { layout } from '../lib/layout.js'
import type { AuthUser } from '../lib/auth.js'

type Env = { Bindings: { DB: D1Database }; Variables: { user: AuthUser } }

const calendar = new Hono<Env>()
calendar.use('*', requireAuth)

// ── Status & substage palette ─────────────────────────────────────────────
const STATUS_META: Record<string, { label: string; bg: string; fg: string; dot: string }> = {
  booking:   { label: 'Booking',    bg: '#F0D080', fg: '#1a1004', dot: '#F0D080' },  // yellow
  preloaded: { label: 'Pre-loaded', bg: '#7CFF2B', fg: '#062b00', dot: '#7CFF2B' },  // green
  delivered: { label: 'Delivered',  bg: '#18D9FF', fg: '#001a26', dot: '#18D9FF' },  // cyan/blue
  cancelled: { label: 'Cancelled',  bg: '#6b7280', fg: '#fff',    dot: '#6b7280' },  // grey
}

const SUBSTAGE_META: Record<string, { label: string; icon: string }> = {
  load:    { label: 'Load',    icon: 'fa-boxes-packing' },
  leave:   { label: 'Leave',   icon: 'fa-truck-arrow-right' },
  setup:   { label: 'Setup',   icon: 'fa-screwdriver-wrench' },
  event:   { label: 'Event',   icon: 'fa-bolt' },
  strike:  { label: 'Strike',  icon: 'fa-arrow-down-from-arc' },
  collect: { label: 'Collect', icon: 'fa-truck-arrow-right' },
}

const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const DAY_LABELS_LONG = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function isoWeekStart(dateStr?: string): Date {
  const d = dateStr ? new Date(dateStr + 'T00:00:00Z') : new Date()
  // align to Monday
  const day = d.getUTCDay() // 0 Sun..6 Sat
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff)
  d.setUTCHours(0,0,0,0)
  return d
}

function isoStr(d: Date): string {
  return d.toISOString().slice(0,10)
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setUTCDate(x.getUTCDate() + n)
  return x
}

function statusPill(status: string): string {
  const m = STATUS_META[status] || STATUS_META.booking
  return `<span style="display:inline-block;padding:3px 10px;border-radius:11px;font-size:11px;font-weight:700;color:${m.fg};background:${m.bg};letter-spacing:0.3px">${m.label.toUpperCase()}</span>`
}

function substageBadge(sub: string | null): string {
  if (!sub) return ''
  const m = SUBSTAGE_META[sub]
  if (!m) return ''
  return `<span style="display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:600;color:#F0D080;background:rgba(240,208,128,0.10);border:1px solid rgba(240,208,128,0.25)"><i class="fa-solid ${m.icon}" style="font-size:9px"></i>${m.label}</span>`
}

function escapeHtml(s: any): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
}

// ── GET /calendar — week view, default to current week ────────────────────
calendar.get('/', async (c) => {
  const user = c.get('user')
  const db = c.env.DB
  const weekParam = c.req.query('week') || ''
  const statusFilter = c.req.query('status') || 'all'
  const brandFilter = c.req.query('brand') || ''
  const regionFilter = c.req.query('region') || ''
  const clientFilter = c.req.query('client') || ''

  const weekStart = isoWeekStart(weekParam)
  const weekEnd = addDays(weekStart, 6)
  const weekStartStr = isoStr(weekStart)
  const weekEndStr = isoStr(weekEnd)

  // ── Build WHERE clauses
  const whereParts = [`event_date BETWEEN ? AND ?`]
  const binds: any[] = [weekStartStr, weekEndStr]
  if (statusFilter !== 'all') {
    whereParts.push(`status = ?`)
    binds.push(statusFilter)
  }
  if (brandFilter) {
    whereParts.push(`brand = ?`)
    binds.push(brandFilter)
  }
  if (regionFilter) {
    whereParts.push(`region = ?`)
    binds.push(regionFilter)
  }
  if (clientFilter) {
    whereParts.push(`client_id = ?`)
    binds.push(parseInt(clientFilter))
  }

  const events = await db.prepare(
    `SELECT ce.*, cl.name as client_name
     FROM calendar_events ce
     LEFT JOIN clients cl ON cl.id = ce.client_id
     WHERE ${whereParts.join(' AND ')}
     ORDER BY event_date ASC, id ASC`
  ).bind(...binds).all<any>()

  // ── Pull crew + vehicle links for this week's events in one go
  const eventIds = (events.results || []).map(e => e.id)
  let crewMap: Record<number, string[]> = {}
  let vehMap: Record<number, string[]> = {}
  if (eventIds.length) {
    const placeholders = eventIds.map(() => '?').join(',')
    const crewRows = await db.prepare(
      `SELECT cec.event_id, fp.name FROM calendar_event_crew cec
       JOIN field_people fp ON fp.id = cec.person_id
       WHERE cec.event_id IN (${placeholders})`
    ).bind(...eventIds).all<any>()
    for (const r of crewRows.results || []) {
      (crewMap[r.event_id] ||= []).push(r.name)
    }
    const vehRows = await db.prepare(
      `SELECT cev.event_id, f.description, f.reg_number FROM calendar_event_vehicles cev
       JOIN fleet f ON f.id = cev.fleet_id
       WHERE cev.event_id IN (${placeholders})`
    ).bind(...eventIds).all<any>()
    for (const r of vehRows.results || []) {
      (vehMap[r.event_id] ||= []).push(r.description)
    }
  }

  // Group events by date
  const byDate: Record<string, any[]> = {}
  for (const e of (events.results || [])) {
    (byDate[e.event_date] ||= []).push(e)
  }

  // ── Status counts for filter bar (across this week, unfiltered by status)
  const statusCounts = await db.prepare(
    `SELECT status, COUNT(*) as n FROM calendar_events
     WHERE event_date BETWEEN ? AND ? GROUP BY status`
  ).bind(weekStartStr, weekEndStr).all<any>()
  const counts: Record<string, number> = { booking:0, preloaded:0, delivered:0, cancelled:0 }
  let totalWeek = 0
  for (const r of (statusCounts.results || [])) { counts[r.status] = r.n; totalWeek += r.n }

  // ── Distinct brands / regions / clients for the filter chips
  const brandRows = await db.prepare(
    `SELECT brand, COUNT(*) as n FROM calendar_events
     WHERE brand IS NOT NULL GROUP BY brand ORDER BY n DESC LIMIT 12`
  ).all<any>()
  const regionRows = await db.prepare(
    `SELECT region, COUNT(*) as n FROM calendar_events
     WHERE region IS NOT NULL GROUP BY region ORDER BY n DESC LIMIT 12`
  ).all<any>()
  const clientRows = await db.prepare(
    `SELECT cl.id, cl.name, COUNT(ce.id) as n
     FROM calendar_events ce JOIN clients cl ON cl.id = ce.client_id
     GROUP BY cl.id ORDER BY n DESC LIMIT 20`
  ).all<any>()

  // ── Build week navigation links
  const prevWeek = isoStr(addDays(weekStart, -7))
  const nextWeek = isoStr(addDays(weekStart, 7))
  const today = isoStr(new Date())
  const baseQuery = (override: Record<string,string>) => {
    const p: Record<string,string> = {
      week: weekStartStr, status: statusFilter, brand: brandFilter,
      region: regionFilter, client: clientFilter, ...override
    }
    return '?' + Object.entries(p).filter(([_,v]) => v && v !== 'all').map(([k,v]) => `${k}=${encodeURIComponent(v)}`).join('&')
  }

  // ── Render day columns
  const dayCols: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i)
    const dateStr = isoStr(d)
    const isToday = dateStr === today
    const dayEvents = byDate[dateStr] || []
    const dayLabel = DAY_LABELS_LONG[d.getUTCDay()]
    const dayShort = DAY_LABELS[d.getUTCDay()]
    const dayNum = d.getUTCDate()
    const monthShort = MONTHS[d.getUTCMonth()]

    const cards = dayEvents.map((e: any) => {
      const crew = crewMap[e.id] || []
      const veh = vehMap[e.id] || []
      const rawTeam = e.team_text ? `<div style="margin-top:6px;font-size:11px;color:#9ca3af"><i class="fa-solid fa-users" style="width:12px"></i> ${escapeHtml(e.team_text)}</div>` : ''
      const rawVeh = e.vehicle_text ? `<div style="font-size:11px;color:#9ca3af"><i class="fa-solid fa-truck" style="width:12px"></i> ${escapeHtml(e.vehicle_text)}</div>` : ''
      const linkedChips = crew.length || veh.length ? `
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">
          ${crew.map(n => `<span style="font-size:10px;padding:1px 7px;border-radius:6px;background:rgba(124,255,43,0.12);color:#a8ff7a;border:1px solid rgba(124,255,43,0.25)">${escapeHtml(n)}</span>`).join('')}
          ${veh.map(n => `<span style="font-size:10px;padding:1px 7px;border-radius:6px;background:rgba(24,217,255,0.12);color:#8ee9ff;border:1px solid rgba(24,217,255,0.25)">${escapeHtml(n)}</span>`).join('')}
        </div>` : ''
      const meta = STATUS_META[e.status] || STATUS_META.booking
      return `
        <div class="cal-card" data-event-id="${e.id}" style="
          background:#161b22;border:1px solid #21262d;border-left:4px solid ${meta.dot};
          border-radius:8px;padding:10px;margin-bottom:8px;cursor:pointer;transition:all .15s">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;margin-bottom:6px">
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;color:#f0d080;font-size:13px;line-height:1.25;overflow-wrap:anywhere">${escapeHtml(e.event_name).slice(0,80)}</div>
              ${e.address ? `<div style="font-size:11px;color:#9ca3af;margin-top:2px"><i class="fa-solid fa-location-dot" style="width:11px"></i> ${escapeHtml(e.address).slice(0,60)}</div>` : ''}
              ${e.time_text ? `<div style="font-size:11px;color:#9ca3af;margin-top:1px"><i class="fa-regular fa-clock" style="width:11px"></i> ${escapeHtml(e.time_text)}</div>` : ''}
            </div>
            <div style="text-align:right;flex-shrink:0">
              ${statusPill(e.status)}
            </div>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center">
            ${substageBadge(e.substage)}
            ${e.brand ? `<span style="font-size:10px;padding:1px 7px;border-radius:6px;background:rgba(240,208,128,0.10);color:#F0D080;border:1px solid rgba(240,208,128,0.25)">${escapeHtml(e.brand)}</span>` : ''}
            ${e.region ? `<span style="font-size:10px;padding:1px 7px;border-radius:6px;background:rgba(255,122,0,0.10);color:#ffb066;border:1px solid rgba(255,122,0,0.25)">${escapeHtml(e.region)}</span>` : ''}
            ${e.client_name ? `<span style="font-size:10px;padding:1px 7px;border-radius:6px;background:rgba(99,102,241,0.10);color:#a4a6f4;border:1px solid rgba(99,102,241,0.25)">${escapeHtml(e.client_name)}</span>` : ''}
          </div>
          ${linkedChips}
          ${rawTeam}${rawVeh}
        </div>`
    }).join('')

    const emptyState = dayEvents.length === 0 ? `
      <div style="text-align:center;color:#4a4a4a;font-size:11px;padding:24px 8px;font-style:italic">no events</div>` : ''

    dayCols.push(`
      <div class="cal-day ${isToday ? 'cal-day-today' : ''}" style="
        background:#0d1117;border:1px solid ${isToday ? '#F0D080' : '#21262d'};
        border-radius:10px;padding:10px;min-height:280px;
        ${isToday ? 'box-shadow:0 0 0 1px rgba(240,208,128,0.4)' : ''}
      ">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #21262d">
          <div>
            <div style="font-size:11px;color:#9ca3af;letter-spacing:1px;text-transform:uppercase;font-weight:600">${dayShort}</div>
            <div style="font-size:20px;color:${isToday ? '#F0D080' : '#fff'};font-weight:700;line-height:1">${dayNum} <span style="font-size:13px;color:#9ca3af;font-weight:400">${monthShort}</span></div>
          </div>
          ${dayEvents.length ? `<div style="font-size:11px;color:#9ca3af">${dayEvents.length} <i class="fa-solid fa-calendar-day"></i></div>` : ''}
        </div>
        ${cards || emptyState}
        <button onclick="quickAdd('${dateStr}')" style="
          width:100%;margin-top:6px;padding:6px;background:rgba(240,208,128,0.05);
          border:1px dashed #21262d;border-radius:6px;color:#6b7280;font-size:11px;
          cursor:pointer;transition:all .15s">
          <i class="fa-solid fa-plus"></i> Add event
        </button>
      </div>`)
  }

  // ── Filter chips
  const statusChip = (key: string, label: string) => {
    const active = statusFilter === key
    const meta = STATUS_META[key]
    const bg = active && meta ? meta.bg : '#161b22'
    const fg = active && meta ? meta.fg : '#9ca3af'
    const border = active && meta ? meta.dot : '#21262d'
    const cnt = counts[key] ?? 0
    return `<a href="${baseQuery({status:key})}" style="
      padding:5px 12px;border-radius:14px;font-size:12px;font-weight:600;text-decoration:none;
      background:${bg};color:${fg};border:1px solid ${border};display:inline-flex;align-items:center;gap:6px">
      ${label} <span style="opacity:.7;font-weight:500">${cnt}</span>
    </a>`
  }
  const allChip = `<a href="${baseQuery({status:'all'})}" style="
    padding:5px 12px;border-radius:14px;font-size:12px;font-weight:600;text-decoration:none;
    background:${statusFilter==='all' ? '#F0D080' : '#161b22'};color:${statusFilter==='all' ? '#1a1004' : '#9ca3af'};
    border:1px solid ${statusFilter==='all' ? '#F0D080' : '#21262d'}">
    All <span style="opacity:.7;font-weight:500">${totalWeek}</span></a>`

  const brandChips = (brandRows.results || []).map((b: any) => {
    const active = brandFilter === b.brand
    return `<a href="${baseQuery({brand: active ? '' : b.brand})}" style="
      padding:3px 9px;border-radius:10px;font-size:11px;text-decoration:none;
      background:${active ? '#F0D080' : 'rgba(240,208,128,0.08)'};color:${active ? '#1a1004' : '#F0D080'};
      border:1px solid ${active ? '#F0D080' : 'rgba(240,208,128,0.25)'}">
      ${escapeHtml(b.brand)} <span style="opacity:.6">${b.n}</span></a>`
  }).join(' ')

  const regionChips = (regionRows.results || []).map((r: any) => {
    const active = regionFilter === r.region
    return `<a href="${baseQuery({region: active ? '' : r.region})}" style="
      padding:3px 9px;border-radius:10px;font-size:11px;text-decoration:none;
      background:${active ? '#ffb066' : 'rgba(255,122,0,0.08)'};color:${active ? '#1a0a00' : '#ffb066'};
      border:1px solid ${active ? '#ffb066' : 'rgba(255,122,0,0.25)'}">
      ${escapeHtml(r.region)} <span style="opacity:.6">${r.n}</span></a>`
  }).join(' ')

  // ── Page body
  const body = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;flex-wrap:wrap;gap:12px">
      <div>
        <h1 style="margin:0;color:#F0D080;font-size:24px"><i class="fa-solid fa-calendar-week"></i> Events Calendar</h1>
        <div style="color:#9ca3af;font-size:13px;margin-top:4px">
          ${weekStart.toLocaleDateString('en-ZA', {day:'numeric',month:'short'})} – ${weekEnd.toLocaleDateString('en-ZA', {day:'numeric',month:'short',year:'numeric'})}
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <a href="?week=${prevWeek}" style="padding:8px 14px;background:#161b22;border:1px solid #21262d;border-radius:6px;color:#fff;text-decoration:none">
          <i class="fa-solid fa-chevron-left"></i>
        </a>
        <a href="/calendar" style="padding:8px 14px;background:#161b22;border:1px solid #21262d;border-radius:6px;color:#F0D080;text-decoration:none;font-weight:600">
          Today
        </a>
        <a href="?week=${nextWeek}" style="padding:8px 14px;background:#161b22;border:1px solid #21262d;border-radius:6px;color:#fff;text-decoration:none">
          <i class="fa-solid fa-chevron-right"></i>
        </a>
        <input type="week" id="weekPicker" style="
          padding:7px 10px;background:#161b22;border:1px solid #21262d;border-radius:6px;color:#fff;font-size:13px"
          onchange="jumpToWeek(this.value)">
      </div>
    </div>

    <!-- Status filter bar -->
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px">
      ${allChip}
      ${statusChip('booking', 'Booking')}
      ${statusChip('preloaded', 'Pre-loaded')}
      ${statusChip('delivered', 'Delivered')}
    </div>

    <!-- Brand / region filter chips (collapsible) -->
    ${brandChips || regionChips ? `
    <details style="margin-bottom:18px;background:#0d1117;border:1px solid #21262d;border-radius:8px;padding:8px 12px">
      <summary style="color:#9ca3af;font-size:12px;cursor:pointer;user-select:none">
        <i class="fa-solid fa-filter"></i> Brand & region filters
        ${brandFilter || regionFilter ? `<span style="color:#F0D080;margin-left:8px">[active]</span>` : ''}
      </summary>
      <div style="margin-top:10px">
        ${brandChips ? `<div style="margin-bottom:8px"><div style="font-size:10px;color:#6b7280;margin-bottom:4px;letter-spacing:1px;text-transform:uppercase">Brands</div>${brandChips}</div>` : ''}
        ${regionChips ? `<div><div style="font-size:10px;color:#6b7280;margin-bottom:4px;letter-spacing:1px;text-transform:uppercase">Regions</div>${regionChips}</div>` : ''}
      </div>
    </details>` : ''}

    <!-- 7-column week grid (responsive) -->
    <div class="cal-week-grid" style="
      display:grid;grid-template-columns:repeat(7, minmax(0, 1fr));gap:10px">
      ${dayCols.join('')}
    </div>

    <!-- Mobile agenda view (auto-shown on narrow screens) -->
    <style>
      @media (max-width: 900px) {
        .cal-week-grid { grid-template-columns: 1fr !important; }
        .cal-day { min-height: auto !important; }
      }
      .cal-card:hover { background:#1c2128 !important; transform:translateX(2px); }
      button:hover { color:#F0D080 !important; border-color:rgba(240,208,128,0.4) !important; }
    </style>

    <!-- Legend -->
    <div style="margin-top:24px;padding:14px;background:#0d1117;border:1px solid #21262d;border-radius:8px;font-size:12px;color:#9ca3af">
      <div style="display:flex;flex-wrap:wrap;gap:18px;align-items:center">
        <span style="color:#F0D080;font-weight:600">3-stage:</span>
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#F0D080;margin-right:6px;vertical-align:middle"></span>Booking</span>
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#7CFF2B;margin-right:6px;vertical-align:middle"></span>Pre-loaded</span>
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#18D9FF;margin-right:6px;vertical-align:middle"></span>Delivered</span>
        <span style="margin-left:18px;color:#F0D080;font-weight:600">7-stage detail:</span>
        ${Object.entries(SUBSTAGE_META).map(([k,m]) => `<span><i class="fa-solid ${m.icon}"></i> ${m.label}</span>`).join('')}
      </div>
    </div>

    <script>
      function jumpToWeek(val) {
        // val is YYYY-Www; convert to ISO date of Monday of that week
        const [y, w] = val.split('-W')
        const jan4 = new Date(Date.UTC(parseInt(y), 0, 4))
        const day = jan4.getUTCDay() || 7
        const mon = new Date(jan4)
        mon.setUTCDate(jan4.getUTCDate() - day + 1 + (parseInt(w)-1)*7)
        window.location.href = '?week=' + mon.toISOString().slice(0,10)
      }
      function quickAdd(dateStr) {
        const name = prompt('Quick-add event for ' + dateStr + '\\n\\nEvent name:')
        if (!name || !name.trim()) return
        fetch('/calendar/quick-add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event_date: dateStr, event_name: name.trim() })
        }).then(r => r.json()).then(res => {
          if (res.ok) window.location.reload()
          else alert('Failed: ' + (res.error || 'unknown'))
        }).catch(e => alert('Error: ' + e.message))
      }
      // Click card → open detail (placeholder for now)
      document.querySelectorAll('.cal-card').forEach(c => {
        c.addEventListener('click', () => {
          const id = c.dataset.eventId
          window.location.href = '/calendar/event/' + id
        })
      })
    </script>
  `

  return c.html(layout('Events Calendar', body, user, 'calendar'))
})

// ── POST /calendar/quick-add — minimal stub creation ──────────────────────
calendar.post('/quick-add', async (c) => {
  const user = c.get('user')
  const db = c.env.DB
  const body = await c.req.json<any>()
  const { event_date, event_name } = body || {}
  if (!event_date || !event_name || typeof event_name !== 'string') {
    return c.json({ ok: false, error: 'event_date and event_name required' }, 400)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(event_date)) {
    return c.json({ ok: false, error: 'invalid event_date format' }, 400)
  }
  const result = await db.prepare(
    `INSERT INTO calendar_events (event_date, event_name, status, source, created_by)
     VALUES (?, ?, 'booking', 'manual', ?)`
  ).bind(event_date, event_name.trim().slice(0, 200), user.id).run()
  return c.json({ ok: true, id: result.meta.last_row_id })
})

// ── GET /calendar/event/:id — detail view (basic for now) ─────────────────
calendar.get('/event/:id', async (c) => {
  const user = c.get('user')
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  if (!id) return c.text('Bad id', 400)

  const e = await db.prepare(
    `SELECT ce.*, cl.name as client_name FROM calendar_events ce
     LEFT JOIN clients cl ON cl.id = ce.client_id WHERE ce.id = ?`
  ).bind(id).first<any>()
  if (!e) return c.text('Not found', 404)

  const crewRows = await db.prepare(
    `SELECT fp.id, fp.name, cec.matched_from FROM calendar_event_crew cec
     JOIN field_people fp ON fp.id = cec.person_id
     WHERE cec.event_id = ? ORDER BY fp.name`
  ).bind(id).all<any>()
  const vehRows = await db.prepare(
    `SELECT f.id, f.description, f.reg_number, cev.matched_from
     FROM calendar_event_vehicles cev JOIN fleet f ON f.id = cev.fleet_id
     WHERE cev.event_id = ? ORDER BY f.description`
  ).bind(id).all<any>()

  const dDate = new Date(e.event_date + 'T00:00:00Z')
  const dayLabel = DAY_LABELS_LONG[dDate.getUTCDay()]

  const body = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px">
      <a href="/calendar?week=${e.event_date}" style="color:#9ca3af;text-decoration:none">
        <i class="fa-solid fa-chevron-left"></i> Back to calendar
      </a>
    </div>
    <div style="background:#0d1117;border:1px solid #21262d;border-left:4px solid ${STATUS_META[e.status]?.dot || '#F0D080'};border-radius:10px;padding:24px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap">
        <div>
          <div style="color:#9ca3af;font-size:13px">${dayLabel}, ${dDate.toLocaleDateString('en-ZA', {day:'numeric',month:'long',year:'numeric'})}</div>
          <h1 style="margin:6px 0 0 0;color:#F0D080;font-size:26px">${escapeHtml(e.event_name)}</h1>
          <div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap">
            ${statusPill(e.status)}
            ${substageBadge(e.substage)}
            ${e.brand ? `<span style="font-size:11px;padding:2px 9px;border-radius:8px;background:rgba(240,208,128,0.10);color:#F0D080;border:1px solid rgba(240,208,128,0.25)">${escapeHtml(e.brand)}</span>` : ''}
            ${e.region ? `<span style="font-size:11px;padding:2px 9px;border-radius:8px;background:rgba(255,122,0,0.10);color:#ffb066;border:1px solid rgba(255,122,0,0.25)">${escapeHtml(e.region)}</span>` : ''}
          </div>
        </div>
        <form method="POST" action="/calendar/event/${e.id}/status" style="display:flex;gap:6px;align-items:center">
          <select name="status" style="padding:8px;background:#161b22;border:1px solid #21262d;border-radius:6px;color:#fff">
            <option value="booking" ${e.status==='booking'?'selected':''}>Booking</option>
            <option value="preloaded" ${e.status==='preloaded'?'selected':''}>Pre-loaded</option>
            <option value="delivered" ${e.status==='delivered'?'selected':''}>Delivered</option>
            <option value="cancelled" ${e.status==='cancelled'?'selected':''}>Cancelled</option>
          </select>
          <select name="substage" style="padding:8px;background:#161b22;border:1px solid #21262d;border-radius:6px;color:#fff">
            <option value="">— substage —</option>
            ${Object.entries(SUBSTAGE_META).map(([k,m]) => `<option value="${k}" ${e.substage===k?'selected':''}>${m.label}</option>`).join('')}
          </select>
          <button type="submit" style="padding:8px 14px;background:#F0D080;color:#1a1004;border:0;border-radius:6px;font-weight:600;cursor:pointer">
            Update
          </button>
        </form>
      </div>

      <div style="margin-top:24px;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px">
        ${e.address ? `<div><div style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:1px">Address</div><div style="color:#fff;margin-top:4px">${escapeHtml(e.address)}</div></div>` : ''}
        ${e.time_text ? `<div><div style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:1px">Time</div><div style="color:#fff;margin-top:4px">${escapeHtml(e.time_text)}</div></div>` : ''}
        ${e.client_name ? `<div><div style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:1px">Client</div><div style="color:#fff;margin-top:4px">${escapeHtml(e.client_name)}</div></div>` : ''}
      </div>

      ${e.team_text || crewRows.results?.length ? `
      <div style="margin-top:20px">
        <div style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Crew</div>
        ${e.team_text ? `<div style="color:#fff;font-size:13px">${escapeHtml(e.team_text)}</div>` : ''}
        ${crewRows.results?.length ? `<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:5px">
          ${crewRows.results.map((r:any) => `<span style="font-size:11px;padding:2px 9px;border-radius:8px;background:rgba(124,255,43,0.12);color:#a8ff7a;border:1px solid rgba(124,255,43,0.25)" title="matched from: ${escapeHtml(r.matched_from)}">${escapeHtml(r.name)}</span>`).join('')}
        </div>` : ''}
      </div>` : ''}

      ${e.vehicle_text || vehRows.results?.length ? `
      <div style="margin-top:20px">
        <div style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Vehicle</div>
        ${e.vehicle_text ? `<div style="color:#fff;font-size:13px">${escapeHtml(e.vehicle_text)}</div>` : ''}
        ${vehRows.results?.length ? `<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:5px">
          ${vehRows.results.map((r:any) => `<span style="font-size:11px;padding:2px 9px;border-radius:8px;background:rgba(24,217,255,0.12);color:#8ee9ff;border:1px solid rgba(24,217,255,0.25)" title="matched from: ${escapeHtml(r.matched_from)}">${escapeHtml(r.description)} <span style="opacity:.6">${escapeHtml(r.reg_number)}</span></span>`).join('')}
        </div>` : ''}
      </div>` : ''}

      ${e.notes ? `
      <div style="margin-top:20px">
        <div style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Notes</div>
        <div style="color:#fff;white-space:pre-wrap">${escapeHtml(e.notes)}</div>
      </div>` : ''}

      <div style="margin-top:24px;padding-top:14px;border-top:1px solid #21262d;color:#6b7280;font-size:11px;display:flex;gap:14px;flex-wrap:wrap">
        <span>Source: ${escapeHtml(e.source)}</span>
        ${e.source_ref ? `<span>Ref: ${escapeHtml(e.source_ref)}</span>` : ''}
        <span>Created: ${new Date(e.created_at).toLocaleString('en-ZA')}</span>
        <span>Updated: ${new Date(e.updated_at).toLocaleString('en-ZA')}</span>
      </div>
    </div>
  `
  return c.html(layout(e.event_name, body, user, 'calendar'))
})

// ── POST /calendar/event/:id/status — inline edit handler ─────────────────
calendar.post('/event/:id/status', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  if (!id) return c.text('Bad id', 400)
  const form = await c.req.parseBody()
  const status = String(form.status || '').trim()
  const substage = String(form.substage || '').trim()
  const validStatus = ['booking','preloaded','delivered','cancelled']
  const validSubstage = ['load','leave','setup','event','strike','collect','']
  if (!validStatus.includes(status)) return c.text('Bad status', 400)
  if (!validSubstage.includes(substage)) return c.text('Bad substage', 400)
  await db.prepare(
    `UPDATE calendar_events SET status=?, substage=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
  ).bind(status, substage || null, id).run()
  return c.redirect(`/calendar/event/${id}`)
})

export default calendar
