// Operational Events Calendar — B&W Productions
// 3-stage primary (Booking / Pre-loaded / Delivered) + 7-stage detail substage
// Warehouse-screen friendly week view + mobile agenda

import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth.js'
import { layout } from '../lib/layout.js'
import type { AuthUser } from '../lib/auth.js'
import { buildICS, generateIcsToken, type ICSEvent } from '../lib/ics.js'
import { audit, diff } from '../lib/audit.js'

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

// ── Crew / Vehicle / Equipment chip helpers ───────────────────────────────
function crewChip(r: any, eventId: number): string {
  const overridden = !!r.override_reason
  const bg = overridden ? 'rgba(255,122,0,0.12)' : 'rgba(124,255,43,0.12)'
  const border = overridden ? 'rgba(255,122,0,0.35)' : 'rgba(124,255,43,0.25)'
  const color = overridden ? '#ffb066' : '#a8ff7a'
  const flag = overridden ? `<i class="fa-solid fa-triangle-exclamation" title="Override: ${escapeHtml(r.override_reason)}" style="margin-left:4px"></i>` : ''
  return `<span class="crew-chip" data-person-id="${r.id}" data-event-id="${eventId}"
    style="font-size:12px;padding:4px 10px;border-radius:14px;background:${bg};color:${color};border:1px solid ${border};display:inline-flex;align-items:center;gap:6px">
    <i class="fa-solid fa-user" style="font-size:9px;opacity:.6"></i>
    ${escapeHtml(r.name)}
    ${r.role ? `<span style="opacity:.6;font-size:10px">(${escapeHtml(r.role)})</span>` : ''}
    ${flag}
    <button type="button" class="chip-remove" title="Remove" style="background:none;border:0;color:inherit;cursor:pointer;padding:0 0 0 2px;opacity:.6;font-size:11px">
      <i class="fa-solid fa-xmark"></i>
    </button>
  </span>`
}

function vehicleChip(r: any, eventId: number): string {
  const overridden = !!r.override_reason
  const bg = overridden ? 'rgba(255,122,0,0.12)' : 'rgba(24,217,255,0.12)'
  const border = overridden ? 'rgba(255,122,0,0.35)' : 'rgba(24,217,255,0.25)'
  const color = overridden ? '#ffb066' : '#8ee9ff'
  const flag = overridden ? `<i class="fa-solid fa-triangle-exclamation" title="Override: ${escapeHtml(r.override_reason)}" style="margin-left:4px"></i>` : ''
  const xp = r.experiential ? `<span style="font-size:9px;padding:1px 5px;background:rgba(204,24,232,0.20);color:#e8a5f4;border-radius:4px;margin-left:2px">XP</span>` : ''
  return `<span class="vehicle-chip" data-fleet-id="${r.id}" data-event-id="${eventId}"
    style="font-size:12px;padding:4px 10px;border-radius:14px;background:${bg};color:${color};border:1px solid ${border};display:inline-flex;align-items:center;gap:6px">
    <i class="fa-solid fa-truck" style="font-size:9px;opacity:.6"></i>
    ${escapeHtml(r.description || '')}
    ${r.reg_number ? `<span style="opacity:.6;font-family:monospace;font-size:10px">${escapeHtml(r.reg_number)}</span>` : ''}
    ${xp}
    ${flag}
    <button type="button" class="chip-remove" title="Remove" style="background:none;border:0;color:inherit;cursor:pointer;padding:0 0 0 2px;opacity:.6;font-size:11px">
      <i class="fa-solid fa-xmark"></i>
    </button>
  </span>`
}

function equipRow(r: any, eventId: number): string {
  return `<div class="equip-row" data-equip-id="${r.id}" data-event-id="${eventId}"
    style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:#161b22;border:1px solid #21262d;border-radius:6px;margin-bottom:4px">
    <span style="font-family:monospace;color:#F0D080;font-size:13px;min-width:50px;text-align:right">${r.quantity}×</span>
    <span style="flex:1;color:#fff;font-size:13px">${escapeHtml(r.description)}</span>
    ${r.notes ? `<span style="color:#9ca3af;font-size:11px;font-style:italic">${escapeHtml(r.notes)}</span>` : ''}
    ${r.stock_item_id ? `<span style="font-size:9px;padding:1px 5px;background:rgba(124,255,43,0.15);color:#a8ff7a;border-radius:4px">linked</span>` : `<span style="font-size:9px;padding:1px 5px;background:rgba(156,163,175,0.10);color:#6b7280;border-radius:4px">free</span>`}
    <button type="button" class="equip-remove" title="Remove" style="background:none;border:0;color:#6b7280;cursor:pointer;padding:2px 6px;font-size:12px">
      <i class="fa-solid fa-xmark"></i>
    </button>
  </div>`
}

// ── Inline-editable field helpers ─────────────────────────────────────────
// Renders a click-to-edit wrapper. Backed by PATCH /calendar/api/event/:id
function editableField(opts: {
  eventId: number;
  field: string;            // DB column name
  value: string | null;
  label?: string;            // optional caption above (uppercase chip)
  multiline?: boolean;
  placeholder?: string;
  display?: string;          // optional override for displayed text (when value is shorthand)
  emptyText?: string;        // shown when value is empty
}): string {
  const v = opts.value ?? ''
  const shown = opts.display ?? v
  const isEmpty = !v.trim()
  const labelHTML = opts.label
    ? `<div style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">${escapeHtml(opts.label)}</div>`
    : ''
  // Data attributes are read by the client-side JS to wire up the editor.
  return `
    ${labelHTML}
    <div class="inline-edit"
         data-event="${opts.eventId}"
         data-field="${escapeHtml(opts.field)}"
         data-multiline="${opts.multiline ? '1' : '0'}"
         data-placeholder="${escapeHtml(opts.placeholder || '')}"
         data-raw="${escapeHtml(v)}"
         tabindex="0"
         title="Click to edit">
      <span class="inline-edit-view" style="${isEmpty ? 'color:#6b7280;font-style:italic' : 'color:#fff'};${opts.multiline ? 'white-space:pre-wrap;' : ''}cursor:text;display:inline-block;min-width:60px;padding:2px 6px;border-radius:4px;border:1px dashed transparent">${isEmpty ? escapeHtml(opts.emptyText || 'click to add') : escapeHtml(shown)}</span>
    </div>
  `
}

// JS + CSS to wire up all .inline-edit blocks on the page
function inlineEditScript(): string {
  return `
  <style>
    .inline-edit:hover .inline-edit-view { border-color: #21262d; background: #161b22 }
    .inline-edit-input {
      width: 100%; min-width: 200px; padding: 6px 8px;
      background: #161b22; border: 1px solid #F0D080; border-radius: 4px;
      color: #fff; font-size: inherit; font-family: inherit; outline: none;
      box-sizing: border-box;
    }
    .inline-edit textarea.inline-edit-input { min-height: 80px; resize: vertical }
    .inline-edit.saving .inline-edit-view { background: rgba(240,208,128,0.15); border-color: rgba(240,208,128,0.4) }
    .inline-edit.saved .inline-edit-view { background: rgba(124,255,43,0.15); border-color: rgba(124,255,43,0.4); transition: all 0.3s }
    .inline-edit.error .inline-edit-view { background: rgba(255,74,28,0.15); border-color: rgba(255,74,28,0.6); transition: all 0.3s }
    .inline-edit-hint {
      display: block; font-size: 10px; color: #6b7280; margin-top: 3px;
    }
  </style>
  <script>
  (function() {
    function activate(block) {
      if (block.querySelector('.inline-edit-input')) return // already editing
      var view = block.querySelector('.inline-edit-view')
      var raw = block.getAttribute('data-raw') || ''
      var multiline = block.getAttribute('data-multiline') === '1'
      var placeholder = block.getAttribute('data-placeholder') || ''
      var input = document.createElement(multiline ? 'textarea' : 'input')
      input.className = 'inline-edit-input'
      if (!multiline) input.type = 'text'
      input.value = raw
      input.placeholder = placeholder
      view.style.display = 'none'
      block.appendChild(input)
      var hint = document.createElement('span')
      hint.className = 'inline-edit-hint'
      hint.textContent = multiline ? 'Ctrl+Enter / Cmd+Enter to save · Esc to cancel' : 'Enter to save · Esc to cancel'
      block.appendChild(hint)
      input.focus()
      if (!multiline) input.select()

      var settled = false
      function finish(saveIt) {
        if (settled) return
        settled = true
        var newVal = input.value
        block.removeChild(input)
        block.removeChild(hint)
        view.style.display = ''
        if (saveIt && newVal !== raw) save(block, view, newVal)
      }

      input.addEventListener('keydown', function(ev) {
        if (ev.key === 'Escape') { ev.preventDefault(); finish(false) }
        else if (ev.key === 'Enter' && !multiline) { ev.preventDefault(); finish(true) }
        else if (ev.key === 'Enter' && multiline && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); finish(true) }
      })
      input.addEventListener('blur', function() { finish(true) })
    }

    function save(block, view, newVal) {
      var eventId = block.getAttribute('data-event')
      var field = block.getAttribute('data-field')
      block.classList.add('saving')
      var body = {}; body[field] = newVal
      fetch('/calendar/api/event/' + eventId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'same-origin'
      }).then(function(r) {
        return r.json().then(function(j) { return { ok: r.ok, data: j } })
      }).then(function(res) {
        block.classList.remove('saving')
        if (res.ok && res.data && res.data.ok) {
          block.classList.add('saved')
          block.setAttribute('data-raw', newVal)
          var isEmpty = !newVal.trim()
          view.textContent = isEmpty ? 'click to add' : newVal
          view.style.color = isEmpty ? '#6b7280' : '#fff'
          view.style.fontStyle = isEmpty ? 'italic' : 'normal'
          setTimeout(function() { block.classList.remove('saved') }, 1200)
        } else {
          block.classList.add('error')
          console.error('Inline save failed', res)
          setTimeout(function() { block.classList.remove('error') }, 2200)
        }
      }).catch(function(err) {
        block.classList.remove('saving')
        block.classList.add('error')
        console.error('Inline save error', err)
        setTimeout(function() { block.classList.remove('error') }, 2200)
      })
    }

    document.addEventListener('click', function(ev) {
      var block = ev.target.closest && ev.target.closest('.inline-edit')
      if (!block) return
      if (ev.target.classList.contains('inline-edit-input')) return
      activate(block)
    })
    document.addEventListener('keydown', function(ev) {
      if (ev.key !== 'Enter') return
      var block = ev.target.closest && ev.target.closest && ev.target.closest('.inline-edit')
      if (!block || block !== document.activeElement) return
      activate(block)
    })
  })();
  </script>
  `
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

  // ── Pull field_submissions overlapping this week (load sheets per day)
  //     Match by delivery_date OR collection_date falling inside the week.
  const subRows = await db.prepare(
    `SELECT id, form_type, form_number, event_name, brand, venue, address,
            delivery_date, collection_date, signature_data IS NOT NULL as is_signed,
            pdf_url, calendar_event_id, driver, vehicle_reg, created_at
     FROM field_submissions
     WHERE status='active' AND is_draft=0
       AND (
         (delivery_date BETWEEN ? AND ?) OR
         (collection_date BETWEEN ? AND ?)
       )
     ORDER BY delivery_date ASC, id ASC`
  ).bind(weekStartStr, weekEndStr, weekStartStr, weekEndStr).all<any>()

  // Group submissions by the relevant day (using delivery_date if set, otherwise collection_date)
  const subsByDate: Record<string, any[]> = {}
  for (const s of (subRows.results || [])) {
    const d = (s.delivery_date && s.delivery_date.slice(0, 10)) ||
              (s.collection_date && s.collection_date.slice(0, 10))
    if (d) (subsByDate[d] ||= []).push(s)
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

    // ── Bottom-of-day load sheets: any field_submissions touching this date
    const daySubs = subsByDate[dateStr] || []
    const subPills = daySubs.map((s: any) => {
      const typeMap: Record<string, { label: string; icon: string; color: string }> = {
        delivery:           { label: 'DN', icon: 'fa-truck-fast',        color: '#7CFF2B' },
        collection:         { label: 'CN', icon: 'fa-truck-arrow-right', color: '#18D9FF' },
        preload:            { label: 'PL', icon: 'fa-boxes-packing',     color: '#F0D080' },
        'pre-load':         { label: 'PL', icon: 'fa-boxes-packing',     color: '#F0D080' },
        inspection:         { label: 'VI', icon: 'fa-clipboard-check',   color: '#ffb066' },
        repair:             { label: 'RP', icon: 'fa-wrench',            color: '#FF4A1C' },
        musicbus_inspection:{ label: 'MB', icon: 'fa-bus',               color: '#CC18E8' },
        shortlist:          { label: 'SL', icon: 'fa-list-check',        color: '#a4a6f4' },
      }
      const meta = typeMap[s.form_type] || { label: '??', icon: 'fa-file', color: '#9ca3af' }
      const signedTick = s.is_signed
        ? `<i class="fa-solid fa-circle-check" style="color:${meta.color};font-size:9px;margin-left:3px" title="signed"></i>`
        : `<i class="fa-regular fa-circle" style="color:#6b7280;font-size:9px;margin-left:3px" title="unsigned"></i>`
      const href = s.pdf_url
        ? s.pdf_url
        : `/field/admin/submission/${s.id}`
      return `<a href="${href}" target="_blank" rel="noopener" title="${escapeHtml(s.form_number)} — ${escapeHtml(s.event_name || s.venue || '')}${s.is_signed ? ' (signed)' : ' (unsigned)'}"
        style="display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:6px;
        background:${meta.color}1a;color:${meta.color};border:1px solid ${meta.color}44;
        font-size:10px;font-weight:600;text-decoration:none">
        <i class="fa-solid ${meta.icon}" style="font-size:9px"></i>
        ${meta.label}-${escapeHtml(s.form_number.replace(/^[A-Z]+/, ''))}
        ${signedTick}
      </a>`
    }).join(' ')

    const loadSheetSection = daySubs.length ? `
      <div style="margin-top:10px;padding-top:8px;border-top:1px dashed #21262d">
        <div style="font-size:9px;color:#6b7280;letter-spacing:1px;text-transform:uppercase;margin-bottom:5px;font-weight:600">
          <i class="fa-solid fa-clipboard-list" style="font-size:9px"></i> Load sheets (${daySubs.length})
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:4px">${subPills}</div>
      </div>` : ''

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
        ${loadSheetSection}
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
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
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
        <a href="/calendar/ics-setup" style="padding:8px 14px;background:rgba(240,208,128,0.10);border:1px solid rgba(240,208,128,0.3);border-radius:6px;color:#F0D080;text-decoration:none;font-weight:600;font-size:13px" title="Subscribe to feed in Google/Apple Calendar">
          <i class="fa-solid fa-share-nodes"></i> Subscribe
        </a>
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
    `SELECT fp.id, fp.name, fp.crew_type, cec.role, cec.override_reason
     FROM calendar_event_crew cec
     JOIN field_people fp ON fp.id = cec.person_id
     WHERE cec.event_id = ? ORDER BY fp.name`
  ).bind(id).all<any>()
  const vehRows = await db.prepare(
    `SELECT f.id, f.description, f.reg_number, f.vehicle_type, f.experiential,
            cev.role, cev.override_reason
     FROM calendar_event_vehicles cev JOIN fleet f ON f.id = cev.fleet_id
     WHERE cev.event_id = ? ORDER BY f.description`
  ).bind(id).all<any>()
  const equipRows = await db.prepare(
    `SELECT id, description, quantity, notes, stock_item_id
     FROM calendar_event_equipment
     WHERE event_id = ? ORDER BY id`
  ).bind(id).all<any>()

  // ── Load sheets: explicitly pinned via calendar_event_id, OR matching by date
  const subRows = await db.prepare(
    `SELECT id, form_type, form_number, event_name, brand, venue, address,
            delivery_date, collection_date, signature_data IS NOT NULL as is_signed,
            pdf_url, calendar_event_id, driver, vehicle_reg, prepared_by, created_at
     FROM field_submissions
     WHERE status='active' AND is_draft=0
       AND (
         calendar_event_id = ?
         OR (calendar_event_id IS NULL AND (delivery_date = ? OR collection_date = ?))
       )
     ORDER BY delivery_date ASC, id ASC`
  ).bind(id, e.event_date, e.event_date).all<any>()

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
        <div style="flex:1;min-width:0">
          <div style="color:#9ca3af;font-size:13px">${dayLabel}, ${dDate.toLocaleDateString('en-ZA', {day:'numeric',month:'long',year:'numeric'})}</div>
          <h1 style="margin:6px 0 0 0;color:#F0D080;font-size:26px">
            <div class="inline-edit"
                 data-event="${e.id}"
                 data-field="event_name"
                 data-multiline="0"
                 data-placeholder="Event name"
                 data-raw="${escapeHtml(e.event_name || '')}"
                 tabindex="0"
                 title="Click to edit event name"
                 style="display:inline-block">
              <span class="inline-edit-view" style="cursor:text;display:inline-block;min-width:60px;padding:2px 6px;border-radius:4px;border:1px dashed transparent;color:#F0D080">${escapeHtml(e.event_name || 'Untitled event')}</span>
            </div>
          </h1>
          <div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap">
            ${statusPill(e.status)}
            ${substageBadge(e.substage)}
            <span style="font-size:11px;padding:2px 9px;border-radius:8px;background:rgba(240,208,128,0.10);color:#F0D080;border:1px solid rgba(240,208,128,0.25);display:inline-flex;align-items:center;gap:4px">
              <span style="font-size:9px;color:#6b7280">brand:</span>
              <span class="inline-edit"
                    data-event="${e.id}"
                    data-field="brand"
                    data-multiline="0"
                    data-placeholder="brand"
                    data-raw="${escapeHtml(e.brand || '')}"
                    tabindex="0"
                    title="Click to edit brand"
                    style="display:inline-block">
                <span class="inline-edit-view" style="cursor:text;padding:0 4px;border-radius:3px;border:1px dashed transparent">${e.brand ? escapeHtml(e.brand) : '—'}</span>
              </span>
            </span>
            <span style="font-size:11px;padding:2px 9px;border-radius:8px;background:rgba(255,122,0,0.10);color:#ffb066;border:1px solid rgba(255,122,0,0.25);display:inline-flex;align-items:center;gap:4px">
              <span style="font-size:9px;color:#6b7280">region:</span>
              <span class="inline-edit"
                    data-event="${e.id}"
                    data-field="region"
                    data-multiline="0"
                    data-placeholder="region"
                    data-raw="${escapeHtml(e.region || '')}"
                    tabindex="0"
                    title="Click to edit region"
                    style="display:inline-block">
                <span class="inline-edit-view" style="cursor:text;padding:0 4px;border-radius:3px;border:1px dashed transparent">${e.region ? escapeHtml(e.region) : '—'}</span>
              </span>
            </span>
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
        <div>
          ${editableField({ eventId: e.id, field: 'address', value: e.address, label: 'Address', placeholder: 'Venue / address', emptyText: 'click to add address' })}
        </div>
        <div>
          ${editableField({ eventId: e.id, field: 'time_text', value: e.time_text, label: 'Time', placeholder: 'e.g. 14:00 or 08h00-17h00', emptyText: 'click to add time' })}
        </div>
        ${e.client_name ? `<div><div style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:1px">Client</div><div style="color:#fff;margin-top:4px">${escapeHtml(e.client_name)}</div></div>` : ''}
      </div>

      <!-- ── TIMELINE ────────────────────────────────────────────────── -->
      <div style="margin-top:24px;padding:14px;background:#0d1117;border:1px solid #21262d;border-radius:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <div style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:1px">
            <i class="fa-regular fa-clock"></i> Timeline
          </div>
          <span id="timesStatus" style="font-size:11px;color:#6b7280"></span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px">
          ${['setup_time:Setup','event_start:Event start','event_end:Event end','strike_time:Strike','collection_time:Collection'].map(pair => {
            const [field, label] = pair.split(':')
            const v = e[field] || ''
            return `<div>
              <label style="display:block;color:#6b7280;font-size:10px;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px">${label}</label>
              <input type="time" class="event-time-input" data-field="${field}" value="${escapeHtml(v)}"
                style="width:100%;padding:7px 8px;background:#161b22;border:1px solid #21262d;border-radius:6px;color:#fff;font-family:monospace;font-size:13px" />
            </div>`
          }).join('')}
        </div>
        <div style="margin-top:6px;color:#6b7280;font-size:10px">Free-text Time field: <span style="color:#9ca3af">${escapeHtml(e.time_text || '—')}</span></div>
      </div>

      <!-- ── CREW ───────────────────────────────────────────────────── -->
      <div style="margin-top:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:1px">
            <i class="fa-solid fa-users"></i> Crew (${crewRows.results?.length || 0})
          </div>
          <button type="button" id="openCrewPicker"
            style="padding:6px 12px;background:#161b22;border:1px solid #F0D080;color:#F0D080;border-radius:6px;font-size:12px;cursor:pointer;font-weight:600">
            <i class="fa-solid fa-plus"></i> Add crew
          </button>
        </div>
        <div id="crewChips" style="display:flex;flex-wrap:wrap;gap:6px;min-height:30px">
          ${(crewRows.results || []).map((r:any) => crewChip(r, e.id)).join('') || '<div style="color:#6b7280;font-size:12px;font-style:italic">No crew assigned yet — click "Add crew"</div>'}
        </div>
        ${e.team_text ? `<div style="margin-top:10px;padding:8px 10px;background:rgba(99,102,241,0.05);border-left:2px solid #6366f1;border-radius:4px;font-size:11px;color:#9ca3af">
          <span style="color:#6b7280">Legacy free-text crew: </span>${escapeHtml(e.team_text)}
          <span style="color:#6b7280;font-style:italic">  ·  use picker above to replace</span>
        </div>` : ''}
      </div>

      <!-- ── VEHICLES ───────────────────────────────────────────────── -->
      <div style="margin-top:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:1px">
            <i class="fa-solid fa-truck"></i> Vehicles (${vehRows.results?.length || 0})
          </div>
          <button type="button" id="openVehiclePicker"
            style="padding:6px 12px;background:#161b22;border:1px solid #18D9FF;color:#18D9FF;border-radius:6px;font-size:12px;cursor:pointer;font-weight:600">
            <i class="fa-solid fa-plus"></i> Add vehicle
          </button>
        </div>
        <div id="vehicleChips" style="display:flex;flex-wrap:wrap;gap:6px;min-height:30px">
          ${(vehRows.results || []).map((r:any) => vehicleChip(r, e.id)).join('') || '<div style="color:#6b7280;font-size:12px;font-style:italic">No vehicles assigned yet — click "Add vehicle"</div>'}
        </div>
        ${e.vehicle_text ? `<div style="margin-top:10px;padding:8px 10px;background:rgba(99,102,241,0.05);border-left:2px solid #6366f1;border-radius:4px;font-size:11px;color:#9ca3af">
          <span style="color:#6b7280">Legacy free-text vehicle: </span>${escapeHtml(e.vehicle_text)}
          <span style="color:#6b7280;font-style:italic">  ·  use picker above to replace</span>
        </div>` : ''}
      </div>

      <!-- ── EQUIPMENT ─────────────────────────────────────────────── -->
      <div style="margin-top:20px;padding:14px;background:#0d1117;border:1px solid #21262d;border-radius:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <div style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:1px">
            <i class="fa-solid fa-boxes-stacked"></i> Equipment (${equipRows.results?.length || 0})
          </div>
          <span style="font-size:10px;color:#6b7280;font-style:italic">free-type for now · stock-linked once import lands</span>
        </div>
        <div id="equipList">
          ${(equipRows.results || []).map((r:any) => equipRow(r, e.id)).join('')}
        </div>
        <form id="equipAddForm" style="display:flex;gap:6px;margin-top:10px;align-items:stretch;flex-wrap:wrap">
          <input type="text" id="equipDesc" placeholder="e.g. Castle Lager umbrellas - New" required
            style="flex:1;min-width:200px;padding:8px 10px;background:#161b22;border:1px solid #21262d;border-radius:6px;color:#fff;font-size:13px" />
          <input type="number" id="equipQty" placeholder="Qty" min="1" step="1" value="1" required
            style="width:80px;padding:8px 10px;background:#161b22;border:1px solid #21262d;border-radius:6px;color:#fff;font-size:13px;font-family:monospace" />
          <button type="submit"
            style="padding:8px 16px;background:#F0D080;color:#1a1004;border:0;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px">
            <i class="fa-solid fa-plus"></i> Add
          </button>
        </form>
      </div>

      ${(() => {
        const subs = subRows.results || []
        if (!subs.length) return `
          <div style="margin-top:24px;padding:14px;background:rgba(240,208,128,0.04);border:1px dashed #21262d;border-radius:8px;color:#6b7280;font-size:12px;text-align:center">
            <i class="fa-solid fa-clipboard-list"></i> No load sheets linked yet — Pre-Load / Delivery / Collection notes dated ${e.event_date} will appear here automatically.
          </div>`
        const typeMap: Record<string, { label: string; icon: string; color: string }> = {
          delivery:    { label: 'Delivery Note',   icon: 'fa-truck-fast',        color: '#7CFF2B' },
          collection:  { label: 'Collection Note', icon: 'fa-truck-arrow-right', color: '#18D9FF' },
          preload:     { label: 'Pre-Load',        icon: 'fa-boxes-packing',     color: '#F0D080' },
          'pre-load':  { label: 'Pre-Load',        icon: 'fa-boxes-packing',     color: '#F0D080' },
          inspection:  { label: 'Vehicle Inspection', icon: 'fa-clipboard-check', color: '#ffb066' },
          repair:      { label: 'Repair Note',     icon: 'fa-wrench',            color: '#FF4A1C' },
          musicbus_inspection: { label: 'Music Bus Inspection', icon: 'fa-bus', color: '#CC18E8' },
          shortlist:   { label: 'Shortlist',       icon: 'fa-list-check',        color: '#a4a6f4' },
        }
        const rows = subs.map((s: any) => {
          const meta = typeMap[s.form_type] || { label: s.form_type, icon: 'fa-file', color: '#9ca3af' }
          const isPinned = s.calendar_event_id === e.id
          const signedBadge = s.is_signed
            ? `<span style="font-size:10px;padding:1px 7px;border-radius:6px;background:rgba(124,255,43,0.15);color:#a8ff7a;border:1px solid rgba(124,255,43,0.3)"><i class="fa-solid fa-check"></i> Signed</span>`
            : `<span style="font-size:10px;padding:1px 7px;border-radius:6px;background:rgba(156,163,175,0.10);color:#9ca3af;border:1px solid rgba(156,163,175,0.25)">Unsigned</span>`
          const pinnedBadge = isPinned
            ? `<span style="font-size:10px;padding:1px 7px;border-radius:6px;background:rgba(240,208,128,0.15);color:#F0D080;border:1px solid rgba(240,208,128,0.3)" title="Explicitly pinned to this event"><i class="fa-solid fa-thumbtack"></i> Pinned</span>`
            : `<span style="font-size:10px;padding:1px 7px;border-radius:6px;background:rgba(99,102,241,0.10);color:#a4a6f4;border:1px solid rgba(99,102,241,0.25)" title="Auto-matched by date">Date match</span>`
          const pinAction = isPinned
            ? `<form method="POST" action="/calendar/event/${e.id}/unpin/${s.id}" style="display:inline">
                <button type="submit" style="background:none;border:0;color:#9ca3af;font-size:11px;cursor:pointer;text-decoration:underline">unpin</button>
               </form>`
            : `<form method="POST" action="/calendar/event/${e.id}/pin/${s.id}" style="display:inline">
                <button type="submit" style="background:none;border:0;color:#F0D080;font-size:11px;cursor:pointer;text-decoration:underline">pin to event</button>
               </form>`
          return `
            <tr style="border-bottom:1px solid #21262d">
              <td style="padding:10px 8px;color:${meta.color};font-weight:600">
                <i class="fa-solid ${meta.icon}" style="margin-right:4px"></i>${meta.label}
              </td>
              <td style="padding:10px 8px;color:#fff;font-family:monospace;font-size:12px">${escapeHtml(s.form_number)}</td>
              <td style="padding:10px 8px;color:#9ca3af;font-size:12px">${escapeHtml(s.event_name || s.venue || '—')}</td>
              <td style="padding:10px 8px;color:#9ca3af;font-size:12px">${escapeHtml(s.driver || s.prepared_by || '—')}</td>
              <td style="padding:10px 8px;color:#9ca3af;font-size:12px;font-family:monospace">${escapeHtml(s.vehicle_reg || '—')}</td>
              <td style="padding:10px 8px">${signedBadge}</td>
              <td style="padding:10px 8px">${pinnedBadge}</td>
              <td style="padding:10px 8px;white-space:nowrap">
                ${s.pdf_url
                  ? `<a href="${s.pdf_url}" target="_blank" rel="noopener" style="color:#F0D080;font-size:11px;text-decoration:none"><i class="fa-solid fa-file-pdf"></i> PDF</a> &nbsp;`
                  : ''}
                <a href="/field/admin/submission/${s.id}" style="color:#9ca3af;font-size:11px;text-decoration:none"><i class="fa-solid fa-eye"></i> view</a>
                &nbsp; ${pinAction}
              </td>
            </tr>`
        }).join('')
        return `
          <div style="margin-top:24px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
              <div style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:1px">
                <i class="fa-solid fa-clipboard-list"></i> Load Sheets (${subs.length})
              </div>
              <a href="/field" style="font-size:11px;color:#F0D080;text-decoration:none"><i class="fa-solid fa-plus"></i> create field form</a>
            </div>
            <div style="background:#0d1117;border:1px solid #21262d;border-radius:8px;overflow:hidden">
              <table style="width:100%;border-collapse:collapse">
                <thead style="background:#161b22">
                  <tr>
                    <th style="text-align:left;padding:8px;color:#9ca3af;font-size:10px;text-transform:uppercase;letter-spacing:1px">Type</th>
                    <th style="text-align:left;padding:8px;color:#9ca3af;font-size:10px;text-transform:uppercase;letter-spacing:1px">Number</th>
                    <th style="text-align:left;padding:8px;color:#9ca3af;font-size:10px;text-transform:uppercase;letter-spacing:1px">Event / Venue</th>
                    <th style="text-align:left;padding:8px;color:#9ca3af;font-size:10px;text-transform:uppercase;letter-spacing:1px">Driver</th>
                    <th style="text-align:left;padding:8px;color:#9ca3af;font-size:10px;text-transform:uppercase;letter-spacing:1px">Vehicle</th>
                    <th style="text-align:left;padding:8px;color:#9ca3af;font-size:10px;text-transform:uppercase;letter-spacing:1px">Signed</th>
                    <th style="text-align:left;padding:8px;color:#9ca3af;font-size:10px;text-transform:uppercase;letter-spacing:1px">Link</th>
                    <th style="text-align:left;padding:8px;color:#9ca3af;font-size:10px;text-transform:uppercase;letter-spacing:1px">Action</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          </div>`
      })()}

      <div style="margin-top:20px">
        ${editableField({ eventId: e.id, field: 'notes', value: e.notes, label: 'Notes', multiline: true, placeholder: 'Notes about this event…', emptyText: 'click to add notes' })}
      </div>

      <div style="margin-top:24px;padding-top:14px;border-top:1px solid #21262d;color:#6b7280;font-size:11px;display:flex;gap:14px;flex-wrap:wrap">
        <span>Source: ${escapeHtml(e.source)}</span>
        ${e.source_ref ? `<span>Ref: ${escapeHtml(e.source_ref)}</span>` : ''}
        <span>Created: ${new Date(e.created_at).toLocaleString('en-ZA')}</span>
        <span>Updated: <span id="updatedAt">${new Date(e.updated_at).toLocaleString('en-ZA')}</span></span>
      </div>
    </div>

    <!-- ── PICKER MODAL ─────────────────────────────────────────── -->
    <div id="pickerModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9999;align-items:flex-start;justify-content:center;padding:60px 16px 16px 16px;overflow-y:auto">
      <div style="background:#0d1117;border:1px solid #21262d;border-radius:10px;max-width:600px;width:100%;max-height:80vh;display:flex;flex-direction:column">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid #21262d">
          <h3 id="pickerTitle" style="margin:0;color:#F0D080;font-size:16px">Pick</h3>
          <button type="button" id="pickerClose" style="background:none;border:0;color:#9ca3af;cursor:pointer;font-size:18px">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div style="padding:12px 18px;border-bottom:1px solid #21262d">
          <input type="text" id="pickerSearch" placeholder="Search…" autocomplete="off"
            style="width:100%;padding:8px 12px;background:#161b22;border:1px solid #21262d;border-radius:6px;color:#fff;font-size:13px" />
        </div>
        <div id="pickerList" style="flex:1;overflow-y:auto;padding:8px 12px"></div>
      </div>
    </div>

    <script>
    (function() {
      const EVENT_ID = ${e.id};

      // ── Helper: POST JSON ─────────────────────────────────────────
      async function postJSON(url, body) {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await r.json().catch(() => ({}));
        return { status: r.status, data };
      }
      async function patchJSON(url, body) {
        const r = await fetch(url, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await r.json().catch(() => ({}));
        return { status: r.status, data };
      }
      async function deleteJSON(url) {
        const r = await fetch(url, { method: 'DELETE' });
        const data = await r.json().catch(() => ({}));
        return { status: r.status, data };
      }

      // ── TIMELINE: live save on blur ────────────────────────────────
      document.querySelectorAll('.event-time-input').forEach(inp => {
        let lastSaved = inp.value;
        inp.addEventListener('blur', async () => {
          if (inp.value === lastSaved) return;
          const field = inp.dataset.field;
          const status = document.getElementById('timesStatus');
          status.textContent = 'Saving…';
          status.style.color = '#9ca3af';
          const { status: code, data } = await patchJSON('/calendar/api/event/' + EVENT_ID + '/times', { [field]: inp.value });
          if (code === 200 && data.ok) {
            lastSaved = inp.value;
            status.textContent = 'Saved ✓';
            status.style.color = '#a8ff7a';
            setTimeout(() => { status.textContent = ''; }, 1500);
          } else {
            status.textContent = data.error || 'Save failed';
            status.style.color = '#ff7a00';
          }
        });
      });

      // ── PICKER MODAL ────────────────────────────────────────────────
      const modal = document.getElementById('pickerModal');
      const titleEl = document.getElementById('pickerTitle');
      const searchEl = document.getElementById('pickerSearch');
      const listEl = document.getElementById('pickerList');
      let pickerMode = null;  // 'crew' or 'vehicle'
      let pickerItems = [];

      function openModal() {
        modal.style.display = 'flex';
        searchEl.value = '';
        setTimeout(() => searchEl.focus(), 50);
      }
      function closeModal() { modal.style.display = 'none'; }

      document.getElementById('pickerClose').addEventListener('click', closeModal);
      modal.addEventListener('click', (ev) => { if (ev.target === modal) closeModal(); });
      document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && modal.style.display !== 'none') closeModal(); });

      function renderList(filter) {
        const q = (filter || '').toLowerCase().trim();
        const filtered = pickerItems.filter(it => {
          if (!q) return true;
          const hay = pickerMode === 'crew'
            ? it.name.toLowerCase()
            : ((it.description||'') + ' ' + (it.reg_number||'') + ' ' + (it.vehicle_type||'')).toLowerCase();
          return hay.includes(q);
        });
        if (!filtered.length) {
          listEl.innerHTML = '<div style="padding:20px;text-align:center;color:#6b7280;font-size:12px">No matches</div>';
          return;
        }
        listEl.innerHTML = filtered.map(it => {
          const conflicts = it.conflicts || [];
          const hasConflict = conflicts.length > 0;
          const conflictNames = conflicts.map(c => c.event_name).join(', ');
          const id = pickerMode === 'crew' ? it.id : it.id;
          const label = pickerMode === 'crew'
            ? it.name + (it.crew_type === 'driver' ? ' <span style=\\"font-size:9px;padding:1px 5px;background:rgba(24,217,255,0.15);color:#8ee9ff;border-radius:4px;margin-left:4px\\">driver</span>' : '')
            : (it.description||'') + (it.reg_number ? ' <span style=\\"opacity:.6;font-family:monospace;font-size:11px\\">' + it.reg_number + '</span>' : '') + (it.experiential ? ' <span style=\\"font-size:9px;padding:1px 5px;background:rgba(204,24,232,0.20);color:#e8a5f4;border-radius:4px;margin-left:4px\\">XP</span>' : '');
          const bgColor = it.assigned ? 'rgba(124,255,43,0.06)' : (hasConflict ? 'rgba(255,74,28,0.06)' : '#161b22');
          const borderColor = it.assigned ? 'rgba(124,255,43,0.3)' : (hasConflict ? 'rgba(255,74,28,0.3)' : '#21262d');
          const conflictTag = hasConflict ? '<div style="font-size:10px;color:#ff7a00;margin-top:2px"><i class="fa-solid fa-triangle-exclamation"></i> Booked: ' + escapeAttr(conflictNames) + '</div>' : '';
          const assignedTag = it.assigned ? '<span style="font-size:10px;padding:2px 7px;background:rgba(124,255,43,0.15);color:#a8ff7a;border-radius:4px">on this event</span>' : '';
          const btnLabel = it.assigned ? 'Remove' : (hasConflict ? 'Override + Add' : 'Add');
          const btnStyle = it.assigned
            ? 'background:#1c0a08;color:#ff7a00;border:1px solid rgba(255,122,0,0.35)'
            : (hasConflict ? 'background:#1c0a08;color:#ff7a00;border:1px solid rgba(255,122,0,0.5);font-weight:600' : 'background:#F0D080;color:#1a1004;border:0;font-weight:600');
          return '<div class="picker-row" data-id="' + id + '" data-conflict="' + (hasConflict ? '1' : '0') + '" data-assigned="' + (it.assigned ? '1' : '0') + '" style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;margin:4px 0;border:1px solid ' + borderColor + ';border-radius:6px;background:' + bgColor + '">'
            + '<div style="flex:1;min-width:0"><div style="color:#fff;font-size:13px">' + label + '</div>' + conflictTag + '</div>'
            + '<div style="display:flex;gap:8px;align-items:center">' + assignedTag
            + '<button type="button" class="picker-action" style="padding:6px 12px;border-radius:5px;cursor:pointer;font-size:12px;' + btnStyle + '">' + btnLabel + '</button>'
            + '</div></div>';
        }).join('');

        listEl.querySelectorAll('.picker-action').forEach(btn => {
          btn.addEventListener('click', (ev) => {
            const row = ev.target.closest('.picker-row');
            const id = parseInt(row.dataset.id);
            const isAssigned = row.dataset.assigned === '1';
            const hasConflict = row.dataset.conflict === '1';
            if (isAssigned) {
              doRemove(id);
            } else if (hasConflict) {
              const reason = prompt('This person/vehicle is already booked on another event that day.\\n\\nFounder override reason (required):');
              if (reason && reason.trim()) doAssign(id, reason.trim());
            } else {
              doAssign(id, null);
            }
          });
        });
      }

      async function doAssign(id, overrideReason) {
        const url = pickerMode === 'crew' ? '/calendar/api/event/' + EVENT_ID + '/crew' : '/calendar/api/event/' + EVENT_ID + '/vehicle';
        const body = pickerMode === 'crew'
          ? { person_id: id, action: 'assign', override_reason: overrideReason }
          : { fleet_id: id, action: 'assign', override_reason: overrideReason };
        const { status, data } = await postJSON(url, body);
        if (status === 200 && data.ok) {
          closeModal();
          location.reload();  // simple: server already has fresh state
        } else if (status === 409) {
          alert(data.message || 'Conflict — could not add');
        } else {
          alert(data.error || 'Failed to add');
        }
      }
      async function doRemove(id) {
        const url = pickerMode === 'crew' ? '/calendar/api/event/' + EVENT_ID + '/crew' : '/calendar/api/event/' + EVENT_ID + '/vehicle';
        const body = pickerMode === 'crew'
          ? { person_id: id, action: 'remove' }
          : { fleet_id: id, action: 'remove' };
        const { status, data } = await postJSON(url, body);
        if (status === 200 && data.ok) {
          closeModal();
          location.reload();
        } else {
          alert(data.error || 'Failed to remove');
        }
      }

      searchEl.addEventListener('input', () => renderList(searchEl.value));

      function escapeAttr(s) {
        return String(s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      }

      // ── Open crew picker ─────────────────────────────────────────
      document.getElementById('openCrewPicker').addEventListener('click', async () => {
        pickerMode = 'crew';
        titleEl.innerHTML = '<i class="fa-solid fa-users" style="margin-right:6px"></i>Pick crew';
        listEl.innerHTML = '<div style="padding:20px;text-align:center;color:#6b7280;font-size:12px">Loading…</div>';
        openModal();
        const r = await fetch('/calendar/api/event/' + EVENT_ID + '/crew-picker');
        const data = await r.json();
        pickerItems = data.items || [];
        renderList('');
      });

      // ── Open vehicle picker ─────────────────────────────────────
      document.getElementById('openVehiclePicker').addEventListener('click', async () => {
        pickerMode = 'vehicle';
        titleEl.innerHTML = '<i class="fa-solid fa-truck" style="margin-right:6px"></i>Pick vehicle';
        listEl.innerHTML = '<div style="padding:20px;text-align:center;color:#6b7280;font-size:12px">Loading…</div>';
        openModal();
        const r = await fetch('/calendar/api/event/' + EVENT_ID + '/vehicle-picker');
        const data = await r.json();
        pickerItems = data.items || [];
        renderList('');
      });

      // ── Chip remove buttons (delegated) ──────────────────────────
      document.addEventListener('click', async (ev) => {
        const btn = ev.target.closest('.chip-remove');
        if (!btn) return;
        const chip = btn.closest('.crew-chip, .vehicle-chip');
        if (!chip) return;
        if (!confirm('Remove this from the event?')) return;
        if (chip.classList.contains('crew-chip')) {
          const personId = parseInt(chip.dataset.personId);
          const { status, data } = await postJSON('/calendar/api/event/' + EVENT_ID + '/crew', { person_id: personId, action: 'remove' });
          if (status === 200 && data.ok) chip.remove();
          else alert(data.error || 'Remove failed');
        } else {
          const fleetId = parseInt(chip.dataset.fleetId);
          const { status, data } = await postJSON('/calendar/api/event/' + EVENT_ID + '/vehicle', { fleet_id: fleetId, action: 'remove' });
          if (status === 200 && data.ok) chip.remove();
          else alert(data.error || 'Remove failed');
        }
      });

      // ── Equipment add ────────────────────────────────────────────
      const equipForm = document.getElementById('equipAddForm');
      const equipDesc = document.getElementById('equipDesc');
      const equipQty = document.getElementById('equipQty');
      const equipList = document.getElementById('equipList');
      equipForm.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const description = equipDesc.value.trim();
        const quantity = parseFloat(equipQty.value);
        if (!description || !(quantity > 0)) return;
        const { status, data } = await postJSON('/calendar/api/event/' + EVENT_ID + '/equipment', { description, quantity });
        if (status === 200 && data.ok) {
          // optimistic append
          const div = document.createElement('div');
          div.innerHTML = '<div class="equip-row" data-equip-id="' + data.id + '" data-event-id="' + EVENT_ID + '" style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:#161b22;border:1px solid #21262d;border-radius:6px;margin-bottom:4px">'
            + '<span style="font-family:monospace;color:#F0D080;font-size:13px;min-width:50px;text-align:right">' + escapeAttr(quantity) + '×</span>'
            + '<span style="flex:1;color:#fff;font-size:13px">' + escapeAttr(description) + '</span>'
            + '<span style="font-size:9px;padding:1px 5px;background:rgba(156,163,175,0.10);color:#6b7280;border-radius:4px">free</span>'
            + '<button type="button" class="equip-remove" title="Remove" style="background:none;border:0;color:#6b7280;cursor:pointer;padding:2px 6px;font-size:12px"><i class="fa-solid fa-xmark"></i></button>'
            + '</div>';
          equipList.appendChild(div.firstChild);
          equipDesc.value = '';
          equipQty.value = '1';
          equipDesc.focus();
        } else {
          alert(data.error || 'Failed to add equipment');
        }
      });

      // Equipment remove (delegated)
      document.addEventListener('click', async (ev) => {
        const btn = ev.target.closest('.equip-remove');
        if (!btn) return;
        const row = btn.closest('.equip-row');
        if (!row) return;
        if (!confirm('Remove this equipment line?')) return;
        const eqId = row.dataset.equipId;
        const { status, data } = await deleteJSON('/calendar/api/event/' + EVENT_ID + '/equipment/' + eqId);
        if (status === 200 && data.ok) row.remove();
        else alert(data.error || 'Remove failed');
      });
    })();
    </script>

    ${inlineEditScript()}
  `
  return c.html(layout(e.event_name, body, user, 'calendar'))
})

// ── PATCH /calendar/api/event/:id — inline edit JSON endpoint ─────────────
// Accepts any subset of editable fields. Returns { ok, updated_at } on success.
calendar.patch('/api/event/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  if (!id) return c.json({ ok: false, error: 'bad id' }, 400)

  let body: any
  try { body = await c.req.json() }
  catch { return c.json({ ok: false, error: 'invalid json' }, 400) }

  // Allowed editable fields (with optional max lengths for sanity)
  const FIELD_LIMITS: Record<string, number> = {
    event_name: 200,
    address: 500,
    time_text: 100,
    team_text: 1000,
    vehicle_text: 300,
    brand: 100,
    region: 100,
    notes: 5000,
  }

  // Whitelist + trim + length check
  const updates: Record<string, string | null> = {}
  for (const [k, v] of Object.entries(body)) {
    if (!(k in FIELD_LIMITS)) continue // silently drop unknown fields
    const max = FIELD_LIMITS[k]
    let val = v == null ? '' : String(v)
    val = val.trim()
    if (val.length > max) {
      return c.json({ ok: false, error: `${k} too long (max ${max})` }, 400)
    }
    updates[k] = val === '' ? null : val
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ ok: false, error: 'no editable fields supplied' }, 400)
  }

  // Special-case: event_name can't be empty
  if ('event_name' in updates && !updates.event_name) {
    return c.json({ ok: false, error: 'event name cannot be empty' }, 400)
  }

  // Snapshot before for audit diff
  const cols = Object.keys(updates)
  const before = await db.prepare(
    `SELECT ${cols.join(', ')} FROM calendar_events WHERE id=?`
  ).bind(id).first<any>()

  // Build dynamic UPDATE
  const sets = cols.map(c => `${c}=?`).join(', ')
  const vals = cols.map(c => updates[c])
  vals.push(id)
  await db.prepare(
    `UPDATE calendar_events SET ${sets}, updated_at=CURRENT_TIMESTAMP WHERE id=?`
  ).bind(...vals).run()

  const row = await db.prepare(
    `SELECT updated_at FROM calendar_events WHERE id=?`
  ).bind(id).first<any>()

  // Audit log: record the diff (fail-soft, won't block the response)
  const changes = diff(before || {}, updates, cols)
  if (Object.keys(changes).length > 0) {
    await audit(c, {
      action: 'update',
      entityType: 'calendar_event',
      entityId: id,
      fieldChanges: changes,
    })
  }

  return c.json({ ok: true, updated_at: row?.updated_at, fields: cols })
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

// ── POST /calendar/event/:eventId/pin/:subId — hard-link a field submission
calendar.post('/event/:eventId/pin/:subId', async (c) => {
  const db = c.env.DB
  const eventId = parseInt(c.req.param('eventId'))
  const subId = parseInt(c.req.param('subId'))
  if (!eventId || !subId) return c.text('Bad ids', 400)
  await db.prepare(`UPDATE field_submissions SET calendar_event_id=? WHERE id=?`).bind(eventId, subId).run()
  return c.redirect(`/calendar/event/${eventId}`)
})

calendar.post('/event/:eventId/unpin/:subId', async (c) => {
  const db = c.env.DB
  const eventId = parseInt(c.req.param('eventId'))
  const subId = parseInt(c.req.param('subId'))
  if (!eventId || !subId) return c.text('Bad ids', 400)
  await db.prepare(`UPDATE field_submissions SET calendar_event_id=NULL WHERE id=? AND calendar_event_id=?`).bind(subId, eventId).run()
  return c.redirect(`/calendar/event/${eventId}`)
})

// ── ICS subscribe feed ──────────────────────────────────────────────────────
// /calendar/ics-setup       — auth-protected; shows the user their personal feed URL
// /calendar/ics/:userId/:token.ics — PUBLIC (token-protected); Google/Apple/Outlook
//                                    poll this URL to keep the calendar in sync

calendar.get('/ics-setup', async (c) => {
  const user = c.get('user')
  const db = c.env.DB

  // Look up or generate a token for this user
  const row = await db.prepare(`SELECT ics_token FROM users WHERE id=?`).bind(user.id).first<any>()
  let token = row?.ics_token
  if (!token) {
    token = await generateIcsToken()
    await db.prepare(`UPDATE users SET ics_token=? WHERE id=?`).bind(token, user.id).run()
  }

  const url = new URL(c.req.url)
  const feedUrl = `${url.protocol}//${url.host}/calendar/ics/${user.id}/${token}.ics`
  // Google Calendar's "Add by URL" page (deep link)
  const googleAddUrl = `https://calendar.google.com/calendar/r/settings/addbyurl?cid=${encodeURIComponent(feedUrl)}`

  const body = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px">
      <a href="/calendar" style="color:#9ca3af;text-decoration:none">
        <i class="fa-solid fa-chevron-left"></i> Back to calendar
      </a>
    </div>
    <h1 style="color:#F0D080"><i class="fa-solid fa-share-nodes"></i> Subscribe in Google Calendar</h1>
    <p style="color:#9ca3af">
      This pipes <strong>your B&W events</strong> into Google Calendar, Apple Calendar, or Outlook —
      live, read-only, auto-syncing. The URL is private to you; don't share it.
    </p>

    <div style="background:#0d1117;border:1px solid #21262d;border-radius:10px;padding:20px;margin-top:18px">
      <div style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Your private feed URL</div>
      <div style="display:flex;gap:8px;align-items:stretch;flex-wrap:wrap">
        <input id="feedUrl" type="text" readonly value="${escapeHtml(feedUrl)}"
          style="flex:1;min-width:280px;padding:10px 12px;background:#161b22;border:1px solid #21262d;border-radius:6px;color:#fff;font-family:monospace;font-size:12px"
          onclick="this.select()">
        <button onclick="copyFeed()" style="padding:10px 18px;background:#F0D080;color:#1a1004;border:0;border-radius:6px;font-weight:600;cursor:pointer">
          <i class="fa-solid fa-copy"></i> Copy
        </button>
      </div>
    </div>

    <div style="margin-top:18px;display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px">
      <a href="${googleAddUrl}" target="_blank" rel="noopener" style="
        display:block;padding:18px;background:#0d1117;border:1px solid #21262d;border-radius:10px;
        color:#fff;text-decoration:none;transition:all .15s">
        <div style="font-size:24px;color:#4285F4;margin-bottom:6px"><i class="fa-brands fa-google"></i></div>
        <div style="font-weight:600">Add to Google Calendar</div>
        <div style="font-size:12px;color:#9ca3af;margin-top:4px">One-click — opens Google's add-by-URL page</div>
      </a>
      <a href="webcal://${url.host}/calendar/ics/${user.id}/${token}.ics" style="
        display:block;padding:18px;background:#0d1117;border:1px solid #21262d;border-radius:10px;
        color:#fff;text-decoration:none;transition:all .15s">
        <div style="font-size:24px;color:#fff;margin-bottom:6px"><i class="fa-brands fa-apple"></i></div>
        <div style="font-weight:600">Add to Apple Calendar</div>
        <div style="font-size:12px;color:#9ca3af;margin-top:4px">Opens in Calendar.app (macOS / iOS)</div>
      </a>
      <a href="${feedUrl}" download="bw-events.ics" style="
        display:block;padding:18px;background:#0d1117;border:1px solid #21262d;border-radius:10px;
        color:#fff;text-decoration:none;transition:all .15s">
        <div style="font-size:24px;color:#9ca3af;margin-bottom:6px"><i class="fa-solid fa-download"></i></div>
        <div style="font-weight:600">Download .ics file</div>
        <div style="font-size:12px;color:#9ca3af;margin-top:4px">For Outlook / one-off import</div>
      </a>
    </div>

    <div style="margin-top:24px;padding:14px 18px;background:rgba(240,208,128,0.04);border-left:3px solid #F0D080;border-radius:6px">
      <div style="color:#F0D080;font-weight:600;margin-bottom:6px"><i class="fa-solid fa-info-circle"></i> How sync works</div>
      <div style="color:#9ca3af;font-size:13px;line-height:1.6">
        Google polls the feed roughly every 4–8 hours (it's their schedule, not ours). So new events
        you add in B&W will show up in your Google Calendar within hours, not instantly.
        For instant updates, the calendar inside B&W stays your live source of truth.
      </div>
    </div>

    <details style="margin-top:18px">
      <summary style="cursor:pointer;color:#9ca3af;font-size:13px">
        <i class="fa-solid fa-rotate"></i> Reset my feed URL (rotates the token)
      </summary>
      <form method="POST" action="/calendar/ics-reset" style="margin-top:10px">
        <p style="color:#9ca3af;font-size:13px">
          Click below to generate a new private URL. The old one will stop working immediately.
          Use this if you ever shared the URL by accident.
        </p>
        <button type="submit" style="padding:8px 16px;background:#FF4A1C;color:#fff;border:0;border-radius:6px;font-weight:600;cursor:pointer">
          Reset token now
        </button>
      </form>
    </details>

    <script>
      function copyFeed() {
        const inp = document.getElementById('feedUrl')
        inp.select()
        navigator.clipboard.writeText(inp.value).then(() => {
          const btn = event.target.closest('button')
          const orig = btn.innerHTML
          btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied'
          setTimeout(() => btn.innerHTML = orig, 1500)
        })
      }
    </script>
  `
  return c.html(layout('Subscribe in Google Calendar', body, user, 'calendar'))
})

calendar.post('/ics-reset', async (c) => {
  const user = c.get('user')
  const db = c.env.DB
  const token = await generateIcsToken()
  await db.prepare(`UPDATE users SET ics_token=? WHERE id=?`).bind(token, user.id).run()
  return c.redirect('/calendar/ics-setup')
})

// ════════════════════════════════════════════════════════════════════════════
// EVENT OPS — crew, vehicles, equipment, timeline
// ════════════════════════════════════════════════════════════════════════════

// ── GET /calendar/api/event/:id/crew-picker
//    Returns all active crew/drivers with a `booked_elsewhere` flag for the event's date.
calendar.get('/api/event/:id/crew-picker', async (c) => {
  const db = c.env.DB
  const eventId = parseInt(c.req.param('id'))
  if (!eventId) return c.json({ ok: false, error: 'bad id' }, 400)

  const ev = await db.prepare(`SELECT id, event_date FROM calendar_events WHERE id=?`).bind(eventId).first<any>()
  if (!ev) return c.json({ ok: false, error: 'event not found' }, 404)

  // All eligible people (crew/driver only, exclude office and inactive)
  const people = await db.prepare(
    `SELECT id, name, crew_type, deliveries_disabled
     FROM field_people
     WHERE active = 1 AND crew_type IN ('crew', 'driver')
     ORDER BY name`
  ).all<any>()

  // Who's booked on another event the same date?
  const conflicts = await db.prepare(
    `SELECT cec.person_id, ce.id AS event_id, ce.event_name, ce.event_date, ce.status
     FROM calendar_event_crew cec
     JOIN calendar_events ce ON ce.id = cec.event_id
     WHERE ce.event_date = ?
       AND ce.id != ?
       AND ce.status != 'cancelled'`
  ).bind(ev.event_date, eventId).all<any>()
  const conflictMap = new Map<number, any[]>()
  for (const row of conflicts.results || []) {
    if (!conflictMap.has(row.person_id)) conflictMap.set(row.person_id, [])
    conflictMap.get(row.person_id)!.push(row)
  }

  // Who's already on THIS event?
  const onThis = await db.prepare(
    `SELECT person_id, role, override_reason FROM calendar_event_crew WHERE event_id=?`
  ).bind(eventId).all<any>()
  const onThisSet = new Set((onThis.results || []).map((r: any) => r.person_id))

  const items = (people.results || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    crew_type: p.crew_type,
    deliveries_disabled: !!p.deliveries_disabled,
    assigned: onThisSet.has(p.id),
    conflicts: conflictMap.get(p.id) || [],
  }))

  return c.json({ ok: true, event_date: ev.event_date, items })
})

// ── GET /calendar/api/event/:id/vehicle-picker
calendar.get('/api/event/:id/vehicle-picker', async (c) => {
  const db = c.env.DB
  const eventId = parseInt(c.req.param('id'))
  if (!eventId) return c.json({ ok: false, error: 'bad id' }, 400)

  const ev = await db.prepare(`SELECT id, event_date FROM calendar_events WHERE id=?`).bind(eventId).first<any>()
  if (!ev) return c.json({ ok: false, error: 'event not found' }, 404)

  // Active B&W fleet only (retired vehicles have active=0)
  const fleet = await db.prepare(
    `SELECT id, reg_number, description, vehicle_type, experiential
     FROM fleet
     WHERE active = 1
     ORDER BY experiential DESC, vehicle_type, description`
  ).all<any>()

  const conflicts = await db.prepare(
    `SELECT cev.fleet_id, ce.id AS event_id, ce.event_name, ce.event_date, ce.status
     FROM calendar_event_vehicles cev
     JOIN calendar_events ce ON ce.id = cev.event_id
     WHERE ce.event_date = ?
       AND ce.id != ?
       AND ce.status != 'cancelled'`
  ).bind(ev.event_date, eventId).all<any>()
  const conflictMap = new Map<number, any[]>()
  for (const row of conflicts.results || []) {
    if (!conflictMap.has(row.fleet_id)) conflictMap.set(row.fleet_id, [])
    conflictMap.get(row.fleet_id)!.push(row)
  }

  const onThis = await db.prepare(
    `SELECT fleet_id FROM calendar_event_vehicles WHERE event_id=?`
  ).bind(eventId).all<any>()
  const onThisSet = new Set((onThis.results || []).map((r: any) => r.fleet_id))

  const items = (fleet.results || []).map((f: any) => ({
    id: f.id,
    reg_number: f.reg_number,
    description: f.description,
    vehicle_type: f.vehicle_type,
    experiential: !!f.experiential,
    assigned: onThisSet.has(f.id),
    conflicts: conflictMap.get(f.id) || [],
  }))

  return c.json({ ok: true, event_date: ev.event_date, items })
})

// ── POST /calendar/api/event/:id/crew — assign or unassign a crew member
//    Body: { person_id: number, action: 'assign'|'remove', override_reason?: string, role?: string }
calendar.post('/api/event/:id/crew', async (c) => {
  const user = c.get('user') as any
  const db = c.env.DB
  const eventId = parseInt(c.req.param('id'))
  if (!eventId) return c.json({ ok: false, error: 'bad id' }, 400)

  let body: any
  try { body = await c.req.json() } catch { return c.json({ ok: false, error: 'invalid json' }, 400) }
  const personId = parseInt(body.person_id)
  const action = String(body.action || 'assign')
  if (!personId) return c.json({ ok: false, error: 'person_id required' }, 400)

  if (action === 'remove') {
    await db.prepare(`DELETE FROM calendar_event_crew WHERE event_id=? AND person_id=?`).bind(eventId, personId).run()
    await audit(c, { action: 'delete', entityType: 'event_crew', entityId: eventId, fieldChanges: { person_id: { from: personId, to: null } } })
    return c.json({ ok: true })
  }

  // Assign — check for conflicts first
  const ev = await db.prepare(`SELECT event_date FROM calendar_events WHERE id=?`).bind(eventId).first<any>()
  if (!ev) return c.json({ ok: false, error: 'event not found' }, 404)
  const conflict = await db.prepare(
    `SELECT ce.id, ce.event_name FROM calendar_event_crew cec
     JOIN calendar_events ce ON ce.id = cec.event_id
     WHERE cec.person_id = ? AND ce.event_date = ? AND ce.id != ? AND ce.status != 'cancelled'
     LIMIT 1`
  ).bind(personId, ev.event_date, eventId).first<any>()

  const overrideReason = body.override_reason ? String(body.override_reason).trim() : null
  if (conflict && !overrideReason) {
    return c.json({
      ok: false,
      error: 'conflict',
      message: `Already booked on "${conflict.event_name}" on ${ev.event_date}. Provide override_reason to force.`,
      conflict_event_id: conflict.id,
    }, 409)
  }

  const role = body.role ? String(body.role).trim().slice(0, 50) : null
  try {
    await db.prepare(
      `INSERT INTO calendar_event_crew (event_id, person_id, role, override_reason, created_by)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(eventId, personId, role, overrideReason, user?.id ?? null).run()
  } catch (e: any) {
    // UNIQUE constraint = already assigned; treat as idempotent success
    if (!/UNIQUE/i.test(e?.message || '')) throw e
  }

  await audit(c, {
    action: overrideReason ? 'override' : 'create',
    entityType: 'event_crew',
    entityId: eventId,
    fieldChanges: { person_id: { from: null, to: personId } },
    reason: overrideReason,
  })
  return c.json({ ok: true, override: !!overrideReason })
})

// ── POST /calendar/api/event/:id/vehicle — same pattern for vehicles
calendar.post('/api/event/:id/vehicle', async (c) => {
  const user = c.get('user') as any
  const db = c.env.DB
  const eventId = parseInt(c.req.param('id'))
  if (!eventId) return c.json({ ok: false, error: 'bad id' }, 400)

  let body: any
  try { body = await c.req.json() } catch { return c.json({ ok: false, error: 'invalid json' }, 400) }
  const fleetId = parseInt(body.fleet_id)
  const action = String(body.action || 'assign')
  if (!fleetId) return c.json({ ok: false, error: 'fleet_id required' }, 400)

  if (action === 'remove') {
    await db.prepare(`DELETE FROM calendar_event_vehicles WHERE event_id=? AND fleet_id=?`).bind(eventId, fleetId).run()
    await audit(c, { action: 'delete', entityType: 'event_vehicle', entityId: eventId, fieldChanges: { fleet_id: { from: fleetId, to: null } } })
    return c.json({ ok: true })
  }

  const ev = await db.prepare(`SELECT event_date FROM calendar_events WHERE id=?`).bind(eventId).first<any>()
  if (!ev) return c.json({ ok: false, error: 'event not found' }, 404)
  const conflict = await db.prepare(
    `SELECT ce.id, ce.event_name FROM calendar_event_vehicles cev
     JOIN calendar_events ce ON ce.id = cev.event_id
     WHERE cev.fleet_id = ? AND ce.event_date = ? AND ce.id != ? AND ce.status != 'cancelled'
     LIMIT 1`
  ).bind(fleetId, ev.event_date, eventId).first<any>()

  const overrideReason = body.override_reason ? String(body.override_reason).trim() : null
  if (conflict && !overrideReason) {
    return c.json({
      ok: false,
      error: 'conflict',
      message: `Vehicle already booked on "${conflict.event_name}" on ${ev.event_date}. Provide override_reason to force.`,
      conflict_event_id: conflict.id,
    }, 409)
  }

  const role = body.role ? String(body.role).trim().slice(0, 50) : null
  try {
    await db.prepare(
      `INSERT INTO calendar_event_vehicles (event_id, fleet_id, role, override_reason, created_by)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(eventId, fleetId, role, overrideReason, user?.id ?? null).run()
  } catch (e: any) {
    if (!/UNIQUE/i.test(e?.message || '')) throw e
  }

  await audit(c, {
    action: overrideReason ? 'override' : 'create',
    entityType: 'event_vehicle',
    entityId: eventId,
    fieldChanges: { fleet_id: { from: null, to: fleetId } },
    reason: overrideReason,
  })
  return c.json({ ok: true, override: !!overrideReason })
})

// ── Equipment list (free-type for now, will be stock-linked later) ─────────
// POST /calendar/api/event/:id/equipment   Body: { description, quantity, notes? }
calendar.post('/api/event/:id/equipment', async (c) => {
  const user = c.get('user') as any
  const db = c.env.DB
  const eventId = parseInt(c.req.param('id'))
  if (!eventId) return c.json({ ok: false, error: 'bad id' }, 400)

  let body: any
  try { body = await c.req.json() } catch { return c.json({ ok: false, error: 'invalid json' }, 400) }
  const description = String(body.description || '').trim().slice(0, 300)
  const quantity = parseFloat(body.quantity) || 1
  const notes = body.notes ? String(body.notes).trim().slice(0, 500) : null
  if (!description) return c.json({ ok: false, error: 'description required' }, 400)
  if (quantity <= 0) return c.json({ ok: false, error: 'quantity must be > 0' }, 400)

  const result = await db.prepare(
    `INSERT INTO calendar_event_equipment (event_id, description, quantity, notes, created_by)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(eventId, description, quantity, notes, user?.id ?? null).run()

  await audit(c, {
    action: 'create',
    entityType: 'event_equipment',
    entityId: eventId,
    fieldChanges: { description: { from: null, to: description }, quantity: { from: null, to: quantity } },
  })

  return c.json({ ok: true, id: result.meta.last_row_id, description, quantity, notes })
})

// DELETE /calendar/api/event/:id/equipment/:eqId
calendar.delete('/api/event/:id/equipment/:eqId', async (c) => {
  const db = c.env.DB
  const eventId = parseInt(c.req.param('id'))
  const eqId = parseInt(c.req.param('eqId'))
  if (!eventId || !eqId) return c.json({ ok: false, error: 'bad id' }, 400)
  const before = await db.prepare(`SELECT description, quantity FROM calendar_event_equipment WHERE id=? AND event_id=?`).bind(eqId, eventId).first<any>()
  await db.prepare(`DELETE FROM calendar_event_equipment WHERE id=? AND event_id=?`).bind(eqId, eventId).run()
  await audit(c, {
    action: 'delete',
    entityType: 'event_equipment',
    entityId: eventId,
    fieldChanges: before ? { description: { from: before.description, to: null }, quantity: { from: before.quantity, to: null } } : null,
  })
  return c.json({ ok: true })
})

// PATCH /calendar/api/event/:id/equipment/:eqId  Body: { description?, quantity?, notes? }
calendar.patch('/api/event/:id/equipment/:eqId', async (c) => {
  const db = c.env.DB
  const eventId = parseInt(c.req.param('id'))
  const eqId = parseInt(c.req.param('eqId'))
  if (!eventId || !eqId) return c.json({ ok: false, error: 'bad id' }, 400)
  let body: any
  try { body = await c.req.json() } catch { return c.json({ ok: false, error: 'invalid json' }, 400) }

  const updates: Record<string, any> = {}
  if (body.description != null) {
    const d = String(body.description).trim().slice(0, 300)
    if (!d) return c.json({ ok: false, error: 'description cannot be empty' }, 400)
    updates.description = d
  }
  if (body.quantity != null) {
    const q = parseFloat(body.quantity)
    if (isNaN(q) || q <= 0) return c.json({ ok: false, error: 'quantity must be > 0' }, 400)
    updates.quantity = q
  }
  if (body.notes !== undefined) {
    updates.notes = body.notes ? String(body.notes).trim().slice(0, 500) : null
  }
  const keys = Object.keys(updates)
  if (!keys.length) return c.json({ ok: false, error: 'no updates' }, 400)

  const before = await db.prepare(`SELECT ${keys.join(',')} FROM calendar_event_equipment WHERE id=? AND event_id=?`).bind(eqId, eventId).first<any>()
  const sets = keys.map(k => `${k}=?`).join(', ')
  const vals = keys.map(k => updates[k])
  vals.push(eqId, eventId)
  await db.prepare(`UPDATE calendar_event_equipment SET ${sets} WHERE id=? AND event_id=?`).bind(...vals).run()

  await audit(c, {
    action: 'update',
    entityType: 'event_equipment',
    entityId: eventId,
    fieldChanges: diff(before || {}, updates, keys),
  })
  return c.json({ ok: true })
})

// ── PATCH /calendar/api/event/:id/times  — bulk update of setup/event/strike/collection
calendar.patch('/api/event/:id/times', async (c) => {
  const db = c.env.DB
  const eventId = parseInt(c.req.param('id'))
  if (!eventId) return c.json({ ok: false, error: 'bad id' }, 400)
  let body: any
  try { body = await c.req.json() } catch { return c.json({ ok: false, error: 'invalid json' }, 400) }

  const TIME_FIELDS = ['setup_time', 'event_start', 'event_end', 'strike_time', 'collection_time']
  const updates: Record<string, string | null> = {}
  for (const f of TIME_FIELDS) {
    if (f in body) {
      const v = body[f] == null ? '' : String(body[f]).trim()
      if (v && !/^\d{1,2}:\d{2}$/.test(v)) {
        return c.json({ ok: false, error: `${f} must be HH:MM` }, 400)
      }
      updates[f] = v || null
    }
  }
  const keys = Object.keys(updates)
  if (!keys.length) return c.json({ ok: false, error: 'no time fields supplied' }, 400)

  const before = await db.prepare(`SELECT ${keys.join(',')} FROM calendar_events WHERE id=?`).bind(eventId).first<any>()
  const sets = keys.map(k => `${k}=?`).join(', ')
  const vals = keys.map(k => updates[k])
  vals.push(eventId)
  await db.prepare(`UPDATE calendar_events SET ${sets}, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(...vals).run()
  await audit(c, {
    action: 'update',
    entityType: 'calendar_event',
    entityId: eventId,
    fieldChanges: diff(before || {}, updates, keys),
  })
  return c.json({ ok: true })
})

export default calendar
