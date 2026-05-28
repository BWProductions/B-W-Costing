// ─────────────────────────────────────────────────────────────────────────
// Phase 6: Bulk CSV Import — UI routes
// ─────────────────────────────────────────────────────────────────────────
// Mounted under /admin/stock/import.
// Sub-routes:
//   GET  /import                   — landing: paste box + upload + history
//   POST /import/preview           — parse + classify + save as preview
//   GET  /import/:id               — preview page (table of rows w/ diffs)
//   POST /import/:id/commit        — apply the import
//   POST /import/:id/discard       — bin the preview (no-op DB-wise)
//   POST /import/:id/undo          — reverse a committed import (≤ 24h)

import { Hono } from 'hono'
import type { AuthUser } from '../lib/auth.js'
import { layout } from '../lib/layout.js'
import {
  parseCsv, detectColumns, classifyRows, savePreview,
  commitImport, undoImport, discardPreview,
  loadImport, loadImportRows, listRecentImports, canUndo,
  type ColumnMap, type ClassifiedRow,
} from '../lib/bulk-import.js'

type Bindings = { DB: D1Database }
type Variables = { user: AuthUser }
const bulk = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// ─── helpers ────────────────────────────────────────────────────────────────

function esc(s: any): string {
  if (s === null || s === undefined) return ''
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function fmtDate(s: string | null): string {
  if (!s) return ''
  return s.replace('T', ' ').replace(/\.\d+Z?$/, '')
}

function actionBadge(action: string): string {
  const colors: Record<string, { bg: string; fg: string; label: string }> = {
    insert: { bg: '#10b981', fg: '#fff', label: 'INSERT' },
    update: { bg: '#3b82f6', fg: '#fff', label: 'UPDATE' },
    skip:   { bg: '#6b7280', fg: '#fff', label: 'SKIP' },
  }
  const c = colors[action] || { bg: '#6b7280', fg: '#fff', label: action.toUpperCase() }
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:${c.bg};color:${c.fg};font-size:11px;font-weight:700">${c.label}</span>`
}

function statusBadge(status: string): string {
  const colors: Record<string, string> = {
    preview:   '#f59e0b',
    committed: '#10b981',
    undone:    '#dc2626',
    discarded: '#6b7280',
  }
  const bg = colors[status] || '#6b7280'
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:${bg};color:#fff;font-size:11px;font-weight:700;text-transform:uppercase">${status}</span>`
}

// ─── GET /import — landing page ────────────────────────────────────────────

bulk.get('/', async (c) => {
  const user = c.get('user')
  const recent = await listRecentImports(c.env.DB, 20)

  const body = /*html*/ `
    <div class="max-w-6xl">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <h1 style="margin:0">📥 Bulk CSV Import</h1>
        <a href="/admin/stock" class="btn btn-outline"><i class="fas fa-arrow-left"></i> Back to stock</a>
      </div>

      <div style="background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.3);border-radius:8px;padding:16px;margin-bottom:24px">
        <strong style="color:#3b82f6">How this works:</strong>
        <ol style="margin:8px 0 0 20px;line-height:1.6">
          <li>Paste or upload a CSV (any reasonable column order — auto-detected)</li>
          <li>I'll show you a <strong>preview</strong> of every row: insert, update, or skip</li>
          <li>Borderline fuzzy matches are flagged for your eyeballs (defaults to insert — safe)</li>
          <li>Click <strong>Commit</strong> when happy. <strong>Undo</strong> available for 24h afterwards.</li>
        </ol>
        <div style="margin-top:10px;font-size:13px;opacity:0.85">
          <strong>Recognised column names</strong> (case-insensitive, any order):
          <code>id, brand, description, qty, location, notes, custody, status, threshold</code>
          — synonyms like <em>name, desc, quantity, count, on_hand, supplier, low_stock</em> also detected.
        </div>
      </div>

      <!-- Paste/upload form -->
      <form method="post" action="/admin/stock/import/preview" enctype="multipart/form-data" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:20px;margin-bottom:24px">
        <h2 style="margin:0 0 12px 0;font-size:18px">1. Provide your CSV</h2>

        <div style="margin-bottom:14px">
          <label style="display:block;font-weight:600;margin-bottom:6px">Option A — Paste CSV here</label>
          <textarea name="csv_text" rows="10" placeholder="brand,description,qty,location
Castle Lite,Complete umbrellas - New,12,BW Warehouse
MXD,Wooden crates,5,R59 Storage B50" style="width:100%;font-family:'Menlo','Monaco',monospace;font-size:13px;padding:10px;border-radius:6px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.15);color:inherit"></textarea>
        </div>

        <div style="margin-bottom:14px">
          <label style="display:block;font-weight:600;margin-bottom:6px">Option B — Upload a .csv / .tsv file</label>
          <input type="file" name="csv_file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" style="padding:6px;border-radius:6px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.15);color:inherit">
          <div style="font-size:12px;opacity:0.7;margin-top:4px">Max ~200KB. Auto-detects comma, tab, semicolon, or pipe delimiter.</div>
        </div>

        <div style="display:flex;gap:10px;align-items:center">
          <button type="submit" class="btn btn-primary"><i class="fas fa-magnifying-glass"></i> Preview changes</button>
          <span style="font-size:13px;opacity:0.65">No changes are written yet — preview only.</span>
        </div>
      </form>

      <!-- Recent imports -->
      <h2 style="font-size:18px;margin:24px 0 12px 0">Recent imports</h2>
      ${recent.length === 0 ? '<p style="opacity:0.6">No imports yet.</p>' : ''}
      ${recent.length > 0 ? /*html*/ `
        <div style="overflow-x:auto;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:8px">
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead style="background:rgba(255,255,255,0.05)">
              <tr>
                <th style="text-align:left;padding:10px 12px">#</th>
                <th style="text-align:left;padding:10px 12px">When</th>
                <th style="text-align:left;padding:10px 12px">Source</th>
                <th style="text-align:left;padding:10px 12px">By</th>
                <th style="text-align:left;padding:10px 12px">Status</th>
                <th style="text-align:right;padding:10px 12px">Rows</th>
                <th style="text-align:right;padding:10px 12px">Ins/Upd/Skip</th>
                <th style="text-align:right;padding:10px 12px">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${recent.map(r => /*html*/ `
                <tr style="border-top:1px solid rgba(255,255,255,0.06)">
                  <td style="padding:10px 12px;font-family:monospace">${r.id}</td>
                  <td style="padding:10px 12px">${esc(fmtDate(r.created_at))}</td>
                  <td style="padding:10px 12px">${esc(r.source_name || '—')}</td>
                  <td style="padding:10px 12px">${esc(r.created_by_name || '—')}</td>
                  <td style="padding:10px 12px">${statusBadge(r.status)}${r.undone_at ? `<div style="font-size:11px;opacity:0.6;margin-top:2px">undone ${esc(fmtDate(r.undone_at))} by ${esc(r.undone_by_name || '?')}</div>` : ''}</td>
                  <td style="padding:10px 12px;text-align:right;font-family:monospace">${r.total_rows}</td>
                  <td style="padding:10px 12px;text-align:right;font-family:monospace">
                    <span style="color:#10b981">${r.insert_count}</span>/<span style="color:#3b82f6">${r.update_count}</span>/<span style="color:#6b7280">${r.skip_count}</span>
                  </td>
                  <td style="padding:10px 12px;text-align:right">
                    <a href="/admin/stock/import/${r.id}" class="btn btn-outline" style="padding:4px 10px;font-size:12px">View</a>
                    ${canUndo(r) ? `
                      <form method="post" action="/admin/stock/import/${r.id}/undo" style="display:inline-block" onsubmit="return confirm('Undo import #${r.id}? This will reverse all changes.')">
                        <button type="submit" class="btn" style="padding:4px 10px;font-size:12px;background:#dc2626;color:#fff;border:none"><i class="fas fa-rotate-left"></i> Undo</button>
                      </form>` : ''}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}
    </div>
  `

  return c.html(layout('Bulk Import — Stock Admin', body, user, 'stock'))
})

// ─── POST /import/preview — parse + classify + save as preview ────────────

bulk.post('/preview', async (c) => {
  const user = c.get('user')
  const form = await c.req.parseBody()

  let csvText = ''
  let sourceName = 'paste'

  // File upload trumps paste
  const file = form['csv_file']
  if (file && typeof file !== 'string' && (file as File).size > 0) {
    const f = file as File
    csvText = await f.text()
    sourceName = f.name || 'upload.csv'
  } else if (typeof form['csv_text'] === 'string' && (form['csv_text'] as string).trim() !== '') {
    csvText = form['csv_text'] as string
    sourceName = `paste:${csvText.split('\n').length}_lines`
  } else {
    return c.html(errorPage(user, 'No CSV provided', 'Paste some CSV text or pick a file to upload.'))
  }

  const parsed = parseCsv(csvText)
  if (parsed.headers.length === 0 || parsed.rows.length === 0) {
    return c.html(errorPage(user, 'CSV is empty', `Parsed 0 usable rows. ${parsed.warnings.join(' ')}`))
  }

  const colMap = detectColumns(parsed.headers)
  const classified = await classifyRows(c.env.DB, parsed, colMap)

  const importId = await savePreview(c.env.DB, user, sourceName, csvText, parsed, colMap, classified)
  return c.redirect(`/admin/stock/import/${importId}`, 303)
})

// ─── GET /import/:id — preview page ────────────────────────────────────────

bulk.get('/:id', async (c) => {
  const user = c.get('user')
  const id = parseInt(c.req.param('id'), 10)
  if (!Number.isFinite(id)) return c.notFound()

  const imp = await loadImport(c.env.DB, id)
  if (!imp) return c.notFound()

  const rows = await loadImportRows(c.env.DB, id)
  const colMap: ColumnMap = imp.detected_cols ? JSON.parse(imp.detected_cols) : {} as ColumnMap

  // For preview rendering we need to recombine the per-row snapshots back
  // into a ClassifiedRow-ish view.
  const view = rows.map(r => {
    const raw = r.raw_data ? JSON.parse(r.raw_data) : {}
    const before = r.before_snapshot ? JSON.parse(r.before_snapshot) : null
    const after = r.after_snapshot ? JSON.parse(r.after_snapshot) : {}
    const fields = (r.fields_touched || '').split(',').filter(Boolean)
    return { r, raw, before, after, fields }
  })

  const detectedCols = Object.entries(colMap)
    .filter(([_, idx]) => (idx as number) >= 0)
    .map(([k, idx]) => `<code>${k}</code>→col ${(idx as number) + 1}`)
    .join(', ')

  const insertCount = rows.filter(r => r.action_taken === 'insert').length
  const updateCount = rows.filter(r => r.action_taken === 'update').length
  const skipCount = rows.filter(r => r.action_taken === 'skip').length
  const fuzzyCount = rows.filter(r => r.match_score !== null && r.match_score < 1).length

  const undoable = canUndo(imp)
  const isCommitted = imp.status === 'committed'
  const isUndone = imp.status === 'undone'
  const isDiscarded = imp.status === 'discarded'
  const isPreview = imp.status === 'preview'

  const body = /*html*/ `
    <div style="max-width:1400px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;gap:16px;flex-wrap:wrap">
        <div>
          <h1 style="margin:0 0 6px 0">Bulk Import #${imp.id} ${statusBadge(imp.status)}</h1>
          <div style="font-size:13px;opacity:0.75">
            ${esc(fmtDate(imp.created_at))} by ${esc(imp.created_by_name || '—')} · source: <code>${esc(imp.source_name || '—')}</code>
            ${imp.committed_at ? `· committed ${esc(fmtDate(imp.committed_at))}` : ''}
            ${imp.undone_at ? `· undone ${esc(fmtDate(imp.undone_at))} by ${esc(imp.undone_by_name || '?')}` : ''}
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <a href="/admin/stock/import" class="btn btn-outline"><i class="fas fa-arrow-left"></i> Back</a>
          ${isPreview ? `
            <form method="post" action="/admin/stock/import/${id}/discard" style="display:inline" onsubmit="return confirm('Discard this preview? You can re-paste the CSV anytime.')">
              <button type="submit" class="btn btn-outline" style="color:#6b7280;border-color:#6b7280"><i class="fas fa-trash"></i> Discard</button>
            </form>
            <form method="post" action="/admin/stock/import/${id}/commit" style="display:inline" onsubmit="return confirm('Apply ${insertCount} inserts and ${updateCount} updates to live stock? Undo available for 24h.')">
              <button type="submit" class="btn btn-primary" style="background:#10b981;border-color:#10b981"><i class="fas fa-check"></i> Commit ${insertCount + updateCount} changes</button>
            </form>
          ` : ''}
          ${isCommitted && undoable ? `
            <form method="post" action="/admin/stock/import/${id}/undo" style="display:inline" onsubmit="return confirm('Undo this import? All ${insertCount} inserts will be soft-deleted and ${updateCount} updates reverted.')">
              <button type="submit" class="btn" style="background:#dc2626;color:#fff;border:none"><i class="fas fa-rotate-left"></i> Undo (${hoursLeft(imp)}h left)</button>
            </form>
          ` : ''}
          ${isCommitted && !undoable ? `<span style="font-size:12px;opacity:0.6;align-self:center">Undo window closed (24h)</span>` : ''}
        </div>
      </div>

      <!-- Summary strip -->
      <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap">
        <div style="flex:1;min-width:140px;padding:12px 16px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:8px">
          <div style="font-size:11px;text-transform:uppercase;opacity:0.7">Inserts</div>
          <div style="font-size:28px;font-weight:700;color:#10b981">${insertCount}</div>
        </div>
        <div style="flex:1;min-width:140px;padding:12px 16px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.3);border-radius:8px">
          <div style="font-size:11px;text-transform:uppercase;opacity:0.7">Updates</div>
          <div style="font-size:28px;font-weight:700;color:#3b82f6">${updateCount}</div>
        </div>
        <div style="flex:1;min-width:140px;padding:12px 16px;background:rgba(107,114,128,0.1);border:1px solid rgba(107,114,128,0.3);border-radius:8px">
          <div style="font-size:11px;text-transform:uppercase;opacity:0.7">Skipped</div>
          <div style="font-size:28px;font-weight:700;color:#9ca3af">${skipCount}</div>
        </div>
        <div style="flex:1;min-width:140px;padding:12px 16px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:8px">
          <div style="font-size:11px;text-transform:uppercase;opacity:0.7">Fuzzy matches</div>
          <div style="font-size:28px;font-weight:700;color:#f59e0b">${fuzzyCount}</div>
        </div>
      </div>

      <!-- Detected columns -->
      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:10px 14px;margin-bottom:16px;font-size:13px">
        <strong>Detected columns:</strong> ${detectedCols || '<em>none recognised — every row was skipped</em>'}
      </div>

      <!-- Filter / search -->
      <div style="margin-bottom:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <input id="filter-input" type="text" placeholder="Filter rows… (brand, description, or row number)" style="padding:7px 10px;border-radius:6px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.15);color:inherit;min-width:280px">
        <button type="button" onclick="filterRows('all')"     class="btn btn-outline" style="padding:5px 10px;font-size:12px">All</button>
        <button type="button" onclick="filterRows('insert')"  class="btn btn-outline" style="padding:5px 10px;font-size:12px;color:#10b981;border-color:#10b981">Inserts</button>
        <button type="button" onclick="filterRows('update')"  class="btn btn-outline" style="padding:5px 10px;font-size:12px;color:#3b82f6;border-color:#3b82f6">Updates</button>
        <button type="button" onclick="filterRows('skip')"    class="btn btn-outline" style="padding:5px 10px;font-size:12px;color:#6b7280;border-color:#6b7280">Skipped</button>
        <button type="button" onclick="filterRows('fuzzy')"   class="btn btn-outline" style="padding:5px 10px;font-size:12px;color:#f59e0b;border-color:#f59e0b">Fuzzy</button>
      </div>

      <!-- Row table -->
      <div style="overflow-x:auto;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:8px">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead style="background:rgba(255,255,255,0.05);position:sticky;top:0">
            <tr>
              <th style="text-align:left;padding:8px 10px;width:50px">#</th>
              <th style="text-align:left;padding:8px 10px;width:80px">Action</th>
              <th style="text-align:left;padding:8px 10px">CSV row</th>
              <th style="text-align:left;padding:8px 10px">Match</th>
              <th style="text-align:left;padding:8px 10px">Changes</th>
              <th style="text-align:left;padding:8px 10px">Notes</th>
            </tr>
          </thead>
          <tbody>
            ${view.map(v => renderRow(v, isPreview)).join('')}
          </tbody>
        </table>
      </div>

      ${rows.length === 0 ? '<p style="opacity:0.6;margin-top:16px">No rows parsed.</p>' : ''}
    </div>

    <script>
      function filterRows(mode) {
        const rows = document.querySelectorAll('tr[data-action]')
        const q = (document.getElementById('filter-input').value || '').toLowerCase()
        rows.forEach(r => {
          const action = r.dataset.action
          const fuzzy = r.dataset.fuzzy === '1'
          const text = (r.textContent || '').toLowerCase()
          let show = true
          if (mode === 'insert' && action !== 'insert') show = false
          if (mode === 'update' && action !== 'update') show = false
          if (mode === 'skip' && action !== 'skip') show = false
          if (mode === 'fuzzy' && !fuzzy) show = false
          if (q && !text.includes(q)) show = false
          r.style.display = show ? '' : 'none'
        })
      }
      document.getElementById('filter-input')?.addEventListener('input', () => filterRows('all'))
    </script>
  `

  return c.html(layout(`Import #${imp.id} — Stock Admin`, body, user, 'stock'))
})

function hoursLeft(imp: any): number {
  if (!imp.committed_at) return 0
  const t = Date.parse(imp.committed_at.replace(' ', 'T') + 'Z')
  if (!Number.isFinite(t)) return 0
  const ms = 24 * 60 * 60 * 1000 - (Date.now() - t)
  return Math.max(0, Math.ceil(ms / (60 * 60 * 1000)))
}

function renderRow(v: { r: any; raw: any; before: any; after: any; fields: string[] }, isPreview: boolean): string {
  const { r, raw, before, after, fields } = v
  const isFuzzy = r.match_score !== null && r.match_score < 1

  // Build CSV row display
  const rawDisplay = Object.entries(raw).map(([k, val]) =>
    `<div style="font-size:12px"><strong style="opacity:0.65">${esc(k)}:</strong> ${esc(val)}</div>`
  ).join('')

  // Build changes display
  let changesHtml = ''
  if (r.action_taken === 'insert') {
    changesHtml = Object.entries(after).map(([k, val]) =>
      `<div style="font-size:12px"><strong style="opacity:0.65">${esc(k)}:</strong> <span style="color:#10b981">${esc(val ?? '')}</span></div>`
    ).join('')
  } else if (r.action_taken === 'update' && before) {
    changesHtml = fields.map(f => {
      const oldV = before[f]
      const newV = after[f]
      return `<div style="font-size:12px;line-height:1.5">
        <strong style="opacity:0.65">${esc(f)}:</strong>
        <span style="color:#dc2626;text-decoration:line-through;opacity:0.7">${esc(oldV ?? '∅')}</span>
        →
        <span style="color:#10b981">${esc(newV ?? '∅')}</span>
      </div>`
    }).join('')
  } else {
    changesHtml = `<em style="opacity:0.5;font-size:12px">no changes</em>`
  }

  // Build match info
  let matchHtml = ''
  if (r.action_taken === 'insert') {
    matchHtml = `<em style="opacity:0.6">new item</em>`
  } else if (r.matched_item_id && before) {
    const scoreBadge = r.match_score !== null && r.match_score < 1
      ? `<span style="display:inline-block;padding:1px 6px;border-radius:4px;background:#f59e0b;color:#fff;font-size:10px;font-weight:700;margin-left:6px">FUZZY ${r.match_score.toFixed(2)}</span>`
      : ''
    matchHtml = `<a href="/admin/stock/${r.matched_item_id}" target="_blank" style="color:inherit;text-decoration:underline">#${r.matched_item_id}</a>${scoreBadge}<div style="font-size:11px;opacity:0.7;margin-top:2px">${esc(before.brand)} — ${esc(before.description)}</div>`
  } else if (r.matched_item_id) {
    matchHtml = `<a href="/admin/stock/${r.matched_item_id}" target="_blank">#${r.matched_item_id}</a>`
  } else {
    matchHtml = `<em style="opacity:0.5">—</em>`
  }

  const reasonOnly = r.match_reason && (r.action_taken === 'skip' || (r.match_score !== null && r.match_score < THRESHOLDS_AUTO))
    ? `<div style="font-size:11px;opacity:0.6;margin-top:4px">${esc(r.match_reason)}</div>` : ''

  return /*html*/ `
    <tr data-action="${r.action_taken}" data-fuzzy="${isFuzzy ? '1' : '0'}" style="border-top:1px solid rgba(255,255,255,0.06);vertical-align:top">
      <td style="padding:8px 10px;font-family:monospace;opacity:0.7">${r.row_number}</td>
      <td style="padding:8px 10px">${actionBadge(r.action_taken)}</td>
      <td style="padding:8px 10px;max-width:280px">${rawDisplay}</td>
      <td style="padding:8px 10px;max-width:240px">${matchHtml}${reasonOnly}</td>
      <td style="padding:8px 10px;max-width:340px">${changesHtml}</td>
      <td style="padding:8px 10px;font-size:12px;opacity:0.8;max-width:240px">${esc(r.notes || '')}</td>
    </tr>
  `
}

const THRESHOLDS_AUTO = 0.85 // mirror of fuzzy.ts THRESHOLDS.autoMerge

// ─── POST /import/:id/commit ───────────────────────────────────────────────

bulk.post('/:id/commit', async (c) => {
  const user = c.get('user')
  const id = parseInt(c.req.param('id'), 10)
  if (!Number.isFinite(id)) return c.notFound()
  try {
    const result = await commitImport(c.env.DB, user, id)
    // After commit, redirect back to preview view (which will now show "undo" button)
    const params = new URLSearchParams({
      committed: '1',
      inserted: String(result.inserted),
      updated: String(result.updated),
      skipped: String(result.skipped),
      failed: String(result.failed),
    })
    return c.redirect(`/admin/stock/import/${id}?${params.toString()}`, 303)
  } catch (e) {
    return c.html(errorPage(user, 'Commit failed', (e as Error).message))
  }
})

// ─── POST /import/:id/discard ──────────────────────────────────────────────

bulk.post('/:id/discard', async (c) => {
  const id = parseInt(c.req.param('id'), 10)
  if (!Number.isFinite(id)) return c.notFound()
  await discardPreview(c.env.DB, id)
  return c.redirect('/admin/stock/import', 303)
})

// ─── POST /import/:id/undo ─────────────────────────────────────────────────

bulk.post('/:id/undo', async (c) => {
  const user = c.get('user')
  const id = parseInt(c.req.param('id'), 10)
  if (!Number.isFinite(id)) return c.notFound()
  const imp = await loadImport(c.env.DB, id)
  if (!imp) return c.notFound()
  if (!canUndo(imp)) {
    return c.html(errorPage(user, 'Cannot undo', 'Undo window has expired (24h after commit) or import is not in committed state.'))
  }
  try {
    const result = await undoImport(c.env.DB, user, id)
    const params = new URLSearchParams({
      undone: '1',
      deletions: String(result.deletions),
      restorations: String(result.restorations),
      failed: String(result.failed),
    })
    return c.redirect(`/admin/stock/import/${id}?${params.toString()}`, 303)
  } catch (e) {
    return c.html(errorPage(user, 'Undo failed', (e as Error).message))
  }
})

// ─── Error page helper ─────────────────────────────────────────────────────

function errorPage(user: AuthUser, title: string, detail: string): string {
  const body = /*html*/ `
    <div style="max-width:680px">
      <h1 style="color:#dc2626">⚠ ${esc(title)}</h1>
      <p style="font-size:15px">${esc(detail)}</p>
      <a href="/admin/stock/import" class="btn btn-outline"><i class="fas fa-arrow-left"></i> Back to import</a>
    </div>
  `
  return layout(title + ' — Stock Admin', body, user, 'stock')
}

export default bulk
