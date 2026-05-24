// Deep pattern analysis of the Staff Schedule .xlsx file.
// Goal: extract enough structure to build a sensible calendar UI.

const XLSX = require('xlsx')
const path = process.argv[2]
const wb = XLSX.readFile(path)
const sh = wb.Sheets['Current']
const data = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '' })

// Tokens that signal lifecycle stages, observed in v3 column A entries
const STAGES = [
  { key: 'booking', match: /^confirm|^enquiry|booking|got po|got brief|brief|enquiry/i },
  { key: 'load',    match: /^load|loading|preload|pre-load|pre load/i },
  { key: 'leave',   match: /^leave|^depart|travel|leaving|travelling/i },
  { key: 'setup',   match: /^set up|^setup|^set-up|on site|site visit/i },
  { key: 'event',   match: /^event|^run|^activation/i },
  { key: 'strike',  match: /^strike|pull down|^pulldown|^pack down/i },
  { key: 'collect', match: /^collect|^collection|^return|coming back/i },
]

// Walk through and identify day-header rows: row where col A is a weekday name
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']

const days = []   // [{ date, dayName, items: [] }]
let current = null
let stageCounts = {}
let brandHits = {}
let regionHits = {}
let crewHits = {}
let vehicleHits = {}

for (let i = 0; i < Math.min(data.length, 600); i++) {
  const row = data[i]
  if (!Array.isArray(row)) continue
  const colA = String(row[0] || '').trim()
  const colB = String(row[1] || '').trim()
  const colC = String(row[2] || '').trim()

  // Day header? Col A is a weekday, Col B is a date
  if (DAYS.includes(colA) && colB && colB.match(/\d{2}\s\w+\s\d{4}/)) {
    if (current) days.push(current)
    current = { date: colB, dayName: colA, items: [] }
    continue
  }
  if (!current) continue
  if (!colA && !colB) continue

  // Try to extract a stage tag from the FIRST line of colA
  const firstLine = colA.split(/\r?\n/)[0].toLowerCase()
  let stage = 'unknown'
  for (const s of STAGES) {
    if (s.match.test(firstLine)) { stage = s.key; break }
  }
  stageCounts[stage] = (stageCounts[stage] || 0) + 1

  // Patterns observed: brand keywords
  const fullText = (colA + ' ' + colB + ' ' + colC).toLowerCase()
  for (const b of ['castle lite','castle','heineken','windhoek','flying fish','mxd','sab','budweiser','corona','lekompo','redbull','red bull','stripped horse']) {
    if (fullText.includes(b)) brandHits[b] = (brandHits[b] || 0) + 1
  }
  for (const r of ['polokwane','gauteng','cape town','durban','soweto','sandton','pretoria','midrand','bloemfontein','kimberley','george','port elizabeth','tzaneen','rustenburg','bethlehem','vosloorus']) {
    if (fullText.includes(r)) regionHits[r] = (regionHits[r] || 0) + 1
  }
  // Crew + vehicle often appear in column C / D / E
  for (let c = 0; c < Math.min(row.length, 10); c++) {
    const cell = String(row[c] || '').toLowerCase()
    for (const name of ['sipho','bheki','daniel','joshua','bibi','tandi','solly','isaak','dean','patrick','petrus']) {
      if (cell.includes(name)) crewHits[name] = (crewHits[name] || 0) + 1
    }
    for (const v of ['isuzu','snowy','hyundai','hino','tata','dyna','atego','faw','peugeot','h100','quantum','carra']) {
      if (cell.includes(v)) vehicleHits[v] = (vehicleHits[v] || 0) + 1
    }
  }

  current.items.push({
    stage,
    summary: colA.split(/\r?\n/).slice(0, 3).join(' / ').slice(0, 200),
    equipment: colB.split(/\r?\n/).slice(0, 3).join(' / ').slice(0, 200),
    venueOrNotes: colC.slice(0, 200)
  })
}
if (current) days.push(current)

console.log(`=== Analysed ${days.length} day blocks ===\n`)
console.log(`Stage-tag distribution:`)
console.table(stageCounts)

console.log(`\nBrand mentions:`)
console.table(brandHits)

console.log(`\nRegion mentions:`)
console.table(regionHits)

console.log(`\nCrew mentions:`)
console.table(crewHits)

console.log(`\nVehicle mentions:`)
console.table(vehicleHits)

console.log(`\n=== First 5 days (sample) ===`)
for (const d of days.slice(0, 5)) {
  console.log(`\n── ${d.dayName}, ${d.date} (${d.items.length} entries)`)
  for (const it of d.items) {
    console.log(`   [${it.stage.padEnd(8)}] ${it.summary}`)
    if (it.equipment) console.log(`              eq: ${it.equipment.slice(0, 80)}${it.equipment.length>80?'...':''}`)
  }
}
