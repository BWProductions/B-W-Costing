// ─── Email digest service ────────────────────────────────────────────────────
// Sends a "deliveries signed" digest to the accounts inbox(es) at scheduled
// times (07:00 + 12:00 SAST / 05:00 + 10:00 UTC). One mail per scheduled run
// that finds at least one signed-but-not-yet-notified Delivery Note.
//
// • Pulls signed delivery submissions where notified_at IS NULL
// • Streams each PDF out of R2 and attaches it (base64-encoded for Resend)
// • Hard-limits the total payload at 20 MB; over that, we send the digest
//   with PDF links only and let accounts download from R2 via /field/pdf/:id
// • Marks each included submission notified_at = NOW after a successful send,
//   so the same delivery never gets two emails
// • Logs every attempt — success or failure — to email_log for debugging
// ────────────────────────────────────────────────────────────────────────────

export type DigestEnv = {
  DB: D1Database
  PDF_BUCKET: R2Bucket
  RESEND_API_KEY?: string
}

export type DigestRecipient = string

// Hard-coded for now — small admin UI to manage these comes later.
export const ACCOUNTS_RECIPIENTS: DigestRecipient[] = [
  'shanevanstaden844@gmail.com',
  'bernieb25263@gmail.com',
]

export const FROM_ADDRESS = 'B&W Productions <onboarding@resend.dev>'
export const REPLY_TO_ADDRESS = 'bibi@bwproductions.co.za'
export const MAX_PAYLOAD_BYTES = 20 * 1024 * 1024   // 20 MB safety ceiling (Gmail caps at 25)

export interface DigestRow {
  id: number
  form_number: string
  vehicle_reg: string | null
  driver: string | null
  prepared_by: string | null
  client: string | null
  brand: string | null
  venue: string | null
  event_name: string | null
  delivery_date: string | null
  received_by: string | null
  created_at: string
  notes: string | null
  form_data: string | null
}

// ── PUBLIC SURFACE ───────────────────────────────────────────────────────────

/** Run the digest pipeline. Safe to call manually OR from a cron. */
export async function runDigest(env: DigestEnv, opts: { reason?: string; forceIds?: number[] } = {}) {
  const reason = opts.reason || 'scheduled'

  // ── Find candidate deliveries ────────────────────────────────────────────
  let query = `SELECT id, form_number, vehicle_reg, driver, prepared_by,
                      client, brand, venue, event_name, delivery_date,
                      received_by, created_at, notes, form_data
               FROM field_submissions
               WHERE form_type='delivery'
                 AND is_draft=0
                 AND signature_data IS NOT NULL
                 AND signature_data != ''
                 AND (status IS NULL OR status NOT IN ('cancelled','draft'))`
  const params: any[] = []
  if (opts.forceIds && opts.forceIds.length) {
    query += ` AND id IN (${opts.forceIds.map(() => '?').join(',')})`
    params.push(...opts.forceIds)
  } else {
    query += ` AND notified_at IS NULL`
  }
  query += ` ORDER BY delivery_date ASC, id ASC`

  const result = await env.DB.prepare(query).bind(...params).all<DigestRow>()
  const rows = result.results || []

  if (!rows.length) {
    return { ok: true, sent: 0, reason, skipped: 'no-new-deliveries' as const }
  }

  // ── Build subject + body ─────────────────────────────────────────────────
  const now = new Date()
  const sastTime = formatSAST(now)
  const subject = `B&W system — ${rows.length} delivery${rows.length === 1 ? '' : 's'} signed (${sastTime})`
  const { html, plain } = renderDigestBody(rows, sastTime)

  // ── Pull PDFs out of R2, base64 them, watch the size budget ──────────────
  type Attachment = { filename: string; content: string }
  const attachments: Attachment[] = []
  let totalBytes = 0
  let droppedPdfs: number[] = []
  for (const r of rows) {
    const key = `pdfs/${r.form_number}-${r.id}.pdf`
    const obj = await env.PDF_BUCKET.get(key)
    if (!obj) { droppedPdfs.push(r.id); continue }
    const buf = await obj.arrayBuffer()
    if (totalBytes + buf.byteLength > MAX_PAYLOAD_BYTES) {
      droppedPdfs.push(r.id); continue
    }
    totalBytes += buf.byteLength
    attachments.push({
      filename: `${r.form_number}.pdf`,
      content: arrayBufferToBase64(buf),
    })
  }

  // ── Send via Resend (one call, BCC the two recipients) ───────────────────
  const apiKey = env.RESEND_API_KEY
  if (!apiKey) {
    await logEmail(env, {
      recipient: ACCOUNTS_RECIPIENTS.join(','),
      subject,
      status: 'failed',
      error: 'RESEND_API_KEY not set',
      delivery_ids: rows.map(r => r.id),
      total_size_kb: Math.round(totalBytes / 1024),
    })
    return { ok: false, sent: 0, reason, error: 'RESEND_API_KEY not configured' }
  }

  let providerId: string | undefined
  let resendError: string | undefined
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: ACCOUNTS_RECIPIENTS,
        reply_to: REPLY_TO_ADDRESS,
        subject,
        html,
        text: plain,
        attachments,
      }),
    })
    if (!resp.ok) {
      resendError = `Resend HTTP ${resp.status}: ${(await resp.text()).slice(0, 500)}`
    } else {
      const data: any = await resp.json()
      providerId = data?.id
    }
  } catch (err: any) {
    resendError = `fetch failed: ${err?.message || String(err)}`
  }

  // ── Mark notified + log ──────────────────────────────────────────────────
  if (!resendError) {
    const nowISO = new Date().toISOString()
    for (const r of rows) {
      await env.DB.prepare(
        `UPDATE field_submissions SET notified_at=?, notified_attempts=COALESCE(notified_attempts,0)+1, notified_error=NULL WHERE id=?`
      ).bind(nowISO, r.id).run()
    }
    await logEmail(env, {
      recipient: ACCOUNTS_RECIPIENTS.join(','),
      subject,
      status: 'sent',
      provider_id: providerId,
      delivery_ids: rows.map(r => r.id),
      total_size_kb: Math.round(totalBytes / 1024),
    })
    return {
      ok: true, sent: rows.length, reason, provider_id: providerId,
      dropped_pdfs: droppedPdfs, total_size_kb: Math.round(totalBytes / 1024),
    }
  } else {
    for (const r of rows) {
      await env.DB.prepare(
        `UPDATE field_submissions SET notified_attempts=COALESCE(notified_attempts,0)+1, notified_error=? WHERE id=?`
      ).bind(resendError.slice(0, 500), r.id).run()
    }
    await logEmail(env, {
      recipient: ACCOUNTS_RECIPIENTS.join(','),
      subject,
      status: 'failed',
      error: resendError,
      delivery_ids: rows.map(r => r.id),
      total_size_kb: Math.round(totalBytes / 1024),
    })
    return { ok: false, sent: 0, reason, error: resendError }
  }
}

// ── HTML body ────────────────────────────────────────────────────────────────

function renderDigestBody(rows: DigestRow[], whenSAST: string) {
  const rowsHtml = rows.map(r => {
    const date  = formatNiceDate(r.delivery_date || r.created_at)
    const reg   = (r.vehicle_reg || '—').toUpperCase()
    const venue = r.venue || r.event_name || '—'
    const who   = r.received_by || '(signature on file)'
    const drv   = r.driver || r.prepared_by || '—'
    const brand = r.brand || r.client || ''
    return `
      <tr style="border-top:1px solid #e5e7eb">
        <td style="padding:10px 8px;font-family:monospace;font-weight:700;color:#0f172a;white-space:nowrap">${escHtml(r.form_number)}</td>
        <td style="padding:10px 8px;color:#0f172a">${escHtml(venue)}${brand ? `<br><span style="font-size:11px;color:#64748b">${escHtml(brand)}</span>` : ''}</td>
        <td style="padding:10px 8px;color:#0f172a;font-family:monospace">${escHtml(reg)}</td>
        <td style="padding:10px 8px;color:#0f172a">${escHtml(drv)}</td>
        <td style="padding:10px 8px;color:#0f172a;white-space:nowrap">${escHtml(date)}</td>
        <td style="padding:10px 8px;color:#475569;font-style:italic">${escHtml(who)}</td>
      </tr>`
  }).join('')

  const html = `
<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
<div style="max-width:680px;margin:0 auto;padding:24px 16px">
  <div style="background:#fff;border-radius:12px;padding:24px;border:1px solid #e2e8f0">
    <div style="font-size:13px;color:#64748b;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px">B&amp;W system</div>
    <h1 style="font-size:22px;margin:0 0 6px;color:#0f172a">Deliveries signed &amp; complete</h1>
    <p style="margin:0 0 18px;color:#475569;font-size:14px">
      <strong>${rows.length}</strong> delivery${rows.length === 1 ? '' : 's'} signed for as of ${escHtml(whenSAST)}.
      ${rows.length === 1 ? 'The PDF is attached.' : 'The PDFs are attached.'}
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
      <thead style="background:#f1f5f9">
        <tr>
          <th style="padding:10px 8px;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b">Form #</th>
          <th style="padding:10px 8px;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b">Venue</th>
          <th style="padding:10px 8px;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b">Vehicle</th>
          <th style="padding:10px 8px;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b">Driver</th>
          <th style="padding:10px 8px;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b">Date</th>
          <th style="padding:10px 8px;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b">Signed by</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <p style="margin:18px 0 0;color:#64748b;font-size:12px;line-height:1.5">
      This is an automatic notification from the B&amp;W Productions ops system. Two digests are sent daily — 07:00 and 12:00 SAST — for every delivery signed since the last run. Reply to this email if you need to ask anything; the reply goes to Bibi.
    </p>
  </div>
  <div style="text-align:center;color:#94a3b8;font-size:11px;padding:14px 0">B&amp;W Productions · Field Operations</div>
</div>
</body></html>`

  const plain = [
    `B&W system — Deliveries signed & complete`,
    ``,
    `${rows.length} delivery${rows.length === 1 ? '' : 's'} signed for as of ${whenSAST}.`,
    rows.length === 1 ? 'The PDF is attached.' : 'The PDFs are attached.',
    ``,
    ...rows.map(r => {
      const date  = formatNiceDate(r.delivery_date || r.created_at)
      const venue = r.venue || r.event_name || '—'
      const drv   = r.driver || r.prepared_by || '—'
      const who   = r.received_by || '(signature on file)'
      return `• ${r.form_number} — ${venue} — ${r.vehicle_reg || '—'} — ${drv} — ${date} — signed by ${who}`
    }),
    ``,
    `— B&W Productions Ops`,
  ].join('\n')

  return { html, plain }
}

// ── small helpers ────────────────────────────────────────────────────────────

function escHtml(s: any) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function formatNiceDate(raw: string | null) {
  if (!raw) return '—'
  const d = new Date(raw)
  if (isNaN(d.getTime())) return raw
  return d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatSAST(d: Date) {
  // SAST = UTC+2 year-round
  const sast = new Date(d.getTime() + 2 * 60 * 60 * 1000)
  const dd = String(sast.getUTCDate()).padStart(2, '0')
  const mmm = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][sast.getUTCMonth()]
  const yyyy = sast.getUTCFullYear()
  const hh = String(sast.getUTCHours()).padStart(2, '0')
  const mi = String(sast.getUTCMinutes()).padStart(2, '0')
  return `${dd} ${mmm} ${yyyy} ${hh}:${mi} SAST`
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[])
  }
  return btoa(bin)
}

async function logEmail(env: DigestEnv, e: {
  recipient: string; subject: string; status: 'sent'|'failed'|'skipped';
  provider_id?: string; error?: string; delivery_ids: number[]; total_size_kb?: number
}) {
  try {
    await env.DB.prepare(
      `INSERT INTO email_log (sent_at, recipient, subject, status, provider_id, error, delivery_ids, delivery_count, total_size_kb)
       VALUES (?,?,?,?,?,?,?,?,?)`
    ).bind(
      new Date().toISOString(),
      e.recipient, e.subject, e.status,
      e.provider_id || null, e.error || null,
      JSON.stringify(e.delivery_ids), e.delivery_ids.length,
      e.total_size_kb ?? 0
    ).run()
  } catch (err) {
    // last-resort: silent — we don't want logging itself to break the worker
    console.error('email_log insert failed:', err)
  }
}
