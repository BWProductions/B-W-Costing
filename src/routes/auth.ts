// Auth routes: login / logout

import { Hono } from 'hono'
import { hashPassword, verifyPassword, createSessionToken } from '../lib/auth.js'
import { loginPage } from '../lib/layout.js'

type Env = { Bindings: { DB: D1Database } }

const auth = new Hono<Env>()

auth.get('/login', (c) => c.html(loginPage()))

auth.post('/login', async (c) => {
  const body = await c.req.parseBody()
  const email = String(body.email ?? '').toLowerCase().trim()
  const password = String(body.password ?? '')

  if (!email || !password) return c.html(loginPage('Email and password are required.'))

  const row = await c.env.DB.prepare(
    'SELECT id, email, name, role, password_hash, active FROM users WHERE email = ?'
  ).bind(email).first<{ id: number; email: string; name: string; role: string; password_hash: string; active: number }>()

  if (!row || !row.active) return c.html(loginPage('Invalid credentials. Try again.'))

  const ok = await verifyPassword(password, row.password_hash)
  if (!ok) return c.html(loginPage('Invalid credentials. Try again.'))

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
