#!/usr/bin/env node
/**
 * Import venues from the three uploaded CSVs into D1 field_venues.
 *  - BW_SAB_Sites.csv     → SAB depots/breweries/HQs
 *  - BW_Rugby_2026.csv    → 2026 fixture stadiums (dedup across multi-fixture venues)
 *  - BW_Deliveries.csv    → historical delivery venues (with attention contact)
 *
 * Strategy:
 *  1. Parse each file (RFC-4180 quoted-comma handling).
 *  2. Normalise venue names (strip trailing tags like "(KO 17:40)", "— phone 011…").
 *  3. Dedupe by lowercased name; if dupes have different addresses keep the longer one.
 *  4. Emit a single SQL file of INSERTs and execute via wrangler d1.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

// ── tiny CSV parser (handles quoted fields with embedded commas) ───────────
function parseCsv(txt) {
  const rows = []
  let row = [], cell = '', inQ = false
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i]
    if (inQ) {
      if (ch === '"' && txt[i+1] === '"') { cell += '"'; i++ }
      else if (ch === '"') inQ = false
      else cell += ch
    } else {
      if (ch === '"') inQ = true
      else if (ch === ',') { row.push(cell); cell = '' }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
      else if (ch === '\r') {} // skip
      else cell += ch
    }
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row) }
  return rows.filter(r => r.some(c => c.trim()))
}

function toObjects(rows) {
  const [header, ...body] = rows
  return body.map(r => Object.fromEntries(header.map((h,i) => [h.trim(), (r[i]||'').trim()])))
}

// ── normalisers ────────────────────────────────────────────────────────────
function cleanName(n) {
  return n
    .replace(/\s*\(KO\s+\d{1,2}:\d{2}\)/i, '')      // "(KO 17:40)"
    .replace(/\s*—\s*\d{2,4}[\s\d]+\d{4}.*$/, '')   // " — 064 803 9113"
    .replace(/\s*—\s*Tel\s+.*$/i, '')               // " — Tel 011 …"
    .replace(/\s*\(Collection\)\s*$/i, ' (Collection)')  // keep but normalise
    .replace(/\s+/g, ' ')
    .trim()
}
function cleanAddress(a) {
  return a
    .replace(/\s*—\s*Tel\s+[\d\s]+/i, '')           // strip phone numbers
    .replace(/\s*—\s*switchboard\s+[\d\s]+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}
function classifySabType(t) {
  const x = (t||'').toLowerCase()
  if (x.includes('head office') || x.includes('hq')) return 'office'
  if (x.includes('brewery'))     return 'brewery'
  if (x.includes('depot'))       return 'depot'
  return 'venue'
}
function classifyRugby() { return 'stadium' }
function classifyDelivery(name) {
  const x = (name||'').toLowerCase()
  if (x.includes('(collection)')) return 'collection'
  if (x.includes('mall'))         return 'mall'
  if (x.includes('stadium'))      return 'stadium'
  if (x.includes('monument'))     return 'venue'
  return 'venue'
}

// ── load each CSV ──────────────────────────────────────────────────────────
const venues = new Map() // key: name_lower → record
function add(rec) {
  const key = rec.name.toLowerCase().trim()
  if (!key) return
  if (!venues.has(key)) {
    venues.set(key, rec)
  } else {
    // Merge: keep the longer address, fill missing fields
    const cur = venues.get(key)
    if (rec.address.length > cur.address.length) cur.address = rec.address
    if (!cur.region && rec.region)               cur.region = rec.region
    if (!cur.postal_code && rec.postal_code)     cur.postal_code = rec.postal_code
    if (!cur.attention_default && rec.attention_default) cur.attention_default = rec.attention_default
    if (!cur.venue_type && rec.venue_type)       cur.venue_type = rec.venue_type
  }
}

// ─── 1. SAB sites ───
{
  const txt = readFileSync('/home/user/uploaded_files/BW_SAB_Sites.csv', 'utf8')
  const objs = toObjects(parseCsv(txt))
  for (const o of objs) {
    add({
      name: cleanName(o['Site']),
      address: cleanAddress(o['Address']),
      region: o['Province / Region'] || '',
      postal_code: o['Postal Code'] || '',
      attention_default: '',
      notes: '',
      source: 'sab',
      venue_type: classifySabType(o['Type']),
    })
  }
}

// ─── 2. Rugby fixtures ───
{
  const txt = readFileSync('/home/user/uploaded_files/BW_Rugby_2026.csv', 'utf8')
  const objs = toObjects(parseCsv(txt))
  for (const o of objs) {
    add({
      name: cleanName(o['Venue']),
      address: cleanAddress(o['Address']),
      region: o['Country/Province'] || '',
      postal_code: o['Postal Code'] || '',
      attention_default: '',
      notes: '',
      source: 'rugby',
      venue_type: classifyRugby(),
    })
  }
}

// ─── 3. Historical deliveries ───
{
  const txt = readFileSync('/home/user/uploaded_files/BW_Deliveries.csv', 'utf8')
  const objs = toObjects(parseCsv(txt))
  for (const o of objs) {
    const name = cleanName(o['Venue / Company'])
    if (!name) continue
    add({
      name,
      address: cleanAddress(o['Address']),
      region: o['Province'] || '',
      postal_code: o['Postal Code'] || '',
      attention_default: cleanAddress(o['Attention'] || ''),
      notes: '',
      source: 'deliveries',
      venue_type: classifyDelivery(name),
    })
  }
}

// ── emit SQL ───────────────────────────────────────────────────────────────
const list = [...venues.values()].sort((a,b) => a.name.localeCompare(b.name))
console.log('Parsed ' + list.length + ' unique venues from 3 CSVs.')

const sqlEsc = (s) => "'" + String(s||'').replace(/'/g, "''") + "'"
const inserts = list.map(v => `INSERT INTO field_venues
  (name, name_lower, address, region, postal_code, attention_default, notes, source, venue_type)
  VALUES (${sqlEsc(v.name)}, ${sqlEsc(v.name.toLowerCase())}, ${sqlEsc(v.address)},
          ${sqlEsc(v.region)}, ${sqlEsc(v.postal_code)}, ${sqlEsc(v.attention_default)},
          ${sqlEsc(v.notes)}, ${sqlEsc(v.source)}, ${sqlEsc(v.venue_type)});`).join('\n')

const sqlPath = '/tmp/import-venues.sql'
writeFileSync(sqlPath, '-- auto-generated venue import\n' + inserts + '\n')
console.log('SQL written to ' + sqlPath + ' (' + inserts.split('\n').length + ' statements)')

// ── execute via wrangler ───────────────────────────────────────────────────
console.log('\nExecuting against remote D1…')
try {
  const out = execSync(`cd /home/user/webapp && npx wrangler d1 execute bw-productions-db --remote --file=${sqlPath} 2>&1`, { encoding: 'utf8' })
  console.log(out.split('\n').slice(-10).join('\n'))
} catch(e) {
  console.error('FAILED:', e.message)
  process.exit(1)
}

// ── show what got inserted ─────────────────────────────────────────────────
console.log('\nRecap (first 10 by region):')
console.log('─────────────────────────────────────────────────────────────────────')
const byRegion = {}
for (const v of list) {
  byRegion[v.region || '(unknown)'] = (byRegion[v.region || '(unknown)'] || 0) + 1
}
for (const [r, n] of Object.entries(byRegion).sort((a,b) => b[1]-a[1])) {
  console.log(`  ${r.padEnd(20, ' ')}  ${n}`)
}
console.log('─────────────────────────────────────────────────────────────────────')
console.log('Total: ' + list.length)
