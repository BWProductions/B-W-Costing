const XLSX = require('xlsx')
const path = "/home/user/uploaded_files/1 september Staff Weekly schedule 2025 13 January.xlsx"
const wb = XLSX.readFile(path, { cellDates: true })

// Excel serial → JS Date
function excelDate(n) {
  if (typeof n === 'string' && /^\d+$/.test(n)) n = parseInt(n)
  if (typeof n !== 'number') return null
  // Excel epoch: 1900-01-01 = 1, with the 1900 leap year bug
  const ms = (n - 25569) * 86400 * 1000
  return new Date(ms)
}

const cur = XLSX.utils.sheet_to_json(wb.Sheets['Current'], { header: 1, defval: '', raw: true })

// Check actual cell types in date headers
console.log('=== Current sheet date-header inspection ===')
const DAYS_RE = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*$/i
let firstDate = null, lastDate = null
let monthYearCounts = {}
for (let i = 0; i < cur.length; i++) {
  const row = cur[i]
  const a = String(row[0] || '').trim()
  const b = row[1]
  if (DAYS_RE.test(a) && b !== '' && b !== undefined) {
    const d = excelDate(b)
    if (d && !isNaN(d)) {
      if (!firstDate) firstDate = d
      lastDate = d
      const my = d.toISOString().slice(0,7)
      monthYearCounts[my] = (monthYearCounts[my] || 0) + 1
    }
  }
}
console.log(`First date: ${firstDate ? firstDate.toISOString().slice(0,10) : 'n/a'}`)
console.log(`Last date:  ${lastDate ? lastDate.toISOString().slice(0,10) : 'n/a'}`)
console.log(`\nMonths covered in Current sheet:`)
console.table(monthYearCounts)

// Passed sheet — proper structured columns
console.log(`\n\n=== "Passed" sheet header context ===`)
const passed = XLSX.utils.sheet_to_json(wb.Sheets['Passed'], { header: 1, defval: '', raw: true })
console.log(`Header row (first 10 cols): ${JSON.stringify(passed[0].slice(0, 10))}`)

let validRows = 0
let withVehicle = 0
let withTeam = 0
let withAddress = 0
let withTime = 0
let monthHits = {}
let teamHits = {}
let vehHits = {}

for (let i = 1; i < passed.length; i++) {
  const r = passed[i]
  const date = r[1]
  const event = String(r[2] || '').trim()
  const address = String(r[3] || '').trim()
  const time = String(r[4] || '').trim()
  const team = String(r[5] || '').trim()
  const veh = String(r[6] || '').trim()
  if (!event) continue
  if (!date) continue
  validRows++
  if (team) withTeam++
  if (veh) withVehicle++
  if (address) withAddress++
  if (time) withTime++
  
  // Try multiple date interpretations
  let yr = ''
  if (typeof date === 'number') {
    const d = excelDate(date)
    if (d && !isNaN(d)) yr = d.toISOString().slice(0,7)
  } else if (date instanceof Date) {
    yr = date.toISOString().slice(0,7)
  } else if (typeof date === 'string') {
    // formats: "23.10.20", "23.10.2020", "23-Oct-20"
    const m = date.match(/(\d{1,2})[\.\-\/](\d{1,2})[\.\-\/](\d{2,4})/)
    if (m) {
      let y = m[3]
      if (y.length === 2) y = '20' + y
      yr = y + '-' + m[2].padStart(2,'0')
    }
  }
  if (yr) monthHits[yr] = (monthHits[yr] || 0) + 1
  
  // Team names
  if (team) {
    for (const n of team.toLowerCase().split(/[,&\/\-+]+/)) {
      const nm = n.trim()
      if (nm.length > 2 && nm.length < 20) teamHits[nm] = (teamHits[nm] || 0) + 1
    }
  }
  // Vehicles
  if (veh) {
    for (const n of veh.toLowerCase().split(/[,&\/\-+]+/)) {
      const nm = n.trim()
      if (nm.length > 2 && nm.length < 20) vehHits[nm] = (vehHits[nm] || 0) + 1
    }
  }
}
console.log(`\nValid rows: ${validRows}`)
console.log(`  team:    ${withTeam} (${Math.round(withTeam/validRows*100)}%)`)
console.log(`  vehicle: ${withVehicle} (${Math.round(withVehicle/validRows*100)}%)`)
console.log(`  address: ${withAddress} (${Math.round(withAddress/validRows*100)}%)`)
console.log(`  time:    ${withTime} (${Math.round(withTime/validRows*100)}%)`)

// Top 12 months by event count
const sortedMonths = Object.entries(monthHits).sort((a,b) => b[1]-a[1]).slice(0, 20)
console.log(`\nTop 20 months by event count:`)
console.table(Object.fromEntries(sortedMonths))

// Top teams
const sortedTeams = Object.entries(teamHits).sort((a,b) => b[1]-a[1]).slice(0, 15)
console.log(`\nTop 15 team members:`)
console.table(Object.fromEntries(sortedTeams))

// Top vehicles
const sortedVeh = Object.entries(vehHits).sort((a,b) => b[1]-a[1]).slice(0, 15)
console.log(`\nTop 15 vehicles:`)
console.table(Object.fromEntries(sortedVeh))

// Sample 8 real rows from somewhere in the middle
console.log(`\n=== Sample passed events (rows 600-607) ===`)
for (let i = 600; i < 608 && i < passed.length; i++) {
  const r = passed[i]
  let d = r[1]
  if (typeof d === 'number') d = excelDate(d)?.toISOString().slice(0,10)
  else if (d instanceof Date) d = d.toISOString().slice(0,10)
  console.log(`  ${String(d).padEnd(12)} | ${String(r[2]).slice(0,35).padEnd(35)} | ${String(r[3]).slice(0,30).padEnd(30)} | ${String(r[4]).slice(0,15).padEnd(15)} | ${String(r[5]).slice(0,20).padEnd(20)} | ${r[6]}`)
}
