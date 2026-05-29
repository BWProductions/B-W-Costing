// ─────────────────────────────────────────────────────────────────────────
// Phase 17: Brand owner weekly digest — HTML builder + send orchestrator
// ─────────────────────────────────────────────────────────────────────────
//
// Schema (migration 0035):
//   brand_digest_subscriptions — one row per brand × recipient email
//
// Cron flow:
//   1. POST /api/cron/brand-digest with Bearer BRAND_DIGEST_WEBHOOK_TOKEN
//   2. For each active subscription (frequency='weekly'), call
//      buildBrandDigestHtml() and send via Resend.
//   3. Update last_sent_at.
//
// Sending uses the same Resend integration as accounts digest.

import { getBrandDashboard, type BrandDashboard } from './brand-stats.js'

// ─── Types ──────────────────────────────────────────────────────────────────

export type BrandDigestEnv = {
  DB: D1Database
  RESEND_API_KEY?: string
  // For including share link in the email
  PUBLIC_BASE_URL?: string
}

export type BrandSubscription = {
  id: number
  brand: string
  email: string
  name: string | null
  frequency: string
  active: number
  last_sent_at: string | null
  created_by: number | null
  created_by_name: string | null
  created_at: string
}

// ─── Subscription queries ───────────────────────────────────────────────────

export async function listSubscriptionsForBrand(
  db: D1Database,
  brand: string
): Promise<BrandSubscription[]> {
  const r = await db.prepare(`
    SELECT * FROM brand_digest_subscriptions
    WHERE brand = ?
    ORDER BY active DESC, created_at DESC
  `).bind(brand).all<BrandSubscription>()
  return r.results || []
}

export async function listAllActiveSubscriptions(
  db: D1Database,
  frequency: string = 'weekly'
): Promise<BrandSubscription[]> {
  const r = await db.prepare(`
    SELECT * FROM brand_digest_subscriptions
    WHERE active = 1 AND frequency = ?
    ORDER BY brand, email
  `).bind(frequency).all<BrandSubscription>()
  return r.results || []
}

export async function createSubscription(
  db: D1Database,
  args: {
    brand: string
    email: string
    name?: string | null
    frequency?: string
    created_by: number
    created_by_name: string
  }
): Promise<void> {
  await db.prepare(`
    INSERT OR REPLACE INTO brand_digest_subscriptions
      (brand, email, name, frequency, active, created_by, created_by_name, created_at)
    VALUES (?, ?, ?, ?, 1, ?, ?, CURRENT_TIMESTAMP)
  `).bind(
    args.brand,
    args.email.toLowerCase().trim(),
    args.name || null,
    args.frequency || 'weekly',
    args.created_by,
    args.created_by_name,
  ).run()
}

export async function deactivateSubscription(
  db: D1Database,
  id: number
): Promise<void> {
  await db.prepare(`UPDATE brand_digest_subscriptions SET active = 0 WHERE id = ?`).bind(id).run()
}

export async function activateSubscription(
  db: D1Database,
  id: number
): Promise<void> {
  await db.prepare(`UPDATE brand_digest_subscriptions SET active = 1 WHERE id = ?`).bind(id).run()
}

export async function markSubscriptionSent(
  db: D1Database,
  id: number
): Promise<void> {
  await db.prepare(`UPDATE brand_digest_subscriptions SET last_sent_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(id).run()
}

// ─── HTML builder ───────────────────────────────────────────────────────────

function esc(s: any): string {
  if (s === null || s === undefined) return ''
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return ''
  return String(s).slice(0, 10)
}

/**
 * Build an HTML email body summarising the brand's week.
 * Same data philosophy as the public share view — no internal financials.
 */
export function buildBrandDigestHtml(
  dash: BrandDashboard,
  opts: {
    recipientName?: string | null
    shareUrl?: string | null
    weekStart?: string
  } = {}
): string {
  const greeting = opts.recipientName ? `Hi ${esc(opts.recipientName)},` : 'Hi,'
  const weekLabel = opts.weekStart ? ` (week of ${esc(opts.weekStart)})` : ''

  const upcomingRows = dash.upcoming_events.slice(0, 10).map(e => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:600;">${fmtDate(e.event_date)}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${esc(e.event_name)}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:center;color:#6b7280;">${e.total_qty}</td>
    </tr>
  `).join('')

  const lowStockRows = dash.low_stock_items.slice(0, 8).map(l => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #fde68a;">${esc(l.description)}</td>
      <td style="padding:8px;border-bottom:1px solid #fde68a;text-align:center;color:#dc2626;font-weight:600;">${l.qty_on_hand}</td>
      <td style="padding:8px;border-bottom:1px solid #fde68a;text-align:center;color:#6b7280;">${l.low_stock_threshold}</td>
    </tr>
  `).join('')

  const shareBlock = opts.shareUrl
    ? `
      <p style="margin:24px 0;text-align:center;">
        <a href="${esc(opts.shareUrl)}"
           style="background:#2563eb;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:600;display:inline-block;">
          Open Live Dashboard →
        </a>
      </p>
    `
    : ''

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;margin:0;padding:24px;">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background:#1f2937;color:#fff;padding:24px;">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;opacity:0.7;">B&amp;W Productions · Weekly Brand Digest</div>
      <h1 style="margin:8px 0 0;font-size:28px;">${esc(dash.brand)}</h1>
      ${dash.ownership ? `<div style="margin-top:4px;opacity:0.8;font-size:14px;">${esc(dash.ownership)}</div>` : ''}
    </div>

    <div style="padding:24px;color:#1f2937;line-height:1.6;">
      <p>${greeting}</p>
      <p>Here's this week's snapshot for <strong>${esc(dash.brand)}</strong>${weekLabel}.</p>

      <!-- Stat tiles -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:separate;border-spacing:8px;">
        <tr>
          <td style="background:#f3f4f6;padding:12px;border-radius:6px;text-align:center;width:25%;">
            <div style="font-size:11px;color:#6b7280;text-transform:uppercase;">Items</div>
            <div style="font-size:24px;font-weight:700;color:#111827;">${dash.item_count}</div>
          </td>
          <td style="background:#f3f4f6;padding:12px;border-radius:6px;text-align:center;width:25%;">
            <div style="font-size:11px;color:#6b7280;text-transform:uppercase;">Units</div>
            <div style="font-size:24px;font-weight:700;color:#111827;">${dash.unit_count}</div>
          </td>
          <td style="background:#dbeafe;padding:12px;border-radius:6px;text-align:center;width:25%;">
            <div style="font-size:11px;color:#1e40af;text-transform:uppercase;">Upcoming</div>
            <div style="font-size:24px;font-weight:700;color:#1d4ed8;">${dash.upcoming_events.length}</div>
          </td>
          <td style="background:${dash.open_shortages.length > 0 ? '#fee2e2' : '#d1fae5'};padding:12px;border-radius:6px;text-align:center;width:25%;">
            <div style="font-size:11px;color:${dash.open_shortages.length > 0 ? '#991b1b' : '#065f46'};text-transform:uppercase;">Shortages</div>
            <div style="font-size:24px;font-weight:700;color:${dash.open_shortages.length > 0 ? '#dc2626' : '#059669'};">${dash.open_shortages.length}</div>
          </td>
        </tr>
      </table>

      ${upcomingRows ? `
        <h2 style="margin:24px 0 8px;font-size:16px;color:#111827;">📅 Upcoming Events</h2>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;border-collapse:collapse;font-size:14px;">
          <thead>
            <tr style="background:#f9fafb;">
              <th style="padding:8px;text-align:left;border-bottom:1px solid #e5e7eb;">Date</th>
              <th style="padding:8px;text-align:left;border-bottom:1px solid #e5e7eb;">Event</th>
              <th style="padding:8px;text-align:center;border-bottom:1px solid #e5e7eb;">Units</th>
            </tr>
          </thead>
          <tbody>${upcomingRows}</tbody>
        </table>
      ` : '<p style="color:#6b7280;margin:24px 0;">No upcoming events scheduled.</p>'}

      ${lowStockRows ? `
        <h2 style="margin:24px 0 8px;font-size:16px;color:#92400e;">⚠️ Low Stock Items</h2>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #fde68a;border-radius:6px;border-collapse:collapse;font-size:14px;background:#fffbeb;">
          <thead>
            <tr style="background:#fef3c7;">
              <th style="padding:8px;text-align:left;border-bottom:1px solid #fde68a;">Item</th>
              <th style="padding:8px;text-align:center;border-bottom:1px solid #fde68a;">On Hand</th>
              <th style="padding:8px;text-align:center;border-bottom:1px solid #fde68a;">Threshold</th>
            </tr>
          </thead>
          <tbody>${lowStockRows}</tbody>
        </table>
      ` : ''}

      ${shareBlock}

      <p style="color:#6b7280;font-size:12px;margin-top:24px;border-top:1px solid #e5e7eb;padding-top:16px;">
        This digest is sent weekly by B&amp;W Productions. To unsubscribe or change recipients,
        contact your B&amp;W account director.
      </p>
    </div>
  </div>
</body>
</html>`
}

// ─── Send orchestrator ──────────────────────────────────────────────────────

const FROM_ADDRESS = 'B&W Productions <noreply@bwproductions.co.za>'
const REPLY_TO_ADDRESS = 'bibi@bwproductions.co.za'

async function sendOneEmail(args: {
  apiKey: string
  to: string
  subject: string
  html: string
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${args.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [args.to],
        reply_to: REPLY_TO_ADDRESS,
        subject: args.subject,
        html: args.html,
      }),
    })
    if (!resp.ok) {
      const text = await resp.text()
      return { ok: false, error: `Resend ${resp.status}: ${text.slice(0, 200)}` }
    }
    const body = await resp.json() as any
    return { ok: true, id: body.id }
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) }
  }
}

/**
 * Main cron entry point. Iterates active weekly subscriptions and sends
 * digests. Returns a per-recipient result list.
 */
export async function runBrandDigest(env: BrandDigestEnv, opts: {
  reason?: string
  filterBrand?: string  // for manual test/dispatch
} = {}) {
  const reason = opts.reason || 'cron-webhook'
  if (!env.RESEND_API_KEY) {
    return { ok: false, sent: 0, reason, error: 'RESEND_API_KEY not configured' }
  }

  let subs = await listAllActiveSubscriptions(env.DB, 'weekly')
  if (opts.filterBrand) {
    subs = subs.filter(s => s.brand === opts.filterBrand)
  }

  if (subs.length === 0) {
    return { ok: true, sent: 0, reason, message: 'No active subscriptions' }
  }

  const today = new Date().toISOString().slice(0, 10)
  // Cache dashboard per brand so we don't query 5x for 5 subscribers of the same brand
  const dashCache = new Map<string, BrandDashboard | null>()

  const results: Array<{ email: string; brand: string; ok: boolean; error?: string }> = []
  let sent = 0

  for (const sub of subs) {
    let dash = dashCache.get(sub.brand)
    if (dash === undefined) {
      dash = await getBrandDashboard(env.DB, sub.brand)
      dashCache.set(sub.brand, dash)
    }
    if (!dash) {
      results.push({ email: sub.email, brand: sub.brand, ok: false, error: 'Brand not found' })
      continue
    }

    const html = buildBrandDigestHtml(dash, {
      recipientName: sub.name,
      weekStart: today,
    })

    const result = await sendOneEmail({
      apiKey: env.RESEND_API_KEY,
      to: sub.email,
      subject: `${sub.brand} — Weekly Stock Digest`,
      html,
    })

    results.push({ email: sub.email, brand: sub.brand, ok: result.ok, error: result.error })
    if (result.ok) {
      sent++
      await markSubscriptionSent(env.DB, sub.id)
    }
  }

  return { ok: true, sent, total: subs.length, reason, results }
}
