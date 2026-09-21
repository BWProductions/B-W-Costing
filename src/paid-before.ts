// ---------------------------------------------------------------------------
// "Already paid" check — owner rule 2026-09-21.
//
// Auditors run wages on WEDNESDAY, so staff enter Wed–Sun as a guess ("a normal
// day"). The next week the worker enters what really happened. For every entry in
// the CURRENT payroll (draft or paid) that overlaps a day ALREADY PAID in an
// earlier payroll, the system works out — in rand — what is still owed:
//
//   • rate correction on the hours already paid (e.g. Garden R62,50 → Team R81,25)
//   • extra hours outside the paid window
//   • still due = full day at the correct rate − what was already paid
//
// and opens ONE red review with the full story and a single button:
// "Approve as recommended — R475,00". Nothing is paid automatically.
//
// Guard rails: runs ONLY for the current (unpaid) payroll week; never touches a
// closed payroll; only compares against PAID rows (proof); runs from the office
// dashboard / Excel only; never in the staff app.
// ---------------------------------------------------------------------------

export const PAID_BEFORE_PREFIX = 'paid_before|'
type Db = { prepare: (sql: string) => any }
export type PayKind = 'event' | 'warehouse' | 'warehouse_or_event' | 'musicbus' | 'petrus' | 'gardener' | 'fixed_weekly'
export type Deps = {
  db: Db
  weekStart: string; weekEnd: string
  ownerPayKind: (staffId: number, workType: string, wording: string, payrollRule: string) => PayKind
  ownerPayForShift: (dateIso: string, start: string, end: string, kind: PayKind) => { amount: number; hourlyRate: number; breakdown: string } | null
}

type Entry = { source: 'draft' | 'shift'; id: number; draftId: number | null; staff_id: number; name: string; payroll_rule: string; work_date: string; start: string; end: string; work_type: string; venue: string; area: string; descr: string; hours: number; amount: number; payroll_week_start: string | null; own_rate: number }
type Paid = Entry & { rate_paid: number }

const toMin = (t: string) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null }
const hm = (m: number) => String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, '0') + ':' + String(((m % 1440) + 1440) % 1440 % 60).padStart(2, '0')
const t5 = (t: string) => (t || '').slice(0, 5)
const R = (n: number) => 'R' + Number(n || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
const r2 = (n: number) => Math.round(n * 100) / 100
const q = (n: number) => Math.round(n * 4) / 4
const longDate = (iso: string) => { const d = new Date(iso + 'T00:00:00Z'); return isNaN(d.getTime()) ? iso : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()] + ' ' + d.getUTCFullYear() }
const fnv = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return h.toString(16).padStart(8, '0') }
const span = (e: { start: string; end: string }): [number, number] | null => { const a = toMin(e.start), b0 = toMin(e.end); if (a === null || b0 === null) return null; return [a, b0 <= a ? b0 + 1440 : b0] }
const weekOf = (iso: string) => { const d = new Date(iso + 'T00:00:00Z'); if (isNaN(d.getTime())) return null; d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 1) % 7)); return d.toISOString().slice(0, 10) }
const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
const kindLabel = (k: PayKind, wt: string) => k === 'warehouse' ? 'Warehouse Team' : k === 'gardener' ? 'Garden (gardener rate)' : k === 'musicbus' ? 'Music Bus' : k === 'petrus' ? 'Petrus rule' : k === 'warehouse_or_event' ? (wt || 'Normal') + ' (warehouse wording – rate choice)' : (wt || 'Normal') + ' (Event/Venue)'

export type PaidBeforeFlag = {
  subject: Entry; paid: Paid[]
  kind: 'duplicate' | 'extra_hours' | 'wrong_rate' | 'wrong_rate_extra_hours' | 'covered'
  title: string; story: string; lines: string[]
  fullAmount: number; alreadyPaid: number; rateCorrection: number; extraAmount: number; stillDue: number
  extraHours: number; overlapHours: number; newRate: number; oldRate: number
  factsHash: string
}

// Price a window at the entry's own rule. Gardener / unpriced kinds fall back to the flat own-rate.
function price(d: Deps, e: Entry, kind: PayKind, start: string, end: string): { amount: number; rate: number; text: string } {
  const p = kind === 'gardener' || kind === 'fixed_weekly' ? null : d.ownerPayForShift(e.work_date, start, end, kind === 'warehouse_or_event' ? 'event' : kind)
  if (p) return { amount: p.amount, rate: p.hourlyRate, text: p.breakdown }
  const s = span({ start, end }); const h = s ? (s[1] - s[0]) / 60 : 0
  return { amount: r2(h * e.own_rate), rate: e.own_rate, text: `${h.toFixed(2)} h × ${R(e.own_rate)}` }
}

export function computeFlags(d: Deps, entries: Entry[], paidRows: Paid[]): PaidBeforeFlag[] {
  const out: PaidBeforeFlag[] = []
  for (const e of entries) {
    const se = span(e); if (!se) continue
    const same = paidRows.filter((p) => p.staff_id === e.staff_id && p.work_date === e.work_date && p.id !== e.id && !(e.source === 'shift' && p.id === e.id))
    const ov = same.map((p) => { const sp = span(p); if (!sp) return null; const o = Math.max(0, Math.min(se[1], sp[1]) - Math.max(se[0], sp[0])); return o >= 15 ? { p, sp, o } : null }).filter(Boolean) as Array<{ p: Paid; sp: [number, number]; o: number }>
    if (!ov.length) continue
    ov.sort((a, b) => a.sp[0] - b.sp[0])
    const kind = d.ownerPayKind(e.staff_id, e.work_type, [e.venue, e.descr].join(' '), e.payroll_rule)
    const full = price(d, e, kind, e.start, e.end)
    const alreadyPaid = r2(ov.reduce((a, x) => a + x.p.amount, 0))
    // What the paid windows are worth at the NEW entry's rule (rate correction), clipped to the claim.
    let paidWindowsAtNew = 0; const paidBits: string[] = []; let overlapMin = 0
    for (const x of ov) {
      const s = Math.max(se[0], x.sp[0]), en = Math.min(se[1], x.sp[1]); overlapMin += en - s
      const pw = price(d, e, kind, hm(s), hm(en)); paidWindowsAtNew += pw.amount
      paidBits.push(`${t5(x.p.start)}–${t5(x.p.end)} · ${x.p.venue || '—'}${x.p.area ? ' (' + x.p.area + ')' : ''} · ${x.p.work_type || '—'}${x.p.descr ? ' · "' + x.p.descr + '"' : ''} · ${x.p.hours.toFixed(2)} h × ${R(x.p.rate_paid)} = ${R(x.p.amount)} (payroll ${x.p.payroll_week_start || weekOf(x.p.work_date) || 'earlier'})`)
    }
    paidWindowsAtNew = r2(paidWindowsAtNew)
    const rateCorrection = r2(paidWindowsAtNew - alreadyPaid)
    const extraAmount = r2(full.amount - paidWindowsAtNew)
    const stillDue = r2(Math.max(0, full.amount - alreadyPaid))
    const extraMin = (se[1] - se[0]) - overlapMin; const extraHours = q(extraMin / 60)
    // Extra windows (parts of the claim outside every paid window)
    const cuts: Array<[number, number]> = [[se[0], se[1]]]
    for (const x of ov) for (let i = cuts.length - 1; i >= 0; i--) { const [a, b] = cuts[i]; const s = Math.max(a, x.sp[0]), en = Math.min(b, x.sp[1]); if (en <= s) continue; cuts.splice(i, 1); if (s > a) cuts.push([a, s]); if (en < b) cuts.push([en, b]) }
    cuts.sort((a, b) => a[0] - b[0])
    const extraText = cuts.map(([a, b]) => hm(a) + '–' + hm(b)).join(' + ')
    const oldRate = ov.length === 1 ? ov[0].p.rate_paid : r2(alreadyPaid / (overlapMin / 60 || 1))
    const typeChanged = ov.some((x) => norm(x.p.work_type) !== norm(e.work_type))
    const rateChanged = Math.abs(rateCorrection) >= 0.5
    const kindNow: PaidBeforeFlag['kind'] = stillDue < 0.5 ? (extraHours <= 0 && !rateChanged ? 'duplicate' : 'covered') : rateChanged && extraHours > 0 ? 'wrong_rate_extra_hours' : rateChanged ? 'wrong_rate' : 'extra_hours'
    const first = e.name.split(' ')[0]
    const he = 'He'
    const title = kindNow === 'duplicate' ? 'ALREADY PAID — SAME SHIFT AGAIN (duplicate)'
      : kindNow === 'covered' ? 'ALREADY PAID — this claim is covered by what was paid'
      : kindNow === 'wrong_rate_extra_hours' ? 'ALREADY PAID — WRONG RATE + EXTRA HOURS'
      : kindNow === 'wrong_rate' ? 'ALREADY PAID — WRONG RATE'
      : 'ALREADY PAID — EXTRA HOURS'
    const paidStr = paidBits.length === 1 ? paidBits[0] : paidBits.join('; ')
    const claimStr = `${t5(e.start)}–${t5(e.end)} · ${e.venue || '—'}${e.area ? ' (' + e.area + ')' : ''} · ${e.work_type || 'Normal'}${e.descr ? ' · "' + e.descr + '"' : ''} · ${e.hours.toFixed(2)} h`
    const lines: string[] = []
    lines.push(`${first} was paid ${longDate(e.work_date)} ${paidStr}.`)
    lines.push(`${he} now claims ${claimStr} for the same day${e.source === 'draft' ? ' (not yet final-submitted)' : ''}.`)
    if (typeChanged) lines.push(`Work type changed: ${ov.map((x) => x.p.work_type || '—').filter((v, i, a) => a.indexOf(v) === i).join('/')} → ${e.work_type || 'Normal'} (rate ${R(oldRate)} → ${R(full.rate)}${full.rate !== price(d, e, kind, hm(Math.max(se[0], ov[0].sp[0])), hm(Math.min(se[1], ov[0].sp[1]))).rate ? '' : ''}).`)
    else if (rateChanged) lines.push(`Same work type, but the rate paid (${R(oldRate)}/h) differs from the rule (${R(full.rate)}/h).`)
    if (rateChanged) lines.push(`• Rate correction on the paid hours ${ov.map((x) => hm(Math.max(se[0], x.sp[0])) + '–' + hm(Math.min(se[1], x.sp[1]))).join(', ')}: ${(overlapMin / 60).toFixed(2)} h — worth ${R(paidWindowsAtNew)} at the correct rule, ${R(alreadyPaid)} was paid → ${rateCorrection >= 0 ? '+' : '−'}${R(Math.abs(rateCorrection))}`)
    if (extraHours > 0) lines.push(`• Extra hours ${extraText}: ${extraHours.toFixed(2)} h → ${R(extraAmount)}`)
    if (kindNow === 'duplicate') lines.push(`Every hour of this claim is already paid. Nothing is due: R0,00.`)
    else if (kindNow === 'covered') lines.push(`What was paid (${R(alreadyPaid)}) already covers this claim (${R(full.amount)} at the correct rule). Nothing more is due: R0,00.`)
    else lines.push(`Still due: ${R(stillDue)} (full day ${e.hours.toFixed(2)} h at the correct rule = ${R(full.amount)} − ${R(alreadyPaid)} already paid).`)
    lines.push(`Hours from Wednesday onwards are estimated for the auditor run; this entry corrects them. Bernie to approve — nothing has been changed.`)
    const story = lines.join(' ')
    out.push({ subject: e, paid: ov.map((x) => x.p), kind: kindNow, title, story, lines, fullAmount: full.amount, alreadyPaid, rateCorrection, extraAmount, stillDue, extraHours, overlapHours: q(overlapMin / 60), newRate: full.rate, oldRate, factsHash: fnv(JSON.stringify([e.source, e.id, e.start, e.end, e.work_type, e.hours, ov.map((x) => [x.p.id, x.p.start, x.p.end, x.p.amount, x.p.work_type]), stillDue, rateCorrection, extraAmount])) })
  }
  return out
}

export async function loadCurrentWeek(d: Deps): Promise<{ entries: Entry[]; paidRows: Paid[] }> {
  const { db, weekStart, weekEnd } = d
  const rateRes = await db.prepare(`SELECT staff_id, work_type, hourly_rate FROM wage_work_rates WHERE active = 1`).all()
  const rates: Record<string, number> = {}
  for (const r of (rateRes.results || []) as any[]) rates[r.staff_id + '|' + norm(r.work_type)] = Number(r.hourly_rate)
  const staffRes = await db.prepare(`SELECT id, display_name, hourly_rate, payroll_rule FROM wage_staff`).all()
  const staff: Record<number, { name: string; rate: number; rule: string }> = {}
  for (const s of (staffRes.results || []) as any[]) staff[Number(s.id)] = { name: String(s.display_name), rate: Number(s.hourly_rate || 0), rule: String(s.payroll_rule || '') }
  const ownRate = (sid: number, wt: string) => rates[sid + '|' + norm(wt)] ?? staff[sid]?.rate ?? 90
  const mk = (r: any, source: 'draft' | 'shift'): Entry => {
    const s = span({ start: r.start_time, end: r.end_time }); const h = r.hours_worked != null ? Number(r.hours_worked) : (s ? (s[1] - s[0]) / 60 : 0)
    return { source, id: Number(r.id), draftId: source === 'draft' ? Number(r.id) : (r.source_draft_id ? Number(r.source_draft_id) : null), staff_id: Number(r.staff_id), name: staff[Number(r.staff_id)]?.name || '', payroll_rule: staff[Number(r.staff_id)]?.rule || '', work_date: String(r.work_date), start: String(r.start_time || ''), end: String(r.end_time || ''), work_type: String(r.work_type || ''), venue: String(r.outlet_venue || ''), area: String(r.area || ''), descr: String(r.work_description || ''), hours: h, amount: Number(r.amount || 0), payroll_week_start: r.payroll_week_start ? String(r.payroll_week_start) : null, own_rate: ownRate(Number(r.staff_id), String(r.work_type || '')) }
  }
  // Entries in the CURRENT payroll: paid rows + drafts (incl. missed shifts carrying a previous-week date).
  const paidCur = await db.prepare(`SELECT id, staff_id, work_date, start_time, end_time, hours_worked, COALESCE(gross_wage,total_amount,0) amount, work_type, outlet_venue, area, work_description, payroll_week_start, source_draft_id FROM wage_shifts
      WHERE (work_date BETWEEN ? AND ? AND (payroll_week_start IS NULL OR payroll_week_start = ?)) OR (payroll_week_start = ? AND work_date < ?)`).bind(weekStart, weekEnd, weekStart, weekStart, weekStart).all()
  const draftCur = await db.prepare(`SELECT id, staff_id, work_date, start_time, end_time, NULL hours_worked, 0 amount, work_type, outlet_venue, area, work_description, payroll_week_start FROM wage_shift_drafts
      WHERE status = 'draft' AND final_shift_id IS NULL AND work_date >= date(?, '-7 days') AND work_date <= ? AND ((work_date BETWEEN ? AND ?) OR payroll_week_start = ? OR missed_previous_week = 1)`).bind(weekStart, weekEnd, weekStart, weekEnd, weekStart).all()
  const entries = [...((paidCur.results || []) as any[]).map((r) => mk(r, 'shift')), ...((draftCur.results || []) as any[]).map((r) => mk(r, 'draft'))]
  if (!entries.length) return { entries, paidRows: [] }
  const dates = Array.from(new Set(entries.map((e) => e.work_date)))
  // PAID rows on those dates from EARLIER payrolls (proof), plus other paid rows of this payroll (same-week duplicates).
  const prior = await db.prepare(`SELECT id, staff_id, work_date, start_time, end_time, hours_worked, COALESCE(gross_wage,total_amount,0) amount, COALESCE(hourly_rate_snapshot,0) rate_paid, work_type, outlet_venue, area, work_description, payroll_week_start, source_draft_id FROM wage_shifts
      WHERE work_date IN (${dates.map(() => '?').join(',')})`).bind(...dates).all()
  const paidRows: Paid[] = ((prior.results || []) as any[]).map((r) => { const e = mk(r, 'shift'); const rp = Number(r.rate_paid || 0) || (e.hours ? r2(e.amount / e.hours) : 0); return { ...e, rate_paid: rp } })
  return { entries, paidRows }
}

export async function runPaidBeforeCheck(d: Deps, opts: { dryRun?: boolean } = {}): Promise<{ flags: PaidBeforeFlag[]; inserted: number; updated: number; voided: number }> {
  const { db } = d
  const { entries, paidRows } = await loadCurrentWeek(d)
  const flags = computeFlags(d, entries, paidRows)
  let inserted = 0, updated = 0, voided = 0
  if (opts.dryRun) return { flags, inserted, updated, voided }
  const keyOf = (f: PaidBeforeFlag) => PAID_BEFORE_PREFIX + (f.subject.draftId ? 'draft:' + f.subject.draftId : 'shift:' + f.subject.id)
  const ex = await db.prepare(`SELECT id, issue_key, status, facts_hash FROM wage_payroll_reviews WHERE issue_key LIKE '${PAID_BEFORE_PREFIX}%' AND (payroll_week_start = ? OR work_date BETWEEN date(?, '-7 days') AND ?)`).bind(d.weekStart, d.weekStart, d.weekEnd).all()
  const existing: Record<string, { id: number; status: string; facts_hash: string }> = {}
  for (const e of (ex.results || []) as any[]) existing[String(e.issue_key)] = { id: Number(e.id), status: String(e.status), facts_hash: String(e.facts_hash || '') }
  const live = new Set<string>()
  for (const f of flags) {
    const key = keyOf(f); live.add(key)
    const subjSrc = f.subject.draftId ? 'draft' : 'shift', subjId = f.subject.draftId || f.subject.id
    const system = JSON.stringify({ comparisonLabel: 'already paid check', warningTitle: f.title, humanReason: f.story, lines: f.lines, paidBefore: 1, kind: f.kind, recommendedAmount: f.stillDue, fullAmount: f.fullAmount, alreadyPaid: f.alreadyPaid, rateCorrection: f.rateCorrection, extraAmount: f.extraAmount, extraHours: f.extraHours, overlapHours: f.overlapHours, newRate: f.newRate, oldRate: f.oldRate, kindLabel: kindLabel(d.ownerPayKind(f.subject.staff_id, f.subject.work_type, [f.subject.venue, f.subject.descr].join(' '), f.subject.payroll_rule), f.subject.work_type), recommendedReason: f.title.replace(/^ALREADY PAID — /, 'Already paid — ') + ` — ${R(f.stillDue)} still due`, staffBlocking: 0, autoDuplicate: 0, conflictDetected: 1 })
    const subjSnap = JSON.stringify({ source: f.subject.source, id: f.subject.id, draftId: f.subject.draftId, staffId: f.subject.staff_id, employee: f.subject.name, workDate: f.subject.work_date, startTime: f.subject.start, endTime: f.subject.end, workType: f.subject.work_type, venue: f.subject.venue, area: f.subject.area, workDescription: f.subject.descr, hours: f.subject.hours })
    const cmpSnap = JSON.stringify(f.paid.map((p) => ({ shiftId: p.id, workDate: p.work_date, startTime: p.start, endTime: p.end, workType: p.work_type, venue: p.venue, area: p.area, workDescription: p.descr, hours: p.hours, amount: p.amount, ratePaid: p.rate_paid, payrollWeekStart: p.payroll_week_start })))
    const e = existing[key]
    if (!e) {
      await db.prepare(`INSERT INTO wage_payroll_reviews (issue_key, status, warning_kind, severity, staff_id, staff_name, work_date, payroll_week_start, subject_source, subject_shift_id, compared_source, compared_shift_id, compared_payroll_week_start, warning_reason, issue_summary, original_hours, compared_hours, previously_paid_hours, system_proposed_payable_hours, facts_hash, subject_snapshot_json, compared_snapshot_json, system_snapshot_json)
          SELECT ?, 'OPEN', 'previous_payroll_duplicate', 'red', ?, ?, ?, ?, ?, ?, 'shift', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE NOT EXISTS (SELECT 1 FROM wage_payroll_reviews WHERE issue_key = ?)`)
        .bind(key, f.subject.staff_id, f.subject.name, f.subject.work_date, d.weekStart, subjSrc, subjId, f.paid[0].id, f.paid[0].payroll_week_start, f.story, `${f.title} — ${f.subject.name} — ${f.subject.work_date} — still due ${R(f.stillDue)}`, f.subject.hours, f.paid[0].hours, f.overlapHours, f.extraHours, f.factsHash, subjSnap, cmpSnap, system, key).run()
      inserted++
    } else if (e.status === 'OPEN' && e.facts_hash !== f.factsHash) {
      await db.prepare(`UPDATE wage_payroll_reviews SET warning_reason = ?, issue_summary = ?, original_hours = ?, previously_paid_hours = ?, system_proposed_payable_hours = ?, facts_hash = ?, subject_snapshot_json = ?, compared_snapshot_json = ?, system_snapshot_json = ?, last_detected_at = CURRENT_TIMESTAMP, detected_count = detected_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'OPEN'`)
        .bind(f.story, `${f.title} — ${f.subject.name} — ${f.subject.work_date} — still due ${R(f.stillDue)}`, f.subject.hours, f.overlapHours, f.extraHours, f.factsHash, subjSnap, cmpSnap, system, e.id).run()
      updated++
    }
  }
  for (const [key, e] of Object.entries(existing)) {
    if (e.status !== 'OPEN' || live.has(key)) continue
    await db.prepare(`UPDATE wage_payroll_reviews SET status = 'VOID', void_reason = 'Auto: already-paid check re-run — the entry no longer overlaps a paid day (deleted or corrected)', voided_by_name = 'system already-paid check', voided_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'OPEN'`).bind(e.id).run()
    voided++
  }
  return { flags, inserted, updated, voided }
}

export function fmtRand(n: number) { return R(n) }
