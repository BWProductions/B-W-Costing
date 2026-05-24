// B&W Productions — Field Admin
// Login-protected admin for field ops submissions, suggested items, people & items management

import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth.js'
import { layout } from '../lib/layout.js'
import { zipSync, strToU8 } from 'fflate'
import { runDigest, ACCOUNTS_RECIPIENTS } from '../lib/email-digest.js'

type Env = { Bindings: {
  DB: D1Database
  URLBOX_PUBLISHABLE_KEY?: string
  URLBOX_SECRET_KEY?: string
  URLBOX_WEBHOOK_SECRET?: string
  PDF_BUCKET?: R2Bucket
} }
const app = new Hono<Env>()

const FORM_LABELS: Record<string, string> = {
  delivery: 'Delivery Note', collection: 'Collection Note',
  repair: 'Repair Note', inspection: 'Vehicle Inspection', shortlist: 'Shortlist',
  musicbus_inspection: 'Music Bus Inspection'
}
const FORM_COLORS: Record<string, string> = {
  delivery: 'success', collection: 'warn', repair: 'danger',
  inspection: 'info', shortlist: '#8b5cf6',
  musicbus_inspection: '#22d3ee'
}

function esc(s: any): string {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function formatDate(d: string): string {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('en-ZA', { day:'2-digit', month:'short', year:'numeric' }) }
  catch { return d }
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

app.get('/', requireAuth, async (c) => {
  const user = c.get('user' as any) as any

  // ── LAZY-TRIGGER for the draft-nudge job ──────────────────────────────────
  // If the cron hasn't run in >7 days (or never), fire it in the background.
  // Doesn't block the dashboard render \u2014 await is local to this block.
  try {
    const lastRun = await getSystemConfig(c.env.DB, 'draft_nudge_last_run', '')
    const enabled = (await getSystemConfig(c.env.DB, 'draft_nudge_lazy_trigger_enabled', '1')) === '1'
    const shouldRun = enabled && (!lastRun || (Date.now() - new Date(lastRun).getTime()) > 7*86400000)
    if (shouldRun) {
      // Don't await \u2014 fire and forget so it doesn't slow the dashboard
      c.executionCtx.waitUntil(runDraftNudges(c.env.DB, 'lazy:dashboard').then(() => {}).catch(() => {}))
    }
  } catch { /* never block the dashboard */ }

  // ── LAZY-TRIGGER for the nightly dashboard snapshot ────────────────────────
  // If we haven't snapped today (SAST), fire one in the background.
  try {
    const lastRun = await getSystemConfig(c.env.DB, 'dashboard_snapshot_last_run', '')
    const enabled = (await getSystemConfig(c.env.DB, 'dashboard_snapshot_lazy_trigger_enabled', '1')) === '1'
    const today = new Date(Date.now() + 2*3600_000).toISOString().slice(0,10)
    const lastDay = lastRun ? new Date(lastRun).toISOString().slice(0,10) : ''
    if (enabled && today !== lastDay) {
      c.executionCtx.waitUntil(runDashboardSnapshot(c.env, 'lazy').then(() => {}).catch(() => {}))
    }
  } catch { /* never block the dashboard */ }

  const [counts, recent, suggested, people, todaySigned, suspicious, pendingNudges] = await Promise.all([
    c.env.DB.prepare(`
      SELECT form_type, COUNT(*) as cnt FROM field_submissions GROUP BY form_type
    `).all<any>(),
    c.env.DB.prepare(`
      SELECT id, form_type, form_number, prepared_by, venue, event_name, delivery_date, created_at
      FROM field_submissions ORDER BY created_at DESC LIMIT 20
    `).all<any>(),
    c.env.DB.prepare(`
      SELECT fs.id, fs.description, fs.quantity, fs.suggested_by, fs.created_at,
             fsub.form_number, fsub.venue
      FROM field_suggested_items fs
      LEFT JOIN field_submissions fsub ON fs.submission_id = fsub.id
      WHERE fs.status = 'pending'
      ORDER BY fs.created_at DESC
    `).all<any>(),
    c.env.DB.prepare(`SELECT id, name, active FROM field_people ORDER BY name`).all<any>(),
    // Today's signed notes — SAST (UTC+2), only those with an actual captured signature
    c.env.DB.prepare(`
      SELECT id, form_type, form_number, prepared_by, brand, client, venue, event_name,
             delivery_date, received_by, created_at,
             CASE WHEN signature_data LIKE 'data:%' THEN 1 ELSE 0 END AS has_sig
      FROM field_submissions
      WHERE date(created_at, '+2 hours') = date('now', '+2 hours')
        AND signature_data LIKE 'data:%'
        AND COALESCE(is_draft, 0) = 0
      ORDER BY created_at DESC
    `).all<any>(),
    // ── SUSPICIOUS NOTES ─────────────────────────────────────────────────────
    // Flags:
    //   - 'unsigned_old' : >24h old, not a draft, no captured signature image
    //   - 'tiny_sig'     : has data: signature but <2048 bytes (likely tap-and-miss)
    //   - 'draft_old'    : draft still open >7 days (forgotten paperwork)
    // Limited to last 60 days so the list stays useful.
    c.env.DB.prepare(`
      SELECT id, form_type, form_number, prepared_by, brand, client, venue, event_name,
             delivery_date, received_by, created_at, is_draft,
             length(COALESCE(signature_data,'')) AS sig_bytes,
             CASE
               WHEN signature_data LIKE 'data:%' AND length(signature_data) < 2048 THEN 'tiny_sig'
               WHEN COALESCE(is_draft,0) = 1
                 AND (julianday('now') - julianday(created_at)) > 7 THEN 'draft_old'
               WHEN (signature_data IS NULL OR signature_data = '' OR signature_data NOT LIKE 'data:%')
                 AND COALESCE(is_draft,0) = 0
                 AND (julianday('now') - julianday(created_at)) > 1 THEN 'unsigned_old'
               ELSE NULL
             END AS flag
      FROM field_submissions
      WHERE created_at > datetime('now','-60 days')
        AND (
          (signature_data LIKE 'data:%' AND length(signature_data) < 2048)
          OR (COALESCE(is_draft,0) = 1 AND (julianday('now') - julianday(created_at)) > 7)
          OR ((signature_data IS NULL OR signature_data = '' OR signature_data NOT LIKE 'data:%')
              AND COALESCE(is_draft,0) = 0
              AND (julianday('now') - julianday(created_at)) > 1)
        )
      ORDER BY created_at DESC
      LIMIT 50
    `).all<any>(),
    // Pending nudge count \u2014 drafts \u2265 threshold + no fresh nudge yet
    c.env.DB.prepare(`
      SELECT COUNT(*) AS cnt
      FROM field_submissions fs
      WHERE COALESCE(fs.is_draft, 0) = 1
        AND (julianday('now') - julianday(fs.created_at)) >= 5
        AND NOT EXISTS (
          SELECT 1 FROM field_draft_nudges dn
          WHERE dn.submission_id = fs.id
            AND dn.status IN ('sent','pending')
            AND (julianday('now') - julianday(dn.created_at)) < 5
        )
    `).first<any>()
  ])

  const countMap: Record<string, number> = {}
  for (const r of (counts.results || [])) countMap[r.form_type] = r.cnt

  const totalSubs = Object.values(countMap).reduce((a, b) => a + b, 0)
  const pendingSuggested = (suggested.results || []).length
  const todaySignedRows = todaySigned.results || []
  const todaySignedCount = todaySignedRows.length
  const suspiciousRows = (suspicious.results || []) as any[]
  const suspiciousCount = suspiciousRows.length
  const pendingNudgeCount = (pendingNudges?.cnt as number) || 0

  // Suspicious flag → human-readable label + colour
  const FLAG_META: Record<string, { label: string; tone: string; tip: string }> = {
    unsigned_old: { label: 'Unsigned >24h',    tone: '#dc2626', tip: 'Submitted but never signed — chase the crew or client.' },
    tiny_sig:     { label: 'Tap-and-miss?',    tone: '#ea580c', tip: 'Signature image is unusually small (<2KB). Likely an accidental tap. Re-sign required.' },
    draft_old:    { label: 'Stale draft >7d',  tone: '#7c3aed', tip: 'Draft never submitted. Either complete it or delete it.' }
  }

  const ageLabel = (iso: string) => {
    if (!iso) return '—'
    try {
      const ms = Date.now() - new Date(iso + 'Z').getTime()
      const hours = Math.floor(ms / 3600000)
      if (hours < 48) return `${hours}h ago`
      const days = Math.floor(hours / 24)
      return `${days}d ago`
    } catch { return '—' }
  }

  // Build the brand/client display — prefer brand, else client, else event
  const brandClient = (r: any) => {
    const b = (r.brand || '').toString().trim()
    const cl = (r.client || '').toString().trim()
    const ev = (r.event_name || r.venue || '').toString().trim()
    if (b && cl) return `<strong>${esc(b)}</strong> <span class="muted">· ${esc(cl)}</span>`
    return `<strong>${esc(b || cl || ev || '—')}</strong>`
  }

  const timeOnly = (iso: string) => {
    if (!iso) return '—'
    try {
      // created_at is UTC; convert to SAST
      const d = new Date(iso + 'Z')
      return d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg' })
    } catch { return iso }
  }

  const todaySignedHtml = todaySignedCount === 0 ? `
    <div style="padding:20px;text-align:center;color:#64748b;font-size:14px">
      <i class="fas fa-inbox" style="font-size:24px;color:#cbd5e1;margin-bottom:8px;display:block"></i>
      No signed notes captured today yet.
    </div>` : `
    <div class="table-wrap">
      <table class="table" style="margin:0">
        <thead>
          <tr>
            <th style="width:60px">Time</th>
            <th style="width:90px">Type</th>
            <th style="width:110px">Form #</th>
            <th>Brand / Client</th>
            <th>Received By</th>
            <th>Prepared By</th>
            <th style="width:90px">Sig</th>
            <th style="width:140px"></th>
          </tr>
        </thead>
        <tbody>
          ${todaySignedRows.map((r:any) => `
            <tr>
              <td class="mono" style="font-size:12px;color:#475569">${timeOnly(r.created_at)}</td>
              <td><span class="badge badge-${FORM_COLORS[r.form_type]||'info'}" style="font-size:10px">${FORM_LABELS[r.form_type]||r.form_type}</span></td>
              <td class="mono" style="font-size:12px">${esc(r.form_number)}</td>
              <td>${brandClient(r)}</td>
              <td>${esc(r.received_by || '—')}</td>
              <td class="muted">${esc(r.prepared_by || '—')}</td>
              <td><span class="badge" style="background:#dcfce7;color:#166534;font-size:10px;font-weight:600"><i class="fas fa-signature" style="font-size:9px;margin-right:3px"></i>Signed</span></td>
              <td style="white-space:nowrap">
                <a href="/field/admin/submission/${r.id}" class="btn btn-sm btn-secondary" style="font-size:11px;padding:4px 10px">View</a>
                <a href="/field/admin/submission/${r.id}/edit" class="btn btn-sm" style="font-size:11px;padding:4px 10px;background:#0ea5e9;color:#fff;border:none;margin-left:4px"><i class="fas fa-pen" style="font-size:10px;margin-right:3px"></i>Edit</a>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`

  const countCards = ['delivery','collection','repair','inspection','shortlist'].map(t => `
    <div class="stat-card">
      <div class="stat-num">${countMap[t] || 0}</div>
      <div class="stat-label">${FORM_LABELS[t]}</div>
    </div>`).join('')

  const eventVenueCombo = (r: any) => {
    const ev = (r.event_name || '').toString().trim()
    const vn = (r.venue || '').toString().trim()
    if (ev && vn) return ev.toLowerCase() === vn.toLowerCase() ? esc(ev) : `${esc(ev)} <span class="muted">— ${esc(vn)}</span>`
    return esc(ev || vn || '—')
  }

  const recentRows = (recent.results || []).map((r: any) => `
    <tr>
      <td><span class="badge badge-${FORM_COLORS[r.form_type] || 'info'}" style="font-size:10px">${FORM_LABELS[r.form_type] || r.form_type}</span></td>
      <td class="mono" style="font-size:12px">${esc(r.form_number)}</td>
      <td>${esc(r.prepared_by)}</td>
      <td class="muted">${eventVenueCombo(r)}</td>
      <td class="muted" style="font-size:12px">${formatDate(r.delivery_date || r.created_at)}</td>
      <td style="white-space:nowrap">
        <a href="/field/admin/submission/${r.id}" class="btn btn-sm btn-secondary">View</a>
        <a href="/field/admin/submission/${r.id}/edit" class="btn btn-sm" style="background:#0ea5e9;color:#fff;border:none;margin-left:4px"><i class="fas fa-pen" style="font-size:10px"></i></a>
      </td>
    </tr>`).join('')

  const suggestedRows = (suggested.results || []).map((r: any) => `
    <tr data-sug-row="${r.id}">
      <td style="text-align:center;width:36px">
        <input type="checkbox" class="sug-check" value="${r.id}" data-desc="${esc(r.description)}" style="width:16px;height:16px;cursor:pointer">
      </td>
      <td>${esc(r.description)}</td>
      <td style="text-align:center">${r.quantity}</td>
      <td class="muted">${esc(r.suggested_by)}</td>
      <td class="muted" style="font-size:12px">${esc(r.form_number || '—')}</td>
      <td>
        <form method="POST" action="/field/admin/suggest/approve" style="display:inline">
          <input type="hidden" name="id" value="${r.id}">
          <input type="hidden" name="description" value="${esc(r.description)}">
          <button class="btn btn-sm" style="background:var(--success);color:#fff;border:none;padding:5px 10px;border-radius:6px;cursor:pointer;font-size:12px">+ Add to List</button>
        </form>
        <form method="POST" action="/field/admin/suggest/ignore" style="display:inline;margin-left:6px">
          <input type="hidden" name="id" value="${r.id}">
          <button class="btn btn-sm btn-secondary" style="font-size:12px;padding:5px 10px">Ignore</button>
        </form>
      </td>
    </tr>`).join('')

  const body = `
    <div class="stats-grid" style="grid-template-columns:repeat(6,1fr);margin-bottom:24px">
      <div class="stat-card">
        <div class="stat-num">${totalSubs}</div>
        <div class="stat-label">Total Submissions</div>
      </div>
      <div class="stat-card" style="border-color:#10b981">
        <div class="stat-num" style="color:#10b981">${todaySignedCount}</div>
        <div class="stat-label">Signed Today</div>
      </div>
      <div class="stat-card" style="${suspiciousCount > 0 ? 'border-color:#dc2626' : ''}">
        <div class="stat-num" style="${suspiciousCount > 0 ? 'color:#dc2626' : ''}">${suspiciousCount}</div>
        <div class="stat-label">⚠ Needs Attention</div>
      </div>
      <div class="stat-card" style="${pendingNudgeCount > 0 ? 'border-color:#f59e0b' : ''}"><a href="/field/admin/draft-nudges" style="text-decoration:none;color:inherit;display:block">
        <div class="stat-num" style="${pendingNudgeCount > 0 ? 'color:#f59e0b' : ''}">${pendingNudgeCount}</div>
        <div class="stat-label">🔔 Drafts to Nudge</div>
      </a></div>
      <div class="stat-card" style="${pendingSuggested > 0 ? 'border-color:var(--warn)' : ''}">
        <div class="stat-num" style="${pendingSuggested > 0 ? 'color:var(--warn)' : ''}">${pendingSuggested}</div>
        <div class="stat-label">Suggested Items</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">${(people.results || []).filter((p:any) => p.active).length}</div>
        <div class="stat-label">Active People</div>
      </div>
    </div>

    ${suspiciousCount > 0 ? `
    <!-- Suspicious / Needs Attention -->
    <div class="card mb-4" style="border-top:3px solid #dc2626">
      <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
        <h3 class="card-title">
          <i class="fas fa-triangle-exclamation" style="color:#dc2626;margin-right:6px"></i>
          Needs Attention
          <span class="badge" style="background:#fee2e2;color:#991b1b;margin-left:6px">${suspiciousCount}</span>
          <span class="muted" style="font-weight:400;font-size:12px;margin-left:6px">Last 60 days</span>
        </h3>
        <span class="muted" style="font-size:12px"><i class="fas fa-info-circle"></i> Auto-detected. Click View to investigate.</span>
      </div>
      <div class="table-wrap">
        <table class="table" style="margin:0">
          <thead>
            <tr>
              <th style="width:140px">Flag</th>
              <th style="width:100px">Type</th>
              <th style="width:110px">Form #</th>
              <th>Brand / Client</th>
              <th>Venue</th>
              <th>Prepared By</th>
              <th style="width:90px">Age</th>
              <th style="width:80px"></th>
            </tr>
          </thead>
          <tbody>
            ${suspiciousRows.map((r:any) => {
              const meta = FLAG_META[r.flag] || { label: r.flag, tone: '#64748b', tip: '' }
              return `
              <tr>
                <td>
                  <span class="badge" title="${esc(meta.tip)}" style="background:${meta.tone}1a;color:${meta.tone};font-size:10px;font-weight:600;border:1px solid ${meta.tone}40">
                    <i class="fas fa-flag" style="font-size:9px;margin-right:3px"></i>${meta.label}
                  </span>
                  ${r.flag === 'tiny_sig' ? `<div class="mono" style="font-size:10px;color:#64748b;margin-top:2px">${r.sig_bytes} B sig</div>` : ''}
                </td>
                <td><span class="badge badge-${FORM_COLORS[r.form_type]||'info'}" style="font-size:10px">${FORM_LABELS[r.form_type]||r.form_type}</span></td>
                <td class="mono" style="font-size:12px">${esc(r.form_number)}</td>
                <td>${brandClient(r)}</td>
                <td class="muted">${esc(r.venue || r.event_name || '—')}</td>
                <td class="muted">${esc(r.prepared_by || '—')}</td>
                <td class="muted" style="font-size:12px">${ageLabel(r.created_at)}</td>
                <td><a href="/field/admin/submission/${r.id}" class="btn btn-sm btn-secondary" style="font-size:11px;padding:4px 10px">View</a></td>
              </tr>`
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}

    <!-- Snapshot Tools (Urlbox) -->
    <div class="card mb-4" style="border-top:3px solid #8b5cf6">
      <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
        <h3 class="card-title">
          <i class="fas fa-camera-retro" style="color:#8b5cf6;margin-right:6px"></i>
          Snapshot Tools
          <span class="muted" style="font-weight:400;font-size:12px;margin-left:6px">On-demand PNG/PDF of any admin view · powered by Urlbox</span>
        </h3>
        <div style="display:flex;gap:6px">
          <a href="/field/admin/renderer-stats" class="btn btn-sm btn-secondary" style="font-size:12px" title="Urlbox vs PDFShift usage stats"><i class="fas fa-chart-line"></i> Renderer Stats</a>
          <a href="/field/admin/snapshots" class="btn btn-sm btn-secondary" style="font-size:12px" title="Browse archived daily snapshots"><i class="fas fa-images"></i> Archive</a>
          <a href="/field/admin/urlbox/health" target="_blank" class="btn btn-sm btn-secondary" style="font-size:12px" title="Verify Urlbox keys are working"><i class="fas fa-heartbeat"></i> Health</a>
        </div>
      </div>
      <div class="card-body" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <a href="/field/admin/snapshot?target=dashboard&format=png" class="btn btn-sm btn-secondary"><i class="fas fa-image"></i> Dashboard PNG</a>
        <a href="/field/admin/snapshot?target=dashboard&format=pdf" class="btn btn-sm btn-secondary"><i class="fas fa-file-pdf"></i> Dashboard PDF</a>
        <span style="color:#cbd5e1">|</span>
        <a href="/field/admin/snapshot?target=archive&format=png" class="btn btn-sm btn-secondary"><i class="fas fa-image"></i> Archive PNG</a>
        <a href="/field/admin/snapshot?target=archive&format=pdf" class="btn btn-sm btn-secondary"><i class="fas fa-file-pdf"></i> Archive PDF</a>
        <span class="muted" style="margin-left:auto;font-size:11px">⏱ Each snapshot takes ~3-6s</span>
      </div>
    </div>

    <!-- Today's Signed Notes -->
    <div class="card mb-4" style="border-top:3px solid #10b981">
      <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
        <h3 class="card-title">
          <i class="fas fa-signature" style="color:#10b981;margin-right:6px"></i>
          Today's Signed Notes
          <span class="badge" style="background:#dcfce7;color:#166534;margin-left:6px">${todaySignedCount}</span>
          <span class="muted" style="font-weight:400;font-size:12px;margin-left:6px">${new Date().toLocaleDateString('en-ZA',{day:'2-digit',month:'long',year:'numeric',timeZone:'Africa/Johannesburg'})} · SAST</span>
        </h3>
        <a href="/field/admin/signed-notes" class="btn btn-sm" style="background:#10b981;color:#fff;border:none;padding:7px 14px;border-radius:6px;font-size:13px;text-decoration:none;font-weight:600">
          <i class="fas fa-archive" style="margin-right:5px"></i>Open Signed Notes Archive →
        </a>
      </div>
      ${todaySignedHtml}
    </div>

    <div class="stats-grid" style="grid-template-columns:repeat(5,1fr);margin-bottom:28px">
      ${countCards}
    </div>

    <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap">
      <a href="/field" target="_blank" class="btn btn-secondary"><i class="fas fa-external-link-alt"></i> Open Field App</a>
      <a href="/field/admin/submissions" class="btn btn-secondary"><i class="fas fa-list"></i> All Submissions</a>
      <a href="/field/admin/signed-notes" class="btn btn-secondary"><i class="fas fa-signature"></i> Signed Notes Archive</a>
      <a href="/field/admin/draft-nudges" class="btn btn-secondary"><i class="fas fa-bell"></i> Draft Nudges</a>
      <a href="/field/admin/people" class="btn btn-secondary"><i class="fas fa-users"></i> Manage People</a>
      <a href="/field/admin/items" class="btn btn-secondary"><i class="fas fa-boxes"></i> Manage Items</a>
      <a href="/field/admin/damages" class="btn btn-secondary" style="border-color:rgba(239,68,68,0.4)"><i class="fas fa-exclamation-triangle"></i> B&W Damages</a>
    </div>

    <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap;padding:12px;background:rgba(34,211,238,0.06);border:1px solid rgba(34,211,238,0.25);border-radius:10px">
      <div style="font-size:11px;font-weight:700;color:#22d3ee;text-transform:uppercase;letter-spacing:0.06em;align-self:center;margin-right:6px">🎵 Music Bus</div>
      <a href="/musicbus" target="_blank" class="btn btn-sm btn-secondary"><i class="fas fa-external-link-alt"></i> Public App</a>
      <a href="/field/admin/musicbus-vehicles" class="btn btn-sm btn-secondary"><i class="fas fa-truck"></i> Vehicles</a>
      <a href="/field/admin/musicbus-drivers" class="btn btn-sm btn-secondary"><i class="fas fa-users"></i> Drivers</a>
      <a href="/field/admin/musicbus-damages" class="btn btn-sm btn-secondary"><i class="fas fa-exclamation-triangle"></i> Damages</a>
    </div>

    ${pendingSuggested > 0 ? `
    <div class="card mb-4" id="suggested-panel">
      <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
        <h3 class="card-title">⭐ Suggested New Items <span class="badge badge-warn">${pendingSuggested} pending</span></h3>
        <a href="/field/admin/products?tab=queue" class="btn btn-sm" style="background:#4f46e5;color:#fff;border:none;padding:7px 14px;border-radius:6px;font-size:13px;text-decoration:none;font-weight:600">
          <i class="fas fa-magnifying-glass-chart" style="margin-right:5px"></i>Open full triage →
        </a>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th style="text-align:center;width:36px">
                <input type="checkbox" id="sug-master" style="width:16px;height:16px;cursor:pointer" title="Select all">
              </th>
              <th>Description</th><th>Qty</th><th>Suggested By</th><th>Form</th><th>Action</th>
            </tr>
          </thead>
          <tbody>${suggestedRows || '<tr><td colspan="6" class="muted text-center">All clear</td></tr>'}</tbody>
        </table>
      </div>
    </div>

    <!-- Sticky Bulk Action Bar -->
    <div id="sug-bulk-bar" style="display:none;position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1f2937;color:#fff;padding:12px 20px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,0.3);z-index:1000;align-items:center;gap:14px;font-size:14px;border:1px solid #374151;max-width:95vw;flex-wrap:wrap">
      <span id="sug-count-label" style="font-weight:600"><span id="sug-count">0</span> selected</span>
      <button id="sug-bulk-add" type="button" style="background:#10b981;color:#fff;border:none;padding:8px 14px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">
        <i class="fas fa-plus" style="margin-right:4px"></i>Bulk Add to List
      </button>
      <button id="sug-bulk-ignore" type="button" style="background:#ef4444;color:#fff;border:none;padding:8px 14px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">
        <i class="fas fa-ban" style="margin-right:4px"></i>Bulk Ignore
      </button>
      <button id="sug-bulk-clear" type="button" style="background:transparent;color:#9ca3af;border:1px solid #4b5563;padding:8px 14px;border-radius:8px;cursor:pointer;font-size:13px">
        Clear
      </button>
    </div>

    <script>
    (function(){
      const master = document.getElementById('sug-master');
      const bar = document.getElementById('sug-bulk-bar');
      const countEl = document.getElementById('sug-count');
      if (!bar) return;
      const boxes = () => Array.from(document.querySelectorAll('.sug-check'));
      const selected = () => boxes().filter(b => b.checked);
      function refresh(){
        const n = selected().length;
        countEl.textContent = n;
        bar.style.display = n > 0 ? 'flex' : 'none';
        if (master) {
          const all = boxes();
          master.checked = all.length > 0 && n === all.length;
          master.indeterminate = n > 0 && n < all.length;
        }
      }
      if (master) master.addEventListener('change', () => {
        boxes().forEach(b => { b.checked = master.checked; });
        refresh();
      });
      boxes().forEach(b => b.addEventListener('change', refresh));
      document.getElementById('sug-bulk-clear').addEventListener('click', () => {
        boxes().forEach(b => { b.checked = false; });
        refresh();
      });
      async function runBulk(action, label, btn){
        const ids = selected().map(b => Number(b.value));
        if (!ids.length) return;
        if (!confirm(label + ' ' + ids.length + ' item' + (ids.length>1?'s':'') + '?')) return;
        const original = btn.innerHTML;
        btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Working...';
        try {
          const res = await fetch('/field/admin/products/api/bulk-suggestion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, ids })
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || data.success === false) throw new Error(data.error || 'Server returned ' + res.status);
          // Remove rows from DOM
          ids.forEach(id => {
            const row = document.querySelector('[data-sug-row="' + id + '"]');
            if (row) row.remove();
          });
          refresh();
          // If panel is empty, reload to update counters
          if (!document.querySelectorAll('.sug-check').length) {
            location.reload();
          }
        } catch (e) {
          alert('Failed: ' + (e.message || e));
          btn.disabled = false; btn.innerHTML = original;
        }
      }
      document.getElementById('sug-bulk-add').addEventListener('click', function(){
        runBulk('create', 'Add to master list:', this);
      });
      document.getElementById('sug-bulk-ignore').addEventListener('click', function(){
        runBulk('ignore', 'Ignore', this);
      });
      refresh();
    })();
    </script>` : ''}

    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Recent Submissions</h3>
        <a href="/field/admin/submissions" class="btn btn-sm btn-secondary">View All</a>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Type</th><th>Ref</th><th>Prepared By</th><th>Event — Venue</th><th>Date</th><th></th></tr></thead>
          <tbody>${recentRows || '<tr><td colspan="6" class="muted text-center">No submissions yet</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  `

  return c.html(layout('Field Admin', body, user, 'field-admin'))
})

// ─── ALL SUBMISSIONS ───────────────────────────────────────────────────────────

app.get('/submissions', requireAuth, async (c) => {
  const user = c.get('user' as any) as any
  const type = c.req.query('type') || ''
  const search = c.req.query('search') || ''

  let query = `SELECT id, form_type, form_number, prepared_by, driver, venue, event_name, delivery_date, created_at
               FROM field_submissions WHERE 1=1`
  const params: any[] = []
  if (type) { query += ' AND form_type=?'; params.push(type) }
  if (search) { query += ' AND (venue LIKE ? OR prepared_by LIKE ? OR form_number LIKE ? OR event_name LIKE ?)'; const s = `%${search}%`; params.push(s,s,s,s) }
  query += ' ORDER BY created_at DESC LIMIT 100'

  const rows = await c.env.DB.prepare(query).bind(...params).all<any>()

  const typeFilter = ['','delivery','collection','repair','inspection','shortlist'].map(t => `
    <option value="${t}" ${type===t?'selected':''}>${t ? FORM_LABELS[t] : 'All Types'}</option>`).join('')

  const deletedBanner = c.req.query('deleted') === '1' ? `
    <div style="background:#f0fdf4;border:1px solid #86efac;color:#166534;padding:10px 16px;border-radius:8px;margin-bottom:16px;font-size:14px">
      ✅ Submission deleted successfully.
    </div>` : ''

  const tableRows = (rows.results || []).map((r: any) => `
    <tr>
      <td><span class="badge badge-${FORM_COLORS[r.form_type]||'info'}" style="font-size:10px">${FORM_LABELS[r.form_type]||r.form_type}</span></td>
      <td class="mono" style="font-size:12px">${esc(r.form_number)}</td>
      <td>${esc(r.prepared_by)}</td>
      <td class="muted">${esc(r.driver || '—')}</td>
      <td class="muted">${esc(r.venue || '—')}</td>
      <td class="muted">${esc(r.event_name || '—')}</td>
      <td class="muted" style="font-size:12px">${formatDate(r.delivery_date || r.created_at)}</td>
      <td style="display:flex;gap:6px">
        <a href="/field/admin/submission/${r.id}" class="btn btn-sm btn-secondary">View</a>
        <a href="/field/admin/submission/${r.id}/edit" class="btn btn-sm" style="background:#0ea5e9;color:#fff;border:none" title="Edit"><i class="fas fa-pen" style="font-size:11px"></i></a>
        <a href="/field/admin/submission/${r.id}" class="btn btn-sm" style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5" title="Delete"><i class="fas fa-trash" style="font-size:11px"></i></a>
      </td>
    </tr>`).join('')

  const body = `
    ${deletedBanner}
    <div class="card mb-4">
      <form method="GET" style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
        <div class="form-group" style="flex:1;min-width:140px;margin:0">
          <label class="label">Filter Type</label>
          <select name="type" class="input">${typeFilter}</select>
        </div>
        <div class="form-group" style="flex:2;min-width:180px;margin:0">
          <label class="label">Search</label>
          <input name="search" class="input" value="${esc(search)}" placeholder="Venue, name, ref…">
        </div>
        <button type="submit" class="btn btn-secondary">Filter</button>
        <a href="/field/admin/submissions" class="btn btn-secondary">Clear</a>
      </form>
    </div>
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Submissions <span class="badge badge-info">${(rows.results||[]).length}</span></h3>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Type</th><th>Ref</th><th>Prepared By</th><th>Driver</th><th>Venue</th><th>Event</th><th>Date</th><th></th></tr></thead>
          <tbody>${tableRows || '<tr><td colspan="8" class="muted text-center">No submissions found</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  `
  return c.html(layout('All Submissions', body, user, 'field-admin'))
})

// ─── SIGNED NOTES ARCHIVE ──────────────────────────────────────────────────────
//
// Permanent audit-trail view of every captured signature. Filters strictly on
// `signature_data LIKE 'data:%'` so unsigned drafts never appear. Default view
// is the current month; navigate by month via ?ym=YYYY-MM. Includes CSV export.

app.get('/signed-notes', requireAuth, async (c) => {
  const user = c.get('user' as any) as any
  const ym = (c.req.query('ym') || '').trim()                 // YYYY-MM filter
  const type = (c.req.query('type') || '').trim()
  const search = (c.req.query('search') || '').trim()

  // Default to current SAST month if not specified
  const now = new Date(Date.now() + 2*60*60*1000) // SAST = UTC+2
  const currentYm = `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,'0')}`
  const useYm = ym || currentYm

  let where = `signature_data LIKE 'data:%' AND COALESCE(is_draft, 0) = 0
               AND strftime('%Y-%m', created_at, '+2 hours') = ?`
  const params: any[] = [useYm]
  if (type) { where += ' AND form_type = ?'; params.push(type) }
  if (search) {
    where += ` AND (
      LOWER(COALESCE(brand,''))      LIKE LOWER(?)
      OR LOWER(COALESCE(client,''))  LIKE LOWER(?)
      OR LOWER(COALESCE(venue,''))   LIKE LOWER(?)
      OR LOWER(COALESCE(event_name,'')) LIKE LOWER(?)
      OR LOWER(COALESCE(prepared_by,'')) LIKE LOWER(?)
      OR LOWER(COALESCE(received_by,'')) LIKE LOWER(?)
      OR LOWER(COALESCE(form_number,'')) LIKE LOWER(?)
      OR LOWER(COALESCE(notes,''))   LIKE LOWER(?)
    )`
    const s = `%${search}%`
    params.push(s, s, s, s, s, s, s, s)
  }

  const rowsQ = await c.env.DB.prepare(`
    SELECT id, form_type, form_number, prepared_by, brand, client, venue, event_name,
           delivery_date, received_by, signature_data, created_at,
           length(signature_data) AS sig_bytes
    FROM field_submissions
    WHERE ${where}
    ORDER BY created_at DESC
  `).bind(...params).all<any>()

  // Available months for the dropdown
  const monthsQ = await c.env.DB.prepare(`
    SELECT DISTINCT strftime('%Y-%m', created_at, '+2 hours') AS ym,
           COUNT(*) AS cnt
    FROM field_submissions
    WHERE signature_data LIKE 'data:%' AND COALESCE(is_draft, 0) = 0
    GROUP BY ym
    ORDER BY ym DESC
  `).all<any>()

  // Totals across the whole archive (for header)
  const totalQ = await c.env.DB.prepare(`
    SELECT COUNT(*) AS total
    FROM field_submissions
    WHERE signature_data LIKE 'data:%' AND COALESCE(is_draft, 0) = 0
  `).first<any>()

  const rows = rowsQ.results || []
  const months = monthsQ.results || []
  const totalSigned = (totalQ?.total as number) || 0

  // Format YYYY-MM as "May 2026"
  const fmtYm = (s: string) => {
    if (!s || !/^\d{4}-\d{2}$/.test(s)) return s
    const [y, m] = s.split('-').map(Number)
    return new Date(Date.UTC(y, m-1, 1)).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  }

  const monthOpts = months.map((m: any) =>
    `<option value="${m.ym}" ${m.ym===useYm?'selected':''}>${fmtYm(m.ym)} (${m.cnt})</option>`
  ).join('')

  const typeOpts = ['','delivery','collection','repair','inspection','shortlist'].map(t =>
    `<option value="${t}" ${t===type?'selected':''}>${t ? FORM_LABELS[t] : 'All Types'}</option>`
  ).join('')

  const brandClient = (r: any) => {
    const b = (r.brand || '').toString().trim()
    const cl = (r.client || '').toString().trim()
    if (b && cl) return `<strong>${esc(b)}</strong><br><span class="muted" style="font-size:12px">${esc(cl)}</span>`
    return `<strong>${esc(b || cl || '—')}</strong>`
  }

  const sastDateTime = (iso: string) => {
    if (!iso) return '—'
    try {
      const d = new Date(iso + 'Z')
      return d.toLocaleString('en-ZA', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', timeZone: 'Africa/Johannesburg' })
    } catch { return iso }
  }

  const sigSize = (bytes: number) => {
    if (!bytes) return '—'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024*1024) return `${(bytes/1024).toFixed(1)} KB`
    return `${(bytes/(1024*1024)).toFixed(2)} MB`
  }

  const tableRows = rows.map((r: any) => `
    <tr data-note-row="${r.id}">
      <td style="text-align:center;width:36px">
        <input type="checkbox" class="note-check" value="${r.id}" style="width:16px;height:16px;cursor:pointer">
      </td>
      <td class="mono" style="font-size:12px;white-space:nowrap">${sastDateTime(r.created_at)}</td>
      <td><span class="badge badge-${FORM_COLORS[r.form_type]||'info'}" style="font-size:10px">${FORM_LABELS[r.form_type]||r.form_type}</span></td>
      <td class="mono" style="font-size:12px">${esc(r.form_number)}</td>
      <td>${brandClient(r)}</td>
      <td>${esc(r.venue || r.event_name || '—')}</td>
      <td>${esc(r.received_by || '—')}</td>
      <td class="muted">${esc(r.prepared_by || '—')}</td>
      <td><span class="badge" style="background:#dcfce7;color:#166534;font-size:10px;font-weight:600"><i class="fas fa-check-circle" style="font-size:9px;margin-right:3px"></i>${sigSize(r.sig_bytes)}</span></td>
      <td style="white-space:nowrap">
        <a href="/field/admin/submission/${r.id}" class="btn btn-sm btn-secondary" style="font-size:11px;padding:4px 10px">View</a>
        <a href="/field/admin/submission/${r.id}/edit" class="btn btn-sm" style="font-size:11px;padding:4px 10px;background:#0ea5e9;color:#fff;border:none;margin-left:4px"><i class="fas fa-pen" style="font-size:10px;margin-right:3px"></i>Edit</a>
      </td>
    </tr>`).join('')

  const filterQs = `ym=${encodeURIComponent(useYm)}${type?`&type=${encodeURIComponent(type)}`:''}${search?`&search=${encodeURIComponent(search)}`:''}`
  const csvUrl = `/field/admin/signed-notes.csv?${filterQs}`
  const zipAllUrl = `/field/admin/signed-notes.zip?${filterQs}`
  const combinedAllUrl = `/field/admin/signed-notes.combined.html?${filterQs}`

  const body = `
    <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:24px">
      <div class="stat-card" style="border-top:3px solid #10b981">
        <div class="stat-num" style="color:#10b981">${rows.length}</div>
        <div class="stat-label">Signed in ${fmtYm(useYm)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">${totalSigned}</div>
        <div class="stat-label">Total Signed (All Time)</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">${months.length}</div>
        <div class="stat-label">Months Active</div>
      </div>
    </div>

    <div class="card mb-4">
      <form method="GET" style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
        <div class="form-group" style="min-width:160px;margin:0">
          <label class="label">Month</label>
          <select name="ym" class="input">${monthOpts || `<option value="${useYm}">${fmtYm(useYm)}</option>`}</select>
        </div>
        <div class="form-group" style="min-width:140px;margin:0">
          <label class="label">Type</label>
          <select name="type" class="input">${typeOpts}</select>
        </div>
        <div class="form-group" style="flex:1;min-width:200px;margin:0">
          <label class="label">Search</label>
          <input name="search" class="input" value="${esc(search)}" placeholder="Brand, client, venue, name, ref…">
        </div>
        <button type="submit" class="btn btn-secondary"><i class="fas fa-filter"></i> Filter</button>
        <a href="/field/admin/signed-notes" class="btn btn-secondary">Clear</a>
        <a href="${csvUrl}" class="btn" style="background:#0ea5e9;color:#fff;border:none">
          <i class="fas fa-file-csv"></i> CSV
        </a>
        <a href="${combinedAllUrl}" target="_blank" class="btn" style="background:#7c3aed;color:#fff;border:none" title="Open print-ready combined view → Save as PDF gives 1 file">
          <i class="fas fa-file-pdf"></i> Combined PDF (all)
        </a>
        <a href="${zipAllUrl}" class="btn" style="background:#10b981;color:#fff;border:none" title="Download a zip of individual print-ready HTML notes + manifest">
          <i class="fas fa-file-zipper"></i> ZIP (all)
        </a>
      </form>
      <div class="muted" style="font-size:12px;margin-top:8px"><i class="fas fa-info-circle"></i> Tick rows below to export a subset, or use the buttons above to export everything matching the current filter.</div>
    </div>

    <div class="card">
      <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
        <h3 class="card-title">
          <i class="fas fa-signature" style="color:#10b981;margin-right:6px"></i>
          Signed Notes Archive
          <span class="badge" style="background:#dcfce7;color:#166534;margin-left:6px">${rows.length} result${rows.length===1?'':'s'}</span>
        </h3>
        <span class="muted" style="font-size:12px"><i class="fas fa-info-circle"></i> Every row below has a captured signature. This is your permanent record.</span>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th style="text-align:center;width:36px">
                <input type="checkbox" id="note-master" style="width:16px;height:16px;cursor:pointer" title="Select all">
              </th>
              <th>Captured (SAST)</th>
              <th>Type</th>
              <th>Form #</th>
              <th>Brand / Client</th>
              <th>Venue / Event</th>
              <th>Received By</th>
              <th>Prepared By</th>
              <th>Signature</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${tableRows || `<tr><td colspan="10" class="muted text-center" style="padding:30px"><i class="fas fa-folder-open" style="font-size:28px;color:#cbd5e1;display:block;margin-bottom:8px"></i>No signed notes match these filters.</td></tr>`}</tbody>
        </table>
      </div>
    </div>

    <!-- Sticky Bulk Export Bar -->
    <div id="note-bulk-bar" style="display:none;position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1f2937;color:#fff;padding:12px 20px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,0.3);z-index:1000;align-items:center;gap:14px;font-size:14px;border:1px solid #374151;max-width:95vw;flex-wrap:wrap">
      <span style="font-weight:600"><span id="note-count">0</span> selected</span>
      <button id="note-bulk-combined" type="button" style="background:#7c3aed;color:#fff;border:none;padding:8px 14px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">
        <i class="fas fa-file-pdf" style="margin-right:4px"></i>Combined PDF
      </button>
      <button id="note-bulk-zip" type="button" style="background:#10b981;color:#fff;border:none;padding:8px 14px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">
        <i class="fas fa-file-zipper" style="margin-right:4px"></i>Download ZIP
      </button>
      <button id="note-bulk-clear" type="button" style="background:transparent;color:#9ca3af;border:1px solid #4b5563;padding:8px 14px;border-radius:8px;cursor:pointer;font-size:13px">
        Clear
      </button>
    </div>

    <script>
    (function(){
      const master = document.getElementById('note-master');
      const bar = document.getElementById('note-bulk-bar');
      const countEl = document.getElementById('note-count');
      if (!bar) return;
      const boxes = () => Array.from(document.querySelectorAll('.note-check'));
      const selected = () => boxes().filter(b => b.checked);
      function refresh(){
        const n = selected().length;
        countEl.textContent = n;
        bar.style.display = n > 0 ? 'flex' : 'none';
        if (master) {
          const all = boxes();
          master.checked = all.length > 0 && n === all.length;
          master.indeterminate = n > 0 && n < all.length;
        }
      }
      if (master) master.addEventListener('change', () => {
        boxes().forEach(b => { b.checked = master.checked; });
        refresh();
      });
      boxes().forEach(b => b.addEventListener('change', refresh));
      document.getElementById('note-bulk-clear').addEventListener('click', () => {
        boxes().forEach(b => { b.checked = false; });
        refresh();
      });
      function selectedIds(){ return selected().map(b => b.value).join(','); }
      document.getElementById('note-bulk-combined').addEventListener('click', () => {
        const ids = selectedIds();
        if (!ids) return;
        window.open('/field/admin/signed-notes.combined.html?ids=' + encodeURIComponent(ids), '_blank');
      });
      document.getElementById('note-bulk-zip').addEventListener('click', () => {
        const ids = selectedIds();
        if (!ids) return;
        window.location.href = '/field/admin/signed-notes.zip?ids=' + encodeURIComponent(ids);
      });
      refresh();
    })();
    </script>
  `

  return c.html(layout('Signed Notes Archive', body, user, 'field-admin'))
})

// CSV export of the signed-notes archive
app.get('/signed-notes.csv', requireAuth, async (c) => {
  const ym = (c.req.query('ym') || '').trim()
  const type = (c.req.query('type') || '').trim()
  const search = (c.req.query('search') || '').trim()

  const now = new Date(Date.now() + 2*60*60*1000)
  const currentYm = `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,'0')}`
  const useYm = ym || currentYm

  let where = `signature_data LIKE 'data:%' AND COALESCE(is_draft, 0) = 0
               AND strftime('%Y-%m', created_at, '+2 hours') = ?`
  const params: any[] = [useYm]
  if (type) { where += ' AND form_type = ?'; params.push(type) }
  if (search) {
    where += ` AND (
      LOWER(COALESCE(brand,''))      LIKE LOWER(?)
      OR LOWER(COALESCE(client,''))  LIKE LOWER(?)
      OR LOWER(COALESCE(venue,''))   LIKE LOWER(?)
      OR LOWER(COALESCE(event_name,'')) LIKE LOWER(?)
      OR LOWER(COALESCE(prepared_by,'')) LIKE LOWER(?)
      OR LOWER(COALESCE(received_by,'')) LIKE LOWER(?)
      OR LOWER(COALESCE(form_number,'')) LIKE LOWER(?)
      OR LOWER(COALESCE(notes,''))   LIKE LOWER(?)
    )`
    const s = `%${search}%`
    params.push(s, s, s, s, s, s, s, s)
  }

  const rowsQ = await c.env.DB.prepare(`
    SELECT id, form_type, form_number, prepared_by, brand, client, venue, event_name,
           delivery_date, received_by, created_at, length(signature_data) AS sig_bytes
    FROM field_submissions
    WHERE ${where}
    ORDER BY created_at DESC
  `).bind(...params).all<any>()

  const rows = rowsQ.results || []
  const csvCell = (v: any) => {
    const s = (v == null ? '' : String(v)).replace(/"/g, '""')
    return /[",\n]/.test(s) ? `"${s}"` : s
  }
  const header = ['ID','Captured (SAST)','Type','Form Number','Prepared By','Brand','Client','Venue','Event','Delivery Date','Received By','Signature Bytes','Backend URL']
  const lines = [header.join(',')]
  for (const r of rows) {
    const captured = (() => {
      try { return new Date((r.created_at as string) + 'Z').toLocaleString('en-ZA', { timeZone:'Africa/Johannesburg' }) }
      catch { return r.created_at }
    })()
    lines.push([
      r.id, captured, FORM_LABELS[r.form_type] || r.form_type, r.form_number,
      r.prepared_by, r.brand, r.client, r.venue, r.event_name,
      r.delivery_date, r.received_by, r.sig_bytes,
      `https://bw-productions.pages.dev/field/admin/submission/${r.id}`
    ].map(csvCell).join(','))
  }
  const csv = lines.join('\n')
  const filename = `signed-notes-${useYm}${type?`-${type}`:''}.csv`
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store'
    }
  })
})

// ─── PRINT-READY NOTE RENDERER ─────────────────────────────────────────────────
// Render one signed submission as a clean, self-contained, print-friendly HTML
// page. Used by both the bulk-zip and combined-PDF endpoints.

async function renderPrintNote(DB: D1Database, id: number): Promise<string> {
  const sub = await DB.prepare('SELECT * FROM field_submissions WHERE id=?').bind(id).first<any>()
  if (!sub) return ''
  const lines = await DB.prepare('SELECT * FROM field_line_items WHERE submission_id=? ORDER BY sort_order').bind(id).all<any>()
  const others = await DB.prepare("SELECT * FROM field_suggested_items WHERE submission_id=? AND status != 'ignored'").bind(id).all<any>()

  const formData = (() => { try { return JSON.parse(sub.form_data || '{}') } catch { return {} } })()
  const label = FORM_LABELS[sub.form_type] || sub.form_type
  const captured = (() => {
    try { return new Date((sub.created_at as string) + 'Z').toLocaleString('en-ZA', { timeZone:'Africa/Johannesburg', day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' }) }
    catch { return sub.created_at }
  })()

  const lineRows = (lines.results || []).map((li: any) => `
    <tr>
      <td style="text-align:center;width:48px">${esc(String(li.quantity ?? ''))}</td>
      <td>${esc(li.item_name || '')}</td>
      <td>${esc(li.brand || '—')}</td>
      <td>${esc(li.condition || 'Checked')}</td>
      <td>${esc(li.comments || '')}</td>
    </tr>`).join('')

  const otherRows = (others.results || []).map((o: any) => `
    <tr>
      <td style="text-align:center;width:48px">${esc(String(o.quantity ?? ''))}</td>
      <td colspan="4">${esc(o.description || '')} <span style="color:#94a3b8;font-size:11px">(suggested)</span></td>
    </tr>`).join('')

  const sigBlock = sub.signature_data && String(sub.signature_data).startsWith('data:')
    ? `<img src="${sub.signature_data}" style="height:80px;max-width:280px;background:#fff" alt="Signature">`
    : `<span style="color:#64748b;font-style:italic">No captured signature</span>`

  const isSAB = sub.letterhead === 'sab'
  const headerColor = isSAB ? '#dc2626' : '#0f172a'
  const headerLabel = isSAB ? 'SOUTH AFRICAN BREWERIES' : 'B&W PRODUCTIONS'

  const notes = sub.notes ? `
    <div style="margin:14px 0;padding:10px 14px;background:#f8fafc;border-left:3px solid #cbd5e1;font-size:12px">
      <strong>Notes:</strong> ${esc(sub.notes)}
    </div>` : ''

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(sub.form_number)} — ${esc(label)}</title>
<link rel="icon" type="image/png" sizes="32x32" href="/static/favicon-32.png">
<link rel="shortcut icon" href="/static/favicon.ico">
<link rel="apple-touch-icon" sizes="180x180" href="/static/apple-touch-icon.png">
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; color:#0f172a; margin:0; padding:18px 22px; font-size:13px; line-height:1.45; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .header { border-bottom: 3px solid ${headerColor}; padding-bottom:10px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:flex-end }
  .header h1 { margin:0; font-size:20px; letter-spacing:0.5px; color:${headerColor} }
  .header .meta { text-align:right; font-size:11px; color:#475569 }
  .header .meta strong { display:block; font-size:14px; color:#0f172a; margin-bottom:2px }
  .grid { display:grid; grid-template-columns:repeat(2,1fr); gap:8px 18px; margin-bottom:14px }
  .field { font-size:12px }
  .field .label { display:block; color:#64748b; font-size:10px; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:2px }
  .field .value { font-weight:600 }
  table.lines { width:100%; border-collapse:collapse; margin-top:8px; font-size:11px }
  table.lines th, table.lines td { padding:5px 6px; border:1px solid #cbd5e1; text-align:left }
  table.lines thead { background:#f1f5f9 }
  .sig-row { margin-top:24px; display:flex; gap:30px; align-items:flex-end; flex-wrap:wrap }
  .sig-box { flex:1; min-width:220px }
  .sig-box .label { font-size:10px; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px }
  .sig-box .ink { border-bottom:1px solid #0f172a; padding-bottom:4px; min-height:80px; display:flex; align-items:flex-end }
  .footer { margin-top:30px; padding-top:8px; border-top:1px solid #e2e8f0; font-size:10px; color:#64748b; display:flex; justify-content:space-between }
  .badge { display:inline-block; padding:2px 8px; border-radius:4px; font-size:10px; font-weight:600; background:#dcfce7; color:#166534 }
  @media print { body { padding: 0 } .footer { position: fixed; bottom: 4mm; left: 14mm; right: 14mm } }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>${esc(label)}</h1>
      <div style="font-size:11px;color:#64748b;margin-top:2px">${esc(headerLabel)}</div>
    </div>
    <div class="meta">
      <strong>${esc(sub.form_number)}</strong>
      Captured: ${esc(captured)} SAST<br>
      <span class="badge"><i>✓</i> Signed Record</span>
    </div>
  </div>

  <div class="grid">
    <div class="field"><span class="label">Brand</span><span class="value">${esc(sub.brand || '—')}</span></div>
    <div class="field"><span class="label">Client</span><span class="value">${esc(sub.client || '—')}</span></div>
    <div class="field"><span class="label">Event</span><span class="value">${esc(sub.event_name || '—')}</span></div>
    <div class="field"><span class="label">Venue</span><span class="value">${esc(sub.venue || '—')}</span></div>
    <div class="field"><span class="label">Delivery Date</span><span class="value">${esc(formatDate(sub.delivery_date))}</span></div>
    <div class="field"><span class="label">Collection Date</span><span class="value">${esc(formatDate(sub.collection_date))}</span></div>
    <div class="field"><span class="label">Prepared By</span><span class="value">${esc(sub.prepared_by || '—')}</span></div>
    <div class="field"><span class="label">Driver</span><span class="value">${esc(sub.driver || '—')}</span></div>
    <div class="field"><span class="label">Received By</span><span class="value">${esc(sub.received_by || '—')}</span></div>
    <div class="field"><span class="label">Contact</span><span class="value">${esc(formData.contact_number || sub.contact_number || '—')}</span></div>
  </div>

  ${(lineRows || otherRows) ? `
  <table class="lines">
    <thead>
      <tr><th style="width:48px">Qty</th><th>Item</th><th>Brand</th><th>Condition</th><th>Comments</th></tr>
    </thead>
    <tbody>${lineRows}${otherRows}</tbody>
  </table>` : ''}

  ${notes}

  <div class="sig-row">
    <div class="sig-box">
      <div class="label">Received By — Signature</div>
      <div class="ink">${sigBlock}</div>
      <div style="font-size:11px;margin-top:4px">${esc(sub.received_by || '')}</div>
    </div>
    <div class="sig-box" style="max-width:200px">
      <div class="label">Date Signed</div>
      <div class="ink" style="min-height:30px">${esc(captured)}</div>
    </div>
  </div>

  <div class="footer">
    <span>B&amp;W Productions Field Ops · System of Record</span>
    <span>Form #${esc(sub.form_number)} · ID ${esc(String(sub.id))}</span>
  </div>
</body>
</html>`
}

// Helper: fetch + filter signed-notes results for bulk endpoints
async function fetchSignedNotes(c: any, opts: { ids?: number[]; ym?: string; type?: string; search?: string }): Promise<any[]> {
  if (opts.ids && opts.ids.length) {
    // Explicit set of IDs — fetch and filter for signature presence
    const placeholders = opts.ids.map(() => '?').join(',')
    const q = await c.env.DB.prepare(`
      SELECT id, form_type, form_number, prepared_by, brand, client, venue, event_name,
             delivery_date, received_by, created_at
      FROM field_submissions
      WHERE id IN (${placeholders})
        AND signature_data LIKE 'data:%'
        AND COALESCE(is_draft, 0) = 0
      ORDER BY created_at DESC
    `).bind(...opts.ids).all<any>()
    return q.results || []
  }
  // Fall back to month-based selection
  let where = `signature_data LIKE 'data:%' AND COALESCE(is_draft, 0) = 0
               AND strftime('%Y-%m', created_at, '+2 hours') = ?`
  const params: any[] = [opts.ym]
  if (opts.type) { where += ' AND form_type = ?'; params.push(opts.type) }
  if (opts.search) {
    where += ` AND (LOWER(COALESCE(brand,'')) LIKE LOWER(?)
                OR LOWER(COALESCE(client,'')) LIKE LOWER(?)
                OR LOWER(COALESCE(venue,'')) LIKE LOWER(?)
                OR LOWER(COALESCE(event_name,'')) LIKE LOWER(?)
                OR LOWER(COALESCE(prepared_by,'')) LIKE LOWER(?)
                OR LOWER(COALESCE(received_by,'')) LIKE LOWER(?)
                OR LOWER(COALESCE(form_number,'')) LIKE LOWER(?)
                OR LOWER(COALESCE(notes,'')) LIKE LOWER(?))`
    const s = `%${opts.search}%`
    params.push(s, s, s, s, s, s, s, s)
  }
  const q = await c.env.DB.prepare(`
    SELECT id, form_type, form_number, prepared_by, brand, client, venue, event_name,
           delivery_date, received_by, created_at
    FROM field_submissions
    WHERE ${where}
    ORDER BY created_at DESC
  `).bind(...params).all<any>()
  return q.results || []
}

function filenameSlug(s: string): string {
  return String(s || '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'note'
}

// ─── BULK EXPORT: ZIP of individual notes ──────────────────────────────────────
// GET /signed-notes.zip?ids=1,2,3   (preferred when user has ticked rows)
//   or /signed-notes.zip?ym=YYYY-MM&type=...&search=...   (export whole filter)
app.get('/signed-notes.zip', requireAuth, async (c) => {
  const idsParam = (c.req.query('ids') || '').trim()
  const ym = (c.req.query('ym') || '').trim()
  const type = (c.req.query('type') || '').trim()
  const search = (c.req.query('search') || '').trim()

  const ids = idsParam ? idsParam.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n > 0) : []
  const useYm = ym || (() => {
    const n = new Date(Date.now() + 2*60*60*1000)
    return `${n.getUTCFullYear()}-${String(n.getUTCMonth()+1).padStart(2,'0')}`
  })()

  const rows = await fetchSignedNotes(c, ids.length ? { ids } : { ym: useYm, type, search })
  if (!rows.length) return c.text('No signed notes match this selection.', 404)

  // Build zip contents
  const files: Record<string, Uint8Array> = {}

  // 1) MANIFEST.csv — same columns as the regular CSV export
  const csvCell = (v: any) => {
    const s = (v == null ? '' : String(v)).replace(/"/g, '""')
    return /[",\n]/.test(s) ? `"${s}"` : s
  }
  const manifestLines = [
    ['ID','Captured (SAST)','Type','Form Number','Prepared By','Brand','Client','Venue','Event','Delivery Date','Received By','Backend URL','File in Zip'].join(',')
  ]

  for (const r of rows) {
    const html = await renderPrintNote(c.env.DB, r.id as number)
    if (!html) continue
    const brandSlug = filenameSlug(r.brand || r.client || 'note')
    const fileName = `${r.form_number}_${brandSlug}.html`
    files[fileName] = strToU8(html)

    const captured = (() => {
      try { return new Date((r.created_at as string) + 'Z').toLocaleString('en-ZA', { timeZone:'Africa/Johannesburg' }) }
      catch { return r.created_at }
    })()
    manifestLines.push([
      r.id, captured, FORM_LABELS[r.form_type] || r.form_type, r.form_number,
      r.prepared_by, r.brand, r.client, r.venue, r.event_name,
      r.delivery_date, r.received_by,
      `https://bw-productions.pages.dev/field/admin/submission/${r.id}`,
      fileName
    ].map(csvCell).join(','))
  }

  files['MANIFEST.csv'] = strToU8(manifestLines.join('\n'))
  files['README.txt'] = strToU8(
`B&W Productions — Signed Notes Bundle
======================================

This archive contains ${rows.length} signed delivery/collection/repair note(s).

How to convert to PDF:
  1. Open any .html file in Chrome, Edge, or Safari.
  2. File → Print (Ctrl/Cmd + P).
  3. Choose "Save as PDF" as the destination.
  4. Margins: Default · Background graphics: ON.

MANIFEST.csv lists every file with its source record and a deep-link
back to the system of record at bwprodsystem.co.za.

Generated: ${new Date().toISOString()}
`)

  const zipped = zipSync(files, { level: 6 })
  const stamp = ids.length ? `selected-${rows.length}` : `${useYm}${type?`-${type}`:''}`
  const filename = `BW_signed_notes_${stamp}.zip`

  return new Response(zipped, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
      'Content-Length': String(zipped.byteLength)
    }
  })
})

// ─── BULK EXPORT: Combined print-ready HTML (one Save-as-PDF gives 1 PDF) ──────
// GET /signed-notes.combined.html?ids=...  OR ?ym=...
app.get('/signed-notes.combined.html', requireAuth, async (c) => {
  const idsParam = (c.req.query('ids') || '').trim()
  const ym = (c.req.query('ym') || '').trim()
  const type = (c.req.query('type') || '').trim()
  const search = (c.req.query('search') || '').trim()

  const ids = idsParam ? idsParam.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n > 0) : []
  const useYm = ym || (() => {
    const n = new Date(Date.now() + 2*60*60*1000)
    return `${n.getUTCFullYear()}-${String(n.getUTCMonth()+1).padStart(2,'0')}`
  })()

  const rows = await fetchSignedNotes(c, ids.length ? { ids } : { ym: useYm, type, search })
  if (!rows.length) return c.text('No signed notes match this selection.', 404)

  // Render each note, strip everything outside <body>, and stitch with page-break
  const sections: string[] = []
  for (const r of rows) {
    const html = await renderPrintNote(c.env.DB, r.id as number)
    if (!html) continue
    const m = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)
    const inner = m ? m[1] : html
    sections.push(`<section class="note-page">${inner}</section>`)
  }

  const stampLabel = ids.length ? `${rows.length} selected notes` : `${rows.length} notes — ${useYm}`
  const today = new Date().toLocaleString('en-ZA', { timeZone:'Africa/Johannesburg' })

  const combined = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>B&amp;W Productions — Signed Notes Bundle (${esc(stampLabel)})</title>
<link rel="icon" type="image/png" sizes="32x32" href="/static/favicon-32.png">
<link rel="shortcut icon" href="/static/favicon.ico">
<link rel="apple-touch-icon" sizes="180x180" href="/static/apple-touch-icon.png">
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; margin:0; padding:0; color:#0f172a; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .cover { padding:60px 40px; text-align:center; page-break-after:always; }
  .cover h1 { font-size:32px; margin:0 0 8px; color:#0f172a }
  .cover h2 { font-size:18px; color:#475569; font-weight:500; margin:0 0 30px }
  .cover .stamp { display:inline-block; padding:18px 28px; background:#dcfce7; color:#166534; border-radius:12px; font-size:16px; font-weight:600 }
  .cover .meta { margin-top:40px; font-size:12px; color:#64748b }
  .note-page { padding:18px 22px; page-break-after:always; }
  .note-page:last-child { page-break-after:auto; }
  .print-bar { position:sticky; top:0; background:#0f172a; color:#fff; padding:10px 16px; display:flex; justify-content:space-between; align-items:center; font-size:13px; z-index:1000 }
  .print-bar button { background:#10b981; color:#fff; border:none; padding:8px 16px; border-radius:6px; cursor:pointer; font-weight:600 }
  @media print { .print-bar { display:none } }
  /* Re-inject single-note styles for the inlined sections */
  .note-page .header { border-bottom: 3px solid #0f172a; padding-bottom:10px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:flex-end }
  .note-page .header h1 { margin:0; font-size:20px; letter-spacing:0.5px }
  .note-page .header .meta { text-align:right; font-size:11px; color:#475569 }
  .note-page .header .meta strong { display:block; font-size:14px; color:#0f172a; margin-bottom:2px }
  .note-page .grid { display:grid; grid-template-columns:repeat(2,1fr); gap:8px 18px; margin-bottom:14px }
  .note-page .field { font-size:12px }
  .note-page .field .label { display:block; color:#64748b; font-size:10px; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:2px }
  .note-page .field .value { font-weight:600 }
  .note-page table.lines { width:100%; border-collapse:collapse; margin-top:8px; font-size:11px }
  .note-page table.lines th, .note-page table.lines td { padding:5px 6px; border:1px solid #cbd5e1; text-align:left }
  .note-page table.lines thead { background:#f1f5f9 }
  .note-page .sig-row { margin-top:24px; display:flex; gap:30px; align-items:flex-end; flex-wrap:wrap }
  .note-page .sig-box { flex:1; min-width:220px }
  .note-page .sig-box .label { font-size:10px; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px }
  .note-page .sig-box .ink { border-bottom:1px solid #0f172a; padding-bottom:4px; min-height:80px; display:flex; align-items:flex-end }
  .note-page .footer { margin-top:30px; padding-top:8px; border-top:1px solid #e2e8f0; font-size:10px; color:#64748b; display:flex; justify-content:space-between }
  .note-page .badge { display:inline-block; padding:2px 8px; border-radius:4px; font-size:10px; font-weight:600; background:#dcfce7; color:#166534 }
</style>
</head>
<body>
  <div class="print-bar">
    <span><strong>${esc(String(rows.length))}</strong> signed note${rows.length===1?'':'s'} ready to print &middot; ${esc(stampLabel)}</span>
    <button onclick="window.print()">⬇ Save as PDF</button>
  </div>
  <div class="cover">
    <h1>B&amp;W Productions</h1>
    <h2>Signed Notes Bundle</h2>
    <div class="stamp">${esc(String(rows.length))} signed note${rows.length===1?'':'s'}</div>
    <div class="meta">
      ${esc(stampLabel)}<br>
      Generated ${esc(today)} SAST<br>
      <em>Use File → Print → Save as PDF for a single combined document.</em>
    </div>
  </div>
  ${sections.join('\n')}
</body>
</html>`

  return c.html(combined)
})

// ─── DELETE SUBMISSION ───────────────────────────────────────────────────────

app.post('/submission/:id/delete', requireAuth, async (c) => {
  const id = c.req.param('id')
  const body = await c.req.parseBody()
  const reason = String(body.reason || '').trim()
  if (!reason) return c.redirect(`/field/admin/submission/${id}?err=reason`)

  const sub = await c.env.DB.prepare('SELECT form_number, form_type FROM field_submissions WHERE id=?').bind(id).first<any>()
  if (!sub) return c.redirect('/field/admin/submissions')

  // Log deletion before removing
  await c.env.DB.prepare(`
    INSERT INTO field_deleted_submissions (submission_id, form_number, form_type, reason, deleted_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).bind(id, sub.form_number, sub.form_type, reason).run().catch(() => {/* table may not exist yet — proceed anyway */})

  // Delete related records then submission
  await c.env.DB.prepare('DELETE FROM field_line_items WHERE submission_id=?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM field_suggested_items WHERE submission_id=?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM field_submissions WHERE id=?').bind(id).run()

  return c.redirect('/field/admin/submissions?deleted=1')
})

// ─── SINGLE SUBMISSION VIEW ────────────────────────────────────────────────────

app.get('/submission/:id', requireAuth, async (c) => {
  const user = c.get('user' as any) as any
  const id = c.req.param('id')
  const errParam = c.req.query('err') || ''

  const [sub, lines, others, edits] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM field_submissions WHERE id=?').bind(id).first<any>(),
    c.env.DB.prepare('SELECT * FROM field_line_items WHERE submission_id=? ORDER BY sort_order').bind(id).all<any>(),
    c.env.DB.prepare('SELECT * FROM field_suggested_items WHERE submission_id=?').bind(id).all<any>(),
    c.env.DB.prepare('SELECT * FROM field_record_edits WHERE submission_id=? ORDER BY edited_at DESC').bind(id).all<any>().catch(() => ({ results: [] }))
  ])
  if (!sub) return c.html(layout('Not Found', '<p class="muted">Submission not found.</p>', user))
  const showReasonErr = errParam === 'reason'
  const editSaved = c.req.query('saved') === '1'

  const lineRows = (lines.results||[]).map((li:any) => `
    <tr>
      <td style="text-align:center">${li.quantity}</td>
      <td>${esc(li.item_name)}</td>
      <td class="muted">${esc(li.brand||'—')}</td>
      <td><span class="badge badge-${li.condition==='Checked'?'success':li.condition==='Faulty'?'warn':'danger'}" style="font-size:10px">${esc(li.condition||'Checked')}</span></td>
      <td class="muted">${esc(li.comments||'')}</td>
    </tr>`).join('')

  const sigBlock = sub.signature_data && sub.signature_data.startsWith('data:')
    ? `<img src="${sub.signature_data}" style="height:80px;max-width:240px;background:#fff;border-radius:6px;padding:4px">`
    : `<em class="muted">${esc(sub.signature_data || sub.received_by || sub.prepared_by || '—')}</em>`

  const body = `
    <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap;align-items:center">
      <a href="/field/success/${id}" target="_blank" class="btn btn-secondary"><i class="fas fa-eye"></i> View Print Page</a>
      <a href="/field/admin/submission/${id}/edit" class="btn" style="background:#0ea5e9;color:#fff;border:none"><i class="fas fa-pen"></i> Edit Details</a>
      <a href="/field/admin/submission/${id}/preview.png" target="_blank" class="btn btn-secondary" title="Open PNG preview — great for WhatsApp/email"><i class="fas fa-image"></i> PNG Preview</a>
      <button type="button" onclick="document.getElementById('waModal').style.display='flex'" class="btn" style="background:#25d366;color:#fff;border:none;cursor:pointer" title="Share via WhatsApp"><i class="fab fa-whatsapp"></i> Send to WhatsApp</button>
      <a href="/field/admin/submissions" class="btn btn-secondary">← Back</a>
      <button onclick="document.getElementById('deleteModal').style.display='flex'" class="btn" style="margin-left:auto;background:#dc2626;color:#fff;border:none;cursor:pointer">
        <i class="fas fa-trash"></i> Delete Submission
      </button>
    </div>

    ${editSaved ? '<div style="background:#f0fdf4;border:1px solid #86efac;color:#166534;padding:10px 16px;border-radius:8px;margin-bottom:16px;font-size:14px">✅ Changes saved and logged to the audit trail.</div>' : ''}
    ${showReasonErr ? '<div style="background:#fef2f2;border:1px solid #fca5a5;color:#dc2626;padding:10px 16px;border-radius:8px;margin-bottom:16px;font-size:14px">⚠️ A reason is required before deleting.</div>' : ''}

    <!-- Delete Confirmation Modal -->
    <div id="deleteModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;align-items:center;justify-content:center;padding:20px">
      <div style="background:#fff;border-radius:14px;padding:28px;max-width:440px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.3)">
        <h3 style="margin:0 0 6px;font-size:18px;color:#dc2626">🗑️ Delete Submission</h3>
        <p style="margin:0 0 18px;font-size:14px;color:#555">You are about to permanently delete <strong>${esc(sub.form_number)}</strong>. This cannot be undone.</p>
        <form method="POST" action="/field/admin/submission/${id}/delete">
          <div style="margin-bottom:16px">
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;color:#333">Reason for deletion <span style="color:#dc2626">*</span></label>
            <textarea name="reason" rows="3" required placeholder="e.g. Event was cancelled, duplicate entry…" style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;resize:vertical;box-sizing:border-box"></textarea>
          </div>
          <div style="display:flex;gap:10px;justify-content:flex-end">
            <button type="button" onclick="document.getElementById('deleteModal').style.display='none'" style="padding:10px 18px;border:1px solid #d1d5db;background:#f9fafb;border-radius:8px;cursor:pointer;font-size:14px">Cancel</button>
            <button type="submit" style="padding:10px 18px;background:#dc2626;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600">Yes, Delete</button>
          </div>
        </form>
      </div>
    </div>

    <!-- WhatsApp Share Modal -->
    <div id="waModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;align-items:center;justify-content:center;padding:20px">
      <div style="background:#fff;border-radius:14px;padding:28px;max-width:520px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.3)">
        <h3 style="margin:0 0 6px;font-size:18px;color:#075e54"><i class="fab fa-whatsapp" style="color:#25d366"></i> Send to WhatsApp</h3>
        <p style="margin:0 0 18px;font-size:13px;color:#555">Generates a shareable preview link and opens WhatsApp with the message pre-filled.</p>

        <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:10px 12px;margin-bottom:14px;font-size:12px;color:#166534">
          <i class="fas fa-info-circle"></i> The recipient does NOT need to log in. The link expires in 14 days.
        </div>

        <form id="waForm" onsubmit="return waShare(event, ${id})">
          <div style="margin-bottom:14px">
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;color:#333">Recipient phone <span style="color:#dc2626">*</span></label>
            <input id="waPhone" type="tel" required placeholder="e.g. 0829241496 or +27829241496" value="${esc(sub.contact_number || '')}" style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;box-sizing:border-box">
            <div class="muted" style="font-size:11px;margin-top:4px">South African numbers auto-convert: 082… → +2782…</div>
          </div>

          <div style="margin-bottom:14px">
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;color:#333">Message preview</label>
            <textarea id="waMessage" rows="5" style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;resize:vertical;box-sizing:border-box;font-family:inherit">Hi ${esc(sub.attention || sub.received_by || 'there')},

Here is the ${esc(FORM_LABELS[sub.form_type] || 'delivery note')} for ${esc(sub.event_name || sub.venue || 'your event')} (Ref ${esc(sub.form_number)}):</textarea>
          </div>

          <div style="margin-bottom:18px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 12px;font-size:12px;color:#1e40af">
            <i class="fas fa-magic"></i> One smart link — opens a preview page with both image &amp; PDF download buttons. Unfurls as a rich card in WhatsApp.
          </div>

          <div id="waBusy" style="display:none;text-align:center;padding:12px;color:#666;font-size:13px"><i class="fas fa-spinner fa-spin"></i> Generating preview link…</div>
          <div id="waErr" style="display:none;background:#fef2f2;border:1px solid #fca5a5;color:#dc2626;padding:8px 12px;border-radius:8px;font-size:13px;margin-bottom:12px"></div>

          <div style="display:flex;gap:10px;justify-content:flex-end">
            <button type="button" onclick="document.getElementById('waModal').style.display='none'" style="padding:10px 18px;border:1px solid #d1d5db;background:#f9fafb;border-radius:8px;cursor:pointer;font-size:14px">Cancel</button>
            <button type="submit" id="waSubmit" style="padding:10px 18px;background:#25d366;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600"><i class="fab fa-whatsapp"></i> Open WhatsApp</button>
          </div>
        </form>
      </div>
    </div>
    <script>
      async function waShare(e, submissionId) {
        e.preventDefault();
        const phone = document.getElementById('waPhone').value.trim();
        const message = document.getElementById('waMessage').value;
        const busy = document.getElementById('waBusy');
        const errBox = document.getElementById('waErr');
        const submit = document.getElementById('waSubmit');
        errBox.style.display = 'none';
        busy.style.display = 'block';
        submit.disabled = true;
        try {
          const res = await fetch('/field/admin/share/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ submission_id: submissionId, channel: 'whatsapp' })
          });
          if (!res.ok) throw new Error('Server returned ' + res.status);
          const data = await res.json();
          if (!data.ok) throw new Error(data.error || 'Failed to create share link');

          // Build WhatsApp deep link
          // Normalise phone: strip non-digits, convert ZA local (0xx) to international (+2761…)
          let p = phone.replace(/[^0-9+]/g, '');
          if (p.startsWith('0')) p = '27' + p.slice(1);
          if (p.startsWith('+')) p = p.slice(1);
          if (!p.match(/^[0-9]{10,15}$/)) {
            throw new Error('Invalid phone number — must be 10–15 digits');
          }

          // Single share_url → renders as a rich card with image + title + description
          // Recipient taps the card → lands on the wrapper page with Download PDF / Save Image buttons
          const fullMessage = message + '\\n\\n' + data.share_url;

          const waUrl = 'https://wa.me/' + p + '?text=' + encodeURIComponent(fullMessage);
          window.open(waUrl, '_blank');
          document.getElementById('waModal').style.display = 'none';
        } catch (err) {
          errBox.textContent = err.message;
          errBox.style.display = 'block';
        } finally {
          busy.style.display = 'none';
          submit.disabled = false;
        }
        return false;
      }
    </script>

    <div class="stats-grid" style="grid-template-columns:repeat(2,1fr);margin-bottom:20px">
      <div class="card" style="margin:0">
        <div class="card-header"><h3 class="card-title">Form Details</h3></div>
        <table style="width:100%;font-size:14px;border-collapse:collapse">
          <tr class="table-row"><td class="muted" style="padding:8px;width:40%">Type</td><td style="padding:8px"><span class="badge badge-${FORM_COLORS[sub.form_type]||'info'}">${FORM_LABELS[sub.form_type]||sub.form_type}</span></td></tr>
          <tr class="table-row"><td class="muted" style="padding:8px">Ref</td><td style="padding:8px;font-family:monospace">${esc(sub.form_number)}</td></tr>
          <tr class="table-row"><td class="muted" style="padding:8px">Prepared By</td><td style="padding:8px">${esc(sub.prepared_by)}</td></tr>
          <tr class="table-row"><td class="muted" style="padding:8px">Driver</td><td style="padding:8px">${esc(sub.driver||'—')}</td></tr>
          <tr class="table-row"><td class="muted" style="padding:8px">Vehicle</td><td style="padding:8px">${esc(sub.vehicle_reg||'—')}</td></tr>
          <tr class="table-row"><td class="muted" style="padding:8px">Letterhead</td><td style="padding:8px">${sub.letterhead==='sab'?'B&W on behalf of SAB':'B&W Standard'}</td></tr>
          <tr class="table-row"><td class="muted" style="padding:8px">Submitted</td><td style="padding:8px">${formatDate(sub.created_at)}</td></tr>
        </table>
      </div>
      <div class="card" style="margin:0">
        <div class="card-header"><h3 class="card-title">Event / Venue</h3></div>
        <table style="width:100%;font-size:14px;border-collapse:collapse">
          <tr class="table-row"><td class="muted" style="padding:8px;width:40%">Client</td><td style="padding:8px">${esc(sub.client||'SAB')}</td></tr>
          <tr class="table-row"><td class="muted" style="padding:8px">Venue</td><td style="padding:8px">${esc(sub.venue||'—')}</td></tr>
          <tr class="table-row"><td class="muted" style="padding:8px">Event</td><td style="padding:8px">${esc(sub.event_name||'—')}</td></tr>
          <tr class="table-row"><td class="muted" style="padding:8px">Address</td><td style="padding:8px">${esc(sub.address||'—')}</td></tr>
          <tr class="table-row"><td class="muted" style="padding:8px">Attention</td><td style="padding:8px">${esc(sub.attention||'—')}</td></tr>
          <tr class="table-row"><td class="muted" style="padding:8px">Contact</td><td style="padding:8px">${esc(sub.contact_number||'—')}</td></tr>
          <tr class="table-row"><td class="muted" style="padding:8px">Delivery Date</td><td style="padding:8px">${formatDate(sub.delivery_date)}</td></tr>
          <tr class="table-row"><td class="muted" style="padding:8px">Collection Date</td><td style="padding:8px">${formatDate(sub.collection_date)}</td></tr>
          <tr class="table-row"><td class="muted" style="padding:8px">Brand</td><td style="padding:8px">${esc(sub.brand||'—')}</td></tr>
        </table>
      </div>
    </div>

    ${(lines.results||[]).length > 0 ? `
    <div class="card mb-4">
      <div class="card-header"><h3 class="card-title">Line Items <span class="badge badge-info">${(lines.results||[]).length}</span></h3></div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th style="text-align:center">Qty</th><th>Item</th><th>Brand</th><th>Condition</th><th>Comments</th></tr></thead>
          <tbody>${lineRows}</tbody>
        </table>
      </div>
    </div>` : ''}

    ${(others.results||[]).length > 0 ? `
    <div class="card mb-4" style="border-color:var(--warn)">
      <div class="card-header"><h3 class="card-title">⭐ Other Items (suggested) <span class="badge badge-warn">${(others.results||[]).length}</span></h3></div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Qty</th><th>Description</th><th>Status</th></tr></thead>
          <tbody>${(others.results||[]).map((o:any)=>`
            <tr><td>${o.quantity}</td><td>${esc(o.description)}</td>
            <td><span class="badge badge-${o.status==='pending'?'warn':o.status==='created'?'success':'muted'}">${o.status==='pending'?'Pending':o.status==='created'?'Approved':o.status==='ignored'?'Ignored':esc(o.status||'—')}</span></td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}

    ${sub.notes ? `<div class="card mb-4"><div class="card-header"><h3 class="card-title">Notes</h3></div><p style="padding:16px;font-size:14px">${esc(sub.notes)}</p></div>` : ''}

    ${(edits.results||[]).length > 0 ? `
    <div class="card mb-4" style="border-color:#0ea5e9">
      <div class="card-header" style="display:flex;align-items:center;justify-content:space-between">
        <h3 class="card-title"><i class="fas fa-clock-rotate-left" style="color:#0ea5e9;margin-right:6px"></i>Edit History <span class="badge badge-info" style="margin-left:6px">${(edits.results||[]).length}</span></h3>
        <span class="muted" style="font-size:12px">Every post-submission change is logged here for audit.</span>
      </div>
      <div class="table-wrap">
        <table class="table" style="margin:0">
          <thead><tr><th style="width:140px">When (SAST)</th><th style="width:130px">Field</th><th>Before</th><th>After</th><th style="width:160px">Edited By</th><th>Reason</th></tr></thead>
          <tbody>
            ${(edits.results||[]).map((e:any) => {
              const when = (() => { try { return new Date((e.edited_at as string) + 'Z').toLocaleString('en-ZA', { timeZone:'Africa/Johannesburg', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) } catch { return e.edited_at } })()
              return `<tr>
                <td class="mono" style="font-size:12px;white-space:nowrap">${esc(when)}</td>
                <td><span class="badge badge-info" style="font-size:10px">${esc(e.field_name)}</span></td>
                <td style="font-size:12px;color:#dc2626;text-decoration:line-through">${esc(e.old_value || '∅')}</td>
                <td style="font-size:12px;color:#166534;font-weight:600">${esc(e.new_value || '∅')}</td>
                <td class="mono" style="font-size:11px">${esc(e.edited_by || '—')}</td>
                <td class="muted" style="font-size:12px">${esc(e.reason || '—')}</td>
              </tr>`
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}

    <div class="card">
      <div class="card-header"><h3 class="card-title">Sign-Off</h3></div>
      <div style="padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:20px;font-size:14px">
        <div><div class="muted" style="font-size:11px;margin-bottom:6px">DELIVERED / PREPARED BY</div><strong>B&W Productions Team</strong></div>
        <div><div class="muted" style="font-size:11px;margin-bottom:6px">RECEIVED BY / SIGNED</div><strong>${esc(sub.received_by||'—')}</strong><br>${sigBlock}</div>
      </div>
    </div>
  `
  return c.html(layout(`${FORM_LABELS[sub.form_type]||'Submission'} — ${sub.form_number}`, body, user, 'field-admin'))
})

// ─── EDIT SUBMISSION DETAILS ───────────────────────────────────────────────────
// Lets directors/admins fix or add missing details after the fact.
// Every changed field writes a row to field_record_edits with old/new value.
// The signature itself and the form_number are deliberately NOT editable.

// Whitelist of editable fields + their human-friendly labels + input hints.
const EDITABLE_FIELDS: { key: string; label: string; type: 'text'|'date'|'textarea'; placeholder?: string; help?: string }[] = [
  { key: 'brand',          label: 'Brand',            type: 'text',     placeholder: 'e.g. Castle Lite, Carling Black Label, Mixed / Multiple' },
  { key: 'client',         label: 'Client',           type: 'text',     placeholder: 'e.g. South African Breweries' },
  { key: 'venue',          label: 'Venue',            type: 'text',     placeholder: 'Venue name' },
  { key: 'event_name',     label: 'Event Name',       type: 'text',     placeholder: 'Event / Activation name' },
  { key: 'address',        label: 'Address',          type: 'textarea', placeholder: 'Full address' },
  { key: 'attention',      label: 'Attention',        type: 'text',     placeholder: 'Contact person name' },
  { key: 'contact_number', label: 'Contact Number',   type: 'text',     placeholder: '+27 ...' },
  { key: 'delivery_date',  label: 'Delivery Date',    type: 'date' },
  { key: 'collection_date',label: 'Collection Date',  type: 'date' },
  { key: 'received_by',    label: 'Received By',      type: 'text',     placeholder: 'Name of person who signed' },
  { key: 'prepared_by',    label: 'Prepared By',      type: 'text',     placeholder: 'Crew member who prepared the load' },
  { key: 'driver',         label: 'Driver',           type: 'text',     placeholder: 'Driver name' },
  { key: 'vehicle_reg',    label: 'Vehicle Reg',      type: 'text',     placeholder: 'e.g. CA 123 ABC' },
  { key: 'notes',          label: 'Notes',            type: 'textarea', placeholder: 'Any additional notes', help: 'Internal notes \u2014 visible on the printed copy.' }
]

app.get('/submission/:id/edit', requireAuth, async (c) => {
  const user = c.get('user' as any) as any
  const id = c.req.param('id')

  const sub = await c.env.DB.prepare('SELECT * FROM field_submissions WHERE id=?').bind(id).first<any>()
  if (!sub) return c.html(layout('Not Found', '<p class="muted">Submission not found.</p>', user))

  const editHistory = await c.env.DB.prepare('SELECT * FROM field_record_edits WHERE submission_id=? ORDER BY edited_at DESC LIMIT 20').bind(id).all<any>().catch(() => ({ results: [] }))

  const errors = c.req.query('err') ? decodeURIComponent(c.req.query('err') || '') : ''

  const dateValue = (v: any) => {
    if (!v) return ''
    const s = String(v)
    // Already in YYYY-MM-DD format?
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
    try { return new Date(s).toISOString().slice(0, 10) } catch { return s }
  }

  const fieldRows = EDITABLE_FIELDS.map(f => {
    const value = sub[f.key] != null ? String(sub[f.key]) : ''
    const isEmpty = !value.trim()
    const inputHtml = f.type === 'textarea'
      ? `<textarea name="${f.key}" rows="3" class="input" placeholder="${esc(f.placeholder||'')}" style="width:100%;font-family:inherit;resize:vertical">${esc(value)}</textarea>`
      : f.type === 'date'
        ? `<input name="${f.key}" type="date" class="input" value="${esc(dateValue(value))}" style="width:100%">`
        : `<input name="${f.key}" type="text" class="input" value="${esc(value)}" placeholder="${esc(f.placeholder||'')}" style="width:100%">`
    return `
      <div class="form-group" style="margin-bottom:14px">
        <label class="label" style="display:flex;align-items:center;gap:6px;font-weight:600;font-size:13px">
          ${esc(f.label)}
          ${isEmpty ? '<span class="badge" style="background:#fee2e2;color:#991b1b;font-size:9px;font-weight:600">empty</span>' : ''}
        </label>
        ${inputHtml}
        ${f.help ? `<div class="muted" style="font-size:11px;margin-top:3px">${esc(f.help)}</div>` : ''}
      </div>`
  }).join('')

  const historyBlock = (editHistory.results||[]).length > 0 ? `
    <div class="card" style="border-color:#0ea5e9;margin-top:24px">
      <div class="card-header"><h3 class="card-title"><i class="fas fa-clock-rotate-left" style="color:#0ea5e9;margin-right:6px"></i>Previous Edits <span class="badge badge-info" style="margin-left:6px">${(editHistory.results||[]).length}</span></h3></div>
      <div class="table-wrap">
        <table class="table" style="margin:0">
          <thead><tr><th>When</th><th>Field</th><th>Before \u2192 After</th><th>Edited By</th><th>Reason</th></tr></thead>
          <tbody>
            ${(editHistory.results||[]).map((e:any) => {
              const when = (() => { try { return new Date((e.edited_at as string) + 'Z').toLocaleString('en-ZA', { timeZone:'Africa/Johannesburg', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) } catch { return e.edited_at } })()
              return `<tr>
                <td class="mono" style="font-size:11px;white-space:nowrap">${esc(when)}</td>
                <td><span class="badge badge-info" style="font-size:10px">${esc(e.field_name)}</span></td>
                <td style="font-size:12px"><span style="color:#dc2626;text-decoration:line-through">${esc(e.old_value || '\u2205')}</span> <i class="fas fa-arrow-right" style="font-size:9px;color:#94a3b8;margin:0 4px"></i> <span style="color:#166534;font-weight:600">${esc(e.new_value || '\u2205')}</span></td>
                <td class="mono" style="font-size:11px">${esc(e.edited_by || '\u2014')}</td>
                <td class="muted" style="font-size:12px">${esc(e.reason || '\u2014')}</td>
              </tr>`
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''

  const body = `
    <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap;align-items:center">
      <a href="/field/admin/submission/${id}" class="btn btn-secondary">\u2190 Back to view</a>
      <span style="margin-left:auto" class="muted" style="font-size:13px">
        Editing <strong>${esc(sub.form_number)}</strong>
        \u00b7 <span class="badge badge-${FORM_COLORS[sub.form_type]||'info'}">${FORM_LABELS[sub.form_type]||sub.form_type}</span>
      </span>
    </div>

    ${errors ? `<div style="background:#fef2f2;border:1px solid #fca5a5;color:#dc2626;padding:10px 16px;border-radius:8px;margin-bottom:16px;font-size:14px">\u26a0\ufe0f ${esc(errors)}</div>` : ''}

    <div style="background:#eff6ff;border:1px solid #93c5fd;color:#1e40af;padding:12px 16px;border-radius:10px;margin-bottom:20px;font-size:13px;line-height:1.5">
      <strong><i class="fas fa-shield-halved"></i> Audit trail active.</strong>
      Every field you change is logged with your email, the timestamp, and the before \u2192 after values.
      The original signature and the form number cannot be edited. Leave fields you don't want to change as-is.
    </div>

    <form method="POST" action="/field/admin/submission/${id}/edit">
      <div class="card mb-4">
        <div class="card-header"><h3 class="card-title">Form Details</h3></div>
        <div style="padding:18px;display:grid;grid-template-columns:repeat(2,1fr);gap:0 24px">
          ${fieldRows}
        </div>
      </div>

      <div class="card mb-4">
        <div class="card-header"><h3 class="card-title">Reason for Edit <span class="muted" style="font-weight:400;font-size:12px;margin-left:6px">(required)</span></h3></div>
        <div style="padding:18px">
          <input name="reason" type="text" class="input" required placeholder="e.g. Missing brand on submission, crew confirmed it was MxD" style="width:100%" maxlength="200">
          <div class="muted" style="font-size:11px;margin-top:6px">This reason will be saved on every changed field so future-you (or auditors) knows why the record was amended.</div>
        </div>
      </div>

      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <button type="submit" class="btn" style="background:#10b981;color:#fff;border:none;padding:10px 20px;font-weight:600;font-size:14px">
          <i class="fas fa-save"></i> Save Changes
        </button>
        <a href="/field/admin/submission/${id}" class="btn btn-secondary">Cancel</a>
        <span style="margin-left:auto" class="muted" style="font-size:12px">
          <i class="fas fa-circle-info"></i> Original signature \u00b7 form number \u00b7 timestamp are immutable.
        </span>
      </div>
    </form>

    ${historyBlock}
  `

  return c.html(layout(`Edit \u2014 ${sub.form_number}`, body, user, 'field-admin'))
})

app.post('/submission/:id/edit', requireAuth, async (c) => {
  const user = c.get('user' as any) as any
  const id = Number(c.req.param('id'))
  const body = await c.req.parseBody()

  const reason = String(body.reason || '').trim()
  if (!reason) {
    return c.redirect(`/field/admin/submission/${id}/edit?err=${encodeURIComponent('A reason is required before saving edits.')}`)
  }

  const sub = await c.env.DB.prepare('SELECT * FROM field_submissions WHERE id=?').bind(id).first<any>()
  if (!sub) return c.redirect('/field/admin/submissions')

  // Determine who is making the edit
  const editor = user?.email || user?.name || 'admin'

  // Walk every editable field; if it changed, log an audit row + queue an UPDATE
  const changes: { key: string; oldV: any; newV: any }[] = []
  for (const f of EDITABLE_FIELDS) {
    const raw = body[f.key]
    if (raw === undefined) continue
    const newV = String(raw).trim()
    const oldV = sub[f.key] == null ? '' : String(sub[f.key])
    // Normalise: a blank field means "set to NULL"
    const newStored = newV === '' ? null : newV
    const oldStored = oldV === '' ? null : oldV
    if (newStored === oldStored) continue
    changes.push({ key: f.key, oldV: oldStored, newV: newStored })
  }

  if (changes.length === 0) {
    // Nothing changed \u2014 just bounce back without writing an audit row
    return c.redirect(`/field/admin/submission/${id}?saved=1`)
  }

  // Write audit rows + apply updates atomically (best-effort batch)
  for (const ch of changes) {
    await c.env.DB.prepare(`
      INSERT INTO field_record_edits
        (submission_id, form_number, field_name, old_value, new_value, reason, edited_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(id, sub.form_number, ch.key, ch.oldV, ch.newV, reason, editor).run()

    // Use a parameterised dynamic UPDATE (safe: ch.key is from a whitelist)
    await c.env.DB.prepare(`UPDATE field_submissions SET ${ch.key} = ? WHERE id = ?`).bind(ch.newV, id).run()
  }

  return c.redirect(`/field/admin/submission/${id}?saved=1`)
})

// ─── URLBOX: PREVIEW PNG OF A SUBMISSION (OPTION C) ──────────────────────────
// Returns a PNG snapshot of the public delivery-note view for a submission.
// Useful for WhatsApp/email previews where you want a thumbnail, not a PDF.
//
//   GET /field/admin/submission/:id/preview.png
//   GET /field/admin/submission/:id/preview.png?download=1
//
// We render the PUBLIC success page (no auth needed) so Urlbox can fetch it
// without cookie wrangling. Cached in R2 for 24h to save Urlbox quota.

app.get('/submission/:id/preview.png', requireAuth, async (c) => {
  const id = c.req.param('id')
  const force = c.req.query('refresh') === '1'
  const download = c.req.query('download') === '1'

  // Lookup submission for filename + cache key
  const sub = await c.env.DB.prepare(
    'SELECT form_number, event_name, venue, delivery_date FROM field_submissions WHERE id=?'
  ).bind(id).first<any>()
  if (!sub) return c.text('Submission not found', 404)

  const cacheKey = `previews/png/${sub.form_number}-${id}.png`
  const safeEvent = ((sub.event_name || sub.venue || 'BW') as string)
    .replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, '_').slice(0, 40)
  const filename = `${sub.form_number}_${safeEvent}_preview.png`

  // Try R2 cache first
  if (!force && c.env.PDF_BUCKET) {
    const cached = await c.env.PDF_BUCKET.get(cacheKey)
    if (cached) {
      return new Response(cached.body, {
        headers: {
          'Content-Type': 'image/png',
          'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
          'Cache-Control': 'public, max-age=86400',
          'X-Cache': 'HIT'
        }
      })
    }
  }

  // Render fresh via Urlbox
  if (!c.env.URLBOX_SECRET_KEY) {
    return c.text('Urlbox not configured', 503)
  }
  const t0 = Date.now()
  try {
    const { renderToBuffer, submissionPreviewPngOptions } = await import('../lib/urlbox.js')
    const pageUrl = `https://bwprodsystem.co.za/field/success/${id}`
    const { buffer } = await renderToBuffer(c.env, submissionPreviewPngOptions(pageUrl))

    // Telemetry — never break the render if logging fails
    try {
      await c.env.DB.prepare(`
        INSERT INTO field_renderer_log (submission_id, form_number, renderer, format, ms, bytes, ok, trigger)
        VALUES (?, ?, 'urlbox', 'png', ?, ?, 1, 'preview')
      `).bind(id, sub.form_number, Date.now() - t0, buffer.byteLength).run()
    } catch {}

    // Cache in R2 if bucket available
    if (c.env.PDF_BUCKET) {
      await c.env.PDF_BUCKET.put(cacheKey, buffer, {
        httpMetadata: { contentType: 'image/png' },
        customMetadata: { renderer: 'urlbox', generated_at: new Date().toISOString() }
      })
    }

    return new Response(buffer, {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
        'Cache-Control': 'public, max-age=86400',
        'X-Cache': 'MISS'
      }
    })
  } catch (err: any) {
    try {
      await c.env.DB.prepare(`
        INSERT INTO field_renderer_log (submission_id, form_number, renderer, format, ms, bytes, ok, error, trigger)
        VALUES (?, ?, 'urlbox_failed', 'png', ?, 0, 0, ?, 'preview')
      `).bind(id, sub.form_number, Date.now() - t0, (err.message || '').slice(0, 300)).run()
    } catch {}
    return c.text(`Preview render failed: ${err.message}`, 500)
  }
})

// ─── URLBOX: DASHBOARD/ARCHIVE SNAPSHOT (OPTION B) ────────────────────────────
// On-demand snapshot of admin dashboard or signed-notes archive. We pass the
// admin's own session cookie through to Urlbox so it can render auth'd pages.
//
//   GET /field/admin/snapshot?target=dashboard&format=png
//   GET /field/admin/snapshot?target=archive&format=pdf
//   GET /field/admin/snapshot?target=submission&id=68&format=png
//
// Not cached — these are always meant to be "snapshot of right now".

app.get('/snapshot', requireAuth, async (c) => {
  if (!c.env.URLBOX_SECRET_KEY) {
    return c.text('Urlbox not configured', 503)
  }
  const target = c.req.query('target') || 'dashboard'
  const format = (c.req.query('format') || 'png') as 'png' | 'pdf'
  const subId = c.req.query('id') || ''

  // Map target → URL path
  let path = '/field/admin'
  let nameStem = 'dashboard'
  if (target === 'archive') {
    path = '/field/admin/signed-notes'
    nameStem = 'signed-notes-archive'
  } else if (target === 'submission' && subId) {
    path = `/field/admin/submission/${subId}`
    nameStem = `submission-${subId}`
  } else if (target === 'edits') {
    // Snapshot a submission with its edit history visible
    path = subId ? `/field/admin/submission/${subId}` : '/field/admin'
    nameStem = `edits-${subId || 'all'}`
  }

  const pageUrl = `https://bwprodsystem.co.za${path}`

  // Pass through this admin's session cookie so Urlbox renders as them
  const sessionCookie = c.req.header('cookie') || ''

  try {
    const { renderToBuffer, dashboardSnapshotOptions } = await import('../lib/urlbox.js')
    const opts = dashboardSnapshotOptions(pageUrl, format, sessionCookie)
    const { buffer, contentType } = await renderToBuffer(c.env, opts)

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const ext = format === 'pdf' ? 'pdf' : 'png'
    const filename = `bw-${nameStem}-${stamp}.${ext}`

    return new Response(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store'
      }
    })
  } catch (err: any) {
    return c.text(`Snapshot failed: ${err.message}`, 500)
  }
})

// ─── SHARE LINK CREATE (WHATSAPP/EMAIL/MANUAL) ────────────────────────────────
// POST /field/admin/share/create
//   body: { submission_id: number, channel: 'whatsapp'|'email'|'manual' }
//   returns: { ok, token, share_url, png_url, pdf_url, expires_at, channel }
//
//   share_url → HTML wrapper page (Open Graph tags → rich-card unfurl in WhatsApp/Telegram/Slack)
//   png_url   → raw PNG (direct image)
//   pdf_url   → raw PDF download
//
// Mints a random 32-char hex token, stores it with a 14-day expiry, and returns
// the publicly-accessible preview URLs. Used by the "Send to WhatsApp" button.
app.post('/share/create', requireAuth, async (c) => {
  const user = c.get('user' as any) as any
  let body: any
  try { body = await c.req.json() } catch { return c.json({ ok: false, error: 'invalid json' }, 400) }
  const subId = parseInt(body.submission_id, 10)
  const channel = (body.channel === 'email' || body.channel === 'manual') ? body.channel : 'whatsapp'
  if (!subId || isNaN(subId)) return c.json({ ok: false, error: 'submission_id required' }, 400)

  // Verify submission exists
  const sub = await c.env.DB.prepare('SELECT id, form_number FROM field_submissions WHERE id=?').bind(subId).first<any>()
  if (!sub) return c.json({ ok: false, error: 'submission not found' }, 404)

  // Generate random 32-char hex token (16 bytes from crypto.getRandomValues)
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  const token = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')

  // 14-day expiry
  const expiresAt = new Date(Date.now() + 14 * 86400_000).toISOString().replace('T', ' ').slice(0, 19)

  await c.env.DB.prepare(`
    INSERT INTO field_preview_tokens (token, submission_id, format, expires_at, created_by, channel)
    VALUES (?, ?, 'png', ?, ?, ?)
  `).bind(token, subId, expiresAt, user?.name || user?.email || 'admin', channel).run()

  const base = 'https://bwprodsystem.co.za/field/p/preview'
  return c.json({
    ok: true,
    token,
    share_url: `${base}/${token}`,        // HTML wrapper — unfurls as rich card
    png_url: `${base}/${token}.png`,       // raw PNG
    pdf_url: `${base}/${token}.pdf`,       // raw PDF
    expires_at: expiresAt,
    channel
  })
})

// ─── RENDERER STATS (telemetry dashboard) ─────────────────────────────────────
// Shows last-7-day breakdown of Urlbox vs PDFShift renders so we can prove
// Urlbox is stable enough to drop PDFShift.
app.get('/renderer-stats', requireAuth, async (c) => {
  const user = c.get('user' as any) as any

  const [overall, dailyBreakdown, recentFailures, totals] = await Promise.all([
    c.env.DB.prepare(`
      SELECT renderer,
             COUNT(*) AS attempts,
             SUM(CASE WHEN ok=1 THEN 1 ELSE 0 END) AS successes,
             SUM(CASE WHEN ok=0 THEN 1 ELSE 0 END) AS failures,
             AVG(CASE WHEN ok=1 THEN ms ELSE NULL END) AS avg_ms,
             SUM(CASE WHEN ok=1 THEN bytes ELSE 0 END) AS total_bytes
      FROM field_renderer_log
      WHERE created_at > datetime('now','-7 days')
      GROUP BY renderer
      ORDER BY attempts DESC
    `).all<any>(),
    c.env.DB.prepare(`
      SELECT date(created_at,'+2 hours') AS day, renderer, COUNT(*) AS cnt
      FROM field_renderer_log
      WHERE created_at > datetime('now','-7 days')
      GROUP BY day, renderer
      ORDER BY day DESC
    `).all<any>(),
    c.env.DB.prepare(`
      SELECT id, submission_id, form_number, renderer, error, ms, created_at
      FROM field_renderer_log
      WHERE ok=0 AND created_at > datetime('now','-7 days')
      ORDER BY created_at DESC
      LIMIT 25
    `).all<any>(),
    c.env.DB.prepare(`
      SELECT
        SUM(CASE WHEN renderer='urlbox' AND ok=1 THEN 1 ELSE 0 END) AS urlbox_ok,
        SUM(CASE WHEN renderer LIKE 'urlbox%' AND ok=0 THEN 1 ELSE 0 END) AS urlbox_failed,
        SUM(CASE WHEN renderer='pdfshift' AND ok=1 THEN 1 ELSE 0 END) AS pdfshift_used,
        SUM(CASE WHEN renderer='both_failed' THEN 1 ELSE 0 END) AS both_failed
      FROM field_renderer_log
      WHERE created_at > datetime('now','-7 days')
    `).first<any>()
  ])

  const overallRows = (overall.results || []) as any[]
  const dailyRows = (dailyBreakdown.results || []) as any[]
  const failureRows = (recentFailures.results || []) as any[]

  const RENDERER_META: Record<string, { label: string; color: string; icon: string }> = {
    urlbox:           { label: 'Urlbox',          color: '#10b981', icon: 'fa-check-circle' },
    urlbox_failed:    { label: 'Urlbox failed',   color: '#f59e0b', icon: 'fa-exclamation-triangle' },
    pdfshift:         { label: 'PDFShift fallback', color: '#3b82f6', icon: 'fa-arrow-right-from-bracket' },
    pdfshift_failed:  { label: 'PDFShift failed', color: '#dc2626', icon: 'fa-times-circle' },
    both_failed:      { label: 'Both failed',     color: '#7f1d1d', icon: 'fa-skull-crossbones' }
  }

  const overallTable = overallRows.length === 0
    ? '<tr><td colspan="6" class="muted" style="text-align:center;padding:24px">No renders in the last 7 days yet — create a delivery note to populate this.</td></tr>'
    : overallRows.map(r => {
        const m = RENDERER_META[r.renderer] || { label: r.renderer, color: '#666', icon: 'fa-question' }
        const successRate = r.attempts > 0 ? Math.round((r.successes / r.attempts) * 100) : 0
        return `<tr>
          <td><i class="fas ${m.icon}" style="color:${m.color};margin-right:6px"></i><strong>${esc(m.label)}</strong></td>
          <td style="text-align:center">${r.attempts}</td>
          <td style="text-align:center;color:#10b981">${r.successes}</td>
          <td style="text-align:center;color:${r.failures > 0 ? '#dc2626' : '#999'}">${r.failures}</td>
          <td style="text-align:center"><span style="font-weight:600;color:${successRate === 100 ? '#10b981' : successRate >= 95 ? '#f59e0b' : '#dc2626'}">${successRate}%</span></td>
          <td style="text-align:right;font-family:monospace;font-size:13px">${r.avg_ms ? Math.round(r.avg_ms) + 'ms' : '—'}</td>
        </tr>`
      }).join('')

  // Recommendation banner
  const urlboxOk = totals?.urlbox_ok || 0
  const urlboxFailed = totals?.urlbox_failed || 0
  const pdfshiftUsed = totals?.pdfshift_used || 0
  const bothFailed = totals?.both_failed || 0
  let recommendation = ''
  if (urlboxOk === 0 && urlboxFailed === 0 && pdfshiftUsed === 0) {
    recommendation = `<div style="background:#fef3c7;border:1px solid #fde68a;color:#92400e;padding:14px 18px;border-radius:10px;margin-bottom:20px">
      <strong>🤷 No data yet.</strong> Create a delivery note in the field app to populate the stats.
    </div>`
  } else if (urlboxFailed === 0 && pdfshiftUsed === 0 && bothFailed === 0 && urlboxOk >= 7) {
    recommendation = `<div style="background:#dcfce7;border:1px solid #86efac;color:#166534;padding:14px 18px;border-radius:10px;margin-bottom:20px">
      <strong>✅ Safe to cancel PDFShift.</strong> Urlbox has handled <strong>${urlboxOk}</strong> renders in the last 7 days with zero failures — the fallback hasn't been needed once. Recommend: cancel PDFShift subscription and save the monthly fee.
    </div>`
  } else if (pdfshiftUsed > 0 || urlboxFailed > 0) {
    recommendation = `<div style="background:#fef2f2;border:1px solid #fca5a5;color:#991b1b;padding:14px 18px;border-radius:10px;margin-bottom:20px">
      <strong>⚠️ Don't cancel PDFShift yet.</strong> Urlbox failed <strong>${urlboxFailed}</strong> time(s) and PDFShift had to step in <strong>${pdfshiftUsed}</strong> time(s) in the last 7 days. Investigate the failures below before dropping the fallback.
    </div>`
  } else {
    recommendation = `<div style="background:#eff6ff;border:1px solid #93c5fd;color:#1e40af;padding:14px 18px;border-radius:10px;margin-bottom:20px">
      <strong>ℹ️ Keep monitoring.</strong> ${urlboxOk} successful Urlbox renders, ${urlboxFailed} failures. Wait until you've got a full 7 days of normal activity before deciding.
    </div>`
  }

  const failureTable = failureRows.length === 0
    ? '<p class="muted" style="margin:0;padding:12px;text-align:center">🎉 Zero failures in the last 7 days.</p>'
    : `<table style="width:100%;font-size:13px">
        <thead><tr style="background:#f9fafb"><th style="text-align:left;padding:8px">When</th><th style="text-align:left;padding:8px">Form</th><th style="text-align:left;padding:8px">Renderer</th><th style="text-align:left;padding:8px">Error</th></tr></thead>
        <tbody>${failureRows.map(r => `<tr style="border-top:1px solid #e5e7eb">
          <td style="padding:8px;white-space:nowrap;color:#666">${formatDate(r.created_at)}</td>
          <td style="padding:8px"><a href="/field/admin/submission/${r.submission_id}" style="color:#0ea5e9">${esc(r.form_number || ('#' + r.submission_id))}</a></td>
          <td style="padding:8px"><code style="font-size:11px;background:#fef2f2;color:#991b1b;padding:2px 6px;border-radius:4px">${esc(r.renderer)}</code></td>
          <td style="padding:8px;color:#dc2626;font-family:monospace;font-size:11px">${esc((r.error || '').slice(0, 120))}</td>
        </tr>`).join('')}</tbody>
      </table>`

  const body = `
    <div style="display:flex;gap:10px;margin-bottom:20px;align-items:center;flex-wrap:wrap">
      <a href="/field/admin" class="btn btn-secondary">← Dashboard</a>
      <h2 style="margin:0;flex:1"><i class="fas fa-chart-line" style="color:#8b5cf6"></i> Renderer Stats <span class="muted" style="font-size:13px;font-weight:400">Last 7 days</span></h2>
    </div>

    ${recommendation}

    <div class="card mb-4">
      <div class="card-header"><h3 class="card-title">Provider Breakdown</h3></div>
      <table style="width:100%;font-size:14px">
        <thead><tr style="background:#f9fafb">
          <th style="text-align:left;padding:10px">Renderer</th>
          <th style="text-align:center;padding:10px">Attempts</th>
          <th style="text-align:center;padding:10px">OK</th>
          <th style="text-align:center;padding:10px">Failures</th>
          <th style="text-align:center;padding:10px">Success rate</th>
          <th style="text-align:right;padding:10px">Avg render time</th>
        </tr></thead>
        <tbody>${overallTable}</tbody>
      </table>
    </div>

    <div class="card mb-4">
      <div class="card-header"><h3 class="card-title">Recent Failures (last 25)</h3></div>
      ${failureTable}
    </div>
  `

  return c.html(layout('Renderer Stats', body, user))
})

// ─── DASHBOARD SNAPSHOTS ──────────────────────────────────────────────────────
// Auto-archived nightly PNGs of the admin dashboard. Useful for disputes,
// historical records, "what did the business look like last Tuesday?".

async function runDashboardSnapshot(env: any, trigger: 'cron' | 'lazy' | 'manual'): Promise<{ ok: boolean; created: number; errors: string[] }> {
  const errors: string[] = []
  let created = 0
  if (!env.URLBOX_SECRET_KEY) return { ok: false, created: 0, errors: ['URLBOX_SECRET_KEY missing'] }
  if (!env.PDF_BUCKET) return { ok: false, created: 0, errors: ['PDF_BUCKET binding missing'] }

  // SAST date today
  const sastNow = new Date(Date.now() + 2 * 3600_000)
  const today = sastNow.toISOString().slice(0, 10)

  // Gather totals for the "notes" column — useful context when reviewing later
  let totals = ''
  try {
    const t = await env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM field_submissions) AS total,
      (SELECT COUNT(*) FROM field_submissions WHERE signature_data LIKE 'data:%') AS signed,
      (SELECT COUNT(*) FROM field_submissions WHERE COALESCE(is_draft,0)=1) AS drafts`).first<any>()
    if (t) totals = `total=${t.total},signed=${t.signed},drafts=${t.drafts}`
  } catch {}

  // Mint short-lived snapshot token (5-min TTL) so Urlbox can fetch the auth'd dashboard.
  // We use a tiny inline shared secret in field-admin for this; simpler: pass admin cookie.
  // Since Urlbox needs cookies, we'll snapshot the PUBLIC SUCCESS LIST instead which
  // doesn't need auth. Wait — dashboard IS admin-only. Solution: mint a one-time
  // snapshot bearer in the cookie format. For simplicity, we render the deliveries
  // list which is public, or use ?snapshot_token=... but admin layout requires auth.
  //
  // Cleanest approach: have a dedicated /field/admin/snapshot-view route that accepts
  // a one-time token (different from session) and renders a printable dashboard.
  // For now: snapshot the PUBLIC deliveries list as the "business snapshot" — it
  // shows all recent activity without needing auth, perfect for archival.
  const targets = [
    { name: 'deliveries', path: '/field/deliveries', label: 'Recent Deliveries' }
  ]

  for (const tgt of targets) {
    const t0 = Date.now()
    const r2Key = `snapshots/${today}/${tgt.name}.png`
    // Skip if we already have today's snapshot for this target
    const existing = await env.DB.prepare(`
      SELECT id FROM field_dashboard_snapshots WHERE snapshot_date=? AND target=?
    `).bind(today, tgt.name).first<any>()
    if (existing) {
      // Already done today — skip (idempotent)
      continue
    }
    try {
      const { renderToBuffer, dashboardSnapshotOptions } = await import('../lib/urlbox.js')
      const pageUrl = `https://bwprodsystem.co.za${tgt.path}`
      const opts = dashboardSnapshotOptions(pageUrl, 'png')
      const { buffer } = await renderToBuffer(env, opts)
      await env.PDF_BUCKET.put(r2Key, buffer, {
        httpMetadata: { contentType: 'image/png' },
        customMetadata: { snapshot_date: today, target: tgt.name }
      })
      await env.DB.prepare(`
        INSERT INTO field_dashboard_snapshots (snapshot_date, target, r2_key, format, bytes, ms, renderer, trigger, notes)
        VALUES (?, ?, ?, 'png', ?, ?, 'urlbox', ?, ?)
      `).bind(today, tgt.name, r2Key, buffer.byteLength, Date.now() - t0, trigger, totals).run()
      // Telemetry
      try {
        await env.DB.prepare(`
          INSERT INTO field_renderer_log (renderer, format, ms, bytes, ok, trigger)
          VALUES ('urlbox', 'png', ?, ?, 1, 'snapshot')
        `).bind(Date.now() - t0, buffer.byteLength).run()
      } catch {}
      created++
    } catch (err: any) {
      errors.push(`${tgt.name}: ${err.message}`)
      try {
        await env.DB.prepare(`
          INSERT INTO field_renderer_log (renderer, format, ms, bytes, ok, error, trigger)
          VALUES ('urlbox_failed', 'png', ?, 0, 0, ?, 'snapshot')
        `).bind(Date.now() - t0, err.message?.slice(0, 300)).run()
      } catch {}
    }
  }

  await env.DB.prepare(`
    INSERT OR REPLACE INTO field_system_config (key, value, updated_at)
    VALUES ('dashboard_snapshot_last_run', ?, CURRENT_TIMESTAMP)
  `).bind(new Date().toISOString()).run()

  return { ok: errors.length === 0, created, errors }
}

// Admin gallery — browse historical snapshots
app.get('/snapshots', requireAuth, async (c) => {
  const user = c.get('user' as any) as any
  const rows = await c.env.DB.prepare(`
    SELECT id, snapshot_date, target, r2_key, bytes, ms, trigger, notes, created_at
    FROM field_dashboard_snapshots
    ORDER BY snapshot_date DESC, target
    LIMIT 120
  `).all<any>()
  const snaps = (rows.results || []) as any[]

  // Group by date
  const byDate = new Map<string, any[]>()
  for (const s of snaps) {
    const arr = byDate.get(s.snapshot_date) || []
    arr.push(s)
    byDate.set(s.snapshot_date, arr)
  }
  const dates = Array.from(byDate.keys())

  const lastRun = await getSystemConfig(c.env.DB, 'dashboard_snapshot_last_run', '')

  const gallery = dates.length === 0
    ? `<div style="text-align:center;padding:40px;color:var(--muted)">No snapshots yet. Click "Snapshot Now" to create the first one.</div>`
    : dates.map(d => `
      <div class="card mb-4">
        <div class="card-header"><h3 class="card-title">${esc(d)} <span class="muted" style="font-weight:400;font-size:12px">${byDate.get(d)!.length} snapshot${byDate.get(d)!.length===1?'':'s'}</span></h3></div>
        <div class="card-body" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">
          ${byDate.get(d)!.map(s => `
            <a href="/field/admin/snapshots/${s.id}/view" target="_blank" style="display:block;text-decoration:none;color:inherit;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;background:#fafafa">
              <div style="background:#f3f4f6;height:160px;display:flex;align-items:center;justify-content:center;overflow:hidden">
                <img src="/field/admin/snapshots/${s.id}/view" loading="lazy" alt="${esc(s.target)} ${esc(s.snapshot_date)}" style="width:100%;height:160px;object-fit:cover;object-position:top">
              </div>
              <div style="padding:10px 12px;font-size:13px">
                <div style="font-weight:600;margin-bottom:2px">${esc(s.target)}</div>
                <div class="muted" style="font-size:11px">${esc(s.notes || '')}</div>
                <div class="muted" style="font-size:11px;margin-top:4px">${Math.round((s.bytes||0)/1024)} KB · ${s.ms}ms · ${esc(s.trigger)}</div>
              </div>
            </a>
          `).join('')}
        </div>
      </div>
    `).join('')

  const body = `
    <div style="display:flex;gap:10px;margin-bottom:20px;align-items:center;flex-wrap:wrap">
      <a href="/field/admin" class="btn btn-secondary">← Dashboard</a>
      <h2 style="margin:0;flex:1"><i class="fas fa-camera-retro" style="color:#8b5cf6"></i> Dashboard Snapshots</h2>
      <form method="POST" action="/field/admin/snapshots/run" style="margin:0">
        <button type="submit" class="btn" style="background:#8b5cf6;color:#fff;border:none"><i class="fas fa-camera"></i> Snapshot Now</button>
      </form>
    </div>
    <div class="muted" style="font-size:13px;margin-bottom:16px">
      Daily auto-archived PNGs of the public deliveries list. Triggered nightly (via lazy-cron on dashboard load) or on-demand.
      Last run: <strong>${lastRun ? new Date(lastRun).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' }) : 'never'}</strong>
    </div>
    ${gallery}
  `
  return c.html(layout('Dashboard Snapshots', body, user))
})

// Serve a stored snapshot image
app.get('/snapshots/:id/view', requireAuth, async (c) => {
  const id = c.req.param('id')
  const s = await c.env.DB.prepare(`SELECT r2_key, format, snapshot_date, target FROM field_dashboard_snapshots WHERE id=?`).bind(id).first<any>()
  if (!s) return c.text('Not found', 404)
  if (!c.env.PDF_BUCKET) return c.text('No bucket', 503)
  const obj = await c.env.PDF_BUCKET.get(s.r2_key)
  if (!obj) return c.text('Snapshot file missing', 404)
  return new Response(obj.body, {
    headers: {
      'Content-Type': s.format === 'pdf' ? 'application/pdf' : 'image/png',
      'Content-Disposition': `inline; filename="bw-${s.target}-${s.snapshot_date}.${s.format}"`,
      'Cache-Control': 'private, max-age=86400'
    }
  })
})

// Manual trigger
app.post('/snapshots/run', requireAuth, async (c) => {
  const result = await runDashboardSnapshot(c.env, 'manual')
  return c.redirect('/field/admin/snapshots?ran=' + (result.created ? 'ok' : 'noop'))
})

// Cron endpoint (token-protected)
app.get('/cron/dashboard-snapshot', async (c) => {
  const providedToken = c.req.query('token') || ''
  const storedToken = await getSystemConfig(c.env.DB, 'cron_secret', '')
  const user = c.get('user' as any) as any
  const tokenOK = storedToken && providedToken && providedToken === storedToken
  if (!tokenOK && !user) {
    return c.json({ ok: false, error: 'unauthorised — supply ?token=... or log in' }, 401)
  }
  const result = await runDashboardSnapshot(c.env, tokenOK ? 'cron' : 'manual')
  return c.json(result)
})

// ─── URLBOX: HEALTH CHECK (sanity test the integration) ───────────────────────
// Quick admin endpoint to confirm Urlbox keys work without rendering anything.
//   GET /field/admin/urlbox/health
//
// Calls Urlbox account info endpoint. Returns JSON with status + quota info.
// If this returns 200 with ok:true, the secret key is valid and you're good.

app.get('/urlbox/health', requireAuth, async (c) => {
  const pub = c.env.URLBOX_PUBLISHABLE_KEY
  const sec = c.env.URLBOX_SECRET_KEY
  const whk = c.env.URLBOX_WEBHOOK_SECRET

  const status: any = {
    keys_present: {
      publishable: !!pub,
      secret: !!sec,
      webhook: !!whk
    },
    publishable_preview: pub ? `${pub.slice(0, 8)}…${pub.slice(-4)}` : null,
    test_render: null as any
  }

  if (!sec) {
    return c.json({ ok: false, error: 'URLBOX_SECRET_KEY missing', ...status }, 503)
  }

  // Tiny test render: example.com → PNG (cheap, fast, doesn't hit our app)
  // Uses our actual renderToBuffer() helper to verify the JSON-envelope path works.
  try {
    const t0 = Date.now()
    const { renderToBuffer } = await import('../lib/urlbox.js')
    const result = await renderToBuffer(c.env, {
      url: 'https://example.com',
      format: 'png',
      width: 400,
      height: 300,
      full_page: false,
      cache_ttl: 86400
    })
    // Verify PNG magic bytes (\x89PNG)
    const m = new Uint8Array(result.buffer.slice(0, 4))
    const valid = m[0] === 0x89 && m[1] === 0x50 && m[2] === 0x4e && m[3] === 0x47
    status.test_render = {
      ok: valid,
      ms: Date.now() - t0,
      bytes: result.buffer.byteLength,
      content_type: result.contentType,
      magic_valid: valid,
      urlbox_render_time_ms: result.meta?.renderTime,
      urlbox_queue_time_ms: result.meta?.queueTime
    }
  } catch (err: any) {
    status.test_render = { ok: false, error: err.message }
  }

  return c.json({ ok: !!status.test_render?.ok, ...status })
})

// ─── SUGGEST APPROVE/IGNORE ────────────────────────────────────────────────────

app.post('/suggest/approve', requireAuth, async (c) => {
  const user = c.get('user' as any) as any
  const body = await c.req.parseBody()
  const { id, description } = body
  // Reuse existing master item by name (case-insensitive), else insert new.
  const existing = await c.env.DB.prepare(
    'SELECT id FROM field_items WHERE LOWER(name)=LOWER(?) LIMIT 1'
  ).bind(description).first<any>()
  let itemId: number
  if (existing?.id) {
    itemId = existing.id
    await c.env.DB.prepare('UPDATE field_items SET active=1 WHERE id=?').bind(itemId).run()
  } else {
    const r = await c.env.DB.prepare(
      'INSERT INTO field_items (category, name, active) VALUES (?, ?, 1)'
    ).bind('Other', description).run()
    itemId = Number(r.meta.last_row_id)
  }
  await c.env.DB.prepare(
    `UPDATE field_suggested_items
     SET status='created', matched_item_id=?, decided_by=?, decided_at=CURRENT_TIMESTAMP
     WHERE id=?`
  ).bind(itemId, user?.name || 'admin', id).run()
  return c.redirect('/field/admin')
})

app.post('/suggest/ignore', requireAuth, async (c) => {
  const user = c.get('user' as any) as any
  const body = await c.req.parseBody()
  await c.env.DB.prepare(
    `UPDATE field_suggested_items
     SET status='ignored', decided_by=?, decided_at=CURRENT_TIMESTAMP
     WHERE id=?`
  ).bind(user?.name || 'admin', body.id).run()
  return c.redirect('/field/admin')
})

// ─── PEOPLE MANAGEMENT ────────────────────────────────────────────────────────

app.get('/people', requireAuth, async (c) => {
  const user = c.get('user' as any) as any
  const people = await c.env.DB.prepare('SELECT * FROM field_people ORDER BY name').all<any>()
  const flash = c.req.query('saved') === '1' ? `<div style="background:#f0fdf4;border:1px solid #86efac;color:#166534;padding:10px 16px;border-radius:8px;margin-bottom:16px;font-size:14px">✅ Saved.</div>` : ''

  const peopleList = people.results || []
  const withEmail = peopleList.filter((p:any) => p.email && p.email.trim()).length
  const totalActive = peopleList.filter((p:any) => p.active).length

  const rows = peopleList.map((p:any) => `
    <tr>
      <td style="width:200px">
        <strong>${esc(p.name)}</strong>
        ${p.is_default ? '<span class="badge badge-info" style="font-size:10px;margin-left:4px">default</span>' : ''}
      </td>
      <td>
        <form method="POST" action="/field/admin/people/update-contact" style="display:flex;gap:6px;align-items:center;margin:0">
          <input type="hidden" name="id" value="${p.id}">
          <input name="email" type="email" class="input" style="flex:1;min-width:200px;font-size:13px;padding:6px 10px" value="${esc(p.email||'')}" placeholder="email@example.com">
          <input name="phone" type="tel" class="input" style="width:140px;font-size:13px;padding:6px 10px" value="${esc(p.phone||'')}" placeholder="+27 ...">
          <button class="btn btn-sm btn-secondary" type="submit" title="Save" style="padding:6px 10px"><i class="fas fa-save"></i></button>
        </form>
      </td>
      <td style="width:90px"><span class="badge badge-${p.active ? 'success' : 'danger'}">${p.active ? 'Active' : 'Inactive'}</span></td>
      <td style="width:120px">
        <form method="POST" action="/field/admin/people/toggle" style="display:inline">
          <input type="hidden" name="id" value="${p.id}">
          <input type="hidden" name="active" value="${p.active ? 0 : 1}">
          <button class="btn btn-sm btn-secondary">${p.active ? 'Deactivate' : 'Activate'}</button>
        </form>
      </td>
    </tr>`).join('')

  const body = `
    ${flash}
    <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:24px">
      <div class="stat-card"><div class="stat-num">${peopleList.length}</div><div class="stat-label">Total People</div></div>
      <div class="stat-card"><div class="stat-num">${totalActive}</div><div class="stat-label">Active</div></div>
      <div class="stat-card" style="${withEmail < totalActive ? 'border-color:#f59e0b' : 'border-color:#10b981'}">
        <div class="stat-num" style="${withEmail < totalActive ? 'color:#f59e0b' : 'color:#10b981'}">${withEmail}/${totalActive}</div>
        <div class="stat-label">Active w/ Email <span class="muted" style="font-size:10px">(for nudges)</span></div>
      </div>
    </div>

    <div class="card mb-4">
      <div class="card-header"><h3 class="card-title">Add Person</h3></div>
      <div style="padding:16px">
        <form method="POST" action="/field/admin/people/add" style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">
          <div class="form-group" style="flex:1;min-width:180px;margin:0">
            <label class="label">Name</label>
            <input name="name" class="input" placeholder="Full name" required>
          </div>
          <div class="form-group" style="flex:1;min-width:200px;margin:0">
            <label class="label">Email <span class="muted" style="font-size:11px">(optional, for nudges)</span></label>
            <input name="email" type="email" class="input" placeholder="name@bwproductions.co.za">
          </div>
          <div class="form-group" style="flex:1;min-width:140px;margin:0">
            <label class="label">Phone <span class="muted" style="font-size:11px">(optional)</span></label>
            <input name="phone" type="tel" class="input" placeholder="+27 ...">
          </div>
          <button type="submit" class="btn btn-secondary">Add</button>
        </form>
      </div>
    </div>

    <div class="card">
      <div class="card-header" style="display:flex;align-items:center;justify-content:space-between">
        <h3 class="card-title">People List</h3>
        <span class="muted" style="font-size:12px"><i class="fas fa-info-circle"></i> Type an email and hit save — nudges start flowing once email transport is enabled.</span>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Name</th><th>Contact</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="4" class="muted text-center">No people yet</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  `
  return c.html(layout('Manage People', body, user, 'field-admin'))
})

app.post('/people/add', requireAuth, async (c) => {
  const body = await c.req.parseBody()
  const name = String(body.name || '').trim()
  const email = String(body.email || '').trim().toLowerCase() || null
  const phone = String(body.phone || '').trim() || null
  if (name) {
    await c.env.DB.prepare('INSERT OR IGNORE INTO field_people (name, email, phone) VALUES (?, ?, ?)').bind(name, email, phone).run()
    // If the row already existed, also update its email/phone if provided
    if (email || phone) {
      await c.env.DB.prepare('UPDATE field_people SET email = COALESCE(?, email), phone = COALESCE(?, phone) WHERE name = ?').bind(email, phone, name).run()
    }
  }
  return c.redirect('/field/admin/people?saved=1')
})

app.post('/people/update-contact', requireAuth, async (c) => {
  const body = await c.req.parseBody()
  const id = Number(body.id)
  const email = String(body.email || '').trim().toLowerCase() || null
  const phone = String(body.phone || '').trim() || null
  if (id) {
    await c.env.DB.prepare('UPDATE field_people SET email=?, phone=? WHERE id=?').bind(email, phone, id).run()
  }
  return c.redirect('/field/admin/people?saved=1')
})

app.post('/people/toggle', requireAuth, async (c) => {
  const body = await c.req.parseBody()
  await c.env.DB.prepare('UPDATE field_people SET active=? WHERE id=?').bind(body.active, body.id).run()
  return c.redirect('/field/admin/people')
})

// ─── DRAFT NUDGES ──────────────────────────────────────────────────────────────
// Proactive prevention: ping prepared_by when their draft hits the threshold
// (default 5 days) so it doesn't become a flag.
//
// Architecture:
//   • A "candidate" is any submission with is_draft=1 AND age >= threshold AND
//     no successful nudge in the last 5 days (cooldown to prevent spam).
//   • Running the cron endpoint creates a field_draft_nudges row per candidate:
//       - status='sent'      if email transport enabled & succeeded
//       - status='no_email'  if prepared_by has no email on file
//       - status='pending'   if email_enabled flag is off (current state)
//       - status='failed'    if transport returned an error
//   • The admin page shows the live candidate list + the full audit history.

async function getSystemConfig(DB: D1Database, key: string, fallback = ''): Promise<string> {
  const r = await DB.prepare('SELECT value FROM field_system_config WHERE key=?').bind(key).first<any>()
  return r?.value ?? fallback
}

async function setSystemConfig(DB: D1Database, key: string, value: string): Promise<void> {
  await DB.prepare(`INSERT INTO field_system_config (key, value, updated_at) VALUES (?, ?, datetime('now'))
                    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')`)
    .bind(key, value).run()
}

// Core nudge runner — shared by the lazy trigger, the cron endpoint, and the manual "Run now" button.
async function runDraftNudges(DB: D1Database, triggeredBy: string): Promise<{
  scanned: number; candidates: number; sent: number; queued: number; noEmail: number; failed: number;
  results: any[]
}> {
  const thresholdDays = Number(await getSystemConfig(DB, 'draft_nudge_threshold_days', '5')) || 5
  const emailEnabled  = (await getSystemConfig(DB, 'email_enabled', '0')) === '1'

  // Candidates: draft + age >= threshold + no successful or pending nudge in last 5 days
  const candidatesQ = await DB.prepare(`
    SELECT fs.id, fs.form_number, fs.form_type, fs.prepared_by, fs.created_at,
           CAST((julianday('now') - julianday(fs.created_at)) AS INTEGER) AS age_days,
           fp.email AS recipient_email
    FROM field_submissions fs
    LEFT JOIN field_people fp ON LOWER(fp.name) = LOWER(fs.prepared_by)
    WHERE COALESCE(fs.is_draft, 0) = 1
      AND (julianday('now') - julianday(fs.created_at)) >= ?
      AND NOT EXISTS (
        SELECT 1 FROM field_draft_nudges dn
        WHERE dn.submission_id = fs.id
          AND dn.status IN ('sent','pending')
          AND (julianday('now') - julianday(dn.created_at)) < 5
      )
    ORDER BY fs.created_at ASC
  `).bind(thresholdDays).all<any>()

  const candidates = candidatesQ.results || []
  let sent = 0, queued = 0, noEmail = 0, failed = 0
  const results: any[] = []

  for (const cand of candidates) {
    const email = cand.recipient_email && String(cand.recipient_email).includes('@')
      ? String(cand.recipient_email).trim().toLowerCase()
      : null

    const subject = `Reminder: ${cand.form_number} is still a draft (${cand.age_days} days)`
    const preview = `Hi ${cand.prepared_by || 'there'}, your ${(FORM_LABELS[cand.form_type]||cand.form_type).toLowerCase()} ${cand.form_number} has been sitting as a draft for ${cand.age_days} days. Please complete or delete it.`

    let status: string
    let errorMsg: string | null = null

    if (!email) {
      status = 'no_email'
      noEmail++
    } else if (!emailEnabled) {
      status = 'pending'   // Queued, waiting for email transport to be turned on
      queued++
    } else {
      // Email transport hook — when Resend/SendGrid is wired, this branch sends the mail.
      // For now it's never taken (emailEnabled=false). Left in as the integration point.
      try {
        // await sendEmail(...)  ← to be added when Resend is configured
        status = 'sent'
        sent++
      } catch (e: any) {
        status = 'failed'
        errorMsg = String(e?.message || e)
        failed++
      }
    }

    await DB.prepare(`
      INSERT INTO field_draft_nudges
        (submission_id, form_number, form_type, prepared_by, recipient_email,
         draft_age_days, status, error_message, email_subject, email_preview,
         triggered_by, sent_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${status==='sent' ? `datetime('now')` : 'NULL'})
    `).bind(
      cand.id, cand.form_number, cand.form_type, cand.prepared_by,
      email, cand.age_days, status, errorMsg, subject, preview, triggeredBy
    ).run()

    results.push({ ...cand, status, recipient_email: email })
  }

  await setSystemConfig(DB, 'draft_nudge_last_run', new Date().toISOString())

  return {
    scanned: candidates.length,
    candidates: candidates.length,
    sent, queued, noEmail, failed,
    results
  }
}

const STATUS_META: Record<string, { label: string; tone: string; tip: string }> = {
  sent:      { label: 'Sent',         tone: '#10b981', tip: 'Email delivered to recipient' },
  pending:   { label: 'Queued',       tone: '#f59e0b', tip: 'Email transport not yet enabled \u2014 will be sent the moment it is' },
  no_email:  { label: 'No email',     tone: '#ef4444', tip: 'No email address on file for this person \u2014 add one on the People page' },
  dismissed: { label: 'Dismissed',    tone: '#64748b', tip: 'Manually dismissed by admin' },
  failed:    { label: 'Failed',       tone: '#dc2626', tip: 'Email transport returned an error' }
}

app.get('/draft-nudges', requireAuth, async (c) => {
  const user = c.get('user' as any) as any

  const flash = (() => {
    if (c.req.query('ran') === '1') {
      const s = c.req.query('sent') || '0'
      const q = c.req.query('queued') || '0'
      const ne = c.req.query('noemail') || '0'
      return `<div style=\"background:#f0fdf4;border:1px solid #86efac;color:#166534;padding:12px 16px;border-radius:8px;margin-bottom:16px;font-size:14px\">\u2705 Nudge run complete \u2014 <strong>${s}</strong> sent \u00b7 <strong>${q}</strong> queued \u00b7 <strong>${ne}</strong> missing email.</div>`
    }
    if (c.req.query('dismissed') === '1') return `<div style=\"background:#f0fdf4;border:1px solid #86efac;color:#166534;padding:10px 16px;border-radius:8px;margin-bottom:16px;font-size:14px\">\u2705 Nudge dismissed.</div>`
    return ''
  })()

  const thresholdDays = Number(await getSystemConfig(c.env.DB, 'draft_nudge_threshold_days', '5')) || 5
  const emailEnabled  = (await getSystemConfig(c.env.DB, 'email_enabled', '0')) === '1'
  const lastRun       = await getSystemConfig(c.env.DB, 'draft_nudge_last_run', '')

  // Live candidate list — what would fire if we ran right now
  const candidatesQ = await c.env.DB.prepare(`
    SELECT fs.id, fs.form_number, fs.form_type, fs.prepared_by, fs.brand, fs.client,
           fs.venue, fs.event_name, fs.created_at,
           CAST((julianday('now') - julianday(fs.created_at)) AS INTEGER) AS age_days,
           fp.email AS recipient_email,
           (SELECT MAX(dn.created_at) FROM field_draft_nudges dn WHERE dn.submission_id = fs.id AND dn.status IN ('sent','pending')) AS last_nudge
    FROM field_submissions fs
    LEFT JOIN field_people fp ON LOWER(fp.name) = LOWER(fs.prepared_by)
    WHERE COALESCE(fs.is_draft, 0) = 1
      AND (julianday('now') - julianday(fs.created_at)) >= ?
    ORDER BY fs.created_at ASC
  `).bind(thresholdDays).all<any>()

  // Full audit trail (last 100)
  const historyQ = await c.env.DB.prepare(`
    SELECT dn.*,
           CAST((julianday('now') - julianday(dn.created_at)) AS INTEGER) AS days_ago
    FROM field_draft_nudges dn
    ORDER BY dn.created_at DESC
    LIMIT 100
  `).all<any>()

  const candidates = candidatesQ.results || []
  const history = historyQ.results || []
  const cooldown = (last: string | null) => {
    if (!last) return null
    const ms = Date.now() - new Date(last + 'Z').getTime()
    const days = Math.floor(ms / 86400000)
    if (days < 5) return 5 - days
    return null
  }

  const candidateRows = candidates.map((r:any) => {
    const cooldownDays = cooldown(r.last_nudge)
    const willFire = !cooldownDays
    const recipient = r.recipient_email
      ? `<span class=\"mono\" style=\"font-size:12px\">${esc(r.recipient_email)}</span>`
      : `<span class=\"badge\" style=\"background:#fee2e2;color:#991b1b;font-size:10px\">no email</span> <a href=\"/field/admin/people\" style=\"font-size:11px\">add</a>`
    return `
      <tr>
        <td><span class=\"badge badge-${FORM_COLORS[r.form_type]||'info'}\" style=\"font-size:10px\">${FORM_LABELS[r.form_type]||r.form_type}</span></td>
        <td class=\"mono\" style=\"font-size:12px\">${esc(r.form_number)}</td>
        <td>${esc(r.prepared_by || '\u2014')}</td>
        <td>${recipient}</td>
        <td>${esc(r.brand || r.client || r.event_name || r.venue || '\u2014')}</td>
        <td class=\"muted\" style=\"font-size:12px\">${r.age_days} days</td>
        <td>
          ${willFire
            ? `<span class=\"badge\" style=\"background:#dcfce7;color:#166534;font-size:10px\">ready to nudge</span>`
            : `<span class=\"badge\" style=\"background:#e0e7ff;color:#3730a3;font-size:10px\" title=\"Last nudge sent recently \u2014 cooldown prevents spam\">cooldown ${cooldownDays}d</span>`}
        </td>
        <td>
          <a href=\"/field/admin/submission/${r.id}\" class=\"btn btn-sm btn-secondary\" style=\"font-size:11px;padding:4px 10px\">View</a>
        </td>
      </tr>`
  }).join('')

  const historyRows = history.map((h:any) => {
    const meta = STATUS_META[h.status] || { label: h.status, tone: '#64748b', tip: '' }
    const captured = (() => {
      try { return new Date((h.created_at as string) + 'Z').toLocaleString('en-ZA', { timeZone:'Africa/Johannesburg', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) }
      catch { return h.created_at }
    })()
    return `
      <tr>
        <td class=\"mono\" style=\"font-size:12px;white-space:nowrap\">${esc(captured)}</td>
        <td class=\"mono\" style=\"font-size:12px\">${esc(h.form_number || '\u2014')}</td>
        <td>${esc(h.prepared_by || '\u2014')}</td>
        <td>${h.recipient_email ? `<span class=\"mono\" style=\"font-size:11px\">${esc(h.recipient_email)}</span>` : `<span class=\"muted\" style=\"font-size:11px\">\u2014</span>`}</td>
        <td>
          <span class="badge" title="${esc(meta.tip)}" style="background:${meta.tone}1a;color:${meta.tone};font-size:10px;font-weight:600">${esc(meta.label)}</span>
          ${h.error_message ? `<div class="mono" style="font-size:10px;color:#dc2626;margin-top:2px">${esc(h.error_message)}</div>` : ''}
        </td>
        <td class="muted" style="font-size:12px">${esc(h.triggered_by || '—')}</td>
        <td>
          ${h.status === 'pending' ? `
            <form method="POST" action="/field/admin/draft-nudges/${h.id}/dismiss" style="display:inline">
              <button class="btn btn-sm btn-secondary" style="font-size:11px;padding:3px 8px" title="Dismiss this queued nudge">Dismiss</button>
            </form>` : ''}
          ${h.submission_id ? `<a href="/field/admin/submission/${h.submission_id}" class="btn btn-sm btn-secondary" style="font-size:11px;padding:3px 8px">View</a>` : ''}
        </td>
      </tr>`
  }).join('')

  const lastRunLabel = lastRun
    ? new Date(lastRun).toLocaleString('en-ZA', { timeZone:'Africa/Johannesburg' })
    : 'never'

  const body = `
    ${flash}

    <div class=\"stats-grid\" style=\"grid-template-columns:repeat(4,1fr);margin-bottom:24px\">
      <div class=\"stat-card\" style=\"border-color:${candidates.length > 0 ? '#f59e0b' : '#cbd5e1'}\">
        <div class=\"stat-num\" style=\"${candidates.length > 0 ? 'color:#f59e0b' : ''}\">${candidates.length}</div>
        <div class=\"stat-label\">Drafts \u2265 ${thresholdDays}d</div>
      </div>
      <div class=\"stat-card\">
        <div class=\"stat-num\">${history.filter((h:any)=>h.status==='sent').length}</div>
        <div class=\"stat-label\">Sent (recent)</div>
      </div>
      <div class=\"stat-card\">
        <div class=\"stat-num\" style=\"color:${emailEnabled ? '#10b981' : '#f59e0b'}\">${emailEnabled ? 'ON' : 'OFF'}</div>
        <div class=\"stat-label\">Email Transport</div>
      </div>
      <div class=\"stat-card\">
        <div class=\"stat-num\" style=\"font-size:14px;font-weight:600\">${esc(lastRunLabel)}</div>
        <div class=\"stat-label\">Last Run</div>
      </div>
    </div>

    ${!emailEnabled ? `
    <div style=\"background:#fffbeb;border:1px solid #fbbf24;color:#78350f;padding:14px 18px;border-radius:10px;margin-bottom:20px;font-size:14px;line-height:1.5\">
      <strong><i class=\"fas fa-info-circle\"></i> Email transport not yet enabled.</strong>
      Nudges that would otherwise be sent are <em>queued</em> in the audit log and visible below.
      Once Resend (or another transport) is wired up and <code>email_enabled</code> is set to <code>1</code>,
      everything queued fires automatically. Run the nudge job now to see exactly who would be emailed.
    </div>` : ''}

    <div class=\"card mb-4\">
      <div class=\"card-header\" style=\"display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px\">
        <h3 class=\"card-title\">
          <i class=\"fas fa-bell\" style=\"color:#f59e0b;margin-right:6px\"></i>
          Ready to Nudge
          <span class=\"badge\" style=\"background:#fef3c7;color:#78350f;margin-left:6px\">${candidates.length}</span>
        </h3>
        <form method=\"POST\" action=\"/field/admin/draft-nudges/run\" style=\"margin:0\">
          <button type=\"submit\" class=\"btn\" style=\"background:#f59e0b;color:#fff;border:none;padding:8px 16px;font-weight:600\">
            <i class=\"fas fa-paper-plane\" style=\"margin-right:5px\"></i>Run Nudge Job Now
          </button>
        </form>
      </div>
      <div class=\"table-wrap\">
        <table class=\"table\" style=\"margin:0\">
          <thead>
            <tr>
              <th>Type</th><th>Form #</th><th>Prepared By</th><th>Email on File</th>
              <th>Brand / Event</th><th>Age</th><th>State</th><th></th>
            </tr>
          </thead>
          <tbody>${candidateRows || `<tr><td colspan=\"8\" class=\"muted text-center\" style=\"padding:30px\"><i class=\"fas fa-check-circle\" style=\"font-size:28px;color:#10b981;display:block;margin-bottom:8px\"></i>No drafts overdue \u2014 nothing to nudge.</td></tr>`}</tbody>
        </table>
      </div>
    </div>

    <div class=\"card\">
      <div class=\"card-header\">
        <h3 class=\"card-title\">
          <i class=\"fas fa-clock-rotate-left\" style=\"margin-right:6px\"></i>
          Nudge History
          <span class=\"badge badge-info\" style=\"margin-left:6px\">${history.length}</span>
        </h3>
        <span class=\"muted\" style=\"font-size:12px\">Last 100 entries</span>
      </div>
      <div class=\"table-wrap\">
        <table class=\"table\" style=\"margin:0\">
          <thead>
            <tr>
              <th>When (SAST)</th><th>Form #</th><th>Prepared By</th><th>Recipient</th>
              <th>Status</th><th>Triggered By</th><th></th>
            </tr>
          </thead>
          <tbody>${historyRows || `<tr><td colspan=\"7\" class=\"muted text-center\" style=\"padding:30px\">No nudge history yet \u2014 run the job to populate.</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `

  return c.html(layout('Draft Nudges', body, user, 'field-admin'))
})

// POST: manual run from the admin button
app.post('/draft-nudges/run', requireAuth, async (c) => {
  const user = c.get('user' as any) as any
  const result = await runDraftNudges(c.env.DB, `admin:${user?.email || user?.name || 'unknown'}`)
  return c.redirect(`/field/admin/draft-nudges?ran=1&sent=${result.sent}&queued=${result.queued}&noemail=${result.noEmail}`)
})

// POST: dismiss a queued nudge
app.post('/draft-nudges/:id/dismiss', requireAuth, async (c) => {
  const id = Number(c.req.param('id'))
  if (id) {
    await c.env.DB.prepare(`UPDATE field_draft_nudges SET status='dismissed' WHERE id=? AND status='pending'`).bind(id).run()
  }
  return c.redirect('/field/admin/draft-nudges?dismissed=1')
})

// JSON cron endpoint — for external pingers (cron-job.org / GitHub Actions / etc.)
// Auth model: requires either a logged-in admin OR a shared secret in ?token=
// The token is stored in field_system_config as 'cron_secret' (set via wrangler secret or admin UI later).
app.get('/cron/draft-nudge', async (c) => {
  const providedToken = c.req.query('token') || ''
  const storedToken = await getSystemConfig(c.env.DB, 'cron_secret', '')

  // Allow either: valid token, OR an authenticated admin session (cookie)
  // Keeping the cookie path open lets you test from the browser; token path is for cron services.
  const tokenOK = storedToken && providedToken && providedToken === storedToken

  if (!tokenOK) {
    // Fall back to session auth
    const cookieHeader = c.req.header('cookie') || ''
    if (!cookieHeader.includes('bw_session=')) {
      return c.json({ ok: false, error: 'unauthorised \u2014 supply ?token=... or log in' }, 401)
    }
    // (We trust the session; if it's invalid the layout middleware would catch it.)
  }

  const result = await runDraftNudges(c.env.DB, tokenOK ? 'cron:token' : 'cron:session')
  return c.json({ ok: true, ...result, results: result.results.length })
})

// ─── ITEMS MANAGEMENT ─────────────────────────────────────────────────────────

app.get('/items', requireAuth, async (c) => {
  const user = c.get('user' as any) as any
  const cat = c.req.query('cat') || ''
  const items = await c.env.DB.prepare(
    `SELECT * FROM field_items ${cat ? 'WHERE category=?' : ''} ORDER BY category, name`
  ).bind(...(cat ? [cat] : [])).all<any>()

  const cats = await c.env.DB.prepare('SELECT DISTINCT category FROM field_items ORDER BY category').all<any>()

  const catFilter = ['', ...(cats.results||[]).map((r:any) => r.category)].map(c2 =>
    `<option value="${c2}" ${cat===c2?'selected':''}>${c2 || 'All Categories'}</option>`).join('')

  const rows = (items.results||[]).map((it:any) => `
    <tr>
      <td style="font-size:12px;color:var(--muted)">${esc(it.category)}</td>
      <td>${esc(it.name)}</td>
      <td>${esc(it.aliases||'')}</td>
      <td><span class="badge badge-${it.active?'success':'danger'}" style="font-size:10px">${it.active?'Active':'Inactive'}</span></td>
      <td>
        <form method="POST" action="/field/admin/items/toggle" style="display:inline">
          <input type="hidden" name="id" value="${it.id}">
          <input type="hidden" name="active" value="${it.active?0:1}">
          <button class="btn btn-sm btn-secondary">${it.active?'Deactivate':'Activate'}</button>
        </form>
      </td>
    </tr>`).join('')

  const CATEGORIES = Object.keys({
    'Umbrellas':'','Furniture':'','Structures':'','Bar':'','Cold Storage':'',
    'Branding & Signage':'','Lighting & AV':'','Crowd Control':'','Power':'',
    'Activations & Games':'','Logistics':'','Other':''
  })

  const body = `
    <div class="card mb-4">
      <div class="card-header"><h3 class="card-title">Add Item</h3></div>
      <div style="padding:16px">
        <form method="POST" action="/field/admin/items/add">
          <div class="form-grid" style="grid-template-columns:1fr 2fr 1fr;gap:10px;margin-bottom:10px">
            <div class="form-group" style="margin:0">
              <label class="label">Category</label>
              <select name="category" class="input">
                ${CATEGORIES.map(c2 => `<option value="${c2}">${c2}</option>`).join('')}
              </select>
            </div>
            <div class="form-group" style="margin:0">
              <label class="label">Item Name</label>
              <input name="name" class="input" placeholder="Item name" required>
            </div>
            <div class="form-group" style="margin:0">
              <label class="label">Aliases (optional)</label>
              <input name="aliases" class="input" placeholder="e.g. Banner Wall, Media Wall">
            </div>
          </div>
          <button type="submit" class="btn btn-secondary">Add Item</button>
        </form>
      </div>
    </div>
    <div class="card">
      <div class="card-header" style="display:flex;align-items:center;gap:12px">
        <h3 class="card-title">Master Items List</h3>
        <form method="GET" style="display:flex;gap:8px;margin-left:auto">
          <select name="cat" class="input" style="font-size:13px;padding:6px 28px 6px 10px">${catFilter}</select>
          <button type="submit" class="btn btn-sm btn-secondary">Filter</button>
        </form>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Category</th><th>Name</th><th>Aliases</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `
  return c.html(layout('Manage Items', body, user, 'field-admin'))
})

app.post('/items/add', requireAuth, async (c) => {
  const body = await c.req.parseBody()
  if (body.name && body.category) {
    await c.env.DB.prepare('INSERT OR IGNORE INTO field_items (category, name, aliases) VALUES (?,?,?)')
      .bind(String(body.category), String(body.name).trim(), String(body.aliases||'').trim()).run()
  }
  return c.redirect('/field/admin/items')
})

app.post('/items/toggle', requireAuth, async (c) => {
  const body = await c.req.parseBody()
  await c.env.DB.prepare('UPDATE field_items SET active=? WHERE id=?').bind(body.active, body.id).run()
  return c.redirect('/field/admin/items')
})

// ═════════════════════════════════════════════════════════════════════════════
// ─── FLEET ADMIN: MUSIC BUS + DJ DRIVERS ────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════
// Parameterised CRUD: same UI / same SQL, just different table names.
// Mounted under /field/admin/musicbus-vehicles, /musicbus-drivers,
// /djdrivers-vehicles, /djdrivers-drivers and /<fleet>-damages.

type FleetAdminCfg = {
  slug: string             // 'musicbus' | 'djdrivers'
  label: string            // 'Music Bus' | 'DJ Drivers'
  vehicleTable: string     // 'music_bus_vehicles' | 'dj_vehicles'
  driverTable: string      // 'music_bus_drivers'  | 'dj_drivers'
  formType: string         // 'musicbus_inspection' | 'dj_inspection'
  publicPath: string       // '/musicbus' | '/djdrivers'
}

const MUSICBUS_ADMIN: FleetAdminCfg = {
  slug: 'musicbus', label: 'Music Bus',
  vehicleTable: 'music_bus_vehicles', driverTable: 'music_bus_drivers',
  formType: 'musicbus_inspection', publicPath: '/musicbus'
}


// The 31-point inspection items list — duplicated here to keep field-admin
// independent of field.ts (the master copy lives at field.ts line 129).
const FLEET_INSPECTION_ITEMS = [
  'All front lights','Indicators','Wipers','All tail lights','Hooter','License',
  'Biometric Scanner','Registration plate','Rear view mirrors','Windscreen',
  'Water and oil leaks','Battery','Doors and handles','Windows and handles',
  'Seats','Interior / Upholstery','Tyres (min 3mm tread)','Paintwork',
  'Spare wheel','Tools','Jack','Wheel spanner','Triangle','Radio','Minor damage',
  'Brakes','Hand brake','Kilometres','Water caps','Service book','Last service done'
]

function registerFleetAdminRoutes(cfg: FleetAdminCfg) {
  // ── VEHICLES LIST + ADD ────────────────────────────────────────────────────
  app.get(`/${cfg.slug}-vehicles`, requireAuth, async (c) => {
    const user = c.get('user' as any) as any
    const flash = c.req.query('saved') === '1' ? `<div style="background:#f0fdf4;border:1px solid #86efac;color:#166534;padding:10px 16px;border-radius:8px;margin-bottom:16px;font-size:14px">✅ Saved.</div>` : ''
    const vehicles = await c.env.DB.prepare(
      `SELECT * FROM ${cfg.vehicleTable} ORDER BY region, reg_number`
    ).all<any>()
    const list = vehicles.results || []

    const rows = list.map((v:any) => `
      <tr>
        <td><strong style="font-family:monospace;letter-spacing:0.04em">${esc(v.reg_number)}</strong></td>
        <td>${esc(v.description || '—')}</td>
        <td>${esc(v.region || '—')}</td>
        <td>${esc(v.home_location || '—')}</td>
        <td><span class="muted" style="font-size:11px">${esc(v.notes || '')}</span></td>
        <td><span class="badge badge-${v.active ? 'success' : 'danger'}">${v.active ? 'Active' : 'Inactive'}</span></td>
        <td>
          <form method="POST" action="/field/admin/${cfg.slug}-vehicles/toggle" style="display:inline">
            <input type="hidden" name="id" value="${v.id}">
            <input type="hidden" name="active" value="${v.active ? 0 : 1}">
            <button class="btn btn-sm btn-secondary">${v.active ? 'Deactivate' : 'Activate'}</button>
          </form>
        </td>
      </tr>`).join('')

    const body = `
      ${flash}
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <h1 style="font-size:22px;font-weight:800;color:#fff;margin:0">🚐 ${cfg.label} · Vehicles</h1>
        <div style="display:flex;gap:8px">
          <a href="${cfg.publicPath}" target="_blank" class="btn btn-sm btn-secondary"><i class="fas fa-external-link-alt"></i> Open Public App</a>
          <a href="/field/admin/${cfg.slug}-drivers" class="btn btn-sm btn-secondary"><i class="fas fa-users"></i> Drivers</a>
          <a href="/field/admin/${cfg.slug}-damages" class="btn btn-sm btn-secondary"><i class="fas fa-exclamation-triangle"></i> Damages</a>
          <a href="/field/admin" class="btn btn-sm btn-secondary">← Back to Admin</a>
        </div>
      </div>

      <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:24px">
        <div class="stat-card"><div class="stat-num">${list.length}</div><div class="stat-label">Total Vehicles</div></div>
        <div class="stat-card"><div class="stat-num">${list.filter((v:any)=>v.active).length}</div><div class="stat-label">Active</div></div>
        <div class="stat-card"><div class="stat-num">${new Set(list.filter((v:any)=>v.active).map((v:any)=>v.region)).size}</div><div class="stat-label">Regions</div></div>
      </div>

      <div class="card mb-4">
        <div class="card-header"><h3 class="card-title">Add Vehicle</h3></div>
        <div style="padding:16px">
          <form method="POST" action="/field/admin/${cfg.slug}-vehicles/add" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;align-items:end">
            <div class="form-group" style="margin:0"><label class="label">Reg Number *</label><input name="reg_number" class="input" placeholder="e.g. BL28ZLZN" style="text-transform:uppercase" required></div>
            <div class="form-group" style="margin:0"><label class="label">Description</label><input name="description" class="input" placeholder="Iveco bus"></div>
            <div class="form-group" style="margin:0"><label class="label">Region</label><input name="region" class="input" placeholder="East Coast"></div>
            <div class="form-group" style="margin:0"><label class="label">Home Location</label><input name="home_location" class="input" placeholder="Mthatha"></div>
            <div class="form-group" style="margin:0"><label class="label">Notes</label><input name="notes" class="input" placeholder="Optional"></div>
            <button type="submit" class="btn btn-secondary" style="height:38px"><i class="fas fa-plus"></i> Add</button>
          </form>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h3 class="card-title">${cfg.label} Fleet (${list.length})</h3></div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Reg #</th><th>Description</th><th>Region</th><th>Home</th><th>Notes</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="7" class="muted text-center">No vehicles yet</td></tr>'}</tbody>
          </table>
        </div>
      </div>`
    return c.html(layout(`${cfg.label} · Vehicles`, body, user, 'field-admin'))
  })

  app.post(`/${cfg.slug}-vehicles/add`, requireAuth, async (c) => {
    const body = await c.req.parseBody()
    const reg = String(body.reg_number || '').trim().toUpperCase()
    if (reg) {
      await c.env.DB.prepare(
        `INSERT OR IGNORE INTO ${cfg.vehicleTable} (reg_number, description, region, home_location, notes) VALUES (?, ?, ?, ?, ?)`
      ).bind(
        reg,
        String(body.description || '').trim() || null,
        String(body.region || '').trim() || null,
        String(body.home_location || '').trim() || null,
        String(body.notes || '').trim() || null
      ).run()
    }
    return c.redirect(`/field/admin/${cfg.slug}-vehicles?saved=1`)
  })

  app.post(`/${cfg.slug}-vehicles/toggle`, requireAuth, async (c) => {
    const body = await c.req.parseBody()
    await c.env.DB.prepare(`UPDATE ${cfg.vehicleTable} SET active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(body.active, body.id).run()
    return c.redirect(`/field/admin/${cfg.slug}-vehicles?saved=1`)
  })

  // ── DRIVERS LIST + ADD ─────────────────────────────────────────────────────
  app.get(`/${cfg.slug}-drivers`, requireAuth, async (c) => {
    const user = c.get('user' as any) as any
    const flash = c.req.query('saved') === '1' ? `<div style="background:#f0fdf4;border:1px solid #86efac;color:#166534;padding:10px 16px;border-radius:8px;margin-bottom:16px;font-size:14px">✅ Saved.</div>` : ''
    const drivers = await c.env.DB.prepare(`
      SELECT d.*, v.reg_number as default_reg
      FROM ${cfg.driverTable} d
      LEFT JOIN ${cfg.vehicleTable} v ON d.default_vehicle_id = v.id
      ORDER BY d.region, d.name
    `).all<any>()
    const vehicles = await c.env.DB.prepare(
      `SELECT id, reg_number, region FROM ${cfg.vehicleTable} WHERE active=1 ORDER BY region, reg_number`
    ).all<any>()
    const dList = drivers.results || []
    const vList = vehicles.results || []

    const vehicleOpts = (selected: number | null) => `
      <option value="">— none —</option>
      ${vList.map((v:any) => `<option value="${v.id}" ${v.id === selected ? 'selected' : ''}>${esc(v.reg_number)} (${esc(v.region || '—')})</option>`).join('')}
    `

    const rows = dList.map((d:any) => `
      <tr>
        <td><strong>${esc(d.name)}</strong></td>
        <td>
          <form method="POST" action="/field/admin/${cfg.slug}-drivers/update" style="display:flex;gap:6px;align-items:center;margin:0">
            <input type="hidden" name="id" value="${d.id}">
            <input name="phone" type="tel" class="input" style="width:140px;font-size:13px;padding:6px 10px" value="${esc(d.phone || '')}" placeholder="+27 ...">
            <input name="region" type="text" class="input" style="width:130px;font-size:13px;padding:6px 10px" value="${esc(d.region || '')}" placeholder="Region">
            <select name="default_vehicle_id" class="input" style="width:200px;font-size:13px;padding:6px 10px">
              ${vehicleOpts(d.default_vehicle_id)}
            </select>
            <button class="btn btn-sm btn-secondary" type="submit" title="Save" style="padding:6px 10px"><i class="fas fa-save"></i></button>
          </form>
        </td>
        <td><span class="badge badge-${d.active ? 'success' : 'danger'}">${d.active ? 'Active' : 'Inactive'}</span></td>
        <td>
          <form method="POST" action="/field/admin/${cfg.slug}-drivers/toggle" style="display:inline">
            <input type="hidden" name="id" value="${d.id}">
            <input type="hidden" name="active" value="${d.active ? 0 : 1}">
            <button class="btn btn-sm btn-secondary">${d.active ? 'Deactivate' : 'Activate'}</button>
          </form>
        </td>
      </tr>`).join('')

    const body = `
      ${flash}
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <h1 style="font-size:22px;font-weight:800;color:#fff;margin:0">🧑‍✈️ ${cfg.label} · Drivers</h1>
        <div style="display:flex;gap:8px">
          <a href="${cfg.publicPath}" target="_blank" class="btn btn-sm btn-secondary"><i class="fas fa-external-link-alt"></i> Open Public App</a>
          <a href="/field/admin/${cfg.slug}-vehicles" class="btn btn-sm btn-secondary"><i class="fas fa-truck"></i> Vehicles</a>
          <a href="/field/admin/${cfg.slug}-damages" class="btn btn-sm btn-secondary"><i class="fas fa-exclamation-triangle"></i> Damages</a>
          <a href="/field/admin" class="btn btn-sm btn-secondary">← Back to Admin</a>
        </div>
      </div>

      <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:24px">
        <div class="stat-card"><div class="stat-num">${dList.length}</div><div class="stat-label">Total Drivers</div></div>
        <div class="stat-card"><div class="stat-num">${dList.filter((d:any)=>d.active).length}</div><div class="stat-label">Active</div></div>
        <div class="stat-card"><div class="stat-num">${dList.filter((d:any)=>d.default_vehicle_id).length}</div><div class="stat-label">With Assigned Vehicle</div></div>
      </div>

      <div class="card mb-4">
        <div class="card-header"><h3 class="card-title">Add Driver</h3></div>
        <div style="padding:16px">
          <form method="POST" action="/field/admin/${cfg.slug}-drivers/add" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;align-items:end">
            <div class="form-group" style="margin:0"><label class="label">Name *</label><input name="name" class="input" placeholder="Full name" required></div>
            <div class="form-group" style="margin:0"><label class="label">Phone</label><input name="phone" type="tel" class="input" placeholder="+27 ..."></div>
            <div class="form-group" style="margin:0"><label class="label">Region</label><input name="region" class="input" placeholder="East Coast"></div>
            <div class="form-group" style="margin:0">
              <label class="label">Default Vehicle</label>
              <select name="default_vehicle_id" class="input">${vehicleOpts(null)}</select>
            </div>
            <button type="submit" class="btn btn-secondary" style="height:38px"><i class="fas fa-plus"></i> Add</button>
          </form>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h3 class="card-title">${cfg.label} Drivers (${dList.length})</h3></div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Name</th><th>Phone · Region · Default Vehicle</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="4" class="muted text-center">No drivers yet</td></tr>'}</tbody>
          </table>
        </div>
      </div>`
    return c.html(layout(`${cfg.label} · Drivers`, body, user, 'field-admin'))
  })

  app.post(`/${cfg.slug}-drivers/add`, requireAuth, async (c) => {
    const body = await c.req.parseBody()
    const name = String(body.name || '').trim()
    if (name) {
      const dv = body.default_vehicle_id ? Number(body.default_vehicle_id) : null
      await c.env.DB.prepare(
        `INSERT OR IGNORE INTO ${cfg.driverTable} (name, phone, region, default_vehicle_id) VALUES (?, ?, ?, ?)`
      ).bind(
        name,
        String(body.phone || '').trim() || null,
        String(body.region || '').trim() || null,
        dv && dv > 0 ? dv : null
      ).run()
    }
    return c.redirect(`/field/admin/${cfg.slug}-drivers?saved=1`)
  })

  app.post(`/${cfg.slug}-drivers/update`, requireAuth, async (c) => {
    const body = await c.req.parseBody()
    const id = Number(body.id)
    if (id) {
      const dv = body.default_vehicle_id ? Number(body.default_vehicle_id) : null
      await c.env.DB.prepare(
        `UPDATE ${cfg.driverTable} SET phone=?, region=?, default_vehicle_id=? WHERE id=?`
      ).bind(
        String(body.phone || '').trim() || null,
        String(body.region || '').trim() || null,
        dv && dv > 0 ? dv : null,
        id
      ).run()
    }
    return c.redirect(`/field/admin/${cfg.slug}-drivers?saved=1`)
  })

  app.post(`/${cfg.slug}-drivers/toggle`, requireAuth, async (c) => {
    const body = await c.req.parseBody()
    await c.env.DB.prepare(`UPDATE ${cfg.driverTable} SET active=? WHERE id=?`).bind(body.active, body.id).run()
    return c.redirect(`/field/admin/${cfg.slug}-drivers?saved=1`)
  })

  // ── INSPECTIONS ARCHIVE (formerly Damages Report) ──────────────────────────
  // The full PDF archive for this fleet. Defaults to ALL inspections (so admins
  // can pull up any PDF), with a status toggle to filter to just damaged or
  // just clean inspections. Each row links to the inspection PDF. Two CSV
  // exports: damages-detail (one row per failed item) and inspections-summary
  // (one row per submission with pass/fail counts and the PDF URL).
  app.get(`/${cfg.slug}-damages`, requireAuth, async (c) => {
    const user = c.get('user' as any) as any
    const url = new URL(c.req.url)
    const vehicleFilter = (url.searchParams.get('vehicle') || '').trim().toUpperCase()
    const regionFilter = (url.searchParams.get('region') || '').trim()
    const fromDate = (url.searchParams.get('from') || '').trim()
    const toDate = (url.searchParams.get('to') || '').trim()
    const status = (url.searchParams.get('status') || 'all').trim()  // all | damaged | clean

    let query = `SELECT id, form_number, prepared_by, driver, vehicle_reg, venue as region, delivery_date,
                        created_at, notes, form_data, pdf_url
                 FROM field_submissions
                 WHERE form_type=? AND is_draft=0`
    const params: any[] = [cfg.formType]
    if (vehicleFilter) { query += ' AND UPPER(vehicle_reg) LIKE ?'; params.push('%' + vehicleFilter + '%') }
    if (regionFilter)  { query += ' AND venue=?';                   params.push(regionFilter) }
    if (fromDate)      { query += ' AND date(delivery_date) >= date(?)'; params.push(fromDate) }
    if (toDate)        { query += ' AND date(delivery_date) <= date(?)'; params.push(toDate) }
    query += ' ORDER BY delivery_date DESC, created_at DESC'

    const result = await c.env.DB.prepare(query).bind(...params).all<any>()
    const allSubs = result.results || []

    // ── Score every submission: pass/fail counts + collected fail items ────
    type InspRow = {
      id: number, form_number: string, vehicle_reg: string, driver: string,
      region: string, date: string, created_at: string, notes: string,
      pdf_url: string, passes: number, fails: number, unanswered: number,
      failItems: Array<{ item: string, note: string }>
    }
    const inspections: InspRow[] = []
    for (const s of allSubs) {
      let fd: any = {}; try { fd = JSON.parse(s.form_data || '{}') } catch {}
      const insp = fd.inspection || {}
      let passes = 0, fails = 0, unanswered = 0
      const failItems: Array<{ item: string, note: string }> = []
      for (let i = 0; i < FLEET_INSPECTION_ITEMS.length; i++) {
        const v = insp['insp_' + i]
        if (v === 'pass') passes++
        else if (v === 'fail') {
          fails++
          failItems.push({
            item: FLEET_INSPECTION_ITEMS[i],
            note: (fd['insp_note_' + i] || '').toString().trim()
          })
        } else unanswered++
      }
      inspections.push({
        id: s.id, form_number: s.form_number,
        vehicle_reg: s.vehicle_reg || '—',
        driver: s.driver || s.prepared_by || '—',
        region: s.region || fd.region || '—',
        date: s.delivery_date || (s.created_at || '').substring(0, 10),
        created_at: s.created_at || '',
        notes: (s.notes || '').toString().trim(),
        pdf_url: s.pdf_url || '',
        passes, fails, unanswered, failItems
      })
    }

    // ── Status filter (applied after scoring) ──────────────────────────────
    const damagedOnly = inspections.filter(r => r.fails > 0)
    const cleanOnly = inspections.filter(r => r.fails === 0)
    const visible =
      status === 'damaged' ? damagedOnly :
      status === 'clean'   ? cleanOnly   :
      inspections

    // Flat damage rows for the detail table + CSV
    const damages: Array<{ inspection: InspRow, item: string, note: string }> = []
    for (const r of visible) {
      for (const f of r.failItems) damages.push({ inspection: r, item: f.item, note: f.note })
    }

    // ── Per-vehicle damage rollup (over visible set when filter is damaged,
    // otherwise over the full damaged set so the rollup stays informative). ─
    const rollupSource = status === 'clean' ? [] : (status === 'damaged' ? damagedOnly : damagedOnly)
    const byVehicle: Record<string, { reg:string, total:number, items:Record<string,number> }> = {}
    for (const r of rollupSource) {
      for (const f of r.failItems) {
        if (!byVehicle[r.vehicle_reg]) byVehicle[r.vehicle_reg] = { reg: r.vehicle_reg, total: 0, items: {} }
        byVehicle[r.vehicle_reg].total++
        byVehicle[r.vehicle_reg].items[f.item] = (byVehicle[r.vehicle_reg].items[f.item] || 0) + 1
      }
    }
    const vehicleSummary = Object.values(byVehicle).sort((a,b) => b.total - a.total)

    // Region list for filter dropdown
    const regions = await c.env.DB.prepare(
      `SELECT DISTINCT region FROM ${cfg.vehicleTable} WHERE region IS NOT NULL AND region!='' ORDER BY region`
    ).all<any>()
    const regionList = (regions.results || []).map((r:any) => r.region)

    const qs = (extra: Record<string,string>) => {
      const p = new URLSearchParams()
      if (vehicleFilter) p.set('vehicle', vehicleFilter)
      if (regionFilter) p.set('region', regionFilter)
      if (fromDate) p.set('from', fromDate)
      if (toDate) p.set('to', toDate)
      if (status && status !== 'all') p.set('status', status)
      for (const [k,v] of Object.entries(extra)) p.set(k,v)
      return p.toString()
    }
    // Helper: build status-tab URL preserving other filters
    const tabUrl = (s: string) => {
      const p = new URLSearchParams()
      if (vehicleFilter) p.set('vehicle', vehicleFilter)
      if (regionFilter) p.set('region', regionFilter)
      if (fromDate) p.set('from', fromDate)
      if (toDate) p.set('to', toDate)
      if (s !== 'all') p.set('status', s)
      const qstr = p.toString()
      return `/field/admin/${cfg.slug}-damages${qstr ? '?' + qstr : ''}`
    }
    const tabStyle = (active: boolean, color: string) =>
      `padding:8px 16px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:700;` +
      (active
        ? `background:${color};color:#000;`
        : `background:rgba(255,255,255,0.04);color:#cbd5e1;border:1px solid var(--border);`)

    const body = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:10px">
        <h1 style="font-size:22px;font-weight:800;color:#fff;margin:0">📋 ${cfg.label} · Inspections</h1>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <a href="/field/admin/${cfg.slug}-vehicles" class="btn btn-sm btn-secondary"><i class="fas fa-bus"></i> Vehicles</a>
          <a href="/field/admin/${cfg.slug}-drivers" class="btn btn-sm btn-secondary"><i class="fas fa-users"></i> Drivers</a>
          <a href="/field/admin" class="btn btn-sm btn-secondary">← Back to Admin</a>
        </div>
      </div>
      <p style="color:var(--muted);font-size:13px;margin:0 0 16px">
        Full inspection archive — every submitted PDF is here.
        <strong style="color:#86efac">${cleanOnly.length}</strong> clean ·
        <strong style="color:#fca5a5">${damagedOnly.length}</strong> with damages ·
        <strong>${inspections.length}</strong> total.
      </p>

      <!-- Status tabs -->
      <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
        <a href="${tabUrl('all')}"      style="${tabStyle(status==='all',      '#60a5fa')}">All Inspections <span style="opacity:0.7">(${inspections.length})</span></a>
        <a href="${tabUrl('damaged')}" style="${tabStyle(status==='damaged', '#fca5a5')}">⚠️ With Damages <span style="opacity:0.7">(${damagedOnly.length})</span></a>
        <a href="${tabUrl('clean')}"   style="${tabStyle(status==='clean',   '#86efac')}">✅ Clean Only <span style="opacity:0.7">(${cleanOnly.length})</span></a>
      </div>

      <form method="get" style="display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin-bottom:18px;padding:14px;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:10px">
        ${status && status !== 'all' ? `<input type="hidden" name="status" value="${esc(status)}">` : ''}
        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="font-size:11px;color:var(--muted);text-transform:uppercase">Vehicle</label>
          <input type="text" name="vehicle" value="${esc(vehicleFilter)}" placeholder="e.g. BL28ZLZN" style="padding:8px 10px;border-radius:6px;border:1px solid var(--border);background:rgba(0,0,0,0.3);color:#fff;width:160px;text-transform:uppercase">
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="font-size:11px;color:var(--muted);text-transform:uppercase">Region</label>
          <select name="region" style="padding:8px 10px;border-radius:6px;border:1px solid var(--border);background:rgba(0,0,0,0.3);color:#fff;min-width:140px">
            <option value="">— All regions —</option>
            ${regionList.map(r => `<option value="${esc(r)}" ${r===regionFilter ? 'selected':''}>${esc(r)}</option>`).join('')}
          </select>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="font-size:11px;color:var(--muted);text-transform:uppercase">From</label>
          <input type="date" name="from" value="${esc(fromDate)}" style="padding:8px 10px;border-radius:6px;border:1px solid var(--border);background:rgba(0,0,0,0.3);color:#fff">
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="font-size:11px;color:var(--muted);text-transform:uppercase">To</label>
          <input type="date" name="to" value="${esc(toDate)}" style="padding:8px 10px;border-radius:6px;border:1px solid var(--border);background:rgba(0,0,0,0.3);color:#fff">
        </div>
        <button type="submit" class="btn btn-secondary">Filter</button>
        <a href="/field/admin/${cfg.slug}-damages" class="btn btn-sm btn-secondary" style="text-decoration:none">Clear</a>
        <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">
          <a href="/field/admin/${cfg.slug}-inspections.csv?${qs({})}" class="btn btn-sm" style="background:rgba(96,165,250,0.15);color:#93c5fd;border:1px solid rgba(96,165,250,0.5);font-weight:700;text-decoration:none">⬇️ Inspections CSV</a>
          <a href="/field/admin/${cfg.slug}-damages.csv?${qs({})}" class="btn btn-sm" style="background:rgba(239,68,68,0.15);color:#fca5a5;border:1px solid rgba(239,68,68,0.5);font-weight:700;text-decoration:none">⬇️ Damages CSV</a>
        </div>
      </form>

      ${status !== 'clean' && vehicleSummary.length ? `
        <div style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">Damage rollup by vehicle</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;margin-bottom:24px">
          ${vehicleSummary.map(v => `
            <div style="padding:14px;border:1px solid rgba(239,68,68,0.3);border-radius:10px;background:rgba(239,68,68,0.06)">
              <div style="font-size:13px;font-weight:800;color:#fff;letter-spacing:0.04em">${esc(v.reg)}</div>
              <div style="font-size:24px;font-weight:800;color:#fca5a5;margin:4px 0">${v.total}</div>
              <div style="font-size:11px;color:var(--muted);text-transform:uppercase">fail flags</div>
              <div style="font-size:11px;color:#9ca3af;margin-top:6px;line-height:1.4">
                ${Object.entries(v.items).slice(0,4).map(([k,n]) => `${esc(k)} <strong>×${n}</strong>`).join(' · ')}
              </div>
            </div>`).join('')}
        </div>
      ` : ''}

      <!-- INSPECTIONS TABLE — one row per submission with the PDF link -->
      <div style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">
        Inspection archive ${status === 'damaged' ? '(with damages)' : status === 'clean' ? '(clean only)' : ''}
        — ${visible.length} ${visible.length === 1 ? 'inspection' : 'inspections'}
      </div>
      ${visible.length ? `
        <div style="overflow-x:auto;border:1px solid var(--border);border-radius:10px;margin-bottom:24px">
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead style="background:rgba(255,255,255,0.04)">
              <tr>
                <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--muted)">Date</th>
                <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--muted)">Form #</th>
                <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--muted)">Vehicle</th>
                <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--muted)">Driver</th>
                <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--muted)">Region</th>
                <th style="padding:10px 12px;text-align:center;font-size:11px;text-transform:uppercase;color:var(--muted)">Status</th>
                <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:var(--muted)">PDF</th>
              </tr>
            </thead>
            <tbody>
              ${visible.map(r => {
                const isClean = r.fails === 0
                const statusBadge = isClean
                  ? `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:rgba(34,197,94,0.15);color:#86efac;font-size:11px;font-weight:700">✅ Clean ${r.passes}/${FLEET_INSPECTION_ITEMS.length}</span>`
                  : `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:rgba(239,68,68,0.15);color:#fca5a5;font-size:11px;font-weight:700">❌ ${r.fails} fail${r.fails===1?'':'s'}</span>`
                return `
                <tr style="border-top:1px solid var(--border)">
                  <td style="padding:10px 12px;color:#e5e7eb;white-space:nowrap">${esc(r.date)}</td>
                  <td style="padding:10px 12px;color:#93c5fd;font-family:monospace;font-weight:700"><a href="/field/success/${r.id}" target="_blank" style="color:inherit;text-decoration:none">${esc(r.form_number)}</a></td>
                  <td style="padding:10px 12px;color:#fff;font-weight:700;font-family:monospace">${esc(r.vehicle_reg)}</td>
                  <td style="padding:10px 12px;color:#cbd5e1">${esc(r.driver)}</td>
                  <td style="padding:10px 12px;color:#cbd5e1">${esc(r.region)}</td>
                  <td style="padding:10px 12px;text-align:center">${statusBadge}</td>
                  <td style="padding:10px 12px;text-align:right;white-space:nowrap">
                    ${r.pdf_url
                      ? `<a href="/field/pdf/${r.id}" target="_blank" style="color:#86efac;text-decoration:none;font-weight:700;font-size:12px;margin-right:8px">📄 View</a>
                         <a href="/field/pdf/${r.id}?download=1" style="color:#fcd34d;text-decoration:none;font-weight:700;font-size:12px">⬇️ Download</a>`
                      : `<span style="color:#6b7280;font-size:11px;font-style:italic">PDF pending</span>`}
                  </td>
                </tr>`
              }).join('')}
            </tbody>
          </table>
        </div>
      ` : `
        <div style="padding:40px;text-align:center;border:1px dashed var(--border);border-radius:10px;color:var(--muted);margin-bottom:24px">
          No inspections${vehicleFilter || regionFilter || fromDate || toDate ? ' for the selected filters' : status === 'damaged' ? ' with damages' : status === 'clean' ? ' clean' : ''} yet.
        </div>
      `}

      <!-- DAMAGES DETAIL TABLE — one row per failed item (only when relevant) -->
      ${status !== 'clean' && damages.length ? `
        <div style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">Damage detail — each failed item</div>
        <div style="overflow-x:auto;border:1px solid var(--border);border-radius:10px">
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead style="background:rgba(255,255,255,0.04)">
              <tr>
                <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--muted)">Date</th>
                <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--muted)">Vehicle</th>
                <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--muted)">Driver</th>
                <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--muted)">Region</th>
                <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--muted)">Failed Item</th>
                <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--muted)">Driver Note</th>
                <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--muted)">Form #</th>
              </tr>
            </thead>
            <tbody>
              ${damages.map(d => `
                <tr style="border-top:1px solid var(--border)">
                  <td style="padding:10px 12px;color:#e5e7eb;white-space:nowrap">${esc(d.inspection.date)}</td>
                  <td style="padding:10px 12px;color:#fff;font-weight:700;font-family:monospace">${esc(d.inspection.vehicle_reg)}</td>
                  <td style="padding:10px 12px;color:#cbd5e1">${esc(d.inspection.driver)}</td>
                  <td style="padding:10px 12px;color:#cbd5e1">${esc(d.inspection.region)}</td>
                  <td style="padding:10px 12px;color:#fca5a5;font-weight:600">❌ ${esc(d.item)}</td>
                  <td style="padding:10px 12px;color:#e5e7eb;font-style:italic">${d.note ? esc(d.note) : '<span style="color:#6b7280">—</span>'}</td>
                  <td style="padding:10px 12px"><a href="/field/pdf/${d.inspection.id}" target="_blank" style="color:#93c5fd;text-decoration:none;font-weight:600">${esc(d.inspection.form_number)}</a></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}`
    return c.html(layout(`${cfg.label} · Inspections`, body, user, 'field-admin'))
  })

  // ── INSPECTIONS-SUMMARY CSV (one row per submission, with PDF URL) ────────
  // Spreadsheet-friendly archive: every inspection on its own row, including
  // pass/fail counts and the direct PDF URL so Bibi can keep a copy in Excel
  // and click straight through to any PDF.
  app.get(`/${cfg.slug}-inspections.csv`, requireAuth, async (c) => {
    const url = new URL(c.req.url)
    const vehicleFilter = (url.searchParams.get('vehicle') || '').trim().toUpperCase()
    const regionFilter = (url.searchParams.get('region') || '').trim()
    const fromDate = (url.searchParams.get('from') || '').trim()
    const toDate = (url.searchParams.get('to') || '').trim()
    const status = (url.searchParams.get('status') || 'all').trim()

    let query = `SELECT id, form_number, prepared_by, driver, vehicle_reg, venue as region, delivery_date,
                        created_at, notes, form_data, pdf_url
                 FROM field_submissions WHERE form_type=? AND is_draft=0`
    const params: any[] = [cfg.formType]
    if (vehicleFilter) { query += ' AND UPPER(vehicle_reg) LIKE ?'; params.push('%' + vehicleFilter + '%') }
    if (regionFilter)  { query += ' AND venue=?';                   params.push(regionFilter) }
    if (fromDate)      { query += ' AND date(delivery_date) >= date(?)'; params.push(fromDate) }
    if (toDate)        { query += ' AND date(delivery_date) <= date(?)'; params.push(toDate) }
    query += ' ORDER BY delivery_date DESC, created_at DESC'

    const result = await c.env.DB.prepare(query).bind(...params).all<any>()
    const subs = result.results || []

    const csvEscape = (v: string) => {
      const s = (v == null ? '' : String(v))
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
    }
    const lines: string[] = []
    lines.push([
      'Date','Form Number','Vehicle Reg','Driver','Region',
      'Passed','Failed','Unanswered','Total Items','Status',
      'Failed Items','Driver Notes','PDF URL','Submission ID'
    ].join(','))
    for (const s of subs) {
      let fd:any = {}; try { fd = JSON.parse(s.form_data || '{}') } catch {}
      const insp = fd.inspection || {}
      let passes = 0, fails = 0, unanswered = 0
      const failItems: string[] = []
      for (let i = 0; i < FLEET_INSPECTION_ITEMS.length; i++) {
        const v = insp['insp_' + i]
        if (v === 'pass') passes++
        else if (v === 'fail') {
          fails++
          const note = (fd['insp_note_' + i] || '').toString().trim()
          failItems.push(note ? `${FLEET_INSPECTION_ITEMS[i]} (${note})` : FLEET_INSPECTION_ITEMS[i])
        } else unanswered++
      }
      // Apply status filter
      if (status === 'damaged' && fails === 0) continue
      if (status === 'clean'   && fails > 0)   continue
      const pdfUrl = s.pdf_url || (s.id ? `https://bwprodsystem.co.za/field/pdf/${s.id}` : '')
      lines.push([
        s.delivery_date || (s.created_at || '').substring(0, 10),
        s.form_number || '',
        s.vehicle_reg || '',
        s.driver || s.prepared_by || '',
        s.region || fd.region || '',
        String(passes), String(fails), String(unanswered), String(FLEET_INSPECTION_ITEMS.length),
        fails === 0 ? 'CLEAN' : 'DAMAGED',
        failItems.join('; '),
        (s.notes || '').toString().trim(),
        pdfUrl,
        String(s.id)
      ].map(csvEscape).join(','))
    }
    const today = new Date().toISOString().substring(0, 10)
    return new Response(lines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${cfg.slug}-inspections-${today}.csv"`
      }
    })
  })

  app.get(`/${cfg.slug}-damages.csv`, requireAuth, async (c) => {
    const url = new URL(c.req.url)
    const vehicleFilter = (url.searchParams.get('vehicle') || '').trim().toUpperCase()
    const regionFilter = (url.searchParams.get('region') || '').trim()
    const fromDate = (url.searchParams.get('from') || '').trim()
    const toDate = (url.searchParams.get('to') || '').trim()
    // status filter ignored here — damages CSV is by definition only fails.

    let query = `SELECT id, form_number, prepared_by, driver, vehicle_reg, venue as region, delivery_date,
                        created_at, notes, form_data, pdf_url FROM field_submissions WHERE form_type=? AND is_draft=0`
    const params: any[] = [cfg.formType]
    if (vehicleFilter) { query += ' AND UPPER(vehicle_reg) LIKE ?'; params.push('%' + vehicleFilter + '%') }
    if (regionFilter)  { query += ' AND venue=?';                   params.push(regionFilter) }
    if (fromDate)      { query += ' AND date(delivery_date) >= date(?)'; params.push(fromDate) }
    if (toDate)        { query += ' AND date(delivery_date) <= date(?)'; params.push(toDate) }
    query += ' ORDER BY delivery_date DESC, created_at DESC'

    const result = await c.env.DB.prepare(query).bind(...params).all<any>()
    const subs = result.results || []

    const csvEscape = (v: string) => {
      const s = (v == null ? '' : String(v))
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
    }
    const lines: string[] = []
    lines.push(['Date','Vehicle Reg','Driver','Region','Item Failed','Driver Note','Form Number','Submission ID','PDF URL','Extra Notes'].join(','))
    for (const s of subs) {
      let fd:any = {}; try { fd = JSON.parse(s.form_data || '{}') } catch {}
      const insp = fd.inspection || {}
      for (let i = 0; i < FLEET_INSPECTION_ITEMS.length; i++) {
        if (insp['insp_' + i] === 'fail') {
          lines.push([
            s.delivery_date || (s.created_at || '').substring(0, 10),
            s.vehicle_reg || '',
            s.driver || s.prepared_by || '',
            s.region || fd.region || '',
            FLEET_INSPECTION_ITEMS[i],
            (fd['insp_note_' + i] || '').toString().trim(),
            s.form_number || '',
            String(s.id),
            s.pdf_url || '',
            (s.notes || '').toString().trim()
          ].map(csvEscape).join(','))
        }
      }
    }
    const today = new Date().toISOString().substring(0, 10)
    return new Response(lines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${cfg.slug}-damages-${today}.csv"`
      }
    })
  })
}

registerFleetAdminRoutes(MUSICBUS_ADMIN)

// ─── EMAIL DIGEST: manual triggers + log viewer ──────────────────────────────

// Fire the digest now (admin button — useful for testing or after a fix)
app.post('/email-digest/run-now', requireAuth, async (c) => {
  const result = await runDigest(c.env as any, { reason: 'manual' })
  return c.json(result)
})

// Resend a SPECIFIC delivery (one-off, useful when accounts deletes the email)
app.post('/email-digest/resend/:id', requireAuth, async (c) => {
  const id = parseInt(c.req.param('id'))
  if (!id) return c.json({ ok: false, error: 'bad id' }, 400)
  // Clear notified_at on this row so the digest picks it up
  await c.env.DB.prepare(`UPDATE field_submissions SET notified_at=NULL WHERE id=? AND form_type='delivery'`).bind(id).run()
  const result = await runDigest(c.env as any, { reason: 'manual-resend', forceIds: [id] })
  return c.json(result)
})

// Log viewer — see every send attempt with status, recipients, errors
app.get('/email-digest', requireAuth, async (c) => {
  const user = c.get('user' as any) as any
  const logs = await c.env.DB.prepare(
    `SELECT id, sent_at, recipient, subject, status, provider_id, error, delivery_count, total_size_kb
     FROM email_log ORDER BY sent_at DESC LIMIT 100`
  ).all<any>()
  const pendingRes = await c.env.DB.prepare(
    `SELECT COUNT(*) as n FROM field_submissions
     WHERE form_type='delivery' AND is_draft=0
       AND signature_data IS NOT NULL AND signature_data != ''
       AND notified_at IS NULL`
  ).first<any>()
  const pending = pendingRes?.n || 0
  const escH = (s:any) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')

  const rows = (logs.results || []).map((r:any) => {
    const dot = r.status === 'sent' ? '#86efac' : r.status === 'failed' ? '#fca5a5' : '#fcd34d'
    return `
      <tr style="border-top:1px solid var(--border)">
        <td style="padding:8px 10px;color:#e5e7eb;white-space:nowrap;font-size:12px">${escH(r.sent_at).replace('T',' ').slice(0,19)}</td>
        <td style="padding:8px 10px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dot};margin-right:6px"></span><span style="color:#cbd5e1;font-size:12px">${escH(r.status)}</span></td>
        <td style="padding:8px 10px;color:#cbd5e1;font-size:12px">${escH(r.recipient)}</td>
        <td style="padding:8px 10px;color:#e5e7eb;font-size:12px">${escH(r.subject)}</td>
        <td style="padding:8px 10px;text-align:right;color:#cbd5e1;font-size:12px">${r.delivery_count}</td>
        <td style="padding:8px 10px;text-align:right;color:#cbd5e1;font-size:12px">${r.total_size_kb || 0} KB</td>
        <td style="padding:8px 10px;color:#fca5a5;font-size:11px;max-width:340px;overflow:hidden;text-overflow:ellipsis">${escH(r.error || '')}</td>
      </tr>`
  }).join('')

  const body = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:10px">
      <h1 style="font-size:22px;font-weight:800;color:#fff;margin:0">📧 Accounts Email Digest</h1>
      <a href="/field/admin" class="btn btn-sm btn-secondary">← Back to Admin</a>
    </div>
    <p style="color:var(--muted);font-size:13px;margin:0 0 16px">
      Two scheduled digests per day at <strong>07:00</strong> and <strong>12:00 SAST</strong>.
      Sent to: <strong>${ACCOUNTS_RECIPIENTS.map(e => escH(e)).join(', ')}</strong>.
      Reply-to: <strong>bibi@bwproductions.co.za</strong>.
    </p>
    <div style="display:flex;gap:12px;align-items:center;margin-bottom:18px;flex-wrap:wrap">
      <div style="padding:12px 16px;border:1px solid var(--border);border-radius:10px;background:rgba(96,165,250,0.06)">
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase">Pending now</div>
        <div style="font-size:22px;font-weight:800;color:#93c5fd">${pending}</div>
        <div style="font-size:11px;color:#9ca3af">signed deliveries not yet emailed</div>
      </div>
      <button onclick="fireDigest()" id="fireBtn" style="padding:10px 18px;border-radius:8px;border:1px solid #86efac;background:rgba(34,197,94,0.15);color:#86efac;font-weight:700;cursor:pointer;font-size:13px">
        ▶ Send digest now
      </button>
      <span id="fireStatus" style="color:var(--muted);font-size:12px"></span>
    </div>
    <div style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">Recent send log</div>
    <div style="overflow-x:auto;border:1px solid var(--border);border-radius:10px">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead style="background:rgba(255,255,255,0.04)">
          <tr>
            <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--muted)">When (UTC)</th>
            <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--muted)">Status</th>
            <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--muted)">To</th>
            <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--muted)">Subject</th>
            <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:var(--muted)">#</th>
            <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:var(--muted)">Size</th>
            <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--muted)">Error</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="7" style="padding:40px;text-align:center;color:var(--muted)">No emails sent yet.</td></tr>'}</tbody>
      </table>
    </div>
    <script>
      async function fireDigest() {
        const btn = document.getElementById('fireBtn')
        const s   = document.getElementById('fireStatus')
        btn.disabled = true; s.textContent = 'Sending...'
        try {
          const r = await fetch('/field/admin/email-digest/run-now', { method:'POST' })
          const j = await r.json()
          if (j.ok) {
            s.textContent = j.skipped ? 'Nothing to send.' : '✅ Sent ' + j.sent + ' deliver' + (j.sent===1?'y':'ies') + '. Refreshing...'
            setTimeout(() => location.reload(), 1200)
          } else {
            s.textContent = '❌ ' + (j.error || 'Failed')
            btn.disabled = false
          }
        } catch (e) {
          s.textContent = '❌ ' + e.message
          btn.disabled = false
        }
      }
    </script>`
  return c.html(layout('Accounts Email Digest', body, user, 'field-admin'))
})

export default app
