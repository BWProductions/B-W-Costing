// B&W PAYROLL EXCEL (owner spec, 2026-09-15). Built by the proxy from the
// database; the engine's own export is untouched.
//
// Tabs (6):  1 Wage Detail Linked  – master, one row per paid shift incl. missed
//            2 Auditor Trail Linked – Sat…Fri + block 6 "Missed Shifts" + deductions + Net
//            3 Auditor Summary      – one line per worker
//            4 Flagged / Reviewed   – every review + the office decision
//            5 Loans & Deductions   – fixed deductions, additional loans, repayment history
//            6 Missed Shifts        – line by line per worker: claimed, approved (green
//                                     review decision), breakdown, system note, review note
// Rules: no Bonus / Gross-including-bonus columns. Total Hours = Sat…Fri + Missed.
// Missed hours = the APPROVED hours (resolved review decision) or claimed if no review.
// Amounts follow the owner's rate rules for the actual day (ownerPayForShift).
import { buildXlsx, colLetter, ref, sheetRef, type Cell, type Sheet } from './xlsx-lite'

export type PayrollDeps = {
  db: D1Database
  weekStart: string
  weekEnd: string
  ownerPayKind: (staffId: number, workType: string, wording: string, payrollRule: string) => string
  ownerPayForShift: (dateIso: string, startTime: string, endTime: string, kind: any) => { amount: number, hourlyRate: number, breakdown: string } | null
  timeToMinutes: (t: string) => number | null
}

type PaidRow = { id: number, staff_id: number, display_name: string, payroll_rule: string, work_date: string, start_time: string, end_time: string, hours_worked: number, amount: number, rate: number, work_type: string, outlet_venue: string, area: string, event_name: string, work_description: string, payroll_week_start: string | null, missed_previous_week: number, source_draft_id: number | null, payroll_note: string | null, calculation_version: number }
type ReviewRow = { id: number, issue_key: string, status: string, severity: string, staff_id: number, staff_name: string, work_date: string, subject_source: string, subject_shift_id: number, compared_source: string, compared_shift_id: number | null, compared_payroll_week_start: string | null, warning_reason: string, issue_summary: string, original_hours: number | null, previously_paid_hours: number | null, system_proposed_payable_hours: number | null, approved_payable_hours: number | null, approved_start_time: string | null, approved_end_time: string | null, decision_type: string | null, decision_reason: string | null, reviewed_by_name: string | null, reviewed_at: string | null, system_snapshot_json: string | null, compared_snapshot_json: string | null }

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
function isoToDate(iso: string) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null }
function dayName(iso: string) { const d = isoToDate(iso); return d ? DAY_NAMES[d.getUTCDay()] : '' }
function longDate(iso: string) { const d = isoToDate(iso); return d ? `${DAY_SHORT[d.getUTCDay()]} ${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]} ${d.getUTCFullYear()}` : iso }
function addDays(iso: string, n: number) { const d = isoToDate(iso)!; d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
function r2(n: number) { return Math.round(n * 100) / 100 }
function fmtR(n: number) { return 'R' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ') }

// Light shade per worker so each person's block is easy to follow (6 pastel bands, cycled).
const BANDS = 6
function bandStyles(i: number) { const b = i % BANDS; return { t: `band${b}` as any, n: `band${b}Num` as any, m: `band${b}Money` as any } }
function parseSnap(s: string | null) { try { return s ? JSON.parse(s) : null } catch (e) { return null } }
// Title + note rows merged across the sheet width so the note stays a 2-line band, not a tall column.
function headBand(cols: number): { merges: string[], heights: Record<number, number> } { return { merges: [`A1:${colLetter(cols)}1`, `A2:${colLetter(cols)}2`], heights: { 1: 22, 2: 30, 4: 30 } } }
const BOILER = /Do not block staff entry\.?\s*Do not auto-call it duplicate\.?\s*Office must review.*$/i
function cleanFlag(sn: any, v: { warning_reason: string, issue_summary: string }) {
  const hr = String(sn?.humanReason || '').replace(BOILER, '').trim()
  if (hr) return hr
  return String(v.warning_reason || '').replace(/^Manual overlap \/ possible already-claimed review:\s*/i, '').replace(BOILER, '').trim() || v.issue_summary
}

export async function buildPayrollWorkbook(deps: PayrollDeps): Promise<{ bytes: Uint8Array, filename: string, checks: Record<string, number> }> {
  const { db, weekStart, weekEnd } = deps
  const paidRes = await db.prepare(`SELECT w.id, w.staff_id, s.display_name, s.payroll_rule, w.work_date, w.start_time, w.end_time, w.hours_worked,
        COALESCE(w.gross_wage, w.total_amount, 0) AS amount, w.hourly_rate_snapshot AS rate, w.work_type, w.outlet_venue, w.area, w.event_name, w.work_description,
        w.payroll_week_start, w.missed_previous_week, w.source_draft_id, w.payroll_note, w.calculation_version
      FROM wage_shifts w JOIN wage_staff s ON s.id = w.staff_id
      WHERE (w.work_date BETWEEN ? AND ? AND (w.payroll_week_start IS NULL OR w.payroll_week_start = ?))
         OR (w.payroll_week_start = ? AND w.work_date < ?)
      ORDER BY s.display_name, w.work_date, w.start_time, w.id`).bind(weekStart, weekEnd, weekStart, weekStart, weekStart).all()
  const paid = (paidRes.results || []) as PaidRow[]
  const staffIds = Array.from(new Set(paid.map((r) => r.staff_id)))
  const ph = staffIds.length ? staffIds.map(() => '?').join(',') : 'NULL'

  const revRes = staffIds.length ? await db.prepare(`SELECT id, issue_key, status, severity, staff_id, staff_name, work_date, subject_source, subject_shift_id, compared_source, compared_shift_id, compared_payroll_week_start,
        warning_reason, issue_summary, original_hours, previously_paid_hours, system_proposed_payable_hours, approved_payable_hours, approved_start_time, approved_end_time,
        decision_type, decision_reason, reviewed_by_name, reviewed_at, system_snapshot_json, compared_snapshot_json
      FROM wage_payroll_reviews WHERE staff_id IN (${ph}) AND status <> 'VOID' AND work_date BETWEEN date(?, '-7 days') AND ? ORDER BY id`).bind(...staffIds, weekStart, weekEnd).all() : { results: [] }
  const reviewsAll = (revRes.results || []) as ReviewRow[]
  const paidIds = new Set(paid.map((r) => r.id)); const paidDraftIds = new Set(paid.map((r) => r.source_draft_id).filter(Boolean) as number[])
  const reviewsForPaid = (r: PaidRow) => reviewsAll.filter((v) => (v.subject_source === 'shift' && v.subject_shift_id === r.id) || (v.subject_source === 'draft' && r.source_draft_id && v.subject_shift_id === r.source_draft_id))
  const decidedFor = (r: PaidRow) => reviewsForPaid(r).filter((v) => v.status === 'RESOLVED' && v.approved_payable_hours !== null && v.approved_payable_hours !== undefined && !/^(rate_choice_|petrus_extra|public_holiday|crew_pattern\|)/.test(v.issue_key || '')).sort((a, b) => b.id - a.id)[0]

  // Prior payroll rows on the same real day (for the system note on missed shifts).
  const missedDates = Array.from(new Set(paid.filter((r) => r.work_date < weekStart).map((r) => r.work_date)))
  const priorRes = missedDates.length ? await db.prepare(`SELECT id, staff_id, work_date, start_time, end_time, outlet_venue, payroll_week_start, COALESCE(gross_wage, total_amount, 0) AS amount FROM wage_shifts
        WHERE staff_id IN (${ph}) AND work_date IN (${missedDates.map(() => '?').join(',')}) AND (payroll_week_start IS NULL OR payroll_week_start < ?)`).bind(...staffIds, ...missedDates, weekStart).all() : { results: [] }
  const prior = (priorRes.results || []) as Array<{ id: number, staff_id: number, work_date: string, start_time: string, end_time: string, outlet_venue: string, payroll_week_start: string | null, amount: number }>

  // Deductions and loans.
  const staffAllRes = await db.prepare(`SELECT id, display_name, payroll_rule, standard_weekly_amount FROM wage_staff WHERE active = 1 ORDER BY display_name`).all()
  const staffAll = (staffAllRes.results || []) as Array<{ id: number, display_name: string, payroll_rule: string, standard_weekly_amount: number }>
  const fixedRes = await db.prepare(`SELECT d.id, d.staff_id, s.display_name, d.deduction_type, d.reason, d.amount, d.effective_from, d.effective_to, d.active FROM wage_recurring_deductions d JOIN wage_staff s ON s.id = d.staff_id
        WHERE d.active = 1 AND d.effective_from <= ? AND (d.effective_to IS NULL OR d.effective_to >= ?) ORDER BY s.display_name, d.id`).bind(weekEnd, weekStart).all()
  const fixed = (fixedRes.results || []) as Array<{ id: number, staff_id: number, display_name: string, deduction_type: string, reason: string, amount: number, effective_from: string, effective_to: string | null }>
  const loansRes = await db.prepare(`SELECT l.id, l.staff_id, s.display_name, l.original_amount, l.loan_date, l.deduction_start_date, l.reason, l.deduction_frequency, l.deduction_amount, l.outstanding_balance, l.total_repaid, l.next_due_date, l.status FROM wage_additional_loans l JOIN wage_staff s ON s.id = l.staff_id ORDER BY s.display_name, l.id`).all()
  const loans = (loansRes.results || []) as Array<{ id: number, staff_id: number, display_name: string, original_amount: number, loan_date: string, deduction_start_date: string | null, reason: string, deduction_frequency: string, deduction_amount: number, outstanding_balance: number, total_repaid: number, next_due_date: string, status: string }>
  const repRes = await db.prepare(`SELECT r.id, r.loan_id, r.staff_id, r.payroll_week_start, r.payroll_week_end, r.scheduled_amount, r.amount_deducted, r.balance_before, r.balance_after, r.result_status, r.created_at FROM wage_additional_loan_repayments r ORDER BY r.loan_id, r.payroll_week_start`).all()
  const reps = (repRes.results || []) as Array<{ id: number, loan_id: number, staff_id: number, payroll_week_start: string, payroll_week_end: string, scheduled_amount: number, amount_deducted: number, balance_before: number, balance_after: number, result_status: string, created_at: string }>

  // ---- Per-row pricing under owner rules (what the payroll pays) -------------
  type Priced = { row: PaidRow, missed: boolean, claimedH: number, approvedH: number, amount: number, rate: number, breakdown: string, review?: ReviewRow, systemNote: string, reviewNote: string, rateChoice?: ReviewRow }
  const priceHours = (r: PaidRow, hours: number, startHint?: string | null, endHint?: string | null) => {
    const kind = deps.ownerPayKind(r.staff_id, r.work_type, [r.outlet_venue, r.event_name, r.work_description].join(' '), r.payroll_rule)
    // Owner 2026-09-22: a WAREHOUSE / VENUE click on either a rate-choice review OR a crew-pattern flag
    // decides the place for this row — partial-hour pricing must follow that click too.
    const rateChoice = reviewsForPaid(r).filter((v) => /^(rate_choice_|crew_pattern\|)/.test(v.issue_key || '') && v.status === 'RESOLVED' && /chosen/i.test(v.decision_reason || '')).sort((a, b) => b.id - a.id)[0]
    const chosenKind = rateChoice ? (/^warehouse/i.test((rateChoice.decision_reason || '').trim()) ? 'warehouse' : 'event') : null
    const effKind = chosenKind && (kind === 'warehouse_or_event' || kind === 'warehouse' || kind === 'event') ? chosenKind : (kind === 'warehouse_or_event' ? 'event' : kind)
    const full = Number(r.hours_worked || 0)
    if (Math.abs(hours - full) < 0.001 || hours <= 0) {
      const p = hours <= 0 ? { amount: 0, hourlyRate: Number(r.rate || 0), breakdown: 'Approved 0 h — nothing payable' } : deps.ownerPayForShift(r.work_date, r.start_time, r.end_time, effKind)
      if (p) return { amount: p.amount, rate: p.hourlyRate, breakdown: p.breakdown + (kind === 'warehouse_or_event' && !rateChoice && hours > 0 ? ' (rate choice pending — priced as Venue/Event R95/h until Bernie chooses)' : '') }
      return { amount: Number(r.amount || 0), rate: Number(r.rate || 0), breakdown: 'System amount kept (' + (kind === 'gardener' ? 'gardener rate' : kind === 'fixed_weekly' ? 'fixed weekly' : 'unpriced') + ')' }
    }
    // Partial approval: price the approved window if known, else the LAST `hours` of the shift (extra hours are usually the late ones).
    let st = startHint || '', en = endHint || ''
    if (!(st && en)) {
      const s = deps.timeToMinutes(r.start_time), e0 = deps.timeToMinutes(r.end_time)
      if (s !== null && e0 !== null) { const e = e0 <= s ? e0 + 1440 : e0; const ns = Math.max(s, e - Math.round(hours * 60)); st = String(Math.floor((ns % 1440) / 60)).padStart(2, '0') + ':' + String(ns % 60).padStart(2, '0'); en = r.end_time }
    }
    const p = st && en ? deps.ownerPayForShift(r.work_date, st, en, effKind) : null
    if (p) return { amount: p.amount, rate: p.hourlyRate, breakdown: `Approved ${hours} h priced as ${st}–${en}: ${p.breakdown}` }
    const prop = full > 0 ? r2(Number(r.amount || 0) * hours / full) : 0
    return { amount: prop, rate: Number(r.rate || 0), breakdown: `Approved ${hours} h ≈ proportion of paid amount` }
  }
  const priced: Priced[] = paid.map((r) => {
    const missed = r.work_date < weekStart
    const review = decidedFor(r)
    const claimedH = Number(r.hours_worked || 0)
    const approvedH = review ? Number(review.approved_payable_hours) : claimedH
    const snap = review ? parseSnap(review.system_snapshot_json) : null
    let pr = priceHours(r, approvedH, review?.approved_start_time || snap?.recommendedStart, review?.approved_end_time || snap?.recommendedEnd)
    // Owner 2026-09-21: "already paid" review decided as a RAND amount — that amount is what this entry pays
    // (rate correction on last week's hours + extra hours). Shown as a correction line; last week's row untouched.
    // Owner 2026-09-22: Petrus weekday time outside 06–16 — held until the office decides; approved rand added.
    const pex = reviewsForPaid(r).find((v) => /^(petrus_extra|public_holiday)\|/.test(v.issue_key || ''))
    if (pex) {
      const ps = parseSnap(pex.system_snapshot_json)
      if (ps?.petrusSunday) {
        const lbl = ps.publicHoliday ? `Public holiday (${ps.publicHoliday})` : 'Petrus Sunday'
        if (pex.status === 'RESOLVED') pr = { amount: r2(Number(ps.approvedExtraAmount || 0)), rate: pr.rate, breakdown: Number(ps.approvedExtraAmount || 0) > 0 ? `${lbl} approved ${fmtR(Number(ps.approvedExtraAmount))} by ${ps.decidedBy || 'office'} (#${pex.id})${ps.recommendedText ? ' — ' + ps.recommendedText : ''}` : `${lbl} declined — R0 (#${pex.id})` }
        else pr = { amount: 0, rate: pr.rate, breakdown: `${lbl} — STILL OPEN #${pex.id}: R0 until the owner approves (recommended ${fmtR(Number(ps.recommendedAmount || 0))}${ps.recommendedText ? ' — ' + ps.recommendedText : ''})` }
      } else if (pex.status === 'RESOLVED' && ps?.approvedExtraAmount !== undefined && Number(ps.approvedExtraAmount) > 0) pr = { amount: r2(pr.amount + Number(ps.approvedExtraAmount)), rate: pr.rate, breakdown: pr.breakdown.replace(/ HELD — office to approve.*$/, '') + ` + office approved ${Number(ps.extraHours || 0).toFixed(2)} h outside 06–16 × ${fmtR(Number(ps.approvedRate || 0))} = ${fmtR(Number(ps.approvedExtraAmount))} (#${pex.id})` }
      else if (pex.status === 'RESOLVED') pr = { ...pr, breakdown: pr.breakdown.replace(/ HELD — office to approve.*$/, '') + ` (${Number(ps?.extraHours || 0).toFixed(2)} h outside 06–16 decided not payable, #${pex.id})` }
      else pr = { ...pr, breakdown: pr.breakdown + ` — STILL OPEN #${pex.id}: R0 paid for the extra time until the office decides` }
    }
    if (snap?.paidBefore && snap.approvedAmount !== undefined) pr = { amount: Number(snap.approvedAmount), rate: Number(snap.newRate || pr.rate), breakdown: `CORRECTION: already paid ${fmtR(Number(snap.alreadyPaid || 0))} earlier; ${Number(snap.rateCorrection || 0) ? 'rate correction ' + fmtR(Number(snap.rateCorrection)) + ' + ' : ''}extra ${Number(snap.extraHours || 0).toFixed(2)} h ${fmtR(Number(snap.extraAmount || 0))} = approved ${fmtR(Number(snap.approvedAmount))}` }
    // System note: overlap/cross-check facts.
    const sameDay = prior.filter((p) => p.staff_id === r.staff_id && p.work_date === r.work_date)
    const overlap = sameDay.filter((p) => { const a = deps.timeToMinutes(r.start_time), b0 = deps.timeToMinutes(r.end_time), c = deps.timeToMinutes(p.start_time), d0 = deps.timeToMinutes(p.end_time); if (a === null || b0 === null || c === null || d0 === null) return false; const b = b0 <= a ? b0 + 1440 : b0, d = d0 <= c ? d0 + 1440 : d0; return a < d && c < b })
    const allReviews = reviewsForPaid(r).filter((v) => !/^rate_choice_/.test(v.issue_key || ''))
    let systemNote = ''
    if (missed) {
      systemNote = overlap.length
        ? `OVERLAP: already paid ${overlap.map((p) => `${p.start_time}–${p.end_time} (${p.outlet_venue}, ${fmtR(Number(p.amount))}, payroll ${p.payroll_week_start || 'n/a'})`).join('; ')} on this day.`
        : sameDay.length ? `CLEAR: worked ${sameDay.map((p) => p.start_time + '–' + p.end_time).join(', ')} that day (paid in payroll ${sameDay[0].payroll_week_start || 'n/a'}); these hours are outside those times.`
        : 'CLEAR: nothing else paid for this day.'
    }
    const sysParts = allReviews.map((v) => { const sn = parseSnap(v.system_snapshot_json); const rec = v.system_proposed_payable_hours !== null && v.system_proposed_payable_hours !== undefined ? ` System recommended ${Number(v.system_proposed_payable_hours).toFixed(2)} h${sn?.recommendedStart ? ' (' + sn.recommendedStart + '–' + sn.recommendedEnd + ')' : ''}.` : ''; return `#${v.id} ${sn?.warningTitle || v.issue_summary}: ${cleanFlag(sn, v)}${rec}` })
    if (sysParts.length) systemNote = (systemNote ? systemNote + ' | ' : '') + sysParts.join(' | ')
    const reviewNote = allReviews.length
      ? allReviews.map((v) => v.status === 'RESOLVED'
        ? `#${v.id} DECIDED${v.approved_payable_hours !== null && v.approved_payable_hours !== undefined ? ' ' + Number(v.approved_payable_hours).toFixed(2) + ' h' : ''} by ${v.reviewed_by_name || 'office'}${v.reviewed_at ? ' ' + v.reviewed_at.slice(0, 16) : ''}: ${v.decision_reason || ''}`
        : `#${v.id} STILL OPEN — no decision recorded yet (claimed hours used)`).join(' | ')
      : (missed ? 'No review needed' : '')
    const rateChoice = reviewsForPaid(r).find((v) => /^rate_choice_/.test(v.issue_key || ''))
    return { row: r, missed, claimedH, approvedH, amount: pr.amount, rate: pr.rate, breakdown: pr.breakdown, review, systemNote, reviewNote, rateChoice }
  })

  // ---- Worker order ----------------------------------------------------------
  const workers = Array.from(new Map(priced.map((p) => [p.row.staff_id, p.row.display_name])).entries()).sort((a, b) => a[1].localeCompare(b[1]))
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  // ============================ TAB 1: Wage Detail Linked =====================
  const S1 = 'Wage Detail Linked'
  const d1Header = ['Shift ID', 'Employee', 'Date', 'Day', 'Missed shift?', 'Venue / Outlet', 'Area', 'Description', 'Work type', 'Start', 'End', 'Claimed hours', 'Approved hours (system)', 'Override hours (edit)', 'Effective hours', 'Amount (system)', 'Override amount (edit)', 'Effective amount', 'Rate used', 'Breakdown (how the amount was worked out)', 'Override reason (edit)', 'Review #', 'System note', 'Review decision']
  const d1: Cell[][] = [
    [{ v: 'B&W PRODUCTIONS — WAGE DETAIL LINKED (master)', s: 'title' }],
    [{ v: `Payroll week ${weekStart} to ${weekEnd}. One row per paid shift, including missed shifts from the previous payroll (real date shown). Edit only the yellow cells; Auditor Trail, Auditor Summary and Missed Shifts recalculate from this tab.`, s: 'note' }],
    [],
    d1Header.map((h) => ({ v: h, s: 'header' as const })),
  ]
  const D1_FIRST = 5
  const rowIndexByShift: Record<number, number> = {}
  priced.forEach((p, i) => {
    const rn = D1_FIRST + i
    rowIndexByShift[p.row.id] = rn
    d1.push([
      { v: p.row.id, s: 'text' }, p.row.display_name, p.row.work_date, dayName(p.row.work_date), p.missed ? 'YES' : '', p.row.outlet_venue || '', p.row.area || '', p.row.work_description || '', p.row.work_type || '',
      p.row.start_time, p.row.end_time, { v: p.claimedH, s: 'num' }, { v: p.approvedH, s: 'num' }, { v: null, s: 'edit' },
      { f: `IF(N${rn}<>"",N${rn},M${rn})`, s: 'numBold' },
      { v: p.amount, s: 'money' }, { v: null, s: 'editMoney' },
      { f: `IF(Q${rn}<>"",Q${rn},IF(N${rn}<>"",IF(M${rn}>0,ROUND(P${rn}*N${rn}/M${rn},2),0),P${rn}))`, s: 'moneyBold' },
      { v: p.rate, s: 'num' }, { v: p.breakdown, s: 'text' }, { v: null, s: 'edit' },
      p.review ? '#' + p.review.id : (p.rateChoice ? '#' + p.rateChoice.id : ''), { v: p.systemNote, s: 'text' }, { v: p.reviewNote, s: 'text' },
    ])
  })
  const D1_LAST = D1_FIRST + priced.length - 1
  d1.push([])
  d1.push([{ v: 'GRAND TOTAL', s: 'bold' }, null, null, null, null, null, null, null, null, null, null, { f: `SUM(L${D1_FIRST}:L${D1_LAST})`, s: 'numBold' }, { f: `SUM(M${D1_FIRST}:M${D1_LAST})`, s: 'numBold' }, null, { f: `SUM(O${D1_FIRST}:O${D1_LAST})`, s: 'numBold' }, { f: `SUM(P${D1_FIRST}:P${D1_LAST})`, s: 'moneyBold' }, null, { f: `SUM(R${D1_FIRST}:R${D1_LAST})`, s: 'moneyBold' }])
  const sheet1: Sheet = { name: S1, rows: d1, freeze: 4, widths: [8, 24, 11, 10, 8, 24, 14, 26, 14, 7, 7, 9, 10, 10, 10, 12, 12, 12, 8, 60, 20, 9, 80, 80], ...headBand(d1Header.length) }

  // Range helpers into tab 1 (effective hours O, effective amount R, employee B, date C, missed E).
  const T1 = sheetRef(S1)
  const rng = (col: string) => `${T1}!$${col}$${D1_FIRST}:$${col}$${Math.max(D1_LAST, D1_FIRST)}`

  // ============================ TAB 6: Missed Shifts ==========================
  // Owner format: Worker · Missed shift (date) · Approved hours · Notes.
  // Notes = the dashboard's missed-shift wording + the overlap / clear line.
  const S6 = 'Missed Shifts'
  const m6: Cell[][] = [
    [{ v: 'B&W PRODUCTIONS — MISSED SHIFTS (previous payroll, paid in this payroll)', s: 'title' }],
    [{ v: `Payroll week ${weekStart} to ${weekEnd}. Approved hours = the green review decision (claimed hours where no review was needed). YELLOW hours cells can be overtyped — the Amount next to them recalculates automatically and flows to block 6 on the Auditor Trail and to the Summary.`, s: 'note' }],
    [],
    ['Worker', 'Missed shift', 'Approved hours', 'Amount', 'Notes'].map((h) => ({ v: h, s: 'header' as const })),
  ]
  const missedTotalsRow: Record<number, number> = {}
  const noteFor = (p: Priced) => {
    const sameDay = prior.filter((x) => x.staff_id === p.row.staff_id && x.work_date === p.row.work_date)
    const overlap = sameDay.filter((x) => { const a1 = deps.timeToMinutes(p.row.start_time), b0 = deps.timeToMinutes(p.row.end_time), c1 = deps.timeToMinutes(x.start_time), d0 = deps.timeToMinutes(x.end_time); if (a1 === null || b0 === null || c1 === null || d0 === null) return false; const b1 = b0 <= a1 ? b0 + 1440 : b0, d1 = d0 <= c1 ? d0 + 1440 : d0; return a1 < d1 && c1 < b1 })
    const head = `Worked ${longDate(p.row.work_date)} (previous payroll), not captured that week; final-submitted and paid in payroll ${weekStart} to ${weekEnd}.`
    const check = overlap.length
      ? `OVERLAP already paid ${overlap.map((x) => `${x.start_time}–${x.end_time} (${x.outlet_venue}, payroll ${x.payroll_week_start || 'n/a'})`).join('; ')}`
      : sameDay.length ? `CLEAR worked ${sameDay.map((x) => x.start_time + '–' + x.end_time).join(', ')} that day (paid); these hours are outside those times`
      : 'CLEAR nothing else paid for this day'
    return head + '\n' + check
  }
  let bandIdx6 = -1
  for (const [sid, name] of workers) {
    const mine = priced.filter((p) => p.row.staff_id === sid && p.missed)
    if (!mine.length) continue
    bandIdx6++
    const first = m6.length + 1
    mine.forEach((p) => {
      const rn = rowIndexByShift[p.row.id]
      const r6 = m6.length + 1
      const B6 = bandStyles(bandIdx6)
      m6.push([{ v: name, s: B6.t }, { v: `${longDate(p.row.work_date)}  ${p.row.start_time}–${p.row.end_time}`, s: B6.t }, { f: `${T1}!O${rn}`, s: 'editNum' }, { f: `IF(${T1}!O${rn}=0,IF(C${r6}>0,ROUND(C${r6}*${p.rate || 90},2),0),ROUND(${T1}!R${rn}*C${r6}/${T1}!O${rn},2))`, s: B6.m }, { v: noteFor(p), s: 'wrap' }])
    })
    const last = m6.length
    const totalRow = m6.length + 1
    m6.push([{ v: `${name} — missed total`, s: 'bold' }, null, { f: `SUM(C${first}:C${last})`, s: 'sub' }, { f: `SUM(D${first}:D${last})`, s: 'subMoney' }])
    missedTotalsRow[sid] = totalRow
    m6.push([])
  }
  const m6TotalRows = Object.values(missedTotalsRow)
  m6.push([{ v: 'GRAND TOTAL MISSED SHIFTS', s: 'bold' }, null, { f: m6TotalRows.length ? m6TotalRows.map((r) => `C${r}`).join('+') : '0', s: 'sub' }, { f: m6TotalRows.length ? m6TotalRows.map((r) => `D${r}`).join('+') : '0', s: 'subMoney' }])
  const band6 = headBand(5)
  m6.forEach((row, i) => { if (i >= 4 && row.length >= 5 && row[4] && typeof row[4] === 'object' && (row[4] as any).s === 'wrap') band6.heights[i + 1] = 28 })
  const sheet6: Sheet = { name: S6, rows: m6, freeze: 4, widths: [28, 30, 12, 12, 120], ...band6 }
  const T6 = sheetRef(S6)

  // ============================ TAB 2: Auditor Trail Linked ===================
  const S2 = 'Auditor Trail Linked'
  const t2: Cell[][] = []
  const hdr1: Cell[] = [{ v: 'Employee', s: 'header' }]
  const hdr2: Cell[] = [{ v: '', s: 'header' }]
  const hdr3: Cell[] = [{ v: '', s: 'header' }]
  const merges2: string[] = ['A1:A3']
  days.forEach((d, i) => { const c = 2 + i * 2; hdr1.push({ v: `${i + 1}  ${DAY_SHORT[isoToDate(d)!.getUTCDay()]}`, s: 'header' }, { v: '', s: 'header' }); hdr2.push({ v: d, s: 'header' }, { v: '', s: 'header' }); hdr3.push({ v: 'HR', s: 'header' }, { v: 'Amount', s: 'header' }); merges2.push(`${colLetter(c)}1:${colLetter(c + 1)}1`, `${colLetter(c)}2:${colLetter(c + 1)}2`) })
  const MC = 16 // missed shifts HR column (P), amount Q
  hdr1.push({ v: '6  MISSED SHIFTS', s: 'header' }, { v: '', s: 'header' }); hdr2.push({ v: 'previous payroll, approved', s: 'header' }, { v: '', s: 'header' }); hdr3.push({ v: 'HR', s: 'header' }, { v: 'Amount', s: 'header' }); merges2.push(`P1:Q1`, `P2:Q2`)
  const tail = ['Total Hours (Sat–Fri + Missed)', 'Wages (linked)', 'Fixed Deductions Due', 'Fixed Deducted (edit)', 'Fixed Outstanding After Payroll', 'Additional Loan Due', 'Additional Loan Deducted (edit)', 'Additional Loan Outstanding After Payroll', 'Total Deducted This Period', 'NET WAGE']
  tail.forEach((h, i) => { const c = 18 + i; hdr1.push({ v: h, s: 'header' }); hdr2.push({ v: '', s: 'header' }); hdr3.push({ v: '', s: 'header' }); merges2.push(`${colLetter(c)}1:${colLetter(c)}3`) })
  t2.push(hdr1, hdr2, hdr3)
  const T2_FIRST = 4
  const trailRowByStaff: Record<number, number> = {}
  const dueFixed = (sid: number) => fixed.filter((f) => f.staff_id === sid).reduce((a, f) => a + Number(f.amount || 0), 0)
  const dueLoan = (sid: number) => loans.filter((l) => l.staff_id === sid && l.status === 'active' && (l.deduction_start_date || l.loan_date) <= weekEnd).reduce((a, l) => a + Math.min(Number(l.deduction_amount || 0), Number(l.outstanding_balance || 0)), 0)
  const loanBal = (sid: number) => loans.filter((l) => l.staff_id === sid && l.status === 'active').reduce((a, l) => a + Number(l.outstanding_balance || 0), 0)
  // Include workers with deductions/loans but no shifts? Keep to workers with paid shifts (as the engine does) plus fixed-weekly staff.
  const trailWorkers = [...workers]
  for (const s of staffAll) if (s.payroll_rule === 'fixed_weekly' && !trailWorkers.find((w) => w[0] === s.id)) trailWorkers.push([s.id, s.display_name])
  trailWorkers.sort((a, b) => a[1].localeCompare(b[1]))
  trailWorkers.forEach(([sid, name], i) => {
    const rn = T2_FIRST + i
    trailRowByStaff[sid] = rn
    const row: Cell[] = [{ v: name, s: 'bold' }]
    days.forEach((d, di) => {
      const c = 2 + di * 2
      const hrsF = `SUMIFS(${rng('O')},${rng('B')},$A${rn},${rng('C')},${colLetter(c)}$2,${rng('E')},"")`
      const amtF = `SUMIFS(${rng('R')},${rng('B')},$A${rn},${rng('C')},${colLetter(c)}$2,${rng('E')},"")`
      // HR cell is editable (yellow): it starts as the linked hours. Amount follows whatever HR now says:
      // linked amount × (HR typed ÷ HR linked). Typing 0 gives R0; leaving it alone gives the linked amount.
      row.push({ f: hrsF, s: 'editNum' })
      row.push({ f: `IF(${hrsF}=0,IF(${colLetter(c)}${rn}>0,ROUND(${colLetter(c)}${rn}*90,2),0),ROUND(${amtF}*${colLetter(c)}${rn}/${hrsF},2))`, s: 'money' })
    })
    const mr = missedTotalsRow[sid]
    // Block 6: HR editable (yellow) = missed approved hours from the Missed Shifts tab; Amount follows the typed HR.
    row.push({ f: mr ? `${T6}!C${mr}` : '0', s: 'editNum' })
    row.push({ f: mr ? `IF(${T6}!C${mr}=0,IF(P${rn}>0,ROUND(P${rn}*90,2),0),ROUND(${T6}!D${mr}*P${rn}/${T6}!C${mr},2))` : `IF(P${rn}>0,ROUND(P${rn}*90,2),0)`, s: 'subMoney' })
    const fixedWeekly = staffAll.find((s) => s.id === sid && s.payroll_rule === 'fixed_weekly')
    row.push({ f: `SUM(B${rn},D${rn},F${rn},H${rn},J${rn},L${rn},N${rn},P${rn})`, s: 'numBold' })
    row.push(fixedWeekly ? { v: Number(fixedWeekly.standard_weekly_amount || 0), s: 'moneyBold' } : { f: `SUM(C${rn},E${rn},G${rn},I${rn},K${rn},M${rn},O${rn},Q${rn})`, s: 'moneyBold' })
    const fd = dueFixed(sid), ld = dueLoan(sid), lb = loanBal(sid)
    row.push({ v: fd, s: 'money' }, { v: fd, s: 'editMoney' }, { f: `MAX(0,T${rn}-U${rn})`, s: 'money' })
    row.push({ v: ld, s: 'money' }, { v: ld, s: 'editMoney' }, { f: `MAX(0,${lb}-X${rn})`, s: 'money' })
    row.push({ f: `U${rn}+X${rn}`, s: 'money' }, { f: `MAX(0,S${rn}-Z${rn})`, s: 'subMoney' })
    t2.push(row)
  })
  const T2_LAST = T2_FIRST + trailWorkers.length - 1
  const gt: Cell[] = [{ v: 'GRAND TOTAL', s: 'bold' }]
  for (let c = 2; c <= 27; c++) gt.push({ f: `SUM(${colLetter(c)}${T2_FIRST}:${colLetter(c)}${T2_LAST})`, s: (c % 2 === 1 || c >= 19) ? 'moneyBold' : 'numBold' })
  gt[17] = { f: `SUM(R${T2_FIRST}:R${T2_LAST})`, s: 'numBold' } // Total Hours column R is hours
  t2.push(gt)
  const sheet2: Sheet = { name: S2, rows: t2, freeze: 3, merges: merges2, widths: [26, 6, 10, 6, 10, 6, 10, 6, 10, 6, 10, 6, 10, 6, 10, 7, 11, 11, 12, 11, 11, 11, 11, 11, 11, 11, 12] }
  const T2 = sheetRef(S2)

  // ============================ TAB 3: Auditor Summary ========================
  const S3 = 'Auditor Summary'
  const s3: Cell[][] = [
    [{ v: 'B&W PRODUCTIONS — AUDITOR SUMMARY', s: 'title' }],
    [{ v: `Payroll week ${weekStart} to ${weekEnd}. Linked to Auditor Trail Linked; hours and wages include block 6 (Missed Shifts). No bonus columns.`, s: 'note' }],
    [],
    ['Name', 'Days Worked', 'Hours (incl. missed)', 'Missed Shift Hours', 'Wages', 'Fixed Deductions Due', 'Fixed Deducted', 'Fixed Outstanding', 'Additional Loan Due', 'Additional Loan Deducted', 'Additional Loan Outstanding', 'Total Deducted', 'NET WAGE'].map((h) => ({ v: h, s: 'header' as const })),
  ]
  const S3_FIRST = 5
  trailWorkers.forEach(([sid, name], i) => {
    const tr = trailRowByStaff[sid]
    s3.push([name,
      { f: `--(${T2}!B${tr}>0)+--(${T2}!D${tr}>0)+--(${T2}!F${tr}>0)+--(${T2}!H${tr}>0)+--(${T2}!J${tr}>0)+--(${T2}!L${tr}>0)+--(${T2}!N${tr}>0)`, s: 'num' },
      { f: `${T2}!R${tr}`, s: 'num' }, { f: `${T2}!P${tr}`, s: 'num' }, { f: `${T2}!S${tr}`, s: 'money' },
      { f: `${T2}!T${tr}`, s: 'money' }, { f: `${T2}!U${tr}`, s: 'money' }, { f: `${T2}!V${tr}`, s: 'money' },
      { f: `${T2}!W${tr}`, s: 'money' }, { f: `${T2}!X${tr}`, s: 'money' }, { f: `${T2}!Y${tr}`, s: 'money' },
      { f: `${T2}!Z${tr}`, s: 'money' }, { f: `${T2}!AA${tr}`, s: 'subMoney' }])
  })
  const S3_LAST = S3_FIRST + trailWorkers.length - 1
  s3.push([{ v: 'GRAND TOTAL', s: 'bold' }, { f: `SUM(B${S3_FIRST}:B${S3_LAST})`, s: 'numBold' }, { f: `SUM(C${S3_FIRST}:C${S3_LAST})`, s: 'numBold' }, { f: `SUM(D${S3_FIRST}:D${S3_LAST})`, s: 'numBold' }, ...['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'].map((c) => ({ f: `SUM(${c}${S3_FIRST}:${c}${S3_LAST})`, s: 'moneyBold' as const }))])
  const sheet3: Sheet = { name: S3, rows: s3, freeze: 4, widths: [26, 10, 12, 12, 13, 13, 12, 12, 13, 13, 13, 13, 14], ...headBand(13) }

  // ============================ TAB 4: Flagged / Reviewed =====================
  const S4 = 'Flagged - Reviewed'
  const relevant = reviewsAll.filter((v) => (v.subject_source === 'shift' && paidIds.has(v.subject_shift_id)) || (v.subject_source === 'draft' && paidDraftIds.has(v.subject_shift_id)))
  const s4: Cell[][] = [
    [{ v: 'B&W PRODUCTIONS — FLAGGED / REVIEWED', s: 'title' }],
    [{ v: `Payroll week ${weekStart} to ${weekEnd}. Every review on a paid shift in this payroll: what the system flagged, and the office decision (name, time, reason). OPEN items first.`, s: 'note' }],
    [],
    ['Status', 'Review #', 'Employee', 'Date', 'Shift', 'Flag', 'System note', 'System recommended hours', 'Claimed hours', 'Approved hours', 'Decision', 'Decided by', 'Decided at', 'Reason recorded'].map((h) => ({ v: h, s: 'header' as const })),
  ]
  // Group by worker (OPEN items still first within each worker) so each shaded block is one person.
  relevant.sort((a, b) => a.staff_name.localeCompare(b.staff_name) || (a.status === 'OPEN' ? 0 : 1) - (b.status === 'OPEN' ? 0 : 1) || a.work_date.localeCompare(b.work_date) || a.id - b.id)
  const bandByName: Record<string, number> = {}
  relevant.forEach((v) => {
    const sn = parseSnap(v.system_snapshot_json)
    const p = priced.find((x) => (v.subject_source === 'shift' && x.row.id === v.subject_shift_id) || (v.subject_source === 'draft' && x.row.source_draft_id === v.subject_shift_id))
    if (!(v.staff_name in bandByName)) bandByName[v.staff_name] = Object.keys(bandByName).length
    const B = bandStyles(bandByName[v.staff_name])
    const T = (val: any) => ({ v: val === null || val === undefined ? '' : val, s: B.t })
    const N = (val: any) => (val === null || val === undefined || val === '' ? { v: '', s: B.t } : { v: Number(val), s: B.n })
    s4.push([{ v: v.status, s: v.status === 'OPEN' ? 'flagLine' : B.t }, T(v.id), T(v.staff_name), T(v.work_date), T(p ? `${p.row.start_time}–${p.row.end_time} ${p.row.outlet_venue || ''}` : ''),
      T(sn?.warningTitle || v.issue_summary), T(cleanFlag(sn, v)),
      N(v.system_proposed_payable_hours), N(p ? p.claimedH : v.original_hours), N(v.approved_payable_hours), T((v.decision_type || '').replace(/_/g, ' ')), T(v.reviewed_by_name || ''), T(v.reviewed_at || ''), T(v.decision_reason || '')])
  })
  const sheet4: Sheet = { name: S4, rows: s4, freeze: 4, widths: [10, 8, 24, 11, 30, 26, 70, 11, 9, 9, 18, 16, 17, 70], ...headBand(14) }

  // ============================ TAB 5: Loans & Deductions =====================
  // Three blocks share one column grid: A ref · B Employee · C date/type · D date · E reason/week · F–J money · K–M status/notes.
  const S5 = 'Loans & Deductions'
  const s5: Cell[][] = [
    [{ v: 'B&W PRODUCTIONS — LOANS & DEDUCTIONS', s: 'title' }],
    [{ v: `Position as at ${weekEnd}. Amounts actually deducted this week are the yellow cells on Auditor Trail Linked.`, s: 'note' }],
    [],
    [{ v: 'FIXED WEEKLY DEDUCTIONS (active this week)', s: 'bold' }],
    ['', 'Employee', 'Type', 'Effective from', 'Reason', 'Amount per week', 'Effective to'].map((h) => ({ v: h, s: 'header' as const })),
  ]
  fixed.forEach((f) => s5.push(['', f.display_name, f.deduction_type, f.effective_from, f.reason, { v: Number(f.amount), s: 'money' }, f.effective_to || 'ongoing']))
  if (!fixed.length) s5.push(['', 'none'])
  s5.push([], [{ v: 'ADDITIONAL LOANS', s: 'bold' }], ['Loan #', 'Employee', 'Date given', 'Deductions from', 'Reason', 'Original amount', 'Instalment', 'Repaid to date', 'Outstanding balance', 'Due this week', 'Frequency', 'Status', 'Check'].map((h) => ({ v: h, s: 'header' as const })))
  loans.forEach((l) => {
    const due = l.status === 'active' && (l.deduction_start_date || l.loan_date) <= weekEnd ? Math.min(Number(l.deduction_amount), Number(l.outstanding_balance)) : 0
    const repaidLedger = reps.filter((r) => r.loan_id === l.id).reduce((a, r) => a + Number(r.amount_deducted || 0), 0)
    const check = l.status === 'paid' && repaidLedger < Number(l.original_amount) - 0.005 ? `Marked PAID but ledger shows only ${fmtR(repaidLedger)} repaid of ${fmtR(Number(l.original_amount))} — please check` : (Math.abs(repaidLedger - Number(l.total_repaid)) > 0.005 ? `Ledger ${fmtR(repaidLedger)} ≠ total repaid ${fmtR(Number(l.total_repaid))}` : '')
    s5.push(['#' + l.id, l.display_name, l.loan_date, l.deduction_start_date || l.loan_date, (l.reason || '').replace(/\s+/g, ' ').slice(0, 70), { v: Number(l.original_amount), s: 'money' }, { v: Number(l.deduction_amount), s: 'money' }, { v: Number(l.total_repaid), s: 'money' }, { v: Number(l.outstanding_balance), s: 'moneyBold' }, { v: due, s: 'money' }, l.deduction_frequency, l.status, { v: check, s: check ? 'flagLine' : 'text' }])
  })
  if (!loans.length) s5.push(['', 'none'])
  s5.push([], [{ v: 'LOAN REPAYMENT HISTORY (all payrolls)', s: 'bold' }], ['Loan #', 'Employee', 'Payroll week', 'Recorded at', 'Result', 'Scheduled', 'Deducted', 'Balance before', 'Balance after'].map((h) => ({ v: h, s: 'header' as const })))
  reps.forEach((r) => { const l = loans.find((x) => x.id === r.loan_id); s5.push(['#' + r.loan_id, l?.display_name || '', `${r.payroll_week_start} → ${r.payroll_week_end}`, (r.created_at || '').slice(0, 16), r.result_status, { v: Number(r.scheduled_amount), s: 'money' }, { v: Number(r.amount_deducted), s: 'money' }, { v: Number(r.balance_before), s: 'money' }, { v: Number(r.balance_after), s: 'money' }]) })
  if (!reps.length) s5.push(['', 'none'])
  const sheet5: Sheet = { name: S5, rows: s5, widths: [7, 26, 24, 18, 58, 14, 12, 14, 16, 12, 10, 9, 70], ...headBand(13) }

  const bytes = buildXlsx([sheet1, sheet2, sheet3, sheet4, sheet5, sheet6])
  const missedApprovedH = priced.filter((p) => p.missed).reduce((a, p) => a + p.approvedH, 0)
  const checks = {
    paid_rows: priced.length,
    missed_rows: priced.filter((p) => p.missed).length,
    claimed_hours: r2(priced.reduce((a, p) => a + p.claimedH, 0)),
    approved_hours: r2(priced.reduce((a, p) => a + p.approvedH, 0)),
    missed_approved_hours: r2(missedApprovedH),
    wages_total: r2(priced.reduce((a, p) => a + p.amount, 0)),
    system_paid_total: r2(priced.reduce((a, p) => a + Number(p.row.amount || 0), 0)),
    open_reviews: relevant.filter((v) => v.status === 'OPEN').length,
  }
  return { bytes, filename: `bw-payroll-${weekStart}-to-${weekEnd}.xlsx`, checks }
}
