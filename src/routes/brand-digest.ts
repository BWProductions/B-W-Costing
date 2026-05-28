// ─────────────────────────────────────────────────────────────────────────
// Phase 17: Brand owner digest — admin subscription management UI
// ─────────────────────────────────────────────────────────────────────────
// Mounted at /admin/brand-digest. Auth inherited from parent admin chain.
//
// Routes:
//   GET  /admin/brand-digest                     — index across all brands
//   GET  /admin/brand-digest/:slug               — per-brand subscriptions
//   POST /admin/brand-digest/:slug/add           — add a subscription
//   POST /admin/brand-digest/:slug/deactivate/:id
//   POST /admin/brand-digest/:slug/activate/:id
//   POST /admin/brand-digest/:slug/test          — send a test digest now
//   GET  /admin/brand-digest/:slug/preview       — render the HTML preview

import { Hono } from 'hono'
import type { AuthUser } from '../lib/auth.js'
import { requireAuth } from '../middleware/auth.js'
import { layout } from '../lib/layout.js'
import { getBrandBySlug, listBrandSummaries, getBrandDashboard } from '../lib/brand-stats.js'
import {
  listSubscriptionsForBrand,
  createSubscription,
  deactivateSubscription,
  activateSubscription,
  buildBrandDigestHtml,
  runBrandDigest,
} from '../lib/brand-digest.js'

type Bindings = { DB: D1Database; RESEND_API_KEY?: string }
type Variables = { user: AuthUser }
const brandDigest = new Hono<{ Bindings: Bindings; Variables: Variables }>()
brandDigest.use('*', requireAuth)

function esc(s: any): string {
  if (s === null || s === undefined) return ''
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function fmtDateTime(s: string | null | undefined): string {
  if (!s) return '—'
  return String(s).replace('T', ' ').replace(/\.\d+Z?$/, '').slice(0, 16)
}

// ─── INDEX ──────────────────────────────────────────────────────────────────

brandDigest.get('/', async (c) => {
  const user = c.get('user')
  const brands = await listBrandSummaries(c.env.DB)

  const cntResult = await c.env.DB.prepare(`
    SELECT brand,
           COUNT(*) AS total,
           SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) AS active_count,
           MAX(last_sent_at) AS last_sent
    FROM brand_digest_subscriptions
    GROUP BY brand
  `).all<{ brand: string; total: number; active_count: number; last_sent: string | null }>()
  const counts = new Map<string, { total: number; active_count: number; last_sent: string | null }>()
  for (const r of cntResult.results || []) {
    counts.set(r.brand, { total: r.total, active_count: r.active_count, last_sent: r.last_sent })
  }

  const rows = brands.map(b => {
    const c = counts.get(b.brand) || { total: 0, active_count: 0, last_sent: null }
    return `
      <tr class="hover:bg-gray-50">
        <td class="px-4 py-2 border-b">
          <a href="/admin/brand-digest/${esc(b.slug)}" class="text-blue-600 hover:underline font-medium">${esc(b.brand)}</a>
          ${b.is_internal ? '<span class="ml-2 text-xs px-1.5 py-0.5 bg-gray-200 rounded">Internal</span>' : ''}
        </td>
        <td class="px-4 py-2 border-b text-center">${c.active_count}</td>
        <td class="px-4 py-2 border-b text-center text-gray-500">${c.total}</td>
        <td class="px-4 py-2 border-b text-xs text-gray-600">${fmtDateTime(c.last_sent)}</td>
        <td class="px-4 py-2 border-b text-right">
          <a href="/admin/brand-digest/${esc(b.slug)}" class="text-sm px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">Manage</a>
        </td>
      </tr>
    `
  }).join('')

  return c.html(layout({
    title: 'Brand Digest Subscriptions',
    user,
    body: `
      <div class="max-w-5xl mx-auto p-6">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h1 class="text-2xl font-bold">Brand Digest Subscriptions</h1>
            <p class="text-sm text-gray-600 mt-1">Weekly stock summaries auto-mailed to brand owners every Monday.</p>
          </div>
          <a href="/admin/stock" class="text-sm text-gray-600 hover:underline">← Back to Stock Admin</a>
        </div>
        <table class="w-full bg-white rounded shadow text-sm">
          <thead class="bg-gray-100">
            <tr>
              <th class="px-4 py-2 text-left border-b">Brand</th>
              <th class="px-4 py-2 text-center border-b">Active</th>
              <th class="px-4 py-2 text-center border-b">Total</th>
              <th class="px-4 py-2 text-left border-b">Last Sent</th>
              <th class="px-4 py-2 border-b"></th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="5" class="px-4 py-6 text-center text-gray-500">No brands found</td></tr>'}</tbody>
        </table>
      </div>
    `,
  }))
})

// ─── PER-BRAND SUBSCRIPTIONS ────────────────────────────────────────────────

brandDigest.get('/:slug', async (c) => {
  const user = c.get('user')
  const slug = c.req.param('slug')
  const brand = await getBrandBySlug(c.env.DB, slug)
  if (!brand) return c.notFound()

  const subs = await listSubscriptionsForBrand(c.env.DB, brand)
  const success = c.req.query('success')
  const error = c.req.query('error')

  const subRows = subs.map(s => `
    <tr class="${s.active === 1 ? '' : 'bg-gray-50 text-gray-500'} hover:bg-gray-50">
      <td class="px-4 py-2 border-b">
        <div class="font-medium">${esc(s.name || '(no name)')}</div>
        <div class="text-xs text-gray-500">${esc(s.email)}</div>
      </td>
      <td class="px-4 py-2 border-b text-xs">
        ${s.active === 1
          ? '<span class="px-2 py-0.5 bg-green-100 text-green-800 rounded">Active</span>'
          : '<span class="px-2 py-0.5 bg-red-100 text-red-800 rounded">Paused</span>'}
      </td>
      <td class="px-4 py-2 border-b text-xs text-gray-600">${fmtDateTime(s.last_sent_at)}</td>
      <td class="px-4 py-2 border-b text-xs text-gray-600">
        ${fmtDateTime(s.created_at)}<br>
        <span class="text-gray-400">by ${esc(s.created_by_name || '—')}</span>
      </td>
      <td class="px-4 py-2 border-b text-right">
        ${s.active === 1
          ? `<form method="POST" action="/admin/brand-digest/${esc(slug)}/deactivate/${s.id}" class="inline">
               <button type="submit" class="text-xs px-2 py-1 bg-amber-600 text-white rounded hover:bg-amber-700">Pause</button>
             </form>`
          : `<form method="POST" action="/admin/brand-digest/${esc(slug)}/activate/${s.id}" class="inline">
               <button type="submit" class="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700">Resume</button>
             </form>`}
      </td>
    </tr>
  `).join('')

  return c.html(layout({
    title: `${brand} — Digest`,
    user,
    body: `
      <div class="max-w-5xl mx-auto p-6">
        <div class="flex items-center justify-between mb-2">
          <h1 class="text-2xl font-bold">${esc(brand)} — Digest Subscriptions</h1>
          <a href="/admin/brand-digest" class="text-sm text-gray-600 hover:underline">← All brands</a>
        </div>
        ${success ? `<div class="bg-green-100 border border-green-400 text-green-800 px-4 py-2 rounded mb-4">${esc(success)}</div>` : ''}
        ${error ? `<div class="bg-red-100 border border-red-400 text-red-800 px-4 py-2 rounded mb-4">${esc(error)}</div>` : ''}

        <div class="bg-white rounded shadow p-4 mb-6">
          <h2 class="font-semibold mb-3">Add subscription</h2>
          <form method="POST" action="/admin/brand-digest/${esc(slug)}/add" class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input type="text" name="name" placeholder="Recipient name" class="border rounded px-3 py-2">
            <input type="email" name="email" placeholder="email@example.com" required class="border rounded px-3 py-2">
            <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Subscribe</button>
          </form>
        </div>

        <div class="flex gap-3 mb-4">
          <a href="/admin/brand-digest/${esc(slug)}/preview" target="_blank"
             class="px-3 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 text-sm">
            <i class="fas fa-eye mr-1"></i> Preview HTML
          </a>
          <form method="POST" action="/admin/brand-digest/${esc(slug)}/test" class="inline">
            <button type="submit" class="px-3 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 text-sm"
                    onclick="return confirm('Send a test digest now to all active subscribers?')">
              <i class="fas fa-paper-plane mr-1"></i> Send Test Now
            </button>
          </form>
        </div>

        <table class="w-full bg-white rounded shadow text-sm">
          <thead class="bg-gray-100">
            <tr>
              <th class="px-4 py-2 text-left border-b">Recipient</th>
              <th class="px-4 py-2 text-left border-b">Status</th>
              <th class="px-4 py-2 text-left border-b">Last Sent</th>
              <th class="px-4 py-2 text-left border-b">Created</th>
              <th class="px-4 py-2 border-b"></th>
            </tr>
          </thead>
          <tbody>${subRows || '<tr><td colspan="5" class="px-4 py-6 text-center text-gray-500">No subscriptions yet — add one above.</td></tr>'}</tbody>
        </table>
      </div>
    `,
  }))
})

// ─── MUTATIONS ──────────────────────────────────────────────────────────────

brandDigest.post('/:slug/add', async (c) => {
  const user = c.get('user')
  const slug = c.req.param('slug')
  const brand = await getBrandBySlug(c.env.DB, slug)
  if (!brand) return c.notFound()

  const form = await c.req.formData()
  const email = String(form.get('email') || '').trim().toLowerCase()
  const name = String(form.get('name') || '').trim() || null

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return c.redirect(`/admin/brand-digest/${slug}?error=Valid+email+required`)
  }

  await createSubscription(c.env.DB, {
    brand,
    email,
    name,
    frequency: 'weekly',
    created_by: user.id,
    created_by_name: user.name || user.email,
  })

  return c.redirect(`/admin/brand-digest/${slug}?success=Subscribed+${encodeURIComponent(email)}`)
})

brandDigest.post('/:slug/deactivate/:id', async (c) => {
  const slug = c.req.param('slug')
  const id = Number(c.req.param('id'))
  await deactivateSubscription(c.env.DB, id)
  return c.redirect(`/admin/brand-digest/${slug}`)
})

brandDigest.post('/:slug/activate/:id', async (c) => {
  const slug = c.req.param('slug')
  const id = Number(c.req.param('id'))
  await activateSubscription(c.env.DB, id)
  return c.redirect(`/admin/brand-digest/${slug}`)
})

// ─── PREVIEW ────────────────────────────────────────────────────────────────

brandDigest.get('/:slug/preview', async (c) => {
  const slug = c.req.param('slug')
  const brand = await getBrandBySlug(c.env.DB, slug)
  if (!brand) return c.notFound()
  const dash = await getBrandDashboard(c.env.DB, brand)
  if (!dash) return c.notFound()
  const html = buildBrandDigestHtml(dash, {
    recipientName: 'Preview',
    weekStart: new Date().toISOString().slice(0, 10),
  })
  return c.html(html)
})

// ─── TEST SEND ──────────────────────────────────────────────────────────────

brandDigest.post('/:slug/test', async (c) => {
  const slug = c.req.param('slug')
  const brand = await getBrandBySlug(c.env.DB, slug)
  if (!brand) return c.notFound()

  const env = c.env as any
  const result = await runBrandDigest(env, { reason: 'manual-test', filterBrand: brand })

  if (!result.ok) {
    return c.redirect(`/admin/brand-digest/${slug}?error=${encodeURIComponent(result.error || 'send failed')}`)
  }
  return c.redirect(`/admin/brand-digest/${slug}?success=Sent+to+${result.sent}+recipient(s)`)
})

export default brandDigest
