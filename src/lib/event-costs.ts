// ─────────────────────────────────────────────────────────────────────────
// Phase 12: Per-Event Cost Rollup
// ─────────────────────────────────────────────────────────────────────────
// Builds a costs view for any calendar_event by joining:
//   * stock allocations (calendar_event_equipment) — values from optional unit_value
//     fallback: no value (cost = 0 for that line)
//   * crew (calendar_event_crew) — count × default_event_hours × crew_hourly_rate
//   * vehicles (calendar_event_vehicles) — count × vehicle_day_rate (single-day)
//   * damages tied to this event (stock_damages) — total_value contribution
//   * cost_defaults for unit rates
//   * event_cost_overrides if finance has manually adjusted
//
// Revenue:
//   * if quotes.calendar_event_id linked → use quotes.total
//   * else event_cost_overrides.revenue_override
//   * else 0 (with "no revenue linked" warning)

export type CostDefaults = {
  crew_hourly_rate: number
  driver_hourly_rate: number
  vehicle_day_rate: number
  vehicle_km_rate: number
  default_event_hours: number
}

export type EventCostBreakdown = {
  event_id: number
  event_date: string
  event_name: string
  status: string

  // Components
  stock_lines:    number
  stock_units:    number
  stock_cost:     number
  stock_auto:     boolean   // true = derived, false = override

  crew_count:     number
  crew_hours:     number
  crew_cost:      number
  crew_auto:      boolean

  vehicle_count:  number
  vehicle_cost:   number
  vehicle_auto:   boolean

  damages_count:  number
  damages_cost:   number

  other_cost:     number

  // Totals
  cost_total:     number

  revenue:        number
  revenue_source: 'quote' | 'override' | 'none'
  quote_id:       number | null
  quote_number:   string | null

  margin:         number
  margin_pct:     number       // (margin / revenue) * 100; 0 if revenue == 0

  notes:          string | null
  overrides_present: boolean
}

// ─── Defaults helpers ─────────────────────────────────────────────────────

export async function getCostDefaults(db: D1Database): Promise<CostDefaults> {
  const r = await db.prepare(`SELECT * FROM cost_defaults WHERE id = 1`).first<any>()
  if (!r) {
    return { crew_hourly_rate: 250, driver_hourly_rate: 350, vehicle_day_rate: 800, vehicle_km_rate: 5, default_event_hours: 8 }
  }
  return {
    crew_hourly_rate:   r.crew_hourly_rate,
    driver_hourly_rate: r.driver_hourly_rate,
    vehicle_day_rate:   r.vehicle_day_rate,
    vehicle_km_rate:    r.vehicle_km_rate,
    default_event_hours: r.default_event_hours,
  }
}

export async function saveCostDefaults(db: D1Database, d: CostDefaults): Promise<void> {
  await db.prepare(`
    UPDATE cost_defaults SET
      crew_hourly_rate = ?, driver_hourly_rate = ?,
      vehicle_day_rate = ?, vehicle_km_rate = ?,
      default_event_hours = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
  `).bind(
    d.crew_hourly_rate, d.driver_hourly_rate,
    d.vehicle_day_rate, d.vehicle_km_rate,
    d.default_event_hours
  ).run()
}

// ─── Main calculator ──────────────────────────────────────────────────────

export async function calcEventCosts(db: D1Database, eventId: number): Promise<EventCostBreakdown | null> {
  const ev = await db.prepare(
    `SELECT id, event_date, event_name, status FROM calendar_events WHERE id = ?`
  ).bind(eventId).first<{ id: number; event_date: string; event_name: string; status: string }>()
  if (!ev) return null

  const defaults = await getCostDefaults(db)
  const override = await db.prepare(`SELECT * FROM event_cost_overrides WHERE event_id = ?`).bind(eventId).first<any>()

  // ── Stock ──
  const stockRes = await db.prepare(`
    SELECT COUNT(*) AS lines,
           COALESCE(SUM(quantity), 0) AS units
    FROM calendar_event_equipment WHERE event_id = ?
  `).bind(eventId).first<{ lines: number; units: number }>()

  // Stock cost = sum of (cee.quantity × stock_items.low_stock_threshold) is meaningless.
  // We don't have a unit_cost on stock_items today, so we can only express cost
  // via override or 0. The plumbing supports it once a unit_cost column lands.
  const stockCostRaw = 0
  const stockCost = override?.cost_stock !== null && override?.cost_stock !== undefined ? Number(override.cost_stock) : stockCostRaw
  const stockAuto = !(override?.cost_stock !== null && override?.cost_stock !== undefined)

  // ── Crew ──
  const crewRes = await db.prepare(
    `SELECT COUNT(*) AS n FROM calendar_event_crew WHERE event_id = ?`
  ).bind(eventId).first<{ n: number }>()
  const crewCount = crewRes?.n || 0
  const crewHours = crewCount * defaults.default_event_hours
  const crewCostRaw = crewCount * defaults.default_event_hours * defaults.crew_hourly_rate
  const crewCost = override?.cost_crew !== null && override?.cost_crew !== undefined ? Number(override.cost_crew) : crewCostRaw
  const crewAuto = !(override?.cost_crew !== null && override?.cost_crew !== undefined)

  // ── Vehicles ──
  const vehRes = await db.prepare(
    `SELECT COUNT(*) AS n FROM calendar_event_vehicles WHERE event_id = ?`
  ).bind(eventId).first<{ n: number }>()
  const vehCount = vehRes?.n || 0
  const vehCostRaw = vehCount * defaults.vehicle_day_rate
  const vehicleCost = override?.cost_fleet !== null && override?.cost_fleet !== undefined ? Number(override.cost_fleet) : vehCostRaw
  const vehicleAuto = !(override?.cost_fleet !== null && override?.cost_fleet !== undefined)

  // ── Damages tied to this event ──
  const dmgRes = await db.prepare(`
    SELECT COUNT(*) AS n, COALESCE(SUM(total_value), 0) AS v
    FROM stock_damages WHERE event_id = ? AND status != 'cancelled'
  `).bind(eventId).first<{ n: number; v: number }>()

  // ── Other ──
  const otherCost = override?.cost_other !== null && override?.cost_other !== undefined ? Number(override.cost_other) : 0

  // ── Total cost ──
  const totalCost = stockCost + crewCost + vehicleCost + (dmgRes?.v || 0) + otherCost

  // ── Revenue ──
  const quoteRes = await db.prepare(`
    SELECT id, quote_number, total FROM quotes WHERE calendar_event_id = ?
    ORDER BY created_at DESC LIMIT 1
  `).bind(eventId).first<{ id: number; quote_number: string; total: number }>().catch(() => null)

  let revenue = 0
  let revenueSource: 'quote' | 'override' | 'none' = 'none'
  let quoteId: number | null = null
  let quoteNumber: string | null = null
  if (quoteRes) {
    revenue = Number(quoteRes.total) || 0
    revenueSource = 'quote'
    quoteId = quoteRes.id
    quoteNumber = quoteRes.quote_number
  } else if (override?.revenue_override !== null && override?.revenue_override !== undefined) {
    revenue = Number(override.revenue_override)
    revenueSource = 'override'
  }

  const margin = revenue - totalCost
  const marginPct = revenue > 0 ? (margin / revenue) * 100 : 0

  return {
    event_id: ev.id,
    event_date: ev.event_date,
    event_name: ev.event_name,
    status: ev.status,
    stock_lines:  stockRes?.lines || 0,
    stock_units:  stockRes?.units || 0,
    stock_cost:   stockCost,
    stock_auto:   stockAuto,
    crew_count:   crewCount,
    crew_hours:   crewHours,
    crew_cost:    crewCost,
    crew_auto:    crewAuto,
    vehicle_count: vehCount,
    vehicle_cost: vehicleCost,
    vehicle_auto: vehicleAuto,
    damages_count: dmgRes?.n || 0,
    damages_cost:  dmgRes?.v || 0,
    other_cost:   otherCost,
    cost_total:   totalCost,
    revenue,
    revenue_source: revenueSource,
    quote_id: quoteId,
    quote_number: quoteNumber,
    margin,
    margin_pct: marginPct,
    notes: override?.notes || null,
    overrides_present: !!override,
  }
}

// ─── Save / clear overrides ───────────────────────────────────────────────

export async function saveEventOverrides(
  db: D1Database,
  eventId: number,
  input: {
    cost_stock?: number | null
    cost_fleet?: number | null
    cost_crew?: number | null
    cost_other?: number | null
    revenue_override?: number | null
    notes?: string | null
  },
  user: { id?: number; name?: string }
): Promise<void> {
  await db.prepare(`
    INSERT INTO event_cost_overrides
      (event_id, cost_stock, cost_fleet, cost_crew, cost_other, revenue_override, notes, updated_by, updated_by_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(event_id) DO UPDATE SET
      cost_stock = excluded.cost_stock,
      cost_fleet = excluded.cost_fleet,
      cost_crew  = excluded.cost_crew,
      cost_other = excluded.cost_other,
      revenue_override = excluded.revenue_override,
      notes = excluded.notes,
      updated_by = excluded.updated_by,
      updated_by_name = excluded.updated_by_name,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    eventId,
    input.cost_stock ?? null,
    input.cost_fleet ?? null,
    input.cost_crew  ?? null,
    input.cost_other ?? 0,
    input.revenue_override ?? null,
    input.notes ?? null,
    user.id ?? null,
    user.name ?? null
  ).run()
}

export async function clearEventOverrides(db: D1Database, eventId: number): Promise<void> {
  await db.prepare(`DELETE FROM event_cost_overrides WHERE event_id = ?`).bind(eventId).run()
}

// ─── Monthly P&L report ───────────────────────────────────────────────────

export type MonthlyPL = {
  month: string                 // YYYY-MM
  event_count: number
  revenue_total: number
  cost_total:    number
  margin_total:  number
  margin_pct:    number
  events: Array<{
    event_id: number
    event_date: string
    event_name: string
    revenue: number
    cost: number
    margin: number
  }>
}

export async function getMonthlyPL(db: D1Database, monthYYYYMM: string): Promise<MonthlyPL> {
  const start = `${monthYYYYMM}-01`
  // Compute the first day of next month
  const [yStr, mStr] = monthYYYYMM.split('-')
  const y = Number(yStr); const m = Number(mStr)
  const nm = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`

  const eventsRes = await db.prepare(`
    SELECT id, event_date, event_name FROM calendar_events
    WHERE event_date >= ? AND event_date < ? AND status != 'cancelled'
    ORDER BY event_date ASC
  `).bind(start, nm).all<{ id: number; event_date: string; event_name: string }>()

  const events: MonthlyPL['events'] = []
  let totalRev = 0
  let totalCost = 0

  for (const e of (eventsRes.results || [])) {
    const c = await calcEventCosts(db, e.id)
    if (!c) continue
    events.push({
      event_id: e.id,
      event_date: e.event_date,
      event_name: e.event_name,
      revenue: c.revenue,
      cost: c.cost_total,
      margin: c.margin,
    })
    totalRev += c.revenue
    totalCost += c.cost_total
  }

  return {
    month: monthYYYYMM,
    event_count: events.length,
    revenue_total: totalRev,
    cost_total: totalCost,
    margin_total: totalRev - totalCost,
    margin_pct: totalRev > 0 ? ((totalRev - totalCost) / totalRev) * 100 : 0,
    events,
  }
}
