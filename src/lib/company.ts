// Company settings helper — single-row config for footers, quotes, PDFs.

export type CompanySettings = {
  legal_name: string
  registration_number: string | null
  vat_number: string | null
  address_line1: string | null
  address_line2: string | null
  address_line3: string | null
  postal_code: string | null
  contact_name: string | null
  contact_phone: string | null
  contact_email: string | null
  website: string | null
}

let _cache: { value: CompanySettings | null; ts: number } | null = null
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 min — settings rarely change

export async function getCompanySettings(db: D1Database): Promise<CompanySettings | null> {
  const now = Date.now()
  if (_cache && (now - _cache.ts) < CACHE_TTL_MS) return _cache.value
  const row = await db.prepare(
    `SELECT legal_name, registration_number, vat_number,
            address_line1, address_line2, address_line3, postal_code,
            contact_name, contact_phone, contact_email, website
     FROM company_settings WHERE id = 1`
  ).first<CompanySettings>()
  _cache = { value: row ?? null, ts: now }
  return row ?? null
}

export function invalidateCompanySettingsCache(): void {
  _cache = null
}

// Render a one-line address: "Unit 1, No 19 Kransvalk Road, Highbury, Meyerton 1961"
export function companyAddressLine(s: CompanySettings | null): string {
  if (!s) return ''
  const parts: string[] = []
  if (s.address_line1) parts.push(s.address_line1)
  if (s.address_line2) parts.push(s.address_line2)
  if (s.address_line3) {
    parts.push(s.postal_code ? `${s.address_line3} ${s.postal_code}` : s.address_line3)
  } else if (s.postal_code) {
    parts.push(s.postal_code)
  }
  return parts.join(', ')
}

// Render the standard footer HTML (used on quotes, emails, PDFs)
export function companyFooterHTML(s: CompanySettings | null): string {
  if (!s) return ''
  const reg = s.registration_number ? `Reg: ${escapeHtml(s.registration_number)}` : ''
  const vat = s.vat_number ? `VAT: ${escapeHtml(s.vat_number)}` : ''
  const tel = s.contact_phone ? `<a href="tel:${escapeHtml(s.contact_phone.replace(/\s+/g, ''))}" style="color:inherit;text-decoration:none">${escapeHtml(s.contact_phone)}</a>` : ''
  const email = s.contact_email ? `<a href="mailto:${escapeHtml(s.contact_email)}" style="color:inherit;text-decoration:none">${escapeHtml(s.contact_email)}</a>` : ''
  const name = s.contact_name ? escapeHtml(s.contact_name) : ''

  return `
    <div style="font-size:11px;color:#6b7280;line-height:1.6;text-align:center">
      <div style="font-weight:600;color:#9ca3af;font-size:12px">${escapeHtml(s.legal_name)}</div>
      <div>${[reg, vat].filter(Boolean).join(' &nbsp;•&nbsp; ')}</div>
      <div>${escapeHtml(companyAddressLine(s))}</div>
      ${(name || tel || email) ? `<div>${[name, tel, email].filter(Boolean).join(' &nbsp;•&nbsp; ')}</div>` : ''}
    </div>
  `
}

// Render plain-text footer (for email bodies)
export function companyFooterText(s: CompanySettings | null): string {
  if (!s) return ''
  const lines: string[] = [s.legal_name]
  const idLine = [
    s.registration_number ? `Reg: ${s.registration_number}` : '',
    s.vat_number ? `VAT: ${s.vat_number}` : ''
  ].filter(Boolean).join(' • ')
  if (idLine) lines.push(idLine)
  const addr = companyAddressLine(s)
  if (addr) lines.push(addr)
  const contactLine = [
    s.contact_name || '',
    s.contact_phone || '',
    s.contact_email || ''
  ].filter(Boolean).join(' • ')
  if (contactLine) lines.push(contactLine)
  return lines.join('\n')
}

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
