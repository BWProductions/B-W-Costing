// B&W Productions — Master Products Admin
// /field/admin/products — Two-tab page (Catalogue + Suggestion Queue)
// CRUD, bulk actions, fuzzy matching, alias management, triage workflow.

import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth.js'
import { layout } from '../lib/layout.js'
import { findMatches, findMatchesWithLexicon, normalise, score, shouldEscalateToLLM, THRESHOLDS, loadLexicon, lexiconHealth } from '../lib/fuzzy.js'

type Env = { Bindings: { DB: D1Database; ANTHROPIC_API_KEY?: string } }
const app = new Hono<Env>()

function esc(s: any): string {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
}

const CATEGORIES = [
  'Umbrellas','Furniture','Structures','Bar','Cold Storage','Branding & Signage',
  'Lighting & AV','Crowd Control','Power','Activations & Games','Logistics','Other'
]

// ─── Helper: load full catalogue with aliases for fuzzy matching ────────────
async function loadCatalogue(db: D1Database) {
  const items = await db.prepare(
    'SELECT id, name, category FROM field_items WHERE active=1 ORDER BY name'
  ).all<any>()
  const aliases = await db.prepare(
    'SELECT item_id, alias_text FROM field_item_aliases WHERE active=1'
  ).all<any>()
  const aliasMap: Record<number, string[]> = {}
  for (const a of (aliases.results || [])) {
    if (!aliasMap[a.item_id]) aliasMap[a.item_id] = []
    aliasMap[a.item_id].push(a.alias_text)
  }
  return (items.results || []).map((it: any) => ({
    id: it.id, name: it.name, category: it.category,
    aliases: aliasMap[it.id] || []
  }))
}

// ============================================================================
//  MAIN PAGE  /field/admin/products
// ============================================================================
app.get('/', requireAuth, async (c) => {
  const user = c.get('user' as any) as any
  const tab = c.req.query('tab') || 'catalogue'
  const catFilter = c.req.query('cat') || ''
  const search = (c.req.query('q') || '').trim()

  // Stats
  const stats = await c.env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM field_items WHERE active=1) as cat_active,
      (SELECT COUNT(*) FROM field_items WHERE active=0) as cat_inactive,
      (SELECT COUNT(*) FROM field_suggested_items WHERE status='pending') as pending,
      (SELECT COUNT(*) FROM field_suggested_items WHERE status='merged') as merged,
      (SELECT COUNT(*) FROM field_suggested_items WHERE status='created') as created,
      (SELECT COUNT(*) FROM field_suggested_items WHERE status='ignored') as ignored,
      (SELECT COUNT(*) FROM field_item_aliases WHERE active=1) as alias_count
  `).first<any>() || {}

  // ── CATALOGUE TAB ──
  let catalogueHTML = ''
  if (tab === 'catalogue') {
    const where: string[] = ['1=1']
    const binds: any[] = []
    if (catFilter) { where.push('category=?'); binds.push(catFilter) }
    if (search) {
      where.push('(LOWER(name) LIKE ? OR id IN (SELECT item_id FROM field_item_aliases WHERE LOWER(alias_text) LIKE ?))')
      binds.push('%' + search.toLowerCase() + '%', '%' + search.toLowerCase() + '%')
    }
    const items = await c.env.DB.prepare(
      `SELECT id, category, name, active FROM field_items WHERE ${where.join(' AND ')} ORDER BY category, name LIMIT 500`
    ).bind(...binds).all<any>()

    // Pull alias counts in one go
    const aliasCounts = await c.env.DB.prepare(
      `SELECT item_id, COUNT(*) as n FROM field_item_aliases WHERE active=1 GROUP BY item_id`
    ).all<any>()
    const aliasN: Record<number, number> = {}
    for (const r of (aliasCounts.results || [])) aliasN[r.item_id] = r.n

    const rows = (items.results || []).map((it: any) => `
      <tr data-id="${it.id}">
        <td style="width:36px;text-align:center"><input type="checkbox" class="row-check" value="${it.id}"></td>
        <td style="font-size:11.5px;color:#94a3b8;white-space:nowrap">${esc(it.category)}</td>
        <td><strong style="color:#fff">${esc(it.name)}</strong></td>
        <td style="text-align:center"><span style="display:inline-block;min-width:24px;padding:2px 8px;border-radius:10px;background:rgba(59,130,246,0.15);color:#93c5fd;font-size:11px;font-weight:700">${aliasN[it.id] || 0}</span></td>
        <td style="text-align:center"><span style="display:inline-block;padding:2px 8px;border-radius:4px;background:${it.active?'rgba(16,185,129,0.15)':'rgba(239,68,68,0.15)'};color:${it.active?'#6ee7b7':'#fca5a5'};font-size:11px;font-weight:700">${it.active?'ACTIVE':'INACTIVE'}</span></td>
        <td style="text-align:right;white-space:nowrap">
          <button class="btn-row" onclick="editItem(${it.id}, ${JSON.stringify(it.name).replace(/"/g,'&quot;')}, ${JSON.stringify(it.category).replace(/"/g,'&quot;')})">✏️ Edit</button>
          <button class="btn-row" onclick="viewAliases(${it.id})">🏷️ Aliases</button>
        </td>
      </tr>`).join('')

    const catOptions = ['<option value="">All categories</option>',
      ...CATEGORIES.map(c2 => `<option value="${esc(c2)}" ${catFilter===c2?'selected':''}>${esc(c2)}</option>`)].join('')

    catalogueHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin-bottom:18px;padding:14px;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:10px">
        <form method="GET" style="display:flex;gap:10px;flex-wrap:wrap;flex:1">
          <input type="hidden" name="tab" value="catalogue">
          <div style="display:flex;flex-direction:column;gap:4px;flex:1;min-width:200px">
            <label style="font-size:11px;color:var(--muted);text-transform:uppercase">Search name or alias</label>
            <input type="text" name="q" value="${esc(search)}" placeholder="e.g. jojo, banner, vacuum"
                   style="padding:8px 10px;border-radius:6px;border:1px solid var(--border);background:rgba(0,0,0,0.3);color:#fff">
          </div>
          <div style="display:flex;flex-direction:column;gap:4px">
            <label style="font-size:11px;color:var(--muted);text-transform:uppercase">Category</label>
            <select name="cat" style="padding:8px 10px;border-radius:6px;border:1px solid var(--border);background:rgba(0,0,0,0.3);color:#fff">${catOptions}</select>
          </div>
          <button type="submit" style="padding:8px 16px;border-radius:6px;background:#2563eb;color:#fff;border:none;font-weight:700;cursor:pointer">Filter</button>
        </form>
        <button onclick="openAddDialog()" style="padding:8px 16px;border-radius:6px;background:#16a34a;color:#fff;border:none;font-weight:700;cursor:pointer">+ Add Product</button>
        <button onclick="openBulkAddDialog()" style="padding:8px 16px;border-radius:6px;background:#7c3aed;color:#fff;border:none;font-weight:700;cursor:pointer">📋 Bulk Add</button>
      </div>

      <!-- Sticky bulk action bar (appears when ≥1 selected) -->
      <div id="bulkBar" style="display:none;position:sticky;top:0;z-index:10;background:linear-gradient(135deg,#1e3a5f,#2563eb);border-radius:10px;padding:12px 16px;margin-bottom:14px;box-shadow:0 4px 12px rgba(0,0,0,0.4);align-items:center;gap:12px;flex-wrap:wrap">
        <strong id="bulkCount" style="color:#fff;font-size:14px">0 selected</strong>
        <button onclick="bulkAction('recategorise')" style="padding:6px 12px;border-radius:6px;background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.3);font-weight:600;cursor:pointer">🏷️ Recategorise</button>
        <button onclick="bulkAction('merge')" style="padding:6px 12px;border-radius:6px;background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.3);font-weight:600;cursor:pointer">🔀 Merge…</button>
        <button onclick="bulkAction('deactivate')" style="padding:6px 12px;border-radius:6px;background:rgba(245,158,11,0.25);color:#fcd34d;border:1px solid rgba(245,158,11,0.5);font-weight:600;cursor:pointer">💤 Deactivate</button>
        <button onclick="bulkAction('activate')" style="padding:6px 12px;border-radius:6px;background:rgba(16,185,129,0.25);color:#6ee7b7;border:1px solid rgba(16,185,129,0.5);font-weight:600;cursor:pointer">✅ Activate</button>
        <button onclick="bulkAction('delete')" style="padding:6px 12px;border-radius:6px;background:rgba(239,68,68,0.25);color:#fca5a5;border:1px solid rgba(239,68,68,0.5);font-weight:600;cursor:pointer">🗑️ Delete</button>
        <button onclick="clearSelection()" style="margin-left:auto;padding:6px 12px;border-radius:6px;background:transparent;color:#fff;border:1px solid rgba(255,255,255,0.3);font-weight:600;cursor:pointer">Clear</button>
      </div>

      <div style="overflow-x:auto;background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:10px">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead style="background:rgba(0,0,0,0.3);position:sticky;top:0">
            <tr>
              <th style="padding:10px 8px;text-align:center;width:36px"><input type="checkbox" id="masterCheck" onchange="toggleAll(this.checked)"></th>
              <th style="padding:10px 8px;text-align:left;color:var(--muted);font-size:11px;text-transform:uppercase">Category</th>
              <th style="padding:10px 8px;text-align:left;color:var(--muted);font-size:11px;text-transform:uppercase">Name</th>
              <th style="padding:10px 8px;text-align:center;color:var(--muted);font-size:11px;text-transform:uppercase">Aliases</th>
              <th style="padding:10px 8px;text-align:center;color:var(--muted);font-size:11px;text-transform:uppercase">Status</th>
              <th style="padding:10px 8px;text-align:right;color:var(--muted);font-size:11px;text-transform:uppercase">Actions</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="6" style="padding:40px;text-align:center;color:var(--muted)">No products found — try clearing filters.</td></tr>'}</tbody>
        </table>
      </div>
      <div style="margin-top:10px;font-size:12px;color:var(--muted)">Showing ${(items.results||[]).length} of ${stats.cat_active||0} active products</div>
    `
  }

  // ── SUGGESTION QUEUE TAB ──
  let queueHTML = ''
  if (tab === 'queue') {
    const suggestions = await c.env.DB.prepare(`
      SELECT s.id, s.description, s.quantity, s.submission_id, s.status,
             s.matched_item_id, s.match_score, s.top_candidates, s.created_at,
             sub.form_number, sub.venue, sub.prepared_by
      FROM field_suggested_items s
      LEFT JOIN field_submissions sub ON sub.id = s.submission_id
      WHERE s.status = 'pending'
      ORDER BY s.id DESC
      LIMIT 200
    `).all<any>()

    const rows = (suggestions.results || []).map((s: any) => {
      let topCandidates: any[] = []
      try { topCandidates = JSON.parse(s.top_candidates || '[]') } catch {}
      const top = topCandidates[0]
      let verdictBadge = ''
      let topHTML = ''
      if (top) {
        const pct = Math.round((top.score || 0) * 100)
        let bg = '#6b7280', label = 'unscored'
        if (top.score >= THRESHOLDS.autoMerge) { bg = '#16a34a'; label = 'MATCH' }
        else if (top.score >= THRESHOLDS.ask) { bg = '#f59e0b'; label = 'POSSIBLE' }
        else { bg = '#475569'; label = 'NEW' }
        verdictBadge = `<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:${bg};color:#fff;font-size:10px;font-weight:700">${label} ${pct}%</span>`
        topHTML = `<div style="font-size:12px;color:#cbd5e1;margin-top:4px"><strong>Top:</strong> ${esc(top.name)} <span style="color:#94a3b8;font-size:11px">(${esc(top.reason||'')})</span></div>`
      } else {
        verdictBadge = '<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:#475569;color:#cbd5e1;font-size:10px;font-weight:700">NOT SCORED</span>'
      }

      return `
        <tr data-sid="${s.id}">
          <td style="width:36px;text-align:center;padding:10px 8px"><input type="checkbox" class="sug-check" value="${s.id}"></td>
          <td style="padding:10px 8px">
            <strong style="color:#fff;font-size:14px">${esc(s.description)}</strong>
            ${s.quantity > 1 ? `<span style="color:#94a3b8;font-size:12px"> (qty ${s.quantity})</span>` : ''}
            ${topHTML}
          </td>
          <td style="padding:10px 8px;text-align:center">${verdictBadge}</td>
          <td style="padding:10px 8px;font-size:11.5px;color:#94a3b8">
            ${esc(s.form_number || '—')}<br>
            <span style="font-size:10.5px">${esc(s.venue || '')}</span>
          </td>
          <td style="padding:10px 8px;text-align:right;white-space:nowrap">
            <button class="btn-row" onclick="triageSuggestion(${s.id})">⚖️ Triage</button>
          </td>
        </tr>`
    }).join('')

    queueHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:18px;padding:14px;background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.3);border-radius:10px">
        <div style="flex:1">
          <strong style="color:#fcd34d;font-size:15px">📥 ${stats.pending || 0} pending suggestions</strong>
          <div style="font-size:12px;color:#94a3b8;margin-top:2px">Items typed in "Other Items" on delivery notes. Triage to merge, create or ignore.</div>
        </div>
        <button onclick="rescoreAll()" style="padding:8px 14px;border-radius:6px;background:#2563eb;color:#fff;border:none;font-weight:700;cursor:pointer">🔄 Rescore All</button>
      </div>

      <!-- Sticky bulk action bar -->
      <div id="bulkBar" style="display:none;position:sticky;top:0;z-index:10;background:linear-gradient(135deg,#7c2d12,#f59e0b);border-radius:10px;padding:12px 16px;margin-bottom:14px;box-shadow:0 4px 12px rgba(0,0,0,0.4);align-items:center;gap:12px;flex-wrap:wrap">
        <strong id="bulkCount" style="color:#fff;font-size:14px">0 selected</strong>
        <button onclick="bulkSugAction('ignore')" style="padding:6px 12px;border-radius:6px;background:rgba(255,255,255,0.2);color:#fff;border:1px solid rgba(255,255,255,0.4);font-weight:600;cursor:pointer">🚫 Bulk Ignore</button>
        <button onclick="bulkSugAction('create')" style="padding:6px 12px;border-radius:6px;background:rgba(255,255,255,0.2);color:#fff;border:1px solid rgba(255,255,255,0.4);font-weight:600;cursor:pointer">➕ Bulk Create New</button>
        <button onclick="clearSelection()" style="margin-left:auto;padding:6px 12px;border-radius:6px;background:transparent;color:#fff;border:1px solid rgba(255,255,255,0.3);font-weight:600;cursor:pointer">Clear</button>
      </div>

      <div style="overflow-x:auto;background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:10px">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead style="background:rgba(0,0,0,0.3);position:sticky;top:0">
            <tr>
              <th style="padding:10px 8px;width:36px;text-align:center"><input type="checkbox" id="masterCheck" onchange="toggleAll(this.checked)"></th>
              <th style="padding:10px 8px;text-align:left;color:var(--muted);font-size:11px;text-transform:uppercase">Description</th>
              <th style="padding:10px 8px;text-align:center;color:var(--muted);font-size:11px;text-transform:uppercase">Verdict</th>
              <th style="padding:10px 8px;text-align:left;color:var(--muted);font-size:11px;text-transform:uppercase">Submission</th>
              <th style="padding:10px 8px;text-align:right;color:var(--muted);font-size:11px;text-transform:uppercase">Action</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="5" style="padding:40px;text-align:center;color:#6ee7b7">🎉 No pending suggestions — queue is clean!</td></tr>'}</tbody>
        </table>
      </div>
    `
  }

  const isCat = tab === 'catalogue'
  const tabBar = `
    <div style="display:flex;gap:4px;margin-bottom:18px;border-bottom:1px solid var(--border)">
      <a href="?tab=catalogue" style="padding:10px 18px;border-radius:8px 8px 0 0;text-decoration:none;color:${isCat?'#fff':'#94a3b8'};background:${isCat?'rgba(37,99,235,0.2)':'transparent'};font-weight:700;border-bottom:2px solid ${isCat?'#2563eb':'transparent'}">
        🧮 Master Catalogue <span style="font-size:11px;color:#94a3b8">(${stats.cat_active||0})</span>
      </a>
      <a href="?tab=queue" style="padding:10px 18px;border-radius:8px 8px 0 0;text-decoration:none;color:${!isCat?'#fff':'#94a3b8'};background:${!isCat?'rgba(245,158,11,0.2)':'transparent'};font-weight:700;border-bottom:2px solid ${!isCat?'#f59e0b':'transparent'}">
        📥 Suggestion Queue <span style="font-size:11px;color:${stats.pending>0?'#fcd34d':'#94a3b8'}">(${stats.pending||0})</span>
      </a>
    </div>
  `

  const styles = `
    <style>
      .btn-row { padding:5px 10px;margin-left:4px;border-radius:5px;background:rgba(255,255,255,0.06);color:#cbd5e1;border:1px solid rgba(255,255,255,0.12);font-size:12px;font-weight:600;cursor:pointer }
      .btn-row:hover { background:rgba(255,255,255,0.12) }
      .modal-overlay { display:none;position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:1000;align-items:center;justify-content:center;padding:20px }
      .modal-overlay.open { display:flex }
      .modal-card { background:#0f172a;border:1px solid var(--border);border-radius:12px;max-width:640px;width:100%;max-height:90vh;overflow:auto;padding:24px }
      .modal-card h3 { color:#fff;margin:0 0 14px;font-size:18px }
      .modal-card label { display:block;color:#94a3b8;font-size:11px;text-transform:uppercase;margin-bottom:4px;margin-top:10px }
      .modal-card input, .modal-card select, .modal-card textarea { width:100%;padding:10px 12px;border-radius:6px;border:1px solid var(--border);background:rgba(0,0,0,0.3);color:#fff;font-size:14px;box-sizing:border-box }
      .modal-card textarea { font-family:monospace;min-height:140px;resize:vertical }
      .modal-actions { display:flex;gap:10px;margin-top:18px;flex-wrap:wrap;justify-content:flex-end }
      .modal-actions button { padding:10px 18px;border-radius:6px;border:none;font-weight:700;cursor:pointer;font-size:14px }
      tbody tr:hover { background:rgba(255,255,255,0.03) }
      .candidate-card { background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:8px;display:flex;align-items:center;gap:12px }
      .candidate-card:hover { background:rgba(37,99,235,0.1);border-color:#2563eb }
      .score-pill { display:inline-block;min-width:50px;text-align:center;padding:3px 8px;border-radius:4px;font-weight:700;font-size:11px;color:#fff }
    </style>
  `

  const body = `
    ${styles}
    <div style="padding:24px;max-width:1280px;margin:0 auto">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:6px">
        <h1 style="color:#fff;margin:0;font-size:24px">🧮 Master Products</h1>
        <a href="/field/admin" style="color:#94a3b8;font-size:13px;text-decoration:none">← Back to Field Admin</a>
      </div>
      <p style="color:#94a3b8;margin:0 0 18px;font-size:13.5px">Canonical product catalogue with aliases · Fuzzy duplicate detection · Triage queue for new suggestions</p>

      <!-- Stats strip -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:18px">
        <div style="background:rgba(37,99,235,0.1);border:1px solid rgba(37,99,235,0.3);border-radius:8px;padding:10px 14px"><div style="font-size:11px;color:#93c5fd;text-transform:uppercase;font-weight:700">Active</div><div style="font-size:22px;font-weight:800;color:#fff">${stats.cat_active||0}</div></div>
        <div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:8px;padding:10px 14px"><div style="font-size:11px;color:#fcd34d;text-transform:uppercase;font-weight:700">Pending</div><div style="font-size:22px;font-weight:800;color:#fff">${stats.pending||0}</div></div>
        <div style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:8px;padding:10px 14px"><div style="font-size:11px;color:#6ee7b7;text-transform:uppercase;font-weight:700">Merged</div><div style="font-size:22px;font-weight:800;color:#fff">${stats.merged||0}</div></div>
        <div style="background:rgba(124,58,237,0.1);border:1px solid rgba(124,58,237,0.3);border-radius:8px;padding:10px 14px"><div style="font-size:11px;color:#c4b5fd;text-transform:uppercase;font-weight:700">Created</div><div style="font-size:22px;font-weight:800;color:#fff">${stats.created||0}</div></div>
        <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:8px;padding:10px 14px"><div style="font-size:11px;color:#fca5a5;text-transform:uppercase;font-weight:700">Ignored</div><div style="font-size:22px;font-weight:800;color:#fff">${stats.ignored||0}</div></div>
        <div style="background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.3);border-radius:8px;padding:10px 14px"><div style="font-size:11px;color:#a5b4fc;text-transform:uppercase;font-weight:700">Aliases</div><div style="font-size:22px;font-weight:800;color:#fff">${stats.alias_count||0}</div></div>
      </div>

      ${tabBar}
      ${isCat ? catalogueHTML : queueHTML}
    </div>

    <!-- Add product modal -->
    <div class="modal-overlay" id="addModal">
      <div class="modal-card">
        <h3>➕ Add Product</h3>
        <label>Name</label><input id="addName" placeholder="e.g. Pull-up Banner">
        <label>Category</label>
        <select id="addCat">${CATEGORIES.map(c2=>`<option value="${esc(c2)}">${esc(c2)}</option>`).join('')}</select>
        <label>Aliases (comma-separated, optional)</label>
        <input id="addAliases" placeholder="e.g. Banner, Standee, Pull up">
        <div class="modal-actions">
          <button onclick="closeModal('addModal')" style="background:rgba(255,255,255,0.1);color:#cbd5e1">Cancel</button>
          <button onclick="saveAdd()" style="background:#16a34a;color:#fff">Add Product</button>
        </div>
      </div>
    </div>

    <!-- Bulk add modal -->
    <div class="modal-overlay" id="bulkAddModal">
      <div class="modal-card">
        <h3>📋 Bulk Add Products</h3>
        <p style="font-size:13px;color:#94a3b8;margin:0 0 8px">Paste one product per line. Optional format: <code>Name | Category</code></p>
        <label>Default Category (if not specified per line)</label>
        <select id="bulkCat">${CATEGORIES.map(c2=>`<option value="${esc(c2)}">${esc(c2)}</option>`).join('')}</select>
        <label>Products</label>
        <textarea id="bulkList" placeholder="Pull-up Banner | Branding & Signage&#10;Tromel Draw Drum | Activations & Games&#10;LED Parcan&#10;Vacuum Cleaner | Other"></textarea>
        <div class="modal-actions">
          <button onclick="closeModal('bulkAddModal')" style="background:rgba(255,255,255,0.1);color:#cbd5e1">Cancel</button>
          <button onclick="saveBulkAdd()" style="background:#7c3aed;color:#fff">Add All</button>
        </div>
      </div>
    </div>

    <!-- Edit product modal -->
    <div class="modal-overlay" id="editModal">
      <div class="modal-card">
        <h3>✏️ Edit Product</h3>
        <input type="hidden" id="editId">
        <label>Name</label><input id="editName">
        <label>Category</label>
        <select id="editCat">${CATEGORIES.map(c2=>`<option value="${esc(c2)}">${esc(c2)}</option>`).join('')}</select>
        <div class="modal-actions">
          <button onclick="closeModal('editModal')" style="background:rgba(255,255,255,0.1);color:#cbd5e1">Cancel</button>
          <button onclick="saveEdit()" style="background:#2563eb;color:#fff">Save</button>
        </div>
      </div>
    </div>

    <!-- Aliases modal -->
    <div class="modal-overlay" id="aliasModal">
      <div class="modal-card">
        <h3>🏷️ Aliases — <span id="aliasItemName" style="color:#93c5fd"></span></h3>
        <input type="hidden" id="aliasItemId">
        <div id="aliasList" style="margin:12px 0"></div>
        <label>Add new alias</label>
        <input id="newAlias" placeholder="e.g. Banner Wall" onkeydown="if(event.key==='Enter')addAlias()">
        <div class="modal-actions">
          <button onclick="closeModal('aliasModal')" style="background:rgba(255,255,255,0.1);color:#cbd5e1">Close</button>
          <button onclick="addAlias()" style="background:#16a34a;color:#fff">+ Add Alias</button>
        </div>
      </div>
    </div>

    <!-- Triage modal -->
    <div class="modal-overlay" id="triageModal">
      <div class="modal-card" style="max-width:720px">
        <h3>⚖️ Triage Suggestion</h3>
        <input type="hidden" id="triageSid">
        <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);border-radius:8px;padding:12px;margin-bottom:14px">
          <div style="color:#94a3b8;font-size:11px;text-transform:uppercase;font-weight:700">Raw text from delivery note</div>
          <div id="triageRaw" style="font-size:18px;color:#fff;font-weight:700;margin-top:4px"></div>
          <div id="triageMeta" style="font-size:11.5px;color:#94a3b8;margin-top:4px"></div>
        </div>
        <div style="color:#94a3b8;font-size:11px;text-transform:uppercase;font-weight:700;margin-bottom:6px">Top candidates from catalogue</div>
        <div id="triageCandidates"></div>
        <div style="border-top:1px solid var(--border);padding-top:14px;margin-top:14px">
          <div style="color:#94a3b8;font-size:11px;text-transform:uppercase;font-weight:700;margin-bottom:6px">Or choose another action</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            <button onclick="triageAction('create')" style="padding:10px 14px;border-radius:6px;background:#7c3aed;color:#fff;border:none;font-weight:700;cursor:pointer">➕ Create as new master</button>
            <button onclick="triageAction('split')" style="padding:10px 14px;border-radius:6px;background:#0891b2;color:#fff;border:none;font-weight:700;cursor:pointer">✂️ Split (AI-assisted)</button>
            <button onclick="triageAction('ignore')" style="padding:10px 14px;border-radius:6px;background:rgba(239,68,68,0.25);color:#fca5a5;border:1px solid rgba(239,68,68,0.5);font-weight:700;cursor:pointer">🚫 Ignore</button>
          </div>
        </div>
        <div class="modal-actions">
          <button onclick="closeModal('triageModal')" style="background:rgba(255,255,255,0.1);color:#cbd5e1">Close</button>
        </div>
      </div>
    </div>

    <script>
      const TAB = ${JSON.stringify(tab)};
      const sel = new Set();

      function toggleAll(checked) {
        document.querySelectorAll('.row-check, .sug-check').forEach(cb => {
          cb.checked = checked;
          if (checked) sel.add(cb.value); else sel.delete(cb.value);
        });
        renderBulkBar();
      }
      document.querySelectorAll('.row-check, .sug-check').forEach(cb => {
        cb.addEventListener('change', () => {
          if (cb.checked) sel.add(cb.value); else sel.delete(cb.value);
          renderBulkBar();
        });
      });
      function renderBulkBar() {
        const bar = document.getElementById('bulkBar');
        const cnt = document.getElementById('bulkCount');
        if (!bar) return;
        if (sel.size > 0) { bar.style.display = 'flex'; cnt.textContent = sel.size + ' selected'; }
        else { bar.style.display = 'none'; }
      }
      function clearSelection() {
        sel.clear();
        document.querySelectorAll('.row-check, .sug-check').forEach(cb => cb.checked = false);
        const m = document.getElementById('masterCheck'); if (m) m.checked = false;
        renderBulkBar();
      }
      function openModal(id) { document.getElementById(id).classList.add('open'); }
      function closeModal(id) { document.getElementById(id).classList.remove('open'); }
      function openAddDialog() { document.getElementById('addName').value=''; document.getElementById('addAliases').value=''; openModal('addModal'); }
      function openBulkAddDialog() { document.getElementById('bulkList').value=''; openModal('bulkAddModal'); }

      async function saveAdd() {
        const name = document.getElementById('addName').value.trim();
        const category = document.getElementById('addCat').value;
        const aliases = document.getElementById('addAliases').value.trim();
        if (!name) { alert('Name required'); return; }
        const r = await fetch('/field/admin/products/api/create', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ name, category, aliases })
        });
        const j = await r.json();
        if (j.success) location.reload();
        else alert('Failed: ' + (j.error||'unknown'));
      }

      async function saveBulkAdd() {
        const lines = document.getElementById('bulkList').value.split('\\n').map(l=>l.trim()).filter(Boolean);
        const defaultCat = document.getElementById('bulkCat').value;
        if (!lines.length) { alert('Paste at least one product'); return; }
        const r = await fetch('/field/admin/products/api/bulk-add', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ lines, default_category: defaultCat })
        });
        const j = await r.json();
        if (j.success) { alert('Added ' + j.added + ' product(s). Skipped ' + j.skipped + ' (duplicates).'); location.reload(); }
        else alert('Failed: ' + (j.error||'unknown'));
      }

      function editItem(id, name, category) {
        document.getElementById('editId').value = id;
        document.getElementById('editName').value = name;
        document.getElementById('editCat').value = category;
        openModal('editModal');
      }
      async function saveEdit() {
        const id = document.getElementById('editId').value;
        const name = document.getElementById('editName').value.trim();
        const category = document.getElementById('editCat').value;
        const r = await fetch('/field/admin/products/api/update', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ id, name, category })
        });
        const j = await r.json();
        if (j.success) location.reload();
        else alert('Failed: ' + (j.error||'unknown'));
      }

      async function viewAliases(id) {
        document.getElementById('aliasItemId').value = id;
        const r = await fetch('/field/admin/products/api/aliases?item_id=' + id);
        const j = await r.json();
        document.getElementById('aliasItemName').textContent = j.item_name || '';
        document.getElementById('newAlias').value = '';
        renderAliasList(j.aliases || []);
        openModal('aliasModal');
      }
      function renderAliasList(aliases) {
        const div = document.getElementById('aliasList');
        if (!aliases.length) {
          div.innerHTML = '<div style="color:#94a3b8;font-size:13px;padding:14px;text-align:center;background:rgba(255,255,255,0.03);border-radius:6px">No aliases yet. Add one below.</div>';
          return;
        }
        div.innerHTML = aliases.map(a =>
          '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:rgba(255,255,255,0.04);border-radius:6px;margin-bottom:4px">'
          + '<span style="color:#fff">' + a.alias_text + ' <span style="color:#94a3b8;font-size:11px">· ' + (a.source||'manual') + '</span></span>'
          + '<button onclick="deleteAlias(' + a.id + ')" style="background:transparent;border:none;color:#fca5a5;cursor:pointer;font-size:14px">🗑️</button>'
          + '</div>'
        ).join('');
      }
      async function addAlias() {
        const id = document.getElementById('aliasItemId').value;
        const text = document.getElementById('newAlias').value.trim();
        if (!text) return;
        await fetch('/field/admin/products/api/aliases/add', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ item_id: id, alias_text: text })
        });
        viewAliases(id);
      }
      async function deleteAlias(aid) {
        const id = document.getElementById('aliasItemId').value;
        await fetch('/field/admin/products/api/aliases/delete', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ id: aid })
        });
        viewAliases(id);
      }

      async function bulkAction(action) {
        const ids = Array.from(sel);
        if (!ids.length) return;
        let extra = {};
        if (action === 'recategorise') {
          const c = prompt('New category for ' + ids.length + ' item(s):\\n\\n' + ${JSON.stringify(JSON.stringify(CATEGORIES))});
          if (!c) return; extra.category = c;
        }
        if (action === 'merge') {
          const masterId = prompt('Merge ' + ids.length + ' item(s) into which master?\\nEnter the master product ID (others become aliases):');
          if (!masterId) return; extra.master_id = parseInt(masterId);
        }
        if (action === 'delete') {
          if (!confirm('Delete (soft) ' + ids.length + ' product(s)? They will be hidden but data preserved.')) return;
        }
        const r = await fetch('/field/admin/products/api/bulk', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ action, ids, ...extra })
        });
        const j = await r.json();
        if (j.success) location.reload();
        else alert('Failed: ' + (j.error||'unknown'));
      }

      async function bulkSugAction(action) {
        const ids = Array.from(sel);
        if (!ids.length) return;
        if (!confirm('Apply "' + action + '" to ' + ids.length + ' suggestion(s)?')) return;
        const r = await fetch('/field/admin/products/api/bulk-suggestion', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ action, ids })
        });
        const j = await r.json();
        if (j.success) location.reload();
        else alert('Failed: ' + (j.error||'unknown'));
      }

      async function rescoreAll() {
        if (!confirm('Rescore all pending suggestions against the catalogue?')) return;
        const btn = event.target; btn.disabled = true; btn.textContent = '⏳ Scoring…';
        const r = await fetch('/field/admin/products/api/rescore', { method:'POST' });
        const j = await r.json();
        if (j.success) { alert('Scored ' + j.count + ' suggestion(s).'); location.reload(); }
        else { btn.disabled = false; btn.textContent = '🔄 Rescore All'; alert('Failed: ' + (j.error||'unknown')); }
      }

      async function triageSuggestion(sid) {
        document.getElementById('triageSid').value = sid;
        const r = await fetch('/field/admin/products/api/triage-load?id=' + sid);
        const j = await r.json();
        if (!j.success) { alert('Failed to load'); return; }
        document.getElementById('triageRaw').textContent = j.suggestion.description + (j.suggestion.quantity > 1 ? ' (qty ' + j.suggestion.quantity + ')' : '');
        document.getElementById('triageMeta').textContent = 'From ' + (j.suggestion.form_number||'—') + ' · ' + (j.suggestion.venue||'') + ' · ' + (j.suggestion.prepared_by||'');
        const candHTML = (j.candidates||[]).map(c => {
          const pct = Math.round(c.score*100);
          let bg = '#475569'; if (c.score >= 0.85) bg='#16a34a'; else if (c.score>=0.65) bg='#f59e0b';
          return '<div class="candidate-card"><span class="score-pill" style="background:'+bg+'">'+pct+'%</span>'
            + '<div style="flex:1"><strong style="color:#fff">'+c.name+'</strong><div style="font-size:11.5px;color:#94a3b8">'+(c.reason||'')+' · '+(c.category||'')+'</div></div>'
            + '<button onclick="triageMerge('+c.item_id+')" style="padding:8px 14px;border-radius:6px;background:#16a34a;color:#fff;border:none;font-weight:700;cursor:pointer">✅ Merge as alias</button></div>';
        }).join('');
        document.getElementById('triageCandidates').innerHTML = candHTML || '<div style="color:#94a3b8;font-size:13px;padding:14px;text-align:center;background:rgba(255,255,255,0.03);border-radius:6px">No close matches — likely a new product.</div>';
        openModal('triageModal');
      }
      async function triageMerge(itemId) {
        const sid = document.getElementById('triageSid').value;
        const r = await fetch('/field/admin/products/api/triage', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ id: sid, action: 'merge', target_item_id: itemId })
        });
        const j = await r.json();
        if (j.success) location.reload();
        else alert('Failed: ' + (j.error||'unknown'));
      }
      async function triageAction(action) {
        const sid = document.getElementById('triageSid').value;
        let extra = {};
        if (action === 'create') {
          const cat = prompt('Category for new master product?\\nOne of: ' + ${JSON.stringify(JSON.stringify(CATEGORIES))});
          if (!cat) return; extra.category = cat;
        }
        if (action === 'split') {
          alert('Split feature: Claude will be asked to break the phrase into separate items. Confirm on next screen.');
          // Future: call /api/triage with action=split, server invokes Claude
        }
        const r = await fetch('/field/admin/products/api/triage', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ id: sid, action, ...extra })
        });
        const j = await r.json();
        if (j.success) { if (j.split_preview) { alert('Split into: ' + j.split_preview.join(', ')); } location.reload(); }
        else alert('Failed: ' + (j.error||'unknown'));
      }
    </script>
  `

  return c.html(layout('Master Products', body, user, 'field-admin'))
})

// ============================================================================
//  API ENDPOINTS
// ============================================================================

// CREATE single
app.post('/api/create', requireAuth, async (c) => {
  try {
    const { name, category, aliases } = await c.req.json()
    if (!name) return c.json({ success: false, error: 'name required' }, 400)
    const result = await c.env.DB.prepare(
      'INSERT INTO field_items (name, category, active) VALUES (?, ?, 1)'
    ).bind(String(name).trim(), category || 'Other').run()
    const itemId = result.meta.last_row_id
    if (aliases) {
      const parts = String(aliases).split(',').map(s => s.trim()).filter(Boolean)
      for (const p of parts) {
        await c.env.DB.prepare(
          'INSERT INTO field_item_aliases (item_id, alias_text, alias_lower, source) VALUES (?, ?, ?, ?)'
        ).bind(itemId, p, p.toLowerCase(), 'manual').run()
      }
    }
    return c.json({ success: true, id: itemId })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// BULK ADD (paste list)
app.post('/api/bulk-add', requireAuth, async (c) => {
  try {
    const { lines, default_category } = await c.req.json() as { lines: string[]; default_category: string }
    let added = 0, skipped = 0
    for (const raw of lines) {
      const parts = raw.split('|').map((s: string) => s.trim())
      const name = parts[0]
      const cat = parts[1] || default_category || 'Other'
      if (!name) continue
      // Skip duplicates
      const existing = await c.env.DB.prepare(
        'SELECT id FROM field_items WHERE LOWER(name)=? LIMIT 1'
      ).bind(name.toLowerCase()).first<any>()
      if (existing) { skipped++; continue }
      await c.env.DB.prepare(
        'INSERT INTO field_items (name, category, active) VALUES (?, ?, 1)'
      ).bind(name, cat).run()
      added++
    }
    return c.json({ success: true, added, skipped })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// UPDATE
app.post('/api/update', requireAuth, async (c) => {
  try {
    const { id, name, category } = await c.req.json()
    await c.env.DB.prepare('UPDATE field_items SET name=?, category=? WHERE id=?')
      .bind(String(name).trim(), category, id).run()
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// BULK actions on catalogue
app.post('/api/bulk', requireAuth, async (c) => {
  try {
    const { action, ids, category, master_id } = await c.req.json() as any
    if (!Array.isArray(ids) || !ids.length) return c.json({ success: false, error: 'no ids' }, 400)
    const placeholders = ids.map(() => '?').join(',')

    if (action === 'delete') {
      // Soft delete
      await c.env.DB.prepare(`UPDATE field_items SET active=0 WHERE id IN (${placeholders})`).bind(...ids).run()
    } else if (action === 'activate') {
      await c.env.DB.prepare(`UPDATE field_items SET active=1 WHERE id IN (${placeholders})`).bind(...ids).run()
    } else if (action === 'deactivate') {
      await c.env.DB.prepare(`UPDATE field_items SET active=0 WHERE id IN (${placeholders})`).bind(...ids).run()
    } else if (action === 'recategorise') {
      if (!category) return c.json({ success: false, error: 'category required' }, 400)
      await c.env.DB.prepare(`UPDATE field_items SET category=? WHERE id IN (${placeholders})`).bind(category, ...ids).run()
    } else if (action === 'merge') {
      // Fold ids → master_id: each becomes an alias of master, then deactivated
      if (!master_id) return c.json({ success: false, error: 'master_id required' }, 400)
      for (const id of ids) {
        if (Number(id) === Number(master_id)) continue
        const row = await c.env.DB.prepare('SELECT name FROM field_items WHERE id=?').bind(id).first<any>()
        if (row) {
          await c.env.DB.prepare(
            'INSERT INTO field_item_aliases (item_id, alias_text, alias_lower, source) VALUES (?, ?, ?, ?)'
          ).bind(master_id, row.name, row.name.toLowerCase(), 'merge').run()
        }
        await c.env.DB.prepare('UPDATE field_items SET active=0 WHERE id=?').bind(id).run()
      }
    } else {
      return c.json({ success: false, error: 'unknown action' }, 400)
    }
    return c.json({ success: true, count: ids.length })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// ALIASES — list / add / delete
app.get('/api/aliases', requireAuth, async (c) => {
  const itemId = c.req.query('item_id')
  const item = await c.env.DB.prepare('SELECT name FROM field_items WHERE id=?').bind(itemId).first<any>()
  const aliases = await c.env.DB.prepare(
    'SELECT id, alias_text, source FROM field_item_aliases WHERE item_id=? AND active=1 ORDER BY id DESC'
  ).bind(itemId).all<any>()
  return c.json({ success: true, item_name: item?.name || '', aliases: aliases.results || [] })
})
app.post('/api/aliases/add', requireAuth, async (c) => {
  try {
    const { item_id, alias_text } = await c.req.json() as any
    const txt = String(alias_text).trim()
    if (!txt) return c.json({ success: false, error: 'empty' }, 400)
    await c.env.DB.prepare(
      'INSERT INTO field_item_aliases (item_id, alias_text, alias_lower, source) VALUES (?, ?, ?, ?)'
    ).bind(item_id, txt, txt.toLowerCase(), 'manual').run()
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})
app.post('/api/aliases/delete', requireAuth, async (c) => {
  const { id } = await c.req.json() as any
  await c.env.DB.prepare('UPDATE field_item_aliases SET active=0 WHERE id=?').bind(id).run()
  return c.json({ success: true })
})

// ─── SUGGESTION QUEUE ───────────────────────────────────────────────────────

// Rescore all pending suggestions
app.post('/api/rescore', requireAuth, async (c) => {
  const catalogue = await loadCatalogue(c.env.DB)
  const pending = await c.env.DB.prepare(
    `SELECT id, description FROM field_suggested_items WHERE status='pending'`
  ).all<any>()
  let count = 0
  for (const s of (pending.results || [])) {
    const result = await findMatchesWithLexicon(c.env.DB, s.description, catalogue, 3)
    const top = result.candidates[0]
    await c.env.DB.prepare(
      `UPDATE field_suggested_items SET matched_item_id=?, match_score=?, top_candidates=? WHERE id=?`
    ).bind(
      top ? top.item_id : null,
      top ? top.score : null,
      JSON.stringify(result.candidates),
      s.id
    ).run()
    count++
  }
  return c.json({ success: true, count })
})

// Load triage data
app.get('/api/triage-load', requireAuth, async (c) => {
  const id = c.req.query('id')
  const row = await c.env.DB.prepare(`
    SELECT s.id, s.description, s.quantity, s.top_candidates,
           sub.form_number, sub.venue, sub.prepared_by
    FROM field_suggested_items s
    LEFT JOIN field_submissions sub ON sub.id = s.submission_id
    WHERE s.id=?`).bind(id).first<any>()
  if (!row) return c.json({ success: false, error: 'not found' }, 404)
  let candidates: any[] = []
  try { candidates = JSON.parse(row.top_candidates || '[]') } catch {}
  // If not scored, score now
  if (!candidates.length) {
    const catalogue = await loadCatalogue(c.env.DB)
    const result = await findMatchesWithLexicon(c.env.DB, row.description, catalogue, 3)
    candidates = result.candidates
    await c.env.DB.prepare(
      `UPDATE field_suggested_items SET match_score=?, top_candidates=? WHERE id=?`
    ).bind(candidates[0]?.score || null, JSON.stringify(candidates), id).run()
  }
  return c.json({ success: true, suggestion: row, candidates })
})

// Triage action (single)
app.post('/api/triage', requireAuth, async (c) => {
  try {
    const user = c.get('user' as any) as any
    const { id, action, target_item_id, category } = await c.req.json() as any
    const sug = await c.env.DB.prepare('SELECT * FROM field_suggested_items WHERE id=?').bind(id).first<any>()
    if (!sug) return c.json({ success: false, error: 'suggestion not found' }, 404)

    if (action === 'merge') {
      // Add as alias on the target item
      if (!target_item_id) return c.json({ success: false, error: 'target_item_id required' }, 400)
      await c.env.DB.prepare(
        'INSERT INTO field_item_aliases (item_id, alias_text, alias_lower, source, source_suggestion_id, confirmed_by) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(target_item_id, sug.description, String(sug.description).toLowerCase(), 'suggestion', id, user?.name || 'admin').run()
      await c.env.DB.prepare(
        `UPDATE field_suggested_items SET status='merged', matched_item_id=?, decided_by=?, decided_at=CURRENT_TIMESTAMP WHERE id=?`
      ).bind(target_item_id, user?.name || 'admin', id).run()
      return c.json({ success: true })
    }

    if (action === 'create') {
      const cat = category || 'Other'
      const res = await c.env.DB.prepare(
        'INSERT INTO field_items (name, category, active) VALUES (?, ?, 1)'
      ).bind(String(sug.description).trim(), cat).run()
      const newId = res.meta.last_row_id
      await c.env.DB.prepare(
        `UPDATE field_suggested_items SET status='created', matched_item_id=?, decided_by=?, decided_at=CURRENT_TIMESTAMP WHERE id=?`
      ).bind(newId, user?.name || 'admin', id).run()
      return c.json({ success: true, new_item_id: newId })
    }

    if (action === 'ignore') {
      await c.env.DB.prepare(
        `UPDATE field_suggested_items SET status='ignored', decided_by=?, decided_at=CURRENT_TIMESTAMP WHERE id=?`
      ).bind(user?.name || 'admin', id).run()
      return c.json({ success: true })
    }

    if (action === 'split') {
      // Stub: naive split on common conjunctions; full Claude version awaits Bibi's fuzzy chart
      const parts = String(sug.description)
        .split(/[,;\/]|\s+(?:and|&|\+|with)\s+/i)
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 1)
      if (parts.length < 2) return c.json({ success: false, error: 'could not split — too few parts' }, 400)
      // Create child suggestions for each part
      for (const p of parts) {
        await c.env.DB.prepare(
          `INSERT INTO field_suggested_items (submission_id, description, quantity, suggested_by, status, parent_suggestion_id)
           VALUES (?, ?, ?, ?, 'pending', ?)`
        ).bind(sug.submission_id, p, sug.quantity || 1, sug.suggested_by, id).run()
      }
      await c.env.DB.prepare(
        `UPDATE field_suggested_items SET status='split', decided_by=?, decided_at=CURRENT_TIMESTAMP WHERE id=?`
      ).bind(user?.name || 'admin', id).run()
      return c.json({ success: true, split_preview: parts })
    }

    return c.json({ success: false, error: 'unknown action' }, 400)
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// BULK on suggestions
app.post('/api/bulk-suggestion', requireAuth, async (c) => {
  try {
    const user = c.get('user' as any) as any
    const { action, ids } = await c.req.json() as any
    if (!Array.isArray(ids) || !ids.length) return c.json({ success: false, error: 'no ids' }, 400)
    const placeholders = ids.map(() => '?').join(',')

    if (action === 'ignore') {
      await c.env.DB.prepare(
        `UPDATE field_suggested_items
         SET status='ignored', decided_by=?, decided_at=CURRENT_TIMESTAMP
         WHERE id IN (${placeholders})`
      ).bind(user?.name || 'admin', ...ids).run()
    } else if (action === 'create') {
      // Create each as a new master product (or reuse existing by name)
      for (const id of ids) {
        const sug = await c.env.DB.prepare('SELECT description FROM field_suggested_items WHERE id=?').bind(id).first<any>()
        if (!sug) continue
        const existing = await c.env.DB.prepare(
          'SELECT id FROM field_items WHERE LOWER(name)=LOWER(?) LIMIT 1'
        ).bind(sug.description).first<any>()
        let itemId: number
        if (existing?.id) {
          itemId = existing.id
          await c.env.DB.prepare('UPDATE field_items SET active=1 WHERE id=?').bind(itemId).run()
        } else {
          const r = await c.env.DB.prepare(
            'INSERT INTO field_items (name, category, active) VALUES (?, ?, 1)'
          ).bind(sug.description, 'Other').run()
          itemId = Number(r.meta.last_row_id)
        }
        await c.env.DB.prepare(
          `UPDATE field_suggested_items
           SET status='created', matched_item_id=?, decided_by=?, decided_at=CURRENT_TIMESTAMP
           WHERE id=?`
        ).bind(itemId, user?.name || 'admin', id).run()
      }
    } else {
      return c.json({ success: false, error: 'unknown action' }, 400)
    }
    return c.json({ success: true, count: ids.length })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// ─── LEXICON PHASE 1: diagnostic endpoints ─────────────────────────────────
// Pure data plumbing. Proves the BW Events Lexicon v3 is reachable from the
// Worker. No matcher logic changes yet — those land in Phase 2.

app.get('/api/lexicon/health', requireAuth, async (c) => {
  try {
    const health = await lexiconHealth(c.env.DB)
    return c.json({ success: true, ...health })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// Lookup one term — useful for spot-checking specific entries.
// Usage: GET /field/admin/products/api/lexicon/lookup?q=castle%20lager
app.get('/api/lexicon/lookup', requireAuth, async (c) => {
  try {
    const q = (c.req.query('q') || '').trim().toLowerCase()
    if (!q) return c.json({ success: false, error: 'missing q parameter' }, 400)
    const lex = await loadLexicon(c.env.DB)
    return c.json({
      success: true,
      query: q,
      hits: {
        acronym: lex.acronymByKey.get(q) || null,
        synonym_group: lex.synonymByVariant.get(q) || null,
        brand: lex.brandByVariant.get(q) || null,
        region: lex.regions.find(r =>
          r.canonical.toLowerCase() === q || r.variant_list.includes(q)
        ) || null,
        supplier: lex.suppliers.find(s =>
          s.canonical.toLowerCase() === q || s.variant_list.includes(q)
        ) || null,
      }
    })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// Tiny admin health page so Bibi can eyeball "the lexicon is live"
app.get('/lexicon', requireAuth, async (c) => {
  const user = c.get('user' as any) as any
  const health = await lexiconHealth(c.env.DB)
  const body = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
      <h2 style="margin:0">BW Events Lexicon — Health</h2>
      <span class="badge badge-success" style="font-size:12px">${esc(health.version)}</span>
    </div>
    <div class="stats-grid" style="grid-template-columns:repeat(5,1fr);margin-bottom:20px">
      <div class="stat-card"><div class="stat-num">${health.counts.acronyms}</div><div class="stat-label">Acronyms</div></div>
      <div class="stat-card"><div class="stat-num">${health.counts.synonym_groups}</div><div class="stat-label">Synonym Groups</div></div>
      <div class="stat-card"><div class="stat-num">${health.counts.brand_map}</div><div class="stat-label">Brand Map</div></div>
      <div class="stat-card"><div class="stat-num">${health.counts.regions}</div><div class="stat-label">Regions</div></div>
      <div class="stat-card"><div class="stat-num">${health.counts.suppliers}</div><div class="stat-label">Suppliers</div></div>
    </div>

    <div class="card mb-4">
      <div class="card-header"><h3 class="card-title">Phase 1 status</h3></div>
      <div style="padding:16px;font-size:14px;line-height:1.6">
        <strong style="color:var(--success)">✅ Lexicon loaded into production D1.</strong><br>
        ${health.bb_confirmed_count.acronyms} BB-Confirmed acronyms · ${health.bb_confirmed_count.synonyms} BB-Confirmed synonym groups.<br>
        AI fuzzy prompt: ${health.ai_prompt_length.toLocaleString()} characters cached.<br>
        Cache age: ${(health.cache_age_ms / 1000).toFixed(2)} s.
        <hr style="margin:12px 0;border:none;border-top:1px solid #e5e7eb">
        <strong>Next phases:</strong>
        <ol style="margin:8px 0 0 20px">
          <li><strong>Phase 2:</strong> Wire synonym groups + typo auto-correct into the scorer.</li>
          <li><strong>Phase 3:</strong> Hard rules (Stage ≠ Site, 4t ≠ 7t, Sharp ≠ beer) + ambiguity flags.</li>
          <li><strong>Phase 4:</strong> Admin editor so you can update lexicon without me.</li>
        </ol>
      </div>
    </div>

    <div class="card mb-4">
      <div class="card-header"><h3 class="card-title">Spot-check (live data)</h3></div>
      <div style="padding:16px;font-size:13px;font-family:ui-monospace,monospace;white-space:pre-wrap;background:#f9fafb;border-radius:6px;margin:0 16px 16px;max-height:300px;overflow:auto">${esc(JSON.stringify(health.sample, null, 2))}</div>
    </div>

    <div class="card mb-4">
      <div class="card-header"><h3 class="card-title">Live lookup</h3></div>
      <div style="padding:16px">
        <input id="lex-q" type="text" placeholder="Try: castle lager · ECR · Per Dieam · CSQUARE · MXD"
               style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:8px;font-size:14px">
        <pre id="lex-out" style="margin:14px 0 0;font-size:12px;background:#f9fafb;padding:14px;border-radius:8px;max-height:400px;overflow:auto"></pre>
      </div>
    </div>

    <script>
    (function(){
      const q = document.getElementById('lex-q');
      const out = document.getElementById('lex-out');
      let t;
      q.addEventListener('input', () => {
        clearTimeout(t);
        const v = q.value.trim();
        if (!v) { out.textContent = ''; return; }
        t = setTimeout(async () => {
          out.textContent = 'Loading…';
          try {
            const r = await fetch('/field/admin/products/api/lexicon/lookup?q=' + encodeURIComponent(v));
            const j = await r.json();
            out.textContent = JSON.stringify(j.hits, null, 2);
          } catch (e) { out.textContent = 'Error: ' + e.message; }
        }, 250);
      });
    })();
    </script>
  `
  return c.html(layout('Lexicon Health', body, user, 'products'))
})

// ─── PUBLIC API: live fuzzy match (used by delivery form) ───────────────────
app.post('/api/match', async (c) => {
  try {
    const { text } = await c.req.json() as any
    if (!text || String(text).length < 2) return c.json({ success: true, candidates: [], verdict: 'new' })
    const catalogue = await loadCatalogue(c.env.DB)
    const result = await findMatchesWithLexicon(c.env.DB, String(text), catalogue, 3)
    return c.json({
      success: true,
      verdict: result.verdict,
      suggested_action: result.suggested_action,
      candidates: result.candidates,
      bb_confirmed: result.bb_confirmed,
      matched_group: result.matched_group,
      ambiguity: result.ambiguity,
      lexicon_hint: result.lexicon_hint,
      lexicon_version: result.lexicon_version,
      escalate: shouldEscalateToLLM(result.candidates[0]?.score || 0)
    })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

export default app
