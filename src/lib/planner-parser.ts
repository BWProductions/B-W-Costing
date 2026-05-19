// Planning Calendar Extractor — parser library
// Takes raw pasted text or extracted xlsx text and produces candidate delivery jobs.

export type ParsedItem = { item: string; qty: number; brand?: string }
export type ParsedJob = {
  job_index: number
  confidence: 'green' | 'amber' | 'red'
  event_name: string
  venue: string
  venue_address: string
  brand: string
  client: string
  delivery_date: string   // YYYY-MM-DD
  collection_date: string // YYYY-MM-DD
  attention: string
  contact_number: string
  driver: string
  vehicle_reg: string
  prepared_by: string
  notes: string
  items: ParsedItem[]
  source_rows: string
  raw_text: string
  flags: string[]
  form_type: 'delivery' | 'collection'
}

const DAY_NAMES = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
const MONTHS: Record<string, number> = {
  jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,
  jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12
}

// Parse "06 May 2026", "6 May 2026", "May 6", "9 May", "08 May (18:00)"
export function parseDate(str: string, defaultYear?: number): string {
  if (!str) return ''
  const s = str.toString().trim()
  // ISO already
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  // "DD Mon YYYY" or "D Mon YYYY"
  const dmy = s.match(/(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(\d{2,4})?/i)
  if (dmy) {
    const d = parseInt(dmy[1], 10)
    const m = MONTHS[dmy[2].toLowerCase()]
    let y = dmy[3] ? parseInt(dmy[3], 10) : (defaultYear || new Date().getFullYear())
    if (y < 100) y += 2000
    return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`
  }
  // "Mon D" (e.g. "May 8")
  const mdy = s.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(\d{1,2})/i)
  if (mdy) {
    const m = MONTHS[mdy[1].toLowerCase()]
    const d = parseInt(mdy[2], 10)
    const y = defaultYear || new Date().getFullYear()
    return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`
  }
  return ''
}

// Detect the "Wednesday | 06 May 2026" pattern
export function isDayHeader(line: string): { date: string; day: string } | null {
  if (!line) return null
  const lower = line.toLowerCase()
  for (const d of DAY_NAMES) {
    if (lower.includes(d)) {
      const date = parseDate(line)
      if (date) return { date, day: d }
    }
  }
  return null
}

// Pull "City, Province, 0000" or street-address-looking strings
export function extractAddress(text: string): string {
  if (!text) return ''
  // Look for "Event address:" prefix
  const m1 = text.match(/event\s*address[:\s]+([^\n\r]+)/i)
  if (m1) return m1[1].trim().replace(/\s+/g, ' ')
  // Look for "Address:" prefix
  const m2 = text.match(/(?:^|\n|\r)\s*address[:\s]+([^\n\r]+)/i)
  if (m2) return m2[1].trim().replace(/\s+/g, ' ')
  return ''
}

export function extractContact(text: string): { name: string; number: string } {
  if (!text) return { name: '', number: '' }
  // Phone pattern: 10-digit SA mobile
  const phoneMatch = text.match(/(\b0\d{2}[\s-]?\d{3}[\s-]?\d{4}\b|\b\+?27[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{4}\b)/)
  const number = phoneMatch ? phoneMatch[1].replace(/[\s-]/g, '') : ''
  // "contact <Name>" or "Contact person: <Name>"
  let name = ''
  const m1 = text.match(/contact(?:\s+person)?[:\s]+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?)/i)
  if (m1) name = m1[1].trim()
  return { name, number }
}

export function extractBrand(text: string): string {
  if (!text) return ''
  // "Brand: Castle lite" or "Brand: MXD"
  const m = text.match(/brand[:\s]+([A-Za-z][A-Za-z0-9\s&'-]{1,30})/i)
  if (m) return m[1].trim()
  // Fallback: scan known brand words
  const lower = text.toLowerCase()
  const KNOWN = ['castle lite','castle','mxd','flying fish','corona','stella','budweiser','redds','brutal fruit','black label','hansa','carling']
  for (const k of KNOWN) if (lower.includes(k)) return k.replace(/\b\w/g, l => l.toUpperCase())
  return ''
}

// Extract items like "Umbrellas – 25", "Gazebo - 6", "01 x Gazebo", "MXD Shirts X7"
export function extractItems(text: string): ParsedItem[] {
  if (!text) return []
  const items: ParsedItem[] = []
  // Split on newlines
  const lines = text.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean)
  for (const line of lines) {
    // Pattern A: "Name – qty" or "Name - qty"
    const a = line.match(/^([A-Za-z][A-Za-z0-9\s/'\-]+?)\s*[–\-]\s*(\d+)\s*(.*)$/)
    if (a) {
      const item = a[1].trim()
      const qty = parseInt(a[2], 10)
      if (item.length > 1 && item.length < 60 && qty > 0 && qty < 1000) {
        items.push({ item, qty })
        continue
      }
    }
    // Pattern B: "01 x Gazebo" or "1 X Wall Banner"
    const b = line.match(/^(\d+)\s*[xX]\s*([A-Za-z][A-Za-z0-9\s/'\-()]+)$/)
    if (b) {
      const qty = parseInt(b[1], 10)
      const item = b[2].trim()
      if (item.length > 1 && qty > 0 && qty < 1000) {
        items.push({ item, qty })
        continue
      }
    }
    // Pattern C: "Item X5" or "Item ×5"
    const c = line.match(/^([A-Za-z][A-Za-z0-9\s/'\-]+?)\s*[xX×]\s*(\d+)$/)
    if (c) {
      const item = c[1].trim()
      const qty = parseInt(c[2], 10)
      if (item.length > 1 && qty > 0 && qty < 1000) {
        items.push({ item, qty })
        continue
      }
    }
  }
  return items
}

// Detect if this block is mostly "collect / pick up / return" (collection rather than delivery)
export function detectFormType(text: string): 'delivery' | 'collection' {
  const lower = (text || '').toLowerCase()
  let collectionScore = 0, deliveryScore = 0
  if (/\b(collect|collection|pick\s*up|return|strike)\b/i.test(lower)) collectionScore += 2
  if (/\b(deliver|delivery|drop\s*off|set\s*up|load)\b/i.test(lower))   deliveryScore += 2
  return collectionScore > deliveryScore ? 'collection' : 'delivery'
}

// Try to extract event name — usually first non-day-header line, or after "EVENT:" / "Event:"
export function extractEventName(blockText: string): string {
  const m1 = blockText.match(/event\s*name[:\s]+([^\n\r]+)/i)
  if (m1) return m1[1].trim()
  const m2 = blockText.match(/(?:^|\n)([A-Z][A-Z\s0-9]{4,40})(?:\s*\n|$)/m) // ALL-CAPS line
  if (m2) return m2[1].trim()
  // First clean line that isn't a day header, doesn't start with "Set up" / "Strike" / "Leave" / "Load"
  const lines = blockText.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean)
  for (const line of lines) {
    if (/^(set\s*up|strike|leave|load|return|collect|pick\s*up|got\s+po)/i.test(line)) continue
    if (isDayHeader(line)) continue
    if (line.length < 4 || line.length > 80) continue
    if (/^\d/.test(line)) continue // skip lines starting with numbers
    return line.replace(/[#*]+/g, '').trim()
  }
  return ''
}

// Set-up / Strike date
export function extractSetUpStrikeDates(text: string, defaultYear?: number): { setUp: string; strike: string } {
  const setUpMatch = text.match(/set\s*up[:\s]+([^\n\r(]+)/i)
  const strikeMatch = text.match(/strike[:\s]+([^\n\r(]+)/i)
  return {
    setUp:  setUpMatch  ? parseDate(setUpMatch[1],  defaultYear) : '',
    strike: strikeMatch ? parseDate(strikeMatch[1], defaultYear) : ''
  }
}

// ─── MAIN PARSER ──────────────────────────────────────────────────────────────
// Input shape: array of { row: number, cols: string[] } from the planner sheet
// Output: array of ParsedJob

export type RowInput = { row: number; cols: string[] }

export function parsePlannerRows(rows: RowInput[]): ParsedJob[] {
  const jobs: ParsedJob[] = []
  let currentDate = ''
  let currentDayBlock: RowInput[] = []
  let blockStartRow = 0

  function flushBlock() {
    if (currentDayBlock.length === 0) return
    // Each non-blank row inside the day block could be a sub-job (collect/leave/load/set up).
    // We treat each non-empty col-A line that has substantial content as a candidate job.
    for (const r of currentDayBlock) {
      const a = (r.cols[0] || '').trim()
      const b = (r.cols[1] || '').trim()
      const cD = (r.cols.slice(2, 6).join(' ')).trim()
      if (!a && !b) continue
      // Skip pure day-headers
      if (isDayHeader(a)) continue
      // Need either substance in col A or items in col B
      if (a.length < 3 && b.length < 3) continue

      const fullText = [a, b, cD].filter(Boolean).join('\n')
      const evName = extractEventName(a) || extractEventName(b) || ''
      // Venue often in col B (or col C for some rows)
      let venue = ''
      const venueCandidate = (r.cols[1] || '').trim()
      // Heuristic: short col B without lots of items = venue name
      if (venueCandidate && venueCandidate.length < 60 && !/\d+\s*[xX×]/.test(venueCandidate)) {
        venue = venueCandidate.split(/[\r\n]/)[0].trim()
      }
      const cCol = (r.cols[2] || '').trim()
      if (!venue && cCol && cCol.length < 60 && !/\d+\s*[xX×]/.test(cCol)) {
        venue = cCol.split(/[\r\n]/)[0].trim()
      }

      const yearGuess = currentDate ? parseInt(currentDate.slice(0,4),10) : undefined
      const venueAddress = extractAddress(fullText)
      const contact = extractContact(fullText)
      const brand = extractBrand(fullText)
      const items = extractItems(b + '\n' + cD)
      const ssDates = extractSetUpStrikeDates(fullText, yearGuess)
      const formType = detectFormType(a)

      const flags: string[] = []
      if (!evName) flags.push('Event name not detected')
      if (!venue) flags.push('Venue not detected')
      if (!currentDate && !ssDates.setUp) flags.push('Date not detected')
      if (items.length === 0) flags.push('No equipment items detected')
      if (venueAddress && /(usa|united states|uk|britain|ireland|italy|baltimore|london)/i.test(venueAddress)) {
        flags.push('Address looks foreign — RSA-only check needed')
      }

      const confidence: ParsedJob['confidence'] =
        (evName && venue && (currentDate || ssDates.setUp) && items.length > 0) ? 'green' :
        (flags.length >= 3) ? 'red' : 'amber'

      jobs.push({
        job_index: jobs.length + 1,
        confidence,
        event_name: evName,
        venue: venue,
        venue_address: venueAddress,
        brand,
        client: brand.toLowerCase().includes('castle') || brand.toLowerCase().includes('hansa') || brand.toLowerCase().includes('black label') || brand.toLowerCase().includes('flying fish') || brand.toLowerCase().includes('redds') || brand.toLowerCase().includes('brutal') || brand.toLowerCase().includes('carling')
          ? 'South African Breweries' : '',
        delivery_date: ssDates.setUp || currentDate || '',
        collection_date: ssDates.strike || '',
        attention: contact.name,
        contact_number: contact.number,
        driver: '',
        vehicle_reg: '',
        prepared_by: '',
        notes: a.replace(/[\r\n]+/g, ' ').slice(0, 500),
        items,
        source_rows: `R${r.row}`,
        raw_text: fullText.slice(0, 2000),
        flags,
        form_type: formType
      })
    }
    currentDayBlock = []
  }

  for (const r of rows) {
    const a = (r.cols[0] || '').trim()
    const dh = isDayHeader(a)
    if (dh) {
      flushBlock()
      currentDate = dh.date
      blockStartRow = r.row
      continue
    }
    currentDayBlock.push(r)
  }
  flushBlock()

  return jobs
}

// Convert raw pasted text into RowInput[] — split on lines, treat tabs as col separators
export function rawTextToRows(text: string): RowInput[] {
  const lines = text.split(/\r?\n/)
  return lines.map((line, i) => ({
    row: i + 1,
    cols: line.split('\t')
  }))
}
