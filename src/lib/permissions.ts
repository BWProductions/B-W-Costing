// Centralised permission helpers.
// Canonical roles: founder | ops_director | accounts | crew | read_only
//
// Use these helpers throughout the codebase so role logic lives in ONE place.
// If you change a permission rule, change it here.

import type { AuthUser } from './auth.js'

export type CanonicalRole = 'founder' | 'ops_director' | 'accounts' | 'crew' | 'read_only'

export const ALL_ROLES: CanonicalRole[] = ['founder', 'ops_director', 'accounts', 'crew', 'read_only']

// Normalise legacy or unexpected role strings to a canonical role.
// (Existing 'founder' and 'ops_director' values pass through unchanged.)
export function normaliseRole(raw: string | null | undefined): CanonicalRole {
  if (!raw) return 'read_only'
  const r = raw.toLowerCase().trim()
  if ((ALL_ROLES as string[]).includes(r)) return r as CanonicalRole
  // Legacy / typo fallbacks
  if (r === 'admin') return 'founder'
  if (r === 'ops') return 'ops_director'
  return 'read_only'
}

// ── Visibility helpers (UI uses these to decide what to show) ─────────────

/** Can this user see line item prices on a quote? */
export function canSeePrices(user: AuthUser | null | undefined): boolean {
  if (!user) return false
  const r = normaliseRole(user.role)
  return r !== 'crew' // crew is the only role that can't
}

/** Can this user see supplier banking details? */
export function canSeeBanking(user: AuthUser | null | undefined): boolean {
  if (!user) return false
  const r = normaliseRole(user.role)
  return r === 'founder' // Only Founder
}

/** Can this user override a stock shortage to confirm a booking anyway? */
export function canOverrideStockShortage(user: AuthUser | null | undefined): boolean {
  if (!user) return false
  const r = normaliseRole(user.role)
  return r === 'founder' || r === 'ops_director'
}

/** Can this user issue a PO to an unregistered vendor? */
export function canOverrideVendorRegistration(user: AuthUser | null | undefined): boolean {
  if (!user) return false
  const r = normaliseRole(user.role)
  return r === 'founder' // Only Founder
}

/** Can this user edit calendar events / quotes? */
export function canEditOperational(user: AuthUser | null | undefined): boolean {
  if (!user) return false
  const r = normaliseRole(user.role)
  return r === 'founder' || r === 'ops_director' || r === 'accounts'
}

/** Can this user manage users (create, edit, delete other users)? */
export function canManageUsers(user: AuthUser | null | undefined): boolean {
  if (!user) return false
  return normaliseRole(user.role) === 'founder'
}

/** Mask banking details for non-authorised users. */
export function maskBanking(value: string | null | undefined, user: AuthUser | null | undefined): string {
  if (!value) return ''
  if (canSeeBanking(user)) return value
  // Show last 4 digits only, mask the rest
  const s = String(value)
  if (s.length <= 4) return '••••'
  return '••••' + s.slice(-4)
}

/** Mask a numeric price for crew users. */
export function maskPrice(value: number | string | null | undefined, user: AuthUser | null | undefined): string {
  if (value == null || value === '') return ''
  if (canSeePrices(user)) {
    const n = typeof value === 'number' ? value : parseFloat(String(value))
    if (isNaN(n)) return String(value)
    return n.toFixed(2)
  }
  return '••••'
}

/** Human-friendly role label for UI. */
export function roleLabel(role: string | null | undefined): string {
  const r = normaliseRole(role)
  return {
    founder: 'Founder',
    ops_director: 'Ops Director',
    accounts: 'Accounts',
    crew: 'Crew',
    read_only: 'Read-only',
  }[r]
}
