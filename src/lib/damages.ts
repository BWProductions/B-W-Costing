// ─────────────────────────────────────────────────────────────────────────
// Phase 11: Damages & Write-offs Register — domain library
// ─────────────────────────────────────────────────────────────────────────
//
// Two ways damages get created:
//   1. Automatically when a return is completed (Phase 9 writes them)
//   2. Manually via /admin/stock/damages/new (this lib provides the writer)
//
// Lifecycle:
//   open → approved (finance) → written_off | recovered | cancelled
//
// On write-off:
//   * status flips to 'written_off'
//   * qty_damaged on stock_items decreases (item is now formally gone)
//   * stock_movements row written with reason_category='damaged_writeoff'

export type DamageRecord = {
  id: number
  stock_item_id: number
  brand: string | null
  description: string | null
  quantity: number
  damage_type: 'broken' | 'missing' | 'lost_on_site'
  cause: string | null
  event_id: number | null
  event_name: string | null
  return_id: number | null
  unit_value: number | null
  total_value: number | null
  status: 'open' | 'approved' | 'written_off' | 'recovered' | 'cancelled'
  resolution_notes: string | null
  reported_by_name: string | null
  approved_by: number | null
  approved_at: string | null
  written_off_at: string | null
  created_at: string
  updated_at: string
}

export type DamageStats = {
  open_count: number
  open_units: number
  open_value: number
  approved_count: number
  approved_value: number
  writtenoff_30d_count: number
  writtenoff_30d_value: number
  by_type: Record<string, { count: number; units: number }>
}

// ─── List damages (with filters) ──────────────────────────────────────────

export async function listDamages(
  db: D1Database,
  opts: { status?: string; type?: string; brand?: string; limit?: number } = {}
): Promise<DamageRecord[]> {
  const where: string[] = []
  const binds: any[] = []
  if (opts.status) { where.push('sd.status = ?'); binds.push(opts.status) }
  if (opts.type)   { where.push('sd.damage_type = ?'); binds.push(opts.type) }
  if (opts.brand)  { where.push('si.brand = ?'); binds.push(opts.brand) }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const limit = opts.limit ?? 200

  const res = await db.prepare(`
    SELECT sd.*, si.brand, si.description, ce.event_name
    FROM stock_damages sd
    LEFT JOIN stock_items si    ON si.id = sd.stock_item_id
    LEFT JOIN calendar_events ce ON ce.id = sd.event_id
    ${whereSql}
    ORDER BY sd.created_at DESC
    LIMIT ?
  `).bind(...binds, limit).all<any>()

  return (res.results || []) as DamageRecord[]
}

// ─── Single damage record ────────────────────────────────────────────────

export async function getDamage(db: D1Database, id: number): Promise<DamageRecord | null> {
  const r = await db.prepare(`
    SELECT sd.*, si.brand, si.description, ce.event_name
    FROM stock_damages sd
    LEFT JOIN stock_items si    ON si.id = sd.stock_item_id
    LEFT JOIN calendar_events ce ON ce.id = sd.event_id
    WHERE sd.id = ?
  `).bind(id).first<any>()
  return (r as DamageRecord) || null
}

// ─── Roll-up stats for damages dashboard ─────────────────────────────────

export async function getDamageStats(db: D1Database): Promise<DamageStats> {
  const openRes = await db.prepare(`
    SELECT COUNT(*) AS open_count,
           COALESCE(SUM(quantity), 0) AS open_units,
           COALESCE(SUM(total_value), 0) AS open_value
    FROM stock_damages WHERE status = 'open'
  `).first<any>()

  const approvedRes = await db.prepare(`
    SELECT COUNT(*) AS n,
           COALESCE(SUM(total_value), 0) AS v
    FROM stock_damages WHERE status = 'approved'
  `).first<any>()

  const since30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const woRes = await db.prepare(`
    SELECT COUNT(*) AS n,
           COALESCE(SUM(total_value), 0) AS v
    FROM stock_damages
    WHERE status = 'written_off' AND date(written_off_at) >= ?
  `).bind(since30).first<any>()

  const typeRes = await db.prepare(`
    SELECT damage_type, COUNT(*) AS n, COALESCE(SUM(quantity), 0) AS units
    FROM stock_damages
    WHERE status IN ('open', 'approved')
    GROUP BY damage_type
  `).all<{ damage_type: string; n: number; units: number }>()

  const by_type: Record<string, { count: number; units: number }> = {}
  for (const r of (typeRes.results || [])) by_type[r.damage_type] = { count: r.n, units: r.units }

  return {
    open_count: openRes?.open_count || 0,
    open_units: openRes?.open_units || 0,
    open_value: openRes?.open_value || 0,
    approved_count: approvedRes?.n || 0,
    approved_value: approvedRes?.v || 0,
    writtenoff_30d_count: woRes?.n || 0,
    writtenoff_30d_value: woRes?.v || 0,
    by_type,
  }
}

// ─── Create a manual damage report (not from a return) ───────────────────

export async function createDamage(
  db: D1Database,
  input: {
    stock_item_id: number
    quantity: number
    damage_type: 'broken' | 'missing' | 'lost_on_site'
    cause?: string | null
    event_id?: number | null
    unit_value?: number | null
  },
  user: { id?: number; name?: string }
): Promise<number> {
  if (input.quantity <= 0) throw new Error('Quantity must be positive')
  const total = (input.unit_value && input.quantity) ? input.unit_value * input.quantity : null

  const ins = await db.prepare(`
    INSERT INTO stock_damages
      (stock_item_id, quantity, damage_type, cause, event_id,
       unit_value, total_value, status, reported_by, reported_by_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
  `).bind(
    input.stock_item_id, input.quantity, input.damage_type,
    input.cause ?? null, input.event_id ?? null,
    input.unit_value ?? null, total,
    user.id ?? null, user.name ?? null
  ).run()

  const damageId = ins.meta.last_row_id as number

  // For "broken" — bump qty_damaged (item still owned, just unusable)
  // For "missing" / "lost_on_site" — reduce qty_on_hand directly (it's gone)
  if (input.damage_type === 'broken') {
    await db.prepare(`UPDATE stock_items SET qty_damaged = qty_damaged + ? WHERE id = ?`).bind(input.quantity, input.stock_item_id).run()
  } else {
    await db.prepare(`UPDATE stock_items SET qty_on_hand = MAX(0, qty_on_hand - ?) WHERE id = ?`).bind(input.quantity, input.stock_item_id).run()
    // Audit log
    await db.prepare(`
      INSERT INTO stock_movements
        (stock_item_id, action, field_changed, old_value, new_value, delta,
         reason, reason_category, event_id, user_id, user_name)
      VALUES (?, 'damage', 'qty_on_hand', NULL, NULL, ?, ?, ?, ?, ?, ?)
    `).bind(
      input.stock_item_id,
      -input.quantity,
      input.cause || `${input.damage_type} reported`,
      input.damage_type === 'missing' ? 'event_missing' : 'event_lost_on_site',
      input.event_id ?? null, user.id ?? null, user.name ?? null
    ).run()
  }

  return damageId
}

// ─── State transitions ───────────────────────────────────────────────────

export async function approveDamage(db: D1Database, id: number, user: { id?: number; name?: string }, notes?: string): Promise<void> {
  const d = await getDamage(db, id)
  if (!d) throw new Error('Damage not found')
  if (d.status !== 'open') throw new Error('Only open damages can be approved')
  await db.prepare(`
    UPDATE stock_damages
    SET status = 'approved', approved_by = ?, approved_at = ?,
        resolution_notes = COALESCE(?, resolution_notes), updated_at = ?
    WHERE id = ?
  `).bind(user.id ?? null, new Date().toISOString(), notes ?? null, new Date().toISOString(), id).run()
}

export async function writeOffDamage(db: D1Database, id: number, user: { id?: number; name?: string }, notes?: string): Promise<void> {
  const d = await getDamage(db, id)
  if (!d) throw new Error('Damage not found')
  if (d.status !== 'approved' && d.status !== 'open') throw new Error('Damage must be open or approved to write off')

  // For "broken" damages we still hold qty_damaged — now formally remove it
  if (d.damage_type === 'broken') {
    await db.prepare(`UPDATE stock_items SET qty_damaged = MAX(0, qty_damaged - ?) WHERE id = ?`).bind(d.quantity, d.stock_item_id).run()
  }
  // missing/lost_on_site already reduced qty_on_hand at creation; no further qty change

  // Audit: write the write-off movement
  await db.prepare(`
    INSERT INTO stock_movements
      (stock_item_id, action, field_changed, old_value, new_value, delta,
       reason, reason_category, event_id, user_id, user_name)
    VALUES (?, 'writeoff', 'qty_damaged', NULL, NULL, ?, ?, 'damaged_writeoff', ?, ?, ?)
  `).bind(
    d.stock_item_id,
    -d.quantity,
    `Write-off approved: ${d.damage_type} (${notes || d.cause || 'no notes'})`,
    d.event_id, user.id ?? null, user.name ?? null
  ).run()

  await db.prepare(`
    UPDATE stock_damages
    SET status = 'written_off', written_off_at = ?,
        approved_by = COALESCE(approved_by, ?),
        approved_at = COALESCE(approved_at, ?),
        resolution_notes = COALESCE(?, resolution_notes),
        updated_at = ?
    WHERE id = ?
  `).bind(
    new Date().toISOString(),
    user.id ?? null, new Date().toISOString(),
    notes ?? null,
    new Date().toISOString(), id
  ).run()
}

export async function recoverDamage(db: D1Database, id: number, user: { id?: number; name?: string }, notes?: string): Promise<void> {
  const d = await getDamage(db, id)
  if (!d) throw new Error('Damage not found')
  if (d.status === 'written_off' || d.status === 'cancelled') throw new Error('Cannot recover a written-off/cancelled damage')

  // The unit came back! For broken: qty_damaged decreases, qty_on_hand increases.
  // For missing/lost_on_site: qty_on_hand increases (it returned somehow).
  if (d.damage_type === 'broken') {
    await db.prepare(`UPDATE stock_items SET qty_damaged = MAX(0, qty_damaged - ?), qty_on_hand = qty_on_hand + ? WHERE id = ?`).bind(d.quantity, d.quantity, d.stock_item_id).run()
  } else {
    await db.prepare(`UPDATE stock_items SET qty_on_hand = qty_on_hand + ? WHERE id = ?`).bind(d.quantity, d.stock_item_id).run()
  }

  await db.prepare(`
    INSERT INTO stock_movements
      (stock_item_id, action, field_changed, old_value, new_value, delta,
       reason, reason_category, event_id, user_id, user_name)
    VALUES (?, 'recover', 'qty_on_hand', NULL, NULL, ?, ?, 'replenishment', ?, ?, ?)
  `).bind(
    d.stock_item_id,
    d.quantity,
    `Damage recovered: ${notes || 'item returned'}`,
    d.event_id, user.id ?? null, user.name ?? null
  ).run()

  await db.prepare(`
    UPDATE stock_damages
    SET status = 'recovered', resolution_notes = COALESCE(?, resolution_notes), updated_at = ?
    WHERE id = ?
  `).bind(notes ?? null, new Date().toISOString(), id).run()
}

export async function cancelDamage(db: D1Database, id: number, user: { id?: number; name?: string }, notes?: string): Promise<void> {
  const d = await getDamage(db, id)
  if (!d) throw new Error('Damage not found')
  if (d.status === 'written_off') throw new Error('Cannot cancel a written-off damage')

  // Reverse the qty effects from creation
  if (d.damage_type === 'broken') {
    await db.prepare(`UPDATE stock_items SET qty_damaged = MAX(0, qty_damaged - ?) WHERE id = ?`).bind(d.quantity, d.stock_item_id).run()
  } else {
    // missing/lost reduced qty_on_hand at creation — restore it
    await db.prepare(`UPDATE stock_items SET qty_on_hand = qty_on_hand + ? WHERE id = ?`).bind(d.quantity, d.stock_item_id).run()
  }

  await db.prepare(`
    UPDATE stock_damages
    SET status = 'cancelled', resolution_notes = COALESCE(?, resolution_notes), updated_at = ?
    WHERE id = ?
  `).bind(notes ? `CANCEL: ${notes}` : 'CANCEL', new Date().toISOString(), id).run()
}
