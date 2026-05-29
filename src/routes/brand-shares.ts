// ─────────────────────────────────────────────────────────────────────────
// Phase 13: Client-facing brand pages — admin token management UI
// ─────────────────────────────────────────────────────────────────────────
// Mounted at /admin/brand-shares. Auth inherited from parent admin chain.
//
// Sub-routes:
//   GET  /admin/brand-shares                       — index across all brands
//   GET  /admin/brand-shares/:slug                 — per-brand token management
//   POST /admin/brand-shares/:slug/create          — mint a new token
//   POST /admin/brand-shares/:slug/revoke/:id      — revoke a token
//   POST /admin/brand-shares/:slug/reactivate/:id  — undo revoke
//   GET  /admin/brand-shares/:slug/views/:id       — view audit panel

import { Hono } from 'hono'
import type { AuthUser } from '../lib/auth.js'
import { requireAuth } from '../middleware/auth.js'
import { layoutObj as layout } from '../lib/layout.js'
import { brandSlug, getBrandBySlug, listBrandSummaries } from '../lib/brand-stats.js'
import {
  listTokensForBrand,
  getTokenById,
  listRecentViews,
  createShareToken,
  revokeShareToken,
  reactivateShareToken,
  getViewStatsForBrand,
} from '../lib/brand-shares.js'

type Bindings = { DB: D1Database }
type Variables = { user: AuthUser }
const brandShares = new Hono<{ Bindings: Bindings; Variables: Variables }>()
brandShares.use('*', requireAuth)

// ─── helpers ────────────────────────────────────────────────────────────────

function esc(s: any): string {
  if (s === null || s === undefined) return ''
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function fmtDateTime(s: string | null | undefined): string {
  if (!s) return '—'
  return String(s).replace('T', ' ').replace(/\.\d+Z?$/, '').slice(0, 16)
}

// ─── INDEX ──────────────────────────────────────────────────────────────────

brandShares.get('/', async (c) => {
  const user = c.get('user')
  const brands = await listBrandSummaries(c.env.DB)

  // Get token counts per brand
  const tokenCountsResult = await c.env.DB.prepare(`
    SELECT brand,
           COUNT(*) AS total,
           SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) AS active_count,
           SUM(view_count) AS total_views
    FROM brand_share_tokens
    GROUP BY brand
  `).all<{ brand: string; total: number; active_count: number; total_views: number }>()
  const counts = new Map<string, { total: number; active_count: number; total_views: number }>()
  for (const r of tokenCountsResult.results || []) {
    counts.set(r.brand, { total: r.total, active_count: r.active_count, total_views: r.total_views })
  }

  const rows = brands.map(b => {
    const c = counts.get(b.brand) || { total: 0, active_count: 0, total_views: 0 }
    return `
      <tr class="hover:bg-gray-50">
        <td class="px-4 py-2 border-b">
          <a href="/admin/brand-shares/${esc(b.slug)}" class="text-blue-600 hover:underline font-medium">
            ${esc(b.brand)}
          </a>
          ${b.is_internal ? '<span class="ml-2 text-xs px-1.5 py-0.5 bg-gray-200 rounded">Internal</span>' : ''}
        </td>
        <td class="px-4 py-2 border-b text-center">${c.active_count}</td>
        <td class="px-4 py-2 border-b text-center text-gray-500">${c.total}</td>
        <td class="px-4 py-2 border-b text-center">${c.total_views}</td>
        <td class="px-4 py-2 border-b text-right">
          <a href="/admin/brand-shares/${esc(b.slug)}"
             class="text-sm px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">
            Manage
          </a>
        </td>
      </tr>
    `
  }).join('')

  return c.html(layout({
    title: 'Brand Share Links',
    user,
    body: `
      <div class="max-w-5xl mx-auto p-6">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h1 class="text-2xl font-bold">Brand Share Links</h1>
            <p class="text-sm text-gray-600 mt-1">
              Create read-only public links so brand owners can see their dashboard without logging in.
            </p>
          </div>
          <a href="/admin/stock" class="text-sm text-gray-600 hover:underline">← Back to Stock Admin</a>
        </div>
        <table class="w-full bg-white rounded shadow text-sm">
          <thead class="bg-gray-100">
            <tr>
              <th class="px-4 py-2 text-left border-b">Brand</th>
              <th class="px-4 py-2 text-center border-b">Active Links</th>
              <th class="px-4 py-2 text-center border-b">Total Links</th>
              <th class="px-4 py-2 text-center border-b">Total Views</th>
              <th class="px-4 py-2 border-b"></th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="5" class="px-4 py-6 text-center text-gray-500">No brands found</td></tr>'}</tbody>
        </table>
      </div>
    `,
  }))
})

// ─── PER-BRAND TOKEN MANAGEMENT ─────────────────────────────────────────────

brandShares.get('/:slug', async (c) => {
  const user = c.get('user')
  const slug = c.req.param('slug')
  const brand = await getBrandBySlug(c.env.DB, slug)
  if (!brand) return c.notFound()

  const tokens = await listTokensForBrand(c.env.DB, brand)
  const stats = await getViewStatsForBrand(c.env.DB, brand)

  // Build origin for full share URLs
  const url = new URL(c.req.url)
  const origin = `${url.protocol}//${url.host}`

  const tokenRows = tokens.map(t => {
    const fullUrl = `${origin}/public/brand/${t.token}`
    const isActive = t.active === 1
    return `
      <tr class="${isActive ? '' : 'bg-gray-50 text-gray-500'} hover:bg-gray-50">
        <td class="px-4 py-2 border-b">
          <div class="font-medium">${esc(t.label || '(no label)')}</div>
          ${t.recipient_email ? `<div class="text-xs text-gray-500">${esc(t.recipient_email)}</div>` : ''}
        </td>
        <td class="px-4 py-2 border-b">
          <div class="flex items-center gap-2">
            <input type="text" value="${esc(fullUrl)}" readonly
                   class="text-xs font-mono border rounded px-2 py-1 w-72 bg-gray-50"
                   onclick="this.select()" />
            <button type="button" onclick="navigator.clipboard.writeText('${esc(fullUrl)}'); this.textContent='Copied!'"
                    class="text-xs px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded">
              Copy
            </button>
          </div>
        </td>
        <td class="px-4 py-2 border-b text-center text-xs">
          ${isActive
            ? '<span class="px-2 py-0.5 bg-green-100 text-green-800 rounded">Active</span>'
            : '<span class="px-2 py-0.5 bg-red-100 text-red-800 rounded">Revoked</span>'}
        </td>
        <td class="px-4 py-2 border-b text-center">
          <a href="/admin/brand-shares/${esc(slug)}/views/${t.id}" class="text-blue-600 hover:underline">
            ${t.view_count}
          </a>
        </td>
        <td class="px-4 py-2 border-b text-xs text-gray-600">
          ${fmtDateTime(t.last_viewed_at)}
        </td>
        <td class="px-4 py-2 border-b text-xs text-gray-600">
          ${fmtDateTime(t.created_at)}<br>
          <span class="text-gray-400">by ${esc(t.created_by_name || '—')}</span>
        </td>
        <td class="px-4 py-2 border-b text-right">
          ${isActive
            ? `<form method="POST" action="/admin/brand-shares/${esc(slug)}/revoke/${t.id}" class="inline"
                     onsubmit="return confirm('Revoke this share link? The recipient will no longer be able to view.')">
                 <button type="submit" class="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700">
                   Revoke
                 </button>
               </form>`
            : `<form method="POST" action="/admin/brand-shares/${esc(slug)}/reactivate/${t.id}" class="inline">
                 <button type="submit" class="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700">
                   Reactivate
                 </button>
               </form>`}
        </td>
      </tr>
    `
  }).join('')

  return c.html(layout({
    title: `${brand} — Share Links`,
    user,
    body: `
      <div class="max-w-6xl mx-auto p-6">
        <div class="flex items-center justify-between mb-2">
          <h1 class="text-2xl font-bold">${esc(brand)} — Share Links</h1>
          <a href="/admin/brand-shares" class="text-sm text-gray-600 hover:underline">← All brands</a>
        </div>
        <p class="text-sm text-gray-600 mb-4">
          Public, read-only dashboard links. No internal financials.
          Active: <strong>${stats.active_tokens}</strong> ·
          Total minted: <strong>${stats.total_tokens}</strong> ·
          Total views: <strong>${stats.total_views}</strong>
        </p>

        <!-- Create new -->
        <div class="bg-white rounded shadow p-4 mb-6">
          <h2 class="font-semibold mb-3">Create new share link</h2>
          <form method="POST" action="/admin/brand-shares/${esc(slug)}/create" class="flex flex-wrap gap-3">
            <input type="text" name="label" placeholder="Label (e.g., SAB Brand Marketing)"
                   class="border rounded px-3 py-2 flex-1 min-w-64" required>
            <input type="email" name="recipient_email" placeholder="Recipient email (optional)"
                   class="border rounded px-3 py-2 flex-1 min-w-64">
            <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
              Mint Link
            </button>
          </form>
        </div>

        <!-- Existing tokens -->
        <table class="w-full bg-white rounded shadow text-sm">
          <thead class="bg-gray-100">
            <tr>
              <th class="px-4 py-2 text-left border-b">Label</th>
              <th class="px-4 py-2 text-left border-b">Share URL</th>
              <th class="px-4 py-2 text-center border-b">Status</th>
              <th class="px-4 py-2 text-center border-b">Views</th>
              <th class="px-4 py-2 text-left border-b">Last Viewed</th>
              <th class="px-4 py-2 text-left border-b">Created</th>
              <th class="px-4 py-2 border-b"></th>
            </tr>
          </thead>
          <tbody>
            ${tokenRows || '<tr><td colspan="7" class="px-4 py-6 text-center text-gray-500">No share links yet — create one above.</td></tr>'}
          </tbody>
        </table>
      </div>
    `,
  }))
})

// ─── MUTATIONS ──────────────────────────────────────────────────────────────

brandShares.post('/:slug/create', async (c) => {
  const user = c.get('user')
  const slug = c.req.param('slug')
  const brand = await getBrandBySlug(c.env.DB, slug)
  if (!brand) return c.notFound()

  const form = await c.req.formData()
  const label = String(form.get('label') || '').trim()
  const recipient = String(form.get('recipient_email') || '').trim() || null

  if (!label) {
    return c.redirect(`/admin/brand-shares/${slug}?error=Label+required`)
  }

  await createShareToken(c.env.DB, {
    brand,
    label,
    recipient_email: recipient,
    user,
  })

  return c.redirect(`/admin/brand-shares/${slug}`)
})

brandShares.post('/:slug/revoke/:id', async (c) => {
  const user = c.get('user')
  const slug = c.req.param('slug')
  const id = Number(c.req.param('id'))
  await revokeShareToken(c.env.DB, id, user)
  return c.redirect(`/admin/brand-shares/${slug}`)
})

brandShares.post('/:slug/reactivate/:id', async (c) => {
  const slug = c.req.param('slug')
  const id = Number(c.req.param('id'))
  await reactivateShareToken(c.env.DB, id)
  return c.redirect(`/admin/brand-shares/${slug}`)
})

// ─── VIEW AUDIT PANEL ───────────────────────────────────────────────────────

brandShares.get('/:slug/views/:id', async (c) => {
  const user = c.get('user')
  const slug = c.req.param('slug')
  const id = Number(c.req.param('id'))
  const token = await getTokenById(c.env.DB, id)
  if (!token) return c.notFound()

  const views = await listRecentViews(c.env.DB, id, 100)

  const rows = views.map(v => `
    <tr class="hover:bg-gray-50">
      <td class="px-4 py-2 border-b text-xs">${fmtDateTime(v.viewed_at)}</td>
      <td class="px-4 py-2 border-b text-xs font-mono">${esc(v.ip_address || '—')}</td>
      <td class="px-4 py-2 border-b text-xs text-gray-600">${esc((v.user_agent || '').slice(0, 80))}</td>
      <td class="px-4 py-2 border-b text-xs text-gray-600">${esc((v.referrer || '').slice(0, 60))}</td>
    </tr>
  `).join('')

  return c.html(layout({
    title: `View audit — ${token.label || token.token.slice(0, 8)}`,
    user,
    body: `
      <div class="max-w-5xl mx-auto p-6">
        <div class="flex items-center justify-between mb-4">
          <h1 class="text-2xl font-bold">View Audit</h1>
          <a href="/admin/brand-shares/${esc(slug)}" class="text-sm text-gray-600 hover:underline">← Back</a>
        </div>
        <div class="bg-white rounded shadow p-4 mb-4 text-sm">
          <div><strong>Brand:</strong> ${esc(token.brand)}</div>
          <div><strong>Label:</strong> ${esc(token.label || '—')}</div>
          <div><strong>Recipient:</strong> ${esc(token.recipient_email || '—')}</div>
          <div><strong>Total views:</strong> ${token.view_count}</div>
          <div><strong>Last viewed:</strong> ${fmtDateTime(token.last_viewed_at)} from ${esc(token.last_viewed_ip || '—')}</div>
        </div>
        <table class="w-full bg-white rounded shadow text-sm">
          <thead class="bg-gray-100">
            <tr>
              <th class="px-4 py-2 text-left border-b">When</th>
              <th class="px-4 py-2 text-left border-b">IP</th>
              <th class="px-4 py-2 text-left border-b">User Agent</th>
              <th class="px-4 py-2 text-left border-b">Referrer</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="4" class="px-4 py-6 text-center text-gray-500">No views recorded yet.</td></tr>'}</tbody>
        </table>
      </div>
    `,
  }))
})

export default brandShares
