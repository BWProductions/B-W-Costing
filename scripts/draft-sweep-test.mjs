#!/usr/bin/env node
/**
 * Draft Sweep Test — Option A
 * --------------------------------------------------------------------------
 * Pushes 10 synthetic delivery drafts through /field/draft/save with varied
 * payloads, then opens each one and verifies via the rendered HTML that:
 *   - driver pulled through
 *   - team_members pulled through
 *   - casuals pulled through
 *   - vehicle 2 + driver pulled through
 *   - line_items count matches
 *   - other_items count matches
 *   - no obvious render failures
 *
 * Then DELETES every test draft from D1 so the dashboard stays clean.
 */

const BASE = 'https://bwprodsystem.co.za'

const DRIVERS_KNOWN = ['Jay','Daniel','Patrick','Tucker','Sipho','Solly','Eric']
const TEAM_KNOWN    = ['Daniel','Erance','Eric','Isaac','Joshua','Patrick','Sipho','Solly','Bernie','Bibi','Jocelyn','Marna','Thandi','Tina']

const BRANDS = [
  'Castle Lite','Castle Lager','Stella Artois','MxD','Carling Black Label',
  'Hansa','Flying Fish','Corona','Mixed / Multiple','None / Generic'
]

const CATALOGUE_ITEMS = [
  'Umbrella — Stella','Umbrella — Castle Lite','Umbrella Base — Concrete',
  'Bench Set','Couch — 3 Seater','Cafe Table','Trestle Table','Cocktail Chair',
  'Gazebo','Stage','DJ Booth','Wall Banner / Media Wall 3mx2m','Backwall',
  'Speed Bar','Premium Bar','Bar Counter','Steel Tops',
  'Fridge','MxD Fridge','Ice Bin','Ice Bucket',
  'Pull-up Banner','Wall Banner / Media Wall','Feather Banner / Teardrop / Flag',
  'Set of Letters','Graffiti Wall','PIR Branded Clothing',
  'Moving Heads','Battery Parcans','Smoke Machine + Liquid','LED Screen',
  '55" TV Screen','PA System','JBL SRX Speakers',
  'Stanchion Poles — Silver','Stanchion Rope — Red',
  'Multiplugs','20m Extension','Bunded Generator',
  'View Finder','Tromel Draw Drum','Plinka Machine','Push Button Game',
  'Prize Examples','MxD Spinning Wheel',
  'iPads','Wall Banner Frames','Black Bags'
]
const NOT_IN_CATALOGUE_ITEMS = [
  'Custom Banner Stand','Bespoke Beer Tower','Imported LED Strip',
  'Branded Confetti Cannon','One-off Prop','Dance Floor Tiles'
]
const VEHICLES = [
  'MB10JLGP','MB59SBGP','MB39CRGP','LS43NLGP','CZ41WWGP','BW63NNGP',
  'FC89PNGP','FG51RGGP','DG59PSGP','DM29KPGP','VJC119GP'
]
const VENUES = ['Sun Square Hotel','Cape Town Stadium','Sandton Convention Centre',
  'Durban ICC','Pretoria Showgrounds','Mall of Africa','Gold Reef City','Hout Bay']
const EVENTS = ['Castle Lite Unlocks','Stella Soirée','MxD Activation','SAB Trade Day',
  'Corona SunSets','PIR Roadshow','Carling Black Label Friday']

// ── helpers ────────────────────────────────────────────────────────────────
const pick    = (arr) => arr[Math.floor(Math.random() * arr.length)]
const pickN   = (arr, n) => {
  const c = [...arr]; const out = []
  for (let i = 0; i < n && c.length; i++) out.push(c.splice(Math.floor(Math.random()*c.length), 1)[0])
  return out
}
const rand    = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1))
const escRe   = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// ── test scenarios ─────────────────────────────────────────────────────────
function buildScenarios() {
  return [
    {
      name: 'A: Standard SAB delivery — Jay + Daniel + 5 catalogue items',
      driver: 'Jay', team: ['Daniel'], casuals: [], vehicle2: null,
      itemCount: 5, includeOffCatalogue: false, otherCount: 2, brand: 'None / Generic'
    },
    {
      name: 'B: Small crew — Patrick driver + 2 teammates + 8 items mixed brands',
      driver: 'Patrick', team: ['Sipho','Solly'], casuals: [], vehicle2: null,
      itemCount: 8, includeOffCatalogue: false, otherCount: 3, brand: 'Castle Lite'
    },
    {
      name: 'C: Big PIR — Tucker + 4 team + 1 casual + 14 items + MxD brand',
      driver: 'Tucker', team: ['Daniel','Eric','Isaac','Joshua'], casuals: ['Casual John'], vehicle2: null,
      itemCount: 14, includeOffCatalogue: true, otherCount: 5, brand: 'MxD'
    },
    {
      name: 'D: Two-vehicle — Eric driver + Sipho v2 driver + 3 team + 10 items',
      driver: 'Eric', team: ['Patrick','Solly','Bernie'], casuals: [],
      vehicle2: { reg: 'BW63NNGP', driver: 'Sipho' },
      itemCount: 10, includeOffCatalogue: false, otherCount: 0, brand: 'Castle Lager'
    },
    {
      name: 'E: All-female team — Bibi prep + Jocelyn/Marna/Thandi + 6 items',
      driver: 'Daniel', team: ['Jocelyn','Marna','Thandi'], casuals: [], vehicle2: null,
      itemCount: 6, includeOffCatalogue: false, otherCount: 1, brand: 'Stella Artois'
    },
    {
      name: 'F: Off-catalogue heavy — 3 catalogue + 4 custom items',
      driver: 'Jay', team: ['Daniel','Tina'], casuals: [], vehicle2: null,
      itemCount: 7, includeOffCatalogue: true, otherCount: 4, brand: 'Mixed / Multiple'
    },
    {
      name: 'G: Two casuals + 2 teammates — stress casual restore',
      driver: 'Patrick', team: ['Daniel','Eric'], casuals: ['Casual Mike','Casual Zola'], vehicle2: null,
      itemCount: 5, includeOffCatalogue: false, otherCount: 2, brand: 'Hansa'
    },
    {
      name: 'H: Custom v2 reg — non-fleet vehicle',
      driver: 'Sipho', team: ['Daniel'], casuals: [], vehicle2: { reg: 'XX99TEST', driver: 'Custom Driver Name' },
      itemCount: 4, includeOffCatalogue: false, otherCount: 1, brand: 'Corona'
    },
    {
      name: 'I: Maximum payload — 6 team + 2 casuals + 18 items + 8 other',
      driver: 'Tucker',
      team: ['Daniel','Eric','Isaac','Joshua','Patrick','Sipho'],
      casuals: ['Casual A','Casual B'],
      vehicle2: { reg: 'FC89PNGP', driver: 'Solly' },
      itemCount: 18, includeOffCatalogue: true, otherCount: 8, brand: 'Castle Lite'
    },
    {
      name: 'J: Single item edge case — 1 line + 1 teammate',
      driver: 'Jay', team: ['Daniel'], casuals: [], vehicle2: null,
      itemCount: 1, includeOffCatalogue: false, otherCount: 0, brand: 'None / Generic'
    }
  ]
}

function buildPayload(s, idx) {
  const items = []
  const cat = pickN(CATALOGUE_ITEMS, Math.min(s.itemCount, CATALOGUE_ITEMS.length))
  for (let i = 0; i < cat.length; i++) {
    items.push({
      item_name: cat[i], quantity: rand(1, 12),
      brand: i % 3 === 0 ? s.brand : 'None / Generic',
      condition: 'Checked', comments: ''
    })
  }
  if (s.includeOffCatalogue) {
    for (const x of pickN(NOT_IN_CATALOGUE_ITEMS, 2)) {
      items.push({ item_name: x, quantity: rand(1,4), brand: s.brand, condition: 'Checked', comments: '' })
    }
  }
  const others = []
  for (let i = 0; i < s.otherCount; i++) {
    others.push({ description: 'Sweep test misc item ' + (i+1), quantity: rand(1, 6) })
  }

  return {
    form_type: 'delivery',
    letterhead: 'sab',
    prepared_by: 'Shane',
    driver: s.driver,
    vehicle_reg: pick(VEHICLES),
    vehicle2_reg: s.vehicle2 ? s.vehicle2.reg : '',
    vehicle2_driver: s.vehicle2 ? s.vehicle2.driver : '',
    team_members: s.team.join(', '),
    casuals: s.casuals.join(', '),
    client: 'South African Breweries',
    venue: '⚙️ SWEEP TEST ' + (idx+1) + ' — ' + pick(VENUES),
    event_name: pick(EVENTS),
    address: '',
    attention: 'Test Contact',
    contact_number: '0820000000',
    delivery_date: '2026-06-15',
    collection_date: '2026-06-20',
    form_brand: s.brand,
    notes: '🧪 Auto-generated test draft — safe to delete.',
    line_items: items,
    other_items: others
  }
}

// ── runner ─────────────────────────────────────────────────────────────────
async function postDraft(payload) {
  const res = await fetch(BASE + '/field/draft/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  return res.json()
}

async function fetchOpenPage(id) {
  const res = await fetch(BASE + '/field/delivery/open/' + id)
  return res.text()
}

function checkRender(html, payload) {
  const checks = {}

  // Saved JS variables embedded in the page
  const grab = (re) => { const m = html.match(re); return m ? m[1] : null }

  const savedTeam     = grab(/var _savedTeam\s*=\s*"([^"]*)"/)
  const savedCasuals  = grab(/var _savedCasuals\s*=\s*"([^"]*)"/)
  const savedV2       = grab(/var _savedVehicle2\s*=\s*"([^"]*)"/)
  const savedV2Driver = grab(/var _savedVehicle2Driver\s*=\s*"([^"]*)"/)
  const savedBrand    = grab(/var _savedBrand\s*=\s*"([^"]*)"/)

  // Driver renders into the <select> as the selected <option>
  const driverSel = html.match(/<select name="driver"[^>]*>([\s\S]*?)<\/select>/)
  const driverSelected = driverSel ? (driverSel[1].match(/<option[^>]*value="([^"]+)"[^>]*selected/)?.[1] || '') : ''

  // line items count from preItemsJson
  const preItemsMatch = html.match(/var _preItems\s*=\s*(\[[\s\S]*?\])\s*\n/)
  let preItemsLen = -1
  try { preItemsLen = preItemsMatch ? JSON.parse(preItemsMatch[1]).length : -1 } catch {}

  const preOtherMatch = html.match(/var _preOtherItems\s*=\s*(\[[\s\S]*?\])\s*\n/)
  let preOtherLen = -1
  try { preOtherLen = preOtherMatch ? JSON.parse(preOtherMatch[1]).length : -1 } catch {}

  checks.driver        = driverSelected === payload.driver
  checks.team          = (savedTeam || '') === (payload.team_members || '')
  checks.casuals       = (savedCasuals || '') === (payload.casuals || '')
  checks.v2_reg        = (savedV2 || '') === (payload.vehicle2_reg || '')
  checks.v2_driver     = (savedV2Driver || '') === (payload.vehicle2_driver || '')
  checks.brand         = (savedBrand || '') === (payload.form_brand || '')
  checks.items_count   = preItemsLen === payload.line_items.length
  checks.others_count  = preOtherLen === payload.other_items.length

  return {
    checks,
    snapshot: {
      driverSelected, savedTeam, savedCasuals, savedV2, savedV2Driver, savedBrand,
      preItemsLen, preOtherLen
    }
  }
}

async function deleteDraftDirect(id) {
  // Use wrangler d1 to delete (rather than authenticated UI route)
  const { execSync } = await import('node:child_process')
  try {
    execSync(`cd /home/user/webapp && npx wrangler d1 execute bw-productions-db --remote --command="DELETE FROM field_line_items WHERE submission_id=${id}; DELETE FROM field_suggested_items WHERE submission_id=${id}; DELETE FROM field_submissions WHERE id=${id} AND is_draft=1"`,
      { stdio: 'pipe' })
    return true
  } catch (e) { return false }
}

// ── main ───────────────────────────────────────────────────────────────────
const scenarios = buildScenarios()
const results = []
const createdIds = []

console.log('\n🧪 Draft Sweep Test — running ' + scenarios.length + ' scenarios\n')

for (let i = 0; i < scenarios.length; i++) {
  const s = scenarios[i]
  process.stdout.write('  [' + (i+1).toString().padStart(2,' ') + '/' + scenarios.length + '] ' + s.name + ' … ')
  const payload = buildPayload(s, i)

  const saveRes = await postDraft(payload)
  if (!saveRes.success) {
    console.log('❌ SAVE FAILED — ' + (saveRes.error || 'unknown'))
    results.push({ scenario: s.name, ok: false, stage: 'save', error: saveRes.error })
    continue
  }
  const id = saveRes.draft_id
  createdIds.push(id)

  const html = await fetchOpenPage(id)
  const verdict = checkRender(html, payload)
  const allOk = Object.values(verdict.checks).every(Boolean)

  if (allOk) {
    console.log('✅ #' + id + ' (' + saveRes.form_number + ')')
  } else {
    const failed = Object.entries(verdict.checks).filter(([_,v]) => !v).map(([k]) => k)
    console.log('⚠️  #' + id + ' — failed: ' + failed.join(', '))
    console.log('     snapshot:', JSON.stringify(verdict.snapshot))
  }
  results.push({ scenario: s.name, id, form_number: saveRes.form_number, ok: allOk, checks: verdict.checks, snapshot: verdict.snapshot })
}

// ── summary ────────────────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────────────────────')
const passed = results.filter(r => r.ok).length
const failed = results.length - passed
console.log('  Result: ' + passed + ' passed · ' + failed + ' failed (out of ' + results.length + ')')
console.log('────────────────────────────────────────────────────────')

if (failed > 0) {
  console.log('\nFailed scenarios:')
  results.filter(r => !r.ok).forEach(r => {
    console.log('  • ' + r.scenario)
    if (r.checks) {
      Object.entries(r.checks).filter(([_,v]) => !v).forEach(([k]) => console.log('      ✗ ' + k))
    }
  })
}

// ── cleanup ────────────────────────────────────────────────────────────────
console.log('\n🧹 Cleaning up ' + createdIds.length + ' test drafts from D1…')
let deleted = 0
for (const id of createdIds) {
  if (await deleteDraftDirect(id)) deleted++
}
console.log('   Deleted ' + deleted + '/' + createdIds.length + ' drafts.')

console.log('\n✨ Done.\n')
process.exit(failed > 0 ? 1 : 0)
