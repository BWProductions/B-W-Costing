// B&W Productions formatting utilities

export function formatZAR(amount: number): string {
  return 'R\u00a0' + amount.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${String(d.getDate()).padStart(2,'0')} ${months[d.getMonth()]} ${d.getFullYear()}`
}

export function formatDateInput(dateStr: string): string {
  // Convert DD MMM YYYY or ISO to YYYY-MM-DD for input[type=date]
  if (!dateStr) return ''
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return dateStr.substring(0, 10)
  return dateStr
}

export function quoteNumber(n: number): string {
  const year = new Date().getFullYear()
  return `BW-${year}-${String(n).padStart(4, '0')}`
}

export function statusBadge(status: string): string {
  const map: Record<string, { label: string; color: string }> = {
    brief:       { label: 'Brief',     color: '#6366f1' },
    quoted:      { label: 'Quoted',    color: '#f59e0b' },
    won:         { label: 'Won',       color: '#10b981' },
    lost:        { label: 'Lost',      color: '#ef4444' },
    delivered:   { label: 'Delivered', color: '#3b82f6' },
    cancelled:   { label: 'Cancelled', color: '#6b7280' },
    draft:       { label: 'Draft',     color: '#9ca3af' },
    sent:        { label: 'Sent',      color: '#f59e0b' },
    accepted:    { label: 'Accepted',  color: '#10b981' },
    declined:    { label: 'Declined',  color: '#ef4444' },
    available:   { label: 'Available', color: '#10b981' },
    allocated:   { label: 'Allocated', color: '#f59e0b' },
    maintenance: { label: 'Maint.',    color: '#ef4444' },
    retired:     { label: 'Retired',   color: '#6b7280' },
  }
  const s = map[status] ?? { label: status, color: '#6b7280' }
  return `<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;color:#fff;background:${s.color}">${s.label}</span>`
}

export function loadClassBadge(cls: string): string {
  const map: Record<string, string> = { L1:'#6366f1', L2:'#3b82f6', L3:'#f59e0b', L4:'#ef4444' }
  const color = map[cls] ?? '#6b7280'
  return `<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:700;color:#fff;background:${color}">${cls}</span>`
}

export function pct(value: number, total: number): string {
  if (!total) return '0%'
  return Math.round((value / total) * 100) + '%'
}
