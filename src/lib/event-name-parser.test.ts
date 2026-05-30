// Tests for event-name-parser.ts
//
// Run with: npx tsx src/lib/event-name-parser.test.ts
//
// No test framework dependency — uses plain assertions so it runs anywhere
// without a Jest/Vitest install. Print PASS/FAIL summary at the end.

import { parseEventName, parseVenue } from './event-name-parser.js'

interface TestCase {
  name: string
  input: string | null | undefined
  expect: {
    event_name?: string
    venue?: string
    stp_number?: string | null
    fell_back_to_raw?: boolean
    brands_stripped?: string[]
    event_types_stripped?: string[]
    venue_changed?: boolean
  }
}

let passed = 0
let failed = 0
const failures: string[] = []

function assertEq(name: string, got: any, expected: any) {
  // Deep equality for arrays
  if (Array.isArray(expected) && Array.isArray(got)) {
    if (JSON.stringify(got.slice().sort()) === JSON.stringify(expected.slice().sort())) {
      passed++
      return true
    }
  } else if (got === expected) {
    passed++
    return true
  }
  failed++
  failures.push(`  ✗ ${name}\n    expected: ${JSON.stringify(expected)}\n    got:      ${JSON.stringify(got)}`)
  return false
}

// ═══════════════════════════════════════════════════════════════════════════
// EVENT NAME TESTS
// ═══════════════════════════════════════════════════════════════════════════

console.log('▶ parseEventName tests\n')

const eventNameCases: TestCase[] = [
  // ─── REAL PRODUCTION DATA ─────────────────────────────────────────────────
  {
    name: 'DN26-0162: "Castle light music bus " (trailing space)',
    input: 'Castle light music bus ',
    expect: {
      event_name: 'Castle Light Music Bus',
      fell_back_to_raw: true,
      brands_stripped: ['castle light'],
      event_types_stripped: ['music bus'],
    },
  },
  {
    name: 'DN26-0158: "Castle light  Music bus" (double space, mixed case)',
    input: 'Castle light  Music bus',
    expect: {
      event_name: 'Castle Light Music Bus',
      fell_back_to_raw: true,
    },
  },
  {
    name: 'DN26-0147: "Castle Lager Bafana Bafana Fan Send Off"',
    input: 'Castle Lager Bafana Bafana Fan Send Off',
    expect: {
      event_name: 'Bafana Bafana Fan Send Off',
      fell_back_to_raw: false,
      brands_stripped: ['castle lager'],
    },
  },
  {
    name: 'DN26-0152: "Corona Umbrellas" — safety fallback (generic leftover)',
    input: 'Corona Umbrellas',
    expect: {
      event_name: 'Corona Umbrellas',
      fell_back_to_raw: true,
      brands_stripped: ['corona'],
    },
  },
  {
    name: 'DN26-0105: "Black Label Load" — safety fallback (generic leftover)',
    input: 'Black Label Load',
    expect: {
      event_name: 'Black Label Load',
      fell_back_to_raw: true,
      brands_stripped: ['black label'],
    },
  },
  {
    name: 'DN26-0148: "URC quarter final" — just title-case (acronym preserved)',
    input: 'URC quarter final ',
    expect: {
      event_name: 'URC Quarter Final',
      fell_back_to_raw: false,
      brands_stripped: [],
    },
  },
  {
    name: 'DN26-0086: "Kaiser Chiefs vs Orlando Pirates" — vs stays lowercase',
    input: 'Kaiser Chiefs vs Orlando Pirates',
    expect: {
      event_name: 'Kaiser Chiefs vs Orlando Pirates',
      fell_back_to_raw: false,
    },
  },
  {
    name: 'DN26-0078: "FNB Test for Rugby" — for stays lowercase, FNB acronym',
    input: 'FNB Test for Rugby',
    expect: {
      event_name: 'FNB Test for Rugby',
      fell_back_to_raw: false,
    },
  },
  {
    name: 'DN26-0135: "Golf day" — simple title-case',
    input: 'Golf day',
    expect: {
      event_name: 'Golf Day',
      fell_back_to_raw: false,
    },
  },
  {
    name: 'DN26-0036: "LEKOMPO BALCONY MIX 9" — all-caps preserved',
    input: 'LEKOMPO BALCONY MIX 9',
    expect: {
      event_name: 'LEKOMPO BALCONY MIX 9',
      fell_back_to_raw: false,
    },
  },
  {
    name: 'DN26-0068: "May 8 PIR - Eastern Province George" — number, acronym, dash',
    input: 'May 8 PIR - Eastern Province George',
    expect: {
      event_name: 'May 8 PIR - Eastern Province George',
      fell_back_to_raw: false,
    },
  },

  // ─── EDGE CASES ───────────────────────────────────────────────────────────
  { name: 'Empty string', input: '', expect: { event_name: '', fell_back_to_raw: false } },
  { name: 'Null input', input: null, expect: { event_name: '' } },
  { name: 'Undefined input', input: undefined, expect: { event_name: '' } },
  { name: 'Pure whitespace', input: '   ', expect: { event_name: '' } },
  { name: 'Only a brand name (would empty)', input: 'Castle Lite', expect: { event_name: 'Castle Lite', fell_back_to_raw: true } },
  { name: 'Only "music bus" (would empty)', input: 'music bus', expect: { event_name: 'Music Bus', fell_back_to_raw: true } },
  { name: 'Brand + music bus (would empty)', input: 'Heineken music bus', expect: { event_name: 'Heineken Music Bus', fell_back_to_raw: true } },
  { name: 'Mid-word brand-like substring NOT stripped', input: 'Castletown Mall', expect: { event_name: 'Castletown Mall' } },
  { name: 'Brand-in-the-middle', input: 'Soweto Carling fest', expect: { event_name: 'Soweto Fest', brands_stripped: ['carling'] } },
  { name: 'Multiple brands, generic leftover triggers fallback', input: 'Castle Lite Carling event', expect: { event_name: 'Castle Lite Carling Event', fell_back_to_raw: true } },
  { name: 'Brand with leading "The"', input: 'The Black Label Brewery', expect: { event_name: 'The Brewery', brands_stripped: ['black label'] } },
  { name: 'Title-case: small words mid-sentence', input: 'The king of the road', expect: { event_name: 'The King of the Road' } },
  { name: 'Already perfectly clean', input: 'Mathathon Place', expect: { event_name: 'Mathathon Place', fell_back_to_raw: false, brands_stripped: [] } },

  // ─── REGRESSION GUARDS ────────────────────────────────────────────────────
  { name: "Apostrophe brand IS stripped (Hunter's is a cider brand)", input: "Hunter's bar quiz", expect: { event_name: 'Bar Quiz', brands_stripped: ["hunter's"] } },
  { name: 'Numbers preserved', input: 'PIR 13', expect: { event_name: 'PIR 13' } },
  { name: 'Punctuation preserved', input: 'Foh liquor store.', expect: { event_name: 'Foh Liquor Store.' } },
  { name: 'Em-dash separator', input: 'Castle Lite — Big Event', expect: { event_name: 'Big Event', brands_stripped: ['castle lite'] } },
]

for (const tc of eventNameCases) {
  const result = parseEventName(tc.input)
  const e = tc.expect
  let allPass = true
  if (e.event_name !== undefined)
    allPass = assertEq(`${tc.name} → event_name`, result.event_name, e.event_name) && allPass
  if (e.fell_back_to_raw !== undefined)
    allPass = assertEq(`${tc.name} → fell_back_to_raw`, result.fell_back_to_raw, e.fell_back_to_raw) && allPass
  if (e.brands_stripped !== undefined)
    allPass = assertEq(`${tc.name} → brands_stripped`, result.brands_stripped, e.brands_stripped) && allPass
  if (e.event_types_stripped !== undefined)
    allPass = assertEq(`${tc.name} → event_types_stripped`, result.event_types_stripped, e.event_types_stripped) && allPass
}

// ═══════════════════════════════════════════════════════════════════════════
// VENUE / STP TESTS
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n▶ parseVenue tests\n')

const venueCases: TestCase[] = [
  // ─── REAL PRODUCTION DATA ─────────────────────────────────────────────────
  {
    name: 'DN26-0162: "Mathathon Place Stp 490066"',
    input: 'Mathathon Place Stp 490066',
    expect: {
      venue: 'Mathathon Place STP 490066',
      stp_number: '490066',
    },
  },
  {
    name: 'DN26-0158: "Tsalanang sports tarven Stp 651805"',
    input: 'Tsalanang sports tarven Stp 651805',
    expect: {
      venue: 'Tsalanang Sports Tarven STP 651805',
      stp_number: '651805',
    },
  },
  {
    name: 'DN26-0157: "Foh liquor store. Stp 430194"',
    input: 'Foh liquor store. Stp 430194',
    expect: {
      venue: 'Foh Liquor Store. STP 430194',
      stp_number: '430194',
    },
  },
  {
    name: 'DN26-0148: "Loftus Versfeld – Castle Lager Beer Garden" (no STP)',
    input: 'Loftus Versfeld – Castle Lager Beer Garden / Braai Area',
    expect: {
      venue: 'Loftus Versfeld – Castle Lager Beer Garden / Braai Area',
      stp_number: null,
    },
  },
  {
    name: 'Plain venue (no STP)',
    input: 'Montecasino',
    expect: { venue: 'Montecasino', stp_number: null },
  },

  // ─── STP FORMAT VARIATIONS ────────────────────────────────────────────────
  { name: 'STP 5 digits',              input: 'Bob\'s Bar STP 12345',         expect: { stp_number: '12345', venue: "Bob's Bar STP 12345" } },
  { name: 'STP 6 digits',              input: "Bob's Bar STP 123456",         expect: { stp_number: '123456', venue: "Bob's Bar STP 123456" } },
  { name: 'STP lowercase',             input: "Bob's Bar stp 12345",          expect: { stp_number: '12345', venue: "Bob's Bar STP 12345" } },
  { name: 'STP mixed case',            input: "Bob's Bar Stp 12345",          expect: { stp_number: '12345', venue: "Bob's Bar STP 12345" } },
  { name: 'STP no space',              input: "Bob's Bar STP12345",           expect: { stp_number: '12345', venue: "Bob's Bar STP 12345" } },
  { name: 'STP with dash',             input: "Bob's Bar STP-12345",          expect: { stp_number: '12345', venue: "Bob's Bar STP 12345" } },
  { name: 'STP with hash',             input: "Bob's Bar STP# 12345",         expect: { stp_number: '12345', venue: "Bob's Bar STP 12345" } },
  { name: 'STP with "number"',         input: "Bob's Bar STP number 12345",   expect: { stp_number: '12345', venue: "Bob's Bar STP 12345" } },
  { name: 'STP with "no."',            input: "Bob's Bar STP no. 12345",      expect: { stp_number: '12345', venue: "Bob's Bar STP 12345" } },
  { name: 'S.T.P. with dots',          input: "Bob's Bar S.T.P. 12345",       expect: { stp_number: '12345', venue: "Bob's Bar STP 12345" } },

  // ─── EDGE CASES ───────────────────────────────────────────────────────────
  { name: 'Bare 6-digit number — NOT an STP', input: 'Phone 0821234567', expect: { stp_number: null } },
  { name: 'STP-like 4 digits — too short, NOT matched', input: "Bob's Bar STP 1234", expect: { stp_number: null } },
  { name: 'STP-like 7 digits — too long, NOT matched', input: "Bob's Bar STP 1234567", expect: { stp_number: null } },
  { name: 'Empty string', input: '', expect: { venue: '', stp_number: null } },
  { name: 'Null', input: null, expect: { venue: '', stp_number: null } },
  { name: 'Trailing space', input: 'Montecasino ', expect: { venue: 'Montecasino' } },
  { name: 'STP at very end', input: 'Place STP 654321', expect: { stp_number: '654321', venue: 'Place STP 654321' } },
  { name: 'STP at very start', input: 'STP 654321 Place', expect: { stp_number: '654321', venue: 'STP 654321 Place' } },
  { name: 'Mid-word STP-like NOT matched', input: 'Pitstop Bar', expect: { stp_number: null } },
]

for (const tc of venueCases) {
  const result = parseVenue(tc.input)
  const e = tc.expect
  if (e.venue !== undefined)
    assertEq(`${tc.name} → venue`, result.venue, e.venue)
  if (e.stp_number !== undefined)
    assertEq(`${tc.name} → stp_number`, result.stp_number, e.stp_number)
}

// ═══════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(70))
if (failed === 0) {
  console.log(`✅ ALL ${passed} ASSERTIONS PASSED`)
} else {
  console.log(`❌ ${failed} FAILED / ${passed} PASSED\n`)
  console.log('Failures:')
  failures.forEach((f) => console.log(f))
  process.exit(1)
}
