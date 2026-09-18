// ---------------------------------------------------------------------------
// Same-venue crew check (owner request 2026-09-16).
//
// For every paid shift in the payroll, find the other staff who were at the SAME
// venue on the SAME date at the SAME time (venue matched loosely on venue, event
// name, area and description — staff spell venues differently, or type
// "Botanical" in one box and "garden" in another) and compare claimed hours.
//
//   • Majority rule: the hours claimed by the MOST people are the crew hours.
//     Four claim 11 h and two claim 18 h → crew hours 11 h; the two 18 h claims
//     are flagged: "4 others claimed 11.00 h: <names>". Recommended = 11 h.
//   • Under-claim: someone inside the crew's time window who claims LESS than the
//     crew is flagged too (possible under-payment). Recommended = own hours.
//   • No majority (crew of 2 that differ, 2 vs 2, …): everyone in that group is
//     flagged with every name and hours listed so Bernie can check the system.
//   • Venue not clear (only a town/suburb typed): "possible same venue" flag that
//     lists the crews in that area that day, if the hours differ.
//
// It NEVER changes hours or pay. It only opens orange Reviews (same table, same
// decision form as every other review). Bernie decides; until then the shift is
// paid on claimed hours exactly as before. Flags that no longer apply (hours were
// corrected) are auto-voided so they do not linger.
// ---------------------------------------------------------------------------

export const CREW_CHECK_VERSION = 1
export const CREW_KEY_PREFIX = 'crew_hours|shift:'
const TOL = 0.5 // hours: differences up to 30 minutes are NOT flagged

type Db = { prepare: (sql: string) => any }

export type CrewShift = {
  id: number; staff_id: number; display_name: string; payroll_rule: string; work_date: string
  start_time: string; end_time: string; hours_worked: number; work_type: string
  outlet_venue: string; area: string; event_name: string; work_description: string
  payroll_week_start: string | null; in_scope: boolean; effective_hours: number
}

export type CrewFlag = {
  kind: 'over' | 'under' | 'no_majority' | 'possible_venue'
  subjectShiftId: number; staffId: number; staffName: string; workDate: string
  venueLabel: string; personHours: number; crewHours: number | null
  recommendedForSubject: number; humanReason: string; shortReason: string; summary: string
  members: Array<{ name: string; hours: number; windows: string }>
  comparedShiftId: number | null; factsHash: string
}

// ----------------------------------------------------------------- wording ---
const GENERIC = new Set(('setup set up strike striking strikedown stike stirke strke down breakdown break loading offload offloading offloaded load unloading louding laoding missed missing shift shifts hour hours extra additional and the of at for day days event events work worked working normal collection collect cleaning clean painting then later drive driving going from to with activation activations promotions promotion music bus busses buss outlet outlets dropping drop promoters took place on th time late night screen screens truck trucks tv tvs live reg final verification regression direct team crew support soft do done prep preparation preparations prepare preparing repack repacking recieve receive receiving recieving packing fixing fixed stuff castle lager lite double stadium club park mall pub college village hotel office centre center road street rd bar bags bean wolf parcels deliveries delivery accommodation accomodation home back going in out this that was were is are it its our their his her per hrs hr am pm extra additonal additional hours hourss loading offloading fixing packing clean cleaning cleaned wash washing gardening additional').split(/\s+/))
const LOCATIONS = new Set(('johannesburg johannesurg johanessburg jhb joburgcity pretoria pta sandton bryanston bryston branson brixton randburg meyerton henley henly klip midvaal midrand centurion soweto lanseria fourways ways four mpumalanga mounalanga carolina thembisa highbury middleburg middelburg equestrian lynnwood ops test gauteng lakes silverlakes queenswood queens wood henry onklip midstream centurion highveld hq').split(/\s+/))
// "midstream" and "hq" are real venues at B&W — take them back out of LOCATIONS.
LOCATIONS.delete('midstream'); LOCATIONS.delete('hq')

function canonToken(raw: string): string {
  let t = raw.toLowerCase()
  if (/^w[a-z]*house$/.test(t) || /^w[ae]{1,2}r?e?h[aeo]*use$/.test(t) || t === 'workehouse' || t === 'warhehouse') return 'warehouse'
  if (/^botan/.test(t) || /^bonit/.test(t) || /^botin/.test(t)) return 'botanical'
  if (/^pa[ds]t?[ds]t?a?l+$/.test(t) || t === 'padstall' || t === 'pastdal' || t === 'padstal') return 'padstal'
  if (/^gros/.test(t)) return 'grosvenor'
  if (t === 'headoffice' || t === 'head' || t === 'hq' || t === 'headquarters' || t === 'headquaters' || t === 'headquatoers') return 'hq'
  if (/^monte/.test(t)) return 'monte'
  if (/^silver/.test(t)) return 'silveroaks'
  if (/^oaks?$/.test(t)) return 'silveroaks'
  if (/^jo[h]?burg$/.test(t)) return 'joburgday'
  if (t === 'fnb') return 'fnb'
  if (t === 'nashua') return 'nashua'
  if (/^rivers?$/.test(t) || /^cabins?$/.test(t)) return 'rivercabin'
  if (/^malt$/.test(t)) return 'malt'
  if (/^inbev$/.test(t)) return 'sab'
  if (t.length > 4 && t.endsWith('s')) t = t.slice(0, -1) // gardens → garden
  return t
}

function tokens(text: string): string[] {
  return (text || '').toLowerCase().replace(/\bpad\s+stal+\b/g, 'padstal').replace(/\bhead\s*office\b/g, 'hq').replace(/\bsilver\s+oaks?\b/g, 'silveroaks').replace(/\bmonte\s*casino\b/g, 'monte').replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !/\d/.test(w)).map(canonToken).filter((w) => w.length >= 3 && !GENERIC.has(w))
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const m = a.length, n = b.length
  if (Math.abs(m - n) > 2) return 3
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]; dp[0] = i
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return dp[n]
}

function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true
  const len = Math.min(a.length, b.length)
  if (len >= 7) return levenshtein(a, b) <= 2
  if (len >= 5) return levenshtein(a, b) <= 1
  return false
}

type Node = {
  s: CrewShift; venueTokens: string[]; locTokens: string[]; startMin: number; endMin: number
}

function toMin(t: string): number { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : 0 }

function buildNode(s: CrewShift): Node {
  const primary = tokens([s.outlet_venue, s.event_name].join(' '))
  const descr = tokens(s.work_description)
  const areaT = tokens(s.area)
  const isLoc = (t: string) => LOCATIONS.has(t)
  // Venue + event name first; the Area box also counts (staff type "Supplier summit" or "Hq" there);
  // if all of that is only a town/suburb ("Pretoria"), fall back to the description.
  let venue = [...primary, ...areaT].filter((t) => !isLoc(t))
  if (!venue.length) venue = descr.filter((t) => !isLoc(t))
  venue = Array.from(new Set(venue))
  if (venue.includes('botanical')) venue = venue.filter((t) => t !== 'garden')
  const loc = Array.from(new Set([...primary, ...descr, ...areaT].filter(isLoc)))
  const st = toMin(s.start_time); let en = toMin(s.end_time); if (en <= st) en += 24 * 60
  return { s, venueTokens: venue, locTokens: loc, startMin: st, endMin: en }
}

function isHomeGarden(n: Node): boolean {
  const gardener = n.s.staff_id === 1 || n.s.staff_id === 2
  const wt = n.s.work_type || ''
  const only = n.venueTokens.every((t) => t === 'garden' || t === 'house' || t === 'home')
  return gardener && /house|garden/i.test(wt) && only
}

function excluded(n: Node): boolean {
  if ((n.s.payroll_rule || '') === 'fixed_weekly') return true
  if (/music\s*bus/i.test(n.s.work_type || '')) return true
  if (isHomeGarden(n)) return true
  return false
}

function sameFamily(a: Node, b: Node): boolean {
  for (const x of a.venueTokens) for (const y of b.venueTokens) if (tokensMatch(x, y)) return true
  return false
}

// Union-find over shifts of one date → venue families.
function families(nodes: Node[]): Node[][] {
  const parent = nodes.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) if (nodes[i].venueTokens.length && nodes[j].venueTokens.length && sameFamily(nodes[i], nodes[j])) parent[find(i)] = find(j)
  const groups: Record<number, Node[]> = {}
  nodes.forEach((n, i) => { if (!n.venueTokens.length) return; const r = find(i); (groups[r] ||= []).push(n) })
  return Object.values(groups)
}

type Interval = { staffId: number; name: string; start: number; end: number; hours: number; shifts: CrewShift[] }

// One person's shifts at a venue family on a date → merged intervals (gaps ≤ 60 min joined).
function personIntervals(nodes: Node[]): Interval[] {
  const byStaff: Record<number, Node[]> = {}
  for (const n of nodes) (byStaff[n.s.staff_id] ||= []).push(n)
  const out: Interval[] = []
  for (const list of Object.values(byStaff)) {
    list.sort((a, b) => a.startMin - b.startMin)
    let cur: Interval | null = null
    for (const n of list) {
      if (cur && n.startMin <= cur.end + 60) { cur.end = Math.max(cur.end, n.endMin); cur.hours += n.s.effective_hours; cur.shifts.push(n.s) }
      else { if (cur) out.push(cur); cur = { staffId: n.s.staff_id, name: n.s.display_name, start: n.startMin, end: n.endMin, hours: n.s.effective_hours, shifts: [n.s] } }
    }
    if (cur) out.push(cur)
  }
  return out
}

function overlapMin(a: Interval, b: Interval): number { return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start)) }
function peersOf(me: Interval, all: Interval[]): Interval[] {
  return all.filter((o) => o.staffId !== me.staffId && overlapMin(me, o) >= 0.5 * Math.max(me.end - me.start, o.end - o.start))
}

function hm(min: number): string { const m = ((min % (24 * 60)) + 24 * 60) % (24 * 60); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0') }
function windowText(iv: Interval): string {
  return iv.shifts.map((s) => s.start_time.slice(0, 5) + '–' + s.end_time.slice(0, 5)).join(', ')
}
function h2(n: number): string { return Number(n).toFixed(2) + ' h' }
function longDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z'); if (isNaN(d.getTime())) return iso
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()] + ' ' + d.getUTCFullYear()
}
function fnv(s: string): string { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return h.toString(16).padStart(8, '0') }
function q(n: number): number { return Math.round(n * 4) / 4 }

// Majority: the hours figure claimed by the MOST people (exact, to the quarter hour);
// ties broken by how many are within TOL of it. Valid only when at least 2 people claim
// it and it clearly beats the next-best figure that is more than TOL away.
function majority(values: number[]): { m: number; support: number; valid: boolean } {
  const distinct = Array.from(new Set(values.map(q))).sort((a, b) => a - b)
  const cands = distinct.map((v) => ({ m: v, exact: values.filter((x) => q(x) === v).length, support: values.filter((x) => Math.abs(x - v) <= TOL).length }))
  cands.sort((a, b) => b.exact - a.exact || b.support - a.support || a.m - b.m)
  const best = cands[0] || { m: 0, exact: 0, support: 0 }
  const runner = cands.find((c) => Math.abs(c.m - best.m) > TOL)
  const valid = best.exact >= 2 && (!runner || best.exact > runner.exact || (best.exact === runner.exact && best.support > runner.support))
  return { m: best.m, support: best.support, valid }
}

function venueLabelFor(nodes: Node[]): string {
  const count: Record<string, number> = {}
  for (const n of nodes) { const k = (n.s.outlet_venue || n.s.event_name || '').trim(); if (k) count[k] = (count[k] || 0) + 1 }
  const best = Object.entries(count).sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0]
  return best ? best[0] : 'same venue'
}

function subjectFor(iv: Interval): CrewShift | null {
  const own = iv.shifts.filter((s) => s.in_scope)
  if (!own.length) return null
  return own.sort((a, b) => toMin(b.start_time) - toMin(a.start_time) || b.id - a.id)[0]
}
function shiftMin(s: CrewShift): [number, number] { const st = toMin(s.start_time); let en = toMin(s.end_time); if (en <= st) en += 24 * 60; return [st, en] }
// Over-claim spread over several shifts: which of this person's shifts carry the excess?
// Take it off the shifts that look LEAST like the crew's common window first (least overlap;
// then the one added last), so a duplicate or an extra evening entry is the one flagged and
// the ordinary crew shift is left alone. Only shifts in THIS payroll are flagged; if the
// excess sits entirely on a shift paid in another payroll, that payroll's view shows it.
function overSubjects(me: Interval, atCrew: Interval[], crewHours: number): Array<{ shift: CrewShift; rec: number }> {
  if (me.shifts.length === 1) return me.shifts[0].in_scope ? [{ shift: me.shifts[0], rec: crewHours }] : []
  const cs = Math.max(...atCrew.map((p) => p.start)), ce = Math.min(...atCrew.map((p) => p.end))
  const ratio = (s: CrewShift) => { const [a, b] = shiftMin(s); return b > a ? Math.max(0, Math.min(b, ce) - Math.max(a, cs)) / (b - a) : 0 }
  const order = me.shifts.slice().sort((a, b) => ratio(a) - ratio(b) || b.id - a.id)
  let excess = me.hours - crewHours
  const out: Array<{ shift: CrewShift; rec: number }> = []
  for (const s of order) {
    if (excess <= TOL) break
    const take = Math.min(excess, s.effective_hours)
    if (s.in_scope) out.push({ shift: s, rec: Math.max(0, q(s.effective_hours - take)) })
    excess -= take
  }
  return out
}

function nameList(list: Interval[]): string { return list.map((p) => p.name).join(', ') }
function detailList(list: Interval[]): string { return list.map((p) => `${p.name} ${h2(p.hours)} (${windowText(p)})`).join('; ') }

// ------------------------------------------------------------- the check ----
export function computeCrewFlags(shifts: CrewShift[]): CrewFlag[] {
  const flags: CrewFlag[] = []
  const byDate: Record<string, Node[]> = {}
  for (const s of shifts) { const n = buildNode(s); if (excluded(n)) continue; (byDate[s.work_date] ||= []).push(n) }

  for (const [date, nodes] of Object.entries(byDate)) {
    const fams = families(nodes)
    const famIntervals = fams.map((f) => ({ label: venueLabelFor(f), nodes: f, intervals: personIntervals(f), locs: new Set(f.flatMap((n) => n.locTokens)) }))

    for (const fam of famIntervals) {
      for (const me of fam.intervals) {
        const subject = subjectFor(me)
        if (!subject) continue
        const peers = peersOf(me, fam.intervals)
        if (!peers.length) continue
        const values = [me.hours, ...peers.map((p) => p.hours)]
        const maj = majority(values)
        const where = `${fam.label} — ${longDate(date)}`
        const base = { subjectShiftId: subject.id, staffId: me.staffId, staffName: me.name, workDate: date, venueLabel: fam.label, personHours: me.hours, members: [me, ...peers].map((p) => ({ name: p.name, hours: p.hours, windows: windowText(p) })) }
        const others = (pred: (p: Interval) => boolean) => peers.filter(pred)
        if (maj.valid) {
          const atCrew = others((p) => Math.abs(p.hours - maj.m) <= TOL)
          const rest = others((p) => Math.abs(p.hours - maj.m) > TOL)
          if (me.hours > maj.m + TOL) {
            for (const { shift: subj, rec } of overSubjects(me, atCrew, maj.m)) {
              const multi = me.shifts.length > 1 ? ` This person's ${h2(me.hours)} is spread over ${me.shifts.length} shifts (${windowText(me)}); this shift (${subj.start_time.slice(0, 5)}–${subj.end_time.slice(0, 5)}, ${h2(subj.effective_hours)}) is the part outside the crew's hours — approving ${h2(rec)} here brings the day to the crew's ${h2(maj.m)}.` : ''
              const reason = `CREW CHECK – ${where}: ${me.name} claimed ${h2(me.hours)} (${windowText(me)}). ${atCrew.length} other${atCrew.length === 1 ? '' : 's'} at the same venue claimed ${h2(maj.m)}: ${detailList(atCrew)}.${rest.length ? ' Also there: ' + detailList(rest) + '.' : ''} System recommended ${h2(maj.m)} for the day (the hours most of the crew claimed).${multi} Bernie to check and approve.`
              flags.push({ ...base, subjectShiftId: subj.id, kind: 'over', crewHours: maj.m, recommendedForSubject: rec, humanReason: reason, shortReason: `Crew check: ${atCrew.length} other${atCrew.length === 1 ? '' : 's'} at ${fam.label} claimed ${h2(maj.m)} (${nameList(atCrew)})`, summary: `Crew check — ${me.name} — ${date} — ${fam.label} — ${h2(me.hours)} vs crew ${h2(maj.m)}`, comparedShiftId: atCrew[0]?.shifts[0]?.id ?? null, factsHash: '' })
            }
          } else if (me.hours < maj.m - TOL) {
            const inside = atCrew.some((p) => p.start <= me.start && p.end >= me.end && (p.end - p.start) > (me.end - me.start))
            if (!inside) continue // different session (e.g. evening-only vs morning+evening) – not an under-claim
            const reason = `CREW CHECK – POSSIBLE UNDER-CLAIM – ${where}: ${me.name} claimed ${h2(me.hours)} (${windowText(me)}), which is less than the crew. ${atCrew.length} other${atCrew.length === 1 ? '' : 's'} at the same venue claimed ${h2(maj.m)}: ${detailList(atCrew)}.${rest.length ? ' Also there: ' + detailList(rest) + '.' : ''} Check whether hours were left out. Pay as claimed unless Bernie decides otherwise.`
            flags.push({ ...base, kind: 'under', crewHours: maj.m, recommendedForSubject: subject.hours_worked, humanReason: reason, shortReason: `Crew check: possible under-claim — ${atCrew.length} other${atCrew.length === 1 ? '' : 's'} claimed ${h2(maj.m)} (${nameList(atCrew)})`, summary: `Crew check (under-claim?) — ${me.name} — ${date} — ${fam.label} — ${h2(me.hours)} vs crew ${h2(maj.m)}`, comparedShiftId: atCrew[0]?.shifts[0]?.id ?? null, factsHash: '' })
          }
        } else {
          const spread = Math.max(...values) - Math.min(...values)
          if (spread <= TOL) continue
          const group = [me, ...peers]
          const top = group.slice().sort((a, b) => b.hours - a.hours)[0]
          const reason = `CREW CHECK – NO MAJORITY – ${where}: crew of ${group.length}, hours differ. ${detailList(group)}. Most hours: ${top.name} ${h2(top.hours)}. ${me.name} claimed ${h2(me.hours)} (${windowText(me)}). No decision is suggested — Bernie to check the system and approve the hours.`
          flags.push({ ...base, kind: 'no_majority', crewHours: null, recommendedForSubject: subject.hours_worked, humanReason: reason, shortReason: `Crew check: crew of ${group.length} at ${fam.label}, hours differ (${group.map((p) => p.name.split(' ')[0] + ' ' + Number(p.hours).toFixed(2)).join(', ')})`, summary: `Crew check (hours differ) — ${me.name} — ${date} — ${fam.label} — ${h2(me.hours)}; most: ${top.name} ${h2(top.hours)}`, comparedShiftId: top.staffId !== me.staffId ? top.shifts[0].id : (peers[0]?.shifts[0]?.id ?? null), factsHash: '' })
        }
      }
    }

    // Venue not clear (only a place name typed): "possible same venue".
    const vague = nodes.filter((n) => !n.venueTokens.length && n.locTokens.length)
    for (const me0 of personIntervals(vague)) {
      const subject = subjectFor(me0)
      if (!subject) continue
      const myLocs = new Set(vague.filter((n) => n.s.staff_id === me0.staffId).flatMap((n) => n.locTokens))
      const cands = famIntervals.filter((f) => Array.from(myLocs).some((l) => f.locs.has(l))).map((f) => ({ f, peers: peersOf(me0, f.intervals) })).filter((c) => c.peers.length)
      if (!cands.length) continue
      const matchesSome = cands.some((c) => { const m = majority(c.peers.map((p) => p.hours)); return Math.abs(me0.hours - (m.valid ? m.m : c.peers[0].hours)) <= TOL })
      if (matchesSome) continue
      const locLabel = Array.from(myLocs).join(', ')
      const crews = cands.map((c) => `${c.f.label}: ${detailList(c.peers)}`).join(' | ')
      const reason = `CREW CHECK – POSSIBLE SAME VENUE – ${longDate(date)}: ${me0.name} typed only "${subject.outlet_venue || subject.area}" so the venue is not clear (matched on area "${locLabel}"). ${me0.name} claimed ${h2(me0.hours)} (${windowText(me0)}). Crews in that area at the same time: ${crews}. Hours differ — Bernie to check which venue this was and approve the hours.`
      flags.push({ kind: 'possible_venue', subjectShiftId: subject.id, staffId: me0.staffId, staffName: me0.name, workDate: date, venueLabel: subject.outlet_venue || locLabel, personHours: me0.hours, crewHours: null, recommendedForSubject: subject.hours_worked, humanReason: reason, shortReason: `Crew check: venue not clear ("${subject.outlet_venue}") — crews nearby claimed different hours`, summary: `Crew check (venue not clear) — ${me0.name} — ${date} — "${subject.outlet_venue}" — ${h2(me0.hours)}`, members: [me0, ...cands.flatMap((c) => c.peers)].map((p) => ({ name: p.name, hours: p.hours, windows: windowText(p) })), comparedShiftId: cands[0].peers[0].shifts[0].id, factsHash: '' })
    }
  }
  for (const f of flags) f.factsHash = fnv(JSON.stringify([f.kind, f.subjectShiftId, q(f.personHours), f.crewHours, f.recommendedForSubject, f.members.map((m) => [m.name, q(m.hours), m.windows]).sort()]))
  // One flag per subject shift (keep the first — 'over' beats others by construction order).
  const seen = new Set<number>()
  return flags.filter((f) => { if (seen.has(f.subjectShiftId)) return false; seen.add(f.subjectShiftId); return true })
}

// ------------------------------------------------------------ persistence ---
export async function loadCrewShifts(db: Db, weekStart: string, weekEnd: string): Promise<CrewShift[]> {
  // Every paid row that belongs to this payroll (in-week, or a missed shift paid in this payroll) …
  const scopeRes = await db.prepare(`SELECT id, work_date FROM wage_shifts
      WHERE (work_date BETWEEN ? AND ? AND (payroll_week_start IS NULL OR payroll_week_start = ?)) OR (payroll_week_start = ? AND work_date < ?)`).bind(weekStart, weekEnd, weekStart, weekStart, weekStart).all()
  const scope = (scopeRes.results || []) as Array<{ id: number; work_date: string }>
  if (!scope.length) return []
  const scopeIds = new Set(scope.map((r) => r.id))
  const dates = Array.from(new Set(scope.map((r) => r.work_date)))
  // … compared against EVERYONE paid on those dates (including earlier payrolls, so a missed shift is checked against the crew paid last week).
  const rowsRes = await db.prepare(`SELECT w.id, w.staff_id, s.display_name, s.payroll_rule, w.work_date, w.start_time, w.end_time, w.hours_worked, w.work_type,
        COALESCE(w.outlet_venue,'') outlet_venue, COALESCE(w.area,'') area, COALESCE(w.event_name,'') event_name, COALESCE(w.work_description,'') work_description, w.payroll_week_start
      FROM wage_shifts w JOIN wage_staff s ON s.id = w.staff_id WHERE w.work_date IN (${dates.map(() => '?').join(',')})`).bind(...dates).all()
  const rows = (rowsRes.results || []) as any[]
  const ids = rows.map((r) => Number(r.id))
  // Effective hours = latest RESOLVED review with approved hours (not rate-choice), else claimed.
  const approved: Record<number, number> = {}
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90)
    const rv = await db.prepare(`SELECT subject_shift_id, approved_payable_hours, id FROM wage_payroll_reviews WHERE subject_source = 'shift' AND status = 'RESOLVED' AND approved_payable_hours IS NOT NULL AND issue_key NOT LIKE 'rate_choice_%' AND subject_shift_id IN (${chunk.map(() => '?').join(',')}) ORDER BY id`).bind(...chunk).all()
    for (const v of (rv.results || []) as any[]) approved[Number(v.subject_shift_id)] = Number(v.approved_payable_hours)
  }
  return rows.map((r) => ({
    id: Number(r.id), staff_id: Number(r.staff_id), display_name: String(r.display_name || ''), payroll_rule: String(r.payroll_rule || ''), work_date: String(r.work_date),
    start_time: String(r.start_time || ''), end_time: String(r.end_time || ''), hours_worked: Number(r.hours_worked || 0), work_type: String(r.work_type || ''),
    outlet_venue: String(r.outlet_venue || ''), area: String(r.area || ''), event_name: String(r.event_name || ''), work_description: String(r.work_description || ''),
    payroll_week_start: r.payroll_week_start ? String(r.payroll_week_start) : null, in_scope: scopeIds.has(Number(r.id)),
    effective_hours: approved[Number(r.id)] !== undefined ? approved[Number(r.id)] : Number(r.hours_worked || 0),
  }))
}

export async function runCrewHoursCheck(db: Db, weekStart: string, weekEnd: string, opts: { dryRun?: boolean } = {}): Promise<{ flags: CrewFlag[]; inserted: number; updated: number; voided: number; scope: number }> {
  const shifts = await loadCrewShifts(db, weekStart, weekEnd)
  const flags = computeCrewFlags(shifts)
  let inserted = 0, updated = 0, voided = 0
  if (opts.dryRun) return { flags, inserted, updated, voided, scope: shifts.filter((s) => s.in_scope).length }

  const scopeIds = shifts.filter((s) => s.in_scope).map((s) => s.id)
  const existing: Record<string, { id: number; status: string; facts_hash: string }> = {}
  for (let i = 0; i < scopeIds.length; i += 90) {
    const chunk = scopeIds.slice(i, i + 90)
    const ex = await db.prepare(`SELECT id, issue_key, status, facts_hash FROM wage_payroll_reviews WHERE issue_key LIKE '${CREW_KEY_PREFIX}%' AND subject_shift_id IN (${chunk.map(() => '?').join(',')})`).bind(...chunk).all()
    for (const e of (ex.results || []) as any[]) existing[String(e.issue_key)] = { id: Number(e.id), status: String(e.status), facts_hash: String(e.facts_hash || '') }
  }
  const liveKeys = new Set<string>()
  for (const f of flags) {
    const key = CREW_KEY_PREFIX + f.subjectShiftId
    liveKeys.add(key)
    const title = f.kind === 'over' ? 'Crew check: more hours than the crew' : f.kind === 'under' ? 'Crew check: possible under-claim' : f.kind === 'no_majority' ? 'Crew check: crew hours differ' : 'Crew check: venue not clear'
    const system = JSON.stringify({ comparisonLabel: 'crew check', warningTitle: title, humanReason: f.humanReason, recommendedReason: f.shortReason, crewCheck: CREW_CHECK_VERSION, kind: f.kind, venueLabel: f.venueLabel, crewHours: f.crewHours, personHours: f.personHours, subjectName: f.staffName, members: f.members, staffBlocking: 0, autoDuplicate: 0, conflictDetected: 0 })
    const subjSnap = JSON.stringify({ shiftId: f.subjectShiftId, source: 'shift', staffId: f.staffId, employee: f.staffName, workDate: f.workDate, venue: f.venueLabel, hours: f.personHours })
    const ex = existing[key]
    if (!ex) {
      await db.prepare(`INSERT INTO wage_payroll_reviews (issue_key, status, warning_kind, severity, staff_id, staff_name, work_date, payroll_week_start, subject_source, subject_shift_id, compared_source, compared_shift_id, warning_reason, issue_summary, original_hours, system_proposed_payable_hours, facts_hash, subject_snapshot_json, system_snapshot_json)
          SELECT ?, 'OPEN', 'possible_duplicate_manual_check', 'orange', ?, ?, ?, (SELECT payroll_week_start FROM wage_shifts WHERE id = ?), 'shift', ?, 'shift', ?, ?, ?, (SELECT hours_worked FROM wage_shifts WHERE id = ?), ?, ?, ?, ?
          WHERE NOT EXISTS (SELECT 1 FROM wage_payroll_reviews WHERE issue_key = ?)`)
        .bind(key, f.staffId, f.staffName, f.workDate, f.subjectShiftId, f.subjectShiftId, f.comparedShiftId, f.humanReason, f.summary, f.subjectShiftId, f.recommendedForSubject, f.factsHash, subjSnap, system, key).run()
      inserted++
    } else if (ex.status === 'OPEN' && ex.facts_hash !== f.factsHash) {
      await db.prepare(`UPDATE wage_payroll_reviews SET warning_reason = ?, issue_summary = ?, system_proposed_payable_hours = ?, compared_shift_id = ?, facts_hash = ?, system_snapshot_json = ?, last_detected_at = CURRENT_TIMESTAMP, detected_count = detected_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'OPEN'`)
        .bind(f.humanReason, f.summary, f.recommendedForSubject, f.comparedShiftId, f.factsHash, system, ex.id).run()
      updated++
    }
  }
  // Flags that no longer apply (hours were corrected / crew changed) — only OUR open ones.
  for (const [key, ex] of Object.entries(existing)) {
    if (ex.status !== 'OPEN' || liveKeys.has(key)) continue
    await db.prepare(`UPDATE wage_payroll_reviews SET status = 'VOID', void_reason = 'Auto: crew check re-run — hours are now in line with the crew at this venue', voided_by_name = 'system crew check', voided_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'OPEN'`).bind(ex.id).run()
    voided++
  }
  return { flags, inserted, updated, voided, scope: scopeIds.length }
}
