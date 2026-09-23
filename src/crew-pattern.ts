// ---------------------------------------------------------------------------
// Crew pattern / venue-name check — owner rule 2026-09-22.
//
// Under rate rules v9 the PLACE decides the pay (Warehouse R81,25/h · Venue R95/h),
// so the office must be told when an entry does not fit the day's pattern:
//
//   1. CREW PATTERN — on a given day, if most of the crew say one place and a few say
//      the other (minority ≤ 25 % with at least 4 workers that day), the minority
//      entries are flagged: "7 of 8 workers say Warehouse on Mon 21 Sep — you say
//      venue 'FNB Stadium'. Confirm the venue or re-price as Warehouse."
//   2. VENUE MUST BE NAMED — any entry priced at the venue rate whose venue field is
//      blank or generic ("venue", "event", "site", "outside", "n/a" …) is a RED flag
//      on its own: it claims R95/h with no venue to check against.
//
// Guard rails: current (unpaid) payroll week only · office dashboard / Excel only ·
// never the staff app · nothing is re-priced automatically — the office clicks
// Warehouse or Venue on a paid row (re-prices) or records a decision on a draft ·
// flags void themselves when the entry is corrected or deleted.
// ---------------------------------------------------------------------------

export const CREW_PATTERN_PREFIX = 'crew_pattern|'
type Db = { prepare: (sql: string) => any }
export type PayKind = 'event' | 'warehouse' | 'warehouse_or_event' | 'musicbus' | 'petrus' | 'gardener' | 'fixed_weekly'
export type Deps = {
  db: Db
  weekStart: string; weekEnd: string
  ownerPayKind: (staffId: number, workType: string, wording: string, payrollRule: string) => PayKind
}

type Entry = { source: 'draft' | 'shift'; id: number; draftId: number | null; staff_id: number; name: string; payroll_rule: string; work_date: string; start: string; end: string; work_type: string; venue: string; area: string; descr: string; hours: number; amount: number; payroll_week_start: string | null }
type Place = 'warehouse' | 'venue' | 'venue_unnamed' | 'ambiguous' | 'ambiguous_area' | 'other'

const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
const longDate = (iso: string) => { const d = new Date(iso + 'T00:00:00Z'); return isNaN(d.getTime()) ? iso : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()] + ' ' + d.getUTCFullYear() }
const fnv = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return h.toString(16).padStart(8, '0') }

// The venue field says "the warehouse" in one of its spellings (or the office/yard) and nothing else.
export const WAREHOUSE_WORDS = /^(w[ae]a?re?house|wharehouse|warhouse|warehouseoffice|bwwarehouse|bwoffice|office|theoffice|yard|store|storeroom|stores|workshop)$/
// Generic words that are not a venue name.
const GENERIC = new Set(['', 'venue', 'venues', 'event', 'events', 'site', 'onsite', 'outside', 'out', 'na', 'none', 'nil', 'tbc', 'tba', 'unknown', 'work', 'job', 'function', 'client', 'various', 'other', 'setup', 'breakdown', 'strike', 'event venue', 'eventvenue', 'x', 'xx', 'test'])
export function venueIsWarehouse(venue: string) { return WAREHOUSE_WORDS.test(norm(venue)) }
export function venueIsUnnamed(venue: string) { const n = norm(venue); return n.length < 3 || GENERIC.has(n) || /^\d+$/.test(n) }

// The AREA field names a real place (not the warehouse's own area) — venue evidence even if the venue box says "Warehouse".
const WAREHOUSE_AREAS = /^(meyerton|henleyonklip|henley|warehouse|w[ae]a?rehouse|office|yard|na|none|)$/
export function areaNamesAPlace(area: string) { const n = norm(area); return n.length >= 3 && !WAREHOUSE_AREAS.test(n) && !GENERIC.has(n) }
// Owner 2026-09-23 (Givemore): "he'll write warehouse and then put a venue name. Always cross-check that and ask me."
// A Warehouse Team entry is ONLY trusted as warehouse when the venue box says the warehouse (or is blank) AND the area
// box does not name a real place. A venue-like name in the venue box, a real place in the area box, or venue words in the
// description ("strike", "set up at …", "stadium", "golf", "estate", "hall", "school", "church", "hotel", "lodge", "garden") → flag.
const VENUE_WORDS = /(stadium|arena|golf|estate|country\s*club|club|hall|school|church|hotel|lodge|resort|farm|park|gardens?|centre|center|mall|expo|convention|theatre|theater|university|college|casino|wedding|festival|showground|racecourse|conference|pretoria|johannesburg|jhb|sandton|midrand|soweto|tembisa|thembisa|parys|vaal|vereeniging|durban|cape\s*town|bloem|polokwane|nelspruit|rustenburg|potch)/i
export function wordingNamesAVenue(venue: string, area: string, descr: string) {
  if (areaNamesAPlace(area)) return true
  if (venue && !venueIsWarehouse(venue) && !venueIsUnnamed(venue)) return true
  return VENUE_WORDS.test(descr || '')
}
export function venueEvidence(venue: string, area: string, descr: string): string {
  if (areaNamesAPlace(area)) return area
  if (venue && !venueIsWarehouse(venue) && !venueIsUnnamed(venue)) return venue
  const m = VENUE_WORDS.exec(descr || ''); return m ? m[0] : ''
}
function placeOf(d: Deps, e: Entry): Place {
  const kind = d.ownerPayKind(e.staff_id, e.work_type, [e.venue, e.descr].join(' '), e.payroll_rule)
  if (kind === 'warehouse' && wordingNamesAVenue(e.venue, e.area, e.descr)) return 'ambiguous_area'
  if (kind === 'warehouse') return 'warehouse'
  if (kind === 'warehouse_or_event') return venueIsWarehouse(e.venue) ? 'ambiguous' : 'ambiguous'
  if (kind !== 'event') return 'other' // Petrus, gardener block, Music Bus, fixed weekly — own rules
  return venueIsUnnamed(e.venue) ? 'venue_unnamed' : 'venue'
}

export type CrewFlag = {
  subject: Entry; place: Place; severity: 'red' | 'orange'; kind: 'unnamed_venue' | 'minority_venue' | 'minority_warehouse' | 'warehouse_with_area'
  title: string; reason: string; dayWarehouse: number; dayVenue: number; dayWorkers: number; majorityPlace: 'warehouse' | 'venue'; others: string[]; factsHash: string
}

export function computeFlags(d: Deps, entries: Entry[]): CrewFlag[] {
  const flags: CrewFlag[] = []
  const byDate: Record<string, Entry[]> = {}
  for (const e of entries) (byDate[e.work_date] ||= []).push(e)
  for (const date of Object.keys(byDate).sort()) {
    const day = byDate[date]
    const placed = day.map((e) => ({ e, p: placeOf(d, e) })).filter((x) => x.p !== 'other')
    // Distinct workers per place (a worker with two warehouse entries counts once).
    const wh = new Set<number>(), ve = new Set<number>()
    for (const { e, p } of placed) { if (p === 'warehouse' || p === 'ambiguous_area') wh.add(e.staff_id); else if (p === 'venue' || p === 'venue_unnamed') ve.add(e.staff_id) }
    const workers = new Set<number>([...wh, ...ve]).size
    const majority: 'warehouse' | 'venue' = wh.size >= ve.size ? 'warehouse' : 'venue'
    const minorityCount = majority === 'warehouse' ? ve.size : wh.size
    const patternApplies = workers >= 4 && minorityCount > 0 && minorityCount / workers <= 0.25
    const nameOf = (id: number) => day.find((e) => e.staff_id === id)?.name || ('staff ' + id)
    for (const { e, p } of placed) {
      if (p === 'ambiguous') continue // already covered by the Rate-choice review
      const hrs = e.hours ? e.hours.toFixed(2) + ' h' : (e.start + '–' + e.end)
      if (p === 'ambiguous_area') {
        const evid = venueEvidence(e.venue, e.area, e.descr) || e.area
        const venuesThatDay = Array.from(new Set(day.filter((x) => ve.has(x.staff_id)).map((x) => x.venue).filter(Boolean)))
        const areaHit = venuesThatDay.filter((vn) => norm(vn).includes(norm(evid).slice(0, 5)) || norm(evid).includes(norm(vn).slice(0, 5)))
        const reason = `WAREHOUSE CLAIMED BUT THE ENTRY NAMES “${evid}”: ${e.name} selected Warehouse Team at “${e.venue}” for ${hrs} on ${longDate(date)}, but wrote “${evid}” — that is a venue, not the warehouse.${areaHit.length ? ` Other workers were at ${areaHit.join(', ')} that day.` : ve.size ? ` ${ve.size} worker${ve.size === 1 ? '' : 's'} were at a venue that day (${venuesThatDay.join(', ')}).` : ''} If he was at “${evid}”, he is due the venue rate (R95/h); if he was really in the warehouse, R81,25/h. Choose below.`
        flags.push({ subject: e, place: p, severity: 'red', kind: 'warehouse_with_area', title: `Warehouse claimed — but the entry names “${evid}”`, reason, dayWarehouse: wh.size, dayVenue: ve.size, dayWorkers: workers, majorityPlace: majority, others: [...ve].map(nameOf), factsHash: fnv([e.source, e.id, e.work_date, e.start, e.end, e.venue, e.area, e.work_type, wh.size, ve.size].join('|')) })
        continue
      }
      const others = [...(p === 'warehouse' ? ve : wh)].filter((id) => id !== e.staff_id).map(nameOf)
      const venueTxt = e.venue ? `“${e.venue}”` : '(blank)'
      if (p === 'venue_unnamed') {
        const reason = `VENUE NOT NAMED: ${e.name} claims the venue rate (R95/h) for ${hrs} on ${longDate(date)} but the venue field is ${venueTxt}. Every venue entry needs a specific venue name, otherwise there is nothing to check it against.${wh.size ? ` ${wh.size} worker${wh.size === 1 ? '' : 's'} say Warehouse that day (${[...wh].map(nameOf).join(', ')}).` : ''} Ask the worker where he was; if it was the warehouse, re-price at R81,25/h.`
        flags.push({ subject: e, place: p, severity: 'red', kind: 'unnamed_venue', title: 'Venue rate claimed — no venue named', reason, dayWarehouse: wh.size, dayVenue: ve.size, dayWorkers: workers, majorityPlace: majority, others, factsHash: fnv([e.source, e.id, e.work_date, e.start, e.end, e.venue, e.work_type, wh.size, ve.size].join('|')) })
        continue
      }
      if (!patternApplies) continue
      if (p === 'venue' && majority === 'warehouse') {
        const reason = `CREW PATTERN: ${wh.size} of ${workers} workers say Warehouse on ${longDate(date)} (${[...wh].map(nameOf).join(', ')}) — ${e.name} says venue ${venueTxt} for ${hrs} at R95/h. Was he really at ${venueTxt}? Confirm the venue, or re-price as Warehouse (R81,25/h, staff meeting unpaid).`
        flags.push({ subject: e, place: p, severity: 'orange', kind: 'minority_venue', title: `Crew pattern — ${wh.size} of ${workers} say Warehouse, this one says venue`, reason, dayWarehouse: wh.size, dayVenue: ve.size, dayWorkers: workers, majorityPlace: majority, others, factsHash: fnv([e.source, e.id, e.work_date, e.start, e.end, e.venue, e.work_type, wh.size, ve.size].join('|')) })
      } else if (p === 'warehouse' && majority === 'venue') {
        const venues = Array.from(new Set(day.filter((x) => ve.has(x.staff_id)).map((x) => x.venue).filter(Boolean))).join(', ')
        const reason = `CREW PATTERN: ${ve.size} of ${workers} workers were at a venue on ${longDate(date)} (${venues || 'venue'}) — ${e.name} says Warehouse for ${hrs}. Check he was not at the venue (R95/h would be due).`
        flags.push({ subject: e, place: p, severity: 'orange', kind: 'minority_warehouse', title: `Crew pattern — ${ve.size} of ${workers} at a venue, this one says Warehouse`, reason, dayWarehouse: wh.size, dayVenue: ve.size, dayWorkers: workers, majorityPlace: majority, others, factsHash: fnv([e.source, e.id, e.work_date, e.start, e.end, e.venue, e.work_type, wh.size, ve.size].join('|')) })
      }
    }
  }
  return flags
}

export async function loadCurrentWeek(d: Deps): Promise<Entry[]> {
  const { db, weekStart, weekEnd } = d
  const staffRes = await db.prepare(`SELECT id, display_name, payroll_rule FROM wage_staff`).all()
  const staff: Record<number, { name: string; rule: string }> = {}
  for (const s of (staffRes.results || []) as any[]) staff[Number(s.id)] = { name: String(s.display_name), rule: String(s.payroll_rule || '') }
  const mk = (r: any, source: 'draft' | 'shift'): Entry => {
    const a = /^(\d{1,2}):(\d{2})/.exec(r.start_time || ''), b = /^(\d{1,2}):(\d{2})/.exec(r.end_time || '')
    let h = r.hours_worked != null ? Number(r.hours_worked) : 0
    if (!h && a && b) { const s = Number(a[1]) * 60 + Number(a[2]); let e = Number(b[1]) * 60 + Number(b[2]); if (e <= s) e += 1440; h = (e - s) / 60 }
    return { source, id: Number(r.id), draftId: source === 'draft' ? Number(r.id) : (r.source_draft_id ? Number(r.source_draft_id) : null), staff_id: Number(r.staff_id), name: staff[Number(r.staff_id)]?.name || '', payroll_rule: staff[Number(r.staff_id)]?.rule || '', work_date: String(r.work_date), start: String(r.start_time || ''), end: String(r.end_time || ''), work_type: String(r.work_type || ''), venue: String(r.outlet_venue || ''), area: String(r.area || ''), descr: String(r.work_description || ''), hours: h, amount: Number(r.amount || 0), payroll_week_start: r.payroll_week_start ? String(r.payroll_week_start) : null }
  }
  const paidCur = await db.prepare(`SELECT id, staff_id, work_date, start_time, end_time, hours_worked, COALESCE(gross_wage,total_amount,0) amount, work_type, outlet_venue, area, work_description, payroll_week_start, source_draft_id FROM wage_shifts
      WHERE (work_date BETWEEN ? AND ? AND (payroll_week_start IS NULL OR payroll_week_start = ?)) OR (payroll_week_start = ? AND work_date < ?)`).bind(weekStart, weekEnd, weekStart, weekStart, weekStart).all()
  const draftCur = await db.prepare(`SELECT id, staff_id, work_date, start_time, end_time, NULL hours_worked, 0 amount, work_type, outlet_venue, area, work_description, payroll_week_start FROM wage_shift_drafts
      WHERE status = 'draft' AND final_shift_id IS NULL AND work_date >= date(?, '-7 days') AND work_date <= ? AND ((work_date BETWEEN ? AND ?) OR payroll_week_start = ? OR missed_previous_week = 1)`).bind(weekStart, weekEnd, weekStart, weekEnd, weekStart).all()
  return [...((paidCur.results || []) as any[]).map((r) => mk(r, 'shift')), ...((draftCur.results || []) as any[]).map((r) => mk(r, 'draft'))]
}

const keyOf = (f: CrewFlag) => CREW_PATTERN_PREFIX + (f.subject.draftId ? 'draft:' + f.subject.draftId : 'shift:' + f.subject.id)

export async function runCrewPatternCheck(d: Deps, opts: { dryRun?: boolean } = {}): Promise<{ flags: CrewFlag[]; inserted: number; updated: number; voided: number }> {
  const { db } = d
  const entries = await loadCurrentWeek(d)
  let flags = computeFlags(d, entries)
  let inserted = 0, updated = 0, voided = 0
  // A decided flag (draft or paid row from that draft) is never re-opened.
  const decided = new Set<string>()
  {
    const dk = await db.prepare(`SELECT issue_key FROM wage_payroll_reviews WHERE issue_key LIKE '${CREW_PATTERN_PREFIX}%' AND status IN ('RESOLVED','VOID')`).all()
    for (const r of (dk.results || []) as any[]) decided.add(String(r.issue_key))
  }
  // A paid row that already has a Rate-choice review is covered there.
  const rateChoiceShifts = new Set<number>()
  {
    const rc = await db.prepare(`SELECT subject_shift_id FROM wage_payroll_reviews WHERE issue_key LIKE 'rate_choice_%' AND subject_source = 'shift'`).all()
    for (const r of (rc.results || []) as any[]) rateChoiceShifts.add(Number(r.subject_shift_id))
  }
  flags = flags.filter((f) => !decided.has(keyOf(f)) && !(f.subject.source === 'shift' && rateChoiceShifts.has(f.subject.id)))
  if (opts.dryRun) return { flags, inserted, updated, voided }
  const openRes = await db.prepare(`SELECT id, issue_key, facts_hash FROM wage_payroll_reviews WHERE issue_key LIKE '${CREW_PATTERN_PREFIX}%' AND status = 'OPEN'`).all()
  const open: Record<string, { id: number; facts_hash: string }> = {}
  for (const r of (openRes.results || []) as any[]) open[String(r.issue_key)] = { id: Number(r.id), facts_hash: String(r.facts_hash || '') }
  const seen = new Set<string>()
  for (const f of flags) {
    const key = keyOf(f); seen.add(key)
    const e = f.subject
    const summary = `${f.title} — ${e.name} — ${e.work_date}`
    const subjectSnap = JSON.stringify({ source: e.source, id: e.id, draftId: e.draftId, staffId: e.staff_id, employee: e.name, workDate: e.work_date, startTime: e.start, endTime: e.end, hours: e.hours, workType: e.work_type, venue: e.venue, area: e.area, workDescription: e.descr, amountNow: e.amount })
    // Paid rows: reuse the Rate-choice buttons (Warehouse / Venue re-prices the row). Drafts: record a decision; the worker corrects the entry.
    const systemSnap = JSON.stringify({ comparisonLabel: 'crew pattern', warningTitle: f.title, humanReason: f.reason, crewPattern: 1, crewKind: f.kind, place: f.place, dayWarehouse: f.dayWarehouse, dayVenue: f.dayVenue, dayWorkers: f.dayWorkers, majorityPlace: f.majorityPlace, others: f.others, rateChoice: 1, staffBlocking: 0, autoDuplicate: 0, conflictDetected: 0 })
    const ex = open[key]
    if (!ex) {
      await db.prepare(`INSERT INTO wage_payroll_reviews (issue_key, status, warning_kind, severity, staff_id, staff_name, work_date, payroll_week_start, subject_source, subject_shift_id, compared_source, compared_shift_id, warning_reason, issue_summary, original_hours, facts_hash, subject_snapshot_json, system_snapshot_json)
          VALUES (?, 'OPEN', 'time_location_conflict', ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`)
        .bind(key, f.severity, e.staff_id, e.name, e.work_date, e.payroll_week_start || d.weekStart, e.source, e.id, e.source, f.reason, summary, e.hours, f.factsHash, subjectSnap, systemSnap).run()
      inserted++
    } else if (ex.facts_hash !== f.factsHash) {
      await db.prepare(`UPDATE wage_payroll_reviews SET severity = ?, warning_reason = ?, issue_summary = ?, original_hours = ?, facts_hash = ?, subject_snapshot_json = ?, system_snapshot_json = ?, last_detected_at = CURRENT_TIMESTAMP, detected_count = detected_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'OPEN'`)
        .bind(f.severity, f.reason, summary, e.hours, f.factsHash, subjectSnap, systemSnap, ex.id).run()
      updated++
    }
  }
  for (const key of Object.keys(open)) {
    if (seen.has(key)) continue
    await db.prepare(`UPDATE wage_payroll_reviews SET status = 'VOID', void_reason = 'Auto: crew-pattern check re-run — the entry now fits the day''s pattern or has a venue name (corrected or deleted)', voided_by_name = 'system crew-pattern check', voided_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'OPEN'`).bind(open[key].id).run()
    voided++
  }
  return { flags, inserted, updated, voided }
}
