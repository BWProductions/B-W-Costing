// Shared HTML layout for B&W Productions Ops Platform — CI v2.0

import type { AuthUser } from './auth.js'
import { ROLE_LABELS } from './auth.js'

// BW Productions CI colours extracted from logo analysis:
// Navy bg: #0d1117  Card: #161b22  Border: #21262d
// Gold:    #C9A84C  Gold-lt: #F0D080  Gold-dk: #8B6914
// Flame rainbow: magenta #CC18E8 → red #FF4A1C → orange #FF7A00 → yellow #FFD400 → green #7CFF2B → cyan #18D9FF → blue #1D6BFF
// "PRODUCTIONS" text: bronze-gold gradient #B67A3A → #D39A52 → #8A5A2B

const FLAME_RING_SVG = `<img src="/static/bw-logo.png" alt="BW Productions" style="width:100%;height:100%;object-fit:contain;display:block">`

export function layout(title: string, body: string, user: AuthUser, activeNav?: string): string {
  type NavLeaf = { href: string; icon: string; label: string; key: string; roles: string[] }
  type NavGroup = { groupKey: string; groupLabel: string; groupIcon: string; roles: string[]; children: NavLeaf[] }
  type NavItem = NavLeaf | NavGroup

  const nav: NavItem[] = [
    { href: '/',                          icon: 'fa-gauge-high',       label: 'Dashboard',      key: 'dashboard',      roles: ['founder','ops_director','finance_director','account_director','crew'] },
    { href: '/events',                    icon: 'fa-calendar-days',    label: 'Events',         key: 'events',         roles: ['founder','ops_director','finance_director','account_director'] },
    { href: '/quotes',                    icon: 'fa-file-invoice',     label: 'Quotes',         key: 'quotes',         roles: ['founder','ops_director','finance_director','account_director'] },
    { href: '/fleet',                     icon: 'fa-truck',            label: 'Fleet',          key: 'fleet',          roles: ['founder','ops_director'] },
    { href: '/suppliers',                 icon: 'fa-handshake',        label: 'Suppliers',      key: 'suppliers',      roles: ['founder','ops_director','finance_director'] },
    { href: '/rate-card',                 icon: 'fa-tags',             label: 'Rate Card',      key: 'rate-card',      roles: ['founder','ops_director','finance_director'] },
    { href: '/clients',                   icon: 'fa-building',         label: 'Clients',        key: 'clients',        roles: ['founder','ops_director','finance_director','account_director'] },
    { href: '/question-sheet',            icon: 'fa-clipboard-list',   label: 'Question Sheet', key: 'question-sheet', roles: ['founder','ops_director','account_director'] },
    { href: '/print-sheets/rate-card-print', icon: 'fa-print',        label: 'Print Sheets',   key: 'handbook',       roles: ['founder','ops_director','finance_director'] },
    { href: '/field',                      icon: 'fa-clipboard-check', label: 'Field Ops',      key: 'field',          roles: ['founder','ops_director','account_director','crew'] },
    { href: '/field/admin',               icon: 'fa-inbox',            label: 'Field Admin',    key: 'field-admin',    roles: ['founder','ops_director'] },
    { href: '/field/admin/planner-extractor', icon: 'fa-calendar-week', label: 'Planner Extractor', key: 'planner-extractor', roles: ['founder','ops_director','finance_director','account_director','crew'] },
    { href: '/field/admin/damages',       icon: 'fa-triangle-exclamation', label: 'Vehicle Damages', key: 'damages',     roles: ['founder','ops_director','finance_director','account_director','crew'] },
    { href: '/field/admin/products',      icon: 'fa-boxes-stacked',    label: 'Master Products',key: 'products',       roles: ['founder','ops_director','finance_director','account_director','crew'] },
    { href: '/field/admin/email-digest',  icon: 'fa-envelope',         label: 'Accounts Email',  key: 'email-digest',  roles: ['founder','ops_director','finance_director'] },
    // ── Music Bus group (collapsible) ─────────────────────────────────────────────
    {
      groupKey: 'musicbus', groupLabel: 'Music Bus', groupIcon: 'fa-music',
      roles: ['founder','ops_director'],
      children: [
        { href: '/musicbus',                          icon: 'fa-mobile-screen',         label: 'Driver App',        key: 'musicbus-app',      roles: ['founder','ops_director'] },
        { href: '/field/admin/musicbus-drivers',      icon: 'fa-users',                 label: 'Drivers',           key: 'musicbus-drivers',  roles: ['founder','ops_director'] },
        { href: '/field/admin/musicbus-vehicles',     icon: 'fa-bus',                   label: 'Vehicles',          key: 'musicbus-vehicles', roles: ['founder','ops_director'] },
        { href: '/field/admin/musicbus-damages',      icon: 'fa-clipboard-list',        label: 'Inspections',       key: 'musicbus-damages',  roles: ['founder','ops_director'] },
      ]
    },
    { href: '/admin',                     icon: 'fa-gear',             label: 'Admin',          key: 'admin',          roles: ['founder'] },
    { href: '/account',                   icon: 'fa-circle-user',      label: 'My Account',     key: 'account',        roles: ['founder','ops_director','finance_director','account_director','crew'] },
  ]

  // Type guard
  const isGroup = (n: NavItem): n is NavGroup => (n as NavGroup).children !== undefined

  const renderLeaf = (n: NavLeaf, indent = false) => `
    <a href="${n.href}" class="nav-link${activeNav === n.key ? ' active' : ''}${indent ? ' nav-sub' : ''}">
      <span class="nav-icon"><i class="fas ${n.icon}"></i></span>
      <span class="nav-label">${n.label}</span>
    </a>`

  const navLinks = nav
    .filter(n => (n.roles as string[]).includes(user.role))
    .map(n => {
      if (!isGroup(n)) return renderLeaf(n)
      // Group: filter children by role, hide entire group if no children visible
      const visibleChildren = n.children.filter(c => c.roles.includes(user.role))
      if (visibleChildren.length === 0) return ''
      // Is any child of this group the active page? (auto-open)
      const groupActive = visibleChildren.some(c => c.key === activeNav)
      return `
      <div class="nav-group${groupActive ? ' open' : ''}" data-group="${n.groupKey}">
        <button type="button" class="nav-link nav-group-toggle" onclick="this.parentElement.classList.toggle('open')">
          <span class="nav-icon"><i class="fas ${n.groupIcon}"></i></span>
          <span class="nav-label">${n.groupLabel}</span>
          <span class="nav-chev"><i class="fas fa-chevron-down"></i></span>
        </button>
        <div class="nav-group-children">
          ${visibleChildren.map(c => renderLeaf(c, true)).join('')}
        </div>
      </div>`
    })
    .join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — BW Productions</title>
  <!-- ── BW Productions branding (favicon + touch icons) ── -->
  <link rel="icon" type="image/png" sizes="32x32" href="/static/favicon-32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="/static/favicon-16.png">
  <link rel="icon" type="image/png" sizes="192x192" href="/static/favicon-192.png">
  <link rel="shortcut icon" href="/static/favicon.ico">
  <link rel="apple-touch-icon" sizes="180x180" href="/static/apple-touch-icon.png">
  <meta name="theme-color" content="#0A0A0A">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;900&family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      /* BW Productions CI */
      --navy:       #0d1117;
      --navy-mid:   #161b22;
      --navy-card:  #1c2230;
      --navy-border:#21262d;
      --navy-hover: #252d3d;
      /* Gold */
      --gold:       #C9A84C;
      --gold-lt:    #F0D080;
      --gold-dk:    #8B6914;
      --gold-metal: linear-gradient(135deg, #B67A3A 0%, #F0D080 40%, #D39A52 60%, #8A5A2B 100%);
      /* Flame rainbow */
      --magenta:    #CC18E8;
      --red-flame:  #FF4A1C;
      --orange:     #FF7A00;
      --yellow:     #FFD400;
      --green-flame:#7CFF2B;
      --cyan:       #18D9FF;
      --blue-flame: #1D6BFF;
      /* Status */
      --success:    #10b981;
      --warn:       #f59e0b;
      --danger:     #ef4444;
      --info:       #3b82f6;
      /* Layout */
      --sidebar-w:  230px;
      --white:      #f0f4ff;
      --muted:      #6b7589;
    }

    html { scroll-behavior: smooth; }

    body {
      font-family: 'Inter', sans-serif;
      background: var(--navy);
      color: var(--white);
      min-height: 100vh;
      display: flex;
      font-size: 14px;
      line-height: 1.5;
    }

    /* ══════════════════════════════════
       SIDEBAR
    ══════════════════════════════════ */
    .sidebar {
      width: var(--sidebar-w);
      min-height: 100vh;
      background: var(--navy-mid);
      border-right: 1px solid var(--navy-border);
      display: flex;
      flex-direction: column;
      position: fixed;
      left: 0; top: 0; bottom: 0;
      z-index: 100;
      overflow-y: auto;
    }

    .sidebar-brand {
      padding: 20px 16px 18px;
      border-bottom: 1px solid var(--navy-border);
      display: flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
    }

    .brand-ring {
      width: 80px;
      height: 80px;
      flex-shrink: 0;
      position: relative;
      filter: drop-shadow(0 0 12px rgba(201,168,76,0.35));
    }

    .brand-text-wrap { display: flex; flex-direction: column; }

    .brand-name {
      font-family: 'Cinzel', serif;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.04em;
      background: var(--gold-metal);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      line-height: 1.2;
    }

    .brand-sub {
      font-size: 9px;
      color: var(--muted);
      letter-spacing: 0.12em;
      text-transform: uppercase;
      margin-top: 2px;
    }

    .sidebar-nav {
      flex: 1;
      padding: 14px 10px;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .nav-section-label {
      font-size: 9px;
      font-weight: 600;
      color: var(--muted);
      letter-spacing: 0.12em;
      text-transform: uppercase;
      padding: 10px 8px 4px;
      margin-top: 4px;
    }

    .nav-link {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 10px;
      border-radius: 8px;
      color: var(--muted);
      text-decoration: none;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.15s;
      position: relative;
    }

    .nav-link:hover {
      background: var(--navy-hover);
      color: var(--white);
    }

    .nav-link.active {
      background: linear-gradient(90deg, rgba(201,168,76,0.15) 0%, rgba(201,168,76,0.05) 100%);
      color: var(--gold-lt);
      font-weight: 600;
    }

    .nav-link.active::before {
      content: '';
      position: absolute;
      left: 0; top: 20%; bottom: 20%;
      width: 3px;
      background: linear-gradient(180deg, var(--magenta), var(--cyan));
      border-radius: 0 2px 2px 0;
    }

    .nav-icon {
      font-size: 14px;
      width: 20px;
      text-align: center;
      opacity: 0.8;
    }

    .nav-link.active .nav-icon { opacity: 1; }

    /* ── Nested nav groups (Music Bus) ── */
    .nav-group { display: flex; flex-direction: column; gap: 2px; }
    .nav-group-toggle {
      width: 100%;
      background: transparent;
      border: none;
      cursor: pointer;
      font-family: inherit;
      text-align: left;
      gap: 10px;
    }
    .nav-group-toggle .nav-chev {
      margin-left: auto;
      font-size: 9px;
      opacity: 0.5;
      transition: transform 0.2s;
    }
    .nav-group.open .nav-group-toggle .nav-chev { transform: rotate(180deg); opacity: 0.9; }
    .nav-group-children {
      display: none;
      flex-direction: column;
      gap: 2px;
      padding-left: 6px;
      margin: 2px 0 4px;
      border-left: 2px solid rgba(255,255,255,0.06);
      margin-left: 14px;
    }
    .nav-group.open .nav-group-children { display: flex; }
    .nav-link.nav-sub {
      padding: 7px 10px 7px 14px;
      font-size: 12.5px;
    }
    .nav-link.nav-sub .nav-icon { font-size: 12px; opacity: 0.65; }

    .sidebar-user {
      padding: 14px 16px;
      border-top: 1px solid var(--navy-border);
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .user-avatar {
      width: 34px;
      height: 34px;
      background: linear-gradient(135deg, var(--magenta), var(--blue-flame));
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 13px;
      color: #fff;
      flex-shrink: 0;
      box-shadow: 0 0 12px rgba(204,24,232,0.4);
    }

    .user-name { font-size: 12px; font-weight: 600; color: var(--white); }
    .user-role { font-size: 10px; color: var(--muted); }

    .logout-btn {
      margin-left: auto;
      color: var(--muted);
      text-decoration: none;
      font-size: 15px;
      transition: color 0.15s;
    }
    .logout-btn:hover { color: var(--danger); }

    /* ══════════════════════════════════
       MAIN CONTENT
    ══════════════════════════════════ */
    .main {
      margin-left: var(--sidebar-w);
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }

    .topbar {
      padding: 14px 28px;
      border-bottom: 1px solid var(--navy-border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 50;
      background: rgba(13,17,23,0.95);
      backdrop-filter: blur(12px);
    }

    .topbar-left { display: flex; align-items: center; gap: 12px; }

    .page-title {
      font-size: 18px;
      font-weight: 700;
      color: var(--white);
      font-family: 'Cinzel', serif;
      letter-spacing: 0.02em;
    }

    .topbar-actions { display: flex; gap: 10px; align-items: center; }

    .content { padding: 24px 28px; flex: 1; }

    /* ══════════════════════════════════
       CARDS
    ══════════════════════════════════ */
    .card {
      background: var(--navy-card);
      border: 1px solid var(--navy-border);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 20px;
    }

    .card-glow {
      box-shadow: 0 0 0 1px var(--navy-border), 0 4px 24px rgba(201,168,76,0.06);
    }

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }

    .card-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--white);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .card-title-icon {
      width: 28px; height: 28px;
      border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      font-size: 13px;
      background: rgba(201,168,76,0.12);
      color: var(--gold);
    }

    /* ══════════════════════════════════
       STATS GRID
    ══════════════════════════════════ */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .stat-card {
      background: var(--navy-card);
      border: 1px solid var(--navy-border);
      border-radius: 12px;
      padding: 18px 20px;
      position: relative;
      overflow: hidden;
      transition: transform 0.15s, box-shadow 0.15s;
    }

    .stat-card:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    }

    .stat-card::after {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 2px;
    }

    .stat-gold::after  { background: linear-gradient(90deg, var(--gold-dk), var(--gold-lt)); }
    .stat-green::after { background: linear-gradient(90deg, #065f46, var(--success)); }
    .stat-warn::after  { background: linear-gradient(90deg, #92400e, var(--warn)); }
    .stat-danger::after{ background: linear-gradient(90deg, #7f1d1d, var(--danger)); }
    .stat-flame::after { background: linear-gradient(90deg, var(--magenta), var(--cyan)); }

    .stat-label {
      font-size: 10px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.1em;
      font-weight: 600;
      margin-bottom: 8px;
    }

    .stat-value {
      font-size: 28px;
      font-weight: 800;
      color: var(--white);
      line-height: 1;
    }

    .stat-sub {
      font-size: 11px;
      color: var(--muted);
      margin-top: 6px;
    }

    /* ══════════════════════════════════
       TABLES
    ══════════════════════════════════ */
    .table-wrap { overflow-x: auto; }

    table { width: 100%; border-collapse: collapse; font-size: 13px; }

    thead th {
      text-align: left;
      padding: 10px 12px;
      font-size: 10px;
      font-weight: 700;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      border-bottom: 1px solid var(--navy-border);
      background: rgba(255,255,255,0.02);
    }

    tbody tr {
      border-bottom: 1px solid rgba(33,38,45,0.8);
      transition: background 0.1s;
    }

    tbody tr:last-child { border-bottom: none; }
    tbody tr:hover { background: rgba(201,168,76,0.04); }

    tbody td {
      padding: 11px 12px;
      color: var(--white);
      vertical-align: middle;
    }

    td.muted { color: var(--muted); }
    td.mono  { font-family: 'Courier New', monospace; font-size: 12px; }
    td.gold  { color: var(--gold); font-weight: 600; }

    /* ══════════════════════════════════
       BUTTONS
    ══════════════════════════════════ */
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      border: none;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.15s;
      white-space: nowrap;
    }

    .btn-gold {
      background: linear-gradient(135deg, var(--gold-dk) 0%, var(--gold) 50%, var(--gold-lt) 100%);
      color: #000;
      box-shadow: 0 2px 12px rgba(201,168,76,0.3);
    }

    .btn-gold:hover {
      box-shadow: 0 4px 20px rgba(201,168,76,0.5);
      transform: translateY(-1px);
    }

    .btn-outline {
      background: transparent;
      color: var(--white);
      border: 1px solid var(--navy-border);
    }

    .btn-outline:hover {
      background: var(--navy-hover);
      border-color: var(--muted);
    }

    .btn-flame {
      background: linear-gradient(135deg, var(--magenta), var(--blue-flame));
      color: #fff;
      box-shadow: 0 2px 12px rgba(204,24,232,0.3);
    }

    .btn-flame:hover {
      box-shadow: 0 4px 20px rgba(24,217,255,0.4);
      transform: translateY(-1px);
    }

    .btn-danger { background: var(--danger); color: #fff; }
    .btn-danger:hover { background: #dc2626; }
    .btn-success { background: var(--success); color: #fff; }
    .btn-sm { padding: 5px 11px; font-size: 12px; border-radius: 6px; }
    .btn-icon { padding: 7px; border-radius: 6px; font-size: 14px; }

    /* ══════════════════════════════════
       FORMS
    ══════════════════════════════════ */
    .form-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
    }

    .form-group { display: flex; flex-direction: column; gap: 6px; }
    .form-group.full { grid-column: 1 / -1; }

    label {
      font-size: 11px;
      font-weight: 600;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.07em;
    }

    input, select, textarea {
      background: var(--navy);
      border: 1px solid var(--navy-border);
      border-radius: 8px;
      padding: 9px 12px;
      color: var(--white);
      font-family: 'Inter', sans-serif;
      font-size: 13px;
      transition: border-color 0.15s, box-shadow 0.15s;
      width: 100%;
    }

    input:focus, select:focus, textarea:focus {
      outline: none;
      border-color: var(--gold);
      box-shadow: 0 0 0 3px rgba(201,168,76,0.1);
    }

    select option { background: var(--navy-mid); }
    textarea { resize: vertical; min-height: 80px; }

    /* ══════════════════════════════════
       ALERTS
    ══════════════════════════════════ */
    .alert {
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 13px;
      margin-bottom: 16px;
      display: flex;
      align-items: flex-start;
      gap: 10px;
    }

    .alert-success { background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.3); color: #6ee7b7; }
    .alert-error   { background: rgba(239,68,68,0.1);  border: 1px solid rgba(239,68,68,0.3);  color: #fca5a5; }
    .alert-warn    { background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.3); color: #fcd34d; }
    .alert-info    { background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.3); color: #93c5fd; }

    /* ══════════════════════════════════
       BADGES
    ══════════════════════════════════ */
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 9px;
      border-radius: 20px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .badge-gold    { background: rgba(201,168,76,0.15);  color: var(--gold-lt); border: 1px solid rgba(201,168,76,0.3); }
    .badge-success { background: rgba(16,185,129,0.15);  color: #6ee7b7;       border: 1px solid rgba(16,185,129,0.3); }
    .badge-warn    { background: rgba(245,158,11,0.15);  color: #fcd34d;       border: 1px solid rgba(245,158,11,0.3); }
    .badge-danger  { background: rgba(239,68,68,0.15);   color: #fca5a5;       border: 1px solid rgba(239,68,68,0.3); }
    .badge-info    { background: rgba(59,130,246,0.15);  color: #93c5fd;       border: 1px solid rgba(59,130,246,0.3); }
    .badge-sab     { background: rgba(30,58,95,0.5);     color: #60a5fa;       border: 1px solid rgba(59,130,246,0.3); }
    .badge-flame   { background: linear-gradient(90deg,rgba(204,24,232,0.2),rgba(24,217,255,0.2)); color: #e8b4ff; border: 1px solid rgba(204,24,232,0.3); }

    /* ══════════════════════════════════
       FLAME DIVIDER
    ══════════════════════════════════ */
    .flame-divider {
      height: 1px;
      background: linear-gradient(90deg,
        transparent 0%,
        var(--magenta) 15%,
        var(--orange) 30%,
        var(--yellow) 50%,
        var(--green-flame) 70%,
        var(--cyan) 85%,
        transparent 100%);
      margin: 20px 0;
      opacity: 0.5;
    }

    /* ══════════════════════════════════
       PRIORITY INDICATORS
    ══════════════════════════════════ */
    .priority-high   { color: var(--danger);  }
    .priority-medium { color: var(--warn);    }
    .priority-low    { color: var(--success); }

    /* ══════════════════════════════════
       UTILS
    ══════════════════════════════════ */
    .flex             { display: flex; }
    .items-center     { align-items: center; }
    .justify-between  { justify-content: space-between; }
    .gap-2            { gap: 8px; }
    .gap-3            { gap: 12px; }
    .gap-4            { gap: 16px; }
    .mt-2             { margin-top: 8px; }
    .mt-4             { margin-top: 16px; }
    .mb-2             { margin-bottom: 8px; }
    .mb-4             { margin-bottom: 16px; }
    .text-muted       { color: var(--muted); }
    .text-gold        { color: var(--gold); }
    .text-gold-lt     { color: var(--gold-lt); }
    .text-success     { color: var(--success); }
    .text-danger      { color: var(--danger); }
    .text-warn        { color: var(--warn); }
    .text-right       { text-align: right; }
    .text-center      { text-align: center; }
    .font-bold        { font-weight: 700; }
    .font-mono        { font-family: 'Courier New', monospace; }
    .font-cinzel      { font-family: 'Cinzel', serif; }
    .w-full           { width: 100%; }

    /* ══════════════════════════════════
       MOBILE
    ══════════════════════════════════ */
    .mobile-menu-btn {
      display: none;
      background: none;
      border: none;
      color: var(--white);
      font-size: 20px;
      cursor: pointer;
      padding: 4px;
    }

    @media (max-width: 900px) {
      .sidebar { transform: translateX(-100%); transition: transform 0.25s; box-shadow: none; }
      .sidebar.open { transform: translateX(0); box-shadow: 4px 0 32px rgba(0,0,0,0.6); }
      .main { margin-left: 0; }
      .mobile-menu-btn { display: block; }
      .content { padding: 16px; }
      .topbar { padding: 12px 16px; }
      .stats-grid { grid-template-columns: repeat(2, 1fr); }
      .form-grid { grid-template-columns: 1fr; }
      .hide-mobile { display: none; }
    }

    @media (max-width: 480px) {
      .stats-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <!-- SIDEBAR -->
  <nav class="sidebar" id="sidebar">
    <a class="sidebar-brand" href="/" style="flex-direction:column;align-items:center;text-align:center;padding:20px 12px 16px;gap:6px;">
      <div class="brand-ring">${FLAME_RING_SVG}</div>
      <div class="brand-text-wrap" style="text-align:center;">
        <div class="brand-name" style="font-size:11px;letter-spacing:0.05em;">BW PRODUCTIONS</div>
        <div class="brand-sub">Ops Platform v2</div>
      </div>
    </a>

    <div class="sidebar-nav">
      ${navLinks}
    </div>

    <div class="sidebar-user">
      <div class="user-avatar">${user.name.charAt(0).toUpperCase()}</div>
      <div>
        <div class="user-name">${user.name.split(' ')[0]}</div>
        <div class="user-role">${ROLE_LABELS[user.role]}</div>
      </div>
      <a href="/logout" class="logout-btn" title="Logout"><i class="fas fa-right-from-bracket"></i></a>
    </div>
  </nav>

  <!-- MAIN -->
  <main class="main">
    <div class="topbar">
      <div class="topbar-left">
        <button class="mobile-menu-btn" onclick="document.getElementById('sidebar').classList.toggle('open')">
          <i class="fas fa-bars"></i>
        </button>
        <h1 class="page-title">${title}</h1>
      </div>
      <div class="topbar-actions" id="topbar-actions"></div>
    </div>
    <div class="content">
      ${body}
    </div>
  </main>

  <script>
    // Close sidebar on mobile click-outside
    document.addEventListener('click', function(e) {
      const sidebar = document.getElementById('sidebar')
      const menuBtn = document.querySelector('.mobile-menu-btn')
      if (window.innerWidth <= 900 && sidebar.classList.contains('open')) {
        if (!sidebar.contains(e.target) && e.target !== menuBtn) {
          sidebar.classList.remove('open')
        }
      }
    })
  </script>
</body>
</html>`
}

// ─── LOGIN PAGE ──────────────────────────────────────────────────────────────
export function loginPage(error?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign In — BW Productions</title>
  <!-- ── BW Productions branding (favicon + touch icons) ── -->
  <link rel="icon" type="image/png" sizes="32x32" href="/static/favicon-32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="/static/favicon-16.png">
  <link rel="icon" type="image/png" sizes="192x192" href="/static/favicon-192.png">
  <link rel="shortcut icon" href="/static/favicon.ico">
  <link rel="apple-touch-icon" sizes="180x180" href="/static/apple-touch-icon.png">
  <meta name="theme-color" content="#0A0A0A">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Inter', sans-serif;
      background: #0d1117;
      color: #f0f4ff;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      position: relative;
      overflow: hidden;
    }

    /* Ambient glow blobs */
    body::before {
      content: '';
      position: fixed;
      top: -200px; left: -200px;
      width: 600px; height: 600px;
      background: radial-gradient(circle, rgba(204,24,232,0.08) 0%, transparent 70%);
      pointer-events: none;
    }

    body::after {
      content: '';
      position: fixed;
      bottom: -200px; right: -200px;
      width: 600px; height: 600px;
      background: radial-gradient(circle, rgba(24,217,255,0.08) 0%, transparent 70%);
      pointer-events: none;
    }

    .login-wrap {
      width: 100%; max-width: 420px;
      position: relative; z-index: 1;
    }

    /* Logo area */
    .login-logo {
      text-align: center;
      margin-bottom: 32px;
    }

    .logo-ring {
      width: 280px;
      height: 280px;
      margin: 0 auto 12px;
      position: relative;
      filter: drop-shadow(0 0 48px rgba(201,168,76,0.45));
    }

    .logo-title {
      font-family: 'Cinzel', serif;
      font-size: 30px;
      font-weight: 900;
      letter-spacing: 0.08em;
      background: linear-gradient(135deg, #B67A3A 0%, #F0D080 40%, #D39A52 60%, #8A5A2B 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      line-height: 1.2;
    }

    .logo-sub {
      font-size: 11px;
      color: #6b7589;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      margin-top: 8px;
    }

    /* Card */
    .login-card {
      background: #161b22;
      border: 1px solid #21262d;
      border-radius: 16px;
      padding: 36px;
      box-shadow: 0 8px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(201,168,76,0.05);
    }

    /* Flame top accent */
    .login-card::before {
      content: '';
      display: block;
      height: 2px;
      background: linear-gradient(90deg, transparent, #CC18E8, #FF7A00, #FFD400, #18D9FF, transparent);
      border-radius: 2px 2px 0 0;
      margin: -36px -36px 36px;
    }

    .form-group { margin-bottom: 18px; }

    label {
      display: block;
      font-size: 11px;
      font-weight: 600;
      color: #6b7589;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 7px;
    }

    .input-wrap { position: relative; }

    .input-icon {
      position: absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      color: #6b7589;
      font-size: 13px;
    }

    input {
      width: 100%;
      background: #0d1117;
      border: 1px solid #21262d;
      border-radius: 8px;
      padding: 11px 12px 11px 36px;
      color: #f0f4ff;
      font-family: 'Inter', sans-serif;
      font-size: 14px;
      transition: border-color 0.15s, box-shadow 0.15s;
    }

    input:focus {
      outline: none;
      border-color: #C9A84C;
      box-shadow: 0 0 0 3px rgba(201,168,76,0.12);
    }

    input::placeholder { color: #404655; }

    .btn-login {
      width: 100%;
      padding: 13px;
      border-radius: 8px;
      background: linear-gradient(135deg, #8B6914 0%, #C9A84C 50%, #F0D080 100%);
      color: #000;
      border: none;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
      margin-top: 6px;
      font-family: 'Cinzel', serif;
      letter-spacing: 0.08em;
      box-shadow: 0 4px 16px rgba(201,168,76,0.25);
    }

    .btn-login:hover {
      box-shadow: 0 6px 28px rgba(201,168,76,0.45);
      transform: translateY(-1px);
    }

    .error {
      background: rgba(239,68,68,0.1);
      border: 1px solid rgba(239,68,68,0.3);
      color: #fca5a5;
      padding: 11px 14px;
      border-radius: 8px;
      font-size: 13px;
      margin-bottom: 18px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .footer-hint {
      font-size: 11px;
      color: #404655;
      text-align: center;
      margin-top: 24px;
      letter-spacing: 0.02em;
    }
  </style>
</head>
<body>
  <div class="login-wrap">
    <div class="login-logo">
      <div class="logo-ring">
        <img src="/static/bw-logo.png" alt="BW Productions" style="width:100%;height:100%;object-fit:contain;display:block">
      </div>
      <div class="logo-title">BW PRODUCTIONS</div>
      <div class="logo-sub">Internal Operations Platform</div>
    </div>

    <div class="login-card">
      ${error ? `<div class="error"><i class="fas fa-circle-exclamation"></i> ${error}</div>` : ''}
      <form method="POST" action="/login">
        <div class="form-group">
          <label>Email Address</label>
          <div class="input-wrap">
            <i class="fas fa-envelope input-icon"></i>
            <input type="email" name="email" placeholder="you@bwproductions.co.za" required autofocus>
          </div>
        </div>
        <div class="form-group">
          <label>Password</label>
          <div class="input-wrap">
            <i class="fas fa-lock input-icon"></i>
            <input type="password" name="password" placeholder="••••••••" required>
          </div>
        </div>
        <button type="submit" class="btn-login">Sign In</button>
      </form>
    </div>

    <div class="footer-hint">BW Productions · VAT 4790261301 · Randvaal, 1943</div>
  </div>
</body>
</html>`
}
