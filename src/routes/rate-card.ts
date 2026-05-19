// Rate Card routes — Master Rules Handbook v2.0 view
// Renders rate_card line items grouped by category, alongside rate_card_rules
// (handbook prose) with severity-coloured badges and a sticky section nav.

import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth.js'
import { layout } from '../lib/layout.js'
import { formatZAR } from '../lib/format.js'
import type { AuthUser } from '../lib/auth.js'

type Env = { Bindings: { DB: D1Database }; Variables: { user: AuthUser } }

const rateCard = new Hono<Env>()
rateCard.use('*', requireAuth)

// ─── ORDER & METADATA ─────────────────────────────────────────────────────────
// Drives the on-page section order and category emoji.
const CATEGORY_ORDER: { cat: string; section: string; emoji: string }[] = [
  { cat: 'Logistics — B&W Fleet',          section: '§01',  emoji: '🚚' },
  { cat: 'Logistics — Sub-Hire',           section: '§01b', emoji: '🚐' },
  { cat: 'Labour',                          section: '§02',  emoji: '👷' },
  { cat: 'Specialist Roles',                section: '§03',  emoji: '🎤' },
  { cat: 'Equipment — Core',                section: '§04',  emoji: '🛠️' },
  { cat: 'Equipment — AV/Sound/Lighting',   section: '§04',  emoji: '💡' },
  { cat: 'Equipment — Décor/Specials',      section: '§04',  emoji: '🎨' },
  { cat: 'Equipment — Furniture',           section: '§04',  emoji: '🪑' },
  { cat: 'Printing & Signage',              section: '§06',  emoji: '🖨️' },
  { cat: 'Other Costs',                     section: '§07',  emoji: '📦' },
  { cat: 'Disbursement',                    section: '§08',  emoji: '💼' },
  { cat: 'Surcharges',                      section: '§09',  emoji: '⏰' },
  { cat: 'VAT',                             section: '§11',  emoji: '🧾' },
]

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function escapeHtml(s: any): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c] as string))
}

function severityStyle(sev: string): { bg: string; border: string; text: string; icon: string; label: string } {
  switch (sev) {
    case 'critical': return { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.45)', text: '#fca5a5', icon: '🔴', label: 'Critical' }
    case 'flag':     return { bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.45)', text: '#fdba74', icon: '🚩', label: 'Live Flag' }
    case 'warning':  return { bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.40)', text: '#fcd34d', icon: '⚠️', label: 'Warning' }
    default:         return { bg: 'rgba(59,130,246,0.10)', border: 'rgba(59,130,246,0.35)', text: '#93c5fd', icon: 'ℹ️', label: 'Info' }
  }
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
rateCard.get('/', async (c) => {
  const user = c.get('user')
  const msg = c.req.query('msg')

  // Pull all line items + rules in parallel
  const [itemsRes, rulesRes, summaryRes] = await Promise.all([
    c.env.DB.prepare(
      `SELECT rc.id, rc.category, rc.line_item, rc.unit, rc.base_rate,
              rc.discount_pct, rc.notes, rc.load_class, rc.supplier_id, rc.active,
              s.name as supplier_name
         FROM rate_card rc
         LEFT JOIN suppliers s ON rc.supplier_id = s.id
        WHERE rc.active = 1
        ORDER BY rc.category, rc.line_item`
    ).all<any>(),
    c.env.DB.prepare(
      `SELECT id, section, rule_code, title, body, severity, effective_date
         FROM rate_card_rules
        WHERE active = 1
        ORDER BY
          CASE severity WHEN 'critical' THEN 1 WHEN 'flag' THEN 2 WHEN 'warning' THEN 3 ELSE 4 END,
          section, id`
    ).all<any>(),
    c.env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM rate_card WHERE active=1) as total_lines,
         (SELECT COUNT(DISTINCT category) FROM rate_card WHERE active=1) as total_cats,
         (SELECT COUNT(*) FROM rate_card_rules WHERE active=1) as total_rules,
         (SELECT COUNT(*) FROM rate_card_rules WHERE active=1 AND severity='critical') as critical_rules,
         (SELECT COUNT(*) FROM rate_card_rules WHERE active=1 AND severity='flag') as flag_rules`
    ).first<any>(),
  ])

  const items = itemsRes.results || []
  const rules = rulesRes.results || []
  const summary = summaryRes || { total_lines: 0, total_cats: 0, total_rules: 0, critical_rules: 0, flag_rules: 0 }

  // Group items by category
  const byCategory: Record<string, any[]> = {}
  for (const row of items) {
    if (!byCategory[row.category]) byCategory[row.category] = []
    byCategory[row.category].push(row)
  }

  // Group rules by section
  const rulesBySection: Record<string, any[]> = {}
  for (const r of rules) {
    if (!rulesBySection[r.section]) rulesBySection[r.section] = []
    rulesBySection[r.section].push(r)
  }

  // Order categories — known ones first (in handbook order), then any unknown trailing
  const orderedCats: { cat: string; section: string; emoji: string; items: any[] }[] = []
  const seen = new Set<string>()
  for (const meta of CATEGORY_ORDER) {
    if (byCategory[meta.cat]) {
      orderedCats.push({ ...meta, items: byCategory[meta.cat] })
      seen.add(meta.cat)
    }
  }
  for (const cat of Object.keys(byCategory)) {
    if (!seen.has(cat)) orderedCats.push({ cat, section: '—', emoji: '📋', items: byCategory[cat] })
  }

  // ── Top-of-page critical/flag callouts ──
  const criticalRules = rules.filter((r: any) => r.severity === 'critical' || r.severity === 'flag')
  const criticalCallouts = criticalRules.length === 0 ? '' : `
    <div style="background:linear-gradient(135deg,rgba(239,68,68,0.08),rgba(249,115,22,0.08));
                border:1px solid rgba(239,68,68,0.3);border-radius:12px;padding:18px 20px;margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <div style="font-size:18px;font-weight:800;color:#fca5a5">🔴 ${summary.critical_rules} Critical · 🚩 ${summary.flag_rules} Live Flag${summary.flag_rules === 1 ? '' : 's'}</div>
        <a href="#rules" style="margin-left:auto;color:#93c5fd;text-decoration:none;font-size:13px">View all rules ↓</a>
      </div>
      <div style="display:grid;gap:8px">
        ${criticalRules.slice(0, 5).map((r: any) => {
          const sty = severityStyle(r.severity)
          return `
          <div style="display:flex;gap:10px;padding:10px 12px;background:${sty.bg};border-left:3px solid ${sty.border};border-radius:6px">
            <div style="font-size:14px">${sty.icon}</div>
            <div style="flex:1">
              <div style="font-size:12px;font-weight:700;color:${sty.text};letter-spacing:0.04em">
                ${escapeHtml(r.section)}${r.rule_code ? ' · Rule ' + escapeHtml(r.rule_code) : ''} — ${escapeHtml(r.title)}
              </div>
              <div style="font-size:12px;color:#cbd5e1;margin-top:3px;line-height:1.4">${escapeHtml(r.body)}</div>
            </div>
          </div>`
        }).join('')}
        ${criticalRules.length > 5 ? `<div style="text-align:center;padding-top:6px"><a href="#rules" style="color:#93c5fd;font-size:12px;text-decoration:none">+ ${criticalRules.length - 5} more in Rules section ↓</a></div>` : ''}
      </div>
    </div>`

  // ── Sticky section nav ──
  const sectionNav = `
    <div style="position:sticky;top:0;z-index:10;background:rgba(13,17,23,0.92);backdrop-filter:blur(8px);
                border-bottom:1px solid var(--bw-border);padding:10px 0;margin-bottom:18px;
                display:flex;flex-wrap:wrap;gap:6px;overflow-x:auto">
      ${orderedCats.map(c => `
        <a href="#${slugify(c.cat)}"
           style="white-space:nowrap;padding:6px 12px;border-radius:6px;border:1px solid var(--bw-border);
                  background:rgba(255,255,255,0.03);color:#cbd5e1;font-size:12px;font-weight:600;
                  text-decoration:none;letter-spacing:0.02em">
          ${c.emoji} <span style="opacity:0.6">${c.section}</span> ${escapeHtml(c.cat)} <span style="opacity:0.5">(${c.items.length})</span>
        </a>`).join('')}
      <a href="#rules"
         style="white-space:nowrap;padding:6px 12px;border-radius:6px;border:1px solid rgba(239,68,68,0.4);
                background:rgba(239,68,68,0.08);color:#fca5a5;font-size:12px;font-weight:700;
                text-decoration:none;letter-spacing:0.02em">
        📋 Rules of Engagement (${summary.total_rules})
      </a>
    </div>`

  // ── Header card ──
  const headerCard = `
    <div class="card" style="margin-bottom:16px;padding:20px;
                              background:linear-gradient(135deg,rgba(201,168,76,0.06),rgba(13,17,23,0.4))">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:14px">
        <div>
          <div style="font-size:20px;font-weight:800;color:#fff;letter-spacing:0.02em">
            Master Rules Handbook <span style="color:var(--bw-gold)">v2.0</span>
          </div>
          <div style="font-size:13px;color:#9ca3af;margin-top:4px">
            Pricing · Operations · Rules of Engagement · Effective 05 May 2026
          </div>
          <div style="font-size:11px;color:#6b7280;margin-top:8px;letter-spacing:0.04em">
            Owner: Bibi Burness, CEO &nbsp;·&nbsp; Supersedes v1.0 (12 Apr 2026) &nbsp;·&nbsp; Internal only
          </div>
        </div>
        <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
          <div style="text-align:right">
            <div style="font-size:24px;font-weight:800;color:var(--bw-gold)">${summary.total_lines}</div>
            <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em">line items</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:24px;font-weight:800;color:#cbd5e1">${summary.total_cats}</div>
            <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em">categories</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:24px;font-weight:800;color:#93c5fd">${summary.total_rules}</div>
            <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em">rules</div>
          </div>
        </div>
      </div>
    </div>`

  // ── Category sections ──
  const sections = orderedCats.map(({ cat, section, emoji, items: catItems }) => `
    <div id="${slugify(cat)}" class="card" style="margin-bottom:18px;scroll-margin-top:80px">
      <div class="card-header">
        <span class="card-title">
          <span style="opacity:0.5;font-size:13px;letter-spacing:0.04em">${escapeHtml(section)}</span>
          &nbsp;${emoji} ${escapeHtml(cat)}
        </span>
        <span class="text-muted" style="font-size:12px">${catItems.length} item${catItems.length === 1 ? '' : 's'}</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Line Item</th>
            <th class="hide-mobile">Unit</th>
            <th class="text-right">Rate</th>
            <th class="hide-mobile" style="min-width:300px">Notes</th>
            <th>Actions</th>
          </tr></thead>
          <tbody>
            ${catItems.map((it: any) => {
              const isPercent = it.unit === 'percentage'
              const rateText = isPercent
                ? `${Number(it.base_rate).toFixed(2)}%`
                : formatZAR(Number(it.base_rate || 0))
              const isFlag = (it.notes || '').match(/WRONG|RED FLAG|breach|delisted|leak|FLOOR WINS/i)
              const noteHtml = it.notes
                ? `<span style="font-size:12px;color:${isFlag ? '#fca5a5' : '#9ca3af'};line-height:1.45">${escapeHtml(it.notes)}</span>`
                : '<span style="color:#4b5563">—</span>'
              return `
              <tr>
                <td style="font-weight:600">
                  ${escapeHtml(it.line_item)}
                  ${it.load_class && it.load_class !== 'any' ? `<span style="display:inline-block;margin-left:6px;padding:1px 7px;border-radius:4px;background:rgba(201,168,76,0.15);color:var(--bw-gold);font-size:10px;font-weight:700;letter-spacing:0.04em">${escapeHtml(it.load_class)}</span>` : ''}
                </td>
                <td class="muted hide-mobile" style="font-size:12px">${escapeHtml(it.unit || '—')}</td>
                <td class="text-right" style="font-weight:700;color:#fff;white-space:nowrap">${rateText}</td>
                <td class="hide-mobile">${noteHtml}</td>
                <td><a href="/rate-card/${it.id}/edit" class="btn btn-outline btn-sm">Edit</a></td>
              </tr>`
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`).join('')

  // ── Rules of Engagement section ──
  const ruleSectionOrder = ['§01', '§02', '§04', '§05', '§06', '§07', '§08', '§10', '§11', '§12', '§14', '§15', '§16', 'META']
  const orderedRuleSections: { section: string; rules: any[] }[] = []
  const ruleSeen = new Set<string>()
  for (const sec of ruleSectionOrder) {
    if (rulesBySection[sec]) {
      orderedRuleSections.push({ section: sec, rules: rulesBySection[sec] })
      ruleSeen.add(sec)
    }
  }
  for (const sec of Object.keys(rulesBySection)) {
    if (!ruleSeen.has(sec)) orderedRuleSections.push({ section: sec, rules: rulesBySection[sec] })
  }

  const rulesSection = `
    <div id="rules" class="card" style="margin-bottom:18px;scroll-margin-top:80px">
      <div class="card-header">
        <span class="card-title">📋 Rules of Engagement</span>
        <span class="text-muted" style="font-size:12px">${rules.length} rule${rules.length === 1 ? '' : 's'} · CEO-confirmed, not subject to interpretation</span>
      </div>
      <div style="padding:16px 20px;display:grid;gap:18px">
        ${orderedRuleSections.map(({ section, rules: secRules }) => `
          <div>
            <div style="font-size:12px;font-weight:800;color:var(--bw-gold);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--bw-border)">
              ${escapeHtml(section)}
            </div>
            <div style="display:grid;gap:8px">
              ${secRules.map((r: any) => {
                const sty = severityStyle(r.severity)
                return `
                <div style="display:flex;gap:12px;padding:12px 14px;background:${sty.bg};border:1px solid ${sty.border};border-radius:8px">
                  <div style="font-size:16px;line-height:1.2">${sty.icon}</div>
                  <div style="flex:1;min-width:0">
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
                      <span style="font-size:13px;font-weight:700;color:${sty.text}">${escapeHtml(r.title)}</span>
                      ${r.rule_code ? `<span style="font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px;background:rgba(255,255,255,0.06);color:#cbd5e1;letter-spacing:0.04em">RULE ${escapeHtml(r.rule_code)}</span>` : ''}
                      <span style="font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px;background:rgba(255,255,255,0.04);color:${sty.text};letter-spacing:0.04em;text-transform:uppercase">${sty.label}</span>
                    </div>
                    <div style="font-size:13px;color:#e5e7eb;line-height:1.55">${escapeHtml(r.body)}</div>
                  </div>
                </div>`
              }).join('')}
            </div>
          </div>`).join('')}
      </div>
    </div>`

  const body = `
    ${msg === 'saved' ? '<div class="alert alert-success">✅ Rate card item saved.</div>' : ''}
    ${msg === 'archived' ? '<div class="alert alert-success">🗄️ Rate card item archived.</div>' : ''}
    ${headerCard}
    ${criticalCallouts}
    ${sectionNav}
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px">
      <div style="font-size:12px;color:#9ca3af">All rates in ZAR · excl. VAT &nbsp;·&nbsp; v2.0 · Effective 05 May 2026</div>
      <a href="/rate-card/new" class="btn btn-gold btn-sm"><i class="fas fa-plus"></i> Add Item</a>
    </div>
    ${sections || '<div class="card"><p class="text-muted" style="padding:24px;text-align:center">No rate card items.</p></div>'}
    ${rulesSection}`

  return c.html(layout('Rate Card · v2.0', body, user, 'rate-card'))
})

// ─── ADD / EDIT FORM ──────────────────────────────────────────────────────────
rateCard.get('/new', async (c) => {
  const user = c.get('user')
  const suppliers = await c.env.DB.prepare('SELECT id, name FROM suppliers WHERE active=1 ORDER BY name').all<any>()
  return c.html(layout('New Rate Card Item', rateCardForm(null, suppliers.results || []), user, 'rate-card'))
})

rateCard.get('/:id/edit', async (c) => {
  const user = c.get('user')
  const item = await c.env.DB.prepare(
    'SELECT rc.*, s.name as supplier_name FROM rate_card rc LEFT JOIN suppliers s ON rc.supplier_id=s.id WHERE rc.id=?'
  ).bind(c.req.param('id')).first<any>()
  if (!item) return c.redirect('/rate-card')
  const suppliers = await c.env.DB.prepare('SELECT id, name FROM suppliers WHERE active=1 ORDER BY name').all<any>()
  return c.html(layout(`Edit — ${item.line_item}`, rateCardForm(item, suppliers.results || []), user, 'rate-card'))
})

rateCard.post('/new', async (c) => {
  const b = await c.req.parseBody()
  await c.env.DB.prepare(`
    INSERT INTO rate_card (category, line_item, unit, base_rate, discount_pct, supplier_id, load_class, notes)
    VALUES (?,?,?,?,?,?,?,?)`
  ).bind(b.category, b.line_item, b.unit || 'each', Number(b.base_rate) || 0,
    Number(b.discount_pct) || 0, b.supplier_id ? Number(b.supplier_id) : null,
    b.load_class || 'any', b.notes || null).run()
  return c.redirect('/rate-card?msg=saved')
})

rateCard.post('/:id/edit', async (c) => {
  const b = await c.req.parseBody()
  await c.env.DB.prepare(`
    UPDATE rate_card SET category=?, line_item=?, unit=?, base_rate=?, discount_pct=?,
    supplier_id=?, load_class=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
  ).bind(b.category, b.line_item, b.unit || 'each', Number(b.base_rate) || 0,
    Number(b.discount_pct) || 0, b.supplier_id ? Number(b.supplier_id) : null,
    b.load_class || 'any', b.notes || null, c.req.param('id')).run()
  return c.redirect('/rate-card?msg=saved')
})

rateCard.post('/:id/delete', async (c) => {
  await c.env.DB.prepare('UPDATE rate_card SET active=0 WHERE id=?').bind(c.req.param('id')).run()
  return c.redirect('/rate-card?msg=archived')
})

// API: return rate card items as JSON (used by quote builder)
rateCard.get('/api/items', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT rc.id, rc.category, rc.line_item, rc.unit, rc.base_rate, rc.discount_pct,
            rc.supplier_id, rc.load_class, rc.notes, s.name as supplier_name
       FROM rate_card rc LEFT JOIN suppliers s ON rc.supplier_id=s.id
      WHERE rc.active=1 ORDER BY rc.category, rc.line_item`
  ).all<any>()
  return c.json(rows.results)
})

// API: return handbook rules as JSON
rateCard.get('/api/rules', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT id, section, rule_code, title, body, severity, effective_date
       FROM rate_card_rules
      WHERE active=1
      ORDER BY section, id`
  ).all<any>()
  return c.json(rows.results)
})

// ─── FORM ─────────────────────────────────────────────────────────────────────
function rateCardForm(item: any, suppliers: any[]): string {
  const isEdit = !!item
  // Use the live v2.0 categories
  const categories = CATEGORY_ORDER.map(c => c.cat)
  const units = ['each', 'day', 'set', 'person', 'pack', 'roll', 'trip', 'unit', 'hour', 'm2',
                 'staff/day', 'guard/day', 'event', 'event/day', 'km', 'item', 'package',
                 'service', 'permit', 'certificate', 'visit', 'shipment', 'job', 'scope',
                 'percentage', 'quote', 'metre', 'arch', 'roll', 'set (2hr)', 'room/person/night']
  const uniqueUnits = Array.from(new Set(units))

  return `
    <div style="max-width:680px">
      <div style="margin-bottom:16px"><a href="/rate-card" class="btn btn-outline btn-sm">← Back to Rate Card</a></div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">${isEdit ? `Edit — ${escapeHtml(item.line_item)}` : 'New Rate Card Item'}</span>
        </div>
        <form method="POST" action="${isEdit ? `/rate-card/${item.id}/edit` : '/rate-card/new'}" style="padding:16px 20px">
          <div class="form-grid">
            <div class="form-group">
              <label>Category *</label>
              <select name="category" required>
                ${categories.map(cat => `<option value="${escapeHtml(cat)}" ${item?.category === cat ? 'selected' : ''}>${escapeHtml(cat)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Unit</label>
              <select name="unit">
                ${uniqueUnits.map(u => `<option value="${u}" ${item?.unit === u ? 'selected' : ''}>${u}</option>`).join('')}
              </select>
            </div>
            <div class="form-group full">
              <label>Line Item Description *</label>
              <input name="line_item" value="${escapeHtml(item?.line_item ?? '')}" required placeholder="e.g. L2 — Small Truck (4t–6t) — Daily Hire">
            </div>
            <div class="form-group">
              <label>Base Rate (R, excl. VAT) *</label>
              <input type="number" name="base_rate" value="${item?.base_rate ?? ''}" required min="0" step="0.01" placeholder="3500">
            </div>
            <div class="form-group">
              <label>Discount %</label>
              <input type="number" name="discount_pct" value="${item?.discount_pct ?? 0}" min="0" max="100" step="0.5">
            </div>
            <div class="form-group">
              <label>Supplier</label>
              <select name="supplier_id">
                <option value="">— No supplier —</option>
                ${suppliers.map(s => `<option value="${s.id}" ${item?.supplier_id === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Load Class</label>
              <select name="load_class">
                ${['any', 'L1', 'L2', 'L3', 'L4'].map(cls => `<option value="${cls}" ${item?.load_class === cls ? 'selected' : ''}>${cls}</option>`).join('')}
              </select>
            </div>
            <div class="form-group full">
              <label>Notes</label>
              <textarea name="notes" placeholder="Any notes, specifications, conditions, or rule references…">${escapeHtml(item?.notes ?? '')}</textarea>
            </div>
          </div>
          <div style="margin-top:20px;display:flex;gap:10px;flex-wrap:wrap">
            <button type="submit" class="btn btn-gold">${isEdit ? '💾 Save Changes' : '➕ Add Item'}</button>
            <a href="/rate-card" class="btn btn-outline">Cancel</a>
            ${isEdit ? `
              <button type="button" class="btn btn-danger btn-sm" style="margin-left:auto"
                onclick="if(confirm('Archive this item?')){const f=document.createElement('form');f.method='POST';f.action='/rate-card/${item.id}/delete';document.body.appendChild(f);f.submit();}">
                Archive
              </button>` : ''}
          </div>
        </form>
      </div>
    </div>`
}

export default rateCard
