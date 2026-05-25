// Audit log helper — append-only record of who did what.
// Fail-soft: if the audit insert fails, the main operation still succeeds.
// (We never want audit logging to break user-facing actions.)

import type { Context } from 'hono'

export type AuditAction = 'create' | 'update' | 'delete' | 'override' | 'login' | 'logout' | 'login_fail'

export type AuditEntry = {
  action: AuditAction
  entityType: string         // 'calendar_event' | 'quote' | 'supplier' | 'stock_item' | 'user' | ...
  entityId?: number | null
  fieldChanges?: Record<string, { from: any; to: any }> | null
  reason?: string | null
}

export async function audit(
  c: Context,
  entry: AuditEntry
): Promise<void> {
  try {
    const db = c.env.DB as D1Database
    const user = c.get('user') as { id?: number; email?: string } | undefined
    const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || null
    const ua = c.req.header('user-agent') || null
    const changesJson = entry.fieldChanges ? JSON.stringify(entry.fieldChanges) : null

    await db.prepare(
      `INSERT INTO audit_log
       (user_id, user_email, action, entity_type, entity_id, field_changes, reason, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      user?.id ?? null,
      user?.email ?? null,
      entry.action,
      entry.entityType,
      entry.entityId ?? null,
      changesJson,
      entry.reason ?? null,
      ip,
      ua
    ).run()
  } catch (err) {
    // Fail-soft: never block the user action on a logging failure.
    console.error('audit log insert failed:', err)
  }
}

// Compute a diff between two row objects for storing in field_changes.
// Returns only fields that actually changed. Useful for inline-edit PATCH handlers.
export function diff(
  before: Record<string, any>,
  after: Record<string, any>,
  fields?: string[]
): Record<string, { from: any; to: any }> {
  const out: Record<string, { from: any; to: any }> = {}
  const keys = fields ?? Object.keys(after)
  for (const k of keys) {
    const a = before?.[k]
    const b = after?.[k]
    // Normalise null vs undefined vs empty string for comparison
    const norm = (v: any) => v === undefined || v === null || v === '' ? null : v
    if (norm(a) !== norm(b)) {
      out[k] = { from: a ?? null, to: b ?? null }
    }
  }
  return out
}
