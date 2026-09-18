// ---------------------------------------------------------------------------
// Duplicate catcher (owner 2026-09-16).
//
// Staff forget they have already final-submitted a shift and submit it again, or
// re-claim last week's PAID shift as a "missed" shift. This check looks ONLY at
// PAID rows (wage_shifts): same worker, same real date, overlapping times. For
// every later duplicate it opens a RED review, recommends 0 h for the overlapping
// part, and waits for Bernie. The earlier paid row is the one kept.
//
// It never changes hours or pay. It only writes review rows (same table, same
// decision form). Runs when the office dashboard / payroll Excel loads — the
// staff app is never involved. Reviews that no longer apply (row deleted or
// corrected) are auto-voided so they do not linger.
// ---------------------------------------------------------------------------

export const DUP_KEY_PREFIX = 'dup_paid|shift:'
type Db = { prepare: (sql: string) => any }

type Row = { id: number; staff_id: number; display_name: string; work_date: string; start_time: string; end_time: string; hours_worked: number; amount: number; outlet_venue: string; area: string; work_description: string; payroll_week_start: string | null; created_at: string | null; source_draft_id?: number | null }

const toMin = (t: string) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null }
const hm = (t: string) => (t || '').slice(0, 5)
const fmtR = (n: number) => 'R' + Number(n || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
const longDate = (iso: string) => { const d = new Date(iso + 'T00:00:00Z'); return isNaN(d.getTime()) ? iso : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()] + ' ' + d.getUTCFullYear() }
const q = (n: number) => Math.round(n * 4) / 4
const fnv = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return h.toString(16).padStart(8, '0') }

function span(r: Row): [number, number] | null { const a = toMin(r.start_time), b0 = toMin(r.end_time); if (a === null || b0 === null) return null; return [a, b0 <= a ? b0 + 1440 : b0] }
function rowText(r: Row): string { return `${hm(r.start_time)}–${hm(r.end_time)} · ${r.outlet_venue || '(no venue)'}${r.area ? ' (' + r.area + ')' : ''}${r.work_description ? ' · "' + r.work_description + '"' : ''} · ${Number(r.hours_worked).toFixed(2)} h · ${fmtR(r.amount)} · payroll ${r.payroll_week_start || 'not set'} · shift #${r.id}` }

export type DupFlag = { subject: Row; earlier: Row; overlapH: number; recommended: number; full: boolean; reason: string; summary: string; factsHash: string }

// Which row is the "earlier / kept" one: the one paid in the earlier payroll, else the
// one created first (lower id). The later one is the duplicate.
function order(a: Row, b: Row): [Row, Row] {
  const pa = a.payroll_week_start || '9999', pb = b.payroll_week_start || '9999'
  if (pa !== pb) return pa < pb ? [a, b] : [b, a]
  return a.id < b.id ? [a, b] : [b, a]
}

export function computeDupFlags(rows: Row[], inScope: Set<number>): DupFlag[] {
  const byKey: Record<string, Row[]> = {}
  for (const r of rows) (byKey[r.staff_id + '|' + r.work_date] ||= []).push(r)
  const flags: DupFlag[] = []
  for (const list of Object.values(byKey)) {
    if (list.length < 2) continue
    list.sort((a, b) => (a.payroll_week_start || '9999').localeCompare(b.payroll_week_start || '9999') || a.id - b.id)
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const [keep, dup] = order(list[i], list[j])
      const sk = span(keep), sd = span(dup)
      if (!sk || !sd) continue
      const ov = Math.max(0, Math.min(sk[1], sd[1]) - Math.max(sk[0], sd[0]))
      if (ov < 15) continue // under 15 minutes: not a duplicate (back-to-back shifts)
      if (!inScope.has(dup.id)) continue // only flag duplicates that belong to THIS payroll
      const dupLen = sd[1] - sd[0]
      const full = ov >= dupLen - 1
      const outsideH = q((dupLen - ov) / 60)
      const overlapH = q(ov / 60)
      const sameWeek = (keep.payroll_week_start || '') === (dup.payroll_week_start || '')
      const where = sameWeek ? 'submitted twice in this payroll' : `already paid in payroll ${keep.payroll_week_start || '(earlier)'} and claimed again in payroll ${dup.payroll_week_start || '(this one)'}`
      const reason = `DUPLICATE – ${longDate(dup.work_date)} – ${dup.display_name}: the same shift was ${where}. ` +
        `KEPT (paid first): ${rowText(keep)}. DUPLICATE (this entry): ${rowText(dup)}. ` +
        `Overlap ${overlapH.toFixed(2)} h (${full ? 'the whole of this entry is already covered by the paid one' : outsideH.toFixed(2) + ' h of this entry falls outside the paid one'}). ` +
        `System recommended ${outsideH.toFixed(2)} h for this entry (0 h if it is a straight duplicate). Bernie to decide — nothing has been changed.`
      flags.push({ subject: dup, earlier: keep, overlapH, recommended: outsideH, full, reason, summary: `DUPLICATE — ${dup.display_name} — ${dup.work_date} — ${hm(dup.start_time)}–${hm(dup.end_time)} ${dup.outlet_venue} — already paid as #${keep.id} (${where})`, factsHash: fnv(JSON.stringify([dup.id, keep.id, dup.start_time, dup.end_time, keep.start_time, keep.end_time, dup.hours_worked, keep.hours_worked, outsideH])) })
    }
  }
  // One flag per duplicate row (the earliest kept row wins).
  const seen = new Set<number>()
  return flags.filter((f) => { if (seen.has(f.subject.id)) return false; seen.add(f.subject.id); return true })
}

export async function runDuplicateCheck(db: Db, weekStart: string, weekEnd: string, opts: { dryRun?: boolean } = {}): Promise<{ flags: DupFlag[]; inserted: number; updated: number; voided: number }> {
  const scopeRes = await db.prepare(`SELECT id, staff_id, work_date FROM wage_shifts
      WHERE (work_date BETWEEN ? AND ? AND (payroll_week_start IS NULL OR payroll_week_start = ?)) OR (payroll_week_start = ? AND work_date < ?)`).bind(weekStart, weekEnd, weekStart, weekStart, weekStart).all()
  const scope = (scopeRes.results || []) as Array<{ id: number; staff_id: number; work_date: string }>
  if (!scope.length) return { flags: [], inserted: 0, updated: 0, voided: 0 }
  const inScope = new Set(scope.map((r) => Number(r.id)))
  const dates = Array.from(new Set(scope.map((r) => r.work_date)))
  const staff = Array.from(new Set(scope.map((r) => r.staff_id)))
  const res = await db.prepare(`SELECT w.id, w.staff_id, s.display_name, w.work_date, w.start_time, w.end_time, w.hours_worked, COALESCE(w.gross_wage, w.total_amount, 0) amount,
        COALESCE(w.outlet_venue,'') outlet_venue, COALESCE(w.area,'') area, COALESCE(w.work_description,'') work_description, w.payroll_week_start, w.created_at, w.source_draft_id
      FROM wage_shifts w JOIN wage_staff s ON s.id = w.staff_id
      WHERE w.work_date IN (${dates.map(() => '?').join(',')}) AND w.staff_id IN (${staff.map(() => '?').join(',')})`).bind(...dates, ...staff).all()
  const rows = ((res.results || []) as any[]).map((r) => ({ ...r, id: Number(r.id), staff_id: Number(r.staff_id), hours_worked: Number(r.hours_worked || 0), amount: Number(r.amount || 0) })) as Row[]
  let flags = computeDupFlags(rows, inScope)
  let inserted = 0, updated = 0, voided = 0
  // Already decided by Bernie (any RESOLVED review with approved hours on the duplicate row
  // or its draft, other than crew/rate-choice)? Then do not ask again.
  if (flags.length) {
    const subjIds = flags.map((f) => f.subject.id), draftIds = flags.map((f) => Number(f.subject.source_draft_id || 0)).filter(Boolean)
    const decided = new Set<number>()
    const rv = await db.prepare(`SELECT subject_source, subject_shift_id FROM wage_payroll_reviews WHERE status = 'RESOLVED' AND approved_payable_hours IS NOT NULL AND issue_key NOT LIKE 'crew_hours%' AND issue_key NOT LIKE 'rate_choice%' AND issue_key NOT LIKE '${DUP_KEY_PREFIX}%'
        AND ((subject_source = 'shift' AND subject_shift_id IN (${subjIds.map(() => '?').join(',')}))${draftIds.length ? ` OR (subject_source = 'draft' AND subject_shift_id IN (${draftIds.map(() => '?').join(',')}))` : ''})`).bind(...subjIds, ...draftIds).all()
    for (const v of (rv.results || []) as any[]) {
      if (v.subject_source === 'shift') decided.add(Number(v.subject_shift_id))
      else for (const f of flags) if (Number(f.subject.source_draft_id || 0) === Number(v.subject_shift_id)) decided.add(f.subject.id)
    }
    flags = flags.filter((f) => !decided.has(f.subject.id))
  }
  if (opts.dryRun) return { flags, inserted, updated, voided }

  const existing: Record<string, { id: number; status: string; facts_hash: string }> = {}
  const ids = Array.from(inScope)
  for (let i = 0; i < ids.length; i += 90) {
    const ch = ids.slice(i, i + 90)
    const ex = await db.prepare(`SELECT id, issue_key, status, facts_hash FROM wage_payroll_reviews WHERE issue_key LIKE '${DUP_KEY_PREFIX}%' AND subject_shift_id IN (${ch.map(() => '?').join(',')})`).bind(...ch).all()
    for (const e of (ex.results || []) as any[]) existing[String(e.issue_key)] = { id: Number(e.id), status: String(e.status), facts_hash: String(e.facts_hash || '') }
  }
  const live = new Set<string>()
  for (const f of flags) {
    const key = DUP_KEY_PREFIX + f.subject.id
    live.add(key)
    const system = JSON.stringify({ comparisonLabel: 'duplicate check', warningTitle: f.full ? 'DUPLICATE – already paid' : 'DUPLICATE – partly already paid', humanReason: f.reason, recommendedReason: f.full ? `Duplicate — same shift already paid as #${f.earlier.id} (${hm(f.earlier.start_time)}–${hm(f.earlier.end_time)} ${f.earlier.outlet_venue}, ${f.earlier.payroll_week_start && f.earlier.payroll_week_start !== f.subject.payroll_week_start ? 'payroll ' + f.earlier.payroll_week_start : 'this payroll'})` : `Partly duplicate — ${f.overlapH.toFixed(2)} h already paid as #${f.earlier.id}; only the ${f.recommended.toFixed(2)} h outside it is new`, dupCheck: 1, keptShiftId: f.earlier.id, overlapHours: f.overlapH, staffBlocking: 0, autoDuplicate: 0, conflictDetected: 1 })
    const subjSnap = JSON.stringify({ shiftId: f.subject.id, source: 'shift', staffId: f.subject.staff_id, employee: f.subject.display_name, workDate: f.subject.work_date, venue: f.subject.outlet_venue, area: f.subject.area, workDescription: f.subject.work_description, startTime: f.subject.start_time, endTime: f.subject.end_time, hours: f.subject.hours_worked, amount: f.subject.amount, payrollWeekStart: f.subject.payroll_week_start })
    const cmpSnap = JSON.stringify({ shiftId: f.earlier.id, source: 'shift', staffId: f.earlier.staff_id, employee: f.earlier.display_name, workDate: f.earlier.work_date, venue: f.earlier.outlet_venue, area: f.earlier.area, workDescription: f.earlier.work_description, startTime: f.earlier.start_time, endTime: f.earlier.end_time, hours: f.earlier.hours_worked, amount: f.earlier.amount, payrollWeekStart: f.earlier.payroll_week_start })
    const ex = existing[key]
    const sameWeek = (f.earlier.payroll_week_start || '') === (f.subject.payroll_week_start || '')
    if (!ex) {
      await db.prepare(`INSERT INTO wage_payroll_reviews (issue_key, status, warning_kind, severity, staff_id, staff_name, work_date, payroll_week_start, subject_source, subject_shift_id, compared_source, compared_shift_id, compared_payroll_week_start, warning_reason, issue_summary, original_hours, compared_hours, previously_paid_hours, system_proposed_payable_hours, facts_hash, subject_snapshot_json, compared_snapshot_json, system_snapshot_json)
          SELECT ?, 'OPEN', ?, 'red', ?, ?, ?, ?, 'shift', ?, 'shift', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE NOT EXISTS (SELECT 1 FROM wage_payroll_reviews WHERE issue_key = ?)`)
        .bind(key, sameWeek ? 'current_payroll_duplicate' : 'previous_payroll_duplicate', f.subject.staff_id, f.subject.display_name, f.subject.work_date, f.subject.payroll_week_start, f.subject.id, f.earlier.id, f.earlier.payroll_week_start, f.reason, f.summary, f.subject.hours_worked, f.earlier.hours_worked, f.overlapH, f.recommended, f.factsHash, subjSnap, cmpSnap, system, key).run()
      inserted++
    } else if (ex.status === 'OPEN' && ex.facts_hash !== f.factsHash) {
      await db.prepare(`UPDATE wage_payroll_reviews SET warning_reason = ?, issue_summary = ?, system_proposed_payable_hours = ?, previously_paid_hours = ?, compared_shift_id = ?, compared_payroll_week_start = ?, facts_hash = ?, compared_snapshot_json = ?, system_snapshot_json = ?, last_detected_at = CURRENT_TIMESTAMP, detected_count = detected_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'OPEN'`)
        .bind(f.reason, f.summary, f.recommended, f.overlapH, f.earlier.id, f.earlier.payroll_week_start, f.factsHash, cmpSnap, system, ex.id).run()
      updated++
    }
  }
  for (const [key, ex] of Object.entries(existing)) {
    if (ex.status !== 'OPEN' || live.has(key)) continue
    await db.prepare(`UPDATE wage_payroll_reviews SET status = 'VOID', void_reason = 'Auto: duplicate check re-run — the paid entries no longer overlap (one was corrected or removed)', voided_by_name = 'system duplicate check', voided_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'OPEN'`).bind(ex.id).run()
    voided++
  }
  return { flags, inserted, updated, voided }
}
