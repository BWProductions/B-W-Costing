// Account route — self-service profile & password change (all roles)

import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth.js'
import { layout } from '../lib/layout.js'
import { hashPassword, verifyPassword } from '../lib/auth.js'
import type { AuthUser } from '../lib/auth.js'

type Env = { Bindings: { DB: D1Database }; Variables: { user: AuthUser } }

const account = new Hono<Env>()
account.use('*', requireAuth)

// ── GET /account ─────────────────────────────────────────────────────────────
account.get('/', async (c) => {
  const user = c.get('user')
  const msg  = c.req.query('msg') ?? ''
  const err  = c.req.query('err') ?? ''
  const tab  = c.req.query('tab') ?? 'password'

  // Pull fresh user data from DB
  const row = await c.env.DB.prepare(
    'SELECT id, email, name, role, created_at FROM users WHERE id = ?'
  ).bind(user.id).first<{ id: number; email: string; name: string; role: string; created_at: string }>()

  if (!row) return c.redirect('/logout')

  const initials = row.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)

  const body = `
    ${msg ? `<div class="alert alert-success"><i class="fas fa-check-circle"></i> ${escHtml(msg)}</div>` : ''}
    ${err ? `<div class="alert alert-error"><i class="fas fa-triangle-exclamation"></i> ${escHtml(err)}</div>` : ''}

    <!-- PROFILE HEADER -->
    <div style="
      background: linear-gradient(135deg, rgba(201,168,76,0.06) 0%, rgba(204,24,232,0.04) 50%, rgba(24,217,255,0.06) 100%);
      border: 1px solid rgba(201,168,76,0.12);
      border-radius: 16px;
      padding: 28px;
      margin-bottom: 24px;
      display: flex;
      align-items: center;
      gap: 20px;
      flex-wrap: wrap;
    ">
      <div style="
        width: 72px; height: 72px;
        background: linear-gradient(135deg, var(--magenta), var(--blue-flame));
        border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-size: 26px; font-weight: 800; color: #fff;
        box-shadow: 0 0 24px rgba(204,24,232,0.35);
        flex-shrink: 0;
        font-family: 'Cinzel', serif;
        letter-spacing: 0.04em;
      ">${initials}</div>
      <div style="flex: 1">
        <div style="font-family:'Cinzel',serif;font-size:20px;font-weight:700;
          background:linear-gradient(135deg,#B67A3A,#F0D080,#D39A52);
          -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
          margin-bottom:4px">${escHtml(row.name)}</div>
        <div style="color:var(--muted);font-size:13px;margin-bottom:6px">${escHtml(row.email)}</div>
        <span class="badge badge-gold" style="font-size:10px">${roleLabel(row.role)}</span>
      </div>
      <div style="text-align:right;color:var(--muted);font-size:11px">
        <div>Member since</div>
        <div style="color:var(--white);font-weight:600">${row.created_at ? row.created_at.split('T')[0] : '—'}</div>
      </div>
    </div>

    <div class="flame-divider"></div>

    <!-- TAB NAV -->
    <div style="display:flex;gap:4px;margin-bottom:24px;background:var(--navy-card);border:1px solid var(--navy-border);border-radius:10px;padding:4px;width:fit-content">
      <a href="/account?tab=password"
        style="padding:8px 18px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;transition:all 0.15s;
          ${tab === 'password'
            ? 'background:linear-gradient(135deg,var(--gold-dk),var(--gold),var(--gold-lt));color:#000;box-shadow:0 2px 8px rgba(201,168,76,0.3)'
            : 'color:var(--muted)'
          }">
        <i class="fas fa-key" style="margin-right:6px"></i>Change Password
      </a>
      <a href="/account?tab=profile"
        style="padding:8px 18px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;transition:all 0.15s;
          ${tab === 'profile'
            ? 'background:linear-gradient(135deg,var(--gold-dk),var(--gold),var(--gold-lt));color:#000;box-shadow:0 2px 8px rgba(201,168,76,0.3)'
            : 'color:var(--muted)'
          }">
        <i class="fas fa-user-pen" style="margin-right:6px"></i>Edit Profile
      </a>
    </div>

    <!-- PASSWORD TAB -->
    ${tab === 'password' ? `
    <div class="card card-glow" style="max-width:520px">
      <div class="card-header">
        <div class="card-title">
          <div class="card-title-icon" style="background:rgba(204,24,232,0.1);color:var(--magenta)">
            <i class="fas fa-lock"></i>
          </div>
          Change Password
        </div>
      </div>

      <form method="POST" action="/account/password" id="pwd-form">
        <div style="display:flex;flex-direction:column;gap:16px">

          <div class="form-group">
            <label>Current Password</label>
            <div style="position:relative">
              <i class="fas fa-lock" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--muted);font-size:13px;pointer-events:none"></i>
              <input type="password" name="current_password" id="current_password"
                required autocomplete="current-password"
                placeholder="Your current password"
                style="padding-left:36px">
            </div>
          </div>

          <div style="height:1px;background:var(--navy-border)"></div>

          <div class="form-group">
            <label>New Password</label>
            <div style="position:relative">
              <i class="fas fa-key" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--muted);font-size:13px;pointer-events:none"></i>
              <input type="password" name="new_password" id="new_password"
                required autocomplete="new-password" minlength="8"
                placeholder="Minimum 8 characters"
                style="padding-left:36px;padding-right:44px"
                oninput="checkStrength(this.value)">
              <button type="button" onclick="toggleVis('new_password','eye1')"
                style="position:absolute;right:12px;top:50%;transform:translateY(-50%);
                  background:none;border:none;color:var(--muted);cursor:pointer;font-size:14px">
                <i class="fas fa-eye" id="eye1"></i>
              </button>
            </div>
            <!-- Strength bar -->
            <div style="margin-top:8px">
              <div style="height:3px;background:var(--navy-border);border-radius:2px;overflow:hidden">
                <div id="strength-bar" style="height:100%;width:0%;transition:width 0.3s,background 0.3s;border-radius:2px"></div>
              </div>
              <div id="strength-label" style="font-size:11px;color:var(--muted);margin-top:4px"></div>
            </div>
          </div>

          <div class="form-group">
            <label>Confirm New Password</label>
            <div style="position:relative">
              <i class="fas fa-key" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--muted);font-size:13px;pointer-events:none"></i>
              <input type="password" name="confirm_password" id="confirm_password"
                required autocomplete="new-password" minlength="8"
                placeholder="Repeat new password"
                style="padding-left:36px;padding-right:44px"
                oninput="checkMatch()">
              <button type="button" onclick="toggleVis('confirm_password','eye2')"
                style="position:absolute;right:12px;top:50%;transform:translateY(-50%);
                  background:none;border:none;color:var(--muted);cursor:pointer;font-size:14px">
                <i class="fas fa-eye" id="eye2"></i>
              </button>
            </div>
            <div id="match-label" style="font-size:11px;margin-top:4px"></div>
          </div>

          <!-- Requirements checklist -->
          <div style="background:var(--navy);border:1px solid var(--navy-border);border-radius:8px;padding:14px 16px">
            <div style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px">
              Password requirements
            </div>
            <div style="display:flex;flex-direction:column;gap:6px">
              ${[
                ['req-len',   'At least 8 characters'],
                ['req-upper', 'One uppercase letter (A–Z)'],
                ['req-lower', 'One lowercase letter (a–z)'],
                ['req-num',   'One number (0–9)'],
              ].map(([id, label]) => `
                <div style="display:flex;align-items:center;gap:8px;font-size:12px">
                  <i class="fas fa-circle" id="${id}" style="font-size:6px;color:var(--muted);transition:color 0.2s"></i>
                  <span id="${id}-text" style="color:var(--muted);transition:color 0.2s">${label}</span>
                </div>`).join('')}
            </div>
          </div>

          <button type="submit" id="pwd-submit" class="btn btn-gold w-full" style="justify-content:center;padding:12px" disabled>
            <i class="fas fa-lock"></i> Update Password
          </button>
        </div>
      </form>
    </div>

    <script>
      function toggleVis(inputId, iconId) {
        const inp = document.getElementById(inputId)
        const ico = document.getElementById(iconId)
        if (inp.type === 'password') { inp.type = 'text'; ico.className = 'fas fa-eye-slash' }
        else                         { inp.type = 'password'; ico.className = 'fas fa-eye' }
      }

      function checkStrength(val) {
        const bar   = document.getElementById('strength-bar')
        const label = document.getElementById('strength-label')
        const checks = {
          len:   val.length >= 8,
          upper: /[A-Z]/.test(val),
          lower: /[a-z]/.test(val),
          num:   /[0-9]/.test(val),
          sym:   /[^A-Za-z0-9]/.test(val),
        }
        // Update requirement dots
        setReq('req-len',   checks.len)
        setReq('req-upper', checks.upper)
        setReq('req-lower', checks.lower)
        setReq('req-num',   checks.num)

        const score = Object.values(checks).filter(Boolean).length
        const configs = [
          { w:'0%',  color:'transparent', text:'' },
          { w:'20%', color:'#ef4444',     text:'Very weak' },
          { w:'40%', color:'#f97316',     text:'Weak' },
          { w:'60%', color:'#f59e0b',     text:'Fair' },
          { w:'80%', color:'#84cc16',     text:'Good' },
          { w:'100%',color:'#10b981',     text:'Strong ✓' },
        ]
        const cfg = configs[score] || configs[0]
        bar.style.width    = cfg.w
        bar.style.background = cfg.color
        label.textContent  = cfg.text
        label.style.color  = cfg.color
        checkMatch()
        updateSubmit()
      }

      function setReq(id, pass) {
        const dot  = document.getElementById(id)
        const text = document.getElementById(id + '-text')
        dot.className  = pass ? 'fas fa-check-circle' : 'fas fa-circle'
        dot.style.fontSize = pass ? '12px' : '6px'
        dot.style.color  = pass ? '#10b981' : 'var(--muted)'
        text.style.color = pass ? '#f0f4ff' : 'var(--muted)'
      }

      function checkMatch() {
        const np = document.getElementById('new_password').value
        const cp = document.getElementById('confirm_password').value
        const lbl = document.getElementById('match-label')
        if (!cp) { lbl.textContent = ''; return }
        if (np === cp) {
          lbl.textContent = '✓ Passwords match'
          lbl.style.color = '#10b981'
        } else {
          lbl.textContent = '✗ Passwords do not match'
          lbl.style.color = '#ef4444'
        }
        updateSubmit()
      }

      function updateSubmit() {
        const np   = document.getElementById('new_password').value
        const cp   = document.getElementById('confirm_password').value
        const curr = document.getElementById('current_password').value
        const btn  = document.getElementById('pwd-submit')
        const ok = curr.length > 0 && np.length >= 8 && np === cp &&
                   /[A-Z]/.test(np) && /[a-z]/.test(np) && /[0-9]/.test(np)
        btn.disabled = !ok
        btn.style.opacity = ok ? '1' : '0.45'
        btn.style.cursor  = ok ? 'pointer' : 'not-allowed'
      }

      // Kick off checks if browser autofills
      document.getElementById('current_password').addEventListener('input', updateSubmit)
      document.getElementById('pwd-form').addEventListener('submit', function(e) {
        const np = document.getElementById('new_password').value
        const cp = document.getElementById('confirm_password').value
        if (np !== cp) { e.preventDefault(); alert('Passwords do not match.') }
      })
    </script>
    ` : ''}

    <!-- PROFILE TAB -->
    ${tab === 'profile' ? `
    <div class="card card-glow" style="max-width:520px">
      <div class="card-header">
        <div class="card-title">
          <div class="card-title-icon" style="background:rgba(201,168,76,0.1);color:var(--gold)">
            <i class="fas fa-user-pen"></i>
          </div>
          Edit Profile
        </div>
      </div>

      <form method="POST" action="/account/profile">
        <div style="display:flex;flex-direction:column;gap:16px">

          <div class="form-group">
            <label>Full Name</label>
            <div style="position:relative">
              <i class="fas fa-user" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--muted);font-size:13px;pointer-events:none"></i>
              <input type="text" name="name" required maxlength="80"
                value="${escHtml(row.name)}"
                placeholder="Your full name"
                style="padding-left:36px">
            </div>
          </div>

          <div class="form-group">
            <label>Email Address</label>
            <div style="position:relative">
              <i class="fas fa-envelope" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--muted);font-size:13px;pointer-events:none"></i>
              <input type="email" name="email" required
                value="${escHtml(row.email)}"
                placeholder="your@bwproductions.co.za"
                style="padding-left:36px">
            </div>
          </div>

          <div class="form-group">
            <label>Role</label>
            <div style="position:relative">
              <i class="fas fa-id-badge" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--muted);font-size:13px;pointer-events:none"></i>
              <input type="text" value="${escHtml(roleLabel(row.role))}" disabled
                style="padding-left:36px;opacity:0.5;cursor:not-allowed">
            </div>
            <div style="font-size:11px;color:var(--muted);margin-top:4px">
              Role changes are managed by the Founder via Admin → User Management.
            </div>
          </div>

          <button type="submit" class="btn btn-gold w-full" style="justify-content:center;padding:12px">
            <i class="fas fa-save"></i> Save Profile
          </button>
        </div>
      </form>
    </div>
    ` : ''}

    <!-- SECURITY INFO CARD -->
    <div class="card" style="max-width:520px;margin-top:20px;border-color:rgba(24,217,255,0.12)">
      <div class="card-header" style="margin-bottom:12px">
        <div class="card-title">
          <div class="card-title-icon" style="background:rgba(24,217,255,0.08);color:var(--cyan)">
            <i class="fas fa-shield-halved"></i>
          </div>
          Security Tips
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px">
        ${[
          ['fa-rotate',        'Change your password every 90 days.',                                   'var(--gold)'],
          ['fa-eye-slash',     'Never share your password with anyone — not even the Founder.',          'var(--cyan)'],
          ['fa-key',           'Use a unique password not used on other sites.',                         'var(--green-flame)'],
          ['fa-right-from-bracket', 'Always log out on shared or public devices.',                      'var(--magenta)'],
        ].map(([icon, tip, color]) => `
          <div style="display:flex;align-items:flex-start;gap:10px;font-size:13px;color:var(--muted);line-height:1.5">
            <i class="fas ${icon}" style="color:${color};margin-top:2px;font-size:13px;flex-shrink:0;width:16px;text-align:center"></i>
            <span>${tip}</span>
          </div>`).join('')}
      </div>
    </div>
  `

  return c.html(layout('My Account', body, user, 'account'))
})

// ── POST /account/password ────────────────────────────────────────────────────
account.post('/password', async (c) => {
  const user = c.get('user')
  const body = await c.req.parseBody()

  const current  = String(body.current_password ?? '')
  const newPwd   = String(body.new_password ?? '')
  const confirm  = String(body.confirm_password ?? '')

  // Basic validation
  if (!current || !newPwd || !confirm)
    return c.redirect('/account?tab=password&err=All fields are required')

  if (newPwd.length < 8)
    return c.redirect('/account?tab=password&err=New password must be at least 8 characters')

  if (newPwd !== confirm)
    return c.redirect('/account?tab=password&err=New passwords do not match')

  if (!/[A-Z]/.test(newPwd) || !/[a-z]/.test(newPwd) || !/[0-9]/.test(newPwd))
    return c.redirect('/account?tab=password&err=Password must include uppercase, lowercase and a number')

  if (current === newPwd)
    return c.redirect('/account?tab=password&err=New password must be different from current password')

  // Verify current password against DB
  const row = await c.env.DB.prepare(
    'SELECT password_hash FROM users WHERE id = ?'
  ).bind(user.id).first<{ password_hash: string }>()

  if (!row) return c.redirect('/logout')

  const currentOk = await verifyPassword(current, row.password_hash)
  if (!currentOk)
    return c.redirect('/account?tab=password&err=Current password is incorrect')

  // Hash and save new password
  const newHash = await hashPassword(newPwd)
  await c.env.DB.prepare(
    'UPDATE users SET password_hash = ? WHERE id = ?'
  ).bind(newHash, user.id).run()

  // Redirect with success — force fresh login for security
  return c.redirect('/account?tab=password&msg=Password updated successfully. Please use your new password next time you log in.')
})

// ── POST /account/profile ─────────────────────────────────────────────────────
account.post('/profile', async (c) => {
  const user  = c.get('user')
  const body  = await c.req.parseBody()
  const name  = String(body.name ?? '').trim()
  const email = String(body.email ?? '').toLowerCase().trim()

  if (!name || !email)
    return c.redirect('/account?tab=profile&err=Name and email are required')

  if (name.length < 2)
    return c.redirect('/account?tab=profile&err=Name must be at least 2 characters')

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return c.redirect('/account?tab=profile&err=Please enter a valid email address')

  // Check duplicate email (exclude self)
  const existing = await c.env.DB.prepare(
    'SELECT id FROM users WHERE email = ? AND id != ?'
  ).bind(email, user.id).first()

  if (existing)
    return c.redirect(`/account?tab=profile&err=Email ${email} is already used by another account`)

  await c.env.DB.prepare(
    'UPDATE users SET name = ?, email = ? WHERE id = ?'
  ).bind(name, email, user.id).run()

  return c.redirect('/account?tab=profile&msg=Profile updated successfully')
})

// ── Helpers ───────────────────────────────────────────────────────────────────
function escHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function roleLabel(role: string): string {
  const map: Record<string, string> = {
    founder:          'Founder',
    ops_director:     'Operations Director',
    finance_director: 'Financial Director',
    account_director: 'Account Director',
    crew:             'Crew',
  }
  return map[role] ?? role
}

export default account
