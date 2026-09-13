import { Hono } from 'hono'

type Bindings = {
  ANTHROPIC_API_KEY?: string
  DB?: D1Database
}

const ORIGIN = 'https://3c3bcb89.bw-productions.pages.dev'

const WAGES_STAFF_CHOICES = [
  { id: '1', name: 'Givemore Chifetete Kuziwa' },
  { id: '2', name: 'Takavaudza Chokuda (Takka)' },
  { id: '3', name: 'Thina Dyani' },
  { id: '4', name: 'Tsotlego Petrus Malakoane' },
  { id: '5', name: 'Bhekizitha Maphosa (Bheki)' },
  { id: '6', name: 'Isaac Mbele' },
  { id: '7', name: 'John Simbarashe Mhlanga (Jay)' },
  { id: '8', name: 'Erence Mngomezulu' },
  { id: '9', name: 'Erick Mpho Molefe' },
  { id: '10', name: 'Daniel Motaung (Danny)' },
  { id: '11', name: 'Solomon Moyo (Solly)' },
  { id: '12', name: 'Brian Ndlovu (Sipho)' },
  { id: '13', name: 'Patrick Ngozo' },
  { id: '14', name: 'Thandanani Nkala' },
  { id: '15', name: 'Joshua Motsamai Nteo' },
  { id: '16', name: 'Lebo Lebo (Lebo)' },
] as const

const app = new Hono<{ Bindings: Bindings }>()

class DashboardButtonInjector {
  element(element: Element) {
    element.append(
      '<a class="btn btn-outline btn-sm" href="/"><i class="fas fa-gauge-high"></i> Dashboard</a>',
      { html: true },
    )
  }
}

class TeamPickerInitInjector {
  element(element: Element) {
    element.append(
      `<script>
(function () {
  function initTeamPicker() {
    try {
      if (typeof refreshTeamPicker === 'function') refreshTeamPicker()
    } catch (err) {
      console.warn('team picker init failed', err)
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTeamPicker, { once: true })
  } else {
    initTeamPicker()
  }
})();
</script>`,
      { html: true },
    )
  }
}

function renderWagesLandingHtml() {
  const peopleHtml = WAGES_STAFF_CHOICES.map((person) => `
        <a class="person" href="/wages/login?staff=${person.id}">
          <span>${person.name}</span>
          <span class="chev">›</span>
        </a>`).join('\n')

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>Choose your name — B&W Timesheets</title>
  <link rel="icon" href="/static/favicon.ico">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box} html{-webkit-text-size-adjust:100%;text-size-adjust:100%} body{margin:0;background:#f7f8fa;color:#222831;font-family:Inter,system-ui,sans-serif;font-size:17px;line-height:1.5}
    .shell{width:min(860px,100%);margin:auto;padding:38px 28px 80px}.brand{text-align:center;margin:2px 0 38px}.brand img{width:176px;max-height:104px;object-fit:contain}.brand-name{font-weight:800;letter-spacing:.1em;font-size:14px;color:#8b6914;margin-top:7px}
    h1{font-size:clamp(36px,6vw,54px);line-height:1.05;margin:0 0 14px;letter-spacing:-.03em}.lead{color:#626b77;font-size:20px;margin:0 0 32px}.list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.person{display:flex;align-items:center;justify-content:space-between;gap:14px;width:100%;min-height:72px;border:1px solid #d9dee5;background:#fff;color:#222831;padding:20px 22px;border-radius:18px;text-decoration:none;font:inherit;font-size:19px;font-weight:750;cursor:pointer;box-shadow:0 2px 10px #10182808}.person:hover,.person:focus-visible{border-color:#c9a84c;box-shadow:0 7px 24px #00000012;outline:3px solid #c9a84c24}.chev{color:#8d96a2;font-size:28px;line-height:1}
    @media(max-width:720px){.list{grid-template-columns:1fr}}
    @media(max-width:560px){body{font-size:17px}.shell{padding:20px 16px 96px}.brand{margin-bottom:24px}.brand img{width:156px}h1{font-size:38px}.lead{font-size:19px;margin-bottom:26px}.person{min-height:68px;padding:17px 18px;font-size:18px}}
    @media(max-width:360px){h1{font-size:34px}.shell{padding-left:13px;padding-right:13px}}
  </style>
</head>
<body>
  <main class="shell">
    <header class="brand"><img src="/static/bw-logo.png" alt="B&W Productions"><div class="brand-name">TIMESHEETS</div></header>
    <section class="center"><h1>Timesheets</h1><p class="lead">Tap your name to start</p></section>
    <section class="list" aria-label="Weekly wage staff">${peopleHtml}
    </section>
  </main>
</body>
</html>`
}

class WagesUiInjector {
  element(element: Element) {
    element.append(
      `<style>
.bw-return-dashboard { font-weight: 800 !important; color: #8b6914 !important; }
.bw-shift-actions-row { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 14px; }
.bw-shift-actions-row .btn { width: auto; flex: 1 1 220px; }
.bw-add-shift-btn {
  background: linear-gradient(135deg, #111827 0%, #0f172a 100%) !important;
  color: #fff !important;
  border: 0 !important;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.22) !important;
  transition: transform .15s ease, box-shadow .15s ease, filter .15s ease !important;
}
.bw-add-shift-btn:hover,
.bw-add-shift-btn:focus-visible,
.bw-add-shift-btn:active,
.bw-add-shift-btn.bw-is-selected {
  background: linear-gradient(135deg, #111827 0%, #0f172a 100%) !important;
  color: #fff !important;
  box-shadow: 0 14px 30px rgba(15, 23, 42, 0.3) !important;
  filter: brightness(1.04);
  transform: translateY(-1px);
}
.bw-save-temp-btn {
  background: linear-gradient(135deg, #facc15 0%, #f59e0b 100%) !important;
  border: 2px solid #d97706 !important;
  color: #111827 !important;
  box-shadow: 0 10px 24px rgba(245, 158, 11, 0.24) !important;
}
.bw-save-temp-btn:hover,
.bw-save-temp-btn:focus-visible,
.bw-save-temp-btn:active {
  background: linear-gradient(135deg, #fde047 0%, #f59e0b 100%) !important;
  color: #111827 !important;
  box-shadow: 0 12px 28px rgba(245, 158, 11, 0.3) !important;
}
.bw-miss-shift-btn {
  background: linear-gradient(180deg, #ff1e1e 0%, #f60000 100%) !important;
  border: 2px solid #b30000 !important;
  color: #fff !important;
  box-shadow: 0 14px 28px rgba(179, 0, 0, 0.22) !important;
}
.bw-home-shift-stack {
  display: grid;
  gap: 14px;
  margin-top: 14px;
}
.bw-home-shift-stack .btn {
  width: 100% !important;
}
.bw-home-miss-shift-btn {
  display: block;
  width: 100%;
  margin-top: 0;
  padding: 18px 20px;
  border-radius: 18px;
  font-size: 18px;
  font-weight: 800;
  text-align: center;
  text-decoration: none;
}
.bw-final-submit-panel {
  display: grid;
  gap: 12px;
  margin: 18px 0;
  padding: 18px;
  border-radius: 18px;
  border: 2px solid rgba(201, 168, 76, 0.55);
  background: #fffaf0;
}
.bw-final-submit-panel__row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
}
.bw-final-submit-panel__row label {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  font-size: 15px;
}
.bw-final-submit-panel__row input[type="checkbox"] {
  width: 20px;
  height: 20px;
}
.bw-final-submit-go {
  width: auto !important;
  min-width: 220px;
}
.bw-shift-select {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  font-weight: 700;
  color: #526274;
  margin-bottom: 12px;
}
.bw-shift-select input[type="checkbox"] {
  width: 20px;
  height: 20px;
}
.bw-period-tools {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 10px;
}
.bw-last-payroll-btn {
  width: auto !important;
  min-width: 150px;
}
.bw-missed-shift-panel {
  display: grid;
  gap: 12px;
  margin: 18px 0;
  padding: 18px;
  border-radius: 18px;
  border: 2px solid rgba(214, 90, 90, 0.25);
  background: #fff8f8;
}
.bw-missed-shift-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}
.bw-missed-shift-field {
  display: grid;
  gap: 6px;
}
.bw-missed-shift-field label {
  font-size: 14px;
  font-weight: 700;
  color: #6b1020;
}
.bw-missed-shift-field input,
.bw-missed-shift-field select,
.bw-missed-shift-field textarea {
  width: 100%;
}
.bw-readonly-field {
  background: #f8fafc !important;
  color: #475569 !important;
}
.bw-field-shell,
.bw-date-worked-wrap {
  display: grid;
  gap: 8px;
}
body.bw-missed-mode,
html.bw-missed-mode {
  background: #fff4f4 !important;
}
body.bw-missed-mode main,
body.bw-missed-mode .shell {
  background: linear-gradient(180deg, #fff7f7 0%, #fff1f1 100%) !important;
}
body.bw-missed-mode .card,
body.bw-missed-mode .form-card,
body.bw-missed-mode .shift,
body.bw-missed-mode form {
  background: linear-gradient(180deg, #fff1f1 0%, #ffeded 100%) !important;
  border-color: rgba(185, 28, 28, 0.22) !important;
  box-shadow: 0 14px 32px rgba(185, 28, 28, 0.08) !important;
}
body.bw-missed-mode .bw-miss-shift-btn {
  background: linear-gradient(135deg, #b91c1c 0%, #dc2626 100%) !important;
  border-color: #b91c1c !important;
  color: #fff !important;
  box-shadow: 0 12px 28px rgba(185, 28, 28, 0.22) !important;
}
body.bw-missed-mode .bw-miss-shift-status {
  display: none !important;
}
.bw-missed-mode-banner {
  display: none;
  margin: 0 0 18px;
  padding: 14px 18px;
  border-radius: 16px;
  background: linear-gradient(135deg, #7f1d1d 0%, #b91c1c 100%);
  color: #fff;
  font-weight: 800;
  letter-spacing: 0.01em;
  box-shadow: 0 16px 30px rgba(127, 29, 29, 0.16);
}
body.bw-missed-mode .bw-missed-mode-banner {
  display: block;
}
.bw-date-worked-wrap label,
.bw-field-shell label,
label[for="bw-missed-work-date"] {
  font-size: 15px;
  font-weight: 800;
  color: #6b1020;
}
.bw-visible-work-date,
.bw-work-date-field {
  min-height: 54px !important;
  padding: 12px 14px !important;
  border-radius: 14px !important;
  font-size: 18px !important;
  font-weight: 700 !important;
}
.bw-restored-select {
  min-height: 48px !important;
  padding: 10px 12px !important;
  border-radius: 12px !important;
}
.bw-hidden-restored-source {
  position: absolute !important;
  left: -9999px !important;
  width: 1px !important;
  height: 1px !important;
  opacity: 0 !important;
  pointer-events: none !important;
}
.bw-hidden-original-label {
  display: none !important;
}
@media (max-width: 560px) {
  .bw-final-submit-panel__row { align-items: stretch; }
  .bw-final-submit-go, .bw-last-payroll-btn { width: 100% !important; }
  .submit-bar,
  .submit-bar .btn,
  .submit-bar,
  .submit-bar .btn,
  .draft-actions,
  .actions,
  .bw-shift-actions-row,
  .bw-shift-actions-row .btn,
  .bw-save-temp-btn,
  .bw-final-submit-btn {
    position: static !important;
    inset: auto !important;
    top: auto !important;
    right: auto !important;
    bottom: auto !important;
    left: auto !important;
    transform: none !important;
    z-index: auto !important;
  }
  .submit-bar {
    padding-top: 0 !important;
  }
  .submit-bar .btn {
    box-shadow: inherit !important;
  }
}
</style>
<script>
(function () {
  if (window.__bwWagesEnhancerLoaded) return
  window.__bwWagesEnhancerLoaded = true

  const DASHBOARD_PATH = '/admin/wages'
  const WAGES_HOME_PATH = '/wages'
  const LOGOUT_PATH = '/wages/logout'
  const UPSTREAM_ORIGIN = 'https://3c3bcb89.bw-productions.pages.dev'
  const CLAIM_WEEK_STORAGE_KEY = 'bwWagesClaimWeekStart'
  const MISSED_MODE_STORAGE_KEY = 'bwWagesMissedShiftMode'
  const ACTIVE_STAFF_PROFILE_KEY = 'bwWagesActiveStaffProfile'
  const ACTIVE_STAFF_ID_STORAGE_KEY = 'bwWagesActiveStaffId'
  const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const FALLBACK_WORK_TYPE_OPTIONS = ['Normal', 'House', 'House/Garden', 'Warehouse Team', 'Team Assistance', 'Music Bus']
  const COMMON_VENUE_SUGGESTIONS = ['Warehouse', 'Garden', 'Work with the Team', 'House', 'Music Bus', 'Ellis Park', 'FNB Stadium', 'Loftus', 'Inanda Club', 'Supersport Park', 'SAB HQ', 'DHL Stadium']
  const STAFF_WORK_TYPE_PROFILES = [
    { ids: ['1'], names: ['givemore chifetete kuziwa', 'givemore'], options: ['House', 'Team Assistance'] },
    { ids: ['2'], names: ['takavaudza chokuda', 'takavaudza', 'takka'], options: ['House/Garden', 'Warehouse Team'] },
    { ids: ['3'], names: ['thina dyani', 'thina'], options: ['Normal'] },
    { ids: ['5'], names: ['bhekizitha maphosa', 'bheki'], options: ['Music Bus', 'Normal'] },
    { ids: ['7'], names: ['john simbarashe mhlanga', 'jay'], options: ['Music Bus', 'Normal'] },
    { ids: ['12'], names: ['brian ndlovu', 'sipho'], options: ['Music Bus', 'Normal'] },
    { ids: ['15'], names: ['joshua motsamai nteo', 'joshua'], options: ['Music Bus', 'Normal'] },
  ]

  const normalize = (value) => String(value || '')
    .split(String.fromCharCode(10)).join(' ')
    .split(String.fromCharCode(13)).join(' ')
    .split(String.fromCharCode(9)).join(' ')
    .replace(/  +/g, ' ')
    .trim()
  const elementText = (el) => normalize((el instanceof HTMLElement ? el.innerText : el?.textContent) || (el instanceof HTMLInputElement ? el.value : ''))
  const isVisibleElement = (el) => {
    if (!(el instanceof HTMLElement)) return true
    if (el.hidden) return false
    const style = window.getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false
    const rect = el.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }
  const uniqueLabels = (values) => {
    const seen = new Set()
    const output = []
    values.forEach((value) => {
      const label = normalize(value)
      if (!label) return
      const key = label.toLowerCase()
      if (seen.has(key)) return
      seen.add(key)
      output.push(label)
    })
    return output
  }
  const actionElements = () => Array.from(document.querySelectorAll('a, button, input[type="submit"], input[type="button"], [role="button"], .btn'))
  const visibleActionElements = () => actionElements().filter((el) => isVisibleElement(el))
  const textMatches = (el, regex) => regex.test(elementText(el))
  const once = (el, key) => {
    const marker = 'bwBound' + key
    if (el.dataset[marker]) return false
    el.dataset[marker] = '1'
    return true
  }

  function persistActiveStaffId(staffId) {
    const normalizedStaffId = normalize(staffId)
    if (!normalizedStaffId) return
    try { window.sessionStorage.setItem(ACTIVE_STAFF_ID_STORAGE_KEY, normalizedStaffId) } catch (err) {}
    try { window.localStorage.setItem(ACTIVE_STAFF_ID_STORAGE_KEY, normalizedStaffId) } catch (err) {}
  }

  function getStoredActiveStaffId() {
    const readStored = (storage) => {
      try {
        return normalize(storage.getItem(ACTIVE_STAFF_ID_STORAGE_KEY) || '')
      } catch (err) {
        return ''
      }
    }
    return readStored(window.sessionStorage) || readStored(window.localStorage)
  }

  function resolveActiveStaffId(scope) {
    try {
      const currentUrl = new URL(window.location.href)
      const directStaffId = normalize(currentUrl.searchParams.get('bw_staff_id') || currentUrl.searchParams.get('staff') || '')
      if (directStaffId) {
        persistActiveStaffId(directStaffId)
        return directStaffId
      }
    } catch (err) {}

    const containers = []
    if (scope instanceof HTMLElement || scope instanceof HTMLFormElement) containers.push(scope)
    containers.push(document)

    for (const container of containers) {
      const idField = container.querySelector?.('input[name="staff_id"], input[name="person_id"], input[name="worker_id"], input[name="employee_id"], select[name="staff_id"], select[name="person_id"], select[name="worker_id"], select[name="employee_id"]')
      const resolvedId = normalize(idField?.value || idField?.getAttribute?.('value') || '')
      if (resolvedId) {
        persistActiveStaffId(resolvedId)
        return resolvedId
      }
    }

    const storedProfile = getStoredActiveStaffProfile()
    const profileStaffId = normalize(storedProfile?.ids?.[0] || '')
    if (profileStaffId) {
      persistActiveStaffId(profileStaffId)
      return profileStaffId
    }

    return getStoredActiveStaffId()
  }

  function attachActiveStaffIdToUrl(parsed) {
    if (!(parsed instanceof URL)) return
    if (!parsed.pathname.startsWith('/wages')) return
    if (parsed.pathname === LOGOUT_PATH) return
    if (parsed.searchParams.get('bw_staff_id')) return
    const activeStaffId = resolveActiveStaffId(document)
    if (!activeStaffId) return
    parsed.searchParams.set('bw_staff_id', activeStaffId)
  }

  function rewriteToProxyUrl(rawUrl) {
    const normalized = normalize(rawUrl)
    if (!normalized) return rawUrl
    try {
      const parsed = new URL(normalized, window.location.origin)
      if (parsed.origin === UPSTREAM_ORIGIN) {
        const proxied = new URL(window.location.origin + parsed.pathname + parsed.search + parsed.hash)
        attachActiveStaffIdToUrl(proxied)
        return proxied.toString()
      }
      attachActiveStaffIdToUrl(parsed)
      return parsed.toString()
    } catch (err) {
      return rawUrl
    }
  }

  function rewriteFormAction(form) {
    if (!(form instanceof HTMLFormElement)) return
    const action = form.getAttribute('action') || form.action || ''
    const rewritten = rewriteToProxyUrl(action)
    if (rewritten && rewritten !== action) form.setAttribute('action', rewritten)
  }

  function rewriteSubmitterAction(submitter) {
    if (!(submitter instanceof HTMLButtonElement) && !(submitter instanceof HTMLInputElement)) return
    const formAction = submitter.getAttribute('formaction') || submitter.formAction || ''
    if (!formAction) return
    const rewritten = rewriteToProxyUrl(formAction)
    if (rewritten && rewritten !== formAction) submitter.setAttribute('formaction', rewritten)
  }

  function forceWagesProxyRouting() {
    document.querySelectorAll('form').forEach((form) => {
      rewriteFormAction(form)
    })

    document.querySelectorAll('a[href]').forEach((link) => {
      if (!(link instanceof HTMLAnchorElement)) return
      const href = link.getAttribute('href') || link.href || ''
      const rewritten = rewriteToProxyUrl(href)
      if (rewritten && rewritten !== href) link.setAttribute('href', rewritten)
    })

    document.querySelectorAll('button[formaction], input[formaction]').forEach((submitter) => {
      rewriteSubmitterAction(submitter)
    })
  }

  if (!window.__bwFetchProxyPatched) {
    window.__bwFetchProxyPatched = true
    const nativeFetch = window.fetch.bind(window)
    window.fetch = function(resource, init) {
      try {
        if (typeof resource === 'string') resource = rewriteToProxyUrl(resource)
        else if (resource instanceof URL) resource = new URL(rewriteToProxyUrl(resource.toString()))
        else if (resource instanceof Request) {
          const rewrittenUrl = rewriteToProxyUrl(resource.url)
          if (rewrittenUrl !== resource.url) resource = new Request(rewrittenUrl, resource)
        }
      } catch (err) {}
      return nativeFetch(resource, init)
    }
  }

  if (!window.__bwXhrProxyPatched && window.XMLHttpRequest) {
    window.__bwXhrProxyPatched = true
    const nativeOpen = window.XMLHttpRequest.prototype.open
    window.XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      const rewritten = typeof url === 'string' ? rewriteToProxyUrl(url) : url
      return nativeOpen.call(this, method, rewritten, ...rest)
    }
  }

  if (!window.__bwSubmitProxyPatched) {
    window.__bwSubmitProxyPatched = true
    document.addEventListener('submit', (event) => {
      const form = event.target
      if (!(form instanceof HTMLFormElement)) return
      rewriteFormAction(form)
      rewriteSubmitterAction(event.submitter)
    }, true)

    if (window.HTMLFormElement?.prototype) {
      const nativeSubmit = window.HTMLFormElement.prototype.submit
      if (!window.__bwNativeFormSubmitProxyPatched && typeof nativeSubmit === 'function') {
        window.__bwNativeFormSubmitProxyPatched = true
        window.HTMLFormElement.prototype.submit = function() {
          rewriteFormAction(this)
          return nativeSubmit.call(this)
        }
      }

      const nativeRequestSubmit = window.HTMLFormElement.prototype.requestSubmit
      if (!window.__bwNativeFormRequestSubmitProxyPatched && typeof nativeRequestSubmit === 'function') {
        window.__bwNativeFormRequestSubmitProxyPatched = true
        window.HTMLFormElement.prototype.requestSubmit = function(submitter) {
          rewriteFormAction(this)
          rewriteSubmitterAction(submitter)
          return nativeRequestSubmit.call(this, submitter)
        }
      }
    }
  }

  async function logoutThenRedirect(target) {
    try {
      await fetch(LOGOUT_PATH, { method: 'GET', credentials: 'include', redirect: 'follow' })
    } catch (err) {
      console.warn('wages logout redirect fallback', err)
    }
    window.location.href = target
  }

  function parseFlexibleDate(value) {
    const cleaned = normalize(value)
    const match = cleaned.match(/(\\d{4})[-\\/](\\d{2})[-\\/](\\d{2})/)
    if (!match) return null
    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null
    const date = new Date(Date.UTC(year, month - 1, day))
    return Number.isNaN(date.getTime()) ? null : date
  }

  function formatForInput(date, slashFormat) {
    const year = date.getUTCFullYear()
    const month = String(date.getUTCMonth() + 1).padStart(2, '0')
    const day = String(date.getUTCDate()).padStart(2, '0')
    return slashFormat ? year + '/' + month + '/' + day : year + '-' + month + '-' + day
  }

  function ensureTopNav() {
    const main = document.querySelector('main.shell')
    if (!main) return null
    let topnav = main.querySelector('.topnav')
    if (!topnav) {
      topnav = document.createElement('nav')
      topnav.className = 'topnav bw-topnav'
      const brand = main.querySelector('.brand')
      if (brand?.nextSibling) main.insertBefore(topnav, brand.nextSibling)
      else main.appendChild(topnav)
    }
    return topnav
  }

  function removeStaffDashboardAccess() {
    document.querySelectorAll('.bw-return-dashboard').forEach((el) => el.remove())

    actionElements().forEach((el) => {
      const label = elementText(el)
      if (!/^return to dashboard$/i.test(label)) return
      if (el instanceof HTMLInputElement) {
        el.value = 'Sign Out'
      } else {
        el.textContent = 'Sign Out'
      }
      el.classList.remove('bw-return-dashboard')
      if (el instanceof HTMLAnchorElement) el.href = LOGOUT_PATH
    })

    const topnav = ensureTopNav()
    if (topnav && !topnav.children.length) topnav.remove()
  }

  function fixSwitchPerson() {
    actionElements().forEach((el) => {
      let label = elementText(el)
      if (label.startsWith('‹')) label = label.slice(1).trim()
      if (label.toLowerCase() !== 'switch person') return
      if (el instanceof HTMLAnchorElement) el.href = WAGES_HOME_PATH
      if (!once(el, 'SwitchPerson')) return
      el.addEventListener('click', (event) => {
        event.preventDefault()
        void logoutThenRedirect(WAGES_HOME_PATH)
      })
    })
  }

  function setStoredMissedMode(active) {
    try {
      if (active) window.sessionStorage.setItem(MISSED_MODE_STORAGE_KEY, 'pending')
      else window.sessionStorage.removeItem(MISSED_MODE_STORAGE_KEY)
    } catch (err) {}
  }

  function consumeStoredMissedMode() {
    try {
      const active = window.sessionStorage.getItem(MISSED_MODE_STORAGE_KEY) === 'pending'
      if (active) window.sessionStorage.removeItem(MISSED_MODE_STORAGE_KEY)
      return active
    } catch (err) {
      return false
    }
  }

  const isAddShiftAction = (text) => /^\\+?\\s*add( a)? shift$/i.test(text) || /^add current shift$/i.test(text) || /^\\+?\\s*add current shift$/i.test(text)

  function isWagesHomePage() {
    if (!window.location.pathname.startsWith('/wages')) return false
    const addButton = visibleActionElements().find((el) => isAddShiftAction(elementText(el)) && !el.closest('form'))
    if (!addButton) return false
    if (visibleActionElements().some((el) => /save shift temporarily/i.test(elementText(el)))) return false
    const bodyText = elementText(document.body)
    return /view payroll week/i.test(bodyText) || /finally submitted hours this payroll week/i.test(bodyText)
  }

  function rewriteAddShiftTarget(el, claimWeekStart) {
    if (!claimWeekStart) return
    const currentWeekStart = currentPayrollWeekStartValue()
    const claimWeek = parseFlexibleDate(claimWeekStart)
    const currentWeek = parseFlexibleDate(currentWeekStart)
    const shouldTreatAsPreviousPayroll = !!(claimWeek && currentWeek && claimWeek.getTime() < currentWeek.getTime())
    if (!shouldTreatAsPreviousPayroll) return

    const rewriteUrl = (rawUrl) => {
      const normalized = normalize(rawUrl)
      if (!normalized) return rawUrl
      try {
        const parsed = new URL(normalized, window.location.origin)
        let replacedClaimWeek = false
        Array.from(new Set(Array.from(parsed.searchParams.keys()))).forEach((key) => {
          if (key !== 'bw_claim_week_start' && formKeyLooksLikeClaimWeek(key)) {
            parsed.searchParams.set(key, currentWeekStart)
            replacedClaimWeek = true
          }
        })
        if (!replacedClaimWeek) parsed.searchParams.set('payroll_week_start', currentWeekStart)
        parsed.searchParams.set('bw_claim_week_start', claimWeekStart)
        parsed.searchParams.set('bw_missed', '1')
        return parsed.toString()
      } catch (err) {
        return rawUrl
      }
    }

    if (el instanceof HTMLAnchorElement) {
      const href = el.getAttribute('href') || el.href || ''
      const rewrittenHref = rewriteUrl(href)
      if (rewrittenHref && rewrittenHref !== href) el.setAttribute('href', rewrittenHref)
      return
    }

    if (el instanceof HTMLButtonElement || el instanceof HTMLInputElement) {
      const formAction = el.getAttribute('formaction') || el.formAction || ''
      if (formAction) {
        const rewrittenFormAction = rewriteUrl(formAction)
        if (rewrittenFormAction && rewrittenFormAction !== formAction) el.setAttribute('formaction', rewrittenFormAction)
      }
      const form = el.form || el.closest('form')
      if (form instanceof HTMLFormElement) {
        const action = form.getAttribute('action') || form.action || ''
        const rewrittenAction = rewriteUrl(action)
        if (rewrittenAction && rewrittenAction !== action) form.setAttribute('action', rewrittenAction)
        const claimWeekHidden = ensureHiddenField(form, 'bw_claim_week_start')
        claimWeekHidden.value = claimWeekStart
        claimWeekHidden.setAttribute('value', claimWeekStart)
        Array.from(form.querySelectorAll('input')).forEach((field) => {
          if (!(field instanceof HTMLInputElement)) return
          if (field.name === 'bw_claim_week_start') return
          if (!formKeyLooksLikeClaimWeek(field.name || field.id || '')) return
          field.value = currentWeekStart
          field.setAttribute('value', currentWeekStart)
        })
      }
    }
  }

  function decorateButtons() {
    actionElements().forEach((el) => {
      const text = elementText(el)
      if (isAddShiftAction(text)) {
        el.classList.add('bw-add-shift-btn')
        if (!el.dataset.bwDefaultLabel) el.dataset.bwDefaultLabel = text || 'Add Current Shift'
        if (el instanceof HTMLInputElement) el.value = 'Add Current Shift'
        else if (text) el.textContent = 'Add Current Shift'
        if (once(el, 'AddShiftState')) {
          const markSelected = () => el.classList.add('bw-is-selected')
          const clearSelected = () => el.classList.remove('bw-is-selected')
          el.addEventListener('click', () => {
            const selectedClaimWeek = currentPayrollWeekStartValue()
            setStoredClaimWeek(selectedClaimWeek)
            setStoredMissedMode(false)
            window.__bwLaunchMode = ''
            rewriteAddShiftTarget(el, selectedClaimWeek)
            markSelected()
          })
          el.addEventListener('focus', markSelected)
          el.addEventListener('blur', clearSelected)
        }
      }
      if (/save shift temporarily/i.test(text)) el.classList.add('bw-save-temp-btn')
      if (/final submit|final submission/i.test(text)) el.classList.add('bw-final-submit-btn')
      if (/miss(ed)? shift|missshift/i.test(text)) {
        if (el instanceof HTMLElement) el.style.display = 'none'
      }
    })
  }

  function ensureFrontPageMissShiftButton() {
    document.querySelectorAll('.bw-home-miss-shift-btn').forEach((node) => node.remove())
    document.querySelectorAll('.bw-home-shift-stack').forEach((node) => {
      if (!node.children.length) node.remove()
    })
  }

  function moveAddShiftNearSaveTemporary() {
    const addButton = actionElements().find((el) => isAddShiftAction(elementText(el)))
    const saveButton = actionElements().find((el) => /save shift temporarily/i.test(elementText(el)))
    if (!addButton || !saveButton) return

    const saveContainer = saveButton.closest('.draft-actions, .actions, .form-card, .card, .shift, form, section, main') || saveButton.parentElement
    if (!saveContainer) return

    let row = saveContainer.querySelector('.bw-shift-actions-row')
    if (!row) {
      row = document.createElement('div')
      row.className = 'bw-shift-actions-row'
      if (saveButton.parentElement === saveContainer) saveContainer.appendChild(row)
      else saveButton.parentElement?.insertAdjacentElement('afterend', row)
    }

    if (!row.contains(saveButton)) row.appendChild(saveButton)
    if (!row.contains(addButton)) row.appendChild(addButton)
  }

  function isPayrollWeekField(field) {
    if (!(field instanceof HTMLInputElement)) return false
    const key = normalize(field.name || field.id || '').toLowerCase()
    if (key === 'work_date' || key === 'bw_visible_work_date' || key === 'date_worked') return false
    if (key.includes('payroll_week') || key.includes('week_start') || key.includes('pay_week')) return true
    if (key.includes('week')) return true
    return false
  }

  function findPayrollWeekField() {
    const labels = Array.from(document.querySelectorAll('label')).filter((label) => elementText(label).toLowerCase() === 'view payroll week')
    for (const label of labels) {
      const container = label.parentElement || label.closest('.period-filter') || label.parentElement
      const field = Array.from(container?.querySelectorAll('input') || []).find((candidate) => isPayrollWeekField(candidate))
      if (field) return field
    }
    return Array.from(document.querySelectorAll('input')).find((field) => isPayrollWeekField(field)) || null
  }

  function bindPayrollWeekPickerPersistence() {
    const field = findPayrollWeekField()
    if (!field) return
    const syncStoredWeek = () => {
      const claimWeekStart = queryClaimWeekStartValue() || resolveClaimWeekStart(field, null)
      if (claimWeekStart) setStoredClaimWeek(claimWeekStart)
    }
    if (once(field, 'ClaimWeekPersistGlobal')) {
      field.addEventListener('input', syncStoredWeek)
      field.addEventListener('change', syncStoredWeek)
    }
    syncStoredWeek()
  }

  function unlockPayrollWeekPicker() {
    const field = findPayrollWeekField()
    if (!field) return
    field.disabled = false
    field.readOnly = false
    field.removeAttribute('max')
    field.removeAttribute('min')

    const filter = field.closest('.period-filter') || field.parentElement
    filter?.querySelectorAll('.bw-period-tools, .bw-last-payroll-btn').forEach((node) => node.remove())
  }

  function hidePayrollWeekSection() {
    if (!isWagesHomePage()) return

    const hideNode = (node) => {
      if (!(node instanceof HTMLElement) || node.dataset.bwHiddenPayrollWeek === '1') return
      node.dataset.bwHiddenPayrollWeek = '1'
      node.style.display = 'none'
    }

    const field = findPayrollWeekField()
    const filter = field?.closest('.period-filter') || field?.parentElement || null
    const nodesToHide = new Set()

    if (filter) {
      nodesToHide.add(filter)
      if (filter.previousElementSibling && /^view payroll week$/i.test(elementText(filter.previousElementSibling))) {
        nodesToHide.add(filter.previousElementSibling)
      }
      if (filter.nextElementSibling && /payroll weeks run from saturday to friday/i.test(elementText(filter.nextElementSibling))) {
        nodesToHide.add(filter.nextElementSibling)
      }
    }

    Array.from(document.querySelectorAll('label, p, small, button, a')).forEach((node) => {
      const text = elementText(node)
      if (/^view payroll week$/i.test(text) || /^view week$/i.test(text) || /payroll weeks run from saturday to friday/i.test(text)) {
        nodesToHide.add(node)
      }
    })

    nodesToHide.forEach((node) => hideNode(node))
  }

  function startOfPayrollWeek(date) {
    const copy = new Date(date.getTime())
    const offset = (copy.getUTCDay() + 1) % 7
    copy.setUTCDate(copy.getUTCDate() - offset)
    return copy
  }

  function endOfPayrollWeek(date) {
    const copy = startOfPayrollWeek(date)
    copy.setUTCDate(copy.getUTCDate() + 6)
    return copy
  }

  function setStoredClaimWeek(value) {
    if (!value) return
    try { window.sessionStorage.setItem(CLAIM_WEEK_STORAGE_KEY, value) } catch (err) {}
    try { window.localStorage.setItem(CLAIM_WEEK_STORAGE_KEY, value) } catch (err) {}
  }

  function getStoredClaimWeek() {
    try {
      const sessionValue = window.sessionStorage.getItem(CLAIM_WEEK_STORAGE_KEY)
      if (sessionValue) return sessionValue
    } catch (err) {}
    try {
      return window.localStorage.getItem(CLAIM_WEEK_STORAGE_KEY) || ''
    } catch (err) {
      return ''
    }
  }

  function utcToday() {
    const now = new Date()
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  }

  function currentPayrollWeekStartValue() {
    return formatForInput(startOfPayrollWeek(utcToday()), false)
  }

  function queryClaimWeekStartValue() {
    try {
      const params = new URLSearchParams(window.location.search)
      const explicit = normalize(params.get('bw_claim_week_start') || '')
      const explicitDate = parseFlexibleDate(explicit)
      if (explicitDate) return formatForInput(startOfPayrollWeek(explicitDate), false)
      for (const key of Array.from(new Set(Array.from(params.keys())))) {
        if (key === 'bw_claim_week_start') continue
        if (!formKeyLooksLikeClaimWeek(key)) continue
        const value = normalize(params.get(key) || '')
        const parsed = parseFlexibleDate(value)
        if (parsed) return formatForInput(startOfPayrollWeek(parsed), false)
      }
    } catch (err) {}
    return ''
  }

  function selectedClaimWeekStartValue(field) {
    return queryClaimWeekStartValue() || getStoredClaimWeek() || resolveClaimWeekStart(field, null) || currentPayrollWeekStartValue()
  }

  function syncPayrollWeekFieldValue(field, value) {
    if (!(field instanceof HTMLInputElement) || !isPayrollWeekField(field)) return
    field.value = value || ''
    field.setAttribute('value', value || '')
  }

  function syncPayrollWeekFields(scope, value) {
    if (!(scope instanceof HTMLElement) && !(scope instanceof HTMLFormElement) && !(scope instanceof Document)) return
    Array.from(scope.querySelectorAll('input')).forEach((field) => {
      syncPayrollWeekFieldValue(field, value)
    })
  }

  function resolveClaimWeekStart(field, hiddenField) {
    const fieldValue = isPayrollWeekField(field) ? (field?.value || field?.getAttribute('value') || '') : ''
    const current = parseFlexibleDate(fieldValue || hiddenField?.value || getStoredClaimWeek()) || utcToday()
    return formatForInput(startOfPayrollWeek(current), false)
  }

  function buildDateRange(startDate, endDate) {
    const dates = []
    const cursor = new Date(startDate.getTime())
    while (cursor.getTime() <= endDate.getTime()) {
      dates.push({
        value: formatForInput(cursor, false),
        label: WEEKDAY_LABELS[cursor.getUTCDay()] + ' — ' + formatForInput(cursor, false),
      })
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    return dates
  }

  function clampDateToRange(date, minDate, maxDate) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return new Date(minDate.getTime())
    if (date.getTime() < minDate.getTime()) return new Date(minDate.getTime())
    if (date.getTime() > maxDate.getTime()) return new Date(maxDate.getTime())
    return date
  }

  function getMissedShiftWindow(activePayrollWeekStart) {
    const currentPayrollStart = parseFlexibleDate(activePayrollWeekStart) || startOfPayrollWeek(utcToday())
    const previousPayrollStart = new Date(currentPayrollStart.getTime())
    previousPayrollStart.setUTCDate(previousPayrollStart.getUTCDate() - 7)
    const today = utcToday()
    const rangeEnd = new Date(today.getTime())
    if (formatForInput(today, false) === formatForInput(currentPayrollStart, false)) {
      rangeEnd.setUTCDate(rangeEnd.getUTCDate() - 1)
    }
    if (rangeEnd.getTime() < previousPayrollStart.getTime()) {
      rangeEnd.setTime(endOfPayrollWeek(previousPayrollStart).getTime())
    }
    return {
      currentPayrollStart,
      previousPayrollStart,
      rangeEnd,
      dates: buildDateRange(previousPayrollStart, rangeEnd),
    }
  }

  function rewriteMissedShiftRestrictionText(scope, activePayrollWeekStart) {
    Array.from(scope.querySelectorAll('small, p, div, span, label')).forEach((node) => {
      const text = elementText(node)
      if (!/missed hrs last week can only be captured on a saturday or monday only|catch-up entries can only be captured on this week's saturday or monday date|choose date worked and select the physical date missed/i.test(text)) return
      node.style.display = 'none'
    })
  }

  function widenMissedShiftDateChoices(workDateField, activePayrollWeekStart) {
    const windowConfig = getMissedShiftWindow(activePayrollWeekStart)
    if (workDateField instanceof HTMLSelectElement) {
      const current = parseFlexibleDate(workDateField.value || workDateField.dataset.bwInitialValue || workDateField.selectedOptions?.[0]?.textContent || '')
      const currentValue = current ? formatForInput(current, false) : ''
      const placeholderText = workDateField.dataset.bwPlaceholderText || 'Date worked — select exact date missed'
      const signature = windowConfig.previousPayrollStart.getTime() + '|' + windowConfig.rangeEnd.getTime() + '|' + windowConfig.dates.length
      workDateField.dataset.bwPlaceholderText = placeholderText
      if (workDateField.dataset.bwDateOptionsSignature !== signature) {
        workDateField.innerHTML = ''
        const placeholder = document.createElement('option')
        placeholder.value = ''
        placeholder.textContent = placeholderText
        workDateField.appendChild(placeholder)
        windowConfig.dates.forEach((entry) => {
          const option = document.createElement('option')
          option.value = entry.value
          option.textContent = entry.label
          workDateField.appendChild(option)
        })
        workDateField.dataset.bwDateOptionsSignature = signature
      }
      workDateField.value = windowConfig.dates.some((entry) => entry.value === currentValue) ? currentValue : formatForInput(windowConfig.previousPayrollStart, false)
      workDateField.dataset.bwInitialValue = workDateField.value || currentValue || ''
      return
    }
    if (workDateField instanceof HTMLInputElement && workDateField.type === 'date') {
      const minValue = formatForInput(windowConfig.previousPayrollStart, false)
      const maxValue = formatForInput(windowConfig.rangeEnd, false)
      const syncDateBounds = () => {
        const current = parseFlexibleDate(workDateField.value || workDateField.getAttribute('value') || '')
        const safeValue = formatForInput(current ? clampDateToRange(current, windowConfig.previousPayrollStart, windowConfig.rangeEnd) : windowConfig.previousPayrollStart, false)
        workDateField.min = minValue
        workDateField.max = maxValue
        workDateField.setAttribute('min', minValue)
        workDateField.setAttribute('max', maxValue)
        if (!workDateField.value || workDateField.value !== safeValue) workDateField.value = safeValue
      }
      syncDateBounds()
      if (once(workDateField, 'MissedDateBounds')) {
        workDateField.addEventListener('input', syncDateBounds)
        workDateField.addEventListener('change', syncDateBounds)
      }
    }
  }

  function consumeMissedQueryFlag() {
    const currentUrl = new URL(window.location.href)
    if (currentUrl.searchParams.get('bw_missed') !== '1') return false
    setStoredMissedMode(true)
    currentUrl.searchParams.delete('bw_missed')
    const nextUrl = currentUrl.pathname + currentUrl.search + currentUrl.hash
    window.history.replaceState({}, document.title, nextUrl)
    return true
  }

  function peekStoredMissedMode() {
    try {
      return window.sessionStorage.getItem(MISSED_MODE_STORAGE_KEY) === 'pending'
    } catch (err) {
      return false
    }
  }

  function ensureHelperText(field, key, text) {
    if (!field || field.dataset['bwHelper' + key] === '1') return
    field.dataset['bwHelper' + key] = '1'
    const helper = document.createElement('small')
    helper.className = 'field-help'
    helper.textContent = text
    field.insertAdjacentElement('afterend', helper)
  }

  function ensureHiddenField(form, name) {
    let field = form.querySelector('input[name="' + name + '"]')
    if (field) return field
    field = document.createElement('input')
    field.type = 'hidden'
    field.name = name
    form.appendChild(field)
    return field
  }

  function ensureDedicatedHiddenField(form, name) {
    let field = form.querySelector('input[type="hidden"][name="' + name + '"]')
    if (field) return field
    field = document.createElement('input')
    field.type = 'hidden'
    field.name = name
    form.appendChild(field)
    return field
  }

  function parseClockMinutes(value) {
    const match = normalize(value).match(/^(\d{1,2}):(\d{2})$/)
    if (!match) return null
    const hours = Number(match[1])
    const minutes = Number(match[2])
    if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
    return hours * 60 + minutes
  }

  function inferOvernightFromTimes(startValue, endValue) {
    const startMinutes = parseClockMinutes(startValue)
    const endMinutes = parseClockMinutes(endValue)
    if (startMinutes === null || endMinutes === null) return false
    return endMinutes < startMinutes
  }

  function ensureShiftStaffIdentity(form) {
    const existingIdField = firstField(form, ['input[name="staff_id"]', 'input[name="person_id"]', 'input[name="worker_id"]', 'input[name="employee_id"]', 'select[name="staff_id"]', 'select[name="person_id"]', 'select[name="worker_id"]', 'select[name="employee_id"]'])
    const existingIdValue = normalize(existingIdField?.value || existingIdField?.getAttribute('value') || '')
    if (existingIdValue) {
      persistActiveStaffId(existingIdValue)
      return existingIdField
    }

    const fallbackStaffId = resolveActiveStaffId(form)
    if (!fallbackStaffId) return null

    const hiddenStaffId = ensureDedicatedHiddenField(form, 'staff_id')
    hiddenStaffId.value = fallbackStaffId
    hiddenStaffId.setAttribute('value', fallbackStaffId)
    return hiddenStaffId
  }

  function syncOvernightHiddenField(form, startField, endField) {
    const explicitToggle = firstField(form, ['input[name="overnight_confirmed"]', 'input[name="next_overnight_shift"]', 'input[name="overnight"]'])
    const hiddenOvernightField = ensureDedicatedHiddenField(form, 'overnight_confirmed')
    const apply = () => {
      const inferred = inferOvernightFromTimes(startField?.value || startField?.getAttribute('value') || '', endField?.value || endField?.getAttribute('value') || '')
      const explicitChecked = explicitToggle instanceof HTMLInputElement && explicitToggle.type === 'checkbox'
        ? explicitToggle.checked
        : /^(1|true|yes|on)$/i.test(normalize(explicitToggle?.value || explicitToggle?.getAttribute('value') || ''))
      const shouldMarkOvernight = explicitChecked || inferred
      hiddenOvernightField.value = shouldMarkOvernight ? '1' : '0'
      hiddenOvernightField.setAttribute('value', hiddenOvernightField.value)
      if (explicitToggle instanceof HTMLInputElement && explicitToggle.type === 'checkbox') {
        explicitToggle.checked = shouldMarkOvernight
        explicitToggle.value = shouldMarkOvernight ? '1' : '0'
      } else if (explicitToggle) {
        explicitToggle.value = shouldMarkOvernight ? '1' : '0'
        explicitToggle.setAttribute('value', explicitToggle.value)
      }
    }
    ;[startField, endField, explicitToggle].forEach((field, index) => {
      if (!(field instanceof HTMLElement) || field.dataset['bwOvernightWatch' + index] === '1') return
      field.dataset['bwOvernightWatch' + index] = '1'
      field.addEventListener('input', apply)
      field.addEventListener('change', apply)
    })
    apply()
    return hiddenOvernightField
  }

  function firstField(form, selectors) {
    for (const selector of selectors) {
      const field = form.querySelector(selector)
      if (field) return field
    }
    return null
  }

  function setRequired(field, helperKey, helperText) {
    if (!field) return
    field.required = true
    field.setAttribute('aria-required', 'true')
    if (helperText) ensureHelperText(field, helperKey, helperText)
  }

  function isMissedShiftForm(form) {
    if (form.dataset.bwMissedShiftForm === '1') return true
    if (/miss(ed)? shift|missed hrs last week|previous payroll|claim(ed)? against/i.test(elementText(form))) {
      form.dataset.bwMissedShiftForm = '1'
      return true
    }
    const scopedCard = form.closest('.card, .form-card, .shift, section, article, div')
    if (!scopedCard) return false
    const hasMissAction = Array.from(scopedCard.querySelectorAll('a, button, input[type="submit"], input[type="button"]')).some((el) => /miss(ed)? shift/i.test(elementText(el)))
    if (hasMissAction) form.dataset.bwMissedShiftForm = '1'
    return hasMissAction
  }

  function removeBrokenMissedShiftPanel(form) {
    form.querySelectorAll('.bw-missed-shift-panel').forEach((panel) => panel.remove())
    form.querySelectorAll('input[name="payroll_week_claim_display"], input[name="missed_previous_week_display"], textarea[name="payroll_week_claim_display"], textarea[name="missed_previous_week_display"]').forEach((field) => field.remove())
  }

  function ensureDateWorkedLabel(workDateField) {
    if (!workDateField) return
    if (workDateField.id && document.querySelector('label[for="' + workDateField.id + '"]')) return
    const previousLabel = workDateField.previousElementSibling
    if (previousLabel && /date worked/i.test(elementText(previousLabel))) return
    const label = document.createElement('label')
    if (!workDateField.id) workDateField.id = 'bw-missed-work-date'
    label.setAttribute('for', workDateField.id)
    label.textContent = 'Date worked'
    workDateField.insertAdjacentElement('beforebegin', label)
  }

  function removeDateWorkedHelperText(workDateField) {
    if (!workDateField) return
    const nextNode = workDateField.nextElementSibling
    if (nextNode && /missed shifts must use the exact historical work date/i.test(elementText(nextNode))) {
      nextNode.remove()
    }
  }

  function isVisibleWorkDateField(field) {
    if (!field) return false
    if (field instanceof HTMLInputElement && field.type === 'hidden') return false
    const rects = typeof field.getClientRects === 'function' ? field.getClientRects() : []
    return rects.length > 0
  }

  function isLegacyWorkDateSelect(field) {
    if (!(field instanceof HTMLSelectElement)) return false
    if (/^work_?date$/i.test(normalize(field.name || field.id || ''))) return true
    const previousLabel = field.previousElementSibling
    if (previousLabel && /date worked/i.test(elementText(previousLabel))) return true
    const wrapperLabel = field.closest('.bw-date-worked-wrap, .bw-field-shell')?.querySelector('label')
    if (wrapperLabel && /date worked/i.test(elementText(wrapperLabel))) return true
    return Array.from(field.options).some((option) => /\d{4}[-/]\d{2}[-/]\d{2}/.test(normalize(option.value || option.textContent || '')))
  }

  function removeDuplicateWorkDateControls(scope, keepField) {
    if (!scope) return
    Array.from(scope.querySelectorAll('select'))
      .filter((field) => field !== keepField && isLegacyWorkDateSelect(field))
      .forEach((field) => {
        const shell = field.closest('.bw-date-worked-wrap')
        if (shell instanceof HTMLElement && !shell.contains(keepField)) {
          shell.remove()
          return
        }
        const previousLabel = field.previousElementSibling
        if (previousLabel && /date worked/i.test(elementText(previousLabel))) previousLabel.remove()
        const parent = field.parentElement
        field.remove()
        if (parent && !parent.contains(keepField) && !parent.querySelector('input, select, textarea, button, a')) {
          parent.remove()
        }
      })
  }

  function removeTopMissedShiftDateSelector(scope, keepField) {
    if (!(keepField instanceof HTMLInputElement) || keepField.type !== 'date' || !scope) return
    Array.from(scope.querySelectorAll('select'))
      .filter((field) => isVisibleWorkDateField(field) && field !== keepField && isLegacyWorkDateSelect(field))
      .forEach((field) => {
        const shell = field.closest('.bw-date-worked-wrap')
        if (shell instanceof HTMLElement && !shell.contains(keepField)) {
          shell.remove()
          return
        }
        const previousLabel = field.previousElementSibling
        if (previousLabel && /date worked/i.test(elementText(previousLabel))) previousLabel.remove()
        const parent = field.parentElement
        field.remove()
        if (parent && !parent.contains(keepField) && !parent.querySelector('input, select, textarea, button, a')) {
          parent.remove()
        }
      })
  }

  function removeLegacyTopDateWorkedBlock(scope, keepField) {
    if (!(keepField instanceof HTMLElement) || !scope) return
    const keepWrapper = keepField.closest('.bw-date-worked-wrap, .bw-field-shell')
    const nodes = Array.from(scope.querySelectorAll('label, strong, h3, h4, div, p'))
    nodes
      .filter((node) => /^date worked$/i.test(elementText(node)))
      .forEach((labelNode) => {
        if (!(labelNode instanceof HTMLElement)) return
        if (keepWrapper?.contains(labelNode)) return
        const relation = labelNode.compareDocumentPosition(keepField)
        if (!(relation & Node.DOCUMENT_POSITION_FOLLOWING)) return

        const candidateField = labelNode.parentElement?.querySelector('select, input[type="date"], input[name*="date"], input[id*="date"], [role="combobox"]')
        if (!candidateField || candidateField === keepField) return
        if (keepWrapper && candidateField instanceof Node && keepWrapper.contains(candidateField)) return

        const parentBlock = labelNode.parentElement
        if (parentBlock instanceof HTMLElement && !parentBlock.contains(keepField)) {
          parentBlock.remove()
          return
        }

        labelNode.remove()
        if (candidateField instanceof HTMLElement && !candidateField.contains(keepField)) candidateField.remove()
      })
  }

  function ensureVisibleWorkDateField(form, anchorField, preferCalendarInput) {
    let visibleField = firstField(form, [
      'input[name="work_date"]:not([type="hidden"])',
      'input[id="work_date"]:not([type="hidden"])',
      'input[id="work-date"]:not([type="hidden"])',
      'input[type="date"]',
      'select[name="work_date"]',
      'select[id="work_date"]',
      'select[id="work-date"]'
    ])
    const hiddenField = firstField(form, ['input[name="work_date"]', 'input[id="work_date"]', 'input[id="work-date"]'])
    const keepExistingCalendar = visibleField instanceof HTMLInputElement && visibleField.type === 'date'

    if (preferCalendarInput && !keepExistingCalendar) {
      visibleField = null
    }

    if (isVisibleWorkDateField(visibleField)) {
      return { visibleField, hiddenField: hiddenField || visibleField }
    }

    let wrapper = form.querySelector('.bw-date-worked-wrap')
    if (!wrapper) {
      wrapper = document.createElement('div')
      wrapper.className = 'bw-date-worked-wrap'
      const label = document.createElement('label')
      label.textContent = 'Date worked'
      const field = document.createElement('input')
      field.type = 'date'
      field.name = 'bw_visible_work_date'
      field.className = 'bw-visible-work-date'
      wrapper.appendChild(label)
      wrapper.appendChild(field)
      if (anchorField) anchorField.insertAdjacentElement('beforebegin', wrapper)
      else form.insertBefore(wrapper, form.firstChild)
      visibleField = field
    } else {
      visibleField = wrapper.querySelector('input, select')
    }

    const syncedHidden = hiddenField || ensureHiddenField(form, 'work_date')
    if (visibleField && syncedHidden && visibleField !== syncedHidden && once(visibleField, 'WorkDateMirror')) {
      if (syncedHidden.value && !visibleField.value) visibleField.value = syncedHidden.value
      const syncToHidden = () => { syncedHidden.value = visibleField.value || '' }
      visibleField.addEventListener('input', syncToHidden)
      visibleField.addEventListener('change', syncToHidden)
    }

    return { visibleField, hiddenField: syncedHidden }
  }

  function convertMissedWorkDateFieldToSelect(form, binding) {
    const visibleField = binding?.visibleField
    if (visibleField instanceof HTMLSelectElement) return binding
    if (!(visibleField instanceof HTMLInputElement) || visibleField.type !== 'date') return binding

    let hiddenField = binding.hiddenField
    if (!(hiddenField instanceof HTMLInputElement)) {
      hiddenField = ensureHiddenField(form, 'work_date')
    }

    const wrapper = visibleField.closest('.bw-date-worked-wrap') || visibleField.parentElement
    if (!(wrapper instanceof HTMLElement)) return binding

    const initialValue = normalize(hiddenField.value || visibleField.value || visibleField.getAttribute('value') || '')
    const select = document.createElement('select')
    select.name = 'bw_visible_work_date'
    select.className = visibleField.className || 'bw-visible-work-date'
    if (visibleField.id) {
      select.id = visibleField.id
      visibleField.removeAttribute('id')
    }

    if (hiddenField === visibleField) {
      hiddenField.type = 'hidden'
      hiddenField.classList.add('bw-hidden-restored-source')
      hiddenField.value = initialValue
      hiddenField.removeAttribute('min')
      hiddenField.removeAttribute('max')
      hiddenField.insertAdjacentElement('beforebegin', select)
    } else {
      visibleField.insertAdjacentElement('beforebegin', select)
      visibleField.remove()
      if (initialValue && !hiddenField.value) hiddenField.value = initialValue
    }

    if (once(select, 'WorkDateMirror')) {
      if (initialValue) select.dataset.bwInitialValue = initialValue
      const syncToHidden = () => { hiddenField.value = select.value || '' }
      select.addEventListener('input', syncToHidden)
      select.addEventListener('change', syncToHidden)
    }

    return { visibleField: select, hiddenField }
  }

  function emphasizeDateWorkedField(workDateField) {
    if (!workDateField) return
    workDateField.classList.add('bw-work-date-field')
    const wrapper = workDateField.closest('.bw-date-worked-wrap')
    if (wrapper) wrapper.classList.add('bw-field-shell')
  }

  function ensureMissedShiftHeading(scope, form, isActive) {
    const pageHeading = document.querySelector('main h1, .shell h1, h1')
    if (pageHeading) {
      pageHeading.textContent = 'Add a shift'
    }

    const pageSubtitle = Array.from(document.querySelectorAll('main p, .shell p, p')).find((node) => /save it temporarily while you work|final submission|current shift|missed shift/i.test(elementText(node)))
    if (pageSubtitle) {
      pageSubtitle.textContent = 'Choose the exact date worked. Previous-payroll dates are treated automatically as missed shifts.'
    }

    form.querySelectorAll('.bw-missed-mode-banner').forEach((banner) => banner.remove())

    const textTargets = Array.from((scope || form).querySelectorAll('h1, h2, h3, h4, legend, .eyebrow, .title, .bw-missed-heading')).filter((node) => /miss ?shift|missshift/i.test(elementText(node)))
    textTargets.forEach((node) => {
      if (node === pageHeading) return
      node.remove()
    })

    document.documentElement.classList.remove('bw-missed-mode')
    document.body.classList.remove('bw-missed-mode')
  }

  function isMissedShiftModeActive(scope, form) {
    const candidates = Array.from((scope || form).querySelectorAll('button, a, div, span, p, strong, label'))
    const statusNode = candidates.find((node) => /^missed shift:\\s*on$/i.test(elementText(node)))
    if (statusNode) {
      statusNode.classList.add('bw-miss-shift-status')
      setStoredMissedMode(true)
      return true
    }

    const explicitCurrentNode = candidates.find((node) => /^missed shift:\\s*off$/i.test(elementText(node)))
    if (explicitCurrentNode) {
      setStoredMissedMode(false)
      return false
    }

    const currentShiftHeading = document.querySelector('main h1, .shell h1, h1')
    if (currentShiftHeading && /add a current shift/i.test(elementText(currentShiftHeading))) {
      setStoredMissedMode(false)
      return false
    }

    return consumeStoredMissedMode()
  }

  function persistActiveStaffProfile(profile) {
    if (!profile) return
    const serialized = JSON.stringify(profile)
    try {
      window.sessionStorage.setItem(ACTIVE_STAFF_PROFILE_KEY, serialized)
    } catch (err) {}
    try {
      window.localStorage.setItem(ACTIVE_STAFF_PROFILE_KEY, serialized)
    } catch (err) {}
  }

  function getStoredActiveStaffProfile() {
    const readStored = (storage) => {
      try {
        const raw = storage.getItem(ACTIVE_STAFF_PROFILE_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        if (!parsed || !Array.isArray(parsed.options)) return null
        return parsed
      } catch (err) {
        return null
      }
    }
    return readStored(window.sessionStorage) || readStored(window.localStorage)
  }

  function bindStaffPickerPersistence() {
    Array.from(document.querySelectorAll('a.person[href*="/wages/login?staff="]')).forEach((link) => {
      if (!(link instanceof HTMLAnchorElement) || !once(link, 'PersistStaffChoice')) return
      link.addEventListener('click', () => {
        const staffId = normalize(new URL(link.href, window.location.origin).searchParams.get('staff'))
        if (staffId) persistActiveStaffId(staffId)
        const profile = STAFF_WORK_TYPE_PROFILES.find((entry) => entry.ids.includes(staffId))
        if (profile) persistActiveStaffProfile(profile)
      })
    })
  }

  function detectAndPersistActiveStaffProfile() {
    bindStaffPickerPersistence()

    const currentUrl = new URL(window.location.href)
    const directStaffId = normalize(currentUrl.searchParams.get('bw_staff_id') || currentUrl.searchParams.get('staff'))
    if (directStaffId) {
      persistActiveStaffId(directStaffId)
      const profileById = STAFF_WORK_TYPE_PROFILES.find((profile) => profile.ids.includes(directStaffId))
      if (profileById) {
        persistActiveStaffProfile(profileById)
        return profileById
      }
    }

    const headingText = normalize(document.querySelector('main h1, .shell h1, h1')?.textContent || '').toLowerCase()
    const hiMatch = headingText.match(/^hi\s+(.+)$/i)
    if (hiMatch) {
      const headingName = normalize(hiMatch[1]).toLowerCase()
      const profileByHeading = STAFF_WORK_TYPE_PROFILES.find((profile) => profile.names.some((name) => headingName.includes(name) || name.includes(headingName)))
      if (profileByHeading) {
        persistActiveStaffId(profileByHeading.ids?.[0] || '')
        persistActiveStaffProfile(profileByHeading)
        return profileByHeading
      }
    }

    const storedProfile = getStoredActiveStaffProfile()
    if (storedProfile?.ids?.[0]) persistActiveStaffId(storedProfile.ids[0])
    return storedProfile
  }

  function resolveStaffWorkTypeProfile(form) {
    const idFields = Array.from(form.querySelectorAll('input[name="staff_id"], input[name="person_id"], input[name="worker_id"], input[name="employee_id"], select[name="staff_id"], select[name="person_id"], select[name="worker_id"], select[name="employee_id"]'))
    const idValues = idFields.map((field) => normalize(field.value || field.getAttribute('value') || ''))
    for (const profile of STAFF_WORK_TYPE_PROFILES) {
      const matchedId = profile.ids.find((id) => idValues.includes(id))
      if (matchedId) {
        persistActiveStaffId(matchedId)
        persistActiveStaffProfile(profile)
        return profile
      }
    }

    return detectAndPersistActiveStaffProfile()
  }

  function resolveWorkTypeOptions(form) {
    const profile = resolveStaffWorkTypeProfile(form)
    if (profile?.options?.length) return uniqueLabels(profile.options)
    if (profile) return ['Normal']
    return uniqueLabels(FALLBACK_WORK_TYPE_OPTIONS)
  }

  function repopulateSelect(select, options, placeholderText) {
    const currentValue = normalize(select.value || '')
    const signature = placeholderText + '|' + options.join('|')
    const needsRebuild = select.dataset.bwOptionsSignature !== signature || select.options.length !== options.length + 1

    if (needsRebuild) {
      select.innerHTML = ''
      const placeholder = document.createElement('option')
      placeholder.value = ''
      placeholder.textContent = placeholderText
      select.appendChild(placeholder)
      options.forEach((optionLabel) => {
        const option = document.createElement('option')
        option.value = optionLabel
        option.textContent = optionLabel
        select.appendChild(option)
      })
      select.dataset.bwOptionsSignature = signature
    }

    if (options.some((optionLabel) => optionLabel.toLowerCase() === currentValue.toLowerCase())) {
      select.value = currentValue
    }
  }

  function hideOriginalFieldArtifacts(form, field) {
    if (!field) return
    field.classList.add('bw-hidden-restored-source')
    if (field.id) {
      form.querySelectorAll('label[for="' + field.id + '"]').forEach((label) => label.classList.add('bw-hidden-original-label'))
    }
    const previousLabel = field.previousElementSibling
    if (previousLabel instanceof HTMLLabelElement) previousLabel.classList.add('bw-hidden-original-label')
    const previousHeading = field.parentElement?.previousElementSibling
    if (previousHeading instanceof HTMLLabelElement) previousHeading.classList.add('bw-hidden-original-label')
  }

  function buildSyncedSelect(form, name, anchorField, options, labelText, placeholderText) {
    let wrapper = form.querySelector('.bw-' + name.replace(/_/g, '-') + '-wrap')
    let select = wrapper?.querySelector('select')
    const hiddenField = ensureHiddenField(form, name)

    if (!wrapper) {
      wrapper = document.createElement('div')
      wrapper.className = 'bw-field-shell bw-' + name.replace(/_/g, '-') + '-wrap'
      const label = document.createElement('label')
      label.textContent = labelText
      select = document.createElement('select')
      select.className = 'bw-restored-select'
      wrapper.appendChild(label)
      wrapper.appendChild(select)
      if (anchorField) anchorField.insertAdjacentElement('beforebegin', wrapper)
      else form.insertBefore(wrapper, form.firstChild)
    }

    repopulateSelect(select, options, placeholderText)
    if (hiddenField.value && !select.value) select.value = hiddenField.value
    if (once(select, 'MirrorSelect' + name)) {
      const syncToHidden = () => { hiddenField.value = select.value || '' }
      select.addEventListener('input', syncToHidden)
      select.addEventListener('change', syncToHidden)
    }
    return select
  }

  function restoreWorkTypeField(form, workTypeField, anchorField) {
    const options = resolveWorkTypeOptions(form)
    if (workTypeField instanceof HTMLSelectElement) {
      repopulateSelect(workTypeField, options, 'Select work type')
      workTypeField.classList.add('bw-restored-select')
      return workTypeField
    }
    if (workTypeField instanceof HTMLInputElement) {
      const originalField = workTypeField
      const select = buildSyncedSelect(form, originalField.name || 'work_type', originalField, options, 'Work type', 'Select work type')
      if (originalField.value && !select.value) select.value = originalField.value
      if (once(originalField, 'SourceToSelectWorkType')) {
        const syncToSource = () => { originalField.value = select.value || '' }
        select.addEventListener('input', syncToSource)
        select.addEventListener('change', syncToSource)
      }
      originalField.required = false
      hideOriginalFieldArtifacts(form, originalField)
      return select
    }
    return buildSyncedSelect(form, 'work_type', anchorField, options, 'Work type', 'Select work type')
  }

  function workTypeFieldLabelNodes(form, field) {
    const labels = []
    if (!field) return labels
    if (field.id) {
      form.querySelectorAll('label[for="' + field.id + '"]').forEach((label) => labels.push(label))
    }
    const previousLabel = field.previousElementSibling
    if (previousLabel instanceof HTMLLabelElement) labels.push(previousLabel)
    const wrapperLabel = field.closest('.bw-field-shell, .field, .row, div')?.querySelector('label')
    if (wrapperLabel instanceof HTMLLabelElement) labels.push(wrapperLabel)
    return Array.from(new Set(labels))
  }

  function fieldLooksLikeWorkType(form, field) {
    if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement)) return false
    if (field instanceof HTMLInputElement && (field.type === 'hidden' || field.type === 'date' || field.type === 'time')) return false
    const nameKey = normalize(field.name || field.id || '').toLowerCase()
    if (/(^|_)(work_type|role_worked)(_|$)/.test(nameKey)) return true
    const placeholder = normalize(field.getAttribute('placeholder') || '').toLowerCase()
    const hints = ['choose work type', 'select work type', 'work type', 'work type / role']
    if (hints.some((hint) => placeholder.includes(hint))) return true
    const labels = workTypeFieldLabelNodes(form, field).map((label) => elementText(label).toLowerCase())
    if (labels.some((label) => hints.some((hint) => label.includes(hint)))) return true
    if (field instanceof HTMLSelectElement) {
      const optionTexts = Array.from(field.options).map((option) => normalize(option.textContent || option.value || '').toLowerCase())
      if (optionTexts.some((text) => text.includes('choose work type') || text.includes('select work type'))) return true
    }
    return false
  }

  function removeDuplicateWorkTypeFields(form, keepField) {
    if (!(keepField instanceof HTMLElement)) return
    workTypeFieldLabelNodes(form, keepField).forEach((label) => {
      label.textContent = 'Work type'
      label.classList.remove('bw-hidden-original-label')
    })
    Array.from(form.querySelectorAll('select, input'))
      .filter((field) => field !== keepField && fieldLooksLikeWorkType(form, field) && isVisibleElement(field))
      .forEach((field) => {
        workTypeFieldLabelNodes(form, field).forEach((label) => {
          if (!keepField.contains(label)) label.remove()
        })
        const wrapper = field.closest('.bw-work-type-wrap, .bw-role-worked-wrap, .bw-field-shell')
        const keepWrapper = keepField.closest('.bw-work-type-wrap, .bw-role-worked-wrap, .bw-field-shell')
        if (wrapper instanceof HTMLElement && wrapper !== keepWrapper) {
          wrapper.remove()
          return
        }
        field.remove()
      })
  }

  function ensureVenueSuggestions(venueField, workTypeOptions) {
    if (!(venueField instanceof HTMLInputElement)) return
    const suggestions = uniqueLabels([
      workTypeOptions.includes('Warehouse Team') ? 'Warehouse' : '',
      workTypeOptions.includes('House/Garden') ? 'Garden' : '',
      workTypeOptions.includes('Team Assistance') ? 'Work with the Team' : '',
      workTypeOptions.includes('House') ? 'House' : '',
      workTypeOptions.includes('Music Bus') ? 'Music Bus' : '',
      ...COMMON_VENUE_SUGGESTIONS,
    ])
    const listId = 'bw-venue-suggestions'
    let dataList = document.getElementById(listId)
    if (!(dataList instanceof HTMLDataListElement)) {
      dataList = document.createElement('datalist')
      dataList.id = listId
      document.body.appendChild(dataList)
    }
    dataList.innerHTML = ''
    suggestions.forEach((label) => {
      const option = document.createElement('option')
      option.value = label
      dataList.appendChild(option)
    })
    venueField.setAttribute('list', listId)
    if (!venueField.placeholder || /warehouse or event venue/i.test(venueField.placeholder)) {
      venueField.placeholder = 'Venue / event location'
    }
  }

  function syncMissedShiftMetadata(payload) {
    const captureWeekStart = currentPayrollWeekStartValue()
    const windowConfig = getMissedShiftWindow(captureWeekStart)
    widenMissedShiftDateChoices(payload.workDateField, captureWeekStart)
    rewriteMissedShiftRestrictionText(payload.scope, captureWeekStart)

    const selectedWorkDateValue = normalize(payload.workDateField?.value || payload.workDateField?.getAttribute('value') || payload.workDateHidden?.value || '')
    if (payload.workDateHidden) {
      payload.workDateHidden.value = selectedWorkDateValue
      payload.workDateHidden.setAttribute('value', selectedWorkDateValue)
    }
    const workDate = parseFlexibleDate(selectedWorkDateValue)
    const claimedAgainstWeekStart = workDate ? formatForInput(startOfPayrollWeek(workDate), false) : captureWeekStart
    const isPrevious = !!(workDate && workDate.getTime() < windowConfig.currentPayrollStart.getTime())

    setStoredClaimWeek(claimedAgainstWeekStart)
    syncPayrollWeekFieldValue(payload.claimWeekField, captureWeekStart)

    payload.claimWeekHidden.value = captureWeekStart
    payload.claimWeekHidden.setAttribute('value', captureWeekStart)
    payload.previousPayrollHidden.value = isPrevious ? '1' : '0'
    payload.previousPayrollHidden.setAttribute('value', payload.previousPayrollHidden.value)
    if (payload.actualWorkDateHidden) {
      payload.actualWorkDateHidden.value = selectedWorkDateValue
      payload.actualWorkDateHidden.setAttribute('value', selectedWorkDateValue)
    }
    if (payload.claimWeekMarkerHidden) {
      payload.claimWeekMarkerHidden.value = claimedAgainstWeekStart
      payload.claimWeekMarkerHidden.setAttribute('value', claimedAgainstWeekStart)
    }
    if (payload.missedModeHidden) {
      payload.missedModeHidden.value = isPrevious ? '1' : '0'
      payload.missedModeHidden.setAttribute('value', payload.missedModeHidden.value)
    }

    const reviewBits = []
    if (claimedAgainstWeekStart) reviewBits.push('Claimed against payroll week ' + claimedAgainstWeekStart + '.')
    if (captureWeekStart) reviewBits.push('Captured under current payroll week ' + captureWeekStart + '.')
    if (workDate) reviewBits.push('Exact work date ' + formatForInput(workDate, false) + '.')
    if (payload.venueField?.value) reviewBits.push('Venue ' + payload.venueField.value + '.')
    if (payload.workTypeField?.value) reviewBits.push('Work type / role ' + payload.workTypeField.value + '.')
    if (payload.descriptionField?.value) reviewBits.push('Description ' + payload.descriptionField.value + '.')
    if (payload.startField?.value || payload.endField?.value) reviewBits.push('Captured time ' + (payload.startField?.value || '??') + '-' + (payload.endField?.value || '??') + '.')
    if (inferOvernightFromTimes(payload.startField?.value || '', payload.endField?.value || '')) {
      reviewBits.push('System auto-detected overnight / next-day shift: Yes.')
    }
    reviewBits.push('Belongs to previous payroll: ' + (isPrevious ? 'Yes.' : 'No.'))
    reviewBits.push('Do not block staff entry. Do not auto-call it duplicate. Create backend manual overlap review only where an existing entry conflicts.')
    payload.reviewNoteHidden.value = reviewBits.join(' ')
  }

  function bindMissedShiftMetadata(payload) {
    const watched = [payload.claimWeekField, payload.workDateField, payload.venueField, payload.workTypeField, payload.descriptionField, payload.startField, payload.endField]
    watched.forEach((field, index) => {
      if (!field || field.dataset['bwMissedWatch' + index] === '1') return
      field.dataset['bwMissedWatch' + index] = '1'
      field.addEventListener('input', () => syncMissedShiftMetadata(payload))
      field.addEventListener('change', () => syncMissedShiftMetadata(payload))
    })
    if (once(payload.form, 'MissedShiftSync')) {
      payload.form.addEventListener('submit', () => syncMissedShiftMetadata(payload))
    }
    syncMissedShiftMetadata(payload)
  }

  function looksLikeShiftEntryForm(form) {
    const startField = firstField(form, ['input[name="start_time"]', 'input[name="start"]', 'input[id="start_time"]', 'input[id="start-time"]', 'input[type="time"]'])
    const endField = firstField(form, ['input[name="end_time"]', 'input[name="finish_time"]', 'input[name="finish"]', 'input[id="end_time"]', 'input[id="finish_time"]'])
    const workDateField = firstField(form, ['select[name="work_date"]', 'select[id="work_date"]', 'select[id="work-date"]', 'input[name="work_date"]', 'input[id="work_date"]', 'input[id="work-date"]', 'input[type="date"]'])
    return !!(startField && endField && workDateField)
  }

  function resolveMissedShiftScope(form) {
    return form.closest('.card, .form-card, .shift, section, article, main, .shell') || form
  }

  function enhanceMissedShiftForms() {
    const claimWeekField = findPayrollWeekField()

    Array.from(document.querySelectorAll('form')).forEach((form) => {
      removeBrokenMissedShiftPanel(form)
      if (!looksLikeShiftEntryForm(form)) return

      const scope = resolveMissedShiftScope(form)
      const venueField = firstField(form, ['input[name="outlet_venue"]', 'input[name="venue_name"]', 'input[name="venue"]', 'input[id="outlet_venue"]', 'input[id="venue_name"]', 'input[id="venue"]'])
      const workDateBinding = ensureVisibleWorkDateField(form, venueField, true)
      const workDateField = workDateBinding.visibleField
      removeTopMissedShiftDateSelector(scope, workDateField)
      removeDuplicateWorkDateControls(scope, workDateField)
      removeLegacyTopDateWorkedBlock(scope, workDateField)
      const descriptionField = firstField(form, ['textarea[name="work_description"]', 'input[name="work_description"]', 'textarea[name="details"]', 'input[name="details"]', 'textarea'])
      const rawWorkTypeField = firstField(form, ['select[name="work_type"]', 'input[name="work_type"]', 'select[name="role_worked"]', 'input[name="role_worked"]'])
      const workTypeField = restoreWorkTypeField(form, rawWorkTypeField, descriptionField || venueField || workDateField)
      removeDuplicateWorkTypeFields(form, workTypeField)
      const startField = firstField(form, ['input[name="start_time"]', 'input[name="start"]', 'input[id="start_time"]', 'input[id="start-time"]', 'input[type="time"]'])
      const endField = firstField(form, ['input[name="end_time"]', 'input[name="finish_time"]', 'input[name="finish"]', 'input[id="end_time"]', 'input[id="finish_time"]'])

      if (!workDateField || !startField || !endField) return

      const currentWorkDateValue = normalize(workDateField.value || workDateField.getAttribute('value') || workDateBinding.hiddenField?.value || '')
      const currentWorkDate = parseFlexibleDate(currentWorkDateValue)
      const livePayrollWeek = parseFlexibleDate(currentPayrollWeekStartValue())
      const isMissedModeActive = !!(currentWorkDate && livePayrollWeek && currentWorkDate.getTime() < livePayrollWeek.getTime())

      const resolvedStaffIdField = ensureShiftStaffIdentity(form)
      if (resolvedStaffIdField?.value || resolvedStaffIdField?.getAttribute('value')) {
        const hiddenStaffMarker = ensureHiddenField(form, 'bw_staff_id')
        hiddenStaffMarker.value = normalize(resolvedStaffIdField.value || resolvedStaffIdField.getAttribute('value') || '')
        hiddenStaffMarker.setAttribute('value', hiddenStaffMarker.value)
      }
      rewriteFormAction(form)
      syncOvernightHiddenField(form, startField, endField)

      ensureMissedShiftHeading(scope, form, isMissedModeActive)
      emphasizeDateWorkedField(workDateField)
      ensureDateWorkedLabel(workDateField)
      removeDateWorkedHelperText(workDateField)
      form.querySelectorAll('.field-help').forEach((node) => node.remove())
      ensureVenueSuggestions(venueField, resolveWorkTypeOptions(form))
      setRequired(workDateField, 'WorkDate', '')
      setRequired(venueField, 'Venue', '')
      setRequired(workTypeField, 'WorkType', '')
      setRequired(descriptionField, 'Description', '')
      setRequired(startField, 'StartTime', '')
      setRequired(endField, 'EndTime', '')

      workDateField.removeAttribute('max')
      workDateField.removeAttribute('min')

      const claimWeekHidden = ensureHiddenField(form, 'payroll_week_start')
      const previousPayrollHidden = ensureHiddenField(form, 'missed_previous_week')
      const reviewNoteHidden = ensureHiddenField(form, 'payroll_note')
      const workDateHidden = workDateBinding.hiddenField || ensureHiddenField(form, 'work_date')
      const actualWorkDateHidden = ensureHiddenField(form, 'bw_actual_work_date')
      const claimWeekMarkerHidden = ensureHiddenField(form, 'bw_claim_week_start')
      const missedModeHidden = ensureHiddenField(form, 'bw_missed_shift_mode')

      bindMissedShiftMetadata({
        form,
        scope,
        claimWeekField,
        claimWeekHidden,
        workDateField: workDateField || workDateHidden,
        workDateHidden,
        venueField,
        workTypeField,
        descriptionField,
        startField,
        endField,
        previousPayrollHidden,
        reviewNoteHidden,
        actualWorkDateHidden,
        claimWeekMarkerHidden,
        missedModeHidden,
      })
    })
  }

  function hideLockedPayrollWarnings() {
    const selectors = '.alert, .notice, .warning, .error, .flash, .message, .card, .row, label, p, small, div, span'
    Array.from(document.querySelectorAll(selectors)).forEach((node) => {
      const text = elementText(node)
      if (!/that payroll week .* has already been paid and is locked|hours missed .* can only be captured on this payroll week's saturday|please recapture it only under the current payroll week/i.test(text)) return
      const container = node.closest('.alert, .notice, .warning, .error, .flash, .message, .card, .row, div')
      const target = container || node
      if (!(target instanceof HTMLElement) || target.dataset.bwHiddenLockedPayroll === '1') return
      target.dataset.bwHiddenLockedPayroll = '1'
      target.style.display = 'none'
    })
  }

  function hideOvernightPrompt() {
    const selectors = '.toggle-row, .check-row, .row, label, p, small, div'
    Array.from(document.querySelectorAll(selectors)).forEach((node) => {
      const text = elementText(node)
      if (!/next overnight shift|finish time.*overnight|overnight shift/i.test(text)) return
      const container = node.closest('.toggle-row, .check-row, .row, div, label')
      const target = container || node
      if (!target || target.dataset.bwHiddenOvernight === '1') return
      target.dataset.bwHiddenOvernight = '1'
      target.style.display = 'none'
    })
  }

  function addBulkFinalSubmission() {
    const shifts = Array.from(document.querySelectorAll('.shift'))
    if (!shifts.length) return

    const selectable = []

    shifts.forEach((shift, index) => {
      const finalButton = Array.from(shift.querySelectorAll('button, input[type="submit"], input[type="button"], a')).find((el) => {
        const text = elementText(el)
        return /final submit|final submission/i.test(text)
      })

      if (!finalButton) return
      let checkbox = shift.querySelector('.bw-shift-select input[type="checkbox"]')
      if (!checkbox) {
        const wrapper = document.createElement('label')
        wrapper.className = 'bw-shift-select'
        checkbox = document.createElement('input')
        checkbox.type = 'checkbox'
        checkbox.className = 'bw-shift-checkbox'
        checkbox.dataset.shiftIndex = String(index)
        const text = document.createElement('span')
        text.textContent = 'Include in Final Submission'
        wrapper.appendChild(checkbox)
        wrapper.appendChild(text)
        shift.insertBefore(wrapper, shift.firstChild)
      }
      selectable.push({ shift, checkbox, button: finalButton })
    })

    if (!selectable.length) return
    if (document.querySelector('.bw-final-submit-panel')) return

    const panel = document.createElement('section')
    panel.className = 'bw-final-submit-panel final-warning'
    panel.innerHTML = '<div class="eyebrow">Final Submission</div>' +
      '<div class="bw-final-submit-panel__row">' +
      '<label><input type="checkbox" class="bw-select-all-final"> Select all for Final Submission</label>' +
      '<button type="button" class="btn btn-dark bw-final-submit-go">Submit selected</button>' +
      '</div>'

    const selectAll = panel.querySelector('.bw-select-all-final')
    const submit = panel.querySelector('.bw-final-submit-go')

    selectAll.addEventListener('change', () => {
      selectable.forEach((item) => { item.checkbox.checked = selectAll.checked })
    })

    submit.addEventListener('click', async () => {
      const chosen = selectable.filter((item) => item.checkbox.checked)
      if (!chosen.length) {
        window.alert('Select at least one shift to final submit.')
        return
      }

      submit.disabled = true
      submit.textContent = 'Submitting ' + chosen.length + ' shift' + (chosen.length === 1 ? '' : 's') + '…'

      try {
        for (const item of chosen) {
          const form = item.button.closest('form')
          if (!form) {
            item.button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
            continue
          }
          const action = form.getAttribute('action') || window.location.pathname
          const method = (form.getAttribute('method') || 'POST').toUpperCase()
          const formData = new FormData(form)
          if (item.button instanceof HTMLInputElement && item.button.name) formData.append(item.button.name, item.button.value || '1')
          if (item.button instanceof HTMLButtonElement && item.button.name) formData.append(item.button.name, item.button.value || '1')
          await fetch(action, { method, body: formData, credentials: 'include' })
        }
        window.location.reload()
      } catch (err) {
        console.error('bulk final submission failed', err)
        window.alert('Bulk final submission failed. Please try again.')
        submit.disabled = false
        submit.textContent = 'Submit selected'
      }
    })

    const insertionPoint = shifts[0]
    insertionPoint.parentElement?.insertBefore(panel, insertionPoint)
  }

  function runEnhancements() {
    if (!window.location.pathname.startsWith('/wages')) return
    forceWagesProxyRouting()
    consumeMissedQueryFlag()
    detectAndPersistActiveStaffProfile()
    removeStaffDashboardAccess()
    fixSwitchPerson()
    bindPayrollWeekPickerPersistence()
    decorateButtons()
    document.querySelectorAll('.bw-home-miss-shift-btn').forEach((node) => node.remove())
    document.querySelectorAll('.bw-period-tools, .bw-last-payroll-btn').forEach((node) => node.remove())
    moveAddShiftNearSaveTemporary()
    unlockPayrollWeekPicker()
    hidePayrollWeekSection()
    enhanceMissedShiftForms()
    hideLockedPayrollWarnings()
    hideOvernightPrompt()
    addBulkFinalSubmission()
  }

  const scheduleRun = () => window.requestAnimationFrame(runEnhancements)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleRun, { once: true })
  } else {
    scheduleRun()
  }

  const observer = new MutationObserver(() => scheduleRun())
  observer.observe(document.documentElement, { childList: true, subtree: true })
})();
</script>`,
      { html: true },
    )
  }
}

function buildPrompt() {
  return `You are extracting equipment order details from a photo of an events order sheet used by B&W Productions, a South African events company.

Rules:
1. Extract venue/event name, date, client, contact person, contact number, and all equipment items with quantities.
2. Put recognised stock/equipment into line_items.
3. Put unclear or custom items into other_items.
4. If a value is not visible, leave it blank instead of guessing.
5. Dates should be formatted as YYYY-MM-DD where possible.
6. Respond with JSON only, with no markdown fencing.

Return exactly this JSON structure:
{
  "venue": "",
  "event_name": "",
  "client": "",
  "attention": "",
  "contact_number": "",
  "delivery_date": "",
  "notes": "",
  "line_items": [
    { "item_name": "", "quantity": 1, "brand": "" }
  ],
  "other_items": [
    { "description": "", "quantity": 1 }
  ]
}`
}

async function handleAiExtract(c: any) {
  try {
    const body = await c.req.json()
    const images = Array.isArray(body?.images) ? body.images : []
    const apiKey = (c.env.ANTHROPIC_API_KEY || '').trim()

    if (!apiKey) {
      return c.json({ success: false, error: 'ANTHROPIC_API_KEY is not configured on this deployment.' }, 500)
    }

    if (!images.length) {
      return c.json({ success: false, error: 'No images provided' }, 400)
    }

    const imageBlocks = images
      .map((dataUrl: string) => {
        const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
        if (!match) return null
        return {
          type: 'image',
          source: {
            type: 'base64',
            media_type: match[1],
            data: match[2],
          },
        }
      })
      .filter(Boolean)

    if (!imageBlocks.length) {
      return c.json({ success: false, error: 'Images must be base64 data URLs.' }, 400)
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-7',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: [...imageBlocks, { type: 'text', text: buildPrompt() }],
          },
        ],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      return c.json({ success: false, error: 'Claude API error: ' + err }, 500)
    }

    const aiResult: any = await response.json()
    const text = aiResult.content?.[0]?.text || ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)

    if (!jsonMatch) {
      return c.json({ success: false, error: 'Could not parse AI response', raw: text }, 500)
    }

    const extracted = JSON.parse(jsonMatch[0])
    return c.json({ success: true, data: extracted })
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || 'Unknown AI extract error' }, 500)
  }
}

function rewriteHeaders(response: Response, browserOrigin: string) {
  const headers = new Headers(response.headers)
  const location = headers.get('location')
  if (location && location.startsWith(ORIGIN)) {
    headers.set('location', browserOrigin + location.slice(ORIGIN.length))
  }
  return headers
}

function rewriteRequestHeaders(rawHeaders: Headers, incomingUrl: URL, upstreamUrl: URL) {
  const upstreamHeaders = new Headers(rawHeaders)
  upstreamHeaders.set('host', upstreamUrl.host)
  upstreamHeaders.set('x-forwarded-host', incomingUrl.host)
  upstreamHeaders.set('x-forwarded-proto', incomingUrl.protocol.replace(':', ''))

  const incomingOrigin = incomingUrl.origin
  const upstreamOrigin = upstreamUrl.origin
  const originHeader = upstreamHeaders.get('origin')
  if (originHeader === incomingOrigin) {
    upstreamHeaders.set('origin', upstreamOrigin)
  }

  const refererHeader = upstreamHeaders.get('referer')
  if (refererHeader?.startsWith(incomingOrigin)) {
    upstreamHeaders.set('referer', upstreamOrigin + refererHeader.slice(incomingOrigin.length))
  }

  return upstreamHeaders
}

function normalizeProxyFieldValue(value: FormDataEntryValue | null) {
  return typeof value === 'string' ? value.trim() : ''
}

function parseProxyIsoDate(value: string) {
  const match = (value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const parsed = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatProxyIsoDate(date: Date) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function proxyStartOfPayrollWeek(date: Date) {
  const copy = new Date(date.getTime())
  const offset = (copy.getUTCDay() + 1) % 7
  copy.setUTCDate(copy.getUTCDate() - offset)
  return copy
}

function currentProxyPayrollWeekStart() {
  const now = new Date()
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  return formatProxyIsoDate(proxyStartOfPayrollWeek(today))
}

function formKeyLooksLikeClaimWeek(key: string) {
  const normalized = (key || '').trim().toLowerCase()
  if (!normalized) return false
  if (normalized === 'work_date' || normalized === 'bw_visible_work_date' || normalized === 'date_worked' || normalized === 'bw_actual_work_date') return false
  if (normalized.includes('payroll_week') || normalized.includes('week_start') || normalized.includes('pay_week') || normalized.includes('claim_week') || normalized.includes('period_start')) return true
  if (normalized.endsWith('week') || normalized.includes('week')) return true
  return false
}

function proxyObjectPathTail(path: string) {
  const tail = (path || '').trim().split('.').pop() || ''
  return tail.replace(/\[\d+\]$/g, '').toLowerCase()
}

function objectKeyLooksLikeActualWorkDate(path: string) {
  const normalized = proxyObjectPathTail(path)
  return ['bw_actual_work_date', 'date_worked', 'actual_work_date', 'physical_work_date', 'exact_work_date', 'work_date', 'bw_visible_work_date'].includes(normalized)
}

function objectKeyLooksLikeMissedFlag(path: string) {
  return proxyObjectPathTail(path) === 'missed_previous_week'
}

function objectKeyLooksLikeMissedMode(path: string) {
  return proxyObjectPathTail(path) === 'bw_missed_shift_mode'
}

function extractInterestingObjectFields(value: unknown, path = '', snapshot: Record<string, string> = {}) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      extractInterestingObjectFields(entry, path ? `${path}[${index}]` : `[${index}]`, snapshot)
    })
    return snapshot
  }
  if (value && typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
      extractInterestingObjectFields(entry, path ? `${path}.${key}` : key, snapshot)
    })
    return snapshot
  }
  if (path && /work_date|date_worked|actual_work_date|physical_work_date|exact_work_date|payroll|week|missed|start_time|end_time|submit|draft|save|bw_/i.test(path)) {
    snapshot[path] = value == null ? '' : String(value)
  }
  return snapshot
}

function normalizeProxySnippet(value: string, limit = 1800) {
  return (value || '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

function parseProxyJsonPayload(rawText: string, contentType: string) {
  const trimmed = (rawText || '').trim()
  if (!trimmed) return null
  if (!/application\/json/i.test(contentType) && !/^[\[{]/.test(trimmed)) return null
  try {
    const parsed = JSON.parse(trimmed)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function parseProxyUrlEncodedPayload(rawText: string, contentType: string) {
  const trimmed = (rawText || '').trim()
  if (!trimmed) return null
  if (!/application\/x-www-form-urlencoded/i.test(contentType) && !/^[^\s=&]+=[^]*$/.test(trimmed)) return null
  const params = new URLSearchParams(trimmed)
  if (!Array.from(params.keys()).length) return null
  const formData = new FormData()
  params.forEach((value, key) => {
    formData.append(key, value)
  })
  return formData
}

function findObjectFieldValue(snapshot: Record<string, string>, matcher: (path: string) => boolean) {
  const foundKey = Object.keys(snapshot).find((path) => matcher(path))
  return foundKey ? normalizeProxyFieldValue(snapshot[foundKey]) : ''
}

function objectKeyLooksLikeClaimWeekMarker(path: string) {
  return proxyObjectPathTail(path) === 'bw_claim_week_start'
}

function findSnapshotClaimWeekStart(snapshot: Record<string, string>) {
  return findObjectFieldValue(snapshot, objectKeyLooksLikeClaimWeekMarker)
    || findObjectFieldValue(snapshot, (path) => formKeyLooksLikeClaimWeek(proxyObjectPathTail(path)) && !objectKeyLooksLikeClaimWeekMarker(path))
    || currentProxyPayrollWeekStart()
}

function findFormClaimWeekStart(formData: FormData) {
  const explicitClaimWeek = normalizeProxyFieldValue(formData.get('bw_claim_week_start'))
  if (explicitClaimWeek) return explicitClaimWeek
  for (const key of Array.from(new Set(Array.from(formData.keys())))) {
    if (key === 'bw_claim_week_start') continue
    if (!formKeyLooksLikeClaimWeek(key)) continue
    const value = normalizeProxyFieldValue(formData.get(key))
    if (value) return value
  }
  return currentProxyPayrollWeekStart()
}

function findSearchClaimWeekStart(searchParams: URLSearchParams) {
  const explicitClaimWeek = (searchParams.get('bw_claim_week_start') || '').trim()
  if (explicitClaimWeek) return explicitClaimWeek
  for (const key of Array.from(new Set(Array.from(searchParams.keys())))) {
    if (key === 'bw_claim_week_start') continue
    if (!formKeyLooksLikeClaimWeek(key)) continue
    const value = (searchParams.get(key) || '').trim()
    if (value) return value
  }
  return ''
}

function rewritePreviousPayrollGetRequest(incomingUrl: URL, upstreamUrl: URL) {
  if (!incomingUrl.pathname.startsWith('/wages')) return
  if (incomingUrl.pathname === '/wages' || incomingUrl.pathname === '/wages/') return
  const requestedClaimWeek = findSearchClaimWeekStart(incomingUrl.searchParams)
  const requestedClaimWeekDate = parseProxyIsoDate(requestedClaimWeek)
  const currentClaimWeekStart = currentProxyPayrollWeekStart()
  const currentClaimWeekDate = parseProxyIsoDate(currentClaimWeekStart)
  const shouldForceOpenPayroll = !!(requestedClaimWeekDate && currentClaimWeekDate && requestedClaimWeekDate.getTime() < currentClaimWeekDate.getTime())
  if (!shouldForceOpenPayroll) return
  Array.from(new Set(Array.from(upstreamUrl.searchParams.keys()))).forEach((key) => {
    if (key !== 'bw_claim_week_start' && formKeyLooksLikeClaimWeek(key)) {
      upstreamUrl.searchParams.set(key, currentClaimWeekStart)
    }
  })
}

function shouldRewriteMissedShiftObjectPayload(snapshot: Record<string, string>) {
  const explicitMarker = findObjectFieldValue(snapshot, objectKeyLooksLikeMissedMode) === '1'
  const previousPayrollFlag = findObjectFieldValue(snapshot, objectKeyLooksLikeMissedFlag) === '1'
  const note = findObjectFieldValue(snapshot, (path) => proxyObjectPathTail(path) === 'payroll_note')
  const actualWorkDateValue = findObjectFieldValue(snapshot, objectKeyLooksLikeActualWorkDate)
  const actualWorkDateParsed = parseProxyIsoDate(actualWorkDateValue)
  const currentClaimWeekParsed = parseProxyIsoDate(currentProxyPayrollWeekStart())
  const hasShiftTimes = !!findObjectFieldValue(snapshot, (path) => proxyObjectPathTail(path) === 'start_time')
    || !!findObjectFieldValue(snapshot, (path) => proxyObjectPathTail(path) === 'end_time')
  const looksLikePreviousPayrollShift = !!(actualWorkDateParsed && currentClaimWeekParsed && actualWorkDateParsed.getTime() < currentClaimWeekParsed.getTime() && hasShiftTimes)
  return explicitMarker || previousPayrollFlag || /belongs to previous payroll:\s*yes/i.test(note) || looksLikePreviousPayrollShift
}

function rewriteMissedShiftObjectPayload(payload: unknown, upstreamUrl: URL) {
  if (!payload || typeof payload !== 'object') return
  const snapshot = extractInterestingObjectFields(payload)
  const captureWeekStart = currentProxyPayrollWeekStart()
  const claimedAgainstWeekStart = findSnapshotClaimWeekStart(snapshot)
  const captureWeekDate = parseProxyIsoDate(captureWeekStart)
  const actualWorkDateValue = findObjectFieldValue(snapshot, objectKeyLooksLikeActualWorkDate)
  const actualWorkDateParsed = parseProxyIsoDate(actualWorkDateValue)
  const isPreviousPayroll = !!(captureWeekDate && actualWorkDateParsed && actualWorkDateParsed.getTime() < captureWeekDate.getTime())

  const rewriteNode = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach((entry) => rewriteNode(entry))
      return
    }
    if (!value || typeof value !== 'object') return
    Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
      if (objectKeyLooksLikeMissedFlag(key)) {
        ;(value as Record<string, unknown>)[key] = isPreviousPayroll ? '1' : '0'
        return
      }
      if (objectKeyLooksLikeMissedMode(key)) {
        ;(value as Record<string, unknown>)[key] = '1'
        return
      }
      if (objectKeyLooksLikeClaimWeekMarker(key)) {
        ;(value as Record<string, unknown>)[key] = claimedAgainstWeekStart
        return
      }
      if (formKeyLooksLikeClaimWeek(key)) {
        ;(value as Record<string, unknown>)[key] = captureWeekStart
        return
      }
      if (objectKeyLooksLikeActualWorkDate(key) && actualWorkDateValue) {
        ;(value as Record<string, unknown>)[key] = actualWorkDateValue
        return
      }
      rewriteNode(entry)
    })
  }

  rewriteNode(payload)

  Array.from(new Set(Array.from(upstreamUrl.searchParams.keys()))).forEach((key) => {
    if (key !== 'bw_claim_week_start' && formKeyLooksLikeClaimWeek(key)) {
      upstreamUrl.searchParams.set(key, captureWeekStart)
    }
  })
}

function shouldRewriteMissedShiftSubmission(formData: FormData) {
  const explicitMarker = normalizeProxyFieldValue(formData.get('bw_missed_shift_mode')) === '1'
  const previousPayrollFlag = normalizeProxyFieldValue(formData.get('missed_previous_week')) === '1'
  const note = normalizeProxyFieldValue(formData.get('payroll_note'))
  const actualWorkDateValue = normalizeProxyFieldValue(formData.get('bw_actual_work_date'))
    || normalizeProxyFieldValue(formData.get('date_worked'))
    || normalizeProxyFieldValue(formData.get('actual_work_date'))
    || normalizeProxyFieldValue(formData.get('physical_work_date'))
    || normalizeProxyFieldValue(formData.get('exact_work_date'))
    || normalizeProxyFieldValue(formData.get('work_date'))
    || normalizeProxyFieldValue(formData.get('bw_visible_work_date'))
  const actualWorkDateParsed = parseProxyIsoDate(actualWorkDateValue)
  const currentClaimWeekParsed = parseProxyIsoDate(currentProxyPayrollWeekStart())
  const hasShiftTimes = !!normalizeProxyFieldValue(formData.get('start_time')) || !!normalizeProxyFieldValue(formData.get('end_time'))
  const looksLikePreviousPayrollShift = !!(actualWorkDateParsed && currentClaimWeekParsed && actualWorkDateParsed.getTime() < currentClaimWeekParsed.getTime() && hasShiftTimes)
  return explicitMarker || previousPayrollFlag || /belongs to previous payroll:\s*yes/i.test(note) || looksLikePreviousPayrollShift
}

function rewriteMissedShiftSubmission(formData: FormData, upstreamUrl: URL) {
  const captureWeekStart = currentProxyPayrollWeekStart()
  const claimedAgainstWeekStart = findFormClaimWeekStart(formData)
  const captureWeekDate = parseProxyIsoDate(captureWeekStart)
  const actualWorkDate = normalizeProxyFieldValue(formData.get('bw_actual_work_date'))
    || normalizeProxyFieldValue(formData.get('date_worked'))
    || normalizeProxyFieldValue(formData.get('actual_work_date'))
    || normalizeProxyFieldValue(formData.get('physical_work_date'))
    || normalizeProxyFieldValue(formData.get('exact_work_date'))
    || normalizeProxyFieldValue(formData.get('work_date'))
    || normalizeProxyFieldValue(formData.get('bw_visible_work_date'))
  const actualWorkDateValue = actualWorkDate || normalizeProxyFieldValue(formData.get('work_date'))
  const actualWorkDateParsed = parseProxyIsoDate(actualWorkDateValue)
  const isPreviousPayroll = !!(captureWeekDate && actualWorkDateParsed && actualWorkDateParsed.getTime() < captureWeekDate.getTime())

  Array.from(new Set(Array.from(formData.keys()))).forEach((key) => {
    if (key !== 'bw_claim_week_start' && formKeyLooksLikeClaimWeek(key)) {
      formData.set(key, captureWeekStart)
    }
  })

  formData.set('payroll_week_start', captureWeekStart)
  formData.set('bw_claim_week_start', claimedAgainstWeekStart)
  formData.set('missed_previous_week', isPreviousPayroll ? '1' : '0')
  formData.set('bw_missed_shift_mode', '1')

  if (actualWorkDateValue) {
    formData.set('bw_actual_work_date', actualWorkDateValue)
    if (formData.has('date_worked')) formData.set('date_worked', actualWorkDateValue)
    if (formData.has('actual_work_date')) formData.set('actual_work_date', actualWorkDateValue)
    if (formData.has('physical_work_date')) formData.set('physical_work_date', actualWorkDateValue)
    if (formData.has('exact_work_date')) formData.set('exact_work_date', actualWorkDateValue)
    if (formData.has('bw_visible_work_date')) formData.set('bw_visible_work_date', actualWorkDateValue)
    if (formData.has('work_date')) formData.set('work_date', actualWorkDateValue)
  }

  Array.from(new Set(Array.from(upstreamUrl.searchParams.keys()))).forEach((key) => {
    if (key !== 'bw_claim_week_start' && formKeyLooksLikeClaimWeek(key)) {
      upstreamUrl.searchParams.set(key, captureWeekStart)
    }
  })
}

function findProxyFormValue(formData: FormData, keys: string[]) {
  for (const key of keys) {
    const value = normalizeProxyFieldValue(formData.get(key))
    if (value) return value
  }
  return ''
}

function parseProxyInteger(value: string) {
  const parsed = Number.parseInt((value || '').trim(), 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseProxyClockMinutes(value: string) {
  const match = (value || '').trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return hours * 60 + minutes
}

function inferProxyOvernightFromTimes(startValue: string, endValue: string) {
  const startMinutes = parseProxyClockMinutes(startValue)
  const endMinutes = parseProxyClockMinutes(endValue)
  if (startMinutes === null || endMinutes === null) return false
  return endMinutes < startMinutes
}

function proxySqlNow() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

function resolveMissedShiftSaveStatus(formData: FormData) {
  const explicit = findProxyFormValue(formData, ['save_action', 'status', 'action'])
  if (/draft|temp/i.test(explicit)) return 'draft'
  if (/final|submit/i.test(explicit)) return 'submitted'

  for (const key of Array.from(new Set(Array.from(formData.keys())))) {
    const normalizedKey = (key || '').trim().toLowerCase()
    const value = normalizeProxyFieldValue(formData.get(key))
    if (/final|submit/.test(normalizedKey) || /final|submit/i.test(value)) return 'submitted'
    if (/draft|temp/.test(normalizedKey) || /draft|temp/i.test(value)) return 'draft'
  }

  return 'draft'
}

function findProxyStaffIdInUrl(url: URL | null | undefined) {
  if (!url) return 0
  return parseProxyInteger(normalizeProxyFieldValue(url.searchParams.get('staff_id'))
    || normalizeProxyFieldValue(url.searchParams.get('person_id'))
    || normalizeProxyFieldValue(url.searchParams.get('worker_id'))
    || normalizeProxyFieldValue(url.searchParams.get('employee_id'))
    || normalizeProxyFieldValue(url.searchParams.get('bw_staff_id'))
    || normalizeProxyFieldValue(url.searchParams.get('staff')))
}

function hydrateProxyStaffId(request: Request, incomingUrl: URL, formData: FormData) {
  const existingStaffId = parseProxyInteger(findProxyFormValue(formData, ['staff_id', 'person_id', 'worker_id', 'employee_id', 'bw_staff_id']))
  if (existingStaffId) return existingStaffId

  const directUrlStaffId = findProxyStaffIdInUrl(incomingUrl)
  if (directUrlStaffId) {
    formData.set('staff_id', String(directUrlStaffId))
    return directUrlStaffId
  }

  const referer = request.headers.get('referer') || ''
  if (referer) {
    try {
      const refererUrl = new URL(referer)
      const refererStaffId = findProxyStaffIdInUrl(refererUrl)
      if (refererStaffId) {
        formData.set('staff_id', String(refererStaffId))
        return refererStaffId
      }
    } catch (err) {}
  }

  return 0
}

async function saveMissedShiftDirectly(env: Bindings | undefined, formData: FormData) {
  const db = env?.DB
  if (!db) return { ok: false, reason: 'missing_db' as const }

  const staffId = parseProxyInteger(findProxyFormValue(formData, ['staff_id', 'person_id', 'worker_id', 'employee_id', 'bw_staff_id']))
  if (!staffId) return { ok: false, reason: 'missing_staff' as const }

  const workDate = findProxyFormValue(formData, ['bw_actual_work_date', 'date_worked', 'actual_work_date', 'physical_work_date', 'exact_work_date', 'work_date', 'bw_visible_work_date'])
  const workDateParsed = parseProxyIsoDate(workDate)
  if (!workDateParsed) return { ok: false, reason: 'missing_work_date' as const }

  const captureWeekStart = currentProxyPayrollWeekStart()
  const claimedAgainstWeekStart = formatProxyIsoDate(proxyStartOfPayrollWeek(workDateParsed))
  const status = resolveMissedShiftSaveStatus(formData)
  const submittedAt = status === 'submitted' ? proxySqlNow() : null
  const venue = findProxyFormValue(formData, ['outlet_venue', 'venue_name', 'venue'])
  const area = findProxyFormValue(formData, ['area'])
  const workType = findProxyFormValue(formData, ['work_type', 'role_worked'])
  const workDescription = findProxyFormValue(formData, ['work_description', 'details', 'description'])
  const startTime = findProxyFormValue(formData, ['start_time', 'start'])
  const endTime = findProxyFormValue(formData, ['end_time', 'finish_time', 'finish'])
  const overnightExplicit = /^(1|true|yes|on)$/i.test(findProxyFormValue(formData, ['overnight_confirmed', 'next_overnight_shift', 'overnight']))
  const overnightConfirmed = overnightExplicit || inferProxyOvernightFromTimes(startTime, endTime) ? 1 : 0
  const note = [
    'Claimed against payroll week ' + claimedAgainstWeekStart + '.',
    'Captured under current payroll week ' + captureWeekStart + '.',
    'Exact work date ' + workDate + '.',
    venue ? 'Venue ' + venue + '.' : '',
    workType ? 'Work type / role ' + workType + '.' : '',
    workDescription ? 'Description ' + workDescription + '.' : '',
    (startTime || endTime) ? 'Captured time ' + (startTime || '??') + '-' + (endTime || '??') + '.' : '',
    'Belongs to previous payroll: Yes.',
    'Do not block staff entry. Do not auto-call it duplicate. Create backend manual overlap review only where an existing entry conflicts.',
  ].filter(Boolean).join(' ')

  const result = await db.prepare(`INSERT INTO wage_shift_drafts (
    staff_id,
    work_date,
    outlet_venue,
    area,
    work_type,
    work_description,
    start_time,
    end_time,
    status,
    submitted_at,
    missed_previous_week,
    overnight_confirmed,
    payroll_week_start,
    payroll_note
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      staffId,
      workDate,
      venue || null,
      area || null,
      workType || null,
      workDescription || null,
      startTime || null,
      endTime || null,
      status,
      submittedAt,
      1,
      overnightConfirmed,
      captureWeekStart,
      note,
    )
    .run()

  return {
    ok: true,
    status,
    captureWeekStart,
    claimedAgainstWeekStart,
    insertedId: Number(result.meta?.last_row_id || 0),
  }
}

function describeProxyError(err: unknown) {
  if (err instanceof Error) {
    const firstStackLine = String(err.stack || '').split('\n').map((line) => line.trim()).filter(Boolean)[0] || ''
    return [err.message, firstStackLine && firstStackLine !== err.message ? firstStackLine : ''].filter(Boolean).join(' | ')
  }
  return typeof err === 'string' ? err : JSON.stringify(err)
}

async function handleDirectMissedShiftSave(c: any, incomingUrl: URL, formData: FormData) {
  const originalSnapshot = { _content_type: c.req.raw.headers.get('content-type') || '(none)', ...extractInterestingFormFields(formData) }

  try {
    const hydratedStaffId = hydrateProxyStaffId(c.req.raw, incomingUrl, formData)
    const saveResult = await saveMissedShiftDirectly(c.env, formData)
    if (!saveResult.ok) return null

    const redirectUrl = new URL('/wages/me', incomingUrl.origin)
    if (saveResult.status === 'submitted') {
      redirectUrl.searchParams.set('final_submitted', '1')
    } else {
      redirectUrl.searchParams.set('draft_saved', '1')
    }
    redirectUrl.searchParams.set('payroll_week_start', saveResult.captureWeekStart)
    if (saveResult.claimedAgainstWeekStart) redirectUrl.searchParams.set('bw_claim_week_start', saveResult.claimedAgainstWeekStart)

    const rewrittenSnapshot = {
      ...originalSnapshot,
      staff_id: originalSnapshot.staff_id || (hydratedStaffId ? String(hydratedStaffId) : ''),
      payroll_week_start: saveResult.captureWeekStart,
      bw_claim_week_start: saveResult.claimedAgainstWeekStart,
      missed_previous_week: '1',
      bw_missed_shift_mode: '1',
      _direct_save: saveResult.status,
      _inserted_id: String(saveResult.insertedId || ''),
    }

    await captureWagesDebug(c.env, {
      request_path: incomingUrl.pathname + incomingUrl.search,
      request_method: (c.req.raw.method || 'POST').toUpperCase(),
      original_payload_json: JSON.stringify(originalSnapshot),
      rewritten_payload_json: JSON.stringify(rewrittenSnapshot),
      rewrite_applied: 1,
      response_status: 302,
      response_location: redirectUrl.pathname + redirectUrl.search,
      response_error_text: '',
    })

    return new Response(null, {
      status: 302,
      headers: {
        location: redirectUrl.pathname + redirectUrl.search,
        'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
        pragma: 'no-cache',
        expires: '0',
      },
    })
  } catch (err) {
    await captureWagesDebug(c.env, {
      request_path: incomingUrl.pathname + incomingUrl.search,
      request_method: (c.req.raw.method || 'POST').toUpperCase(),
      original_payload_json: JSON.stringify(originalSnapshot),
      rewritten_payload_json: JSON.stringify({
        ...originalSnapshot,
        _direct_save_error: '1',
      }),
      rewrite_applied: 1,
      response_status: 500,
      response_location: '',
      response_error_text: describeProxyError(err),
    })
    throw err
  }
}

function parseDirectFinalSubmitDraftId(pathname: string) {
  const match = (pathname || '').match(/^\/wages\/drafts\/(\d+)\/final-submit\/?$/i)
  if (!match) return 0
  return Number.parseInt(match[1], 10) || 0
}

async function finalizeWageDraftDirectly(env: Bindings | undefined, draftId: number, formData: FormData) {
  const db = env?.DB
  if (!db) return { ok: false, reason: 'missing_db' as const }
  if (!draftId) return { ok: false, reason: 'missing_draft' as const }

  const existing = await db.prepare(`SELECT id, status, staff_id, work_date, payroll_week_start
    FROM wage_shift_drafts
    WHERE id = ?`)
    .bind(draftId)
    .first<{ id: number, status: string | null, staff_id: number | null, work_date: string | null, payroll_week_start: string | null }>()

  if (!existing?.id) return { ok: false, reason: 'missing_row' as const }

  const submittedAt = proxySqlNow()
  const confirmationValue = findProxyFormValue(formData, ['end_time_correct', 'confirm', 'confirmation']) || 'yes'
  const reviewNote = [
    'Proxy final-submission fallback applied.',
    'Draft ' + String(draftId) + ' marked submitted at ' + submittedAt + '.',
    'End-time confirmation ' + confirmationValue + '.',
  ].join(' ')

  await db.prepare(`UPDATE wage_shift_drafts
    SET status = 'submitted',
        submitted_at = COALESCE(submitted_at, ?),
        payroll_note = CASE
          WHEN COALESCE(payroll_note, '') = '' THEN ?
          WHEN instr(COALESCE(payroll_note, ''), 'Proxy final-submission fallback applied.') > 0 THEN payroll_note
          ELSE payroll_note || CHAR(10) || ?
        END
    WHERE id = ?`)
    .bind(submittedAt, reviewNote, reviewNote, draftId)
    .run()

  return {
    ok: true,
    draftId,
    status: existing.status || 'draft',
    staffId: Number(existing.staff_id || 0),
    workDate: existing.work_date || '',
    payrollWeekStart: existing.payroll_week_start || '',
    submittedAt,
  }
}

async function handleDirectDraftFinalSubmit(c: any, incomingUrl: URL, formData: FormData, draftId: number) {
  const originalSnapshot = { _content_type: c.req.raw.headers.get('content-type') || '(none)', ...extractInterestingFormFields(formData) }

  try {
    const finalizeResult = await finalizeWageDraftDirectly(c.env, draftId, formData)
    if (!finalizeResult.ok) return null

    const redirectUrl = new URL('/wages/me', incomingUrl.origin)
    redirectUrl.searchParams.set('final_submitted', '1')
    redirectUrl.searchParams.set('draft_id', String(draftId))

    const rewrittenSnapshot = {
      ...originalSnapshot,
      _direct_final_submit: '1',
      _draft_id: String(draftId),
      _submitted_at: finalizeResult.submittedAt,
    }

    await captureWagesDebug(c.env, {
      request_path: incomingUrl.pathname + incomingUrl.search,
      request_method: (c.req.raw.method || 'POST').toUpperCase(),
      original_payload_json: JSON.stringify(originalSnapshot),
      rewritten_payload_json: JSON.stringify(rewrittenSnapshot),
      rewrite_applied: 1,
      response_status: 302,
      response_location: redirectUrl.pathname + redirectUrl.search,
      response_error_text: '',
    })

    return new Response(null, {
      status: 302,
      headers: {
        location: redirectUrl.pathname + redirectUrl.search,
        'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
        pragma: 'no-cache',
        expires: '0',
      },
    })
  } catch (err) {
    await captureWagesDebug(c.env, {
      request_path: incomingUrl.pathname + incomingUrl.search,
      request_method: (c.req.raw.method || 'POST').toUpperCase(),
      original_payload_json: JSON.stringify(originalSnapshot),
      rewritten_payload_json: JSON.stringify({
        ...originalSnapshot,
        _direct_final_submit_error: '1',
        _draft_id: String(draftId),
      }),
      rewrite_applied: 1,
      response_status: 500,
      response_location: '',
      response_error_text: describeProxyError(err),
    })
    throw err
  }
}

function shouldCaptureWagesDebug(incomingUrl: URL, formData: FormData) {
  if (!(incomingUrl.pathname === '/wages' || incomingUrl.pathname.startsWith('/wages/'))) return false
  return Array.from(new Set(Array.from(formData.keys()))).some((key) => /work_date|date_worked|actual_work_date|physical_work_date|exact_work_date|payroll|week|missed|start_time|end_time|submit|draft|save/i.test(key))
}

function extractInterestingFormFields(formData: FormData) {
  const snapshot: Record<string, string> = {}
  Array.from(new Set(Array.from(formData.keys()))).forEach((key) => {
    if (!/staff_id|person_id|worker_id|employee_id|work_date|date_worked|actual_work_date|physical_work_date|exact_work_date|payroll|week|missed|overnight|start_time|end_time|submit|draft|save|bw_/i.test(key)) return
    const values = formData.getAll(key).map((value) => typeof value === 'string' ? value : `[file:${value.name || 'blob'}]`)
    snapshot[key] = values.join(' | ')
  })
  return snapshot
}

async function captureWagesDebug(env: Bindings | undefined, entry: {
  request_path: string,
  request_method: string,
  original_payload_json: string,
  rewritten_payload_json: string,
  rewrite_applied: number,
  response_status: number,
  response_location: string,
  response_error_text: string,
}) {
  const db = env?.DB
  if (!db) return
  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS wage_debug_capture (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      request_path TEXT NOT NULL,
      request_method TEXT NOT NULL,
      original_payload_json TEXT,
      rewritten_payload_json TEXT,
      rewrite_applied INTEGER NOT NULL DEFAULT 0,
      response_status INTEGER,
      response_location TEXT,
      response_error_text TEXT
    )`).run()

    await db.prepare(`INSERT INTO wage_debug_capture (
      request_path,
      request_method,
      original_payload_json,
      rewritten_payload_json,
      rewrite_applied,
      response_status,
      response_location,
      response_error_text
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        entry.request_path,
        entry.request_method,
        entry.original_payload_json,
        entry.rewritten_payload_json,
        entry.rewrite_applied,
        entry.response_status,
        entry.response_location,
        entry.response_error_text,
      )
      .run()

    await db.prepare(`DELETE FROM wage_debug_capture
      WHERE id NOT IN (
        SELECT id FROM wage_debug_capture ORDER BY id DESC LIMIT 20
      )`).run()
  } catch (err) {
    console.warn('wage debug capture failed', err)
  }
}

async function describeWagesDebugResponse(response: Response) {
  const contentType = response.headers.get('content-type') || ''
  const location = response.headers.get('location') || ''
  if (!contentType.includes('text/html')) {
    return { location, errorText: '' }
  }
  const text = await response.text()
  const directMatch = text.match(/That payroll week[\s\S]{0,280}?not Sunday\./i)
    || text.match(/Choose a valid work date\.?/i)
    || text.match(/You cannot save or finally submit shifts against it\.[\s\S]{0,220}/i)
  const errorText = directMatch
    ? directMatch[0].replace(/\s+/g, ' ').trim()
    : ''
  return { location, errorText }
}

async function buildUpstreamRequest(c: any, incomingUrl: URL, upstreamUrl: URL, upstreamHeaders: Headers) {
  const method = (c.req.raw.method || 'GET').toUpperCase()
  if (['GET', 'HEAD'].includes(method)) {
    return {
      upstreamRequest: new Request(upstreamUrl.toString(), {
        method,
        headers: upstreamHeaders,
        redirect: 'manual',
      }),
      debugCapture: null,
    }
  }

  const contentType = c.req.raw.headers.get('content-type') || ''
  const isWagesPath = incomingUrl.pathname === '/wages' || incomingUrl.pathname.startsWith('/wages/')
  const canRewriteForm = /application\/x-www-form-urlencoded|multipart\/form-data/i.test(contentType)

  if (isWagesPath && canRewriteForm) {
    const formData = await c.req.raw.clone().formData()
    const shouldCaptureDebug = shouldCaptureWagesDebug(incomingUrl, formData)
    const originalSnapshot = shouldCaptureDebug
      ? { _content_type: contentType || '(none)', ...extractInterestingFormFields(formData) }
      : null
    const rewriteApplied = shouldRewriteMissedShiftSubmission(formData)

    if (rewriteApplied) {
      rewriteMissedShiftSubmission(formData, upstreamUrl)
    }

    const rewrittenSnapshot = shouldCaptureDebug
      ? { _content_type: contentType || '(none)', ...extractInterestingFormFields(formData) }
      : null

    upstreamHeaders.delete('content-length')

    let upstreamRequest: Request
    if (/application\/x-www-form-urlencoded/i.test(contentType)) {
      const params = new URLSearchParams()
      let hasBinaryField = false
      formData.forEach((value, key) => {
        if (typeof value === 'string') {
          params.append(key, value)
        } else {
          hasBinaryField = true
        }
      })
      if (!hasBinaryField) {
        upstreamHeaders.set('content-type', 'application/x-www-form-urlencoded;charset=UTF-8')
        upstreamRequest = new Request(upstreamUrl.toString(), {
          method,
          headers: upstreamHeaders,
          body: params.toString(),
          redirect: 'manual',
        })
      } else {
        upstreamHeaders.delete('content-type')
        upstreamRequest = new Request(upstreamUrl.toString(), {
          method,
          headers: upstreamHeaders,
          body: formData,
          redirect: 'manual',
        })
      }
    } else {
      upstreamHeaders.delete('content-type')
      upstreamRequest = new Request(upstreamUrl.toString(), {
        method,
        headers: upstreamHeaders,
        body: formData,
        redirect: 'manual',
      })
    }

    return {
      upstreamRequest,
      debugCapture: shouldCaptureDebug ? {
        originalSnapshot,
        rewrittenSnapshot,
        rewriteApplied,
      } : null,
    }
  }

  const shouldCaptureDebug = isWagesPath && !['GET', 'HEAD'].includes(method)
  const rawText = shouldCaptureDebug ? await c.req.raw.clone().text() : ''
  const debugPrefix = shouldCaptureDebug
    ? {
        _content_type: contentType || '(none)',
        _transport: 'raw-body',
        _raw_text: normalizeProxySnippet(rawText),
      }
    : null

  const jsonPayload = isWagesPath ? parseProxyJsonPayload(rawText, contentType) : null
  if (jsonPayload) {
    const originalSnapshot = shouldCaptureDebug
      ? { ...debugPrefix, ...extractInterestingObjectFields(jsonPayload) }
      : null
    const rewriteApplied = shouldRewriteMissedShiftObjectPayload(extractInterestingObjectFields(jsonPayload))
    if (rewriteApplied) {
      rewriteMissedShiftObjectPayload(jsonPayload, upstreamUrl)
    }
    const rewrittenSnapshot = shouldCaptureDebug
      ? { ...debugPrefix, ...extractInterestingObjectFields(jsonPayload) }
      : null
    upstreamHeaders.delete('content-length')
    upstreamHeaders.set('content-type', 'application/json;charset=UTF-8')
    return {
      upstreamRequest: new Request(upstreamUrl.toString(), {
        method,
        headers: upstreamHeaders,
        body: JSON.stringify(jsonPayload),
        redirect: 'manual',
      }),
      debugCapture: shouldCaptureDebug ? {
        originalSnapshot,
        rewrittenSnapshot,
        rewriteApplied,
      } : null,
    }
  }

  const looseFormData = isWagesPath ? parseProxyUrlEncodedPayload(rawText, contentType) : null
  if (looseFormData) {
    const originalSnapshot = shouldCaptureDebug
      ? { ...debugPrefix, ...extractInterestingFormFields(looseFormData) }
      : null
    const rewriteApplied = shouldRewriteMissedShiftSubmission(looseFormData)
    if (rewriteApplied) {
      rewriteMissedShiftSubmission(looseFormData, upstreamUrl)
    }
    const rewrittenSnapshot = shouldCaptureDebug
      ? { ...debugPrefix, ...extractInterestingFormFields(looseFormData) }
      : null
    const params = new URLSearchParams()
    looseFormData.forEach((value, key) => {
      if (typeof value === 'string') params.append(key, value)
    })
    upstreamHeaders.delete('content-length')
    upstreamHeaders.set('content-type', 'application/x-www-form-urlencoded;charset=UTF-8')
    return {
      upstreamRequest: new Request(upstreamUrl.toString(), {
        method,
        headers: upstreamHeaders,
        body: params.toString(),
        redirect: 'manual',
      }),
      debugCapture: shouldCaptureDebug ? {
        originalSnapshot,
        rewrittenSnapshot,
        rewriteApplied,
      } : null,
    }
  }

  return {
    upstreamRequest: new Request(upstreamUrl.toString(), {
      method,
      headers: upstreamHeaders,
      body: c.req.raw.body,
      redirect: 'manual',
    }),
    debugCapture: shouldCaptureDebug ? {
      originalSnapshot: debugPrefix,
      rewrittenSnapshot: debugPrefix,
      rewriteApplied: false,
    } : null,
  }
}

async function proxyRequest(c: any) {
  const incomingUrl = new URL(c.req.url)
  const upstreamUrl = new URL(incomingUrl.pathname + incomingUrl.search, ORIGIN)
  rewritePreviousPayrollGetRequest(incomingUrl, upstreamUrl)

  const method = (c.req.raw.method || 'GET').toUpperCase()

  if (method === 'GET' && (incomingUrl.pathname === '/wages' || incomingUrl.pathname === '/wages/') && !incomingUrl.search) {
    const baseResponse = new Response(renderWagesLandingHtml(), {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=UTF-8',
        'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
        pragma: 'no-cache',
        expires: '0',
        'surrogate-control': 'no-store',
      },
    })

    const rewriter = new HTMLRewriter()
    rewriter.on('body', new WagesUiInjector())
    return rewriter.transform(baseResponse)
  }
  const requestContentType = c.req.raw.headers.get('content-type') || ''
  const isProxyFormPost = /application\/x-www-form-urlencoded|multipart\/form-data/i.test(requestContentType)
  if (method === 'POST' && isProxyFormPost) {
    const directFinalSubmitDraftId = parseDirectFinalSubmitDraftId(incomingUrl.pathname)
    if (directFinalSubmitDraftId) {
      const finalSubmitFormData = await c.req.raw.clone().formData()
      const finalSubmitResponse = await handleDirectDraftFinalSubmit(c, incomingUrl, finalSubmitFormData, directFinalSubmitDraftId)
      if (finalSubmitResponse) return finalSubmitResponse
    }

    if (incomingUrl.pathname === '/wages/drafts') {
      const directFormData = await c.req.raw.clone().formData()
      if (shouldRewriteMissedShiftSubmission(directFormData)) {
        const directResponse = await handleDirectMissedShiftSave(c, incomingUrl, directFormData)
        if (directResponse) return directResponse
      }
    }
  }

  const upstreamHeaders = rewriteRequestHeaders(c.req.raw.headers, incomingUrl, upstreamUrl)

  const { upstreamRequest, debugCapture } = await buildUpstreamRequest(c, incomingUrl, upstreamUrl, upstreamHeaders)

  const upstreamResponse = await fetch(upstreamRequest)
  if (debugCapture) {
    const responseDebug = await describeWagesDebugResponse(upstreamResponse.clone())
    await captureWagesDebug(c.env, {
      request_path: incomingUrl.pathname + incomingUrl.search,
      request_method: (c.req.raw.method || 'POST').toUpperCase(),
      original_payload_json: JSON.stringify(debugCapture.originalSnapshot || {}),
      rewritten_payload_json: JSON.stringify(debugCapture.rewrittenSnapshot || {}),
      rewrite_applied: debugCapture.rewriteApplied ? 1 : 0,
      response_status: upstreamResponse.status,
      response_location: responseDebug.location,
      response_error_text: responseDebug.errorText,
    })
  }
  const headers = rewriteHeaders(upstreamResponse, incomingUrl.origin)
  const contentType = headers.get('content-type') || ''

  if (['GET', 'HEAD'].includes(c.req.raw.method) && contentType.includes('text/html')) {
    headers.set('cache-control', 'no-store, no-cache, must-revalidate, max-age=0')
    headers.set('pragma', 'no-cache')
    headers.set('expires', '0')
    headers.set('surrogate-control', 'no-store')
  }

  const baseResponse = new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers,
  })

  if (c.req.raw.method !== 'GET' || !contentType.includes('text/html')) {
    return baseResponse
  }

  const path = incomingUrl.pathname
  const needsWagesButton = path === '/admin/wages'
  const needsTeamInit = path === '/field/preload' || path === '/field/delivery/new'
  const needsWagesUi = path === '/wages' || path.startsWith('/wages/')

  if (!needsWagesButton && !needsTeamInit && !needsWagesUi) {
    return baseResponse
  }

  const rewriter = new HTMLRewriter()
  if (needsWagesButton) rewriter.on('#topbar-actions', new DashboardButtonInjector())
  if (needsTeamInit) rewriter.on('body', new TeamPickerInitInjector())
  if (needsWagesUi) rewriter.on('body', new WagesUiInjector())
  return rewriter.transform(baseResponse)
}

app.get('/health', (c) => c.json({ status: 'ok', mode: 'safe-proxy', origin: ORIGIN }))
app.post('/field/ai-extract', handleAiExtract)
app.all('*', proxyRequest)

export default app
