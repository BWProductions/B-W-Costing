// Auth utilities — edge-compatible (no Node crypto)

export type UserRole = 'founder' | 'ops_director' | 'finance_director' | 'account_director' | 'crew'

export interface AuthUser {
  id: number
  email: string
  name: string
  role: UserRole
}

export const ROLE_LABELS: Record<UserRole, string> = {
  founder:          'Founder',
  ops_director:     'Operations Director',
  finance_director: 'Financial Director',
  account_director: 'Account Director',
  crew:             'Crew',
}

// Role permissions matrix
export const PERMISSIONS = {
  // Who can see cost builds & internal sheets
  viewCostBuild:    ['founder', 'finance_director'] as UserRole[],
  // Who can create/edit quotes
  editQuotes:       ['founder', 'ops_director', 'finance_director', 'account_director'] as UserRole[],
  // Who can manage fleet
  manageFleet:      ['founder', 'ops_director'] as UserRole[],
  // Who can manage suppliers & rate card
  manageSuppliers:  ['founder', 'ops_director', 'finance_director'] as UserRole[],
  // Who can manage users
  manageUsers:      ['founder'] as UserRole[],
  // Who can see margin data
  viewMargins:      ['founder', 'finance_director'] as UserRole[],
  // Who can see finance dashboards
  viewFinance:      ['founder', 'finance_director'] as UserRole[],
  // Full admin
  adminAccess:      ['founder'] as UserRole[],
}

export function can(user: AuthUser, permission: keyof typeof PERMISSIONS): boolean {
  return (PERMISSIONS[permission] as UserRole[]).includes(user.role)
}

// Simple SHA-256 hash using Web Crypto API (edge-compatible)
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password + ':bw-productions-salt-2024')
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const computed = await hashPassword(password)
  return computed === hash
}

// JWT-like session using signed cookie (edge-compatible)
const SESSION_SECRET = 'bw-productions-session-secret-2024-change-in-prod'

export async function createSessionToken(user: AuthUser): Promise<string> {
  const payload = JSON.stringify({ id: user.id, email: user.email, name: user.name, role: user.role, exp: Date.now() + 86400000 * 7 })
  const b64 = btoa(payload)
  const sig = await signData(b64)
  return `${b64}.${sig}`
}

export async function verifySessionToken(token: string): Promise<AuthUser | null> {
  try {
    const [b64, sig] = token.split('.')
    if (!b64 || !sig) return null
    const expectedSig = await signData(b64)
    if (sig !== expectedSig) return null
    const payload = JSON.parse(atob(b64))
    if (payload.exp < Date.now()) return null
    return { id: payload.id, email: payload.email, name: payload.name, role: payload.role }
  } catch {
    return null
  }
}

async function signData(data: string): Promise<string> {
  const encoder = new TextEncoder()
  const keyData = encoder.encode(SESSION_SECRET)
  const messageData = encoder.encode(data)
  const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, messageData)
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function getCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}
