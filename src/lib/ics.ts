// ICS (iCalendar RFC 5545) generation for B&W Productions calendar feed.
// Edge-compatible — pure string manipulation, no Node deps.

export interface ICSEvent {
  uid: string                 // stable unique id, e.g. "cal-event-123@bwproductions"
  start: string               // YYYY-MM-DD for all-day, or YYYYMMDDTHHmmssZ for timed
  end?: string                // optional; defaults to next day (all-day)
  summary: string
  description?: string
  location?: string
  status?: 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED'
  categories?: string[]
  lastModified?: string       // YYYYMMDDTHHmmssZ
}

// Fold long lines per RFC 5545 (75 octets max, soft-wrap with CRLF + space)
function fold(line: string): string {
  if (line.length <= 75) return line
  const parts: string[] = []
  let i = 0
  while (i < line.length) {
    parts.push((i === 0 ? '' : ' ') + line.slice(i, i + 74))
    i += 74
  }
  return parts.join('\r\n')
}

// Escape RFC 5545 special chars inside text fields
function esc(s: string): string {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\n|\r/g, '\\n')
}

function dateToICS(yyyy_mm_dd: string): string {
  return yyyy_mm_dd.replace(/-/g, '')
}

function nowUTC(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

export function buildICS(events: ICSEvent[], calName = 'B&W Productions Events'): string {
  const lines: string[] = []
  lines.push('BEGIN:VCALENDAR')
  lines.push('VERSION:2.0')
  lines.push('PRODID:-//B&W Productions//Operations Platform//EN')
  lines.push('CALSCALE:GREGORIAN')
  lines.push('METHOD:PUBLISH')
  lines.push(fold('X-WR-CALNAME:' + esc(calName)))
  lines.push('X-WR-TIMEZONE:Africa/Johannesburg')
  lines.push(fold('X-WR-CALDESC:' + esc('Live operational events from the B&W Productions ops platform')))

  const dtstamp = nowUTC()
  for (const e of events) {
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${e.uid}`)
    lines.push(`DTSTAMP:${dtstamp}`)
    // All-day event (default)
    const startDate = dateToICS(e.start)
    const endDate = e.end ? dateToICS(e.end) : dateToICS(addOneDay(e.start))
    lines.push(`DTSTART;VALUE=DATE:${startDate}`)
    lines.push(`DTEND;VALUE=DATE:${endDate}`)
    lines.push(fold(`SUMMARY:${esc(e.summary)}`))
    if (e.location)    lines.push(fold(`LOCATION:${esc(e.location)}`))
    if (e.description) lines.push(fold(`DESCRIPTION:${esc(e.description)}`))
    if (e.status)      lines.push(`STATUS:${e.status}`)
    if (e.categories?.length) lines.push(fold(`CATEGORIES:${e.categories.map(esc).join(',')}`))
    if (e.lastModified) lines.push(`LAST-MODIFIED:${e.lastModified}`)
    lines.push('TRANSP:OPAQUE')
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  // RFC 5545 mandates CRLF line endings
  return lines.join('\r\n') + '\r\n'
}

function addOneDay(yyyy_mm_dd: string): string {
  const d = new Date(yyyy_mm_dd + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

// Generate a random 32-char hex token using Web Crypto
export async function generateIcsToken(): Promise<string> {
  const buf = new Uint8Array(16)
  crypto.getRandomValues(buf)
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('')
}
