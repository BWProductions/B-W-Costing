-- Migration 0010: Lexicon Phase 1 — schema only
--
-- Drops six lexicon tables into D1 to hold the BW Events Lexicon v3 MASTER.
-- Phase 1 is PURE DATA PLUMBING — no matcher logic changes yet.
-- The fuzzy engine will read from these tables in subsequent phases.
--
-- Source: BW_Events_Lexicon_v3_MASTER.xlsx (14 May 2026)

-- ─── 1. Acronyms ──────────────────────────────────────────────────────────
-- e.g. MC → Master of Ceremonies, ECR → Eastern Cape Region (= KZN)
CREATE TABLE IF NOT EXISTS lexicon_acronyms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  acronym TEXT NOT NULL,
  expansion_en TEXT,
  expansion_af TEXT,
  category TEXT,
  cluster_id TEXT,
  sa_notes TEXT,
  source TEXT,
  status TEXT, -- Approved | BB-Confirmed | Draft
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_lex_acronyms_acronym ON lexicon_acronyms(LOWER(acronym));
CREATE INDEX IF NOT EXISTS idx_lex_acronyms_cluster ON lexicon_acronyms(cluster_id);

-- ─── 2. Synonym Groups (the core fuzzy rules) ─────────────────────────────
-- e.g. SG-101 Castle Lager ← "Castllle Lager; Castle; Castle Lger"
CREATE TABLE IF NOT EXISTS lexicon_synonym_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id TEXT UNIQUE NOT NULL, -- SG-001 etc
  preferred_term TEXT NOT NULL,
  synonyms TEXT, -- semicolon-separated raw text
  pos TEXT, -- part of speech
  domain TEXT,
  cluster_id TEXT,
  notes TEXT,
  status TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_lex_syn_preferred ON lexicon_synonym_groups(LOWER(preferred_term));
CREATE INDEX IF NOT EXISTS idx_lex_syn_cluster ON lexicon_synonym_groups(cluster_id);

-- ─── 3. Cluster Index (category boost source) ─────────────────────────────
CREATE TABLE IF NOT EXISTS lexicon_clusters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cluster_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  parent_cluster TEXT,
  owner TEXT,
  status TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── 4. Supplier Master (canonical supplier resolution) ───────────────────
-- e.g. C-Square ← "C Square | CSQUARE | C=SQUARE"
CREATE TABLE IF NOT EXISTS lexicon_suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  canonical TEXT NOT NULL,
  variants TEXT, -- pipe-separated raw spellings
  variant_count INTEGER DEFAULT 0,
  total_mentions INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_lex_suppliers_canonical ON lexicon_suppliers(LOWER(canonical));

-- ─── 5. Region Master (SA + ROA taxonomy) ─────────────────────────────────
-- e.g. Western Cape Region ← "CAPETOWN | Cape | WC | Western Cape"
CREATE TABLE IF NOT EXISTS lexicon_regions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  canonical TEXT NOT NULL,
  zone TEXT, -- SA Zone | ROA Zone | Corporate
  variants TEXT,
  variant_count INTEGER DEFAULT 0,
  total_mentions INTEGER DEFAULT 0,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_lex_regions_canonical ON lexicon_regions(LOWER(canonical));
CREATE INDEX IF NOT EXISTS idx_lex_regions_zone ON lexicon_regions(zone);

-- ─── 6. Brand Map (SAB / AB InBev brand resolution + ambiguity flags) ─────
CREATE TABLE IF NOT EXISTS lexicon_brand_map (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  found_in_data TEXT NOT NULL,
  resolves_to TEXT,
  ownership TEXT,
  action TEXT, -- ✅ Lock | ❓ Request specificity | ⚠️ DISAMBIGUATION | Merge with ...
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_lex_brand_found ON lexicon_brand_map(LOWER(found_in_data));

-- ─── 7. Config (LLM prompt, lexicon version) ──────────────────────────────
CREATE TABLE IF NOT EXISTS lexicon_config (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
