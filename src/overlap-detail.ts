// ---------------------------------------------------------------------------
// Overlap / possible-double-charge reviews: show BOTH sides (owner 2026-09-16).
//
// The engine's review text only says "another overlapping entry on <date> for
// <times>". Bernie must see what was actually charged before — venue, times,
// hours, amount, which payroll, paid or only a draft — so a legitimate shift is
// not declined by mistake. This module builds that side-by-side text from the
// review's own snapshots, topped up with a live read of the compared entry.
// Display only: no review is created, changed or decided here.
// ---------------------------------------------------------------------------

type Db = { prepare: (sql: string) => any }

export type OverlapSide = {
  source: 'shift' | 'draft'; id: number | null; workDate: string; startTime: string; endTime: string
  venue: string; area: string; description: string; hours: number | null; amount: number | null
  payrollWeekStart: string | null; status: string // 'paid' | 'draft (not final-submitted)' | 'submitted draft' | 'not found'
}

export type OverlapDetail = {
  title: string           // "Possible same charge as last week" / "Possible double entry this week" / "Overlap with an earlier entry"
  kind: 'previous_week' | 'same_week' | 'other' | 'self'
  claim: OverlapSide
  earlier: OverlapSide | null
  overlapText: string     // "07:00–16:00 — full overlap · same venue"
  lines: string[]         // plain text lines for Excel / notes
}

const toMin = (t: string) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null }
const hm = (t: string) => (t || '').slice(0, 5)
const fmtR = (n: number | null) => n === null || n === undefined ? '' : 'R' + Number(n).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
const longDate = (iso: string) => { const d = new Date(iso + 'T00:00:00Z'); return isNaN(d.getTime()) ? iso : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()] + ' ' + d.getUTCFullYear() }
const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z]/g, '')
// B&W payroll weeks run Saturday to Friday.
function payrollWeekOf(iso: string): string | null {
  const d = new Date(iso + 'T00:00:00Z'); if (isNaN(d.getTime())) return null
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 1) % 7)); return d.toISOString().slice(0, 10)
}

function sideText(s: OverlapSide): string {
  const parts = [`${hm(s.startTime)}–${hm(s.endTime)}`, s.venue || '(no venue typed)']
  if (s.area) parts.push('(' + s.area + ')')
  if (s.description) parts.push('"' + s.description + '"')
  if (s.hours !== null && s.hours !== undefined) parts.push(Number(s.hours).toFixed(2) + ' h')
  if (s.amount !== null && s.amount !== undefined && s.amount > 0) parts.push(fmtR(s.amount))
  return parts.join(' · ')
}

export function sideLabel(s: OverlapSide): string {
  const wk = s.payrollWeekStart ? 'payroll ' + s.payrollWeekStart : (payrollWeekOf(s.workDate) ? 'payroll ' + payrollWeekOf(s.workDate) + ' (week of the date worked)' : 'payroll not set')
  return `${wk} · ${s.status}`
}

// Is the review an overlap-type review at all? (crew check / rate choice are not)
export function isOverlapReview(v: { issue_key?: string | null; warning_kind?: string | null; warning_reason?: string | null }): boolean {
  const k = String(v.issue_key || '')
  if (/^crew_hours\|/.test(k) || /^rate_choice_/.test(k)) return false
  const wk = String(v.warning_kind || '')
  return wk === 'previous_payroll_duplicate' || wk === 'current_payroll_duplicate' || wk === 'time_location_conflict' || /overlap|already.?claimed|duplicate|double/i.test(String(v.warning_reason || '')) || wk === 'possible_duplicate_manual_check'
}

type ReviewLike = {
  id: number; issue_key?: string | null; warning_kind?: string | null; warning_reason?: string | null; work_date: string; payroll_week_start?: string | null
  subject_source: string; subject_shift_id: number; compared_source?: string | null; compared_shift_id: number | null; compared_payroll_week_start?: string | null
  previously_paid_hours?: number | null; subject_snapshot_json?: string | null; compared_snapshot_json?: string | null
}

export type LiveEntry = { source: 'shift' | 'draft'; id: number; work_date: string; start_time: string; end_time: string; outlet_venue: string; area: string; work_description: string; hours_worked: number | null; amount: number | null; payroll_week_start: string | null; status: string; final_shift_id?: number | null }

// Fetch the compared (and, if needed, subject) entries live so the detail is complete even
// when the review snapshot is thin. One query per table, chunked. Read-only.
export async function loadLiveEntries(db: Db, reviews: ReviewLike[]): Promise<Record<string, LiveEntry>> {
  const shiftIds = new Set<number>(), draftIds = new Set<number>()
  for (const v of reviews) {
    if (!isOverlapReview(v)) continue
    if (v.compared_shift_id) ((v.compared_source || 'shift') === 'draft' ? draftIds : shiftIds).add(Number(v.compared_shift_id))
    if (v.subject_shift_id) (v.subject_source === 'draft' ? draftIds : shiftIds).add(Number(v.subject_shift_id))
  }
  const out: Record<string, LiveEntry> = {}
  const chunks = (arr: number[]) => { const c: number[][] = []; for (let i = 0; i < arr.length; i += 90) c.push(arr.slice(i, i + 90)); return c }
  for (const ch of chunks(Array.from(shiftIds))) {
    const r = await db.prepare(`SELECT id, work_date, start_time, end_time, COALESCE(outlet_venue,'') outlet_venue, COALESCE(area,'') area, COALESCE(work_description,'') work_description, hours_worked, COALESCE(gross_wage,total_amount,0) amount, payroll_week_start FROM wage_shifts WHERE id IN (${ch.map(() => '?').join(',')})`).bind(...ch).all()
    for (const x of (r.results || []) as any[]) out['shift:' + x.id] = { source: 'shift', id: Number(x.id), work_date: String(x.work_date), start_time: String(x.start_time || ''), end_time: String(x.end_time || ''), outlet_venue: String(x.outlet_venue), area: String(x.area), work_description: String(x.work_description), hours_worked: x.hours_worked === null ? null : Number(x.hours_worked), amount: Number(x.amount || 0), payroll_week_start: x.payroll_week_start ? String(x.payroll_week_start) : null, status: 'paid (final-submitted)' }
  }
  for (const ch of chunks(Array.from(draftIds))) {
    const r = await db.prepare(`SELECT d.id, d.work_date, d.start_time, d.end_time, COALESCE(d.outlet_venue,'') outlet_venue, COALESCE(d.area,'') area, COALESCE(d.work_description,'') work_description, d.status, d.payroll_week_start, d.final_shift_id,
          w.hours_worked, COALESCE(w.gross_wage, w.total_amount, 0) amount, w.payroll_week_start w_pws
        FROM wage_shift_drafts d LEFT JOIN wage_shifts w ON w.id = d.final_shift_id WHERE d.id IN (${ch.map(() => '?').join(',')})`).bind(...ch).all()
    for (const x of (r.results || []) as any[]) {
      const finalised = !!x.final_shift_id
      out['draft:' + x.id] = { source: 'draft', id: Number(x.id), work_date: String(x.work_date), start_time: String(x.start_time || ''), end_time: String(x.end_time || ''), outlet_venue: String(x.outlet_venue), area: String(x.area), work_description: String(x.work_description), hours_worked: finalised && x.hours_worked !== null ? Number(x.hours_worked) : null, amount: finalised ? Number(x.amount || 0) : null, payroll_week_start: (x.w_pws || x.payroll_week_start) ? String(x.w_pws || x.payroll_week_start) : null, status: finalised ? `paid (final-submitted as shift #${x.final_shift_id})` : (String(x.status) === 'draft' ? 'DRAFT ONLY – not final-submitted, not paid' : String(x.status)), final_shift_id: x.final_shift_id ? Number(x.final_shift_id) : null }
    }
  }
  return out
}

function parse(s: string | null | undefined): any { try { return s ? JSON.parse(s) : null } catch (e) { return null } }

function sideFrom(snap: any, live: LiveEntry | undefined, source: 'shift' | 'draft', id: number | null, fallbackDate: string): OverlapSide {
  const s = snap || {}
  return {
    source, id,
    workDate: live?.work_date || s.workDate || fallbackDate,
    startTime: live?.start_time || s.startTime || '', endTime: live?.end_time || s.endTime || '',
    venue: live?.outlet_venue || s.venue || s.eventName || '', area: live?.area || s.area || '',
    description: live?.work_description || s.workDescription || '',
    hours: live ? live.hours_worked : (s.hours !== undefined ? Number(s.hours) : null),
    amount: live ? live.amount : (s.amount !== undefined ? Number(s.amount) : null),
    payrollWeekStart: live?.payroll_week_start || s.payrollWeekStart || null,
    status: live ? live.status : (id ? (source === 'draft' ? 'draft no longer in the system (deleted or never final-submitted) – NOT paid' : 'paid (from review snapshot)') : 'not found'),
  }
}

export function buildOverlapDetail(v: ReviewLike, live: Record<string, LiveEntry>, opts: { subjectPayrollWeekStart?: string | null } = {}): OverlapDetail | null {
  if (!isOverlapReview(v)) return null
  const subjSrc = (v.subject_source === 'draft' ? 'draft' : 'shift') as 'shift' | 'draft'
  const cmpSrc = ((v.compared_source || 'shift') === 'draft' ? 'draft' : 'shift') as 'shift' | 'draft'
  const claimLive = live[subjSrc + ':' + v.subject_shift_id]
  const cmpLive = v.compared_shift_id ? live[cmpSrc + ':' + v.compared_shift_id] : undefined
  const claim = sideFrom(parse(v.subject_snapshot_json), claimLive, subjSrc, v.subject_shift_id, v.work_date)
  if (!claim.payrollWeekStart && opts.subjectPayrollWeekStart) claim.payrollWeekStart = opts.subjectPayrollWeekStart
  const earlier = v.compared_shift_id || v.compared_snapshot_json ? sideFrom(parse(v.compared_snapshot_json), cmpLive, cmpSrc, v.compared_shift_id, v.work_date) : null
  if (earlier && !earlier.payrollWeekStart && v.compared_payroll_week_start) earlier.payrollWeekStart = v.compared_payroll_week_start
  if (earlier && v.previously_paid_hours && (earlier.hours === null || earlier.hours === undefined)) earlier.hours = Number(v.previously_paid_hours)

  // Engine quirk: a draft compared with its OWN final-submitted shift. Same entry on both
  // sides — not a double charge. Say so, so it is not declined by mistake.
  const selfCompare = !!earlier && ((subjSrc === 'draft' && cmpSrc === 'shift' && claimLive && (claimLive as any).final_shift_id && Number((claimLive as any).final_shift_id) === Number(v.compared_shift_id))
    || (subjSrc === 'shift' && cmpSrc === 'draft' && cmpLive && (cmpLive as any).final_shift_id && Number((cmpLive as any).final_shift_id) === Number(v.subject_shift_id))
    || (subjSrc === cmpSrc && Number(v.subject_shift_id) === Number(v.compared_shift_id)))
  if (selfCompare && earlier) {
    if (!claim.payrollWeekStart) claim.payrollWeekStart = payrollWeekOf(claim.workDate)
    const title = 'System self-check: this entry was compared with ITSELF (the draft and its own final-submitted shift) — not a double charge'
    const lines = [title + ' — ' + longDate(claim.workDate), 'THE ENTRY (' + sideLabel(claim) + '): ' + sideText(claim), 'No other entry is involved. Pay as claimed unless something else is wrong with the shift.']
    return { title, kind: 'self', claim, earlier, overlapText: 'same entry on both sides', lines }
  }
  const claimWk = claim.payrollWeekStart || payrollWeekOf(claim.workDate), earlierWk = earlier?.payrollWeekStart || (earlier ? payrollWeekOf(earlier.workDate) : null)
  let kind: OverlapDetail['kind'] = 'other'
  if (earlier && earlierWk && claimWk && earlierWk < claimWk) kind = 'previous_week'
  else if (earlier && earlierWk && claimWk && earlierWk === claimWk) kind = 'same_week'
  else if (earlier && !earlierWk && !claimWk) kind = 'same_week'
  const earlierPaid = !!earlier && /^paid/.test(earlier.status)
  const title = kind === 'previous_week'
    ? (earlierPaid ? 'Possible same charge as last week (already paid in payroll ' + earlierWk + ')' : 'Overlaps an entry from payroll ' + earlierWk + ' that was NOT paid (draft only)')
    : kind === 'same_week'
    ? (earlierPaid ? 'Possible double entry this week (both in this payroll)' : 'Overlaps another entry this week that is only a draft (not paid)')
    : 'Overlap with another entry'

  // Overlap window + same-venue hint
  let overlapText = ''
  if (earlier) {
    const a1 = toMin(claim.startTime), a2r = toMin(claim.endTime), b1 = toMin(earlier.startTime), b2r = toMin(earlier.endTime)
    if (a1 !== null && a2r !== null && b1 !== null && b2r !== null) {
      const a2 = a2r <= a1 ? a2r + 1440 : a2r, b2 = b2r <= b1 ? b2r + 1440 : b2r
      const s = Math.max(a1, b1), e = Math.min(a2, b2)
      if (e > s) {
        const f = (m: number) => String(Math.floor((m % 1440) / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0')
        const full = s === a1 && e === a2
        overlapText = `${f(s)}–${f(e)} (${((e - s) / 60).toFixed(2)} h) — ${full ? 'the WHOLE of this claim is inside the earlier entry' : 'partial overlap; ' + (((a2 - a1) - (e - s)) / 60).toFixed(2) + ' h of this claim is outside it'}`
      } else overlapText = 'times do not actually overlap (' + hm(claim.startTime) + '–' + hm(claim.endTime) + ' vs ' + hm(earlier.startTime) + '–' + hm(earlier.endTime) + ')'
    }
    const sameVenue = norm(claim.venue) && norm(earlier.venue) && (norm(claim.venue).includes(norm(earlier.venue).slice(0, 5)) || norm(earlier.venue).includes(norm(claim.venue).slice(0, 5)))
    overlapText += (overlapText ? ' · ' : '') + (sameVenue ? 'same venue' : (claim.venue && earlier.venue ? 'DIFFERENT venue typed' : 'venue not typed on one side'))
  }

  const lines: string[] = []
  lines.push(title + ' — ' + longDate(claim.workDate))
  lines.push('THIS CLAIM (' + sideLabel(claim) + '): ' + sideText(claim))
  if (earlier) lines.push('ALREADY ON RECORD (' + sideLabel(earlier) + '): ' + sideText(earlier))
  else lines.push('ALREADY ON RECORD: the earlier entry could not be found (it may have been deleted) — treat with care.')
  if (overlapText) lines.push('OVERLAP: ' + overlapText)
  if (earlier && !earlierPaid) lines.push('NOTE: the earlier entry was never paid — this is not a double payment unless it is later final-submitted.')
  return { title, kind, claim, earlier, overlapText, lines }
}

// Small HTML block for the dashboard review cell.
export function overlapDetailHtml(d: OverlapDetail, esc: (s: string) => string): string {
  const row = (label: string, s: OverlapSide, strong = false) => `<tr><td style="padding:2px 8px 2px 0;white-space:nowrap;opacity:.75;vertical-align:top">${label}</td><td style="padding:2px 0;${strong ? 'font-weight:700' : ''}">${esc(sideText(s))}<div style="opacity:.65;font-size:11px">${esc(sideLabel(s))}</div></td></tr>`
  if (d.kind === 'self') {
    return `<div style="margin-top:4px;padding:6px 8px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12)">
      <div style="font-weight:800;color:#86efac">${esc(d.title)}</div>
      <table style="border-collapse:collapse;font-size:11.5px;margin-top:3px">${row('The entry', d.claim, true)}</table>
      <div style="margin-top:2px;opacity:.8">No other entry is involved. Pay as claimed unless something else is wrong with the shift.</div>
    </div>`
  }
  const paidEarlier = !!d.earlier && /^paid/.test(d.earlier.status)
  const colour = d.kind === 'previous_week' ? (paidEarlier ? '#fca5a5' : '#fcd34d') : '#fcd34d'
  return `<div style="margin-top:4px;padding:6px 8px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12)">
    <div style="font-weight:800;color:${colour}">${esc(d.title)}</div>
    <table style="border-collapse:collapse;font-size:11.5px;margin-top:3px">${row('This claim', d.claim, true)}${d.earlier ? row('Already on record', d.earlier) : `<tr><td colspan="2" style="padding:2px 0;color:#fcd34d">Earlier entry not found (may have been deleted) — treat with care.</td></tr>`}</table>
    ${d.overlapText ? `<div style="margin-top:3px"><span style="opacity:.75">Overlap:</span> ${esc(d.overlapText)}</div>` : ''}
    ${d.earlier && !paidEarlier ? `<div style="margin-top:2px;color:#fcd34d">The earlier entry was never paid — not a double payment unless it is later final-submitted.</div>` : ''}
  </div>`
}
