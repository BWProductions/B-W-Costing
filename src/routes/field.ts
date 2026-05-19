// B&W Productions — Field Operations App
// 5 forms: Delivery Note, Collection Note, Repair Note, Vehicle Inspection, Shortlist
// No login required — public URL

import { Hono } from 'hono'
import { verifySessionToken, getCookieValue } from '../lib/auth.js'

type Env = { Bindings: {
  DB: D1Database
  ANTHROPIC_API_KEY: string
  PDFSHIFT_API_KEY: string       // legacy — kept as fallback during transition
  URLBOX_PUBLISHABLE_KEY: string
  URLBOX_SECRET_KEY: string
  URLBOX_WEBHOOK_SECRET: string
  PDF_BUCKET: R2Bucket
} }
const app = new Hono<Env>()

// ─── SEPARATE FLEET APPS ──────────────────────────────────────────────────────
// Public, no-auth landing pages for the Music Bus and DJ Drivers fleets.
// Mounted at /musicbus and /djdrivers in src/index.tsx. They share helpers
// (INSPECTION_ITEMS, formHeader, signatureScript, etc.) defined further down
// in this file, which is why they live here rather than in a sibling module.
const musicbusApp = new Hono<Env>()

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

// ─── PEOPLE DIRECTORY ────────────────────────────────────────────────────────
// Males A-Z first, Females A-Z at the bottom
// isDriver = appears in Driver dropdown
// isTeam   = appears in Team Member dropdown
const PEOPLE_DIR = [
  // ── Males (A-Z) ──────────────────────────────────────────────────────────
  { name: 'Beki',     gender: 'M', isDriver: true,  isTeam: true  },
  { name: 'Bibi',     gender: 'M', isDriver: false, isTeam: true  },
  { name: 'Daniel',   gender: 'M', isDriver: true,  isTeam: true  },
  { name: 'Eric',     gender: 'M', isDriver: false, isTeam: true  },
  { name: 'Erence',   gender: 'M', isDriver: false, isTeam: true  },
  { name: 'Isaac',    gender: 'M', isDriver: false, isTeam: true  },
  { name: 'Jay',      gender: 'M', isDriver: true,  isTeam: true  },
  { name: 'Joshua',   gender: 'M', isDriver: true,  isTeam: true  },
  { name: 'Patrick',  gender: 'M', isDriver: true,  isTeam: true  },
  { name: 'Sipho',    gender: 'M', isDriver: true,  isTeam: true  },
  { name: 'Solly',    gender: 'M', isDriver: true,  isTeam: true  },
  { name: 'Takka',    gender: 'M', isDriver: false, isTeam: true  },
  { name: 'Thandani', gender: 'M', isDriver: true,  isTeam: true  },
  { name: 'Thina',    gender: 'M', isDriver: true,  isTeam: true  },
  // ── Females (A-Z) ────────────────────────────────────────────────────────
  { name: 'Bernie',   gender: 'F', isDriver: false, isTeam: true  },
  { name: 'Girlie',   gender: 'F', isDriver: false, isTeam: true  },
  { name: 'Jocelyn',  gender: 'F', isDriver: false, isTeam: true  },
  { name: 'Marna',    gender: 'F', isDriver: false, isTeam: true  },
  { name: "Shane'",   gender: 'F', isDriver: false, isTeam: true  },
]

// Convenience arrays derived from PEOPLE_DIR
const PEOPLE   = PEOPLE_DIR.map(p => p.name)
const DRIVERS  = PEOPLE_DIR.filter(p => p.isDriver).map(p => p.name)
const TEAM_MALES   = PEOPLE_DIR.filter(p => p.isTeam && p.gender === 'M').map(p => p.name)
const TEAM_FEMALES = PEOPLE_DIR.filter(p => p.isTeam && p.gender === 'F').map(p => p.name)

const BRANDS = [
  'Castle Lite','Castle Lager','Castle Double Malt (CDM)','Castle Milk Stout',
  'Stella Artois','MxD','Carling Black Label',
  'Hansa','Flying Fish','Corona','Brutal Fruit','Guinness',
  'Mixed / Multiple','None / Generic'
]

const ITEM_CATEGORIES: Record<string, string[]> = {
  '☂️ Umbrellas': [
    'Umbrella — Stella','Umbrella — Castle Lite','Umbrella — Castle Lager',
    'Umbrella — MxD','Umbrella — Carling Black Label','Umbrella — Hansa',
    'Umbrella — Flying Fish','Umbrella — Corona','Umbrella — Brutal Fruit',
    'Umbrella — Generic','Umbrella Base — Rubber','Umbrella Base — Concrete'
  ],
  '🪑 Furniture': [
    'Bench Set','Couch — 3 Seater','Couch — 2 Seater','Couch — 1 Seater',
    'Cushions','Lounge Pod Set (3+2+1 + Coffee Table)','Cafe Table','Cafe Chair',
    'Cafe Round Table','Side Table','Conversation Table','Cocktail Chair',
    'Coffee Table','Trestle Table','Welcome Mat','Branded Runner','Rug','Carpet',
    'Red Carpet','60-Seater Wooden Furniture Set','Set of Couch Pockets',
    'Scatter Pillows','Blue Mat'
  ],
  '⛺ Structures': [
    'Gazebo','Stretch Tent 10x15m','Stage','DJ Booth','Photo Moment + Couch',
    'Throne','Big White Throne (Snowflake)','Side Table for Throne',
    'Entrance Arch + Lights','Wall Banner / Media Wall 3mx2m','Backwall',
    'Pool Noodle Wall','Set Truss 3m','Telescopics + Bases','Totem Truss',
    '2m Totems with Stands','Tower Poles'
  ],
  '🍺 Bar': [
    'Speed Bar','Speed Bar Wrap','Premium Bar','Premium Bar with Fronts',
    'Premium Bar Fronts','Premium Front Bar','Back of Bar','LED Back of Bar',
    'Bar Counter','Bar Counter Top','Bar Counter Bottom','Bar Door 16/16',
    'Steel Tops','4m Premium Bar with Back of Bar','CBL DJ Box','CBL Setup',
    'Premium CBL DJ Box'
  ],
  '❄️ Cold Storage': [
    'Fridge','MxD Fridge','Ice Bin','Ice Bucket','MxD Ice Bucket'
  ],
  '🎯 Branding & Signage': [
    'Pull-up Banner','Wall Banner / Media Wall','Feather Banner / Teardrop / Flag',
    'Hanging Banner 1m','Hanging Banner 2m','Set of Letters','Castle Lite Letters',
    'Bar Wrap — Castle Lite','Bar Wrap — Castle Lager','Bar Wrap — MxD','Bar Wrap — Generic',
    'Wristbands','Sticker Pack','T-Shirts','16GB Memory Sticks','Drink Vouchers',
    'Promoter Outfits','Graffiti Wall','PIR Branded Clothing','SAB Shop Signage',
    'Welcome to Retailer Signage','Table Talkers'
  ],
  '💡 Lighting & AV': [
    'Moving Heads','Gobo Lights','Globe Lights','Clay Party (Gobo)','UV Lights',
    'Tube Lights','Parcans','Battery Parcans','Hazer','Smoke Machine + Liquid',
    'Steamer','LED Screen','LED Bar','LED Table Art','Sound Equipment','PA System',
    'Mic Cables','Mics + Receivers','JBL SRX Speakers','Event Lighting',
    'Stage Lighting','Fishing Gut (Rigging)','55" TV Screen'
  ],
  '🚧 Crowd Control': [
    'Stanchion Poles — Silver','Stanchion Poles — Standard',
    'Stanchion Rope — Red','Stanchion Rope — White','Stanchion Rope — Green',
    'Red Ropes','Extension Poles','Picket Fence Panels'
  ],
  '⚡ Power': [
    'Multiplugs','20m Extension','Kettle Plugs','Bunded Generator','Fuel Card'
  ],
  '🎮 Activations & Games': [
    'MxD Spinning Wheel','Plinka Machine','Push Button Game','View Finder',
    'Kiosk Box + Prizes','Tromel Draw Drum','3-Bowl Slush Machine','Cups + Straws',
    'Donkey Kong Arcade','Super Mario Arcade','Pac-Man Arcade','2-Player Button Box',
    'Lollipop Stand','Prize Examples','MxD Stock Prizes','3D Print Ultra Floor Sensor'
  ],
  '📦 Logistics': [
    'Set of Keys (Vehicle/Generator)','iPads','Wall Banner Frames','Jerry Cans',
    'Backdrops (Bunded)','Slings in a Box','Black Bags','Boxes for Cups'
  ]
}

const INSPECTION_ITEMS = [
  'All front lights','Indicators','Wipers','All tail lights','Hooter','License',
  'Biometric Scanner','Registration plate','Rear view mirrors','Windscreen',
  'Water and oil leaks','Battery','Doors and handles','Windows and handles',
  'Seats','Interior / Upholstery','Tyres (min 3mm tread)','Paintwork',
  'Spare wheel','Tools','Jack','Wheel spanner','Triangle','Radio','Minor damage',
  'Brakes','Hand brake','Kilometres','Water caps','Service book','Last service done'
]

const CONDITION_OPTIONS = ['Checked','Faulty','Damaged','Replacement']

const VEHICLES = [
  { reg: 'MB10JLGP',  desc: 'Isuzu Bakkie No. 1' },
  { reg: 'MB59SBGP',  desc: 'Isuzu Bakkie No. 2' },
  { reg: 'MB39CRGP',  desc: 'FAW Truck No. 5' },
  { reg: 'LS43NLGP',  desc: 'FAW Truck No. 4' },
  { reg: 'CZ41WWGP',  desc: 'Hino Truck No. 6 — Snowy' },
  { reg: 'BW63NNGP',  desc: 'Hyundai Black Truck No. 8' },
  { reg: 'FC89PNGP',  desc: 'MAN Truck — Castle Lager' },
  { reg: 'FG51RGGP',  desc: 'Mercedes No. 12' },
  { reg: 'DG59PSGP',  desc: 'Mercedes No. 9' },
  { reg: 'CB55PVGP',  desc: 'Black Tata No. 7' },
  { reg: 'CB56PRGP',  desc: 'Black Tata' },
  { reg: 'DM29KPGP',  desc: 'VW/VE No. 10' },
  { reg: 'VJC119GP',  desc: 'New Black Truck' },
  { reg: 'FD38HVGP',  desc: 'Bibi Car' },
  { reg: 'LZ56SSGP',  desc: 'Isuzu Bakkie — Sipho Car' },
]

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

// ─── VEHICLE SHORT-NAME LOOKUP ───────────────────────────────────────────────
// Used by the PDF filename builder so that WhatsApp recipients see a human-
// readable nickname (e.g. "BIG FAW TRUCK NO 4", "BIBI CAR") instead of just a
// reg plate. Returns '' if nothing matches — the filename builder treats that
// as "skip the short-name segment" so the file still gets a sensible name.
//
//  inspection / repair  → fleet.description (B&W fleet, the source the user
//                          sees on /fleet)
//  musicbus_inspection  → music_bus_vehicles.description (the Music Bus list)
async function getVehicleShortName(
  db: D1Database,
  formType: string,
  vehicleReg: string
): Promise<string> {
  if (!vehicleReg) return ''
  // Historic submissions stored regs with spaces / mixed case (e.g. "LS 43 NL GP ").
  // The fleet/music_bus_vehicles tables use the canonical spaceless uppercase form
  // (e.g. "LS43NLGP"). Normalize both sides before comparing so the lookup hits.
  const normalize = (r: string) => (r || '').replace(/\s+/g, '').toUpperCase()
  const needle = normalize(vehicleReg)
  if (!needle) return ''
  try {
    if (formType === 'musicbus_inspection') {
      const row = await db.prepare(
        "SELECT description FROM music_bus_vehicles WHERE UPPER(REPLACE(reg_number, ' ', '')) = ? AND active = 1"
      ).bind(needle).first<{ description: string }>()
      return (row?.description || '').trim()
    }
    if (formType === 'inspection' || formType === 'repair') {
      const row = await db.prepare(
        "SELECT description FROM fleet WHERE UPPER(REPLACE(reg_number, ' ', '')) = ? AND active = 1"
      ).bind(needle).first<{ description: string }>()
      if (row?.description) return row.description.trim()
      // Fallback 1: legacy field_vehicles table
      const legacy = await db.prepare(
        "SELECT description FROM field_vehicles WHERE UPPER(REPLACE(reg_number, ' ', '')) = ? AND active = 1"
      ).bind(needle).first<{ description: string }>()
      if (legacy?.description) return legacy.description.trim()
      // Fallback 2: music_bus_vehicles (covers the case where a music bus
      // got inspected via the B&W flow by mistake — at least the filename
      // still gets a human-readable nickname).
      const mb = await db.prepare(
        "SELECT description FROM music_bus_vehicles WHERE UPPER(REPLACE(reg_number, ' ', '')) = ? AND active = 1"
      ).bind(needle).first<{ description: string }>()
      return (mb?.description || '').trim()
    }
  } catch { /* best-effort — filename must never break a request */ }
  return ''
}

// ─── PDF FILENAME BUILDER ────────────────────────────────────────────────────────────────
// Single source of truth for the WhatsApp / download filename. Both the
// submit-time renderer and the serve-time /pdf/:id endpoint call this so the
// name stays in sync.
async function buildPdfFilename(args: {
  db: D1Database
  formNumber: string
  formType: string
  vehicleReg: string
  driver: string
  preparedBy: string
  eventName: string
  venue: string
  date: string
}): Promise<string> {
  const sanitize = (s: string, max = 40) =>
    (s || '').replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, '_').slice(0, max)
  const safeDate = (args.date || '').replace(/-/g, '')
  const vehicleCentric = ['inspection','repair','musicbus_inspection'].includes(args.formType)
  if (vehicleCentric) {
    const shortName = await getVehicleShortName(args.db, args.formType, args.vehicleReg || '')
    const cleanReg = (args.vehicleReg || '').replace(/\s+/g, '').toUpperCase()
    const parts: string[] = [args.formNumber]
    if (args.formType === 'musicbus_inspection') {
      const driverLabel = args.driver || args.preparedBy || ''
      if (driverLabel) parts.push(sanitize(driverLabel, 24))
    }
    if (shortName) parts.push(sanitize(shortName, 40))
    if (cleanReg) parts.push(sanitize(cleanReg, 12))
    if (safeDate) parts.push(safeDate)
    return parts.filter(Boolean).join('_') + '.pdf'
  }
  const safeEvent = sanitize(args.eventName || args.venue || 'BW', 40)
  return [args.formNumber, safeEvent, safeDate].filter(Boolean).join('_') + '.pdf'
}

// ─── PDF RENDER + R2 STORE ───────────────────────────────────────────────────────────────
// Renders the success page to PDF via Urlbox (primary) / PDFShift (fallback),
// stores it in R2 under pdfs/{form_number}-{id}.pdf, and updates the
// field_submissions.pdf_url column. Returns the public pdf_url (or '' if
// rendering failed). Never throws — caller's flow must not break on render
// failure.
async function renderAndStorePdf(
  env: any,
  submissionId: number,
  formNumber: string,
  pageUrl: string,
  pdfFilename: string
): Promise<string> {
  let pdfBuffer: ArrayBuffer | null = null
  let pdfRenderer: 'urlbox' | 'pdfshift' | null = null
  const logRender = async (renderer: string, ok: boolean, ms: number, bytes: number, error?: string) => {
    try {
      await env.DB.prepare(`
        INSERT INTO field_renderer_log (submission_id, form_number, renderer, format, ms, bytes, ok, error, trigger)
        VALUES (?, ?, ?, 'pdf', ?, ?, ?, ?, 'submission')
      `).bind(submissionId, formNumber, renderer, ms, bytes, ok ? 1 : 0, error?.slice(0, 300) || null).run()
    } catch { /* telemetry is best-effort */ }
  }
  // Urlbox primary
  if (env.URLBOX_SECRET_KEY) {
    const t0 = Date.now()
    try {
      const { renderToBuffer, deliveryNotePdfOptions } = await import('../lib/urlbox.js')
      const result = await renderToBuffer(env, deliveryNotePdfOptions(pageUrl, pdfFilename))
      pdfBuffer = result.buffer
      pdfRenderer = 'urlbox'
      await logRender('urlbox', true, Date.now() - t0, result.buffer.byteLength)
    } catch (err: any) {
      console.error('Urlbox PDF failed, trying PDFShift:', err)
      await logRender('urlbox_failed', false, Date.now() - t0, 0, err?.message)
    }
  }
  // PDFShift fallback
  if (!pdfBuffer && env.PDFSHIFT_API_KEY) {
    const t0 = Date.now()
    try {
      const pdfRes = await fetch('https://api.pdfshift.io/v3/convert/pdf', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa('api:' + env.PDFSHIFT_API_KEY),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          source: pageUrl, landscape: false, use_print: true, format: 'A4',
          margin: { top: '8mm', right: '10mm', bottom: '8mm', left: '10mm' },
          zoom: 0.85, filename: pdfFilename
        })
      })
      if (pdfRes.ok) {
        const ct = pdfRes.headers.get('content-type') || ''
        if (ct.includes('application/json')) {
          const json: any = await pdfRes.json()
          const s3Url = json?.url
          if (s3Url) {
            const s3Res = await fetch(s3Url)
            if (s3Res.ok) { pdfBuffer = await s3Res.arrayBuffer(); pdfRenderer = 'pdfshift' }
          }
        } else {
          pdfBuffer = await pdfRes.arrayBuffer(); pdfRenderer = 'pdfshift'
        }
      }
      if (pdfRenderer === 'pdfshift' && pdfBuffer) {
        await logRender('pdfshift', true, Date.now() - t0, pdfBuffer.byteLength)
      } else {
        await logRender('pdfshift_failed', false, Date.now() - t0, 0, `status ${pdfRes.status}`)
      }
    } catch (err: any) {
      console.error('PDFShift fallback failed:', err)
      await logRender('pdfshift_failed', false, Date.now() - t0, 0, err?.message)
    }
  }
  if (!pdfBuffer) { await logRender('both_failed', false, 0, 0, 'no renderer produced output'); return '' }
  // Store in R2
  if (env.PDF_BUCKET) {
    try {
      const pdfKey = `pdfs/${formNumber}-${submissionId}.pdf`
      await env.PDF_BUCKET.put(pdfKey, pdfBuffer, {
        httpMetadata: { contentType: 'application/pdf' },
        customMetadata: { renderer: pdfRenderer || 'unknown' }
      })
      const pdfUrl = `https://bwprodsystem.co.za/field/pdf/${submissionId}`
      await env.DB.prepare('UPDATE field_submissions SET pdf_url=? WHERE id=?').bind(pdfUrl, submissionId).run()
      return pdfUrl
    } catch (err) {
      console.error('PDF R2 storage failed:', err)
    }
  }
  return ''
}

function formatDate(d: string): string {
  if (!d) return ''
  const dt = new Date(d)
  return dt.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ─── SOUTH-AFRICA-ONLY VENUE GUARD ──────────────────────────────────────────
// Locks the venue directory to RSA only. Rejects anything that smells foreign
// based on region or address text. Returns { ok: true } if SA-acceptable,
// otherwise { ok: false, error: '...' }.
const SA_PROVINCES = [
  'eastern cape','free state','gauteng','kwazulu-natal','kzn','limpopo',
  'mpumalanga','north west','northern cape','western cape'
]
const FOREIGN_KEYWORDS = [
  'usa','united states',', md',', ny',', ca ',', tx',', fl',', il',', ga ',', wa ',
  'united kingdom',' uk',' u.k.','england','scotland','wales','ireland','italy',
  'france','germany','spain','portugal','netherlands','belgium','australia',
  'new zealand','japan','china','india','dubai','uae','canada','brazil','argentina',
  'twickenham','wembley','baltimore','london','dublin','rome','paris'
]
function isSouthAfricanVenue(region: string, address: string): { ok: boolean; error?: string } {
  const r = (region || '').toLowerCase().trim()
  const a = (address || '').toLowerCase().trim()
  // If region is set and not SA, reject
  if (r && !SA_PROVINCES.includes(r) && !r.includes('south africa')) {
    return { ok: false, error: `Region "${region}" is not a South African province. Venue directory is RSA-only.` }
  }
  // Address-based foreign keyword sniff
  for (const kw of FOREIGN_KEYWORDS) {
    if (a.includes(kw)) {
      return { ok: false, error: `Address looks foreign ("${kw.trim()}"). Venue directory is RSA-only.` }
    }
  }
  return { ok: true }
}

// ─── EVENT + VENUE LABEL HELPER ─────────────────────────────────────────────
// Combines event_name and venue into one display string. Used everywhere a
// delivery/collection is identified to a human: card lists, admin tables,
// WhatsApp messages, PDF titles, page titles.
//
// Rules:
//   • Both present and different → "Event Name — Venue"
//   • Only event_name OR only venue → that value alone
//   • If they're the same string, show once
//   • Both empty → fallback (caller-provided, default '—')
function eventVenueLabel(rec: any, fallback: string = '—'): string {
  const ev  = (rec?.event_name || '').toString().trim()
  const vn  = (rec?.venue      || '').toString().trim()
  if (ev && vn) {
    if (ev.toLowerCase() === vn.toLowerCase()) return ev
    return `${ev} — ${vn}`
  }
  return ev || vn || fallback
}

// Prepared-By dropdown — all people, males A-Z first then females A-Z
function peopleOptions(selected = 'Bibi'): string {
  const males   = PEOPLE_DIR.filter(p => p.gender === 'M')
  const females = PEOPLE_DIR.filter(p => p.gender === 'F')
  return [
    ...males.map(p   => `<option value="${p.name}"${p.name === selected ? ' selected' : ''}>${p.name}</option>`),
    `<option disabled style="color:var(--muted);font-size:11px">──────── Ladies ────────</option>`,
    ...females.map(p => `<option value="${p.name}"${p.name === selected ? ' selected' : ''}>${p.name}</option>`),
    `<option value="__new__">+ Add new person…</option>`
  ].join('')
}

// Driver dropdown — only drivers, A-Z
function driverOptions(selected = ''): string {
  const knownDrivers = DRIVERS
  const isKnownDriver = selected && knownDrivers.includes(selected)
  // If a saved driver isn't on the whitelist (e.g. Tucker, Eric — flagged in
  // PEOPLE_DIR but not as isDriver), inject them as a selected custom option
  // so the value renders instead of silently falling back to the placeholder.
  const customDriverOpt = (selected && !isKnownDriver)
    ? `<option value="${selected}" selected>${selected}</option>`
    : ''
  return `<option value="">— select driver —</option>` +
    customDriverOpt +
    knownDrivers.map(d => `<option value="${d}"${d === selected ? ' selected' : ''}>${d}</option>`).join('') +
    `<option value="__new__">+ Other / not listed…</option>`
}

// Team member dropdown options — males A-Z first, females A-Z after
// Pass excludeName to grey out / skip the current driver
function teamMemberOpts(excludeName = ''): string {
  const opt = (name: string) => {
    const skip = name === excludeName
    return `<option value="${name}" ${skip ? 'disabled style="color:var(--muted)"' : ''}>${name}${skip ? ' (driver)' : ''}</option>`
  }
  return [
    ...TEAM_MALES.map(opt),
    `<option disabled style="color:var(--muted);font-size:11px">──────── Ladies ────────</option>`,
    ...TEAM_FEMALES.map(opt),
    `<option disabled style="color:var(--muted);font-size:11px">──────────────────────</option>`,
    `<option value="__new__">➕ Team Mate (not on list)…</option>`
  ].join('')
}

function brandOptions(selected = ''): string {
  return `<option value="">— select brand —</option>` +
    BRANDS.map(b =>
      `<option value="${b}"${b === selected ? ' selected' : ''}>${b}</option>`
    ).join('')
}

function vehicleOptions(): string {
  return `<option value="">— select vehicle —</option>` +
    VEHICLES.map(v =>
      `<option value="${v.reg}">${v.reg} — ${v.desc}</option>`
    ).join('')
}

function itemOptionsHtml(): string {
  return Object.entries(ITEM_CATEGORIES).map(([cat, items]) =>
    `<optgroup label="${cat}">${items.map(i =>
      `<option value="${i}">${i}</option>`
    ).join('')}</optgroup>`
  ).join('')
}

// ─── VENUE TYPEAHEAD COMPONENT ───────────────────────────────────────────────
// Renders a venue name input with a live-filtering dropdown driven by
// /field/venues/search, plus an editable address field that auto-populates
// when a venue is picked. Both fields are submitted with the form normally.
//
// Usage: ${venueTypeaheadField(fieldName, savedName, savedAddress, required)}
function venueTypeaheadField(
  fieldName: string = 'venue',
  savedName: string = '',
  savedAddress: string = '',
  required: boolean = true
): string {
  const reqAttr = required ? ' required' : ''
  const escName = (savedName || '').replace(/"/g, '&quot;')
  const escAddr = (savedAddress || '').replace(/"/g, '&quot;')
  return `
    <div class="field-group venue-typeahead" data-venue-field="${fieldName}">
      <label>Venue Name</label>
      <div style="position:relative">
        <input type="text" name="${fieldName}" value="${escName}"
          placeholder="Type to search venues — Sun Square, Loftus, Brits Mall…"
          autocomplete="off" ${reqAttr}
          oninput="venueTypeaheadSearch(this)"
          onfocus="venueTypeaheadSearch(this)"
          onblur="setTimeout(function(){venueTypeaheadHide('${fieldName}')},180)">
        <div class="venue-typeahead-results" id="venueResults_${fieldName}"
          style="display:none;position:absolute;top:100%;left:0;right:0;z-index:50;
                 background:var(--card);border:1px solid var(--border);border-top:none;
                 border-radius:0 0 8px 8px;max-height:280px;overflow-y:auto;
                 box-shadow:0 8px 24px rgba(0,0,0,0.4)"></div>
      </div>
    </div>
    <div class="field-group">
      <label>Venue Address
        <span style="font-weight:500;text-transform:none;color:var(--muted);font-size:11px;margin-left:6px">
          (auto-fills when you pick a venue — editable)
        </span>
      </label>
      <input type="text" name="${fieldName}_address" value="${escAddr}"
        placeholder="Street address, suburb, city" autocomplete="off">
    </div>`
}

function venueTypeaheadScript(): string {
  return `<script>
  // Debounced search across all venue typeahead fields on the page
  var _venueSearchTimer = null
  function venueTypeaheadSearch(input) {
    clearTimeout(_venueSearchTimer)
    var fieldName = input.name
    var q = (input.value || '').trim()
    _venueSearchTimer = setTimeout(function() {
      fetch('/field/venues/search?q=' + encodeURIComponent(q))
        .then(function(r) { return r.json() })
        .then(function(data) {
          if (!data.success) return
          venueTypeaheadRender(fieldName, data.results || [], q)
        })
        .catch(function() {})
    }, 140)
  }

  function venueTypeaheadRender(fieldName, results, q) {
    var box = document.getElementById('venueResults_' + fieldName)
    if (!box) return
    if (!results.length) {
      if (q) {
        box.innerHTML = '<div style="padding:14px 16px;font-size:13px;color:var(--muted)">' +
          'No matches for "<strong style="color:var(--white)">' + escapeHtml(q) +
          '</strong>" — keep typing, it\\'ll save as a new venue on submit.</div>'
        box.style.display = 'block'
      } else {
        box.style.display = 'none'
      }
      return
    }
    var typeBadge = function(t) {
      if (!t) return ''
      var col = { collection: '#f59e0b', stadium: '#10b981', depot: '#3b82f6',
                  brewery: '#8b5cf6', office: '#6b7589', mall: '#10b981' }[t] || '#6b7589'
      return '<span style="font-size:10px;padding:1px 6px;border-radius:8px;' +
             'background:' + col + '22;color:' + col + ';margin-left:6px;text-transform:uppercase;letter-spacing:0.05em">' + t + '</span>'
    }
    var html = results.map(function(v) {
      var addr = v.address || ''
      var region = v.region || ''
      var data = JSON.stringify({ name: v.name, address: addr, region: region,
                                  postal_code: v.postal_code || '',
                                  attention_default: v.attention_default || '' })
                  .replace(/"/g, '&quot;')
      return '<div class="venue-result" tabindex="0" ' +
        'onmousedown="venueTypeaheadPick(\\'' + fieldName + '\\', this)" ' +
        'data-venue="' + data + '" ' +
        'style="padding:11px 14px;border-bottom:1px solid var(--border);cursor:pointer;font-size:14px"' +
        'onmouseover="this.style.background=\\'var(--hover)\\'" ' +
        'onmouseout="this.style.background=\\'transparent\\'">' +
        '<div style="font-weight:700;color:var(--white)">' + escapeHtml(v.name) + typeBadge(v.venue_type) + '</div>' +
        (addr ? '<div style="font-size:12px;color:var(--muted);margin-top:2px">' + escapeHtml(addr) +
                (region ? ' · ' + escapeHtml(region) : '') + '</div>' : '') +
      '</div>'
    }).join('')
    box.innerHTML = html
    box.style.display = 'block'
  }

  function venueTypeaheadPick(fieldName, el) {
    try {
      var v = JSON.parse(el.getAttribute('data-venue').replace(/&quot;/g,'"'))
      var nameInput = document.querySelector('[name="' + fieldName + '"]')
      var addrInput = document.querySelector('[name="' + fieldName + '_address"]')
      if (nameInput) nameInput.value = v.name
      if (addrInput && v.address) addrInput.value = v.address

      // If attention field exists and is empty, auto-fill it from venue default
      var attnInput = document.querySelector('[name="attention"]')
      if (attnInput && !attnInput.value && v.attention_default) {
        attnInput.value = v.attention_default
      }

      venueTypeaheadHide(fieldName)
    } catch(e) { console.warn('venueTypeaheadPick failed', e) }
  }

  function venueTypeaheadHide(fieldName) {
    var box = document.getElementById('venueResults_' + fieldName)
    if (box) box.style.display = 'none'
  }

  function escapeHtml(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
  }
  </script>`
}

// ─── TEAM / CREW SECTION HELPER ──────────────────────────────────────────────

function teamCrewSection(): string {
  // Built dynamically via JS using TEAM_MALES / TEAM_FEMALES injected below
  // Driver-exclusion: refreshTeamPicker() is called whenever driver changes
  const vehicleOpts = VEHICLES.map(v => `<option value="${v.reg}">${v.reg} — ${v.desc}</option>`).join('')
  // Serialise people data for JS
  const teamMalesJson   = JSON.stringify(TEAM_MALES)
  const teamFemalesJson = JSON.stringify(TEAM_FEMALES)
  const driverOptsHtml  = DRIVERS.map(d => `<option value="${d}">${d}</option>`).join('')
  return `
  <div class="section" style="border-color:rgba(99,102,241,0.4)">
    <div class="section-title" style="color:#a5b4fc;display:flex;align-items:center;gap:10px">
      👷 Team &amp; Vehicles
      <span id="teamCountBadge" style="display:none;padding:2px 10px;border-radius:20px;
            background:rgba(99,102,241,0.2);color:#a5b4fc;font-size:12px;font-weight:800"></span>
    </div>

    <!-- Single picker — select a name to add it instantly as a pill -->
    <div class="field-group">
      <select id="teamMemberPicker"
        style="width:100%;background:var(--card);border:1px solid var(--border);
               border-radius:8px;padding:12px 14px;color:var(--white);font-size:15px"
        onchange="addTeamMember()">
        <option value="">— add a team member —</option>
      </select>
      <!-- Custom name input — shown only when "Team Mate (not on list)" is selected -->
      <div id="teamCustomWrap" style="display:none;margin-top:8px">
        <input type="text" id="teamMemberCustomInput" placeholder="Team mate name…"
          style="width:100%;background:var(--card);border:1px solid rgba(99,102,241,0.4);
                 border-radius:8px;padding:11px 14px;color:var(--white);font-size:15px">
        <button type="button" onclick="addCustomTeamMember()"
          style="margin-top:8px;width:100%;padding:11px;border-radius:8px;
                 border:1px solid rgba(99,102,241,0.5);background:rgba(99,102,241,0.15);
                 color:#a5b4fc;font-size:14px;font-weight:700;cursor:pointer">
          ✅ Add Team Mate
        </button>
      </div>
    </div>

    <!-- Running pill list -->
    <div id="teamMembersList" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;min-height:0"></div>
    <input type="hidden" name="team_members" id="teamMembersHidden" value="">

    <!-- Team Mates (not on list) — dynamic rows -->
    <div id="casualsList" style="margin-top:4px"></div>
    <input type="hidden" name="casuals" id="casualsHidden" value="">

    <!-- Second Vehicle (hidden by default) -->
    <div style="margin-top:14px">
      <button type="button" id="addVehicle2Btn" onclick="toggleVehicle2()"
        style="width:100%;padding:12px;border-radius:10px;border:1px dashed rgba(99,102,241,0.4);
               background:transparent;color:#a5b4fc;font-size:14px;font-weight:700;cursor:pointer">
        ➕ Add Second Vehicle
      </button>
      <div id="vehicle2Section" style="display:none;margin-top:12px">
        <select name="vehicle2_reg" id="vehicle2Sel" onchange="updateVehicle2(this)"
          style="width:100%;background:var(--card);border:1px solid rgba(99,102,241,0.4);border-radius:8px;
                 padding:10px 12px;color:var(--white);font-size:14px;margin-bottom:8px">
          <option value="">— select vehicle —</option>
          ${vehicleOpts}
          <option value="__other__">+ Other / not listed</option>
        </select>
        <input type="text" name="vehicle2_reg_custom" id="vehicle2RegCustom"
          placeholder="Type reg e.g. BW02GPXX" autocapitalize="characters"
          style="display:none;width:100%;background:var(--card);border:1px solid rgba(99,102,241,0.4);
                 border-radius:8px;padding:10px 12px;color:var(--white);font-size:14px;margin-bottom:8px">
        <div style="font-size:12px;color:var(--muted);margin-bottom:6px">Driver of 2nd vehicle:</div>
        <select name="vehicle2_driver" id="vehicle2DriverSel"
          style="width:100%;background:var(--card);border:1px solid rgba(99,102,241,0.4);border-radius:8px;
                 padding:10px 12px;color:var(--white);font-size:14px">
          <option value="">— select driver —</option>
          ${driverOptsHtml}
        </select>
        <button type="button" onclick="toggleVehicle2()"
          style="margin-top:10px;width:100%;padding:10px;border-radius:8px;border:1px solid rgba(239,68,68,0.3);
                 background:transparent;color:#fca5a5;font-size:13px;cursor:pointer">
          ✕ Remove Second Vehicle
        </button>
      </div>
    </div>
  </div>

  <script>
  // ── People data (injected from server) ───────────────────────────────────────
  var _TEAM_MALES   = ${teamMalesJson}
  var _TEAM_FEMALES = ${teamFemalesJson}

  // Build & refresh the team member picker, excluding the current driver
  function refreshTeamPicker() {
    var driverEl = document.getElementById('driverSel')
    var currentDriver = driverEl ? driverEl.value : ''
    var picker = document.getElementById('teamMemberPicker')
    if (!picker) return
    var html = '<option value="">— add a team member —</option>'
    _TEAM_MALES.forEach(function(name) {
      var isDriver = (name === currentDriver)
      html += '<option value="' + name + '"' + (isDriver ? ' disabled style="color:var(--muted)"' : '') + '>'
              + name + (isDriver ? ' (driver)' : '') + '</option>'
    })
    html += '<option disabled style="color:var(--muted);font-size:11px">──────── Ladies ────────</option>'
    _TEAM_FEMALES.forEach(function(name) {
      var isDriver = (name === currentDriver)
      html += '<option value="' + name + '"' + (isDriver ? ' disabled style="color:var(--muted)"' : '') + '>'
              + name + (isDriver ? ' (driver)' : '') + '</option>'
    })
    html += '<option disabled style="color:var(--muted);font-size:11px">──────────────────────</option>'
    html += '<option value="__new__">➕ Team Mate (not on list)…</option>'
    picker.innerHTML = html
  }

  // ── Team Members ─────────────────────────────────────────────────────────────
  var _teamMembers = []

  function addTeamMember() {
    var picker = document.getElementById('teamMemberPicker')
    if (picker.value === '__new__') {
      picker.value = ''
      addCasual()
      return
    }
    var name = picker.value.trim()
    if (!name) return
    if (_teamMembers.includes(name)) { picker.value = ''; return }
    // Also block if they are the selected driver
    var driverEl = document.getElementById('driverSel')
    if (driverEl && driverEl.value === name) { picker.value = ''; return }
    _teamMembers.push(name)
    renderTeamMembers()
    picker.value = ''
  }

  // kept for backward-compat (restore from draft calls addCustomTeamMember path)
  function addCustomTeamMember() {
    var input = document.getElementById('teamMemberCustomInput')
    if (!input) return
    var name = input.value.trim()
    if (!name) return
    if (!_teamMembers.includes(name)) {
      _teamMembers.push(name)
      renderTeamMembers()
    }
    input.value = ''
    var wrap = document.getElementById('teamCustomWrap')
    if (wrap) wrap.style.display = 'none'
    document.getElementById('teamMemberPicker').value = ''
  }

  function removeTeamMember(name) {
    _teamMembers = _teamMembers.filter(function(m){ return m !== name })
    renderTeamMembers()
  }

  function renderTeamMembers() {
    var list   = document.getElementById('teamMembersList')
    var badge  = document.getElementById('teamCountBadge')
    var hidden = document.getElementById('teamMembersHidden')
    list.innerHTML = _teamMembers.map(function(m) {
      return '<span style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:20px;' +
             'background:rgba(99,102,241,0.2);border:1px solid rgba(99,102,241,0.4);color:#a5b4fc;font-size:13px;font-weight:700">' +
             m + '<button type="button" onclick="removeTeamMember(\\'' + m.replace(/'/g,"\\'") + '\\')" ' +
             'style="background:none;border:none;color:#a5b4fc;cursor:pointer;font-size:15px;padding:0 2px;line-height:1">×</button></span>'
    }).join('')
    var total = _teamMembers.length + getCasuals().length
    if (total > 0) {
      badge.textContent = total + ' on team'
      badge.style.display = 'inline-block'
    } else {
      badge.style.display = 'none'
    }
    hidden.value = _teamMembers.join(', ')
  }

  // ── Team Mates (not on list) ────────────────────────────────────────────────
  var _casualCount = 0

  function addCasual() {
    _casualCount++
    var n = _casualCount
    var wrap = document.getElementById('casualsList')
    var div = document.createElement('div')
    div.id = 'casual_row_' + n
    div.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px'
    div.innerHTML =
      '<span style="font-size:12px;font-weight:700;color:var(--muted);white-space:nowrap;min-width:76px">Team Mate ' + n + '</span>' +
      '<input type="text" id="casual_name_' + n + '" placeholder="Name…" oninput="updateCasualsHidden()"' +
      ' style="flex:1;background:var(--card);border:1px solid rgba(99,102,241,0.3);border-radius:8px;' +
      'padding:10px 12px;color:var(--white);font-size:14px">' +
      '<button type="button" onclick="removeCasual(' + n + ')" ' +
      'style="padding:8px 10px;border-radius:8px;border:1px solid rgba(239,68,68,0.3);' +
      'background:transparent;color:#fca5a5;font-size:14px;cursor:pointer;line-height:1">×</button>'
    wrap.appendChild(div)
    // Focus the new input immediately
    setTimeout(function() {
      var inp = document.getElementById('casual_name_' + n)
      if (inp) inp.focus()
    }, 50)
    updateCasualsHidden()
  }

  function removeCasual(n) {
    var row = document.getElementById('casual_row_' + n)
    if (row) row.remove()
    updateCasualsHidden()
    renderTeamMembers()
  }

  function getCasuals() {
    var results = []
    for (var i = 1; i <= _casualCount; i++) {
      var el = document.getElementById('casual_name_' + i)
      if (el && el.value.trim()) results.push(el.value.trim())
    }
    return results
  }

  function updateCasualsHidden() {
    document.getElementById('casualsHidden').value = getCasuals().join(', ')
    renderTeamMembers()
  }

  // ── Second Vehicle ────────────────────────────────────────────────────────────
  function toggleVehicle2() {
    var sec = document.getElementById('vehicle2Section')
    var btn = document.getElementById('addVehicle2Btn')
    var visible = sec.style.display !== 'none'
    sec.style.display = visible ? 'none' : 'block'
    btn.style.display = visible ? 'block' : 'none'
    if (visible) {
      document.getElementById('vehicle2Sel').value = ''
      var custom = document.getElementById('vehicle2RegCustom')
      custom.value = ''; custom.style.display = 'none'
    }
  }

  function updateVehicle2(sel) {
    var custom = document.getElementById('vehicle2RegCustom')
    custom.style.display = sel.value === '__other__' ? 'block' : 'none'
    if (sel.value !== '__other__') custom.value = ''
  }
  </script>`
}

// ─── SHARED CSS ───────────────────────────────────────────────────────────────

const FIELD_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --navy: #0d1117;
    --card: #161b22;
    --border: #21262d;
    --hover: #1c2230;
    --gold: #C9A84C;
    --gold-lt: #F0D080;
    --white: #f0f4ff;
    --muted: #6b7589;
    --green: #10b981;
    --amber: #f59e0b;
    --red: #ef4444;
    --blue: #3b82f6;
    --purple: #8b5cf6;
    --radius: 12px;
  }
  html { scroll-behavior: smooth; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: var(--navy);
    color: var(--white);
    min-height: 100vh;
    font-size: 16px;
    line-height: 1.5;
    -webkit-text-size-adjust: 100%;
  }
  .field-wrap { max-width: 680px; margin: 0 auto; padding: 16px; }
  .field-header {
    text-align: center;
    padding: 24px 16px 20px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 24px;
  }
  .field-logo { width: 90px; height: 90px; margin: 0 auto 12px; display: block; object-fit: cover; border-radius: 50%; box-shadow: 0 0 0 3px rgba(201,168,76,0.25); }
  .field-brand { font-size: 20px; font-weight: 800; letter-spacing: 0.04em; color: var(--gold-lt); }
  .field-tagline { font-size: 12px; color: var(--muted); letter-spacing: 0.08em; text-transform: uppercase; margin-top: 4px; }
  .field-form-title {
    font-size: 22px; font-weight: 800; margin-bottom: 4px;
    background: linear-gradient(135deg, #B67A3A, #F0D080, #D39A52);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
  }
  .form-num { font-size: 12px; color: var(--muted); margin-bottom: 20px; }

  /* Sections */
  .section { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px; margin-bottom: 16px; }
  .section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); margin-bottom: 14px; }

  /* Form controls */
  .field-group { margin-bottom: 14px; }
  .field-group:last-child { margin-bottom: 0; }
  label { display: block; font-size: 13px; font-weight: 600; color: var(--muted); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.06em; }
  input, select, textarea {
    width: 100%; background: var(--navy); border: 1px solid var(--border);
    border-radius: 8px; padding: 13px 14px; color: var(--white);
    font-size: 16px; font-family: inherit; transition: border-color 0.15s;
    -webkit-appearance: none; appearance: none;
  }
  select { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%236b7589' stroke-width='2' fill='none' stroke-linecap='round'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 14px center; padding-right: 36px; }
  input:focus, select:focus, textarea:focus { outline: none; border-color: var(--gold); }
  textarea { resize: vertical; min-height: 80px; }
  input[type="date"] { color-scheme: dark; }

  /* Letterhead toggle */
  .lh-toggle { display: flex; gap: 10px; }
  .lh-btn {
    flex: 1; padding: 11px; border-radius: 8px; border: 2px solid var(--border);
    background: var(--navy); color: var(--muted); font-size: 13px; font-weight: 600;
    cursor: pointer; text-align: center; transition: all 0.15s;
  }
  .lh-btn.active { border-color: var(--gold); color: var(--gold-lt); background: rgba(201,168,76,0.1); }

  /* Brand selector */
  .brand-selector { position: relative; }
  .brand-pill {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 12px; border-radius: 20px; font-size: 13px; font-weight: 600;
    background: rgba(201,168,76,0.15); color: var(--gold-lt); border: 1px solid rgba(201,168,76,0.3);
    margin-top: 8px;
  }

  /* Line items */
  .line-items-wrap { display: flex; flex-direction: column; gap: 10px; }
  .line-item {
    background: var(--navy); border: 1px solid var(--border);
    border-radius: 10px; padding: 12px;
  }
  .line-item-row { display: grid; grid-template-columns: 70px 1fr; gap: 8px; margin-bottom: 8px; }
  .line-item-row.three { grid-template-columns: 70px 1fr 1fr; }
  .line-item select, .line-item input { font-size: 15px; padding: 10px 12px; }
  .line-item .condition-row { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
  .cond-btn {
    flex: 1; min-width: 70px; padding: 8px 6px; border-radius: 6px; border: 1px solid var(--border);
    background: var(--navy); color: var(--muted); font-size: 12px; font-weight: 600;
    cursor: pointer; text-align: center; transition: all 0.15s;
  }
  .cond-btn.active-checked { border-color: #10b981; color: #10b981; background: rgba(16,185,129,0.1); }
  .cond-btn.active-faulty { border-color: #f59e0b; color: #f59e0b; background: rgba(245,158,11,0.1); }
  .cond-btn.active-damaged { border-color: #ef4444; color: #ef4444; background: rgba(239,68,68,0.1); }
  .cond-btn.active-replacement { border-color: #8b5cf6; color: #8b5cf6; background: rgba(139,92,246,0.1); }
  .remove-btn {
    width: 100%; margin-top: 8px; padding: 8px; border-radius: 6px;
    border: 1px solid rgba(239,68,68,0.3); background: transparent;
    color: rgba(239,68,68,0.7); font-size: 13px; cursor: pointer;
  }
  .add-line-btn {
    width: 100%; padding: 14px; border-radius: 10px;
    border: 2px dashed var(--border); background: transparent;
    color: var(--muted); font-size: 15px; font-weight: 600; cursor: pointer;
    transition: all 0.15s; margin-top: 4px;
  }
  .add-line-btn:hover { border-color: var(--gold); color: var(--gold-lt); }

  /* Signature canvas */
  .sig-wrap { position: relative; }
  .sig-canvas {
    width: 100%; height: 160px; border-radius: 8px;
    border: 2px solid var(--border); background: #fff;
    touch-action: none; display: block;
  }
  .sig-controls { display: flex; gap: 8px; margin-top: 8px; }
  .sig-clear {
    padding: 8px 16px; border-radius: 6px; border: 1px solid var(--border);
    background: transparent; color: var(--muted); font-size: 13px; cursor: pointer;
  }
  .sig-hint { font-size: 12px; color: var(--muted); margin-top: 6px; }

  /* Inspection items */
  .inspection-item {
    display: flex; align-items: center; gap: 10px;
    padding: 12px; border-bottom: 1px solid var(--border);
  }
  .inspection-item:last-child { border-bottom: none; }
  .insp-name { flex: 1; font-size: 15px; }
  .insp-btns { display: flex; gap: 6px; }
  .insp-pass, .insp-fail {
    width: 44px; height: 36px; border-radius: 6px; border: 1px solid var(--border);
    background: var(--navy); color: var(--muted); font-size: 14px; cursor: pointer;
    transition: all 0.15s; display: flex; align-items: center; justify-content: center;
  }
  .insp-pass.active { background: rgba(16,185,129,0.2); border-color: #10b981; color: #10b981; }
  .insp-fail.active { background: rgba(239,68,68,0.2); border-color: #ef4444; color: #ef4444; }
  .insp-note { font-size: 13px; color: var(--muted); margin-top: 4px; }

  /* Buttons */
  .btn-submit {
    width: 100%; padding: 18px; border-radius: 12px; border: none;
    background: linear-gradient(135deg, #8B6914, #C9A84C, #F0D080);
    color: #000; font-size: 18px; font-weight: 800; cursor: pointer;
    letter-spacing: 0.04em; margin-top: 8px; transition: all 0.15s;
    -webkit-tap-highlight-color: transparent;
  }
  .btn-submit:active { transform: scale(0.98); }
  .btn-secondary {
    width: 100%; padding: 14px; border-radius: 10px;
    border: 1px solid var(--border); background: transparent;
    color: var(--white); font-size: 15px; font-weight: 600; cursor: pointer; margin-top: 8px;
  }
  .btn-wa {
    width: 100%; padding: 16px; border-radius: 12px; border: none;
    background: #25D366; color: #fff; font-size: 17px; font-weight: 700;
    cursor: pointer; margin-top: 10px; display: flex; align-items: center;
    justify-content: center; gap: 10px;
  }

  /* Success modal */
  .modal-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.85);
    display: flex; align-items: center; justify-content: center;
    z-index: 1000; padding: 20px;
  }
  .modal-box {
    background: var(--card); border: 1px solid var(--border);
    border-radius: 16px; padding: 28px; max-width: 360px; width: 100%;
    text-align: center;
  }
  .modal-icon { font-size: 48px; margin-bottom: 12px; }
  .modal-title { font-size: 20px; font-weight: 800; margin-bottom: 8px; color: var(--gold-lt); }
  .modal-sub { font-size: 14px; color: var(--muted); margin-bottom: 20px; }
  .modal-btns { display: flex; flex-direction: column; gap: 8px; }

  /* Summary modal */
  .summary-modal-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.92);
    z-index: 2000; overflow-y: auto; padding: 16px;
    display: none;
  }
  .summary-modal-overlay.open { display: block; }
  .summary-modal {
    max-width: 640px; margin: 0 auto; background: #fff; color: #111;
    border-radius: 16px; overflow: hidden;
  }
  .summary-modal-header {
    background: #0d1117; color: #F0D080; padding: 20px 20px 14px;
    text-align: center; border-bottom: 3px solid #C9A84C;
  }
  .summary-modal-header img { width: 60px; border-radius: 50%; margin-bottom: 8px; }
  .summary-modal-header .sm-title { font-size: 18px; font-weight: 800; letter-spacing: 0.04em; }
  .summary-modal-header .sm-ref { font-size: 12px; color: #6b7589; margin-top: 4px; }
  .summary-modal-body { padding: 0; }
  .sm-section { padding: 14px 18px; border-bottom: 1px solid #e5e7eb; }
  .sm-section:last-child { border-bottom: none; }
  .sm-section-title { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #6b7589; margin-bottom: 10px; }
  .sm-row { display: flex; justify-content: space-between; gap: 12px; padding: 5px 0; border-bottom: 1px solid #f3f4f6; font-size: 14px; }
  .sm-row:last-child { border-bottom: none; }
  .sm-label { color: #6b7589; min-width: 120px; flex-shrink: 0; }
  .sm-value { font-weight: 600; color: #111; text-align: right; word-break: break-word; }
  .sm-items-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .sm-items-table th { background: #f3f4f6; padding: 7px 10px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7589; }
  .sm-items-table td { padding: 8px 10px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
  .sm-items-table tr:last-child td { border-bottom: none; }
  .summary-modal-footer { padding: 16px 18px; background: #f9fafb; display: flex; gap: 10px; flex-direction: column; }
  .btn-confirm-summary {
    width: 100%; padding: 16px; border-radius: 12px; border: none;
    background: linear-gradient(135deg,#8B6914,#C9A84C,#F0D080);
    color: #000; font-size: 17px; font-weight: 800; cursor: pointer; letter-spacing: 0.03em;
  }
  .btn-close-summary {
    width: 100%; padding: 13px; border-radius: 10px;
    border: 1px solid #d1d5db; background: #fff;
    color: #374151; font-size: 15px; font-weight: 600; cursor: pointer;
  }
  .btn-review {
    width: 100%; padding: 17px; border-radius: 12px; border: 2px solid var(--gold);
    background: rgba(201,168,76,0.1); color: var(--gold-lt);
    font-size: 17px; font-weight: 800; cursor: pointer; margin-top: 8px;
    letter-spacing: 0.03em; transition: all 0.15s;
    -webkit-tap-highlight-color: transparent;
  }
  .btn-review:active { transform: scale(0.98); }

  /* Photo upload */
  .photo-upload-area {
    border: 2px dashed var(--border); border-radius: 12px;
    padding: 20px; text-align: center; cursor: pointer;
    transition: all 0.15s; position: relative; background: var(--navy);
    -webkit-tap-highlight-color: transparent;
  }
  .photo-upload-area:active { border-color: var(--gold); background: rgba(201,168,76,0.05); }
  .photo-upload-area input[type=file] {
    position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%;
  }
  .photo-upload-icon { font-size: 32px; margin-bottom: 8px; }
  .photo-upload-label { font-size: 15px; font-weight: 700; color: var(--gold-lt); margin-bottom: 4px; }
  .photo-upload-hint { font-size: 12px; color: var(--muted); }
  .photo-previews {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px;
  }
  .photo-thumb {
    position: relative; aspect-ratio: 1; border-radius: 8px; overflow: hidden;
    border: 1px solid var(--border);
  }
  .photo-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .photo-thumb-remove {
    position: absolute; top: 4px; right: 4px; width: 22px; height: 22px;
    border-radius: 50%; background: rgba(0,0,0,0.7); border: none;
    color: #fff; font-size: 13px; cursor: pointer; display: flex;
    align-items: center; justify-content: center; line-height: 1;
  }
  .photo-count { font-size: 12px; color: var(--muted); margin-top: 8px; text-align: center; }

  /* Landing tiles */
  .tiles-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 8px; }
  .tile {
    border-radius: 14px; padding: 22px 16px; text-align: center;
    text-decoration: none; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 10px;
    min-height: 130px; transition: transform 0.15s, box-shadow 0.15s;
    border: 2px solid transparent; -webkit-tap-highlight-color: transparent;
  }
  .tile:active { transform: scale(0.96); }
  .tile-icon { font-size: 36px; }
  .tile-label { font-size: 15px; font-weight: 700; line-height: 1.2; }
  .tile-green  { background: rgba(16,185,129,0.15); border-color: rgba(16,185,129,0.4); color: #6ee7b7; }
  .tile-amber  { background: rgba(245,158,11,0.15); border-color: rgba(245,158,11,0.4); color: #fcd34d; }
  .tile-red    { background: rgba(239,68,68,0.15);  border-color: rgba(239,68,68,0.4);  color: #fca5a5; }
  .tile-blue   { background: rgba(59,130,246,0.15); border-color: rgba(59,130,246,0.4); color: #93c5fd; }
  .tile-purple { background: rgba(139,92,246,0.15); border-color: rgba(139,92,246,0.4); color: #c4b5fd; }
  .tile-full   { grid-column: 1 / -1; }

  /* Other items */
  .other-row { display: grid; grid-template-columns: 70px 1fr; gap: 8px; margin-bottom: 8px; }

  /* Alert */
  .alert { padding: 12px 16px; border-radius: 8px; font-size: 14px; margin-bottom: 16px; }
  .alert-success { background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.3); color: #6ee7b7; }

  /* Print */
  @media print {
    @page { size: A4 portrait; margin: 8mm 10mm 8mm 10mm; }
    html, body { background: #fff !important; color: #000 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0; padding: 0; }
    .no-print { display: none !important; }
    /* Shrink the outer wrap so everything fits the A4 column */
    .field-wrap { max-width: 100% !important; padding: 0 !important; margin: 0 !important; }
    /* Header — compact */
    .field-header { background: transparent !important; color: #000 !important; border-bottom: 2px solid #C9A84C; padding: 6px 0 8px !important; margin-bottom: 6px !important; }
    .field-logo { width: 52px !important; height: auto !important; }
    .field-brand { font-size: 14px !important; color: #8B6914 !important; -webkit-text-fill-color: #8B6914 !important; margin: 2px 0 !important; }
    .field-tagline { font-size: 10px !important; margin: 1px 0 !important; color: #555 !important; }
    .field-form-title { font-size: 15px !important; color: #8B6914 !important; -webkit-text-fill-color: #8B6914 !important; background: none !important; -webkit-background-clip: unset !important; background-clip: unset !important; margin: 4px 0 2px !important; }
    .form-num { font-size: 10px !important; margin-bottom: 4px !important; color: #555 !important; }
    /* Sections */
    .section { border: 1px solid #ddd !important; background: #fff !important; color: #000 !important; padding: 6px 10px !important; margin-bottom: 5px !important; border-radius: 4px !important; }
    .section-title { font-size: 9px !important; margin-bottom: 4px !important; color: #666 !important; }
    /* Details table */
    .section table td { font-size: 11px !important; padding: 2px 0 !important; color: #000 !important; border: none !important; }
    /* Equipment table */
    .print-table { width: 100%; border-collapse: collapse; }
    .print-table th { background: #f3f4f6 !important; font-size: 9px !important; padding: 4px 5px !important; border: 1px solid #ccc !important; color: #000 !important; text-transform: uppercase; letter-spacing: 0.04em; }
    .print-table td, .print-table th { border: 1px solid #ccc !important; }
    .print-table td { font-size: 10px !important; padding: 3px 5px !important; color: #000 !important; }
    table td, table th { color: #000 !important; border-color: #ddd !important; }
    .sm-items-table th { background: #f3f4f6 !important; }
    /* Signature */
    img[src^="data:image"] { background: #ffffff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; max-height: 60px !important; }
    /* Sign-off section */
    .signoff-section { font-size: 11px !important; }
    /* Notes */
    .section p { font-size: 11px !important; margin: 0 !important; }
    /* Contact info footer */
    .print-footer { font-size: 9px !important; color: #888 !important; text-align: center; padding: 4px 0 0 !important; }
  }

  @media (max-width: 380px) {
    .tiles-grid { grid-template-columns: 1fr; }
    .tile-full { grid-column: 1; }
  }
`

// ─── SHARED HEADER HTML ───────────────────────────────────────────────────────

function fieldPage(title: string, body: string, extraHead = ''): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <title>${title} — B&W Productions</title>
  <!-- ── BW Productions branding (favicon + touch icons + PWA) ── -->
  <link rel="icon" type="image/png" sizes="32x32" href="/static/favicon-32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="/static/favicon-16.png">
  <link rel="icon" type="image/png" sizes="192x192" href="/static/favicon-192.png">
  <link rel="shortcut icon" href="/static/favicon.ico">
  <link rel="apple-touch-icon" sizes="180x180" href="/static/apple-touch-icon.png">
  <meta name="theme-color" content="#0A0A0A">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <style>${FIELD_CSS}</style>
  ${extraHead}
</head>
<body>
${body}
</body>
</html>`
}

function formHeader(formTitle: string, formNum: string, letterhead: string, preparedBy: string): string {
  const isSAB = letterhead === 'sab'
  return `
  <div class="field-header">
    <a href="/field" style="display:inline-block;text-decoration:none" title="Back to Forms">
      <img src="/static/bw-logo.png" alt="B&W Productions — Back to Forms" class="field-logo" style="cursor:pointer;transition:opacity 0.15s" onmouseover="this.style.opacity='0.75'" onmouseout="this.style.opacity='1'">
    </a>
    <div class="field-brand">B&amp;W PRODUCTIONS</div>
    ${isSAB ? `<div class="field-tagline">on behalf of SA Breweries</div>` : `<div class="field-tagline">Field Operations</div>`}
    <div style="font-size:11px;color:var(--muted);margin-top:6px;line-height:1.6">
      Unit 1, No 19 Kransvalk Road, Highbury, Meyerton 1962<br>
      📞 082 321 6520 &nbsp;·&nbsp; ✉️ bibi@bwproductions.co.za &nbsp;·&nbsp; VAT 4790261301
    </div>
    <div class="field-form-title" style="margin-top:14px">${formTitle}</div>
    <div class="form-num">Ref: ${formNum} &nbsp;·&nbsp; Prepared by: <strong>${preparedBy}</strong></div>
  </div>`
}

// ─── LANDING PAGE ─────────────────────────────────────────────────────────────

app.get('/', async (c) => {
  const isAdmin = !!(await getAdminSession(c))

  const body = `
  <div class="field-wrap">
    <div class="field-header">
      <img src="/static/bw-logo.png" alt="B&W Productions" class="field-logo">
      <div class="field-brand">B&amp;W PRODUCTIONS</div>
      <div class="field-tagline">Field Operations App</div>
    </div>

    <div class="tiles-grid">
      <a href="/field/preload" class="tile tile-purple">
        <div class="tile-icon">📋</div>
        <div class="tile-label">Pre-Load</div>
        <div style="font-size:11px;font-weight:600;opacity:0.7;margin-top:3px">Office use only</div>
      </a>
      <a href="/field/delivery" class="tile tile-green">
        <div class="tile-icon">🚚</div>
        <div class="tile-label">Delivery Note</div>
      </a>
      <a href="/field/collection" class="tile tile-amber">
        <div class="tile-icon">↩️</div>
        <div class="tile-label">Collection Note</div>
      </a>
      <a href="/field/repair" class="tile tile-red">
        <div class="tile-icon">🔧</div>
        <div class="tile-label">Repair Note</div>
      </a>
      <a href="/field/inspection" class="tile tile-blue">
        <div class="tile-icon">🚘</div>
        <div class="tile-label">Vehicle Inspection</div>
      </a>
      <a href="/field/shortlist" class="tile tile-purple">
        <div class="tile-icon">📝</div>
        <div class="tile-label">Shortlist for Events</div>
      </a>
    </div>

    ${isAdmin ? `
    <div style="margin-top:14px;padding:12px;border:1px dashed rgba(59,130,246,0.4);border-radius:12px;background:rgba(59,130,246,0.05)">
      <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:#93c5fd;margin-bottom:8px;text-align:center">Office Tools</div>
      <a href="/field/admin/planner-extractor" style="display:block;padding:12px 16px;border-radius:10px;background:rgba(59,130,246,0.15);color:#93c5fd;font-size:14px;font-weight:700;text-decoration:none;text-align:center">
        📋 Planning Calendar Extractor
      </a>
    </div>` : ''}

    <div style="text-align:center;margin-top:12px">
      <a href="/field/admin" style="color:var(--muted);font-size:13px;text-decoration:none">
        <i class="fas fa-lock" style="margin-right:6px"></i>Admin
      </a>
    </div>

    ${isAdmin ? `
    <div style="text-align:center;margin-top:16px;padding-bottom:12px">
      <a href="/" style="color:var(--muted);font-size:12px;text-decoration:none;opacity:0.55">
        <i class="fas fa-tachometer-alt" style="margin-right:5px;font-size:11px"></i>Back to Dashboard
      </a>
    </div>` : ''}
  </div>`
  return c.html(fieldPage('Field Operations', body))
})

// ─── DELIVERY PRE-SCREEN ─────────────────────────────────────────────────────

app.get('/delivery', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT id, form_number, prepared_by, driver, venue, event_name,
           delivery_date, collection_date, brand, client, signature_data, is_draft
    FROM field_submissions
    WHERE form_type = 'delivery'
      AND (is_draft = 1 OR signature_data IS NULL OR signature_data = '')
      AND (delivery_date >= date('now', '-1 day') OR delivery_date IS NULL OR delivery_date = '' OR is_draft = 1)
      AND (status IS NULL OR status != 'cancelled')
    ORDER BY is_draft DESC, delivery_date ASC
    LIMIT 40
  `).all<any>()

  const combined = rows.results || []

  const cardsHtml = combined.length === 0
    ? `<div style="text-align:center;padding:28px 0;color:var(--muted);font-size:14px">
         No open or pre-loaded delivery notes right now.
       </div>`
    : combined.map((d: any) => {
        const isDraft = d.is_draft === 1
        const venue = eventVenueLabel(d, '(no venue set)')
        const date = d.delivery_date ? formatDate(d.delivery_date) : 'Date TBC'
        const badge = isDraft
          ? `<span style="padding:2px 8px;border-radius:10px;font-size:10px;font-weight:800;background:rgba(139,92,246,0.2);color:#c4b5fd;text-transform:uppercase;letter-spacing:0.06em">🗒️ Pre-loaded</span>`
          : `<span style="padding:2px 8px;border-radius:10px;font-size:10px;font-weight:800;background:rgba(16,185,129,0.15);color:#6ee7b7;text-transform:uppercase;letter-spacing:0.06em">📋 Open</span>`
        const searchStr = [d.form_number, d.venue, d.event_name, d.driver, d.brand, d.client].filter(Boolean).join(' ')
        return `
        <div data-search="${searchStr.replace(/"/g,'&quot;')}"
             style="background:var(--card);border:1px solid ${isDraft ? 'rgba(139,92,246,0.35)' : 'rgba(16,185,129,0.25)'};
                    border-radius:14px;padding:14px 16px;margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                <span style="font-size:12px;font-weight:800;color:var(--gold-lt)">${d.form_number}</span>
                ${badge}
              </div>
              <div title="${venue.replace(/"/g,'&quot;')}" style="font-size:15px;font-weight:700;color:var(--white);margin-bottom:3px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.3;word-break:break-word">${venue}</div>
              <div style="font-size:12px;color:var(--muted)">${date}${d.driver ? ' · 🚛 ' + d.driver : ''}${d.brand ? ' · 🏷️ ' + d.brand : ''}</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
              <a href="${isDraft ? '/field/delivery/open/' + d.id : '/field/success/' + d.id}"
                 style="padding:7px 14px;border-radius:8px;
                        background:${isDraft ? 'rgba(139,92,246,0.2)' : 'rgba(16,185,129,0.1)'};
                        border:1px solid ${isDraft ? 'rgba(139,92,246,0.5)' : 'rgba(16,185,129,0.3)'};
                        color:${isDraft ? '#c4b5fd' : '#6ee7b7'};
                        font-size:12px;font-weight:800;text-decoration:none;text-align:center;white-space:nowrap">
                ${isDraft ? '📋 Open Form' : '👁️ View'}
              </a>
              ${!isDraft ? `<a href="/field/collect-from/${d.id}"
                 style="padding:7px 14px;border-radius:8px;background:rgba(245,158,11,0.1);
                        border:1px solid rgba(245,158,11,0.3);color:#fcd34d;
                        font-size:12px;font-weight:700;text-decoration:none;text-align:center">
                Collect →
              </a>` : ''}
            </div>
          </div>
        </div>`
      }).join('')

  const body = `
  <div class="field-wrap">
    <div class="field-header">
      <a href="/field" style="display:inline-block;text-decoration:none">
        <img src="/static/bw-logo.png" alt="B&W Productions" class="field-logo" style="cursor:pointer">
      </a>
      <div class="field-brand">B&amp;W PRODUCTIONS</div>
      <div class="field-tagline">Field Operations</div>
      <div class="field-form-title" style="margin-top:12px">📦 Delivery Notes</div>
      <div class="form-num">Check for a pre-loaded note first — or add a new one below</div>
    </div>

    ${combined.length > 0 ? `
    <div style="position:relative;margin-bottom:14px">
      <i class="fas fa-search" style="position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--muted);font-size:14px;pointer-events:none"></i>
      <input
        id="deliverySearch"
        type="text"
        placeholder="Search by venue, form #, driver or brand…"
        oninput="filterDeliveryCards(this.value)"
        style="width:100%;box-sizing:border-box;padding:12px 14px 12px 38px;border-radius:12px;
               border:1px solid var(--border);background:var(--card);color:var(--white);
               font-size:14px;outline:none"
      >
    </div>
    <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:var(--muted);margin-bottom:12px">
      🗒️ Pre-loaded &amp; Open Notes (${combined.length})
    </div>
    <div id="deliveryCardList">
      ${cardsHtml}
    </div>
    <div id="deliveryNoResults" style="display:none;text-align:center;padding:20px 0;color:var(--muted);font-size:14px">
      No notes match your search.
    </div>
    ` : `<div style="text-align:center;padding:28px 0;color:var(--muted);font-size:14px">
      No pre-loaded notes right now — tap below to create one.
    </div>`}

    <div style="margin-top:20px;border-top:1px solid var(--border);padding-top:20px">
      <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:var(--muted);margin-bottom:12px;text-align:center">
        Nothing matching? Start fresh:
      </div>
      <a href="/field/delivery/new"
         style="display:flex;align-items:center;justify-content:center;gap:10px;padding:18px;
                border-radius:14px;text-decoration:none;
                background:linear-gradient(135deg,rgba(16,185,129,0.2),rgba(16,185,129,0.08));
                border:2px solid rgba(16,185,129,0.5);color:#6ee7b7;font-size:17px;font-weight:800">
        <i class="fas fa-plus-circle" style="font-size:20px"></i>
        Add New Delivery Note
      </a>
    </div>

    <a href="/field" style="display:block;text-align:center;padding:14px;color:var(--muted);text-decoration:none;margin-top:8px;font-size:13px">← Back to Forms</a>
  </div>
  <script>
  function filterDeliveryCards(q) {
    const term = q.toLowerCase().trim()
    const cards = document.querySelectorAll('#deliveryCardList [data-search]')
    let visible = 0
    cards.forEach(el => {
      const match = !term || el.getAttribute('data-search').toLowerCase().includes(term)
      el.style.display = match ? '' : 'none'
      if (match) visible++
    })
    document.getElementById('deliveryNoResults').style.display = (term && visible === 0) ? '' : 'none'
  }
  </script>`

  return c.html(fieldPage('Delivery Notes', body))
})

// ─── OPEN DRAFT DELIVERY NOTE ────────────────────────────────────────────────

app.get('/delivery/open/:id', async (c) => {
  const id = c.req.param('id')
  const sub = await c.env.DB.prepare('SELECT * FROM field_submissions WHERE id=? AND form_type=?')
    .bind(id, 'delivery').first<any>()
  if (!sub) return c.redirect('/field/delivery')
  if (!sub.is_draft) return c.redirect(`/field/success/${id}`)

  // Parse the full form_data blob saved by the office
  let fd: any = {}
  try { fd = JSON.parse(sub.form_data || '{}') } catch {}

  // Line items: prefer field_line_items rows; fall back to form_data.line_items
  const draftLines = await c.env.DB.prepare(
    'SELECT * FROM field_line_items WHERE submission_id=? ORDER BY sort_order'
  ).bind(id).all<any>()

  let preItems: any[] = (draftLines.results || []).map((li: any) => ({
    qty: li.quantity, item: li.item_name, brand: li.brand || '', condition: li.condition || 'Checked', comment: li.comments || ''
  }))
  // If no DB line items, fall back to what was stored in form_data JSON
  if (preItems.length === 0 && Array.isArray(fd.line_items) && fd.line_items.length > 0) {
    preItems = fd.line_items.map((li: any) => ({
      qty: li.quantity || li.qty || 1,
      item: li.item_name || li.item || '',
      brand: li.brand || '',
      condition: li.condition || 'Checked',
      comment: li.comments || li.comment || ''
    }))
  }

  // Other items (not in catalogue)
  let preOtherItems: any[] = []
  if (Array.isArray(fd.other_items) && fd.other_items.length > 0) {
    preOtherItems = fd.other_items.map((o: any) => ({
      qty: o.quantity || o.qty || 1,
      desc: o.description || o.desc || ''
    }))
  }

  const preItemsJson = JSON.stringify(preItems)
  const preOtherJson = JSON.stringify(preOtherItems)

  // Resolve vehicle: from form_data first (most accurate), then top-level column
  const savedVehicle = fd.vehicle_reg || sub.vehicle_reg || ''
  const savedVehicle2 = fd.vehicle2_reg || ''
  const savedVehicle2Driver = fd.vehicle2_driver || ''
  const savedTeam = fd.team_members || ''
  const savedCasuals = fd.casuals || ''
  const savedAttention = fd.attention || sub.attention || ''
  const savedContact = fd.contact_number || sub.contact_number || ''
  const savedAddress = fd.address || sub.address || ''
  const savedVenueAddress = fd.venue_address || sub.venue_address || ''
  const savedBrand = fd.form_brand || sub.brand || ''
  const savedNotes = fd.notes || sub.notes || ''

  // Build vehicle select with saved value pre-selected
  const knownVehicles = VEHICLES.map((v: any) => v.reg)
  const isKnownVehicle = savedVehicle && knownVehicles.includes(savedVehicle)
  const vehicleSelectHtml = `
    <select name="vehicle_reg" id="vehicleSel" onchange="updateVehicle(this)">
      <option value="">— select vehicle —</option>
      ${VEHICLES.map((v: any) => `<option value="${v.reg}"${v.reg === savedVehicle ? ' selected' : ''}>${v.reg} — ${v.desc}</option>`).join('')}
      <option value="__other__"${!isKnownVehicle && savedVehicle ? ' selected' : ''}>+ Other / not listed</option>
    </select>
    <input type="text" name="vehicle_reg_custom" id="vehicleRegCustom"
      value="${!isKnownVehicle ? savedVehicle : ''}"
      placeholder="Type reg e.g. BW01GPXX" autocapitalize="characters"
      style="display:${!isKnownVehicle && savedVehicle ? 'block' : 'none'};margin-top:8px">`

  const body = `
  <div class="field-wrap">
    ${formHeader('Delivery Note', sub.form_number, sub.letterhead || 'sab', sub.prepared_by || 'Shane')}
    <div style="background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.4);border-radius:12px;padding:12px 16px;margin-bottom:16px">
      <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:#c4b5fd;margin-bottom:4px">🗒️ Pre-loaded by Office</div>
      <div style="font-size:13px;color:var(--muted)">Review all details, adjust quantities on-site, fill any missing fields, then sign and submit.</div>
    </div>
    <form id="deliveryForm" onsubmit="submitForm(event,'delivery')">
      <input type="hidden" name="form_type" value="delivery">
      <input type="hidden" name="form_number" value="${sub.form_number}">
      <input type="hidden" name="draft_id" value="${id}">

      <div class="section">
        <div class="section-title">Letterhead</div>
        <div class="lh-toggle">
          <button type="button" class="lh-btn ${(sub.letterhead||'sab')==='sab'?'active':''}" id="lh-sab" onclick="setLH('sab')">B&amp;W on behalf of SAB</button>
          <button type="button" class="lh-btn ${(sub.letterhead||'sab')!=='sab'?'active':''}" id="lh-bw" onclick="setLH('bw')">B&amp;W Standard</button>
        </div>
        <input type="hidden" name="letterhead" id="letterheadInput" value="${sub.letterhead || 'sab'}">
      </div>

      <div class="section">
        <div class="section-title">Form Details</div>
        <div class="field-group"><label>Prepared By</label>
          <select name="prepared_by" id="preparedBy" onchange="updatePreparedBy(this)">${peopleOptions(sub.prepared_by || 'Shane')}</select>
          <input type="text" name="prepared_by_custom" id="preparedByCustom" placeholder="Enter name…" style="display:none;margin-top:8px">
        </div>
        <div class="field-group"><label>Driver</label>
          <select name="driver" id="driverSel" onchange="refreshTeamPicker && refreshTeamPicker()">
            ${driverOptions(fd.driver || sub.driver || '')}
          </select>
          <input type="text" name="driver_custom" id="driverCustom" placeholder="Driver name…" style="display:none;margin-top:8px">
        </div>
        <div class="field-group"><label>Delivery Date</label><input type="date" name="delivery_date" value="${sub.delivery_date || todayStr()}" required></div>
        <div class="field-group"><label>Collection Date</label><input type="date" name="collection_date" value="${sub.collection_date || fd.collection_date || ''}"></div>
        <div class="field-group"><label>Vehicle</label>
          ${vehicleSelectHtml}
        </div>
      </div>

      ${teamCrewSection()}

      <div class="section">
        <div class="section-title">Client &amp; Venue</div>
        <div class="field-group"><label>Client</label>
          <select name="client">
            <option value="South African Breweries" ${(sub.client||'').toLowerCase() !== 'sab' && (sub.client||fd.client||'') !== 'other' ? 'selected' : ''}>South African Breweries (SAB)</option>
            <option value="Other" ${(sub.client||fd.client||'') === 'Other' ? 'selected' : ''}>Other</option>
          </select>
        </div>
        ${venueTypeaheadField('venue', sub.venue || fd.venue || '', savedVenueAddress, true)}
        <div class="field-group"><label>Event / Activation</label><input type="text" name="event_name" value="${sub.event_name || fd.event_name || ''}" placeholder="e.g. Castle Lite Unlocks"></div>
        <div class="field-group"><label>Attention / Contact on Site</label><input type="text" name="attention" value="${savedAttention}" placeholder="Contact person on site"></div>
        <div class="field-group"><label>Contact Number</label><input type="tel" name="contact_number" value="${savedContact}" placeholder="0XX XXX XXXX"></div>
      </div>

      <div class="section">
        <div class="section-title">Brand (applies to all items)</div>
        <select name="form_brand" id="formBrand" onchange="applyFormBrand(this.value)">${brandOptions(savedBrand)}</select>
      </div>

      <div class="section">
        <div class="section-title">Equipment List
          ${preItems.length > 0 ? `<span style="margin-left:8px;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:800;background:rgba(139,92,246,0.2);color:#c4b5fd">${preItems.length} item${preItems.length !== 1 ? 's' : ''} pre-loaded</span>` : ''}
        </div>
        ${preItems.length > 0
          ? `<div style="background:rgba(139,92,246,0.06);border:1px solid rgba(139,92,246,0.2);border-radius:8px;padding:10px 14px;font-size:13px;color:#c4b5fd;margin-bottom:14px">📋 Pre-loaded by office — confirm quantities, adjust as needed, and add any missing items.</div>`
          : `<div style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.2);border-radius:8px;padding:10px 14px;font-size:13px;color:#fcd34d;margin-bottom:14px">⚠️ No items were pre-loaded — please add everything you're delivering below.</div>`
        }
        <div class="line-items-wrap" id="lineItems"></div>
        <button type="button" class="add-line-btn" onclick="addLineItem()"><i class="fas fa-plus"></i> Add Item</button>
      </div>

      <div class="section">
        <div class="section-title">Other Items (not in list)</div>
        <div id="otherItems"></div>
        <button type="button" class="add-line-btn" onclick="addOtherItem()"><i class="fas fa-plus"></i> Add Other Item</button>
      </div>

      <div class="section">
        <div class="section-title" style="display:flex;align-items:center;justify-content:space-between">
          <span>Notes from Office</span>
          <span id="notesSaveStatus" style="font-size:11px;font-weight:500;color:var(--muted);text-transform:none;letter-spacing:0"></span>
        </div>
        <textarea id="notesEditable" name="notes"
          oninput="markNotesDirty()"
          style="width:100%;min-height:96px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:8px;padding:12px 14px;font-size:14px;color:var(--white);font-family:inherit;line-height:1.5;resize:vertical"
          placeholder="Notes from the office (editable)…">${(savedNotes || '').replace(/</g,'&lt;')}</textarea>
        <div style="display:flex;gap:8px;margin-top:8px;align-items:center">
          <button type="button" id="notesSaveBtn" onclick="saveNotes(${id})"
            style="padding:8px 16px;border-radius:8px;background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.4);color:#fcd34d;font-weight:600;font-size:13px;cursor:pointer">
            💾 Save Notes
          </button>
          <span style="font-size:11px;color:var(--muted)">Edits here update the office notes for this delivery — your version becomes the record.</span>
        </div>
      </div>
      <script>
        let _notesDirty = false
        function markNotesDirty() {
          _notesDirty = true
          const s = document.getElementById('notesSaveStatus')
          if (s) { s.textContent = '● Unsaved'; s.style.color = '#fcd34d' }
        }
        async function saveNotes(subId) {
          const txt = document.getElementById('notesEditable').value
          const btn = document.getElementById('notesSaveBtn')
          const s = document.getElementById('notesSaveStatus')
          btn.disabled = true; btn.textContent = '⏳ Saving…'
          try {
            const res = await fetch('/field/notes/update/' + subId, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ notes: txt })
            })
            const j = await res.json()
            if (j.success) {
              _notesDirty = false
              if (s) { s.textContent = '✓ Saved'; s.style.color = '#10b981' }
              btn.textContent = '💾 Save Notes'
              setTimeout(() => { if (!_notesDirty && s) s.textContent = '' }, 2500)
            } else {
              if (s) { s.textContent = '✗ ' + (j.error || 'Save failed'); s.style.color = '#ef4444' }
              btn.textContent = '💾 Retry Save'
            }
          } catch (e) {
            if (s) { s.textContent = '✗ Network error'; s.style.color = '#ef4444' }
            btn.textContent = '💾 Retry Save'
          } finally {
            btn.disabled = false
          }
        }
        window.addEventListener('beforeunload', (e) => {
          if (_notesDirty) { e.preventDefault(); e.returnValue = '' }
        })
      </script>

      <button type="button" class="btn-review no-print" onclick="showReviewSummary(event,'delivery')">👁️ Review Summary</button>
      <div class="section" id="sigSection" style="display:none">
        <div class="section-title">Received By</div>
        <div style="font-size:13px;color:var(--muted);margin-bottom:14px">✅ Summary confirmed — please sign below.</div>
        <div class="field-group"><label>Received By (Name)</label><input type="text" name="received_by" placeholder="Name of person receiving"></div>
        <div class="field-group">
          <label>Signature</label>
          <div class="sig-wrap"><canvas class="sig-canvas" id="sigCanvas"></canvas><input type="hidden" name="signature_data" id="sigData"></div>
          <div class="sig-controls"><button type="button" class="sig-clear" onclick="clearSig()">Clear</button></div>
          <div class="sig-hint">Sign with finger or mouse above</div>
        </div>
      </div>
      <div class="section" id="footerSection" style="background:rgba(13,17,23,0.5);display:none">
        <div style="font-size:13px;color:var(--muted);text-align:center">
          <strong style="color:var(--white)">Delivered By:</strong> B&amp;W Productions Team<br>
          Unit 1, No 19 Kransvalk Road, Highbury, Meyerton 1962<br>
          082 321 6520 · bibi@bwproductions.co.za · VAT 4790261301
        </div>
      </div>
      <button type="submit" class="btn-submit no-print" id="submitBtn" style="display:none">Submit Delivery Note</button>
    </form>
  </div>
  ${summaryModal()}
  ${signatureScript()}
  ${lineItemScript()}
  ${submitScript('delivery')}
  ${venueTypeaheadScript()}
  <script>
  // ── Pre-load all saved data into the form ──────────────────────────────────
  var _preItems      = ${preItemsJson}
  var _preOtherItems = ${preOtherJson}
  var _savedTeam     = ${JSON.stringify(savedTeam)}
  var _savedCasuals  = ${JSON.stringify(savedCasuals)}
  var _savedVehicle2     = ${JSON.stringify(savedVehicle2)}
  var _savedVehicle2Driver = ${JSON.stringify(savedVehicle2Driver)}
  var _savedBrand    = ${JSON.stringify(savedBrand)}

  function restoreDraftData() {
    // Each step is wrapped in its own try/catch so a failure in one step
    // (e.g. a missing dropdown option) cannot cascade and silently skip
    // later steps like team members or casuals.
    // Order: light/critical fields FIRST, heavy equipment LAST.

    // 1. Team members  (was step 4 — moved up so it can never be blocked)
    try {
      if (_savedTeam) {
        _savedTeam.split(',').forEach(function(name) {
          name = name.trim()
          if (!name) return
          if (_teamMembers.indexOf(name) === -1) _teamMembers.push(name)
        })
        if (typeof renderTeamMembers === 'function') renderTeamMembers()
      }
    } catch(e) { console.warn('restoreDraftData: team members failed', e) }

    // 2. Casuals  (was step 5)
    try {
      if (_savedCasuals) {
        _savedCasuals.split(',').forEach(function(name) {
          name = name.trim()
          if (!name) return
          addCasual()
          var el = document.getElementById('casual_name_' + _casualCount)
          if (el) { el.value = name; updateCasualsHidden() }
        })
      }
    } catch(e) { console.warn('restoreDraftData: casuals failed', e) }

    // 3. Second vehicle  (was step 6)
    try {
      if (_savedVehicle2) {
        var sec = document.getElementById('vehicle2Section')
        var btn = document.getElementById('addVehicle2Btn')
        if (sec) sec.style.display = 'block'
        if (btn) btn.style.display = 'none'
        var v2sel = document.getElementById('vehicle2Sel')
        var v2custom = document.getElementById('vehicle2RegCustom')
        if (v2sel) {
          var knownV2 = false
          for (var i = 0; i < v2sel.options.length; i++) {
            if (v2sel.options[i].value === _savedVehicle2) { v2sel.selectedIndex = i; knownV2 = true; break }
          }
          if (!knownV2 && v2custom) {
            v2sel.value = '__other__'
            v2custom.style.display = 'block'
            v2custom.value = _savedVehicle2
          }
        }
        if (_savedVehicle2Driver) {
          var v2drv = document.querySelector('[name="vehicle2_driver"]')
          if (v2drv) v2drv.value = _savedVehicle2Driver
        }
      }
    } catch(e) { console.warn('restoreDraftData: second vehicle failed', e) }

    // 4. Apply overall form brand  (was step 3)
    try {
      if (_savedBrand) {
        var fb = document.getElementById('formBrand')
        if (fb) { fb.value = _savedBrand; applyFormBrand(_savedBrand) }
      }
    } catch(e) { console.warn('restoreDraftData: form brand failed', e) }

    // 5. Equipment line items  (was step 1 — moved last because it's the heaviest)
    try {
      _preItems.forEach(function(pi, idx) {
        try {
          addLineItem()
          var n = lineCount
          var s = document.querySelector('[name="li_item_'+n+'"]')
          if (s) {
            var found = false
            for (var i = 0; i < s.options.length; i++) {
              if (s.options[i].value === pi.item) { s.selectedIndex = i; found = true; break }
            }
            if (!found && pi.item) {
              var opt = document.createElement('option')
              opt.value = pi.item; opt.text = pi.item; opt.selected = true
              // Use appendChild — insertBefore(s.options[1]) crashes when select has only the placeholder
              s.appendChild(opt)
              s.value = pi.item
            }
          }
          var q = document.querySelector('[name="li_qty_'+n+'"]')
          if (q) q.value = pi.qty || 1
          var b = document.querySelector('[name="li_brand_'+n+'"]')
          if (b && pi.brand) {
            var brandFound = false
            for (var j = 0; j < b.options.length; j++) {
              if (b.options[j].value === pi.brand) { b.selectedIndex = j; brandFound = true; break }
            }
            if (!brandFound) {
              // Brand not in dropdown — inject as custom option so it sticks
              var bopt = document.createElement('option')
              bopt.value = pi.brand; bopt.text = pi.brand; bopt.selected = true
              b.appendChild(bopt)
              b.value = pi.brand
            }
          }
          if (pi.condition && typeof setCond === 'function') setCond(n, pi.condition)
          var cm = document.querySelector('[name="li_comment_'+n+'"]')
          if (cm && pi.comment) cm.value = pi.comment
        } catch(rowErr) {
          console.warn('restoreDraftData: equipment row ' + idx + ' failed', rowErr)
        }
      })
    } catch(e) { console.warn('restoreDraftData: equipment list failed', e) }

    // 6. Other items  (was step 2)
    try {
      _preOtherItems.forEach(function(o, idx) {
        try {
          addOtherItem()
          var n = otherCount
          var d = document.querySelector('[name="other_desc_'+n+'"]')
          if (d) d.value = o.desc || ''
          var q = document.querySelector('[name="other_qty_'+n+'"]')
          if (q) q.value = o.qty || 1
        } catch(rowErr) {
          console.warn('restoreDraftData: other-item row ' + idx + ' failed', rowErr)
        }
      })
    } catch(e) { console.warn('restoreDraftData: other items failed', e) }
  }

  // Run after all scripts have set up their variables
  window.addEventListener('DOMContentLoaded', restoreDraftData)
  </script>`
  return c.html(fieldPage(`Delivery — ${sub.form_number}`, body))
})

// ─── NEW DELIVERY NOTE (blank form) ──────────────────────────────────────────

app.get('/delivery/new', async (c) => {
  const num = await nextFormNumber(c.env.DB, 'delivery')

  const body = `
  <div class="field-wrap">
    ${formHeader('Delivery Note', num, 'sab', 'Shane')}
    <form id="deliveryForm" onsubmit="submitForm(event,'delivery')">
      <input type="hidden" name="form_type" value="delivery">
      <input type="hidden" name="form_number" value="${num}">

      <!-- AI Photo Import -->
      <div class="section" id="aiImportSection" style="border-color:rgba(139,92,246,0.4)">
        <div class="section-title" style="color:#c4b5fd">🤖 Import from Photo (AI)</div>
        <div style="font-size:13px;color:var(--muted);margin-bottom:14px">
          Take a photo of any order sheet — AI will read it and fill in the form automatically.
        </div>
        <div class="photo-upload-area" id="aiUploadArea" onclick="document.getElementById('aiPhotoInput').click()" style="border-color:rgba(139,92,246,0.4)">
          <input type="file" id="aiPhotoInput" accept="image/*" multiple onchange="handleAIPhotos(this)" style="display:none">
          <div class="photo-upload-icon">📄</div>
          <div class="photo-upload-label" style="color:#c4b5fd">Tap to photograph order sheet</div>
          <div class="photo-upload-hint">Camera or gallery · up to 3 photos</div>
        </div>
        <div class="photo-previews" id="aiPhotoPreviews"></div>
        <div id="aiPhotoCount" style="font-size:12px;color:var(--muted);margin-top:6px;text-align:center"></div>
        <button type="button" id="aiExtractBtn" onclick="runAIExtract()"
          style="display:none;width:100%;margin-top:12px;padding:14px;border-radius:10px;border:none;
                 background:linear-gradient(135deg,#5b21b6,#8b5cf6,#c4b5fd);
                 color:#fff;font-size:16px;font-weight:800;cursor:pointer">
          🤖 Extract Details with AI
        </button>
        <div id="aiStatus" style="display:none;margin-top:10px;padding:12px;border-radius:8px;font-size:14px;text-align:center"></div>
      </div>

      <!-- AI Confirmation Panel -->
      <div id="aiConfirmPanel" style="display:none">
        <div class="section" style="border-color:rgba(16,185,129,0.4)">
          <div class="section-title" style="color:#6ee7b7">✅ AI Extracted — Review &amp; Edit</div>
          <div style="font-size:13px;color:var(--muted);margin-bottom:16px">Check everything — edit any field before loading into form.</div>
          <div id="aiReviewFields"></div>
          <div id="aiReviewItems" style="margin-top:16px"></div>
          <div id="aiReviewOthers" style="margin-top:12px"></div>
          <div style="display:flex;gap:10px;margin-top:16px">
            <button type="button" onclick="loadAIIntoForm()"
              style="flex:1;padding:14px;border-radius:10px;border:none;background:linear-gradient(135deg,#065f46,#10b981,#6ee7b7);color:#000;font-size:15px;font-weight:800;cursor:pointer">
              ✅ Looks Good — Load into Form
            </button>
            <button type="button" onclick="resetAIPanel()"
              style="padding:14px 18px;border-radius:10px;border:1px solid var(--border);background:transparent;color:var(--muted);font-size:14px;cursor:pointer">
              ✕ Cancel
            </button>
          </div>
        </div>
      </div>

      <!-- Letterhead -->
      <div class="section">
        <div class="section-title">Letterhead</div>
        <div class="lh-toggle">
          <button type="button" class="lh-btn active" id="lh-sab" onclick="setLH('sab')">B&amp;W on behalf of SAB</button>
          <button type="button" class="lh-btn" id="lh-bw" onclick="setLH('bw')">B&amp;W Standard</button>
        </div>
        <input type="hidden" name="letterhead" id="letterheadInput" value="sab">
      </div>

      <!-- Form details -->
      <div class="section">
        <div class="section-title">Form Details</div>
        <div class="field-group">
          <label>Prepared By</label>
          <select name="prepared_by" id="preparedBy" onchange="updatePreparedBy(this)">${peopleOptions('Bibi')}</select>
          <input type="text" name="prepared_by_custom" id="preparedByCustom" placeholder="Enter name…" style="display:none;margin-top:8px">
        </div>
        <div class="field-group">
          <label>Driver(s)</label>
          <select name="driver" id="driverSel" onchange="refreshTeamPicker && refreshTeamPicker()">
            ${driverOptions()}
          </select>
          <input type="text" name="driver_custom" id="driverCustom" placeholder="Driver name…" style="display:none;margin-top:8px">
        </div>
        <div class="field-group"><label>Date</label><input type="date" name="delivery_date" value="${todayStr()}" required></div>
        <div class="field-group"><label>Collection Date</label><input type="date" name="collection_date"></div>
        <div class="field-group">
          <label>Vehicle</label>
          <select name="vehicle_reg" id="vehicleSel" onchange="updateVehicle(this)">${vehicleOptions()}<option value="__other__">+ Other / not listed</option></select>
          <input type="text" name="vehicle_reg_custom" id="vehicleRegCustom" placeholder="Type reg e.g. BW01GPXX" autocapitalize="characters" style="display:none;margin-top:8px">
        </div>
      </div>

      ${teamCrewSection()}

      <!-- Client & Venue -->
      <div class="section">
        <div class="section-title">Client &amp; Venue</div>
        <div class="field-group"><label>Client</label>
          <select name="client">
            <option value="South African Breweries" selected>South African Breweries (SAB)</option>
            <option value="Other">Other</option>
          </select>
        </div>
        ${venueTypeaheadField('venue', '', '', true)}
        <div class="field-group"><label>Event / Activation Name</label><input type="text" name="event_name" placeholder="e.g. Castle Lite Unlocks"></div>
        <div class="field-group"><label>Attention / Contact on Site</label><input type="text" name="attention" placeholder="Contact person on site"></div>
        <div class="field-group"><label>Contact Number</label><input type="tel" name="contact_number" placeholder="0XX XXX XXXX"></div>
      </div>

      <!-- Brand for whole form -->
      <div class="section">
        <div class="section-title">Brand (applies to all items)</div>
        <select name="form_brand" id="formBrand" onchange="applyFormBrand(this.value)">${brandOptions()}</select>
      </div>

      <!-- Equipment -->
      <div class="section">
        <div class="section-title">Equipment List</div>
        <div class="line-items-wrap" id="lineItems"></div>
        <button type="button" class="add-line-btn" onclick="addLineItem()"><i class="fas fa-plus"></i> Add Item</button>
      </div>

      <!-- Other items -->
      <div class="section">
        <div class="section-title">Other Items (not in list)</div>
        <div id="otherItems"></div>
        <button type="button" class="add-line-btn" onclick="addOtherItem()"><i class="fas fa-plus"></i> Add Other Item</button>
      </div>

      <button type="button" class="btn-review no-print" onclick="showReviewSummary(event,'delivery')">👁️ Review Summary</button>

      <div class="section" id="sigSection" style="display:none">
        <div class="section-title">Received By</div>
        <div style="font-size:13px;color:var(--muted);margin-bottom:14px">✅ Summary confirmed — please sign below.</div>
        <div class="field-group"><label>Received By (Name)</label><input type="text" name="received_by" placeholder="Name of person receiving"></div>
        <div class="field-group">
          <label>Signature</label>
          <div class="sig-wrap"><canvas class="sig-canvas" id="sigCanvas"></canvas><input type="hidden" name="signature_data" id="sigData"></div>
          <div class="sig-controls"><button type="button" class="sig-clear" onclick="clearSig()">Clear</button></div>
          <div class="sig-hint">Sign with finger or mouse above</div>
        </div>
      </div>

      <div class="section" id="footerSection" style="background:rgba(13,17,23,0.5);display:none">
        <div style="font-size:13px;color:var(--muted);text-align:center">
          <strong style="color:var(--white)">Delivered By:</strong> B&amp;W Productions Team<br>
          Unit 1, No 19 Kransvalk Road, Highbury, Meyerton 1962<br>
          082 321 6520 · bibi@bwproductions.co.za · VAT 4790261301
        </div>
      </div>

      <button type="submit" class="btn-submit no-print" id="submitBtn" style="display:none">Submit Delivery Note</button>
    </form>
  </div>
  ${summaryModal()}
  ${signatureScript()}
  ${lineItemScript()}
  ${submitScript('delivery')}
  ${aiImportScript()}
  ${venueTypeaheadScript()}
  `
  return c.html(fieldPage('Delivery Note', body))
})

// ─── COLLECTION PRE-SCREEN ────────────────────────────────────────────────────

app.get('/collection', async (c) => {
  // Show open delivery notes that need collection + any standalone open collections
  const deliveryRows = await c.env.DB.prepare(`
    SELECT id, form_number, prepared_by, driver, venue, event_name,
           delivery_date, collection_date, brand, client, collection_status
    FROM field_submissions
    WHERE form_type = 'delivery'
      AND (collection_status IS NULL OR collection_status = 'pending')
      AND (delivery_date >= date('now', '-3 day') OR delivery_date IS NULL OR delivery_date = '')
    ORDER BY delivery_date ASC
    LIMIT 30
  `).all<any>()

  const deliveries = deliveryRows.results || []

  const cardsHtml = deliveries.length === 0
    ? `<div style="text-align:center;padding:28px 0;color:var(--muted);font-size:14px">
         No pending deliveries to collect right now.
       </div>`
    : deliveries.map((d: any) => {
        const venue = eventVenueLabel(d, '(no venue)')
        const date = d.delivery_date ? formatDate(d.delivery_date) : 'Date TBC'
        const colDate = d.collection_date ? ' → Collect ' + formatDate(d.collection_date) : ''
        const searchStr = [d.form_number, d.venue, d.event_name, d.driver, d.brand, d.client].filter(Boolean).join(' ')
        return `
        <a href="/field/collect-from/${d.id}" data-search="${searchStr.replace(/"/g,'&quot;')}" style="display:block;text-decoration:none;margin-bottom:10px">
          <div style="background:var(--card);border:1px solid rgba(245,158,11,0.35);border-radius:14px;padding:14px 16px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
              <div style="flex:1;min-width:0">
                <div style="font-size:12px;font-weight:800;color:var(--gold-lt);margin-bottom:3px">${d.form_number}</div>
                <div title="${venue.replace(/"/g,'&quot;')}" style="font-size:15px;font-weight:700;color:var(--white);margin-bottom:3px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.3;word-break:break-word">${venue}</div>
                <div style="font-size:12px;color:var(--muted)">${date}${colDate}${d.driver ? ' · 🚛 ' + d.driver : ''}${d.brand ? ' · 🏷️ ' + d.brand : ''}</div>
              </div>
              <div style="flex-shrink:0;padding:8px 14px;border-radius:8px;background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.4);color:#fcd34d;font-size:13px;font-weight:800;white-space:nowrap">
                🔄 Collect →
              </div>
            </div>
          </div>
        </a>`
      }).join('')

  const body = `
  <div class="field-wrap">
    <div class="field-header">
      <a href="/field" style="display:inline-block;text-decoration:none">
        <img src="/static/bw-logo.png" alt="B&W Productions" class="field-logo" style="cursor:pointer">
      </a>
      <div class="field-brand">B&amp;W PRODUCTIONS</div>
      <div class="field-tagline">Field Operations</div>
      <div class="field-form-title" style="margin-top:12px">🔄 Collection Notes</div>
      <div class="form-num">Check for a pre-loaded delivery first — or start a new one below</div>
    </div>

    ${deliveries.length > 0 ? `
    <div style="position:relative;margin-bottom:14px">
      <i class="fas fa-search" style="position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--muted);font-size:14px;pointer-events:none"></i>
      <input
        id="collectionSearch"
        type="text"
        placeholder="Search by venue, form #, driver or brand…"
        oninput="filterCollectionCards(this.value)"
        style="width:100%;box-sizing:border-box;padding:12px 14px 12px 38px;border-radius:12px;
               border:1px solid var(--border);background:var(--card);color:var(--white);
               font-size:14px;outline:none"
      >
    </div>
    <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:var(--muted);margin-bottom:12px">
      📦 Pending Collections (${deliveries.length})
    </div>
    <div id="collectionCardList">
      ${cardsHtml}
    </div>
    <div id="collectionNoResults" style="display:none;text-align:center;padding:20px 0;color:var(--muted);font-size:14px">
      No collections match your search.
    </div>
    ` : `<div style="text-align:center;padding:28px 0;color:var(--muted);font-size:14px">
      No pre-loaded collections right now — tap below to start a new one.
    </div>`}

    <div style="margin-top:20px;border-top:1px solid var(--border);padding-top:20px">
      <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:var(--muted);margin-bottom:12px;text-align:center">
        Nothing matching? Start fresh:
      </div>
      <a href="/field/collection/new"
         style="display:flex;align-items:center;justify-content:center;gap:10px;padding:18px;
                border-radius:14px;text-decoration:none;
                background:linear-gradient(135deg,rgba(245,158,11,0.2),rgba(245,158,11,0.08));
                border:2px solid rgba(245,158,11,0.5);color:#fcd34d;font-size:17px;font-weight:800">
        <i class="fas fa-plus-circle" style="font-size:20px"></i>
        Add New Collection Note
      </a>
    </div>

    <a href="/field" style="display:block;text-align:center;padding:14px;color:var(--muted);text-decoration:none;margin-top:8px;font-size:13px">← Back to Forms</a>
  </div>
  <script>
  function filterCollectionCards(q) {
    const term = q.toLowerCase().trim()
    const cards = document.querySelectorAll('#collectionCardList [data-search]')
    let visible = 0
    cards.forEach(el => {
      const match = !term || el.getAttribute('data-search').toLowerCase().includes(term)
      el.style.display = match ? '' : 'none'
      if (match) visible++
    })
    document.getElementById('collectionNoResults').style.display = (term && visible === 0) ? '' : 'none'
  }
  </script>`

  return c.html(fieldPage('Collection Notes', body))
})

// ─── BLANK COLLECTION NOTE ────────────────────────────────────────────────────

app.get('/collection/new', async (c) => {
  const num = await nextFormNumber(c.env.DB, 'collection')
  const body = `
  <div class="field-wrap">
    ${formHeader('Collection Note', num, 'sab', 'Shane')}
    <form id="deliveryForm" onsubmit="submitForm(event,'collection')">
      <input type="hidden" name="form_type" value="collection">
      <input type="hidden" name="form_number" value="${num}">

      <div class="section">
        <div class="section-title">Letterhead</div>
        <div class="lh-toggle">
          <button type="button" class="lh-btn active" id="lh-sab" onclick="setLH('sab')">B&amp;W on behalf of SAB</button>
          <button type="button" class="lh-btn" id="lh-bw" onclick="setLH('bw')">B&amp;W Standard</button>
        </div>
        <input type="hidden" name="letterhead" id="letterheadInput" value="sab">
      </div>

      <div class="section">
        <div class="section-title">Form Details</div>
        <div class="field-group">
          <label>Prepared By</label>
          <select name="prepared_by" onchange="updatePreparedBy(this)">${peopleOptions('Bibi')}</select>
          <input type="text" name="prepared_by_custom" id="preparedByCustom" placeholder="Enter name…" style="display:none;margin-top:8px">
        </div>
        <div class="field-group"><label>Driver(s)</label>
          <select name="driver" id="driverSel" onchange="refreshTeamPicker && refreshTeamPicker()">${driverOptions()}</select>
        </div>
        <div class="field-group"><label>Collection Date</label><input type="date" name="collection_date" value="${todayStr()}" required></div>
        <div class="field-group"><label>Vehicle</label>
          <select name="vehicle_reg" id="vehicleSel" onchange="updateVehicle(this)">${vehicleOptions()}<option value="__other__">+ Other / not listed</option></select>
          <input type="text" name="vehicle_reg_custom" id="vehicleRegCustom" placeholder="Type reg e.g. BW01GPXX" autocapitalize="characters" style="display:none;margin-top:8px">
        </div>
      </div>

      ${teamCrewSection()}

      <div class="section">
        <div class="section-title">Client &amp; Venue</div>
        <div class="field-group"><label>Client</label>
          <select name="client">
            <option value="South African Breweries" selected>South African Breweries (SAB)</option>
            <option value="Other">Other</option>
          </select>
        </div>
        ${venueTypeaheadField('venue', '', '', true)}
        <div class="field-group"><label>Event / Activation</label><input type="text" name="event_name" placeholder="Event name"></div>
        <div class="field-group"><label>Attention</label><input type="text" name="attention" placeholder="Contact person"></div>
        <div class="field-group"><label>Contact Number</label><input type="tel" name="contact_number" placeholder="0XX XXX XXXX"></div>
      </div>

      <div class="section">
        <div class="section-title">Brand (applies to all items)</div>
        <select name="form_brand" id="formBrand" onchange="applyFormBrand(this.value)">${brandOptions()}</select>
      </div>

      <div class="section">
        <div class="section-title">Items Being Collected</div>
        <div class="line-items-wrap" id="lineItems"></div>
        <button type="button" class="add-line-btn" onclick="addLineItem()"><i class="fas fa-plus"></i> Add Item</button>
      </div>

      <div class="section">
        <div class="section-title">Other Items (not in list)</div>
        <div id="otherItems"></div>
        <button type="button" class="add-line-btn" onclick="addOtherItem()"><i class="fas fa-plus"></i> Add Other Item</button>
      </div>

      <!-- Damage Report -->
      <div class="section" style="border-color:rgba(239,68,68,0.3)">
        <div class="section-title" style="color:#fca5a5">⚠️ Damage Report</div>
        <div style="font-size:14px;color:var(--muted);margin-bottom:14px">Were any items found damaged or missing on collection?</div>
        <div style="display:flex;gap:10px;margin-bottom:4px">
          <button type="button" id="dmgNo" class="lh-btn active" onclick="setDamage(false)" style="border-color:#10b981;color:#6ee7b7;background:rgba(16,185,129,0.1)">✅ No damage</button>
          <button type="button" id="dmgYes" class="lh-btn" onclick="setDamage(true)">⚠️ Yes — report damage</button>
        </div>
        <input type="hidden" name="has_damage" id="hasDamage" value="no">
        <div id="damageSection" style="display:none;margin-top:16px">
          <div class="field-group">
            <label>Damage Description</label>
            <textarea name="damage_notes" id="damageNotes" placeholder="Describe the damage — which items, what condition, what happened…" style="min-height:100px"></textarea>
          </div>
          <div class="field-group">
            <label style="color:#fca5a5">📸 Photo Evidence (required for damage)</label>
            <div class="photo-upload-area" onclick="document.getElementById('photoInput').click()" style="border-color:rgba(239,68,68,0.4)">
              <input type="file" id="photoInput" accept="image/*" multiple onchange="handlePhotos(this)" style="display:none">
              <div class="photo-upload-icon">📷</div>
              <div class="photo-upload-label" style="color:#fca5a5">Tap to photograph damage</div>
              <div class="photo-upload-hint">Camera or gallery · multiple photos allowed</div>
            </div>
            <div class="photo-previews" id="photoPreviews"></div>
            <div class="photo-count" id="photoCount"></div>
          </div>
        </div>
      </div>

      <button type="button" class="btn-review no-print" onclick="showReviewSummary(event,'collection')">👁️ Review Summary</button>

      <div class="section" id="sigSection" style="display:none">
        <div class="section-title">Received By (Handover)</div>
        <div style="font-size:13px;color:var(--muted);margin-bottom:14px">✅ Summary confirmed — please sign below.</div>
        <div class="field-group"><label>Name</label><input type="text" name="received_by" placeholder="Person releasing items"></div>
        <div class="field-group">
          <label>Signature</label>
          <canvas class="sig-canvas" id="sigCanvas"></canvas>
          <input type="hidden" name="signature_data" id="sigData">
          <div class="sig-controls"><button type="button" class="sig-clear" onclick="clearSig()">Clear</button></div>
          <div class="sig-hint">Sign with finger or mouse</div>
        </div>
      </div>

      <div class="section" id="footerSection" style="background:rgba(13,17,23,0.5);display:none">
        <div style="font-size:13px;color:var(--muted);text-align:center">
          <strong style="color:var(--white)">Collected By:</strong> B&amp;W Productions Team<br>
          Unit 1, No 19 Kransvalk Road, Highbury, Meyerton 1962<br>
          082 321 6520 · bibi@bwproductions.co.za · VAT 4790261301
        </div>
      </div>

      <button type="submit" class="btn-submit no-print" id="submitBtn" style="display:none">Submit Collection Note</button>
    </form>
  </div>
  ${summaryModal()}
  ${signatureScript()}
  ${lineItemScript()}
  ${photoScript()}
  ${submitScript('collection')}
  <script>
  function setDamage(hasDmg) {
    document.getElementById('hasDamage').value = hasDmg ? 'yes' : 'no'
    document.getElementById('damageSection').style.display = hasDmg ? 'block' : 'none'
    var yesBtn = document.getElementById('dmgYes'), noBtn = document.getElementById('dmgNo')
    if (hasDmg) {
      yesBtn.style.borderColor='#ef4444'; yesBtn.style.color='#fca5a5'; yesBtn.style.background='rgba(239,68,68,0.12)'
      noBtn.style.borderColor='var(--border)'; noBtn.style.color='var(--muted)'; noBtn.style.background='transparent'
    } else {
      noBtn.style.borderColor='#10b981'; noBtn.style.color='#6ee7b7'; noBtn.style.background='rgba(16,185,129,0.1)'
      yesBtn.style.borderColor='var(--border)'; yesBtn.style.color='var(--muted)'; yesBtn.style.background='transparent'
    }
  }
  </script>`
  return c.html(fieldPage('Collection Note', body))
})

// ─── REPAIR NOTE ──────────────────────────────────────────────────────────────

app.get('/repair', async (c) => {
  const num = await nextFormNumber(c.env.DB, 'repair')
  const body = `
  <div class="field-wrap">
    ${formHeader('Repair Note', num, 'bw', 'Shane')}
    <form id="deliveryForm" onsubmit="submitForm(event,'repair')">
      <input type="hidden" name="form_type" value="repair">
      <input type="hidden" name="form_number" value="${num}">

      <div class="section">
        <div class="section-title">Form Details</div>
        <div class="field-group">
          <label>Prepared By</label>
          <select name="prepared_by" onchange="updatePreparedBy(this)">${peopleOptions('Bibi')}</select>
          <input type="text" name="prepared_by_custom" id="preparedByCustom" placeholder="Enter name…" style="display:none;margin-top:8px">
        </div>
        <div class="field-group"><label>Date</label><input type="date" name="delivery_date" value="${todayStr()}" required></div>
        <div class="field-group"><label>Vehicle Reg (if applicable)</label><input type="text" name="vehicle_reg" placeholder="e.g. BW 01 GP" autocapitalize="characters"></div>
      </div>

      <div class="section">
        <div class="section-title">Location / Venue</div>
        ${venueTypeaheadField('venue', '', '', false)}
        <div class="field-group"><label>Attention / Reported By</label><input type="text" name="attention" placeholder="Who reported it"></div>
        <div class="field-group"><label>Contact Number</label><input type="tel" name="contact_number" placeholder="0XX XXX XXXX"></div>
      </div>

      <div class="section">
        <div class="section-title">Items Requiring Repair</div>
        <div class="line-items-wrap" id="lineItems"></div>
        <button type="button" class="add-line-btn" onclick="addLineItem()"><i class="fas fa-plus"></i> Add Item</button>
      </div>

      <div class="section">
        <div class="section-title">Other Items / Notes</div>
        <div id="otherItems"></div>
        <button type="button" class="add-line-btn" onclick="addOtherItem()"><i class="fas fa-plus"></i> Add Other</button>
        <div class="field-group" style="margin-top:12px"><label>Additional Notes</label><textarea name="notes" placeholder="Describe the fault, urgency, or any context…"></textarea></div>
      </div>

      <button type="button" class="btn-review no-print" onclick="showReviewSummary(event,'repair')">
        👁️ Review Summary
      </button>

      <div class="section" id="sigSection" style="display:none">
        <div class="section-title">Sign Off</div>
        <div style="font-size:13px;color:var(--muted);margin-bottom:14px">✅ Summary confirmed — please sign below.</div>
        <div class="field-group"><label>Reported By (Name)</label><input type="text" name="received_by" placeholder="Name"></div>
        <div class="field-group">
          <label>Signature</label>
          <canvas class="sig-canvas" id="sigCanvas"></canvas>
          <input type="hidden" name="signature_data" id="sigData">
          <div class="sig-controls"><button type="button" class="sig-clear" onclick="clearSig()">Clear</button></div>
          <div class="sig-hint">Sign with finger or mouse</div>
        </div>
      </div>

      <button type="submit" class="btn-submit no-print" id="submitBtn" style="display:none">Submit Repair Note</button>
    </form>
  </div>
  ${summaryModal()}

  ${signatureScript()}
  ${lineItemScript()}
  ${submitScript('repair')}
  ${venueTypeaheadScript()}`
  return c.html(fieldPage('Repair Note', body))
})

// ─── VEHICLE INSPECTION ───────────────────────────────────────────────────────

app.get('/inspection', async (c) => {
  const num = await nextFormNumber(c.env.DB, 'inspection')

  const inspItems = INSPECTION_ITEMS.map((item, i) => `
    <div class="inspection-item">
      <div class="insp-name">${item}</div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
        <div class="insp-btns">
          <button type="button" class="insp-pass" id="pass_${i}" onclick="setInsp(${i},'pass')">✅</button>
          <button type="button" class="insp-fail" id="fail_${i}" onclick="setInsp(${i},'fail')">❌</button>
        </div>
        <input type="hidden" name="insp_${i}" id="insp_val_${i}" value="">
        <input type="text" name="insp_note_${i}" placeholder="Note…"
          style="width:140px;font-size:12px;padding:5px 8px;display:none" id="insp_note_${i}">
      </div>
    </div>`).join('')

  const body = `
  <div class="field-wrap">
    ${formHeader('Vehicle Inspection', num, 'bw', 'Shane')}
    <form id="deliveryForm" onsubmit="submitForm(event,'inspection')">
      <input type="hidden" name="form_type" value="inspection">
      <input type="hidden" name="form_number" value="${num}">

      <div class="section">
        <div class="section-title">Vehicle Details</div>
        <div class="field-group">
          <label>Driver Name</label>
          <select name="prepared_by" onchange="updatePreparedBy(this)">${peopleOptions('Bibi')}</select>
          <input type="text" name="prepared_by_custom" id="preparedByCustom" placeholder="Enter name…" style="display:none;margin-top:8px">
        </div>
        <div class="field-group"><label>Registration Number</label><input type="text" name="vehicle_reg" placeholder="e.g. BW 01 GP" autocapitalize="characters" required></div>
        <div class="field-group"><label>Date</label><input type="date" name="delivery_date" value="${todayStr()}" required></div>
        <div class="field-group"><label>Current Kilometres</label><input type="number" name="current_km" placeholder="e.g. 84500"></div>
        <div class="field-group"><label>Last Service (KM)</label><input type="number" name="last_service_km" placeholder="e.g. 80000"></div>
      </div>

      <div class="section" style="padding:0">
        <div class="section-title" style="padding:18px 18px 0">31-Point Inspection</div>
        ${inspItems}
      </div>

      <div class="section">
        <div class="section-title">Additional Notes</div>
        <textarea name="notes" placeholder="Any faults, observations, or comments…"></textarea>
      </div>

      <button type="button" class="btn-review no-print" onclick="showReviewSummary(event,'inspection')">
        👁️ Review Summary
      </button>

      <div class="section" id="sigSection" style="background:rgba(239,68,68,0.06);border-color:rgba(239,68,68,0.25);display:none">
        <div style="font-size:14px;font-weight:600;margin-bottom:14px;color:#fca5a5">
          ✅ Summary confirmed — I confirm I have checked every item above.
        </div>
        <div class="field-group"><label>Driver Name</label><input type="text" name="received_by" placeholder="Full name" required></div>
        <div class="field-group">
          <label>Driver Signature</label>
          <canvas class="sig-canvas" id="sigCanvas"></canvas>
          <input type="hidden" name="signature_data" id="sigData">
          <div class="sig-controls"><button type="button" class="sig-clear" onclick="clearSig()">Clear</button></div>
          <div class="sig-hint">Sign to confirm all 31 items checked</div>
        </div>
      </div>

      <button type="submit" class="btn-submit no-print" id="submitBtn" style="display:none">Submit Inspection</button>
    </form>
  </div>
  ${summaryModal()}

  ${signatureScript()}
  ${submitScript('inspection')}
  <script>
    function setInsp(i, val) {
      document.getElementById('insp_val_' + i).value = val
      const passBtn = document.getElementById('pass_' + i)
      const failBtn = document.getElementById('fail_' + i)
      const noteField = document.getElementById('insp_note_' + i)
      passBtn.classList.toggle('active', val === 'pass')
      failBtn.classList.toggle('active', val === 'fail')
      if (noteField) noteField.style.display = val === 'fail' ? 'block' : 'none'
    }
  </script>`
  return c.html(fieldPage('Vehicle Inspection', body))
})

// ─── SHORTLIST FOR EVENTS ─────────────────────────────────────────────────────

app.get('/shortlist', async (c) => {
  const num = await nextFormNumber(c.env.DB, 'shortlist')
  const body = `
  <div class="field-wrap">
    ${formHeader('Shortlist for Events', num, 'bw', 'Shane')}
    <form id="deliveryForm" onsubmit="submitForm(event,'shortlist')">
      <input type="hidden" name="form_type" value="shortlist">
      <input type="hidden" name="form_number" value="${num}">

      <div class="section">
        <div style="background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);border-radius:8px;padding:10px 14px;font-size:13px;color:#c4b5fd;margin-bottom:14px">
          ⚡ Field request — use this when you're on a gig and need additional items urgently.
        </div>
        <div class="field-group">
          <label>Requestor</label>
          <select name="prepared_by" onchange="updatePreparedBy(this)">${peopleOptions('Bibi')}</select>
          <input type="text" name="prepared_by_custom" id="preparedByCustom" placeholder="Enter name…" style="display:none;margin-top:8px">
        </div>
        <div class="field-group"><label>Date</label><input type="date" name="delivery_date" value="${todayStr()}" required></div>
        <div class="field-group"><label>Event Name</label><input type="text" name="event_name" placeholder="Event / activation name" required></div>
        ${venueTypeaheadField('venue', '', '', true)}
        <div class="field-group">
          <label>Urgency</label>
          <select name="urgency">
            <option value="Now">🔴 Now — needed immediately</option>
            <option value="Today">🟡 Today — needed before end of day</option>
            <option value="Tomorrow">🟢 Tomorrow — can wait</option>
          </select>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Items Needed</div>
        <div class="line-items-wrap" id="lineItems"></div>
        <button type="button" class="add-line-btn" onclick="addLineItem()"><i class="fas fa-plus"></i> Add Item</button>
      </div>

      <div class="section">
        <div class="section-title">Other Items (not in list)</div>
        <div id="otherItems"></div>
        <button type="button" class="add-line-btn" onclick="addOtherItem()"><i class="fas fa-plus"></i> Add Other</button>
      </div>

      <div class="section">
        <div class="section-title">Notes / Photos</div>
        <div class="field-group"><textarea name="notes" placeholder="Any extra context — describe the situation…"></textarea></div>
        <div class="photo-upload-area" onclick="document.getElementById('photoInput').click()">
          <input type="file" id="photoInput" accept="image/*" multiple onchange="handlePhotos(this)" style="display:none">
          <div class="photo-upload-icon">📸</div>
          <div class="photo-upload-label">Tap to add photos</div>
          <div class="photo-upload-hint">Camera or gallery &nbsp;·&nbsp; multiple allowed</div>
        </div>
        <div class="photo-previews" id="photoPreviews"></div>
        <div class="photo-count" id="photoCount"></div>
      </div>

      <button type="button" class="btn-review no-print" onclick="showReviewSummary(event,'shortlist')" style="border-color:#8b5cf6;color:#c4b5fd;background:rgba(139,92,246,0.1)">
        👁️ Review Summary
      </button>

      <button type="submit" class="btn-submit no-print" id="submitBtn" style="display:none;background:linear-gradient(135deg,#5b21b6,#8b5cf6,#c4b5fd)">
        🚨 Send Shortlist Request
      </button>
    </form>
  </div>
  ${summaryModal()}

  ${lineItemScript()}
  ${photoScript()}
  ${submitScript('shortlist')}
  ${venueTypeaheadScript()}`
  return c.html(fieldPage('Shortlist for Events', body))
})

// ─── AI PHOTO EXTRACTION ──────────────────────────────────────────────────────

app.post('/ai-extract', async (c) => {
  try {
    const body = await c.req.json()
    const { images } = body // array of base64 data URLs

    if (!images || !images.length) {
      return c.json({ success: false, error: 'No images provided' }, 400)
    }

    const apiKey = c.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return c.json({ success: false, error: 'API key not configured' }, 500)
    }

    // Build the known item catalogue as a flat list for Claude to match against
    const allItems = Object.values(ITEM_CATEGORIES).flat()
    const brandMap: Record<string,string> = {
      'castle lite': 'Castle Lite', 'castlelite': 'Castle Lite',
      'castle lager': 'Castle Lager', 'castlelager': 'Castle Lager',
      'stella': 'Stella Artois', 'stella artois': 'Stella Artois',
      'mxd': 'MxD', 'mixed': 'Mixed / Multiple',
      'black label': 'Carling Black Label', 'carling': 'Carling Black Label', 'cbl': 'Carling Black Label',
      'hansa': 'Hansa',
      'flying fish': 'Flying Fish', 'flyingfish': 'Flying Fish',
      'corona': 'Corona',
      'brutal fruit': 'Brutal Fruit', 'brutalfruit': 'Brutal Fruit',
    }

    // Prepare image content blocks for Claude
    const imageBlocks: any[] = images.map((dataUrl: string) => {
      const match = dataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/)
      if (!match) return null
      return {
        type: 'image',
        source: {
          type: 'base64',
          media_type: match[1],
          data: match[2]
        }
      }
    }).filter(Boolean)

    const prompt = `You are extracting equipment order details from a photo of a printed or handwritten sheet used by B&W Productions, a South African events company.

KNOWN ITEM CATALOGUE (match items to these exactly where possible):
${allItems.join(', ')}

KNOWN SAB BRANDS (only these — anything else is "None / Generic"):
Castle Lite, Castle Lager, Castle Double Malt (CDM), Castle Milk Stout, Stella Artois, MxD, Carling Black Label (also "Black Label" or "CBL"), Hansa, Flying Fish, Corona, Brutal Fruit, Guinness

RULES:
1. Extract venue/event name, date, client, contact person, contact number, and all equipment items with quantities
2. For each item: match to the closest item in the catalogue above. If no match, put it in "other_items"
3. For brands: if the item name contains a known SAB brand prefix (e.g. "Black Label Gazebo" → item=Gazebo, brand=Carling Black Label), extract that brand. If the prefix is NOT a known SAB brand (e.g. "Sharp Gazebo", "PIR Gazebo", "Kaiser Chiefs"), use brand "None / Generic"
4. Items clearly not in the catalogue (e.g. "cabling", "vacuum", "full flight case", "winner cheque") → put in other_items as free text
5. If a field is unclear or not visible, omit it — don't guess
6. Dates: format as YYYY-MM-DD if possible

Respond ONLY with valid JSON in this exact structure:
{
  "venue": "",
  "event_name": "",
  "client": "",
  "attention": "",
  "contact_number": "",
  "delivery_date": "",
  "notes": "",
  "line_items": [
    { "item_name": "", "quantity": 1, "brand": "" }
  ],
  "other_items": [
    { "description": "", "quantity": 1 }
  ]
}`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-7',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: [
            ...imageBlocks,
            { type: 'text', text: prompt }
          ]
        }]
      })
    })

    if (!response.ok) {
      const err = await response.text()
      return c.json({ success: false, error: 'Claude API error: ' + err }, 500)
    }

    const aiResult: any = await response.json()
    const text = aiResult.content?.[0]?.text || ''

    // Extract JSON from the response (Claude sometimes wraps in ```json)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return c.json({ success: false, error: 'Could not parse AI response', raw: text }, 500)
    }

    const extracted = JSON.parse(jsonMatch[0])
    return c.json({ success: true, data: extracted })

  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

// ─── UPDATE OFFICE NOTES (inline edit on /delivery/open/:id) ──────────────────
// Persists to BOTH the top-level `notes` column AND the form_data.notes JSON
// so the edit becomes the authoritative record everywhere it's read.

app.post('/notes/update/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const newNotes = (body.notes ?? '').toString()

    const sub = await c.env.DB.prepare(
      'SELECT id, form_data FROM field_submissions WHERE id=?'
    ).bind(Number(id)).first<any>()
    if (!sub) return c.json({ success: false, error: 'Submission not found' }, 404)

    // Merge into the form_data JSON so the next page render reads the new value
    let fd: any = {}
    try { fd = JSON.parse(sub.form_data || '{}') } catch {}
    fd.notes = newNotes

    await c.env.DB.prepare(
      'UPDATE field_submissions SET notes=?, form_data=? WHERE id=?'
    ).bind(newNotes, JSON.stringify(fd), Number(id)).run()

    return c.json({ success: true })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

// ─── UPDATE QUANTITIES ────────────────────────────────────────────────────────

app.post('/update-quantities/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const { line_items } = body // array of { id, quantity }

    if (!Array.isArray(line_items)) {
      return c.json({ success: false, error: 'No line items provided' }, 400)
    }

    for (const li of line_items) {
      if (!li.id || !li.quantity) continue
      await c.env.DB.prepare(
        'UPDATE field_line_items SET quantity=? WHERE id=? AND submission_id=?'
      ).bind(Number(li.quantity), Number(li.id), Number(id)).run()
    }

    return c.json({ success: true })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

// ─── VENUE TYPEAHEAD API ─────────────────────────────────────────────────────
// GET /field/venues/search?q=ell  → top 12 matches (name OR address)
// POST /field/venues/learn         → upsert a venue when a draft saves a new one

app.get('/venues/search', async (c) => {
  try {
    const q = (c.req.query('q') || '').trim().toLowerCase()
    if (q.length < 1) {
      // Empty / 0-char → return most-used 12 (so dropdown shows recents)
      const top = await c.env.DB.prepare(
        'SELECT id, name, address, region, postal_code, attention_default, notes, source, venue_type, use_count FROM field_venues ORDER BY use_count DESC, name LIMIT 12'
      ).all<any>()
      return c.json({ success: true, results: top.results || [] })
    }
    // Substring match on name OR address (case-insensitive via name_lower)
    const like = '%' + q.replace(/[%_]/g, '\\$&') + '%'
    const rows = await c.env.DB.prepare(`
      SELECT id, name, address, region, postal_code, attention_default, notes, source, venue_type, use_count
      FROM field_venues
      WHERE name_lower LIKE ? OR LOWER(address) LIKE ?
      ORDER BY
        CASE WHEN name_lower LIKE ? THEN 0 ELSE 1 END,   -- prefix matches first
        use_count DESC,
        name
      LIMIT 12
    `).bind(like, like, q + '%').all<any>()
    return c.json({ success: true, results: rows.results || [] })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

app.post('/venues/learn', async (c) => {
  try {
    const body = await c.req.json()
    const name = (body.name || '').trim()
    const address = (body.address || '').trim()
    if (!name) return c.json({ success: false, error: 'name required' }, 400)
    const nameLower = name.toLowerCase()

    // RSA-only guard
    const guard = isSouthAfricanVenue(body.region || '', address)
    if (!guard.ok) return c.json({ success: false, error: guard.error }, 400)

    const existing = await c.env.DB.prepare(
      'SELECT id, address FROM field_venues WHERE name_lower=? LIMIT 1'
    ).bind(nameLower).first<any>()

    if (existing) {
      // Bump use_count; if address has improved, keep the longer one
      const finalAddr = (address.length > (existing.address || '').length) ? address : existing.address
      await c.env.DB.prepare(
        "UPDATE field_venues SET use_count=use_count+1, address=?, updated_at=CURRENT_TIMESTAMP WHERE id=?"
      ).bind(finalAddr, existing.id).run()
      return c.json({ success: true, id: existing.id, action: 'updated' })
    } else {
      const ins = await c.env.DB.prepare(`
        INSERT INTO field_venues (name, name_lower, address, region, postal_code, source, venue_type, use_count)
        VALUES (?, ?, ?, ?, ?, 'manual', 'venue', 1)
      `).bind(name, nameLower, address, body.region || '', body.postal_code || '').run()
      return c.json({ success: true, id: ins.meta.last_row_id, action: 'created' })
    }
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

// ─── OFFICE PRE-LOAD FORM ────────────────────────────────────────────────────

app.get('/preload', async (c) => {
  const body = `
  <div class="field-wrap">
    <div class="field-header">
      <a href="/field" style="display:inline-block;text-decoration:none">
        <img src="/static/bw-logo.png" alt="B&W Productions" class="field-logo" style="cursor:pointer">
      </a>
      <div class="field-brand">B&amp;W PRODUCTIONS</div>
      <div class="field-tagline">Field Operations</div>
      <div class="field-form-title" style="margin-top:12px">🗒️ Pre-Load Delivery Note</div>
      <div class="form-num">Office use only — fills the driver's pre-screen</div>
    </div>

    <div style="background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.4);border-radius:12px;padding:14px 16px;margin-bottom:20px">
      <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#c4b5fd;margin-bottom:6px">📌 How this works</div>
      <div style="font-size:13px;color:var(--muted);line-height:1.6">
        Fill in the event details and equipment list below, then tap <strong style="color:#c4b5fd">Save Pre-Load</strong>.<br>
        It will appear on the driver's delivery screen with a <strong style="color:#c4b5fd">🗒️ Pre-loaded</strong> badge.<br>
        The driver opens it, reviews, adjusts quantities on-site, signs and submits.
      </div>
    </div>

    <form id="preloadForm">

      <!-- AI Photo Import -->
      <div class="section" id="aiImportSection" style="border-color:rgba(139,92,246,0.4)">
        <div class="section-title" style="color:#c4b5fd">🤖 Import from Photo (AI)</div>
        <div style="font-size:13px;color:var(--muted);margin-bottom:14px">
          Photo an order sheet — AI reads it and fills everything in automatically.
        </div>
        <div class="photo-upload-area" id="aiUploadArea" onclick="document.getElementById('aiPhotoInput').click()" style="border-color:rgba(139,92,246,0.4)">
          <input type="file" id="aiPhotoInput" accept="image/*" multiple onchange="handleAIPhotos(this)" style="display:none">
          <div class="photo-upload-icon">📄</div>
          <div class="photo-upload-label" style="color:#c4b5fd">Tap to photograph order sheet</div>
          <div class="photo-upload-hint">Camera or gallery · up to 3 photos</div>
        </div>
        <div class="photo-previews" id="aiPhotoPreviews"></div>
        <div id="aiPhotoCount" style="font-size:12px;color:var(--muted);margin-top:6px;text-align:center"></div>
        <button type="button" id="aiExtractBtn" onclick="runAIExtract()"
          style="display:none;width:100%;margin-top:12px;padding:14px;border-radius:10px;border:none;
                 background:linear-gradient(135deg,#5b21b6,#8b5cf6,#c4b5fd);
                 color:#fff;font-size:16px;font-weight:800;cursor:pointer">
          🤖 Extract Details with AI
        </button>
        <div id="aiStatus" style="display:none;margin-top:10px;padding:12px;border-radius:8px;font-size:14px;text-align:center"></div>
      </div>

      <!-- AI Confirmation Panel -->
      <div id="aiConfirmPanel" style="display:none">
        <div class="section" style="border-color:rgba(16,185,129,0.4)">
          <div class="section-title" style="color:#6ee7b7">✅ AI Extracted — Review &amp; Edit</div>
          <div style="font-size:13px;color:var(--muted);margin-bottom:16px">Check everything before loading into form.</div>
          <div id="aiReviewFields"></div>
          <div id="aiReviewItems" style="margin-top:16px"></div>
          <div id="aiReviewOthers" style="margin-top:12px"></div>
          <div style="display:flex;gap:10px;margin-top:16px">
            <button type="button" onclick="loadAIIntoForm()"
              style="flex:1;padding:14px;border-radius:10px;border:none;background:linear-gradient(135deg,#065f46,#10b981,#6ee7b7);color:#000;font-size:15px;font-weight:800;cursor:pointer">
              ✅ Looks Good — Load into Form
            </button>
            <button type="button" onclick="resetAIPanel()"
              style="padding:14px 18px;border-radius:10px;border:1px solid var(--border);background:transparent;color:var(--muted);font-size:14px;cursor:pointer">
              ✕ Cancel
            </button>
          </div>
        </div>
      </div>

      <!-- Letterhead -->
      <div class="section">
        <div class="section-title">Letterhead</div>
        <div class="lh-toggle">
          <button type="button" class="lh-btn active" id="lh-sab" onclick="setLH('sab')">B&amp;W on behalf of SAB</button>
          <button type="button" class="lh-btn" id="lh-bw" onclick="setLH('bw')">B&amp;W Standard</button>
        </div>
        <input type="hidden" name="letterhead" id="letterheadInput" value="sab">
      </div>

      <!-- Form Details -->
      <div class="section">
        <div class="section-title">Form Details</div>
        <div class="field-group">
          <label>Prepared By (Office)</label>
          <select name="prepared_by" id="preparedBy" onchange="updatePreparedBy(this)">${peopleOptions('Bibi')}</select>
          <input type="text" name="prepared_by_custom" id="preparedByCustom" placeholder="Enter name…" style="display:none;margin-top:8px">
        </div>
        <div class="field-group">
          <label>Assigned Driver <span style="color:var(--muted);font-weight:400">(optional — can be set on day)</span></label>
          <select name="driver" id="driverSel" onchange="refreshTeamPicker && refreshTeamPicker()">
            ${driverOptions()}
          </select>
          <input type="text" name="driver_custom" id="driverCustom" placeholder="Driver name…" style="display:none;margin-top:8px">
        </div>
        <div class="field-group"><label>Delivery Date</label><input type="date" name="delivery_date" value="${todayStr()}" required></div>
        <div class="field-group"><label>Collection Date</label><input type="date" name="collection_date"></div>
        <div class="field-group">
          <label>Vehicle <span style="color:var(--muted);font-weight:400">(optional)</span></label>
          <select name="vehicle_reg" id="vehicleSel" onchange="updateVehicle(this)">
            <option value="">— assign later —</option>
            ${vehicleOptions()}
            <option value="__other__">+ Other / not listed</option>
          </select>
          <input type="text" name="vehicle_reg_custom" id="vehicleRegCustom" placeholder="Type reg e.g. BW01GPXX" autocapitalize="characters" style="display:none;margin-top:8px">
        </div>
      </div>

      ${teamCrewSection()}

      <!-- Client & Venue -->
      <div class="section">
        <div class="section-title">Client &amp; Venue</div>
        <div class="field-group"><label>Client</label>
          <select name="client">
            <option value="South African Breweries" selected>South African Breweries (SAB)</option>
            <option value="Other">Other</option>
          </select>
        </div>
        ${venueTypeaheadField('venue', '', '', true)}
        <div class="field-group"><label>Event / Activation Name</label><input type="text" name="event_name" placeholder="e.g. Castle Lite Unlocks"></div>
        <div class="field-group"><label>Attention / Contact on Site</label><input type="text" name="attention" placeholder="Contact person on site"></div>
        <div class="field-group"><label>Contact Number</label><input type="tel" name="contact_number" placeholder="0XX XXX XXXX"></div>
      </div>

      <!-- Brand -->
      <div class="section">
        <div class="section-title">Brand (applies to all items)</div>
        <select name="form_brand" id="formBrand" onchange="applyFormBrand(this.value)">${brandOptions()}</select>
      </div>

      <!-- Equipment -->
      <div class="section">
        <div class="section-title">Equipment List</div>
        <div class="line-items-wrap" id="lineItems"></div>
        <button type="button" class="add-line-btn" onclick="addLineItem()"><i class="fas fa-plus"></i> Add Item</button>
      </div>

      <!-- Other items -->
      <div class="section">
        <div class="section-title">Other Items (not in list)</div>
        <div id="otherItems"></div>
        <button type="button" class="add-line-btn" onclick="addOtherItem()"><i class="fas fa-plus"></i> Add Other Item</button>
      </div>

      <!-- Notes -->
      <div class="section">
        <div class="section-title">Notes for Driver</div>
        <textarea name="notes" rows="3" placeholder="Any special instructions for the driver…" style="width:100%;box-sizing:border-box;background:var(--card);border:1px solid var(--border);border-radius:10px;padding:12px;color:var(--white);font-size:14px;resize:vertical"></textarea>
      </div>

      <!-- Save button -->
      <button type="button" onclick="savePreload()"
        style="width:100%;padding:18px;border-radius:14px;border:none;
               background:linear-gradient(135deg,#4c1d95,#7c3aed,#c4b5fd);
               color:#fff;font-size:18px;font-weight:800;cursor:pointer;margin-bottom:8px">
        🗒️ Save Pre-Load for Driver
      </button>

      <a href="/field" style="display:block;text-align:center;padding:12px;color:var(--muted);text-decoration:none;font-size:13px">← Back to Forms</a>
    </form>
  </div>

  <div id="preloadSuccessModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;align-items:center;justify-content:center;padding:24px">
    <div style="background:var(--card);border:1px solid rgba(139,92,246,0.5);border-radius:20px;padding:28px 24px;max-width:380px;width:100%;text-align:center">
      <div style="font-size:48px;margin-bottom:12px">✅</div>
      <div style="font-size:20px;font-weight:800;color:var(--white);margin-bottom:8px">Pre-Load Saved!</div>
      <div style="font-size:14px;color:var(--muted);margin-bottom:20px">
        It will appear on the driver's delivery screen with a <span style="color:#c4b5fd;font-weight:700">🗒️ Pre-loaded</span> badge.
      </div>
      <div id="preloadSavedRef" style="font-size:13px;color:#c4b5fd;font-weight:700;margin-bottom:20px"></div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <a href="/field/preload"
           style="display:block;padding:14px;border-radius:10px;text-decoration:none;
                  background:linear-gradient(135deg,#4c1d95,#7c3aed,#c4b5fd);
                  color:#fff;font-size:15px;font-weight:800">
          ➕ Pre-Load Another
        </a>
        <a href="/field/delivery"
           style="display:block;padding:14px;border-radius:10px;text-decoration:none;
                  background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.4);
                  color:#6ee7b7;font-size:15px;font-weight:700">
          📦 View Delivery Pre-Screen
        </a>
        <a href="/field"
           style="display:block;padding:12px;color:var(--muted);text-decoration:none;font-size:13px">
          ← Back to Forms
        </a>
      </div>
    </div>
  </div>

  <script>
  async function savePreload() {
    const form = document.getElementById('preloadForm')

    // Validate required fields
    const venue = form.querySelector('[name="venue"]').value.trim()
    const deliveryDate = form.querySelector('[name="delivery_date"]').value
    if (!venue) { alert('Please enter a venue name.'); return }
    if (!deliveryDate) { alert('Please enter a delivery date.'); return }

    // ── Line items: use the same li_qty_N / li_item_N / li_brand_N names as lineItemScript()
    const lineItems = []
    document.querySelectorAll('#lineItems .line-item').forEach(function(div) {
      var idMatch = div.id && div.id.match(/li_(\\d+)/)
      if (!idMatch) return
      var n = idMatch[1]
      var itemSel  = div.querySelector('[name="li_item_'  + n + '"]')
      var qtyInp   = div.querySelector('[name="li_qty_'   + n + '"]')
      var brandSel = div.querySelector('[name="li_brand_' + n + '"]')
      var condInp  = div.querySelector('[name="li_cond_val_' + n + '"]')
      var commentInp = div.querySelector('[name="li_comment_' + n + '"]')
      var item = itemSel ? itemSel.value.trim() : ''
      if (!item) return
      lineItems.push({
        item_name:  item,
        quantity:   parseInt(qtyInp  ? qtyInp.value  : '1') || 1,
        brand:      brandSel ? brandSel.value : '',
        condition:  condInp  ? condInp.value  : 'Checked',
        comments:   commentInp ? commentInp.value.trim() : ''
      })
    })

    // ── Other items: use other_qty_N / other_desc_N
    const otherItems = []
    document.querySelectorAll('#otherItems .other-row').forEach(function(div) {
      var idMatch = div.id && div.id.match(/other_(\\d+)/)
      if (!idMatch) return
      var n = idMatch[1]
      var descInp = div.querySelector('[name="other_desc_' + n + '"]')
      var qtyInp  = div.querySelector('[name="other_qty_'  + n + '"]')
      var desc = descInp ? descInp.value.trim() : ''
      if (!desc) return
      otherItems.push({ quantity: parseInt(qtyInp ? qtyInp.value : '1') || 1, description: desc })
    })

    // ── Vehicle
    const vehicleSel = form.querySelector('#vehicleSel')
    let vehicleReg = vehicleSel?.value || ''
    if (vehicleReg === '__other__') vehicleReg = form.querySelector('#vehicleRegCustom')?.value?.trim().toUpperCase() || ''

    // ── Driver
    const driverSel = form.querySelector('#driverSel')
    let driver = driverSel?.value || ''
    if (driver === '__new__') driver = form.querySelector('#driverCustom')?.value?.trim() || ''

    // ── Prepared by
    let preparedBy = form.querySelector('#preparedBy')?.value || 'Shane'
    if (preparedBy === '__new__') preparedBy = form.querySelector('#preparedByCustom')?.value?.trim() || 'Shane'

    // ── Team & casuals
    const teamHidden    = document.getElementById('teamMembersHidden')
    const casualsHidden = document.getElementById('casualsHidden')
    const teamMembers   = teamHidden    ? teamHidden.value    : ''
    const casuals       = casualsHidden ? casualsHidden.value : ''

    // ── Second vehicle
    const v2Sel    = document.getElementById('vehicle2Sel')
    const v2Custom = document.getElementById('vehicle2RegCustom')
    let vehicle2Reg = ''
    if (v2Sel && v2Sel.value) {
      vehicle2Reg = v2Sel.value === '__other__' ? (v2Custom ? v2Custom.value.trim().toUpperCase() : '') : v2Sel.value
    }
    const v2DriverEl = form.querySelector('[name="vehicle2_driver"]')
    const vehicle2Driver = v2DriverEl ? v2DriverEl.value : ''

    const payload = {
      form_type:        'delivery',
      letterhead:       form.querySelector('#letterheadInput')?.value || 'sab',
      prepared_by:      preparedBy,
      driver,
      vehicle_reg:      vehicleReg,
      vehicle2_reg:     vehicle2Reg,
      vehicle2_driver:  vehicle2Driver,
      team_members:     teamMembers,
      casuals:          casuals,
      client:           form.querySelector('[name="client"]')?.value || 'South African Breweries',
      venue,
      venue_address:    form.querySelector('[name="venue_address"]')?.value || '',
      event_name:       form.querySelector('[name="event_name"]')?.value || '',
      address:          form.querySelector('[name="address"]')?.value || '',
      attention:        form.querySelector('[name="attention"]')?.value || '',
      contact_number:   form.querySelector('[name="contact_number"]')?.value || '',
      delivery_date:    deliveryDate,
      collection_date:  form.querySelector('[name="collection_date"]')?.value || '',
      form_brand:       form.querySelector('#formBrand')?.value || '',
      notes:            form.querySelector('[name="notes"]')?.value || '',
      line_items:       lineItems,
      other_items:      otherItems
    }

    try {
      const btn = document.querySelector('button[onclick="savePreload()"]')
      btn.disabled = true
      btn.textContent = '⏳ Saving…'

      const res = await fetch('/field/draft/save', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) })
      const data = await res.json()

      if (data.success) {
        document.getElementById('preloadSavedRef').textContent = 'Ref: ' + data.form_number
        const modal = document.getElementById('preloadSuccessModal')
        modal.style.display = 'flex'
      } else {
        alert('Error saving: ' + (data.error || 'Unknown error'))
        btn.disabled = false
        btn.textContent = '🗒️ Save Pre-Load for Driver'
      }
    } catch(e) {
      alert('Network error — please try again.')
      const btn = document.querySelector('button[onclick="savePreload()"]')
      btn.disabled = false
      btn.textContent = '🗒️ Save Pre-Load for Driver'
    }
  }
  </script>
  ${lineItemScript()}
  ${aiImportScript()}
  ${venueTypeaheadScript()}
  `
  return c.html(fieldPage('Pre-Load Delivery Note', body))
})

// ─── DRAFT: SAVE PRE-POPULATED NOTE ─────────────────────────────────────────

app.post('/draft/save', async (c) => {
  try {
    const body = await c.req.json()
    const { form_type, prepared_by, driver, venue, venue_address, event_name, address, attention,
            contact_number, delivery_date, collection_date, vehicle_reg, client,
            form_brand, letterhead, notes, line_items, other_items } = body

    const finalPreparedBy = prepared_by || 'Shane'
    const num = await nextFormNumber(c.env.DB, form_type || 'delivery')

    const result = await c.env.DB.prepare(`
      INSERT INTO field_submissions
        (form_type, form_number, prepared_by, driver, vehicle_reg, client, brand, venue, venue_address,
         event_name, address, attention, contact_number, delivery_date, collection_date,
         letterhead, notes, form_data, is_draft)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)
    `).bind(
      form_type || 'delivery', num, finalPreparedBy, driver || '',
      vehicle_reg || '', client || 'South African Breweries',
      form_brand || '', venue || '', venue_address || '', event_name || '', address || '',
      attention || '', contact_number || '', delivery_date || '', collection_date || '',
      letterhead || 'sab', notes || '', JSON.stringify(body)
    ).run()

    // Learn the venue (upsert into the directory) — non-blocking; ignore errors
    if (venue && venue.trim()) {
      try {
        const nameLower = venue.trim().toLowerCase()
        const existing = await c.env.DB.prepare(
          'SELECT id, address FROM field_venues WHERE name_lower=? LIMIT 1'
        ).bind(nameLower).first<any>()
        if (existing) {
          const newAddr = (venue_address || '').trim()
          const finalAddr = newAddr.length > (existing.address || '').length ? newAddr : existing.address
          await c.env.DB.prepare(
            "UPDATE field_venues SET use_count=use_count+1, address=?, updated_at=CURRENT_TIMESTAMP WHERE id=?"
          ).bind(finalAddr || '', existing.id).run()
        } else {
          await c.env.DB.prepare(`
            INSERT INTO field_venues (name, name_lower, address, source, venue_type, use_count)
            VALUES (?, ?, ?, 'manual', 'venue', 1)
          `).bind(venue.trim(), nameLower, (venue_address || '').trim()).run()
        }
      } catch (_e) { /* swallow — directory is a nice-to-have */ }
    }

    const draftId = result.meta.last_row_id

    // Insert line items for draft
    if (Array.isArray(line_items)) {
      for (let i = 0; i < line_items.length; i++) {
        const li = line_items[i]
        if (!li.item_name) continue
        await c.env.DB.prepare(`
          INSERT INTO field_line_items (submission_id, item_name, quantity, brand, condition, comments, sort_order)
          VALUES (?,?,?,?,?,?,?)
        `).bind(draftId, li.item_name, li.quantity || 1, li.brand || form_brand || '', li.condition || 'Checked', li.comments || '', i).run()
      }
    }

    if (Array.isArray(other_items)) {
      for (const oi of other_items) {
        if (!oi.description) continue
        await c.env.DB.prepare(`
          INSERT INTO field_suggested_items (submission_id, description, quantity, suggested_by)
          VALUES (?,?,?,?)
        `).bind(draftId, oi.description, oi.quantity || 1, finalPreparedBy).run()
      }
    }

    return c.json({ success: true, draft_id: draftId, form_number: num })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

// ─── FORM SUBMISSION (POST) ────────────────────────────────────────────────────

app.post('/submit', async (c) => {
  try {
    const body = await c.req.json()
    const { form_type, form_number, prepared_by, prepared_by_custom, driver, driver_custom,
            vehicle_reg, vehicle_reg_custom, client, form_brand, venue, venue_address, event_name, address, attention,
            contact_number, delivery_date, collection_date, received_by, signature_data,
            letterhead, notes, line_items, other_items, linked_delivery_id,
            has_damage, damage_notes, draft_id } = body

    const finalPreparedBy = prepared_by === '__new__' ? (prepared_by_custom || 'Shane') : (prepared_by || 'Shane')
    const finalDriver = driver === '__new__' ? (driver_custom || '') : (driver || '')
    const finalVehicleReg = vehicle_reg === '__other__' ? (vehicle_reg_custom || '') : (vehicle_reg || '')

    // If new person, add to DB
    if (prepared_by === '__new__' && prepared_by_custom) {
      await c.env.DB.prepare('INSERT OR IGNORE INTO field_people (name) VALUES (?)').bind(prepared_by_custom).run()
    }

    // Merge damage notes into notes if damage was reported
    const finalNotes = has_damage === 'yes' && damage_notes
      ? `⚠️ DAMAGE REPORTED: ${damage_notes}${notes ? '\n\nAdditional notes: ' + notes : ''}`
      : (notes || '')

    let submissionId: number

    // ─── DEDUPE GUARD ─────────────────────────────────────────────────────────
    // Prevent the system from inserting a duplicate when the browser retries
    // a slow POST or a user double-taps Submit. If a non-draft submission with
    // the same form_number already exists, treat the second call as a re-hit
    // and return the existing record instead of inserting again.
    if (!draft_id && form_number) {
      const existing = await c.env.DB.prepare(
        'SELECT id, form_number FROM field_submissions WHERE form_number=? AND is_draft=0 LIMIT 1'
      ).bind(form_number).first<any>()
      if (existing) {
        const slug = `${existing.form_number}`
        return c.json({
          success: true,
          submission_id: existing.id,
          form_number: existing.form_number,
          slug,
          duplicate_suppressed: true
        })
      }
    }
    // Also guard against rapid-fire double submits within 30s by the same
    // person+type+date+venue combination (covers cases where form_number is
    // missing or regenerated client-side).
    if (!draft_id) {
      const recent = await c.env.DB.prepare(`
        SELECT id, form_number FROM field_submissions
        WHERE is_draft=0
          AND form_type=?
          AND prepared_by=?
          AND COALESCE(venue,'')=?
          AND COALESCE(delivery_date,'')=COALESCE(?, '')
          AND datetime(created_at) >= datetime('now', '-30 seconds')
        ORDER BY id DESC LIMIT 1
      `).bind(
        form_type, finalPreparedBy,
        (venue || '').trim(),
        delivery_date || collection_date || ''
      ).first<any>()
      if (recent) {
        return c.json({
          success: true,
          submission_id: recent.id,
          form_number: recent.form_number,
          slug: recent.form_number,
          duplicate_suppressed: true
        })
      }
    }

    if (draft_id) {
      // Update existing draft → convert to real submission
      await c.env.DB.prepare(`
        UPDATE field_submissions SET
          prepared_by=?, driver=?, vehicle_reg=?, client=?, brand=?, venue=?, venue_address=?,
          event_name=?, address=?, attention=?, contact_number=?, delivery_date=?,
          collection_date=?, received_by=?, signature_data=?, letterhead=?, notes=?,
          form_data=?, linked_delivery_id=?, is_draft=0
        WHERE id=? AND is_draft=1
      `).bind(
        finalPreparedBy, finalDriver, finalVehicleReg,
        client || 'South African Breweries', form_brand || '',
        venue || '', venue_address || '', event_name || '', address || '',
        attention || '', contact_number || '', delivery_date || '', collection_date || '',
        received_by || '', signature_data || '', letterhead || 'sab',
        finalNotes, JSON.stringify(body),
        linked_delivery_id ? Number(linked_delivery_id) : null,
        Number(draft_id)
      ).run()
      submissionId = Number(draft_id)

      // Delete old line items — re-insert fresh
      await c.env.DB.prepare('DELETE FROM field_line_items WHERE submission_id=?').bind(submissionId).run()
      await c.env.DB.prepare('DELETE FROM field_suggested_items WHERE submission_id=?').bind(submissionId).run()
    } else {
      // Insert new submission
      const result = await c.env.DB.prepare(`
        INSERT INTO field_submissions
          (form_type, form_number, prepared_by, driver, vehicle_reg, client, brand, venue, venue_address,
           event_name, address, attention, contact_number, delivery_date, collection_date,
           received_by, signature_data, letterhead, notes, form_data, linked_delivery_id, is_draft)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)
      `).bind(
        form_type, form_number, finalPreparedBy, finalDriver,
        finalVehicleReg, client || 'South African Breweries',
        form_brand || '', venue || '', venue_address || '', event_name || '', address || '',
        attention || '', contact_number || '', delivery_date || '', collection_date || '',
        received_by || '', signature_data || '', letterhead || 'sab',
        finalNotes, JSON.stringify(body),
        linked_delivery_id ? Number(linked_delivery_id) : null
      ).run()
      submissionId = result.meta.last_row_id as number
    }

    // Learn the venue (upsert into the directory) — non-blocking; ignore errors
    if (venue && venue.trim()) {
      try {
        const nameLower = venue.trim().toLowerCase()
        const existing = await c.env.DB.prepare(
          'SELECT id, address FROM field_venues WHERE name_lower=? LIMIT 1'
        ).bind(nameLower).first<any>()
        if (existing) {
          const newAddr = (venue_address || '').trim()
          const finalAddr = newAddr.length > (existing.address || '').length ? newAddr : existing.address
          await c.env.DB.prepare(
            "UPDATE field_venues SET use_count=use_count+1, address=?, updated_at=CURRENT_TIMESTAMP WHERE id=?"
          ).bind(finalAddr || '', existing.id).run()
        } else {
          await c.env.DB.prepare(`
            INSERT INTO field_venues (name, name_lower, address, source, venue_type, use_count)
            VALUES (?, ?, ?, 'manual', 'venue', 1)
          `).bind(venue.trim(), nameLower, (venue_address || '').trim()).run()
        }
      } catch (_e) { /* swallow — directory is a nice-to-have */ }
    }

    // If this collection is linked to a delivery, mark the delivery as collected
    if (form_type === 'collection' && linked_delivery_id) {
      await c.env.DB.prepare(
        `UPDATE field_submissions SET collection_status='collected' WHERE id=? AND form_type='delivery'`
      ).bind(Number(linked_delivery_id)).run()
    }

    // Insert line items
    if (Array.isArray(line_items)) {
      for (let i = 0; i < line_items.length; i++) {
        const li = line_items[i]
        if (!li.item_name) continue
        await c.env.DB.prepare(`
          INSERT INTO field_line_items (submission_id, item_name, quantity, brand, condition, comments, sort_order)
          VALUES (?,?,?,?,?,?,?)
        `).bind(submissionId, li.item_name, li.quantity || 1, li.brand || form_brand || '', li.condition || 'Checked', li.comments || '', i).run()
      }
    }

    // Insert suggested items
    if (Array.isArray(other_items)) {
      for (const oi of other_items) {
        if (!oi.description) continue
        await c.env.DB.prepare(`
          INSERT INTO field_suggested_items (submission_id, description, quantity, suggested_by)
          VALUES (?,?,?,?)
        `).bind(submissionId, oi.description, oi.quantity || 1, finalPreparedBy).run()
      }
    }

    // Build readable slug for the response
    function slugifyPost(s: string): string {
      return (s || '').toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,24)
    }
    const vSlug = slugifyPost(venue || event_name || 'bw')
    const dSlug = (delivery_date || '').replace(/-/g,'')
    const drSlug = slugifyPost(finalDriver || finalPreparedBy)
    const slug = `${form_number}-${vSlug}-${dSlug}-${drSlug}`

    // ── Generate PDF + store in R2 via the shared helpers ────────────────────
    // buildPdfFilename + renderAndStorePdf live at the top of this file so the
    // music bus flow can call the same primitives. Keeps WhatsApp filenames
    // and R2 keys in lockstep across all form types.
    const pageUrl = `https://bwprodsystem.co.za/field/success/${submissionId}`
    const pdfFilename = await buildPdfFilename({
      db: c.env.DB,
      formNumber: form_number,
      formType: form_type,
      vehicleReg: finalVehicleReg || '',
      driver: finalDriver || '',
      preparedBy: finalPreparedBy || '',
      eventName: event_name || '',
      venue: venue || '',
      date: delivery_date || collection_date || ''
    })
    const pdfUrl = await renderAndStorePdf(c.env, submissionId, form_number, pageUrl, pdfFilename)

    return c.json({ success: true, submission_id: submissionId, form_number: draft_id ? form_number : form_number, slug, pdf_url: pdfUrl })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

// ─── SERVE PDF FROM R2 ────────────────────────────────────────────────────────

app.get('/pdf/:id', async (c) => {
  const id = c.req.param('id')
  const sub = await c.env.DB.prepare(
    'SELECT form_number, form_type, event_name, venue, vehicle_reg, driver, prepared_by, delivery_date, collection_date FROM field_submissions WHERE id=?'
  ).bind(id).first<any>()
  if (!sub) return c.text('Not found', 404)
  const key = `pdfs/${sub.form_number}-${id}.pdf`
  const obj = await c.env.PDF_BUCKET.get(key)
  if (!obj) return c.text('PDF not yet generated', 404)

  // Build the same descriptive filename used at generation time so the WhatsApp
  // unfurl name matches what the recipient downloads. Shared helper keeps build-
  // time and serve-time in lockstep.
  const filename = await buildPdfFilename({
    db: c.env.DB,
    formNumber: sub.form_number,
    formType: sub.form_type,
    vehicleReg: (sub.vehicle_reg || '') as string,
    driver: (sub.driver || '') as string,
    preparedBy: (sub.prepared_by || '') as string,
    eventName: (sub.event_name || '') as string,
    venue: (sub.venue || '') as string,
    date: (sub.delivery_date || sub.collection_date || '') as string
  })

  // inline — opens in browser; use attachment to force download
  const download = c.req.query('download') === '1'
  return new Response(obj.body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
      'Cache-Control': 'public, max-age=3600'
    }
  })
})

// ─── PUBLIC PREVIEW (TOKEN-PROTECTED) — FOR WHATSAPP/EMAIL ──────────────────
// Three URL shapes share the same token:
//   GET /field/p/preview/:token         → HTML page with Open Graph tags
//                                          (WhatsApp/Telegram/Slack unfurl this
//                                           to show the rich-card preview)
//   GET /field/p/preview/:token.png     → raw PNG (the unfurl bot follows this)
//   GET /field/p/preview/:token.pdf     → raw PDF (recipient tap-to-download)
//
// The token is minted by an authenticated admin via POST /field/admin/share/create.
// Tokens auto-expire (default 14 days) and we count hits for telemetry.
//
// Why an HTML wrapper page?
//   WhatsApp's link unfurl bot does NOT inspect raw binary URLs — it fetches the
//   HTML page and reads <meta property="og:image">, og:title, og:description.
//   So we send the HTML URL in WhatsApp messages (not the .png URL directly).
//   The HTML's og:image points at the .png URL, which the bot then fetches separately.

// Form-type labels for the share page (matches the field-admin lookups)
const FORM_LABEL_FOR_SHARE: Record<string, string> = {
  delivery: 'Delivery Note',
  collection: 'Collection Note',
  repair: 'Repair Note',
  inspection: 'Vehicle Inspection',
  shortlist: 'Shortlist',
  musicbus_inspection: 'Music Bus Inspection'
}
const FORM_EMOJI_FOR_SHARE: Record<string, string> = {
  delivery: '📦',
  collection: '🔄',
  repair: '🔧',
  inspection: '🚐',
  shortlist: '📋',
  musicbus_inspection: '🎵'
}

function escHtml(s: any): string {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
}

// ─── OPEN GRAPH WRAPPER PAGE ─────────────────────────────────────────────────
app.get('/p/preview/:token{[a-f0-9]{16,64}}', async (c) => {
  const token = c.req.param('token').toLowerCase()

  const t = await c.env.DB.prepare(`
    SELECT submission_id, expires_at FROM field_preview_tokens WHERE token = ?
  `).bind(token).first<any>()
  if (!t) return c.text('Preview link not found', 404)
  if (new Date(t.expires_at).getTime() < Date.now()) {
    // Expired — show a friendly HTML page instead of plain text
    return c.html(`<!doctype html><html><head><meta charset="utf-8"><title>Link expired</title>
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <link rel="icon" type="image/png" sizes="32x32" href="/static/favicon-32.png">
      <link rel="shortcut icon" href="/static/favicon.ico">
      <link rel="apple-touch-icon" sizes="180x180" href="/static/apple-touch-icon.png">
      <style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#fafafa;padding:40px;max-width:480px;margin:0 auto;color:#333;text-align:center}h1{font-size:22px}p{color:#666;line-height:1.5}.box{background:#fff;border-radius:12px;padding:32px;box-shadow:0 4px 12px rgba(0,0,0,0.06)}.brand{width:80px;height:80px;margin:0 auto 16px;display:block}</style>
      </head><body><div class="box">
        <img src="/static/bw-logo.png" alt="B&amp;W Productions" class="brand">
        <h1>⏰ This link has expired</h1>
        <p>This delivery-note share link expired on <strong>${escHtml(t.expires_at)}</strong>.</p>
        <p>Please contact B&amp;W Productions to request a new link.</p>
        <p style="margin-top:24px;font-size:13px;color:#999">B&amp;W Productions · 082 321 6520 · bibi@bwproductions.co.za</p>
      </div></body></html>`, 410)
  }

  const sub = await c.env.DB.prepare(`
    SELECT id, form_number, form_type, brand, client, event_name, venue,
           attention, received_by, contact_number, prepared_by, driver,
           vehicle_reg, delivery_date, collection_date, created_at
    FROM field_submissions WHERE id = ?
  `).bind(t.submission_id).first<any>()
  if (!sub) return c.text('Submission not found', 404)

  // Fire-and-forget hit count
  c.executionCtx.waitUntil(
    c.env.DB.prepare(`UPDATE field_preview_tokens SET hits = hits + 1, last_hit_at = CURRENT_TIMESTAMP WHERE token = ?`)
      .bind(token).run().then(() => {}).catch(() => {})
  )

  const formLabel = FORM_LABEL_FOR_SHARE[sub.form_type] || 'Field Note'
  const emoji = FORM_EMOJI_FOR_SHARE[sub.form_type] || '📄'

  // Build a context-appropriate title + description
  // Delivery/Collection: focus on event + venue + date
  // Inspection/Repair:   focus on vehicle + driver + date
  const isVehicle = sub.form_type === 'inspection' || sub.form_type === 'repair'
  const headline = isVehicle
    ? `${emoji} ${formLabel} — ${sub.vehicle_reg || sub.form_number}`
    : `${emoji} ${formLabel} — ${sub.event_name || sub.venue || sub.form_number}`
  const subline = isVehicle
    ? [sub.driver && `Driver: ${sub.driver}`, sub.prepared_by && `Inspected by ${sub.prepared_by}`, sub.delivery_date && new Date(sub.delivery_date).toLocaleDateString('en-ZA', { day:'2-digit', month:'short', year:'numeric' })].filter(Boolean).join(' · ')
    : [sub.brand, sub.venue, sub.delivery_date && new Date(sub.delivery_date).toLocaleDateString('en-ZA', { day:'2-digit', month:'short', year:'numeric' })].filter(Boolean).join(' · ')

  const ogTitle = `${headline} — Ref ${sub.form_number}`
  const ogDescription = `${subline}${subline ? ' · ' : ''}B&W Productions${sub.client ? ' for ' + sub.client : ''}`

  const pageUrl = `https://bwprodsystem.co.za/field/p/preview/${token}`
  const pngUrl = `${pageUrl}.png`
  const pdfUrl = `${pageUrl}.pdf`

  // Render the HTML. Both bots (Open Graph crawl) and humans (browser) hit this same URL.
  // For humans we provide a clean landing page with prominent download buttons.
  return c.html(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escHtml(ogTitle)}</title>

  <!-- ── Open Graph (WhatsApp, Telegram, Slack, Facebook, LinkedIn) ── -->
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="B&amp;W Productions">
  <meta property="og:title" content="${escHtml(ogTitle)}">
  <meta property="og:description" content="${escHtml(ogDescription)}">
  <meta property="og:url" content="${escHtml(pageUrl)}">
  <meta property="og:image" content="${escHtml(pngUrl)}">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="1562">
  <meta property="og:image:alt" content="${escHtml(ogTitle)}">

  <!-- ── Twitter / X cards ── -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escHtml(ogTitle)}">
  <meta name="twitter:description" content="${escHtml(ogDescription)}">
  <meta name="twitter:image" content="${escHtml(pngUrl)}">

  <!-- ── Robots: do not index ── -->
  <meta name="robots" content="noindex,nofollow,noarchive">

  <!-- ── BW Productions branding ── -->
  <link rel="icon" type="image/png" sizes="32x32" href="/static/favicon-32.png">
  <link rel="icon" type="image/png" sizes="192x192" href="/static/favicon-192.png">
  <link rel="shortcut icon" href="/static/favicon.ico">
  <link rel="apple-touch-icon" sizes="180x180" href="/static/apple-touch-icon.png">
  <meta name="theme-color" content="#0A0A0A">

  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <style>
    *{box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:linear-gradient(135deg,#fafafa 0%,#f3f4f6 100%);margin:0;color:#1f2937;min-height:100vh;padding:20px}
    .wrap{max-width:680px;margin:0 auto}
    .card{background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);overflow:hidden;margin-bottom:16px}
    .header{padding:24px 28px;border-bottom:1px solid #f3f4f6;display:flex;align-items:flex-start;gap:16px}
    .header-text{flex:1;min-width:0}
    .brand-logo{width:64px;height:64px;flex-shrink:0;object-fit:contain;display:block}
    .logo{font-weight:800;font-size:13px;letter-spacing:1.5px;color:#9ca3af;text-transform:uppercase;margin-bottom:6px}
    h1{font-size:22px;margin:0 0 6px;color:#111827;line-height:1.3}
    .subline{color:#6b7280;font-size:14px;line-height:1.5;margin:0}
    .ref{display:inline-block;font-family:monospace;background:#f3f4f6;color:#374151;padding:3px 10px;border-radius:6px;font-size:12px;margin-top:10px}
    .preview-img{width:100%;height:auto;display:block;background:#f9fafb;border-bottom:1px solid #f3f4f6}
    .actions{padding:20px 28px;display:flex;gap:10px;flex-wrap:wrap}
    .btn{display:inline-flex;align-items:center;gap:8px;padding:12px 18px;border-radius:10px;font-size:14px;font-weight:600;text-decoration:none;border:none;cursor:pointer;transition:all 0.15s}
    .btn-primary{background:#0ea5e9;color:#fff}
    .btn-primary:hover{background:#0284c7}
    .btn-secondary{background:#f3f4f6;color:#374151}
    .btn-secondary:hover{background:#e5e7eb}
    .btn-wa{background:#25d366;color:#fff}
    .btn-wa:hover{background:#1ea954}
    .meta-card{padding:18px 28px;background:#fafafa}
    .meta-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:14px;font-size:13px}
    .meta-grid dt{color:#9ca3af;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px}
    .meta-grid dd{color:#111827;margin:0;font-weight:500}
    .footer{text-align:center;color:#9ca3af;font-size:12px;padding:24px 0}
    .footer a{color:#6b7280;text-decoration:none}
    @media (max-width:520px){
      .header{padding:18px 20px;gap:12px}
      .brand-logo{width:48px;height:48px}
      h1{font-size:18px}
      .actions{padding:16px 20px;flex-direction:column}
      .btn{justify-content:center;width:100%}
      .meta-card{padding:16px 20px}
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="header">
        <img src="/static/bw-logo.png" alt="B&amp;W Productions" class="brand-logo">
        <div class="header-text">
          <div class="logo">B&amp;W Productions</div>
          <h1>${escHtml(headline)}</h1>
          ${subline ? `<p class="subline">${escHtml(subline)}</p>` : ''}
          <span class="ref">Ref: ${escHtml(sub.form_number)}</span>
        </div>
      </div>

      <img src="${escHtml(pngUrl)}" alt="${escHtml(ogTitle)}" class="preview-img" loading="eager">

      <div class="actions">
        <a href="${escHtml(pdfUrl)}" class="btn btn-primary"><i class="fas fa-file-pdf"></i> Download PDF</a>
        <a href="${escHtml(pngUrl)}?download=1" class="btn btn-secondary" download><i class="fas fa-image"></i> Save Image</a>
        <a href="https://wa.me/?text=${encodeURIComponent(ogTitle + ' — ' + pageUrl)}" class="btn btn-wa" target="_blank"><i class="fab fa-whatsapp"></i> Forward via WhatsApp</a>
      </div>

      <div class="meta-card">
        <dl class="meta-grid">
          ${sub.brand ? `<div><dt>Brand</dt><dd>${escHtml(sub.brand)}</dd></div>` : ''}
          ${sub.client ? `<div><dt>Client</dt><dd>${escHtml(sub.client)}</dd></div>` : ''}
          ${sub.venue && !isVehicle ? `<div><dt>Venue</dt><dd>${escHtml(sub.venue)}</dd></div>` : ''}
          ${sub.vehicle_reg && isVehicle ? `<div><dt>Vehicle</dt><dd>${escHtml(sub.vehicle_reg)}</dd></div>` : ''}
          ${sub.driver ? `<div><dt>Driver</dt><dd>${escHtml(sub.driver)}</dd></div>` : ''}
          ${sub.prepared_by ? `<div><dt>${isVehicle ? 'Inspected by' : 'Prepared by'}</dt><dd>${escHtml(sub.prepared_by)}</dd></div>` : ''}
          ${sub.attention && !isVehicle ? `<div><dt>Attention</dt><dd>${escHtml(sub.attention)}</dd></div>` : ''}
          ${sub.delivery_date ? `<div><dt>${sub.form_type === 'collection' ? 'Collection date' : 'Date'}</dt><dd>${new Date(sub.delivery_date).toLocaleDateString('en-ZA', { day:'2-digit', month:'short', year:'numeric' })}</dd></div>` : ''}
        </dl>
      </div>
    </div>

    <div class="footer">
      <p>B&amp;W Productions · Unit 1, 19 Kransvalk Road, Highbury, Meyerton 1962</p>
      <p><a href="tel:+27823216520">082 321 6520</a> · <a href="mailto:bibi@bwproductions.co.za">bibi@bwproductions.co.za</a></p>
    </div>
  </div>
</body>
</html>`, 200, {
    'Cache-Control': 'private, max-age=300',
    'X-Robots-Tag': 'noindex, nofollow'
  })
})

app.get('/p/preview/:tokenWithExt', async (c) => {
  const raw = c.req.param('tokenWithExt') || ''
  const m = raw.match(/^([a-f0-9]{16,64})\.(png|pdf|jpg|jpeg)$/i)
  if (!m) return c.text('Invalid preview link', 400)
  const token = m[1].toLowerCase()
  const ext = m[2].toLowerCase()

  // Look up token
  const t = await c.env.DB.prepare(`
    SELECT submission_id, format, expires_at, hits
    FROM field_preview_tokens
    WHERE token = ?
  `).bind(token).first<any>()

  if (!t) return c.text('Preview link not found', 404)
  if (new Date(t.expires_at).getTime() < Date.now()) {
    return c.text('Preview link has expired', 410)
  }

  const subId = t.submission_id
  const sub = await c.env.DB.prepare(
    'SELECT form_number, event_name, venue FROM field_submissions WHERE id=?'
  ).bind(subId).first<any>()
  if (!sub) return c.text('Submission not found', 404)

  // Fire-and-forget hit counter
  c.executionCtx.waitUntil(
    c.env.DB.prepare(`
      UPDATE field_preview_tokens SET hits = hits + 1, last_hit_at = CURRENT_TIMESTAMP WHERE token = ?
    `).bind(token).run().then(() => {}).catch(() => {})
  )

  // ── PDF branch: serve from existing R2 cache ────────────────────────────
  if (ext === 'pdf') {
    const pdfKey = `pdfs/${sub.form_number}-${subId}.pdf`
    const obj = await c.env.PDF_BUCKET?.get(pdfKey)
    if (!obj) return c.text('PDF not yet generated', 404)
    return new Response(obj.body, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${sub.form_number}.pdf"`,
        'Cache-Control': 'public, max-age=3600',
        // Open Graph image hint for WhatsApp/Telegram (not standard but harmless)
        'X-Robots-Tag': 'noindex'
      }
    })
  }

  // ── PNG branch: serve from R2 cache, render fresh if missing ────────────
  const pngKey = `previews/png/${sub.form_number}-${subId}.png`
  let pngObj = c.env.PDF_BUCKET ? await c.env.PDF_BUCKET.get(pngKey) : null

  if (!pngObj && c.env.URLBOX_SECRET_KEY && c.env.PDF_BUCKET) {
    // Lazy render via Urlbox
    const t0 = Date.now()
    try {
      const { renderToBuffer, submissionPreviewPngOptions } = await import('../lib/urlbox.js')
      const pageUrl = `https://bwprodsystem.co.za/field/success/${subId}`
      const { buffer } = await renderToBuffer(c.env, submissionPreviewPngOptions(pageUrl))
      await c.env.PDF_BUCKET.put(pngKey, buffer, {
        httpMetadata: { contentType: 'image/png' },
        customMetadata: { renderer: 'urlbox', generated_at: new Date().toISOString() }
      })
      // Telemetry
      try {
        await c.env.DB.prepare(`
          INSERT INTO field_renderer_log (submission_id, form_number, renderer, format, ms, bytes, ok, trigger)
          VALUES (?, ?, 'urlbox', 'png', ?, ?, 1, 'preview')
        `).bind(subId, sub.form_number, Date.now() - t0, buffer.byteLength).run()
      } catch {}
      return new Response(buffer, {
        headers: {
          'Content-Type': 'image/png',
          'Content-Disposition': `inline; filename="${sub.form_number}_preview.png"`,
          'Cache-Control': 'public, max-age=86400',
          'X-Cache': 'MISS',
          'X-Robots-Tag': 'noindex'
        }
      })
    } catch (err: any) {
      try {
        await c.env.DB.prepare(`
          INSERT INTO field_renderer_log (submission_id, form_number, renderer, format, ms, bytes, ok, error, trigger)
          VALUES (?, ?, 'urlbox_failed', 'png', ?, 0, 0, ?, 'preview')
        `).bind(subId, sub.form_number, Date.now() - t0, (err.message || '').slice(0, 300)).run()
      } catch {}
      return c.text(`Preview render failed: ${err.message}`, 500)
    }
  }

  if (!pngObj) return c.text('Preview not available', 503)

  return new Response(pngObj.body, {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `inline; filename="${sub.form_number}_preview.png"`,
      'Cache-Control': 'public, max-age=86400',
      'X-Cache': 'HIT',
      'X-Robots-Tag': 'noindex'
    }
  })
})

// ─── DELIVERIES LIST (choose which delivery to collect from) ─────────────────

app.get('/deliveries', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT id, form_number, prepared_by, driver, venue, event_name, delivery_date,
           collection_date, collection_status, brand, client
    FROM field_submissions
    WHERE form_type = 'delivery'
    ORDER BY created_at DESC
    LIMIT 60
  `).all<any>()

  const deliveries = rows.results || []

  const cards = deliveries.length === 0
    ? `<div style="text-align:center;padding:40px;color:var(--muted)">No delivery notes yet.</div>`
    : deliveries.map((d: any) => {
        const collected = d.collection_status === 'collected'
        const venue = eventVenueLabel(d, '—')
        const date = formatDate(d.delivery_date)
        const colDate = d.collection_date ? ` → collect ${formatDate(d.collection_date)}` : ''
        return `
        <a href="${collected ? '#' : `/field/collect-from/${d.id}`}"
           style="display:block;text-decoration:none;margin-bottom:12px;
                  background:var(--card);border:1px solid ${collected ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'};
                  border-radius:12px;padding:16px;opacity:${collected ? '0.6' : '1'}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
            <div>
              <div style="font-size:13px;font-weight:800;color:var(--gold-lt);margin-bottom:4px">${d.form_number}</div>
              <div style="font-size:16px;font-weight:700;color:var(--white);margin-bottom:4px">${venue}</div>
              <div style="font-size:13px;color:var(--muted)">${date}${colDate}</div>
              ${d.driver ? `<div style="font-size:13px;color:var(--muted);margin-top:2px">🚛 ${d.driver}</div>` : ''}
              ${d.brand ? `<div style="font-size:12px;color:var(--muted);margin-top:2px">🏷️ ${d.brand}</div>` : ''}
            </div>
            <div style="flex-shrink:0;padding:6px 12px;border-radius:20px;font-size:12px;font-weight:700;
                        background:${collected ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)'};
                        color:${collected ? '#6ee7b7' : '#fcd34d'}">
              ${collected ? '✅ Collected' : '⏳ Pending'}
            </div>
          </div>
          ${!collected ? `<div style="margin-top:12px;padding:10px;border-radius:8px;background:rgba(245,158,11,0.1);
              text-align:center;font-size:14px;font-weight:700;color:#fcd34d">
              🔄 Start Collection →
            </div>` : ''}
        </a>`
      }).join('')

  const body = `
  <div class="field-wrap">
    <div class="field-header">
      <a href="/field" style="display:inline-block;text-decoration:none" title="Back to Forms">
        <img src="/static/bw-logo.png" alt="B&W Productions" class="field-logo" style="cursor:pointer">
      </a>
      <div class="field-brand">B&amp;W PRODUCTIONS</div>
      <div class="field-tagline">Start a Collection</div>
      <div class="field-form-title" style="margin-top:12px">Open Deliveries</div>
      <div class="form-num">Tap a delivery below to pre-load the collection form</div>
    </div>
    <div>${cards}</div>
    <a href="/field/collection" style="display:block;text-align:center;padding:14px;border-radius:10px;
       border:1px solid var(--border);color:var(--muted);text-decoration:none;margin-top:8px;font-size:14px">
      + Start blank Collection Note instead
    </a>
    <a href="/field" style="display:block;text-align:center;padding:12px;color:var(--muted);
       text-decoration:none;margin-top:8px;font-size:13px">← Back to Forms</a>
  </div>`

  return c.html(fieldPage('Open Deliveries', body))
})

// ─── PRE-LOADED COLLECTION FROM DELIVERY ─────────────────────────────────────

app.get('/collect-from/:id', async (c) => {
  const deliveryId = c.req.param('id')
  const del = await c.env.DB.prepare('SELECT * FROM field_submissions WHERE id=? AND form_type=?')
    .bind(deliveryId, 'delivery').first<any>()
  if (!del) return c.redirect('/field/deliveries')

  const delLines = await c.env.DB.prepare(
    'SELECT * FROM field_line_items WHERE submission_id=? ORDER BY sort_order'
  ).bind(deliveryId).all<any>()

  const num = await nextFormNumber(c.env.DB, 'collection')

  // Build pre-filled line items HTML
  const preLines = (delLines.results || []).map((_li: any, _i: number) => {
    // Will be injected via JS after page load using the preloaded data
    return _li
  })

  // Serialise delivery items for JS pre-fill
  const preItemsJson = JSON.stringify((delLines.results || []).map((li: any) => ({
    qty: li.quantity, item: li.item_name, brand: li.brand || '', condition: li.condition || 'Checked'
  })))

  const vDesc = VEHICLES.find(v => v.reg === del.vehicle_reg)
  const vehicleLabel = vDesc ? `${del.vehicle_reg} — ${vDesc.desc}` : (del.vehicle_reg || '')

  const body = `
  <div class="field-wrap">
    ${formHeader('Collection Note', num, del.letterhead || 'sab', del.prepared_by || 'Shane')}

    <!-- Linked delivery banner -->
    <div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.35);
                border-radius:12px;padding:14px 16px;margin-bottom:16px">
      <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;
                  color:#fcd34d;margin-bottom:6px">🔗 Linked to Delivery Note</div>
      <div style="font-size:16px;font-weight:800;color:var(--white)">${del.form_number}</div>
      <div style="font-size:13px;color:var(--muted);margin-top:4px">
        ${eventVenueLabel(del, '')}
        ${del.delivery_date ? ' · Delivered ' + formatDate(del.delivery_date) : ''}
      </div>
    </div>

    <form id="deliveryForm" onsubmit="submitForm(event,'collection')">
      <input type="hidden" name="form_type" value="collection">
      <input type="hidden" name="form_number" value="${num}">
      <input type="hidden" name="linked_delivery_id" value="${deliveryId}">

      <div class="section">
        <div class="section-title">Letterhead</div>
        <div class="lh-toggle">
          <button type="button" class="lh-btn ${(del.letterhead||'sab')==='sab'?'active':''}" id="lh-sab" onclick="setLH('sab')">B&amp;W on behalf of SAB</button>
          <button type="button" class="lh-btn ${(del.letterhead||'sab')!=='sab'?'active':''}" id="lh-bw" onclick="setLH('bw')">B&amp;W Standard</button>
        </div>
        <input type="hidden" name="letterhead" id="letterheadInput" value="${del.letterhead || 'sab'}">
      </div>

      <div class="section">
        <div class="section-title">Form Details</div>
        <div class="field-group">
          <label>Prepared By</label>
          <select name="prepared_by" onchange="updatePreparedBy(this)">
            ${peopleOptions(del.prepared_by || 'Shane')}
          </select>
          <input type="text" name="prepared_by_custom" id="preparedByCustom" placeholder="Enter name…" style="display:none;margin-top:8px">
        </div>
        <div class="field-group">
          <label>Driver</label>
          <select name="driver" id="driverSel" onchange="refreshTeamPicker && refreshTeamPicker()">
            ${driverOptions(del.driver || '')}
          </select>
        </div>
        <div class="field-group">
          <label>Collection Date</label>
          <input type="date" name="collection_date" value="${todayStr()}" required>
        </div>
        <div class="field-group">
          <label>Vehicle</label>
          <select name="vehicle_reg" id="vehicleSel" onchange="updateVehicle(this)">
            ${vehicleOptions()}
            <option value="__other__">+ Other / not listed</option>
          </select>
          <input type="text" name="vehicle_reg_custom" id="vehicleRegCustom" placeholder="Type reg e.g. BW01GPXX" autocapitalize="characters" style="display:none;margin-top:8px">
        </div>
      </div>

      ${teamCrewSection()}

      <div class="section">
        <div class="section-title">Client &amp; Venue</div>
        <div class="field-group"><label>Client</label>
          <select name="client">
            <option value="South African Breweries" ${(del.client||'') !== 'Other' ? 'selected' : ''}>South African Breweries (SAB)</option>
            <option value="Other" ${(del.client||'') === 'Other' ? 'selected' : ''}>Other</option>
          </select>
        </div>
        <div class="field-group"><label>Venue Name</label><input type="text" name="venue" value="${del.venue || ''}" required placeholder="Venue name"></div>
        <div class="field-group"><label>Event / Activation</label><input type="text" name="event_name" value="${del.event_name || ''}" placeholder="Event name"></div>
        <div class="field-group"><label>Attention</label><input type="text" name="attention" value="${del.attention || ''}" placeholder="Contact person"></div>
        <div class="field-group"><label>Contact Number</label><input type="tel" name="contact_number" value="${del.contact_number || ''}" placeholder="0XX XXX XXXX"></div>
      </div>

      <div class="section">
        <div class="section-title">Brand</div>
        <select name="form_brand" id="formBrand" onchange="applyFormBrand(this.value)">
          ${brandOptions(del.brand || '')}
        </select>
      </div>

      <div class="section">
        <div class="section-title">Items Being Collected</div>
        <div style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.2);
                    border-radius:8px;padding:10px 14px;font-size:13px;color:#fcd34d;margin-bottom:14px">
          📋 Pre-loaded from ${del.form_number} — confirm, adjust conditions, or remove items not being collected.
        </div>
        <div class="line-items-wrap" id="lineItems"></div>
        <button type="button" class="add-line-btn" onclick="addLineItem()"><i class="fas fa-plus"></i> Add Item</button>
      </div>

      <div class="section">
        <div class="section-title">Other Items (not in list)</div>
        <div id="otherItems"></div>
        <button type="button" class="add-line-btn" onclick="addOtherItem()"><i class="fas fa-plus"></i> Add Other Item</button>
      </div>

      <!-- Damage Report -->
      <div class="section" style="border-color:rgba(239,68,68,0.3)">
        <div class="section-title" style="color:#fca5a5">⚠️ Damage Report</div>
        <div style="font-size:14px;color:var(--muted);margin-bottom:14px">Were any items found damaged or missing on collection?</div>
        <div style="display:flex;gap:10px;margin-bottom:4px">
          <button type="button" id="dmgNo" class="lh-btn active" onclick="setDamage(false)" style="border-color:#10b981;color:#6ee7b7;background:rgba(16,185,129,0.1)">✅ No damage</button>
          <button type="button" id="dmgYes" class="lh-btn" onclick="setDamage(true)">⚠️ Yes — report damage</button>
        </div>
        <input type="hidden" name="has_damage" id="hasDamage" value="no">
        <div id="damageSection" style="display:none;margin-top:16px">
          <div class="field-group">
            <label>Damage Description</label>
            <textarea name="damage_notes" id="damageNotes" placeholder="Describe the damage — which items, what condition, what happened…" style="min-height:100px"></textarea>
          </div>
          <div class="field-group">
            <label style="color:#fca5a5">📸 Photo Evidence (required for damage)</label>
            <div class="photo-upload-area" onclick="document.getElementById('photoInput').click()" style="border-color:rgba(239,68,68,0.4)">
              <input type="file" id="photoInput" accept="image/*" multiple onchange="handlePhotos(this)" style="display:none">
              <div class="photo-upload-icon">📷</div>
              <div class="photo-upload-label" style="color:#fca5a5">Tap to photograph damage</div>
              <div class="photo-upload-hint">Camera or gallery · multiple photos allowed</div>
            </div>
            <div class="photo-previews" id="photoPreviews"></div>
            <div class="photo-count" id="photoCount"></div>
          </div>
        </div>
      </div>

      <button type="button" class="btn-review no-print" onclick="showReviewSummary(event,'collection')">
        👁️ Review Summary
      </button>

      <div class="section" id="sigSection" style="display:none">
        <div class="section-title">Received By (Handover)</div>
        <div style="font-size:13px;color:var(--muted);margin-bottom:14px">✅ Summary confirmed — please sign below.</div>
        <div class="field-group"><label>Name</label><input type="text" name="received_by" placeholder="Person releasing items"></div>
        <div class="field-group">
          <label>Signature</label>
          <canvas class="sig-canvas" id="sigCanvas"></canvas>
          <input type="hidden" name="signature_data" id="sigData">
          <div class="sig-controls"><button type="button" class="sig-clear" onclick="clearSig()">Clear</button></div>
          <div class="sig-hint">Sign with finger or mouse</div>
        </div>
      </div>

      <div class="section" id="footerSection" style="background:rgba(13,17,23,0.5);display:none">
        <div style="font-size:13px;color:var(--muted);text-align:center">
          <strong style="color:var(--white)">Collected By:</strong> B&amp;W Productions Team<br>
          Unit 1, No 19 Kransvalk Road, Highbury, Meyerton 1962<br>
          082 321 6520 · bibi@bwproductions.co.za · VAT 4790261301
        </div>
      </div>

      <button type="submit" class="btn-submit no-print" id="submitBtn" style="display:none">Submit Collection Note</button>
    </form>
  </div>
  ${summaryModal()}
  ${signatureScript()}
  ${lineItemScript()}
  ${photoScript()}
  ${submitScript('collection')}
  <script>
  // Pre-fill items from delivery note
  var preItems = ${preItemsJson}
  function setDamage(hasDmg) {
    document.getElementById('hasDamage').value = hasDmg ? 'yes' : 'no'
    document.getElementById('damageSection').style.display = hasDmg ? 'block' : 'none'
    var yesBtn = document.getElementById('dmgYes')
    var noBtn  = document.getElementById('dmgNo')
    if (hasDmg) {
      yesBtn.style.borderColor='#ef4444'; yesBtn.style.color='#fca5a5'; yesBtn.style.background='rgba(239,68,68,0.12)'
      noBtn.style.borderColor='var(--border)'; noBtn.style.color='var(--muted)'; noBtn.style.background='transparent'
    } else {
      noBtn.style.borderColor='#10b981'; noBtn.style.color='#6ee7b7'; noBtn.style.background='rgba(16,185,129,0.1)'
      yesBtn.style.borderColor='var(--border)'; yesBtn.style.color='var(--muted)'; yesBtn.style.background='transparent'
    }
  }
  // Auto-load items after line item script is ready
  window.addEventListener('DOMContentLoaded', function() {
    preItems.forEach(function(pi) {
      addLineItem()
      var id = lineCount
      var itemSel = document.querySelector('[name="li_item_'+id+'"]')
      if (itemSel) {
        // Find matching option
        var found = false
        for (var i = 0; i < itemSel.options.length; i++) {
          if (itemSel.options[i].value === pi.item) { itemSel.selectedIndex = i; found = true; break }
        }
        if (!found) { itemSel.options[0] = new Option(pi.item, pi.item, true, true) }
      }
      var qtySel = document.querySelector('[name="li_qty_'+id+'"]')
      if (qtySel) qtySel.value = pi.qty
      var brandSel = document.querySelector('[name="li_brand_'+id+'"]')
      if (brandSel && pi.brand) {
        for (var j = 0; j < brandSel.options.length; j++) {
          if (brandSel.options[j].value === pi.brand) { brandSel.selectedIndex = j; break }
        }
      }
      if (pi.condition) setCond(id, pi.condition)
    })
  })
  </script>`

  return c.html(fieldPage(`Collection — ${del.form_number}`, body))
})

// ─── ADMIN SYSTEM ────────────────────────────────────────────────────────────
// PIN-protected. Admins can cancel / restore any delivery note.

const ADMIN_PINS: Record<string, string> = {
  'Bibi':  '2601',
  'Shane': '1234',
  'Marna': '5678',
}

// Roles in the main app that auto-grant field-admin access (no PIN required)
const FIELD_ADMIN_AUTO_ROLES = ['founder', 'ops_director']

async function getAdminSession(c: any): Promise<string | null> {
  const cookie = c.req.header('cookie') || ''

  // 1. Native field-admin PIN session
  const match = cookie.match(/admin_session=([^;]+)/)
  if (match) {
    try {
      const [name, ts] = atob(match[1]).split('|')
      if (Date.now() - Number(ts) <= 8 * 60 * 60 * 1000 && ADMIN_PINS[name] !== undefined) {
        return name
      }
    } catch {}
  }

  // 2. Auto-grant: valid main-app session for a privileged role
  const bwToken = getCookieValue(cookie, 'bw_session')
  if (bwToken) {
    try {
      const user = await verifySessionToken(bwToken)
      if (user && FIELD_ADMIN_AUTO_ROLES.includes(user.role)) {
        // Use the user's name from main session (e.g. "Bibi", "Shane", "Marna")
        return user.name || user.email || 'Admin'
      }
    } catch {}
  }

  return null
}

// GET /admin — login page or admin dashboard
app.get('/admin', async (c) => {
  const admin = await getAdminSession(c)

  if (!admin) {
    // ── Login page ────────────────────────────────────────────────────────────
    const body = `
    <div class="field-wrap">
      <div class="field-header">
        <a href="/field" style="display:inline-block;text-decoration:none">
          <img src="/static/bw-logo.png" alt="B&W Productions" class="field-logo" style="cursor:pointer">
        </a>
        <div class="field-brand">B&amp;W PRODUCTIONS</div>
        <div class="field-tagline">Admin Access</div>
        <div class="field-form-title" style="margin-top:12px">🔒 Admin Login</div>
      </div>

      <div id="loginError" style="display:none;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.4);
           border-radius:10px;padding:12px 16px;font-size:14px;color:#fca5a5;margin-bottom:16px;text-align:center">
        ❌ Incorrect PIN — try again
      </div>

      <div class="section">
        <div class="section-title">Your Name</div>
        <select id="adminName" style="width:100%;background:var(--card);border:1px solid var(--border);
          border-radius:8px;padding:12px 14px;color:var(--white);font-size:16px">
          <option value="">— select —</option>
          ${Object.keys(ADMIN_PINS).map(n => `<option value="${n}">${n}</option>`).join('')}
        </select>
      </div>

      <div class="section">
        <div class="section-title">PIN</div>
        <input type="password" id="adminPin" inputmode="numeric" maxlength="6"
          placeholder="Enter your PIN"
          style="width:100%;background:var(--card);border:1px solid var(--border);border-radius:8px;
                 padding:14px;color:var(--white);font-size:22px;letter-spacing:0.3em;text-align:center"
          onkeydown="if(event.key==='Enter')doLogin()">
      </div>

      <button onclick="doLogin()"
        style="width:100%;padding:16px;border-radius:12px;border:none;margin-top:4px;
               background:linear-gradient(135deg,#1d4ed8,#3b82f6);
               color:#fff;font-size:17px;font-weight:800;cursor:pointer">
        🔓 Login
      </button>

      <div style="text-align:center;margin-top:20px">
        <a href="/field" style="color:var(--muted);font-size:13px;text-decoration:none">← Back to Field Ops</a>
      </div>
    </div>
    <script>
    async function doLogin() {
      const name = document.getElementById('adminName').value
      const pin  = document.getElementById('adminPin').value
      if (!name || !pin) return
      const res = await fetch('/field/admin/login', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ name, pin })
      })
      const data = await res.json()
      if (data.ok) {
        window.location.href = '/field/admin'
      } else {
        document.getElementById('loginError').style.display = 'block'
        document.getElementById('adminPin').value = ''
      }
    }
    document.getElementById('adminPin').addEventListener('keyup', function() {
      document.getElementById('loginError').style.display = 'none'
    })
    </script>`
    return c.html(fieldPage('Admin Login', body))
  }

  // ── Admin dashboard ───────────────────────────────────────────────────────
  const rows = await c.env.DB.prepare(`
    SELECT id, form_number, form_type, prepared_by, driver, venue, event_name,
           delivery_date, brand, client, is_draft, signature_data, notes,
           status, cancelled_by, cancelled_at, cancel_reason, created_at
    FROM field_submissions
    WHERE form_type IN ('delivery','collection','repair')
    ORDER BY created_at DESC
    LIMIT 80
  `).all<any>()

  const subs = rows.results || []

  const typeLabel: Record<string,string> = {
    delivery: '📦 Delivery', collection: '🔄 Collection', repair: '🔧 Repair'
  }

  const cardsHtml = subs.length === 0
    ? `<div style="text-align:center;padding:40px;color:var(--muted)">No records found.</div>`
    : subs.map((s: any) => {
        const cancelled = s.status === 'cancelled'
        const isDraft   = s.is_draft === 1
        const venue     = eventVenueLabel(s, '—')
        const date      = s.delivery_date ? formatDate(s.delivery_date) : 'No date'
        const label     = typeLabel[s.form_type] || s.form_type

        let statusBadge = ''
        if (cancelled) {
          statusBadge = `<span style="padding:2px 10px;border-radius:10px;font-size:10px;font-weight:800;
            background:rgba(239,68,68,0.2);color:#fca5a5;text-transform:uppercase">🚫 Cancelled</span>`
        } else if (isDraft) {
          statusBadge = `<span style="padding:2px 10px;border-radius:10px;font-size:10px;font-weight:800;
            background:rgba(139,92,246,0.2);color:#c4b5fd;text-transform:uppercase">🗒️ Pre-loaded</span>`
        } else if (s.signature_data) {
          statusBadge = `<span style="padding:2px 10px;border-radius:10px;font-size:10px;font-weight:800;
            background:rgba(16,185,129,0.15);color:#6ee7b7;text-transform:uppercase">✅ Signed</span>`
        } else {
          statusBadge = `<span style="padding:2px 10px;border-radius:10px;font-size:10px;font-weight:800;
            background:rgba(245,158,11,0.15);color:#fcd34d;text-transform:uppercase">📋 Open</span>`
        }

        const cancelledNote = cancelled
          ? `<div style="font-size:12px;color:#fca5a5;margin-top:6px">
               Cancelled by ${s.cancelled_by} · ${s.cancelled_at ? formatDate(s.cancelled_at.slice(0,10)) : ''}
               ${s.cancel_reason ? `<br><em>"${s.cancel_reason}"</em>` : ''}
             </div>` : ''

        const actionBtn = cancelled
          ? `<button onclick="adminAction(${s.id},'restore')"
               style="padding:8px 14px;border-radius:8px;border:1px solid rgba(16,185,129,0.4);
                      background:rgba(16,185,129,0.1);color:#6ee7b7;font-size:12px;font-weight:800;cursor:pointer;white-space:nowrap">
               ↩ Restore
             </button>`
          : isDraft
          ? `<button onclick="adminAction(${s.id},'delete_draft')"
               style="padding:8px 14px;border-radius:8px;border:1px solid rgba(239,68,68,0.5);
                      background:rgba(239,68,68,0.15);color:#fca5a5;font-size:12px;font-weight:800;cursor:pointer;white-space:nowrap">
               🗑 Delete Pre-Load
             </button>`
          : `<button onclick="showCancelModal(${s.id},'${s.form_number}',${JSON.stringify(venue)})"
               style="padding:8px 14px;border-radius:8px;border:1px solid rgba(239,68,68,0.4);
                      background:rgba(239,68,68,0.1);color:#fca5a5;font-size:12px;font-weight:800;cursor:pointer;white-space:nowrap">
               🚫 Cancel
             </button>`

        const notesEsc = (s.notes || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
        const notesBlock = !cancelled ? `
          <details style="margin-top:10px;border-top:1px dashed rgba(255,255,255,0.08);padding-top:10px"
                   ${s.notes ? 'open' : ''}>
            <summary style="cursor:pointer;font-size:11px;font-weight:700;color:#fcd34d;
                            text-transform:uppercase;letter-spacing:0.04em;list-style:none">
              📝 Office Notes ${s.notes ? '<span style="opacity:0.6;font-weight:500">(click to collapse)</span>' : '<span style="opacity:0.6;font-weight:500">(click to add)</span>'}
            </summary>
            <textarea id="notes_${s.id}" oninput="markCardNotesDirty(${s.id})"
              placeholder="Notes from the office for this ${s.form_type}…"
              style="width:100%;margin-top:8px;background:rgba(245,158,11,0.06);
                     border:1px solid rgba(245,158,11,0.25);border-radius:8px;
                     padding:10px 12px;font-size:13px;color:var(--white);
                     font-family:inherit;line-height:1.5;resize:vertical;min-height:60px">${notesEsc}</textarea>
            <div style="display:flex;gap:8px;margin-top:6px;align-items:center">
              <button type="button" onclick="saveCardNotes(${s.id})" id="notesBtn_${s.id}"
                style="padding:6px 12px;border-radius:6px;border:1px solid rgba(245,158,11,0.4);
                       background:rgba(245,158,11,0.12);color:#fcd34d;font-size:11px;
                       font-weight:700;cursor:pointer">💾 Save</button>
              <span id="notesStatus_${s.id}" style="font-size:11px;color:var(--muted)"></span>
            </div>
          </details>` : ''

        return `
        <div style="background:var(--card);border:1px solid ${cancelled ? 'rgba(239,68,68,0.25)' : 'var(--border)'};
                    border-radius:14px;padding:14px 16px;margin-bottom:10px;
                    opacity:${cancelled ? '0.65' : '1'}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
                <span style="font-size:12px;font-weight:800;color:var(--gold-lt)">${s.form_number}</span>
                <span style="font-size:11px;color:var(--muted)">${label}</span>
                ${statusBadge}
              </div>
              <div title="${venue.replace(/"/g,'&quot;')}" style="font-size:15px;font-weight:700;color:var(--white);margin-bottom:2px;
                          display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.3;word-break:break-word">${venue}</div>
              <div style="font-size:12px;color:var(--muted)">${date}${s.driver ? ' · 🚛 ' + s.driver : ''}</div>
              ${cancelledNote}
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;align-items:flex-end">
              ${actionBtn}
              ${!cancelled && !isDraft ? `<a href="/field/success/${s.id}" target="_blank"
                style="padding:6px 12px;border-radius:8px;border:1px solid var(--border);
                       color:var(--muted);font-size:11px;text-decoration:none;text-align:center">
                👁 View
              </a>` : ''}
              ${isDraft ? `<a href="/field/delivery/open/${s.id}" target="_blank"
                style="padding:6px 12px;border-radius:8px;border:1px solid rgba(139,92,246,0.4);
                       background:rgba(139,92,246,0.1);color:#c4b5fd;font-size:11px;
                       text-decoration:none;text-align:center;font-weight:700">
                ✏ Open
              </a>` : ''}
            </div>
          </div>
          ${notesBlock}
        </div>`
      }).join('')

  const activeCount   = subs.filter((s: any) => s.status !== 'cancelled').length
  const cancelledCount = subs.filter((s: any) => s.status === 'cancelled').length

  const body = `
  <div class="field-wrap">
    <div class="field-header">
      <a href="/field" style="display:inline-block;text-decoration:none">
        <img src="/static/bw-logo.png" alt="B&W Productions" class="field-logo" style="cursor:pointer">
      </a>
      <div class="field-brand">B&amp;W PRODUCTIONS</div>
      <div class="field-tagline">Admin Panel</div>
      <div class="field-form-title" style="margin-top:10px">🔐 Admin — ${admin}</div>
      <div class="form-num">${activeCount} active · ${cancelledCount} cancelled</div>
    </div>

    <div style="display:flex;gap:10px;margin-bottom:20px">
      <button onclick="filterCards('all')" id="fAll"
        style="flex:1;padding:10px;border-radius:8px;border:1px solid var(--border);
               background:rgba(255,255,255,0.08);color:var(--white);font-size:13px;font-weight:700;cursor:pointer">
        All (${subs.length})
      </button>
      <button onclick="filterCards('active')" id="fActive"
        style="flex:1;padding:10px;border-radius:8px;border:1px solid rgba(16,185,129,0.3);
               background:rgba(16,185,129,0.08);color:#6ee7b7;font-size:13px;font-weight:700;cursor:pointer">
        Active (${activeCount})
      </button>
      <button onclick="filterCards('cancelled')" id="fCancelled"
        style="flex:1;padding:10px;border-radius:8px;border:1px solid rgba(239,68,68,0.3);
               background:rgba(239,68,68,0.08);color:#fca5a5;font-size:13px;font-weight:700;cursor:pointer">
        Cancelled (${cancelledCount})
      </button>
    </div>

    <div id="adminCards">${cardsHtml}</div>

    <div style="margin-top:24px;padding-top:20px;border-top:1px solid var(--border)">
      <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:10px;text-align:center">Manage</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <a href="/field/admin/venues"
          style="display:block;padding:14px 18px;border-radius:10px;
                 border:1px solid rgba(99,102,241,0.4);background:rgba(99,102,241,0.08);
                 color:#a5b4fc;font-size:14px;font-weight:700;text-decoration:none;text-align:center">
          📍 Venue Directory
        </a>
        <a href="/field/admin/planner-extractor"
          style="display:block;padding:14px 18px;border-radius:10px;
                 border:1px solid rgba(59,130,246,0.4);background:rgba(59,130,246,0.08);
                 color:#93c5fd;font-size:14px;font-weight:700;text-decoration:none;text-align:center">
          📋 Planning Calendar Extractor
        </a>
        <a href="/field/admin/damages"
          style="display:block;padding:14px 18px;border-radius:10px;grid-column:1 / -1;
                 border:1px solid rgba(239,68,68,0.4);background:rgba(239,68,68,0.08);
                 color:#fca5a5;font-size:14px;font-weight:700;text-decoration:none;text-align:center">
          🚨 Vehicle Damages Report
        </a>
      </div>
    </div>

    <div style="text-align:center;margin-top:24px;padding-top:20px;border-top:1px solid var(--border)">
      <button onclick="doLogout()"
        style="padding:10px 24px;border-radius:8px;border:1px solid var(--border);
               background:transparent;color:var(--muted);font-size:13px;cursor:pointer">
        🔓 Log out
      </button>
      <div style="margin-top:12px">
        <a href="/field" style="color:var(--muted);font-size:13px;text-decoration:none">← Back to Field Ops</a>
      </div>
    </div>
  </div>

  <!-- Cancel modal -->
  <div id="cancelModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.85);
       z-index:9999;align-items:center;justify-content:center;padding:24px">
    <div style="background:#1a1f2e;border:1px solid rgba(239,68,68,0.4);border-radius:20px;
                padding:28px;width:100%;max-width:420px">
      <div style="font-size:18px;font-weight:800;color:#fca5a5;margin-bottom:6px">🚫 Cancel Delivery Note</div>
      <div id="cancelModalRef" style="font-size:13px;color:var(--muted);margin-bottom:20px"></div>
      <div class="field-group" style="margin-bottom:16px">
        <label style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;
                      letter-spacing:0.08em;display:block;margin-bottom:8px">Reason (optional)</label>
        <textarea id="cancelReason" rows="3" placeholder="e.g. Event postponed, client request…"
          style="width:100%;background:var(--card);border:1px solid var(--border);border-radius:8px;
                 padding:12px;color:var(--white);font-size:14px;resize:none"></textarea>
      </div>
      <div style="display:flex;gap:10px">
        <button onclick="confirmCancel()"
          style="flex:1;padding:14px;border-radius:10px;border:none;
                 background:linear-gradient(135deg,#7f1d1d,#ef4444);
                 color:#fff;font-size:15px;font-weight:800;cursor:pointer">
          Confirm Cancel
        </button>
        <button onclick="closeCancelModal()"
          style="padding:14px 18px;border-radius:10px;border:1px solid var(--border);
                 background:transparent;color:var(--muted);font-size:14px;cursor:pointer">
          Keep it
        </button>
      </div>
    </div>
  </div>

  <script>
  var _cancelId = null

  function showCancelModal(id, ref, venue) {
    _cancelId = id
    document.getElementById('cancelModalRef').textContent = ref + ' — ' + venue
    document.getElementById('cancelReason').value = ''
    document.getElementById('cancelModal').style.display = 'flex'
  }
  function closeCancelModal() {
    document.getElementById('cancelModal').style.display = 'none'
    _cancelId = null
  }

  async function confirmCancel() {
    if (!_cancelId) return
    const reason = document.getElementById('cancelReason').value.trim()
    const res = await fetch('/field/admin/cancel', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ id: _cancelId, reason })
    })
    const data = await res.json()
    if (data.ok) { closeCancelModal(); window.location.reload() }
    else alert('Error: ' + (data.error || 'unknown'))
  }

  async function adminAction(id, action) {
    if (action === 'restore' && !confirm('Restore this note? It will reappear on the driver screen.')) return
    if (action === 'delete_draft' && !confirm('Permanently delete this pre-loaded note? This cannot be undone.')) return
    const res = await fetch('/field/admin/action', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ id, action })
    })
    const data = await res.json()
    if (data.ok) window.location.reload()
    else alert('Error: ' + (data.error || 'unknown'))
  }

  function filterCards(mode) {
    document.querySelectorAll('#adminCards > div').forEach(function(card) {
      var hasCancelled = card.innerHTML.includes('Cancelled')
      if (mode === 'all') card.style.display = ''
      else if (mode === 'active') card.style.display = hasCancelled ? 'none' : ''
      else if (mode === 'cancelled') card.style.display = hasCancelled ? '' : 'none'
    })
  }

  async function doLogout() {
    await fetch('/field/admin/logout', { method: 'POST' })
    window.location.href = '/field/admin'
  }

  // ── Inline notes editing ───────────────────────────────────────────────
  var _notesDirtyAdmin = {}
  function markCardNotesDirty(id) {
    _notesDirtyAdmin[id] = true
    var s = document.getElementById('notesStatus_' + id)
    if (s) { s.textContent = '● Unsaved'; s.style.color = '#fcd34d' }
  }
  async function saveCardNotes(id) {
    var ta = document.getElementById('notes_' + id)
    var btn = document.getElementById('notesBtn_' + id)
    var s = document.getElementById('notesStatus_' + id)
    if (!ta || !btn) return
    btn.disabled = true; btn.textContent = '⏳…'
    try {
      var res = await fetch('/field/notes/update/' + id, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ notes: ta.value })
      })
      var j = await res.json()
      if (j.success) {
        delete _notesDirtyAdmin[id]
        if (s) { s.textContent = '✓ Saved'; s.style.color = '#10b981' }
        setTimeout(function() { if (s && !_notesDirtyAdmin[id]) s.textContent = '' }, 2500)
      } else {
        if (s) { s.textContent = '✗ ' + (j.error || 'failed'); s.style.color = '#ef4444' }
      }
    } catch (e) {
      if (s) { s.textContent = '✗ network'; s.style.color = '#ef4444' }
    } finally {
      btn.disabled = false; btn.textContent = '💾 Save'
    }
  }
  window.addEventListener('beforeunload', function(e) {
    if (Object.keys(_notesDirtyAdmin).length > 0) { e.preventDefault(); e.returnValue = '' }
  })
  </script>`

  return c.html(fieldPage('Admin', body))
})

// POST /admin/login — verify PIN, set cookie
app.post('/admin/login', async (c) => {
  const { name, pin } = await c.req.json<any>()
  if (!name || !pin || ADMIN_PINS[name] !== pin) {
    return c.json({ ok: false })
  }
  const token = btoa(`${name}|${Date.now()}`)
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `admin_session=${token}; Path=/field; HttpOnly; SameSite=Strict; Max-Age=28800`
    }
  })
})

// POST /admin/logout — clear cookie
app.post('/admin/logout', (c) => {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `admin_session=; Path=/field; HttpOnly; Max-Age=0`
    }
  })
})

// POST /admin/cancel — mark a note as cancelled
app.post('/admin/cancel', async (c) => {
  const admin = await getAdminSession(c)
  if (!admin) return c.json({ ok: false, error: 'Not authorised' }, 403)
  const { id, reason } = await c.req.json<any>()
  if (!id) return c.json({ ok: false, error: 'Missing id' })
  await c.env.DB.prepare(`
    UPDATE field_submissions
    SET status='cancelled', cancelled_by=?, cancelled_at=datetime('now'), cancel_reason=?
    WHERE id=?
  `).bind(admin, reason || null, id).run()
  return c.json({ ok: true })
})

// POST /admin/action — restore cancelled note OR permanently delete a draft
app.post('/admin/action', async (c) => {
  const admin = await getAdminSession(c)
  if (!admin) return c.json({ ok: false, error: 'Not authorised' }, 403)
  const { id, action } = await c.req.json<any>()
  if (action === 'restore') {
    await c.env.DB.prepare(`
      UPDATE field_submissions
      SET status='active', cancelled_by=NULL, cancelled_at=NULL, cancel_reason=NULL
      WHERE id=?
    `).bind(id).run()
    return c.json({ ok: true })
  }
  if (action === 'delete_draft') {
    // Only allow deleting actual drafts (is_draft=1)
    const check = await c.env.DB.prepare('SELECT is_draft FROM field_submissions WHERE id=?').bind(id).first<any>()
    if (!check || check.is_draft !== 1) return c.json({ ok: false, error: 'Not a draft' })
    await c.env.DB.prepare('DELETE FROM field_line_items WHERE submission_id=?').bind(id).run()
    await c.env.DB.prepare('DELETE FROM field_suggested_items WHERE submission_id=?').bind(id).run()
    await c.env.DB.prepare('DELETE FROM field_submissions WHERE id=?').bind(id).run()
    return c.json({ ok: true })
  }
  return c.json({ ok: false, error: 'Unknown action' })
})

// ─── ADMIN: VENUES DIRECTORY ────────────────────────────────────────────────
// GET  /admin/venues           — full list, with edit/merge/delete UI
// POST /admin/venues/update    — { id, name, address, region, postal_code, attention_default, notes, venue_type }
// POST /admin/venues/delete    — { id }
// POST /admin/venues/merge     — { keep_id, drop_id }  → drop_id rows folded into keep_id
// POST /admin/venues/create    — { name, address, region, postal_code, attention_default, venue_type }

app.get('/admin/venues', async (c) => {
  const admin = await getAdminSession(c)
  if (!admin) return c.redirect('/field/admin')

  const venues = await c.env.DB.prepare(`
    SELECT id, name, address, region, postal_code, attention_default, notes,
           source, venue_type, use_count, created_at, updated_at
    FROM field_venues
    ORDER BY name COLLATE NOCASE
  `).all<any>()
  const rows = venues.results || []

  // Source / region tallies for the header
  const byRegion: Record<string, number> = {}
  const bySource: Record<string, number> = {}
  rows.forEach((r: any) => {
    byRegion[r.region || '—'] = (byRegion[r.region || '—'] || 0) + 1
    bySource[r.source || 'manual'] = (bySource[r.source || 'manual'] || 0) + 1
  })
  const regionTags = Object.entries(byRegion)
    .sort((a, b) => b[1] - a[1])
    .map(([r, n]) => `<span style="padding:2px 8px;border-radius:8px;background:rgba(99,102,241,0.15);color:#a5b4fc;font-size:11px;font-weight:700;margin:0 4px 4px 0;display:inline-block">${r} · ${n}</span>`)
    .join('')

  const sourceColor: Record<string, string> = {
    sab: '#8b5cf6', rugby: '#10b981', deliveries: '#f59e0b', manual: '#6b7589'
  }
  const typeColor: Record<string, string> = {
    collection: '#f59e0b', stadium: '#10b981', depot: '#3b82f6',
    brewery: '#8b5cf6', office: '#6b7589', mall: '#10b981', venue: '#a5b4fc'
  }

  const escAttr = (s: string) => String(s || '').replace(/"/g, '&quot;')
  const escTxt  = (s: string) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const cardsHtml = rows.length === 0
    ? `<div style="text-align:center;padding:40px;color:var(--muted)">No venues yet.</div>`
    : rows.map((v: any) => {
        const srcCol  = sourceColor[v.source]    || '#6b7589'
        const typeCol = typeColor[v.venue_type]  || '#6b7589'
        return `
        <div class="venue-card" data-search="${escAttr((v.name + ' ' + (v.address || '') + ' ' + (v.region || '')).toLowerCase())}"
             style="background:var(--card);border:1px solid var(--border);border-radius:12px;
                    padding:14px 16px;margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:6px">
            <div style="flex:1;min-width:0">
              <div style="font-size:15px;font-weight:800;color:var(--white);margin-bottom:2px">${escTxt(v.name)}</div>
              <div style="font-size:12px;color:var(--muted)">${escTxt(v.address || '— no address —')}</div>
              <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">
                ${v.region ? `<span style="font-size:10px;padding:2px 8px;border-radius:8px;background:rgba(99,102,241,0.15);color:#a5b4fc;font-weight:700">${escTxt(v.region)}</span>` : ''}
                ${v.venue_type ? `<span style="font-size:10px;padding:2px 8px;border-radius:8px;background:${typeCol}22;color:${typeCol};font-weight:700;text-transform:uppercase;letter-spacing:0.05em">${escTxt(v.venue_type)}</span>` : ''}
                <span style="font-size:10px;padding:2px 8px;border-radius:8px;background:${srcCol}22;color:${srcCol};font-weight:700;text-transform:uppercase;letter-spacing:0.05em">${escTxt(v.source || 'manual')}</span>
                ${v.use_count > 0 ? `<span style="font-size:10px;padding:2px 8px;border-radius:8px;background:rgba(245,158,11,0.15);color:#fcd34d;font-weight:700">📈 used ${v.use_count}x</span>` : ''}
              </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
              <button onclick="openEdit(${v.id})"
                style="padding:7px 12px;border-radius:8px;border:1px solid var(--border);
                       background:rgba(255,255,255,0.05);color:var(--white);font-size:12px;font-weight:700;cursor:pointer">
                ✏️ Edit
              </button>
              <button onclick="openMerge(${v.id})"
                style="padding:7px 12px;border-radius:8px;border:1px solid rgba(99,102,241,0.4);
                       background:rgba(99,102,241,0.1);color:#a5b4fc;font-size:12px;font-weight:700;cursor:pointer">
                🔀 Merge
              </button>
              <button onclick="deleteVenue(${v.id}, ${JSON.stringify(v.name).replace(/"/g, '&quot;')})"
                style="padding:7px 12px;border-radius:8px;border:1px solid rgba(239,68,68,0.4);
                       background:rgba(239,68,68,0.1);color:#fca5a5;font-size:12px;font-weight:700;cursor:pointer">
                🗑 Delete
              </button>
            </div>
          </div>
          ${v.attention_default || v.postal_code ? `
            <div style="font-size:11px;color:var(--muted);margin-top:6px;padding-top:6px;border-top:1px dashed var(--border)">
              ${v.attention_default ? `👤 ${escTxt(v.attention_default)}` : ''}
              ${v.attention_default && v.postal_code ? ' · ' : ''}
              ${v.postal_code ? `📮 ${escTxt(v.postal_code)}` : ''}
            </div>` : ''}
          ${v.notes ? `<div style="font-size:11px;color:var(--muted);margin-top:6px;font-style:italic">📝 ${escTxt(v.notes)}</div>` : ''}
        </div>`
      }).join('')

  // Inline JSON for the JS edit/merge dialogs (saves an extra API call per click)
  const venuesJson = JSON.stringify(rows).replace(/</g, '\\u003c')

  const body = `
  <div class="field-wrap">
    <div class="field-header">
      <a href="/field" style="display:inline-block;text-decoration:none">
        <img src="/static/bw-logo.png" alt="B&W Productions" class="field-logo" style="cursor:pointer">
      </a>
      <div class="field-brand">B&amp;W PRODUCTIONS</div>
      <div class="field-tagline">Admin · Venues</div>
      <div class="field-form-title" style="margin-top:10px">📍 Venue Directory</div>
      <div class="form-num">${rows.length} venues · powers the typeahead on every form</div>
    </div>

    <div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.25);border-radius:12px;
                padding:12px 14px;margin-bottom:18px">
      <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#a5b4fc;margin-bottom:6px">Regions</div>
      <div>${regionTags || '<span style="color:var(--muted);font-size:12px">none</span>'}</div>
    </div>

    <div style="display:flex;gap:10px;margin-bottom:14px">
      <input id="venueSearch" type="text" placeholder="🔍 Filter by name, address, region…"
        oninput="filterVenues(this.value)"
        style="flex:1;background:var(--card);border:1px solid var(--border);border-radius:10px;
               padding:12px 14px;color:var(--white);font-size:14px">
      <button onclick="openCreate()"
        style="padding:12px 18px;border-radius:10px;border:none;
               background:linear-gradient(135deg,#065f46,#10b981);color:#fff;
               font-size:13px;font-weight:800;cursor:pointer;white-space:nowrap">
        ➕ New
      </button>
    </div>

    <div id="venueCards">${cardsHtml}</div>
    <div id="venueNoResults" style="display:none;text-align:center;padding:40px;color:var(--muted)">No matches.</div>

    <div style="text-align:center;margin-top:28px;padding-top:20px;border-top:1px solid var(--border)">
      <a href="/field/admin" style="color:var(--muted);font-size:13px;text-decoration:none">← Back to Admin</a>
    </div>
  </div>

  <!-- Edit / Create modal -->
  <div id="editModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;
       align-items:center;justify-content:center;padding:24px;overflow-y:auto">
    <div style="background:#1a1f2e;border:1px solid var(--border);border-radius:18px;
                padding:24px;width:100%;max-width:480px;margin:auto">
      <div id="editModalTitle" style="font-size:17px;font-weight:800;color:var(--white);margin-bottom:14px">✏️ Edit Venue</div>
      <input type="hidden" id="ev_id">
      <div class="field-group"><label>Name</label><input type="text" id="ev_name" placeholder="Venue name" required></div>
      <div class="field-group"><label>Address</label><input type="text" id="ev_address" placeholder="Street, suburb, city"></div>
      <div style="display:flex;gap:10px">
        <div class="field-group" style="flex:2"><label>Region</label><input type="text" id="ev_region" placeholder="e.g. Gauteng"></div>
        <div class="field-group" style="flex:1"><label>Postal</label><input type="text" id="ev_postal" placeholder="0083"></div>
      </div>
      <div class="field-group"><label>Default Attention</label><input type="text" id="ev_attn" placeholder="Default contact person"></div>
      <div class="field-group">
        <label>Type</label>
        <select id="ev_type" style="width:100%;background:var(--card);border:1px solid var(--border);border-radius:8px;padding:11px 14px;color:var(--white);font-size:14px">
          <option value="venue">venue</option>
          <option value="stadium">stadium</option>
          <option value="mall">mall</option>
          <option value="office">office</option>
          <option value="depot">depot</option>
          <option value="brewery">brewery</option>
          <option value="collection">collection</option>
        </select>
      </div>
      <div class="field-group"><label>Notes</label><textarea id="ev_notes" rows="2" placeholder="Loading bay, gate code, etc."></textarea></div>
      <div style="display:flex;gap:10px;margin-top:14px">
        <button onclick="saveVenue()"
          style="flex:1;padding:13px;border-radius:10px;border:none;
                 background:linear-gradient(135deg,#065f46,#10b981);color:#fff;
                 font-size:14px;font-weight:800;cursor:pointer">💾 Save</button>
        <button onclick="closeEdit()"
          style="padding:13px 18px;border-radius:10px;border:1px solid var(--border);
                 background:transparent;color:var(--muted);font-size:14px;cursor:pointer">Cancel</button>
      </div>
    </div>
  </div>

  <!-- Merge modal -->
  <div id="mergeModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;
       align-items:center;justify-content:center;padding:24px;overflow-y:auto">
    <div style="background:#1a1f2e;border:1px solid rgba(99,102,241,0.4);border-radius:18px;
                padding:24px;width:100%;max-width:480px;margin:auto">
      <div style="font-size:17px;font-weight:800;color:#a5b4fc;margin-bottom:6px">🔀 Merge Venue</div>
      <div id="mergeFromLabel" style="font-size:13px;color:var(--muted);margin-bottom:16px"></div>
      <div class="field-group">
        <label>Merge into…</label>
        <input type="text" id="mergeSearch" placeholder="Type to search target venue…"
          oninput="renderMergeOptions(this.value)"
          style="width:100%;background:var(--card);border:1px solid var(--border);border-radius:8px;padding:11px 14px;color:var(--white);font-size:14px;margin-bottom:8px">
        <div id="mergeOptions" style="max-height:240px;overflow-y:auto;border:1px solid var(--border);border-radius:8px"></div>
      </div>
      <div style="font-size:12px;color:var(--muted);margin-top:10px;line-height:1.5">
        ℹ️ Use-count and the longer address from both venues are kept. The dropped venue is permanently removed.
      </div>
      <div style="display:flex;gap:10px;margin-top:14px">
        <button id="mergeConfirmBtn" onclick="confirmMerge()" disabled
          style="flex:1;padding:13px;border-radius:10px;border:none;
                 background:linear-gradient(135deg,#312e81,#6366f1);color:#fff;
                 font-size:14px;font-weight:800;cursor:pointer;opacity:0.5">🔀 Confirm Merge</button>
        <button onclick="closeMerge()"
          style="padding:13px 18px;border-radius:10px;border:1px solid var(--border);
                 background:transparent;color:var(--muted);font-size:14px;cursor:pointer">Cancel</button>
      </div>
    </div>
  </div>

  <script>
  var _venues = ${venuesJson}
  var _isCreating = false
  var _mergeFromId = null
  var _mergeToId = null

  function filterVenues(q) {
    var term = (q || '').toLowerCase().trim()
    var visible = 0
    document.querySelectorAll('#venueCards .venue-card').forEach(function(el) {
      var match = !term || (el.getAttribute('data-search') || '').includes(term)
      el.style.display = match ? '' : 'none'
      if (match) visible++
    })
    document.getElementById('venueNoResults').style.display = (term && visible === 0) ? '' : 'none'
  }

  function openCreate() {
    _isCreating = true
    document.getElementById('editModalTitle').textContent = '➕ New Venue'
    document.getElementById('ev_id').value = ''
    document.getElementById('ev_name').value = ''
    document.getElementById('ev_address').value = ''
    document.getElementById('ev_region').value = ''
    document.getElementById('ev_postal').value = ''
    document.getElementById('ev_attn').value = ''
    document.getElementById('ev_type').value = 'venue'
    document.getElementById('ev_notes').value = ''
    document.getElementById('editModal').style.display = 'flex'
  }

  function openEdit(id) {
    var v = _venues.find(function(x) { return x.id === id })
    if (!v) return
    _isCreating = false
    document.getElementById('editModalTitle').textContent = '✏️ Edit Venue'
    document.getElementById('ev_id').value      = v.id
    document.getElementById('ev_name').value    = v.name || ''
    document.getElementById('ev_address').value = v.address || ''
    document.getElementById('ev_region').value  = v.region || ''
    document.getElementById('ev_postal').value  = v.postal_code || ''
    document.getElementById('ev_attn').value    = v.attention_default || ''
    document.getElementById('ev_type').value    = v.venue_type || 'venue'
    document.getElementById('ev_notes').value   = v.notes || ''
    document.getElementById('editModal').style.display = 'flex'
  }

  function closeEdit() { document.getElementById('editModal').style.display = 'none' }

  async function saveVenue() {
    var name = document.getElementById('ev_name').value.trim()
    if (!name) { alert('Name is required.'); return }
    var payload = {
      id:                _isCreating ? null : Number(document.getElementById('ev_id').value),
      name:              name,
      address:           document.getElementById('ev_address').value.trim(),
      region:            document.getElementById('ev_region').value.trim(),
      postal_code:       document.getElementById('ev_postal').value.trim(),
      attention_default: document.getElementById('ev_attn').value.trim(),
      venue_type:        document.getElementById('ev_type').value,
      notes:             document.getElementById('ev_notes').value.trim()
    }
    var url = _isCreating ? '/field/admin/venues/create' : '/field/admin/venues/update'
    try {
      var res = await fetch(url, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) })
      var data = await res.json()
      if (data.ok) { closeEdit(); window.location.reload() }
      else alert('Error: ' + (data.error || 'unknown'))
    } catch(e) { alert('Network error.') }
  }

  async function deleteVenue(id, name) {
    if (!confirm('Delete "' + name + '"? This only removes it from the typeahead directory — it does NOT touch any past delivery notes that used this venue name.')) return
    try {
      var res = await fetch('/field/admin/venues/delete', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: id }) })
      var data = await res.json()
      if (data.ok) window.location.reload()
      else alert('Error: ' + (data.error || 'unknown'))
    } catch(e) { alert('Network error.') }
  }

  function openMerge(fromId) {
    _mergeFromId = fromId
    _mergeToId = null
    var v = _venues.find(function(x) { return x.id === fromId })
    document.getElementById('mergeFromLabel').innerHTML =
      'Drop <strong style="color:#fca5a5">' + escapeHtml(v.name) + '</strong> and fold its use-count into the venue you pick below.'
    document.getElementById('mergeSearch').value = ''
    renderMergeOptions('')
    var btn = document.getElementById('mergeConfirmBtn')
    btn.disabled = true; btn.style.opacity = '0.5'
    document.getElementById('mergeModal').style.display = 'flex'
  }

  function closeMerge() { document.getElementById('mergeModal').style.display = 'none'; _mergeFromId = null; _mergeToId = null }

  function renderMergeOptions(q) {
    var term = (q || '').toLowerCase().trim()
    var pool = _venues.filter(function(v) {
      if (v.id === _mergeFromId) return false
      if (!term) return true
      return (v.name + ' ' + (v.address || '')).toLowerCase().includes(term)
    }).slice(0, 12)
    var box = document.getElementById('mergeOptions')
    if (!pool.length) { box.innerHTML = '<div style="padding:14px;color:var(--muted);font-size:13px;text-align:center">No matches.</div>'; return }
    box.innerHTML = pool.map(function(v) {
      var sel = (v.id === _mergeToId)
      return '<div onclick="pickMergeTarget(' + v.id + ')" ' +
        'style="padding:10px 14px;border-bottom:1px solid var(--border);cursor:pointer;' +
        (sel ? 'background:rgba(99,102,241,0.18)' : '') + '">' +
        '<div style="font-weight:700;color:var(--white);font-size:14px">' + escapeHtml(v.name) + '</div>' +
        (v.address ? '<div style="font-size:11px;color:var(--muted);margin-top:2px">' + escapeHtml(v.address) + '</div>' : '') +
      '</div>'
    }).join('')
  }

  function pickMergeTarget(id) {
    _mergeToId = id
    renderMergeOptions(document.getElementById('mergeSearch').value)
    var btn = document.getElementById('mergeConfirmBtn')
    btn.disabled = false; btn.style.opacity = '1'
  }

  async function confirmMerge() {
    if (!_mergeFromId || !_mergeToId) return
    try {
      var res = await fetch('/field/admin/venues/merge', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ keep_id: _mergeToId, drop_id: _mergeFromId }) })
      var data = await res.json()
      if (data.ok) { closeMerge(); window.location.reload() }
      else alert('Error: ' + (data.error || 'unknown'))
    } catch(e) { alert('Network error.') }
  }

  function escapeHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') }
  </script>`

  return c.html(fieldPage('Admin · Venues', body))
})

app.post('/admin/venues/update', async (c) => {
  const admin = await getAdminSession(c)
  if (!admin) return c.json({ ok: false, error: 'Not authorised' }, 403)
  try {
    const b = await c.req.json<any>()
    if (!b.id || !b.name) return c.json({ ok: false, error: 'id and name required' })
    const name = String(b.name).trim()
    const nameLower = name.toLowerCase()
    // Guard against name collisions with another venue
    const clash = await c.env.DB.prepare(
      'SELECT id FROM field_venues WHERE name_lower=? AND id<>? LIMIT 1'
    ).bind(nameLower, Number(b.id)).first<any>()
    if (clash) return c.json({ ok: false, error: `Another venue already uses that name (id ${clash.id}). Use Merge instead.` })

    // RSA-only guard
    const guard = isSouthAfricanVenue(String(b.region || ''), String(b.address || ''))
    if (!guard.ok) return c.json({ ok: false, error: guard.error })

    await c.env.DB.prepare(`
      UPDATE field_venues
      SET name=?, name_lower=?, address=?, region=?, postal_code=?,
          attention_default=?, venue_type=?, notes=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).bind(
      name, nameLower,
      String(b.address || '').trim(),
      String(b.region || '').trim(),
      String(b.postal_code || '').trim(),
      String(b.attention_default || '').trim(),
      String(b.venue_type || 'venue').trim() || 'venue',
      String(b.notes || '').trim(),
      Number(b.id)
    ).run()
    return c.json({ ok: true })
  } catch (err: any) {
    return c.json({ ok: false, error: err.message }, 500)
  }
})

app.post('/admin/venues/create', async (c) => {
  const admin = await getAdminSession(c)
  if (!admin) return c.json({ ok: false, error: 'Not authorised' }, 403)
  try {
    const b = await c.req.json<any>()
    if (!b.name) return c.json({ ok: false, error: 'name required' })
    const name = String(b.name).trim()
    const nameLower = name.toLowerCase()
    const clash = await c.env.DB.prepare(
      'SELECT id FROM field_venues WHERE name_lower=? LIMIT 1'
    ).bind(nameLower).first<any>()
    if (clash) return c.json({ ok: false, error: `Venue "${name}" already exists (id ${clash.id}).` })

    // RSA-only guard
    const guard = isSouthAfricanVenue(String(b.region || ''), String(b.address || ''))
    if (!guard.ok) return c.json({ ok: false, error: guard.error })

    const ins = await c.env.DB.prepare(`
      INSERT INTO field_venues
        (name, name_lower, address, region, postal_code, attention_default, venue_type, notes, source, use_count)
      VALUES (?,?,?,?,?,?,?,?,'manual',0)
    `).bind(
      name, nameLower,
      String(b.address || '').trim(),
      String(b.region || '').trim(),
      String(b.postal_code || '').trim(),
      String(b.attention_default || '').trim(),
      String(b.venue_type || 'venue').trim() || 'venue',
      String(b.notes || '').trim()
    ).run()
    return c.json({ ok: true, id: ins.meta.last_row_id })
  } catch (err: any) {
    return c.json({ ok: false, error: err.message }, 500)
  }
})

app.post('/admin/venues/delete', async (c) => {
  const admin = await getAdminSession(c)
  if (!admin) return c.json({ ok: false, error: 'Not authorised' }, 403)
  try {
    const { id } = await c.req.json<any>()
    if (!id) return c.json({ ok: false, error: 'id required' })
    await c.env.DB.prepare('DELETE FROM field_venues WHERE id=?').bind(Number(id)).run()
    return c.json({ ok: true })
  } catch (err: any) {
    return c.json({ ok: false, error: err.message }, 500)
  }
})

app.post('/admin/venues/merge', async (c) => {
  const admin = await getAdminSession(c)
  if (!admin) return c.json({ ok: false, error: 'Not authorised' }, 403)
  try {
    const { keep_id, drop_id } = await c.req.json<any>()
    if (!keep_id || !drop_id || Number(keep_id) === Number(drop_id)) {
      return c.json({ ok: false, error: 'keep_id and drop_id must differ' })
    }
    const keep = await c.env.DB.prepare('SELECT * FROM field_venues WHERE id=?').bind(Number(keep_id)).first<any>()
    const drop = await c.env.DB.prepare('SELECT * FROM field_venues WHERE id=?').bind(Number(drop_id)).first<any>()
    if (!keep || !drop) return c.json({ ok: false, error: 'venue not found' })

    // Fold drop into keep: keep the longer address & higher metadata, sum use_count
    const finalAddress = (drop.address || '').length > (keep.address || '').length ? drop.address : keep.address
    const finalRegion  = keep.region       || drop.region       || ''
    const finalPostal  = keep.postal_code  || drop.postal_code  || ''
    const finalAttn    = keep.attention_default || drop.attention_default || ''
    const finalNotes   = [keep.notes, drop.notes].filter(Boolean).join(' · ')
    const finalUse     = (keep.use_count || 0) + (drop.use_count || 0)

    await c.env.DB.prepare(`
      UPDATE field_venues
      SET address=?, region=?, postal_code=?, attention_default=?, notes=?, use_count=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).bind(finalAddress || '', finalRegion, finalPostal, finalAttn, finalNotes, finalUse, Number(keep_id)).run()
    await c.env.DB.prepare('DELETE FROM field_venues WHERE id=?').bind(Number(drop_id)).run()
    return c.json({ ok: true })
  } catch (err: any) {
    return c.json({ ok: false, error: err.message }, 500)
  }
})

// ─── HUMAN-READABLE SLUG REDIRECT ───────────────────────────────────────────
// e.g. /field/view/DN26-0001-sunbet-03May2026-Patrick → looks up by form_number prefix
app.get('/view/:slug', async (c) => {
  const slug = c.req.param('slug')
  // slug format: {formNumber}-{...rest} — extract form_number (first two dash-segments e.g. DN26-0001)
  const parts = slug.split('-')
  const formNumber = parts.slice(0, 2).join('-')
  const sub = await c.env.DB.prepare(
    'SELECT id FROM field_submissions WHERE form_number=? LIMIT 1'
  ).bind(formNumber).first<any>()
  if (!sub) return c.redirect('/field')
  return c.redirect(`/field/success/${sub.id}`)
})

// ─── SUCCESS / PRINT VIEW ─────────────────────────────────────────────────────

app.get('/success/:id', async (c) => {
  const id = c.req.param('id')
  const sub = await c.env.DB.prepare('SELECT * FROM field_submissions WHERE id=?').bind(id).first<any>()
  if (!sub) return c.html(fieldPage('Not found', '<div class="field-wrap"><p style="color:var(--muted);text-align:center;padding:40px">Submission not found.</p></div>'))

  const lines = await c.env.DB.prepare('SELECT * FROM field_line_items WHERE submission_id=? ORDER BY sort_order').bind(id).all<any>()
  const others = await c.env.DB.prepare('SELECT * FROM field_suggested_items WHERE submission_id=?').bind(id).all<any>()

  const formData = JSON.parse(sub.form_data || '{}')
  const isSAB = sub.letterhead === 'sab'
  const formTypeLabel: Record<string,string> = {
    delivery:'Delivery Note', collection:'Collection Note', repair:'Repair Note',
    inspection:'Vehicle Inspection', shortlist:'Shortlist for Events',
    musicbus_inspection:'Music Bus Inspection'
  }
  const label = formTypeLabel[sub.form_type] || sub.form_type

  // Build a descriptive page title: "Delivery Note — PIR Cape Town — Cape Town — 03 May 2026 — Patrick"
  const titleVenue = eventVenueLabel(sub, '')
  const titleDate  = sub.delivery_date ? formatDate(sub.delivery_date) : ''
  const titleDriver = sub.driver || sub.prepared_by || ''
  const pageTitle = [label, titleVenue, titleDate, titleDriver].filter(Boolean).join(' — ')

  const lineRows = (lines.results || []).map((li: any) => `
    <tr>
      <td style="padding:4px 5px;border:1px solid #ddd;text-align:center;font-size:12px">${li.quantity}</td>
      <td style="padding:4px 5px;border:1px solid #ddd;font-size:12px">${li.item_name}</td>
      <td style="padding:4px 5px;border:1px solid #ddd;font-size:12px">${li.brand || '—'}</td>
      <td style="padding:4px 5px;border:1px solid #ddd;font-size:12px">${li.condition || 'Checked'}</td>
      <td style="padding:4px 5px;border:1px solid #ddd;font-size:12px">${li.comments || ''}</td>
    </tr>`).join('')

  // ─── Vehicle Inspection — render ALL 31 items with pass/fail + notes ──────
  // Inspection answers are stored under formData.inspection as { insp_0: 'pass'|'fail', ... }
  // Driver notes for fails are stored at top-level as formData.insp_note_<i>.
  // For backwards-compat we also fall back to formData itself if .inspection is missing.
  const inspSrc: any = (formData && formData.inspection && typeof formData.inspection === 'object')
    ? formData.inspection
    : (formData || {})
  const hasInspection = sub.form_type === 'inspection'
    || INSPECTION_ITEMS.some((_, i) => inspSrc['insp_' + i] === 'pass' || inspSrc['insp_' + i] === 'fail')

  let inspectionBlock = ''
  if (hasInspection) {
    let passCount = 0, failCount = 0, naCount = 0
    const inspRows = INSPECTION_ITEMS.map((name, i) => {
      const v = (inspSrc['insp_' + i] || '').toString().toLowerCase()
      const note = (formData['insp_note_' + i] || inspSrc['insp_note_' + i] || '').toString().trim()
      let badge = ''
      if (v === 'pass') {
        passCount++
        badge = '<span style="display:inline-block;min-width:54px;text-align:center;padding:3px 8px;border-radius:4px;background:#dcfce7;color:#166534;border:1px solid #86efac;font-weight:700;font-size:11px;-webkit-print-color-adjust:exact;print-color-adjust:exact">✓ PASS</span>'
      } else if (v === 'fail') {
        failCount++
        badge = '<span style="display:inline-block;min-width:54px;text-align:center;padding:3px 8px;border-radius:4px;background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;font-weight:700;font-size:11px;-webkit-print-color-adjust:exact;print-color-adjust:exact">✗ FAIL</span>'
      } else {
        naCount++
        badge = '<span style="display:inline-block;min-width:54px;text-align:center;padding:3px 8px;border-radius:4px;background:#f3f4f6;color:#6b7280;border:1px solid #d1d5db;font-weight:700;font-size:11px;-webkit-print-color-adjust:exact;print-color-adjust:exact">— N/A</span>'
      }
      const rowBg = v === 'fail' ? 'background:#fff7f7' : ''
      return `
        <tr style="${rowBg}">
          <td style="padding:5px 6px;border:1px solid #ddd;text-align:center;font-size:11px;color:#6b7280;width:32px">${i + 1}</td>
          <td style="padding:5px 8px;border:1px solid #ddd;font-size:12px;font-weight:${v === 'fail' ? '700' : '500'};color:${v === 'fail' ? '#991b1b' : '#111827'}">${name}</td>
          <td style="padding:5px 6px;border:1px solid #ddd;text-align:center;width:80px">${badge}</td>
          <td style="padding:5px 8px;border:1px solid #ddd;font-size:11.5px;color:${note ? '#991b1b' : '#9ca3af'};font-style:${note ? 'normal' : 'italic'}">${note || (v === 'fail' ? '(no note)' : '')}</td>
        </tr>`
    }).join('')

    inspectionBlock = `
    <div class="section" style="padding:0;overflow:hidden;page-break-inside:auto">
      <div class="section-title" style="padding:10px 12px 6px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <span>Vehicle Inspection — All ${INSPECTION_ITEMS.length} Items</span>
        <span style="font-size:11.5px;font-weight:600">
          <span style="color:#16a34a">${passCount} PASS</span>
          &nbsp;·&nbsp; <span style="color:#dc2626">${failCount} FAIL</span>
          ${naCount ? `&nbsp;·&nbsp; <span style="color:#6b7280">${naCount} N/A</span>` : ''}
        </span>
      </div>
      <div style="overflow-x:auto">
        <table class="print-table" style="width:100%;border-collapse:collapse;font-size:12px;-webkit-print-color-adjust:exact;print-color-adjust:exact">
          <thead style="background:var(--hover)">
            <tr>
              <th style="padding:6px 6px;text-align:center;border:1px solid var(--border);width:32px">#</th>
              <th style="padding:6px 8px;text-align:left;border:1px solid var(--border)">Inspection Item</th>
              <th style="padding:6px 6px;text-align:center;border:1px solid var(--border);width:80px">Result</th>
              <th style="padding:6px 8px;text-align:left;border:1px solid var(--border)">Driver Note</th>
            </tr>
          </thead>
          <tbody>${inspRows}</tbody>
        </table>
      </div>
    </div>`
  }

  const otherRows = (others.results || []).map((oi: any) => `
    <tr>
      <td style="padding:4px 5px;border:1px solid #ddd;text-align:center;font-size:12px">${oi.quantity}</td>
      <td style="padding:4px 5px;border:1px solid #ddd;font-size:12px">${oi.description}</td>
      <td style="padding:4px 5px;border:1px solid #ddd;font-size:12px">${oi.brand || 'None / Generic'}</td>
      <td style="padding:4px 5px;border:1px solid #ddd;font-size:12px">${oi.condition || 'Checked'}</td>
      <td style="padding:4px 5px;border:1px solid #ddd;font-size:12px">${oi.comments || ''}</td>
    </tr>`).join('')

  const sigBlock = sub.signature_data && sub.signature_data.startsWith('data:')
    ? `<div style="background:#ffffff;display:inline-block;border-radius:8px;padding:8px 12px;margin-top:6px;border:2px solid #d1d5db;-webkit-print-color-adjust:exact;print-color-adjust:exact">
        <img src="${sub.signature_data}" style="height:90px;max-width:260px;display:block;background:#ffffff;-webkit-print-color-adjust:exact;print-color-adjust:exact">
       </div>`
    : `<em style="color:#6b7589;font-size:14px">${sub.signature_data || sub.received_by || sub.prepared_by || '—'}</em>`

  // Human-readable slug: formNumber-venue-date-driver
  function slugify(s: string): string {
    return (s || '').toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,24)
  }
  // Combined event+venue slug so the readable URL/file shows both
  const venueSlug = slugify(eventVenueLabel(sub, '') || 'bw')
  const dateSlug = (sub.delivery_date || '').replace(/-/g,'')
  const driverSlug = slugify(sub.driver || sub.prepared_by)
  const readableSlug = `${sub.form_number}-${venueSlug}-${dateSlug}-${driverSlug}`

  const pdfUrl      = sub.pdf_url || ''
  // inline view URL — opens PDF in browser
  const pdfViewUrl  = pdfUrl ? pdfUrl : ''
  // force-download URL — appends ?download=1
  const pdfDownUrl  = pdfUrl ? pdfUrl + '?download=1' : ''
  const onlineUrl   = `https://bwprodsystem.co.za/field/view/${readableSlug}`

  // WhatsApp message — show combined Event + Venue label, then the date
  const waEventVenue = eventVenueLabel(sub, '—')
  const waMsg = encodeURIComponent(
    `📋 *${label}* — Ref: ${sub.form_number}\n` +
    `🎪 ${waEventVenue}\n` +
    `📅 Date: ${formatDate(sub.delivery_date || sub.collection_date)}\n` +
    `👤 Prepared by: ${sub.prepared_by}\n` +
    `🚛 Driver: ${sub.driver || '—'}\n` +
    `🏷️ Items: ${(lines.results||[]).length} line item(s)\n` +
    (pdfViewUrl ? `📄 Tap to view PDF: ${pdfViewUrl}\n` : '') +
    (pdfDownUrl ? `⬇️ Tap to download PDF: ${pdfDownUrl}\n` : '') +
    `🔗 View online: ${onlineUrl}`
  )

  // Build two-column details layout for print compactness
  const allTeamStr = (() => {
    const allTeam = [formData.team_members, formData.casuals].filter(Boolean).join(', ')
    const names = allTeam.split(',').filter((s:string) => s.trim())
    return names.length > 0 ? names.map((s:string) => s.trim()).join(', ') : ''
  })()

  const detailRows = [
    sub.prepared_by   ? ['Prepared By',   `<strong>${sub.prepared_by}</strong>`] : null,
    sub.driver        ? ['Driver',         sub.driver]      : null,
    sub.vehicle_reg   ? ['Vehicle',        sub.vehicle_reg] : null,
    formData.vehicle2_reg ? ['2nd Vehicle', formData.vehicle2_reg + (formData.vehicle2_driver ? ' · ' + formData.vehicle2_driver : '')] : null,
    allTeamStr        ? ['Team',           allTeamStr]      : null,
    ['Client',   sub.client || 'South African Breweries'],
    // Combined Event + Venue line (e.g. "Cape Town PR — Cape Town")
    (sub.event_name || sub.venue) ? ['Event & Venue', eventVenueLabel(sub, '')] : null,
    sub.venue_address ? ['Venue Address',  sub.venue_address]  : null,
    sub.attention     ? ['Attention',      sub.attention]      : null,
    sub.contact_number? ['Contact',        sub.contact_number] : null,
    sub.delivery_date ? ['Delivery Date',  formatDate(sub.delivery_date)]   : null,
    sub.collection_date?['Collection Date',formatDate(sub.collection_date)] : null,
    sub.brand         ? ['Brand',          sub.brand]          : null,
  ].filter(Boolean) as [string,string][]

  // Split into two columns for the print layout
  const half = Math.ceil(detailRows.length / 2)
  const col1 = detailRows.slice(0, half)
  const col2 = detailRows.slice(half)
  const maxRows = Math.max(col1.length, col2.length)
  const detailTableRows = Array.from({ length: maxRows }, (_, i) => {
    const a = col1[i], b = col2[i]
    return `<tr>
      <td style="padding:2px 6px 2px 0;color:#888;font-size:10.5px;white-space:nowrap;width:22%">${a ? a[0] : ''}</td>
      <td style="padding:2px 8px 2px 0;font-size:10.5px;width:28%">${a ? a[1] : ''}</td>
      <td style="padding:2px 6px 2px 8px;color:#888;font-size:10.5px;white-space:nowrap;width:22%;border-left:1px solid #e5e7eb">${b ? b[0] : ''}</td>
      <td style="padding:2px 0;font-size:10.5px;width:28%">${b ? b[1] : ''}</td>
    </tr>`
  }).join('')

  const body = `
  <div class="field-wrap">
    <div class="field-header" style="background:${isSAB ? 'rgba(16,185,129,0.06)' : 'transparent'}">
      <img src="/static/bw-logo.png" alt="B&W Productions" class="field-logo">
      <div class="field-brand">B&amp;W PRODUCTIONS</div>
      ${isSAB ? `<div class="field-tagline">on behalf of SA Breweries</div>` : `<div class="field-tagline">Field Operations</div>`}
      <div style="font-size:11px;color:var(--muted);margin-top:4px;line-height:1.6">
        Unit 1, No 19 Kransvalk Road, Highbury, Meyerton 1962 &nbsp;·&nbsp;
        082 321 6520 &nbsp;·&nbsp; bibi@bwproductions.co.za &nbsp;·&nbsp; VAT 4790261301
      </div>
      <div class="field-form-title" style="margin-top:10px">${label}</div>
      <div class="form-num">Ref: ${sub.form_number} &nbsp;·&nbsp; ${formatDate(sub.delivery_date || sub.created_at)}</div>
    </div>

    <!-- Details: two-column grid for print compactness -->
    <div class="section">
      <table style="width:100%;border-collapse:collapse">
        ${detailTableRows}
      </table>
    </div>

    ${(lines.results||[]).length > 0 ? `
    <div class="section" style="padding:0;overflow:hidden">
      <div class="section-title" style="padding:10px 12px 0">Equipment</div>
      <div style="overflow-x:auto">
        <table class="print-table" style="width:100%;border-collapse:collapse;font-size:13px">
          <thead style="background:var(--hover)">
            <tr>
              <th style="padding:7px 6px;text-align:center;border:1px solid var(--border);width:44px">Qty</th>
              <th style="padding:7px 6px;border:1px solid var(--border)">Item</th>
              <th style="padding:7px 6px;border:1px solid var(--border)">Brand</th>
              <th style="padding:7px 6px;border:1px solid var(--border)">Condition</th>
              <th style="padding:7px 6px;border:1px solid var(--border)">Comments</th>
            </tr>
          </thead>
          <tbody>${lineRows}${otherRows}</tbody>
        </table>
      </div>
    </div>` : ''}

    ${inspectionBlock}

    ${sub.notes ? `<div class="section"><div class="section-title">Notes</div><p style="font-size:13px;margin:0">${sub.notes}</p></div>` : ''}

    <div class="section signoff-section">
      <table style="width:100%;font-size:13px">
        <tr>
          <td style="width:50%;vertical-align:top;padding-right:16px">
            <div style="color:var(--muted);font-size:11px;margin-bottom:4px">DELIVERED BY</div>
            <strong>B&amp;W Productions Team</strong>
          </td>
          <td style="width:50%;vertical-align:top">
            <div style="color:var(--muted);font-size:11px;margin-bottom:4px">RECEIVED BY</div>
            <strong>${sub.received_by || '—'}</strong><br>
            ${sigBlock}
          </td>
        </tr>
      </table>
    </div>

    <div class="section no-print" style="background:transparent;border:none;padding:8px 0">
      <div style="font-size:11px;color:var(--muted);margin-bottom:8px;word-break:break-all">🔗 bwprodsystem.co.za/field/view/${readableSlug}</div>

      ${pdfUrl ? `
      <!-- PDF Buttons -->
      <a href="${pdfViewUrl}" target="_blank"
         style="display:block;padding:14px;border-radius:10px;text-align:center;text-decoration:none;
                background:linear-gradient(135deg,#1e3a5f,#2563eb,#60a5fa);color:#fff;
                font-size:15px;font-weight:800;margin-bottom:8px">
        👁️ Tap here to view PDF
      </a>
      <a href="${pdfDownUrl}" target="_blank"
         style="display:block;padding:14px;border-radius:10px;text-align:center;text-decoration:none;
                background:rgba(37,99,235,0.12);border:1px solid rgba(37,99,235,0.4);color:#60a5fa;
                font-size:15px;font-weight:700;margin-bottom:8px">
        ⬇️ Tap here to download the PDF
      </a>
      <a href="${onlineUrl}" target="_blank"
         style="display:block;padding:14px;border-radius:10px;text-align:center;text-decoration:none;
                background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.3);color:#6ee7b7;
                font-size:15px;font-weight:700;margin-bottom:8px">
        🔗 Tap here to view online
      </a>
      ` : `
      <!-- PDF still generating — show print fallback -->
      <button onclick="window.print()" class="btn-secondary" style="margin-bottom:8px">🖨️ Print / Save as PDF</button>
      <div style="font-size:12px;color:var(--muted);text-align:center;margin-bottom:4px">
        ⏳ PDF link generating — refresh this page in ~15 seconds to get the PDF buttons.
      </div>
      `}

      <a href="https://wa.me/?text=${waMsg}" target="_blank" class="btn-wa">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
        📤 Send to WhatsApp
      </a>

      ${sub.form_type === 'delivery' ? `
      <!-- Update Quantities -->
      <div id="updateQtySection" style="margin-top:8px">
        <button onclick="toggleUpdateQty()" class="btn-secondary" style="border-color:rgba(245,158,11,0.5);color:#fcd34d">
          ✏️ Update Quantities
        </button>
        <div id="updateQtyPanel" style="display:none;margin-top:12px">
          <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);border-radius:10px;padding:14px">
            <div style="font-size:13px;font-weight:700;color:#fcd34d;margin-bottom:12px">
              ✏️ Update Quantities — edit and save
            </div>
            <table style="width:100%;font-size:14px;border-collapse:collapse" id="qtyEditTable">
              ${(lines.results||[]).map((li: any) => `
              <tr style="border-bottom:1px solid rgba(245,158,11,0.15)">
                <td style="padding:8px 4px;color:var(--muted);font-size:13px">${li.item_name}${li.brand && li.brand !== '—' ? ' <span style="color:var(--muted);font-size:11px">('+li.brand+')</span>' : ''}</td>
                <td style="padding:8px 4px;width:80px">
                  <input type="number" value="${li.quantity}" min="0"
                    data-li-id="${li.id}"
                    style="width:70px;text-align:center;background:var(--navy);border:1px solid rgba(245,158,11,0.4);
                           border-radius:6px;padding:8px;color:var(--white);font-size:16px;font-weight:700">
                </td>
              </tr>`).join('')}
            </table>
            <div style="margin-top:4px;font-size:12px;color:var(--muted)">Set qty to 0 to mark item as not loaded.</div>
            <button onclick="saveQtyUpdates(${id})" id="saveQtyBtn"
              style="width:100%;margin-top:14px;padding:14px;border-radius:10px;border:none;
                     background:linear-gradient(135deg,#92400e,#f59e0b,#fcd34d);
                     color:#000;font-size:16px;font-weight:800;cursor:pointer">
              💾 Save Changes
            </button>
            <div id="qtyStatus" style="margin-top:8px;font-size:13px;text-align:center;color:var(--muted)"></div>
          </div>
        </div>
      </div>` : ''}

      <a href="/field" class="btn-secondary" style="text-align:center;text-decoration:none;display:block;padding:14px;margin-top:8px">← Back to Forms</a>
    </div>

    <script>
    function toggleUpdateQty() {
      var panel = document.getElementById('updateQtyPanel')
      if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none'
    }
    async function saveQtyUpdates(submissionId) {
      var inputs = document.querySelectorAll('#qtyEditTable input[data-li-id]')
      var items = []
      inputs.forEach(function(inp) {
        items.push({ id: inp.getAttribute('data-li-id'), quantity: parseInt(inp.value) || 0 })
      })
      var btn = document.getElementById('saveQtyBtn')
      var status = document.getElementById('qtyStatus')
      if (btn) { btn.disabled = true; btn.textContent = 'Saving…' }
      try {
        var res = await fetch('/field/update-quantities/' + submissionId, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ line_items: items })
        })
        var result = await res.json()
        if (result.success) {
          if (status) { status.textContent = '✅ Quantities updated successfully'; status.style.color = '#10b981' }
          if (btn) { btn.textContent = '✅ Saved'; btn.style.background = 'rgba(16,185,129,0.2)' }
          // Reload page after 1.5s to show updated table
          setTimeout(function() { location.reload() }, 1500)
        } else {
          if (status) { status.textContent = '❌ Error: ' + (result.error || 'Unknown'); status.style.color = '#ef4444' }
          if (btn) { btn.disabled = false; btn.textContent = '💾 Save Changes' }
        }
      } catch(err) {
        if (status) { status.textContent = '❌ Network error'; status.style.color = '#ef4444' }
        if (btn) { btn.disabled = false; btn.textContent = '💾 Save Changes' }
      }
    }
    </script>

    <div class="print-footer" style="text-align:center;font-size:11px;color:var(--muted);padding:12px 0 6px">
      B&amp;W Productions &nbsp;·&nbsp; Unit 1, No 19 Kransvalk Road, Highbury, Meyerton 1962 &nbsp;·&nbsp; 082 321 6520 &nbsp;·&nbsp; bibi@bwproductions.co.za &nbsp;·&nbsp; VAT 4790261301
    </div>
  </div>`

  return c.html(fieldPage(pageTitle, body))
})

// ─── HELPER: next form number ─────────────────────────────────────────────────

async function nextFormNumber(db: D1Database, type: string): Promise<string> {
  try {
    await db.prepare('UPDATE field_counters SET last_number = last_number + 1 WHERE form_type = ?').bind(type).run()
    const row = await db.prepare('SELECT last_number FROM field_counters WHERE form_type = ?').bind(type).first<any>()
    const n = row?.last_number || 1
    const prefix: Record<string,string> = { delivery:'DN', collection:'CN', repair:'RN', inspection:'VI', shortlist:'SL', musicbus_inspection:'MBI' }
    const year = new Date().getFullYear().toString().slice(2)
    return `${prefix[type] || 'BW'}${year}-${String(n).padStart(4,'0')}`
  } catch {
    return `${type.toUpperCase().slice(0,2)}-${Date.now()}`
  }
}

// ─── SUMMARY MODAL ────────────────────────────────────────────────────────────

function summaryModal(): string {
  return `
<div class="summary-modal-overlay" id="summaryOverlay">
  <div class="summary-modal" id="summaryBox">
    <div class="summary-modal-header">
      <img src="/static/bw-logo.png" alt="B&W Productions">
      <div class="sm-title">B&amp;W PRODUCTIONS</div>
      <div style="font-size:11px;color:#6b7589;margin-top:4px">
        Unit 1, No 19 Kransvalk Road, Highbury, Meyerton 1962<br>
        082 321 6520 &nbsp;·&nbsp; bibi@bwproductions.co.za &nbsp;·&nbsp; VAT 4790261301
      </div>
      <div class="sm-ref" id="smRef" style="margin-top:8px;font-size:13px;color:#C9A84C;font-weight:700"></div>
    </div>
    <div class="summary-modal-body" id="summaryBody"></div>
    <div class="summary-modal-footer">
      <div style="font-size:13px;color:#6b7589;text-align:center;margin-bottom:4px">
        ✅ Please confirm the above details are correct before signing.
      </div>
      <button class="btn-confirm-summary" onclick="closeSummary(true)">
        Looks Good — Proceed to Sign ✍️
      </button>
      <button class="btn-close-summary" onclick="closeSummary(false)">
        ← Go Back &amp; Edit
      </button>
    </div>
  </div>
</div>

<script>
// Browser-side mirror of the server eventVenueLabel() helper.
// Combines event_name + venue into one display string ("Event — Venue").
function eventVenueLabel(rec, fallback) {
  if (fallback === undefined) fallback = ''
  var ev = ((rec && rec.event_name) || '').toString().trim()
  var vn = ((rec && rec.venue) || '').toString().trim()
  if (ev && vn) {
    if (ev.toLowerCase() === vn.toLowerCase()) return ev
    return ev + ' — ' + vn
  }
  return ev || vn || fallback
}

function showReviewSummary(e, formType) {
  e.preventDefault()
  const form = document.getElementById('deliveryForm')
  const fd = new FormData(form)
  const data = {}
  for (const [k, v] of fd.entries()) data[k] = v

  // Collect line items
  const lineItems = []
  document.querySelectorAll('[id^="li_"]').forEach(div => {
    const id = div.id.replace('li_','')
    const item = form.querySelector('[name="li_item_'+id+'"]')?.value
    if (!item) return
    lineItems.push({
      qty: form.querySelector('[name="li_qty_'+id+'"]')?.value || '1',
      item,
      brand: form.querySelector('[name="li_brand_'+id+'"]')?.value || '—',
      condition: form.querySelector('[name="li_cond_val_'+id+'"]')?.value || 'Checked'
    })
  })

  // Collect other items
  const otherItems = []
  document.querySelectorAll('[id^="other_"]').forEach(div => {
    const id = div.id.replace('other_','')
    const desc = form.querySelector('[name="other_desc_'+id+'"]')?.value
    if (!desc) return
    otherItems.push({ qty: form.querySelector('[name="other_qty_'+id+'"]')?.value || '1', desc })
  })

  // Build summary HTML
  const ref = data.form_number || ''
  const preparedBy = data.prepared_by === '__new__' ? (data.prepared_by_custom || '') : (data.prepared_by || '')
  const driver = data.driver === '__new__' ? (data.driver_custom || '') : (data.driver || '')

  document.getElementById('smRef').textContent = ref

  const typeLabels = { delivery:'Delivery Note', collection:'Collection Note', repair:'Repair Note', inspection:'Vehicle Inspection', shortlist:'Shortlist for Events' }
  const typeLabel = typeLabels[formType] || formType

  let html = ''

  // Details section
  html += '<div class="sm-section"><div class="sm-section-title">📋 ' + typeLabel + '</div>'
  const rows = [
    ['Prepared By', preparedBy],
    ['Driver', driver],
    ['Vehicle Reg', data.vehicle_reg],
    ['Client', data.client || 'South African Breweries'],
    ['Event & Venue', eventVenueLabel(data, '')],
    ['Address', data.address],
    ['Attention', data.attention],
    ['Contact', data.contact_number],
    ['Delivery Date', data.delivery_date],
    ['Collection Date', data.collection_date],
    ['Brand', data.form_brand],
    ['Urgency', data.urgency],
    ['Notes', data.notes],
  ]
  rows.forEach(([label, val]) => {
    if (!val) return
    html += '<div class="sm-row"><span class="sm-label">' + label + '</span><span class="sm-value">' + val + '</span></div>'
  })
  html += '</div>'

  // Equipment section
  if (lineItems.length > 0) {
    html += '<div class="sm-section"><div class="sm-section-title">📦 Equipment (' + lineItems.length + ' item' + (lineItems.length !== 1 ? 's' : '') + ')</div>'
    html += '<table class="sm-items-table"><thead><tr><th>Qty</th><th>Item</th><th>Brand</th><th>Condition</th></tr></thead><tbody>'
    lineItems.forEach(li => {
      html += '<tr><td>' + li.qty + '</td><td>' + li.item + '</td><td>' + li.brand + '</td><td>' + li.condition + '</td></tr>'
    })
    html += '</tbody></table></div>'
  }

  // Other items section — same columns as Equipment for consistency
  if (otherItems.length > 0) {
    html += '<div class="sm-section"><div class="sm-section-title">📝 Other Items</div>'
    html += '<table class="sm-items-table"><thead><tr><th>Qty</th><th>Description</th><th>Brand</th><th>Condition</th></tr></thead><tbody>'
    otherItems.forEach(oi => {
      html += '<tr><td>' + oi.qty + '</td><td>' + oi.desc + '</td><td>None / Generic</td><td>Checked</td></tr>'
    })
    html += '</tbody></table></div>'
  }

  // Inspection items (for inspection form) — read item name from the SAME row as the hidden input
  const inspRows = []
  document.querySelectorAll('[id^="insp_val_"]').forEach(inp => {
    if (!inp.id.startsWith('insp_val_')) return
    const i = inp.id.replace('insp_val_','')
    if (!inp.value) return
    // Walk up to the .inspection-item that contains this hidden input — guarantees alignment
    const row = inp.closest('.inspection-item')
    const nameEl = row ? row.querySelector('.insp-name') : null
    const name = nameEl ? nameEl.textContent.trim() : ('Item ' + i)
    const noteEl = document.getElementById('insp_note_' + i)
    const note = (noteEl && noteEl.value) ? noteEl.value.trim() : ''
    inspRows.push({ name: name, val: inp.value, note: note })
  })
  if (inspRows.length > 0) {
    const failCount = inspRows.filter(r => r.val === 'fail').length
    html += '<div class="sm-section"><div class="sm-section-title">🚗 Inspection Results' +
            (failCount > 0 ? ' <span style="color:#fca5a5;font-weight:600">(' + failCount + ' fail)</span>' : '') +
            '</div>'
    html += '<table class="sm-items-table"><thead><tr><th>Item</th><th>Result</th><th>Note</th></tr></thead><tbody>'
    inspRows.forEach(r => {
      const icon = r.val === 'pass' ? '✅ Pass' : '❌ Fail'
      const noteCell = r.note ? '<em style="color:#fca5a5">' + r.note.replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])) + '</em>' : ''
      html += '<tr><td>' + r.name + '</td><td>' + icon + '</td><td>' + noteCell + '</td></tr>'
    })
    html += '</tbody></table></div>'
  }

  document.getElementById('summaryBody').innerHTML = html
  document.getElementById('summaryOverlay').classList.add('open')
  document.getElementById('summaryOverlay').scrollTop = 0
}

function closeSummary(proceed) {
  document.getElementById('summaryOverlay').classList.remove('open')
  if (proceed) {
    // Reveal the hidden signature section, footer, and submit button
    const sigSection = document.getElementById('sigSection')
    const footerSection = document.getElementById('footerSection')
    const submitBtn = document.getElementById('submitBtn')
    if (sigSection) {
      sigSection.style.display = 'block'
      // Now the canvas has real dimensions — initialise drawing
      setTimeout(() => {
        initCanvas()
        sigSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 80)
    }
    if (footerSection) footerSection.style.display = 'block'
    if (submitBtn) submitBtn.style.display = 'block'
    // Hide the review button — they've confirmed
    document.querySelectorAll('.btn-review').forEach(b => b.style.display = 'none')
  }
}
</script>`
}

// ─── SHARED SCRIPTS ────────────────────────────────────────────────────────────

function signatureScript(): string {
  return `<script>
  // Canvas is hidden on load — setup happens in closeSummary() when revealed.
  // We only wire drawing logic here; initCanvas() is called after reveal.
  let _sigCanvas = null
  let _sigCtx = null
  let _sigDrawing = false
  let _sigLastX = 0, _sigLastY = 0

  function initCanvas() {
    const canvas = document.getElementById('sigCanvas')
    const sigDataInput = document.getElementById('sigData')
    if (!canvas) return
    _sigCanvas = canvas
    const ctx = canvas.getContext('2d')
    _sigCtx = ctx
    canvas.width = canvas.offsetWidth * window.devicePixelRatio
    canvas.height = canvas.offsetHeight * window.devicePixelRatio
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#111111'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    function getPos(e) {
      const rect = canvas.getBoundingClientRect()
      const touch = e.touches ? e.touches[0] : e
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top }
    }
    function start(e) { e.preventDefault(); _sigDrawing = true; const p = getPos(e); _sigLastX = p.x; _sigLastY = p.y; }
    function draw(e) {
      if (!_sigDrawing) return; e.preventDefault()
      const p = getPos(e)
      ctx.beginPath(); ctx.moveTo(_sigLastX, _sigLastY); ctx.lineTo(p.x, p.y); ctx.stroke()
      _sigLastX = p.x; _sigLastY = p.y
      if (sigDataInput) sigDataInput.value = canvas.toDataURL()
    }
    function stop() { _sigDrawing = false; if (sigDataInput && canvas) sigDataInput.value = canvas.toDataURL() }

    canvas.addEventListener('mousedown', start)
    canvas.addEventListener('mousemove', draw)
    canvas.addEventListener('mouseup', stop)
    canvas.addEventListener('touchstart', start, { passive: false })
    canvas.addEventListener('touchmove', draw, { passive: false })
    canvas.addEventListener('touchend', stop)
  }

  // Legacy: if canvas is visible on load (no summary flow), init immediately
  const _earlyCanvas = document.getElementById('sigCanvas')
  if (_earlyCanvas && _earlyCanvas.closest('#sigSection') === null) {
    initCanvas()
  }

  function clearSig() {
    if (!_sigCanvas) return
    _sigCtx.fillStyle = '#ffffff'
    _sigCtx.fillRect(0, 0, _sigCanvas.width, _sigCanvas.height)
    const sigDataInput = document.getElementById('sigData')
    if (sigDataInput) sigDataInput.value = ''
  }

  function setLH(val) {
    document.getElementById('lh-sab').classList.toggle('active', val === 'sab')
    document.getElementById('lh-bw').classList.toggle('active', val === 'bw')
    document.getElementById('letterheadInput').value = val
  }

  function updatePreparedBy(sel) {
    const custom = document.getElementById('preparedByCustom')
    if (custom) custom.style.display = sel.value === '__new__' ? 'block' : 'none'
  }

  function updateVehicle(sel) {
    const custom = document.getElementById('vehicleRegCustom')
    if (custom) custom.style.display = sel.value === '__other__' ? 'block' : 'none'
  }
  </script>`
}

function lineItemScript(): string {
  const itemOpts = itemOptionsHtml()
  const brandOpts = brandOptions()
  const condOpts = CONDITION_OPTIONS.map(c => `<option value="${c}">${c}</option>`).join('')

  return `<script>
  var lineCount = 0
  var otherCount = 0
  var formBrandVal = ''

  function applyFormBrand(brand) {
    formBrandVal = brand
    document.querySelectorAll('.item-brand-sel').forEach(s => {
      if (brand) s.value = brand
    })
  }

  function addLineItem() {
    const wrap = document.getElementById('lineItems')
    const id = ++lineCount
    const div = document.createElement('div')
    div.className = 'line-item'
    div.id = 'li_' + id
    div.innerHTML = \`
      <div class="line-item-row">
        <div><label style="font-size:11px">Qty</label><input type="number" name="li_qty_\${id}" value="1" min="1" style="text-align:center"></div>
        <div><label style="font-size:11px">Item</label>
          <select name="li_item_\${id}">
            <option value="">— select —</option>
            ${itemOpts}
          </select>
        </div>
      </div>
      <div class="line-item-row">
        <div style="grid-column:1/-1"><label style="font-size:11px">Brand Override</label>
          <select name="li_brand_\${id}" class="item-brand-sel">
            ${brandOpts}
          </select>
        </div>
      </div>
      <div><label style="font-size:11px">Condition</label>
        <div class="condition-row">
          <button type="button" class="cond-btn active-checked" id="cond_checked_\${id}" onclick="setCond(\${id},'Checked')">✅ Checked</button>
          <button type="button" class="cond-btn" id="cond_faulty_\${id}" onclick="setCond(\${id},'Faulty')">⚠️ Faulty</button>
          <button type="button" class="cond-btn" id="cond_damaged_\${id}" onclick="setCond(\${id},'Damaged')">❌ Damaged</button>
          <button type="button" class="cond-btn" id="cond_replacement_\${id}" onclick="setCond(\${id},'Replacement')">🔁 Replacement</button>
        </div>
        <input type="hidden" name="li_cond_\${id}" id="li_cond_val_\${id}" value="Checked">
      </div>
      <input type="text" name="li_comment_\${id}" placeholder="Comment (optional)…" style="margin-top:8px;font-size:14px">
      <button type="button" class="remove-btn" onclick="removeLI(\${id})">Remove</button>
    \`
    wrap.appendChild(div)
    if (formBrandVal) {
      div.querySelector('.item-brand-sel').value = formBrandVal
    }
  }

  function setCond(id, val) {
    const conds = ['Checked','Faulty','Damaged','Replacement']
    const classes = ['active-checked','active-faulty','active-damaged','active-replacement']
    conds.forEach((c, i) => {
      const btn = document.getElementById('cond_' + c.toLowerCase() + '_' + id)
      if (btn) btn.className = 'cond-btn' + (c === val ? ' ' + classes[i] : '')
    })
    const inp = document.getElementById('li_cond_val_' + id)
    if (inp) inp.value = val
  }

  function removeLI(id) {
    const el = document.getElementById('li_' + id)
    if (el) el.remove()
  }

  function addOtherItem() {
    const wrap = document.getElementById('otherItems')
    const id = ++otherCount
    const div = document.createElement('div')
    div.className = 'other-row'
    div.id = 'other_' + id
    div.innerHTML = \`
      <input type="number" name="other_qty_\${id}" value="1" min="1" placeholder="Qty" style="text-align:center">
      <div style="display:flex;flex-direction:column;gap:4px;flex:1">
        <div style="display:flex;gap:6px">
          <input type="text" name="other_desc_\${id}" placeholder="Describe item…" style="flex:1" oninput="fuzzyMatch(\${id})">
          <button type="button" onclick="document.getElementById('other_\${id}').remove()" style="padding:0 12px;border-radius:6px;border:1px solid rgba(239,68,68,0.3);background:transparent;color:rgba(239,68,68,0.7);cursor:pointer;font-size:16px">×</button>
        </div>
        <div id="fuzzy_\${id}" style="display:none;font-size:11.5px"></div>
      </div>
    \`
    wrap.appendChild(div)
  }

  // ─── Inline fuzzy match (debounced 300ms) ──────────────────────────────────
  var _fuzzyTimers = {}
  function fuzzyMatch(id) {
    clearTimeout(_fuzzyTimers[id])
    _fuzzyTimers[id] = setTimeout(function() {
      var inp = document.querySelector('[name="other_desc_' + id + '"]')
      var box = document.getElementById('fuzzy_' + id)
      if (!inp || !box) return
      var txt = inp.value.trim()
      if (txt.length < 3) { box.style.display = 'none'; return }
      fetch('/field/admin/products/api/match', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: txt })
      }).then(function(r){ return r.json() }).then(function(j) {
        if (!j.success || !j.candidates || !j.candidates.length) { box.style.display = 'none'; return }
        var top = j.candidates[0]
        if (top.score < 0.65) { box.style.display = 'none'; return }
        var bg = top.score >= 0.85 ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)'
        var fg = top.score >= 0.85 ? '#6ee7b7' : '#fcd34d'
        var pct = Math.round(top.score * 100)
        box.style.cssText = 'display:block;padding:6px 10px;border-radius:5px;background:' + bg + ';color:' + fg + ';font-size:11.5px'
        box.innerHTML = '💡 Did you mean <strong>' + top.name + '</strong>? <span style="opacity:0.7">(' + pct + '% match)</span> '
          + '<button type="button" onclick="document.querySelector(\\'[name=other_desc_' + id + ']\\').value=\\'' + top.name.replace(/'/g,"\\\\'") + '\\';document.getElementById(\\'fuzzy_' + id + '\\').style.display=\\'none\\'" style="margin-left:6px;padding:2px 8px;border-radius:4px;border:1px solid currentColor;background:transparent;color:inherit;cursor:pointer;font-size:11px;font-weight:700">Use it</button>'
          + ' <button type="button" onclick="document.getElementById(\\'fuzzy_' + id + '\\').style.display=\\'none\\'" style="margin-left:4px;padding:2px 6px;border-radius:4px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:rgba(255,255,255,0.6);cursor:pointer;font-size:11px">Keep mine</button>'
      }).catch(function(){ box.style.display = 'none' })
    }, 300)
  }
  </script>`
}

function photoScript(): string {
  return `<script>
  var _photos = []

  function handlePhotos(input) {
    var files = Array.from(input.files)
    files.forEach(function(file) {
      if (_photos.length >= 5) return
      var reader = new FileReader()
      reader.onload = function(ev) {
        _photos.push({ dataUrl: ev.target.result, name: file.name })
        renderPhotoThumbs()
      }
      reader.readAsDataURL(file)
    })
    input.value = ''
  }

  function removePhoto(idx) {
    _photos.splice(idx, 1)
    renderPhotoThumbs()
  }

  function renderPhotoThumbs() {
    var wrap = document.getElementById('photoPreviews')
    var count = document.getElementById('photoCount')
    if (!wrap) return
    var html = ''
    for (var i = 0; i < _photos.length; i++) {
      html += '<div class="photo-thumb">'
      html += '<img src="' + _photos[i].dataUrl + '" alt="Photo ' + (i+1) + '">'
      html += '<button type="button" class="photo-thumb-remove" onclick="removePhoto(' + i + ')">×</button>'
      html += '</div>'
    }
    wrap.innerHTML = html
    if (count) {
      if (_photos.length === 0) { count.textContent = ''; return }
      var rem = 5 - _photos.length
      count.textContent = _photos.length + ' photo' + (_photos.length !== 1 ? 's' : '') + ' added'
        + (rem > 0 ? ' · tap to add ' + rem + ' more' : ' · max 5 reached')
    }
  }
  </script>`
}

function submitScript(formType: string): string {
  return `<script>
  async function submitForm(e, type) {
    e.preventDefault()
    const form = e.target
    const fd = new FormData(form)
    const data = {}
    for (const [k, v] of fd.entries()) data[k] = v

    // Resolve vehicle reg — if "other" selected, use the typed custom value
    const vehicleSel = document.getElementById('vehicleSel')
    const vehicleCustom = document.getElementById('vehicleRegCustom')
    if (vehicleSel && vehicleSel.value === '__other__' && vehicleCustom) {
      data.vehicle_reg = '__other__'
      data.vehicle_reg_custom = vehicleCustom.value.trim().toUpperCase()
    }

    // Collect line items
    const lineItems = []
    document.querySelectorAll('[id^="li_"]').forEach(div => {
      const id = div.id.replace('li_','')
      const item = form.querySelector('[name="li_item_'+id+'"]')?.value
      if (!item) return
      lineItems.push({
        item_name: item,
        quantity: parseInt(form.querySelector('[name="li_qty_'+id+'"]')?.value || '1'),
        brand: form.querySelector('[name="li_brand_'+id+'"]')?.value || '',
        condition: form.querySelector('[name="li_cond_val_'+id+'"]')?.value || 'Checked',
        comments: form.querySelector('[name="li_comment_'+id+'"]')?.value || ''
      })
    })
    data.line_items = lineItems

    // Collect other items
    const otherItems = []
    document.querySelectorAll('[id^="other_"]').forEach(div => {
      const id = div.id.replace('other_','')
      const desc = form.querySelector('[name="other_desc_'+id+'"]')?.value
      if (!desc) return
      otherItems.push({
        description: desc,
        quantity: parseInt(form.querySelector('[name="other_qty_'+id+'"]')?.value || '1')
      })
    })
    data.other_items = otherItems

    // Collect team & vehicle 2 data
    const teamHidden = document.getElementById('teamMembersHidden')
    if (teamHidden) data.team_members = teamHidden.value

    const casualsHidden = document.getElementById('casualsHidden')
    if (casualsHidden) data.casuals = casualsHidden.value

    const v2Sel = document.getElementById('vehicle2Sel')
    const v2Custom = document.getElementById('vehicle2RegCustom')
    if (v2Sel && v2Sel.value) {
      data.vehicle2_reg = v2Sel.value === '__other__' ? (v2Custom ? v2Custom.value.trim().toUpperCase() : '') : v2Sel.value
    }
    const v2Driver = form.querySelector('[name="vehicle2_driver"]')
    if (v2Driver) data.vehicle2_driver = v2Driver.value

    // Get signature
    const canvas = document.getElementById('sigCanvas')
    if (canvas) data.signature_data = canvas.toDataURL()

    // Attach photos if any
    if (typeof _photos !== 'undefined' && _photos.length > 0) {
      data.photos = _photos.map(function(p) { return p.dataUrl })
    }

    // Inspection items
    const inspData = {}
    document.querySelectorAll('[name^="insp_"]').forEach(inp => {
      if (!inp.name.startsWith('insp_note_')) inspData[inp.name] = inp.value
    })
    if (Object.keys(inspData).length) data.inspection = inspData

    const btn = form.querySelector('.btn-submit')
    if (btn) { btn.disabled = true; btn.textContent = 'Submitting…' }

    try {
      const res = await fetch('/field/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      const result = await res.json()
      if (result.success) {
        showModal(result.submission_id, result.form_number, result.slug)
      } else {
        alert('Submission failed: ' + (result.error || 'Unknown error'))
        if (btn) { btn.disabled = false; btn.textContent = 'Submit' }
      }
    } catch(err) {
      alert('Network error. Check connection and try again.')
      if (btn) { btn.disabled = false; btn.textContent = 'Submit' }
    }
  }

  function showModal(id, formNum, slug) {
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    overlay.innerHTML = \`
      <div class="modal-box">
        <div class="modal-icon">✅</div>
        <div class="modal-title">Submitted!</div>
        <div class="modal-sub">Ref: \${formNum}<br>Saved to B&amp;W system.</div>
        <div class="modal-btns">
          <a href="/field/success/\${id}" style="display:block;padding:14px;border-radius:10px;background:linear-gradient(135deg,#8B6914,#C9A84C,#F0D080);color:#000;text-align:center;font-weight:700;text-decoration:none">
            View &amp; Print / Send WhatsApp
          </a>
          <div style="font-size:11px;color:#6b7589;margin-top:8px;word-break:break-all;text-align:left;padding:0 2px">🔗 /field/view/\${slug || formNum}</div>
          <a href="/field" style="display:block;padding:12px;border-radius:10px;border:1px solid var(--border);color:var(--muted);text-align:center;text-decoration:none;margin-top:8px">
            ← New Form
          </a>
        </div>
      </div>
    \`
    document.body.appendChild(overlay)
  }
  </script>`
}

// ─── AI IMPORT SCRIPT ─────────────────────────────────────────────────────────

function aiImportScript(): string {
  const allItems = Object.values(ITEM_CATEGORIES).flat()
  const itemListJson = JSON.stringify(allItems)
  const brandListJson = JSON.stringify(BRANDS)

  return `<script>
  var _aiPhotos = []
  var _aiExtracted = null
  var _allItems = ${itemListJson}
  var _allBrands = ${brandListJson}

  function handleAIPhotos(input) {
    var files = Array.from(input.files)
    files.forEach(function(file) {
      if (_aiPhotos.length >= 3) return
      var reader = new FileReader()
      reader.onload = function(ev) {
        _aiPhotos.push({ dataUrl: ev.target.result, name: file.name })
        renderAIThumbs()
      }
      reader.readAsDataURL(file)
    })
    input.value = ''
  }

  function renderAIThumbs() {
    var wrap = document.getElementById('aiPhotoPreviews')
    var count = document.getElementById('aiPhotoCount')
    var btn = document.getElementById('aiExtractBtn')
    if (!wrap) return
    var html = ''
    for (var i = 0; i < _aiPhotos.length; i++) {
      html += '<div class="photo-thumb" style="position:relative;aspect-ratio:1;border-radius:8px;overflow:hidden;border:1px solid var(--border)">'
      html += '<img src="' + _aiPhotos[i].dataUrl + '" style="width:100%;height:100%;object-fit:cover;display:block">'
      html += '<button type="button" onclick="removeAIPhoto(' + i + ')" style="position:absolute;top:4px;right:4px;width:22px;height:22px;border-radius:50%;background:rgba(0,0,0,0.7);border:none;color:#fff;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center">×</button>'
      html += '</div>'
    }
    wrap.innerHTML = html
    if (count) {
      if (_aiPhotos.length === 0) { count.textContent = ''; }
      else {
        var rem = 3 - _aiPhotos.length
        count.textContent = _aiPhotos.length + ' photo' + (_aiPhotos.length !== 1 ? 's' : '') + ' ready'
          + (rem > 0 ? ' · tap to add ' + rem + ' more' : ' · max 3 reached')
      }
    }
    if (btn) btn.style.display = _aiPhotos.length > 0 ? 'block' : 'none'
  }

  function removeAIPhoto(idx) {
    _aiPhotos.splice(idx, 1)
    renderAIThumbs()
  }

  async function runAIExtract() {
    if (_aiPhotos.length === 0) return
    var btn = document.getElementById('aiExtractBtn')
    var status = document.getElementById('aiStatus')
    var area = document.getElementById('aiUploadArea')
    if (btn) { btn.disabled = true; btn.textContent = '🤖 Reading your sheet…' }
    if (status) { status.style.display = 'block'; status.style.background = 'rgba(139,92,246,0.1)'; status.style.color = '#c4b5fd'; status.textContent = '🤖 Claude is reading your sheet — this takes about 10 seconds…' }

    try {
      var res = await fetch('/field/ai-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: _aiPhotos.map(function(p) { return p.dataUrl }) })
      })
      var result = await res.json()

      if (!result.success) {
        if (status) { status.style.background = 'rgba(239,68,68,0.1)'; status.style.color = '#fca5a5'; status.textContent = '❌ ' + (result.error || 'Extraction failed — try again') }
        if (btn) { btn.disabled = false; btn.textContent = '🤖 Extract Details with AI' }
        return
      }

      _aiExtracted = result.data
      if (status) { status.style.display = 'none' }

      // ── Immediately fill all form text fields silently (no review panel for these) ──
      var form = document.getElementById('preloadForm') || document.getElementById('deliveryForm')
      if (form && _aiExtracted) {
        var d = _aiExtracted
        function _sf(name, val) { var el = form.querySelector('[name="'+name+'"]'); if (el && val) el.value = val }
        _sf('venue',          d.venue)
        _sf('event_name',     d.event_name)
        // NOTE: do NOT overwrite client (always defaults to South African Breweries)
        // NOTE: do NOT overwrite address (field removed)
        _sf('attention',      d.attention)
        _sf('contact_number', d.contact_number)
        _sf('delivery_date',  d.delivery_date)
        _sf('notes',          d.notes)
      }

      // Only show confirm panel if there are equipment items to check
      var hasItems = (_aiExtracted.line_items && _aiExtracted.line_items.length > 0) ||
                     (_aiExtracted.other_items && _aiExtracted.other_items.length > 0)
      if (hasItems) {
        renderAIConfirmPanel(_aiExtracted)
        document.getElementById('aiConfirmPanel').style.display = 'block'
        document.getElementById('aiConfirmPanel').scrollIntoView({ behavior: 'smooth', block: 'start' })
      } else {
        // No equipment — hide AI section entirely, scroll to form
        document.getElementById('aiImportSection').style.display = 'none'
        var eqSection = document.getElementById('lineItems')
        if (eqSection) eqSection.closest('.section').scrollIntoView({ behavior: 'smooth', block: 'start' })
        var flash = document.createElement('div')
        flash.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);background:rgba(16,185,129,0.95);color:#000;padding:12px 24px;border-radius:10px;font-weight:800;font-size:15px;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.5)'
        flash.textContent = '✅ Details filled in — add equipment below'
        document.body.appendChild(flash)
        setTimeout(function() { flash.remove() }, 3000)
      }

    } catch(err) {
      if (status) { status.style.background = 'rgba(239,68,68,0.1)'; status.style.color = '#fca5a5'; status.textContent = '❌ Network error — check connection and try again' }
      if (btn) { btn.disabled = false; btn.textContent = '🤖 Extract Details with AI' }
    }
  }

  function renderAIConfirmPanel(data) {
    // Text fields (venue, client, address, etc.) are already silently filled into the form.
    // This panel only shows EQUIPMENT so the user can check quantities before loading.
    var fieldsDiv = document.getElementById('aiReviewFields')
    var itemsDiv  = document.getElementById('aiReviewItems')
    var othersDiv = document.getElementById('aiReviewOthers')

    // No text field review — form is already populated. Show a compact summary instead.
    if (fieldsDiv) {
      var summary = []
      if (data.venue)    summary.push('<strong style="color:var(--white)">' + escHtml(data.venue) + '</strong>')
      if (data.delivery_date) summary.push(data.delivery_date)
      if (data.client)   summary.push(escHtml(data.client))
      fieldsDiv.innerHTML = summary.length
        ? '<div style="font-size:13px;color:var(--muted);margin-bottom:4px">Filled in: ' + summary.join(' · ') + '</div>'
        : ''
    }

    // Editable equipment items — qty and item name can be tweaked before loading
    var lineItems = data.line_items || []
    if (lineItems.length > 0) {
      var iHtml = '<div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:var(--muted);margin-bottom:10px">📦 Equipment Found (' + lineItems.length + ') — adjust quantities if needed</div>'
      iHtml += '<div style="display:flex;flex-direction:column;gap:6px">'
      lineItems.forEach(function(li, idx) {
        iHtml += '<div style="background:var(--navy);border:1px solid var(--border);border-radius:8px;padding:10px;display:grid;grid-template-columns:64px 1fr;gap:8px;align-items:center">'
        iHtml += '<input type="number" value="' + (li.quantity||1) + '" min="1" data-ai-li-qty="' + idx + '" style="text-align:center;background:transparent;border:1px solid var(--border);border-radius:6px;padding:8px;color:var(--white);font-size:16px;font-weight:700">'
        iHtml += '<div>'
        iHtml += '<input type="text" value="' + escHtml(li.item_name||'') + '" data-ai-li-item="' + idx + '" style="width:100%;background:transparent;border:none;border-bottom:1px solid var(--border);padding:4px 0;color:var(--white);font-size:14px;font-weight:700">'
        if (li.brand) iHtml += '<div style="font-size:12px;color:var(--muted);margin-top:2px"><input type="text" value="' + escHtml(li.brand) + '" data-ai-li-brand="' + idx + '" style="background:transparent;border:none;color:var(--muted);font-size:12px;width:100%"></div>'
        else iHtml += '<input type="hidden" value="" data-ai-li-brand="' + idx + '">'
        iHtml += '</div>'
        iHtml += '</div>'
      })
      iHtml += '</div>'
      if (itemsDiv) itemsDiv.innerHTML = iHtml
    } else {
      if (itemsDiv) itemsDiv.innerHTML = ''
    }

    // Other items
    var otherItems = data.other_items || []
    if (otherItems.length > 0) {
      var oHtml = '<div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:var(--muted);margin:12px 0 8px">📝 Other Items</div>'
      oHtml += '<div style="display:flex;flex-direction:column;gap:6px">'
      otherItems.forEach(function(oi, idx) {
        oHtml += '<div style="background:var(--navy);border:1px solid rgba(245,158,11,0.3);border-radius:8px;padding:10px;display:grid;grid-template-columns:64px 1fr;gap:8px;align-items:center">'
        oHtml += '<input type="number" value="' + (oi.quantity||1) + '" min="1" data-ai-oi-qty="' + idx + '" style="text-align:center;background:transparent;border:1px solid var(--border);border-radius:6px;padding:8px;color:var(--white);font-size:16px;font-weight:700">'
        oHtml += '<input type="text" value="' + escHtml(oi.description||'') + '" data-ai-oi-desc="' + idx + '" style="width:100%;background:transparent;border:none;border-bottom:1px solid rgba(245,158,11,0.3);padding:4px 0;color:#fcd34d;font-size:14px">'
        oHtml += '</div>'
      })
      oHtml += '</div>'
      if (othersDiv) othersDiv.innerHTML = oHtml
    } else {
      if (othersDiv) othersDiv.innerHTML = ''
    }
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
  }

  function loadAIIntoForm() {
    // Form text fields are already filled (done in runAIExtract).
    // This function only loads the equipment items from the confirm panel into the form.

    // Line items — add them to the form
    var liItems = []
    document.querySelectorAll('[data-ai-li-item]').forEach(function(el) {
      var idx = el.getAttribute('data-ai-li-item')
      var qtyEl   = document.querySelector('[data-ai-li-qty="'+idx+'"]')
      var brandEl = document.querySelector('[data-ai-li-brand="'+idx+'"]')
      liItems.push({
        item_name: el.value,
        quantity: parseInt(qtyEl ? qtyEl.value : '1') || 1,
        brand: brandEl ? brandEl.value : ''
      })
    })

    // Other items
    var otherItems = []
    document.querySelectorAll('[data-ai-oi-desc]').forEach(function(el) {
      var idx = el.getAttribute('data-ai-oi-desc')
      var qtyEl = document.querySelector('[data-ai-oi-qty="'+idx+'"]')
      if (el.value.trim()) {
        otherItems.push({ description: el.value, quantity: parseInt(qtyEl ? qtyEl.value : '1') || 1 })
      }
    })

    // Load line items into form
    liItems.forEach(function(li) {
      if (!li.item_name) return
      addLineItem()
      var id = lineCount
      // Try to match item in select
      var sel = document.querySelector('[name="li_item_' + id + '"]')
      if (sel) {
        var found = false
        for (var i = 0; i < sel.options.length; i++) {
          if (sel.options[i].value === li.item_name) { sel.selectedIndex = i; found = true; break }
        }
        if (!found) {
          // Add as custom option
          var opt = new Option(li.item_name, li.item_name, true, true)
          sel.add(opt)
          sel.value = li.item_name
        }
      }
      var qty = document.querySelector('[name="li_qty_' + id + '"]')
      if (qty) qty.value = li.quantity

      // Set brand
      var brandSel = document.querySelector('[name="li_brand_' + id + '"]')
      if (brandSel && li.brand) {
        for (var j = 0; j < brandSel.options.length; j++) {
          if (brandSel.options[j].value === li.brand) { brandSel.selectedIndex = j; break }
        }
      }
    })

    // Load other items
    otherItems.forEach(function(oi) {
      addOtherItem()
      var id = otherCount
      var desc = document.querySelector('[name="other_desc_' + id + '"]')
      if (desc) desc.value = oi.description
      var qty = document.querySelector('[name="other_qty_' + id + '"]')
      if (qty) qty.value = oi.quantity
    })

    // Clear review panel content so stale data can't show again
    var rFields = document.getElementById('aiReviewFields')
    var rItems  = document.getElementById('aiReviewItems')
    var rOthers = document.getElementById('aiReviewOthers')
    if (rFields) rFields.innerHTML = ''
    if (rItems)  rItems.innerHTML  = ''
    if (rOthers) rOthers.innerHTML = ''

    // Hide confirm panel and AI section
    document.getElementById('aiConfirmPanel').style.display = 'none'
    document.getElementById('aiImportSection').style.display = 'none'

    // Scroll to equipment
    var eqSection = document.getElementById('lineItems')
    if (eqSection) eqSection.closest('.section').scrollIntoView({ behavior: 'smooth', block: 'start' })

    // Flash success
    var flash = document.createElement('div')
    flash.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);background:rgba(16,185,129,0.95);color:#000;padding:12px 24px;border-radius:10px;font-weight:800;font-size:15px;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.5)'
    flash.textContent = '✅ Form loaded from photo!'
    document.body.appendChild(flash)
    setTimeout(function() { flash.remove() }, 2500)
  }

  function resetAIPanel() {
    document.getElementById('aiConfirmPanel').style.display = 'none'
    _aiExtracted = null
    _aiPhotos = []
    renderAIThumbs()
    var btn = document.getElementById('aiExtractBtn')
    if (btn) { btn.disabled = false; btn.textContent = '🤖 Extract Details with AI' }
    var status = document.getElementById('aiStatus')
    if (status) status.style.display = 'none'
  }
  </script>`
}

// ─── VEHICLE DAMAGES REPORT (admin) ───────────────────────────────────────────
// Pulls every inspection submission, parses form_data JSON, and lists every
// item flagged ❌ Fail along with the driver's note, vehicle, date and driver.

app.get('/admin/damages', async (c) => {
  const admin = await getAdminSession(c)
  if (!admin) return c.redirect('/field/admin')
  const url = new URL(c.req.url)
  const vehicleFilter = (url.searchParams.get('vehicle') || '').trim().toUpperCase()
  const fromDate = (url.searchParams.get('from') || '').trim()
  const toDate = (url.searchParams.get('to') || '').trim()

  // Pull all inspection submissions
  let query = `SELECT id, form_number, prepared_by, vehicle_reg, delivery_date,
                      created_at, notes, form_data
               FROM field_submissions
               WHERE form_type='inspection'`
  const params: any[] = []
  if (vehicleFilter) { query += ' AND UPPER(vehicle_reg) LIKE ?'; params.push('%' + vehicleFilter + '%') }
  if (fromDate)      { query += ' AND date(delivery_date) >= date(?)'; params.push(fromDate) }
  if (toDate)        { query += ' AND date(delivery_date) <= date(?)'; params.push(toDate) }
  query += ' ORDER BY delivery_date DESC, created_at DESC'

  const stmt = c.env.DB.prepare(query)
  const result = await (params.length ? stmt.bind(...params).all<any>() : stmt.all<any>())
  const subs = result.results || []

  // Parse each submission and extract failed inspection items
  type DamageRow = {
    sub_id: number
    form_number: string
    vehicle_reg: string
    driver: string
    date: string
    item: string
    note: string
    extra_notes: string
  }
  const damages: DamageRow[] = []
  const passOnly: any[] = []

  for (const s of subs) {
    let fd: any = {}
    try { fd = JSON.parse(s.form_data || '{}') } catch {}
    const insp = fd.inspection || {}
    let failsForThisSub = 0
    for (let i = 0; i < INSPECTION_ITEMS.length; i++) {
      const val = insp['insp_' + i]
      if (val === 'fail') {
        failsForThisSub++
        damages.push({
          sub_id: s.id,
          form_number: s.form_number,
          vehicle_reg: s.vehicle_reg || '—',
          driver: s.prepared_by || '—',
          date: s.delivery_date || (s.created_at || '').substring(0, 10),
          item: INSPECTION_ITEMS[i],
          note: (fd['insp_note_' + i] || '').toString().trim(),
          extra_notes: (s.notes || '').toString().trim()
        })
      }
    }
    if (failsForThisSub === 0) passOnly.push(s)
  }

  // Per-vehicle aggregate
  const byVehicle: Record<string, { reg: string; total: number; items: Record<string, number> }> = {}
  for (const d of damages) {
    if (!byVehicle[d.vehicle_reg]) byVehicle[d.vehicle_reg] = { reg: d.vehicle_reg, total: 0, items: {} }
    byVehicle[d.vehicle_reg].total++
    byVehicle[d.vehicle_reg].items[d.item] = (byVehicle[d.vehicle_reg].items[d.item] || 0) + 1
  }
  const vehicleSummary = Object.values(byVehicle).sort((a, b) => b.total - a.total)

  const escape = (s: string) => (s || '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch] as string))

  const filterBar = `
    <form method="get" style="display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin-bottom:18px;
                              padding:14px;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:10px">
      <div style="display:flex;flex-direction:column;gap:4px">
        <label style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em">Vehicle Reg</label>
        <input type="text" name="vehicle" value="${escape(vehicleFilter)}" placeholder="e.g. BW63NNGP"
               style="padding:8px 10px;border-radius:6px;border:1px solid var(--border);background:rgba(0,0,0,0.3);color:#fff;width:160px;text-transform:uppercase">
      </div>
      <div style="display:flex;flex-direction:column;gap:4px">
        <label style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em">From</label>
        <input type="date" name="from" value="${escape(fromDate)}"
               style="padding:8px 10px;border-radius:6px;border:1px solid var(--border);background:rgba(0,0,0,0.3);color:#fff">
      </div>
      <div style="display:flex;flex-direction:column;gap:4px">
        <label style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em">To</label>
        <input type="date" name="to" value="${escape(toDate)}"
               style="padding:8px 10px;border-radius:6px;border:1px solid var(--border);background:rgba(0,0,0,0.3);color:#fff">
      </div>
      <button type="submit"
              style="padding:9px 18px;border-radius:6px;border:1px solid rgba(59,130,246,0.5);
                     background:rgba(59,130,246,0.15);color:#93c5fd;font-weight:700;cursor:pointer">
        Filter
      </button>
      <a href="/field/admin/damages"
         style="padding:9px 18px;border-radius:6px;border:1px solid var(--border);
                background:transparent;color:var(--muted);font-weight:600;text-decoration:none">
        Clear
      </a>
      <a href="/field/admin/damages.csv${url.search}"
         style="padding:9px 18px;border-radius:6px;border:1px solid rgba(34,197,94,0.5);
                background:rgba(34,197,94,0.15);color:#86efac;font-weight:700;text-decoration:none;margin-left:auto">
        ⬇️ Download CSV
      </a>
    </form>`

  const summaryCards = vehicleSummary.length ? `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;margin-bottom:20px">
      ${vehicleSummary.map(v => `
        <div style="padding:14px;border:1px solid rgba(239,68,68,0.3);border-radius:10px;background:rgba(239,68,68,0.06)">
          <div style="font-size:13px;font-weight:800;color:#fff;letter-spacing:0.04em">${escape(v.reg)}</div>
          <div style="font-size:24px;font-weight:800;color:#fca5a5;margin:4px 0">${v.total}</div>
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em">fail flags</div>
          <div style="font-size:11px;color:#9ca3af;margin-top:6px;line-height:1.4">
            ${Object.entries(v.items).slice(0, 4).map(([k, n]) => `${escape(k)} <strong>×${n}</strong>`).join(' · ')}
          </div>
        </div>
      `).join('')}
    </div>
  ` : ''

  const damageTable = damages.length ? `
    <div style="overflow-x:auto;border:1px solid var(--border);border-radius:10px">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead style="background:rgba(255,255,255,0.04)">
          <tr>
            <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--muted);letter-spacing:0.05em">Date</th>
            <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--muted);letter-spacing:0.05em">Vehicle</th>
            <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--muted);letter-spacing:0.05em">Driver</th>
            <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--muted);letter-spacing:0.05em">Item</th>
            <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--muted);letter-spacing:0.05em">Driver Note</th>
            <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--muted);letter-spacing:0.05em">Form #</th>
          </tr>
        </thead>
        <tbody>
          ${damages.map(d => `
            <tr style="border-top:1px solid var(--border)">
              <td style="padding:10px 12px;color:#e5e7eb;white-space:nowrap">${escape(d.date)}</td>
              <td style="padding:10px 12px;color:#fff;font-weight:700">${escape(d.vehicle_reg)}</td>
              <td style="padding:10px 12px;color:#cbd5e1">${escape(d.driver)}</td>
              <td style="padding:10px 12px;color:#fca5a5;font-weight:600">❌ ${escape(d.item)}</td>
              <td style="padding:10px 12px;color:#e5e7eb;font-style:italic">${d.note ? escape(d.note) : '<span style="color:#6b7280">—</span>'}</td>
              <td style="padding:10px 12px"><a href="/field/view/${d.sub_id}" style="color:#93c5fd;text-decoration:none;font-weight:600">${escape(d.form_number)}</a></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  ` : `
    <div style="padding:40px;text-align:center;border:1px dashed var(--border);border-radius:10px;color:var(--muted)">
      No failed inspection items found${vehicleFilter || fromDate || toDate ? ' for the selected filters' : ' yet'}.
    </div>
  `

  const body = `
  <div class="field-wrap" style="max-width:1100px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
      <h1 style="font-size:22px;font-weight:800;color:#fff;margin:0">🚨 Vehicle Damages Report</h1>
      <a href="/field/admin" style="color:var(--muted);text-decoration:none;font-size:13px">← Back to Admin</a>
    </div>
    <p style="color:var(--muted);font-size:13px;margin:0 0 18px">
      Every ❌ Fail flagged on a Vehicle Inspection, with the driver's note. Source: ${subs.length} inspection${subs.length === 1 ? '' : 's'} · ${damages.length} fail flag${damages.length === 1 ? '' : 's'} · ${passOnly.length} clean inspection${passOnly.length === 1 ? '' : 's'}.
    </p>
    ${filterBar}
    ${summaryCards}
    ${damageTable}
  </div>`
  return c.html(fieldPage('Vehicle Damages Report', body))
})

// CSV export of the damages report (respects same filters)
app.get('/admin/damages.csv', async (c) => {
  const admin = await getAdminSession(c)
  if (!admin) return c.redirect('/field/admin')
  const url = new URL(c.req.url)
  const vehicleFilter = (url.searchParams.get('vehicle') || '').trim().toUpperCase()
  const fromDate = (url.searchParams.get('from') || '').trim()
  const toDate = (url.searchParams.get('to') || '').trim()

  let query = `SELECT id, form_number, prepared_by, vehicle_reg, delivery_date,
                      created_at, notes, form_data
               FROM field_submissions
               WHERE form_type='inspection'`
  const params: any[] = []
  if (vehicleFilter) { query += ' AND UPPER(vehicle_reg) LIKE ?'; params.push('%' + vehicleFilter + '%') }
  if (fromDate)      { query += ' AND date(delivery_date) >= date(?)'; params.push(fromDate) }
  if (toDate)        { query += ' AND date(delivery_date) <= date(?)'; params.push(toDate) }
  query += ' ORDER BY delivery_date DESC, created_at DESC'

  const stmt = c.env.DB.prepare(query)
  const result = await (params.length ? stmt.bind(...params).all<any>() : stmt.all<any>())
  const subs = result.results || []

  const csvEscape = (v: string) => {
    const s = (v == null ? '' : String(v))
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const lines: string[] = []
  lines.push(['Date', 'Vehicle Reg', 'Driver', 'Item Failed', 'Driver Note', 'Form Number', 'Submission ID', 'Extra Notes'].join(','))

  for (const s of subs) {
    let fd: any = {}
    try { fd = JSON.parse(s.form_data || '{}') } catch {}
    const insp = fd.inspection || {}
    for (let i = 0; i < INSPECTION_ITEMS.length; i++) {
      if (insp['insp_' + i] === 'fail') {
        lines.push([
          s.delivery_date || (s.created_at || '').substring(0, 10),
          s.vehicle_reg || '',
          s.prepared_by || '',
          INSPECTION_ITEMS[i],
          (fd['insp_note_' + i] || '').toString().trim(),
          s.form_number || '',
          String(s.id),
          (s.notes || '').toString().trim()
        ].map(csvEscape).join(','))
      }
    }
  }

  const today = new Date().toISOString().substring(0, 10)
  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="vehicle-damages-${today}.csv"`
    }
  })
})

// ════════════════════════════════════════════════════════════════════════════
// ─── MUSIC BUS + DJ DRIVERS FLEET APPS ─────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════
// Public landing pages for the Music Bus fleet (Outlet 360 / East Coast / etc.)
// and the DJ Drivers fleet. Drivers pick their name from a locked dropdown;
// JS auto-fills their assigned bus. No auth, no exposure to B&W vehicle list.
//
// Shared shape via buildFleetApp() — config differs only by:
//   • DB tables (music_bus_vehicles+drivers vs dj_vehicles+drivers)
//   • form_type ('musicbus_inspection' vs 'dj_inspection')
//   • branding (Outlet 360 logo, headline label)
//   • base path ('/musicbus' vs '/djdrivers')

type FleetConfig = {
  basePath: string             // '/musicbus'
  formType: string             // 'musicbus_inspection'
  vehicleTable: string         // 'music_bus_vehicles'
  driverTable: string          // 'music_bus_drivers'
  brandTitle: string           // 'Music Bus'
  brandSubtitle: string        // 'Outlet 360 / East Coast Fleet'
  brandLogo: string            // '/static/outlet360-logo.png'
  pageTitle: string            // 'Music Bus Inspection'
  accentColor: string          // CSS color
}

const MUSICBUS_CONFIG: FleetConfig = {
  basePath: '/musicbus',
  formType: 'musicbus_inspection',
  vehicleTable: 'music_bus_vehicles',
  driverTable: 'music_bus_drivers',
  brandTitle: 'Music Bus',
  brandSubtitle: 'Outlet 360 · Fleet Inspection',
  brandLogo: '/static/outlet360-logo.png',
  pageTitle: 'Music Bus Inspection',
  accentColor: '#22d3ee'
}

function fleetPage(title: string, body: string, cfg: FleetConfig): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <title>${title} — ${cfg.brandTitle}</title>
  <link rel="icon" type="image/png" sizes="32x32" href="/static/favicon-32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="/static/favicon-16.png">
  <link rel="icon" type="image/png" sizes="192x192" href="/static/favicon-192.png">
  <link rel="shortcut icon" href="/static/favicon.ico">
  <link rel="apple-touch-icon" sizes="180x180" href="/static/apple-touch-icon.png">
  <meta name="theme-color" content="#0A0A0A">
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <style>${FIELD_CSS}</style>
  <style>
    .fleet-header { text-align:center; padding:24px 18px 18px; border-bottom:1px solid var(--border); margin-bottom:18px; }
    /* Outlet360 logo is dark grey on transparent — on a black page the wordmark
     * disappears. Lift it with a soft light backplate + invert + brightness so
     * it pops on the dark UI without needing a redrawn asset. */
    .fleet-logo-wrap { display:inline-block; padding:14px 22px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.12); border-radius:14px; margin-bottom:14px; }
    .fleet-logo { max-width:240px; width:80%; height:auto; margin:0 auto; display:block; filter:invert(1) brightness(1.05) contrast(1.1); }
    .fleet-brand { font-size:20px; font-weight:800; letter-spacing:0.04em; color:#fff; margin-bottom:4px; }
    .fleet-sub { font-size:12px; color:var(--muted); letter-spacing:0.05em; text-transform:uppercase; margin-bottom:14px; }
    .fleet-formtitle { font-size:17px; font-weight:700; color:${cfg.accentColor}; margin-top:8px; }
    .fleet-formnum { font-size:12px; color:var(--muted); margin-top:4px; font-family:'SF Mono',Menlo,monospace; }
  </style>
</head>
<body>
${body}
</body>
</html>`
}

function fleetHeader(cfg: FleetConfig, formNum: string): string {
  return `
  <div class="field-header fleet-header">
    <a href="${cfg.basePath}" style="display:inline-block;text-decoration:none" title="Back">
      <span class="fleet-logo-wrap" style="cursor:pointer;transition:opacity 0.15s" onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
        <img src="${cfg.brandLogo}" alt="${cfg.brandTitle}" class="fleet-logo">
      </span>
    </a>
    <div class="fleet-brand">${cfg.brandTitle.toUpperCase()}</div>
    <div class="fleet-sub">${cfg.brandSubtitle}</div>
    <div class="fleet-formtitle">${cfg.pageTitle}</div>
    <div class="fleet-formnum">Ref: ${formNum}</div>
  </div>`
}

// Helper: build a fleet inspection submit script (POSTs to ${basePath}/submit).
function fleetSubmitScript(cfg: FleetConfig): string {
  return `<script>
  async function submitFleetForm(e) {
    e.preventDefault()
    const form = e.target
    const fd = new FormData(form)
    const data = {}
    for (const [k,v] of fd.entries()) data[k] = v
    // Collect inspection items
    const insp = {}
    document.querySelectorAll('[name^="insp_"]').forEach(inp => {
      if (!inp.name.startsWith('insp_note_')) insp[inp.name] = inp.value
    })
    data.inspection = insp
    // Signature
    const canvas = document.getElementById('sigCanvas')
    if (canvas) data.signature_data = canvas.toDataURL()
    const btn = form.querySelector('.btn-submit')
    if (btn) { btn.disabled = true; btn.textContent = 'Submitting…' }
    try {
      const res = await fetch('${cfg.basePath}/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      const result = await res.json()
      if (result.success) {
        showFleetModal(result.submission_id, result.form_number)
      } else {
        alert('Submit failed: ' + (result.error || 'Unknown error'))
        if (btn) { btn.disabled = false; btn.textContent = 'Submit Inspection' }
      }
    } catch (err) {
      alert('Network error: ' + err.message)
      if (btn) { btn.disabled = false; btn.textContent = 'Submit Inspection' }
    }
  }
  function showFleetModal(subId, formNum) {
    const modal = document.getElementById('successModal')
    if (!modal) { window.location.href = '${cfg.basePath}'; return }
    document.getElementById('successFormNum').textContent = formNum
    // Keep the user inside the Music Bus app — view PDF via the fleet-scoped
    // success page (does NOT bounce to /field).
    document.getElementById('successViewLink').href = '${cfg.basePath}/success/' + subId
    modal.style.display = 'flex'
  }
  function setInsp(i, val) {
    document.getElementById('insp_val_' + i).value = val
    const passBtn = document.getElementById('pass_' + i)
    const failBtn = document.getElementById('fail_' + i)
    const noteField = document.getElementById('insp_note_' + i)
    passBtn.classList.toggle('active', val === 'pass')
    failBtn.classList.toggle('active', val === 'fail')
    if (noteField) noteField.style.display = val === 'fail' ? 'block' : 'none'
  }
  function showReviewSummaryFleet(e) {
    e.preventDefault()
    // Count failures and unanswered
    let total = 0, fails = 0, unanswered = 0
    document.querySelectorAll('[name^="insp_"][name^="insp_val_"], [id^="insp_val_"]').forEach(_ => {})
    const inspInputs = document.querySelectorAll('input[type="hidden"][id^="insp_val_"]')
    inspInputs.forEach(inp => {
      total++
      if (inp.value === 'fail') fails++
      else if (!inp.value) unanswered++
    })
    if (unanswered > 0) {
      if (!confirm(unanswered + ' items not checked yet. Continue anyway?')) return
    }
    const sigSection = document.getElementById('sigSection')
    sigSection.style.display = 'block'
    document.getElementById('submitBtn').style.display = 'block'
    // Canvas has zero dimensions while hidden — must initialise AFTER it's
    // visible so it gets real width/height. Without this, the pad shows but
    // mousedown/touchstart listeners are never attached and drivers can't sign.
    setTimeout(() => {
      if (typeof initCanvas === 'function') initCanvas()
      sigSection.scrollIntoView({ behavior:'smooth' })
    }, 80)
  }
  </script>`
}

function fleetSuccessModal(cfg: FleetConfig): string {
  return `
  <div id="successModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;align-items:center;justify-content:center;padding:20px">
    <div style="background:#1f2937;border:1px solid var(--border);border-radius:14px;padding:32px;max-width:420px;text-align:center;color:#fff">
      <div style="font-size:54px;margin-bottom:14px">✅</div>
      <h2 style="font-size:22px;font-weight:800;margin-bottom:8px">Inspection submitted</h2>
      <p style="color:var(--muted);font-size:13px;margin-bottom:6px">Ref: <strong id="successFormNum" style="color:${cfg.accentColor};font-family:monospace">—</strong></p>
      <p style="color:var(--muted);font-size:12px;margin-bottom:22px;line-height:1.5">Thank you. Your inspection has been recorded.</p>
      <div style="display:flex;gap:10px;justify-content:center">
        <a id="successViewLink" href="#" style="padding:10px 18px;border-radius:8px;background:${cfg.accentColor};color:#000;text-decoration:none;font-weight:700;font-size:13px">View PDF</a>
        <a href="${cfg.basePath}" style="padding:10px 18px;border-radius:8px;background:rgba(255,255,255,0.08);color:#fff;text-decoration:none;font-weight:600;font-size:13px;border:1px solid var(--border)">Done</a>
      </div>
    </div>
  </div>`
}

// ─── FLEET LANDING + FORM ROUTES ──────────────────────────────────────────────
// One pair of handlers per fleet app, parameterised by FleetConfig.
function registerFleetRoutes(fleetApp: Hono<Env>, cfg: FleetConfig) {
  // ── LANDING: pick driver ───────────────────────────────────────────────────
  fleetApp.get('/', async (c) => {
    const drivers = await c.env.DB.prepare(
      `SELECT id, name, region, default_vehicle_id FROM ${cfg.driverTable}
       WHERE active=1 ORDER BY name COLLATE NOCASE`
    ).all<any>()
    const list = drivers.results || []

    // Flat A-Z list — one entry per driver. Region (if known) shown as a quiet
    // hint after the name so it doesn't dictate the picking flow.
    const driverOpts = list.map(d => {
      const hint = d.region ? ` · ${escHtml(d.region)}` : ''
      return `<option value="${d.id}">${escHtml(d.name)}${hint}</option>`
    }).join('')

    const isEmpty = list.length === 0
    const body = `
    <div class="field-wrap">
      ${fleetHeader(cfg, '— Driver Select —')}
      ${isEmpty ? `
        <div style="padding:40px;text-align:center;color:var(--muted);background:rgba(255,255,255,0.03);border:1px dashed var(--border);border-radius:12px">
          <div style="font-size:42px;margin-bottom:14px">🚧</div>
          <p style="font-size:14px;line-height:1.5">No drivers configured yet.<br>An administrator will populate the driver list shortly.</p>
        </div>
      ` : `
      <form method="GET" action="${cfg.basePath}/inspection" id="driverPickForm">
        <div class="section">
          <div class="section-title">Driver</div>
          <div class="field-group">
            <label>Select your name</label>
            <select name="driver_id" id="driverId" required style="font-size:16px">
              <option value="">— Select driver —</option>
              ${driverOpts}
            </select>
          </div>
        </div>
        <button type="submit" class="btn-submit no-print" style="background:${cfg.accentColor};color:#000;font-weight:800">
          Start Inspection →
        </button>
      </form>
      `}
    </div>`
    return c.html(fleetPage(cfg.brandTitle, body, cfg))
  })

  // ── INSPECTION FORM ────────────────────────────────────────────────────────
  fleetApp.get('/inspection', async (c) => {
    const driverId = parseInt(c.req.query('driver_id') || '0')
    if (!driverId) return c.redirect(cfg.basePath)

    const driver = await c.env.DB.prepare(
      `SELECT id, name, region, default_vehicle_id FROM ${cfg.driverTable} WHERE id=? AND active=1`
    ).bind(driverId).first<any>()
    if (!driver) return c.redirect(cfg.basePath)

    // Any driver can pick ANY active vehicle. Drivers swap vehicles around
    // (especially in Durban) so we don't lock OR pre-select — just a flat A-Z
    // reg list with a star next to their historic default as a soft hint.
    const vehicles = await c.env.DB.prepare(
      `SELECT id, reg_number, description, region, home_location FROM ${cfg.vehicleTable}
       WHERE active=1
       ORDER BY reg_number COLLATE NOCASE`
    ).all<any>()
    const vehList = vehicles.results || []

    const num = await nextFormNumber(c.env.DB, cfg.formType)

    // No pre-selected vehicle — driver must consciously pick. Star marks their
    // historic assignment (if any) as a hint only.
    const vehicleOpts = '<option value="">— Select vehicle —</option>' + vehList.map(v => {
      const star = v.id === driver.default_vehicle_id ? ' ⭐' : ''
      return `<option value="${escHtml(v.reg_number)}">${escHtml(v.reg_number)} — ${escHtml(v.description || '')}${star}</option>`
    }).join('')

    const inspItems = INSPECTION_ITEMS.map((item, i) => `
      <div class="inspection-item">
        <div class="insp-name">${item}</div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
          <div class="insp-btns">
            <button type="button" class="insp-pass" id="pass_${i}" onclick="setInsp(${i},'pass')">✅</button>
            <button type="button" class="insp-fail" id="fail_${i}" onclick="setInsp(${i},'fail')">❌</button>
          </div>
          <input type="hidden" name="insp_${i}" id="insp_val_${i}" value="">
          <input type="text" name="insp_note_${i}" placeholder="Note…"
            style="width:140px;font-size:12px;padding:5px 8px;display:none" id="insp_note_${i}">
        </div>
      </div>`).join('')

    const body = `
    <div class="field-wrap">
      ${fleetHeader(cfg, num)}
      <form id="fleetForm" onsubmit="submitFleetForm(event)">
        <input type="hidden" name="form_type" value="${cfg.formType}">
        <input type="hidden" name="form_number" value="${num}">
        <input type="hidden" name="driver_id" value="${driver.id}">
        <input type="hidden" name="prepared_by" value="${escHtml(driver.name)}">
        <input type="hidden" name="region" value="${escHtml(driver.region || '')}">

        <div class="section">
          <div class="section-title">Driver &amp; Vehicle</div>
          <div class="field-group">
            <label>Driver</label>
            <input type="text" value="${escHtml(driver.name)}" disabled style="background:rgba(255,255,255,0.05);color:#fff;font-weight:700">
          </div>
          <div class="field-group">
            <label>Region</label>
            <input type="text" value="${escHtml(driver.region || '—')}" disabled style="background:rgba(255,255,255,0.05);color:#cbd5e1">
          </div>
          <div class="field-group">
            <label>Vehicle</label>
            <select name="vehicle_reg" required style="font-size:15px;font-weight:600">
              ${vehicleOpts || '<option value="">— No vehicles available —</option>'}
            </select>
          </div>
          <div class="field-group"><label>Date</label><input type="date" name="delivery_date" value="${todayStr()}" required></div>
          <div class="field-group"><label>Current Kilometres</label><input type="number" name="current_km" placeholder="e.g. 84500"></div>
          <div class="field-group"><label>Last Service (KM)</label><input type="number" name="last_service_km" placeholder="e.g. 80000"></div>
        </div>

        <div class="section" style="padding:0">
          <div class="section-title" style="padding:18px 18px 0">31-Point Inspection</div>
          ${inspItems}
        </div>

        <div class="section">
          <div class="section-title">Additional Notes</div>
          <textarea name="notes" placeholder="Any faults, observations, or comments…"></textarea>
        </div>

        <button type="button" class="btn-review no-print" onclick="showReviewSummaryFleet(event)">
          👁️ Review &amp; Sign
        </button>

        <div class="section" id="sigSection" style="background:rgba(239,68,68,0.06);border-color:rgba(239,68,68,0.25);display:none">
          <div style="font-size:14px;font-weight:600;margin-bottom:14px;color:#fca5a5">
            ✅ I confirm I have checked every item above.
          </div>
          <div class="field-group"><label>Driver Signature</label>
            <canvas class="sig-canvas" id="sigCanvas"></canvas>
            <input type="hidden" name="signature_data" id="sigData">
            <div class="sig-controls"><button type="button" class="sig-clear" onclick="clearSig()">Clear</button></div>
            <div class="sig-hint">Sign to confirm all ${INSPECTION_ITEMS.length} items checked</div>
          </div>
        </div>

        <button type="submit" class="btn-submit no-print" id="submitBtn" style="display:none;background:${cfg.accentColor};color:#000;font-weight:800">Submit Inspection</button>
      </form>
    </div>
    ${fleetSuccessModal(cfg)}
    ${signatureScript()}
    ${fleetSubmitScript(cfg)}`
    return c.html(fleetPage(cfg.pageTitle, body, cfg))
  })

  // ── SUBMIT ─────────────────────────────────────────────────────────────────
  fleetApp.post('/submit', async (c) => {
    try {
      const body = await c.req.json()
      const { form_type, form_number, prepared_by, driver_id, region,
              vehicle_reg, delivery_date, current_km, last_service_km,
              notes, signature_data, inspection } = body

      // Dedupe guard: if non-draft with same form_number exists, return that one.
      if (form_number) {
        const existing = await c.env.DB.prepare(
          'SELECT id, form_number FROM field_submissions WHERE form_number=? AND is_draft=0 LIMIT 1'
        ).bind(form_number).first<any>()
        if (existing) {
          return c.json({ success:true, submission_id: existing.id, form_number: existing.form_number, duplicate_suppressed:true })
        }
      }

      // Build form_data JSON: include the inspection map + any per-item notes
      const formData: any = { inspection: inspection || {}, current_km, last_service_km, region, driver_id }
      for (const k of Object.keys(body)) {
        if (k.startsWith('insp_note_')) formData[k] = body[k]
      }

      const result = await c.env.DB.prepare(`
        INSERT INTO field_submissions
          (form_type, form_number, prepared_by, driver, vehicle_reg, client, brand,
           venue, event_name, delivery_date, letterhead, notes, form_data,
           signature_data, is_draft)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)
      `).bind(
        form_type || cfg.formType, form_number, prepared_by || '', prepared_by || '',
        vehicle_reg || '', cfg.brandTitle, '',
        region || '', `${cfg.brandTitle} Inspection`, delivery_date || todayStr(),
        cfg.formType === 'musicbus_inspection' ? 'outlet360' : 'outlet360',
        notes || '', JSON.stringify(formData), signature_data || ''
      ).run()
      const submissionId = result.meta.last_row_id as number

      // ─── Generate PDF + store in R2 (Urlbox primary, PDFShift fallback) ────
      // Mirrors the B&W /field/submit flow so Music Bus submissions also land
      // with a downloadable, WhatsApp-shareable PDF.
      const pageUrl = `https://bwprodsystem.co.za/field/success/${submissionId}`
      const pdfFilename = await buildPdfFilename({
        db: c.env.DB,
        formNumber: form_number,
        formType: cfg.formType,
        vehicleReg: vehicle_reg || '',
        driver: prepared_by || '',
        preparedBy: prepared_by || '',
        eventName: `${cfg.brandTitle} Inspection`,
        venue: region || '',
        date: delivery_date || todayStr()
      })
      const pdfUrl = await renderAndStorePdf(c.env, submissionId, form_number, pageUrl, pdfFilename)

      return c.json({ success:true, submission_id: submissionId, form_number, pdf_url: pdfUrl })
    } catch (err: any) {
      return c.json({ success:false, error: err.message }, 500)
    }
  })

  // ── DRIVER → VEHICLES JSON (every active vehicle is available) ───────────
  fleetApp.get('/driver/:id/vehicles', async (c) => {
    const id = parseInt(c.req.param('id'))
    if (!id) return c.json({ vehicles: [] })
    const d = await c.env.DB.prepare(
      `SELECT region, default_vehicle_id FROM ${cfg.driverTable} WHERE id=?`
    ).bind(id).first<any>()
    if (!d) return c.json({ vehicles: [] })
    const vs = await c.env.DB.prepare(
      `SELECT id, reg_number, description FROM ${cfg.vehicleTable}
       WHERE active=1 ORDER BY reg_number COLLATE NOCASE`
    ).all<any>()
    return c.json({ vehicles: vs.results || [], default_vehicle_id: d.default_vehicle_id })
  })

  // ── SUCCESS PAGE ────────────────────────────────────────────────────────
  // After submit, drivers tap "View PDF" → land here, stay inside /musicbus.
  // We show the submission summary inline (driver, vehicle, date, fails count)
  // and offer the PDF via the existing /field/pdf/:id endpoint (the PDF itself
  // is generated by the same Urlbox pipeline, no need to duplicate).
  fleetApp.get('/success/:id', async (c) => {
    const id = parseInt(c.req.param('id'))
    if (!id) return c.redirect(cfg.basePath)
    const sub = await c.env.DB.prepare(
      `SELECT id, form_number, prepared_by, vehicle_reg, venue as region, delivery_date,
              created_at, notes, form_data, pdf_url
       FROM field_submissions WHERE id=? AND form_type=?`
    ).bind(id, cfg.formType).first<any>()
    if (!sub) return c.redirect(cfg.basePath)

    let fd: any = {}; try { fd = JSON.parse(sub.form_data || '{}') } catch {}
    const insp = fd.inspection || {}
    let passes = 0, fails = 0, unanswered = 0
    for (let i = 0; i < INSPECTION_ITEMS.length; i++) {
      const v = insp['insp_' + i]
      if (v === 'pass') passes++
      else if (v === 'fail') fails++
      else unanswered++
    }

    const failedItems: string[] = []
    for (let i = 0; i < INSPECTION_ITEMS.length; i++) {
      if (insp['insp_' + i] === 'fail') {
        const note = (fd['insp_note_' + i] || '').toString().trim()
        failedItems.push(`<li><strong>❌ ${INSPECTION_ITEMS[i]}</strong>${note ? ` — <span style="color:#fca5a5">${escHtml(note)}</span>` : ''}</li>`)
      }
    }

    const body = `
    <div class="field-wrap" style="max-width:560px">
      ${fleetHeader(cfg, sub.form_number)}

      <div style="text-align:center;padding:20px 0 28px">
        <div style="font-size:54px;margin-bottom:10px">✅</div>
        <h2 style="font-size:20px;font-weight:800;color:#fff;margin-bottom:6px">Inspection on file</h2>
        <p style="color:var(--muted);font-size:13px">Recorded ${escHtml(sub.delivery_date || sub.created_at || '')}</p>
      </div>

      <div class="section">
        <div class="section-title">Summary</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:14px 18px">
          <div><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em">Driver</div><div style="font-size:14px;font-weight:700;color:#fff">${escHtml(sub.prepared_by || '—')}</div></div>
          <div><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em">Vehicle</div><div style="font-size:14px;font-weight:700;color:${cfg.accentColor};font-family:monospace">${escHtml(sub.vehicle_reg || '—')}</div></div>
          <div><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em">Passed</div><div style="font-size:14px;font-weight:700;color:#86efac">${passes} / ${INSPECTION_ITEMS.length}</div></div>
          <div><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em">Failed</div><div style="font-size:14px;font-weight:700;color:${fails > 0 ? '#fca5a5' : '#cbd5e1'}">${fails}${unanswered ? ` · ${unanswered} skipped` : ''}</div></div>
        </div>
      </div>

      ${failedItems.length ? `
        <div class="section" style="background:rgba(239,68,68,0.06);border-color:rgba(239,68,68,0.25)">
          <div class="section-title" style="color:#fca5a5">Issues flagged</div>
          <ul style="padding:8px 18px 16px 32px;color:#e5e7eb;font-size:13px;line-height:1.7">${failedItems.join('')}</ul>
        </div>` : ''}

      ${sub.notes ? `
        <div class="section">
          <div class="section-title">Driver notes</div>
          <div style="padding:6px 18px 16px;color:#e5e7eb;font-size:13px;line-height:1.6;white-space:pre-wrap">${escHtml(sub.notes)}</div>
        </div>` : ''}

      <div style="display:flex;gap:10px;justify-content:center;padding:14px 0 24px;flex-wrap:wrap">
        <a href="/field/pdf/${sub.id}" target="_blank" class="btn-submit no-print" style="background:${cfg.accentColor};color:#000;font-weight:800;text-decoration:none;display:inline-flex;align-items:center;gap:8px;padding:12px 24px">
          📄 View PDF
        </a>
        <a href="${cfg.basePath}" class="btn-submit no-print" style="background:rgba(255,255,255,0.08);color:#fff;text-decoration:none;display:inline-flex;align-items:center;gap:8px;padding:12px 24px;border:1px solid var(--border)">
          ← New inspection
        </a>
      </div>
    </div>`
    return c.html(fleetPage('Submitted', body, cfg))
  })
}

registerFleetRoutes(musicbusApp, MUSICBUS_CONFIG)

export { musicbusApp }
export default app
