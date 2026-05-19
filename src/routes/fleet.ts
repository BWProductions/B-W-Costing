// Fleet management routes

import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth.js'
import { layout } from '../lib/layout.js'
import { formatZAR, statusBadge } from '../lib/format.js'
import type { AuthUser } from '../lib/auth.js'

type Env = { Bindings: { DB: D1Database }; Variables: { user: AuthUser } }

const fleet = new Hono<Env>()
fleet.use('*', requireAuth)

// ── DROPDOWN OPTIONS (single source of truth) ─────────────────────────────
const TONNAGE_OPTIONS    = ['1 ton', '4 ton', '6 ton', '8 ton', '10 ton', '14 ton', 'Other']
const VEHICLE_TYPE_OPTS  = [
  ['sedan',        'Sedan / Light Vehicle'],
  ['bakkie',       'Bakkie'],
  ['truck',        'Truck'],
  ['experiential', 'Experiential / Brand Vehicle'],
  ['trailer',      'Trailer'],
  ['other',        'Other'],
] as const
const COLOUR_OPTIONS     = ['White', 'Black', 'Blue', 'Red Castle Lager', 'Silver', 'Grey', 'Other']
const STATUS_OPTIONS     = ['available', 'allocated', 'maintenance', 'retired']

// ── FLEET LIST ────────────────────────────────────────────────────────────
fleet.get('/', async (c) => {
  const user = c.get('user')
  const db = c.env.DB
  const msg = c.req.query('msg')

  const vehicles = await db.prepare(
    `SELECT * FROM fleet WHERE active=1 ORDER BY experiential ASC, vehicle_type, reg_number`
  ).all<any>()

  const rows = (vehicles.results || []).map((v: any) => {
    const dims = (v.box_length_m && v.box_width_m && v.box_height_m)
      ? `${v.box_length_m} × ${v.box_width_m} × ${v.box_height_m} m`
      : '<span class="text-muted" style="font-size:11px">— measure pending —</span>'
    const vol = v.box_volume_m3 ? `<span class="text-muted" style="font-size:11px">${v.box_volume_m3} m³</span>` : ''
    return `
    <tr>
      <td>
        <span class="font-mono" style="font-size:12px;color:var(--bw-gold)">${v.reg_number}</span>
        ${v.experiential ? '<br><span class="badge" style="background:rgba(168,85,247,0.18);color:#c4b5fd;border:1px solid rgba(168,85,247,0.4);font-size:10px">🎪 Experiential</span>' : ''}
      </td>
      <td>
        <div style="font-weight:600">${esc(v.description)}</div>
        <div class="text-muted" style="font-size:11px">${esc(v.model || '')}</div>
      </td>
      <td><span class="badge" style="background:rgba(212,175,55,0.15);color:var(--bw-gold);border:1px solid rgba(212,175,55,0.35)">${v.tonnage || '—'}</span></td>
      <td class="hide-mobile">${colourChip(v.colour)}</td>
      <td class="hide-mobile" style="font-size:12px">${dims}<br>${vol}</td>
      <td class="text-right hide-mobile">${formatZAR(v.daily_hire_rate ?? 0)}<span class="text-muted">/day</span></td>
      <td class="text-right hide-mobile">${v.fuel_rate_per_km ? 'R '+v.fuel_rate_per_km+'/km' : '—'}</td>
      <td>${statusBadge(v.status)}</td>
      <td>
        <div style="display:flex;gap:6px">
          <a href="/fleet/${v.id}/edit" class="btn btn-outline btn-sm">Edit</a>
          <form method="POST" action="/fleet/${v.id}/status" style="display:inline">
            <select name="status" onchange="this.form.submit()" style="padding:4px 8px;font-size:12px;background:var(--bw-black);border:1px solid var(--bw-border2);border-radius:6px;color:var(--bw-white)">
              <option value="">Change…</option>
              ${STATUS_OPTIONS.map(s =>
                `<option value="${s}" ${v.status===s?'selected':''}>${s.charAt(0).toUpperCase()+s.slice(1)}</option>`
              ).join('')}
            </select>
          </form>
        </div>
      </td>
    </tr>`
  }).join('')

  // Summary counts by tonnage
  const tonnageCounts: Record<string, number> = {}
  for (const v of (vehicles.results || [])) {
    const k = v.tonnage || 'Other'
    tonnageCounts[k] = (tonnageCounts[k] || 0) + 1
  }

  const total       = vehicles.results.length
  const available   = vehicles.results.filter((v: any) => v.status === 'available').length
  const allocated   = vehicles.results.filter((v: any) => v.status === 'allocated').length
  const maint       = vehicles.results.filter((v: any) => v.status === 'maintenance').length
  const experiential= vehicles.results.filter((v: any) => v.experiential).length
  const deliveryCap = total - experiential

  const body = `
    ${msg === 'saved' ? '<div class="alert alert-success">✅ Vehicle saved successfully.</div>' : ''}
    ${msg === 'deleted' ? '<div class="alert alert-success">Vehicle removed from fleet.</div>' : ''}

    <!-- FLEET STATS -->
    <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
      <div class="stat-card stat-gold">
        <div class="stat-label">Total Fleet</div>
        <div class="stat-value">${total}</div>
        <div class="stat-sub">${deliveryCap} delivery · ${experiential} experiential</div>
      </div>
      <div class="stat-card stat-green">
        <div class="stat-label">Available</div>
        <div class="stat-value">${available}</div>
        <div class="stat-sub">Ready to allocate</div>
      </div>
      <div class="stat-card stat-warn">
        <div class="stat-label">Allocated</div>
        <div class="stat-value">${allocated}</div>
        <div class="stat-sub">On active jobs</div>
      </div>
      <div class="stat-card stat-danger">
        <div class="stat-label">Maintenance</div>
        <div class="stat-value">${maint}</div>
        <div class="stat-sub">Off-road</div>
      </div>
    </div>

    <!-- TONNAGE BREAKDOWN -->
    <div class="card" style="margin-bottom:20px">
      <div class="card-header">
        <span class="card-title">Fleet by Tonnage</span>
        <a href="/fleet/new" class="btn btn-gold btn-sm"><i class="fas fa-plus"></i> Add Vehicle</a>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        ${TONNAGE_OPTIONS.filter(t => tonnageCounts[t]).map(t =>
          `<div style="background:var(--bw-black);border:1px solid var(--bw-border);border-radius:8px;padding:10px 16px;text-align:center;min-width:80px">
            <div style="font-size:18px;font-weight:700;color:var(--bw-gold)">${tonnageCounts[t]}</div>
            <div style="font-size:11px;color:var(--bw-muted);text-transform:uppercase;letter-spacing:0.04em">${t}</div>
          </div>`).join('')}
      </div>
    </div>

    <!-- FLEET TABLE -->
    <div class="card">
      <div class="card-header">
        <span class="card-title">🚛 All Vehicles</span>
        <div style="display:flex;gap:8px">
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--bw-muted);cursor:pointer">
            <input type="checkbox" id="hideRetired" onchange="toggleRetired(this)"> Hide retired
          </label>
        </div>
      </div>
      <div class="table-wrap">
        <table id="fleetTable">
          <thead>
            <tr>
              <th>Reg #</th>
              <th>Vehicle</th>
              <th>Tonnage</th>
              <th class="hide-mobile">Colour</th>
              <th class="hide-mobile">Box (L × W × H)</th>
              <th class="text-right hide-mobile">Day Rate</th>
              <th class="text-right hide-mobile">Fuel</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="9" class="text-muted" style="text-align:center;padding:20px">No vehicles. <a href="/fleet/new" style="color:var(--bw-gold)">Add first vehicle</a></td></tr>'}</tbody>
        </table>
      </div>
    </div>

    <div class="alert alert-warn" style="font-size:12px">
      🎪 <strong>Experiential vehicles</strong> (Castle Lager truck FC89PNGP, V-Truck DM29KPGP) are tagged for brand activations only and are excluded from delivery / collection vehicle dropdowns.
    </div>

    <script>
      function toggleRetired(cb) {
        document.querySelectorAll('#fleetTable tbody tr').forEach(tr => {
          if (cb.checked && tr.textContent.includes('Retired')) tr.style.display = 'none'
          else tr.style.display = ''
        })
      }
    </script>
  `

  return c.html(layout('Fleet', body, user, 'fleet'))
})

// ── NEW VEHICLE FORM ─────────────────────────────────────────────────────
fleet.get('/new', (c) => {
  const user = c.get('user')
  return c.html(layout('Add Vehicle', vehicleForm(null), user, 'fleet'))
})

// ── EDIT VEHICLE FORM ────────────────────────────────────────────────────
fleet.get('/:id/edit', async (c) => {
  const user = c.get('user')
  const v = await c.env.DB.prepare('SELECT * FROM fleet WHERE id=?').bind(c.req.param('id')).first<any>()
  if (!v) return c.redirect('/fleet')
  return c.html(layout('Edit Vehicle', vehicleForm(v), user, 'fleet'))
})

// ── CREATE VEHICLE ───────────────────────────────────────────────────────
fleet.post('/new', async (c) => {
  const body = await c.req.parseBody()
  const L = numOrNull(body.box_length_m)
  const W = numOrNull(body.box_width_m)
  const H = numOrNull(body.box_height_m)
  const vol = (L && W && H) ? Math.round(L * W * H * 100) / 100 : null
  await c.env.DB.prepare(`
    INSERT INTO fleet
      (reg_number, description, model, tonnage, vehicle_type,
       box_length_m, box_width_m, box_height_m, box_volume_m3,
       colour, daily_hire_rate, fuel_rate_per_km, experiential, status, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    String(body.reg_number || '').trim(),
    String(body.description || '').trim(),
    String(body.model || '').trim() || null,
    String(body.tonnage || '').trim() || null,
    String(body.vehicle_type || 'truck').trim(),
    L, W, H, vol,
    String(body.colour || '').trim() || null,
    Number(body.daily_hire_rate) || 0,
    Number(body.fuel_rate_per_km) || 0,
    body.experiential === 'on' ? 1 : 0,
    String(body.status || 'available'),
    String(body.notes || '').trim() || null
  ).run()
  return c.redirect('/fleet?msg=saved')
})

// ── UPDATE VEHICLE ───────────────────────────────────────────────────────
fleet.post('/:id/edit', async (c) => {
  const body = await c.req.parseBody()
  const L = numOrNull(body.box_length_m)
  const W = numOrNull(body.box_width_m)
  const H = numOrNull(body.box_height_m)
  const vol = (L && W && H) ? Math.round(L * W * H * 100) / 100 : null
  await c.env.DB.prepare(`
    UPDATE fleet SET
      reg_number=?, description=?, model=?, tonnage=?, vehicle_type=?,
      box_length_m=?, box_width_m=?, box_height_m=?, box_volume_m3=?,
      colour=?, daily_hire_rate=?, fuel_rate_per_km=?, experiential=?,
      status=?, notes=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).bind(
    String(body.reg_number || '').trim(),
    String(body.description || '').trim(),
    String(body.model || '').trim() || null,
    String(body.tonnage || '').trim() || null,
    String(body.vehicle_type || 'truck').trim(),
    L, W, H, vol,
    String(body.colour || '').trim() || null,
    Number(body.daily_hire_rate) || 0,
    Number(body.fuel_rate_per_km) || 0,
    body.experiential === 'on' ? 1 : 0,
    String(body.status || 'available'),
    String(body.notes || '').trim() || null,
    c.req.param('id')
  ).run()
  return c.redirect('/fleet?msg=saved')
})

// ── QUICK STATUS CHANGE ──────────────────────────────────────────────────
fleet.post('/:id/status', async (c) => {
  const body = await c.req.parseBody()
  if (body.status) {
    await c.env.DB.prepare('UPDATE fleet SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .bind(body.status, c.req.param('id')).run()
  }
  return c.redirect('/fleet')
})

// ── SOFT-DELETE ──────────────────────────────────────────────────────────
fleet.post('/:id/delete', async (c) => {
  await c.env.DB.prepare('UPDATE fleet SET active=0, updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .bind(c.req.param('id')).run()
  return c.redirect('/fleet?msg=deleted')
})

// ── HELPERS ──────────────────────────────────────────────────────────────
function vehicleForm(v: any): string {
  const isEdit = !!v
  return `
    <div style="max-width:760px">
      <div style="margin-bottom:20px">
        <a href="/fleet" class="btn btn-outline btn-sm">← Back to Fleet</a>
      </div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">${isEdit ? `Edit — ${esc(v.reg_number)}` : 'Add New Vehicle'}</span>
        </div>
        <form method="POST" action="${isEdit ? `/fleet/${v.id}/edit` : '/fleet/new'}">
          <div class="form-grid">
            <div class="form-group">
              <label>Registration Number *</label>
              <input type="text" name="reg_number" value="${attr(v?.reg_number)}" placeholder="e.g. MB10JLGP" required>
            </div>
            <div class="form-group">
              <label>Status</label>
              <select name="status">
                ${STATUS_OPTIONS.map(s =>
                  `<option value="${s}" ${v?.status===s?'selected':''}>${s.charAt(0).toUpperCase()+s.slice(1)}</option>`
                ).join('')}
              </select>
            </div>

            <div class="form-group full">
              <label>Vehicle Name / Description *</label>
              <input type="text" name="description" value="${attr(v?.description)}" placeholder="e.g. ISUZU BAKKIE NO 1" required>
            </div>

            <div class="form-group full">
              <label>Model</label>
              <input type="text" name="model" value="${attr(v?.model)}" placeholder="e.g. ISUZU D-MAX 4JA1HP5318">
            </div>

            <div class="form-group">
              <label>Tonnage *</label>
              <select name="tonnage" required>
                <option value="">— select —</option>
                ${TONNAGE_OPTIONS.map(t =>
                  `<option value="${t}" ${v?.tonnage===t?'selected':''}>${t}</option>`
                ).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Vehicle Type *</label>
              <select name="vehicle_type" required>
                ${VEHICLE_TYPE_OPTS.map(([val,lbl]) =>
                  `<option value="${val}" ${v?.vehicle_type===val?'selected':''}>${lbl}</option>`
                ).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Colour</label>
              <select name="colour">
                <option value="">— select —</option>
                ${COLOUR_OPTIONS.map(col =>
                  `<option value="${col}" ${v?.colour===col?'selected':''}>${col}</option>`
                ).join('')}
              </select>
            </div>

            <div class="form-group full">
              <label style="display:flex;align-items:center;justify-content:space-between">
                <span>Cargo Box Dimensions (metres)</span>
                <span class="text-muted" style="font-size:11px;font-weight:400;text-transform:none;letter-spacing:0">Volume auto-calculated · leave blank if not applicable (sedans)</span>
              </label>
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
                <input type="number" name="box_length_m" value="${attr(v?.box_length_m)}" placeholder="L (m)" step="0.01" min="0">
                <input type="number" name="box_width_m"  value="${attr(v?.box_width_m)}"  placeholder="W (m)" step="0.01" min="0">
                <input type="number" name="box_height_m" value="${attr(v?.box_height_m)}" placeholder="H (m)" step="0.01" min="0">
              </div>
              ${v?.box_volume_m3 ? `<div class="text-muted" style="font-size:12px;margin-top:6px">Current volume: <strong style="color:var(--bw-gold)">${v.box_volume_m3} m³</strong></div>` : ''}
            </div>

            <div class="form-group">
              <label>Daily Hire Rate (R)</label>
              <input type="number" name="daily_hire_rate" value="${attr(v?.daily_hire_rate)}" placeholder="3500" min="0" step="50">
            </div>
            <div class="form-group">
              <label>Fuel Rate (R/km)</label>
              <input type="number" name="fuel_rate_per_km" value="${attr(v?.fuel_rate_per_km)}" placeholder="27.00" min="0" step="0.10">
            </div>

            <div class="form-group full">
              <label>Notes</label>
              <textarea name="notes" placeholder="Any notes about this vehicle…">${esc(v?.notes ?? '')}</textarea>
            </div>

            <div class="form-group full">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;text-transform:none;font-size:13px;background:rgba(168,85,247,0.08);padding:10px 14px;border-radius:8px;border:1px solid rgba(168,85,247,0.25)">
                <input type="checkbox" name="experiential" ${v?.experiential?'checked':''} style="width:auto">
                <span>🎪 <strong>Experiential / Brand Vehicle</strong> — used for activations only, will be excluded from delivery vehicle dropdowns</span>
              </label>
            </div>
          </div>
          <div style="margin-top:24px;display:flex;gap:10px">
            <button type="submit" class="btn btn-gold">
              ${isEdit ? '💾 Save Changes' : '➕ Add Vehicle'}
            </button>
            <a href="/fleet" class="btn btn-outline">Cancel</a>
            ${isEdit ? `<form method="POST" action="/fleet/${v.id}/delete" style="margin-left:auto">
              <button type="submit" class="btn btn-danger" onclick="return confirm('Remove this vehicle from fleet?')">Delete</button>
            </form>` : ''}
          </div>
        </form>
      </div>
    </div>`
}

function colourChip(colour: string | null): string {
  if (!colour) return '<span class="text-muted">—</span>'
  const swatch: Record<string, string> = {
    'White':            '#f5f5f5',
    'Black':            '#1a1a1a',
    'Blue':             '#3b82f6',
    'Red Castle Lager': '#dc2626',
    'Silver':           '#c0c0c0',
    'Grey':             '#6b7280',
  }
  const c = swatch[colour] || '#888'
  return `<span style="display:inline-flex;align-items:center;gap:6px;font-size:12px"><span style="width:12px;height:12px;border-radius:50%;background:${c};border:1px solid rgba(255,255,255,0.2);display:inline-block"></span>${esc(colour)}</span>`
}

function numOrNull(v: any): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return isFinite(n) && n > 0 ? n : null
}

function esc(s: any): string {
  if (s === null || s === undefined) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function attr(s: any): string {
  if (s === null || s === undefined) return ''
  return String(s).replace(/"/g, '&quot;')
}

export default fleet
