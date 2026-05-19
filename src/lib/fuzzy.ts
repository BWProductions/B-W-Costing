// ============================================================================
// FUZZY MATCHING ENGINE — Master Products
// ----------------------------------------------------------------------------
// Pluggable, modular. Bibi's additional rule chart will drop into this file
// without touching the rest of the codebase.
//
// Hook points (search for "HOOK:"):
//   1. NORMALISE_RULES          — synonym/abbreviation expansion
//   2. STOP_WORDS               — tokens to ignore when scoring
//   3. SCORING_WEIGHTS          — weights for the hybrid score
//   4. THRESHOLDS               — auto-merge / ask-user / new bands
//   5. CATEGORY_BOOST           — category match bonuses
// ============================================================================

export type MatchCandidate = {
  item_id: number
  name: string
  category?: string | null
  score: number
  reason: string
}

export type FuzzyResult = {
  raw: string
  normalised: string
  verdict: 'match' | 'possible_match' | 'new'
  candidates: MatchCandidate[]   // top 3, sorted desc
  suggested_action: 'merge_as_alias' | 'ask_user' | 'create_new'
}

// ─── HOOK 1: NORMALISE_RULES ────────────────────────────────────────────────
// Bibi's additional chart can extend this map.
// Format: regex (case-insensitive) → replacement
const NORMALISE_RULES: Array<{ pattern: RegExp; replace: string }> = [
  // common abbreviations
  { pattern: /\bbt\b/gi,    replace: 'bluetooth' },
  { pattern: /\bcctv\b/gi,  replace: 'closed-circuit television' },
  { pattern: /\btv\b/gi,    replace: 'television' },
  { pattern: /\bav\b/gi,    replace: 'audio visual' },
  { pattern: /\bdj\b/gi,    replace: 'disc jockey' },
  { pattern: /\bmc\b/gi,    replace: 'master of ceremonies' },
  { pattern: /\bled\b/gi,   replace: 'led' },
  { pattern: /\bpa\b/gi,    replace: 'public address' },
  { pattern: /\bjojo\b/gi,  replace: 'jojo' },
  { pattern: /\bcbl\b/gi,   replace: 'carling black label' },
  { pattern: /\bmxd\b/gi,   replace: 'mxd' },
  // unit normalisations
  { pattern: /\bpcs?\b/gi,  replace: '' },
  { pattern: /\bunits?\b/gi,replace: '' },
  { pattern: /\beach\b/gi,  replace: '' },
  // plural → singular (simple heuristics; extend with the chart)
  { pattern: /trophies/gi,   replace: 'trophy' },
  { pattern: /plinths/gi,    replace: 'plinth' },
  { pattern: /banners/gi,    replace: 'banner' },
  { pattern: /teardrops/gi,  replace: 'teardrop' },
  { pattern: /umbrellas/gi,  replace: 'umbrella' },
  { pattern: /gazebos/gi,    replace: 'gazebo' },
  { pattern: /tables/gi,     replace: 'table' },
  { pattern: /chairs/gi,     replace: 'chair' },
  { pattern: /benches/gi,    replace: 'bench' },
  { pattern: /speakers/gi,   replace: 'speaker' },
  { pattern: /lights/gi,     replace: 'light' },
  { pattern: /cables/gi,     replace: 'cable' },
  { pattern: /bins/gi,       replace: 'bin' },
  { pattern: /screens/gi,    replace: 'screen' },
  { pattern: /flags/gi,      replace: 'flag' },
  { pattern: /walls/gi,      replace: 'wall' },
  { pattern: /tents/gi,      replace: 'tent' },
  { pattern: /coolers/gi,    replace: 'cooler' },
  { pattern: /fridges/gi,    replace: 'fridge' },
  { pattern: /trolleys/gi,   replace: 'trolley' },
  { pattern: /barrels/gi,    replace: 'barrel' },
  { pattern: /trestles/gi,   replace: 'trestle' },
  { pattern: /heaters/gi,    replace: 'heater' },
  { pattern: /poles/gi,      replace: 'pole' },
  // strip "x2", "(2)", multipliers like "2x"
  { pattern: /\b\d+\s*x\b/gi,      replace: '' },
  { pattern: /\bx\s*\d+\b/gi,      replace: '' },
  { pattern: /\(\d+\)/g,           replace: '' },
]

// ─── HOOK 2: STOP_WORDS ─────────────────────────────────────────────────────
const STOP_WORDS = new Set([
  'a','an','the','and','or','of','for','to','with','set','sets','etc','new','old'
])

// ─── HOOK 3: SCORING_WEIGHTS ────────────────────────────────────────────────
// Hybrid score = (W_JARO * JaroWinkler) + (W_TOKEN * TokenSetRatio) + (W_PREFIX * SharedPrefix)
const SCORING_WEIGHTS = {
  jaroWinkler: 0.55,
  tokenSet:    0.35,
  prefix:      0.10,
}

// ─── HOOK 4: THRESHOLDS ─────────────────────────────────────────────────────
// Bibi confirmed: 0.85 / 0.65. Single source of truth for all routes.
export const THRESHOLDS = {
  autoMerge: 0.85,   // ≥ → "match", ask one-tap confirm
  ask:       0.65,   // ≥ → "possible_match", show candidates
  // anything below → "new"
}

// ─── HOOK 5: CATEGORY_BOOST ─────────────────────────────────────────────────
// If the new item's inferred category matches the candidate's, add a small bonus.
// (Inference not implemented yet; awaiting chart. Bonus = 0 for now.)
const CATEGORY_BOOST = 0.0

// ─── normalisation pipeline ─────────────────────────────────────────────────
export function normalise(s: string): string {
  let out = (s || '').toLowerCase().trim()
  out = out.replace(/[^\w\s\-]/g, ' ')   // strip punctuation
  out = out.replace(/\s+/g, ' ')
  // apply rules
  for (const r of NORMALISE_RULES) out = out.replace(r.pattern, r.replace)
  out = out.replace(/\s+/g, ' ').trim()
  return out
}

export function tokens(s: string): string[] {
  return normalise(s).split(/\s+/).filter(t => t && !STOP_WORDS.has(t))
}

// ─── Jaro-Winkler ───────────────────────────────────────────────────────────
function jaro(a: string, b: string): number {
  if (a === b) return 1
  if (!a.length || !b.length) return 0
  const matchWindow = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1)
  const aMatch = new Array(a.length).fill(false)
  const bMatch = new Array(b.length).fill(false)
  let matches = 0
  for (let i = 0; i < a.length; i++) {
    const lo = Math.max(0, i - matchWindow)
    const hi = Math.min(i + matchWindow + 1, b.length)
    for (let j = lo; j < hi; j++) {
      if (bMatch[j]) continue
      if (a[i] !== b[j]) continue
      aMatch[i] = true
      bMatch[j] = true
      matches++
      break
    }
  }
  if (!matches) return 0
  let transp = 0, k = 0
  for (let i = 0; i < a.length; i++) {
    if (!aMatch[i]) continue
    while (!bMatch[k]) k++
    if (a[i] !== b[k]) transp++
    k++
  }
  transp = transp / 2
  return (matches / a.length + matches / b.length + (matches - transp) / matches) / 3
}

export function jaroWinkler(a: string, b: string): number {
  const j = jaro(a, b)
  let prefix = 0
  for (let i = 0; i < Math.min(4, a.length, b.length); i++) {
    if (a[i] === b[i]) prefix++
    else break
  }
  return j + prefix * 0.1 * (1 - j)
}

// ─── Token-set ratio (handles word reordering + extra/missing words) ────────
export function tokenSetRatio(a: string, b: string): number {
  const ta = new Set(tokens(a))
  const tb = new Set(tokens(b))
  if (!ta.size || !tb.size) return 0
  const intersection = [...ta].filter(t => tb.has(t)).length
  const union = new Set([...ta, ...tb]).size
  return intersection / union  // Jaccard
}

// ─── Shared prefix bonus (short prefixes get downweighted) ──────────────────
export function sharedPrefixScore(a: string, b: string): number {
  const na = normalise(a), nb = normalise(b)
  let i = 0
  while (i < na.length && i < nb.length && na[i] === nb[i]) i++
  if (i < 3) return 0
  return Math.min(1, i / 10)
}

// ─── HYBRID SCORE ───────────────────────────────────────────────────────────
export function score(rawA: string, rawB: string, opts?: { categoryMatch?: boolean }): number {
  const a = normalise(rawA)
  const b = normalise(rawB)
  if (!a || !b) return 0
  if (a === b) return 1
  const j = jaroWinkler(a, b)
  const t = tokenSetRatio(rawA, rawB)
  const p = sharedPrefixScore(rawA, rawB)
  let s = (SCORING_WEIGHTS.jaroWinkler * j)
        + (SCORING_WEIGHTS.tokenSet * t)
        + (SCORING_WEIGHTS.prefix * p)
  if (opts?.categoryMatch) s = Math.min(1, s + CATEGORY_BOOST)
  return s
}

// ─── reason string for UI ──────────────────────────────────────────────────
function reasonFor(rawA: string, rawB: string, finalScore: number): string {
  const na = normalise(rawA), nb = normalise(rawB)
  if (na === nb) return 'exact match after normalisation'
  const j = jaroWinkler(na, nb)
  const t = tokenSetRatio(rawA, rawB)
  if (t >= 0.8) return 'most tokens match (Jaccard ' + t.toFixed(2) + ')'
  if (j >= 0.92) return 'spelling very close (JW ' + j.toFixed(2) + ')'
  if (j >= 0.85) return 'likely typo or variant (JW ' + j.toFixed(2) + ')'
  return 'partial similarity (combined ' + finalScore.toFixed(2) + ')'
}

// ─── PUBLIC: match against a master list ────────────────────────────────────
// items: full set of {id, name, aliases?: string[]}. Score against name + each alias,
// take the best per item, return top 3 sorted desc.
export function findMatches(
  raw: string,
  items: Array<{ id: number; name: string; category?: string | null; aliases?: string[] }>,
  limit = 3
): FuzzyResult {
  const norm = normalise(raw)
  const scored: MatchCandidate[] = []

  for (const it of items) {
    const names = [it.name, ...(it.aliases || [])]
    let best = 0
    let bestName = it.name
    for (const n of names) {
      const s = score(raw, n)
      if (s > best) { best = s; bestName = n }
    }
    scored.push({
      item_id: it.id,
      name: it.name,
      category: it.category,
      score: best,
      reason: reasonFor(raw, bestName, best),
    })
  }

  scored.sort((a, b) => b.score - a.score)
  const top = scored.slice(0, limit)
  const topScore = top[0]?.score || 0

  let verdict: FuzzyResult['verdict']
  let action: FuzzyResult['suggested_action']
  if (topScore >= THRESHOLDS.autoMerge) { verdict = 'match'; action = 'merge_as_alias' }
  else if (topScore >= THRESHOLDS.ask)  { verdict = 'possible_match'; action = 'ask_user' }
  else                                  { verdict = 'new'; action = 'create_new' }

  return { raw, normalised: norm, verdict, candidates: top, suggested_action: action }
}

// ─── PUBLIC: should we escalate to Claude? (border zone) ────────────────────
// Reserved for hybrid mode (Q2 = option b). True when top score is in 0.55–0.80
// — high-uncertainty zone where semantic understanding adds the most value.
export function shouldEscalateToLLM(topScore: number): boolean {
  return topScore >= 0.55 && topScore < 0.80
}

// ============================================================================
// LEXICON LOADER — Phase 1 (data plumbing only, no scoring changes yet)
// ----------------------------------------------------------------------------
// Loads the BW Events Lexicon v3 MASTER from D1 into memory for the lifetime
// of a single request. Phases 2-4 will start consuming this data; for now we
// just prove the pipe works.
// ============================================================================

export type LexiconAcronym = {
  acronym: string
  expansion_en: string | null
  category: string | null
  cluster_id: string | null
  status: string | null
}

export type LexiconSynonymGroup = {
  group_id: string
  preferred_term: string
  synonyms: string | null       // raw semicolon-separated
  synonym_list: string[]        // parsed lowercase
  domain: string | null
  cluster_id: string | null
  status: string | null
}

export type LexiconBrandEntry = {
  found_in_data: string
  resolves_to: string | null
  ownership: string | null
  action: string | null
}

export type LexiconRegion = {
  canonical: string
  zone: string | null
  variant_list: string[]        // parsed lowercase
}

export type LexiconSupplier = {
  canonical: string
  variant_list: string[]
}

export type Lexicon = {
  version: string
  ai_prompt: string
  acronyms: LexiconAcronym[]
  synonym_groups: LexiconSynonymGroup[]
  brand_map: LexiconBrandEntry[]
  regions: LexiconRegion[]
  suppliers: LexiconSupplier[]
  // Quick lookups
  acronymByKey: Map<string, LexiconAcronym>
  synonymByVariant: Map<string, LexiconSynonymGroup>
  brandByVariant: Map<string, LexiconBrandEntry>
  loaded_at: number
}

// Module-scope cache. Cleared at Worker cold start. Lifetime ~minutes on warm
// instances. Safe because lexicon updates trigger a deploy.
let _cache: Lexicon | null = null
let _cacheStamp = 0
const CACHE_TTL_MS = 5 * 60 * 1000  // 5 min

function splitVariants(raw: string | null | undefined, sep: RegExp): string[] {
  if (!raw) return []
  return String(raw)
    .split(sep)
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
}

export async function loadLexicon(db: D1Database, opts?: { force?: boolean }): Promise<Lexicon> {
  if (!opts?.force && _cache && (Date.now() - _cacheStamp) < CACHE_TTL_MS) {
    return _cache
  }

  const [acronyms, synonyms, brandMap, regions, suppliers, config] = await Promise.all([
    db.prepare('SELECT acronym, expansion_en, category, cluster_id, status FROM lexicon_acronyms').all<any>(),
    db.prepare('SELECT group_id, preferred_term, synonyms, domain, cluster_id, status FROM lexicon_synonym_groups').all<any>(),
    db.prepare('SELECT found_in_data, resolves_to, ownership, action FROM lexicon_brand_map').all<any>(),
    db.prepare('SELECT canonical, zone, variants FROM lexicon_regions').all<any>(),
    db.prepare('SELECT canonical, variants FROM lexicon_suppliers').all<any>(),
    db.prepare('SELECT key, value FROM lexicon_config').all<any>(),
  ])

  const configMap = new Map<string, string>()
  for (const r of (config.results || [])) configMap.set(r.key, r.value || '')

  const synonym_groups: LexiconSynonymGroup[] = (synonyms.results || []).map((r: any) => ({
    group_id: r.group_id,
    preferred_term: r.preferred_term,
    synonyms: r.synonyms,
    synonym_list: splitVariants(r.synonyms, /;/),
    domain: r.domain,
    cluster_id: r.cluster_id,
    status: r.status,
  }))

  const regionsList: LexiconRegion[] = (regions.results || []).map((r: any) => ({
    canonical: r.canonical,
    zone: r.zone,
    variant_list: splitVariants(r.variants, /\|/),
  }))

  const suppliersList: LexiconSupplier[] = (suppliers.results || []).map((r: any) => ({
    canonical: r.canonical,
    variant_list: splitVariants(r.variants, /\|/),
  }))

  const brandList: LexiconBrandEntry[] = (brandMap.results || []).map((r: any) => ({
    found_in_data: r.found_in_data,
    resolves_to: r.resolves_to,
    ownership: r.ownership,
    action: r.action,
  }))

  const acronymsList: LexiconAcronym[] = (acronyms.results || []).map((r: any) => ({
    acronym: r.acronym,
    expansion_en: r.expansion_en,
    category: r.category,
    cluster_id: r.cluster_id,
    status: r.status,
  }))

  // Quick lookups (lowercased keys)
  const acronymByKey = new Map<string, LexiconAcronym>()
  for (const a of acronymsList) acronymByKey.set(a.acronym.toLowerCase(), a)

  const synonymByVariant = new Map<string, LexiconSynonymGroup>()
  for (const g of synonym_groups) {
    synonymByVariant.set(g.preferred_term.toLowerCase(), g)
    for (const v of g.synonym_list) synonymByVariant.set(v, g)
  }

  const brandByVariant = new Map<string, LexiconBrandEntry>()
  for (const b of brandList) {
    // Strip ALL parenthetical/bracketed annotations and trailing 'sic' markers.
    // Handles "CASTLE LAGER (52)", "MXD (14 TRACK, 9 quote)",
    // "KILIMANJARO (stock 'Kilomanjaro' sic)", etc.
    let key = b.found_in_data
      .replace(/\s*\([^)]*\)\s*/g, ' ')   // remove all (...) groups
      .replace(/\s*\[[^\]]*\]\s*/g, ' ')  // remove all [...] groups
      .replace(/\s+sic\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
    if (key) brandByVariant.set(key, b)
    // Also index against the resolves_to canonical so "castle lager" finds the entry
    // even if the raw row was "CASTLE LAGER (52)".
    if (b.resolves_to) {
      const canon = b.resolves_to.split(/[—,(]/)[0].trim().toLowerCase()
      if (canon && !brandByVariant.has(canon)) brandByVariant.set(canon, b)
    }
  }

  _cache = {
    version: configMap.get('lexicon_version') || 'unknown',
    ai_prompt: configMap.get('ai_fuzzy_prompt') || '',
    acronyms: acronymsList,
    synonym_groups,
    brand_map: brandList,
    regions: regionsList,
    suppliers: suppliersList,
    acronymByKey,
    synonymByVariant,
    brandByVariant,
    loaded_at: Date.now(),
  }
  _cacheStamp = Date.now()
  return _cache
}

// ============================================================================
// PHASE 2 — LEXICON-AWARE MATCHING
// ----------------------------------------------------------------------------
// Layers added on top of the base scorer:
//   (a) Typo auto-correct from synonym groups (Castllle → Castle)
//   (b) Acronym expansion (MC → master of ceremonies)
//   (c) Synonym-aware tokenisation (token "stella" == token "artois" if in same SG)
//   (d) Cluster boost (+5% when both candidates share a cluster_id)
//   (e) BB-Confirmed override (forces auto-merge regardless of score)
//   (f) Brand-ambiguity flag (e.g. MXD → require human disambiguation)
// ============================================================================

// Token aliases — token X maps to its canonical token (used for synonym-aware Jaccard).
type AliasMap = Map<string, string>

function buildAliasMap(lex: Lexicon): AliasMap {
  const m: AliasMap = new Map()
  // Synonym groups: every synonym → preferred term's first token
  for (const g of lex.synonym_groups) {
    const canonTokens = g.preferred_term.toLowerCase().split(/\s+/).filter(Boolean)
    if (!canonTokens.length) continue
    // Map every word of every variant → group_id (used as a canonical identity).
    // We use group_id as a stable canonical token so phrases collapse cleanly.
    const canonKey = g.group_id.toLowerCase()
    m.set(g.preferred_term.toLowerCase(), canonKey)
    for (const v of g.synonym_list) m.set(v, canonKey)
    for (const ct of canonTokens) m.set(ct, canonKey)
  }
  // Acronyms: short form AND its expansion both map to the acronym key
  for (const a of lex.acronyms) {
    const key = 'ACR:' + a.acronym.toLowerCase()
    m.set(a.acronym.toLowerCase(), key)
    if (a.expansion_en) {
      const expLower = a.expansion_en.toLowerCase()
      m.set(expLower, key)
      // Also map first token of expansion if it's a single distinctive word
      const firstTok = expLower.split(/\s+/)[0]
      if (firstTok && firstTok.length > 3) m.set(firstTok, key)
    }
  }
  return m
}

// Build a regex-based typo corrector from synonym variants.
// e.g. "Castllle" → "Castle Lager", "Furninture" → "Furniture", "Sponosred" → "Sponsored".
type CorrectorRule = { pattern: RegExp; replace: string; source: string }
function buildCorrector(lex: Lexicon): CorrectorRule[] {
  const rules: CorrectorRule[] = []
  for (const g of lex.synonym_groups) {
    for (const variant of g.synonym_list) {
      if (!variant || variant === g.preferred_term.toLowerCase()) continue
      // Skip variants that contain the canonical term verbatim (would be a no-op)
      if (variant.includes(g.preferred_term.toLowerCase())) continue
      const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      rules.push({
        pattern: new RegExp('\\b' + escaped + '\\b', 'gi'),
        replace: g.preferred_term,
        source: g.group_id,
      })
    }
  }
  return rules
}

// Lexicon-aware normalise — applies typo correction BEFORE the standard pipeline.
export function normaliseWithLexicon(s: string, lex: Lexicon | null, corrector?: CorrectorRule[]): string {
  let out = (s || '').toLowerCase().trim()
  if (corrector && corrector.length) {
    for (const r of corrector) out = out.replace(r.pattern, r.replace.toLowerCase())
  }
  out = out.replace(/[^\w\s\-]/g, ' ')
  out = out.replace(/\s+/g, ' ')
  for (const r of NORMALISE_RULES) out = out.replace(r.pattern, r.replace)
  out = out.replace(/\s+/g, ' ').trim()
  return out
}

// Lexicon-aware tokens with alias collapse — tokens that belong to the same
// synonym group / acronym share the same canonical token.
export function tokensWithLexicon(s: string, lex: Lexicon | null, corrector?: CorrectorRule[], aliases?: AliasMap): string[] {
  const norm = lex ? normaliseWithLexicon(s, lex, corrector) : normalise(s)
  const raw = norm.split(/\s+/).filter(t => t && !STOP_WORDS.has(t))
  if (!aliases) return raw
  return raw.map(t => aliases.get(t) || t)
}

// Lexicon-aware Jaccard.
function tokenSetRatioWithLexicon(a: string, b: string, lex: Lexicon, corrector: CorrectorRule[], aliases: AliasMap): number {
  const ta = new Set(tokensWithLexicon(a, lex, corrector, aliases))
  const tb = new Set(tokensWithLexicon(b, lex, corrector, aliases))
  if (!ta.size || !tb.size) return 0
  const intersection = [...ta].filter(t => tb.has(t)).length
  const union = new Set([...ta, ...tb]).size
  return intersection / union
}

// Full lexicon-aware score with optional cluster boost + BB-Confirmed override.
export function scoreWithLexicon(
  rawA: string,
  rawB: string,
  ctx: { lex: Lexicon; corrector: CorrectorRule[]; aliases: AliasMap },
  opts?: { clusterMatch?: boolean; bbConfirmed?: boolean }
): number {
  // BB-Confirmed override — if the candidate has a BB-Confirmed synonym group
  // that contains the input as a variant, treat as exact match.
  if (opts?.bbConfirmed) return 1
  const a = normaliseWithLexicon(rawA, ctx.lex, ctx.corrector)
  const b = normaliseWithLexicon(rawB, ctx.lex, ctx.corrector)
  if (!a || !b) return 0
  if (a === b) return 1
  const j = jaroWinkler(a, b)
  const t = tokenSetRatioWithLexicon(rawA, rawB, ctx.lex, ctx.corrector, ctx.aliases)
  const p = sharedPrefixScore(a, b)
  let s = (SCORING_WEIGHTS.jaroWinkler * j)
        + (SCORING_WEIGHTS.tokenSet * t)
        + (SCORING_WEIGHTS.prefix * p)
  if (opts?.clusterMatch) s = Math.min(1, s + 0.05)
  return s
}

// Test whether the raw input is a BB-Confirmed variant of the candidate name.
// Returns the matching synonym group, or null.
function bbConfirmedHit(rawInput: string, candidateName: string, lex: Lexicon): LexiconSynonymGroup | null {
  const inputLower = rawInput.toLowerCase().trim()
  const candLower = candidateName.toLowerCase().trim()
  // Direct synonym membership: input is a known variant AND candidate is the preferred term
  const ig = lex.synonymByVariant.get(inputLower)
  if (ig && ig.status === 'BB-Confirmed') {
    if (candLower === ig.preferred_term.toLowerCase()) return ig
    if (ig.synonym_list.includes(candLower)) return ig
  }
  // Reverse — candidate is a known variant and input matches preferred term
  const cg = lex.synonymByVariant.get(candLower)
  if (cg && cg.status === 'BB-Confirmed') {
    if (inputLower === cg.preferred_term.toLowerCase()) return cg
    if (cg.synonym_list.includes(inputLower)) return cg
  }
  return null
}

// Detect ambiguity flags from the brand map (e.g. MXD, SHARP, CASTLE-alone).
export function detectAmbiguity(rawInput: string, lex: Lexicon): LexiconBrandEntry | null {
  const key = rawInput.toLowerCase().trim()
  const hit = lex.brandByVariant.get(key)
  if (!hit) return null
  const action = (hit.action || '').toLowerCase()
  if (action.includes('disambiguation') || action.includes('request specificity') || action.includes('reclassify')) {
    return hit
  }
  return null
}

// Lookup: does the raw input (post-normalise) match any synonym variant?
// Returns the matching synonym group + the corrected term it resolves to.
export function lookupSynonymHint(rawInput: string, lex: Lexicon): { group: LexiconSynonymGroup; corrected: string } | null {
  const key = rawInput.toLowerCase().trim()
  if (!key) return null
  // Direct variant hit
  const direct = lex.synonymByVariant.get(key)
  if (direct) return { group: direct, corrected: direct.preferred_term }
  // After typo correction
  const corrector = buildCorrector(lex)
  let corrected = key
  for (const r of corrector) corrected = corrected.replace(r.pattern, r.replace.toLowerCase())
  if (corrected !== key) {
    const hit = lex.synonymByVariant.get(corrected.trim())
    if (hit) return { group: hit, corrected: hit.preferred_term }
  }
  return null
}

// ─── PUBLIC: lexicon-aware findMatches ──────────────────────────────────────
// Drop-in replacement for findMatches() that uses the BW Events Lexicon.
// Returns same shape + extra fields: matched_group, bb_confirmed, ambiguity, lexicon_hint.
export type LexiconFuzzyResult = FuzzyResult & {
  matched_group?: string | null   // e.g. "SG-101"
  bb_confirmed?: boolean
  ambiguity?: LexiconBrandEntry | null
  lexicon_version?: string
  // Surfaced even when no catalogue row is a strong match — tells the user
  // "the lexicon recognised this term but it's not in your master list yet".
  lexicon_hint?: {
    group_id: string
    preferred_term: string
    status: string | null
    corrected_from?: string  // if a typo was auto-corrected
    domain: string | null
  } | null
}

export async function findMatchesWithLexicon(
  db: D1Database,
  raw: string,
  items: Array<{ id: number; name: string; category?: string | null; aliases?: string[]; cluster_id?: string | null }>,
  limit = 3
): Promise<LexiconFuzzyResult> {
  const lex = await loadLexicon(db)
  const corrector = buildCorrector(lex)
  const aliases = buildAliasMap(lex)
  const ctx = { lex, corrector, aliases }

  const norm = normaliseWithLexicon(raw, lex, corrector)
  const ambiguity = detectAmbiguity(raw, lex)
  // Surface a lexicon hint even when no catalogue row matches strongly.
  const hintInfo = lookupSynonymHint(raw, lex)
  const lexicon_hint = hintInfo ? {
    group_id: hintInfo.group.group_id,
    preferred_term: hintInfo.group.preferred_term,
    status: hintInfo.group.status,
    corrected_from: hintInfo.corrected.toLowerCase() !== raw.toLowerCase().trim() ? raw : undefined,
    domain: hintInfo.group.domain,
  } : null
  const scored: MatchCandidate[] = []
  let bbHit: LexiconSynonymGroup | null = null
  let bbItemId: number | null = null

  for (const it of items) {
    const names = [it.name, ...(it.aliases || [])]
    let best = 0
    let bestName = it.name
    let confirmed = false

    for (const n of names) {
      const bb = bbConfirmedHit(raw, n, lex)
      if (bb) {
        confirmed = true
        bestName = n
        best = 1
        if (!bbHit) { bbHit = bb; bbItemId = it.id }
        break
      }
      const s = scoreWithLexicon(raw, n, ctx)
      if (s > best) { best = s; bestName = n }
    }

    const reason = confirmed
      ? `BB-Confirmed synonym (${bbHit?.group_id || 'lexicon'})`
      : reasonFor(raw, bestName, best)

    scored.push({
      item_id: it.id,
      name: it.name,
      category: it.category,
      score: best,
      reason,
    })
  }

  scored.sort((a, b) => b.score - a.score)
  const top = scored.slice(0, limit)
  const topScore = top[0]?.score || 0

  let verdict: FuzzyResult['verdict']
  let action: FuzzyResult['suggested_action']

  // Ambiguity flag forces 'possible_match' so the UI asks the user.
  if (ambiguity) {
    verdict = 'possible_match'
    action = 'ask_user'
  } else if (bbHit) {
    verdict = 'match'
    action = 'merge_as_alias'
  } else if (topScore >= THRESHOLDS.autoMerge) {
    verdict = 'match'
    action = 'merge_as_alias'
  } else if (topScore >= THRESHOLDS.ask) {
    verdict = 'possible_match'
    action = 'ask_user'
  } else {
    verdict = 'new'
    action = 'create_new'
  }

  return {
    raw,
    normalised: norm,
    verdict,
    candidates: top,
    suggested_action: action,
    matched_group: bbHit?.group_id || null,
    bb_confirmed: !!bbHit,
    ambiguity: ambiguity || null,
    lexicon_version: lex.version,
    lexicon_hint,
  }
}

// Diagnostic helper — returns a compact health snapshot for the admin page.
export async function lexiconHealth(db: D1Database) {
  const lex = await loadLexicon(db, { force: true })
  return {
    version: lex.version,
    counts: {
      acronyms: lex.acronyms.length,
      synonym_groups: lex.synonym_groups.length,
      brand_map: lex.brand_map.length,
      regions: lex.regions.length,
      suppliers: lex.suppliers.length,
    },
    ai_prompt_length: lex.ai_prompt.length,
    cache_age_ms: Date.now() - lex.loaded_at,
    sample: {
      synonym: lex.synonym_groups.find(g => g.group_id === 'SG-101') || null,
      acronym: lex.acronymByKey.get('ecr') || null,
      brand: lex.brandByVariant.get('castle lager') || null,
      region: lex.regions.find(r => r.canonical.startsWith('Western Cape')) || null,
    },
    bb_confirmed_count: {
      acronyms: lex.acronyms.filter(a => a.status === 'BB-Confirmed').length,
      synonyms: lex.synonym_groups.filter(s => s.status === 'BB-Confirmed').length,
    }
  }
}
