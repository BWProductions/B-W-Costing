// ─── Uncollected-delivery alert service ──────────────────────────────────────
// Bibi's rule: if a delivery's planned collection date is 5+ days in the past and
// no Collection Note has been signed against it, email Bernie + Marketing ONCE.
//
// "Collected" signal: when a Collection Note is submitted with a linked_delivery_id,
// the parent delivery's collection_status is set to 'collected' (see field.ts).
// So an "uncollected" delivery is any signed (non-draft) delivery where
// collection_status is NOT 'collected'.
//
// One-time guard: field_submissions.uncollected_alert_sent_at. NULL = never
// alerted. Once we email about a delivery we stamp it so it never nags again.
// ────────────────────────────────────────────────────────────────────────────

export type UncollectedEnv = {
  DB: D1Database
  RESEND_API_KEY?: string
}

export const FROM_ADDRESS = 'B&W Productions <noreply@bwproductions.co.za>'
export const REPLY_TO_ADDRESS = 'bibi@bwproductions.co.za'

// Recipients per Bibi: Bernie + Marketing.
export const UNCOLLECTED_RECIPIENTS = [
  'bibi@bwproductions.co.za',       // Bernie Burness
  'marketing@bwproductions.co.za',  // Marketing (Shane')
]

// Days after the planned collection date before we raise the alarm.
export const UNCOLLECTED_DAYS = 5

export interface UncollectedRow {
  id: number
  form_number: string
  venue: string | null
  event_name: string | null
  brand: string | null
  driver: string | null
  delivery_date: string | null
  collection_date: string | null
  days_overdue: number
}

function escHtml(s: any): string {
  if (s === null || s === undefined) return ''
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// ── Core query: deliveries overdue for collection, not yet alerted ───────────
//
// Effective "due" date = collection_date if present, else delivery_date.
// Overdue when that date <= today - UNCOLLECTED_DAYS.
export async function fetchUncollectedDeliveries(env: UncollectedEnv): Promise<UncollectedRow[]> {
  const cutoff = new Date(Date.now() - UNCOLLECTED_DAYS * 86400000).toISOString().slice(0, 10)

  const sql = `
    SELECT id, form_number, venue, event_name, brand, driver, delivery_date, collection_date,
           CAST(julianday('now') - julianday(COALESCE(NULLIF(collection_date,''), delivery_date)) AS INTEGER) AS days_overdue
    FROM field_submissions
    WHERE form_type = 'delivery'
      AND COALESCE(is_draft, 0) = 0
      AND COALESCE(collection_status, '') <> 'collected'
      AND uncollected_alert_sent_at IS NULL
      AND COALESCE(NULLIF(collection_date,''), delivery_date) IS NOT NULL
      AND COALESCE(NULLIF(collection_date,''), delivery_date) <> ''
      AND COALESCE(NULLIF(collection_date,''), delivery_date) <= ?
    ORDER BY days_overdue DESC, form_number
  `
  const res = await env.DB.prepare(sql).bind(cutoff).all<any>()
  return (res.results || []) as UncollectedRow[]
}

function renderEmailHtml(rows: UncollectedRow[], baseUrl: string): string {
  const renderRow = (r: UncollectedRow) => `
    <tr style="border-bottom:1px solid #e5e7eb">
      <td style="padding:8px 10px;font-weight:600">${escHtml(r.form_number)}</td>
      <td style="padding:8px 10px">${escHtml(r.event_name) || '—'}${r.venue ? '<br><span style="color:#6b7280;font-size:12px">' + escHtml(r.venue) + '</span>' : ''}</td>
      <td style="padding:8px 10px">${escHtml(r.brand) || '—'}</td>
      <td style="padding:8px 10px">${escHtml(r.driver) || '—'}</td>
      <td style="padding:8px 10px;font-size:12px;color:#6b7280">${escHtml(r.collection_date || r.delivery_date) || '—'}</td>
      <td style="padding:8px 10px;text-align:center"><span style="display:inline-block;font-size:12px;padding:2px 8px;border-radius:10px;background:#dc262622;color:#dc2626;font-weight:700">${r.days_overdue}d</span></td>
      <td style="padding:8px 10px"><a href="${baseUrl}/field/collect-from/${r.id}" style="color:#1f6feb;font-weight:600;text-decoration:none">Collect →</a></td>
    </tr>`

  return `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0A0A0A;background:#F5F2EA;padding:24px;margin:0">
  <table style="max-width:820px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border-collapse:collapse;width:100%">
    <tr><td style="padding:20px 24px;background:#0A0A0A;color:#C9A961">
      <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase">B&amp;W Productions</div>
      <h1 style="margin:4px 0 0;font-size:22px;color:#fff">⏰ Deliveries not yet collected</h1>
      <div style="font-size:13px;color:#C9A961;margin-top:4px">${new Date().toISOString().slice(0,10)} · ${rows.length} deliver${rows.length === 1 ? 'y is' : 'ies are'} ${UNCOLLECTED_DAYS}+ days past their collection date</div>
    </td></tr>
    <tr><td style="padding:16px 24px 0;font-size:14px;color:#374151;line-height:1.5">
      The following deliveries still have <strong>no signed Collection Note</strong> ${UNCOLLECTED_DAYS} days after they were due to be collected.
      Someone needs to go on site, physically count the kit and check it in — not just tick a box. Tap <strong>Collect →</strong> to start the collection note.
    </td></tr>
    <tr><td style="padding:14px 24px 0">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:#0A0A0A;color:#fff;text-align:left">
          <th style="padding:10px 10px">Delivery</th>
          <th style="padding:10px 10px">Event / Venue</th>
          <th style="padding:10px 10px">Brand</th>
          <th style="padding:10px 10px">Driver</th>
          <th style="padding:10px 10px">Due</th>
          <th style="padding:10px 10px;text-align:center">Overdue</th>
          <th style="padding:10px 10px"></th>
        </tr></thead>
        <tbody>${rows.map(renderRow).join('')}</tbody>
      </table>
    </td></tr>
    <tr><td style="padding:12px 24px 20px;font-size:11px;color:#6b7280;border-top:1px solid #e5e7eb">
      This is a one-time alert per delivery — you will not be reminded about these same notes again. Reply to this email to talk to Bibi.
    </td></tr>
  </table>
</body></html>`
}

function renderEmailText(rows: UncollectedRow[], baseUrl: string): string {
  const lines = [
    `B&W PRODUCTIONS — Deliveries not yet collected`,
    `${new Date().toISOString().slice(0,10)} — ${rows.length} overdue ${UNCOLLECTED_DAYS}+ days`,
    '',
  ]
  for (const r of rows) {
    lines.push(`• ${r.form_number} — ${r.event_name || ''}${r.venue ? ' @ ' + r.venue : ''} | ${r.brand || ''} | driver ${r.driver || '—'} | due ${r.collection_date || r.delivery_date || '—'} | ${r.days_overdue}d overdue`)
    lines.push(`  Collect: ${baseUrl}/field/collect-from/${r.id}`)
  }
  return lines.join('\n')
}

async function logEmail(
  env: UncollectedEnv,
  entry: { recipient: string; subject: string; status: 'sent'|'failed'; error?: string; provider_id?: string; count?: number },
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO email_log (sent_at, recipient, subject, status, provider_id, error, delivery_count)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      new Date().toISOString(), entry.recipient, entry.subject, entry.status,
      entry.provider_id || null, entry.error || null, entry.count || 0,
    ).run()
  } catch { /* logging must never crash the job */ }
}

// ── Main entry point ─────────────────────────────────────────────────────────
export async function runUncollectedAlert(
  env: UncollectedEnv,
  opts: { reason?: string; baseUrl?: string; testRecipients?: string[]; dryRun?: boolean } = {},
): Promise<{ ok: boolean; sent: number; deliveries: number; reason: string; error?: string; recipients?: string[]; formNumbers?: string[] }> {
  const reason = opts.reason || 'scheduled'
  const baseUrl = opts.baseUrl || 'https://bwprodsystem.co.za'

  // 1. Find overdue, un-alerted deliveries
  const rows = await fetchUncollectedDeliveries(env)
  if (rows.length === 0) {
    return { ok: true, sent: 0, deliveries: 0, reason: `${reason} (nothing overdue)` }
  }

  const formNumbers = rows.map(r => r.form_number)
  const recipients = opts.testRecipients?.length ? opts.testRecipients : UNCOLLECTED_RECIPIENTS

  // Dry run: report what WOULD be sent, but don't email or stamp.
  if (opts.dryRun) {
    return { ok: true, sent: 0, deliveries: rows.length, reason: `${reason} (dry-run)`, recipients, formNumbers }
  }

  // 2. Render
  const subject = `B&W: ${rows.length} deliver${rows.length === 1 ? 'y' : 'ies'} not yet collected (${UNCOLLECTED_DAYS}+ days)`
  const html = renderEmailHtml(rows, baseUrl)
  const text = renderEmailText(rows, baseUrl)

  // 3. Send via Resend
  const apiKey = env.RESEND_API_KEY
  if (!apiKey) {
    await logEmail(env, { recipient: recipients.join(','), subject, status: 'failed', error: 'RESEND_API_KEY not set', count: rows.length })
    return { ok: false, sent: 0, deliveries: rows.length, reason, error: 'RESEND_API_KEY not configured', formNumbers }
  }

  let providerId: string | undefined
  let errMsg: string | undefined
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_ADDRESS, to: recipients, reply_to: REPLY_TO_ADDRESS, subject, html, text }),
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

  await logEmail(env, {
    recipient: recipients.join(','), subject,
    status: errMsg ? 'failed' : 'sent', error: errMsg, provider_id: providerId, count: rows.length,
  })

  if (errMsg) {
    return { ok: false, sent: 0, deliveries: rows.length, reason, error: errMsg, recipients, formNumbers }
  }

  // 4. Stamp each delivery so we NEVER alert about it again (one-time rule).
  const stamp = new Date().toISOString()
  for (const r of rows) {
    await env.DB.prepare(
      `UPDATE field_submissions SET uncollected_alert_sent_at=? WHERE id=?`
    ).bind(stamp, r.id).run()
  }

  return { ok: true, sent: recipients.length, deliveries: rows.length, reason, recipients, formNumbers }
}
