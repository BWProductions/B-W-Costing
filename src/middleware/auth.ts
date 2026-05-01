// Auth middleware for Hono

import { createMiddleware } from 'hono/factory'
import { verifySessionToken, getCookieValue } from '../lib/auth.js'
import type { AuthUser } from '../lib/auth.js'

type Env = { Bindings: { DB: D1Database }; Variables: { user: AuthUser } }

export const requireAuth = createMiddleware<Env>(async (c, next) => {
  const cookie = c.req.header('cookie')
  const token = getCookieValue(cookie ?? null, 'bw_session')
  if (!token) return c.redirect('/login')
  const user = await verifySessionToken(token)
  if (!user) return c.redirect('/login')
  c.set('user', user)
  await next()
})

export const requireRole = (...roles: string[]) =>
  createMiddleware<Env>(async (c, next) => {
    const user = c.get('user')
    if (!user || !roles.includes(user.role)) {
      return c.html('<h1>403 — Not authorised</h1>', 403)
    }
    await next()
  })
