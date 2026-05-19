// ─── URLBOX CLIENT ────────────────────────────────────────────────────────────
// Urlbox renders any URL to PDF / PNG / JPEG using their hosted Chromium fleet.
// Docs: https://urlbox.com/docs
//
// Two ways to call Urlbox:
//   1. SIGNED RENDER URL (HMAC-SHA256, GET): build URL, append signature, fetch.
//      Best for: GET-style rendering, no body limits, browser-embeddable.
//   2. POST API + Bearer secret: send JSON body, get binary back.
//      Best for: long option sets, programmatic, simpler signing.
//
// We use POST for actual rendering (cleaner error handling, no URL length limit)
// and signed-URL helper for embed cases (e.g. <img src="..."> in emails).
//
// All three creds come from Cloudflare Pages secrets — never logged, never
// committed. The publishable key is technically public-safe (it goes in render
// URLs) but we still pull it from env for consistency.

export interface UrlboxEnv {
  URLBOX_PUBLISHABLE_KEY?: string
  URLBOX_SECRET_KEY?: string
  URLBOX_WEBHOOK_SECRET?: string
}

export type UrlboxFormat = 'pdf' | 'png' | 'jpeg' | 'webp'

export interface UrlboxOptions {
  url: string                      // target URL to render
  format?: UrlboxFormat            // default 'pdf'
  full_page?: boolean              // capture entire scroll height (default true for png)
  width?: number                   // viewport width px
  height?: number                  // viewport height px (ignored if full_page=true for png)
  retina?: boolean                 // 2x DPI
  pdf_page_size?: 'A4' | 'Letter' | 'Legal' | 'A3'
  pdf_margin?: 'none' | 'minimum' | 'default' | 'maximum'
  pdf_orientation?: 'portrait' | 'landscape'
  pdf_scale?: number               // 0.1 - 2.0
  pdf_background?: boolean         // print background colors/images
  pdf_show_header?: boolean
  pdf_show_footer?: boolean
  pdf_footer?: string              // HTML for footer
  use_s3?: boolean                 // upload result to Urlbox CDN, return URL
  wait_for?: string                // CSS selector to wait for
  wait_to_leave?: string           // CSS selector that should disappear
  delay?: number                   // extra ms wait after load (0-30000)
  hide_selector?: string           // CSS selector to hide (e.g. cookie banners)
  block_ads?: boolean
  block_cookie_banners?: boolean
  click?: string                   // CSS selector to click before render
  css?: string                     // inject CSS
  js?: string                      // inject JS
  cookie?: string                  // pass cookies for auth'd pages
  user_agent?: string
  use_print?: boolean              // render with print media query
  thumb_width?: number             // resize output (png only)
  quality?: number                 // jpeg/webp 0-100
  cache_ttl?: number               // seconds; 0 = no cache
  fail_if_4xx?: boolean
  fail_if_5xx?: boolean
}

const API_BASE = 'https://api.urlbox.com/v1'

// ─── INTERNAL: BUILD QUERY STRING ─────────────────────────────────────────────
// Urlbox is fussy about boolean encoding: must be lowercase "true"/"false"
// strings, NOT 1/0. URLSearchParams handles encoding but we coerce types first.
function toQuery(opts: UrlboxOptions): string {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(opts)) {
    if (v === undefined || v === null || v === '') continue
    if (typeof v === 'boolean') params.append(k, v ? 'true' : 'false')
    else params.append(k, String(v))
  }
  return params.toString()
}

// ─── HMAC-SHA256 SIGNING (FOR SIGNED RENDER URLS) ─────────────────────────────
// Urlbox signed URLs use HMAC-SHA256 of the query string with the SECRET key,
// hex-encoded. The signature goes in the URL path BEFORE the format.
//   https://api.urlbox.com/v1/{PUBLISHABLE}/{SIG}/{format}?{query}
async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// ─── PUBLIC: BUILD A SIGNED GET URL FOR EMBEDDING ─────────────────────────────
// Use this when you want an <img src> or <a href> that browsers/email clients
// can fetch directly. The signature locks the options so they can't be tampered.
export async function buildSignedUrl(
  env: UrlboxEnv,
  opts: UrlboxOptions
): Promise<string> {
  const pub = env.URLBOX_PUBLISHABLE_KEY
  const sec = env.URLBOX_SECRET_KEY
  if (!pub || !sec) throw new Error('Urlbox keys not configured')
  const format = opts.format || 'pdf'
  const { format: _f, ...rest } = opts
  const query = toQuery(rest as UrlboxOptions)
  const sig = await hmacHex(sec, query)
  return `${API_BASE}/${pub}/${sig}/${format}?${query}`
}

// ─── PUBLIC: RENDER VIA POST API (RETURNS BINARY BUFFER) ──────────────────────
// Use this when your server needs the bytes directly (to store in R2, return
// as a download, etc.). Auth via Bearer + SECRET key.
//
// IMPORTANT: Urlbox's /v1/render/sync returns a JSON envelope like:
//   { renderUrl: "https://renders.urlbox.com/.../file.pdf", size: N, ... }
// NOT the binary itself. We have to fetch renderUrl as step 2 to get bytes.
// This is the same pattern PDFShift uses.
//
// Returns ArrayBuffer of the rendered file (PDF/PNG/JPEG bytes).
// Throws if render fails — caller should wrap in try/catch.
export async function renderToBuffer(
  env: UrlboxEnv,
  opts: UrlboxOptions
): Promise<{ buffer: ArrayBuffer; contentType: string; renderUrl?: string; meta?: any }> {
  const sec = env.URLBOX_SECRET_KEY
  if (!sec) throw new Error('URLBOX_SECRET_KEY not configured')
  const format = opts.format || 'pdf'

  // Step 1: Ask Urlbox to render. Returns JSON with a temporary renderUrl.
  const res = await fetch(`${API_BASE}/render/sync`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${sec}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ ...opts, format })
  })

  if (!res.ok) {
    let detail = ''
    try { detail = await res.text() } catch {}
    throw new Error(`Urlbox render failed: ${res.status} ${res.statusText} — ${detail.slice(0, 300)}`)
  }

  const ct = res.headers.get('content-type') || ''
  const defaultContentType =
    format === 'pdf' ? 'application/pdf' :
    format === 'png' ? 'image/png' :
    format === 'jpeg' ? 'image/jpeg' :
    'application/octet-stream'

  // ── Path A: JSON envelope (current Urlbox sync API) ─────────────────────────
  if (ct.includes('application/json')) {
    const meta: any = await res.json()
    const renderUrl = meta?.renderUrl
    if (!renderUrl) {
      throw new Error(`Urlbox returned JSON but no renderUrl: ${JSON.stringify(meta).slice(0, 200)}`)
    }
    const fileRes = await fetch(renderUrl)
    if (!fileRes.ok) {
      throw new Error(`Failed to fetch renderUrl: ${fileRes.status} ${fileRes.statusText}`)
    }
    const buffer = await fileRes.arrayBuffer()
    const contentType = fileRes.headers.get('content-type') || defaultContentType
    return { buffer, contentType, renderUrl, meta }
  }

  // ── Path B: Direct binary (fallback — older API or future changes) ──────────
  const buffer = await res.arrayBuffer()
  return { buffer, contentType: ct || defaultContentType }
}

// ─── PUBLIC: VERIFY WEBHOOK SIGNATURE ─────────────────────────────────────────
// Urlbox webhooks (for async renders) send X-Urlbox-Signature: t=...,sha256=...
// We verify by HMAC-SHA256 of the raw body with the WEBHOOK secret.
// Currently unused (we use sync renders) but here for future async upgrade.
export async function verifyWebhook(
  env: UrlboxEnv,
  rawBody: string,
  signatureHeader: string
): Promise<boolean> {
  const whk = env.URLBOX_WEBHOOK_SECRET
  if (!whk || !signatureHeader) return false

  // Header format: "t=TIMESTAMP,sha256=HEX"
  const parts = Object.fromEntries(
    signatureHeader.split(',').map(p => p.split('=').map(s => s.trim()))
  ) as { t?: string; sha256?: string }
  if (!parts.t || !parts.sha256) return false

  const expected = await hmacHex(whk, `${parts.t}.${rawBody}`)
  // Constant-time-ish compare
  if (expected.length !== parts.sha256.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ parts.sha256.charCodeAt(i)
  }
  return diff === 0
}

// ─── PUBLIC: PRESET — DELIVERY NOTE PDF OPTIONS ───────────────────────────────
// Matches the look of the previous PDFShift output as closely as possible:
//   A4, portrait, ~0.85 zoom (we use pdf_scale: 0.85), 8/10mm margins,
//   print media query enabled, backgrounds on, full_page false (let CSS paginate).
export function deliveryNotePdfOptions(pageUrl: string, filename?: string): UrlboxOptions {
  return {
    url: pageUrl,
    format: 'pdf',
    pdf_page_size: 'A4',
    pdf_orientation: 'portrait',
    pdf_scale: 0.85,
    pdf_margin: 'default', // ~10mm — Urlbox doesn't accept granular mm like PDFShift did
    pdf_background: true,
    pdf_show_header: false,
    pdf_show_footer: false,
    use_print: true,
    block_ads: true,
    block_cookie_banners: true,
    delay: 500,            // give fonts a moment to load
    cache_ttl: 0,          // never cache — we always want fresh data
    fail_if_4xx: true,
    fail_if_5xx: true,
    ...(filename ? {} : {}) // filename is set via Content-Disposition on our side
  }
}

// ─── PUBLIC: PRESET — SUBMISSION PREVIEW PNG ──────────────────────────────────
// Optimised for thumbnails / WhatsApp previews:
//   1200px wide (good for retina mobile), full page, retina off (smaller file)
export function submissionPreviewPngOptions(pageUrl: string): UrlboxOptions {
  return {
    url: pageUrl,
    format: 'png',
    width: 1200,
    full_page: true,
    retina: false,
    block_ads: true,
    block_cookie_banners: true,
    delay: 500,
    cache_ttl: 0,
    fail_if_4xx: true
  }
}

// ─── PUBLIC: PRESET — DASHBOARD SNAPSHOT ──────────────────────────────────────
// For admin dashboard / archive snapshots. Wider viewport for desktop layout,
// retina on for crisp screenshots, and we pass through the admin session cookie
// so Urlbox can authenticate as the logged-in admin.
export function dashboardSnapshotOptions(
  pageUrl: string,
  format: 'png' | 'pdf' = 'png',
  sessionCookie?: string
): UrlboxOptions {
  return {
    url: pageUrl,
    format,
    width: 1440,
    full_page: format === 'png',
    retina: format === 'png',
    pdf_page_size: format === 'pdf' ? 'A4' : undefined,
    pdf_orientation: format === 'pdf' ? 'landscape' : undefined,
    pdf_scale: format === 'pdf' ? 0.7 : undefined,
    pdf_background: true,
    block_ads: true,
    block_cookie_banners: true,
    delay: 1000,           // dashboards have more JS — give it longer
    cache_ttl: 0,
    cookie: sessionCookie, // e.g. "bw_session=...; admin_session=..."
    fail_if_4xx: true
  }
}
