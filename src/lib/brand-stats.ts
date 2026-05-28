// ─────────────────────────────────────────────────────────────────────────
// Phase 8: Brand owner dashboards — aggregator queries
// ─────────────────────────────────────────────────────────────────────────
//
// Design decisions (confirmed):
//   Q1: Events that count = any event with an allocated stock item from this
//       brand (via calendar_event_equipment.stock_item_id → stock_items.brand)
//   Q2: B&W Productions (Assets) IS shown but tagged "Internal"
//   Q3: Per-brand CSV download from the dashboard page
//
// No schema changes — pure read-side over existing tables:
//   stock_items, calendar_events, calendar_event_equipment,
//   stock_shortages, stock_movements, field_submissions, lexicon_brand_map

// ─── Slug helpers ───────────────────────────────────────────────────────────

/** "Castle Lite" → "castle-lite". Slug→brand goes via getBrandByslug(). */
export function brandSlug(brand: string): string {
  return brand
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\(.*?\)/g, '')       // strip parenthetical e.g. (Assets)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Known special-case slug for the internal pseudo-brand */
export const INTERNAL_BRAND = 'B&W Productions (Assets)'

// ─── Types ──────────────────────────────────────────────────────────────────

export type BrandSummary = {
  brand: string
  slug: string
  is_internal: boolean
  ownership: string | null         // from lexicon_brand_map
  item_count: number
  unit_count: number
  open_shortages: number
  upcoming_events_30d: number
  low_stock_count: number
  recent_field_count: number       // last 30 days
}

export type BrandDashboard = {
  brand: string
  slug: string
  is_internal: boolean
  ownership: string | null
  item_count: number
  unit_count: number
  custody_breakdown: Array<{ custody_type: string; items: number; units: number }>
  items_top: Array<{
    id: number; description: string; qty_on_hand: number;
    location: string | null; low_stock_threshold: number | null;
    status: string; custody_type: string;
  }>
  low_stock_items: Array<{
    id: number; description: string; qty_on_hand: number;
    low_stock_threshold: number; deficit: number;
  }>
  upcoming_events: Array<{
    event_id: number; event_date: string; event_name: string;
    status: string; total_qty: number; line_count: number;
  }>
  open_shortages: Array<{
    shortage_id: number; event_id: number; event_date: string; event_name: string;
    stock_item_id: number; description: string;
    quantity_short: number; qty_on_hand: number; created_at: string;
  }>
  recent_field: Array<{
    id: number; form_type: string; form_number: string;
    event_name: string | null; brand: string | null;
    delivery_date: string | null; collection_date: string | null;
    created_at: string;
  }>
  field_counts_30d: Record<string, number>   // form_type → count
  trend_weeks: Array<{
    week_start: string;             // YYYY-MM-DD (Monday)
    movements: number;              // stock_movements row count
    allocations: number;             // calendar_event_equipment created in week (allocate actions)
  }>
}

// ─── Index page: one row per brand ─────────────────────────────────────────

export async function listBrandSummaries(db: D1Database): Promise<BrandSummary[]> {
  // Aggregate stock by brand
  const stockRes = await db.prepare(
    `SELECT brand,
            COUNT(*) AS item_count,
            COALESCE(SUM(qty_on_hand), 0) AS unit_count
     FROM stock_items
     WHERE active = 1
     GROUP BY brand
     ORDER BY unit_count DESC`
  ).all<{ brand: string; item_count: number; unit_count: number }>()
  const brands = stockRes.results || []
  if (brands.length === 0) return []

  // Open shortages per brand (joined via stock_items)
  const shortageRes = await db.prepare(
    `SELECT si.brand AS brand, COUNT(*) AS n
     FROM stock_shortages s
     JOIN stock_items si ON si.id = s.stock_item_id
     WHERE (s.resolution IS NULL OR s.resolution = '')
     GROUP BY si.brand`
  ).all<{ brand: string; n: number }>()
  const shortMap = new Map<string, number>()
  for (const r of (shortageRes.results || [])) shortMap.set(r.brand, r.n)

  // Upcoming events per brand (via allocated equipment, next 30 days)
  const today = new Date().toISOString().slice(0, 10)
  const in30 = new Date(Date.now() + 30 * 86400 * 1000).toISOString().slice(0, 10)
  const eventRes = await db.prepare(
    `SELECT si.brand AS brand, COUNT(DISTINCT ce.id) AS n
     FROM calendar_event_equipment cee
     JOIN stock_items si    ON si.id = cee.stock_item_id
     JOIN calendar_events ce ON ce.id = cee.event_id
     WHERE ce.event_date BETWEEN ? AND ?
       AND ce.status != 'cancelled'
     GROUP BY si.brand`
  ).bind(today, in30).all<{ brand: string; n: number }>()
  const eventMap = new Map<string, number>()
  for (const r of (eventRes.results || [])) eventMap.set(r.brand, r.n)

  // Low-stock per brand
  const lowStockRes = await db.prepare(
    `SELECT brand, COUNT(*) AS n
     FROM stock_items
     WHERE active = 1
       AND COALESCE(low_stock_threshold, 5) > 0
       AND qty_on_hand <= COALESCE(low_stock_threshold, 5)
     GROUP BY brand`
  ).all<{ brand: string; n: number }>()
  const lowMap = new Map<string, number>()
  for (const r of (lowStockRes.results || [])) lowMap.set(r.brand, r.n)

  // Recent field submissions (last 30 days) per brand
  const since = new Date(Date.now() - 30 * 86400 * 1000).toISOString().slice(0, 10)
  const fieldRes = await db.prepare(
    `SELECT brand, COUNT(*) AS n
     FROM field_submissions
     WHERE brand IS NOT NULL AND brand != ''
       AND status = 'active' AND is_draft = 0
       AND date(created_at) >= ?
     GROUP BY brand`
  ).bind(since).all<{ brand: string; n: number }>()
  // field_submissions.brand is free-text — we'll match loose (case-insensitive contains)
  const fieldRows = fieldRes.results || []

  // Ownership map from lexicon
  const lexRes = await db.prepare(
    `SELECT found_in_data, ownership FROM lexicon_brand_map WHERE ownership IS NOT NULL`
  ).all<{ found_in_data: string; ownership: string }>()
  const lexEntries = lexRes.results || []

  function ownershipFor(brand: string): string | null {
    const bl = brand.toLowerCase()
    for (const e of lexEntries) {
      // found_in_data looks like "CASTLE LITE (20)" — strip count
      const key = (e.found_in_data || '').toLowerCase().replace(/\s*\(\d+\)\s*$/, '').trim()
      if (!key) continue
      if (bl === key || bl.includes(key) || key.includes(bl)) return e.ownership
    }
    return null
  }

  function fieldCountFor(brand: string): number {
    const bl = brand.toLowerCase()
    let n = 0
    for (const r of fieldRows) {
      const fb = (r.brand || '').toLowerCase()
      if (!fb) continue
      if (fb === bl || fb.includes(bl) || bl.includes(fb)) n += r.n
    }
    return n
  }

  return brands.map(b => ({
    brand: b.brand,
    slug: brandSlug(b.brand),
    is_internal: b.brand === INTERNAL_BRAND,
    ownership: ownershipFor(b.brand),
    item_count: b.item_count,
    unit_count: b.unit_count,
    open_shortages: shortMap.get(b.brand) || 0,
    upcoming_events_30d: eventMap.get(b.brand) || 0,
    low_stock_count: lowMap.get(b.brand) || 0,
    recent_field_count: fieldCountFor(b.brand),
  }))
}

// ─── Brand → name resolver (slug → canonical brand string) ────────────────

export async function getBrandBySlug(db: D1Database, slug: string): Promise<string | null> {
  const all = await db.prepare(
    `SELECT DISTINCT brand FROM stock_items WHERE active = 1`
  ).all<{ brand: string }>()
  for (const r of (all.results || [])) {
    if (brandSlug(r.brand) === slug) return r.brand
  }
  return null
}

// ─── Per-brand dashboard ──────────────────────────────────────────────────

export async function getBrandDashboard(db: D1Database, brand: string): Promise<BrandDashboard | null> {
  // Quick sanity check
  const exists = await db.prepare(
    `SELECT COUNT(*) AS n FROM stock_items WHERE brand = ? AND active = 1`
  ).bind(brand).first<{ n: number }>()
  if (!exists || exists.n === 0) return null

  // ── Headline totals + custody breakdown ──
  const totalsRes = await db.prepare(
    `SELECT COUNT(*) AS item_count, COALESCE(SUM(qty_on_hand), 0) AS unit_count
     FROM stock_items WHERE brand = ? AND active = 1`
  ).bind(brand).first<{ item_count: number; unit_count: number }>()

  const custodyRes = await db.prepare(
    `SELECT custody_type, COUNT(*) AS items, COALESCE(SUM(qty_on_hand), 0) AS units
     FROM stock_items
     WHERE brand = ? AND active = 1
     GROUP BY custody_type`
  ).bind(brand).all<{ custody_type: string; items: number; units: number }>()

  // ── Top items (by qty desc), limit 12 ──
  const itemsRes = await db.prepare(
    `SELECT id, description, qty_on_hand, location, low_stock_threshold,
            status, custody_type
     FROM stock_items
     WHERE brand = ? AND active = 1
     ORDER BY qty_on_hand DESC, description ASC
     LIMIT 12`
  ).bind(brand).all<any>()

  // ── Low-stock items ──
  const lowRes = await db.prepare(
    `SELECT id, description, qty_on_hand,
            COALESCE(low_stock_threshold, 5) AS low_stock_threshold,
            (COALESCE(low_stock_threshold, 5) - qty_on_hand) AS deficit
     FROM stock_items
     WHERE brand = ? AND active = 1
       AND COALESCE(low_stock_threshold, 5) > 0
       AND qty_on_hand <= COALESCE(low_stock_threshold, 5)
     ORDER BY (COALESCE(low_stock_threshold, 5) - qty_on_hand) DESC, description ASC
     LIMIT 20`
  ).bind(brand).all<any>()

  // ── Upcoming events (next 60 days, via allocated equipment) ──
  const today = new Date().toISOString().slice(0, 10)
  const in60 = new Date(Date.now() + 60 * 86400 * 1000).toISOString().slice(0, 10)
  const eventsRes = await db.prepare(
    `SELECT ce.id AS event_id, ce.event_date, ce.event_name, ce.status,
            COALESCE(SUM(cee.quantity), 0) AS total_qty,
            COUNT(cee.id) AS line_count
     FROM calendar_event_equipment cee
     JOIN stock_items si    ON si.id = cee.stock_item_id
     JOIN calendar_events ce ON ce.id = cee.event_id
     WHERE si.brand = ?
       AND ce.event_date BETWEEN ? AND ?
       AND ce.status != 'cancelled'
     GROUP BY ce.id
     ORDER BY ce.event_date ASC`
  ).bind(brand, today, in60).all<any>()

  // ── Open shortages ──
  const shortRes = await db.prepare(
    `SELECT s.id AS shortage_id, s.event_id, ce.event_date, ce.event_name,
            s.stock_item_id, si.description,
            s.quantity_short, si.qty_on_hand, s.created_at
     FROM stock_shortages s
     JOIN stock_items si ON si.id = s.stock_item_id
     JOIN calendar_events ce ON ce.id = s.event_id
     WHERE si.brand = ?
       AND (s.resolution IS NULL OR s.resolution = '')
     ORDER BY ce.event_date ASC, s.created_at ASC`
  ).bind(brand).all<any>()

  // ── Field activity (last 30 days, loose brand match) ──
  const since = new Date(Date.now() - 30 * 86400 * 1000).toISOString().slice(0, 10)
  const fieldRecentRes = await db.prepare(
    `SELECT id, form_type, form_number, event_name, brand,
            delivery_date, collection_date, created_at
     FROM field_submissions
     WHERE status = 'active' AND is_draft = 0
       AND date(created_at) >= ?
       AND brand IS NOT NULL AND brand != ''
       AND (LOWER(brand) = LOWER(?)
            OR INSTR(LOWER(brand), LOWER(?)) > 0
            OR INSTR(LOWER(?), LOWER(brand)) > 0)
     ORDER BY created_at DESC
     LIMIT 10`
  ).bind(since, brand, brand, brand).all<any>()

  const fieldCountsRes = await db.prepare(
    `SELECT form_type, COUNT(*) AS n
     FROM field_submissions
     WHERE status = 'active' AND is_draft = 0
       AND date(created_at) >= ?
       AND brand IS NOT NULL AND brand != ''
       AND (LOWER(brand) = LOWER(?)
            OR INSTR(LOWER(brand), LOWER(?)) > 0
            OR INSTR(LOWER(?), LOWER(brand)) > 0)
     GROUP BY form_type`
  ).bind(since, brand, brand, brand).all<{ form_type: string; n: number }>()
  const fieldCounts: Record<string, number> = {}
  for (const r of (fieldCountsRes.results || [])) fieldCounts[r.form_type] = r.n

  // ── 4-week trend (movements + allocations per week) ──
  const weeks = lastNWeeks(4)
  const trend: BrandDashboard['trend_weeks'] = []
  for (const w of weeks) {
    const mvRes = await db.prepare(
      `SELECT COUNT(*) AS n
       FROM stock_movements m
       JOIN stock_items si ON si.id = m.stock_item_id
       WHERE si.brand = ?
         AND date(m.created_at) BETWEEN ? AND ?`
    ).bind(brand, w.start, w.end).first<{ n: number }>()
    const allocRes = await db.prepare(
      `SELECT COUNT(*) AS n
       FROM stock_movements m
       JOIN stock_items si ON si.id = m.stock_item_id
       WHERE si.brand = ?
         AND m.action = 'allocate'
         AND date(m.created_at) BETWEEN ? AND ?`
    ).bind(brand, w.start, w.end).first<{ n: number }>()
    trend.push({
      week_start: w.start,
      movements: mvRes?.n ?? 0,
      allocations: allocRes?.n ?? 0,
    })
  }

  // ── Ownership chip ──
  const lexRes = await db.prepare(
    `SELECT found_in_data, ownership FROM lexicon_brand_map WHERE ownership IS NOT NULL`
  ).all<{ found_in_data: string; ownership: string }>()
  let ownership: string | null = null
  const bl = brand.toLowerCase()
  for (const e of (lexRes.results || [])) {
    const key = (e.found_in_data || '').toLowerCase().replace(/\s*\(\d+\)\s*$/, '').trim()
    if (!key) continue
    if (bl === key || bl.includes(key) || key.includes(bl)) { ownership = e.ownership; break }
  }

  return {
    brand,
    slug: brandSlug(brand),
    is_internal: brand === INTERNAL_BRAND,
    ownership,
    item_count: totalsRes?.item_count ?? 0,
    unit_count: totalsRes?.unit_count ?? 0,
    custody_breakdown: custodyRes.results || [],
    items_top: itemsRes.results || [],
    low_stock_items: lowRes.results || [],
    upcoming_events: eventsRes.results || [],
    open_shortages: shortRes.results || [],
    recent_field: fieldRecentRes.results || [],
    field_counts_30d: fieldCounts,
    trend_weeks: trend,
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function lastNWeeks(n: number): Array<{ start: string; end: string }> {
  // Returns Monday-start weeks ordered oldest → newest
  const out: Array<{ start: string; end: string }> = []
  const now = new Date()
  // Monday-of-this-week
  const dow = now.getUTCDay() // 0=Sun..6=Sat
  const offsetToMon = (dow === 0 ? -6 : 1 - dow)
  const thisMon = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetToMon))
  for (let i = n - 1; i >= 0; i--) {
    const start = new Date(thisMon.getTime() - i * 7 * 86400 * 1000)
    const end = new Date(start.getTime() + 6 * 86400 * 1000)
    out.push({
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
    })
  }
  return out
}

// ─── Full per-item CSV for a brand (used by /admin/brands/:slug.csv) ──────

export async function getBrandItemsCsv(db: D1Database, brand: string): Promise<string> {
  const res = await db.prepare(
    `SELECT id, brand, description, qty_on_hand, location, custody_type,
            status, COALESCE(low_stock_threshold, '') AS low_stock_threshold,
            notes, created_at, updated_at
     FROM stock_items
     WHERE brand = ? AND active = 1
     ORDER BY description ASC`
  ).bind(brand).all<any>()
  const rows = res.results || []

  // Metadata block (commented out lines starting with #) + CSV header + body
  const totalUnits = rows.reduce((s, r) => s + (Number(r.qty_on_hand) || 0), 0)
  const lines: string[] = []
  lines.push(`# Brand snapshot for: ${brand}`)
  lines.push(`# Generated: ${new Date().toISOString()}`)
  lines.push(`# Items: ${rows.length} · Units on hand: ${totalUnits}`)
  lines.push(`# Source: B&W Productions stock_items (active=1)`)
  lines.push('')
  lines.push(['id','brand','description','qty_on_hand','location','custody_type','status','low_stock_threshold','notes','created_at','updated_at'].join(','))
  for (const r of rows) {
    lines.push([
      r.id, csvCell(r.brand), csvCell(r.description), r.qty_on_hand,
      csvCell(r.location), csvCell(r.custody_type), csvCell(r.status),
      csvCell(r.low_stock_threshold), csvCell(r.notes), csvCell(r.created_at), csvCell(r.updated_at)
    ].join(','))
  }
  return lines.join('\n')
}

function csvCell(v: any): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}
