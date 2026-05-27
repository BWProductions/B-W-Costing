// ─────────────────────────────────────────────────────────────────────────
// Phase 4: Stock-take scan mode
// ─────────────────────────────────────────────────────────────────────────
// Keyboard-driven warehouse audit. Routes mounted under /admin/stock/scan.
// Sub-routes:
//   GET  /scan                       — sessions list + start-new form
//   POST /scan/new                   — create session, redirect into it
//   GET  /scan/:id                   — live scan page
//   POST /scan/:id/count             — record a count (JSON, used by page JS)
//   GET  /scan/:id/lookup            — search items (JSON, autocomplete)
//   GET  /scan/:id/progress          — progress snapshot (JSON, poll-able)
//   POST /scan/:id/finish            — apply counts → audit log → close
//   POST /scan/:id/cancel            — drop session without applying
//   GET  /scan/:id/report            — variance report page
//   GET  /scan/:id/report.csv        — variance report download

import { Hono } from 'hono'
import type { AuthUser } from '../lib/auth.js'
import { layout } from '../lib/layout.js'

type Bindings = { DB: D1Database }
type Variables = { user: AuthUser }
const scan = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// ── shared helpers ────────────────────────────────────────────────────────
function esc(s: any): string {
  if (s === null || s === undefined) return ''
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function flash(c: any): string {
  const msg = c.req.query('msg')
  const err = c.req.query('err')
  if (msg) return `<div class="card" style="background:#10b98122;border-left:4px solid #10b981;padding:12px 16px;margin-bottom:16px;color:#10b981"><i class="fas fa-check-circle"></i> ${esc(msg)}</div>`
  if (err) return `<div class="card" style="background:#ef444422;border-left:4px solid #ef4444;padding:12px 16px;margin-bottom:16px;color:#ef4444"><i class="fas fa-triangle-exclamation"></i> ${esc(err)}</div>`
  return ''
}

function csvCell(v: any): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

// ── GET /admin/stock/scan — sessions index ────────────────────────────────
scan.get('/', async (c) => {
  const user = c.get('user')

  // Active items count — what 100% would look like
  const totalRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM stock_items WHERE active=1`
  ).first<{ n: number }>()
  const totalActive = totalRow?.n ?? 0

  const sessions = await c.env.DB.prepare(
    `SELECT s.id, s.name, s.status, s.started_at, s.finished_at,
            s.started_by, s.finished_by, s.applied_count, s.variance_sum, s.notes,
            (SELECT COUNT(*) FROM stocktake_counts WHERE session_id=s.id) AS counted_n
     FROM stocktake_sessions s
     ORDER BY (s.status='open') DESC, s.started_at DESC
     LIMIT 50`
  ).all<any>()

  const today = new Date().toISOString().slice(0, 10)
  const defaultName = `${today} Stock-take`

  const rowsHtml = sessions.results.length === 0
    ? `<tr><td colspan="7" class="muted" style="text-align:center;padding:24px">No stock-take sessions yet — start one below.</td></tr>`
    : sessions.results.map((s: any) => {
        const pct = totalActive > 0 ? Math.round((s.counted_n / totalActive) * 100) : 0
        const statusBadge = s.status === 'open'
          ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:2px 8px;border-radius:10px;background:#10b98122;color:#10b981;font-weight:600"><i class="fas fa-circle-dot" style="font-size:8px"></i>Open</span>`
          : s.status === 'closed'
          ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:2px 8px;border-radius:10px;background:#3b82f622;color:#3b82f6;font-weight:600"><i class="fas fa-check" style="font-size:10px"></i>Closed</span>`
          : `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:2px 8px;border-radius:10px;background:#6b728022;color:#6b7280;font-weight:600"><i class="fas fa-ban" style="font-size:10px"></i>Cancelled</span>`
        const action = s.status === 'open'
          ? `<a href="/admin/stock/scan/${s.id}" class="btn btn-primary btn-sm"><i class="fas fa-barcode"></i> Resume</a>`
          : `<a href="/admin/stock/scan/${s.id}/report" class="btn btn-outline btn-sm"><i class="fas fa-chart-line"></i> Report</a>`
        return `<tr>
          <td><strong>${esc(s.name)}</strong>${s.notes ? `<div class="muted" style="font-size:11px">${esc(s.notes)}</div>` : ''}</td>
          <td>${statusBadge}</td>
          <td style="font-size:12px">${esc(String(s.started_at || '').replace('T',' ').slice(0,16))}<div class="muted" style="font-size:11px">${esc(s.started_by) || '—'}</div></td>
          <td style="text-align:right"><strong>${s.counted_n}</strong> <span class="muted">/ ${totalActive}</span><div class="muted" style="font-size:11px">${pct}%</div></td>
          <td style="text-align:right">${s.status === 'closed' ? `<strong>${s.applied_count}</strong> updated` : '—'}</td>
          <td style="text-align:right">${s.status === 'closed' ? `<span style="color:${s.variance_sum > 0 ? '#f59e0b' : '#6b7280'}">±${s.variance_sum}</span>` : '—'}</td>
          <td style="text-align:right">${action}</td>
        </tr>`
      }).join('')

  const body = `
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
      <div>
        <h1 style="margin:0"><i class="fas fa-clipboard-check"></i> Stock-take Sessions</h1>
        <p class="text-muted" style="margin:4px 0 0">Keyboard-driven warehouse audits. ${totalActive} active items to count.</p>
      </div>
      <div style="display:flex;gap:8px">
        <a href="/admin/stock" class="btn btn-outline"><i class="fas fa-arrow-left"></i> Back to stock</a>
      </div>
    </div>

    ${flash(c)}

    <div class="card" style="padding:20px;margin-bottom:16px;max-width:720px">
      <h2 style="margin:0 0 12px;font-size:18px"><i class="fas fa-plus-circle"></i> Start new session</h2>
      <form method="post" action="/admin/stock/scan/new" style="display:grid;grid-template-columns:2fr 3fr auto;gap:12px;align-items:end">
        <div>
          <label>Session name</label>
          <input type="text" name="name" required value="${esc(defaultName)}" />
        </div>
        <div>
          <label>Notes <span class="muted" style="font-weight:400">(optional)</span></label>
          <input type="text" name="notes" placeholder="e.g. quarterly audit, R59 warehouse" />
        </div>
        <button type="submit" class="btn btn-primary"><i class="fas fa-play"></i> Start</button>
      </form>
    </div>

    <div class="card" style="padding:0;overflow:hidden">
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:var(--surface);text-align:left">
            <th style="padding:10px 12px">Session</th>
            <th style="padding:10px 12px">Status</th>
            <th style="padding:10px 12px">Started</th>
            <th style="padding:10px 12px;text-align:right">Counted</th>
            <th style="padding:10px 12px;text-align:right">Applied</th>
            <th style="padding:10px 12px;text-align:right">Variance</th>
            <th style="padding:10px 12px;text-align:right"></th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  `
  return c.html(layout('Stock-take Sessions', body, user, 'stock-admin'))
})

// ── POST /admin/stock/scan/new — create session ───────────────────────────
scan.post('/new', async (c) => {
  const user = c.get('user')
  const form = await c.req.parseBody()
  const name = String(form.name || '').trim()
  const notes = String(form.notes || '').trim() || null

  if (!name) return c.redirect('/admin/stock/scan?err=' + encodeURIComponent('Session name is required'))

  const result = await c.env.DB.prepare(
    `INSERT INTO stocktake_sessions (name, notes, started_by_id, started_by)
     VALUES (?, ?, ?, ?)`
  ).bind(name, notes, user?.id ?? null, user?.name ?? null).run()

  const id = result.meta.last_row_id
  return c.redirect(`/admin/stock/scan/${id}`)
})

// ── GET /admin/stock/scan/:id — live scan page ────────────────────────────
scan.get('/:id', async (c) => {
  const user = c.get('user')
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) return c.redirect('/admin/stock/scan?err=Invalid+session+id')

  const session = await c.env.DB.prepare(
    `SELECT * FROM stocktake_sessions WHERE id=?`
  ).bind(id).first<any>()

  if (!session) return c.redirect('/admin/stock/scan?err=Session+not+found')

  // If session is already closed, redirect to report
  if (session.status !== 'open') {
    return c.redirect(`/admin/stock/scan/${id}/report`)
  }

  // Counts in this session, for status display + sidebar
  const counts = await c.env.DB.prepare(
    `SELECT c.stock_item_id, c.counted_qty, c.prev_qty, c.variance, c.counted_at, c.counted_by,
            i.brand, i.description
     FROM stocktake_counts c
     LEFT JOIN stock_items i ON i.id = c.stock_item_id
     WHERE c.session_id=?
     ORDER BY c.counted_at DESC
     LIMIT 50`
  ).bind(id).all<any>()

  const totalRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM stock_items WHERE active=1`
  ).first<{ n: number }>()
  const totalActive = totalRow?.n ?? 0

  const countedRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM stocktake_counts WHERE session_id=?`
  ).bind(id).first<{ n: number }>()
  const countedN = countedRow?.n ?? 0

  const varianceRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM stocktake_counts WHERE session_id=? AND variance != 0`
  ).bind(id).first<{ n: number }>()
  const varianceN = varianceRow?.n ?? 0

  const recentList = counts.results.length === 0
    ? `<li class="muted" style="padding:8px 0;font-style:italic">Nothing counted yet. Scan or type an item to begin.</li>`
    : counts.results.map((r: any) => {
        const variance = r.variance
        const vColor = variance === 0 ? '#10b981' : variance > 0 ? '#f59e0b' : '#ef4444'
        const vSign = variance > 0 ? '+' : ''
        const t = String(r.counted_at || '').replace('T', ' ').slice(11, 16)
        return `<li style="padding:6px 0;border-bottom:1px dashed var(--border);font-size:12px" data-item-id="${r.stock_item_id}">
          <div style="display:flex;justify-content:space-between;gap:8px">
            <span><strong>${esc(r.brand)}</strong> — ${esc(r.description)}</span>
            <span class="muted">${t}</span>
          </div>
          <div style="display:flex;justify-content:space-between;gap:8px;margin-top:2px">
            <span class="muted">was ${r.prev_qty}, counted ${r.counted_qty}</span>
            <strong style="color:${vColor}">${vSign}${variance}</strong>
          </div>
        </li>`
      }).join('')

  const body = `
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
      <div>
        <h1 style="margin:0"><i class="fas fa-barcode"></i> ${esc(session.name)}</h1>
        <p class="text-muted" style="margin:4px 0 0">
          Started ${esc(String(session.started_at || '').replace('T',' ').slice(0,16))} by ${esc(session.started_by) || '—'}
          ${session.notes ? ` · ${esc(session.notes)}` : ''}
        </p>
      </div>
      <div style="display:flex;gap:8px">
        <a href="/admin/stock/scan/${id}/report" class="btn btn-outline"><i class="fas fa-chart-line"></i> Variance report</a>
        <a href="/admin/stock/scan" class="btn btn-outline"><i class="fas fa-arrow-left"></i> Sessions</a>
      </div>
    </div>

    ${flash(c)}

    <div style="display:grid;grid-template-columns:1fr 360px;gap:16px;align-items:flex-start">
      <!-- LEFT: scan panel -->
      <div>
        <div class="card" style="padding:20px;margin-bottom:16px">
          <label for="scan-input" style="font-size:13px;font-weight:600">
            <i class="fas fa-magnifying-glass"></i> Scan ID, or type brand + description
            <span class="muted" style="font-weight:400;font-size:11px;margin-left:8px">press <kbd>/</kbd> to focus, <kbd>Esc</kbd> to clear</span>
          </label>
          <input id="scan-input" type="text" autocomplete="off" spellcheck="false"
                 placeholder="e.g. 393  or  Castle Lite  or  3m banner"
                 style="font-size:18px;padding:12px;width:100%;margin-top:6px" autofocus />

          <div id="scan-results" style="margin-top:8px"></div>

          <div id="scan-item-card" style="display:none;margin-top:16px;padding:16px;background:var(--surface);border:2px solid var(--bw-gold);border-radius:8px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px">
              <div>
                <strong id="ci-name" style="font-size:18px"></strong>
                <div class="muted" style="font-size:12px">
                  ID <span id="ci-id"></span> · <span id="ci-custody"></span> · <span id="ci-location"></span>
                </div>
              </div>
              <div id="ci-status" style="text-align:right"></div>
            </div>

            <div style="display:grid;grid-template-columns:auto auto 1fr auto;gap:12px;align-items:end">
              <div>
                <label style="font-size:11px">Current</label>
                <div id="ci-prev" style="font-size:24px;font-weight:700;font-family:monospace"></div>
              </div>
              <div style="font-size:24px;color:var(--muted);padding-bottom:4px">→</div>
              <div>
                <label for="count-input" style="font-size:11px">Counted <span style="color:#ef4444">*</span></label>
                <input id="count-input" type="number" inputmode="numeric" min="0" step="1"
                       style="font-size:20px;padding:8px;width:100%;font-family:monospace" />
              </div>
              <button id="count-submit" type="button" class="btn btn-primary" style="height:42px">
                <i class="fas fa-check"></i> Save &amp; next
              </button>
            </div>
            <div id="ci-variance-preview" class="muted" style="font-size:12px;margin-top:6px;min-height:16px"></div>
          </div>

          <div id="scan-feedback" style="margin-top:12px;min-height:24px"></div>
        </div>

        <!-- Recent counts -->
        <div class="card" style="padding:16px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <strong><i class="fas fa-clock"></i> Recent counts (this session)</strong>
            <span class="muted" style="font-size:11px"><span id="recent-count-n">${countedN}</span> items counted</span>
          </div>
          <ul id="recent-list" style="margin:0;padding:0;list-style:none">${recentList}</ul>
        </div>
      </div>

      <!-- RIGHT: progress + finish -->
      <div>
        <div class="card" style="padding:16px;margin-bottom:16px">
          <h3 style="margin:0 0 12px;font-size:14px"><i class="fas fa-gauge-high"></i> Progress</h3>
          <div style="font-size:13px;line-height:1.8">
            <div style="display:flex;justify-content:space-between"><span>Counted</span><strong id="prog-counted">${countedN}</strong></div>
            <div style="display:flex;justify-content:space-between"><span>Outstanding</span><strong id="prog-outstanding" style="color:#f59e0b">${totalActive - countedN}</strong></div>
            <div style="display:flex;justify-content:space-between"><span>Variances</span><strong id="prog-variances" style="color:${varianceN > 0 ? '#ef4444' : '#10b981'}">${varianceN}</strong></div>
            <div style="display:flex;justify-content:space-between;padding-top:8px;margin-top:8px;border-top:1px solid var(--border)"><span>Total active</span><strong>${totalActive}</strong></div>
          </div>
          <div style="margin-top:12px;height:8px;background:var(--surface);border-radius:4px;overflow:hidden">
            <div id="prog-bar" style="height:100%;background:linear-gradient(90deg,#10b981,#06b6d4);width:${totalActive > 0 ? Math.round((countedN/totalActive)*100) : 0}%;transition:width .3s"></div>
          </div>
          <div class="muted" style="font-size:11px;margin-top:4px;text-align:right"><span id="prog-pct">${totalActive > 0 ? Math.round((countedN/totalActive)*100) : 0}</span>% complete</div>
        </div>

        <div class="card" style="padding:16px;margin-bottom:16px">
          <h3 style="margin:0 0 8px;font-size:14px"><i class="fas fa-flag-checkered"></i> Finish session</h3>
          <p class="muted" style="font-size:12px;margin:0 0 12px">Applies counted quantities to stock and writes audit log entries.</p>
          <form method="post" action="/admin/stock/scan/${id}/finish" onsubmit="return confirm('Apply ' + document.getElementById('prog-counted').textContent + ' counted quantities and close this session?\\n\\nUncounted items will be left alone.')">
            <button type="submit" class="btn btn-primary" style="width:100%"><i class="fas fa-check-double"></i> Apply &amp; close</button>
          </form>
          <form method="post" action="/admin/stock/scan/${id}/cancel" style="margin-top:8px" onsubmit="return confirm('Discard this session? Counts will NOT be applied to stock.\\n\\nThe session record is kept for reference.')">
            <button type="submit" class="btn btn-outline btn-sm" style="width:100%;color:#ef4444;border-color:#ef4444"><i class="fas fa-ban"></i> Cancel session</button>
          </form>
        </div>

        <div class="card" style="padding:12px;font-size:11px" class="muted">
          <strong style="font-size:12px"><i class="fas fa-keyboard"></i> Shortcuts</strong>
          <ul style="margin:6px 0 0;padding-left:18px;line-height:1.7">
            <li><kbd>/</kbd> — focus scanner</li>
            <li><kbd>↓</kbd> / <kbd>↑</kbd> — navigate results</li>
            <li><kbd>Enter</kbd> — pick / commit count</li>
            <li><kbd>Esc</kbd> — clear / cancel</li>
          </ul>
        </div>
      </div>
    </div>

    <script>
    (function () {
      const sessionId = ${id}
      const $ = (s) => document.querySelector(s)
      const scanInput   = $('#scan-input')
      const results     = $('#scan-results')
      const card        = $('#scan-item-card')
      const ciName      = $('#ci-name')
      const ciId        = $('#ci-id')
      const ciCustody   = $('#ci-custody')
      const ciLocation  = $('#ci-location')
      const ciStatus    = $('#ci-status')
      const ciPrev      = $('#ci-prev')
      const countInput  = $('#count-input')
      const countBtn    = $('#count-submit')
      const variancePrev = $('#ci-variance-preview')
      const feedback    = $('#scan-feedback')

      let currentItem = null   // selected item object
      let searchTimer = null
      let searchAbort = null
      let highlightIdx = -1
      let lastResults = []

      function showFeedback(html, color) {
        feedback.innerHTML = '<div style="padding:8px 12px;border-radius:6px;background:' + color + '22;color:' + color + ';font-size:13px"><i class="fas fa-circle-info"></i> ' + html + '</div>'
        clearTimeout(showFeedback._t)
        showFeedback._t = setTimeout(() => { feedback.innerHTML = '' }, 4000)
      }

      function clearCard() {
        currentItem = null
        card.style.display = 'none'
        countInput.value = ''
        variancePrev.textContent = ''
      }

      function selectItem(item) {
        currentItem = item
        results.innerHTML = ''
        lastResults = []
        highlightIdx = -1

        ciName.textContent = item.brand + ' — ' + item.description
        ciId.textContent = '#' + item.id
        ciCustody.textContent = item.custody_type || 'owned'
        ciLocation.textContent = item.location || 'no location'
        ciPrev.textContent = item.qty_on_hand
        ciStatus.innerHTML = item.already_counted_qty !== null && item.already_counted_qty !== undefined
          ? '<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:#3b82f622;color:#3b82f6;font-weight:600">Already counted: ' + item.already_counted_qty + '</span>'
          : '<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:#6b728022;color:#6b7280;font-weight:600">Not yet counted</span>'

        card.style.display = 'block'
        countInput.value = item.already_counted_qty !== null && item.already_counted_qty !== undefined ? item.already_counted_qty : ''
        setTimeout(() => { countInput.focus(); countInput.select() }, 50)
      }

      function renderResults(items) {
        lastResults = items
        highlightIdx = items.length > 0 ? 0 : -1
        if (items.length === 0) {
          results.innerHTML = '<div class="muted" style="padding:8px;font-size:12px;font-style:italic">No matches.</div>'
          return
        }
        results.innerHTML = items.map((item, i) => {
          const counted = item.already_counted_qty !== null && item.already_counted_qty !== undefined
          return '<div class="scan-result" data-idx="' + i + '" style="padding:8px 12px;border:1px solid var(--border);border-left:3px solid ' + (counted ? '#3b82f6' : 'var(--bw-gold)') + ';border-radius:4px;margin-bottom:4px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;background:' + (i === 0 ? 'var(--surface)' : 'transparent') + '">'
            + '<div>'
              + '<strong>' + escapeHtml(item.brand) + '</strong> — ' + escapeHtml(item.description)
              + '<div class="muted" style="font-size:11px">ID #' + item.id + ' · qty ' + item.qty_on_hand + (item.location ? ' · ' + escapeHtml(item.location) : '') + (counted ? ' · <span style="color:#3b82f6">counted ' + item.already_counted_qty + '</span>' : '') + '</div>'
            + '</div>'
            + '<span class="muted" style="font-size:11px">match ' + Math.round(item.score * 100) + '%</span>'
          + '</div>'
        }).join('')
        results.querySelectorAll('.scan-result').forEach((el) => {
          el.addEventListener('click', () => selectItem(items[parseInt(el.dataset.idx, 10)]))
        })
      }

      function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({
          '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[m]))
      }

      function setHighlight(idx) {
        const els = results.querySelectorAll('.scan-result')
        if (els.length === 0) return
        highlightIdx = Math.max(0, Math.min(els.length - 1, idx))
        els.forEach((el, i) => {
          el.style.background = i === highlightIdx ? 'var(--surface)' : 'transparent'
        })
        els[highlightIdx].scrollIntoView({ block: 'nearest' })
      }

      async function search(q) {
        if (searchAbort) searchAbort.abort()
        searchAbort = new AbortController()
        try {
          const res = await fetch('/admin/stock/scan/' + sessionId + '/lookup?q=' + encodeURIComponent(q), { signal: searchAbort.signal })
          const data = await res.json()
          if (data.items && data.items.length === 1 && data.items[0].exact_id) {
            // Exact ID match — auto-select
            selectItem(data.items[0])
          } else {
            renderResults(data.items || [])
          }
        } catch (e) {
          if (e.name !== 'AbortError') console.error(e)
        }
      }

      scanInput.addEventListener('input', () => {
        clearTimeout(searchTimer)
        const q = scanInput.value.trim()
        if (q.length === 0) {
          results.innerHTML = ''
          clearCard()
          return
        }
        searchTimer = setTimeout(() => search(q), 120)
      })

      scanInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          scanInput.value = ''
          results.innerHTML = ''
          clearCard()
        } else if (e.key === 'ArrowDown') {
          e.preventDefault()
          setHighlight(highlightIdx + 1)
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          setHighlight(highlightIdx - 1)
        } else if (e.key === 'Enter') {
          e.preventDefault()
          if (lastResults.length > 0 && highlightIdx >= 0) {
            selectItem(lastResults[highlightIdx])
          }
        }
      })

      countInput.addEventListener('input', () => {
        if (!currentItem) return
        const counted = parseInt(countInput.value, 10)
        if (Number.isFinite(counted)) {
          const variance = counted - currentItem.qty_on_hand
          const sign = variance > 0 ? '+' : ''
          const color = variance === 0 ? '#10b981' : Math.abs(variance) >= 5 ? '#ef4444' : '#f59e0b'
          variancePrev.innerHTML = 'Variance: <strong style="color:' + color + '">' + sign + variance + '</strong>' + (Math.abs(variance) >= 10 ? ' <span style="color:#ef4444">⚠ large variance</span>' : '')
        } else {
          variancePrev.textContent = ''
        }
      })

      countInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commitCount()
        } else if (e.key === 'Escape') {
          scanInput.value = ''
          scanInput.focus()
          clearCard()
        }
      })

      countBtn.addEventListener('click', commitCount)

      async function commitCount() {
        if (!currentItem) return
        const counted = parseInt(countInput.value, 10)
        if (!Number.isFinite(counted) || counted < 0) {
          showFeedback('Enter a valid count (0 or higher).', '#ef4444')
          return
        }
        countBtn.disabled = true
        try {
          const res = await fetch('/admin/stock/scan/' + sessionId + '/count', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stock_item_id: currentItem.id, counted_qty: counted })
          })
          const data = await res.json()
          if (!data.ok) throw new Error(data.error || 'count failed')
          showFeedback('Saved <strong>' + escapeHtml(currentItem.brand) + ' — ' + escapeHtml(currentItem.description) + '</strong>: counted ' + counted + ' (variance ' + (data.variance > 0 ? '+' : '') + data.variance + ')', '#10b981')
          // Update progress live
          $('#prog-counted').textContent = data.progress.counted_n
          $('#recent-count-n').textContent = data.progress.counted_n
          $('#prog-outstanding').textContent = data.progress.outstanding
          $('#prog-variances').textContent = data.progress.variance_n
          $('#prog-pct').textContent = data.progress.pct
          $('#prog-bar').style.width = data.progress.pct + '%'

          // Prepend to recent list
          const recent = $('#recent-list')
          const vColor = data.variance === 0 ? '#10b981' : data.variance > 0 ? '#f59e0b' : '#ef4444'
          const vSign = data.variance > 0 ? '+' : ''
          const t = new Date().toTimeString().slice(0, 5)
          const li = document.createElement('li')
          li.style.cssText = 'padding:6px 0;border-bottom:1px dashed var(--border);font-size:12px'
          li.dataset.itemId = currentItem.id
          li.innerHTML = '<div style="display:flex;justify-content:space-between;gap:8px">'
            + '<span><strong>' + escapeHtml(currentItem.brand) + '</strong> — ' + escapeHtml(currentItem.description) + '</span>'
            + '<span class="muted">' + t + '</span>'
            + '</div>'
            + '<div style="display:flex;justify-content:space-between;gap:8px;margin-top:2px">'
            + '<span class="muted">was ' + currentItem.qty_on_hand + ', counted ' + counted + '</span>'
            + '<strong style="color:' + vColor + '">' + vSign + data.variance + '</strong>'
            + '</div>'
          // Remove existing entry for same item, then prepend
          recent.querySelectorAll('li[data-item-id="' + currentItem.id + '"]').forEach((el) => el.remove())
          // Drop placeholder if present
          const placeholder = recent.querySelector('li.muted')
          if (placeholder) placeholder.remove()
          recent.insertBefore(li, recent.firstChild)

          // Reset and refocus
          scanInput.value = ''
          results.innerHTML = ''
          clearCard()
          scanInput.focus()
        } catch (e) {
          showFeedback('Save failed: ' + e.message, '#ef4444')
        } finally {
          countBtn.disabled = false
        }
      }

      // Global keyboard shortcut: / focuses scanner
      document.addEventListener('keydown', (e) => {
        if (e.key === '/' && document.activeElement !== scanInput && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
          e.preventDefault()
          scanInput.focus()
          scanInput.select()
        }
      })
    })()
    </script>
  `
  return c.html(layout(`Scan: ${session.name}`, body, user, 'stock-admin'))
})

// ── GET /admin/stock/scan/:id/lookup — item search (JSON) ─────────────────
scan.get('/:id/lookup', async (c) => {
  const sessionId = Number(c.req.param('id'))
  const q = (c.req.query('q') || '').trim()
  if (!q) return c.json({ items: [] })

  // If q is a pure number, treat as exact ID lookup first
  const asNum = parseInt(q, 10)
  if (/^\d+$/.test(q) && Number.isFinite(asNum)) {
    const exact = await c.env.DB.prepare(
      `SELECT i.id, i.brand, i.description, i.qty_on_hand, i.custody_type, i.location, i.active,
              c.counted_qty AS already_counted_qty
       FROM stock_items i
       LEFT JOIN stocktake_counts c ON c.stock_item_id = i.id AND c.session_id = ?
       WHERE i.id = ? AND i.active = 1`
    ).bind(sessionId, asNum).first<any>()
    if (exact) {
      return c.json({ items: [{ ...exact, score: 1.0, exact_id: true }] })
    }
  }

  // Token-AND fuzzy search across brand + description.
  // Each token must appear (LIKE) in concat(brand, description, location).
  const tokens = q.toLowerCase().split(/\s+/).filter(t => t.length > 0).slice(0, 6)
  const conds: string[] = []
  const params: any[] = [sessionId]
  for (const t of tokens) {
    conds.push(`LOWER(i.brand || ' ' || i.description || ' ' || COALESCE(i.location,'')) LIKE ?`)
    params.push(`%${t}%`)
  }
  const where = conds.length > 0 ? `(${conds.join(' AND ')}) AND i.active = 1` : 'i.active = 1'

  const rows = await c.env.DB.prepare(
    `SELECT i.id, i.brand, i.description, i.qty_on_hand, i.custody_type, i.location,
            c.counted_qty AS already_counted_qty
     FROM stock_items i
     LEFT JOIN stocktake_counts c ON c.stock_item_id = i.id AND c.session_id = ?
     WHERE ${where}
     ORDER BY i.brand, i.description
     LIMIT 8`
  ).bind(...params).all<any>()

  // Lightweight scoring: count of token positions (earlier = better) plus boost for brand-prefix match
  const scored = rows.results.map((r: any) => {
    const hay = (r.brand + ' ' + r.description + ' ' + (r.location || '')).toLowerCase()
    let score = 0
    let matched = 0
    for (const t of tokens) {
      const idx = hay.indexOf(t)
      if (idx >= 0) {
        matched++
        score += 1 - Math.min(idx, 30) / 30 * 0.3
      }
    }
    if (r.brand.toLowerCase().startsWith(tokens[0] || '')) score += 0.5
    return { ...r, score: tokens.length > 0 ? Math.min(1, score / tokens.length) : 0.5 }
  }).sort((a: any, b: any) => b.score - a.score)

  return c.json({ items: scored })
})

// ── POST /admin/stock/scan/:id/count — record one count ───────────────────
scan.post('/:id/count', async (c) => {
  const user = c.get('user')
  const sessionId = Number(c.req.param('id'))
  if (!Number.isFinite(sessionId)) return c.json({ ok: false, error: 'Invalid session' }, 400)

  const session = await c.env.DB.prepare(
    `SELECT id, status FROM stocktake_sessions WHERE id=?`
  ).bind(sessionId).first<any>()
  if (!session) return c.json({ ok: false, error: 'Session not found' }, 404)
  if (session.status !== 'open') return c.json({ ok: false, error: 'Session is ' + session.status }, 409)

  const body = await c.req.json<any>().catch(() => ({}))
  const stockItemId = Number(body.stock_item_id)
  const countedQty  = Number(body.counted_qty)
  if (!Number.isFinite(stockItemId)) return c.json({ ok: false, error: 'Invalid item id' }, 400)
  if (!Number.isFinite(countedQty) || countedQty < 0) return c.json({ ok: false, error: 'Invalid count' }, 400)

  const item = await c.env.DB.prepare(
    `SELECT id, qty_on_hand, active FROM stock_items WHERE id=?`
  ).bind(stockItemId).first<any>()
  if (!item) return c.json({ ok: false, error: 'Item not found' }, 404)
  if (item.active !== 1) return c.json({ ok: false, error: 'Item is not active' }, 409)

  const prevQty = item.qty_on_hand
  const variance = countedQty - prevQty

  // Upsert via DELETE+INSERT (D1 supports ON CONFLICT but this is portable)
  await c.env.DB.prepare(
    `DELETE FROM stocktake_counts WHERE session_id=? AND stock_item_id=?`
  ).bind(sessionId, stockItemId).run()

  await c.env.DB.prepare(
    `INSERT INTO stocktake_counts
     (session_id, stock_item_id, counted_qty, prev_qty, variance, counted_by_id, counted_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(sessionId, stockItemId, countedQty, prevQty, variance, user?.id ?? null, user?.name ?? null).run()

  // Progress snapshot
  const totalRow   = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM stock_items WHERE active=1`).first<{ n: number }>()
  const countedRow = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM stocktake_counts WHERE session_id=?`).bind(sessionId).first<{ n: number }>()
  const varianceRow = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM stocktake_counts WHERE session_id=? AND variance != 0`).bind(sessionId).first<{ n: number }>()
  const totalActive = totalRow?.n ?? 0
  const countedN    = countedRow?.n ?? 0
  const varianceN   = varianceRow?.n ?? 0

  return c.json({
    ok: true,
    variance,
    prev_qty: prevQty,
    counted_qty: countedQty,
    progress: {
      counted_n: countedN,
      outstanding: totalActive - countedN,
      variance_n: varianceN,
      total_active: totalActive,
      pct: totalActive > 0 ? Math.round((countedN / totalActive) * 100) : 0,
    },
  })
})

// ── POST /admin/stock/scan/:id/finish — apply counts + close ──────────────
scan.post('/:id/finish', async (c) => {
  const user = c.get('user')
  const sessionId = Number(c.req.param('id'))
  if (!Number.isFinite(sessionId)) return c.redirect('/admin/stock/scan?err=Invalid+session')

  const session = await c.env.DB.prepare(
    `SELECT id, name, status FROM stocktake_sessions WHERE id=?`
  ).bind(sessionId).first<any>()
  if (!session) return c.redirect('/admin/stock/scan?err=Session+not+found')
  if (session.status !== 'open') return c.redirect(`/admin/stock/scan/${sessionId}/report?err=` + encodeURIComponent('Session already ' + session.status))

  // Pull all counts with current qty so we apply only items where counted != qty_on_hand
  const counts = await c.env.DB.prepare(
    `SELECT c.stock_item_id, c.counted_qty, c.variance, i.qty_on_hand AS current_qty, i.brand, i.description
     FROM stocktake_counts c
     JOIN stock_items i ON i.id = c.stock_item_id
     WHERE c.session_id = ? AND i.active = 1`
  ).bind(sessionId).all<any>()

  let appliedCount = 0
  let varianceSum  = 0
  const reason = `Stock-take #${sessionId}: ${session.name}`

  for (const r of counts.results) {
    varianceSum += Math.abs(r.variance)
    if (r.counted_qty === r.current_qty) continue   // no-op, already matches
    // Apply qty change
    await c.env.DB.prepare(
      `UPDATE stock_items SET qty_on_hand=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
    ).bind(r.counted_qty, r.stock_item_id).run()
    // Log to audit trail as a 'stocktake' action with delta
    await c.env.DB.prepare(
      `INSERT INTO stock_movements
       (stock_item_id, action, field_changed, old_value, new_value, delta, reason, user_id, user_name)
       VALUES (?, 'stocktake', 'qty_on_hand', ?, ?, ?, ?, ?, ?)`
    ).bind(
      r.stock_item_id,
      String(r.current_qty),
      String(r.counted_qty),
      r.counted_qty - r.current_qty,
      reason,
      user?.id ?? null,
      user?.name ?? null,
    ).run()
    appliedCount++
  }

  await c.env.DB.prepare(
    `UPDATE stocktake_sessions
     SET status='closed', finished_at=CURRENT_TIMESTAMP, finished_by=?, applied_count=?, variance_sum=?
     WHERE id=?`
  ).bind(user?.name ?? null, appliedCount, varianceSum, sessionId).run()

  return c.redirect(`/admin/stock/scan/${sessionId}/report?msg=` + encodeURIComponent(`Session closed — ${appliedCount} item${appliedCount===1?'':'s'} updated, ±${varianceSum} total variance`))
})

// ── POST /admin/stock/scan/:id/cancel — close without applying ────────────
scan.post('/:id/cancel', async (c) => {
  const user = c.get('user')
  const sessionId = Number(c.req.param('id'))
  if (!Number.isFinite(sessionId)) return c.redirect('/admin/stock/scan?err=Invalid+session')

  const session = await c.env.DB.prepare(
    `SELECT id, status FROM stocktake_sessions WHERE id=?`
  ).bind(sessionId).first<any>()
  if (!session) return c.redirect('/admin/stock/scan?err=Session+not+found')
  if (session.status !== 'open') return c.redirect(`/admin/stock/scan/${sessionId}/report`)

  await c.env.DB.prepare(
    `UPDATE stocktake_sessions
     SET status='cancelled', finished_at=CURRENT_TIMESTAMP, finished_by=?
     WHERE id=?`
  ).bind(user?.name ?? null, sessionId).run()

  return c.redirect('/admin/stock/scan?msg=' + encodeURIComponent('Session cancelled — no stock changes were applied'))
})

// ── GET /admin/stock/scan/:id/report — variance report ────────────────────
scan.get('/:id/report', async (c) => {
  const user = c.get('user')
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) return c.redirect('/admin/stock/scan?err=Invalid+session+id')

  const session = await c.env.DB.prepare(
    `SELECT * FROM stocktake_sessions WHERE id=?`
  ).bind(id).first<any>()
  if (!session) return c.redirect('/admin/stock/scan?err=Session+not+found')

  const filter = c.req.query('filter') || 'all'   // all | variance | match | uncounted

  const counts = await c.env.DB.prepare(
    `SELECT c.stock_item_id, c.counted_qty, c.prev_qty, c.variance, c.counted_at, c.counted_by,
            i.brand, i.description, i.location, i.custody_type, i.active, i.qty_on_hand AS current_qty
     FROM stocktake_counts c
     LEFT JOIN stock_items i ON i.id = c.stock_item_id
     WHERE c.session_id=?
     ORDER BY ABS(c.variance) DESC, i.brand, i.description`
  ).bind(id).all<any>()

  // Uncounted items list (only meaningful when session is closed/cancelled, but useful anytime)
  const uncounted = await c.env.DB.prepare(
    `SELECT i.id, i.brand, i.description, i.qty_on_hand, i.location, i.custody_type
     FROM stock_items i
     WHERE i.active=1
       AND i.id NOT IN (SELECT stock_item_id FROM stocktake_counts WHERE session_id=?)
     ORDER BY i.brand, i.description`
  ).bind(id).all<any>()

  let visible: any[] = []
  if (filter === 'variance') visible = counts.results.filter((r: any) => r.variance !== 0)
  else if (filter === 'match') visible = counts.results.filter((r: any) => r.variance === 0)
  else if (filter === 'uncounted') visible = uncounted.results.map((r: any) => ({ ...r, _uncounted: true }))
  else visible = counts.results

  const totalCounted   = counts.results.length
  const totalVariance  = counts.results.filter((r: any) => r.variance !== 0).length
  const totalMatch     = totalCounted - totalVariance
  const totalUncounted = uncounted.results.length

  const filterLink = (k: string, label: string, n: number, color: string) =>
    `<a href="/admin/stock/scan/${id}/report?filter=${k}" class="btn ${filter === k ? 'btn-primary' : 'btn-outline'} btn-sm" style="${filter === k ? '' : `color:${color};border-color:${color}`}">${label} <strong>${n}</strong></a>`

  const statusBadge = session.status === 'open'
    ? `<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:#10b98122;color:#10b981;font-weight:600">Open</span>`
    : session.status === 'closed'
    ? `<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:#3b82f622;color:#3b82f6;font-weight:600">Closed</span>`
    : `<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:#6b728022;color:#6b7280;font-weight:600">Cancelled</span>`

  const rowsHtml = visible.length === 0
    ? `<tr><td colspan="7" class="muted" style="text-align:center;padding:24px;font-style:italic">No items match this filter.</td></tr>`
    : visible.map((r: any) => {
        if (r._uncounted) {
          return `<tr style="background:#6b728011">
            <td><a href="/admin/stock/${r.id}" style="color:var(--bw-gold);text-decoration:none"><strong>${esc(r.brand)}</strong></a></td>
            <td>${esc(r.description)}</td>
            <td class="muted" style="font-size:12px">${esc(r.location) || '—'}</td>
            <td style="text-align:right;font-family:monospace">${r.qty_on_hand}</td>
            <td style="text-align:right" class="muted">—</td>
            <td style="text-align:right" class="muted">—</td>
            <td class="muted" style="font-size:11px">Not counted</td>
          </tr>`
        }
        const variance = r.variance
        const vColor = variance === 0 ? '#10b981' : Math.abs(variance) >= 5 ? '#ef4444' : '#f59e0b'
        const vSign = variance > 0 ? '+' : ''
        return `<tr>
          <td><a href="/admin/stock/${r.stock_item_id}" style="color:var(--bw-gold);text-decoration:none"><strong>${esc(r.brand)}</strong></a></td>
          <td>${esc(r.description)}</td>
          <td class="muted" style="font-size:12px">${esc(r.location) || '—'}</td>
          <td style="text-align:right;font-family:monospace">${r.prev_qty}</td>
          <td style="text-align:right;font-family:monospace"><strong>${r.counted_qty}</strong></td>
          <td style="text-align:right"><strong style="color:${vColor}">${vSign}${variance}</strong></td>
          <td class="muted" style="font-size:11px">${esc(String(r.counted_at || '').replace('T',' ').slice(11,16))} · ${esc(r.counted_by) || '—'}</td>
        </tr>`
      }).join('')

  const csvQs = filter !== 'all' ? `?filter=${filter}` : ''

  const body = `
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
      <div>
        <h1 style="margin:0">${statusBadge} <span style="margin-left:8px">${esc(session.name)}</span></h1>
        <p class="text-muted" style="margin:4px 0 0">
          Started ${esc(String(session.started_at || '').replace('T',' ').slice(0,16))} by ${esc(session.started_by) || '—'}
          ${session.finished_at ? ' · Finished ' + esc(String(session.finished_at).replace('T',' ').slice(0,16)) + ' by ' + (esc(session.finished_by) || '—') : ''}
          ${session.notes ? ' · ' + esc(session.notes) : ''}
        </p>
      </div>
      <div style="display:flex;gap:8px">
        ${session.status === 'open' ? `<a href="/admin/stock/scan/${id}" class="btn btn-primary"><i class="fas fa-barcode"></i> Resume scan</a>` : ''}
        <a href="/admin/stock/scan/${id}/report.csv${csvQs}" class="btn btn-outline"><i class="fas fa-file-csv"></i> Export CSV</a>
        <a href="/admin/stock/scan" class="btn btn-outline"><i class="fas fa-arrow-left"></i> Sessions</a>
      </div>
    </div>

    ${flash(c)}

    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
      ${filterLink('all', 'All counted', totalCounted, '#3b82f6')}
      ${filterLink('variance', 'Variances', totalVariance, '#ef4444')}
      ${filterLink('match', 'Match', totalMatch, '#10b981')}
      ${filterLink('uncounted', 'Uncounted', totalUncounted, '#6b7280')}
    </div>

    <div class="card" style="padding:0;overflow:hidden">
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:var(--surface);text-align:left">
            <th style="padding:10px 12px">Brand</th>
            <th style="padding:10px 12px">Description</th>
            <th style="padding:10px 12px">Location</th>
            <th style="padding:10px 12px;text-align:right">Was</th>
            <th style="padding:10px 12px;text-align:right">Counted</th>
            <th style="padding:10px 12px;text-align:right">Variance</th>
            <th style="padding:10px 12px">Counted at / by</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  `
  return c.html(layout(`Report: ${session.name}`, body, user, 'stock-admin'))
})

// ── GET /admin/stock/scan/:id/report.csv — CSV download ───────────────────
scan.get('/:id/report.csv', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) return c.text('Invalid session', 400)

  const session = await c.env.DB.prepare(
    `SELECT * FROM stocktake_sessions WHERE id=?`
  ).bind(id).first<any>()
  if (!session) return c.text('Session not found', 404)

  const filter = c.req.query('filter') || 'all'

  let sql = ''
  if (filter === 'uncounted') {
    sql = `SELECT i.id AS stock_item_id, i.brand, i.description, i.location, i.custody_type,
                   i.qty_on_hand AS prev_qty, NULL AS counted_qty, NULL AS variance,
                   NULL AS counted_at, NULL AS counted_by, 'uncounted' AS row_type
            FROM stock_items i
            WHERE i.active=1
              AND i.id NOT IN (SELECT stock_item_id FROM stocktake_counts WHERE session_id=?)
            ORDER BY i.brand, i.description`
  } else {
    const where = filter === 'variance' ? 'AND c.variance != 0'
                : filter === 'match'    ? 'AND c.variance  = 0'
                : ''
    sql = `SELECT c.stock_item_id, i.brand, i.description, i.location, i.custody_type,
                   c.prev_qty, c.counted_qty, c.variance,
                   c.counted_at, c.counted_by, 'counted' AS row_type
            FROM stocktake_counts c
            LEFT JOIN stock_items i ON i.id = c.stock_item_id
            WHERE c.session_id=? ${where}
            ORDER BY ABS(c.variance) DESC, i.brand, i.description`
  }

  const rows = await c.env.DB.prepare(sql).bind(id).all<any>()

  const headers = ['stock_item_id','brand','description','location','custody_type','prev_qty','counted_qty','variance','counted_at','counted_by','row_type']
  const out = ['\uFEFF' + headers.join(',')]
  for (const r of rows.results) {
    out.push(headers.map(h => csvCell((r as any)[h])).join(','))
  }
  const csv = out.join('\r\n') + '\r\n'

  const safeName = String(session.name).replace(/[^a-z0-9_-]+/gi, '_')
  const fname = `stocktake_${session.id}_${safeName}_${filter}.csv`
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fname}"`,
    },
  })
})

export default scan
