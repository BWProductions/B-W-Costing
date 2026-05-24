const XLSX = require('xlsx')
const path = process.argv[2]
console.log('=== Parsing:', path)
const wb = XLSX.readFile(path)
console.log('Sheets:', wb.SheetNames)
for (const name of wb.SheetNames) {
  const sh = wb.Sheets[name]
  const range = XLSX.utils.decode_range(sh['!ref'] || 'A1')
  console.log(`\n── Sheet "${name}" — ${range.e.r + 1} rows × ${range.e.c + 1} cols`)
  const data = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '' })
  // First 20 rows
  for (let i = 0; i < Math.min(20, data.length); i++) {
    const row = data[i]
    if (Array.isArray(row) && row.some(v => v !== '' && v !== null && v !== undefined)) {
      console.log(`  [${i}]`, JSON.stringify(row).slice(0, 300))
    }
  }
  if (data.length > 20) console.log(`  ... ${data.length - 20} more rows`)
}
