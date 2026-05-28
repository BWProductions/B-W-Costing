// Auth routes: login / logout

import { Hono } from 'hono'
import { hashPassword, verifyPassword, createSessionToken } from '../lib/auth.js'
import { loginPage } from '../lib/layout.js'

type Env = { Bindings: { DB: D1Database } }

const auth = new Hono<Env>()

auth.get('/login', (c) => c.html(loginPage()))

// Phase 16: log every login attempt to login_history (best effort)
async function logLogin(
  db: D1Database,
  args: {
    user_id?: number | null
    email: string
    success: boolean
    ip_address?: string | null
    user_agent?: string | null
    failure_reason?: string | null
  }
): Promise<void> {
  try {
    await db.prepare(`
      INSERT INTO login_history (user_id, email, success, ip_address, user_agent, failure_reason)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      args.user_id ?? null,
      args.email,
      args.success ? 1 : 0,
      args.ip_address ?? null,
      args.user_agent ?? null,
      args.failure_reason ?? null,
    ).run()
  } catch (e) {
    console.error('logLogin failed', e)
  }
}

auth.post('/login', async (c) => {
  const body = await c.req.parseBody()
  const email = String(body.email ?? '').toLowerCase().trim()
  const password = String(body.password ?? '')
  const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || null
  const ua = c.req.header('user-agent') || null

  if (!email || !password) {
    await logLogin(c.env.DB, { email, success: false, ip_address: ip, user_agent: ua, failure_reason: 'missing_credentials' })
    return c.html(loginPage('Email and password are required.'))
  }

  const row = await c.env.DB.prepare(
    'SELECT id, email, name, role, password_hash, active FROM users WHERE email = ?'
  ).bind(email).first<{ id: number; email: string; name: string; role: string; password_hash: string; active: number }>()

  if (!row) {
    await logLogin(c.env.DB, { email, success: false, ip_address: ip, user_agent: ua, failure_reason: 'no_user' })
    return c.html(loginPage('Invalid credentials. Try again.'))
  }
  if (!row.active) {
    await logLogin(c.env.DB, { user_id: row.id, email, success: false, ip_address: ip, user_agent: ua, failure_reason: 'inactive_user' })
    return c.html(loginPage('Invalid credentials. Try again.'))
  }

  const ok = await verifyPassword(password, row.password_hash)
  if (!ok) {
    await logLogin(c.env.DB, { user_id: row.id, email, success: false, ip_address: ip, user_agent: ua, failure_reason: 'wrong_password' })
    return c.html(loginPage('Invalid credentials. Try again.'))
  }

  await logLogin(c.env.DB, { user_id: row.id, email, success: true, ip_address: ip, user_agent: ua })

  const token = await createSessionToken({
    id: row.id, email: row.email, name: row.name,
    role: row.role as any
  })

  return new Response(null, {
    status: 302,
    headers: {
      'Location': '/',
      'Set-Cookie': `bw_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`
    }
  })
})

auth.get('/logout', (c) => new Response(null, {
  status: 302,
  headers: {
    'Location': '/login',
    'Set-Cookie': 'bw_session=; Path=/; HttpOnly; Max-Age=0'
  }
}))

export default auth
