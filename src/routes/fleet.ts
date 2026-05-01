// Fleet management routes

import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth.js'
import { layout } from '../lib/layout.js'
import { formatZAR, formatDate, statusBadge } from '../lib/format.js'
import type { AuthUser } from '../lib/auth.js'

type Env = { Bindings: { DB: D1Database }; Variables: { user: AuthUser } }

const fleet = new Hono<Env>()
fleet.use('*', requireAuth)

// Fleet list
fleet.get('/', async (c) => {
  const user = c.get('user')
  const db = c.env.DB
  const msg = c.req.query('msg')

  const vehicles = await db.prepare(
    `SELECT * FROM fleet WHERE active=1 ORDER BY vehicle_type, reg_number`
  ).all<any>()

  const rows = vehicles.results.map((v: any) => `
    <tr>
      <td>
        <span class="font-mono" style="font-size:12px;color:var(--bw-gold)">${v.reg_number}</span>
        ${v.sab_restricted ? '<br><span class="badge badge-sab">SAB Only</span>' : ''}
      </td>
      <td>
        <div style="font-weight:500">${v.description}</div>
        <div class="text-muted" style="font-size:11px">${vehicleTypeLabel(v.vehicle_type)} · Class ${v.truck_class ?? '—'}</div>
      </td>
      <td class="text-right hide-mobile">${v.payload_kg ? (v.payload_kg/1000).toFixed(1)+'t' : '—'}</td>
      <td class="text-right hide-mobile">${formatZAR(v.daily_hire_rate ?? 0)}<span class="text-muted">/day</span></td>
      <td class="text-right hide-mobile">${v.fuel_rate_per_km ? 'R '+v.fuel_rate_per_km+'/km' : '—'}</td>
      <td>${statusBadge(v.status)}</td>
      <td class="hide-mobile text-muted" style="font-size:12px">${v.next_maintenance ? formatDate(v.next_maintenance) : '—'}</td>
      <td>
        <div style="display:flex;gap:6px">
          <a href="/fleet/${v.id}/edit" class="btn btn-outline btn-sm">Edit</a>
          <form method="POST" action="/fleet/${v.id}/status" style="display:inline">
            <select name="status" onchange="this.form.submit()" style="padding:4px 8px;font-size:12px;background:var(--bw-black);border:1px solid var(--bw-border2);border-radius:6px;color:var(--bw-white)">
              <option value="">Change…</option>
              <option value="available" ${v.status==='available'?'selected':''}>Available</option>
              <option value="allocated" ${v.status==='allocated'?'selected':''}>Allocated</option>
              <option value="maintenance" ${v.status==='maintenance'?'selected':''}>Maintenance</option>
              <option value="retired" ${v.status==='retired'?'selected':''}>Retired</option>
            </select>
          </form>
        </div>
      </td>
    </tr>`).join('')

  // Summary counts by type
  const types = vehicles.results.reduce((acc: any, v: any) => {
    acc[v.vehicle_type] = (acc[v.vehicle_type] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const available = vehicles.results.filter((v: any) => v.status === 'available').length
  const allocated = vehicles.results.filter((v: any) => v.status === 'allocated').length
  const maint     = vehicles.results.filter((v: any) => v.status === 'maintenance').length
  const sab       = vehicles.results.filter((v: any) => v.sab_restricted).length

  const body = `
    ${msg === 'saved' ? '<div class="alert alert-success">✅ Vehicle saved successfully.</div>' : ''}
    ${msg === 'deleted' ? '<div class="alert alert-success">Vehicle removed from fleet.</div>' : ''}

    <!-- FLEET STATS -->
    <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
      <div class="stat-card stat-gold">
        <div class="stat-label">Total Fleet</div>
        <div class="stat-value">${vehicles.results.length}</div>
        <div class="stat-sub">Active vehicles</div>
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
      <div class="stat-card">
        <div class="stat-label">SAB-Restricted</div>
        <div class="stat-value">${sab}</div>
        <div class="stat-sub">MAN truck only</div>
      </div>
    </div>

    <!-- FLEET BREAKDOWN -->
    <div class="card" style="margin-bottom:20px">
      <div class="card-header">
        <span class="card-title">Fleet Composition</span>
        <a href="/fleet/new" class="btn btn-gold btn-sm"><i class="fas fa-plus"></i> Add Vehicle</a>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        ${Object.entries(types).map(([type, count]) =>
          `<div style="background:var(--bw-black);border:1px solid var(--bw-border);border-radius:8px;padding:10px 16px;text-align:center">
            <div style="font-size:20px">${vehicleEmoji(type)}</div>
            <div style="font-size:18px;font-weight:700">${count}</div>
            <div style="font-size:11px;color:var(--bw-muted)">${vehicleTypeLabel(type)}</div>
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
              <th class="text-right hide-mobile">Payload</th>
              <th class="text-right hide-mobile">Day Rate</th>
              <th class="text-right hide-mobile">Fuel</th>
              <th>Status</th>
              <th class="hide-mobile">Next Maint.</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="8" class="text-muted" style="text-align:center;padding:20px">No vehicles. <a href="/fleet/new" style="color:var(--bw-gold)">Add first vehicle</a></td></tr>'}</tbody>
        </table>
      </div>
    </div>

    <div class="alert alert-warn" style="font-size:12px">
      🔒 <strong>MAN TGS — FC 89 PN GP</strong> is restricted to SAB events only and will never be auto-allocated to non-SAB jobs.
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

// New vehicle form
fleet.get('/new', (c) => {
  const user = c.get('user')
  return c.html(layout('Add Vehicle', vehicleForm(null), user, 'fleet'))
})

// Edit vehicle form
fleet.get('/:id/edit', async (c) => {
  const user = c.get('user')
  const v = await c.env.DB.prepare('SELECT * FROM fleet WHERE id=?').bind(c.req.param('id')).first<any>()
  if (!v) return c.redirect('/fleet')
  return c.html(layout('Edit Vehicle', vehicleForm(v), user, 'fleet'))
})

// Create vehicle
fleet.post('/new', async (c) => {
  const body = await c.req.parseBody()
  await c.env.DB.prepare(`
    INSERT INTO fleet (reg_number,description,vehicle_type,payload_kg,daily_hire_rate,fuel_rate_per_km,truck_class,sab_restricted,status,next_maintenance,replacement_horizon,notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    body.reg_number, body.description, body.vehicle_type,
    Number(body.payload_kg)||0, Number(body.daily_hire_rate)||0,
    Number(body.fuel_rate_per_km)||0, body.truck_class,
    body.sab_restricted === 'on' ? 1 : 0,
    body.status || 'available',
    body.next_maintenance || null, body.replacement_horizon || null, body.notes || null
  ).run()
  return c.redirect('/fleet?msg=saved')
})

// Update vehicle
fleet.post('/:id/edit', async (c) => {
  const body = await c.req.parseBody()
  await c.env.DB.prepare(`
    UPDATE fleet SET reg_number=?,description=?,vehicle_type=?,payload_kg=?,
    daily_hire_rate=?,fuel_rate_per_km=?,truck_class=?,sab_restricted=?,
    status=?,next_maintenance=?,replacement_horizon=?,notes=?
    WHERE id=?
  `).bind(
    body.reg_number, body.description, body.vehicle_type,
    Number(body.payload_kg)||0, Number(body.daily_hire_rate)||0,
    Number(body.fuel_rate_per_km)||0, body.truck_class,
    body.sab_restricted === 'on' ? 1 : 0,
    body.status,
    body.next_maintenance || null, body.replacement_horizon || null, body.notes || null,
    c.req.param('id')
  ).run()
  return c.redirect('/fleet?msg=saved')
})

// Quick status change
fleet.post('/:id/status', async (c) => {
  const body = await c.req.parseBody()
  if (body.status) {
    await c.env.DB.prepare('UPDATE fleet SET status=? WHERE id=?')
      .bind(body.status, c.req.param('id')).run()
  }
  return c.redirect('/fleet')
})

// Soft-delete
fleet.post('/:id/delete', async (c) => {
  await c.env.DB.prepare('UPDATE fleet SET active=0 WHERE id=?').bind(c.req.param('id')).run()
  return c.redirect('/fleet?msg=deleted')
})

// --- HELPERS ---
function vehicleForm(v: any): string {
  const isEdit = !!v
  return `
    <div style="max-width:720px">
      <div style="margin-bottom:20px">
        <a href="/fleet" class="btn btn-outline btn-sm">← Back to Fleet</a>
      </div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">${isEdit ? `Edit — ${v.reg_number}` : 'Add New Vehicle'}</span>
        </div>
        <form method="POST" action="${isEdit ? `/fleet/${v.id}/edit` : '/fleet/new'}">
          <div class="form-grid">
            <div class="form-group">
              <label>Registration Number *</label>
              <input type="text" name="reg_number" value="${v?.reg_number??''}" placeholder="e.g. BW 01 GP" required>
            </div>
            <div class="form-group">
              <label>Status</label>
              <select name="status">
                ${['available','allocated','maintenance','retired'].map(s =>
                  `<option value="${s}" ${v?.status===s?'selected':''}>${s.charAt(0).toUpperCase()+s.slice(1)}</option>`
                ).join('')}
              </select>
            </div>
            <div class="form-group full">
              <label>Description *</label>
              <input type="text" name="description" value="${v?.description??''}" placeholder="e.g. Isuzu NPR 400 4t Truck" required>
            </div>
            <div class="form-group">
              <label>Vehicle Type *</label>
              <select name="vehicle_type" required>
                ${[['bakkie','Bakkie'],['4t','4t Truck'],['8t','8t Truck'],['10t','10t Truck'],['trailer','Trailer'],['other','Other']].map(([val,lbl]) =>
                  `<option value="${val}" ${v?.vehicle_type===val?'selected':''}>${lbl}</option>`
                ).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Load Class</label>
              <select name="truck_class">
                ${['L1','L2','L3','L4','any'].map(cls =>
                  `<option value="${cls}" ${v?.truck_class===cls?'selected':''}>${cls}</option>`
                ).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Payload (kg)</label>
              <input type="number" name="payload_kg" value="${v?.payload_kg??''}" placeholder="4000" min="0">
            </div>
            <div class="form-group">
              <label>Daily Hire Rate (R)</label>
              <input type="number" name="daily_hire_rate" value="${v?.daily_hire_rate??''}" placeholder="1800" min="0" step="50">
            </div>
            <div class="form-group">
              <label>Fuel Rate (R/km)</label>
              <input type="number" name="fuel_rate_per_km" value="${v?.fuel_rate_per_km??''}" placeholder="3.20" min="0" step="0.10">
            </div>
            <div class="form-group">
              <label>Next Maintenance</label>
              <input type="date" name="next_maintenance" value="${v?.next_maintenance??''}">
            </div>
            <div class="form-group">
              <label>Replacement Horizon</label>
              <input type="date" name="replacement_horizon" value="${v?.replacement_horizon??''}">
            </div>
            <div class="form-group full">
              <label>Notes</label>
              <textarea name="notes" placeholder="Any notes about this vehicle…">${v?.notes??''}</textarea>
            </div>
            <div class="form-group full">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;text-transform:none;font-size:13px">
                <input type="checkbox" name="sab_restricted" ${v?.sab_restricted?'checked':''} style="width:auto">
                <span>🔒 SAB-Restricted — this vehicle can ONLY be allocated to SAB events</span>
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

function vehicleTypeLabel(t: string): string {
  const m: Record<string,string> = { bakkie:'Bakkie', '4t':'4t Truck', '8t':'8t Truck', '10t':'10t Truck', trailer:'Trailer', other:'Other' }
  return m[t] ?? t
}

function vehicleEmoji(t: string): string {
  const m: Record<string,string> = { bakkie:'🛻', '4t':'🚛', '8t':'🚚', '10t':'🏗', trailer:'⛟', other:'🚗' }
  return m[t] ?? '🚗'
}

export default fleet
