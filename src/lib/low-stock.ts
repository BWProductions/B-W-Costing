// ─── Low-stock alerts service ────────────────────────────────────────────────
// Per-item threshold queries + weekly email digest via Resend.
//
// Threshold logic:
//   * low_stock_threshold NULL → use DEFAULT_LOW_STOCK_THRESHOLD (5)
//   * low_stock_threshold 0    → never alerts (explicit opt-out)
//   * low_stock_threshold N>0  → alerts when qty_on_hand <= N
//
// Snooze logic:
//   * alert_snoozed_until NULL  → not snoozed
//   * alert_snoozed_until DATE  → hidden from alerts/digest until that date passes
// ────────────────────────────────────────────────────────────────────────────

export type LowStockEnv = {
  DB: D1Database
  RESEND_API_KEY?: string
}

export const DEFAULT_LOW_STOCK_THRESHOLD = 5
export const FROM_ADDRESS = 'B&W Productions <onboarding@resend.dev>'
export const REPLY_TO_ADDRESS = 'bibi@bwproductions.co.za'

export interface LowStockRow {
  id: number
  brand: string
  description: string
  qty_on_hand: number
  low_stock_threshold: number | null
  effective_threshold: number
  custody_type: string
  location: string | null
  status: 'out' | 'low'                            // out = qty=0; low = 0 < qty <= threshold
  alert_snoozed_until: string | null
}

// ── Core query: items needing attention right now ───────────────────────────
//
// Returns active items where qty_on_hand <= effective_threshold, NOT currently
// snoozed, AND threshold != 0 (0 means opted out).
//
// Sort: out-of-stock first (qty=0), then by deepest deficit relative to threshold,
// then alphabetical for stable display.
export async function fetchLowStockItems(
  env: LowStockEnv,
  opts: { includeSnoozed?: boolean; brand?: string; custody?: string } = {}
): Promise<LowStockRow[]> {
  const def = DEFAULT_LOW_STOCK_THRESHOLD
  const today = new Date().toISOString().slice(0, 10)

  const conds: string[] = [
    'active = 1',
    // Honour explicit 0 = opt-out; otherwise use effective threshold
    `COALESCE(low_stock_threshold, ${def}) > 0`,
    `qty_on_hand <= COALESCE(low_stock_threshold, ${def})`,
  ]
  const params: any[] = []

  if (!opts.includeSnoozed) {
    conds.push(`(alert_snoozed_until IS NULL OR alert_snoozed_until < ?)`)
    params.push(today)
  }
  if (opts.brand) {
    conds.push('brand = ?')
    params.push(opts.brand)
  }
  if (opts.custody) {
    conds.push('custody_type = ?')
    params.push(opts.custody)
  }

  const sql = `
    SELECT id, brand, description, qty_on_hand,
           low_stock_threshold,
           COALESCE(low_stock_threshold, ${def}) AS effective_threshold,
           custody_type, location, alert_snoozed_until
    FROM stock_items
    WHERE ${conds.join(' AND ')}
    ORDER BY
      (qty_on_hand = 0) DESC,
      (qty_on_hand - COALESCE(low_stock_threshold, ${def})) ASC,
      brand, description
  `
  const res = await env.DB.prepare(sql).bind(...params).all<any>()
  return res.results.map((r: any) => ({
    ...r,
    status: r.qty_on_hand === 0 ? 'out' : 'low',
  })) as LowStockRow[]
}

// ── Recipients ─────────────────────────────────────────────────────────────
export async function fetchActiveRecipients(env: LowStockEnv): Promise<{ email: string; name: string | null }[]> {
  const res = await env.DB.prepare(
    `SELECT email, name FROM low_stock_alert_recipients WHERE active = 1 ORDER BY id`
  ).all<{ email: string; name: string | null }>()
  return res.results
}

// ── HTML/text rendering ─────────────────────────────────────────────────────
function escHtml(s: any): string {
  if (s === null || s === undefined) return ''
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function renderEmailHtml(rows: LowStockRow[], dashboardUrl: string): string {
  const out = rows.filter(r => r.status === 'out')
  const low = rows.filter(r => r.status === 'low')

  const renderRow = (r: LowStockRow) => {
    const colour = r.status === 'out' ? '#dc2626' : '#d97706'
    const label = r.status === 'out' ? 'OUT OF STOCK' : 'LOW'
    return `<tr style="border-bottom:1px solid #e5e7eb">
      <td style="padding:8px 10px;font-weight:600">${escHtml(r.brand)}</td>
      <td style="padding:8px 10px">${escHtml(r.description)}</td>
      <td style="padding:8px 10px;text-align:right;font-family:monospace"><strong>${r.qty_on_hand}</strong> / ${r.effective_threshold}</td>
      <td style="padding:8px 10px"><span style="display:inline-block;font-size:11px;padding:2px 8px;border-radius:10px;background:${colour}22;color:${colour};font-weight:600">${label}</span></td>
      <td style="padding:8px 10px;font-size:12px;color:#6b7280">${escHtml(r.location) || '—'}</td>
    </tr>`
  }

  const tableHeader = `<thead><tr style="background:#0A0A0A;color:#fff;text-align:left">
    <th style="padding:10px 10px">Brand</th>
    <th style="padding:10px 10px">Description</th>
    <th style="padding:10px 10px;text-align:right">Qty / Threshold</th>
    <th style="padding:10px 10px">Status</th>
    <th style="padding:10px 10px">Location</th>
  </tr></thead>`

  return `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0A0A0A;background:#F5F2EA;padding:24px;margin:0">
  <table style="max-width:760px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border-collapse:collapse;width:100%">
    <tr><td style="padding:20px 24px;background:#0A0A0A;color:#C9A961">
      <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase">B&amp;W Productions</div>
      <h1 style="margin:4px 0 0;font-size:22px;color:#fff">Weekly low-stock digest</h1>
      <div style="font-size:13px;color:#C9A961;margin-top:4px">${new Date().toISOString().slice(0,10)} · ${rows.length} item${rows.length === 1 ? '' : 's'} need${rows.length === 1 ? 's' : ''} attention</div>
    </td></tr>

    ${out.length > 0 ? `
    <tr><td style="padding:16px 24px 0">
      <h2 style="margin:8px 0;font-size:16px;color:#dc2626"><span style="display:inline-block;width:10px;height:10px;background:#dc2626;border-radius:50%;margin-right:8px"></span>Out of stock — ${out.length}</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px">
        ${tableHeader}<tbody>${out.map(renderRow).join('')}</tbody>
      </table>
    </td></tr>` : ''}

    ${low.length > 0 ? `
    <tr><td style="padding:16px 24px 0">
      <h2 style="margin:16px 0 8px;font-size:16px;color:#d97706"><span style="display:inline-block;width:10px;height:10px;background:#d97706;border-radius:50%;margin-right:8px"></span>Below threshold — ${low.length}</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px">
        ${tableHeader}<tbody>${low.map(renderRow).join('')}</tbody>
      </table>
    </td></tr>` : ''}

    <tr><td style="padding:20px 24px">
      <a href="${dashboardUrl}" style="display:inline-block;background:#0A0A0A;color:#C9A961;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;font-size:13px">Open alerts dashboard →</a>
    </td></tr>

    <tr><td style="padding:12px 24px 20px;font-size:11px;color:#6b7280;border-top:1px solid #e5e7eb">
      Threshold per item is editable on the stock admin page. To stop alerts for an item, set its threshold to 0. To snooze for N days, use the dashboard snooze button. Reply to this email to talk to Bibi.
    </td></tr>
  </table>
</body></html>`
}

function renderEmailText(rows: LowStockRow[], dashboardUrl: string): string {
  const out = rows.filter(r => r.status === 'out')
  const low = rows.filter(r => r.status === 'low')
  const fmt = (r: LowStockRow) => `  • ${r.brand} — ${r.description}: ${r.qty_on_hand} / ${r.effective_threshold}${r.location ? ` (${r.location})` : ''}`
  const lines = [
    `B&W PRODUCTIONS — Weekly low-stock digest`,
    `${new Date().toISOString().slice(0,10)} — ${rows.length} item${rows.length === 1 ? '' : 's'} need${rows.length === 1 ? 's' : ''} attention`,
    '',
  ]
  if (out.length > 0) {
    lines.push(`OUT OF STOCK (${out.length}):`, ...out.map(fmt), '')
  }
  if (low.length > 0) {
    lines.push(`BELOW THRESHOLD (${low.length}):`, ...low.map(fmt), '')
  }
  lines.push(`Dashboard: ${dashboardUrl}`)
  return lines.join('\n')
}

// ── Email log helper (re-uses email_log table from migration 0015) ──────────
async function logEmail(
  env: LowStockEnv,
  entry: { recipient: string; subject: string; status: 'sent'|'failed'; error?: string; provider_id?: string; itemCount?: number },
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO email_log (sent_at, recipient, subject, status, provider_id, error, delivery_count)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      new Date().toISOString(),
      entry.recipient,
      entry.subject,
      entry.status,
      entry.provider_id || null,
      entry.error || null,
      entry.itemCount || 0,
    ).run()
  } catch { /* swallow — logging must never crash the digest */ }
}

// ── Main digest entry point ────────────────────────────────────────────────
export async function runLowStockDigest(
  env: LowStockEnv,
  opts: { reason?: string; dashboardUrl?: string; testRecipients?: string[]; skipIfEmpty?: boolean } = {},
): Promise<{ ok: boolean; sent: number; items: number; reason: string; error?: string; recipients?: string[] }> {
  const reason = opts.reason || 'scheduled'
  const dashboardUrl = opts.dashboardUrl || 'https://bwprodsystem.co.za/admin/stock/alerts'
  const skipIfEmpty = opts.skipIfEmpty !== false   // default true: skip mail if nothing to report

  // 1. Fetch items needing attention
  const rows = await fetchLowStockItems(env)

  if (rows.length === 0 && skipIfEmpty) {
    return { ok: true, sent: 0, items: 0, reason: `${reason} (no items below threshold)` }
  }

  // 2. Recipients
  const recipients = opts.testRecipients?.length
    ? opts.testRecipients.map(e => ({ email: e, name: null }))
    : await fetchActiveRecipients(env)

  if (recipients.length === 0) {
    return { ok: false, sent: 0, items: rows.length, reason, error: 'No active recipients configured' }
  }

  // 3. Render mail
  const subject = rows.length === 0
    ? `B&W stock: all OK (${new Date().toISOString().slice(0,10)})`
    : `B&W stock alert: ${rows.length} item${rows.length === 1 ? '' : 's'} below threshold`
  const html = renderEmailHtml(rows, dashboardUrl)
  const text = renderEmailText(rows, dashboardUrl)

  // 4. Send via Resend
  const apiKey = env.RESEND_API_KEY
  if (!apiKey) {
    await logEmail(env, { recipient: recipients.map(r => r.email).join(','), subject, status: 'failed', error: 'RESEND_API_KEY not set' })
    return { ok: false, sent: 0, items: rows.length, reason, error: 'RESEND_API_KEY not configured' }
  }

  let providerId: string | undefined
  let errMsg: string | undefined
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: recipients.map(r => r.email),
        reply_to: REPLY_TO_ADDRESS,
        subject,
        html,
        text,
      }),
    })
    if (!resp.ok) {
      errMsg = `Resend HTTP ${resp.status}: ${(await resp.text()).slice(0, 500)}`
    } else {
      const data: any = await resp.json()
      providerId = data?.id
    }
  } catch (e: any) {
    errMsg = `fetch failed: ${e?.message || String(e)}`
  }

  // 5. Log + return
  await logEmail(env, {
    recipient: recipients.map(r => r.email).join(','),
    subject,
    status: errMsg ? 'failed' : 'sent',
    error: errMsg,
    provider_id: providerId,
    itemCount: rows.length,
  })

  if (errMsg) {
    return { ok: false, sent: 0, items: rows.length, reason, error: errMsg, recipients: recipients.map(r => r.email) }
  }
  return { ok: true, sent: recipients.length, items: rows.length, reason, recipients: recipients.map(r => r.email) }
}
