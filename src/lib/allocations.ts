// ─────────────────────────────────────────────────────────────────────────
// Phase 7: Stock Allocations — availability calculator, conflict detector,
// shortage writer, fuzzy picker helper.
// ─────────────────────────────────────────────────────────────────────────
//
// Design decisions (confirmed):
//   Q1: window = event_date only (1 day)
//   Q2: stock_items.active=1 AND status='active'
//   Q3: ONLY custody_type='owned' counts in availability (3rd-party & offsite
//       excluded — those need a separate workflow)
//   Q4: Soft warn on overbook — auto-create a stock_shortages row
//
// Public API:
//   getAvailability(db, stockItemId, eventDate, excludeEventId?)
//   getCommitmentsForItem(db, stockItemId, from?, to?)
//   pickerCandidates(db, query, eventDate, limit?)
//   recordAllocation(db, equipId, eventId, stockItemId, qty, user)
//   recordDeallocation(db, equipId, eventId, stockItemId, qty, user)
//   recomputeShortage(db, eventId, stockItemId, eventDate)
//   listOpenShortages(db)
//   resolveShortage(db, shortageId, resolution, notes, user)
//   reopenShortage(db, shortageId, user)

import { findMatches, normalise } from './fuzzy.js'

// ─── Types ──────────────────────────────────────────────────────────────────

export type StockCandidate = {
  id: number
  brand: string
  description: string
  qty_on_hand: number
  custody_type: string
  status: string
  active: number
  location: string | null
}

export type AvailabilityReport = {
  stockItemId: number
  brand: string
  description: string
  qty_on_hand: number
  custody_type: string
  status: string
  // Only the OWNED inventory counts toward total. 3p/offsite items will
  // still return availability but flagged so the UI can render an amber tag.
  counts_toward_availability: boolean
  committed_on_date: number      // sum of quantity already booked on eventDate
  available_on_date: number       // qty_on_hand - committed_on_date (clamped >=0 only for display)
  commitments: Array<{
    event_id: number
    event_name: string
    event_date: string
    status: string
    quantity: number
    equip_id: number
  }>
}

export type PickerCandidate = StockCandidate & {
  score: number               // 0..1 from fuzzy
  committed_on_date: number
  available_on_date: number
  counts_toward_availability: boolean
  reason: string
}

export type OpenShortage = {
  id: number
  stock_item_id: number
  event_id: number
  quantity_short: number
  resolution: string | null
  resolved_at: string | null
  resolved_by: number | null
  notes: string | null
  created_at: string
  // joined
  brand: string
  description: string
  qty_on_hand: number
  event_name: string
  event_date: string
  event_status: string
}

// ─── Availability calculator (single source of truth) ─────────────────────

/**
 * Computes how many of a given stock item are committed across all
 * non-cancelled events on a specific date, and what's left.
 *
 * Returns null if the stock item doesn't exist.
 *
 * @param excludeEventId — when recomputing for THIS event's own add/remove,
 *   pass the event id so its own existing commitments aren't double-counted
 *   in the "available" figure shown to the user.
 */
export async function getAvailability(
  db: D1Database,
  stockItemId: number,
  eventDate: string,
  excludeEventId?: number,
): Promise<AvailabilityReport | null> {
  const item = await db.prepare(
    `SELECT id, brand, description, qty_on_hand, custody_type, status, active, location
     FROM stock_items WHERE id = ?`
  ).bind(stockItemId).first<StockCandidate & { id: number }>()
  if (!item) return null

  const countsTowardAvailability = item.active === 1
    && item.status === 'active'
    && item.custody_type === 'owned'

  // All commitments on this date (regardless of custody — they reflect what's
  // already been promised). Cancelled events excluded.
  const params: any[] = [stockItemId, eventDate]
  let sql = `
    SELECT cee.id AS equip_id, cee.quantity AS quantity,
           ce.id AS event_id, ce.event_name, ce.event_date, ce.status
    FROM calendar_event_equipment cee
    JOIN calendar_events ce ON ce.id = cee.event_id
    WHERE cee.stock_item_id = ?
      AND ce.event_date = ?
      AND ce.status != 'cancelled'`
  if (excludeEventId) {
    sql += ` AND ce.id != ?`
    params.push(excludeEventId)
  }
  sql += ` ORDER BY ce.event_name ASC`
  const res = await db.prepare(sql).bind(...params).all<any>()
  const commitments = (res.results || []).map(r => ({
    event_id: r.event_id,
    event_name: r.event_name,
    event_date: r.event_date,
    status: r.status,
    quantity: Number(r.quantity) || 0,
    equip_id: r.equip_id,
  }))

  const committed = commitments.reduce((sum, c) => sum + c.quantity, 0)
  const available = (item.qty_on_hand || 0) - committed

  return {
    stockItemId: item.id,
    brand: item.brand,
    description: item.description,
    qty_on_hand: item.qty_on_hand,
    custody_type: item.custody_type,
    status: item.status,
    counts_toward_availability: countsTowardAvailability,
    committed_on_date: committed,
    available_on_date: available,
    commitments,
  }
}

// ─── Per-item commitments timeline (used by the per-item allocations page) ─

export async function getCommitmentsForItem(
  db: D1Database,
  stockItemId: number,
  fromDate?: string,
  toDate?: string,
): Promise<Array<{
  event_id: number; event_name: string; event_date: string;
  status: string; quantity: number; equip_id: number; override_reason: string | null;
}>> {
  const params: any[] = [stockItemId]
  let sql = `
    SELECT cee.id AS equip_id, cee.quantity AS quantity, cee.override_reason,
           ce.id AS event_id, ce.event_name, ce.event_date, ce.status
    FROM calendar_event_equipment cee
    JOIN calendar_events ce ON ce.id = cee.event_id
    WHERE cee.stock_item_id = ?
      AND ce.status != 'cancelled'`
  if (fromDate) { sql += ` AND ce.event_date >= ?`; params.push(fromDate) }
  if (toDate)   { sql += ` AND ce.event_date <= ?`; params.push(toDate)   }
  sql += ` ORDER BY ce.event_date ASC, ce.event_name ASC`
  const res = await db.prepare(sql).bind(...params).all<any>()
  return (res.results || []).map(r => ({
    event_id: r.event_id,
    event_name: r.event_name,
    event_date: r.event_date,
    status: r.status,
    quantity: Number(r.quantity) || 0,
    equip_id: r.equip_id,
    override_reason: r.override_reason || null,
  }))
}

// ─── Picker: fuzzy match a free-text query against the catalogue ──────────

/**
 * Search the active stock catalogue for the top N matches to a free-text
 * query, with availability for the given event date attached.
 *
 * Used by the equipment picker dropdown.
 */
export async function pickerCandidates(
  db: D1Database,
  query: string,
  eventDate: string,
  excludeEventId?: number,
  limit = 8,
): Promise<PickerCandidate[]> {
  const q = (query || '').trim()
  if (!q) return []

  // Load the full active catalogue. (~600 rows in prod today.)
  // We pull ALL active items, not just 'active' status, because the picker
  // may want to show 'review' items in a disabled state — but Bibi confirmed
  // only 'active' counts for availability, so we filter here too.
  const allRes = await db.prepare(
    `SELECT id, brand, description, qty_on_hand, custody_type, status, active, location
     FROM stock_items
     WHERE active = 1`
  ).all<StockCandidate>()
  const catalogue = (allRes.results || [])

  // Build candidate list for fuzzy
  const fuzzyInput = catalogue.map(c => ({
    id: c.id,
    name: `${c.brand} ${c.description}`.trim(),
    category: c.brand,
  }))
  const result = findMatches(q, fuzzyInput, limit)

  // Pull commitments on the date for all candidate ids in one go
  const candidateIds = result.candidates.map(c => c.item_id)
  let commitMap = new Map<number, number>()
  if (candidateIds.length > 0) {
    const placeholders = candidateIds.map(() => '?').join(',')
    const params: any[] = [eventDate, ...candidateIds]
    let sql = `
      SELECT cee.stock_item_id AS sid, SUM(cee.quantity) AS qty
      FROM calendar_event_equipment cee
      JOIN calendar_events ce ON ce.id = cee.event_id
      WHERE ce.event_date = ?
        AND ce.status != 'cancelled'
        AND cee.stock_item_id IN (${placeholders})`
    if (excludeEventId) { sql += ` AND ce.id != ?`; params.push(excludeEventId) }
    sql += ` GROUP BY cee.stock_item_id`
    const commitRes = await db.prepare(sql).bind(...params).all<{ sid: number; qty: number }>()
    for (const r of (commitRes.results || [])) commitMap.set(r.sid, Number(r.qty) || 0)
  }

  const out: PickerCandidate[] = []
  for (const c of result.candidates) {
    const cat = catalogue.find(x => x.id === c.item_id)
    if (!cat) continue
    const committed = commitMap.get(cat.id) || 0
    const counts = cat.active === 1 && cat.status === 'active' && cat.custody_type === 'owned'
    out.push({
      ...cat,
      score: c.score,
      reason: c.reason,
      committed_on_date: committed,
      available_on_date: cat.qty_on_hand - committed,
      counts_toward_availability: counts,
    })
  }
  return out
}

// ─── Allocation writers (audit trail in stock_movements) ─────────────────

export async function recordAllocation(
  db: D1Database,
  equipId: number,
  eventId: number,
  stockItemId: number,
  qty: number,
  user: { id: number; name: string } | null,
): Promise<void> {
  await db.prepare(
    `INSERT INTO stock_movements
     (stock_item_id, action, field_changed, old_value, new_value, delta, reason, user_id, user_name)
     VALUES (?, 'allocate', 'committed_qty', NULL, ?, ?, ?, ?, ?)`
  ).bind(
    stockItemId,
    String(qty),
    qty,
    `event #${eventId} equip #${equipId}`,
    user?.id ?? null,
    user?.name ?? null,
  ).run()
}

export async function recordDeallocation(
  db: D1Database,
  equipId: number,
  eventId: number,
  stockItemId: number,
  qty: number,
  user: { id: number; name: string } | null,
): Promise<void> {
  await db.prepare(
    `INSERT INTO stock_movements
     (stock_item_id, action, field_changed, old_value, new_value, delta, reason, user_id, user_name)
     VALUES (?, 'deallocate', 'committed_qty', ?, NULL, ?, ?, ?, ?)`
  ).bind(
    stockItemId,
    String(qty),
    -qty,
    `event #${eventId} equip #${equipId}`,
    user?.id ?? null,
    user?.name ?? null,
  ).run()
}

// ─── Shortage management (auto-create on overbook, resolve later) ────────

/**
 * Recompute whether there's a shortage for this (item, event) and write
 * to stock_shortages accordingly.
 *
 *  - If sum of commits on event date > qty_on_hand AND custody=owned →
 *    upsert open shortage with the new quantity_short.
 *  - If commits ≤ qty_on_hand → mark any open shortage row resolved with
 *    resolution='self_resolved' (the overbook went away on its own — e.g.
 *    you removed an equipment line, or qty_on_hand went up).
 *
 * Returns the current quantity_short (0 if no shortage).
 */
export async function recomputeShortage(
  db: D1Database,
  eventId: number,
  stockItemId: number,
  eventDate: string,
): Promise<number> {
  const item = await db.prepare(
    `SELECT id, qty_on_hand, custody_type, status, active FROM stock_items WHERE id = ?`
  ).bind(stockItemId).first<{
    id: number; qty_on_hand: number; custody_type: string; status: string; active: number
  }>()
  if (!item) return 0

  // Shortages only meaningful for items that count toward availability
  const counts = item.active === 1 && item.status === 'active' && item.custody_type === 'owned'

  // Total commits on the event date (including THIS event)
  const sumRow = await db.prepare(
    `SELECT COALESCE(SUM(cee.quantity), 0) AS qty
     FROM calendar_event_equipment cee
     JOIN calendar_events ce ON ce.id = cee.event_id
     WHERE cee.stock_item_id = ?
       AND ce.event_date = ?
       AND ce.status != 'cancelled'`
  ).bind(stockItemId, eventDate).first<{ qty: number }>()
  const totalCommitted = Number(sumRow?.qty) || 0

  const short = counts ? Math.max(0, totalCommitted - (item.qty_on_hand || 0)) : 0

  // How much does THIS event contribute?
  const thisEventRow = await db.prepare(
    `SELECT COALESCE(SUM(quantity), 0) AS qty
     FROM calendar_event_equipment
     WHERE event_id = ? AND stock_item_id = ?`
  ).bind(eventId, stockItemId).first<{ qty: number }>()
  const thisEventQty = Number(thisEventRow?.qty) || 0

  // Locate any existing OPEN shortage row for this (event, item) pair
  const existing = await db.prepare(
    `SELECT id FROM stock_shortages
     WHERE event_id = ? AND stock_item_id = ?
       AND (resolution IS NULL OR resolution = '')
     ORDER BY id DESC LIMIT 1`
  ).bind(eventId, stockItemId).first<{ id: number }>()

  if (short > 0 && thisEventQty > 0) {
    // Allocate the shortage proportionally to this event's contribution.
    // (For simplicity: this event "owns" min(its qty, shortage). That keeps
    // the UI per-event meaningful.)
    const eventShort = Math.min(thisEventQty, short)
    if (existing) {
      await db.prepare(
        `UPDATE stock_shortages SET quantity_short = ? WHERE id = ?`
      ).bind(eventShort, existing.id).run()
    } else {
      await db.prepare(
        `INSERT INTO stock_shortages (stock_item_id, event_id, quantity_short)
         VALUES (?, ?, ?)`
      ).bind(stockItemId, eventId, eventShort).run()
    }
    return eventShort
  } else if (existing) {
    // No shortage anymore — auto-resolve
    await db.prepare(
      `UPDATE stock_shortages
       SET resolution = 'self_resolved',
           resolved_at = CURRENT_TIMESTAMP,
           notes = COALESCE(notes, '') || CASE WHEN notes IS NULL OR notes = '' THEN '' ELSE ' | ' END || 'auto-resolved: commits no longer exceed inventory'
       WHERE id = ?`
    ).bind(existing.id).run()
  }
  return 0
}

// ─── Shortages dashboard ─────────────────────────────────────────────────

export async function listOpenShortages(db: D1Database): Promise<OpenShortage[]> {
  const res = await db.prepare(
    `SELECT s.id, s.stock_item_id, s.event_id, s.quantity_short, s.resolution,
            s.resolved_at, s.resolved_by, s.notes, s.created_at,
            si.brand, si.description, si.qty_on_hand,
            ce.event_name, ce.event_date, ce.status AS event_status
     FROM stock_shortages s
     JOIN stock_items si    ON si.id = s.stock_item_id
     JOIN calendar_events ce ON ce.id = s.event_id
     WHERE (s.resolution IS NULL OR s.resolution = '')
     ORDER BY ce.event_date ASC, s.created_at ASC`
  ).all<OpenShortage>()
  return res.results || []
}

export async function listRecentResolvedShortages(db: D1Database, limit = 30): Promise<OpenShortage[]> {
  const res = await db.prepare(
    `SELECT s.id, s.stock_item_id, s.event_id, s.quantity_short, s.resolution,
            s.resolved_at, s.resolved_by, s.notes, s.created_at,
            si.brand, si.description, si.qty_on_hand,
            ce.event_name, ce.event_date, ce.status AS event_status
     FROM stock_shortages s
     JOIN stock_items si    ON si.id = s.stock_item_id
     JOIN calendar_events ce ON ce.id = s.event_id
     WHERE s.resolution IS NOT NULL AND s.resolution != ''
     ORDER BY s.resolved_at DESC LIMIT ?`
  ).bind(limit).all<OpenShortage>()
  return res.results || []
}

export const SHORTAGE_RESOLUTIONS = ['sub_rental', 'fix_by_event', 'override', 'cancelled'] as const
export type ShortageResolution = typeof SHORTAGE_RESOLUTIONS[number]

export async function resolveShortage(
  db: D1Database,
  shortageId: number,
  resolution: ShortageResolution,
  notes: string | null,
  user: { id: number; name: string } | null,
): Promise<void> {
  await db.prepare(
    `UPDATE stock_shortages
     SET resolution = ?,
         resolved_at = CURRENT_TIMESTAMP,
         resolved_by = ?,
         notes = ?
     WHERE id = ?`
  ).bind(resolution, user?.id ?? null, notes, shortageId).run()
}

export async function reopenShortage(db: D1Database, shortageId: number): Promise<void> {
  await db.prepare(
    `UPDATE stock_shortages
     SET resolution = NULL, resolved_at = NULL, resolved_by = NULL
     WHERE id = ?`
  ).bind(shortageId).run()
}

export async function countOpenShortages(db: D1Database): Promise<number> {
  const row = await db.prepare(
    `SELECT COUNT(*) AS n FROM stock_shortages WHERE resolution IS NULL OR resolution = ''`
  ).first<{ n: number }>()
  return row?.n || 0
}
