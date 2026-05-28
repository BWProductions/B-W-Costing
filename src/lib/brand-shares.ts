// ─────────────────────────────────────────────────────────────────────────
// Phase 13: Client-facing brand pages — share token management
// ─────────────────────────────────────────────────────────────────────────
//
// A "share token" is a long random string in the URL that lets external
// brand stakeholders see a READ-ONLY, watermarked snapshot of their brand's
// dashboard without logging in. No internal financials, no quotes, no
// movements ledger — just what the brand owner needs.
//
// Schema (migration 0035):
//   brand_share_tokens — one row per active share link
//   brand_share_views  — audit log of every public view
//
// Tokens are 32-hex (~128 bits) generated via Web Crypto.

import type { AuthUser } from './auth.js'

// ─── Types ──────────────────────────────────────────────────────────────────

export type BrandShareToken = {
  id: number
  brand: string
  token: string
  label: string | null
  recipient_email: string | null
  active: number
  view_count: number
  last_viewed_at: string | null
  last_viewed_ip: string | null
  created_by: number | null
  created_by_name: string | null
  created_at: string
  revoked_at: string | null
  revoked_by: number | null
}

export type BrandShareView = {
  id: number
  token_id: number
  ip_address: string | null
  user_agent: string | null
  referrer: string | null
  viewed_at: string
}

// ─── Token generation ───────────────────────────────────────────────────────

/** Generate a cryptographically-random 32-hex token (~128 bits of entropy). */
export function generateShareToken(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ─── Queries ────────────────────────────────────────────────────────────────

/** List all share tokens for a brand, newest first. */
export async function listTokensForBrand(
  db: D1Database,
  brand: string
): Promise<BrandShareToken[]> {
  const result = await db.prepare(`
    SELECT * FROM brand_share_tokens
    WHERE brand = ?
    ORDER BY active DESC, created_at DESC
  `).bind(brand).all<BrandShareToken>()
  return result.results || []
}

/** Look up a token by its public string. Returns null if not found or revoked. */
export async function getActiveToken(
  db: D1Database,
  tokenStr: string
): Promise<BrandShareToken | null> {
  const row = await db.prepare(`
    SELECT * FROM brand_share_tokens
    WHERE token = ? AND active = 1
    LIMIT 1
  `).bind(tokenStr).first<BrandShareToken>()
  return row || null
}

/** Look up a token by ID (admin-side). */
export async function getTokenById(
  db: D1Database,
  id: number
): Promise<BrandShareToken | null> {
  const row = await db.prepare(`
    SELECT * FROM brand_share_tokens WHERE id = ? LIMIT 1
  `).bind(id).first<BrandShareToken>()
  return row || null
}

/** Most recent views for a token (for the admin audit panel). */
export async function listRecentViews(
  db: D1Database,
  tokenId: number,
  limit: number = 50
): Promise<BrandShareView[]> {
  const result = await db.prepare(`
    SELECT * FROM brand_share_views
    WHERE token_id = ?
    ORDER BY viewed_at DESC
    LIMIT ?
  `).bind(tokenId, limit).all<BrandShareView>()
  return result.results || []
}

// ─── Mutations ──────────────────────────────────────────────────────────────

/** Create a new share token for a brand. Returns the freshly-minted token. */
export async function createShareToken(
  db: D1Database,
  args: {
    brand: string
    label?: string | null
    recipient_email?: string | null
    user: AuthUser
  }
): Promise<BrandShareToken> {
  const token = generateShareToken()
  const result = await db.prepare(`
    INSERT INTO brand_share_tokens
      (brand, token, label, recipient_email, active, created_by, created_by_name)
    VALUES (?, ?, ?, ?, 1, ?, ?)
  `).bind(
    args.brand,
    token,
    args.label || null,
    args.recipient_email || null,
    args.user.id,
    args.user.name || args.user.email
  ).run()

  const id = Number(result.meta.last_row_id)
  const created = await getTokenById(db, id)
  if (!created) throw new Error('Failed to create share token')
  return created
}

/** Revoke a token (soft delete — keeps the audit trail). */
export async function revokeShareToken(
  db: D1Database,
  id: number,
  user: AuthUser
): Promise<void> {
  await db.prepare(`
    UPDATE brand_share_tokens
    SET active = 0,
        revoked_at = CURRENT_TIMESTAMP,
        revoked_by = ?
    WHERE id = ?
  `).bind(user.id, id).run()
}

/** Re-activate a previously revoked token. */
export async function reactivateShareToken(
  db: D1Database,
  id: number
): Promise<void> {
  await db.prepare(`
    UPDATE brand_share_tokens
    SET active = 1,
        revoked_at = NULL,
        revoked_by = NULL
    WHERE id = ?
  `).bind(id).run()
}

/**
 * Log a public view. Increments token counters AND writes an audit row.
 * Designed to be best-effort — if logging fails we still serve the page.
 */
export async function logShareView(
  db: D1Database,
  args: {
    token_id: number
    ip_address?: string | null
    user_agent?: string | null
    referrer?: string | null
  }
): Promise<void> {
  try {
    await db.prepare(`
      INSERT INTO brand_share_views (token_id, ip_address, user_agent, referrer)
      VALUES (?, ?, ?, ?)
    `).bind(
      args.token_id,
      args.ip_address || null,
      args.user_agent || null,
      args.referrer || null
    ).run()

    await db.prepare(`
      UPDATE brand_share_tokens
      SET view_count = view_count + 1,
          last_viewed_at = CURRENT_TIMESTAMP,
          last_viewed_ip = ?
      WHERE id = ?
    `).bind(args.ip_address || null, args.token_id).run()
  } catch (e) {
    // Swallow — public viewing must not break on logging failure
    console.error('logShareView failed', e)
  }
}

/** Aggregate view stats for the admin per-brand share page. */
export async function getViewStatsForBrand(
  db: D1Database,
  brand: string
): Promise<{ total_views: number; active_tokens: number; total_tokens: number }> {
  const row = await db.prepare(`
    SELECT
      COALESCE(SUM(view_count), 0) AS total_views,
      COALESCE(SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END), 0) AS active_tokens,
      COUNT(*) AS total_tokens
    FROM brand_share_tokens
    WHERE brand = ?
  `).bind(brand).first<{ total_views: number; active_tokens: number; total_tokens: number }>()
  return row || { total_views: 0, active_tokens: 0, total_tokens: 0 }
}
