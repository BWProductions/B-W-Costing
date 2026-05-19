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
-- Acronyms
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('AB InBev', 'Anheuser-Busch InBev SA/NV', 'Anheuser-Busch InBev SA/NV', 'Company', 'CL-105', 'World''s largest brewer (Leuven, Belgium). Owns SAB since Oct 2016. Listed Euronext (ABI), NYSE (BUD), JSE (ANH).', 'Wikipedia + ab-inbev.com', 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('ATL', 'Above-The-Line (marketing)', 'Bo-lyn', 'Marketing', 'CL-030', 'TV, radio, print, digital mass media. SAB ATL led by Vaughan Croeser''s marketing team.', 'Industry', 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('AV', 'Audio Visual', 'Oudio-visueel', 'Production', 'CL-003', 'Sound, lighting, screens', NULL, 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('B-BBEE', 'Broad-Based Black Economic Empowerment', 'Breë-Gebaseerde Swart Ekonomiese Bemagtiging', 'Compliance', 'CL-012', 'Supplier scorecard relevance', NULL, 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('BOH', 'Back of House', 'Agter-die-skerms', 'Operations', 'CL-005', 'Crew/staff-only areas', NULL, 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('BTL', 'Below-The-Line (marketing)', 'Onderlyn', 'Marketing', 'CL-030', 'Activations, sampling, on-trade promo. As opposed to ATL (Above-The-Line / mass media).', 'Industry', 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('CDM', 'Cervejas de Moçambique', 'Cervejas de Moçambique', 'Company', 'CL-106', 'AB InBev Mozambique subsidiary. Acquired by SAB 1995. Brews 2M (Mac-Mahon brand) and Laurentina.', 'Research', 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('CRM', 'Customer Relationship Management', NULL, 'Marketing', 'CL-030', 'Activation lead capture feeds CRM systems. POPIA consent essential.', 'Industry', 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('CY', 'Calendar Year', 'Kalenderjaar', 'Finance', 'CL-015', 'SAB uses CY (Jan-Dec) for reporting. CY26 = 2026.', 'Cost workbooks', 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('DG', 'Diesel Generator', 'Diesel-kragopwekker', 'Logistics', 'CL-005', 'Standard at outdoor activations. kVA sizing critical for power load planning.', 'Industry', 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('DJ', 'Disc Jockey', 'Disc Jockey', 'Talent', 'CL-020', NULL, NULL, 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('EHS', 'Environmental Health & Safety', 'Omgewing, Gesondheid & Veiligheid', 'Compliance', 'CL-010', 'Aligns with SA OHS Act 85 of 1993', NULL, 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('ETA', 'Estimated Time of Arrival', 'Geskatte Aankomstyd', 'Logistics', 'CL-005', 'Critical for truck logistics, talent transfers, VIP arrivals.', 'Industry', 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('F&B', 'Food & Beverage', 'Voedsel & Drank', 'Vendor Category', 'CL-006', 'Catering + bar combined scope.', 'Industry', 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('FAB', 'Flavoured Alcoholic Beverage', NULL, 'Beverage Category', 'CL-108', 'Industry term covering Brutal Fruit Spritzer, Flying Fish, Redd''s, Smirnoff RTDs. Regulated separately from clear beer.', 'Competition Tribunal SAB/Diageo ruling 2019', 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('FOH', 'Front of House', 'Voor-die-skerms', 'Operations', 'CL-005', 'Public-facing event areas', NULL, 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('FY', 'Financial Year / Fiscal Year', 'Boekjaar', 'Finance', 'CL-015', 'AB InBev FY ends Dec. SARS FY-end varies by entity (typically Feb for SA).', 'Industry', 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('GA', 'General Admission (ticketing tier)', 'Algemene Toelating', 'Guest Tiers', 'CL-004', 'Counterpoint to VIP, VVIP, hospitality, backstage.', 'Industry', 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('JOC', 'Joint Operations Committee', 'Gesamentlike Operasie-komitee', 'SA Compliance', 'CL-013', 'Mandatory for events >2000 attendees per SOERA. Chaired by venue + SAPS + medical + safety officers.', 'SOERA Act 2 of 2010', 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('KPI', 'Key Performance Indicator', 'Sleutelprestasie-aanwyser', 'Operations', 'CL-005', 'SAB Standard Response ''MISSED SAVINGS PER BUCKET PER MONTH'' is a KPI, not a verdict.', 'Industry + Cost workbooks', 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('LED Wall', 'Light-Emitting Diode video wall', 'LED-muur', 'AV', 'CL-003', 'Common in stage productions. Pitch typically 3.9mm / 5.9mm. Hire rates on Tab 13 (Itemised Averages).', 'Industry', 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('MC', 'Master of Ceremonies', 'Seremoniemeester', 'Event Roles', 'CL-002', 'Common at SA corporate & social events', NULL, 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('MOU', 'Memorandum of Understanding', 'Memorandum van Begrip', 'Legal', 'CL-115', 'Non-binding heads of agreement. Common for sponsorship pre-contract.', 'Industry', 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('MSA', 'Master Services Agreement', 'Hoofdienste-ooreenkoms', 'Legal', 'CL-115', 'Umbrella contract; individual SOWs (Statements of Work) reference it. SAB likely has MSAs with B&W, Neal Street, C-Square.', 'Industry', 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('NDA', 'Non-Disclosure Agreement', 'Nie-Openbaarmakings-ooreenkoms', 'Legal', 'CL-115', 'Standard for SAB / AB InBev contractor engagements. Mutual + perpetual for brand info.', 'Industry', 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('NPS', 'Net Promoter Score', 'Net Promoteur-telling', 'Marketing', 'CL-030', 'Post-event delegate survey metric.', 'Industry', 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('OB-Van', 'Outside Broadcast Van', NULL, 'Production', 'CL-003', 'For live event broadcasts. Connects to AB InBev brand activations with TV coverage.', 'Industry', 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('OEM', 'Original Equipment Manufacturer', NULL, 'Logistics', 'CL-005', 'Relevant for branded asset sourcing (e.g. Frigoglass for SAB coolers).', 'Industry', 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('OOH', 'Out-Of-Home (advertising)', 'Buite-die-huis', 'Marketing', 'CL-030', 'Billboards, branded venues, taxi liveries. Tracks separately from activation.', 'Industry', 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('P&L', 'Profit & Loss (statement)', 'Wins & Verlies', 'Finance', 'CL-015', 'Per-event P&L common in B&W reporting.', 'Industry', 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('PA', 'Public Address', 'Openbare Omroep', 'Production', 'CL-003', 'Speaker / sound system', NULL, 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('PO', 'Purchase Order', 'Aankoopbestelling', 'Procurement', 'CL-040', 'SAB issues PO numbers post-quote-approval. Common reference: ''PO 12345''.', 'Industry', 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('POPIA', 'Protection of Personal Information Act', 'Wet op die Beskerming van Persoonlike Inligting', 'Compliance', 'CL-011', 'SA data protection law', NULL, 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('POS', 'Point of Sale', 'Punt van Verkoop', 'Bar / F&B', 'CL-006', 'Activation bar tills, mobile card readers, Yoco/iKhokha.', 'Industry', 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('RFID', 'Radio Frequency Identification', 'Radiofrekwensie-identifikasie', 'Access Control', 'CL-007', 'Modern festival wristband tech. Used at MXD activations.', 'Industry', 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('ROI', 'Return On Investment', 'Opbrengs op Belegging', 'Finance', 'CL-015', 'Activation success metric. SAB measures consumer reach, brand uplift, sales.', 'Industry', 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('RSVP', 'Répondez s''il vous plaît / Please respond', 'Antwoord asseblief', 'Event Logistics', 'CL-001', 'Standard SA invite shorthand', NULL, 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('RTD', 'Ready-To-Drink', 'Gereed-Om-Te-Drink', 'Beverage Category', 'CL-108', 'RTD includes Smirnoff Storm/Spin/Guarana/Pine Twist/Berry Twist (Diageo-licensed to SAB 2019), Black Crown G&T, Perfectly MXD.', 'Competition Tribunal', 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('SAB', 'South African Breweries (Pty) Ltd', 'Suid-Afrikaanse Brouerye', 'Company', 'CL-105', 'Founded 1895. SA''s #1 brewer. ~87% market share. Subsidiary of AB InBev since 2016.', 'sab.co.za + research', 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('SABS', 'South African Bureau of Standards', 'Suid-Afrikaanse Buro vir Standaarde', 'Compliance', 'CL-014', 'Equipment & safety standards', NULL, 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('SAPS', 'South African Police Service', 'Suid-Afrikaanse Polisiediens', 'Compliance', 'CL-013', 'Large public event permits', NULL, 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('SARS', 'South African Revenue Service', 'Suid-Afrikaanse Inkomstediens', 'Finance', 'CL-015', 'Tax/VAT on ticketing', NULL, 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('SOW', 'Statement of Work / Scope of Work', 'Werksomvang', 'Procurement', 'CL-040', 'Event-specific scope under an MSA. Lists deliverables, dates, rates, pax.', 'Industry', 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('TBL', 'Tanzania Breweries Limited', 'Tanzania Brouerye Beperk', 'Company', 'CL-106', 'AB InBev Tanzania subsidiary. Founded 1933. Listed DSE. Brews Safari, Kilimanjaro, Castle Lite, Balimi, Eagle.', 'tanzaniabreweries.co.tz', 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('TTL', 'Through-The-Line (marketing)', 'Deur-die-lyn', 'Marketing', 'CL-030', 'Integrated ATL + BTL campaign. Common SAB activation framing.', 'Industry', 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('VAT', 'Value Added Tax', 'Belasting op Toegevoegde Waarde', 'Finance', 'CL-015', '15% standard rate in SA', NULL, 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('VIP', 'Very Important Person', 'Baie Belangrike Persoon', 'Guest Tiers', 'CL-004', 'Premium ticketing & seating', NULL, 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('VOC', 'Voice Of Customer / Verbal Order of Cancellation', NULL, 'Disambiguation', 'CL-031', 'Marketing: customer feedback. Procurement: rare informal cancellation. Avoid the second usage — always issue written.', 'Industry', 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('VVIP', 'Very Very Important Person', 'Baie Baie Belangrike Persoon', 'Guest Tiers', 'CL-004', 'Above VIP. Typically <50 pax at a corporate event.', 'Industry', 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('WIP', 'Work In Progress', 'Werk in Uitvoering', 'Operations', 'CL-005', 'Common status flag in pipeline tracking.', 'Industry', 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('YTD', 'Year-To-Date', 'Jaar-Tot-Op-Datum', 'Finance', 'CL-015', 'Used in Cost Consulting YTD24, YTD25 workbook naming.', 'Cost workbooks', 'Approved');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('BCS', 'Branded Cooler System / Branded Cooler Box', NULL, 'SAB Asset', 'CL-114', 'SAB-owned cooler fridges. Frigoglass is a major supplier. ''BRAND OWNED ASSET'' verdict on cost workbook applies.', 'Cost workbooks + Frigoglass supplier', 'BB-Confirmed');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('ECR', 'Eastern Cape Region (= East Coast Region = KZN)', 'Oos-Kaap Streek', 'SAB Geographic Region', 'CL-103', 'BB-confirmed: ECR / East Coast Region / KZN are interchangeable names for the same region in SAB taxonomy.', 'BB chat 14 May 2026', 'BB-Confirmed');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('EE', 'Experiential Event Activation', NULL, 'SAB Output Type', 'CL-101', 'SAB Cost-Consulting Output Type. Confirmed by BB May 2026. Used alongside ''Sponsored Event'' and ''Owned Event''.', 'BB chat 14 May 2026', 'BB-Confirmed');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('MXD', '(a) Perfectly MXD — SAB RTD brand; (b) MXD Productions — BB''s event company', NULL, 'Disambiguation', 'CL-109', 'Two distinct entities. Context-sensitive: in SAB/brand docs = beverage brand. In BB''s internal docs = event production business.', 'Research + BB context', 'BB-Confirmed');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('Pax', 'Passengers / People (headcount)', 'Mense / Hoofgetal', 'Operations', 'CL-004', 'Translates to ''headcount'' per BB''s terminology preference. ''500 pax event'' = 500-headcount event.', 'Industry + BB style guide', 'BB-Confirmed');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('ROA', 'Rest Of Africa', 'Res van Afrika', 'SAB Geographic Zone', 'CL-104', 'Second AB InBev zone after SA Zone. Covers 9+ sub-regions: Botswana, Zambia, Ghana, Tanzania, Eswatini, Lesotho, Mozambique, Nigeria, Uganda.', 'Cost workbooks + BB chat', 'BB-Confirmed');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('SAB Sharp', 'Responsible Drinking Platform (NOT a beer brand)', 'Verantwoordelike Drink-Platform', 'Corporate Programme', 'CL-110', 'Launched July 2024. SAB''s responsibility manifesto / ''Be Sharp Charter''. Stock-take sheet ''Sharp - insyncIdelivered all'' = campaign collateral, NOT a beer SKU.', 'sab.co.za/sharp/charter', 'BB-Confirmed');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('SLA', 'Service Level Agreement', 'Diensvlakooreenkoms', 'Procurement', 'CL-107', '''SAB SLA Rate'' = agreed rate framework between supplier and SAB. Violation triggers ''OUT OF AGREED SAB SLA RATE'' verdict.', 'Cost workbooks', 'BB-Confirmed');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('Site Production', 'Site Production (runs the whole event site)', 'Terreinproduksie', 'SAB Cost Bucket', 'CL-111', 'Distinct from Stage Production. Manages entire event venue/footprint. 208 mentions.', 'BB chat 14 May 2026', 'BB-Confirmed');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('Stage Production', 'Stage Production (runs the stage only)', 'Verhoogproduksie', 'SAB Cost Bucket', 'CL-111', 'DIFFERENT from Site Production. BB-confirmed: ''one runs the stage, and one runs the whole site''. 217 mentions.', 'BB chat 14 May 2026', 'BB-Confirmed');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('ZHQ', 'Zonal HQ (Zone Headquarters)', NULL, 'SAB Corporate', 'CL-102', 'SAB corporate office — NOT a geographic region. 421 mentions in TRACK SHEET. BB-confirmed.', 'BB chat 14 May 2026', 'BB-Confirmed');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('CESO', 'Unknown — BB mentioned', NULL, 'Unknown', 'CL-113', 'BB mentioned in passing 14 May 2026: ''I don''t know what CESO is either.'' Origin unclear.', 'BB chat', 'Draft');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('CONO', 'Unknown — hypothesis: Certificate of Non-Objection', NULL, 'SA Compliance (unconfirmed)', 'CL-113', 'Term in original lexicon TOC. BB unsure. Not found in quotes or cost workbooks.', 'Unknown', 'Draft');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('Castle Scope', 'Sponsored-by-SAB-Brewery framework (per BB)', NULL, 'SAB Programme', 'CL-112', 'BB partial answer: ''Castle Scope just means it''s sponsored by SAB brewery, something like a...'' (answer cut off). Full definition pending.', 'BB chat 14 May 2026 (partial)', 'Draft');
INSERT INTO lexicon_acronyms (acronym, expansion_en, expansion_af, category, cluster_id, sa_notes, source, status) VALUES ('SOSA', 'Unknown — hypothesis: Sound Operators of South Africa', NULL, 'Industry Body (unconfirmed)', 'CL-113', 'BB unsure. Not in mined data.', 'Unknown', 'Draft');

-- Synonym Groups
INSERT INTO lexicon_synonym_groups (group_id, preferred_term, synonyms, pos, domain, cluster_id, notes, status) VALUES ('SG-001', 'Venue', 'location; site; space; hall', 'noun', 'Logistics', 'CL-001', 'Use ''venue'' as canonical', 'Approved');
INSERT INTO lexicon_synonym_groups (group_id, preferred_term, synonyms, pos, domain, cluster_id, notes, status) VALUES ('SG-002', 'Delegate', 'attendee; guest; participant', 'noun', 'Audience', 'CL-004', 'Conference vs social context', 'Approved');
INSERT INTO lexicon_synonym_groups (group_id, preferred_term, synonyms, pos, domain, cluster_id, notes, status) VALUES ('SG-003', 'Programme', 'program; agenda; run sheet; schedule', 'noun', 'Production', 'CL-003', 'SA spelling: ''programme''', 'Approved');
INSERT INTO lexicon_synonym_groups (group_id, preferred_term, synonyms, pos, domain, cluster_id, notes, status) VALUES ('SG-004', 'Caterer', 'food vendor; F&B supplier; catering company', 'noun', 'Vendors', 'CL-006', NULL, 'Approved');
INSERT INTO lexicon_synonym_groups (group_id, preferred_term, synonyms, pos, domain, cluster_id, notes, status) VALUES ('SG-005', 'Briefing', 'run-through; rehearsal walk-through; pre-event briefing', 'noun', 'Operations', 'CL-005', NULL, 'Approved');
INSERT INTO lexicon_synonym_groups (group_id, preferred_term, synonyms, pos, domain, cluster_id, notes, status) VALUES ('SG-006', 'Speaker', 'presenter; panelist; keynote', 'noun', 'Talent', 'CL-020', 'Distinguish keynote vs panel', 'Approved');
INSERT INTO lexicon_synonym_groups (group_id, preferred_term, synonyms, pos, domain, cluster_id, notes, status) VALUES ('SG-007', 'Brand activation', 'activation; experiential; brand experience', 'noun', 'Marketing', 'CL-030', NULL, 'Approved');
INSERT INTO lexicon_synonym_groups (group_id, preferred_term, synonyms, pos, domain, cluster_id, notes, status) VALUES ('SG-008', 'Sponsor', 'partner; backer; underwriter', 'noun', 'Commercial', 'CL-031', '''Partner'' is softer tier', 'Approved');
INSERT INTO lexicon_synonym_groups (group_id, preferred_term, synonyms, pos, domain, cluster_id, notes, status) VALUES ('SG-009', 'Lanyard', 'badge holder; accreditation pass', 'noun', 'Access', 'CL-007', NULL, 'Approved');
INSERT INTO lexicon_synonym_groups (group_id, preferred_term, synonyms, pos, domain, cluster_id, notes, status) VALUES ('SG-010', 'Load-in', 'bump-in; setup; install', 'noun', 'Production', 'CL-003', 'SA industry uses ''bump-in''', 'Approved');
INSERT INTO lexicon_synonym_groups (group_id, preferred_term, synonyms, pos, domain, cluster_id, notes, status) VALUES ('SG-011', 'Load-out', 'bump-out; strike; pack-down', 'noun', 'Production', 'CL-003', NULL, 'Approved');
INSERT INTO lexicon_synonym_groups (group_id, preferred_term, synonyms, pos, domain, cluster_id, notes, status) VALUES ('SG-012', 'Run sheet', 'cue sheet; show flow; minute-by-minute', 'noun', 'Production', 'CL-003', NULL, 'Approved');
INSERT INTO lexicon_synonym_groups (group_id, preferred_term, synonyms, pos, domain, cluster_id, notes, status) VALUES ('SG-013', 'Per head', 'per person; per pax; per cover', 'phrase', 'Finance', 'CL-015', 'Catering pricing', 'Approved');
INSERT INTO lexicon_synonym_groups (group_id, preferred_term, synonyms, pos, domain, cluster_id, notes, status) VALUES ('SG-014', 'Quotation', 'quote; estimate; proposal', 'noun', 'Finance', 'CL-015', NULL, 'Approved');
INSERT INTO lexicon_synonym_groups (group_id, preferred_term, synonyms, pos, domain, cluster_id, notes, status) VALUES ('SG-015', 'Tender', 'RFP; bid; proposal request', 'noun', 'Procurement', 'CL-040', 'SA public sector context', 'Approved');
INSERT INTO lexicon_synonym_groups (group_id, preferred_term, synonyms, pos, domain, cluster_id, notes, status) VALUES ('SG-110', 'Delivery & Collection', 'Delivery and Collection; Del & Coll; Delievery and Collection', 'noun phrase', 'Logistics', 'CL-006', 'Most frequent line item across all quotes (273 mentions). Two style variants: ''&'' vs ''and''.', 'Approved');
INSERT INTO lexicon_synonym_groups (group_id, preferred_term, synonyms, pos, domain, cluster_id, notes, status) VALUES ('SG-112', 'Per Diem', 'Per Dieam; Per Dieams; Per-Diem', 'noun (Latin)', 'Crew', 'CL-005', 'Per Dieams = recurring 21-mention typo. Latin ''per day'' for crew daily allowance.', 'Approved');
INSERT INTO lexicon_synonym_groups (group_id, preferred_term, synonyms, pos, domain, cluster_id, notes, status) VALUES ('SG-115', 'Furniture', 'Furninture; Furnishings; Furn.', 'noun', 'Decor', 'CL-006', 'Furninture = recurring 12-mention typo.', 'Approved');
INSERT INTO lexicon_synonym_groups (group_id, preferred_term, synonyms, pos, domain, cluster_id, notes, status) VALUES ('SG-116', 'Kilimanjaro', 'Kilomanjaro; Kilimanjaro Lager', 'noun (proper)', 'SAB Brand (TBL)', 'CL-114', 'Stock-take ''Kilomanjaro'' = typo. TBL Tanzania flagship.', 'Approved');
INSERT INTO lexicon_synonym_groups (group_id, preferred_term, synonyms, pos, domain, cluster_id, notes, status) VALUES ('SG-117', '2M / Mac-Mahon', '2M; Mac-Mahon; Mac Mahon; Mac-Mahon 2M; MacMahon', 'noun (proper)', 'SAB Brand (CDM)', 'CL-114', 'Mac-Mahon = the Mozambican brewery (built 1965); 2M = the beer. Same product.', 'Approved');
INSERT INTO lexicon_synonym_groups (group_id, preferred_term, synonyms, pos, domain, cluster_id, notes, status) VALUES ('SG-100', 'Stella Artois', 'Stella Artios; Stella; Artios; Artois', 'noun (proper)', 'SAB Brand', 'CL-114', 'BB-confirmed all variants are typos of same brand. 87 + 46 = 133 mentions consolidated.', 'BB-Confirmed');
INSERT INTO lexicon_synonym_groups (group_id, preferred_term, synonyms, pos, domain, cluster_id, notes, status) VALUES ('SG-101', 'Castle Lager', 'Castllle Lager; Castle; Castle Lger', 'noun (proper)', 'SAB Brand', 'CL-114', 'BB-confirmed Castllle = Castle Lager. 51 + 18 = 69 mentions.', 'BB-Confirmed');
INSERT INTO lexicon_synonym_groups (group_id, preferred_term, synonyms, pos, domain, cluster_id, notes, status) VALUES ('SG-102', 'Marc Pietersen', 'Marc Petersen; Marc Pederson; M. Pietersen', 'noun (proper, person)', 'SAB Personnel', 'CL-116', 'BB-confirmed all variants = same person. 29 + 15 = 44 mentions. Final spelling pending.', 'BB-Confirmed');
INSERT INTO lexicon_synonym_groups (group_id, preferred_term, synonyms, pos, domain, cluster_id, notes, status) VALUES ('SG-103', 'Sponsored Event', 'Sponosred Event; Sponosored Event', 'noun (Output Type)', 'SAB Cost Consulting', 'CL-117', 'BB-confirmed typo. SAB Output Type alongside ''Owned Event'' and ''EE Activation''. 141 mentions.', 'BB-Confirmed');
INSERT INTO lexicon_synonym_groups (group_id, preferred_term, synonyms, pos, domain, cluster_id, notes, status) VALUES ('SG-111', '@ Venue', '@Venu; @ Venu; @ The Venue; At Venue', 'phrase', 'Logistics', 'CL-001', '@Venu (114 mentions, truncated) appears more often than full @ Venue. Invoice template truncation bug.', 'BB-Confirmed');
INSERT INTO lexicon_synonym_groups (group_id, preferred_term, synonyms, pos, domain, cluster_id, notes, status) VALUES ('SG-113', 'Truck Logistics 4t–6t', '4t to 6t Truck Logistics; 4 ton truck; 4-6 ton truck', 'noun phrase', 'Logistics', 'CL-006', 'Mid-size truck category. KEEP SEPARATE from 7t–10t (different SKU). Fuzzy guard added.', 'BB-Confirmed');
INSERT INTO lexicon_synonym_groups (group_id, preferred_term, synonyms, pos, domain, cluster_id, notes, status) VALUES ('SG-114', 'Truck Logistics 7t–10t', '7t to 10t Truck Logistics; 7-10 ton truck', 'noun phrase', 'Logistics', 'CL-006', 'Heavy truck category. KEEP SEPARATE from 4t–6t. Different rate card line.', 'BB-Confirmed');
INSERT INTO lexicon_synonym_groups (group_id, preferred_term, synonyms, pos, domain, cluster_id, notes, status) VALUES ('SG-120', 'Load-in', 'Setup; Bump-in; Install; Load In', 'noun / verb', 'Production', 'CL-003', 'BB style guide: translate ''setup'' → ''load-in''. Industry term in SA = bump-in.', 'BB-Confirmed');
INSERT INTO lexicon_synonym_groups (group_id, preferred_term, synonyms, pos, domain, cluster_id, notes, status) VALUES ('SG-121', 'Load-out', 'Strike; Bump-out; Pack-down; Load Out; De-rig', 'noun / verb', 'Production', 'CL-003', 'BB style guide: ''strike'' = load-out.', 'BB-Confirmed');
INSERT INTO lexicon_synonym_groups (group_id, preferred_term, synonyms, pos, domain, cluster_id, notes, status) VALUES ('SG-122', 'Headcount', 'Pax; Pp; People; Cover; PPL', 'noun', 'Operations', 'CL-004', 'BB style guide: translate ''pax'' → ''headcount''.', 'BB-Confirmed');
INSERT INTO lexicon_synonym_groups (group_id, preferred_term, synonyms, pos, domain, cluster_id, notes, status) VALUES ('SG-123', 'Site', 'Venue; Location; Hall; Space', 'noun', 'Logistics', 'CL-001', 'BB style guide: ''venue'' → ''site''. NOTE: Perplexity SG-001 has Venue as preferred. Lexicon has both — see BB''s preference column.', 'BB-Confirmed');
INSERT INTO lexicon_synonym_groups (group_id, preferred_term, synonyms, pos, domain, cluster_id, notes, status) VALUES ('SG-124', 'Labour', 'Crew; Staff; Manpower; Workforce', 'noun', 'Production', 'CL-005', 'BB style guide: ''crew'' → ''labour''. Also a SAB cost bucket name (LABOUR).', 'BB-Confirmed');
INSERT INTO lexicon_synonym_groups (group_id, preferred_term, synonyms, pos, domain, cluster_id, notes, status) VALUES ('SG-125', 'Structure', 'Marquee; Tent; Bedouin; Pavillion', 'noun', 'Production', 'CL-003', 'BB style guide: ''marquee'' → ''structure''.', 'BB-Confirmed');
INSERT INTO lexicon_synonym_groups (group_id, preferred_term, synonyms, pos, domain, cluster_id, notes, status) VALUES ('SG-130', 'Multiple Brands', 'Multiple Brans; Multi-brand; Cross-brand', 'noun phrase (tag)', 'SAB Cost Consulting', 'CL-117', 'SAB tag for cross-brand events. 79 → 52 mentions after typo merge.', 'BB-Confirmed');
INSERT INTO lexicon_synonym_groups (group_id, preferred_term, synonyms, pos, domain, cluster_id, notes, status) VALUES ('SG-131', 'Owned Event', 'SAB Owned; Brand Owned Event; Brand-Owned', 'noun (Output Type)', 'SAB Cost Consulting', 'CL-117', 'SAB internally-produced event. Opposite of Sponsored Event.', 'BB-Confirmed');
INSERT INTO lexicon_synonym_groups (group_id, preferred_term, synonyms, pos, domain, cluster_id, notes, status) VALUES ('SG-132', 'Brand Owned Asset', 'Brand Asset; Client Asset; SAB Asset', 'noun phrase', 'SAB Cost Consulting', 'CL-114', 'SAB Standard Response: ''BRAND OWNED ASSET'' = item belongs to client, cannot be billed.', 'BB-Confirmed');

-- Cluster Index
INSERT INTO lexicon_clusters (cluster_id, name, description, parent_cluster, owner, status) VALUES ('CL-001', 'Event Logistics', 'Venue, scheduling, invitations, RSVPs', NULL, NULL, 'Approved');
INSERT INTO lexicon_clusters (cluster_id, name, description, parent_cluster, owner, status) VALUES ('CL-002', 'Event Roles', 'On-event human roles (MC, host, ushers)', NULL, NULL, 'Approved');
INSERT INTO lexicon_clusters (cluster_id, name, description, parent_cluster, owner, status) VALUES ('CL-003', 'Production', 'AV, staging, lighting, run sheets', NULL, NULL, 'Approved');
INSERT INTO lexicon_clusters (cluster_id, name, description, parent_cluster, owner, status) VALUES ('CL-004', 'Guest Tiers', 'VIP, general, delegate categories', 'CL-001', NULL, 'Approved');
INSERT INTO lexicon_clusters (cluster_id, name, description, parent_cluster, owner, status) VALUES ('CL-005', 'Operations', 'BOH/FOH, build, briefing, safety ops', NULL, NULL, 'Approved');
INSERT INTO lexicon_clusters (cluster_id, name, description, parent_cluster, owner, status) VALUES ('CL-006', 'Vendors', 'Caterers, decor, rentals, suppliers', NULL, NULL, 'Approved');
INSERT INTO lexicon_clusters (cluster_id, name, description, parent_cluster, owner, status) VALUES ('CL-007', 'Access Control', 'Accreditation, lanyards, ticketing scans', NULL, NULL, 'Approved');
INSERT INTO lexicon_clusters (cluster_id, name, description, parent_cluster, owner, status) VALUES ('CL-010', 'Health & Safety', 'EHS, OHS Act, medical, risk', NULL, NULL, 'Approved');
INSERT INTO lexicon_clusters (cluster_id, name, description, parent_cluster, owner, status) VALUES ('CL-011', 'Data Protection', 'POPIA, consent, data handling', NULL, NULL, 'Approved');
INSERT INTO lexicon_clusters (cluster_id, name, description, parent_cluster, owner, status) VALUES ('CL-012', 'Empowerment', 'B-BBEE, transformation', NULL, NULL, 'Approved');
INSERT INTO lexicon_clusters (cluster_id, name, description, parent_cluster, owner, status) VALUES ('CL-013', 'Public Safety', 'SAPS, SOERA, liquor, noise', 'CL-010', NULL, 'Approved');
INSERT INTO lexicon_clusters (cluster_id, name, description, parent_cluster, owner, status) VALUES ('CL-014', 'Standards', 'SABS, equipment certification', NULL, NULL, 'Approved');
INSERT INTO lexicon_clusters (cluster_id, name, description, parent_cluster, owner, status) VALUES ('CL-015', 'Finance & Tax', 'SARS, VAT, quotations, invoicing', NULL, NULL, 'Approved');
INSERT INTO lexicon_clusters (cluster_id, name, description, parent_cluster, owner, status) VALUES ('CL-020', 'Talent & Rights', 'Speakers, DJs, music licensing', NULL, NULL, 'Approved');
INSERT INTO lexicon_clusters (cluster_id, name, description, parent_cluster, owner, status) VALUES ('CL-030', 'Marketing', 'Brand activation, experiential', NULL, NULL, 'Approved');
INSERT INTO lexicon_clusters (cluster_id, name, description, parent_cluster, owner, status) VALUES ('CL-031', 'Commercial', 'Sponsors, partners, ticketing T&Cs', NULL, NULL, 'Approved');
INSERT INTO lexicon_clusters (cluster_id, name, description, parent_cluster, owner, status) VALUES ('CL-040', 'Procurement', 'Tender, RFP, supplier onboarding', NULL, NULL, 'Approved');
INSERT INTO lexicon_clusters (cluster_id, name, description, parent_cluster, owner, status) VALUES ('CL-050', 'Aerial / Media', 'Drones, photography, broadcast', NULL, NULL, 'Approved');
INSERT INTO lexicon_clusters (cluster_id, name, description, parent_cluster, owner, status) VALUES ('CL-100', 'SAB Output Types', 'Event categorisation per SAB Cost Consulting (EE Activation, Sponsored, Owned)', NULL, 'SAB Cost Consulting', 'BB-Confirmed');
INSERT INTO lexicon_clusters (cluster_id, name, description, parent_cluster, owner, status) VALUES ('CL-101', 'EE Activation cluster', 'Experiential Event Activations — primary SAB activation type', 'CL-100', 'SAB Marketing', 'BB-Confirmed');
INSERT INTO lexicon_clusters (cluster_id, name, description, parent_cluster, owner, status) VALUES ('CL-102', 'SAB Corporate Structure', 'ZHQ (Zonal HQ), corporate offices, head-office functions', NULL, 'SAB Corporate', 'BB-Confirmed');
INSERT INTO lexicon_clusters (cluster_id, name, description, parent_cluster, owner, status) VALUES ('CL-103', 'SAB Geographic Regions (SA)', 'Inland / Western Cape / Eastern Cape (ECR=KZN) / Central / Gauteng / etc.', NULL, 'SAB Sales', 'BB-Confirmed');
INSERT INTO lexicon_clusters (cluster_id, name, description, parent_cluster, owner, status) VALUES ('CL-104', 'ROA — Rest Of Africa', 'AB InBev Africa zone 2: Botswana, Zambia, Ghana, Tanzania, Eswatini, Lesotho, Mozambique, Nigeria, Uganda', NULL, 'AB InBev Africa', 'BB-Confirmed');
INSERT INTO lexicon_clusters (cluster_id, name, description, parent_cluster, owner, status) VALUES ('CL-105', 'AB InBev / SAB Companies', 'Parent + SA subsidiary corporate identities', NULL, 'Corporate', 'Approved');
INSERT INTO lexicon_clusters (cluster_id, name, description, parent_cluster, owner, status) VALUES ('CL-106', 'AB InBev Africa Subsidiaries', 'TBL Tanzania, CDM Mozambique, NBL Uganda, IB Nigeria, ABL Ghana', 'CL-105', 'AB InBev Africa', 'Approved');
INSERT INTO lexicon_clusters (cluster_id, name, description, parent_cluster, owner, status) VALUES ('CL-107', 'Service Level Agreements', 'SAB SLA rates, framework agreements, MSAs', 'CL-040', 'Procurement', 'BB-Confirmed');
INSERT INTO lexicon_clusters (cluster_id, name, description, parent_cluster, owner, status) VALUES ('CL-108', 'FAB / RTD Category', 'Flavoured Alcoholic Beverages and Ready-To-Drinks', NULL, 'SAB Marketing', 'Approved');
INSERT INTO lexicon_clusters (cluster_id, name, description, parent_cluster, owner, status) VALUES ('CL-109', 'MXD Disambiguation', 'Perfectly MXD (SAB RTD brand) vs MXD Productions (BB event company)', NULL, 'B&W', 'BB-Confirmed');
INSERT INTO lexicon_clusters (cluster_id, name, description, parent_cluster, owner, status) VALUES ('CL-110', 'SAB Sharp Corporate Platform', 'Responsible-drinking platform launched July 2024. NOT a beer brand.', NULL, 'SAB Corporate Affairs', 'BB-Confirmed');
INSERT INTO lexicon_clusters (cluster_id, name, description, parent_cluster, owner, status) VALUES ('CL-111', 'Stage vs Site Production', 'Stage = the stage only. Site = the whole event site. DIFFERENT cost buckets.', 'CL-003', 'B&W Operations', 'BB-Confirmed');
INSERT INTO lexicon_clusters (cluster_id, name, description, parent_cluster, owner, status) VALUES ('CL-112', 'Castle Scope (SAB Sponsorship Framework)', 'BB partial definition: ''sponsored by SAB brewery''. Full meaning pending.', 'CL-031', 'SAB Marketing', 'Draft');
INSERT INTO lexicon_clusters (cluster_id, name, description, parent_cluster, owner, status) VALUES ('CL-113', 'Unknown / Pending Research', 'Terms BB and Claude have NOT resolved: CONO, SOSA, CESO', NULL, 'TBD', 'Draft');
INSERT INTO lexicon_clusters (cluster_id, name, description, parent_cluster, owner, status) VALUES ('CL-114', 'SAB / AB InBev Brand Portfolio', 'All beer + FAB + RTD brands in the SAB/AB InBev ecosystem', NULL, 'SAB Marketing', 'Approved');
INSERT INTO lexicon_clusters (cluster_id, name, description, parent_cluster, owner, status) VALUES ('CL-115', 'Legal Agreements', 'NDAs, MOUs, MSAs, SOWs, contracts', 'CL-040', 'Legal', 'Approved');
INSERT INTO lexicon_clusters (cluster_id, name, description, parent_cluster, owner, status) VALUES ('CL-116', 'SAB Personnel', 'SAB Project Leads, Brand Managers, Cost Consultants', NULL, 'Corporate', 'BB-Confirmed');
INSERT INTO lexicon_clusters (cluster_id, name, description, parent_cluster, owner, status) VALUES ('CL-117', 'SAB Cost Consulting Vocab', 'Standard Responses, verdicts, bucket categories specific to SAB cost review', NULL, 'SAB Procurement', 'BB-Confirmed');

-- Supplier Master
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('C-Square', 'C Square | C-SQUARE | C-Square | C=SQUARE | CSQUARE | CSquare', 6, 2487);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('Neal Street Productions', 'NEAL STREET | NEAL STREET PRODUCTIONS | Neal Streat | Neal Streat Productions | Neal Street | Neal Street Productions', 6, 1994);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('M-Sports', 'M Sports | M Sports Marketing | M-SPORTS | M-SPORTS MARKETING COMMUNICATION | M-Sports Marketing | M-Sports Marketing Communication', 6, 1745);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('B&W Productions', 'B & W Productions | B&W PRODUCTIONS | B&W Productions | B&W Productions CC | B&W Produtions CC | BW Prodcuctions | BW Productions', 7, 1176);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('Control A', 'CONTROL A | Conrol A | Control A', 3, 1069);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('VWV', 'VWV', 1, 831);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('52 Sundays', '52 SUNDAYS | 52 Sundays', 2, 630);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('Anything Goes', 'ANYTHING GOES', 1, 238);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('Amplify Marketing', 'Amplify Marketing', 1, 237);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('Dine and Dash', 'Dine and Dash (PTY) LTD', 1, 184);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('Impressions', 'Impressions', 1, 183);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('Native Events', 'Native Events', 1, 166);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('Internal', 'Internal', 1, 137);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('Tbc', 'TBC', 1, 133);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('Off Limits', 'OFF-LIMITS | Off Limits', 2, 130);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('DDS (Drinks Dispense Services)', 'Drinks Dispense Services', 1, 126);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('Chattels SA', 'Chattels | Chattels SA', 2, 93);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('Digital Events', 'Digital Events', 1, 89);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('Octagon', 'Octagon', 1, 61);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('The Gas Shop', 'The Gas Shop', 1, 49);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('Frigoglass', 'Fridgoglass | Frigoglass', 2, 47);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('Big Box', 'Big Box', 1, 47);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('Lwc Holdings', 'LWC HOLDINGS | LWC Holdings', 2, 42);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('Ten Of Cups', 'Ten of Cups', 1, 42);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('Connexit', 'Connexit', 1, 41);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('Csquare - Macufe', 'CSQUARE - MACUFE', 1, 40);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('Topcherry Events', 'Topcherry Events', 1, 40);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('Off-Limit', 'OFF-LIMIT', 1, 35);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('Tada Promotions', 'Tada Promotions', 1, 33);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('Marketing Worx', 'Marketing Worx', 1, 31);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('J.R Hire', 'J.R Hire', 1, 31);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('Aisha''S Super Staff', 'Aisha''s Super Staff', 1, 29);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('Bourne Kreative (Pty) Ltd', 'Bourne Kreative (Pty) Ltd', 1, 26);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('Mte Tents & Events', 'MTE Tents & Events', 1, 25);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('Big Box Containers', 'Big Box Containers', 1, 23);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('Air Comfort Company', 'Air Comfort Company', 1, 21);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('Queen Bees Creations', 'Queen Bees Creations', 1, 21);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('Value Logistics', 'VALUE LOGISTICS', 1, 20);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('Penmark', 'Penmark', 1, 20);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('Inspiration Events', 'Inspiration Events', 1, 20);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('Sail', 'SAIL', 1, 20);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('Doug Hiring', 'Doug Hiring', 1, 19);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('The Catering Boys', 'The Catering Boys', 1, 19);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('Mlaba Investments', 'Mlaba Investments', 1, 19);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('Elite Tents', 'Elite Tents', 1, 19);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('Steve''S Hiring Service', 'Steve''s Hiring Service', 1, 18);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('Screen Line', 'Screen Line', 1, 17);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('Top Cherry', 'TOPCHERRY', 1, 15);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('Liefde By Die Dam Pty Ltd', 'Liefde By Die Dam PTY LTD', 1, 15);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('Tegwen Customised Clothing And Gifting', 'Tegwen customised clothing and gifting', 1, 15);
INSERT INTO lexicon_suppliers (canonical, variants, variant_count, total_mentions) VALUES ('Pgf Holdings', 'PGF HOLDINGS', 1, 6);

-- Region Master
INSERT INTO lexicon_regions (canonical, zone, variants, variant_count, total_mentions, notes) VALUES ('Inland Region', 'SA Zone', 'INLAND | In Land | Inland', 3, 3669, 'BB-confirmed SA region.');
INSERT INTO lexicon_regions (canonical, zone, variants, variant_count, total_mentions, notes) VALUES ('Western Cape Region', 'SA Zone', 'CAPETOWN | Cape | Cape Town | WC | Western Cape', 5, 3191, 'BB-confirmed SA region.');
INSERT INTO lexicon_regions (canonical, zone, variants, variant_count, total_mentions, notes) VALUES ('ROA — Botswana', 'ROA Zone', 'BOTSWANA | Botswana | ROA - Botswana', 3, 696, NULL);
INSERT INTO lexicon_regions (canonical, zone, variants, variant_count, total_mentions, notes) VALUES ('KZN Region', 'SA Zone', 'KZN | KwaZulu-Natal', 2, 608, 'BB-confirmed: also known as ECR / East Coast Region. See ECR row.');
INSERT INTO lexicon_regions (canonical, zone, variants, variant_count, total_mentions, notes) VALUES ('Central Region', 'SA Zone', 'CENTRAL | Central', 2, 437, 'Sub-region — Free State or part of Inland. Still pending BB confirmation.');
INSERT INTO lexicon_regions (canonical, zone, variants, variant_count, total_mentions, notes) VALUES ('ZHQ (Zonal HQ — Corporate, not geographic)', 'Corporate (not geographic)', 'ZHQ | ZHQ - CENTRAL', 2, 421, 'BB-confirmed: ZHQ = Zonal HQ. SAB corporate office. NOT geographic.');
INSERT INTO lexicon_regions (canonical, zone, variants, variant_count, total_mentions, notes) VALUES ('National (multi-region)', 'SA Zone (multi)', 'National', 1, 418, NULL);
INSERT INTO lexicon_regions (canonical, zone, variants, variant_count, total_mentions, notes) VALUES ('Gauteng', 'SA Zone', 'GAUTENG | Gauteng | Gautreng', 3, 405, NULL);
INSERT INTO lexicon_regions (canonical, zone, variants, variant_count, total_mentions, notes) VALUES ('ROA — Tanzania', 'ROA Zone', 'ROA - Tanzania | ROA-Tanzania | Tanzania', 3, 280, NULL);
INSERT INTO lexicon_regions (canonical, zone, variants, variant_count, total_mentions, notes) VALUES ('Eastern Cape Region (ECR)', 'SA Zone', 'ECR', 1, 257, 'BB-confirmed: ECR = Eastern Cape = East Coast Region = KZN. Three names, same region.');
INSERT INTO lexicon_regions (canonical, zone, variants, variant_count, total_mentions, notes) VALUES ('Johannesburg', 'SA Zone', 'JOBURG | Johannesburg | Johannesburg - Gauteng', 3, 222, NULL);
INSERT INTO lexicon_regions (canonical, zone, variants, variant_count, total_mentions, notes) VALUES ('Northern Cape', 'SA Zone', 'Northen Cape | Northern Cape', 2, 170, NULL);
INSERT INTO lexicon_regions (canonical, zone, variants, variant_count, total_mentions, notes) VALUES ('ROA — Eswatini', 'ROA Zone', 'ESWATINI | Eswatini | ROA - ESWATINI | ROA - Eswatini', 4, 158, NULL);
INSERT INTO lexicon_regions (canonical, zone, variants, variant_count, total_mentions, notes) VALUES ('Pretoria', 'SA Zone', 'Pretoria', 1, 139, NULL);
INSERT INTO lexicon_regions (canonical, zone, variants, variant_count, total_mentions, notes) VALUES ('ROA — General (multi-country)', 'ROA Zone', 'ROA', 1, 131, 'Rest of Africa multi-country bookings.');
INSERT INTO lexicon_regions (canonical, zone, variants, variant_count, total_mentions, notes) VALUES ('ROA — Zambia', 'ROA Zone', 'ROA - Zambia', 1, 89, NULL);
INSERT INTO lexicon_regions (canonical, zone, variants, variant_count, total_mentions, notes) VALUES ('ROA — Ghana', 'ROA Zone', 'ROA - Ghana', 1, 76, NULL);
INSERT INTO lexicon_regions (canonical, zone, variants, variant_count, total_mentions, notes) VALUES ('Nelspruit / Mbombela', 'SA Zone', 'Nelspruit', 1, 54, NULL);
INSERT INTO lexicon_regions (canonical, zone, variants, variant_count, total_mentions, notes) VALUES ('ROA — Lesotho', 'ROA Zone', 'ROA - Lesotho', 1, 47, NULL);

-- Brand Map
INSERT INTO lexicon_brand_map (found_in_data, resolves_to, ownership, action) VALUES ('CASTLE LAGER (52)', 'Castle family flagship', 'SAB / AB InBev owned', '✅ Lock');
INSERT INTO lexicon_brand_map (found_in_data, resolves_to, ownership, action) VALUES ('CASTLE LITE (20)', 'Castle Lite — variants: Lime, Draught Can', 'SAB / AB InBev owned', '✅ Lock');
INSERT INTO lexicon_brand_map (found_in_data, resolves_to, ownership, action) VALUES ('CASTLE MILK STOUT (3)', 'Castle Milk Stout', 'SAB / AB InBev owned', '✅ Lock');
INSERT INTO lexicon_brand_map (found_in_data, resolves_to, ownership, action) VALUES ('MILK STOUT (3)', 'Castle Milk Stout (short ref)', 'SAB / AB InBev owned', 'Merge with CASTLE MILK STOUT');
INSERT INTO lexicon_brand_map (found_in_data, resolves_to, ownership, action) VALUES ('CASTLE (18)', 'Castle family — ambiguous unless specified', 'SAB / AB InBev owned', '❓ Request specificity');
INSERT INTO lexicon_brand_map (found_in_data, resolves_to, ownership, action) VALUES ('CASTLE DOUBLE MALT (stock)', 'Castle Double Malt — 4.8% ABV', 'SAB / AB InBev owned', '✅ Lock');
INSERT INTO lexicon_brand_map (found_in_data, resolves_to, ownership, action) VALUES ('CARLING BLACK LABEL (15)', 'Carling Black Label', 'SAB / AB InBev owned', '✅ Lock');
INSERT INTO lexicon_brand_map (found_in_data, resolves_to, ownership, action) VALUES ('BLACK LABEL (4)', 'Carling Black Label (short ref)', 'SAB / AB InBev owned', 'Merge with CARLING BLACK LABEL');
INSERT INTO lexicon_brand_map (found_in_data, resolves_to, ownership, action) VALUES ('BLACK CROWN (12)', 'Black Crown — RTD G&T range', 'SAB / AB InBev owned', '✅ Lock');
INSERT INTO lexicon_brand_map (found_in_data, resolves_to, ownership, action) VALUES ('FLYING FISH (83)', 'Flying Fish FAB — variants: Pressed Lemon, Chilled Green Apple, Chill', 'SAB / AB InBev owned', '✅ Lock');
INSERT INTO lexicon_brand_map (found_in_data, resolves_to, ownership, action) VALUES ('BRUTAL FRUIT (11)', 'Brutal Fruit Spritzer — variants: Original, Ruby Apple', 'SAB / AB InBev owned', '✅ Lock');
INSERT INTO lexicon_brand_map (found_in_data, resolves_to, ownership, action) VALUES ('STELLA ARTOIS (133, was 87+46)', 'Stella Artois (global)', 'AB InBev global', '✅ Merged in v2.1');
INSERT INTO lexicon_brand_map (found_in_data, resolves_to, ownership, action) VALUES ('STELLA (98)', 'Stella Artois (short ref)', 'AB InBev global', 'Merge with STELLA ARTOIS');
INSERT INTO lexicon_brand_map (found_in_data, resolves_to, ownership, action) VALUES ('CORONA (71)', 'Corona Extra (global)', 'AB InBev global (Mexican origin)', '✅ Lock');
INSERT INTO lexicon_brand_map (found_in_data, resolves_to, ownership, action) VALUES ('BUDWEISER (stock)', 'Budweiser — brewed Rosslyn ''home of Bud in Africa''', 'AB InBev global', '✅ Lock');
INSERT INTO lexicon_brand_map (found_in_data, resolves_to, ownership, action) VALUES ('SMIRNOFF (30)', 'Smirnoff RTDs (Storm/Spin/Guarana/Pine Twist/Berry Twist)', 'Diageo — LICENSED to SAB since 2019', '⚠️ Vodka NOT in license');
INSERT INTO lexicon_brand_map (found_in_data, resolves_to, ownership, action) VALUES ('GUINNESS (stock)', 'Guinness (Diageo licensed)', 'Diageo — LICENSED to SAB', '⚠️ Imported from Ireland');
INSERT INTO lexicon_brand_map (found_in_data, resolves_to, ownership, action) VALUES ('SAFARI (30)', 'Safari Lager / Double Malt / Sparkling Water', 'TBL Tanzania (AB InBev Africa)', '✅ Lock');
INSERT INTO lexicon_brand_map (found_in_data, resolves_to, ownership, action) VALUES ('KILIMANJARO (stock ''Kilomanjaro'' sic)', 'Kilimanjaro Premium Lager', 'TBL Tanzania', '✅ FIX TYPO');
INSERT INTO lexicon_brand_map (found_in_data, resolves_to, ownership, action) VALUES ('MAC-MAHON (stock)', '2M (Mac-Mahon brewery, 1965)', 'CDM Mozambique', '✅ Canonical = ''2M'' or ''Mac-Mahon 2M''');
INSERT INTO lexicon_brand_map (found_in_data, resolves_to, ownership, action) VALUES ('DRAUGHT [sic] (3)', 'Likely Castle Lite Draught', 'SAB / AB InBev owned', '❓ Request specificity');
INSERT INTO lexicon_brand_map (found_in_data, resolves_to, ownership, action) VALUES ('ST LOUIS (4)', 'St Louis Lager — Cameroon', 'Brasseries du Cameroun (AB InBev Africa)', '✅ Lock');
INSERT INTO lexicon_brand_map (found_in_data, resolves_to, ownership, action) VALUES ('MXD (14 TRACK, 9 quote)', 'Perfectly MXD beverage OR MXD Productions company', 'Context-sensitive', '⚠️ DISAMBIGUATION required');
INSERT INTO lexicon_brand_map (found_in_data, resolves_to, ownership, action) VALUES ('SHARP', '❌ NOT a beer — SAB Sharp responsible-drinking platform', 'SAB Corporate Programme (Jul 2024)', '⚠️ RECLASSIFY stock sheet');
INSERT INTO lexicon_brand_map (found_in_data, resolves_to, ownership, action) VALUES ('MULTIPLE BRANDS (52, was 79)', 'Cross-brand event tag', 'SAB Cost Consulting label', '✅ Merged');
INSERT INTO lexicon_brand_map (found_in_data, resolves_to, ownership, action) VALUES ('CORPORATE BRAND (1)', 'Generic corporate marker', 'SAB / AB InBev corporate', 'Use as tag');
INSERT INTO lexicon_brand_map (found_in_data, resolves_to, ownership, action) VALUES ('CASTLE FREE (sab.co.za)', 'Castle Free — 0% non-alcoholic Castle Lager', 'SAB / AB InBev owned', '✅ Lock');
INSERT INTO lexicon_brand_map (found_in_data, resolves_to, ownership, action) VALUES ('PERFECTLY MXD (sab.co.za)', 'Perfectly MXD — SAB RTD cocktail brand', 'AB InBev global / SA local', '✅ Lock');

-- AI Fuzzy Prompt (single row config)
INSERT INTO lexicon_config (key, value) VALUES ('ai_fuzzy_prompt', 'You are a fuzzy-matching engine for the B&W Productions events lexicon (v3.0, 14 May 2026).

CONTEXT
B&W Productions is a South African experiential events company. The primary client is SAB / AB InBev (South African Breweries, owned by Anheuser-Busch InBev). Other clients include MXD Productions (cross-brand events).

YOUR JOB
When given any line item, role, place, brand, supplier, or compliance term from a quote, invoice, brief, or contract, return:
1. The CANONICAL PREFERRED TERM (from Synonym Groups tab)
2. The CLUSTER_ID (from Cluster Index tab)
3. The CONFIDENCE SCORE (0-100)
4. The STATUS of the matched entry (Approved / BB-Confirmed / Draft)
5. If no match above 70% confidence, return "NO_MATCH" and suggest creating a new entry.

RULES
- Treat brand-spelling typos as auto-merges (CASTLLE LAGER → CASTLE LAGER; STELLA ARTIOS → STELLA ARTOIS; SPONOSRED → SPONSORED).
- Treat SAB Sharp as a CORPORATE PROGRAMME (not a beer brand). If "Sharp" appears as a SKU, flag for review.
- Treat Stage Production and Site Production as DIFFERENT cost buckets — never merge them.
- Treat ECR, East Coast Region, and KZN as the SAME region.
- Treat MXD as AMBIGUOUS — request context: SAB Perfectly MXD beverage, or MXD Productions event company?
- Treat Per Dieams as typo of Per Diems.
- Treat @Venu as typo of @ Venue.

OUTPUT FORMAT (JSON)
{
  "input": "<verbatim user input>",
  "canonical": "<preferred term>",
  "cluster_id": "<CL-NNN>",
  "confidence": <0-100>,
  "status": "<Approved | BB-Confirmed | Draft>",
  "all_synonyms_matched": ["<synonym1>", "<synonym2>"],
  "notes": "<any caveat or disambiguation>"
}

BB STYLE GUIDE (always apply when generating downstream copy)
- "setup" → "load-in"
- "strike" → "load-out"
- "pax" → "headcount"
- "venue" → "site"
- "crew" → "labour"
- "marquees" → "structures"
- ZAR currency, DD MMM YYYY dates, South African English.');
INSERT INTO lexicon_config (key, value) VALUES ('lexicon_version', 'v3.0 (14 May 2026)');