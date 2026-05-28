// ─────────────────────────────────────────────────────────────────────────
// Phase 10: Movement reason taxonomy (single source of truth)
// ─────────────────────────────────────────────────────────────────────────
//
// Categorises every stock_movements row so brand dashboards & finance views
// can actually mean something. The 'reason' column stays for free-text;
// 'reason_category' is the structured taxonomy enforced by this module.
//
// Used by:
//   * stock-admin edits (qty changes)
//   * Phase 7 allocations (event_allocate / event_deallocate)
//   * Phase 9 returns (event_return_ok / event_return_broken / event_missing / event_lost_on_site)
//   * Phase 11 damages (damaged_writeoff)

export type ReasonCategory =
  | 'replenishment'
  | 'stock_transfer'
  | 'stocktake_correction'
  | 'manual_adjustment'
  | 'event_allocate'
  | 'event_deallocate'
  | 'event_return_ok'
  | 'event_return_broken'
  | 'event_missing'
  | 'event_lost_on_site'
  | 'damaged_writeoff'
  | 'sale'

export type ReasonMeta = {
  key: ReasonCategory
  label: string
  short: string
  /** Tailwind-ish CSS colour (foreground) */
  color: string
  /** Direction in the ledger: 'in' increases stock, 'out' decreases it, 'neutral' no qty effect */
  direction: 'in' | 'out' | 'neutral'
  /** Whether this reason should be available in the qty-edit dropdown (admin UI) */
  manualPick: boolean
  /** Group label for grouping in dropdowns */
  group: 'inbound' | 'outbound' | 'event' | 'loss' | 'admin'
  description: string
}

export const REASONS: ReasonMeta[] = [
  // ── Inbound ──────────────────────────────────────────────────────
  { key: 'replenishment',        label: 'Replenishment',        short: 'Replen.',     color: '#10b981',
    direction: 'in',   manualPick: true,  group: 'inbound',
    description: 'New stock arrived (delivery, purchase, supplier shipment).' },

  // ── Outbound ─────────────────────────────────────────────────────
  { key: 'sale',                 label: 'Sale',                 short: 'Sale',        color: '#3b82f6',
    direction: 'out',  manualPick: true,  group: 'outbound',
    description: 'Stock sold out of inventory.' },
  { key: 'stock_transfer',       label: 'Stock transfer',       short: 'Transfer',    color: '#06b6d4',
    direction: 'neutral', manualPick: true, group: 'outbound',
    description: 'Moved between locations / warehouses.' },

  // ── Event-driven (automated from Phase 7 + Phase 9) ──────────────
  { key: 'event_allocate',       label: 'Event allocation',     short: 'Alloc.',      color: '#18D9FF',
    direction: 'neutral', manualPick: false, group: 'event',
    description: 'Stock committed to an event (Phase 7). On-hand unchanged, available decreases.' },
  { key: 'event_deallocate',     label: 'Event de-allocation',  short: 'De-alloc.',   color: '#9ca3af',
    direction: 'neutral', manualPick: false, group: 'event',
    description: 'Allocation removed (e.g. event cancelled / item swapped).' },
  { key: 'event_return_ok',      label: 'Returned (usable)',    short: 'Return OK',   color: '#10b981',
    direction: 'in',   manualPick: false, group: 'event',
    description: 'Came back from event, usable, returned to available stock.' },
  { key: 'event_return_broken',  label: 'Returned broken',      short: 'Broken',      color: '#f59e0b',
    direction: 'neutral', manualPick: false, group: 'event',
    description: 'Came back but damaged → routed to damages register.' },

  // ── Loss ─────────────────────────────────────────────────────────
  { key: 'event_missing',        label: 'Missing (event)',      short: 'Missing',     color: '#ff7a66',
    direction: 'out',  manualPick: false, group: 'loss',
    description: "Allocated to event, never came back, fate unknown." },
  { key: 'event_lost_on_site',   label: 'Lost on site',         short: 'Lost',        color: '#ef4444',
    direction: 'out',  manualPick: false, group: 'loss',
    description: 'Confirmed left at venue / client / consumed.' },
  { key: 'damaged_writeoff',     label: 'Damaged write-off',    short: 'Write-off',   color: '#7c2d12',
    direction: 'out',  manualPick: true,  group: 'loss',
    description: 'Finance-approved write-off after damages review.' },

  // ── Admin ────────────────────────────────────────────────────────
  { key: 'stocktake_correction', label: 'Stock-take correction',short: 'Stocktake',   color: '#a855f7',
    direction: 'neutral', manualPick: true, group: 'admin',
    description: 'Physical count adjusted to match reality.' },
  { key: 'manual_adjustment',    label: 'Manual adjustment',    short: 'Manual',      color: '#6b7280',
    direction: 'neutral', manualPick: true, group: 'admin',
    description: 'Admin fix-up — please write a reason in the notes box.' },
]

const BY_KEY: Record<string, ReasonMeta> = Object.fromEntries(REASONS.map(r => [r.key, r]))

export function reasonMeta(key: string | null | undefined): ReasonMeta | null {
  if (!key) return null
  return BY_KEY[key] || null
}

export function reasonLabel(key: string | null | undefined): string {
  if (!key) return '—'
  const m = BY_KEY[key]
  return m ? m.label : key
}

export function reasonChip(key: string | null | undefined): string {
  const m = reasonMeta(key)
  if (!m) return `<span style="color:#6b7280;font-size:11px">—</span>`
  return `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;background:${m.color}22;color:${m.color};font-size:11px;font-weight:700;border:1px solid ${m.color}55">${m.short}</span>`
}

/** Reasons available in the admin qty-edit dropdown, grouped */
export function manualPickGroups(): Array<{ group: string; label: string; reasons: ReasonMeta[] }> {
  const groupLabels: Record<ReasonMeta['group'], string> = {
    inbound:  'Inbound',
    outbound: 'Outbound',
    event:    'Event-driven (auto)',
    loss:     'Loss / write-off',
    admin:    'Admin',
  }
  const out: Array<{ group: string; label: string; reasons: ReasonMeta[] }> = []
  const seen = new Set<string>()
  for (const r of REASONS) {
    if (!r.manualPick) continue
    if (seen.has(r.group)) {
      const existing = out.find(o => o.group === r.group)!
      existing.reasons.push(r)
    } else {
      out.push({ group: r.group, label: groupLabels[r.group], reasons: [r] })
      seen.add(r.group)
    }
  }
  return out
}

/** Render a <select> for picking a reason category */
export function reasonSelect(name: string, current?: string | null, includeBlank = true): string {
  const groups = manualPickGroups()
  const opts: string[] = []
  if (includeBlank) opts.push(`<option value="">— select reason —</option>`)
  for (const g of groups) {
    opts.push(`<optgroup label="${g.label}">`)
    for (const r of g.reasons) {
      const sel = current === r.key ? ' selected' : ''
      opts.push(`<option value="${r.key}"${sel}>${r.label}</option>`)
    }
    opts.push(`</optgroup>`)
  }
  return `<select name="${name}" class="form-select">${opts.join('')}</select>`
}

export function isValidReasonCategory(s: any): s is ReasonCategory {
  return typeof s === 'string' && s in BY_KEY
}
