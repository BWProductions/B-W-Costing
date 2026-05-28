// ─────────────────────────────────────────────────────────────────────────
// Phase 9: Stock Returns & Reconciliation — domain library
// ─────────────────────────────────────────────────────────────────────────
//
// What this does:
//   * Lists events that need returns (allocations exist, no completed return)
//   * Creates a draft return for a given event with pre-filled lines from
//     calendar_event_equipment
//   * Saves return lines (returned_ok / broken / missing / lost_on_site)
//   * On completion:
//       1. Writes stock_movements for each disposition (reason_category set)
//       2. Updates stock_items.qty_on_hand for returned_ok
//       3. Updates stock_items.qty_damaged for broken
//       4. Creates stock_damages rows for broken/missing/lost_on_site
//       5. Auto-resolves matching stock_shortages where returns satisfy them
//
// Public API:
//   listPendingReturns(db)
//   listAllReturns(db, limit?)
//   getReturn(db, id)
//   createDraftForEvent(db, eventId, user)
//   saveReturnLines(db, returnId, lines, user)
//   completeReturn(db, returnId, user)
//   cancelReturn(db, returnId, user)

import type { ReasonCategory } from './movement-reasons.js'

export type ReturnHeader = {
  id: number
  event_id: number
  event_date: string | null
  event_name: string | null
  return_date: string
  status: 'draft' | 'completed' | 'cancelled'
  notes: string | null
  total_lines: number
  total_returned: number
  total_broken: number
  total_missing: number
  total_lost: number
  created_by: number | null
  created_by_name: string | null
  created_at: string
  completed_at: string | null
  completed_by: number | null
}

export type ReturnLine = {
  id: number
  return_id: number
  event_id: number
  stock_item_id: number | null
  description: string
  qty_allocated: number
  returned_ok: number
  returned_broken: number
  missing: number
  lost_on_site: number
  damage_notes: string | null
  unit_value: number | null
  created_at: string
}

export type ReturnLineInput = {
  id?: number                  // existing line id, if updating
  stock_item_id: number | null
  description: string
  qty_allocated: number
  returned_ok: number
  returned_broken: number
  missing: number
  lost_on_site: number
  damage_notes?: string | null
  unit_value?: number | null
}

export type PendingEvent = {
  event_id: number
  event_date: string
  event_name: string
  status: string
  allocated_lines: number
  allocated_units: number
  days_since_event: number
  existing_return_id: number | null
  existing_return_status: string | null
}

// ─── List pending events that need returns ────────────────────────────────

export async function listPendingReturns(db: D1Database): Promise<PendingEvent[]> {
  // Events that:
  //   * have at least one calendar_event_equipment row
  //   * event_date is in the past (≤ today)
  //   * status != 'cancelled'
  //   * don't have a completed return covering everything
  const today = new Date().toISOString().slice(0, 10)
  const res = await db.prepare(`
    SELECT ce.id AS event_id, ce.event_date, ce.event_name, ce.status,
           COUNT(cee.id) AS allocated_lines,
           COALESCE(SUM(cee.quantity), 0) AS allocated_units,
           (SELECT id FROM stock_returns sr
            WHERE sr.event_id = ce.id AND sr.status != 'cancelled'
            ORDER BY sr.created_at DESC LIMIT 1) AS existing_return_id,
           (SELECT status FROM stock_returns sr
            WHERE sr.event_id = ce.id AND sr.status != 'cancelled'
            ORDER BY sr.created_at DESC LIMIT 1) AS existing_return_status
    FROM calendar_events ce
    JOIN calendar_event_equipment cee ON cee.event_id = ce.id
    WHERE ce.event_date <= ?
      AND ce.status != 'cancelled'
    GROUP BY ce.id
    ORDER BY ce.event_date DESC
  `).bind(today).all<any>()

  const rows = res.results || []
  return rows.map(r => ({
    event_id: r.event_id,
    event_date: r.event_date,
    event_name: r.event_name,
    status: r.status,
    allocated_lines: r.allocated_lines,
    allocated_units: r.allocated_units,
    days_since_event: daysSince(r.event_date),
    existing_return_id: r.existing_return_id,
    existing_return_status: r.existing_return_status,
  }))
}

function daysSince(yyyymmdd: string): number {
  const then = new Date(yyyymmdd + 'T00:00:00Z').getTime()
  const now = Date.now()
  return Math.max(0, Math.floor((now - then) / 86400000))
}

// ─── List all returns (admin overview) ────────────────────────────────────

export async function listAllReturns(db: D1Database, limit = 100): Promise<ReturnHeader[]> {
  const res = await db.prepare(`
    SELECT sr.*, ce.event_date, ce.event_name
    FROM stock_returns sr
    LEFT JOIN calendar_events ce ON ce.id = sr.event_id
    ORDER BY sr.created_at DESC
    LIMIT ?
  `).bind(limit).all<any>()
  return (res.results || []) as ReturnHeader[]
}

// ─── Single return with lines ─────────────────────────────────────────────

export async function getReturn(db: D1Database, id: number): Promise<{ header: ReturnHeader; lines: ReturnLine[] } | null> {
  const header = await db.prepare(`
    SELECT sr.*, ce.event_date, ce.event_name
    FROM stock_returns sr
    LEFT JOIN calendar_events ce ON ce.id = sr.event_id
    WHERE sr.id = ?
  `).bind(id).first<any>()
  if (!header) return null

  const linesRes = await db.prepare(`
    SELECT * FROM stock_return_lines WHERE return_id = ? ORDER BY id ASC
  `).bind(id).all<any>()

  return {
    header: header as ReturnHeader,
    lines: (linesRes.results || []) as ReturnLine[],
  }
}

// ─── Create a draft return prefilled from event allocations ───────────────

export async function createDraftForEvent(
  db: D1Database,
  eventId: number,
  user: { id?: number; name?: string }
): Promise<number> {
  // Refuse to create a second open return for the same event
  const existing = await db.prepare(
    `SELECT id FROM stock_returns WHERE event_id = ? AND status = 'draft' LIMIT 1`
  ).bind(eventId).first<{ id: number }>()
  if (existing) return existing.id

  const today = new Date().toISOString().slice(0, 10)
  const ins = await db.prepare(`
    INSERT INTO stock_returns
      (event_id, return_date, status, created_by, created_by_name)
    VALUES (?, ?, 'draft', ?, ?)
  `).bind(eventId, today, user.id ?? null, user.name ?? null).run()
  const returnId = ins.meta.last_row_id as number

  // Pull allocations and pre-fill lines
  const allocs = await db.prepare(`
    SELECT cee.id AS cee_id, cee.stock_item_id, cee.description, cee.quantity
    FROM calendar_event_equipment cee
    WHERE cee.event_id = ?
    ORDER BY cee.id ASC
  `).bind(eventId).all<{ cee_id: number; stock_item_id: number | null; description: string; quantity: number }>()

  for (const a of (allocs.results || [])) {
    await db.prepare(`
      INSERT INTO stock_return_lines
        (return_id, event_id, stock_item_id, description, qty_allocated,
         returned_ok, returned_broken, missing, lost_on_site)
      VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0)
    `).bind(returnId, eventId, a.stock_item_id, a.description, a.quantity, a.quantity).run()
    //                                                                       ^^^ default: assume everything returned ok
  }

  return returnId
}

// ─── Save / update return lines (draft only) ──────────────────────────────

export async function saveReturnLines(
  db: D1Database,
  returnId: number,
  lines: ReturnLineInput[],
  user: { id?: number; name?: string }
): Promise<void> {
  const hdr = await db.prepare(`SELECT status, event_id FROM stock_returns WHERE id = ?`).bind(returnId).first<{ status: string; event_id: number }>()
  if (!hdr) throw new Error('Return not found')
  if (hdr.status !== 'draft') throw new Error('Cannot edit a non-draft return')

  for (const l of lines) {
    // Clamp values to be non-negative & total ≤ allocated
    const total = (l.returned_ok || 0) + (l.returned_broken || 0) + (l.missing || 0) + (l.lost_on_site || 0)
    if (total > l.qty_allocated) {
      throw new Error(`Line "${l.description}" totals ${total} but only ${l.qty_allocated} were allocated.`)
    }
    if (l.id) {
      await db.prepare(`
        UPDATE stock_return_lines
        SET returned_ok = ?, returned_broken = ?, missing = ?, lost_on_site = ?,
            damage_notes = ?, unit_value = ?
        WHERE id = ? AND return_id = ?
      `).bind(
        l.returned_ok, l.returned_broken, l.missing, l.lost_on_site,
        l.damage_notes ?? null, l.unit_value ?? null,
        l.id, returnId
      ).run()
    } else {
      await db.prepare(`
        INSERT INTO stock_return_lines
          (return_id, event_id, stock_item_id, description, qty_allocated,
           returned_ok, returned_broken, missing, lost_on_site, damage_notes, unit_value)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        returnId, hdr.event_id, l.stock_item_id, l.description, l.qty_allocated,
        l.returned_ok, l.returned_broken, l.missing, l.lost_on_site,
        l.damage_notes ?? null, l.unit_value ?? null
      ).run()
    }
  }

  // Refresh denormalised totals
  await refreshTotals(db, returnId)
}

async function refreshTotals(db: D1Database, returnId: number): Promise<void> {
  const sums = await db.prepare(`
    SELECT COUNT(*) AS total_lines,
           COALESCE(SUM(returned_ok), 0)     AS total_returned,
           COALESCE(SUM(returned_broken), 0) AS total_broken,
           COALESCE(SUM(missing), 0)         AS total_missing,
           COALESCE(SUM(lost_on_site), 0)    AS total_lost
    FROM stock_return_lines WHERE return_id = ?
  `).bind(returnId).first<any>()
  await db.prepare(`
    UPDATE stock_returns SET
      total_lines = ?, total_returned = ?, total_broken = ?,
      total_missing = ?, total_lost = ?
    WHERE id = ?
  `).bind(
    sums?.total_lines || 0,
    sums?.total_returned || 0,
    sums?.total_broken || 0,
    sums?.total_missing || 0,
    sums?.total_lost || 0,
    returnId
  ).run()
}

// ─── Complete a return: write the ledger ──────────────────────────────────
// This is THE critical method. Once a return is completed:
//   * returned_ok increases stock_items.qty_on_hand (back on shelf)
//   * returned_broken increases stock_items.qty_damaged (asset still owned, not usable)
//   * missing & lost_on_site DECREASE qty_on_hand (truly gone)
//   * stock_damages rows created for broken/missing/lost
//   * stock_movements rows created for the audit trail
//   * stock_shortages for this event auto-resolve where returns cover them

export async function completeReturn(
  db: D1Database,
  returnId: number,
  user: { id?: number; name?: string }
): Promise<{ moved: number; damages: number; shortagesResolved: number }> {
  const r = await getReturn(db, returnId)
  if (!r) throw new Error('Return not found')
  if (r.header.status !== 'draft') throw new Error('Return is not a draft')

  let movements = 0
  let damages = 0
  let shortagesResolved = 0
  const now = new Date().toISOString()
  const userId = user.id ?? null
  const userName = user.name ?? null

  for (const l of r.lines) {
    // Skip lines with no stock_item_id (free-text only — can't move inventory)
    if (!l.stock_item_id) continue

    // ── 1. returned_ok → qty_on_hand += n
    if (l.returned_ok > 0) {
      await db.prepare(`UPDATE stock_items SET qty_on_hand = qty_on_hand + ? WHERE id = ?`).bind(l.returned_ok, l.stock_item_id).run()
      await writeMovement(db, l.stock_item_id, 'event_return_ok', l.returned_ok, l.returned_ok, r.header.event_id, returnId, `Returned OK from event #${r.header.event_id}`, userId, userName)
      movements++
    }

    // ── 2. returned_broken → qty_damaged += n, log damage
    if (l.returned_broken > 0) {
      await db.prepare(`UPDATE stock_items SET qty_damaged = qty_damaged + ? WHERE id = ?`).bind(l.returned_broken, l.stock_item_id).run()
      await writeMovement(db, l.stock_item_id, 'event_return_broken', 0, l.returned_broken, r.header.event_id, returnId, `Returned broken from event #${r.header.event_id}: ${l.damage_notes || ''}`.trim(), userId, userName)
      await writeDamage(db, l.stock_item_id, l.returned_broken, 'broken', l.damage_notes, r.header.event_id, returnId, l.id, l.unit_value, userId, userName)
      movements++; damages++
    }

    // ── 3. missing → qty_on_hand -= n, log damage(missing)
    if (l.missing > 0) {
      await db.prepare(`UPDATE stock_items SET qty_on_hand = MAX(0, qty_on_hand - ?) WHERE id = ?`).bind(l.missing, l.stock_item_id).run()
      await writeMovement(db, l.stock_item_id, 'event_missing', -l.missing, l.missing, r.header.event_id, returnId, `Missing after event #${r.header.event_id}`, userId, userName)
      await writeDamage(db, l.stock_item_id, l.missing, 'missing', l.damage_notes, r.header.event_id, returnId, l.id, l.unit_value, userId, userName)
      movements++; damages++
    }

    // ── 4. lost_on_site → qty_on_hand -= n, log damage(lost_on_site)
    if (l.lost_on_site > 0) {
      await db.prepare(`UPDATE stock_items SET qty_on_hand = MAX(0, qty_on_hand - ?) WHERE id = ?`).bind(l.lost_on_site, l.stock_item_id).run()
      await writeMovement(db, l.stock_item_id, 'event_lost_on_site', -l.lost_on_site, l.lost_on_site, r.header.event_id, returnId, `Lost on site at event #${r.header.event_id}`, userId, userName)
      await writeDamage(db, l.stock_item_id, l.lost_on_site, 'lost_on_site', l.damage_notes, r.header.event_id, returnId, l.id, l.unit_value, userId, userName)
      movements++; damages++
    }
  }

  // ── 5. Auto-resolve shortages for this event if the return clears them ──
  // Match each shortage to a line via stock_item_id and see if returned_ok ≥ quantity_short
  const openShorts = await db.prepare(`
    SELECT id, stock_item_id, quantity_short FROM stock_shortages
    WHERE event_id = ? AND (resolution IS NULL OR resolution = '')
  `).bind(r.header.event_id).all<{ id: number; stock_item_id: number; quantity_short: number }>()

  for (const s of (openShorts.results || [])) {
    const matchLine = r.lines.find(l => l.stock_item_id === s.stock_item_id)
    if (matchLine && matchLine.returned_ok >= s.quantity_short) {
      await db.prepare(`
        UPDATE stock_shortages
        SET resolution = 'returned',
            resolved_at = ?,
            resolved_by = ?,
            notes = COALESCE(notes, '') || CASE WHEN notes IS NULL OR notes='' THEN '' ELSE ' · ' END || 'Auto-resolved by return #${returnId}'
        WHERE id = ?
      `).bind(now, userId, s.id).run()
      shortagesResolved++
    }
  }

  // ── 6. Mark return complete ──
  await db.prepare(`
    UPDATE stock_returns
    SET status = 'completed', completed_at = ?, completed_by = ?
    WHERE id = ?
  `).bind(now, userId, returnId).run()

  return { moved: movements, damages, shortagesResolved }
}

// ─── Cancel a draft return ────────────────────────────────────────────────

export async function cancelReturn(db: D1Database, returnId: number, user: { id?: number; name?: string }): Promise<void> {
  const hdr = await db.prepare(`SELECT status FROM stock_returns WHERE id = ?`).bind(returnId).first<{ status: string }>()
  if (!hdr) throw new Error('Return not found')
  if (hdr.status !== 'draft') throw new Error('Only draft returns can be cancelled')
  await db.prepare(`UPDATE stock_returns SET status = 'cancelled' WHERE id = ?`).bind(returnId).run()
}

// ─── Internal: write a stock_movements row ────────────────────────────────

async function writeMovement(
  db: D1Database,
  stockItemId: number,
  reasonCategory: ReasonCategory,
  delta: number,
  qty: number,
  eventId: number | null,
  returnId: number | null,
  reasonText: string,
  userId: number | null,
  userName: string | null
): Promise<void> {
  await db.prepare(`
    INSERT INTO stock_movements
      (stock_item_id, action, field_changed, old_value, new_value, delta,
       reason, reason_category, return_id, event_id, user_id, user_name)
    VALUES (?, 'return', 'qty_on_hand', NULL, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    stockItemId,
    String(qty),
    delta,
    reasonText,
    reasonCategory,
    returnId,
    eventId,
    userId,
    userName
  ).run()
}

// ─── Internal: write a stock_damages row ──────────────────────────────────

async function writeDamage(
  db: D1Database,
  stockItemId: number,
  quantity: number,
  damageType: 'broken' | 'missing' | 'lost_on_site',
  cause: string | null | undefined,
  eventId: number | null,
  returnId: number | null,
  returnLineId: number | null,
  unitValue: number | null | undefined,
  userId: number | null,
  userName: string | null
): Promise<void> {
  const totalValue = (unitValue && quantity) ? unitValue * quantity : null
  await db.prepare(`
    INSERT INTO stock_damages
      (stock_item_id, quantity, damage_type, cause, event_id, return_id, return_line_id,
       unit_value, total_value, status, reported_by, reported_by_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
  `).bind(
    stockItemId, quantity, damageType, cause || null,
    eventId, returnId, returnLineId,
    unitValue ?? null, totalValue,
    userId, userName
  ).run()
}
