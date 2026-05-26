// Admin routes — User Management (Founder only)

import { Hono } from 'hono'
import * as XLSX from 'xlsx/xlsx.mjs'
import { layout } from '../lib/layout.js'
import { can, hashPassword } from '../lib/auth.js'
import type { AuthUser } from '../lib/auth.js'

type Env = { Bindings: { DB: D1Database } }
type Variables = { user: AuthUser }

const admin = new Hono<{ Bindings: Env['Bindings']; Variables: Variables }>()

// ── Guard: founder only ────────────────────────────────────────────────────
admin.use('*', async (c, next) => {
  const user = c.get('user')
  if (!user || !can(user, 'manageUsers')) {
    return c.html('<p style="color:red;font-family:sans-serif;padding:40px">Access denied.</p>', 403)
  }
  await next()
})

// ── ROLE LABELS ────────────────────────────────────────────────────────────
const ROLE_OPTIONS = [
  { value: 'founder',          label: 'Founder' },
  { value: 'ops_director',     label: 'Operations Director' },
  { value: 'finance_director', label: 'Financial Director' },
  { value: 'account_director', label: 'Account Director' },
  { value: 'crew',             label: 'Crew (Read-only)' },
]

const ROLE_COLORS: Record<string, string> = {
  founder:          'badge-gold',
  ops_director:     'badge-blue',
  finance_director: 'badge-purple',
  account_director: 'badge-green',
  crew:             'badge-grey',
}

// ── LIST USERS ─────────────────────────────────────────────────────────────
admin.get('/', async (c) => {
  const user = c.get('user')
  const msg  = c.req.query('msg') ?? ''
  const err  = c.req.query('err') ?? ''

  const rows = await c.env.DB.prepare(
    'SELECT id, email, name, role, active, created_at FROM users ORDER BY active DESC, id ASC'
  ).all<{ id: number; email: string; name: string; role: string; active: number; created_at: string }>()

  const users = rows.results ?? []

  const roleSelect = (selected = '') => ROLE_OPTIONS.map(r =>
    `<option value="${r.value}" ${selected === r.value ? 'selected' : ''}>${r.label}</option>`
  ).join('')

  const rows_html = users.map(u => {
    const isSelf = u.id === user.id
    const roleColor = ROLE_COLORS[u.role] ?? 'badge-grey'
    return `
    <tr class="${u.active ? '' : 'row-inactive'}">
      <td>
        <div class="user-cell">
          <div class="user-avatar-sm">${u.name.charAt(0).toUpperCase()}</div>
          <div>
            <div class="user-full-name">${esc(u.name)}${isSelf ? ' <span class="you-tag">YOU</span>' : ''}</div>
            <div class="user-email-sm">${esc(u.email)}</div>
          </div>
        </div>
      </td>
      <td><span class="badge ${roleColor}">${ROLE_OPTIONS.find(r => r.value === u.role)?.label ?? u.role}</span></td>
      <td>
        <span class="status-dot ${u.active ? 'dot-green' : 'dot-grey'}"></span>
        ${u.active ? 'Active' : 'Suspended'}
      </td>
      <td class="muted" style="font-size:11px">${u.created_at ? u.created_at.split('T')[0] : '—'}</td>
      <td>
        <div class="action-group">
          <button class="btn btn-outline btn-sm" onclick="openEdit(${u.id}, '${esc(u.name)}', '${esc(u.email)}', '${u.role}', ${u.active})">
            <i class="fas fa-pen"></i> Edit
          </button>
          ${u.active && !isSelf ? `
          <form method="POST" action="/admin/users/${u.id}/suspend" onsubmit="return confirm('Suspend ${esc(u.name)}?')">
            <button type="submit" class="btn btn-sm" style="background:rgba(245,158,11,0.15);color:#f59e0b;border:1px solid #f59e0b">
              <i class="fas fa-pause"></i> Suspend
            </button>
          </form>` : ''}
          ${!u.active ? `
          <form method="POST" action="/admin/users/${u.id}/activate">
            <button type="submit" class="btn btn-success btn-sm">
              <i class="fas fa-play"></i> Activate
            </button>
          </form>` : ''}
          ${!isSelf ? `
          <form method="POST" action="/admin/users/${u.id}/delete" onsubmit="return confirm('Permanently delete ${esc(u.name)}? This cannot be undone.')">
            <button type="submit" class="btn btn-danger btn-sm">
              <i class="fas fa-trash"></i>
            </button>
          </form>` : ''}
        </div>
      </td>
    </tr>`
  }).join('')

  const body = `
    ${msg ? `<div class="alert alert-success"><i class="fas fa-check-circle"></i> ${esc(msg)}</div>` : ''}
    ${err ? `<div class="alert alert-error"><i class="fas fa-exclamation-triangle"></i> ${esc(err)}</div>` : ''}

    <div class="card">
      <div class="card-header">
        <span class="card-title"><i class="fas fa-users" style="color:var(--gold)"></i> &nbsp;System Users</span>
        <button class="btn btn-gold btn-sm" onclick="openAdd()">
          <i class="fas fa-user-plus"></i> Add User
        </button>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Status</th>
              <th>Added</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>${rows_html}</tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title"><i class="fas fa-file-export" style="color:var(--gold)"></i> &nbsp;Export Data (.xlsx)</span>
      </div>
      <div style="padding:14px 4px;color:var(--muted);font-size:13px;line-height:1.6">
        Download the full contents of each table as an Excel workbook. Headers match the database columns 1:1, so future imports can use the same format.
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;padding:0 4px 8px">
        <a href="/admin/export/clients.xlsx" class="btn btn-outline btn-sm">
          <i class="fas fa-building"></i> Clients
        </a>
        <a href="/admin/export/events.xlsx" class="btn btn-outline btn-sm">
          <i class="fas fa-calendar-day"></i> Events
        </a>
        <a href="/admin/export/quotes.xlsx" class="btn btn-outline btn-sm">
          <i class="fas fa-file-invoice-dollar"></i> Quotes (with line items)
        </a>
        <a href="/admin/export/rate-card.xlsx" class="btn btn-outline btn-sm">
          <i class="fas fa-list-ol"></i> Rate Card
        </a>
        <a href="/admin/export/fleet.xlsx" class="btn btn-outline btn-sm">
          <i class="fas fa-truck"></i> Fleet
        </a>
        <a href="/admin/export/all.xlsx" class="btn btn-gold btn-sm">
          <i class="fas fa-file-zipper"></i> Everything (one file)
        </a>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title"><i class="fas fa-database" style="color:var(--gold)"></i> &nbsp;Database Backups</span>
        <a href="/admin/backup" class="btn btn-outline btn-sm">
          <i class="fas fa-arrow-right"></i> Open backups
        </a>
      </div>
      <div style="padding:14px 4px;color:var(--muted);font-size:13px;line-height:1.6">
        Weekly automatic snapshots of the full database to R2 (gzipped JSON). Runs Sunday 02:00 SAST. Manual runs allowed from the backups page.
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title"><i class="fas fa-screwdriver-wrench" style="color:var(--gold)"></i> &nbsp;Repair Contacts</span>
        <a href="/admin/repair-contacts" class="btn btn-outline btn-sm">
          <i class="fas fa-arrow-right"></i> Manage contacts
        </a>
      </div>
      <div style="padding:14px 4px;color:var(--muted);font-size:13px;line-height:1.6">
        People who get auto-suggested as WhatsApp recipients on Repair Notes (e.g. Takavaudza). Add mechanics, panel beaters, electricians, etc. Mark one as primary per role.
      </div>
    </div>

    <div class="card card-glow">
      <div class="card-title" style="margin-bottom:12px"><i class="fas fa-shield-halved" style="color:var(--gold)"></i> &nbsp;Role Permissions</div>
      <div class="perm-grid">
        <div class="perm-row perm-header">
          <div>Permission</div>
          <div style="text-align:center">Founder</div>
          <div style="text-align:center">Ops Director</div>
          <div style="text-align:center">Finance Director</div>
          <div style="text-align:center">Account Director</div>
          <div style="text-align:center">Crew</div>
        </div>
        ${permRow('Dashboard & Stats',     [1,0,1,0,0])}
        ${permRow('Events (CRUD)',         [1,1,1,1,0])}
        ${permRow('Quotes (create/edit)',  [1,1,1,1,0])}
        ${permRow('Quotes (client view)',  [1,1,1,1,0])}
        ${permRow('Cost Build & Margins',  [1,0,1,0,0])}
        ${permRow('Fleet (CRUD)',          [1,1,0,0,0])}
        ${permRow('Suppliers (CRUD)',      [1,1,1,0,0])}
        ${permRow('Rate Card (CRUD)',      [1,1,1,0,0])}
        ${permRow('Clients (CRUD)',        [1,1,1,1,0])}
        ${permRow('User Management',       [1,0,0,0,0])}
        ${permRow('Schedule View',         [1,1,1,1,1])}
      </div>
    </div>

    <!-- ADD / EDIT MODAL -->
    <div id="modal-overlay" class="modal-overlay" onclick="closeModal(event)" style="display:none">
      <div class="modal-box" onclick="event.stopPropagation()">
        <div class="modal-header">
          <span id="modal-title" class="modal-title">Add User</span>
          <button class="modal-close" onclick="closeModalDirect()"><i class="fas fa-times"></i></button>
        </div>
        <form id="user-form" method="POST" action="/admin/users/create">
          <input type="hidden" id="form-user-id" name="user_id" value="">

          <div class="form-grid" style="gap:14px">
            <div class="form-group">
              <label>Full Name *</label>
              <input type="text" id="f-name" name="name" required placeholder="e.g. Brian Ndlovu" maxlength="80">
            </div>
            <div class="form-group">
              <label>Email Address *</label>
              <input type="email" id="f-email" name="email" required placeholder="user@bwproductions.co.za">
            </div>
            <div class="form-group">
              <label>Role *</label>
              <select id="f-role" name="role" required>
                ${roleSelect()}
              </select>
            </div>
            <div class="form-group" id="password-group">
              <label id="password-label">Password *</label>
              <div style="position:relative">
                <input type="password" id="f-password" name="password" placeholder="Minimum 8 characters" style="padding-right:40px">
                <button type="button" onclick="togglePwd()" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--bw-muted);cursor:pointer;font-size:14px" id="eye-btn">
                  <i class="fas fa-eye" id="eye-icon"></i>
                </button>
              </div>
              <div id="pwd-hint" style="font-size:11px;color:var(--bw-muted);margin-top:4px">Leave blank to keep current password (when editing)</div>
            </div>
            <div class="form-group" id="active-group" style="display:none">
              <label>Status</label>
              <select id="f-active" name="active">
                <option value="1">Active</option>
                <option value="0">Suspended</option>
              </select>
            </div>
          </div>

          <div style="display:flex;gap:10px;margin-top:20px;justify-content:flex-end">
            <button type="button" class="btn btn-outline" onclick="closeModalDirect()">Cancel</button>
            <button type="submit" class="btn btn-gold" id="form-submit-btn">
              <i class="fas fa-user-plus"></i> <span id="form-submit-label">Add User</span>
            </button>
          </div>
        </form>
      </div>
    </div>

    <style>
      .user-cell { display:flex; align-items:center; gap:10px; }
      .user-avatar-sm {
        width:34px; height:34px; border-radius:50%;
        background:linear-gradient(135deg,var(--magenta),var(--blue-flame)); color:#fff;
        display:flex; align-items:center; justify-content:center;
        font-weight:700; font-size:14px; flex-shrink:0;
        box-shadow:0 0 10px rgba(204,24,232,0.3);
      }
      .user-full-name { font-weight:600; font-size:13px; }
      .user-email-sm { font-size:11px; color:var(--bw-muted); }
      .you-tag {
        background:linear-gradient(135deg,var(--gold-dk),var(--gold-lt)); color:#000;
        font-size:9px; font-weight:800; padding:1px 5px;
        border-radius:4px; vertical-align:middle; margin-left:4px;
        letter-spacing:0.05em;
      }
      .row-inactive td { opacity:0.45; }
      .row-inactive:hover td { opacity:0.65; }
      .status-dot { display:inline-block; width:7px; height:7px; border-radius:50%; margin-right:5px; vertical-align:middle; }
      .dot-green { background:var(--success); box-shadow:0 0 6px var(--success); }
      .dot-grey  { background:#555; }
      .action-group { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
      .badge-blue   { background:rgba(59,130,246,0.15); color:#60a5fa; border:1px solid #3b82f6; }
      .badge-purple { background:rgba(139,92,246,0.15); color:#a78bfa; border:1px solid #8b5cf6; }
      .badge-green  { background:rgba(16,185,129,0.15); color:#34d399; border:1px solid #10b981; }
      .badge-grey   { background:rgba(107,114,128,0.15); color:#9ca3af; border:1px solid #6b7280; }

      /* PERMISSIONS TABLE */
      .perm-grid { display:flex; flex-direction:column; gap:0; font-size:12px; }
      .perm-row { display:grid; grid-template-columns:2fr 1fr 1fr 1fr 1fr 1fr; gap:0; padding:9px 12px; border-bottom:1px solid var(--navy-border); align-items:center; }
      .perm-row:last-child { border-bottom:none; }
      .perm-header { font-size:10px; font-weight:600; color:var(--muted); text-transform:uppercase; letter-spacing:0.06em; background:rgba(255,255,255,0.02); border-radius:6px 6px 0 0; }
      .perm-check { text-align:center; }
      .tick { color:var(--success); font-size:13px; }
      .cross { color:var(--navy-border); font-size:13px; }

      /* MODAL */
      .modal-overlay {
        position:fixed; inset:0; background:rgba(0,0,0,0.75);
        backdrop-filter:blur(4px);
        z-index:500; display:flex; align-items:center; justify-content:center; padding:20px;
      }
      .modal-box {
        background:var(--navy-card); border:1px solid var(--navy-border);
        border-radius:14px; padding:28px; width:100%; max-width:520px;
        box-shadow:0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(201,168,76,0.05);
        position:relative; overflow:hidden;
      }
      .modal-box::before {
        content:''; display:block; height:2px;
        background:linear-gradient(90deg,transparent,var(--magenta),var(--orange),var(--gold),var(--cyan),transparent);
        position:absolute; top:0; left:0; right:0;
      }
      .modal-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:20px; }
      .modal-title { font-size:16px; font-weight:700; color:var(--white); font-family:'Cinzel',serif; }
      .modal-close { background:none; border:none; color:var(--muted); font-size:18px; cursor:pointer; padding:4px; transition:color 0.15s; }
      .modal-close:hover { color:var(--danger); }
    </style>

    <script>
      function openAdd() {
        document.getElementById('modal-title').textContent = 'Add New User'
        document.getElementById('form-submit-label').textContent = 'Add User'
        document.getElementById('user-form').action = '/admin/users/create'
        document.getElementById('form-user-id').value = ''
        document.getElementById('f-name').value = ''
        document.getElementById('f-email').value = ''
        document.getElementById('f-role').value = 'ops_director'
        document.getElementById('f-password').value = ''
        document.getElementById('f-password').required = true
        document.getElementById('pwd-hint').style.display = 'none'
        document.getElementById('active-group').style.display = 'none'
        document.getElementById('modal-overlay').style.display = 'flex'
        setTimeout(() => document.getElementById('f-name').focus(), 50)
      }

      function openEdit(id, name, email, role, active) {
        document.getElementById('modal-title').textContent = 'Edit User'
        document.getElementById('form-submit-label').textContent = 'Save Changes'
        document.getElementById('user-form').action = '/admin/users/' + id + '/edit'
        document.getElementById('form-user-id').value = id
        document.getElementById('f-name').value = name
        document.getElementById('f-email').value = email
        document.getElementById('f-role').value = role
        document.getElementById('f-password').value = ''
        document.getElementById('f-password').required = false
        document.getElementById('pwd-hint').style.display = 'block'
        document.getElementById('f-active').value = active ? '1' : '0'
        document.getElementById('active-group').style.display = 'flex'
        document.getElementById('modal-overlay').style.display = 'flex'
        setTimeout(() => document.getElementById('f-name').focus(), 50)
      }

      function closeModal(e) {
        if (e.target === document.getElementById('modal-overlay')) closeModalDirect()
      }

      function closeModalDirect() {
        document.getElementById('modal-overlay').style.display = 'none'
      }

      function togglePwd() {
        const input = document.getElementById('f-password')
        const icon  = document.getElementById('eye-icon')
        if (input.type === 'password') {
          input.type = 'text'
          icon.className = 'fas fa-eye-slash'
        } else {
          input.type = 'password'
          icon.className = 'fas fa-eye'
        }
      }

      // Close modal on Escape
      document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModalDirect() })
    </script>
  `

  return c.html(layout('User Management', body, user, 'admin'))
})

// ── CREATE USER ─────────────────────────────────────────────────────────────
admin.post('/users/create', async (c) => {
  const body = await c.req.parseBody()
  const name     = String(body.name ?? '').trim()
  const email    = String(body.email ?? '').toLowerCase().trim()
  const role     = String(body.role ?? 'crew')
  const password = String(body.password ?? '')

  if (!name || !email || !password) return c.redirect('/admin?err=Name, email and password are required')
  if (password.length < 8)          return c.redirect('/admin?err=Password must be at least 8 characters')

  const validRoles = ['founder','ops_director','finance_director','account_director','crew']
  if (!validRoles.includes(role))   return c.redirect('/admin?err=Invalid role selected')

  // Check duplicate email
  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()
  if (existing)                      return c.redirect(`/admin?err=Email ${email} is already in use`)

  const hash = await hashPassword(password)
  await c.env.DB.prepare(
    'INSERT INTO users (email, name, role, password_hash, active) VALUES (?, ?, ?, ?, 1)'
  ).bind(email, name, role, hash).run()

  return c.redirect(`/admin?msg=User ${name} created successfully`)
})

// ── EDIT USER ───────────────────────────────────────────────────────────────
admin.post('/users/:id/edit', async (c) => {
  const id       = Number(c.req.param('id'))
  const body     = await c.req.parseBody()
  const name     = String(body.name ?? '').trim()
  const email    = String(body.email ?? '').toLowerCase().trim()
  const role     = String(body.role ?? 'crew')
  const active   = body.active === '1' ? 1 : 0
  const password = String(body.password ?? '')

  const currentUser = c.get('user')

  if (!name || !email) return c.redirect('/admin?err=Name and email are required')

  const validRoles = ['founder','ops_director','finance_director','account_director','crew']
  if (!validRoles.includes(role)) return c.redirect('/admin?err=Invalid role selected')

  // Prevent self-demotion or self-suspension
  if (id === currentUser.id) {
    if (active === 0) return c.redirect('/admin?err=You cannot suspend your own account')
    if (role !== 'founder') return c.redirect('/admin?err=You cannot change your own role')
  }

  // Check duplicate email (exclude self)
  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ? AND id != ?').bind(email, id).first()
  if (existing) return c.redirect(`/admin?err=Email ${email} is already in use by another user`)

  if (password && password.length < 8) return c.redirect('/admin?err=Password must be at least 8 characters')

  if (password) {
    const hash = await hashPassword(password)
    await c.env.DB.prepare(
      'UPDATE users SET name = ?, email = ?, role = ?, active = ?, password_hash = ? WHERE id = ?'
    ).bind(name, email, role, active, hash, id).run()
  } else {
    await c.env.DB.prepare(
      'UPDATE users SET name = ?, email = ?, role = ?, active = ? WHERE id = ?'
    ).bind(name, email, role, active, id).run()
  }

  return c.redirect(`/admin?msg=User ${name} updated successfully`)
})

// ── SUSPEND ─────────────────────────────────────────────────────────────────
admin.post('/users/:id/suspend', async (c) => {
  const id          = Number(c.req.param('id'))
  const currentUser = c.get('user')
  if (id === currentUser.id) return c.redirect('/admin?err=You cannot suspend your own account')
  const row = await c.env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(id).first<{ name: string }>()
  await c.env.DB.prepare('UPDATE users SET active = 0 WHERE id = ?').bind(id).run()
  return c.redirect(`/admin?msg=${row?.name ?? 'User'} has been suspended`)
})

// ── ACTIVATE ─────────────────────────────────────────────────────────────────
admin.post('/users/:id/activate', async (c) => {
  const id  = Number(c.req.param('id'))
  const row = await c.env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(id).first<{ name: string }>()
  await c.env.DB.prepare('UPDATE users SET active = 1 WHERE id = ?').bind(id).run()
  return c.redirect(`/admin?msg=${row?.name ?? 'User'} has been activated`)
})

// ── DELETE ──────────────────────────────────────────────────────────────────
admin.post('/users/:id/delete', async (c) => {
  const id          = Number(c.req.param('id'))
  const currentUser = c.get('user')
  if (id === currentUser.id) return c.redirect('/admin?err=You cannot delete your own account')
  const row = await c.env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(id).first<{ name: string }>()
  await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run()
  return c.redirect(`/admin?msg=${row?.name ?? 'User'} has been permanently deleted`)
})

// ── HELPERS ──────────────────────────────────────────────────────────────────
function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function permRow(label: string, perms: number[]): string {
  const cells = perms.map(p =>
    `<div class="perm-check">${p ? '<i class="fas fa-check tick"></i>' : '<i class="fas fa-times cross"></i>'}</div>`
  ).join('')
  return `<div class="perm-row"><div>${label}</div>${cells}</div>`
}

// ─── XLSX EXPORT HELPERS ────────────────────────────────────────────────────
function rowsToSheet(rows: any[], sheetName: string): XLSX.WorkSheet {
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ note: 'No data' }])
  // Auto-size columns based on header + content lengths (capped at 60)
  const headers = rows.length ? Object.keys(rows[0]) : ['note']
  ws['!cols'] = headers.map(h => {
    const maxLen = rows.reduce((m, r) => Math.max(m, String(r[h] ?? '').length), h.length)
    return { wch: Math.min(60, Math.max(10, maxLen + 2)) }
  })
  return ws
}

function workbookResponse(wb: XLSX.WorkBook, filename: string): Response {
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store'
    }
  })
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

// ─── EXPORTS ────────────────────────────────────────────────────────────────

admin.get('/export/clients.xlsx', async (c) => {
  const rs = await c.env.DB.prepare(
    `SELECT id, name, type, vat_number, reg_number, payment_terms, credit_limit,
            contact_primary, contact_email, contact_phone, billing_address, notes,
            active, created_at
     FROM clients ORDER BY id`
  ).all<any>()
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, rowsToSheet(rs.results || [], 'Clients'), 'Clients')
  return workbookResponse(wb, `bw-clients-${dateStamp()}.xlsx`)
})

admin.get('/export/events.xlsx', async (c) => {
  const rs = await c.env.DB.prepare(
    `SELECT e.id, e.name, e.event_date, c.name AS client_name, e.client_id,
            e.venue, e.venue_city, e.pax, e.status, e.is_sab_event, e.notes,
            e.created_by, e.created_at, e.updated_at
     FROM events e
     LEFT JOIN clients c ON c.id = e.client_id
     ORDER BY e.event_date DESC, e.id DESC`
  ).all<any>()
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, rowsToSheet(rs.results || [], 'Events'), 'Events')
  return workbookResponse(wb, `bw-events-${dateStamp()}.xlsx`)
})

admin.get('/export/quotes.xlsx', async (c) => {
  // Quotes summary
  const quotes = await c.env.DB.prepare(
    `SELECT q.id, q.quote_number, q.version, q.status,
            e.name AS event_name, e.event_date, c.name AS client_name,
            q.event_id, q.load_class, q.fleet_id,
            q.subtotal, q.disbursement_multiplier, q.disbursement_amount,
            q.vat_rate, q.vat_amount, q.total,
            q.internal_cost, q.margin, q.notes, q.terms,
            q.created_by, q.created_at, q.updated_at
     FROM quotes q
     LEFT JOIN events e  ON e.id = q.event_id
     LEFT JOIN clients c ON c.id = e.client_id
     ORDER BY q.id DESC`
  ).all<any>()

  // Line items
  const lines = await c.env.DB.prepare(
    `SELECT qli.id, qli.quote_id, q.quote_number,
            qli.category, qli.description, qli.unit, qli.quantity,
            qli.unit_rate, qli.line_total,
            qli.is_setup, qli.is_strike,
            qli.supplier_id, qli.cost_rate, qli.cost_total,
            qli.visible_to_client, qli.sort_order,
            qli.rate_card_id
     FROM quote_line_items qli
     LEFT JOIN quotes q ON q.id = qli.quote_id
     ORDER BY qli.quote_id, qli.sort_order, qli.id`
  ).all<any>()

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, rowsToSheet(quotes.results || [], 'Quotes'), 'Quotes')
  XLSX.utils.book_append_sheet(wb, rowsToSheet(lines.results || [], 'LineItems'), 'LineItems')
  return workbookResponse(wb, `bw-quotes-${dateStamp()}.xlsx`)
})

admin.get('/export/rate-card.xlsx', async (c) => {
  const rs = await c.env.DB.prepare(
    `SELECT rc.id, rc.category, rc.line_item, rc.unit,
            rc.base_rate, rc.discount_pct, rc.effective_rate,
            rc.supplier_id, s.name AS supplier_name,
            rc.load_class, rc.notes, rc.active, rc.updated_at
     FROM rate_card rc
     LEFT JOIN suppliers s ON s.id = rc.supplier_id
     ORDER BY rc.category, rc.line_item`
  ).all<any>()
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, rowsToSheet(rs.results || [], 'RateCard'), 'RateCard')
  return workbookResponse(wb, `bw-rate-card-${dateStamp()}.xlsx`)
})

admin.get('/export/fleet.xlsx', async (c) => {
  const rs = await c.env.DB.prepare(
    `SELECT id, reg_number, description, model, tonnage, vehicle_type,
            box_length_m, box_width_m, box_height_m, box_volume_m3,
            colour, daily_hire_rate, fuel_rate_per_km,
            experiential, status, notes, active, created_at, updated_at
     FROM fleet
     ORDER BY experiential, vehicle_type, reg_number`
  ).all<any>()
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, rowsToSheet(rs.results || [], 'Fleet'), 'Fleet')
  return workbookResponse(wb, `bw-fleet-${dateStamp()}.xlsx`)
})

admin.get('/export/all.xlsx', async (c) => {
  const [clients, events, quotes, lines, rateCard, fleet] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id, name, type, vat_number, reg_number, payment_terms, credit_limit,
              contact_primary, contact_email, contact_phone, billing_address, notes,
              active, created_at
       FROM clients ORDER BY id`
    ).all<any>(),
    c.env.DB.prepare(
      `SELECT e.id, e.name, e.event_date, c.name AS client_name, e.client_id,
              e.venue, e.venue_city, e.pax, e.status, e.is_sab_event, e.notes,
              e.created_by, e.created_at, e.updated_at
       FROM events e LEFT JOIN clients c ON c.id = e.client_id
       ORDER BY e.event_date DESC, e.id DESC`
    ).all<any>(),
    c.env.DB.prepare(
      `SELECT q.id, q.quote_number, q.version, q.status,
              e.name AS event_name, e.event_date, c.name AS client_name,
              q.event_id, q.load_class, q.fleet_id,
              q.subtotal, q.disbursement_multiplier, q.disbursement_amount,
              q.vat_rate, q.vat_amount, q.total,
              q.internal_cost, q.margin, q.notes, q.terms,
              q.created_by, q.created_at, q.updated_at
       FROM quotes q
       LEFT JOIN events e  ON e.id = q.event_id
       LEFT JOIN clients c ON c.id = e.client_id
       ORDER BY q.id DESC`
    ).all<any>(),
    c.env.DB.prepare(
      `SELECT qli.id, qli.quote_id, q.quote_number,
              qli.category, qli.description, qli.unit, qli.quantity,
              qli.unit_rate, qli.line_total,
              qli.is_setup, qli.is_strike,
              qli.supplier_id, qli.cost_rate, qli.cost_total,
              qli.visible_to_client, qli.sort_order, qli.rate_card_id
       FROM quote_line_items qli
       LEFT JOIN quotes q ON q.id = qli.quote_id
       ORDER BY qli.quote_id, qli.sort_order, qli.id`
    ).all<any>(),
    c.env.DB.prepare(
      `SELECT rc.id, rc.category, rc.line_item, rc.unit,
              rc.base_rate, rc.discount_pct, rc.effective_rate,
              rc.supplier_id, s.name AS supplier_name,
              rc.load_class, rc.notes, rc.active, rc.updated_at
       FROM rate_card rc
       LEFT JOIN suppliers s ON s.id = rc.supplier_id
       ORDER BY rc.category, rc.line_item`
    ).all<any>(),
    c.env.DB.prepare(
      `SELECT id, reg_number, description, model, tonnage, vehicle_type,
              box_length_m, box_width_m, box_height_m, box_volume_m3,
              colour, daily_hire_rate, fuel_rate_per_km,
              experiential, status, notes, active, created_at, updated_at
       FROM fleet
       ORDER BY experiential, vehicle_type, reg_number`
    ).all<any>(),
  ])

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, rowsToSheet(clients.results  || [], 'Clients'),   'Clients')
  XLSX.utils.book_append_sheet(wb, rowsToSheet(events.results   || [], 'Events'),    'Events')
  XLSX.utils.book_append_sheet(wb, rowsToSheet(quotes.results   || [], 'Quotes'),    'Quotes')
  XLSX.utils.book_append_sheet(wb, rowsToSheet(lines.results    || [], 'LineItems'), 'LineItems')
  XLSX.utils.book_append_sheet(wb, rowsToSheet(rateCard.results || [], 'RateCard'),  'RateCard')
  XLSX.utils.book_append_sheet(wb, rowsToSheet(fleet.results    || [], 'Fleet'),     'Fleet')
  return workbookResponse(wb, `bw-full-export-${dateStamp()}.xlsx`)
})

// ─── BACKUPS ──────────────────────────────────────────────────────────────
// Weekly automatic D1 → R2 backup. Also accessible here for ad-hoc runs.
// Founder-only (already enforced by admin.use('*', …) guard at the top).
import { runBackup, listBackups } from '../lib/backup.js'

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', hour12: false })
  } catch { return iso }
}

admin.get('/backup', async (c) => {
  const user = c.get('user')
  const msg  = c.req.query('msg') ?? ''
  const err  = c.req.query('err') ?? ''

  let backups: any[] = []
  let listErr = ''
  try {
    backups = await listBackups(c.env as any, 100)
  } catch (e: any) {
    listErr = e?.message || String(e)
  }

  const rows = backups.length === 0
    ? `<tr><td colspan="4" style="padding:24px;text-align:center;color:#6b7589">No backups yet. Run one now ↓</td></tr>`
    : backups.map(b => `
        <tr>
          <td style="padding:10px;border-bottom:1px solid #1f2530;font-family:monospace;font-size:12px">${b.key}</td>
          <td style="padding:10px;border-bottom:1px solid #1f2530">${fmtDate(b.uploaded)}</td>
          <td style="padding:10px;border-bottom:1px solid #1f2530">${fmtBytes(b.size)}</td>
          <td style="padding:10px;border-bottom:1px solid #1f2530;font-size:11px;color:#6b7589">
            ${b.metadata.total_rows ? `${b.metadata.total_rows} rows` : ''}
            ${b.metadata.table_count ? ` · ${b.metadata.table_count} tables` : ''}
          </td>
        </tr>`).join('')

  const body = `
    <div style="max-width:1100px;margin:0 auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
        <div>
          <h1 style="font-family:Cinzel,serif;font-size:24px;font-weight:900;background:linear-gradient(135deg,#B67A3A,#F0D080,#D39A52);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin:0">Database Backups</h1>
          <p style="color:#6b7589;font-size:13px;margin-top:6px">Weekly automatic backup runs Sunday 02:00 SAST. Manual runs allowed below.</p>
        </div>
        <a href="/admin" style="color:#C9A84C;text-decoration:none;font-size:13px">← Admin</a>
      </div>

      ${msg ? `<div style="background:#0d2818;border:1px solid #1e5f3a;color:#4ade80;padding:12px;border-radius:6px;margin-bottom:16px;font-size:13px">${msg}</div>` : ''}
      ${err ? `<div style="background:#2d0a0a;border:1px solid #7f1d1d;color:#fca5a5;padding:12px;border-radius:6px;margin-bottom:16px;font-size:13px">${err}</div>` : ''}
      ${listErr ? `<div style="background:#2d0a0a;border:1px solid #7f1d1d;color:#fca5a5;padding:12px;border-radius:6px;margin-bottom:16px;font-size:13px">List error: ${listErr}</div>` : ''}

      <div style="background:#141a23;border:1px solid #1f2530;border-radius:8px;padding:20px;margin-bottom:20px">
        <h2 style="font-size:15px;font-weight:700;color:#f0f4ff;margin:0 0 6px 0">Run backup now</h2>
        <p style="color:#6b7589;font-size:13px;margin-bottom:14px">
          Snapshots all 20 production tables to gzipped JSON, stored in R2 under <code style="background:#0a0d12;padding:2px 6px;border-radius:3px;color:#C9A84C">backups/YYYY-MM-DD/</code>.
        </p>
        <form method="POST" action="/admin/backup/run" onsubmit="this.querySelector('button').textContent='Backing up…';this.querySelector('button').disabled=true">
          <button type="submit" style="background:linear-gradient(135deg,#8B6914,#C9A84C,#F0D080);color:#000;border:none;padding:10px 24px;border-radius:6px;font-weight:700;cursor:pointer;font-size:13px">
            Run backup now
          </button>
        </form>
      </div>

      <div style="background:#141a23;border:1px solid #1f2530;border-radius:8px;overflow:hidden">
        <table style="width:100%;border-collapse:collapse;color:#f0f4ff;font-size:13px">
          <thead>
            <tr style="background:#0d1117">
              <th style="padding:12px;text-align:left;border-bottom:1px solid #1f2530;font-size:11px;text-transform:uppercase;color:#6b7589;letter-spacing:0.5px">Key</th>
              <th style="padding:12px;text-align:left;border-bottom:1px solid #1f2530;font-size:11px;text-transform:uppercase;color:#6b7589;letter-spacing:0.5px">Uploaded (SAST)</th>
              <th style="padding:12px;text-align:left;border-bottom:1px solid #1f2530;font-size:11px;text-transform:uppercase;color:#6b7589;letter-spacing:0.5px">Size</th>
              <th style="padding:12px;text-align:left;border-bottom:1px solid #1f2530;font-size:11px;text-transform:uppercase;color:#6b7589;letter-spacing:0.5px">Contents</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>

      <p style="color:#6b7589;font-size:11px;margin-top:16px;line-height:1.6">
        Backups are kept indefinitely in R2. To restore, download the <code>.json.gz</code>, decompress, and re-import the relevant table(s). Audit log entries are included in every backup.
      </p>
    </div>
  `

  return c.html(layout('Backups', body, user, 'admin'))
})

admin.post('/backup/run', async (c) => {
  const result = await runBackup(c.env as any)
  if (!result.ok) {
    return c.redirect('/admin/backup?err=' + encodeURIComponent('Backup failed: ' + (result.error || 'unknown error')))
  }
  const totalRows = Object.values(result.table_counts || {}).reduce((a, b) => a + Math.max(0, b), 0)
  return c.redirect('/admin/backup?msg=' + encodeURIComponent(
    `Backup complete — ${totalRows} rows across ${Object.keys(result.table_counts || {}).length} tables, ${fmtBytes(result.bytes || 0)} stored at ${result.key}`
  ))
})

// ═══════════════════════════════════════════════════════════════════════════
// REPAIR CONTACTS — manage "who gets the WhatsApp" when a repair note is sent
// ═══════════════════════════════════════════════════════════════════════════

// Phone normalisation:
//   '+27 78 204 5663' → '+27782045663'
//   '078 204 5663'    → '+27782045663'  (SA local → international)
//   '27782045663'     → '+27782045663'
function normalisePhone(raw: string): string {
  if (!raw) return ''
  let p = raw.replace(/[^0-9+]/g, '')
  if (p.startsWith('+')) {
    // already international
  } else if (p.startsWith('0')) {
    p = '+27' + p.slice(1)
  } else if (p.startsWith('27')) {
    p = '+' + p
  } else if (/^[0-9]+$/.test(p)) {
    // bare digits without leading 0 or 27 → assume local without leading 0
    p = '+27' + p
  }
  return p
}

const ROLE_LABELS_REPAIR: Record<string, string> = {
  repair:       'General Repair',
  mechanic:     'Mechanic',
  panel_beater: 'Panel Beater',
  electrician:  'Electrician',
  other:        'Other',
}

admin.get('/repair-contacts', async (c) => {
  const user = c.get('user')
  const msg  = c.req.query('msg') ?? ''
  const err  = c.req.query('err') ?? ''

  const rows = await c.env.DB.prepare(
    `SELECT id, name, role, phone, whatsapp_phone, notes, is_primary, active,
            created_at, updated_at
     FROM repair_contacts
     ORDER BY active DESC, is_primary DESC, role, name`
  ).all<any>()
  const contacts = rows.results || []

  // Count of primaries per role — useful for warning if 0 or >1
  const primaryByRole: Record<string, number> = {}
  for (const c of contacts) {
    if (c.active && c.is_primary) {
      primaryByRole[c.role] = (primaryByRole[c.role] || 0) + 1
    }
  }
  const noPrimaryRepair = (primaryByRole['repair'] || 0) === 0
  const multiPrimaryRepair = (primaryByRole['repair'] || 0) > 1

  const tableRows = contacts.length === 0
    ? `<tr><td colspan="6" style="padding:32px;text-align:center;color:#6b7589">No repair contacts yet — add one ↓</td></tr>`
    : contacts.map((r: any) => {
        const roleLabel = ROLE_LABELS_REPAIR[r.role] || r.role
        return `
        <tr class="${r.active ? '' : 'row-inactive'}">
          <td style="padding:10px 12px">
            <div style="display:flex;align-items:center;gap:8px">
              <div style="font-weight:600;color:#fff">${esc(r.name)}</div>
              ${r.is_primary && r.active ? '<span style="font-size:9px;padding:2px 7px;background:rgba(240,208,128,0.15);color:#F0D080;border:1px solid rgba(240,208,128,0.35);border-radius:4px;letter-spacing:.5px">PRIMARY</span>' : ''}
              ${!r.active ? '<span style="font-size:9px;padding:2px 7px;background:rgba(156,163,175,0.10);color:#9ca3af;border-radius:4px">INACTIVE</span>' : ''}
            </div>
            ${r.notes ? `<div style="font-size:11px;color:#6b7589;margin-top:3px">${esc(r.notes)}</div>` : ''}
          </td>
          <td style="padding:10px 12px"><span class="badge badge-grey" style="font-size:11px">${esc(roleLabel)}</span></td>
          <td style="padding:10px 12px;font-family:monospace;font-size:12px;color:#9ca3af">${esc(r.phone)}</td>
          <td style="padding:10px 12px;font-family:monospace;font-size:12px;color:#9ca3af">
            ${r.whatsapp_phone ? esc(r.whatsapp_phone) : '<span style="color:#6b7589;font-style:italic">(same as phone)</span>'}
          </td>
          <td style="padding:10px 12px;font-size:11px;color:#6b7589">${r.updated_at ? r.updated_at.split('T')[0] : '—'}</td>
          <td style="padding:10px 12px">
            <div class="action-group">
              <button class="btn btn-outline btn-sm" onclick='openEditRC(${JSON.stringify(r).replace(/'/g, "&apos;")})'>
                <i class="fas fa-pen"></i> Edit
              </button>
              ${!r.is_primary && r.active ? `
              <form method="POST" action="/admin/repair-contacts/${r.id}/make-primary" style="display:inline">
                <button type="submit" class="btn btn-sm" style="background:rgba(240,208,128,0.15);color:#F0D080;border:1px solid rgba(240,208,128,0.35)" title="Make primary for ${esc(roleLabel)}">
                  <i class="fas fa-star"></i>
                </button>
              </form>` : ''}
              ${r.active ? `
              <form method="POST" action="/admin/repair-contacts/${r.id}/toggle" style="display:inline">
                <button type="submit" class="btn btn-sm" style="background:rgba(245,158,11,0.15);color:#f59e0b;border:1px solid #f59e0b" title="Deactivate">
                  <i class="fas fa-pause"></i>
                </button>
              </form>` : `
              <form method="POST" action="/admin/repair-contacts/${r.id}/toggle" style="display:inline">
                <button type="submit" class="btn btn-success btn-sm" title="Reactivate">
                  <i class="fas fa-play"></i>
                </button>
              </form>`}
              <form method="POST" action="/admin/repair-contacts/${r.id}/delete" style="display:inline" onsubmit="return confirm('Permanently delete ${esc(r.name)}? This cannot be undone.')">
                <button type="submit" class="btn btn-danger btn-sm" title="Delete">
                  <i class="fas fa-trash"></i>
                </button>
              </form>
            </div>
          </td>
        </tr>`
      }).join('')

  const roleOpts = Object.entries(ROLE_LABELS_REPAIR)
    .map(([k, v]) => `<option value="${k}">${v}</option>`)
    .join('')

  const body = `
    ${msg ? `<div class="alert alert-success"><i class="fas fa-check-circle"></i> ${esc(msg)}</div>` : ''}
    ${err ? `<div class="alert alert-error"><i class="fas fa-exclamation-triangle"></i> ${esc(err)}</div>` : ''}
    ${noPrimaryRepair ? `<div class="alert alert-error"><i class="fas fa-triangle-exclamation"></i> No primary repair contact set — repair-note WhatsApp button will not auto-fill. Mark one contact as primary.</div>` : ''}
    ${multiPrimaryRepair ? `<div class="alert alert-error"><i class="fas fa-triangle-exclamation"></i> More than one primary repair contact — only the first will be auto-suggested. Clean this up.</div>` : ''}

    <div class="card">
      <div class="card-header">
        <span class="card-title"><i class="fas fa-screwdriver-wrench" style="color:var(--gold)"></i> &nbsp;Repair Contacts</span>
        <button class="btn btn-gold btn-sm" onclick="openAddRC()">
          <i class="fas fa-user-plus"></i> Add Contact
        </button>
      </div>
      <div style="padding:8px 4px 14px;color:var(--muted);font-size:13px;line-height:1.6">
        These are the people who get auto-suggested as WhatsApp recipients when a Repair Note is shared from the submissions viewer.
        The <strong>primary</strong> contact for the <em>General Repair</em> role is what fills in the modal by default. Mark exactly one per role as primary.
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Phone</th>
              <th>WhatsApp</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    </div>

    <!-- ADD / EDIT MODAL -->
    <div id="rc-modal-overlay" class="modal-overlay" onclick="closeRCModal(event)" style="display:none">
      <div class="modal-box" onclick="event.stopPropagation()">
        <div class="modal-header">
          <span id="rc-modal-title" class="modal-title">Add Repair Contact</span>
          <button class="modal-close" onclick="closeRCModalDirect()"><i class="fas fa-times"></i></button>
        </div>
        <form id="rc-form" method="POST" action="/admin/repair-contacts/create">
          <input type="hidden" id="rc-id" name="contact_id" value="">

          <div class="form-grid" style="gap:14px">
            <div class="form-group">
              <label>Full Name *</label>
              <input type="text" id="rc-name" name="name" required placeholder="e.g. Takavaudza" maxlength="80">
            </div>
            <div class="form-group">
              <label>Role *</label>
              <select id="rc-role" name="role" required>${roleOpts}</select>
            </div>
            <div class="form-group">
              <label>Phone *</label>
              <input type="tel" id="rc-phone" name="phone" required placeholder="+27 78 204 5663 or 078 204 5663" maxlength="30">
              <div style="font-size:11px;color:var(--bw-muted);margin-top:4px">SA local (078…) auto-converts to international (+2778…)</div>
            </div>
            <div class="form-group">
              <label>WhatsApp Number <span style="font-weight:400;color:var(--bw-muted)">(optional)</span></label>
              <input type="tel" id="rc-whatsapp" name="whatsapp_phone" placeholder="Only if different from phone above" maxlength="30">
            </div>
            <div class="form-group" style="grid-column:span 2">
              <label>Notes <span style="font-weight:400;color:var(--bw-muted)">(optional)</span></label>
              <input type="text" id="rc-notes" name="notes" placeholder="e.g. Specialises in MAN trucks" maxlength="200">
            </div>
            <div class="form-group">
              <label>
                <input type="checkbox" id="rc-primary" name="is_primary" value="1" style="margin-right:6px">
                Mark as primary for this role
              </label>
              <div style="font-size:11px;color:var(--bw-muted);margin-top:4px">Only one primary per role. Marking this will unmark any existing primary.</div>
            </div>
            <div class="form-group" id="rc-active-group" style="display:none">
              <label>Status</label>
              <select id="rc-active" name="active">
                <option value="1">Active</option>
                <option value="0">Inactive</option>
              </select>
            </div>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn btn-outline" onclick="closeRCModalDirect()">Cancel</button>
            <button type="submit" class="btn btn-gold">
              <i class="fas fa-save"></i> Save Contact
            </button>
          </div>
        </form>
      </div>
    </div>

    <script>
      function openAddRC() {
        document.getElementById('rc-modal-title').textContent = 'Add Repair Contact'
        document.getElementById('rc-form').action = '/admin/repair-contacts/create'
        document.getElementById('rc-id').value = ''
        document.getElementById('rc-name').value = ''
        document.getElementById('rc-role').value = 'repair'
        document.getElementById('rc-phone').value = ''
        document.getElementById('rc-whatsapp').value = ''
        document.getElementById('rc-notes').value = ''
        document.getElementById('rc-primary').checked = false
        document.getElementById('rc-active-group').style.display = 'none'
        document.getElementById('rc-modal-overlay').style.display = 'flex'
      }
      function openEditRC(r) {
        document.getElementById('rc-modal-title').textContent = 'Edit ' + r.name
        document.getElementById('rc-form').action = '/admin/repair-contacts/' + r.id + '/edit'
        document.getElementById('rc-id').value = r.id
        document.getElementById('rc-name').value = r.name || ''
        document.getElementById('rc-role').value = r.role || 'repair'
        document.getElementById('rc-phone').value = r.phone || ''
        document.getElementById('rc-whatsapp').value = r.whatsapp_phone || ''
        document.getElementById('rc-notes').value = r.notes || ''
        document.getElementById('rc-primary').checked = !!r.is_primary
        document.getElementById('rc-active-group').style.display = 'block'
        document.getElementById('rc-active').value = r.active ? '1' : '0'
        document.getElementById('rc-modal-overlay').style.display = 'flex'
      }
      function closeRCModal(e) { if (e.target.id === 'rc-modal-overlay') closeRCModalDirect() }
      function closeRCModalDirect() { document.getElementById('rc-modal-overlay').style.display = 'none' }
    </script>
  `

  return c.html(layout('Repair Contacts', body, user, 'admin'))
})

// ── CREATE ─────────────────────────────────────────────────────────────────
admin.post('/repair-contacts/create', async (c) => {
  const f = await c.req.parseBody()
  const name           = String(f.name || '').trim().slice(0, 80)
  const role           = String(f.role || 'repair').trim()
  const phoneRaw       = String(f.phone || '').trim()
  const waRaw          = String(f.whatsapp_phone || '').trim()
  const notes          = String(f.notes || '').trim().slice(0, 200)
  const isPrimary      = f.is_primary ? 1 : 0

  if (!name)     return c.redirect('/admin/repair-contacts?err=' + encodeURIComponent('Name is required'))
  if (!phoneRaw) return c.redirect('/admin/repair-contacts?err=' + encodeURIComponent('Phone is required'))
  if (!Object.keys(ROLE_LABELS_REPAIR).includes(role)) {
    return c.redirect('/admin/repair-contacts?err=' + encodeURIComponent('Invalid role'))
  }

  const phone = normalisePhone(phoneRaw)
  const waPhone = waRaw ? normalisePhone(waRaw) : null
  if (!/^\+[0-9]{10,15}$/.test(phone)) {
    return c.redirect('/admin/repair-contacts?err=' + encodeURIComponent('Phone format invalid: ' + phoneRaw))
  }
  if (waPhone && !/^\+[0-9]{10,15}$/.test(waPhone)) {
    return c.redirect('/admin/repair-contacts?err=' + encodeURIComponent('WhatsApp format invalid: ' + waRaw))
  }

  // If marking primary, demote existing primaries for that role first
  if (isPrimary) {
    await c.env.DB.prepare(
      `UPDATE repair_contacts SET is_primary = 0, updated_at = CURRENT_TIMESTAMP
       WHERE role = ? AND is_primary = 1`
    ).bind(role).run()
  }

  await c.env.DB.prepare(
    `INSERT INTO repair_contacts (name, role, phone, whatsapp_phone, notes, is_primary, active)
     VALUES (?, ?, ?, ?, ?, ?, 1)`
  ).bind(name, role, phone, waPhone, notes || null, isPrimary).run()

  return c.redirect('/admin/repair-contacts?msg=' + encodeURIComponent(`Added ${name}`))
})

// ── EDIT ───────────────────────────────────────────────────────────────────
admin.post('/repair-contacts/:id/edit', async (c) => {
  const id = parseInt(c.req.param('id'))
  if (!id) return c.redirect('/admin/repair-contacts?err=bad+id')
  const f = await c.req.parseBody()
  const name           = String(f.name || '').trim().slice(0, 80)
  const role           = String(f.role || 'repair').trim()
  const phoneRaw       = String(f.phone || '').trim()
  const waRaw          = String(f.whatsapp_phone || '').trim()
  const notes          = String(f.notes || '').trim().slice(0, 200)
  const isPrimary      = f.is_primary ? 1 : 0
  const active         = String(f.active || '1') === '1' ? 1 : 0

  if (!name)     return c.redirect('/admin/repair-contacts?err=' + encodeURIComponent('Name is required'))
  if (!phoneRaw) return c.redirect('/admin/repair-contacts?err=' + encodeURIComponent('Phone is required'))
  if (!Object.keys(ROLE_LABELS_REPAIR).includes(role)) {
    return c.redirect('/admin/repair-contacts?err=' + encodeURIComponent('Invalid role'))
  }

  const phone = normalisePhone(phoneRaw)
  const waPhone = waRaw ? normalisePhone(waRaw) : null
  if (!/^\+[0-9]{10,15}$/.test(phone)) {
    return c.redirect('/admin/repair-contacts?err=' + encodeURIComponent('Phone format invalid: ' + phoneRaw))
  }
  if (waPhone && !/^\+[0-9]{10,15}$/.test(waPhone)) {
    return c.redirect('/admin/repair-contacts?err=' + encodeURIComponent('WhatsApp format invalid: ' + waRaw))
  }

  // If marking primary, demote others
  if (isPrimary && active) {
    await c.env.DB.prepare(
      `UPDATE repair_contacts SET is_primary = 0, updated_at = CURRENT_TIMESTAMP
       WHERE role = ? AND is_primary = 1 AND id != ?`
    ).bind(role, id).run()
  }

  await c.env.DB.prepare(
    `UPDATE repair_contacts
     SET name=?, role=?, phone=?, whatsapp_phone=?, notes=?, is_primary=?, active=?, updated_at=CURRENT_TIMESTAMP
     WHERE id=?`
  ).bind(name, role, phone, waPhone, notes || null, isPrimary, active, id).run()

  return c.redirect('/admin/repair-contacts?msg=' + encodeURIComponent(`Updated ${name}`))
})

// ── MAKE PRIMARY ───────────────────────────────────────────────────────────
admin.post('/repair-contacts/:id/make-primary', async (c) => {
  const id = parseInt(c.req.param('id'))
  if (!id) return c.redirect('/admin/repair-contacts?err=bad+id')
  const row = await c.env.DB.prepare(`SELECT role, name, active FROM repair_contacts WHERE id=?`).bind(id).first<any>()
  if (!row) return c.redirect('/admin/repair-contacts?err=not+found')
  if (!row.active) return c.redirect('/admin/repair-contacts?err=' + encodeURIComponent('Cannot make an inactive contact primary'))
  await c.env.DB.prepare(
    `UPDATE repair_contacts SET is_primary = 0, updated_at = CURRENT_TIMESTAMP
     WHERE role = ? AND is_primary = 1 AND id != ?`
  ).bind(row.role, id).run()
  await c.env.DB.prepare(
    `UPDATE repair_contacts SET is_primary = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(id).run()
  return c.redirect('/admin/repair-contacts?msg=' + encodeURIComponent(`${row.name} is now the primary ${ROLE_LABELS_REPAIR[row.role] || row.role}`))
})

// ── TOGGLE ACTIVE ──────────────────────────────────────────────────────────
admin.post('/repair-contacts/:id/toggle', async (c) => {
  const id = parseInt(c.req.param('id'))
  if (!id) return c.redirect('/admin/repair-contacts?err=bad+id')
  const row = await c.env.DB.prepare(`SELECT name, active FROM repair_contacts WHERE id=?`).bind(id).first<any>()
  if (!row) return c.redirect('/admin/repair-contacts?err=not+found')
  const newActive = row.active ? 0 : 1
  // If deactivating, also clear is_primary so we don't end up with an inactive primary
  await c.env.DB.prepare(
    `UPDATE repair_contacts
     SET active = ?,
         is_primary = CASE WHEN ? = 0 THEN 0 ELSE is_primary END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).bind(newActive, newActive, id).run()
  return c.redirect('/admin/repair-contacts?msg=' + encodeURIComponent(`${row.name} ${newActive ? 'reactivated' : 'deactivated'}`))
})

// ── DELETE ─────────────────────────────────────────────────────────────────
admin.post('/repair-contacts/:id/delete', async (c) => {
  const id = parseInt(c.req.param('id'))
  if (!id) return c.redirect('/admin/repair-contacts?err=bad+id')
  const row = await c.env.DB.prepare(`SELECT name FROM repair_contacts WHERE id=?`).bind(id).first<any>()
  await c.env.DB.prepare(`DELETE FROM repair_contacts WHERE id=?`).bind(id).run()
  return c.redirect('/admin/repair-contacts?msg=' + encodeURIComponent(`Deleted ${row?.name || 'contact'}`))
})

export default admin
