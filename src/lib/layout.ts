// Shared HTML layout for B&W Productions Ops Platform

import type { AuthUser } from './auth.js'
import { ROLE_LABELS } from './auth.js'

export function layout(title: string, body: string, user: AuthUser, activeNav?: string): string {
  const nav = [
    { href: '/',            icon: '⚡', label: 'Dashboard',   key: 'dashboard',  roles: ['founder','ops_director','finance_director','account_director','crew'] },
    { href: '/events',      icon: '📅', label: 'Events',      key: 'events',     roles: ['founder','ops_director','finance_director','account_director'] },
    { href: '/quotes',      icon: '📋', label: 'Quotes',      key: 'quotes',     roles: ['founder','ops_director','finance_director','account_director'] },
    { href: '/fleet',       icon: '🚛', label: 'Fleet',       key: 'fleet',      roles: ['founder','ops_director'] },
    { href: '/suppliers',   icon: '🤝', label: 'Suppliers',   key: 'suppliers',  roles: ['founder','ops_director','finance_director'] },
    { href: '/rate-card',   icon: '💰', label: 'Rate Card',   key: 'rate-card',  roles: ['founder','ops_director','finance_director'] },
    { href: '/clients',     icon: '🏢', label: 'Clients',     key: 'clients',    roles: ['founder','ops_director','finance_director','account_director'] },
  ]

  const visibleNav = nav.filter(n => (n.roles as string[]).includes(user.role))

  const navLinks = visibleNav.map(n => `
    <a href="${n.href}" class="nav-link${activeNav === n.key ? ' active' : ''}">
      <span class="nav-icon">${n.icon}</span>
      <span class="nav-label">${n.label}</span>
    </a>`).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — B&W Productions Ops</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bw-black: #0a0a0a;
      --bw-dark: #111111;
      --bw-card: #1a1a1a;
      --bw-border: #2a2a2a;
      --bw-border2: #333;
      --bw-gold: #d4a843;
      --bw-gold-light: #e8c06a;
      --bw-white: #f5f5f5;
      --bw-muted: #888;
      --bw-success: #10b981;
      --bw-warn: #f59e0b;
      --bw-danger: #ef4444;
      --bw-info: #3b82f6;
      --bw-purple: #8b5cf6;
      --sidebar-w: 220px;
    }

    body {
      font-family: 'Inter', sans-serif;
      background: var(--bw-black);
      color: var(--bw-white);
      min-height: 100vh;
      display: flex;
      font-size: 14px;
      line-height: 1.5;
    }

    /* SIDEBAR */
    .sidebar {
      width: var(--sidebar-w);
      min-height: 100vh;
      background: var(--bw-dark);
      border-right: 1px solid var(--bw-border);
      display: flex;
      flex-direction: column;
      position: fixed;
      left: 0; top: 0; bottom: 0;
      z-index: 100;
      overflow-y: auto;
    }

    .sidebar-brand {
      padding: 20px 16px 16px;
      border-bottom: 1px solid var(--bw-border);
    }

    .brand-logo {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 4px;
    }

    .brand-mark {
      width: 36px; height: 36px;
      background: var(--bw-gold);
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-weight: 800; font-size: 16px; color: #000;
      flex-shrink: 0;
    }

    .brand-name {
      font-size: 15px; font-weight: 700; color: var(--bw-white);
      line-height: 1.2;
    }

    .brand-sub {
      font-size: 10px; color: var(--bw-muted); font-weight: 400;
      letter-spacing: 0.05em; text-transform: uppercase;
      padding-left: 46px;
    }

    .sidebar-nav {
      flex: 1;
      padding: 12px 8px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .nav-link {
      display: flex; align-items: center; gap: 10px;
      padding: 9px 10px;
      border-radius: 8px;
      color: var(--bw-muted);
      text-decoration: none;
      font-size: 13px; font-weight: 500;
      transition: all 0.15s;
    }

    .nav-link:hover { background: var(--bw-border); color: var(--bw-white); }
    .nav-link.active { background: var(--bw-gold); color: #000; font-weight: 600; }
    .nav-link.active .nav-icon { filter: none; }
    .nav-icon { font-size: 15px; width: 20px; text-align: center; }

    .sidebar-user {
      padding: 12px 16px;
      border-top: 1px solid var(--bw-border);
      display: flex; align-items: center; gap: 10px;
    }

    .user-avatar {
      width: 32px; height: 32px;
      background: var(--bw-gold);
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 13px; color: #000;
      flex-shrink: 0;
    }

    .user-name { font-size: 12px; font-weight: 600; color: var(--bw-white); }
    .user-role { font-size: 10px; color: var(--bw-muted); }

    .logout-btn {
      margin-left: auto;
      color: var(--bw-muted);
      text-decoration: none;
      font-size: 16px;
      transition: color 0.15s;
    }
    .logout-btn:hover { color: var(--bw-danger); }

    /* MAIN */
    .main {
      margin-left: var(--sidebar-w);
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }

    .topbar {
      padding: 16px 28px;
      border-bottom: 1px solid var(--bw-border);
      display: flex; align-items: center; justify-content: space-between;
      position: sticky; top: 0; z-index: 50;
      background: var(--bw-black);
    }

    .page-title {
      font-size: 20px; font-weight: 700; color: var(--bw-white);
    }

    .topbar-actions { display: flex; gap: 10px; align-items: center; }

    .content { padding: 24px 28px; flex: 1; }

    /* CARDS */
    .card {
      background: var(--bw-card);
      border: 1px solid var(--bw-border);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 20px;
    }

    .card-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 16px;
    }

    .card-title {
      font-size: 15px; font-weight: 600; color: var(--bw-white);
    }

    /* STATS GRID */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .stat-card {
      background: var(--bw-card);
      border: 1px solid var(--bw-border);
      border-radius: 12px;
      padding: 18px 20px;
    }

    .stat-label { font-size: 11px; color: var(--bw-muted); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 500; margin-bottom: 6px; }
    .stat-value { font-size: 26px; font-weight: 700; color: var(--bw-white); }
    .stat-sub { font-size: 11px; color: var(--bw-muted); margin-top: 2px; }
    .stat-gold { border-left: 3px solid var(--bw-gold); }
    .stat-green { border-left: 3px solid var(--bw-success); }
    .stat-warn { border-left: 3px solid var(--bw-warn); }
    .stat-danger { border-left: 3px solid var(--bw-danger); }

    /* TABLE */
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    thead th {
      text-align: left; padding: 10px 12px;
      font-size: 11px; font-weight: 600; color: var(--bw-muted);
      text-transform: uppercase; letter-spacing: 0.06em;
      border-bottom: 1px solid var(--bw-border);
    }
    tbody tr { border-bottom: 1px solid var(--bw-border); transition: background 0.1s; }
    tbody tr:last-child { border-bottom: none; }
    tbody tr:hover { background: rgba(255,255,255,0.03); }
    tbody td { padding: 10px 12px; color: var(--bw-white); vertical-align: middle; }
    td.muted { color: var(--bw-muted); }
    td.mono { font-family: 'Courier New', monospace; font-size: 12px; }

    /* BUTTONS */
    .btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 8px 16px; border-radius: 8px;
      font-size: 13px; font-weight: 600;
      border: none; cursor: pointer; text-decoration: none;
      transition: all 0.15s;
    }
    .btn-gold { background: var(--bw-gold); color: #000; }
    .btn-gold:hover { background: var(--bw-gold-light); }
    .btn-outline { background: transparent; color: var(--bw-white); border: 1px solid var(--bw-border2); }
    .btn-outline:hover { background: var(--bw-border); }
    .btn-danger { background: var(--bw-danger); color: #fff; }
    .btn-danger:hover { background: #dc2626; }
    .btn-success { background: var(--bw-success); color: #fff; }
    .btn-sm { padding: 4px 10px; font-size: 12px; border-radius: 6px; }
    .btn-icon { padding: 6px; border-radius: 6px; font-size: 14px; }

    /* FORMS */
    .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
    .form-group { display: flex; flex-direction: column; gap: 6px; }
    .form-group.full { grid-column: 1 / -1; }
    label { font-size: 12px; font-weight: 500; color: var(--bw-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    input, select, textarea {
      background: var(--bw-black); border: 1px solid var(--bw-border2);
      border-radius: 8px; padding: 9px 12px;
      color: var(--bw-white); font-family: 'Inter', sans-serif; font-size: 13px;
      transition: border-color 0.15s;
      width: 100%;
    }
    input:focus, select:focus, textarea:focus {
      outline: none; border-color: var(--bw-gold);
    }
    select option { background: var(--bw-dark); }
    textarea { resize: vertical; min-height: 80px; }

    /* ALERTS */
    .alert { padding: 12px 16px; border-radius: 8px; font-size: 13px; margin-bottom: 16px; }
    .alert-success { background: rgba(16,185,129,0.15); border: 1px solid var(--bw-success); color: var(--bw-success); }
    .alert-error { background: rgba(239,68,68,0.15); border: 1px solid var(--bw-danger); color: var(--bw-danger); }
    .alert-warn { background: rgba(245,158,11,0.15); border: 1px solid var(--bw-warn); color: var(--bw-warn); }
    .alert-info { background: rgba(59,130,246,0.15); border: 1px solid var(--bw-info); color: var(--bw-info); }

    /* BADGES */
    .badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; }
    .badge-gold { background: rgba(212,168,67,0.2); color: var(--bw-gold); border: 1px solid var(--bw-gold); }
    .badge-sab { background: #1e3a5f; color: #60a5fa; border: 1px solid #3b82f6; font-size: 10px; }

    /* FLEX UTILS */
    .flex { display: flex; }
    .items-center { align-items: center; }
    .justify-between { justify-content: space-between; }
    .gap-2 { gap: 8px; }
    .gap-3 { gap: 12px; }
    .mt-2 { margin-top: 8px; }
    .mt-4 { margin-top: 16px; }
    .mb-2 { margin-bottom: 8px; }
    .text-muted { color: var(--bw-muted); }
    .text-gold { color: var(--bw-gold); }
    .text-success { color: var(--bw-success); }
    .text-danger { color: var(--bw-danger); }
    .text-warn { color: var(--bw-warn); }
    .text-right { text-align: right; }
    .font-bold { font-weight: 700; }
    .font-mono { font-family: 'Courier New', monospace; }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; }

    /* MOBILE */
    .mobile-menu-btn {
      display: none;
      background: none; border: none; color: var(--bw-white);
      font-size: 20px; cursor: pointer; padding: 4px;
    }

    @media (max-width: 768px) {
      .sidebar { transform: translateX(-100%); transition: transform 0.2s; }
      .sidebar.open { transform: translateX(0); }
      .main { margin-left: 0; }
      .mobile-menu-btn { display: block; }
      .content { padding: 16px; }
      .topbar { padding: 12px 16px; }
      .stats-grid { grid-template-columns: repeat(2, 1fr); }
      .form-grid { grid-template-columns: 1fr; }
      .hide-mobile { display: none; }
    }
  </style>
</head>
<body>
  <nav class="sidebar" id="sidebar">
    <div class="sidebar-brand">
      <div class="brand-logo">
        <div class="brand-mark">B&W</div>
        <div class="brand-name">B&amp;W Productions</div>
      </div>
      <div class="brand-sub">Ops Platform v1</div>
    </div>
    <div class="sidebar-nav">
      ${navLinks}
    </div>
    <div class="sidebar-user">
      <div class="user-avatar">${user.name.charAt(0)}</div>
      <div>
        <div class="user-name">${user.name.split(' ')[0]}</div>
        <div class="user-role">${ROLE_LABELS[user.role]}</div>
      </div>
      <a href="/logout" class="logout-btn" title="Logout"><i class="fas fa-sign-out-alt"></i></a>
    </div>
  </nav>

  <main class="main">
    <div class="topbar">
      <div class="flex items-center gap-2">
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
    // Close sidebar on mobile when clicking outside
    document.addEventListener('click', function(e) {
      const sidebar = document.getElementById('sidebar')
      const menuBtn = document.querySelector('.mobile-menu-btn')
      if (window.innerWidth <= 768 && sidebar.classList.contains('open')) {
        if (!sidebar.contains(e.target) && e.target !== menuBtn) {
          sidebar.classList.remove('open')
        }
      }
    })
  </script>
</body>
</html>`
}

export function loginPage(error?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login — B&W Productions Ops</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', sans-serif;
      background: #0a0a0a;
      color: #f5f5f5;
      min-height: 100vh;
      display: flex; align-items: center; justify-content: center;
      padding: 20px;
    }
    .login-card {
      background: #111;
      border: 1px solid #2a2a2a;
      border-radius: 16px;
      padding: 40px;
      width: 100%; max-width: 400px;
    }
    .brand { text-align: center; margin-bottom: 32px; }
    .brand-mark {
      width: 56px; height: 56px;
      background: #d4a843; border-radius: 12px;
      display: flex; align-items: center; justify-content: center;
      font-size: 22px; font-weight: 800; color: #000;
      margin: 0 auto 12px;
    }
    .brand-name { font-size: 20px; font-weight: 700; }
    .brand-sub { font-size: 12px; color: #888; margin-top: 2px; letter-spacing: 0.05em; text-transform: uppercase; }
    .form-group { margin-bottom: 16px; }
    label { display: block; font-size: 12px; font-weight: 500; color: #888; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
    input {
      width: 100%; background: #0a0a0a; border: 1px solid #333;
      border-radius: 8px; padding: 10px 14px;
      color: #f5f5f5; font-family: 'Inter', sans-serif; font-size: 14px;
    }
    input:focus { outline: none; border-color: #d4a843; }
    .btn-login {
      width: 100%; padding: 12px; border-radius: 8px;
      background: #d4a843; color: #000;
      border: none; font-size: 14px; font-weight: 700;
      cursor: pointer; transition: background 0.15s; margin-top: 8px;
    }
    .btn-login:hover { background: #e8c06a; }
    .error { background: rgba(239,68,68,0.15); border: 1px solid #ef4444; color: #ef4444; padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 16px; }
    .hint { font-size: 11px; color: #555; text-align: center; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="login-card">
    <div class="brand">
      <div class="brand-mark">B&W</div>
      <div class="brand-name">B&amp;W Productions</div>
      <div class="brand-sub">Internal Operations Platform</div>
    </div>
    ${error ? `<div class="error">⚠ ${error}</div>` : ''}
    <form method="POST" action="/login">
      <div class="form-group">
        <label>Email Address</label>
        <input type="email" name="email" placeholder="you@bwproductions.co.za" required autofocus>
      </div>
      <div class="form-group">
        <label>Password</label>
        <input type="password" name="password" placeholder="••••••••" required>
      </div>
      <button type="submit" class="btn-login">Sign In →</button>
    </form>
    <div class="hint">B&W Productions · VAT 4790261301 · Randvaal, 1943</div>
  </div>
</body>
</html>`
}
