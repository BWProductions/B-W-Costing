// ─────────────────────────────────────────────────────────────────────────
// Phase 8: Brand owner dashboards — UI routes
// ─────────────────────────────────────────────────────────────────────────
// Mounted under /admin/brands. Read-only — no schema changes.
//
// Sub-routes:
//   GET  /admin/brands               — index: one tile per brand
//   GET  /admin/brands/:slug         — per-brand 360° dashboard
//   GET  /admin/brands/:slug.csv     — CSV download of brand's stock items
//
// Auth is inherited from the parent admin auth chain (same as /admin/stock).

import { Hono } from 'hono'
import type { AuthUser } from '../lib/auth.js'
import { layout } from '../lib/layout.js'
import {
  brandSlug,
  INTERNAL_BRAND,
  listBrandSummaries,
  getBrandBySlug,
  getBrandDashboard,
  getBrandItemsCsv,
  type BrandSummary,
  type BrandDashboard,
} from '../lib/brand-stats.js'

type Bindings = { DB: D1Database }
type Variables = { user: AuthUser }
const brands = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// ─── helpers ────────────────────────────────────────────────────────────────

function esc(s: any): string {
  if (s === null || s === undefined) return ''
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return ''
  // Accept either ISO or YYYY-MM-DD
  return String(s).slice(0, 10)
}

function fmtDateTime(s: string | null | undefined): string {
  if (!s) return ''
  return String(s).replace('T', ' ').replace(/\.\d+Z?$/, '').slice(0, 16)
}

function n(x: any): number {
  const v = Number(x); return Number.isFinite(v) ? v : 0
}

// Pick a consistent accent colour per brand from its slug
function brandAccent(slug: string): string {
  const palette = [
    '#C9A84C', // BW gold
    '#FF7A00', // flame orange
    '#1D6BFF', // flame blue
    '#7CFF2B', // flame green
    '#18D9FF', // flame cyan
    '#CC18E8', // flame magenta
    '#FFD400', // flame yellow
    '#FF4A1C', // flame red
  ]
  let h = 0
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0
  return palette[h % palette.length]
}

function chip(label: string, color: string, bg?: string): string {
  return `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;background:${bg || color + '22'};color:${color};font-size:11px;font-weight:700;letter-spacing:0.3px;border:1px solid ${color}55">${esc(label)}</span>`
}

function statusBadge(status: string): string {
  const map: Record<string, { c: string; bg: string }> = {
    active:     { c: '#10b981', bg: '#10b98122' },
    in_use:     { c: '#3b82f6', bg: '#3b82f622' },
    maintenance:{ c: '#f59e0b', bg: '#f59e0b22' },
    retired:    { c: '#6b7280', bg: '#6b728022' },
  }
  const k = (status || '').toLowerCase()
  const s = map[k] || { c: '#9ca3af', bg: '#9ca3af22' }
  return chip(status || 'unknown', s.c, s.bg)
}

// ─── Index page: /admin/brands ────────────────────────────────────────────

brands.get('/', async (c) => {
  const user = c.get('user')
  const db = c.env.DB
  const summaries = await listBrandSummaries(db)

  // Totals row
  const totalItems = summaries.reduce((s, r) => s + n(r.item_count), 0)
  const totalUnits = summaries.reduce((s, r) => s + n(r.unit_count), 0)
  const totalShort = summaries.reduce((s, r) => s + n(r.open_shortages), 0)
  const totalUpcoming = summaries.reduce((s, r) => s + n(r.upcoming_events_30d), 0)

  const statCards = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px">
      <div class="card" style="padding:14px">
        <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px">Brands</div>
        <div style="font-size:28px;font-weight:700;color:#C9A84C">${summaries.length}</div>
      </div>
      <div class="card" style="padding:14px">
        <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px">Stock items</div>
        <div style="font-size:28px;font-weight:700;color:#e5e7eb">${totalItems.toLocaleString()}</div>
      </div>
      <div class="card" style="padding:14px">
        <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px">Units on hand</div>
        <div style="font-size:28px;font-weight:700;color:#10b981">${totalUnits.toLocaleString()}</div>
      </div>
      <div class="card" style="padding:14px">
        <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px">Open shortages</div>
        <div style="font-size:28px;font-weight:700;color:${totalShort > 0 ? '#ff7a66' : '#6b7280'}">${totalShort}</div>
      </div>
      <div class="card" style="padding:14px">
        <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px">Events next 30d</div>
        <div style="font-size:28px;font-weight:700;color:#18D9FF">${totalUpcoming}</div>
      </div>
    </div>
  `

  // Tiles
  const tiles = summaries.map(s => {
    const accent = s.is_internal ? '#C9A84C' : brandAccent(s.slug)
    const internalChip = s.is_internal
      ? `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;background:#C9A84C22;color:#C9A84C;font-size:10px;font-weight:700;letter-spacing:0.5px;border:1px solid #C9A84C55;text-transform:uppercase">Internal</span>`
      : ''
    const ownerChip = s.ownership
      ? `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;background:#3b82f622;color:#93c5fd;font-size:10px;font-weight:600;border:1px solid #3b82f655">${esc(s.ownership)}</span>`
      : ''
    const shortBadge = s.open_shortages > 0
      ? `<span style="color:#ff7a66"><i class="fas fa-triangle-exclamation"></i> ${s.open_shortages} short</span>`
      : ''
    const lowBadge = s.low_stock_count > 0
      ? `<span style="color:#f59e0b"><i class="fas fa-battery-quarter"></i> ${s.low_stock_count} low</span>`
      : ''
    const evBadge = s.upcoming_events_30d > 0
      ? `<span style="color:#18D9FF"><i class="fas fa-calendar-week"></i> ${s.upcoming_events_30d} upcoming</span>`
      : ''
    const fieldBadge = s.recent_field_count > 0
      ? `<span style="color:#a855f7"><i class="fas fa-clipboard-check"></i> ${s.recent_field_count} field</span>`
      : ''

    return `
      <a href="/admin/brands/${esc(s.slug)}" class="card" style="
        display:block;padding:16px;text-decoration:none;color:inherit;
        border-left:4px solid ${accent};
        transition:transform 0.1s ease, box-shadow 0.1s ease;
      " onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 20px rgba(0,0,0,0.4)'"
         onmouseout="this.style.transform='';this.style.boxShadow=''">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px">
          <div style="font-size:16px;font-weight:700;color:#e5e7eb">${esc(s.brand)}</div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end">${internalChip}${ownerChip}</div>
        </div>
        <div style="display:flex;gap:14px;margin-bottom:10px">
          <div>
            <div style="font-size:10px;color:#9ca3af;text-transform:uppercase">Items</div>
            <div style="font-size:20px;font-weight:700;color:${accent}">${s.item_count}</div>
          </div>
          <div>
            <div style="font-size:10px;color:#9ca3af;text-transform:uppercase">Units</div>
            <div style="font-size:20px;font-weight:700;color:#e5e7eb">${n(s.unit_count).toLocaleString()}</div>
          </div>
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:11px;color:#9ca3af">
          ${shortBadge}${lowBadge}${evBadge}${fieldBadge}
          ${!shortBadge && !lowBadge && !evBadge && !fieldBadge ? '<span style="color:#6b7280">No alerts</span>' : ''}
        </div>
      </a>
    `
  }).join('')

  const body = `
    <div style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <div>
          <h1 style="margin:0;color:#C9A84C;font-size:24px"><i class="fas fa-tags"></i> Brand Dashboards</h1>
          <div style="color:#9ca3af;font-size:13px;margin-top:4px">360° view per brand — stock, events, shortages, field activity</div>
        </div>
        <div style="display:flex;gap:8px">
          <a href="/admin/stock" class="btn btn-outline"><i class="fas fa-arrow-left"></i> Back to Stock Admin</a>
        </div>
      </div>
    </div>

    ${statCards}

    ${summaries.length === 0
      ? `<div class="card" style="padding:40px;text-align:center;color:#9ca3af">
           <i class="fas fa-tags" style="font-size:32px;color:#374151"></i>
           <div style="margin-top:12px">No brands found in active stock yet.</div>
         </div>`
      : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px">${tiles}</div>`
    }
  `
  return c.html(layout('Brand Dashboards', body, user, 'stock-admin'))
})

// ─── CSV download: /admin/brands/:slug.csv ────────────────────────────────
// MUST come before the generic /:slug route or Hono won't match the extension.

brands.get('/:slug{.+\\.csv}', async (c) => {
  const slugWithExt = c.req.param('slug')
  const slug = slugWithExt.replace(/\.csv$/, '')
  const db = c.env.DB
  const brand = await getBrandBySlug(db, slug)
  if (!brand) return c.text('Brand not found', 404)
  const csv = await getBrandItemsCsv(db, brand)
  const fname = `brand-${slug}-${new Date().toISOString().slice(0, 10)}.csv`
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fname}"`,
      'Cache-Control': 'no-store',
    },
  })
})

// ─── Per-brand dashboard: /admin/brands/:slug ─────────────────────────────

brands.get('/:slug', async (c) => {
  const user = c.get('user')
  const slug = c.req.param('slug')
  const db = c.env.DB
  const brand = await getBrandBySlug(db, slug)
  if (!brand) {
    const body = `
      <div style="margin-bottom:16px">
        <a href="/admin/brands" class="btn btn-outline"><i class="fas fa-arrow-left"></i> Back to Brands</a>
      </div>
      <div class="card" style="padding:40px;text-align:center;color:#9ca3af">
        <i class="fas fa-circle-question" style="font-size:32px;color:#374151"></i>
        <h2 style="color:#e5e7eb;margin:12px 0 4px">Brand not found</h2>
        <div>No active stock items match the slug <code style="color:#C9A84C">${esc(slug)}</code>.</div>
      </div>
    `
    return c.html(layout('Brand not found', body, user, 'stock-admin'), 404)
  }

  const d: BrandDashboard | null = await getBrandDashboard(db, brand)
  if (!d) {
    const body = `
      <div style="margin-bottom:16px">
        <a href="/admin/brands" class="btn btn-outline"><i class="fas fa-arrow-left"></i> Back to Brands</a>
      </div>
      <div class="card" style="padding:40px;text-align:center;color:#9ca3af">No data for ${esc(brand)}.</div>
    `
    return c.html(layout(brand, body, user, 'stock-admin'), 404)
  }

  const accent = d.is_internal ? '#C9A84C' : brandAccent(d.slug)

  // ── Header bar ──
  const internalChip = d.is_internal
    ? chip('Internal', '#C9A84C')
    : ''
  const ownerChip = d.ownership ? chip(d.ownership, '#93c5fd') : ''

  const header = `
    <div style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">
        <div style="flex:1;min-width:240px">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <h1 style="margin:0;color:${accent};font-size:26px">
              <i class="fas fa-tag"></i> ${esc(d.brand)}
            </h1>
            ${internalChip} ${ownerChip}
          </div>
          <div style="color:#9ca3af;font-size:13px;margin-top:4px">
            ${d.item_count} item${d.item_count === 1 ? '' : 's'} · ${n(d.unit_count).toLocaleString()} units on hand
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <a href="/admin/brands" class="btn btn-outline"><i class="fas fa-arrow-left"></i> All Brands</a>
          <a href="/admin/brands/${esc(d.slug)}.csv" class="btn btn-outline" style="color:#a855f7;border-color:#a855f7">
            <i class="fas fa-file-csv"></i> Download CSV
          </a>
        </div>
      </div>
    </div>
  `

  // ── Stat strip ──
  const upcomingCount = d.upcoming_events.length
  const shortCount = d.open_shortages.length
  const lowCount = d.low_stock_items.length
  const fieldCount = d.recent_field.length
  const stats = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:16px">
      <div class="card" style="padding:12px;border-left:3px solid ${accent}">
        <div style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px">Items</div>
        <div style="font-size:24px;font-weight:700;color:${accent}">${d.item_count}</div>
      </div>
      <div class="card" style="padding:12px;border-left:3px solid #10b981">
        <div style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px">Units</div>
        <div style="font-size:24px;font-weight:700;color:#10b981">${n(d.unit_count).toLocaleString()}</div>
      </div>
      <div class="card" style="padding:12px;border-left:3px solid ${upcomingCount > 0 ? '#18D9FF' : '#374151'}">
        <div style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px">Events 60d</div>
        <div style="font-size:24px;font-weight:700;color:${upcomingCount > 0 ? '#18D9FF' : '#6b7280'}">${upcomingCount}</div>
      </div>
      <div class="card" style="padding:12px;border-left:3px solid ${shortCount > 0 ? '#ff7a66' : '#374151'}">
        <div style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px">Open shortages</div>
        <div style="font-size:24px;font-weight:700;color:${shortCount > 0 ? '#ff7a66' : '#6b7280'}">${shortCount}</div>
      </div>
      <div class="card" style="padding:12px;border-left:3px solid ${lowCount > 0 ? '#f59e0b' : '#374151'}">
        <div style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px">Low stock</div>
        <div style="font-size:24px;font-weight:700;color:${lowCount > 0 ? '#f59e0b' : '#6b7280'}">${lowCount}</div>
      </div>
      <div class="card" style="padding:12px;border-left:3px solid ${fieldCount > 0 ? '#a855f7' : '#374151'}">
        <div style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px">Field 30d</div>
        <div style="font-size:24px;font-weight:700;color:${fieldCount > 0 ? '#a855f7' : '#6b7280'}">${fieldCount}</div>
      </div>
    </div>
  `

  // ── Custody breakdown ──
  const custodyBlock = d.custody_breakdown.length === 0 ? '' : `
    <div class="card" style="padding:14px;margin-bottom:16px">
      <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Custody breakdown</div>
      <div style="display:flex;flex-wrap:wrap;gap:10px">
        ${d.custody_breakdown.map(c => `
          <div style="background:#0d1117;border:1px solid #21262d;border-radius:8px;padding:10px 14px;min-width:140px">
            <div style="font-size:11px;color:#9ca3af;text-transform:uppercase">${esc(c.custody_type || 'unknown')}</div>
            <div style="font-size:18px;font-weight:700;color:#e5e7eb">${c.items} items</div>
            <div style="font-size:12px;color:#9ca3af">${n(c.units).toLocaleString()} units</div>
          </div>
        `).join('')}
      </div>
    </div>
  `

  // ── Trend bars (4 weeks) ──
  const maxMv = Math.max(1, ...d.trend_weeks.map(w => w.movements))
  const trendBlock = `
    <div class="card" style="padding:14px;margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px">
        <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px">4-week activity</div>
        <div style="font-size:10px;color:#6b7280">stock_movements · weekly</div>
      </div>
      <div style="display:flex;align-items:flex-end;gap:14px;height:120px">
        ${d.trend_weeks.map(w => {
          const pct = Math.round((w.movements / maxMv) * 100)
          const allocPct = w.movements > 0 ? Math.round((w.allocations / w.movements) * 100) : 0
          return `
            <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0">
              <div style="font-size:11px;color:${accent};font-weight:700">${w.movements}</div>
              <div style="width:100%;max-width:80px;height:80px;background:#0d1117;border-radius:6px;position:relative;overflow:hidden;border:1px solid #21262d">
                <div style="position:absolute;bottom:0;left:0;right:0;background:${accent};height:${pct}%;transition:height 0.3s">
                  <div style="position:absolute;bottom:0;left:0;right:0;background:#18D9FF;height:${allocPct}%"></div>
                </div>
              </div>
              <div style="font-size:10px;color:#9ca3af">${fmtDate(w.week_start).slice(5)}</div>
              ${w.allocations > 0 ? `<div style="font-size:9px;color:#18D9FF">${w.allocations} alloc</div>` : ''}
            </div>
          `
        }).join('')}
      </div>
      <div style="display:flex;gap:14px;margin-top:8px;font-size:10px;color:#9ca3af">
        <span><span style="display:inline-block;width:10px;height:10px;background:${accent};border-radius:2px;vertical-align:middle"></span> all movements</span>
        <span><span style="display:inline-block;width:10px;height:10px;background:#18D9FF;border-radius:2px;vertical-align:middle"></span> allocations</span>
      </div>
    </div>
  `

  // ── Top items table ──
  const topItemsBlock = d.items_top.length === 0 ? '' : `
    <div class="card" style="padding:0;margin-bottom:16px;overflow:hidden">
      <div style="padding:12px 14px;border-bottom:1px solid #21262d;display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:13px;color:#e5e7eb;font-weight:700"><i class="fas fa-boxes-stacked"></i> Top items by quantity</div>
        <div style="font-size:11px;color:#9ca3af">showing top ${d.items_top.length}</div>
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead style="background:#0d1117">
            <tr>
              <th style="text-align:left;padding:8px 12px;color:#9ca3af;font-size:11px;text-transform:uppercase;font-weight:600">Description</th>
              <th style="text-align:right;padding:8px 12px;color:#9ca3af;font-size:11px;text-transform:uppercase;font-weight:600">Qty</th>
              <th style="text-align:left;padding:8px 12px;color:#9ca3af;font-size:11px;text-transform:uppercase;font-weight:600">Location</th>
              <th style="text-align:left;padding:8px 12px;color:#9ca3af;font-size:11px;text-transform:uppercase;font-weight:600">Custody</th>
              <th style="text-align:left;padding:8px 12px;color:#9ca3af;font-size:11px;text-transform:uppercase;font-weight:600">Status</th>
            </tr>
          </thead>
          <tbody>
            ${d.items_top.map(it => `
              <tr style="border-top:1px solid #21262d">
                <td style="padding:8px 12px;color:#e5e7eb">
                  <a href="/admin/stock/${it.id}" style="color:#e5e7eb;text-decoration:none">${esc(it.description)}</a>
                </td>
                <td style="padding:8px 12px;text-align:right;color:${accent};font-weight:700">${n(it.qty_on_hand).toLocaleString()}</td>
                <td style="padding:8px 12px;color:#9ca3af">${esc(it.location || '—')}</td>
                <td style="padding:8px 12px;color:#9ca3af">${esc(it.custody_type || '—')}</td>
                <td style="padding:8px 12px">${statusBadge(it.status)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `

  // ── Low stock alert ──
  const lowStockBlock = d.low_stock_items.length === 0 ? '' : `
    <div class="card" style="padding:0;margin-bottom:16px;overflow:hidden;border-left:3px solid #f59e0b">
      <div style="padding:12px 14px;border-bottom:1px solid #21262d">
        <div style="font-size:13px;color:#f59e0b;font-weight:700"><i class="fas fa-battery-quarter"></i> Low stock — needs replenishment</div>
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead style="background:#0d1117">
            <tr>
              <th style="text-align:left;padding:8px 12px;color:#9ca3af;font-size:11px;text-transform:uppercase;font-weight:600">Item</th>
              <th style="text-align:right;padding:8px 12px;color:#9ca3af;font-size:11px;text-transform:uppercase;font-weight:600">On hand</th>
              <th style="text-align:right;padding:8px 12px;color:#9ca3af;font-size:11px;text-transform:uppercase;font-weight:600">Threshold</th>
              <th style="text-align:right;padding:8px 12px;color:#9ca3af;font-size:11px;text-transform:uppercase;font-weight:600">Deficit</th>
            </tr>
          </thead>
          <tbody>
            ${d.low_stock_items.map(it => `
              <tr style="border-top:1px solid #21262d">
                <td style="padding:8px 12px;color:#e5e7eb">
                  <a href="/admin/stock/${it.id}" style="color:#e5e7eb;text-decoration:none">${esc(it.description)}</a>
                </td>
                <td style="padding:8px 12px;text-align:right;color:#f59e0b;font-weight:700">${n(it.qty_on_hand)}</td>
                <td style="padding:8px 12px;text-align:right;color:#9ca3af">${n(it.low_stock_threshold)}</td>
                <td style="padding:8px 12px;text-align:right;color:#ff7a66;font-weight:700">${n(it.deficit)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `

  // ── Upcoming events ──
  const upcomingBlock = d.upcoming_events.length === 0
    ? `<div class="card" style="padding:14px;margin-bottom:16px">
         <div style="font-size:13px;color:#9ca3af"><i class="fas fa-calendar-week"></i> No upcoming events in the next 60 days using this brand's stock.</div>
       </div>`
    : `
    <div class="card" style="padding:0;margin-bottom:16px;overflow:hidden">
      <div style="padding:12px 14px;border-bottom:1px solid #21262d">
        <div style="font-size:13px;color:#e5e7eb;font-weight:700"><i class="fas fa-calendar-week"></i> Upcoming events (next 60 days)</div>
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead style="background:#0d1117">
            <tr>
              <th style="text-align:left;padding:8px 12px;color:#9ca3af;font-size:11px;text-transform:uppercase;font-weight:600">Date</th>
              <th style="text-align:left;padding:8px 12px;color:#9ca3af;font-size:11px;text-transform:uppercase;font-weight:600">Event</th>
              <th style="text-align:left;padding:8px 12px;color:#9ca3af;font-size:11px;text-transform:uppercase;font-weight:600">Status</th>
              <th style="text-align:right;padding:8px 12px;color:#9ca3af;font-size:11px;text-transform:uppercase;font-weight:600">Lines</th>
              <th style="text-align:right;padding:8px 12px;color:#9ca3af;font-size:11px;text-transform:uppercase;font-weight:600">Qty</th>
            </tr>
          </thead>
          <tbody>
            ${d.upcoming_events.map(ev => `
              <tr style="border-top:1px solid #21262d">
                <td style="padding:8px 12px;color:#18D9FF;font-weight:600">${esc(fmtDate(ev.event_date))}</td>
                <td style="padding:8px 12px;color:#e5e7eb">
                  <a href="/calendar/${ev.event_id}" style="color:#e5e7eb;text-decoration:none">${esc(ev.event_name)}</a>
                </td>
                <td style="padding:8px 12px">${statusBadge(ev.status)}</td>
                <td style="padding:8px 12px;text-align:right;color:#9ca3af">${n(ev.line_count)}</td>
                <td style="padding:8px 12px;text-align:right;color:${accent};font-weight:700">${n(ev.total_qty).toLocaleString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `

  // ── Open shortages ──
  const shortagesBlock = d.open_shortages.length === 0 ? '' : `
    <div class="card" style="padding:0;margin-bottom:16px;overflow:hidden;border-left:3px solid #ff7a66">
      <div style="padding:12px 14px;border-bottom:1px solid #21262d;display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:13px;color:#ff7a66;font-weight:700"><i class="fas fa-triangle-exclamation"></i> Open shortages</div>
        <a href="/admin/stock/shortages" class="btn btn-outline" style="font-size:11px;padding:4px 10px;color:#ff7a66;border-color:#ff7a66">View all</a>
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead style="background:#0d1117">
            <tr>
              <th style="text-align:left;padding:8px 12px;color:#9ca3af;font-size:11px;text-transform:uppercase;font-weight:600">Event</th>
              <th style="text-align:left;padding:8px 12px;color:#9ca3af;font-size:11px;text-transform:uppercase;font-weight:600">Item</th>
              <th style="text-align:right;padding:8px 12px;color:#9ca3af;font-size:11px;text-transform:uppercase;font-weight:600">Short by</th>
              <th style="text-align:right;padding:8px 12px;color:#9ca3af;font-size:11px;text-transform:uppercase;font-weight:600">On hand</th>
              <th style="text-align:left;padding:8px 12px;color:#9ca3af;font-size:11px;text-transform:uppercase;font-weight:600">Raised</th>
            </tr>
          </thead>
          <tbody>
            ${d.open_shortages.map(s => `
              <tr style="border-top:1px solid #21262d">
                <td style="padding:8px 12px;color:#e5e7eb">
                  <div style="color:#18D9FF;font-size:11px">${esc(fmtDate(s.event_date))}</div>
                  <a href="/calendar/${s.event_id}" style="color:#e5e7eb;text-decoration:none">${esc(s.event_name)}</a>
                </td>
                <td style="padding:8px 12px;color:#e5e7eb">
                  <a href="/admin/stock/${s.stock_item_id}" style="color:#e5e7eb;text-decoration:none">${esc(s.description)}</a>
                </td>
                <td style="padding:8px 12px;text-align:right;color:#ff7a66;font-weight:700">${n(s.quantity_short)}</td>
                <td style="padding:8px 12px;text-align:right;color:#9ca3af">${n(s.qty_on_hand)}</td>
                <td style="padding:8px 12px;color:#9ca3af;font-size:11px">${esc(fmtDateTime(s.created_at))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `

  // ── Field activity ──
  const fieldFormCounts = Object.entries(d.field_counts_30d)
    .sort((a, b) => b[1] - a[1])
  const fieldCountChips = fieldFormCounts.length === 0 ? '' :
    fieldFormCounts.map(([ft, n]) => chip(`${ft}: ${n}`, '#a855f7')).join(' ')

  const fieldBlock = d.recent_field.length === 0
    ? (fieldFormCounts.length === 0
        ? `<div class="card" style="padding:14px;margin-bottom:16px">
             <div style="font-size:13px;color:#9ca3af"><i class="fas fa-clipboard-check"></i> No field activity tagged to this brand in the last 30 days.</div>
           </div>`
        : '')
    : `
    <div class="card" style="padding:0;margin-bottom:16px;overflow:hidden">
      <div style="padding:12px 14px;border-bottom:1px solid #21262d;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <div style="font-size:13px;color:#e5e7eb;font-weight:700"><i class="fas fa-clipboard-check"></i> Recent field activity (30 days)</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap">${fieldCountChips}</div>
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead style="background:#0d1117">
            <tr>
              <th style="text-align:left;padding:8px 12px;color:#9ca3af;font-size:11px;text-transform:uppercase;font-weight:600">When</th>
              <th style="text-align:left;padding:8px 12px;color:#9ca3af;font-size:11px;text-transform:uppercase;font-weight:600">Type</th>
              <th style="text-align:left;padding:8px 12px;color:#9ca3af;font-size:11px;text-transform:uppercase;font-weight:600">Form #</th>
              <th style="text-align:left;padding:8px 12px;color:#9ca3af;font-size:11px;text-transform:uppercase;font-weight:600">Event</th>
              <th style="text-align:left;padding:8px 12px;color:#9ca3af;font-size:11px;text-transform:uppercase;font-weight:600">Brand tag</th>
            </tr>
          </thead>
          <tbody>
            ${d.recent_field.map(f => `
              <tr style="border-top:1px solid #21262d">
                <td style="padding:8px 12px;color:#9ca3af;font-size:11px">${esc(fmtDateTime(f.created_at))}</td>
                <td style="padding:8px 12px">${chip(f.form_type || '—', '#a855f7')}</td>
                <td style="padding:8px 12px;color:#e5e7eb;font-family:monospace;font-size:12px">${esc(f.form_number || '—')}</td>
                <td style="padding:8px 12px;color:#e5e7eb">${esc(f.event_name || '—')}</td>
                <td style="padding:8px 12px;color:#9ca3af">${esc(f.brand || '—')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `

  // ── Compose body ──
  const body = `
    ${header}
    ${stats}
    ${custodyBlock}
    ${trendBlock}
    ${lowStockBlock}
    ${shortagesBlock}
    ${upcomingBlock}
    ${topItemsBlock}
    ${fieldBlock}

    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #21262d;font-size:11px;color:#6b7280">
      Brand identifier: <code style="color:#9ca3af">${esc(d.brand)}</code> ·
      Slug: <code style="color:#9ca3af">${esc(d.slug)}</code> ·
      Source: stock_items, calendar_event_equipment, stock_shortages, stock_movements, field_submissions, lexicon_brand_map
    </div>
  `

  return c.html(layout(`${d.brand} — Brand Dashboard`, body, user, 'stock-admin'))
})

export default brands
