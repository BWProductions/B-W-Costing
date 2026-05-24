// Warehouse Big-Screen Dispatch View — B&W Productions
// Token-protected, no login, auto-refresh every 60s.
// Mount at /dispatch BEFORE the dashboard (no requireAuth wildcard).

import { Hono } from 'hono'

type Env = { Bindings: { DB: D1Database } }
const dispatch = new Hono<Env>()

// ── Shared palette (matches calendar.ts) ─────────────────────────────────
const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  booking:   { label: 'Booking',    bg: '#F0D080', fg: '#1a1004' },
  preloaded: { label: 'Pre-loaded', bg: '#7CFF2B', fg: '#062b00' },
  delivered: { label: 'Delivered',  bg: '#18D9FF', fg: '#001a26' },
}

const SUBSTAGES = ['load', 'leave', 'setup', 'event', 'strike', 'collect']
const SUBSTAGE_LABEL: Record<string, string> = {
  load: 'Load', leave: 'Leave', setup: 'Setup',
  event: 'Event', strike: 'Strike', collect: 'Collect',
}

const DAY_LABELS_LONG = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ── Date helpers (SAST is UTC+2; we display in SAST) ─────────────────────
function sastNow(): Date {
  // Server runs in UTC; add 2h for SAST display
  const d = new Date()
  return new Date(d.getTime() + 2 * 60 * 60 * 1000)
}
function sastDateStr(d: Date): string {
  // YYYY-MM-DD in SAST
  return d.toISOString().slice(0, 10)
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setUTCDate(x.getUTCDate() + n)
  return x
}

function esc(s: any): string {
  if (s == null) return ''
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

// ── Token check ──────────────────────────────────────────────────────────
async function checkToken(env: any, token: string): Promise<boolean> {
  if (!token || token.length < 8) return false
  const row = await env.DB.prepare(
    `SELECT value FROM system_settings WHERE key='dispatch_token'`
  ).first<{ value: string }>()
  if (!row || !row.value || row.value === 'CHANGE_ME_VIA_ADMIN') return false
  return row.value === token
}

// ── Render helpers ───────────────────────────────────────────────────────
function statusBadge(status: string, large = false): string {
  const m = STATUS_META[status] || STATUS_META.booking
  const pad = large ? '8px 20px' : '4px 12px'
  const fs = large ? '20px' : '12px'
  return `<span style="display:inline-block;padding:${pad};border-radius:14px;font-size:${fs};font-weight:800;color:${m.fg};background:${m.bg};letter-spacing:0.5px;text-transform:uppercase">${m.label}</span>`
}

function substageBar(currentSubstage: string | null): string {
  // Horizontal pill bar — current highlighted, completed dimmed, future faint
  const currentIdx = currentSubstage ? SUBSTAGES.indexOf(currentSubstage) : -1
  return `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px">${
    SUBSTAGES.map((s, i) => {
      let bg = '#1f2937', fg = '#4b5563', border = '1px solid #1f2937'
      if (currentIdx === -1) {
        // no substage set — all faint
      } else if (i < currentIdx) {
        bg = '#0b3b1c'; fg = '#4ade80'; border = '1px solid #1a5c33' // done
      } else if (i === currentIdx) {
        bg = '#7CFF2B'; fg = '#062b00'; border = '2px solid #7CFF2B' // current
      } else {
        bg = '#0f172a'; fg = '#475569'; border = '1px solid #1e293b' // future
      }
      const weight = i === currentIdx ? 800 : 500
      return `<span style="padding:4px 12px;border-radius:8px;font-size:13px;font-weight:${weight};color:${fg};background:${bg};border:${border};letter-spacing:0.3px">${SUBSTAGE_LABEL[s]}</span>`
    }).join('')
  }</div>`
}

// ── Big card (today, top section) ────────────────────────────────────────
function bigCard(ev: any): string {
  const name = esc(ev.event_name || 'Untitled event')
  const status = ev.status || 'booking'
  const time = ev.time_text ? esc(ev.time_text) : ''
  const addr = ev.address ? esc(ev.address) : (ev.region ? esc(ev.region) : '')
  const vehicle = ev.vehicle_text ? esc(ev.vehicle_text) : ''
  const team = ev.team_text ? esc(ev.team_text) : ''
  const brand = ev.brand ? esc(ev.brand) : ''
  const client = ev.client_name ? esc(ev.client_name) : ''

  return `
    <div style="background:#0f172a;border:1px solid #1e293b;border-radius:14px;padding:24px 28px;margin-bottom:16px;display:grid;grid-template-columns:1fr auto;gap:20px">
      <div style="min-width:0">
        <div style="display:flex;gap:16px;align-items:baseline;flex-wrap:wrap;margin-bottom:8px">
          <h2 style="font-size:36px;font-weight:900;color:#f1f5f9;margin:0;line-height:1.1;letter-spacing:-0.5px">${name}</h2>
          ${time ? `<span style="font-size:24px;font-weight:700;color:#fbbf24">${time}</span>` : ''}
        </div>
        <div style="font-size:18px;color:#cbd5e1;margin-bottom:4px">
          ${addr ? `<i class="fa-solid fa-location-dot" style="color:#64748b;margin-right:6px"></i>${addr}` : ''}
        </div>
        <div style="display:flex;gap:24px;font-size:18px;color:#94a3b8;margin-top:10px;flex-wrap:wrap">
          ${vehicle ? `<div><i class="fa-solid fa-truck" style="color:#64748b;margin-right:8px"></i><strong style="color:#e2e8f0">${vehicle}</strong></div>` : ''}
          ${team ? `<div style="min-width:0;flex:1"><i class="fa-solid fa-users" style="color:#64748b;margin-right:8px"></i><strong style="color:#e2e8f0">${team}</strong></div>` : ''}
        </div>
        ${(brand || client) ? `<div style="font-size:14px;color:#64748b;margin-top:10px;letter-spacing:0.3px">${[brand, client].filter(Boolean).join(' • ')}</div>` : ''}
        ${substageBar(ev.substage)}
      </div>
      <div style="text-align:right">${statusBadge(status, true)}</div>
    </div>
  `
}

// ── Medium card (tomorrow) ───────────────────────────────────────────────
function mediumCard(ev: any): string {
  const name = esc(ev.event_name || 'Untitled')
  const time = ev.time_text ? esc(ev.time_text) : ''
  const addr = ev.address ? esc(ev.address) : (ev.region ? esc(ev.region) : '')
  const vehicle = ev.vehicle_text ? esc(ev.vehicle_text) : ''
  const team = ev.team_text ? esc(ev.team_text) : ''

  return `
    <div style="background:#0f172a;border:1px solid #1e293b;border-radius:10px;padding:14px 18px;margin-bottom:8px;display:grid;grid-template-columns:1fr auto;gap:16px;align-items:center">
      <div style="min-width:0">
        <div style="display:flex;gap:12px;align-items:baseline;margin-bottom:4px">
          <span style="font-size:22px;font-weight:800;color:#f1f5f9;line-height:1.1">${name}</span>
          ${time ? `<span style="font-size:16px;font-weight:600;color:#fbbf24">${time}</span>` : ''}
        </div>
        <div style="font-size:14px;color:#94a3b8">
          ${addr ? `<i class="fa-solid fa-location-dot" style="margin-right:4px"></i>${addr} &nbsp;` : ''}
          ${vehicle ? `<i class="fa-solid fa-truck" style="margin:0 4px 0 8px"></i>${vehicle} &nbsp;` : ''}
          ${team ? `<i class="fa-solid fa-users" style="margin:0 4px 0 8px"></i>${team}` : ''}
        </div>
      </div>
      <div>${statusBadge(ev.status)}</div>
    </div>
  `
}

// ── Compact row (this week) ──────────────────────────────────────────────
function compactRow(ev: any): string {
  const name = esc(ev.event_name || 'Untitled')
  const status = ev.status || 'booking'
  const m = STATUS_META[status] || STATUS_META.booking
  const dt = new Date(ev.event_date + 'T00:00:00Z')
  const dayShort = DAY_LABELS_LONG[dt.getUTCDay()].slice(0, 3)
  const dateLabel = `${dayShort} ${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]}`
  const time = ev.time_text ? esc(ev.time_text) : ''
  const vehicle = ev.vehicle_text ? esc(ev.vehicle_text) : ''

  return `
    <tr>
      <td style="padding:6px 12px;color:#94a3b8;font-size:14px;white-space:nowrap;font-weight:600">${dateLabel}</td>
      <td style="padding:6px 12px;color:#f1f5f9;font-size:16px;font-weight:600">${name}</td>
      <td style="padding:6px 12px;color:#fbbf24;font-size:14px;white-space:nowrap">${time}</td>
      <td style="padding:6px 12px;color:#94a3b8;font-size:14px">${vehicle}</td>
      <td style="padding:6px 12px;white-space:nowrap">
        <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${m.bg};vertical-align:middle"></span>
      </td>
    </tr>
  `
}

// ── Main route ───────────────────────────────────────────────────────────
dispatch.get('/:token', async (c) => {
  const token = c.req.param('token')
  const env = c.env as any

  if (!(await checkToken(env, token))) {
    return c.text('Not found', 404)
  }

  // Calculate windows in SAST
  const now = sastNow()
  const today = sastDateStr(now)
  const tomorrow = sastDateStr(addDays(now, 1))
  const weekEnd = sastDateStr(addDays(now, 7))

  // Pull events: today through end of week, no cancelled
  const rows = await env.DB.prepare(
    `SELECT ce.*, cl.name as client_name
     FROM calendar_events ce
     LEFT JOIN clients cl ON cl.id = ce.client_id
     WHERE event_date BETWEEN ? AND ?
       AND status != 'cancelled'
     ORDER BY event_date ASC, id ASC`
  ).bind(today, weekEnd).all<any>()

  const events = rows.results || []
  const todayEvents = events.filter((e: any) => e.event_date === today)
  const tomorrowEvents = events.filter((e: any) => e.event_date === tomorrow)
  const weekEvents = events.filter((e: any) => e.event_date > tomorrow)

  // SAST display strings
  const hh = String(now.getUTCHours()).padStart(2, '0')
  const mm = String(now.getUTCMinutes()).padStart(2, '0')
  const timeStr = `${hh}:${mm}`
  const dateLabel = `${DAY_LABELS_LONG[now.getUTCDay()]}, ${now.getUTCDate()} ${MONTHS[now.getUTCMonth()]} ${now.getUTCFullYear()}`

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="60">
  <title>B&W Dispatch — ${esc(dateLabel)}</title>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <style>
    * { box-sizing: border-box }
    html, body {
      margin: 0; padding: 0;
      background: #020617;
      color: #f1f5f9;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
    }
    .container { padding: 20px 28px; max-width: 1920px; margin: 0 auto }
    .header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 24px; background: #0f172a;
      border: 1px solid #1e293b; border-radius: 14px; margin-bottom: 20px;
    }
    .header-title {
      font-size: 28px; font-weight: 900; color: #f1f5f9;
      letter-spacing: -0.5px;
    }
    .header-title span { color: #7CFF2B }
    .header-meta {
      display: flex; gap: 28px; align-items: center;
      font-size: 18px; color: #cbd5e1; font-weight: 600;
    }
    .header-meta .time {
      font-size: 28px; color: #fbbf24; font-weight: 800;
      font-variant-numeric: tabular-nums;
    }
    .section-title {
      font-size: 14px; font-weight: 800; color: #64748b;
      text-transform: uppercase; letter-spacing: 2px;
      margin: 0 0 12px 4px;
    }
    .section { margin-bottom: 28px }
    table { width: 100%; border-collapse: collapse;
      background: #0f172a; border: 1px solid #1e293b; border-radius: 10px;
      overflow: hidden; }
    table tr { border-bottom: 1px solid #1e293b }
    table tr:last-child { border-bottom: 0 }
    .pulse { animation: pulse 2.5s ease-in-out infinite }
    @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.55 } }
    .refresh-dot {
      display: inline-block; width: 8px; height: 8px;
      border-radius: 50%; background: #7CFF2B; margin-right: 8px;
      vertical-align: middle;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-title">B<span>&amp;</span>W DISPATCH</div>
      <div class="header-meta">
        <div>${esc(dateLabel)}</div>
        <div class="time pulse">${timeStr}</div>
        <div style="font-size:13px;color:#64748b">
          <span class="refresh-dot"></span>auto-refresh 60s
        </div>
      </div>
    </div>

    ${todayEvents.length > 0 ? `
      <div class="section">
        <div class="section-title">Today &mdash; ${todayEvents.length} ${todayEvents.length === 1 ? 'event' : 'events'}</div>
        ${todayEvents.map(bigCard).join('')}
      </div>
    ` : ''}

    ${tomorrowEvents.length > 0 ? `
      <div class="section">
        <div class="section-title">Tomorrow &mdash; ${tomorrowEvents.length} ${tomorrowEvents.length === 1 ? 'event' : 'events'}</div>
        ${tomorrowEvents.map(mediumCard).join('')}
      </div>
    ` : ''}

    ${weekEvents.length > 0 ? `
      <div class="section">
        <div class="section-title">This Week &mdash; ${weekEvents.length} ${weekEvents.length === 1 ? 'event' : 'events'}</div>
        <table>
          <tbody>
            ${weekEvents.map(compactRow).join('')}
          </tbody>
        </table>
      </div>
    ` : ''}
  </div>
</body>
</html>`

  return c.html(html)
})

export default dispatch
