// ─────────────────────────────────────────────────────────────────────────
// Phase 6: Bulk CSV Import — parser, column auto-detection, smart fuzzy
// classifier, commit + undo helpers.
// ─────────────────────────────────────────────────────────────────────────
//
// Design (confirmed with Bibi):
//   Q1: smart fuzzy matching via existing engine (lib/fuzzy.ts, thresholds
//       0.85 auto-merge / 0.65 ask)
//   Q2: option A — only update fields present in the CSV row; leave others
//       (notes, location, threshold, etc.) ALONE. Empty cell in CSV ⇒ skip
//       that field for update. (Inserts use empty strings for required
//       fields and NULL for optional.)
//   Q3: replace qty rather than adjust (gospel: CSV qty wins)
//   Q4: undo button required; commit stores per-row before-snapshot so
//       Undo can restore exactly (24h soft window enforced in UI).
//
// Public API:
//   parseCsv(text)                                 → ParsedCsv
//   detectColumns(headers)                         → ColumnMap
//   classifyRows(db, parsed, colMap)               → Promise<ClassifiedRow[]>
//   commitImport(db, user, parsed, classified, ...)→ Promise<{ importId, ... }>
//   undoImport(db, user, importId)                 → Promise<{ reverted, ... }>
//   loadImport(db, importId)                       → Promise<BulkImport | null>
//   loadImportRows(db, importId)                   → Promise<BulkImportRow[]>

import { findMatches, normalise, THRESHOLDS } from './fuzzy.js'

// ─── Types ──────────────────────────────────────────────────────────────────

export type ParsedCsv = {
  headers: string[]            // raw header strings
  rows: string[][]             // body rows, same width as headers
  hadHeaderRow: boolean        // true if first line looked like a header
  delimiter: ',' | ';' | '\t' | '|'
  warnings: string[]           // e.g. "row 12 had 5 cols, expected 4"
}

// Index of each known field within the CSV row (or -1 if not present)
export type ColumnMap = {
  brand:        number
  description:  number
  qty:          number
  location:     number
  notes:        number
  custody:      number
  status:       number
  threshold:    number
  id:           number          // optional explicit stock_items.id
}

export type StockRow = {
  id: number
  brand: string
  description: string
  qty_on_hand: number
  location: string | null
  notes: string | null
  status: string
  custody_type: string
  low_stock_threshold: number | null
  active: number
}

export type ClassifiedRow = {
  rowNumber: number              // 1-based, in the body (post-header)
  raw: Record<string, string>    // header → cell, for display
  action: 'insert' | 'update' | 'skip'
  matchedItemId: number | null
  matchScore: number | null      // 0..1 if fuzzy
  matchReason: string            // 'exact' | 'fuzzy 0.92' | 'new' | 'skipped: …'
  // For preview: the proposed write
  newValues: Partial<StockRow>   // only the fields we're going to touch
  // For preview: the original row (if update)
  beforeValues: StockRow | null
  // Per-field "is changing?" map
  changedFields: string[]
  // Warnings/notes
  notes: string[]
  // Top candidates from fuzzy (for "is this really the same item?" UX)
  candidates: Array<{ id: number; brand: string; description: string; score: number }>
}

export type BulkImport = {
  id: number
  status: 'preview' | 'committed' | 'undone' | 'discarded'
  source_name: string | null
  raw_csv: string | null
  detected_cols: string | null
  total_rows: number
  insert_count: number
  update_count: number
  skip_count: number
  fuzzy_count: number
  created_at: string
  created_by_id: number | null
  created_by_name: string | null
  committed_at: string | null
  undone_at: string | null
  undone_by_name: string | null
  notes: string | null
}

export type BulkImportRow = {
  id: number
  import_id: number
  row_number: number
  raw_data: string | null
  action_taken: 'insert' | 'update' | 'skip'
  matched_item_id: number | null
  match_score: number | null
  match_reason: string | null
  before_snapshot: string | null
  after_snapshot: string | null
  fields_touched: string | null
  qty_delta: number | null
  notes: string | null
}

// ─── CSV parser ─────────────────────────────────────────────────────────────
// Hand-rolled because: (a) Cloudflare Workers has no built-in CSV lib;
// (b) we want quoting + multi-delimiter + multi-line-quoted-cells.

export function parseCsv(text: string): ParsedCsv {
  // Strip BOM if present
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1)
  // Normalise line endings
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  const delimiter = detectDelimiter(text)
  const allRows: string[][] = []
  let cell = ''
  let row: string[] = []
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]
    if (inQuotes) {
      if (ch === '"' && next === '"') { cell += '"'; i++ }
      else if (ch === '"')             { inQuotes = false }
      else                              { cell += ch }
    } else {
      if (ch === '"')                  { inQuotes = true }
      else if (ch === delimiter)       { row.push(cell); cell = '' }
      else if (ch === '\n')            { row.push(cell); allRows.push(row); cell = ''; row = [] }
      else                              { cell += ch }
    }
  }
  // Flush trailing cell/row
  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    allRows.push(row)
  }

  // Strip completely empty rows
  const nonEmpty = allRows.filter(r => r.some(c => c.trim() !== ''))
  if (nonEmpty.length === 0) {
    return { headers: [], rows: [], hadHeaderRow: false, delimiter, warnings: ['Empty CSV'] }
  }

  // Decide if first row is a header
  const first = nonEmpty[0].map(c => c.trim())
  const hadHeaderRow = looksLikeHeader(first)
  const headers = hadHeaderRow ? first : first.map((_, i) => `col${i + 1}`)
  const bodyStart = hadHeaderRow ? 1 : 0
  const expectedWidth = headers.length
  const warnings: string[] = []
  const rows: string[][] = []
  for (let r = bodyStart; r < nonEmpty.length; r++) {
    const row = nonEmpty[r]
    if (row.length !== expectedWidth) {
      warnings.push(`Row ${r + 1} has ${row.length} cells, expected ${expectedWidth}`)
    }
    // Pad / truncate to expected width
    const fixed = row.slice(0, expectedWidth)
    while (fixed.length < expectedWidth) fixed.push('')
    rows.push(fixed.map(c => c.trim()))
  }
  return { headers, rows, hadHeaderRow, delimiter, warnings }
}

function detectDelimiter(text: string): ',' | ';' | '\t' | '|' {
  // Sample first 5 lines
  const sample = text.split('\n').slice(0, 5).join('\n')
  const counts: Record<string, number> = {
    ',':  (sample.match(/,/g)  || []).length,
    ';':  (sample.match(/;/g)  || []).length,
    '\t': (sample.match(/\t/g) || []).length,
    '|':  (sample.match(/\|/g) || []).length,
  }
  let best: ',' | ';' | '\t' | '|' = ','
  let bestN = -1
  for (const d of [',', ';', '\t', '|'] as const) {
    if (counts[d] > bestN) { bestN = counts[d]; best = d }
  }
  return best
}

function looksLikeHeader(row: string[]): boolean {
  // Heuristic: a header row has mostly non-numeric cells, and the first cell
  // is non-empty alpha-ish text.
  if (row.length === 0) return false
  const nonNumeric = row.filter(c => c !== '' && Number.isNaN(Number(c))).length
  return nonNumeric / row.length >= 0.6
}

// ─── Column auto-detection ──────────────────────────────────────────────────

const COL_PATTERNS: Record<keyof ColumnMap, RegExp[]> = {
  id:          [/^id$/i, /^item[\s_-]?id$/i, /^stock[\s_-]?id$/i],
  brand:       [/^brand$/i, /^make$/i, /^manufacturer$/i, /^supplier$/i, /^product$/i],
  description: [/^description$/i, /^desc$/i, /^item$/i, /^name$/i, /^product[\s_-]?name$/i, /^details$/i, /^item[\s_-]?name$/i],
  qty:         [/^qty$/i, /^quantity$/i, /^count$/i, /^stock$/i, /^on[\s_-]?hand$/i, /^qty[\s_-]?on[\s_-]?hand$/i, /^units?$/i],
  location:    [/^location$/i, /^loc$/i, /^where$/i, /^warehouse$/i, /^stored[\s_-]?at$/i, /^place$/i],
  notes:       [/^notes?$/i, /^comments?$/i, /^remarks?$/i, /^memo$/i],
  custody:     [/^custody$/i, /^custody[\s_-]?type$/i, /^ownership$/i, /^owned[\s_-]?by$/i],
  status:      [/^status$/i, /^state$/i],
  threshold:   [/^threshold$/i, /^low[\s_-]?stock$/i, /^low[\s_-]?stock[\s_-]?threshold$/i, /^reorder[\s_-]?level$/i, /^min[\s_-]?qty$/i, /^minimum$/i],
}

export function detectColumns(headers: string[]): ColumnMap {
  const map: ColumnMap = {
    id: -1, brand: -1, description: -1, qty: -1,
    location: -1, notes: -1, custody: -1, status: -1, threshold: -1,
  }
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].trim()
    for (const field of Object.keys(COL_PATTERNS) as Array<keyof ColumnMap>) {
      if (map[field] !== -1) continue
      for (const pat of COL_PATTERNS[field]) {
        if (pat.test(h)) { map[field] = i; break }
      }
    }
  }
  return map
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function cell(row: string[], idx: number): string {
  if (idx < 0 || idx >= row.length) return ''
  return (row[idx] ?? '').trim()
}

function parseIntOrNull(s: string): number | null {
  if (s === '') return null
  const n = parseInt(s, 10)
  return Number.isFinite(n) ? n : null
}

function normaliseCustody(raw: string): string | null {
  if (!raw) return null
  const s = raw.trim().toLowerCase()
  if (s === 'owned' || s === 'own' || s === 'bw' || s === 'b&w' || s === 'b and w') return 'owned'
  if (s.includes('third') && s.includes('warehouse'))      return 'third_party_in_warehouse'
  if (s === 'third_party_in_warehouse')                    return 'third_party_in_warehouse'
  if (s === '3rd' || s === 'third' || s === 'third party' || s === 'third-party') return 'third_party_in_warehouse'
  if (s === 'offsite' || s === 'off-site' || s === 'off site' || s === 'external') return 'offsite'
  return null
}

function normaliseStatus(raw: string): string | null {
  if (!raw) return null
  const s = raw.trim().toLowerCase()
  if (s === 'active' || s === 'a' || s === 'ok')   return 'active'
  if (s === 'review' || s === 'r' || s === 'check') return 'review'
  if (s === 'retired' || s === 'r2' || s === 'old' || s === 'archive' || s === 'archived') return 'retired'
  return null
}

// ─── Classifier: figure out insert/update/skip for each row ────────────────

export async function classifyRows(
  db: D1Database,
  parsed: ParsedCsv,
  colMap: ColumnMap,
): Promise<ClassifiedRow[]> {
  // Bail early if no description column — we can't even attempt to match.
  if (colMap.description < 0 && colMap.id < 0) {
    return parsed.rows.map((row, idx) => ({
      rowNumber: idx + 1,
      raw: rawDataOf(parsed.headers, row),
      action: 'skip' as const,
      matchedItemId: null,
      matchScore: null,
      matchReason: 'skipped: no description or id column detected',
      newValues: {},
      beforeValues: null,
      changedFields: [],
      notes: ['CSV needs an "id" OR "description" column to match against existing stock.'],
      candidates: [],
    }))
  }

  // Load full catalogue once for fuzzy matching
  const allItems = await db.prepare(
    `SELECT id, brand, description, qty_on_hand, location, notes, status,
            custody_type, low_stock_threshold, active
     FROM stock_items
     WHERE active = 1`
  ).all<StockRow>()
  const catalogue = allItems.results || []

  // Index by id, and by exact (brand|description) lower-cased
  const byId = new Map<number, StockRow>()
  const byExact = new Map<string, StockRow>()
  for (const it of catalogue) {
    byId.set(it.id, it)
    const k = `${(it.brand || '').toLowerCase().trim()}|${(it.description || '').toLowerCase().trim()}`
    byExact.set(k, it)
  }

  // Build fuzzy candidate list: each item's "name" = brand + description.
  // This way fuzzy compares the FULL identity, not just description.
  const fuzzyCandidates = catalogue.map(it => ({
    id: it.id,
    name: `${it.brand || ''} ${it.description || ''}`.trim(),
    category: it.brand || null,
  }))

  const out: ClassifiedRow[] = []

  for (let i = 0; i < parsed.rows.length; i++) {
    const row = parsed.rows[i]
    const raw = rawDataOf(parsed.headers, row)
    const notes: string[] = []
    const rowNumber = i + 1

    // Skip completely blank rows quietly
    if (row.every(c => c === '')) {
      out.push({
        rowNumber, raw, action: 'skip',
        matchedItemId: null, matchScore: null, matchReason: 'skipped: blank row',
        newValues: {}, beforeValues: null, changedFields: [], notes: [], candidates: [],
      })
      continue
    }

    // 1. If id column present and parses → exact match by id
    let matched: StockRow | null = null
    let matchScore: number | null = null
    let matchReason = ''

    const idCell = cell(row, colMap.id)
    if (idCell !== '') {
      const idNum = parseIntOrNull(idCell)
      if (idNum !== null && byId.has(idNum)) {
        matched = byId.get(idNum)!
        matchReason = 'exact id match'
      } else if (idNum !== null) {
        notes.push(`id=${idNum} not found in active stock — will skip (use blank id to insert)`)
        out.push({
          rowNumber, raw, action: 'skip',
          matchedItemId: null, matchScore: null, matchReason: `skipped: id ${idNum} not found`,
          newValues: {}, beforeValues: null, changedFields: [], notes, candidates: [],
        })
        continue
      }
    }

    const brand = cell(row, colMap.brand)
    const description = cell(row, colMap.description)
    const candidates: ClassifiedRow['candidates'] = []

    // 2. Exact brand|description match (case-insensitive)
    if (!matched && brand && description) {
      const k = `${brand.toLowerCase()}|${description.toLowerCase()}`
      const hit = byExact.get(k)
      if (hit) {
        matched = hit
        matchReason = 'exact brand+description match'
      }
    }

    // 3. Smart fuzzy match (Q1=c). Use full "brand + description" as query.
    if (!matched && description) {
      const query = `${brand} ${description}`.trim()
      const result = findMatches(query, fuzzyCandidates, 3)
      // Top 3 candidates for UI display
      for (const c of result.candidates) {
        const cat = catalogue.find(it => it.id === c.item_id)
        if (cat) candidates.push({
          id: cat.id, brand: cat.brand, description: cat.description, score: c.score,
        })
      }
      const top = result.candidates[0]
      if (top && top.score >= THRESHOLDS.autoMerge) {
        matched = byId.get(top.item_id) || null
        matchScore = top.score
        matchReason = `fuzzy ${top.score.toFixed(2)} (auto-merge ≥ ${THRESHOLDS.autoMerge})`
        notes.push(`Fuzzy matched to "${matched?.brand} — ${matched?.description}" at score ${top.score.toFixed(2)}.`)
      } else if (top && top.score >= THRESHOLDS.ask) {
        // Ask-zone: present as POSSIBLE update but DEFAULT TO INSERT (safer).
        // The UI will show candidates and let user override per row.
        matchScore = top.score
        matchReason = `possible match ${top.score.toFixed(2)} — defaulting to insert (override in preview)`
        notes.push(`Borderline match (${top.score.toFixed(2)}) to "${candidates[0].brand} — ${candidates[0].description}" — eyeballs needed.`)
      }
    }

    // 4. Decide action + assemble newValues
    if (matched) {
      // UPDATE — only fields present in CSV (Q2=A)
      const newValues: Partial<StockRow> = {}
      const changedFields: string[] = []

      // brand
      if (colMap.brand >= 0 && brand !== '') {
        if (brand !== matched.brand) { newValues.brand = brand; changedFields.push('brand') }
      }
      // description
      if (colMap.description >= 0 && description !== '') {
        if (description !== matched.description) { newValues.description = description; changedFields.push('description') }
      }
      // qty — REPLACE (Q3=a). Empty cell = leave alone.
      if (colMap.qty >= 0) {
        const qtyRaw = cell(row, colMap.qty)
        if (qtyRaw !== '') {
          const q = parseIntOrNull(qtyRaw)
          if (q === null) {
            notes.push(`qty "${qtyRaw}" isn't a number — qty left unchanged`)
          } else if (q !== matched.qty_on_hand) {
            newValues.qty_on_hand = q
            changedFields.push('qty_on_hand')
          }
        }
      }
      // location
      if (colMap.location >= 0) {
        const loc = cell(row, colMap.location)
        if (loc !== '' && loc !== (matched.location || '')) {
          newValues.location = loc
          changedFields.push('location')
        }
      }
      // notes
      if (colMap.notes >= 0) {
        const nt = cell(row, colMap.notes)
        if (nt !== '' && nt !== (matched.notes || '')) {
          newValues.notes = nt
          changedFields.push('notes')
        }
      }
      // custody
      if (colMap.custody >= 0) {
        const cu = cell(row, colMap.custody)
        if (cu !== '') {
          const norm = normaliseCustody(cu)
          if (norm && norm !== matched.custody_type) {
            newValues.custody_type = norm
            changedFields.push('custody_type')
          } else if (!norm) {
            notes.push(`custody "${cu}" not recognised — left unchanged`)
          }
        }
      }
      // status
      if (colMap.status >= 0) {
        const st = cell(row, colMap.status)
        if (st !== '') {
          const norm = normaliseStatus(st)
          if (norm && norm !== matched.status) {
            newValues.status = norm
            changedFields.push('status')
          } else if (!norm) {
            notes.push(`status "${st}" not recognised — left unchanged`)
          }
        }
      }
      // threshold
      if (colMap.threshold >= 0) {
        const th = cell(row, colMap.threshold)
        if (th !== '') {
          const n = parseIntOrNull(th)
          if (n === null) {
            notes.push(`threshold "${th}" isn't a number — left unchanged`)
          } else if (n !== matched.low_stock_threshold) {
            newValues.low_stock_threshold = n
            changedFields.push('low_stock_threshold')
          }
        }
      }

      if (changedFields.length === 0) {
        out.push({
          rowNumber, raw, action: 'skip',
          matchedItemId: matched.id, matchScore, matchReason: 'skipped: no field changes',
          newValues: {}, beforeValues: matched, changedFields: [], notes, candidates,
        })
      } else {
        out.push({
          rowNumber, raw, action: 'update',
          matchedItemId: matched.id, matchScore, matchReason,
          newValues, beforeValues: matched, changedFields, notes, candidates,
        })
      }
    } else {
      // INSERT — need at least brand + description
      if (!brand || !description) {
        notes.push('insert requires both brand and description columns to have values')
        out.push({
          rowNumber, raw, action: 'skip',
          matchedItemId: null, matchScore, matchReason: 'skipped: missing brand or description',
          newValues: {}, beforeValues: null, changedFields: [], notes, candidates,
        })
        continue
      }
      const newValues: Partial<StockRow> = {
        brand,
        description,
        qty_on_hand: parseIntOrNull(cell(row, colMap.qty)) ?? 0,
        location: cell(row, colMap.location) || null,
        notes: cell(row, colMap.notes) || null,
        custody_type: normaliseCustody(cell(row, colMap.custody)) || 'owned',
        status: normaliseStatus(cell(row, colMap.status)) || 'active',
        low_stock_threshold: parseIntOrNull(cell(row, colMap.threshold)),
      }
      out.push({
        rowNumber, raw, action: 'insert',
        matchedItemId: null, matchScore, matchReason: matchReason || 'new item',
        newValues, beforeValues: null, changedFields: Object.keys(newValues), notes, candidates,
      })
    }
  }

  return out
}

function rawDataOf(headers: string[], row: string[]): Record<string, string> {
  const o: Record<string, string> = {}
  for (let i = 0; i < headers.length; i++) o[headers[i]] = row[i] ?? ''
  return o
}

// ─── Save preview (status='preview') ───────────────────────────────────────

export async function savePreview(
  db: D1Database,
  user: { id: number; name: string } | null,
  sourceName: string,
  rawCsv: string,
  parsed: ParsedCsv,
  colMap: ColumnMap,
  classified: ClassifiedRow[],
): Promise<number> {
  const counts = tallyCounts(classified)
  const ins = await db.prepare(
    `INSERT INTO bulk_imports
     (status, source_name, raw_csv, detected_cols, total_rows,
      insert_count, update_count, skip_count, fuzzy_count,
      created_by_id, created_by_name)
     VALUES ('preview', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    sourceName,
    rawCsv.length > 200000 ? rawCsv.slice(0, 200000) : rawCsv, // cap at 200KB
    JSON.stringify(colMap),
    classified.length,
    counts.insert,
    counts.update,
    counts.skip,
    counts.fuzzy,
    user?.id ?? null,
    user?.name ?? null,
  ).run()
  const importId = Number(ins.meta.last_row_id)

  // Persist rows in batches
  for (const r of classified) {
    await db.prepare(
      `INSERT INTO bulk_import_rows
       (import_id, row_number, raw_data, action_taken, matched_item_id,
        match_score, match_reason, before_snapshot, after_snapshot,
        fields_touched, qty_delta, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      importId,
      r.rowNumber,
      JSON.stringify(r.raw),
      r.action,
      r.matchedItemId,
      r.matchScore,
      r.matchReason,
      r.beforeValues ? JSON.stringify(r.beforeValues) : null,
      Object.keys(r.newValues).length ? JSON.stringify(r.newValues) : null,
      r.changedFields.join(','),
      typeof r.newValues.qty_on_hand === 'number' && r.beforeValues
        ? r.newValues.qty_on_hand - r.beforeValues.qty_on_hand
        : null,
      r.notes.join(' | ') || null,
    ).run()
  }

  return importId
}

function tallyCounts(rows: ClassifiedRow[]) {
  let ins = 0, upd = 0, skp = 0, fz = 0
  for (const r of rows) {
    if (r.action === 'insert') ins++
    else if (r.action === 'update') upd++
    else skp++
    if (r.matchScore !== null && r.matchScore < 1) fz++
  }
  return { insert: ins, update: upd, skip: skp, fuzzy: fz }
}

// ─── Commit a preview (apply changes + write audit) ────────────────────────

export async function commitImport(
  db: D1Database,
  user: { id: number; name: string } | null,
  importId: number,
): Promise<{ inserted: number; updated: number; skipped: number; failed: number }> {
  const imp = await loadImport(db, importId)
  if (!imp) throw new Error(`Import ${importId} not found`)
  if (imp.status !== 'preview') throw new Error(`Import ${importId} status is ${imp.status} (expected preview)`)

  const rows = await loadImportRows(db, importId)

  let inserted = 0, updated = 0, skipped = 0, failed = 0
  const reason = `bulk_import #${importId}`

  for (const r of rows) {
    try {
      if (r.action_taken === 'skip') { skipped++; continue }

      const after = r.after_snapshot ? JSON.parse(r.after_snapshot) as Partial<StockRow> : {}
      const before = r.before_snapshot ? JSON.parse(r.before_snapshot) as StockRow : null

      if (r.action_taken === 'insert') {
        const ins = await db.prepare(
          `INSERT INTO stock_items
           (brand, description, qty_on_hand, location, notes, status,
            custody_type, low_stock_threshold, source_sheet, active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
        ).bind(
          after.brand ?? '',
          after.description ?? '',
          after.qty_on_hand ?? 0,
          after.location ?? null,
          after.notes ?? null,
          after.status ?? 'active',
          after.custody_type ?? 'owned',
          after.low_stock_threshold ?? null,
          `bulk_import_${importId}`,
        ).run()
        const newId = Number(ins.meta.last_row_id)

        // Update row record with the new id (so undo can delete it)
        await db.prepare(
          `UPDATE bulk_import_rows SET matched_item_id = ? WHERE id = ?`
        ).bind(newId, r.id).run()

        await logBulkMovement(db, newId, 'bulk_import', 'insert', null,
          `${after.brand} — ${after.description} (qty ${after.qty_on_hand ?? 0})`, null, reason, user)
        inserted++
      } else if (r.action_taken === 'update' && before && r.matched_item_id) {
        // Apply each touched field
        const fields = (r.fields_touched || '').split(',').filter(Boolean)
        for (const f of fields) {
          const newVal = (after as any)[f]
          // Build the UPDATE statement dynamically but safely (allow-listed fields only)
          if (!ALLOWED_UPDATE_FIELDS.has(f)) continue
          await db.prepare(
            `UPDATE stock_items SET ${f} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
          ).bind(newVal, r.matched_item_id).run()
          const oldVal = (before as any)[f]
          await logBulkMovement(db, r.matched_item_id, 'bulk_import', f, oldVal, newVal,
            f === 'qty_on_hand' && typeof oldVal === 'number' && typeof newVal === 'number'
              ? newVal - oldVal : null,
            reason, user)
        }
        updated++
      } else {
        skipped++
      }
    } catch (e) {
      failed++
      // record in row notes
      const note = `commit failed: ${(e as Error).message}`
      await db.prepare(
        `UPDATE bulk_import_rows SET notes = COALESCE(notes, '') || ? WHERE id = ?`
      ).bind(' | ' + note, r.id).run()
    }
  }

  await db.prepare(
    `UPDATE bulk_imports
     SET status = 'committed', committed_at = CURRENT_TIMESTAMP,
         insert_count = ?, update_count = ?, skip_count = ?
     WHERE id = ?`
  ).bind(inserted, updated, skipped + failed, importId).run()

  return { inserted, updated, skipped, failed }
}

const ALLOWED_UPDATE_FIELDS = new Set([
  'brand', 'description', 'qty_on_hand', 'location', 'notes',
  'status', 'custody_type', 'low_stock_threshold',
])

// ─── Undo a committed import ────────────────────────────────────────────────

export async function undoImport(
  db: D1Database,
  user: { id: number; name: string } | null,
  importId: number,
): Promise<{ reverted: number; deletions: number; restorations: number; failed: number }> {
  const imp = await loadImport(db, importId)
  if (!imp) throw new Error(`Import ${importId} not found`)
  if (imp.status !== 'committed') throw new Error(`Import ${importId} is ${imp.status} — only committed imports can be undone`)

  const rows = await loadImportRows(db, importId)
  const reason = `undo bulk_import #${importId}`

  let deletions = 0, restorations = 0, failed = 0

  for (const r of rows) {
    try {
      if (r.action_taken === 'skip') continue

      if (r.action_taken === 'insert' && r.matched_item_id) {
        // Soft-delete the inserted row
        const cur = await db.prepare(
          `SELECT id, brand, description FROM stock_items WHERE id = ?`
        ).bind(r.matched_item_id).first<{ id: number; brand: string; description: string }>()
        if (cur) {
          await db.prepare(
            `UPDATE stock_items SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
          ).bind(r.matched_item_id).run()
          await logBulkMovement(db, r.matched_item_id, 'bulk_import_undo', 'active', 1, 0, null, reason, user)
          deletions++
        }
      } else if (r.action_taken === 'update' && r.matched_item_id && r.before_snapshot) {
        const before = JSON.parse(r.before_snapshot) as StockRow
        const fields = (r.fields_touched || '').split(',').filter(Boolean)
        for (const f of fields) {
          if (!ALLOWED_UPDATE_FIELDS.has(f)) continue
          const oldVal = (before as any)[f]
          // Read current value so audit log captures the actual reverse
          const cur = await db.prepare(
            `SELECT ${f} as v FROM stock_items WHERE id = ?`
          ).bind(r.matched_item_id).first<{ v: any }>()
          await db.prepare(
            `UPDATE stock_items SET ${f} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
          ).bind(oldVal, r.matched_item_id).run()
          await logBulkMovement(db, r.matched_item_id, 'bulk_import_undo', f, cur?.v, oldVal,
            f === 'qty_on_hand' && typeof cur?.v === 'number' && typeof oldVal === 'number'
              ? oldVal - cur.v : null,
            reason, user)
        }
        restorations++
      }
    } catch (e) {
      failed++
    }
  }

  await db.prepare(
    `UPDATE bulk_imports
     SET status = 'undone', undone_at = CURRENT_TIMESTAMP, undone_by_name = ?
     WHERE id = ?`
  ).bind(user?.name ?? null, importId).run()

  return { reverted: deletions + restorations, deletions, restorations, failed }
}

// ─── Audit log writer (mirrors stock-admin's logMovement) ──────────────────

async function logBulkMovement(
  db: D1Database,
  stockItemId: number,
  action: string,
  field: string | null,
  oldValue: any,
  newValue: any,
  delta: number | null,
  reason: string | null,
  user: { id: number; name: string } | null,
): Promise<void> {
  let d = delta
  if (d === null && field === 'qty_on_hand') {
    const o = parseInt(String(oldValue ?? '0'), 10)
    const n = parseInt(String(newValue ?? '0'), 10)
    if (Number.isFinite(o) && Number.isFinite(n)) d = n - o
  }
  await db.prepare(
    `INSERT INTO stock_movements
     (stock_item_id, action, field_changed, old_value, new_value, delta, reason, user_id, user_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    stockItemId, action, field,
    oldValue === null || oldValue === undefined ? null : String(oldValue),
    newValue === null || newValue === undefined ? null : String(newValue),
    d, reason, user?.id ?? null, user?.name ?? null,
  ).run()
}

// ─── Loaders ────────────────────────────────────────────────────────────────

export async function loadImport(db: D1Database, importId: number): Promise<BulkImport | null> {
  const row = await db.prepare(
    `SELECT * FROM bulk_imports WHERE id = ?`
  ).bind(importId).first<BulkImport>()
  return row || null
}

export async function loadImportRows(db: D1Database, importId: number): Promise<BulkImportRow[]> {
  const res = await db.prepare(
    `SELECT * FROM bulk_import_rows WHERE import_id = ? ORDER BY row_number ASC`
  ).bind(importId).all<BulkImportRow>()
  return res.results || []
}

export async function listRecentImports(db: D1Database, limit = 20): Promise<BulkImport[]> {
  const res = await db.prepare(
    `SELECT * FROM bulk_imports ORDER BY created_at DESC LIMIT ?`
  ).bind(limit).all<BulkImport>()
  return res.results || []
}

export async function discardPreview(db: D1Database, importId: number): Promise<void> {
  const imp = await loadImport(db, importId)
  if (!imp) return
  if (imp.status === 'preview') {
    await db.prepare(`UPDATE bulk_imports SET status = 'discarded' WHERE id = ?`).bind(importId).run()
  }
}

// Helper to know if an import is still "undo-able" (≤24h since commit)
export function canUndo(imp: BulkImport, nowMs = Date.now()): boolean {
  if (imp.status !== 'committed') return false
  if (!imp.committed_at) return false
  const t = Date.parse(imp.committed_at.replace(' ', 'T') + 'Z')
  if (!Number.isFinite(t)) return false
  return (nowMs - t) <= 24 * 60 * 60 * 1000
}
