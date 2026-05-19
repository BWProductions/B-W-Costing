// B&W Productions — Planning Calendar Extractor
// Paste raw planner text → parser produces candidate delivery jobs → user
// approves/skips/edits each card → "Commit Batch" creates real drafts.

import { Hono } from 'hono'
import { parsePlannerRows, rawTextToRows, type ParsedJob } from '../lib/planner-parser.js'

type Env = { Bindings: { DB: D1Database } }
const app = new Hono<Env>()

// ─── ADMIN SESSION (mirrors field.ts) ────────────────────────────────────────
const ADMIN_PINS: Record<string, string> = {
  'Bibi':  '2601',
  'Shane': '1234',
  'Marna': '5678',
}

// Roles in the main app that auto-grant field-admin access (no PIN required)
const FIELD_ADMIN_AUTO_ROLES = ['founder', 'ops_director']

async function getAdminSession(c: any): Promise<string | null> {
  const cookie = c.req.header('cookie') || ''

  // 1. Native field-admin PIN session
  const match = cookie.match(/admin_session=([^;]+)/)
  if (match) {
    try {
      const [name, ts] = atob(match[1]).split('|')
      if (Date.now() - Number(ts) <= 8 * 60 * 60 * 1000 && ADMIN_PINS[name] !== undefined) {
        return name
      }
    } catch {}
  }

  // 2. Auto-grant: valid main-app session for a privileged role
  const { verifySessionToken, getCookieValue } = await import('../lib/auth.js')
  const bwToken = getCookieValue(cookie, 'bw_session')
  if (bwToken) {
    try {
      const user = await verifySessionToken(bwToken)
      if (user && FIELD_ADMIN_AUTO_ROLES.includes(user.role)) {
        return user.name || user.email || 'Admin'
      }
    } catch {}
  }

  return null
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function esc(s: any): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function fmtDate(d: string): string {
  if (!d) return ''
  try {
    return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return d }
}

function pageShell(title: string, body: string): string {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — B&amp;W Productions</title>
<style>
:root{--bg:#0b0d14;--card:#161927;--border:#272a3a;--white:#f1f5f9;--muted:#8b95a8}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--white);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;line-height:1.5}
.field-wrap{max-width:1000px;margin:0 auto;padding:18px}
.field-header{text-align:center;padding:16px 0;border-bottom:1px solid var(--border);margin-bottom:18px}
.field-brand{font-size:18px;font-weight:800;letter-spacing:0.05em;margin-top:4px}
.field-tagline{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.15em}
.field-form-title{font-size:20px;font-weight:800;margin-top:10px}
.section{margin-bottom:14px}
.section-title{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:var(--muted);margin-bottom:6px}
a{color:#60a5fa}
table{width:100%;border-collapse:collapse}
input,textarea,select,button{font-family:inherit}
details summary{outline:none}
</style>
</head><body>${body}</body></html>`
}

// ─── LEARNING / CORRECTION HELPERS ───────────────────────────────────────────
async function applyCorrections(DB: D1Database, fieldName: string, value: string): Promise<string> {
  if (!value) return value
  const row = await DB.prepare(
    `SELECT corrected_value FROM planner_corrections
       WHERE field_name=? AND lower(original_value)=lower(?)
       ORDER BY hit_count DESC LIMIT 1`
  ).bind(fieldName, value).first<any>()
  return row?.corrected_value || value
}

async function recordCorrection(DB: D1Database, fieldName: string, original: string, corrected: string) {
  if (!original || !corrected) return
  if (original.trim().toLowerCase() === corrected.trim().toLowerCase()) return
  await DB.prepare(`
    INSERT INTO planner_corrections (field_name, original_value, corrected_value, hit_count, updated_at)
    VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
    ON CONFLICT(field_name, original_value) DO UPDATE SET
      corrected_value = excluded.corrected_value,
      hit_count = hit_count + 1,
      updated_at = CURRENT_TIMESTAMP
  `).bind(fieldName, original.trim(), corrected.trim()).run()
}

// ─── ROUTES ──────────────────────────────────────────────────────────────────

// GET / — landing or batch view
app.get('/', async (c) => {
  const admin = await getAdminSession(c)
  if (!admin) return c.redirect('/field/admin')

  const batchId = c.req.query('batch')
  if (batchId) return renderBatchPage(c, parseInt(batchId, 10), admin)
  return renderLandingPage(c, admin)
})

async function renderLandingPage(c: any, admin: string) {
  const recent = await c.env.DB.prepare(`
    SELECT pb.id, pb.source_filename, pb.source_kind, pb.status, pb.created_by,
           pb.created_at, pb.committed_at,
           COUNT(pj.id) AS total_jobs,
           SUM(CASE WHEN pj.decision='approved' THEN 1 ELSE 0 END) AS approved,
           SUM(CASE WHEN pj.decision='skipped'  THEN 1 ELSE 0 END) AS skipped,
           SUM(CASE WHEN pj.decision='pending'  THEN 1 ELSE 0 END) AS pending
      FROM planner_batches pb
      LEFT JOIN planner_jobs pj ON pj.batch_id = pb.id
     GROUP BY pb.id
     ORDER BY pb.created_at DESC
     LIMIT 30
  `).all<any>()

  const batchRows = (recent.results || []).map((b: any) => {
    const statusColor = b.status === 'committed' ? '#34d399' : '#fcd34d'
    const statusBg    = b.status === 'committed' ? 'rgba(16,185,129,0.18)' : 'rgba(245,158,11,0.18)'
    const statusLbl   = b.status === 'committed' ? '✅ committed' : '🟡 open'
    return `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:10px 8px;font-weight:700"><a href="/field/admin/planner-extractor?batch=${b.id}">Batch #${b.id}</a></td>
      <td style="padding:10px 8px;color:var(--muted);font-size:13px">${fmtDate(b.created_at)}</td>
      <td style="padding:10px 8px">${esc(b.source_filename || (b.source_kind === 'paste' ? 'pasted text' : 'file'))}</td>
      <td style="padding:10px 8px;font-size:13px">${esc(b.created_by || '')}</td>
      <td style="padding:10px 8px"><span style="padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700;background:${statusBg};color:${statusColor}">${statusLbl}</span></td>
      <td style="padding:10px 8px;font-size:13px">${b.total_jobs} jobs · ${b.approved||0} ✅ · ${b.skipped||0} ❌ · ${b.pending||0} ⏳</td>
    </tr>`
  }).join('') || '<tr><td colspan="6" style="padding:20px;text-align:center;color:var(--muted)">No batches yet — paste a schedule below to start.</td></tr>'

  const body = `
  <div class="field-wrap">
    <div class="field-header">
      <div class="field-brand">B&amp;W PRODUCTIONS</div>
      <div class="field-tagline">Planning Calendar Extractor</div>
      <div class="field-form-title">📋 Planning Calendar Extractor</div>
      <div style="font-size:12px;color:var(--muted);margin-top:6px">Logged in as ${esc(admin)}</div>
    </div>

    <div style="background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.3);border-radius:12px;padding:14px 16px;margin-bottom:16px">
      <div style="font-size:13px;color:#93c5fd;line-height:1.6">
        <strong>How it works:</strong> Paste a chunk of your planning sheet below (copy rows from Excel — date headers + sub-rows). Click <strong>Extract</strong> and the system splits it into candidate delivery jobs. Walk through each card, edit if needed, mark approve / skip, then click <strong>Commit Batch</strong> to create drafts. Edits are remembered for future parses.
      </div>
    </div>

    <div class="section">
      <div class="section-title">Paste Schedule Text</div>
      <textarea id="rawText" rows="10" placeholder="Paste rows from your planning Excel sheet here. Each row is one line. Use Tab to separate columns (Excel does this automatically when you copy a range)." style="width:100%;background:var(--card);border:1px solid var(--border);border-radius:10px;padding:12px 14px;color:var(--white);font-size:13px;font-family:ui-monospace,monospace;line-height:1.5;resize:vertical"></textarea>
    </div>

    <div style="display:flex;gap:10px;margin:16px 0">
      <button onclick="doExtract()" id="extractBtn" style="flex:1;padding:14px;border-radius:12px;border:none;background:linear-gradient(135deg,#1d4ed8,#3b82f6);color:#fff;font-size:15px;font-weight:800;cursor:pointer">⚡ Extract Jobs</button>
      <button onclick="document.getElementById('rawText').value=''" type="button" style="padding:14px 20px;border-radius:12px;border:1px solid var(--border);background:transparent;color:var(--muted);font-size:14px;cursor:pointer">Clear</button>
    </div>

    <div class="section">
      <div class="section-title">Recent Batches</div>
      <div style="background:var(--card);border:1px solid var(--border);border-radius:10px;overflow:hidden">
        <table style="font-size:14px"><thead style="background:rgba(255,255,255,0.04)"><tr>
          <th style="padding:10px 8px;text-align:left;color:var(--muted);font-size:11px;text-transform:uppercase">Batch</th>
          <th style="padding:10px 8px;text-align:left;color:var(--muted);font-size:11px;text-transform:uppercase">Created</th>
          <th style="padding:10px 8px;text-align:left;color:var(--muted);font-size:11px;text-transform:uppercase">Source</th>
          <th style="padding:10px 8px;text-align:left;color:var(--muted);font-size:11px;text-transform:uppercase">By</th>
          <th style="padding:10px 8px;text-align:left;color:var(--muted);font-size:11px;text-transform:uppercase">Status</th>
          <th style="padding:10px 8px;text-align:left;color:var(--muted);font-size:11px;text-transform:uppercase">Progress</th>
        </tr></thead><tbody>${batchRows}</tbody></table>
      </div>
    </div>

    <div style="margin-top:24px;text-align:center"><a href="/field/admin" style="color:var(--muted);font-size:13px;text-decoration:none">← Back to Admin</a></div>
  </div>

  <script>
  async function doExtract() {
    var raw = document.getElementById('rawText').value.trim()
    if (!raw) { alert('Paste some schedule text first'); return }
    var btn = document.getElementById('extractBtn')
    btn.disabled = true; btn.textContent = '⏳ Parsing...'
    try {
      var res = await fetch('/field/admin/planner-extractor/parse', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ raw_text: raw }) })
      var data = await res.json()
      if (data.success) window.location.href = '/field/admin/planner-extractor?batch=' + data.batch_id
      else { alert('Parse failed: ' + (data.error||'unknown')); btn.disabled = false; btn.textContent = '⚡ Extract Jobs' }
    } catch(e) { alert('Network error: '+e.message); btn.disabled = false; btn.textContent = '⚡ Extract Jobs' }
  }
  </script>`
  return c.html(pageShell('Planning Calendar Extractor', body))
}

async function renderBatchPage(c: any, batchId: number, admin: string) {
  const batch = await c.env.DB.prepare(`SELECT * FROM planner_batches WHERE id=?`).bind(batchId).first<any>()
  if (!batch) {
    return c.html(pageShell('Batch not found', `<div class="field-wrap"><p style="color:var(--muted)">Batch #${batchId} not found.</p><a href="/field/admin/planner-extractor">← Back</a></div>`))
  }
  const jobsRes = await c.env.DB.prepare(`SELECT * FROM planner_jobs WHERE batch_id=? ORDER BY job_index`).bind(batchId).all<any>()
  const jobList = jobsRes.results || []
  const counts = {
    total: jobList.length,
    approved: jobList.filter((j: any) => j.decision === 'approved' || j.decision === 'edited').length,
    skipped:  jobList.filter((j: any) => j.decision === 'skipped').length,
    pending:  jobList.filter((j: any) => j.decision === 'pending').length,
  }
  const isCommitted = batch.status === 'committed'

  const cardHtml = jobList.map((j: any, idx: number) => buildJobCard(j, idx, isCommitted)).join('')
    || '<div style="text-align:center;padding:40px;color:var(--muted)">No jobs detected in this batch.</div>'

  const commitBlock = isCommitted
    ? `<div style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:12px;padding:14px;text-align:center;color:#34d399;font-weight:700">✅ Batch committed on ${fmtDate(batch.committed_at)}</div>`
    : `<div style="position:sticky;bottom:0;background:var(--bg);padding:14px 0;border-top:1px solid var(--border);margin-top:14px;z-index:5">
        <button onclick="commitBatch()" id="commitBtn" style="width:100%;padding:16px;border-radius:12px;border:none;background:linear-gradient(135deg,#10b981,#059669);color:#fff;font-size:16px;font-weight:800;cursor:pointer">🚀 Commit Batch — Create ${counts.approved} Draft${counts.approved === 1 ? '' : 's'}</button>
        ${counts.pending > 0 ? `<div style="text-align:center;font-size:12px;color:#fcd34d;margin-top:8px">⏳ ${counts.pending} job(s) still pending — they will be skipped on commit unless you decide</div>` : ''}
      </div>`

  const bulkBar = isCommitted ? '' : `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
      <button onclick="bulkAction('approve-green')" style="padding:8px 14px;border-radius:8px;border:1px solid rgba(16,185,129,0.4);background:rgba(16,185,129,0.1);color:#34d399;font-size:13px;font-weight:700;cursor:pointer">✅ Approve all 🟢 Green</button>
      <button onclick="bulkAction('skip-red')" style="padding:8px 14px;border-radius:8px;border:1px solid rgba(239,68,68,0.4);background:rgba(239,68,68,0.1);color:#f87171;font-size:13px;font-weight:700;cursor:pointer">❌ Skip all 🔴 Red</button>
    </div>`

  const body = `
  <div class="field-wrap">
    <div class="field-header">
      <div class="field-brand">B&amp;W PRODUCTIONS</div>
      <div class="field-tagline">Planning Calendar Extractor — Batch #${batchId}</div>
    </div>

    <div style="background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:16px">
      <div style="display:flex;flex-wrap:wrap;gap:14px;align-items:center;font-size:13px">
        <strong style="font-size:15px">Batch #${batchId}</strong>
        <span style="color:var(--muted)">${fmtDate(batch.created_at)}</span>
        <span style="color:var(--muted)">by ${esc(batch.created_by || '')}</span>
        <span style="margin-left:auto"><strong style="color:#34d399">${counts.approved} approved</strong> · <strong style="color:#f87171">${counts.skipped} skipped</strong> · <strong style="color:#fcd34d">${counts.pending} pending</strong> / ${counts.total} total</span>
      </div>
    </div>

    ${bulkBar}
    ${cardHtml}
    ${commitBlock}

    <div style="margin-top:18px;text-align:center"><a href="/field/admin/planner-extractor" style="color:var(--muted);font-size:13px;text-decoration:none">← Back to Extractor</a></div>
  </div>

  <script>
  var BATCH_ID = ${batchId}
  async function setDecision(jobId, decision) {
    try {
      var res = await fetch('/field/admin/planner-extractor/decide', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ job_id: jobId, decision: decision }) })
      var data = await res.json()
      if (data.success) location.reload(); else alert('Failed: '+(data.error||'unknown'))
    } catch(e) { alert('Network error: '+e.message) }
  }
  async function bulkAction(action) {
    if (!confirm('Apply "'+action+'" to all matching jobs?')) return
    try {
      var res = await fetch('/field/admin/planner-extractor/bulk', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ batch_id: BATCH_ID, action: action }) })
      var data = await res.json()
      if (data.success) location.reload(); else alert('Failed: '+(data.error||'unknown'))
    } catch(e) { alert('Network error: '+e.message) }
  }
  async function commitBatch() {
    if (!confirm('Commit this batch? This will create drafts for all approved jobs. Pending jobs will be skipped.')) return
    var btn = document.getElementById('commitBtn'); btn.disabled = true; btn.textContent = '⏳ Creating drafts...'
    try {
      var res = await fetch('/field/admin/planner-extractor/commit', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ batch_id: BATCH_ID }) })
      var data = await res.json()
      if (data.success) { alert('✅ Created '+data.created+' draft(s). Form numbers: '+(data.form_numbers||[]).join(', ')); location.reload() }
      else { alert('Commit failed: '+(data.error||'unknown')); btn.disabled=false; btn.textContent='🚀 Commit Batch' }
    } catch(e) { alert('Network error: '+e.message); btn.disabled=false; btn.textContent='🚀 Commit Batch' }
  }
  function openEdit(jobId) {
    fetch('/field/admin/planner-extractor/job/'+jobId).then(function(r){return r.json()}).then(function(data){
      if (!data.success) { alert(data.error); return }
      var j = data.job
      var fields = ['event_name','venue','venue_address','brand','delivery_date','collection_date','attention','contact_number','driver','vehicle_reg','notes']
      var labels = { event_name:'Event Name', venue:'Venue', venue_address:'Venue Address', brand:'Brand', delivery_date:'Delivery Date', collection_date:'Collection Date (Strike)', attention:'Attention / Contact Name', contact_number:'Contact Number', driver:'Driver', vehicle_reg:'Vehicle Reg', notes:'Notes' }
      var html = '<div style="position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100;display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto" id="editModal">'
      html += '<div style="background:#1a1d2e;border:1px solid #333;border-radius:14px;padding:24px;max-width:600px;width:100%;max-height:90vh;overflow:auto">'
      html += '<h3 style="margin:0 0 16px 0;color:#fff">✏️ Edit Job '+jobId+'</h3>'
      for (var i=0;i<fields.length;i++) {
        var f = fields[i]; var typ = (f==='delivery_date'||f==='collection_date')?'date':'text'
        var val = (j[f]||'').toString().replace(/"/g,'&quot;')
        html += '<div style="margin-bottom:10px"><label style="display:block;font-size:11px;color:#888;margin-bottom:3px;text-transform:uppercase">'+labels[f]+'</label>'
        if (f==='notes') html += '<textarea name="'+f+'" rows="3" style="width:100%;background:#0f1117;border:1px solid #333;color:#fff;padding:8px;border-radius:6px">'+(j[f]||'')+'</textarea>'
        else html += '<input name="'+f+'" type="'+typ+'" value="'+val+'" style="width:100%;background:#0f1117;border:1px solid #333;color:#fff;padding:8px;border-radius:6px">'
        html += '</div>'
      }
      html += '<div style="display:flex;gap:8px;margin-top:14px"><button onclick="saveEdit('+jobId+')" style="flex:1;padding:12px;background:#10b981;color:#fff;border:none;border-radius:8px;font-weight:800;cursor:pointer">💾 Save</button><button onclick="document.getElementById(\\'editModal\\').remove()" style="flex:1;padding:12px;background:transparent;color:#fff;border:1px solid #333;border-radius:8px;cursor:pointer">Cancel</button></div></div></div>'
      document.body.insertAdjacentHTML('beforeend', html)
    })
  }
  async function saveEdit(jobId) {
    var modal = document.getElementById('editModal'); var data = { job_id: jobId }
    var inputs = modal.querySelectorAll('[name]')
    for (var i=0;i<inputs.length;i++) data[inputs[i].name] = inputs[i].value
    try {
      var res = await fetch('/field/admin/planner-extractor/edit', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) })
      var rj = await res.json()
      if (rj.success) location.reload(); else alert('Save failed: '+(rj.error||'unknown'))
    } catch(e) { alert('Network error: '+e.message) }
  }
  </script>`
  return c.html(pageShell('Batch #' + batchId, body))
}

function buildJobCard(j: any, idx: number, isCommitted: boolean): string {
  const items = (() => { try { return JSON.parse(j.items_json || '[]') } catch { return [] } })()
  const flags = (() => { try { return JSON.parse(j.flags_json || '[]') } catch { return [] } })()
  const conf = j.confidence || 'amber'
  const confColor = conf === 'green' ? '#10b981' : conf === 'red' ? '#ef4444' : '#f59e0b'
  const confIcon  = conf === 'green' ? '🟢' : conf === 'red' ? '🔴' : '🟡'
  const decBadge = j.decision === 'approved' || j.decision === 'edited'
    ? '<span style="padding:3px 10px;border-radius:6px;font-size:11px;font-weight:800;background:rgba(16,185,129,0.2);color:#34d399">✅ APPROVED</span>'
    : j.decision === 'skipped'
      ? '<span style="padding:3px 10px;border-radius:6px;font-size:11px;font-weight:800;background:rgba(239,68,68,0.2);color:#f87171">❌ SKIPPED</span>'
      : '<span style="padding:3px 10px;border-radius:6px;font-size:11px;font-weight:800;background:rgba(245,158,11,0.2);color:#fcd34d">⏳ PENDING</span>'

  const itemsHtml = items.length > 0
    ? items.map((it: any) => `<li>${esc(it.item)} × ${it.qty}</li>`).join('')
    : '<li style="color:var(--muted)">— no items detected —</li>'

  const flagsHtml = flags.length > 0
    ? `<div style="margin-top:8px;padding:8px 10px;background:rgba(245,158,11,0.08);border-left:3px solid #f59e0b;border-radius:4px;font-size:12px;color:#fcd34d">⚠ ${flags.map((f: string) => esc(f)).join(' · ')}</div>`
    : ''

  const submissionLink = j.submission_id
    ? `<div style="margin-top:8px;font-size:12px;color:#34d399">✅ Created as draft — <a href="/field/delivery/open/${j.submission_id}" style="color:#34d399">open it</a></div>`
    : ''

  const isApproved = (j.decision === 'approved' || j.decision === 'edited')
  const isSkipped = j.decision === 'skipped'
  const actionButtons = isCommitted ? '' : `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
      <button onclick="setDecision(${j.id},'approved')" style="flex:1;min-width:100px;padding:10px 12px;border-radius:8px;border:none;background:${isApproved?'#10b981':'rgba(16,185,129,0.2)'};color:${isApproved?'#fff':'#34d399'};font-weight:700;cursor:pointer;font-size:13px">✅ Approve</button>
      <button onclick="openEdit(${j.id})" style="flex:1;min-width:100px;padding:10px 12px;border-radius:8px;border:1px solid var(--border);background:transparent;color:var(--white);font-weight:700;cursor:pointer;font-size:13px">✏️ Edit</button>
      <button onclick="setDecision(${j.id},'skipped')" style="flex:1;min-width:100px;padding:10px 12px;border-radius:8px;border:none;background:${isSkipped?'#ef4444':'rgba(239,68,68,0.2)'};color:${isSkipped?'#fff':'#f87171'};font-weight:700;cursor:pointer;font-size:13px">❌ Skip</button>
    </div>`

  return `
  <div id="job-${j.id}" style="background:var(--card);border:1px solid var(--border);border-left:4px solid ${confColor};border-radius:10px;padding:16px;margin-bottom:14px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
      <div style="font-size:16px;font-weight:800">${confIcon} Job ${idx + 1} <span style="color:var(--muted);font-weight:400;margin-left:6px;font-size:13px">(${esc(j.source_rows || '')})</span></div>
      ${decBadge}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:6px 14px;font-size:13px">
      <div><span style="color:var(--muted)">Event:</span> <strong>${esc(j.event_name || '—')}</strong></div>
      <div><span style="color:var(--muted)">Venue:</span> <strong>${esc(j.venue || '—')}</strong></div>
      <div><span style="color:var(--muted)">Brand:</span> <strong>${esc(j.brand || '—')}</strong></div>
      <div><span style="color:var(--muted)">Form:</span> <strong>${j.form_type === 'collection' ? '🔄 Collection' : '📦 Delivery'}</strong></div>
      <div><span style="color:var(--muted)">Date:</span> <strong>${fmtDate(j.delivery_date) || '—'}</strong></div>
      ${j.collection_date ? `<div><span style="color:var(--muted)">Strike:</span> <strong>${fmtDate(j.collection_date)}</strong></div>` : ''}
      ${j.venue_address ? `<div style="grid-column:1/-1"><span style="color:var(--muted)">Address:</span> ${esc(j.venue_address)}</div>` : ''}
      ${j.attention || j.contact_number ? `<div style="grid-column:1/-1"><span style="color:var(--muted)">Contact:</span> ${esc(j.attention || '')}${j.contact_number ? ' · ' + esc(j.contact_number) : ''}</div>` : ''}
    </div>
    <details style="margin-top:10px"><summary style="cursor:pointer;color:#93c5fd;font-size:13px;font-weight:700">📦 ${items.length} item(s) detected</summary><ul style="margin:8px 0 0 20px;font-size:13px;line-height:1.7">${itemsHtml}</ul></details>
    <details style="margin-top:6px"><summary style="cursor:pointer;color:var(--muted);font-size:12px">📄 Raw source text</summary><pre style="margin:6px 0 0 0;padding:8px 10px;background:rgba(0,0,0,0.2);border-radius:4px;font-size:11px;color:var(--muted);white-space:pre-wrap;word-break:break-word">${esc(j.raw_text || '')}</pre></details>
    ${flagsHtml}${submissionLink}${actionButtons}
  </div>`
}

// POST /parse — runs the parser, creates a batch
app.post('/parse', async (c) => {
  const admin = await getAdminSession(c)
  if (!admin) return c.json({ success: false, error: 'Not logged in' }, 401)

  let body: any
  try { body = await c.req.json() } catch { return c.json({ success: false, error: 'Bad JSON' }, 400) }
  const rawText: string = (body.raw_text || '').toString()
  if (!rawText.trim()) return c.json({ success: false, error: 'Empty input' }, 400)

  const rows = rawTextToRows(rawText)
  let jobs: ParsedJob[] = []
  try { jobs = parsePlannerRows(rows) } catch (e: any) { return c.json({ success: false, error: 'Parser error: ' + e.message }, 500) }

  for (const j of jobs) {
    if (j.event_name) j.event_name = await applyCorrections(c.env.DB, 'event_name', j.event_name)
    if (j.venue)      j.venue      = await applyCorrections(c.env.DB, 'venue', j.venue)
    if (j.brand)      j.brand      = await applyCorrections(c.env.DB, 'brand', j.brand)
  }

  const batchIns = await c.env.DB.prepare(`
    INSERT INTO planner_batches (source_kind, raw_text, parsed_jobs_json, created_by)
    VALUES ('paste', ?, ?, ?)
  `).bind(rawText.slice(0, 50000), JSON.stringify(jobs).slice(0, 100000), admin).run()
  const batchId = batchIns.meta.last_row_id as number

  for (const j of jobs) {
    await c.env.DB.prepare(`
      INSERT INTO planner_jobs
        (batch_id, job_index, decision, confidence, event_name, venue, venue_address,
         brand, client, delivery_date, collection_date, attention, contact_number,
         driver, vehicle_reg, prepared_by, notes, items_json, source_rows, raw_text, flags_json)
      VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      batchId, j.job_index, j.confidence,
      j.event_name, j.venue, j.venue_address,
      j.brand, j.client, j.delivery_date, j.collection_date,
      j.attention, j.contact_number,
      j.driver, j.vehicle_reg, j.prepared_by, j.notes,
      JSON.stringify(j.items),
      j.source_rows, j.raw_text,
      JSON.stringify(j.flags)
    ).run()
  }

  return c.json({ success: true, batch_id: batchId, jobs_count: jobs.length })
})

// POST /decide
app.post('/decide', async (c) => {
  const admin = await getAdminSession(c)
  if (!admin) return c.json({ success: false, error: 'Not logged in' }, 401)
  let body: any
  try { body = await c.req.json() } catch { return c.json({ success: false, error: 'Bad JSON' }, 400) }
  const jobId = parseInt(body.job_id, 10)
  const decision = (body.decision || '').toString()
  if (!['approved','skipped','pending'].includes(decision)) return c.json({ success: false, error: 'Bad decision' }, 400)
  await c.env.DB.prepare(`UPDATE planner_jobs SET decision=? WHERE id=?`).bind(decision, jobId).run()
  return c.json({ success: true })
})

// POST /edit
app.post('/edit', async (c) => {
  const admin = await getAdminSession(c)
  if (!admin) return c.json({ success: false, error: 'Not logged in' }, 401)
  let body: any
  try { body = await c.req.json() } catch { return c.json({ success: false, error: 'Bad JSON' }, 400) }
  const jobId = parseInt(body.job_id, 10)
  if (!jobId) return c.json({ success: false, error: 'Missing job_id' }, 400)

  const before = await c.env.DB.prepare(`SELECT * FROM planner_jobs WHERE id=?`).bind(jobId).first<any>()
  if (!before) return c.json({ success: false, error: 'Job not found' }, 404)

  const editable = ['event_name','venue','venue_address','brand','delivery_date','collection_date','attention','contact_number','driver','vehicle_reg','notes']
  const updates: string[] = []
  const vals: any[] = []
  for (const f of editable) {
    if (body[f] !== undefined) { updates.push(`${f}=?`); vals.push((body[f] || '').toString().slice(0, 500)) }
  }
  if (updates.length === 0) return c.json({ success: false, error: 'No changes' }, 400)
  updates.push(`decision='edited'`)
  vals.push(jobId)
  await c.env.DB.prepare(`UPDATE planner_jobs SET ${updates.join(', ')} WHERE id=?`).bind(...vals).run()

  for (const f of ['event_name','venue','brand']) {
    if (body[f] && before[f] && body[f] !== before[f]) {
      await recordCorrection(c.env.DB, f, before[f], body[f])
    }
  }
  return c.json({ success: true })
})

// GET /job/:id
app.get('/job/:id', async (c) => {
  const admin = await getAdminSession(c)
  if (!admin) return c.json({ success: false, error: 'Not logged in' }, 401)
  const id = parseInt(c.req.param('id'), 10)
  const job = await c.env.DB.prepare(`SELECT * FROM planner_jobs WHERE id=?`).bind(id).first<any>()
  if (!job) return c.json({ success: false, error: 'Not found' }, 404)
  return c.json({ success: true, job })
})

// POST /bulk
app.post('/bulk', async (c) => {
  const admin = await getAdminSession(c)
  if (!admin) return c.json({ success: false, error: 'Not logged in' }, 401)
  let body: any
  try { body = await c.req.json() } catch { return c.json({ success: false, error: 'Bad JSON' }, 400) }
  const batchId = parseInt(body.batch_id, 10)
  const action = (body.action || '').toString()
  if (action === 'approve-green') {
    await c.env.DB.prepare(`UPDATE planner_jobs SET decision='approved' WHERE batch_id=? AND confidence='green' AND decision='pending'`).bind(batchId).run()
  } else if (action === 'skip-red') {
    await c.env.DB.prepare(`UPDATE planner_jobs SET decision='skipped' WHERE batch_id=? AND confidence='red' AND decision='pending'`).bind(batchId).run()
  } else {
    return c.json({ success: false, error: 'Unknown action' }, 400)
  }
  return c.json({ success: true })
})

// POST /commit — turn approved jobs into draft submissions
app.post('/commit', async (c) => {
  const admin = await getAdminSession(c)
  if (!admin) return c.json({ success: false, error: 'Not logged in' }, 401)
  let body: any
  try { body = await c.req.json() } catch { return c.json({ success: false, error: 'Bad JSON' }, 400) }
  const batchId = parseInt(body.batch_id, 10)
  if (!batchId) return c.json({ success: false, error: 'Missing batch_id' }, 400)

  const batch = await c.env.DB.prepare(`SELECT * FROM planner_batches WHERE id=?`).bind(batchId).first<any>()
  if (!batch) return c.json({ success: false, error: 'Batch not found' }, 404)
  if (batch.status === 'committed') return c.json({ success: false, error: 'Already committed' }, 400)

  const jobsRes = await c.env.DB.prepare(`SELECT * FROM planner_jobs WHERE batch_id=? AND decision IN ('approved','edited')`).bind(batchId).all<any>()
  const approvedJobs = jobsRes.results || []

  const formNumbers: string[] = []
  let created = 0

  for (const j of approvedJobs) {
    const formType = (j.form_type === 'collection') ? 'collection' : 'delivery'
    const counter = await c.env.DB.prepare(`SELECT last_number FROM field_counters WHERE form_type=?`).bind(formType).first<any>()
    const next = (counter?.last_number || 0) + 1
    await c.env.DB.prepare(`UPDATE field_counters SET last_number=? WHERE form_type=?`).bind(next, formType).run()
    const yr = (j.delivery_date || '').slice(2,4) || '26'
    const prefix = formType === 'collection' ? 'CN' : 'DN'
    const formNumber = `${prefix}${yr}-${String(next).padStart(4, '0')}`

    const itemsArr = (() => { try { return JSON.parse(j.items_json || '[]') } catch { return [] } })()
    const formData = {
      event_name: j.event_name, venue: j.venue, venue_address: j.venue_address,
      brand: j.brand, client: j.client || 'South African Breweries',
      attention: j.attention, contact_number: j.contact_number,
      delivery_date: j.delivery_date, collection_date: j.collection_date,
      driver: j.driver, vehicle_reg: j.vehicle_reg,
      notes: j.notes, prepared_by: admin,
      line_items: itemsArr,
      from_planner_batch: batchId, from_planner_job: j.id
    }

    const isSAB = (j.client || '').toLowerCase().includes('breweries') || (j.brand || '').toLowerCase().includes('castle') || (j.brand || '').toLowerCase().includes('hansa') || (j.brand || '').toLowerCase().includes('flying fish')
    const ins = await c.env.DB.prepare(`
      INSERT INTO field_submissions
        (form_type, form_number, prepared_by, driver, vehicle_reg, client, brand,
         venue, event_name, address, attention, contact_number,
         delivery_date, collection_date, notes, form_data, letterhead)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      formType, formNumber, admin, j.driver || '', j.vehicle_reg || '',
      j.client || 'South African Breweries', j.brand || '',
      j.venue || '', j.event_name || '', j.venue_address || '',
      j.attention || '', j.contact_number || '',
      j.delivery_date || '', j.collection_date || '',
      j.notes || '', JSON.stringify(formData),
      isSAB ? 'sab' : 'bw'
    ).run()
    const subId = ins.meta.last_row_id as number

    let order = 0
    for (const it of itemsArr) {
      await c.env.DB.prepare(`
        INSERT INTO field_line_items (submission_id, item_name, quantity, brand, condition, sort_order)
        VALUES (?, ?, ?, ?, 'Pre-loaded', ?)
      `).bind(subId, it.item, it.qty || 1, j.brand || '', order++).run()
    }
    await c.env.DB.prepare(`UPDATE planner_jobs SET submission_id=? WHERE id=?`).bind(subId, j.id).run()
    formNumbers.push(formNumber)
    created++
  }

  await c.env.DB.prepare(`UPDATE planner_jobs SET decision='skipped', skip_reason='auto-skip on commit' WHERE batch_id=? AND decision='pending'`).bind(batchId).run()
  await c.env.DB.prepare(`UPDATE planner_batches SET status='committed', committed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(batchId).run()

  return c.json({ success: true, created, form_numbers: formNumbers })
})

export default app
