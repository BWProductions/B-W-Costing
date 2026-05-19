-- ─── RENDERER TELEMETRY ────────────────────────────────────────────────────
-- Logs every PDF render attempt so we can answer:
--   * Has Urlbox failed once in the last 7 days? (i.e. safe to drop PDFShift)
--   * Average render time per provider
--   * Total renders billed (correlate with vendor dashboards)
CREATE TABLE IF NOT EXISTS field_renderer_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER,
  form_number TEXT,
  renderer TEXT NOT NULL,            -- 'urlbox' | 'pdfshift' | 'urlbox_failed' | 'pdfshift_failed' | 'both_failed'
  format TEXT NOT NULL,              -- 'pdf' | 'png'
  ms INTEGER,                        -- total render+fetch time in ms
  bytes INTEGER,                     -- output file size
  ok INTEGER NOT NULL,               -- 1 = success, 0 = failure
  error TEXT,                        -- error message if failed (truncated to 300 chars)
  trigger TEXT,                      -- 'submission' | 'preview' | 'snapshot' | 'manual'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_renderer_log_created ON field_renderer_log(created_at);
CREATE INDEX IF NOT EXISTS idx_renderer_log_renderer ON field_renderer_log(renderer);
CREATE INDEX IF NOT EXISTS idx_renderer_log_ok ON field_renderer_log(ok);

-- ─── DASHBOARD SNAPSHOTS ──────────────────────────────────────────────────
-- Daily archival snapshots of the admin dashboard. R2 stores the PNG; this
-- table is the searchable index of what we have.
CREATE TABLE IF NOT EXISTS field_dashboard_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_date TEXT NOT NULL,       -- 'YYYY-MM-DD' (SAST date)
  target TEXT NOT NULL,              -- 'dashboard' | 'archive' | 'people' (extensible)
  r2_key TEXT NOT NULL,              -- key in PDF_BUCKET
  format TEXT NOT NULL,              -- 'png' | 'pdf'
  bytes INTEGER,                     -- file size
  ms INTEGER,                        -- time taken to render
  renderer TEXT,                     -- 'urlbox' (we don't fall back here)
  trigger TEXT,                      -- 'cron' | 'lazy' | 'manual'
  notes TEXT,                        -- any context (totals at time of snapshot, etc.)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dashboard_snapshots_date ON field_dashboard_snapshots(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_dashboard_snapshots_target ON field_dashboard_snapshots(target);
CREATE UNIQUE INDEX IF NOT EXISTS uq_dashboard_snapshot_per_day_target ON field_dashboard_snapshots(snapshot_date, target);

-- ─── PREVIEW TOKENS ────────────────────────────────────────────────────────
-- One-time / short-lived tokens for sharing a delivery-note preview publicly.
-- Used by the "Send to WhatsApp" feature so the recipient doesn't need to log in
-- but the URL can't be casually scraped by bots.
CREATE TABLE IF NOT EXISTS field_preview_tokens (
  token TEXT PRIMARY KEY,            -- 32-char random hex
  submission_id INTEGER NOT NULL,
  format TEXT NOT NULL DEFAULT 'png',  -- 'png' | 'pdf'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,      -- typically created_at + 14 days
  created_by TEXT,                   -- admin user who minted the link
  channel TEXT,                      -- 'whatsapp' | 'email' | 'manual'
  hits INTEGER DEFAULT 0,            -- count of times the URL was fetched
  last_hit_at DATETIME,
  FOREIGN KEY (submission_id) REFERENCES field_submissions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_preview_tokens_submission ON field_preview_tokens(submission_id);
CREATE INDEX IF NOT EXISTS idx_preview_tokens_expires ON field_preview_tokens(expires_at);

-- ─── SYSTEM CONFIG SEEDS ──────────────────────────────────────────────────
-- Defaults so the cron endpoints have everything they need on first run.
INSERT OR IGNORE INTO field_system_config (key, value) VALUES
  ('dashboard_snapshot_last_run', ''),
  ('dashboard_snapshot_lazy_trigger_enabled', '1'),
  ('dashboard_snapshot_retention_days', '90'),
  ('renderer_pdfshift_fallback_enabled', '1');
