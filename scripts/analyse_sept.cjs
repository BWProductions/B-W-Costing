const XLSX = require('xlsx')
const path = "/home/user/uploaded_files/1 september Staff Weekly schedule 2025 13 January.xlsx"
const wb = XLSX.readFile(path)

// "Current" sheet: weekday + date headers, then free-text entries per day
const cur = XLSX.utils.sheet_to_json(wb.Sheets['Current'], { header: 1, defval: '' })
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const DAYS_RE = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*$/i

const STAGES = [
  { key: 'collect', match: /\bcollect|collection|return|pickup|pick up\b/i },
  { key: 'load',    match: /\bload|loading|preload|pre[- ]load|offload|off-load\b/i },
  { key: 'leave',   match: /\bleave|depart|travel|leaving|travelling|leaves\b/i },
  { key: 'setup',   match: /\bset[- ]?up|on site|site visit\b/i },
  { key: 'strike',  match: /\bstrike|pull[- ]down|pack[- ]down|pack down\b/i },
  { key: 'event',   match: /\bevent|activation|run\b/i },
  { key: 'booking', match: /\bbook(ed|ing)?|confirm|enquiry|brief|po\b/i },
]

let days = []
let cur_day = null
let stageCounts = {}
let totalEntries = 0
let nonEmptyCells = 0
let dayHeaderRows = 0

for (let i = 0; i < cur.length; i++) {
  const row = cur[i]
  const a = String(row[0] || '').trim()
  const b = String(row[1] || '').trim()
  
  // Day header detection: col A is a weekday + col B looks like a date
  if (DAYS_RE.test(a) && b) {
    if (cur_day) days.push(cur_day)
    cur_day = { dayName: a, date: b, items: [] }
    dayHeaderRows++
    continue
  }
  if (!cur_day) continue
  if (!a && !b) continue
  
  nonEmptyCells++
  
  const combined = (a + ' ' + b).toLowerCase()
  let stage = 'unknown'
  for (const s of STAGES) {
    if (s.match.test(combined)) { stage = s.key; break }
  }
  stageCounts[stage] = (stageCounts[stage] || 0) + 1
  totalEntries++
  
  cur_day.items.push({
    stage,
    task: a.slice(0, 80),
    detail: b.slice(0, 80)
  })
}
if (cur_day) days.push(cur_day)

console.log(`=== "Current" sheet ===`)
console.log(`Day headers found: ${dayHeaderRows}`)
console.log(`Days with content: ${days.filter(d=>d.items.length).length}`)
console.log(`Total task entries: ${totalEntries}`)
console.log(`\nLifecycle stages:`)
console.table(stageCounts)

console.log(`\n=== First 14 days w/ content ===`)
let shown = 0
for (const d of days) {
  if (!d.items.length) continue
  shown++
  if (shown > 14) break
  console.log(`\n── ${d.dayName.padEnd(10)} ${d.date}  (${d.items.length} items)`)
  for (const it of d.items) {
    console.log(`   [${it.stage.padEnd(8)}] ${it.task}${it.detail ? '  | ' + it.detail : ''}`)
  }
}

// Date range
const datedDays = days.filter(d => d.date).map(d => d.date)
console.log(`\nDate span: ${datedDays[0]} → ${datedDays[datedDays.length - 1]}`)
console.log(`Total day blocks: ${days.length}`)

// === Now Passed sheet — this is the historical structured archive ===
console.log(`\n\n=== "Passed" sheet — STRUCTURED HISTORICAL ARCHIVE ===`)
const passed = XLSX.utils.sheet_to_json(wb.Sheets['Passed'], { header: 1, defval: '' })
console.log(`Header row: ${JSON.stringify(passed[0].slice(0, 7))}`)
console.log(`Total rows: ${passed.length}`)

// How many rows have a real Date (col B) and Event (col C)?
let validRows = 0
let withVehicle = 0
let withTeam = 0
let yearHits = {}
for (let i = 1; i < passed.length; i++) {
  const r = passed[i]
  const date = String(r[1] || '').trim()
  const event = String(r[2] || '').trim()
  const team = String(r[5] || '').trim()
  const veh = String(r[6] || '').trim()
  if (date && event) {
    validRows++
    if (team) withTeam++
    if (veh) withVehicle++
    const m = date.match(/(\d{2})\.(\d{2})\.(\d{2,4})/)
    if (m) {
      let y = m[3]
      if (y.length === 2) y = '20' + y
      yearHits[y] = (yearHits[y] || 0) + 1
    }
  }
}
console.log(`Rows with date+event: ${validRows}`)
console.log(`  with team:    ${withTeam}`)
console.log(`  with vehicle: ${withVehicle}`)
console.log(`\nYear distribution:`)
console.table(yearHits)

console.log(`\n=== Sample of 5 most recent "Passed" rows ===`)
for (let i = passed.length - 5; i < passed.length; i++) {
  const r = passed[i]
  console.log(`  ${r[1]} | ${String(r[2]).slice(0,40)} | ${String(r[3]).slice(0,40)} | ${r[4]} | ${r[5]} | ${r[6]}`)
}
