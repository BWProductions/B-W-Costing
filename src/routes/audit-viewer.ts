// ─────────────────────────────────────────────────────────────────────────
// Phase 16: Audit viewer — admin UI to inspect audit_log + login_history
// ─────────────────────────────────────────────────────────────────────────
//
// Mounted at /admin/audit. Restricted to founder + ops_director + finance_director.
//
// Routes:
//   GET  /admin/audit                — filterable activity log
//   GET  /admin/audit.csv            — CSV export of filtered slice
//   GET  /admin/audit/logins         — login history (success + failed)
//   GET  /admin/audit/logins.csv     — CSV export

import { Hono } from 'hono'
import type { AuthUser } from '../lib/auth.js'
import { requireAuth } from '../middleware/auth.js'
import { layoutObj as layout } from '../lib/layout.js'

type Bindings = { DB: D1Database }
type Variables = { user: AuthUser }
const auditViewer = new Hono<{ Bindings: Bindings; Variables: Variables }>()
auditViewer.use('*', requireAuth)

function esc(s: any): string {
  if (s === null || s === undefined) return ''
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function fmtDateTime(s: string | null | undefined): string {
  if (!s) return ''
  return String(s).replace('T', ' ').replace(/\.\d+Z?$/, '').slice(0, 19)
}

function csvCell(v: any): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

// Allow only senior roles in
function gateRoles(user: AuthUser): boolean {
  return ['founder', 'ops_director', 'finance_director'].includes(user.role)
}

// ─── AUDIT LOG (entity changes) ─────────────────────────────────────────────

auditViewer.get('/', async (c) => {
  const user = c.get('user')
  if (!gateRoles(user)) {
    return c.html(layout({
      title: 'Audit — Access Denied',
      user,
      body: `<div class="max-w-2xl mx-auto p-6"><div class="bg-red-100 border border-red-300 text-red-800 rounded p-4">You do not have permission to view the audit log.</div></div>`,
    }), 403)
  }

  const userFilter = c.req.query('user') || ''
  const entityFilter = c.req.query('entity') || ''
  const since = c.req.query('since') || ''
  const until = c.req.query('until') || ''
  const limit = Math.min(500, Math.max(20, Number(c.req.query('limit') || 100)))

  const where: string[] = []
  const binds: any[] = []
  if (userFilter) { where.push(`(user_email LIKE ? OR CAST(user_id AS TEXT) = ?)`); binds.push(`%${userFilter}%`, userFilter) }
  if (entityFilter) { where.push(`entity_type LIKE ?`); binds.push(`%${entityFilter}%`) }
  if (since) { where.push(`created_at >= ?`); binds.push(since) }
  if (until) { where.push(`created_at <= ?`); binds.push(until) }
  const sql = `
    SELECT id, created_at, user_id, user_email, action, entity_type, entity_id,
           field_changes, reason, ip_address
    FROM audit_log
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY created_at DESC
    LIMIT ?
  `
  binds.push(limit)
  const result = await c.env.DB.prepare(sql).bind(...binds).all<{
    id: number; created_at: string; user_id: number | null; user_email: string | null;
    action: string; entity_type: string | null; entity_id: number | null;
    field_changes: string | null; reason: string | null; ip_address: string | null;
  }>()
  const rows = result.results || []

  const tableRows = rows.map(r => {
    const changes = r.field_changes ? (r.field_changes.length > 120 ? r.field_changes.slice(0, 120) + '…' : r.field_changes) : ''
    return `
      <tr class="hover:bg-gray-50">
        <td class="px-3 py-2 border-b text-xs whitespace-nowrap">${fmtDateTime(r.created_at)}</td>
        <td class="px-3 py-2 border-b text-xs">${esc(r.user_email || '—')}</td>
        <td class="px-3 py-2 border-b text-xs"><span class="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded">${esc(r.action)}</span></td>
        <td class="px-3 py-2 border-b text-xs">${esc(r.entity_type || '—')}${r.entity_id ? ` #${r.entity_id}` : ''}</td>
        <td class="px-3 py-2 border-b text-xs text-gray-600 font-mono">${esc(changes)}</td>
        <td class="px-3 py-2 border-b text-xs text-gray-600">${esc(r.reason || '')}</td>
        <td class="px-3 py-2 border-b text-xs font-mono text-gray-500">${esc(r.ip_address || '')}</td>
      </tr>
    `
  }).join('')

  // Build CSV query string preserving filters
  const csvQs = new URLSearchParams(c.req.url.split('?')[1] || '').toString()

  return c.html(layout({
    title: 'Audit Log',
    user,
    body: `
      <div class="max-w-7xl mx-auto p-6">
        <div class="flex items-center justify-between mb-4">
          <h1 class="text-2xl font-bold">Audit Log</h1>
          <div class="flex gap-2">
            <a href="/admin/audit/logins" class="text-sm px-3 py-2 bg-gray-200 rounded hover:bg-gray-300">
              <i class="fas fa-sign-in-alt mr-1"></i> Login History
            </a>
            <a href="/admin/audit/export.csv?${esc(csvQs)}" class="text-sm px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700">
              <i class="fas fa-file-csv mr-1"></i> CSV
            </a>
            <a href="/admin/stock" class="text-sm px-3 py-2 text-gray-600 hover:underline">← Stock</a>
          </div>
        </div>

        <form method="GET" class="bg-white rounded shadow p-4 mb-4 grid grid-cols-1 md:grid-cols-5 gap-3 text-sm">
          <input type="text" name="user" value="${esc(userFilter)}" placeholder="user email/id" class="border rounded px-2 py-2">
          <input type="text" name="entity" value="${esc(entityFilter)}" placeholder="entity (stock_items, etc.)" class="border rounded px-2 py-2">
          <input type="date" name="since" value="${esc(since)}" class="border rounded px-2 py-2">
          <input type="date" name="until" value="${esc(until)}" class="border rounded px-2 py-2">
          <button type="submit" class="bg-blue-600 text-white rounded px-3 py-2 hover:bg-blue-700">Filter</button>
        </form>

        <div class="bg-white rounded shadow overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-100">
              <tr>
                <th class="px-3 py-2 text-left border-b">When</th>
                <th class="px-3 py-2 text-left border-b">User</th>
                <th class="px-3 py-2 text-left border-b">Action</th>
                <th class="px-3 py-2 text-left border-b">Entity</th>
                <th class="px-3 py-2 text-left border-b">Changes</th>
                <th class="px-3 py-2 text-left border-b">Reason</th>
                <th class="px-3 py-2 text-left border-b">IP</th>
              </tr>
            </thead>
            <tbody>${tableRows || '<tr><td colspan="7" class="px-3 py-6 text-center text-gray-500">No entries match those filters.</td></tr>'}</tbody>
          </table>
        </div>
        <p class="text-xs text-gray-500 mt-3">Showing latest ${rows.length} of capped ${limit} results.</p>
      </div>
    `,
  }))
})

// CSV export — uses same filters as the HTML page
// Mounted at /admin/audit, so this responds at /admin/audit/export.csv
auditViewer.get('/export.csv', async (c) => {
  const user = c.get('user')
  if (!gateRoles(user)) return c.text('Forbidden', 403)

  const userFilter = c.req.query('user') || ''
  const entityFilter = c.req.query('entity') || ''
  const since = c.req.query('since') || ''
  const until = c.req.query('until') || ''

  const where: string[] = []
  const binds: any[] = []
  if (userFilter) { where.push(`(user_email LIKE ? OR CAST(user_id AS TEXT) = ?)`); binds.push(`%${userFilter}%`, userFilter) }
  if (entityFilter) { where.push(`entity_type LIKE ?`); binds.push(`%${entityFilter}%`) }
  if (since) { where.push(`created_at >= ?`); binds.push(since) }
  if (until) { where.push(`created_at <= ?`); binds.push(until) }

  const sql = `
    SELECT created_at, user_email, action, entity_type, entity_id, field_changes, reason, ip_address
    FROM audit_log
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY created_at DESC
    LIMIT 5000
  `
  const result = await c.env.DB.prepare(sql).bind(...binds).all<any>()
  const rows = result.results || []
  const csv = [
    'When,User,Action,Entity Type,Entity ID,Field Changes,Reason,IP',
    ...rows.map(r => [
      csvCell(r.created_at), csvCell(r.user_email), csvCell(r.action),
      csvCell(r.entity_type), csvCell(r.entity_id), csvCell(r.field_changes),
      csvCell(r.reason), csvCell(r.ip_address),
    ].join(',')),
  ].join('\n')

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="audit_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
})

// ─── LOGIN HISTORY ──────────────────────────────────────────────────────────

auditViewer.get('/logins', async (c) => {
  const user = c.get('user')
  if (!gateRoles(user)) {
    return c.html(layout({
      title: 'Logins — Access Denied',
      user,
      body: `<div class="max-w-2xl mx-auto p-6"><div class="bg-red-100 border border-red-300 text-red-800 rounded p-4">You do not have permission to view login history.</div></div>`,
    }), 403)
  }

  const emailFilter = c.req.query('email') || ''
  const onlyFailed = c.req.query('failed') === '1'
  const since = c.req.query('since') || ''
  const limit = Math.min(500, Math.max(20, Number(c.req.query('limit') || 200)))

  const where: string[] = []
  const binds: any[] = []
  if (emailFilter) { where.push(`email LIKE ?`); binds.push(`%${emailFilter}%`) }
  if (onlyFailed) { where.push(`success = 0`) }
  if (since) { where.push(`created_at >= ?`); binds.push(since) }

  const sql = `
    SELECT id, created_at, user_id, email, success, ip_address, user_agent, failure_reason
    FROM login_history
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY created_at DESC
    LIMIT ?
  `
  binds.push(limit)
  const result = await c.env.DB.prepare(sql).bind(...binds).all<{
    id: number; created_at: string; user_id: number | null; email: string;
    success: number; ip_address: string | null; user_agent: string | null;
    failure_reason: string | null;
  }>()
  const rows = result.results || []

  // Quick stats
  const stats = await c.env.DB.prepare(`
    SELECT
      SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS ok_count,
      SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS fail_count,
      COUNT(DISTINCT email) AS distinct_emails
    FROM login_history
    WHERE created_at >= datetime('now', '-7 days')
  `).first<{ ok_count: number; fail_count: number; distinct_emails: number }>()

  const tableRows = rows.map(r => `
    <tr class="hover:bg-gray-50 ${r.success ? '' : 'bg-red-50'}">
      <td class="px-3 py-2 border-b text-xs whitespace-nowrap">${fmtDateTime(r.created_at)}</td>
      <td class="px-3 py-2 border-b text-xs">${esc(r.email)}</td>
      <td class="px-3 py-2 border-b text-xs">
        ${r.success
          ? '<span class="px-1.5 py-0.5 bg-green-100 text-green-800 rounded">OK</span>'
          : `<span class="px-1.5 py-0.5 bg-red-100 text-red-800 rounded">${esc(r.failure_reason || 'fail')}</span>`}
      </td>
      <td class="px-3 py-2 border-b text-xs font-mono text-gray-600">${esc(r.ip_address || '')}</td>
      <td class="px-3 py-2 border-b text-xs text-gray-500">${esc((r.user_agent || '').slice(0, 80))}</td>
    </tr>
  `).join('')

  return c.html(layout({
    title: 'Login History',
    user,
    body: `
      <div class="max-w-7xl mx-auto p-6">
        <div class="flex items-center justify-between mb-4">
          <h1 class="text-2xl font-bold">Login History</h1>
          <div class="flex gap-2">
            <a href="/admin/audit" class="text-sm px-3 py-2 bg-gray-200 rounded hover:bg-gray-300">
              <i class="fas fa-history mr-1"></i> Activity Log
            </a>
            <a href="/admin/audit/logins.csv" class="text-sm px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700">
              <i class="fas fa-file-csv mr-1"></i> CSV
            </a>
            <a href="/admin/stock" class="text-sm px-3 py-2 text-gray-600 hover:underline">← Stock</a>
          </div>
        </div>

        <div class="grid grid-cols-3 gap-4 mb-4">
          <div class="bg-white rounded shadow p-4">
            <div class="text-xs uppercase text-gray-500">Successful (7d)</div>
            <div class="text-2xl font-bold text-green-600">${stats?.ok_count || 0}</div>
          </div>
          <div class="bg-white rounded shadow p-4">
            <div class="text-xs uppercase text-gray-500">Failed (7d)</div>
            <div class="text-2xl font-bold text-red-600">${stats?.fail_count || 0}</div>
          </div>
          <div class="bg-white rounded shadow p-4">
            <div class="text-xs uppercase text-gray-500">Distinct Emails (7d)</div>
            <div class="text-2xl font-bold text-gray-900">${stats?.distinct_emails || 0}</div>
          </div>
        </div>

        <form method="GET" class="bg-white rounded shadow p-4 mb-4 grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
          <input type="text" name="email" value="${esc(emailFilter)}" placeholder="email contains…" class="border rounded px-2 py-2">
          <input type="date" name="since" value="${esc(since)}" class="border rounded px-2 py-2">
          <label class="flex items-center gap-2 px-2">
            <input type="checkbox" name="failed" value="1" ${onlyFailed ? 'checked' : ''}>
            <span>Only failed</span>
          </label>
          <button type="submit" class="bg-blue-600 text-white rounded px-3 py-2 hover:bg-blue-700">Filter</button>
        </form>

        <div class="bg-white rounded shadow overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-100">
              <tr>
                <th class="px-3 py-2 text-left border-b">When</th>
                <th class="px-3 py-2 text-left border-b">Email</th>
                <th class="px-3 py-2 text-left border-b">Result</th>
                <th class="px-3 py-2 text-left border-b">IP</th>
                <th class="px-3 py-2 text-left border-b">User Agent</th>
              </tr>
            </thead>
            <tbody>${tableRows || '<tr><td colspan="5" class="px-3 py-6 text-center text-gray-500">No login attempts recorded yet.</td></tr>'}</tbody>
          </table>
        </div>
        <p class="text-xs text-gray-500 mt-3">Showing latest ${rows.length} of capped ${limit} results.</p>
      </div>
    `,
  }))
})

auditViewer.get('/logins.csv', async (c) => {
  const user = c.get('user')
  if (!gateRoles(user)) return c.text('Forbidden', 403)

  const result = await c.env.DB.prepare(`
    SELECT created_at, email, success, ip_address, user_agent, failure_reason
    FROM login_history
    ORDER BY created_at DESC
    LIMIT 5000
  `).all<any>()
  const rows = result.results || []
  const csv = [
    'When,Email,Success,IP,User Agent,Failure Reason',
    ...rows.map(r => [
      csvCell(r.created_at), csvCell(r.email), csvCell(r.success ? 'OK' : 'FAIL'),
      csvCell(r.ip_address), csvCell(r.user_agent), csvCell(r.failure_reason),
    ].join(',')),
  ].join('\n')

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="logins_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
})

export default auditViewer
