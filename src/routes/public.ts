// Public landing page route — no auth required

import type { Context } from 'hono'

export async function publicLanding(c: Context): Promise<Response> {
  // Read the static index.html and serve it
  const html = PUBLIC_HTML
  return c.html(html)
}

// ─── Inline public landing page HTML ─────────────────────────────────────────
// (Inlined here so it compiles into the worker bundle for Cloudflare Pages)

const PUBLIC_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BW Productions — Event Logistics & Production</title>
  <meta name="description" content="BW Productions — South Africa's premier event logistics, production and supply chain partner. Randvaal, Gauteng.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700;900&family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --navy: #0d1117; --navy-mid: #161b22; --navy-card: #1c2230; --navy-border: #21262d;
      --gold: #C9A84C; --gold-lt: #F0D080; --gold-dk: #8B6914;
      --white: #f0f4ff; --muted: #6b7589;
      --magenta: #CC18E8; --orange: #FF7A00; --yellow: #FFD400;
      --green-f: #7CFF2B; --cyan: #18D9FF; --blue-f: #1D6BFF;
    }
    html { scroll-behavior: smooth; }
    body { font-family: 'Inter', sans-serif; background: var(--navy); color: var(--white); overflow-x: hidden; }

    /* NAV */
    nav {
      position: fixed; top: 0; left: 0; right: 0; z-index: 1000;
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 48px;
      background: rgba(13,17,23,0.9); backdrop-filter: blur(16px);
      border-bottom: 1px solid rgba(33,38,45,0.8);
      transition: padding 0.3s;
    }
    .nav-brand { display: flex; align-items: center; gap: 12px; text-decoration: none; }
    .nav-title {
      font-family: 'Cinzel', serif; font-size: 14px; font-weight: 700; letter-spacing: 0.06em;
      background: linear-gradient(135deg, #B67A3A, #F0D080, #D39A52);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
    }
    .nav-links { display: flex; align-items: center; gap: 32px; list-style: none; }
    .nav-links a { color: var(--muted); text-decoration: none; font-size: 13px; font-weight: 500; transition: color 0.15s; }
    .nav-links a:hover { color: var(--white); }
    .nav-cta {
      background: linear-gradient(135deg, var(--gold-dk), var(--gold), var(--gold-lt)) !important;
      color: #000 !important; padding: 8px 20px; border-radius: 8px; font-weight: 700 !important;
      box-shadow: 0 2px 12px rgba(201,168,76,0.3); transition: box-shadow 0.2s, transform 0.2s !important;
    }
    .nav-cta:hover { box-shadow: 0 4px 20px rgba(201,168,76,0.5) !important; transform: translateY(-1px); color: #000 !important; }

    /* HERO */
    .hero {
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      text-align: center; padding: 120px 24px 80px; position: relative; overflow: hidden;
    }
    .hero::before {
      content: ''; position: absolute; top: -20%; left: 50%; transform: translateX(-50%);
      width: 900px; height: 900px;
      background: radial-gradient(circle, rgba(204,24,232,0.07) 0%, rgba(24,217,255,0.05) 40%, transparent 70%);
      pointer-events: none;
    }
    .hero-content { position: relative; z-index: 2; max-width: 900px; margin: 0 auto; }
    .hero-logo {
      width: 200px; height: 200px; margin: 0 auto 36px;
      filter: drop-shadow(0 0 40px rgba(201,168,76,0.28));
      animation: float 6s ease-in-out infinite;
    }
    @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
    .hero-eyebrow {
      font-size: 11px; font-weight: 700; letter-spacing: 0.22em; text-transform: uppercase;
      color: var(--muted); margin-bottom: 18px;
      display: flex; align-items: center; justify-content: center; gap: 14px;
    }
    .hero-eyebrow::before,.hero-eyebrow::after {
      content: ''; display: block; height: 1px; width: 40px;
      background: linear-gradient(90deg, transparent, var(--muted));
    }
    .hero-eyebrow::after { background: linear-gradient(90deg, var(--muted), transparent); }
    .hero-title {
      font-family: 'Cinzel', serif; font-size: clamp(38px, 6.5vw, 76px); font-weight: 900;
      line-height: 1.05; letter-spacing: 0.02em;
      background: linear-gradient(135deg, #B67A3A 0%, #F0D080 35%, #ffffff 50%, #F0D080 65%, #8A5A2B 100%);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
      margin-bottom: 10px;
    }
    .hero-sub {
      font-family: 'Cinzel', serif; font-size: clamp(14px, 2vw, 22px); font-weight: 600;
      color: var(--muted); letter-spacing: 0.22em; text-transform: uppercase; margin-bottom: 28px;
    }
    .hero-desc { font-size: 16px; color: #8892a4; line-height: 1.75; max-width: 620px; margin: 0 auto 44px; }
    .hero-ctas { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; }
    .btn-primary {
      display: inline-flex; align-items: center; gap: 8px; padding: 14px 32px; border-radius: 10px;
      font-size: 14px; font-weight: 700; text-decoration: none; font-family: 'Cinzel', serif; letter-spacing: 0.05em;
      background: linear-gradient(135deg, var(--gold-dk), var(--gold), var(--gold-lt)); color: #000;
      box-shadow: 0 4px 24px rgba(201,168,76,0.35); transition: all 0.2s;
    }
    .btn-primary:hover { box-shadow: 0 8px 40px rgba(201,168,76,0.55); transform: translateY(-2px); }
    .btn-secondary {
      display: inline-flex; align-items: center; gap: 8px; padding: 14px 32px; border-radius: 10px;
      font-size: 14px; font-weight: 600; text-decoration: none;
      background: transparent; color: var(--white); border: 1px solid var(--navy-border); transition: all 0.2s;
    }
    .btn-secondary:hover { background: var(--navy-card); border-color: var(--muted); }

    /* FLAME LINE */
    .flame-line {
      height: 1px;
      background: linear-gradient(90deg, transparent 0%, #CC18E8 15%, #FF7A00 30%, #FFD400 50%, #7CFF2B 70%, #18D9FF 85%, transparent 100%);
      opacity: 0.55;
    }

    /* STATS BAND */
    .stats-band { background: var(--navy-mid); padding: 64px 24px; }
    .stats-band-inner {
      max-width: 1100px; margin: 0 auto; display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 32px; text-align: center;
    }
    .band-num {
      font-family: 'Cinzel', serif; font-size: 48px; font-weight: 900; line-height: 1; margin-bottom: 10px;
      background: linear-gradient(135deg, var(--gold-dk), var(--gold-lt));
      -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
    }
    .band-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.14em; font-weight: 600; }

    /* SECTIONS */
    section { padding: 96px 24px; }
    .section-inner { max-width: 1100px; margin: 0 auto; }
    .eyebrow { font-size: 10px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: var(--gold); margin-bottom: 10px; text-align: center; }
    .section-title { font-family: 'Cinzel', serif; font-size: clamp(24px, 3.5vw, 42px); font-weight: 700; text-align: center; color: var(--white); margin-bottom: 12px; }
    .section-desc { text-align: center; color: var(--muted); font-size: 15px; line-height: 1.7; max-width: 600px; margin: 0 auto 56px; }

    /* SERVICES */
    .services-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; }
    .service-card {
      background: var(--navy-card); border: 1px solid var(--navy-border); border-radius: 16px; padding: 28px;
      position: relative; overflow: hidden; transition: transform 0.2s, box-shadow 0.2s;
    }
    .service-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; }
    .service-card:nth-child(1)::before{background:linear-gradient(90deg,#CC18E8,#FF4A1C)}
    .service-card:nth-child(2)::before{background:linear-gradient(90deg,#FF7A00,#FFD400)}
    .service-card:nth-child(3)::before{background:linear-gradient(90deg,#FFD400,#7CFF2B)}
    .service-card:nth-child(4)::before{background:linear-gradient(90deg,#7CFF2B,#18D9FF)}
    .service-card:nth-child(5)::before{background:linear-gradient(90deg,#18D9FF,#1D6BFF)}
    .service-card:nth-child(6)::before{background:linear-gradient(90deg,#1D6BFF,#CC18E8)}
    .service-card:hover { transform: translateY(-4px); box-shadow: 0 16px 48px rgba(0,0,0,0.4); border-color: rgba(201,168,76,0.14); }
    .svc-icon { font-size: 32px; margin-bottom: 18px; }
    .svc-title { font-family: 'Cinzel', serif; font-size: 16px; font-weight: 700; color: var(--white); margin-bottom: 10px; }
    .svc-desc { font-size: 13px; color: var(--muted); line-height: 1.65; }

    /* FLEET */
    .fleet-bg { background: var(--navy-mid); }
    .fleet-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; }
    .fleet-card {
      background: var(--navy-card); border: 1px solid var(--navy-border); border-radius: 12px;
      padding: 22px; text-align: center; transition: border-color 0.2s, transform 0.2s;
    }
    .fleet-card:hover { border-color: rgba(201,168,76,0.22); transform: translateY(-2px); }
    .fleet-icon { font-size: 36px; margin-bottom: 14px; }
    .fleet-class { font-family: 'Cinzel', serif; font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--gold); margin-bottom: 5px; }
    .fleet-name { font-size: 14px; font-weight: 600; color: var(--white); margin-bottom: 5px; }
    .fleet-detail { font-size: 12px; color: var(--muted); }

    /* PARTNERS */
    .partners-band { background: var(--navy-mid); padding: 52px 24px; }
    .partners-label { text-align: center; font-size: 11px; color: var(--muted); letter-spacing: 0.15em; text-transform: uppercase; font-weight: 600; margin-bottom: 28px; }
    .partners-logos { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }
    .partner-pill {
      background: var(--navy-card); border: 1px solid var(--navy-border); border-radius: 40px;
      padding: 8px 20px; font-size: 13px; font-weight: 600; color: var(--muted); transition: all 0.2s;
    }
    .partner-pill:hover { color: var(--white); border-color: var(--muted); }
    .partner-pill.hl { border-color: rgba(201,168,76,0.3); color: var(--gold); background: rgba(201,168,76,0.06); }

    /* CTA */
    .cta-wrap { text-align: center; padding: 96px 24px; }
    .cta-inner { max-width: 680px; margin: 0 auto; }
    .cta-logo { width: 110px; height: 110px; margin: 0 auto 32px; filter: drop-shadow(0 0 24px rgba(201,168,76,0.28)); }
    .cta-title { font-family: 'Cinzel', serif; font-size: clamp(26px, 4vw, 44px); font-weight: 900; color: var(--white); margin-bottom: 16px; }
    .cta-desc { font-size: 15px; color: var(--muted); line-height: 1.75; margin-bottom: 36px; }

    /* FOOTER */
    footer { background: var(--navy-mid); border-top: 1px solid var(--navy-border); padding: 52px 24px 32px; }
    .footer-inner { max-width: 1100px; margin: 0 auto; }
    .footer-top { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 40px; margin-bottom: 44px; }
    .footer-logo { display: flex; align-items: center; gap: 12px; text-decoration: none; margin-bottom: 14px; }
    .footer-brand-name {
      font-family: 'Cinzel', serif; font-size: 14px; font-weight: 700;
      background: linear-gradient(135deg, #B67A3A, #F0D080, #D39A52);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
    }
    .footer-brand p { font-size: 13px; color: var(--muted); line-height: 1.65; max-width: 280px; }
    .footer-col h4 { font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--gold); margin-bottom: 16px; }
    .footer-col ul { list-style: none; }
    .footer-col li { margin-bottom: 8px; }
    .footer-col a { font-size: 13px; color: var(--muted); text-decoration: none; transition: color 0.15s; }
    .footer-col a:hover { color: var(--white); }
    .footer-bottom { border-top: 1px solid var(--navy-border); padding-top: 22px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
    .footer-copy { font-size: 12px; color: #404655; }
    .footer-vat { font-size: 12px; color: #404655; font-family: 'Courier New', monospace; }

    /* ANIMATIONS */
    .fade-up { opacity: 0; transform: translateY(24px); transition: opacity 0.6s ease, transform 0.6s ease; }
    .fade-up.visible { opacity: 1; transform: translateY(0); }

    @media(max-width:768px) {
      nav{padding:12px 20px} .nav-links{display:none}
      .footer-top{grid-template-columns:1fr 1fr} section{padding:64px 20px}
    }
    @media(max-width:480px) { .footer-top{grid-template-columns:1fr} .hero-logo{width:140px;height:140px} }
  </style>
</head>
<body>

<!-- NAV -->
<nav id="nav">
  <a class="nav-brand" href="/about">
    <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" overflow="visible" width="36" height="36">
      <defs>
        <filter id="ng" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <linearGradient id="nr" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#CC18E8"/><stop offset="33%" stop-color="#FF7A00"/>
          <stop offset="66%" stop-color="#7CFF2B"/><stop offset="100%" stop-color="#CC18E8"/>
        </linearGradient>
        <linearGradient id="ngd" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#B67A3A"/><stop offset="50%" stop-color="#F0D080"/><stop offset="100%" stop-color="#8A5A2B"/>
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r="50" fill="none" stroke="url(#nr)" stroke-width="7" filter="url(#ng)" opacity="0.9"/>
      <circle cx="60" cy="60" r="42" fill="none" stroke="url(#nr)" stroke-width="2" opacity="0.35"/>
      <text x="60" y="70" text-anchor="middle" font-family="Georgia,serif" font-size="28" font-weight="900"
        fill="#0d1117" stroke="#0d1117" stroke-width="4">BW</text>
      <text x="60" y="70" text-anchor="middle" font-family="Georgia,serif" font-size="28" font-weight="900"
        fill="url(#ngd)" filter="url(#ng)">BW</text>
    </svg>
    <span class="nav-title">BW PRODUCTIONS</span>
  </a>
  <ul class="nav-links">
    <li><a href="#services">Services</a></li>
    <li><a href="#fleet">Fleet</a></li>
    <li><a href="#partners">Partners</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="/login" class="nav-cta">Staff Login</a></li>
  </ul>
</nav>

<!-- HERO -->
<section class="hero">
  <div class="hero-content">
    <div class="hero-logo">
      <svg viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg" overflow="visible" width="200" height="200">
        <defs>
          <radialGradient id="hb" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#3a0070" stop-opacity="0.5"/>
            <stop offset="100%" stop-color="#000" stop-opacity="0"/>
          </radialGradient>
          <filter id="hg" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="hg2" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="10" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <linearGradient id="hr" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#CC18E8"/><stop offset="14%" stop-color="#FF4A1C"/>
            <stop offset="28%" stop-color="#FF7A00"/><stop offset="42%" stop-color="#FFD400"/>
            <stop offset="57%" stop-color="#7CFF2B"/><stop offset="71%" stop-color="#18D9FF"/>
            <stop offset="85%" stop-color="#1D6BFF"/><stop offset="100%" stop-color="#CC18E8"/>
          </linearGradient>
          <linearGradient id="hgd" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#B67A3A"/><stop offset="30%" stop-color="#F0D080"/>
            <stop offset="60%" stop-color="#D39A52"/><stop offset="100%" stop-color="#8A5A2B"/>
          </linearGradient>
        </defs>
        <circle cx="120" cy="120" r="108" fill="url(#hb)"/>
        <circle cx="120" cy="120" r="104" fill="none" stroke="url(#hr)" stroke-width="2" opacity="0.22" filter="url(#hg2)"/>
        <circle cx="120" cy="120" r="98" fill="none" stroke="url(#hr)" stroke-width="10" filter="url(#hg)" opacity="0.95"/>
        <circle cx="120" cy="120" r="82" fill="none" stroke="url(#hr)" stroke-width="3" opacity="0.38"/>
        <text x="120" y="140" text-anchor="middle" font-family="Georgia,serif" font-size="64" font-weight="900"
          fill="#0d1117" stroke="#0d1117" stroke-width="10">BW</text>
        <text x="120" y="140" text-anchor="middle" font-family="Georgia,serif" font-size="64" font-weight="900"
          fill="url(#hgd)" filter="url(#hg)">BW</text>
      </svg>
    </div>
    <div class="hero-eyebrow">South Africa's Premier</div>
    <h1 class="hero-title">BW PRODUCTIONS</h1>
    <p class="hero-sub">Productions</p>
    <p class="hero-desc">
      Event logistics, production supply chain and fleet management —
      executed with precision from Randvaal, Gauteng to events across Southern Africa.
    </p>
    <div class="hero-ctas">
      <a href="/login" class="btn-primary"><i class="fas fa-gauge-high"></i> Operations Portal</a>
      <a href="#services" class="btn-secondary"><i class="fas fa-arrow-down"></i> Our Services</a>
    </div>
  </div>
</section>

<div class="flame-line"></div>

<!-- STATS BAND -->
<div class="stats-band">
  <div class="stats-band-inner">
    <div><div class="band-num">14</div><div class="band-label">Fleet Vehicles</div></div>
    <div><div class="band-num">5</div><div class="band-label">Load Classes</div></div>
    <div><div class="band-num">60+</div><div class="band-label">Event Cars Deployed</div></div>
    <div><div class="band-num">SAB</div><div class="band-label">SOW Aligned</div></div>
  </div>
</div>

<div class="flame-line"></div>

<!-- SERVICES -->
<section id="services">
  <div class="section-inner">
    <div class="eyebrow">What We Do</div>
    <h2 class="section-title">Full-Spectrum Event Services</h2>
    <p class="section-desc">From first load to last chair — every moving part handled with verified fleet, rated load classes and experienced crew.</p>
    <div class="services-grid">
      <div class="service-card fade-up">
        <div class="svc-icon">🚛</div>
        <div class="svc-title">Fleet Logistics</div>
        <p class="svc-desc">14 vehicles across 4 load classes — Isuzu 1-ton bakkies to 14-ton GVM Mercedes Atego. Full load-class scheduling and driver dispatch.</p>
      </div>
      <div class="service-card fade-up">
        <div class="svc-icon">🎪</div>
        <div class="svc-title">Event Production</div>
        <p class="svc-desc">End-to-end setup and breakdown: staging, furniture, gazebos, generators, PA systems and branded equipment, all delivered on time.</p>
      </div>
      <div class="service-card fade-up">
        <div class="svc-icon">🍺</div>
        <div class="svc-title">Beverage Supply Chain</div>
        <p class="svc-desc">SAB-aligned beverage logistics, brand activation support and responsible service compliance for corporate and public events.</p>
      </div>
      <div class="service-card fade-up">
        <div class="svc-icon">🖨️</div>
        <div class="svc-title">Event Print & Branding</div>
        <p class="svc-desc">A3 Correx boards, A1 pull-up banners, A4 flyers and large-format print production. Fully managed from artwork to site delivery.</p>
      </div>
      <div class="service-card fade-up">
        <div class="svc-icon">👷</div>
        <div class="svc-title">Crew & Labour</div>
        <p class="svc-desc">Experienced event crew from set-up to teardown. Tiered packages from R1,250 to R5,350 for events of any scale.</p>
      </div>
      <div class="service-card fade-up">
        <div class="svc-icon">📋</div>
        <div class="svc-title">Quotes & Rate Management</div>
        <p class="svc-desc">Transparent rate cards, EG supplier benchmarking and formal quote-to-invoice management through our operations platform.</p>
      </div>
    </div>
  </div>
</section>

<div class="flame-line"></div>

<!-- FLEET -->
<section id="fleet" class="fleet-bg" style="padding:80px 24px">
  <div class="section-inner">
    <div class="eyebrow">Transport Capability</div>
    <h2 class="section-title">Verified Fleet Register</h2>
    <p class="section-desc">Every vehicle verified, classed and rated. EG benchmark vs B&W fleet hire — transparent pricing, every time.</p>
    <div class="fleet-grid">
      <div class="fleet-card fade-up">
        <div class="fleet-icon">🛻</div>
        <div class="fleet-class">Class L1</div>
        <div class="fleet-name">Isuzu Bakkie × 2</div>
        <div class="fleet-detail">1-ton · R1,500/day</div>
      </div>
      <div class="fleet-card fade-up">
        <div class="fleet-icon">🚐</div>
        <div class="fleet-class">Class L2 · 6 units</div>
        <div class="fleet-name">Hyundai, Hino, Tata, Dyna</div>
        <div class="fleet-detail">~4-ton · R3,500/trip EG</div>
      </div>
      <div class="fleet-card fade-up">
        <div class="fleet-icon">🚛</div>
        <div class="fleet-class">Class L3</div>
        <div class="fleet-name">FAW 15.180FL × 2</div>
        <div class="fleet-detail">8-ton · R4,500/trip EG</div>
      </div>
      <div class="fleet-card fade-up">
        <div class="fleet-icon">🚚</div>
        <div class="fleet-class">Class L4 · Flagship</div>
        <div class="fleet-name">Mercedes Atego 1418 × 2</div>
        <div class="fleet-detail">14-ton GVM · R5,000/trip EG</div>
      </div>
      <div class="fleet-card fade-up">
        <div class="fleet-icon">🏗️</div>
        <div class="fleet-class">Class L4 · Heavy</div>
        <div class="fleet-name">FAW 10-ton / MAN 10-ton</div>
        <div class="fleet-detail">10-ton · R10,900/trip (Mega)</div>
      </div>
    </div>
  </div>
</section>

<div class="flame-line"></div>

<!-- PARTNERS -->
<div class="partners-band" id="partners">
  <div class="section-inner">
    <div class="partners-label">Brands &amp; Partners We Work With</div>
    <div class="partners-logos">
      <span class="partner-pill hl">SAB / AB InBev</span>
      <span class="partner-pill hl">Castle Lite</span>
      <span class="partner-pill">Heineken</span>
      <span class="partner-pill">Stella Artois</span>
      <span class="partner-pill">Smirnoff</span>
      <span class="partner-pill">EG Logistics</span>
      <span class="partner-pill">Inkredible Print</span>
      <span class="partner-pill">Ultra SA</span>
      <span class="partner-pill">Control A</span>
      <span class="partner-pill">Stage One</span>
      <span class="partner-pill">Mac-Mahon</span>
    </div>
  </div>
</div>

<div class="flame-line"></div>

<!-- CTA -->
<div class="cta-wrap" id="contact">
  <div class="cta-inner">
    <div class="cta-logo">
      <svg viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg" overflow="visible" width="110" height="110">
        <defs>
          <filter id="cg" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <linearGradient id="cr" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#CC18E8"/><stop offset="33%" stop-color="#FFD400"/>
            <stop offset="66%" stop-color="#18D9FF"/><stop offset="100%" stop-color="#CC18E8"/>
          </linearGradient>
          <linearGradient id="cgd" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#B67A3A"/><stop offset="50%" stop-color="#F0D080"/><stop offset="100%" stop-color="#8A5A2B"/>
          </linearGradient>
        </defs>
        <circle cx="120" cy="120" r="100" fill="none" stroke="url(#cr)" stroke-width="10" filter="url(#cg)" opacity="0.9"/>
        <circle cx="120" cy="120" r="84" fill="none" stroke="url(#cr)" stroke-width="3" opacity="0.32"/>
        <text x="120" y="140" text-anchor="middle" font-family="Georgia,serif" font-size="60" font-weight="900"
          fill="#0d1117" stroke="#0d1117" stroke-width="8">BW</text>
        <text x="120" y="140" text-anchor="middle" font-family="Georgia,serif" font-size="60" font-weight="900"
          fill="url(#cgd)" filter="url(#cg)">BW</text>
      </svg>
    </div>
    <h2 class="cta-title">Ready to Move?</h2>
    <p class="cta-desc">Whether you need one bakkie or a full L4 convoy — our team is classed, rated and ready. BW Productions, Randvaal, Gauteng.</p>
    <div style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap">
      <a href="/login" class="btn-primary"><i class="fas fa-gauge-high"></i> Staff Portal</a>
      <a href="tel:+27000000000" class="btn-secondary"><i class="fas fa-phone"></i> Call Us</a>
    </div>
  </div>
</div>

<!-- FOOTER -->
<footer>
  <div class="footer-inner">
    <div class="footer-top">
      <div class="footer-brand">
        <a class="footer-logo" href="/about">
          <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" overflow="visible" width="38" height="38">
            <defs>
              <filter id="fg" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <linearGradient id="fr" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#CC18E8"/><stop offset="50%" stop-color="#FFD400"/><stop offset="100%" stop-color="#18D9FF"/>
              </linearGradient>
              <linearGradient id="fgd" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#B67A3A"/><stop offset="50%" stop-color="#F0D080"/><stop offset="100%" stop-color="#8A5A2B"/>
              </linearGradient>
            </defs>
            <circle cx="60" cy="60" r="52" fill="none" stroke="url(#fr)" stroke-width="7" filter="url(#fg)" opacity="0.9"/>
            <text x="60" y="70" text-anchor="middle" font-family="Georgia,serif" font-size="28" font-weight="900"
              fill="#0d1117" stroke="#0d1117" stroke-width="4">BW</text>
            <text x="60" y="70" text-anchor="middle" font-family="Georgia,serif" font-size="28" font-weight="900"
              fill="url(#fgd)">BW</text>
          </svg>
          <span class="footer-brand-name">BW PRODUCTIONS</span>
        </a>
        <p>Premier event logistics and production supply chain. Randvaal, Gauteng, South Africa.</p>
      </div>
      <div class="footer-col">
        <h4>Services</h4>
        <ul>
          <li><a href="#services">Fleet Logistics</a></li>
          <li><a href="#services">Event Production</a></li>
          <li><a href="#services">Beverage Supply</a></li>
          <li><a href="#services">Event Print</a></li>
          <li><a href="#services">Crew &amp; Labour</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>Company</h4>
        <ul>
          <li><a href="#fleet">Fleet Register</a></li>
          <li><a href="#partners">Partners</a></li>
          <li><a href="#contact">Contact</a></li>
          <li><a href="/login">Staff Login</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>Contact</h4>
        <ul>
          <li><a href="#">Randvaal, 1943</a></li>
          <li><a href="#">Gauteng, South Africa</a></li>
          <li><a href="tel:+27000000000">+27 (0) 00 000 0000</a></li>
          <li><a href="mailto:ops@bwproductions.co.za">ops@bwproductions.co.za</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <div class="footer-copy">© 2026 BW Productions. All rights reserved.</div>
      <div class="footer-vat">VAT Reg: 4790261301</div>
    </div>
  </div>
</footer>

<script>
  // Scroll animations
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((e, i) => {
      if (e.isIntersecting) {
        setTimeout(() => e.target.classList.add('visible'), i * 80)
        obs.unobserve(e.target)
      }
    })
  }, { threshold: 0.08 })
  document.querySelectorAll('.fade-up').forEach(el => obs.observe(el))

  // Nav shrink on scroll
  window.addEventListener('scroll', () => {
    document.getElementById('nav').style.padding = window.scrollY > 60 ? '10px 48px' : '14px 48px'
  })
</script>
</body>
</html>`
