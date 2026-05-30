// Event name & venue parser / cleaner.
//
// Drivers in the field type free-text blobs into the "Event Name" and "Venue"
// fields, like:
//   event_name: "Castle light music bus"
//   venue:      "Mathathon Place Stp 490066"
//
// Those strings actually contain several separate concepts:
//   1. Brand:     "Castle Light"  — already known from Brand field
//   2. Form type: "music bus"     — already implied by form context
//   3. Venue:     "Mathathon Place"  ← the actually unique bit
//   4. STP code:  "490066"        — SAB outlet number (5 OR 6 digits)
//
// This module:
//   • Cleans event_name (strips brand + form-type noise, title-cases)
//   • Cleans venue (gently — only title-cases, KEEPS the STP visible)
//   • Extracts STP code into a separate searchable/filterable field
//   • Has safety rules so we never wipe data away (always falls back to input)

// ─── BRAND STRIP LIST ───────────────────────────────────────────────────────
//
// All these strings (case-insensitive) get stripped from event_name when found.
// Includes SAB brands + major competitors. Order matters: longer/more-specific
// names first, so "Castle Milk Stout" is matched before "Castle".
const BRAND_STRIP_LIST: string[] = [
  // SAB — Castle family (longest first)
  'castle milk stout',
  'castle lager light',
  'castle double malt',
  'castle lite light',
  'castle lite',
  'castle light',
  'castle lager',
  'castle free',
  'castle',

  // SAB — Carling family
  'carling black label',
  'carling',
  'black label',

  // SAB — Flying Fish family
  'flying fish chilli lime',
  'flying fish pressed lemon',
  'flying fish orange zest',
  'flying fish citrus',
  'flying fish',

  // SAB — Other beers
  'hansa pilsener',
  'hansa marzen gold',
  'hansa',
  'redds',
  'lion lager',

  // SAB — Ciders & RTDs
  'brutal fruit ruby apple',
  'brutal fruit lychee',
  'brutal fruit cranberry',
  'brutal fruit strawberry',
  'brutal fruit',
  'flying cider',

  // SAB — International / premium imports under SAB
  'stella artois',
  'stella',
  'corona extra',
  'corona',
  'budweiser',
  'becks',
  'leffe',
  'hoegaarden',
  'pilsner urquell',
  'peroni',

  // SAB — Energy / RTD
  'dragon energy',
  'dragon',

  // Competitor breweries — Heineken SA / Distell / Namibian Breweries
  'heineken silver',
  'heineken zero',
  'heineken 0.0',
  'heineken',
  'amstel lager',
  'amstel',
  'windhoek lager',
  'windhoek light',
  'windhoek draught',
  'windhoek',
  'tafel lager',
  'tafel light',
  'tafel',
  'kronenbourg',
  'sol',
  'desperados',
  'miller genuine draft',
  'miller',
  'asahi',
  'sapporo',
  'tiger',

  // Competitor — ciders & RTDs
  'savanna dry',
  'savanna light',
  'savanna lemon',
  'savanna',
  "hunter's dry",
  "hunter's gold",
  "hunter's edge",
  "hunter's",
  'hunters dry',
  'hunters gold',
  'hunters edge',
  'hunters',
  'bernini',
  'esprit',
  'smirnoff spin',
  'smirnoff storm',
  'smirnoff ice',
  'smirnoff',
  'red square',
  'klipdrift',
  'jagermeister',
  'jc le roux',
]

// ─── MUSIC BUS / EVENT-TYPE STRIP LIST ──────────────────────────────────────
//
// Variants drivers actually type for "music bus" deliveries. These get
// stripped because the form context already tells us it's a Music Bus thing.
const EVENT_TYPE_STRIP_LIST: string[] = [
  'music bus delivery',
  'music bus inspection',
  'musicbus delivery',
  'musicbus inspection',
  'music-bus delivery',
  'music-bus inspection',
  'music bus',
  'musicbus',
  'music-bus',
  'music buss', // common typo
  'musicbuss',
  'dj drivers',
  'dj driver',
  'djdrivers',
  'djdriver',
]

// ─── GENERIC / MEANINGLESS LEFTOVER WORDS ───────────────────────────────────
//
// If, after stripping brand + form-type, ALL that remains is one of these
// generic words, we fall back to the original input. Avoids "Corona Umbrellas"
// becoming just "Umbrellas" or "Black Label Load" becoming just "Load".
const GENERIC_LEFTOVERS = new Set<string>([
  'load',
  'loads',
  'delivery',
  'deliveries',
  'collection',
  'collections',
  'stock',
  'umbrella',
  'umbrellas',
  'gazebo',
  'gazebos',
  'banner',
  'banners',
  'flag',
  'flags',
  'box',
  'boxes',
  'crate',
  'crates',
  'order',
  'orders',
  'event',
  'events',
  'gear',
  'kit',
  'set',
  'setup',
  'set up',
])

// Words that should stay lowercase even when title-casing (English convention)
const LOWERCASE_WORDS = new Set<string>([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'of',
  'on', 'or', 'the', 'to', 'via', 'vs', 'with',
])

// ─── REGEX HELPERS ──────────────────────────────────────────────────────────

// STP outlet code: literal "stp" prefix (any case, optional punctuation) +
// 5 OR 6 digits. Captures the digits.
//
// Matches all of:
//   "Stp 490066", "STP 65180", "stp490066", "STP-49006",
//   "S.T.P 490066", "stp number 490066", "stp# 65180", "stp no. 490066"
//
// Bare 5/6-digit numbers WITHOUT an stp prefix are NOT matched — too risky
// (could be a contact number, postal code, vehicle reg, etc.)
const STP_REGEX = /\b(?:s\.?t\.?p\.?)(?:\s*(?:number|no\.?|#))?\s*[-:]?\s*(\d{5,6})\b/i

// Trim only dashes/separators from edges — NOT periods (we want to preserve
// trailing periods like "Foh liquor store." which are part of the venue name).
const DASHES_REGEX = /^[\s\-–—·:|,]+|[\s\-–—·:|,]+$/g
const MULTI_SPACE_REGEX = /\s{2,}/g

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Build brand-match regex — longer names first so "Castle Milk Stout" matches
// before "Castle". Word boundaries on both sides.
const BRAND_REGEX = new RegExp(
  '\\b(?:' +
    BRAND_STRIP_LIST
      .slice()
      .sort((a, b) => b.length - a.length)
      .map(escapeRegex)
      .join('|') +
    ')\\b',
  'gi'
)

const EVENT_TYPE_REGEX = new RegExp(
  '\\b(?:' +
    EVENT_TYPE_STRIP_LIST
      .slice()
      .sort((a, b) => b.length - a.length)
      .map(escapeRegex)
      .join('|') +
    ')\\b',
  'gi'
)

// ─── TITLE CASE ─────────────────────────────────────────────────────────────

/**
 * Lightly title-case a string. Capitalises the first letter of each word
 * unless:
 *   - The word is already ALL-CAPS (acronyms — keep them)
 *   - The word has internal capitals (iPhone, McDonald's — likely intentional)
 *   - The word is a small-word like "of", "the", "vs" (lowercase unless first)
 *   - The word starts with a digit (numbers stay as typed)
 *
 * Always capitalises the first word regardless of length.
 */
function lightTitleCase(s: string): string {
  const words = s.split(/(\s+)/) // keep whitespace as separators
  let nonSpaceIndex = 0
  return words
    .map((token) => {
      if (token.trim() === '') return token // pure whitespace, leave it
      const word = token
      const isFirstWord = nonSpaceIndex === 0
      nonSpaceIndex++

      if (word === '') return word
      // Preserve all-caps multi-letter words (acronyms: STP, URC, FNB, PIR, CEO)
      if (word === word.toUpperCase() && word.length > 1 && /[A-Z]/.test(word)) return word
      // Preserve mixed-case words (iPhone, McDonald's)
      if (/[A-Z]/.test(word.slice(1))) return word
      // Words starting with a digit — leave as typed
      if (/^\d/.test(word)) return word
      // Small lowercase words — except if first word
      const lc = word.toLowerCase()
      if (!isFirstWord && LOWERCASE_WORDS.has(lc)) return lc
      // Otherwise: capitalise first letter
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join('')
}

// ─── PUBLIC TYPES ───────────────────────────────────────────────────────────

export interface ParsedEventName {
  /** Cleaned event_name (brand + form-type stripped, title-cased). */
  event_name: string
  /** True if event_name was modified at all. */
  event_name_changed: boolean
  /** Brands found and stripped from event_name. */
  brands_stripped: string[]
  /** Event-type strings found and stripped from event_name. */
  event_types_stripped: string[]
  /** True if we fell back to raw because cleaning left nothing useful. */
  fell_back_to_raw: boolean
  /** Original input (untouched). */
  raw: string
}

export interface ParsedVenue {
  /** Cleaned venue name — keeps STP visible, just title-cased and trimmed. */
  venue: string
  /** True if venue was modified. */
  venue_changed: boolean
  /** STP outlet code if found (5-6 digits as a string). */
  stp_number: string | null
  /** Original input (untouched). */
  raw: string
}

// ─── PUBLIC API: parseEventName ─────────────────────────────────────────────

/**
 * Parse a free-text event_name into a cleaner version.
 *
 * @param raw  The driver-entered event name string (may be null/empty)
 *
 * Behaviour:
 *   - Strips known brand names (Castle Lite, Carling, Heineken, Savanna, etc.)
 *   - Strips music-bus / dj-drivers form-type noise
 *   - Trims whitespace and dangling separators
 *   - Title-cases the result
 *   - If stripping leaves an empty string OR only a generic leftover word,
 *     falls back to title-casing the raw input. We never wipe data.
 */
export function parseEventName(raw: string | null | undefined): ParsedEventName {
  const input = String(raw ?? '').trim()

  if (input === '') {
    return {
      event_name: '',
      event_name_changed: false,
      brands_stripped: [],
      event_types_stripped: [],
      fell_back_to_raw: false,
      raw: '',
    }
  }

  let working = input

  // 1. Strip brand names
  const brands_found: string[] = []
  working = working.replace(BRAND_REGEX, (m) => {
    brands_found.push(m.trim().toLowerCase())
    return ' '
  })

  // 2. Strip event-type noise
  const event_types_found: string[] = []
  working = working.replace(EVENT_TYPE_REGEX, (m) => {
    event_types_found.push(m.trim().toLowerCase())
    return ' '
  })

  // 3. Normalise whitespace and trim dangling junk
  let cleaned = working
    .replace(MULTI_SPACE_REGEX, ' ')
    .replace(DASHES_REGEX, '')
    .trim()

  // 4. Safety: if cleaning left nothing OR only a generic word, fall back
  let fellBack = false
  const cleanedLC = cleaned.toLowerCase()
  if (cleaned === '' || GENERIC_LEFTOVERS.has(cleanedLC) || cleaned.length < 3) {
    cleaned = input
    fellBack = true
  }

  // 5. Always normalise whitespace before title-casing (covers fallback case)
  cleaned = cleaned.replace(MULTI_SPACE_REGEX, ' ').trim()

  // 6. Title-case (works on either the cleaned result OR the fallback)
  const titled = lightTitleCase(cleaned)

  const brands_stripped = Array.from(new Set(brands_found))
  const event_types_stripped = Array.from(new Set(event_types_found))

  return {
    event_name: titled,
    event_name_changed: titled !== input,
    brands_stripped,
    event_types_stripped,
    fell_back_to_raw: fellBack,
    raw: input,
  }
}

// ─── PUBLIC API: parseVenue ─────────────────────────────────────────────────

/**
 * Parse a venue string. Extracts STP code (if present) but KEEPS it in the
 * visible venue text — we only title-case and trim. The STP is also returned
 * as a separate field for filtering/searching/reporting.
 *
 * @param raw  The driver-entered venue string (may be null/empty)
 *
 * Examples:
 *   "Mathathon Place Stp 490066"       → venue: "Mathathon Place STP 490066", stp: "490066"
 *   "Tsalanang sports tarven Stp 651805" → venue: "Tsalanang Sports Tarven STP 651805", stp: "651805"
 *   "Foh liquor store. Stp 430194"     → venue: "Foh Liquor Store. STP 430194", stp: "430194"
 *   "Loftus Versfeld – Castle Lager Beer Garden" → venue unchanged (no STP), stp: null
 */
export function parseVenue(raw: string | null | undefined): ParsedVenue {
  const input = String(raw ?? '').trim()

  if (input === '') {
    return {
      venue: '',
      venue_changed: false,
      stp_number: null,
      raw: '',
    }
  }

  // Extract STP code (do not remove from string, just capture)
  let stp_number: string | null = null
  const stpMatch = input.match(STP_REGEX)
  if (stpMatch) {
    stp_number = stpMatch[1]
  }

  // Normalise the STP prefix in the display: always render as "STP <digits>".
  // This way "stp 490066", "Stp-490066", "STP no. 490066" all render the same.
  let normalised = input
  if (stp_number) {
    normalised = normalised.replace(STP_REGEX, `STP ${stp_number}`)
  }

  // Collapse multi-space, title-case (which preserves "STP" as it's ALL-CAPS)
  normalised = normalised.replace(MULTI_SPACE_REGEX, ' ').trim()
  const titled = lightTitleCase(normalised)

  return {
    venue: titled,
    venue_changed: titled !== input,
    stp_number,
    raw: input,
  }
}

// ─── EXPORTED CONSTANTS (for tests / audit display) ─────────────────────────

export const STRIP_LISTS = {
  brands: BRAND_STRIP_LIST,
  event_types: EVENT_TYPE_STRIP_LIST,
  generic_leftovers: Array.from(GENERIC_LEFTOVERS),
}
