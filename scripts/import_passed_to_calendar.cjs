// Import the "Passed" sheet from "1 september Staff Weekly schedule 2025 13 January.xlsx"
// into a SQL file that we can apply against D1.
//
// Hybrid (C) matching strategy:
//   - calendar_events.team_text / vehicle_text keep the raw string (always)
//   - When a confident token-match against field_people / fleet is found,
//     ALSO insert into calendar_event_crew / calendar_event_vehicles join tables.
//
// Output: migrations/0017_seed_calendar_events.sql  (idempotent enough for one-shot use)

const XLSX = require('xlsx')
const fs = require('fs')
const path = require('path')

const XLSX_PATH = '/home/user/uploaded_files/1 september Staff Weekly schedule 2025 13 January.xlsx'
const OUT_PATH = path.join(__dirname, '../migrations/0017_seed_calendar_events.sql')

// ─── matcher dictionaries ──────────────────────────────────────────────────
// field_people: id → name  (verified from D1, May 2026)
const PEOPLE = [
  { id: 1,  name: 'shane',     aliases: ['shane'] },
  { id: 2,  name: 'bibi',      aliases: ['bibi','b/b'] },
  { id: 3,  name: 'patrick',   aliases: ['patrick','patrik'] },
  { id: 4,  name: 'thandi',    aliases: ['thandi','tandi','tandanani','thandanani','tandananani','tepo'] },
  { id: 5,  name: 'tina',      aliases: ['tina'] },
  { id: 6,  name: 'erance',    aliases: ['erance','erence','erance'] },
  { id: 7,  name: 'isaac',     aliases: ['isaac','isaak','izak'] },
  { id: 8,  name: 'eric',      aliases: ['eric','erik'] },
  { id: 9,  name: 'solly',     aliases: ['solly','sollie'] },
  { id: 10, name: 'sipho',     aliases: ['sipho','sphio'] },
  { id: 11, name: 'jay',       aliases: ['jay'] },
  { id: 13, name: 'tucker',    aliases: ['tucker','takka'] },
  { id: 14, name: 'daniel',    aliases: ['daniel','dan'] },
  { id: 15, name: 'joshua',    aliases: ['joshua','josh'] },
  { id: 16, name: 'bernie',    aliases: ['bernie','berny'] },
  { id: 17, name: 'marna',     aliases: ['marna'] },
  { id: 18, name: 'jocelyn',   aliases: ['jocelyn'] },
]

// fleet: id → reg+description (verified from D1, May 2026)
// Only confident, unambiguous tokens — "isuzu" alone is ambiguous (3 matches) so we skip
const VEHICLES = [
  { id: 5,  name: 'snowy',    aliases: ['snowy','hino','cz41ww'] },
  { id: 14, name: 'bibi car', aliases: ['bibi car','peugeot'] },          // best-guess; legacy
  { id: 15, name: 'sipho car',aliases: ['sipho car','lz56ss'] },
  { id: 3,  name: 'faw no 5', aliases: ['faw 5','faw no 5','mb39cr','small faw'] },
  { id: 4,  name: 'faw no 4', aliases: ['faw 4','faw no 4','ls43nl','big faw'] },
  { id: 7,  name: 'castle truck', aliases: ['castle lager','castle lite truck','castle truck','man truck','fc89pn'] },
  { id: 6,  name: 'black truck', aliases: ['hyundai black','hyundai','bw63nn'] },
]

const BRANDS_RE = [
  ['Castle Lite','castle lite'],
  ['Castle','castle'],
  ['Stella',  'stella'],
  ['Heineken','heineken'],
  ['Windhoek','windhoek'],
  ['Flying Fish','flying fish'],
  ['MXD',     'mxd'],
  ['Budweiser','budweiser'],
  ['Corona',  'corona'],
  ['SAB',     'sab'],
  ['Distell', 'distell'],
  ['Stripped Horse','stripped horse'],
  ['Redbull', 'red ?bull'],
  ['Lekompo', 'lekompo'],
  ['Calabash','calabash'],
  ['Sunbet',  'sunbet'],
  ['Tyla',    'tyla'],
]

const REGIONS_RE = [
  ['Gauteng',        'sandton|johannesburg|jhb|joburg|pretoria|midrand|soweto|alexandra|tembisa|kempton'],
  ['Polokwane',      'polokwane'],
  ['Cape Town',      'cape town|cape\\s+town|cpt|stellenbosch|paarl|woodstock'],
  ['Durban',         'durban|dbn|umhlanga|ballito'],
  ['Bloemfontein',   'bloemfontein|bloem'],
  ['Kimberley',      'kimberley'],
  ['Port Elizabeth', 'port elizabeth|pe\\b|gqeberha'],
  ['Bethlehem',      'bethlehem'],
  ['George',         'george'],
  ['Rustenburg',     'rustenburg'],
  ['Tzaneen',        'tzaneen'],
  ['East London',    'east london'],
]

const SUBSTAGE_RE = [
  ['collect', /\b(collect|collection|return|pickup|pick up|pulled?\s+down)\b/i],
  ['load',    /\b(loading?|preload|pre[- ]load|offload|off[- ]load)\b/i],
  ['leave',   /\b(leave|departing|depart|travel(ling)?|leaving|leaves)\b/i],
  ['setup',   /\b(set[- ]?up|on site|site visit)\b/i],
  ['strike',  /\b(strike|pull[- ]?down|pack[- ]?down|pack down|^pull\b)/i],
  ['event',   /\b(event|activation|run|launch)\b/i],
]

// ─── helpers ──────────────────────────────────────────────────────────────
function sqlEscape(s) {
  if (s === null || s === undefined) return 'NULL'
  return "'" + String(s).replace(/'/g, "''") + "'"
}

function excelDateToISO(n) {
  if (n instanceof Date) return n.toISOString().slice(0,10)
  if (typeof n === 'number') {
    const ms = (n - 25569) * 86400 * 1000
    const d = new Date(ms)
    if (isNaN(d)) return null
    return d.toISOString().slice(0,10)
  }
  if (typeof n === 'string') {
    // dd.mm.yy or dd.mm.yyyy or dd/mm/yy or dd-mm-yyyy
    const m = n.match(/^(\d{1,2})[\.\-\/](\d{1,2})[\.\-\/](\d{2,4})/)
    if (m) {
      let y = m[3]
      if (y.length === 2) y = (parseInt(y) > 50 ? '19' : '20') + y
      const mo = m[2].padStart(2,'0')
      const da = m[1].padStart(2,'0')
      return `${y}-${mo}-${da}`
    }
  }
  return null
}

function detectBrand(text) {
  const t = text.toLowerCase()
  for (const [name, re] of BRANDS_RE) {
    if (new RegExp(re, 'i').test(t)) return name
  }
  return null
}

function detectRegion(text) {
  const t = text.toLowerCase()
  for (const [name, re] of REGIONS_RE) {
    if (new RegExp(re, 'i').test(t)) return name
  }
  return null
}

function detectSubstage(text) {
  for (const [name, re] of SUBSTAGE_RE) {
    if (re.test(text)) return name
  }
  return null
}

function matchPeople(teamStr) {
  if (!teamStr) return []
  const t = teamStr.toLowerCase()
  const found = new Map()  // person_id → matched_alias
  for (const p of PEOPLE) {
    for (const a of p.aliases) {
      // word-boundary match
      const re = new RegExp('\\b' + a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i')
      if (re.test(t)) {
        if (!found.has(p.id)) found.set(p.id, a)
        break
      }
    }
  }
  return Array.from(found.entries()).map(([id, alias]) => ({ person_id: id, matched_from: alias }))
}

function matchVehicles(vehStr) {
  if (!vehStr) return []
  const t = vehStr.toLowerCase()
  const found = new Map()
  for (const v of VEHICLES) {
    for (const a of v.aliases) {
      const re = new RegExp('\\b' + a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i')
      if (re.test(t)) {
        if (!found.has(v.id)) found.set(v.id, a)
        break
      }
    }
  }
  return Array.from(found.entries()).map(([id, alias]) => ({ fleet_id: id, matched_from: alias }))
}

// ─── main ─────────────────────────────────────────────────────────────────
console.log(`Reading ${XLSX_PATH}`)
const wb = XLSX.readFile(XLSX_PATH, { cellDates: true })
const passed = XLSX.utils.sheet_to_json(wb.Sheets['Passed'], { header: 1, defval: '', raw: true })
console.log(`Passed sheet: ${passed.length} rows`)

const inserts = []           // SQL INSERT lines (events)
const crewInserts = []       // SQL INSERT lines for crew join (uses last_insert_rowid via batching by row idx)
const vehInserts = []
const stats = {
  total: 0, kept: 0, skipNoDate: 0, skipNoEvent: 0,
  withCrew: 0, withVehicle: 0, withBrand: 0, withRegion: 0, withSubstage: 0,
  crewLinks: 0, vehLinks: 0
}

const rows = []   // we accumulate row data first, then emit SQL

for (let i = 1; i < passed.length; i++) {
  stats.total++
  const r = passed[i]
  const rawDate = r[1]
  const eventName = String(r[2] || '').trim()
  const address = String(r[3] || '').trim()
  const timeText = String(r[4] || '').trim()
  const teamText = String(r[5] || '').trim()
  const vehText = String(r[6] || '').trim()
  
  if (!eventName) { stats.skipNoEvent++; continue }
  const isoDate = excelDateToISO(rawDate)
  if (!isoDate) { stats.skipNoDate++; continue }
  
  const combined = `${eventName} ${address} ${timeText} ${teamText}`
  const brand = detectBrand(combined)
  const region = detectRegion(combined)
  const substage = detectSubstage(combined)
  
  const crew = matchPeople(teamText)
  const veh = matchVehicles(vehText)
  
  if (teamText) stats.withCrew++
  if (vehText) stats.withVehicle++
  if (brand) stats.withBrand++
  if (region) stats.withRegion++
  if (substage) stats.withSubstage++
  
  rows.push({
    sourceRef: `passed-row-${i}`,
    isoDate, eventName, address, timeText, teamText, vehText,
    brand, region, substage,
    crew, veh
  })
  stats.kept++
}

console.log(`\n=== Import stats ===`)
console.log(`Total rows:        ${stats.total}`)
console.log(`Kept (date+event): ${stats.kept}`)
console.log(`Skipped (no date): ${stats.skipNoDate}`)
console.log(`Skipped (no name): ${stats.skipNoEvent}`)
console.log(`With team string:  ${stats.withCrew}`)
console.log(`With vehicle str:  ${stats.withVehicle}`)
console.log(`With brand:        ${stats.withBrand}`)
console.log(`With region:       ${stats.withRegion}`)
console.log(`With substage:     ${stats.withSubstage}`)

// Calculate link rates
let totalCrewLinks = 0
let totalVehLinks = 0
let rowsWithLinkedCrew = 0
let rowsWithLinkedVeh = 0
for (const row of rows) {
  totalCrewLinks += row.crew.length
  totalVehLinks += row.veh.length
  if (row.crew.length) rowsWithLinkedCrew++
  if (row.veh.length) rowsWithLinkedVeh++
}
console.log(`\nMatched crew links:    ${totalCrewLinks} (rows w/ ≥1 match: ${rowsWithLinkedCrew} / ${stats.withCrew} = ${Math.round(rowsWithLinkedCrew/stats.withCrew*100)}%)`)
console.log(`Matched vehicle links: ${totalVehLinks} (rows w/ ≥1 match: ${rowsWithLinkedVeh} / ${stats.withVehicle} = ${Math.round(rowsWithLinkedVeh/stats.withVehicle*100)}%)`)

// ─── emit SQL ────────────────────────────────────────────────────────────
// We can't easily use last_insert_rowid() in a single batch in D1 batching,
// so we'll use INSERT ... RETURNING via per-row execution at runtime.
// For now, emit one INSERT per row with a deterministic source_ref, then a
// follow-up step links crew/vehicles using a subselect on source_ref.

const lines = []
lines.push('-- AUTO-GENERATED by scripts/import_passed_to_calendar.cjs')
lines.push('-- Seeds calendar_events with historical "Passed" sheet rows.')
lines.push('-- Idempotent via source_ref check.')
lines.push('')

for (const row of rows) {
  lines.push(
    `INSERT INTO calendar_events (event_date, event_name, address, time_text, team_text, vehicle_text, brand, region, substage, status, source, source_ref)
SELECT ${sqlEscape(row.isoDate)}, ${sqlEscape(row.eventName)}, ${sqlEscape(row.address||null)}, ${sqlEscape(row.timeText||null)}, ${sqlEscape(row.teamText||null)}, ${sqlEscape(row.vehText||null)}, ${sqlEscape(row.brand)}, ${sqlEscape(row.region)}, ${sqlEscape(row.substage)}, 'delivered', 'import_passed', ${sqlEscape(row.sourceRef)}
WHERE NOT EXISTS (SELECT 1 FROM calendar_events WHERE source_ref=${sqlEscape(row.sourceRef)});`
  )
}

lines.push('')
lines.push('-- crew & vehicle joins (resolved against source_ref)')
for (const row of rows) {
  for (const c of row.crew) {
    lines.push(
      `INSERT OR IGNORE INTO calendar_event_crew (event_id, person_id, matched_from)
SELECT id, ${c.person_id}, ${sqlEscape(c.matched_from)} FROM calendar_events WHERE source_ref=${sqlEscape(row.sourceRef)};`
    )
  }
  for (const v of row.veh) {
    lines.push(
      `INSERT OR IGNORE INTO calendar_event_vehicles (event_id, fleet_id, matched_from)
SELECT id, ${v.fleet_id}, ${sqlEscape(v.matched_from)} FROM calendar_events WHERE source_ref=${sqlEscape(row.sourceRef)};`
    )
  }
}

fs.writeFileSync(OUT_PATH, lines.join('\n'))
console.log(`\nWrote ${OUT_PATH} (${lines.length} statements)`)
console.log(`File size: ${(fs.statSync(OUT_PATH).size / 1024).toFixed(1)} KB`)
