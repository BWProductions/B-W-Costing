const XLSX = require('xlsx');
const path = "/home/user/uploaded_files/1 september Staff Weekly schedule 2025 13 January.xlsx";
try {
  const wb = XLSX.readFile(path, { cellDates: true });
  console.log('SHEETS:', wb.SheetNames);
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const ref = ws['!ref'] || '(empty)';
    const range = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : null;
    const rows = range ? (range.e.r - range.s.r + 1) : 0;
    const cols = range ? (range.e.c - range.s.c + 1) : 0;
    console.log(`\n=== Sheet "${name}" === ref=${ref} rows=${rows} cols=${cols}`);
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
    console.log(`AOA length: ${aoa.length}`);
    const head = aoa.slice(0, 12);
    head.forEach((r, i) => {
      const trimmed = r.map(c => String(c).slice(0,40));
      console.log(`R${i}:`, JSON.stringify(trimmed).slice(0, 400));
    });
  }
} catch (e) {
  console.error('ERROR:', e.message);
  process.exit(1);
}
