// D1 → R2 backup helper.
// Exports key tables to a single JSON file, gzips, stores in R2 under backups/YYYY-MM-DD.json.gz
//
// Limitations of doing this inside a Worker (not via wrangler CLI):
//  - We can't get a full sqlite dump; we extract row-by-row from each table.
//  - Worker CPU limit: 10ms free / 30ms paid per request.
//    For this reason, the backup runs as a one-shot cron with no per-request limit.
//  - For tables > ~10k rows we'd need pagination; not yet needed at current scale.

type AnyDB = any

const BACKUP_TABLES = [
  'users',                 // contains sensitive auth data — included but server-side only
  'clients',
  'suppliers',
  'fleet',
  'rate_card',
  'field_items',
  'field_people',
  'field_vehicles',
  'field_venues',
  'field_submissions',
  'field_line_items',
  'calendar_events',
  'calendar_event_crew',
  'calendar_event_vehicles',
  'quotes',
  'quote_line_items',
  'events',
  'company_settings',
  'audit_log',
  'system_settings',
]

export async function runBackup(env: { DB: D1Database; PDF_BUCKET: R2Bucket }): Promise<{
  ok: boolean
  key?: string
  bytes?: number
  table_counts?: Record<string, number>
  error?: string
}> {
  try {
    const tableCounts: Record<string, number> = {}
    const payload: any = {
      backed_up_at: new Date().toISOString(),
      schema_version: 21,
      tables: {} as Record<string, any[]>,
    }

    for (const tbl of BACKUP_TABLES) {
      try {
        const r = await env.DB.prepare(`SELECT * FROM ${tbl}`).all<any>()
        const rows = r.results || []
        payload.tables[tbl] = rows
        tableCounts[tbl] = rows.length
      } catch (e) {
        // Table might not exist (e.g. dropped). Log and continue.
        console.warn(`backup: skipping ${tbl}:`, e)
        tableCounts[tbl] = -1
      }
    }

    const json = JSON.stringify(payload)
    // Gzip via CompressionStream (available in Workers runtime)
    const compressed = await gzipString(json)

    const isoDate = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    const isoTime = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) // 2026-05-25T04-00-00
    const key = `backups/${isoDate}/d1-${isoTime}.json.gz`

    await env.PDF_BUCKET.put(key, compressed, {
      httpMetadata: { contentType: 'application/gzip' },
      customMetadata: {
        type: 'd1-backup',
        backed_up_at: payload.backed_up_at,
        table_count: String(BACKUP_TABLES.length),
        total_rows: String(Object.values(tableCounts).reduce((a, b) => a + Math.max(0, b), 0)),
      },
    })

    return {
      ok: true,
      key,
      bytes: compressed.byteLength,
      table_counts: tableCounts,
    }
  } catch (err: any) {
    console.error('backup failed:', err)
    return { ok: false, error: err?.message || String(err) }
  }
}

async function gzipString(input: string): Promise<Uint8Array> {
  const blob = new Blob([input])
  // @ts-ignore — CompressionStream exists in Workers + modern browsers
  const cs = new CompressionStream('gzip')
  const compressed = blob.stream().pipeThrough(cs)
  const reader = compressed.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    total += value.byteLength
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}

// List available backups (for admin UI to show / restore)
export async function listBackups(env: { PDF_BUCKET: R2Bucket }, limit = 50): Promise<Array<{
  key: string
  size: number
  uploaded: string
  metadata: Record<string, string>
}>> {
  const list = await env.PDF_BUCKET.list({ prefix: 'backups/', limit })
  return (list.objects || []).map(o => ({
    key: o.key,
    size: o.size,
    uploaded: o.uploaded.toISOString(),
    metadata: o.customMetadata || {},
  })).sort((a, b) => b.uploaded.localeCompare(a.uploaded))
}
