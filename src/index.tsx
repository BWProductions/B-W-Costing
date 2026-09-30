import { Hono } from 'hono'
import { buildPayrollWorkbook } from './payroll-excel'
import { runPaidBeforeCheck, priceAgainstPaid, rowToEntry, rowToPaid, type Paid as PaidBeforeRow } from './paid-before'
import { runCrewPatternCheck } from './crew-pattern'

type Bindings = {
  ANTHROPIC_API_KEY?: string
  DB?: D1Database
}

const ORIGIN = 'https://3c3bcb89.bw-productions.pages.dev'
const WAGES_UI_VERSION = 'v2026-09-30-4'

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

// Admin /admin/wages: live banner from /wages-health. Green = every submitted
// shift this payroll has a paid record. Red = blanks found; lists them.
// Also hides the engine's "Add a shift on behalf of an employee" block
// (2026-09-14, owner's decision): it bypasses the worker flow (no draft, no
// worker Final Submission, old Saturday/Monday rule). Office corrections go
// through Open Work app -> worker -> Edit, or the manager correction on the
// sheet. Display-only; the engine route behind it is untouched.
class WagesHealthBannerInjector {
  element(element: Element) {
    element.append(
      `<style>[data-bw-hidden-on-behalf="1"]{display:none !important}</style>
<div id="bw-wages-health" style="margin:12px 0;padding:12px 16px;border-radius:12px;font-weight:600;background:#eef2f7;color:#334155">Checking wages integrity…</div>
<script>
(function(){
  var ONB=/add a shift on behalf of an employee/i;
  function ownText(el){ var t=''; for(var i=0;i<el.childNodes.length;i++){ var n=el.childNodes[i]; if(n.nodeType===3) t+=n.nodeValue; } return (t||el.textContent||'').replace(/\\s+/g,' ').trim(); }
  function isSheetish(el){ return !el || el.tagName==='MAIN' || el.tagName==='BODY' || el.querySelector('table') || /wage sheet|grand total|worker entries are locked/i.test(el.textContent||''); }
  function findOnBehalfForm(){
    var forms=Array.prototype.slice.call(document.querySelectorAll('form'));
    return forms.find(function(f){
      if(f.querySelector('table')) return false;
      var hasStaff=f.querySelector('select[name="staff_id"], select[name="employee_id"], select[name="worker_id"], select[name="person_id"]');
      var hasDate=f.querySelector('input[type="date"][name="work_date"], input[name="work_date"], input[type="date"]');
      var hasTime=f.querySelector('input[type="time"], input[name="start_time"]');
      return !!(hasStaff && hasDate && hasTime);
    })||null;
  }
  function hideEl(el){ if(!el||el.dataset.bwHiddenOnBehalf==='1') return; el.dataset.bwHiddenOnBehalf='1'; el.style.setProperty('display','none','important'); el.setAttribute('hidden',''); }
  function reportOnce(info){
    try{ if(window.__bwOnBehalfReported) return; window.__bwOnBehalfReported=true;
      fetch('/wages-admin-ui-log',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify(info)}).catch(function(){});
    }catch(e){}
  }
  function hideOnBehalfBlock(){
    var hidden=false, info={};
    // 1) Heading-based: any element whose own text is the heading.
    var all=Array.prototype.slice.call(document.querySelectorAll('h1,h2,h3,h4,h5,legend,div,span,p,strong,b'));
    var heads=all.filter(function(el){ return ONB.test(ownText(el)) && ownText(el).length<80; });
    heads.forEach(function(h){
      var node=h.parentElement, target=null, hops=0;
      while(node && hops<8 && node.tagName!=='MAIN' && node.tagName!=='BODY'){
        if(node.querySelector('form')){ target=node; break; }
        node=node.parentElement; hops++;
      }
      info.headTag=h.tagName; info.headParentChain=(function(){var c=[],n=h;while(n&&n.tagName!=='BODY'&&c.length<8){c.push(n.tagName+(n.id?'#'+n.id:'')+(n.className?'.'+String(n.className).replace(/\\s+/g,'.'):''));n=n.parentElement;}return c.join(' < ')})();
      if(target && !isSheetish(target)){ hideEl(target); hidden=true; info.mode='card'; return; }
      hideEl(h); var sib=h.nextElementSibling; if(sib && /capture work completed/i.test(sib.textContent||'')) hideEl(sib);
      hidden=true; info.mode='heading-only';
    });
    // 2) Form-based (works even if the heading was missed).
    var f=findOnBehalfForm();
    if(f){
      info.formAction=f.getAttribute('action')||''; info.formChain=(function(){var c=[],n=f;while(n&&n.tagName!=='BODY'&&c.length<8){c.push(n.tagName+(n.id?'#'+n.id:'')+(n.className?'.'+String(n.className).replace(/\\s+/g,'.'):''));n=n.parentElement;}return c.join(' < ')})();
      var wrap=f.parentElement, hops=0;
      while(wrap && hops<4 && !isSheetish(wrap) && wrap.parentElement && !isSheetish(wrap.parentElement) && ONB.test(wrap.parentElement.textContent||'') && !/wage sheet|grand total/i.test(wrap.parentElement.textContent||'')){ wrap=wrap.parentElement; hops++; }
      hideEl(!isSheetish(wrap)?wrap:f); hidden=true; info.mode=(info.mode||'')+'+form';
    }
    info.hidden=hidden; info.stillVisible=!!Array.prototype.slice.call(document.querySelectorAll('h1,h2,h3,h4,legend,div')).find(function(el){ return ONB.test(ownText(el)) && el.offsetParent!==null; });
    if(!hidden || info.stillVisible) reportOnce(info); else reportOnce(info);
  }
  try{ hideOnBehalfBlock(); }catch(e){ reportOnce({error:String(e)}); }
  document.addEventListener('DOMContentLoaded',function(){ try{ hideOnBehalfBlock(); }catch(e){} });
  setTimeout(function(){ try{ hideOnBehalfBlock(); }catch(e){} },400);
  setTimeout(function(){ try{ hideOnBehalfBlock(); }catch(e){} },1500);
  var box=document.getElementById('bw-wages-health'); if(!box) return;
  fetch('/wages-health',{credentials:'include',cache:'no-store'}).then(function(r){return r.json()}).then(function(h){
    if(h.status==='ok'){
      box.style.background='#e7f6ec'; box.style.color='#14532d';
      box.textContent='Wages integrity OK — every submitted shift this payroll has a paid record. Blank submissions are blocked at database level. Last paid shift: '+(h.last_paid_shift_created_at||'n/a')+' UTC.';
      return;
    }
    box.style.background='#fdecec'; box.style.color='#7f1d1d';
    var rows=(h.blank_submission_rows||[]).map(function(x){return (x.display_name||('staff '+x.staff_id))+' — '+x.work_date+' '+x.start_time+'–'+x.end_time+' (draft #'+x.id+')'});
    box.innerHTML='<strong>WAGES ATTENTION:</strong> '+(h.blank_submissions_this_payroll||0)+' submitted shift(s) with NO paid record'+(h.guard_triggers_installed?'':' — and the database guard is MISSING')+'.<br>'+rows.join('<br>')+(rows.length?'<br>':'')+'These workers see 0.00 hours. Set the draft back to editable and Final Submit through the wages app.';
  }).catch(function(){ box.textContent='Wages integrity check unavailable (could not reach /wages-health).'; });
})();
</script>`,
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
      WAGES_UI_INJECT_HTML,
      { html: true },
    )
  }
}

const WAGES_UI_INJECT_HTML = (
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
.pill.bw-missed-detail { background: #fde8e8 !important; color: #7f1d1d !important; font-weight: 800 !important; white-space: normal !important; line-height: 1.35; }
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
  // Every active worker has an explicit profile so a shared phone can never
  // fall back to another worker's dropdown. Unlisted / unknown = Normal only.
  const STAFF_WORK_TYPE_PROFILES = [
    { ids: ['1'], names: ['givemore chifetete kuziwa', 'givemore'], options: ['House/Garden', 'Warehouse Team'] },
    { ids: ['2'], names: ['takavaudza chokuda', 'takavaudza', 'takka'], options: ['House/Garden', 'Warehouse Team'] },
    { ids: ['3'], names: ['thina dyani', 'thina'], options: ['Normal'] },
    { ids: ['4'], names: ['tsotlego petrus malakoane', 'tsotlego'], options: ['Normal', 'Warehouse Team'] },
    { ids: ['5'], names: ['bhekizitha maphosa', 'bheki'], options: ['Music Bus', 'Normal'] },
    { ids: ['6'], names: ['isaac mbele', 'isaac'], options: ['Normal'] },
    { ids: ['7'], names: ['john simbarashe mhlanga', 'jay'], options: ['Music Bus', 'Normal'] },
    { ids: ['8'], names: ['erence mngomezulu', 'erence'], options: ['Normal'] },
    { ids: ['9'], names: ['erick mpho molefe', 'erick'], options: ['Normal'] },
    { ids: ['10'], names: ['daniel motaung', 'daniel', 'danny'], options: ['Normal'] },
    { ids: ['11'], names: ['solomon moyo', 'solomon', 'solly'], options: ['Normal'] },
    { ids: ['12'], names: ['brian ndlovu', 'brian', 'sipho'], options: ['Music Bus', 'Normal'] },
    { ids: ['13'], names: ['patrick ngozo', 'patrick'], options: ['Normal'] },
    { ids: ['14'], names: ['thandanani nkala', 'thandanani'], options: ['Normal'] },
    { ids: ['15'], names: ['joshua motsamai nteo', 'joshua'], options: ['Music Bus', 'Normal'] },
    { ids: ['16'], names: ['lebo lebo', 'lebo'], options: ['Normal'] },
  ]
  const NORMAL_ONLY_PROFILE = { ids: [], names: [], options: ['Normal'] }

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

  // The proxy stamps the REAL logged-in worker (from the session cookie) on
  // every worker page. It always wins over a remembered ID / URL tag, so a
  // shared phone or office PC can never carry one worker's identity (and
  // dropdown) into the next worker's session.
  function sessionStaffId() {
    const stamped = normalize(document.documentElement.getAttribute('data-bw-session-staff') || '')
    return /^\\d+$/.test(stamped) ? stamped : ''
  }

  function syncSessionStaffContext() {
    const live = sessionStaffId()
    if (!live) return
    const stored = getStoredActiveStaffId()
    if (stored && stored !== live) clearStoredStaffContext()
    persistActiveStaffId(live)
  }

  function resolveActiveStaffId(scope) {
    const live = sessionStaffId()
    if (live) {
      persistActiveStaffId(live)
      return live
    }
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
      // Owner 2026-09-23: workers press Save / Final Submission two or three times because nothing tells them it
      // is working. One press only: the second press is swallowed, every button greys out and says "Saving… please wait".
      if (form.__bwSubmitting) { event.preventDefault(); event.stopImmediatePropagation(); return }
      form.__bwSubmitting = true
      rewriteFormAction(form)
      rewriteSubmitterAction(event.submitter)
      window.setTimeout(() => {
        Array.from(form.querySelectorAll('button, input[type=submit]')).forEach((b) => {
          if (b.type === 'submit' || b.tagName === 'BUTTON') {
            b.disabled = true
            if (!b.dataset.bwLabel) { b.dataset.bwLabel = b.textContent || b.value || '' }
            if (b.tagName === 'BUTTON') b.textContent = 'Saving… please wait'
            else b.value = 'Saving… please wait'
            b.style.opacity = '0.6'; b.style.cursor = 'wait'
          }
        })
        let ov = document.getElementById('bw-saving-overlay')
        if (!ov) { ov = document.createElement('div'); ov.id = 'bw-saving-overlay'; ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99999;display:flex;align-items:center;justify-content:center;color:#fff;font:700 20px/1.3 system-ui,sans-serif;text-align:center;padding:24px'; ov.textContent = 'Saving your shift… please wait. Do not press again.'; document.body.appendChild(ov) }
      }, 0)
      // If the page does not navigate within 20 s (network problem), re-enable so the worker is not stuck.
      window.setTimeout(() => { form.__bwSubmitting = false; const ov = document.getElementById('bw-saving-overlay'); if (ov) ov.remove(); Array.from(form.querySelectorAll('button, input[type=submit]')).forEach((b) => { b.disabled = false; b.style.opacity = ''; b.style.cursor = ''; if (b.dataset.bwLabel) { if (b.tagName === 'BUTTON') b.textContent = b.dataset.bwLabel; else b.value = b.dataset.bwLabel } }) }, 20000)
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

  function clearStoredStaffContext() {
    ;[ACTIVE_STAFF_PROFILE_KEY, ACTIVE_STAFF_ID_STORAGE_KEY, CLAIM_WEEK_STORAGE_KEY, MISSED_MODE_STORAGE_KEY].forEach((key) => {
      try { window.sessionStorage.removeItem(key) } catch (err) {}
      try { window.localStorage.removeItem(key) } catch (err) {}
    })
  }

  async function logoutThenRedirect(target) {
    clearStoredStaffContext()
    try {
      // Upstream only clears the worker cookie on POST (GET redirects to the admin login).
      await fetch(LOGOUT_PATH, { method: 'POST', credentials: 'include', redirect: 'follow', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: '' })
    } catch (err) {
      console.warn('wages logout redirect fallback', err)
    }
    window.location.href = target
  }

  function hideWorkerSignOut() {
    // Workers use Switch person only. The upstream Sign out form is hidden so a
    // browser that also holds an admin login can never land on the admin 403 page.
    document.querySelectorAll('form[action="/wages/logout"], form[action^="/wages/logout?"]').forEach((form) => {
      if (form instanceof HTMLElement && form.style.display !== 'none') form.style.display = 'none'
    })
    actionElements().forEach((el) => {
      if (!/^sign ?out$/i.test(elementText(el))) return
      if (el.closest('.bw-topnav, .topnav') && el instanceof HTMLElement && el.style.display !== 'none') el.style.display = 'none'
    })
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
    // Owner rule (2026-09-15): the calendar is open from LAST payroll's Saturday up to
    // THIS payroll's Friday (staff submit Wed/Thu/Fri in advance on Wednesday).
    const rangeEnd = new Date(endOfPayrollWeek(currentPayrollStart).getTime())
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
    syncSessionStaffContext()

    const liveStaffId = sessionStaffId()
    if (liveStaffId) {
      const liveProfile = STAFF_WORK_TYPE_PROFILES.find((profile) => profile.ids.includes(liveStaffId)) || NORMAL_ONLY_PROFILE
      if (liveProfile !== NORMAL_ONLY_PROFILE) persistActiveStaffProfile(liveProfile)
      return liveProfile
    }

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

    // Prefer the stored staff ID over a stored profile blob so a shared phone
    // never carries one worker's dropdown into another worker's session.
    const storedStaffId = getStoredActiveStaffId()
    if (storedStaffId) {
      const profileByStoredId = STAFF_WORK_TYPE_PROFILES.find((profile) => profile.ids.includes(storedStaffId))
      if (profileByStoredId) {
        persistActiveStaffProfile(profileByStoredId)
        return profileByStoredId
      }
      return NORMAL_ONLY_PROFILE
    }

    const storedProfile = getStoredActiveStaffProfile()
    if (storedProfile?.ids?.[0]) persistActiveStaffId(storedProfile.ids[0])
    return storedProfile || NORMAL_ONLY_PROFILE
  }

  function resolveStaffWorkTypeProfile(form) {
    const liveStaffId = sessionStaffId()
    if (liveStaffId) {
      return STAFF_WORK_TYPE_PROFILES.find((profile) => profile.ids.includes(liveStaffId)) || NORMAL_ONLY_PROFILE
    }
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

  function upstreamWorkTypeOptions(form) {
    // The upstream server already knows who is logged in and renders that
    // worker's own options. Remember them before we rebuild the select so an
    // unknown-ID phone still gets the correct server-side list, never another
    // worker's list.
    const select = firstField(form, ['select[name="work_type"]', 'select[id="work_type"]', 'select[id="work_type_choice"]'])
    if (!(select instanceof HTMLSelectElement)) return []
    if (!select.dataset.bwUpstreamOptions) {
      const raw = Array.from(select.options).map((option) => normalize(option.value || '')).filter(Boolean)
      select.dataset.bwUpstreamOptions = JSON.stringify(raw)
    }
    try {
      const parsed = JSON.parse(select.dataset.bwUpstreamOptions || '[]')
      return Array.isArray(parsed) ? uniqueLabels(parsed) : []
    } catch (err) {
      return []
    }
  }

  function resolveWorkTypeOptions(form) {
    const profile = resolveStaffWorkTypeProfile(form)
    if (profile && profile !== NORMAL_ONLY_PROFILE && profile.options?.length) return uniqueLabels(profile.options)
    const upstream = upstreamWorkTypeOptions(form)
    if (upstream.length) return upstream
    return ['Normal']
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
    upstreamWorkTypeOptions(form)
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

      // Owner rule (2026-09-15): calendar open from LAST payroll's Saturday to THIS payroll's Friday.
      const windowStart = new Date(startOfPayrollWeek(utcToday()).getTime()); windowStart.setUTCDate(windowStart.getUTCDate() - 7)
      const windowEnd = new Date(startOfPayrollWeek(utcToday()).getTime()); windowEnd.setUTCDate(windowEnd.getUTCDate() + 6)
      workDateField.setAttribute('min', formatForInput(windowStart, false))
      workDateField.setAttribute('max', formatForInput(windowEnd, false))
      if (once(workDateField, 'WindowGuard')) {
        const check = () => {
          const v = normalize(workDateField.value || '')
          const d = parseFlexibleDate(v)
          let msg = ''
          if (d && d.getTime() < windowStart.getTime()) msg = 'Older than one week — this date can no longer be claimed. Only ' + formatForInput(windowStart, false) + ' to ' + formatForInput(windowEnd, false) + ' can be captured. Please speak to the office.'
          else if (d && d.getTime() > windowEnd.getTime()) msg = 'That date is in the next payroll. Only ' + formatForInput(windowStart, false) + ' to ' + formatForInput(windowEnd, false) + ' can be captured now.'
          workDateField.setCustomValidity(msg)
          let note = workDateField.parentElement && workDateField.parentElement.querySelector('.bw-window-note')
          if (msg) {
            if (!note) { note = document.createElement('div'); note.className = 'bw-window-note'; note.style.cssText = 'margin-top:6px;padding:8px 10px;border-radius:8px;background:#fdecec;color:#7f1d1d;font-weight:700;font-size:13px'; workDateField.insertAdjacentElement('afterend', note) }
            note.textContent = msg
          } else if (note) note.remove()
        }
        workDateField.addEventListener('input', check)
        workDateField.addEventListener('change', check)
        check()
      }

      const claimWeekHidden = ensureHiddenField(form, 'payroll_week_start')
      const previousPayrollHidden = ensureHiddenField(form, 'missed_previous_week')
      const reviewNoteHidden = ensureHiddenField(form, 'payroll_note')
      // The edit page's original hidden work_date lives inside the legacy
      // "Date worked" block that gets removed above. If it is no longer in the
      // form, recreate it and keep it mirrored from the calendar, otherwise
      // the save reaches upstream with NO work_date -> "Choose a valid work date."
      let workDateHidden = workDateBinding.hiddenField
      if (!(workDateHidden instanceof HTMLElement) || !form.contains(workDateHidden)) {
        workDateHidden = ensureHiddenField(form, 'work_date')
        workDateBinding.hiddenField = workDateHidden
      }
      if (workDateHidden !== workDateField) {
        if (!workDateHidden.value && currentWorkDateValue) workDateHidden.value = currentWorkDateValue
        if (once(workDateField, 'WorkDateMirrorSafe')) {
          const mirror = () => { workDateHidden.value = workDateField.value || '' }
          workDateField.addEventListener('input', mirror)
          workDateField.addEventListener('change', mirror)
          form.addEventListener('submit', mirror)
        }
      }
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
    // Rewrite (not hide) the upstream locked-payroll rejection. With the
    // Saturday-booking conversion in the proxy it should not occur, but if it
    // ever does the worker must SEE that the shift was not saved.
    const selectors = '.alert, .notice, .warning, .error, .flash, .message, p, small, div, span'
    Array.from(document.querySelectorAll(selectors)).forEach((node) => {
      if (node.children.length) return
      const text = elementText(node)
      if (!/that payroll week .* has already been paid and is locked/i.test(text)) return
      if (!(node instanceof HTMLElement) || node.dataset.bwRewroteLockedPayroll === '1') return
      node.dataset.bwRewroteLockedPayroll = '1'
      node.textContent = 'This shift was NOT saved. Please check the Date worked and try again, or ask the office to capture it.'
    })
  }

  function hideLegacyMissedShiftToggle() {
    // Upstream still renders an "Add a missed shift" toggle plus the helper
    // sentence "Tap the button above only when this shift belongs to last week…".
    // The single-calendar flow replaces it, so remove the whole block.
    document.querySelectorAll('#missed_previous_week_toggle, #missed_previous_week_status, .toggle-status').forEach((node) => {
      const row = node.closest('.toggle-row') || node
      if (row instanceof HTMLElement) row.remove()
    })
    Array.from(document.querySelectorAll('small, p, div, span')).forEach((node) => {
      if (node.children.length) return
      const text = elementText(node)
      if (!/tap the button above|add a missed shift button|use the add a missed shift/i.test(text)) return
      if (node instanceof HTMLElement) node.remove()
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

  const MISSED_DETAIL_RE = /MISSED SHIFT\\s*[-–]\\s*actual date\\s+[A-Za-z]{3}\\s+\\d{1,2}\\s+[A-Za-z]{3}\\s+\\d{4}(?:\\s*[-–]\\s*.*)?/i
  const missedDetailCache = {}

  function cleanMissedDetail(text) {
    // Collapse accidental repeats: "MISSED SHIFT - actual date X - X - work" -> "MISSED SHIFT – actual date X – work"
    const m = normalize(text).match(/^MISSED SHIFT\\s*[-–]\\s*actual date\\s+([A-Za-z]{3}\\s+\\d{1,2}\\s+[A-Za-z]{3}\\s+\\d{4})\\s*(?:[-–]\\s*)?(.*)$/i)
    if (!m) return normalize(text)
    const dateLabel = m[1]
    let rest = m[2] || ''
    for (let guard = 0; guard < 5; guard++) {
      const lower = rest.toLowerCase()
      const stripped = lower.startsWith(('missed shift - actual date ' + dateLabel).toLowerCase()) ? rest.slice(('missed shift - actual date ' + dateLabel).length)
        : lower.startsWith(dateLabel.toLowerCase()) ? rest.slice(dateLabel.length)
        : null
      if (stripped === null) break
      rest = stripped.replace(/^\\s*[-–]\\s*/, '').trim()
    }
    return 'MISSED SHIFT – actual date ' + dateLabel + (rest ? ' – ' + rest : '')
  }

  function applyMissedDetail(card, detailText) {
    const cleaned = cleanMissedDetail(detailText)
    const genericPill = Array.from(card.querySelectorAll('.pill')).find((p) => /hours missed|not captured from last week/i.test(elementText(p)))
    const descPill = Array.from(card.querySelectorAll('.pill')).find((p) => MISSED_DETAIL_RE.test(elementText(p)))
    const target = genericPill || descPill
    if (!target) return
    if (target.textContent !== cleaned) target.textContent = cleaned
    target.classList.add('bw-missed-detail')
    if (genericPill && descPill && descPill !== genericPill) descPill.remove()
  }

  function ensureRealDateMissedBadge(card) {
    const dateNode = Array.from(card.querySelectorAll('.muted')).find((n) => /^\\d{4}-\\d{2}-\\d{2}\\s*·/.test(elementText(n)))
    if (!dateNode) return
    const iso = elementText(dateNode).slice(0, 10)
    const cardDate = parseFlexibleDate(iso)
    const weekStart = parseFlexibleDate(currentPayrollWeekStartValue())
    if (!cardDate || !weekStart || cardDate.getTime() >= weekStart.getTime()) return
    if (Array.from(card.querySelectorAll('.pill')).some((p) => /MISSED SHIFT|hours missed/i.test(elementText(p)))) return
    const descPill = Array.from(card.querySelectorAll('.pill')).find((p) => !/submitted|draft|locked|editable/i.test(elementText(p)))
    const work = descPill ? elementText(descPill) : ''
    const label = WEEKDAY_LABELS[cardDate.getUTCDay()].slice(0, 3) + ' ' + cardDate.getUTCDate() + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][cardDate.getUTCMonth()] + ' ' + cardDate.getUTCFullYear()
    const pill = document.createElement('div')
    pill.className = 'pill bw-missed-detail'
    pill.textContent = 'MISSED SHIFT – actual date ' + label + (work ? ' – ' + work : '')
    const statusPill = Array.from(card.querySelectorAll('.pill')).find((p) => /draft|submitted/i.test(elementText(p)))
    if (statusPill) statusPill.insertAdjacentElement('beforebegin', pill)
    else card.appendChild(pill)
    if (descPill) descPill.remove()
  }

  function showMissedShiftDetails() {
    Array.from(document.querySelectorAll('.shift')).forEach((card) => { if (card instanceof HTMLElement) ensureRealDateMissedBadge(card) })
    // Every shift card must show the full "MISSED SHIFT \u2013 actual date <Day D Mon YYYY> \u2013 <work>" text
    // (auditor + office need to see exactly which real date is being claimed).
    Array.from(document.querySelectorAll('.shift')).forEach((card) => {
      if (!(card instanceof HTMLElement)) return
      const pills = Array.from(card.querySelectorAll('.pill'))
      const descPill = pills.find((p) => MISSED_DETAIL_RE.test(elementText(p)))
      const genericPill = pills.find((p) => /hours missed|not captured from last week/i.test(elementText(p)))
      if (descPill) {
        applyMissedDetail(card, elementText(descPill))
        return
      }
      if (!genericPill) return
      // Draft card: description is not on the card, fetch it from the edit page once.
      const editLink = card.querySelector('a[href*="/wages/drafts/"][href*="/edit"]')
      const href = editLink instanceof HTMLAnchorElement ? editLink.getAttribute('href') || '' : ''
      const idMatch = href.match(/\\/wages\\/drafts\\/(\\d+)\\/edit/)
      if (!idMatch) return
      const draftId = idMatch[1]
      if (missedDetailCache[draftId] === undefined) {
        missedDetailCache[draftId] = null
        fetch('/wages/drafts/' + draftId + '/edit', { credentials: 'include', cache: 'no-store' })
          .then((r) => r.ok ? r.text() : '')
          .then((html) => {
            const doc = new DOMParser().parseFromString(html, 'text/html')
            const field = doc.querySelector('#work_description, [name="work_description"]')
            const value = normalize(field?.getAttribute('value') || field?.value || field?.textContent || '')
            if (MISSED_DETAIL_RE.test(value)) {
              missedDetailCache[draftId] = value
            } else {
              // Real-date draft: description has no marker any more, build the
              // full text from the card's own (real) date + the description.
              const dateNode = Array.from(card.querySelectorAll('.muted')).find((n) => /^\\d{4}-\\d{2}-\\d{2}\\s*·/.test(elementText(n)))
              const cardDate = dateNode ? parseFlexibleDate(elementText(dateNode).slice(0, 10)) : null
              const weekStart = parseFlexibleDate(currentPayrollWeekStartValue())
              if (cardDate && weekStart && cardDate.getTime() < weekStart.getTime()) {
                const label = WEEKDAY_LABELS[cardDate.getUTCDay()].slice(0, 3) + ' ' + cardDate.getUTCDate() + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][cardDate.getUTCMonth()] + ' ' + cardDate.getUTCFullYear()
                missedDetailCache[draftId] = 'MISSED SHIFT – actual date ' + label + (value ? ' – ' + value : '')
              } else {
                missedDetailCache[draftId] = ''
              }
            }
            if (missedDetailCache[draftId]) scheduleRun()
          })
          .catch(() => { missedDetailCache[draftId] = '' })
        return
      }
      if (missedDetailCache[draftId]) applyMissedDetail(card, missedDetailCache[draftId])
    })
  }

  // Owner (2026-09-15): a missed shift that has been final-submitted is LOCKED and paid.
  // Showing it above the Draft section under a "Submit selected" box made workers think it
  // was still unsubmitted, so they captured it again. Move every locked missed card into
  // "Finally submitted shifts" (top of that list, with its MISSED pill) and remove the
  // now-empty section. Display only; nothing is posted.
  function relocateLockedMissedShifts() {
    const section = document.querySelector('[data-bw-missed-paid]')
    if (!section || section.dataset.bwRelocated) return
    const headings = Array.from(document.querySelectorAll('section.card > h2'))
    const finalH = headings.find((h) => /finally submitted shifts/i.test(elementText(h)))
    const finalSection = finalH ? finalH.closest('section.card') : null
    if (!finalSection) return
    const cards = Array.from(section.querySelectorAll('article.shift'))
    if (!cards.length) return
    const emptyNote = Array.from(finalSection.querySelectorAll('p.muted')).find((p) => /no finally submitted shifts/i.test(elementText(p)))
    if (emptyNote) emptyNote.remove()
    const intro = document.createElement('p')
    intro.className = 'muted small bw-missed-intro'
    intro.textContent = 'Catch-up shifts (worked in last week\\'s payroll, entered late) are shown first with their real date. They are final-submitted, locked and paid in this payroll — do not capture them again.'
    let anchor = finalH.nextSibling
    finalSection.insertBefore(intro, anchor)
    anchor = intro.nextSibling
    cards.forEach((card) => { card.classList.add('bw-missed-locked'); finalSection.insertBefore(card, anchor); anchor = card.nextSibling })
    section.dataset.bwRelocated = '1'
    section.remove()
  }

  function addBulkFinalSubmission() {
    try { relocateLockedMissedShifts() } catch (err) { console.error('relocate missed shifts failed', err) }
    const shifts = Array.from(document.querySelectorAll('.shift'))
    if (!shifts.length) return

    const selectable = []

    shifts.forEach((shift, index) => {
      const finalButton = Array.from(shift.querySelectorAll('button, input[type="submit"], input[type="button"], a')).find((el) => {
        const text = elementText(el)
        return /final submit|final submission/i.test(text)
      })

      if (!finalButton) return
      // Only drafts can be final-submitted: skip cards already "Submitted — locked".
      if (Array.from(shift.querySelectorAll('.pill')).some((p) => /submitted\\s*[—-]\\s*locked/i.test(elementText(p)))) return
      // Owner rule (2026-09-15): drafts older than last payroll's Saturday can never be
      // final-submitted. Mark them and leave them out of Select all.
      const dateNode = Array.from(shift.querySelectorAll('.muted')).find((n) => /^\\d{4}-\\d{2}-\\d{2}\\s*·/.test(elementText(n)))
      const cardDate = dateNode ? parseFlexibleDate(elementText(dateNode).slice(0, 10)) : null
      const winStart = new Date(startOfPayrollWeek(utcToday()).getTime()); winStart.setUTCDate(winStart.getUTCDate() - 7)
      const winEnd = new Date(startOfPayrollWeek(utcToday()).getTime()); winEnd.setUTCDate(winEnd.getUTCDate() + 6)
      if (cardDate && (cardDate.getTime() < winStart.getTime() || cardDate.getTime() > winEnd.getTime())) {
        if (!shift.querySelector('.bw-too-old')) {
          const tag = document.createElement('div')
          tag.className = 'pill bw-too-old'
          tag.style.cssText = 'background:#7f1d1d;color:#fff;font-weight:800'
          tag.textContent = cardDate.getTime() < winStart.getTime() ? 'OLDER THAN ONE WEEK — cannot be final-submitted. Delete it or speak to the office.' : 'NEXT PAYROLL — capture it from Saturday.'
          shift.insertBefore(tag, shift.firstChild)
          Array.from(shift.querySelectorAll('a, button')).forEach((el) => { if (/final submit|final submission|edit/i.test(elementText(el)) && el instanceof HTMLElement) el.style.display = 'none' })
        }
        return
      }
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

      // Each selected shift is final-submitted with the SAME request the
      // "YES – FINAL SUBMISSION" button sends (the three confirmations answered
      // yes). The card's control is a link to the Final Shift Check page, so it
      // must never be "clicked" here – that only navigates and submits nothing.
      const failures = []
      let done = 0
      try {
        for (const item of chosen) {
          let action = ''
          const form = item.button.closest('form')
          const formData = new FormData(form || undefined)
          if (form) {
            action = form.getAttribute('action') || ''
            if (item.button.name) formData.append(item.button.name, item.button.value || '1')
          } else {
            const href = item.button.getAttribute('href') || ''
            const m = href.match(/\\/wages\\/drafts\\/(\\d+)\\//)
            if (!m) { failures.push('one shift had no submission link'); continue }
            action = '/wages/drafts/' + m[1] + '/final-submit'
          }
          if (!/final-submit/.test(action)) action = action.replace(/final-check\\/?(\\?.*)?$/, 'final-submit')
          formData.set('time_correct', 'yes'); formData.set('end_time_correct', 'yes'); formData.set('information_complete', 'yes')
          const res = await fetch(action, { method: 'POST', body: formData, credentials: 'include', redirect: 'follow' })
          const landed = res.url || ''
          const errParam = (landed.match(/[?&]error=([^&]*)/) || [])[1]
          if (errParam) failures.push(decodeURIComponent(errParam.replace(/\\+/g, ' ')))
          else if (!res.ok) failures.push('server answered ' + res.status)
          else done++
          submit.textContent = 'Submitting… ' + (done + failures.length) + ' of ' + chosen.length
        }
        if (failures.length) {
          window.alert(done + ' shift' + (done === 1 ? '' : 's') + ' final-submitted. ' + failures.length + ' could not be submitted: ' + failures.join(' / '))
        }
        window.location.reload()
      } catch (err) {
        console.error('bulk final submission failed', err)
        window.alert('Final submission did not go through (' + (done) + ' of ' + chosen.length + ' done). Please check your connection and try again.')
        submit.disabled = false
        submit.textContent = 'Submit selected'
      }
    })

    const insertionPoint = selectable[0].shift
    insertionPoint.parentElement?.insertBefore(panel, insertionPoint)
  }

  const BW_UI_VERSION = '__BW_UI_VERSION__'
  function guardAgainstStalePage() {
    // If this page's built-in version differs from the server's current version,
    // the browser is showing an old copy (office PC, phone home-screen, etc.).
    // Reload from the server once, bypassing cache. Never loops: version is
    // remembered per page load.
    if (window.__bwVersionChecked) return
    window.__bwVersionChecked = true
    try {
      fetch('/wages-version?_=' + Date.now(), { cache: 'no-store', credentials: 'include' })
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (!data || !data.version || data.version === BW_UI_VERSION) return
          try { window.sessionStorage.removeItem(ACTIVE_STAFF_PROFILE_KEY) } catch (err) {}
          try { window.localStorage.removeItem(ACTIVE_STAFF_PROFILE_KEY) } catch (err) {}
          const url = new URL(window.location.href)
          url.searchParams.set('_bwv', data.version)
          window.location.replace(url.toString())
        })
        .catch(() => {})
    } catch (err) {}
  }

  function runEnhancements() {
    if (!window.location.pathname.startsWith('/wages')) return
    guardAgainstStalePage()
    forceWagesProxyRouting()
    consumeMissedQueryFlag()
    detectAndPersistActiveStaffProfile()
    removeStaffDashboardAccess()
    hideWorkerSignOut()
    fixSwitchPerson()
    bindPayrollWeekPickerPersistence()
    decorateButtons()
    document.querySelectorAll('.bw-home-miss-shift-btn').forEach((node) => node.remove())
    document.querySelectorAll('.bw-period-tools, .bw-last-payroll-btn').forEach((node) => node.remove())
    moveAddShiftNearSaveTemporary()
    unlockPayrollWeekPicker()
    hidePayrollWeekSection()
    enhanceMissedShiftForms()
    hideLegacyMissedShiftToggle()
    hideLockedPayrollWarnings()
    hideOvernightPrompt()
    showMissedShiftDetails()
    addBulkFinalSubmission()
    singleTickFinalCheck()
  }

  // Final Shift Check: ONE tick box for the worker. The engine still requires its
  // three yes-answers, so the single box drives the three original (hidden) boxes.
  function singleTickFinalCheck() {
    const form = document.querySelector('form[action*="/final-submit"], form[action*="/final-check"]')
    if (!form || form.querySelector('.bw-single-tick')) return
    const boxes = Array.from(form.querySelectorAll('input[type="checkbox"]')).filter((b) => /time_correct|end_time_correct|information_complete/.test(b.name || ''))
    if (boxes.length < 2) return
    const list = form.querySelector('.check-list') || boxes[0].closest('.check-list, div')
    const row = document.createElement('label')
    row.className = 'check-row bw-single-tick'
    row.style.cssText = 'display:flex;gap:12px;align-items:flex-start;font-weight:700;font-size:17px;line-height:1.35'
    const one = document.createElement('input')
    one.type = 'checkbox'
    one.className = 'bw-single-tick-box'
    one.style.cssText = 'width:26px;height:26px;flex:0 0 auto;margin-top:1px'
    const txt = document.createElement('span')
    txt.textContent = 'I have checked my start time, my end time and all my shift information — everything is correct.'
    row.appendChild(one); row.appendChild(txt)
    const sync = () => { boxes.forEach((b) => { b.checked = one.checked }) }
    one.addEventListener('change', sync)
    boxes.forEach((b) => { b.checked = false; const r = b.closest('label, .check-row'); if (r) r.style.display = 'none'; b.required = false })
    if (list) list.insertBefore(row, list.firstChild); else form.insertBefore(row, form.firstChild)
    form.addEventListener('submit', (ev) => {
      if (!one.checked) { ev.preventDefault(); one.focus(); window.alert('Please tick the box to confirm your shift is correct, then press YES – FINAL SUBMISSION.'); return }
      sync()
    }, true)
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
</script>`).split('__BW_UI_VERSION__').join(WAGES_UI_VERSION)

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

function formatProxyLongDate(date: Date) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return days[date.getUTCDay()] + ' ' + date.getUTCDate() + ' ' + months[date.getUTCMonth()] + ' ' + date.getUTCFullYear()
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

// Safety net for every shift save (2026-09-14): if the page failed to send
// work_date (seen on the edit page, where the original hidden field sat inside
// a block the enhancer removes) rebuild it from the calendar fields so upstream
// never answers "Choose a valid work date." for a shift the worker did date.
// Owner rule (2026-09-15): the worker calendar is open from LAST payroll's Saturday
// up to THIS payroll's Friday. Earlier dates can no longer be claimed; later dates
// belong to the next payroll.
function proxyAllowedWorkDateWindow() {
  const thisSat = currentProxyPayrollWeekStart()
  const d = parseProxyIsoDate(thisSat)!
  const lastSat = new Date(d.getTime()); lastSat.setUTCDate(lastSat.getUTCDate() - 7)
  return { from: formatProxyIsoDate(lastSat), to: proxyEndOfPayrollWeek(thisSat) }
}
function proxyWorkDateWindowError(iso: string): string | null {
  if (!parseProxyIsoDate(iso)) return null
  const w = proxyAllowedWorkDateWindow()
  if (iso < w.from) return `That date (${proxyLongDate(iso)}) is older than one week and can no longer be claimed. Only ${proxyLongDate(w.from)} to ${proxyLongDate(w.to)} can be captured. Please speak to the office.`
  if (iso > w.to) return `That date (${proxyLongDate(iso)}) is in the next payroll. Please capture it from this Saturday onwards. Only ${proxyLongDate(w.from)} to ${proxyLongDate(w.to)} can be captured now.`
  return null
}

function ensureWorkDateOnSubmission(formData: FormData) {
  const current = normalizeProxyFieldValue(formData.get('work_date'))
  if (parseProxyIsoDate(current)) return false
  const candidate = normalizeProxyFieldValue(formData.get('bw_visible_work_date'))
    || normalizeProxyFieldValue(formData.get('bw_actual_work_date'))
    || normalizeProxyFieldValue(formData.get('date_worked'))
    || normalizeProxyFieldValue(formData.get('actual_work_date'))
    || normalizeProxyFieldValue(formData.get('exact_work_date'))
  if (!parseProxyIsoDate(candidate)) return false
  formData.set('work_date', candidate)
  if (!normalizeProxyFieldValue(formData.get('bw_actual_work_date'))) formData.set('bw_actual_work_date', candidate)
  return true
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

  if (isPreviousPayroll && actualWorkDateParsed) {
    // Upstream only accepts a missed shift when it is booked on the CURRENT
    // payroll week's Saturday with missed_previous_week=1. It rejects the real
    // (locked) date outright. Book it on Saturday, keep the real date in the
    // description so admin/export can see it.
    formData.set('work_date', captureWeekStart)
    if (formData.has('bw_visible_work_date')) formData.set('bw_visible_work_date', captureWeekStart)
    formData.set('missed_previous_week', '1')
    const realDateLabel = formatProxyLongDate(actualWorkDateParsed)
    const marker = 'MISSED SHIFT - actual date ' + realDateLabel
    // Strip any earlier marker (e.g. the worker re-saved a draft) so the
    // description never reads "MISSED SHIFT - actual date X - actual date X - ..."
    const existingDescription = normalizeProxyFieldValue(formData.get('work_description'))
      .replace(/^(?:MISSED SHIFT\s*[-\u2013]\s*actual date\s+[A-Za-z]{3}\s+\d{1,2}\s+[A-Za-z]{3}\s+\d{4}\s*[-\u2013]\s*)+/i, '')
      .replace(/^(?:[A-Za-z]{3}\s+\d{1,2}\s+[A-Za-z]{3}\s+\d{4}\s*[-\u2013]\s*)+/, '')
      .trim()
    formData.set('work_description', (marker + ' - ' + existingDescription).slice(0, 500))
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
        SELECT id FROM wage_debug_capture ORDER BY id DESC LIMIT 300
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
    const isShiftSave = /^\/wages\/drafts(?:\/\d+)?\/?$/.test(incomingUrl.pathname)
    const workDateFilled = isShiftSave && ensureWorkDateOnSubmission(formData)
    const rewriteApplied = shouldRewriteMissedShiftSubmission(formData) || workDateFilled

    if (shouldRewriteMissedShiftSubmission(formData)) {
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
    const looseIsShiftSave = /^\/wages\/drafts(?:\/\d+)?\/?$/.test(incomingUrl.pathname)
    const looseWorkDateFilled = looseIsShiftSave && ensureWorkDateOnSubmission(looseFormData)
    const rewriteApplied = shouldRewriteMissedShiftSubmission(looseFormData) || looseWorkDateFilled
    if (shouldRewriteMissedShiftSubmission(looseFormData)) {
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


// ---------------------------------------------------------------------------
// Real-date restore for previous-payroll shifts (2026-09-14).
// Upstream only ACCEPTS a previous-week shift when booked on the current
// payroll Saturday. Once it has created the record (and, on Final Submission,
// calculated hours/amounts), we put the REAL work date back so the card,
// admin dashboard, export and duplicate checks all see the true day, while
// payroll_week_start keeps it paid in the current week. This is the exact
// shape upstream itself produced for earlier missed shifts (e.g. wage_shifts
// 9586: work_date 2026-09-04, payroll_week_start 2026-09-05, missed=1).
// Never creates rows. Never touches status. Only rows upstream just touched.
// ---------------------------------------------------------------------------
const MISSED_MARKER_RE = /MISSED SHIFT\s*[-\u2013]\s*actual date\s+[A-Za-z]{3}\s+(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s*(?:[-\u2013]\s*)?/i
const MONTHS3 = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']

function realDateFromMarker(text: string) {
  const m = (text || '').match(MISSED_MARKER_RE)
  if (!m) return null
  const mi = MONTHS3.indexOf(m[2].toLowerCase())
  if (mi < 0) return null
  const iso = `${m[3]}-${String(mi + 1).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`
  return parseProxyIsoDate(iso) ? iso : null
}

function stripMissedMarker(text: string) {
  return (text || '').replace(new RegExp('^(?:' + MISSED_MARKER_RE.source + ')+', 'i'), '').trim()
}

function proxyEndOfPayrollWeek(weekStartIso: string) {
  const d = parseProxyIsoDate(weekStartIso)
  if (!d) return weekStartIso
  d.setUTCDate(d.getUTCDate() + 6)
  return formatProxyIsoDate(d)
}

async function restoreRealDateForMissedShift(env: Bindings | undefined, staffId: number, realDateIso: string, startTime: string, endTime: string, draftIdHint: number) {
  const db = env?.DB
  if (!db || !staffId || !realDateIso) return { ok: false as const, reason: 'missing' }
  const captureWeekStart = currentProxyPayrollWeekStart()
  const captureWeekEnd = proxyEndOfPayrollWeek(captureWeekStart)
  const note = `Real work date ${realDateIso}; paid in current payroll ${captureWeekStart} to ${captureWeekEnd}; flagged for payroll cross-check.`

  // Draft row: the one upstream just saved on the Saturday for this worker/time.
  const draftRow = draftIdHint
    ? await db.prepare(`SELECT id, work_description, final_shift_id FROM wage_shift_drafts WHERE id = ? AND staff_id = ?`).bind(draftIdHint, staffId).first<{ id: number, work_description: string | null, final_shift_id: number | null }>()
    : await db.prepare(`SELECT id, work_description, final_shift_id FROM wage_shift_drafts
        WHERE staff_id = ? AND work_date = ? AND start_time = ? AND end_time = ?
          AND (work_description LIKE 'MISSED SHIFT%' OR missed_previous_week = 1)
        ORDER BY updated_at DESC, id DESC LIMIT 1`).bind(staffId, captureWeekStart, startTime, endTime).first<{ id: number, work_description: string | null, final_shift_id: number | null }>()
  if (!draftRow?.id) return { ok: false as const, reason: 'no_draft' }

  const cleanDescription = stripMissedMarker(draftRow.work_description || '')
  await db.prepare(`UPDATE wage_shift_drafts
      SET work_date = ?, payroll_week_start = ?, missed_previous_week = 1,
          work_description = CASE WHEN ? <> '' THEN ? ELSE work_description END,
          payroll_note = ?
      WHERE id = ? AND staff_id = ?`)
    .bind(realDateIso, captureWeekStart, cleanDescription, cleanDescription, note, draftRow.id, staffId).run()

  let shiftId = draftRow.final_shift_id || 0
  if (!shiftId) {
    const shiftRow = await db.prepare(`SELECT id FROM wage_shifts WHERE source_draft_id = ? AND staff_id = ? ORDER BY id DESC LIMIT 1`).bind(draftRow.id, staffId).first<{ id: number }>()
    shiftId = shiftRow?.id || 0
  }
  if (shiftId) {
    await db.prepare(`UPDATE wage_shifts
        SET work_date = ?, payroll_week_start = ?, missed_previous_week = 1,
            work_description = CASE WHEN ? <> '' THEN ? ELSE work_description END,
            payroll_note = CASE
              WHEN COALESCE(payroll_note,'') = '' THEN ?
              WHEN instr(payroll_note, 'Real work date') > 0 THEN payroll_note
              ELSE ? || ' | ' || payroll_note END
        WHERE id = ? AND staff_id = ?`)
      .bind(realDateIso, captureWeekStart, cleanDescription, cleanDescription, note, note, shiftId, staffId).run()
  }
  return { ok: true as const, draftId: draftRow.id, shiftId }
}

let realDateTableReady = false
async function ensureRealDateTable(env: Bindings | undefined) {
  if (realDateTableReady || !env?.DB) return
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS wage_draft_real_dates (draft_id INTEGER PRIMARY KEY, staff_id INTEGER NOT NULL, real_date TEXT NOT NULL, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run()
  realDateTableReady = true
}

// Owner day rules (owner 27 Sep 2026). Per date: a FORCED PLACE ("everyone who ticks Warehouse today is at the venue
// rate — they are building for a venue event") and/or a list of STAFF WHO ARE OFF (an entry from them is held at R0
// for the owner to approve or decline). Table wage_owner_day_rules(work_date PK, force_kind, staff_off_json, note, set_by).
type OwnerWindow = { start: string, end: string, place?: string }
type OwnerDayRule = { work_date: string, force_kind: string | null, staff_off: number[], staff_start: Record<number, string>, staff_end: Record<number, string>, staff_windows: Record<number, OwnerWindow[]>, note: string }
// Owner 27 Sep 2026 (Taka: warehouse 07:00–11:30 THEN house/garden 12:30–14:14): a person can have SEVERAL allowed
// windows on one day. Legacy single start/end becomes one window. Returns the windows for a staff member (or []).
function ownerWindowsFor(d: OwnerDayRule | null | undefined, staffId: number): OwnerWindow[] {
  if (!d) return []
  const w = d.staff_windows?.[staffId]
  if (w && w.length) return w
  const st = d.staff_start?.[staffId] || '', en = d.staff_end?.[staffId] || ''
  return st || en ? [{ start: st || '00:00', end: en || '23:59' }] : []
}
function parseOwnerWindows(json: string | null): Record<number, OwnerWindow[]> {
  const out: Record<number, OwnerWindow[]> = {}
  try { const o = JSON.parse(json || '{}'); for (const k of Object.keys(o)) { const arr = Array.isArray(o[k]) ? o[k] : []; out[Number(k)] = arr.filter((w: any) => w && /^\d{2}:\d{2}$/.test(String(w.start)) && /^\d{2}:\d{2}$/.test(String(w.end))).map((w: any) => ({ start: String(w.start), end: String(w.end), place: w.place ? String(w.place) : undefined })) } } catch (err) {}
  return out
}
// How much of [start,end] lies inside the owner's windows, in minutes, plus the overlapping pieces.
function ownerWindowOverlap(start: string, end: string, wins: OwnerWindow[]): { minutes: number, pieces: Array<{ start: string, end: string, place?: string }> } {
  const s = timeToMinutes(start), e0 = timeToMinutes(end)
  if (s === null || e0 === null) return { minutes: 0, pieces: [] }
  const e = e0 <= s ? e0 + 1440 : e0
  const pieces: Array<{ start: string, end: string, place?: string }> = []
  let minutes = 0
  const mm = (m: number) => String(Math.floor((m % 1440) / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0')
  for (const w of wins) {
    const ws = timeToMinutes(w.start), we = timeToMinutes(w.end)
    if (ws === null || we === null) continue
    const a = Math.max(s, ws), b = Math.min(e, we)
    if (b > a) { minutes += b - a; pieces.push({ start: mm(a), end: mm(b), place: w.place }) }
  }
  return { minutes, pieces }
}
async function ownerDayRule(db: D1Database, dateIso: string): Promise<OwnerDayRule | null> {
  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS wage_owner_day_rules (work_date TEXT PRIMARY KEY, force_kind TEXT, staff_off_json TEXT, note TEXT, set_by TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`).run()
    try { await db.prepare(`ALTER TABLE wage_owner_day_rules ADD COLUMN staff_start_json TEXT`).run() } catch (err) {}
    try { await db.prepare(`ALTER TABLE wage_owner_day_rules ADD COLUMN staff_end_json TEXT`).run() } catch (err) {}
    try { await db.prepare(`ALTER TABLE wage_owner_day_rules ADD COLUMN staff_windows_json TEXT`).run() } catch (err) {}
    const r = await db.prepare(`SELECT work_date, force_kind, staff_off_json, staff_start_json, staff_end_json, staff_windows_json, note FROM wage_owner_day_rules WHERE work_date = ?`).bind(dateIso).first<{ work_date: string, force_kind: string | null, staff_off_json: string | null, staff_start_json: string | null, staff_end_json: string | null, staff_windows_json: string | null, note: string | null }>()
    if (!r) return null
    let off: number[] = []; try { off = JSON.parse(r.staff_off_json || '[]').map(Number) } catch (err) {}
    let st: Record<number, string> = {}; try { st = JSON.parse(r.staff_start_json || '{}') } catch (err) {}
    let en: Record<number, string> = {}; try { en = JSON.parse(r.staff_end_json || '{}') } catch (err) {}
    return { work_date: r.work_date, force_kind: r.force_kind || null, staff_off: off, staff_start: st, staff_end: en, staff_windows: parseOwnerWindows(r.staff_windows_json), note: r.note || '' }
  } catch (err) { return null }
}
async function openStaffOffReview(env: Bindings | undefined, r: { id: number, staff_id: number, work_date: string, start_time: string, end_time: string, hours_worked: number, work_type: string, outlet_venue: string, event_name: string, work_description: string }, priced: OwnerPriced, kind: OwnerPayKind, note: string) {
  const db = env?.DB
  if (!db) return
  const staff = await db.prepare(`SELECT display_name FROM wage_staff WHERE id = ?`).bind(r.staff_id).first<{ display_name: string }>()
  const name = staff?.display_name || ('staff ' + r.staff_id)
  const key = 'staff_off|shift:' + r.id
  const rec = Number(priced.amount || 0)
  const reason = 'STAFF OFF — OWNER APPROVAL NEEDED: ' + name + ' was marked OFF on ' + r.work_date + (note ? ' (' + note + ')' : '') + ' but has entered ' + r.start_time + '–' + r.end_time + ' at ' + (r.outlet_venue || '') + ' (' + (r.work_type || 'Normal') + '). Not paid automatically — R0 until the owner approves or declines. If he did work: ' + priced.breakdown + ' = ' + fmtRand(rec) + '.'
  const snapshot = JSON.stringify({ shiftId: r.id, source: 'shift', staffId: r.staff_id, employee: name, workDate: r.work_date, venue: r.outlet_venue, eventName: r.event_name, workType: r.work_type, workDescription: r.work_description, startTime: r.start_time, endTime: r.end_time, hours: r.hours_worked, amountNow: 0 })
  const system = JSON.stringify({ comparisonLabel: 'staff off', employee: name, warningTitle: 'Marked OFF by the owner — did he really work? Approve or decline', humanReason: reason, petrusExtra: 1, petrusSunday: 1, staffOff: 1, holidayKind: kind, extraHours: Number(r.hours_worked || 0), beforeHours: 0, afterHours: 0, baseAmount: 0, offeredRate: Number(priced.hourlyRate || 0), recommendedAmount: rec, recommendedText: priced.breakdown, staffBlocking: 0, autoDuplicate: 0, conflictDetected: 0 })
  await db.prepare(`INSERT INTO wage_payroll_reviews (issue_key, status, warning_kind, severity, staff_id, staff_name, work_date, payroll_week_start, subject_source, subject_shift_id, compared_source, compared_shift_id, warning_reason, issue_summary, original_hours, facts_hash, subject_snapshot_json, system_snapshot_json)
      SELECT ?, 'OPEN', 'possible_duplicate_manual_check', 'red', ?, ?, ?, (SELECT payroll_week_start FROM wage_shifts WHERE id = ?), 'shift', ?, 'shift', NULL, ?, ?, ?, ?, ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM wage_payroll_reviews WHERE issue_key = ?)`)
    .bind(key, r.staff_id, name, r.work_date, r.id, r.id, reason, 'STAFF OFF — ' + name + ' — ' + r.work_date + ' — approve or decline (' + fmtRand(rec) + ' if he worked)', r.hours_worked, key, snapshot, system, key).run()
}

// Owner 28 Sep 2026 (Patrick #9869 "I'm trying to make changes, it's not allowing me"): the engine's manager edit
// form saves the times but re-prices the row with its OLD base formula (R90/h, engine Saturday ×1.33), so the
// amount on the row goes wrong and the owner's rate rules are lost. After every accepted /admin/wages/shifts/:id/edit
// the proxy re-prices THAT ROW under the owner rules (place from work type / wording / office decision / day rule,
// Sunday ×1.2, holiday ×2, warehouse meeting, student, gardener, Petrus) and stamps calculation_version = 10.
// The owner's own decisions on a row (OFF held at R0, owner-times cap, already-paid difference) are kept: a row whose
// manager_update_reason says "held at R0" or "Owner times" is left as the engine saved it.
async function repriceAfterManagerEdit(env: Bindings | undefined, shiftId: number, adminName: string): Promise<string> {
  const db = env?.DB
  if (!db || !shiftId) return ''
  const row = await db.prepare(`SELECT w.id, w.staff_id, w.work_date, w.start_time, w.end_time, w.hours_worked, w.work_type, w.outlet_venue, w.event_name, w.work_description, w.total_amount, w.gross_wage, w.manager_update_reason, w.source_draft_id, s.payroll_rule, s.display_name
      FROM wage_shifts w JOIN wage_staff s ON s.id = w.staff_id WHERE w.id = ?`).bind(shiftId).first<{ id: number, staff_id: number, work_date: string, start_time: string, end_time: string, hours_worked: number, work_type: string, outlet_venue: string, event_name: string, work_description: string, total_amount: number, gross_wage: number, manager_update_reason: string | null, source_draft_id: number | null, payroll_rule: string, display_name: string }>()
  if (!row) return ''
  const mur = row.manager_update_reason || ''
  if (/held at R0|Owner times .* applied|DIFFERENCE ONLY|difference only/i.test(mur)) return ' Amount left as your earlier decision on this row (' + fmtRand(before0(row)) + ').'
  let kind = ownerPayKind(row.staff_id, row.work_type, [row.outlet_venue, row.event_name, row.work_description].join(' '), row.payroll_rule)
  // Office place decision made earlier on this row / its draft wins over the wording.
  try {
    const pd = await db.prepare(`SELECT system_snapshot_json FROM wage_payroll_reviews WHERE status = 'RESOLVED' AND ((subject_source = 'shift' AND subject_shift_id = ?) OR (subject_source = 'draft' AND subject_shift_id = ?)) AND (issue_key LIKE 'crew_pattern|%' OR issue_key LIKE 'rate_choice_%') ORDER BY reviewed_at DESC LIMIT 1`).bind(row.id, row.source_draft_id || -1).first<{ system_snapshot_json: string | null }>()
    if (pd) { const sn = JSON.parse(pd.system_snapshot_json || '{}'); if (sn.placeDecision === 'warehouse' || sn.placeDecision === 'event' || sn.placeDecision === 'gardener') kind = sn.placeDecision }
  } catch (err) {}
  const dayRule = await ownerDayRule(db, row.work_date)
  if (dayRule?.force_kind === 'event' && (kind === 'warehouse' || kind === 'warehouse_or_event')) kind = 'event'
  if (dayRule?.force_kind === 'warehouse' && (kind === 'event' || kind === 'warehouse_or_event')) kind = 'warehouse'
  if (kind === 'warehouse_or_event') return ' Place unclear (wording says warehouse, work type says Normal) — the amount is not final until you pick Warehouse or Venue in the red review.'
  const priced = ownerPayForShift(row.work_date, row.start_time, row.end_time, kind)
  if (!priced) return ''
  const amt = Math.round(Number(priced.recommendedAmount ?? priced.amount) * 100) / 100
  const before = before0(row)
  if (Math.abs(amt - before) < 0.005) {
    await db.prepare(`UPDATE wage_shifts SET calculation_version = ?, hourly_rate_snapshot = ? WHERE id = ?`).bind(OWNER_RATE_RULES_VERSION, priced.hourlyRate, row.id).run()
    return ' Priced under your rules: ' + priced.breakdown + ' = ' + fmtRand(amt) + '.'
  }
  const note = ' | Re-priced after office edit by ' + adminName + ' ' + new Date().toISOString().slice(0, 10) + ': ' + priced.breakdown + ' = ' + fmtRand(amt) + ' (engine had ' + fmtRand(before) + ')'
  await db.prepare(`UPDATE wage_shifts SET total_amount = ?, gross_wage = ?, hourly_rate_snapshot = ?, calculation_version = ?, payroll_note = COALESCE(payroll_note,'') || ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .bind(amt, amt, priced.hourlyRate, OWNER_RATE_RULES_VERSION, note, row.id).run()
  await captureWagesDebug(env, { request_path: '/admin/wages/shifts/' + row.id + '/edit (reprice)', request_method: 'POST', original_payload_json: JSON.stringify({ shift_id: row.id, staff: row.display_name, start: row.start_time, end: row.end_time, kind, engine_amount: before }), rewritten_payload_json: JSON.stringify({ amount: amt, breakdown: priced.breakdown, by: adminName }), rewrite_applied: 1, response_status: 302, response_location: '', response_error_text: '' })
  return ' Priced under your rules: ' + priced.breakdown + ' = ' + fmtRand(amt) + ' (the engine had put ' + fmtRand(before) + ').'
}

async function applyOwnerRatesToFinalSubmission(env: Bindings | undefined, draftId: number, cookieHeader: string) {
  const db = env?.DB
  if (!db || !draftId) return
  const staffId = await staffIdFromWageSession(env, cookieHeader)
  if (!staffId) return
  // The paid row the engine just wrote for this draft (owner match, most recent).
  const row = await db.prepare(`SELECT w.id, w.staff_id, w.work_date, w.start_time, w.end_time, w.hours_worked, w.work_type, w.outlet_venue, w.event_name, w.work_description, w.calculation_version, w.total_amount, w.gross_wage, s.payroll_rule
      FROM wage_shifts w JOIN wage_staff s ON s.id = w.staff_id
      WHERE w.source_draft_id = ? AND w.staff_id = ? ORDER BY w.id DESC LIMIT 1`).bind(draftId, staffId).first<{ id: number, staff_id: number, work_date: string, start_time: string, end_time: string, hours_worked: number, work_type: string, outlet_venue: string, event_name: string, work_description: string, calculation_version: number, total_amount: number, gross_wage: number, payroll_rule: string }>()
  if (!row || Number(row.calculation_version) === OWNER_RATE_RULES_VERSION) return
  // Real date may have been restored a moment ago; re-read to be safe.
  const fresh = await db.prepare(`SELECT work_date FROM wage_shifts WHERE id = ?`).bind(row.id).first<{ work_date: string }>()
  const dateIso = fresh?.work_date || row.work_date
  let kind = ownerPayKind(row.staff_id, row.work_type, [row.outlet_venue, row.event_name, row.work_description].join(' '), row.payroll_rule)
  // Owner 2026-09-22: if the office already decided the PLACE on this draft (crew-pattern / rate-choice
  // review), that decision wins over the worker's work type.
  let placeNote = ''
  if (kind === 'warehouse' || kind === 'event' || kind === 'warehouse_or_event' || kind === 'gardener') {
    try {
      const pd = await db.prepare(`SELECT id, decision_reason, system_snapshot_json FROM wage_payroll_reviews WHERE subject_source = 'draft' AND subject_shift_id = ? AND status = 'RESOLVED' AND (issue_key LIKE 'crew_pattern|draft:%' OR issue_key LIKE 'rate_choice_%|draft:%') ORDER BY reviewed_at DESC LIMIT 1`).bind(draftId).first<{ id: number, decision_reason: string, system_snapshot_json: string | null }>()
      if (pd) { const sn = JSON.parse(pd.system_snapshot_json || '{}'); if (sn.placeDecision === 'warehouse' || sn.placeDecision === 'event' || sn.placeDecision === 'gardener') { kind = sn.placeDecision; placeNote = ' | Place decided by office (review #' + pd.id + ', ' + (sn.placeDecidedBy || 'office') + '): ' + (kind === 'warehouse' ? 'WAREHOUSE R81,25/h' : kind === 'gardener' ? 'GARDEN R62,50/h' : 'VENUE R95/h') } }
    } catch (err) {}
  }
  // Owner 27 Sep 2026: day rules — forced place for everybody (e.g. "Sunday 27 Sep: Warehouse ticks pay the venue
  // rate, they are building for a venue event") and staff marked OFF (entry held for the owner).
  const dayRule = await ownerDayRule(db, dateIso)
  let dayRuleNote = ''
  if (dayRule?.force_kind === 'event' && (kind === 'warehouse' || kind === 'warehouse_or_event')) { kind = 'event'; dayRuleNote = ' | OWNER DAY RULE ' + dateIso + ': all Warehouse entries paid at the VENUE rate' + (dayRule.note ? ' (' + dayRule.note + ')' : '') }
  if (dayRule?.force_kind === 'warehouse' && (kind === 'event' || kind === 'warehouse_or_event')) { kind = 'warehouse'; dayRuleNote = ' | OWNER DAY RULE ' + dateIso + ': all entries paid at the WAREHOUSE rate' + (dayRule.note ? ' (' + dayRule.note + ')' : '') }
  let staffIsOff = !!dayRule && dayRule.staff_off.includes(Number(row.staff_id))
  let outsideWindowNote = ''
  // Owner 27 Sep 2026 (Takavaudza Sunday garden): "he only arrived at 12:30 — can only claim from that time onwards."
  // Price from the owner's start time when the worker claims earlier; the row keeps his clocked times, the note
  // says why, and a red review lets the owner override.
  const ownerWins = ownerWindowsFor(dayRule, Number(row.staff_id))
  const ownerStart = ownerWins.length ? ownerWins.map((w) => w.start).sort()[0] : ''
  const ownerEnd = ownerWins.length ? ownerWins.map((w) => w.end).sort().slice(-1)[0] : ''
  const winText = ownerWins.map((w) => w.start + '–' + w.end + (w.place ? ' ' + w.place : '')).join(' and ')
  let priceFrom = row.start_time, priceTo = row.end_time, startNote = ''
  const sM = timeToMinutes(row.start_time), eM0 = timeToMinutes(row.end_time)
  const eM = sM !== null && eM0 !== null && eM0 <= sM ? eM0 + 1440 : eM0
  // Owner 27 Sep 2026 (Taka draft 931, Warehouse 07:00–12:00 while the owner recorded him garden 12:30–14:14 only):
  // an entry that lies COMPLETELY outside the owner's windows is not trimmed — it is held at R0 like an OFF day,
  // with a red review for the owner to approve or decline. An entry overlapping one window is paid for the
  // overlapping piece only (a person can have several windows: e.g. warehouse 07:00–11:30 then house 12:30–14:14).
  if (ownerWins.length && sM !== null && eM !== null) {
    const ov = ownerWindowOverlap(row.start_time, row.end_time, ownerWins)
    if (ov.minutes <= 0) {
      staffIsOff = true
      outsideWindowNote = ' | OUTSIDE OWNER TIMES ' + dateIso + ': owner recorded him ' + winText + ', this entry ' + row.start_time + '–' + row.end_time + ' is entirely outside those times' + (dayRule?.note ? ' (' + dayRule.note + ')' : '')
    } else {
      // Pay the single largest overlapping piece (entries are one place each; the pieces never span two windows in practice).
      const best = ov.pieces.slice().sort((a, b) => (timeToMinutes(b.end)! - timeToMinutes(b.start)!) - (timeToMinutes(a.end)! - timeToMinutes(a.start)!))[0]
      if (best.start !== row.start_time || best.end !== row.end_time) {
        priceFrom = best.start; priceTo = best.end
        startNote = ' | OWNER TIMES ' + dateIso + ': paid ' + priceFrom + '–' + priceTo + ' only (worker entered ' + row.start_time + '–' + row.end_time + '; owner recorded him ' + winText + ') — ' + (dayRule?.note || 'owner instruction')
      }
    }
  }
  let priced = ownerPayForShift(dateIso, priceFrom, priceTo, kind)
  if (!priced) {
    // Owner 2026-09-15: "warehouse" only in the wording → not clearly warehouse-only.
    // Do not decide the rate; open a Review for Bernie (Warehouse or Event/Venue).
    if (kind === 'warehouse_or_event') await openWarehouseOrEventReview(env, { id: row.id, staff_id: row.staff_id, work_date: dateIso, start_time: row.start_time, end_time: row.end_time, hours_worked: row.hours_worked, work_type: row.work_type, outlet_venue: row.outlet_venue, event_name: row.event_name, work_description: row.work_description, amount: before0(row) })
    return // gardener block / fixed weekly / undecided: engine amount stands
  }
  const before = Number(row.gross_wage ?? row.total_amount ?? 0)
  // Owner 2026-09-23 (John #9779 / Givemore #9789): if the office already APPROVED a rand amount on this draft's
  // "already paid" review, the paid row must carry THAT amount — not the full day — so nothing is billed twice.
  let approvedNote = ''
  try {
    const pb = await db.prepare(`SELECT id, approved_payable_hours, system_snapshot_json FROM wage_payroll_reviews WHERE issue_key = ? AND status = 'RESOLVED'`).bind('paid_before|draft:' + draftId).first<{ id: number, approved_payable_hours: number | null, system_snapshot_json: string | null }>()
    if (pb) {
      const ps = JSON.parse(pb.system_snapshot_json || '{}')
      if (ps.paidBefore && ps.approvedAmount !== undefined) {
        const amt = Math.round(Number(ps.approvedAmount) * 100) / 100
        approvedNote = ' | ALREADY-PAID CORRECTION (review #' + pb.id + ', approved ' + fmtRand(amt) + '): already paid ' + fmtRand(Number(ps.alreadyPaid || 0)) + ' earlier' + (Number(ps.rateCorrection || 0) ? '; rate correction ' + fmtRand(Number(ps.rateCorrection)) : '') + (Number(ps.extraHours || 0) ? '; extra ' + Number(ps.extraHours).toFixed(2) + ' h ' + fmtRand(Number(ps.extraAmount || 0)) : '') + ' — row set to the approved amount (full day would have been ' + fmtRand(priced.amount) + ')'
        priced = { ...priced, amount: amt }
      }
    }
  } catch (err) {}
  let offNote = ''
  if (staffIsOff && priced.amount > 0) {
    // Owner 27 Sep 2026: he was marked OFF this day — hold the whole entry at R0 for the owner's decision.
    offNote = (outsideWindowNote ? outsideWindowNote : ' | STAFF OFF ' + dateIso + (dayRule?.note ? ' (' + dayRule.note + ')' : '')) + ' — HELD at R0 for owner approval; would be ' + fmtRand(priced.amount)
    try { await openStaffOffReview(env, { id: row.id, staff_id: row.staff_id, work_date: dateIso, start_time: row.start_time, end_time: row.end_time, hours_worked: row.hours_worked, work_type: row.work_type, outlet_venue: row.outlet_venue, event_name: row.event_name, work_description: row.work_description }, priced, kind, outsideWindowNote ? 'owner recorded him there ' + winText + ' only' + (dayRule?.note ? '; ' + dayRule.note : '') : (dayRule?.note || '')) } catch (err) {}
    priced = { ...priced, amount: 0, baseAmount: 0 }
  }
  if (startNote) {
    try {
      const full = ownerPayForShift(dateIso, row.start_time, row.end_time, kind)
      const nm = await db.prepare(`SELECT display_name FROM wage_staff WHERE id = ?`).bind(row.staff_id).first<{ display_name: string }>()
      const key = 'owner_start|shift:' + row.id
      const reason = 'OWNER TIMES APPLIED: ' + (nm?.display_name || 'worker') + ' entered ' + row.start_time + '–' + row.end_time + ' on ' + dateIso + ' but the owner recorded him as there ' + winText + ' — paid the part inside ' + priceFrom + '–' + priceTo + (dayRule?.note ? ' (' + dayRule.note + ')' : '') + '. Paid ' + priceFrom + '–' + priceTo + ': ' + priced.breakdown + ' = ' + fmtRand(priced.amount) + (full ? '. If the owner accepts his times it would be ' + full.breakdown + ' = ' + fmtRand(full.amount) : '') + '. Override below if anything changes.'
      const snapshot = JSON.stringify({ shiftId: row.id, source: 'shift', staffId: row.staff_id, employee: nm?.display_name || '', workDate: dateIso, venue: row.outlet_venue, workType: row.work_type, workDescription: row.work_description, startTime: row.start_time, endTime: row.end_time, hours: row.hours_worked, amountNow: priced.amount })
      const system = JSON.stringify({ comparisonLabel: 'owner start', employee: nm?.display_name || '', startTime: row.start_time, endTime: row.end_time, ownerEndTime: priceTo, warningTitle: 'Paid ' + priceFrom + '–' + priceTo + ' (owner times) — override if needed', humanReason: reason, petrusExtra: 1, petrusSunday: 1, ownerStart: 1, ownerStartTime: priceFrom, holidayKind: kind, extraHours: full ? Math.round((full.amount - priced.amount) / (full.hourlyRate || 1) * 100) / 100 : 0, beforeHours: 0, afterHours: 0, baseAmount: priced.amount, offeredRate: Number(priced.hourlyRate || 0), recommendedAmount: full ? Math.round((full.amount - priced.amount) * 100) / 100 : 0, recommendedText: full ? 'the time he entered outside ' + priceFrom + '–' + priceTo : '', staffBlocking: 0, autoDuplicate: 0, conflictDetected: 0 })
      await db.prepare(`INSERT INTO wage_payroll_reviews (issue_key, status, warning_kind, severity, staff_id, staff_name, work_date, payroll_week_start, subject_source, subject_shift_id, compared_source, compared_shift_id, warning_reason, issue_summary, original_hours, facts_hash, subject_snapshot_json, system_snapshot_json)
          SELECT ?, 'OPEN', 'possible_duplicate_manual_check', 'red', ?, ?, ?, (SELECT payroll_week_start FROM wage_shifts WHERE id = ?), 'shift', ?, 'shift', NULL, ?, ?, ?, ?, ?, ?
          WHERE NOT EXISTS (SELECT 1 FROM wage_payroll_reviews WHERE issue_key = ?)`)
        .bind(key, row.staff_id, nm?.display_name || '', dateIso, row.id, row.id, reason, 'OWNER TIMES ' + priceFrom + '–' + priceTo + ' — ' + (nm?.display_name || '') + ' — ' + dateIso + ' — paid ' + fmtRand(priced.amount) + ', override if needed', row.hours_worked, key, snapshot, system, key).run()
    } catch (err) {}
  }
  const noteTxt = 'Rate rules 2026-09-15: ' + priced.breakdown + placeNote + approvedNote + dayRuleNote + offNote + startNote
  await db.prepare(`UPDATE wage_shifts SET total_amount = ?, gross_wage = ?, hourly_rate_snapshot = ?, calculation_version = ?,
        payroll_note = CASE WHEN COALESCE(payroll_note,'') = '' THEN ? ELSE payroll_note || ' | ' || ? END
      WHERE id = ? AND staff_id = ?`)
    .bind(priced.amount, priced.amount, priced.hourlyRate, OWNER_RATE_RULES_VERSION, noteTxt, noteTxt, row.id, staffId).run()
  // A capped start (owner start time) or a held OFF day is an OWNER decision on the row — mark it so the green figure
  // and the Excel keep the row amount instead of re-pricing from the clocked hours.
  if (startNote || offNote) {
    try { await db.prepare(`UPDATE wage_shifts SET manager_update_reason = ? WHERE id = ? AND staff_id = ?`).bind((startNote ? 'Owner times ' + priceFrom + '–' + priceTo + ' applied at Final Submission: ' + priced.breakdown + ' = ' + fmtRand(priced.amount) + ' (worker entered ' + row.start_time + '–' + row.end_time + ')' : '') + (offNote ? (startNote ? ' | ' : '') + (outsideWindowNote ? 'Entirely outside the owner\'s times ' + winText + ' on ' + dateIso : 'Marked OFF by the owner on ' + dateIso) + ' — held at R0 pending the owner\'s decision' : ''), row.id, staffId).run() } catch (err) {}
  }
  // Owner 2026-09-22: Petrus weekday time outside 06–16 is held for an office decision on the rate.
  if (priced.heldHoliday) {
    try { await openHolidayReview(env, { id: row.id, staff_id: row.staff_id, work_date: dateIso, start_time: row.start_time, end_time: row.end_time, hours_worked: row.hours_worked, work_type: row.work_type, outlet_venue: row.outlet_venue, event_name: row.event_name, work_description: row.work_description }, priced, kind) } catch (err) {}
  } else if (kind === 'petrus' && ((priced.heldExtraHours && priced.heldExtraHours > 0) || priced.heldSunday)) {
    try { await openPetrusExtraReview(env, { id: row.id, staff_id: row.staff_id, work_date: dateIso, start_time: row.start_time, end_time: row.end_time, hours_worked: row.hours_worked, work_type: row.work_type, outlet_venue: row.outlet_venue, event_name: row.event_name, work_description: row.work_description }, priced) } catch (err) {}
  }
  await captureWagesDebug(env, { request_path: '/wages/drafts/' + draftId + '/final-submit (owner rates)', request_method: 'POST', original_payload_json: JSON.stringify({ shift_id: row.id, engine_amount: before, kind }), rewritten_payload_json: JSON.stringify({ amount: priced.amount, rate: priced.hourlyRate, breakdown: priced.breakdown }), rewrite_applied: 1, response_status: 200, response_location: '', response_error_text: '' })
}

function before0(row: { gross_wage: number, total_amount: number }) { return Number(row.gross_wage ?? row.total_amount ?? 0) }

// Owner 2026-09-15: a paid row whose wording says "warehouse" but whose work type is not
// Warehouse goes to Review. Bernie chooses Warehouse or Event/Venue; only then is the
// weekday rate applied (see /wages-admin/rate-choice). Uses the engine's own review table
// and vocabulary (warning_kind possible_duplicate_manual_check = manual check), so it shows
// in the same Review column as every other review. Idempotent per paid shift.
async function openWarehouseOrEventReview(env: Bindings | undefined, r: { id: number, staff_id: number, work_date: string, start_time: string, end_time: string, hours_worked: number, work_type: string, outlet_venue: string, event_name: string, work_description: string, amount: number }) {
  const db = env?.DB
  if (!db) return
  const staff = await db.prepare(`SELECT display_name FROM wage_staff WHERE id = ?`).bind(r.staff_id).first<{ display_name: string }>()
  const name = staff?.display_name || ('staff ' + r.staff_id)
  const key = 'rate_choice_warehouse_or_event|shift:' + r.id
  const reason = 'RATE CHOICE NEEDED: the wording mentions "warehouse" but the work type is ' + (r.work_type || 'Normal') + ', so it is not clearly warehouse-only. Bernie must choose Warehouse (R81,25/h, Sunday R97,50, meeting time unpaid) or Venue/Event (R95/h, Sunday R114) before the rate is decided. Until then the shift stays at the engine amount.'
  const snapshot = JSON.stringify({ shiftId: r.id, source: 'shift', staffId: r.staff_id, employee: name, workDate: r.work_date, venue: r.outlet_venue, eventName: r.event_name, workType: r.work_type, workDescription: r.work_description, startTime: r.start_time, endTime: r.end_time, hours: r.hours_worked, amountNow: r.amount })
  const system = JSON.stringify({ comparisonLabel: 'rate choice', warningTitle: 'Rate choice: Warehouse or Event/Venue', humanReason: reason, rateChoice: 1, staffBlocking: 0, autoDuplicate: 0, conflictDetected: 0 })
  await db.prepare(`INSERT INTO wage_payroll_reviews (issue_key, status, warning_kind, severity, staff_id, staff_name, work_date, payroll_week_start, subject_source, subject_shift_id, compared_source, compared_shift_id, warning_reason, issue_summary, original_hours, facts_hash, subject_snapshot_json, system_snapshot_json)
      SELECT ?, 'OPEN', 'possible_duplicate_manual_check', 'red', ?, ?, ?, (SELECT payroll_week_start FROM wage_shifts WHERE id = ?), 'shift', ?, 'shift', NULL, ?, ?, ?, ?, ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM wage_payroll_reviews WHERE issue_key = ?)`)
    .bind(key, r.staff_id, name, r.work_date, r.id, r.id, reason, 'Rate choice needed — ' + name + ' — ' + r.work_date + ' — Warehouse or Event/Venue?', r.hours_worked, key, snapshot, system, key).run()
}

// Owner 2026-09-22: Petrus (staff 4) Mon–Fri time before 06:00 / after 16:00 is not paid until
// the office approves it and decides the rate (R55/h offered). Red review on the paid shift; the R640 day
// (if any) is already paid; the held hours pay only when a decision is recorded.
async function openPetrusExtraReview(env: Bindings | undefined, r: { id: number, staff_id: number, work_date: string, start_time: string, end_time: string, hours_worked: number, work_type: string, outlet_venue: string, event_name: string, work_description: string }, priced: OwnerPriced) {
  const db = env?.DB
  if (!db) return
  const staff = await db.prepare(`SELECT display_name FROM wage_staff WHERE id = ?`).bind(r.staff_id).first<{ display_name: string }>()
  const name = staff?.display_name || ('staff ' + r.staff_id)
  const key = 'petrus_extra|shift:' + r.id
  const heldH = Number(priced.heldExtraHours || 0), beforeH = Number(priced.heldBeforeHours || 0), afterH = Number(priced.heldAfterHours || 0)
  const h2 = (n: number) => n.toFixed(2)
  const parts = [beforeH > 0 ? h2(beforeH) + ' h before 06:00' : '', afterH > 0 ? h2(afterH) + ' h after 16:00' : ''].filter(Boolean).join(' and ')
  if (priced.heldSunday) {
    // Owner 2026-09-22: Sunday is never automatic for Petrus — whole entry held for approval.
    const rec = Number(priced.recommendedAmount || 0)
    const reasonS = 'PETRUS SUNDAY — OWNER APPROVAL NEEDED: ' + r.start_time + '–' + r.end_time + ' on ' + r.work_date + ' (' + (r.work_type || 'Normal') + ', ' + (r.outlet_venue || '') + '). Sunday is not paid automatically for Petrus. Recommended if approved: ' + (priced.baseAmount ? 'R640 set day rate (06–16)' : 'no 06–16 time') + (heldH > 0 ? ' + ' + h2(heldH) + ' h outside 06–16 × R80' : '') + ' = ' + fmtRand(rec) + '. R0 is paid until the owner approves or declines.'
    const snapshotS = JSON.stringify({ shiftId: r.id, source: 'shift', staffId: r.staff_id, employee: name, workDate: r.work_date, venue: r.outlet_venue, eventName: r.event_name, workType: r.work_type, workDescription: r.work_description, startTime: r.start_time, endTime: r.end_time, hours: r.hours_worked, amountNow: 0 })
    const systemS = JSON.stringify({ comparisonLabel: 'Petrus Sunday', warningTitle: 'Petrus: Sunday entry — owner to approve or decline', humanReason: reasonS, petrusExtra: 1, petrusSunday: 1, extraHours: heldH, beforeHours: beforeH, afterHours: afterH, baseAmount: Number(priced.baseAmount || 0), offeredRate: PETRUS_WEEKEND_EXTRA_RATE, recommendedAmount: rec, staffBlocking: 0, autoDuplicate: 0, conflictDetected: 0 })
    await db.prepare(`INSERT INTO wage_payroll_reviews (issue_key, status, warning_kind, severity, staff_id, staff_name, work_date, payroll_week_start, subject_source, subject_shift_id, compared_source, compared_shift_id, warning_reason, issue_summary, original_hours, facts_hash, subject_snapshot_json, system_snapshot_json)
        SELECT ?, 'OPEN', 'possible_duplicate_manual_check', 'red', ?, ?, ?, (SELECT payroll_week_start FROM wage_shifts WHERE id = ?), 'shift', ?, 'shift', NULL, ?, ?, ?, ?, ?, ?
        WHERE NOT EXISTS (SELECT 1 FROM wage_payroll_reviews WHERE issue_key = ?)`)
      .bind(key, r.staff_id, name, r.work_date, r.id, r.id, reasonS, 'Petrus Sunday — ' + name + ' — ' + r.work_date + ' — approve or decline (' + fmtRand(rec) + ' recommended)', r.hours_worked, key, snapshotS, systemS, key).run()
    return
  }
  const reason = 'PETRUS EXTRA TIME — APPROVAL NEEDED: ' + r.start_time + '–' + r.end_time + ' on ' + r.work_date + ' (' + (r.work_type || 'Normal') + ', ' + (r.outlet_venue || '') + '). The fixed day ' + (priced.baseAmount ? fmtRand(priced.baseAmount) + ' (06:00–16:00)' : '(no 06–16 time: R0)') + ' is paid. ' + parts + ' = ' + h2(heldH) + ' h outside 06:00–16:00 is HELD: the office must approve it and decide the rate (R55/h offered = ' + fmtRand(heldH * PETRUS_EXTRA_RATE) + '). Nothing extra is paid until then.'
  const snapshot = JSON.stringify({ shiftId: r.id, source: 'shift', staffId: r.staff_id, employee: name, workDate: r.work_date, venue: r.outlet_venue, eventName: r.event_name, workType: r.work_type, workDescription: r.work_description, startTime: r.start_time, endTime: r.end_time, hours: r.hours_worked, amountNow: priced.amount })
  const system = JSON.stringify({ comparisonLabel: 'Petrus extra time', warningTitle: 'Petrus: time outside 06:00–16:00 on a weekday — approve and set the rate', humanReason: reason, petrusExtra: 1, extraHours: heldH, beforeHours: beforeH, afterHours: afterH, baseAmount: Number(priced.baseAmount || 0), offeredRate: PETRUS_EXTRA_RATE, staffBlocking: 0, autoDuplicate: 0, conflictDetected: 0 })
  await db.prepare(`INSERT INTO wage_payroll_reviews (issue_key, status, warning_kind, severity, staff_id, staff_name, work_date, payroll_week_start, subject_source, subject_shift_id, compared_source, compared_shift_id, warning_reason, issue_summary, original_hours, facts_hash, subject_snapshot_json, system_snapshot_json)
      SELECT ?, 'OPEN', 'possible_duplicate_manual_check', 'red', ?, ?, ?, (SELECT payroll_week_start FROM wage_shifts WHERE id = ?), 'shift', ?, 'shift', NULL, ?, ?, ?, ?, ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM wage_payroll_reviews WHERE issue_key = ?)`)
    .bind(key, r.staff_id, name, r.work_date, r.id, r.id, reason, 'Petrus extra time — ' + name + ' — ' + r.work_date + ' — ' + h2(heldH) + ' h outside 06–16 to approve', r.hours_worked, key, snapshot, system, key).run()
}

// Owner 2026-09-22 (rate rules v10): work on a PUBLIC HOLIDAY is never paid automatically. One red review
// per entry with the recommended amount (×2 hourly / Music Bus R750 + R180) and Approve / other amount / decline.
async function openHolidayReview(env: Bindings | undefined, r: { id: number, staff_id: number, work_date: string, start_time: string, end_time: string, hours_worked: number, work_type: string, outlet_venue: string, event_name: string, work_description: string }, priced: OwnerPriced, kind: OwnerPayKind) {
  const db = env?.DB
  if (!db) return
  const staff = await db.prepare(`SELECT display_name FROM wage_staff WHERE id = ?`).bind(r.staff_id).first<{ display_name: string }>()
  const name = staff?.display_name || ('staff ' + r.staff_id)
  const key = 'public_holiday|shift:' + r.id
  const rec = Number(priced.recommendedAmount || 0), hol = String(priced.heldHoliday || 'public holiday')
  const recText = priced.breakdown.replace(/^PUBLIC HOLIDAY — HELD for owner approval — recommended /, '').replace(/; R0 until approved$/, '')
  const reason = 'PUBLIC HOLIDAY — OWNER APPROVAL NEEDED: ' + name + ' worked ' + r.start_time + '–' + r.end_time + ' on ' + r.work_date + ' (' + hol + ') at ' + (r.outlet_venue || '') + ' (' + (r.work_type || 'Normal') + '). Public-holiday work is not paid automatically. Recommended: ' + recText + '. R0 is paid until the owner approves or declines.'
  const snapshot = JSON.stringify({ shiftId: r.id, source: 'shift', staffId: r.staff_id, employee: name, workDate: r.work_date, venue: r.outlet_venue, eventName: r.event_name, workType: r.work_type, workDescription: r.work_description, startTime: r.start_time, endTime: r.end_time, hours: r.hours_worked, amountNow: 0 })
  const system = JSON.stringify({ comparisonLabel: 'public holiday', warningTitle: 'Public holiday (' + hol + ') — owner to approve or decline', humanReason: reason, petrusExtra: 1, petrusSunday: 1, publicHoliday: hol, holidayKind: kind, extraHours: Number(r.hours_worked || 0), beforeHours: 0, afterHours: 0, baseAmount: 0, offeredRate: Number(priced.hourlyRate || 0), recommendedAmount: rec, recommendedText: recText, staffBlocking: 0, autoDuplicate: 0, conflictDetected: 0 })
  await db.prepare(`INSERT INTO wage_payroll_reviews (issue_key, status, warning_kind, severity, staff_id, staff_name, work_date, payroll_week_start, subject_source, subject_shift_id, compared_source, compared_shift_id, warning_reason, issue_summary, original_hours, facts_hash, subject_snapshot_json, system_snapshot_json)
      SELECT ?, 'OPEN', 'possible_duplicate_manual_check', 'red', ?, ?, ?, (SELECT payroll_week_start FROM wage_shifts WHERE id = ?), 'shift', ?, 'shift', NULL, ?, ?, ?, ?, ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM wage_payroll_reviews WHERE issue_key = ?)`)
    .bind(key, r.staff_id, name, r.work_date, r.id, r.id, reason, 'Public holiday (' + hol + ') — ' + name + ' — ' + r.work_date + ' — approve or decline (' + fmtRand(rec) + ' recommended)', r.hours_worked, key, snapshot, system, key).run()
}

async function staffIdFromWageSession(env: Bindings | undefined, cookieHeader: string) {
  const db = env?.DB
  if (!db) return 0
  const m = (cookieHeader || '').match(/(?:^|;\s*)bw_wage_session=([^;]+)/)
  if (!m) return 0
  const token = decodeURIComponent(m[1])
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
  const row = await db.prepare(`SELECT staff_id FROM wage_sessions WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP`).bind(hex).first<{ staff_id: number }>()
  return Number(row?.staff_id || 0)
}


function proxyLongDate(iso: string) {
  const d = parseProxyIsoDate(iso)
  return d ? formatProxyLongDate(d) : iso
}

function escapeHtmlText(value: string) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

class MissedPaidSectionInjector {
  constructor(private html: string) {}
  element(element: Element) {
    element.after(this.html, { html: true })
  }
}

// ---------------------------------------------------------------------------
// Admin /admin/wages: "Missed shifts paid in this payroll" audit table
// (2026-09-14). The engine's wage sheet filters by work_date, so a missed
// shift stored with its REAL previous-week date is paid (payroll_week_start =
// this week) but never listed and the on-screen Grand Total is short. This
// table lists every such shift for the payroll week in the page filter, with
// the worker, the real day, why it is a missed shift, and a cross-check
// against what that worker was already paid for on that same day last payroll.
// Read-only. Nothing here changes any record.
function fmtRand(n: number) {
  const v = Number(n || 0)
  const s = v.toFixed(2).replace('.', ',')
  return 'R' + s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

function timeToMinutes(t: string) {
  const m = (t || '').match(/^(\d{1,2}):(\d{2})/)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

function shiftsOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  const s1 = timeToMinutes(aStart), e1raw = timeToMinutes(aEnd), s2 = timeToMinutes(bStart), e2raw = timeToMinutes(bEnd)
  if (s1 === null || e1raw === null || s2 === null || e2raw === null) return false
  const e1 = e1raw <= s1 ? e1raw + 1440 : e1raw
  const e2 = e2raw <= s2 ? e2raw + 1440 : e2raw
  return s1 < e2 && s2 < e1
}

// Owner's pay rule (confirmed 2026-09-14). Applied per PERSON per REAL DAY after
// joining all that person's entries on the day (overlapping minutes counted once):
//   1. Day part: > 4 h inside 07:00–16:00 → R750; up to 4 h inside → R375; none → R0.
//   2. Every hour outside 07:00–16:00: R90/h (staff, Warehouse Team, Team Assistance),
//      R130/h for Music Bus entries.
//   3. Sunday (owner 2026-09-15): day part R750 FLAT for any time inside 07–16 (no half
//      day, no ×1.2); outside hours R90 × 1.5 = R135/h; Music Bus unchanged (R130/h).
//      Own-rate work on Sunday stays hours × own rate.
//   4. Own-rate work (House / House/Garden R62,50; Tsotlego R81,25 …): hours × rate.
// Read-only: the checker only compares; it never changes a paid record.
const RULE_WINDOW_START = 7 * 60, RULE_WINDOW_END = 16 * 60, RULE_FULL_DAY = 750, RULE_HALF_DAY = 375, RULE_HALF_MAX_MIN = 4 * 60, RULE_SUNDAY_FACTOR = 1.2
type RuleSegment = { start: string, end: string, rate: number, kind: 'event' | 'warehouse' | 'musicbus' | 'petrus' | 'ownrate' | 'student' | 'student_warehouse' | 'standard', label: string, addAmount?: number, addLabel?: string }
type RuleDayResult = { amount: number, insideMin: number, outsideStdMin: number, outsideMbMin: number, ownRateAmount: number, dayPart: number, overtime: number, sunday: boolean, span: string, notes: string[] }

function ruleSegmentMinutes(seg: { start: string, end: string }) {
  const s = timeToMinutes(seg.start), eRaw = timeToMinutes(seg.end)
  if (s === null || eRaw === null) return null
  const e = eRaw <= s ? eRaw + 1440 : eRaw
  return { s, e }
}

// Minutes of [s,e) that fall inside [a,b) — used to split a segment around the 07:00–16:00 window.
function overlapMinutes(s: number, e: number, a: number, b: number) {
  return Math.max(0, Math.min(e, b) - Math.max(s, a))
}

// Subtract already-covered minute ranges from [s,e) so the same minute is never priced twice.
function subtractCovered(s: number, e: number, covered: Array<[number, number]>): Array<[number, number]> {
  let pieces: Array<[number, number]> = [[s, e]]
  for (const [cs, ce] of covered) {
    const next: Array<[number, number]> = []
    for (const [ps, pe] of pieces) {
      if (ce <= ps || cs >= pe) { next.push([ps, pe]); continue }
      if (cs > ps) next.push([ps, cs])
      if (ce < pe) next.push([ce, pe])
    }
    pieces = next
  }
  return pieces.filter(([a, b]) => b > a)
}

// ---------------------------------------------------------------------------
// B&W WAGES AND MUSIC BUS RATE RULES (owner, 2026-09-15). Replaces the previous
// weekday/weekend calculations for NEW final submissions only.
//   General staff (owner 2026-09-22, rate rules v8 — HOURLY BY PLACE, every day):
//                  Warehouse (work type Warehouse Team)  R81,25 for every hour worked (R650 ÷ 8); Sunday R97,50; Mon–Fri 07:00–07:30 meeting unpaid
//                  Venue / event (any other work type)    R95 for every hour worked; Sunday R114
//                  No fixed day, no before/after premium; a man who moves from the warehouse to a
//                  venue is paid the warehouse hours at R81,25 and the venue hours at R95.
//   Music Bus      Mon–Sat R750 fixed for 07–16 + R120/h outside · Sunday R120/h
//   Petrus (staff 4)  v6: R640 set day rate for 06–16 Mon–Sat · Mon–Fri outside 06–16 R55/h (held for office approval) · Sat outside 06–16 R80/h automatic · Sunday whole entry held for owner approval
//   Gardeners (staff 1, 2)  House / House/Garden: engine's own gardener rate kept (not recalculated)
//                  Team block (Warehouse Team / Team Assistance): general-staff rules for that day
//   Never the old R375 half day; never the old ×1.2 / ×1.5 weekend factors.
// ---------------------------------------------------------------------------
const OWNER_RATE_RULES_VERSION = 10
// PUBLIC HOLIDAYS (owner 2026-09-22, rate rules v10): official gov.za list (Public Holidays Act 36 of 1994,
// Sunday → following Monday observed) + proclaimed Election Day 4 Nov 2026. Work on a public holiday:
//   General staff  ×2 on the hourly rate — Warehouse R162,50/h (Mon–Fri meeting 07:00–07:30 deducted first) · Venue R190/h
//   Petrus         NO fixed day — hourly R80 (R640 ÷ 8) × 2 = R160/h for every hour worked
//   Music Bus      R750 fixed for 07–16 + R180/h outside 07–16
// Every public-holiday entry is HELD (red review) until the office approves it; nothing pays automatically.
const SA_PUBLIC_HOLIDAYS: Record<string, string> = {
  '2026-01-01': "New Year's Day", '2026-03-21': 'Human Rights Day', '2026-04-03': 'Good Friday', '2026-04-06': 'Family Day',
  '2026-04-27': 'Freedom Day', '2026-05-01': "Workers' Day", '2026-06-16': 'Youth Day', '2026-08-09': "National Women's Day",
  '2026-08-10': "National Women's Day (observed)", '2026-09-24': 'Heritage Day', '2026-11-04': 'Election Day (proclaimed)',
  '2026-12-16': 'Day of Reconciliation', '2026-12-25': 'Christmas Day', '2026-12-26': 'Day of Goodwill',
  '2027-01-01': "New Year's Day", '2027-03-21': 'Human Rights Day', '2027-03-22': 'Human Rights Day (observed)', '2027-03-26': 'Good Friday',
  '2027-03-29': 'Family Day', '2027-04-27': 'Freedom Day', '2027-05-01': "Workers' Day", '2027-06-16': 'Youth Day',
  '2027-08-09': "National Women's Day", '2027-09-24': 'Heritage Day', '2027-12-16': 'Day of Reconciliation', '2027-12-25': 'Christmas Day',
  '2027-12-26': 'Day of Goodwill', '2027-12-27': 'Day of Goodwill (observed)'
}
function publicHolidayName(dateIso: string): string | null { return SA_PUBLIC_HOLIDAYS[dateIso] || null }
const HOLIDAY_FACTOR = 2, MUSICBUS_HOLIDAY_EXTRA = 180, PETRUS_HOLIDAY_HOURLY = 80 * 2
// General staff hourly rates by place (owner 2026-09-22): warehouse R650 ÷ 8 = R81,25/h; venue R95/h.
// Sunday ×1.2 (owner 2026-09-22): warehouse R97,50/h, venue R114/h.
// Staff meeting (owner 2026-09-22): Mon–Fri 07:00–07:30 at the office is NOT paid — warehouse entries
// covering that time lose the overlap (max 30 min = R40,62 at R81,25).
const WAREHOUSE_HOURLY = 81.25, VENUE_HOURLY = 95, SUNDAY_FACTOR = 1.2, MEETING_START = 7 * 60, MEETING_END = 7 * 60 + 30
// Gardeners' House / House-Garden work (Givemore, Takavaudza): R62,50/h Mon–Sat; SUNDAY ×1.2 = R75/h
// (owner 24 Sep 2026 — Takavaudza Sun 20 Sep 6 h = R450, not R375); public holiday ×2 = R125/h, held.
const GARDENER_HOURLY = 62.5
// Student (Lebo, staff 16) — owner 24 Sep 2026: R50/h at any place, every clocked hour (NO meeting deduction); public holiday ×2 = R100/h (held).
// Owner 28 Sep 2026: Lebo's Sunday is ×1.5 = R75/h (NOT the ×1.2 the rest of the team gets) — Lebo only.
const STUDENT_STAFF_ID = 16, STUDENT_HOURLY = 50, STUDENT_SUNDAY_FACTOR = 1.5
// Owner 29 Sep 2026: Lebo — R50/h ONLY in the warehouse (loading etc.). Out at a venue (setup, collection, delivery,
// standby, event) = R75/h. Sunday = R75/h anywhere. Public holiday ×2 of warehouse = R100/h.
const STUDENT_EVENT_HOURLY = 75
// Petrus (staff 4), owner 2026-09-22 (amended later the same day): SET DAY RATE R640,00 for 06:00–16:00 every day;
// Mon–Fri time before 06:00 / after 16:00 R55/h (held for office approval); Sat & Sun before 06:00 / after 16:00 R80/h (automatic).
const PETRUS_DAY = 640, PETRUS_WINDOW_START = 6 * 60, PETRUS_WINDOW_END = 16 * 60, PETRUS_EXTRA_RATE = 55, PETRUS_WEEKEND_EXTRA_RATE = 80
// Owner 28 Sep 2026: Petrus is a FIXED weekly wage — R640 × 6 days (Mon–Sat) = R3 840, spread over 6 days for UIF/VAT only.
// He must ALWAYS clear R3 840 in a week (more only when a Mon–Fri public holiday is priced on the holiday rule). A public
// holiday on Sat/Sun does not add anything: the R3 840 is simply spread over the 5 working days.
const PETRUS_STAFF_ID = 4, PETRUS_WEEK_DAYS = 6, PETRUS_WEEK_GUARANTEE = PETRUS_DAY * PETRUS_WEEK_DAYS
// 'warehouse_or_event' (owner 2026-09-15): the work TYPE is not Warehouse but the wording
// mentions "warehouse" — not clearly warehouse-only, so Bernie must choose Warehouse or
// Event/Venue in Review before the weekday rate is decided (engine amount stands meanwhile).
type OwnerPayKind = 'event' | 'warehouse' | 'warehouse_or_event' | 'musicbus' | 'petrus' | 'gardener' | 'student' | 'student_warehouse' | 'fixed_weekly'
// Owner 29 Sep 2026 — Lebo: "Just read what he writes. Loading / preparing = warehouse (R50). Collection / setup = event (R75)."
// EVENT words win over the word "warehouse" (e.g. "Sonop + warehouse — collection" is a collection day). Only when nothing
// says event and the place or words say warehouse is it the R50 warehouse rate. Anything else out of the warehouse = R75.
const STUDENT_EVENT_WORDS = /collect|setup|set[\s-]?up|deliver|drop[\s-]?off|break[\s-]?down|strike|standby|stand[\s-]?by|activation|event|venue|golf|stadium|hotel|arena|festival|wedding|function|install|rig/i
const STUDENT_WAREHOUSE_WORDS = /load|offload|off[\s-]?load|prepar|pack|re-?pack|clean|wash|sort|stock|receiv|recieiv|w[ae]a?re?\s?house/i
function studentKindFromWording(wt: string, wording: string): OwnerPayKind {
  const all = (wt || '') + ' ' + (wording || '')
  if (STUDENT_EVENT_WORDS.test(all)) return 'student'
  if (/warehouse/i.test(wt || '') || STUDENT_WAREHOUSE_WORDS.test(all)) return 'student_warehouse'
  return 'student'
}
function ownerPayKind(staffId: number, workType: string, wording: string, payrollRule: string): OwnerPayKind {
  if ((payrollRule || '') === 'fixed_weekly') return 'fixed_weekly'
  const wt = (workType || '').trim()
  if (/music\s*bus/i.test(wt)) return 'musicbus'
  if (staffId === 4) return 'petrus'
  // Owner 24 Sep 2026: Lebo (staff 16) is a student — R50/h whatever the place, Sunday ×1.5 (owner 28 Sep), public holiday ×2,
  // Mon–Fri 07:00–07:30 meeting unpaid when he is in the warehouse (same as the guys).
  if (staffId === STUDENT_STAFF_ID) return studentKindFromWording(wt, wording || '')
  // Gardeners: only their House / House/Garden block keeps the gardener rate; the Team
  // block (Warehouse Team / Team Assistance) is general staff for that day.
  if ((staffId === 1 || staffId === 2) && /house|garden/i.test(wt) && !/team/i.test(wt)) return 'gardener'
  if (/warehouse/i.test(wt)) return 'warehouse' // work type chosen as Warehouse (Warehouse Team) → clearly warehouse
  if (/w[ae]a?re?\s?house/i.test(wording || '')) return 'warehouse_or_event' // wording only (incl. "wearhouse" misspelling) → Bernie decides
  return 'event'
}
function ownerIsWeekday(dateIso: string) { const d = parseProxyIsoDate(dateIso); return !!d && d.getUTCDay() !== 0 && d.getUTCDay() !== 6 }
// Price ONE shift under the owner rules. Returns null when the engine amount must be kept.
// Owner (2026-09-15): use the ACTUAL day the hours were worked — a shift that passes
// midnight is priced in two parts (before midnight = start day's rate, after midnight =
// next day's rate). It stays one shift on one row; only the pay calculation splits.
type OwnerPriced = { amount: number, hourlyRate: number, breakdown: string, heldExtraHours?: number, heldBeforeHours?: number, heldAfterHours?: number, baseAmount?: number, heldSunday?: boolean, recommendedAmount?: number, heldHoliday?: string }
function ownerPayForShift(dateIso: string, startTime: string, endTime: string, kind: OwnerPayKind): OwnerPriced | null {
  if (kind === 'fixed_weekly') return null
  const d0 = parseProxyIsoDate(dateIso); const s0 = timeToMinutes(startTime); const e0 = timeToMinutes(endTime)
  if (!d0 || s0 === null || e0 === null) return null
  const end0 = e0 <= s0 ? e0 + 1440 : e0
  if (kind === 'warehouse_or_event') {
    // Rate rules v8: warehouse (R81,25/h) and venue (R95/h) differ every day → Bernie must choose.
    return null
  }
  if (end0 > 1440) {
    const next = new Date(d0.getTime()); next.setUTCDate(next.getUTCDate() + 1)
    const nextIso = next.toISOString().slice(0, 10)
    const a = ownerPayForShift(dateIso, startTime, '24:00', kind)
    const b = ownerPayForShift(nextIso, '00:00', String(Math.floor((end0 - 1440) / 60)).padStart(2, '0') + ':' + String((end0 - 1440) % 60).padStart(2, '0'), kind)
    if (!a || !b) return a || b
    const held = (a.heldExtraHours || 0) + (b.heldExtraHours || 0)
    const sun = !!(a.heldSunday || b.heldSunday || a.heldHoliday || b.heldHoliday)
    const hol = a.heldHoliday || b.heldHoliday
    return { amount: Math.round((a.amount + b.amount) * 100) / 100, hourlyRate: a.hourlyRate, breakdown: `${a.breakdown} (until midnight) + ${b.breakdown} (after midnight, ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][next.getUTCDay()]})`, ...(held > 0 || sun ? { heldExtraHours: Math.round(held * 100) / 100, heldBeforeHours: (a.heldBeforeHours || 0) + (b.heldBeforeHours || 0), heldAfterHours: (a.heldAfterHours || 0) + (b.heldAfterHours || 0), baseAmount: Math.round((a.amount + b.amount) * 100) / 100 } : {}), ...(sun ? { heldSunday: !hol, recommendedAmount: Math.round((((a.heldSunday || a.heldHoliday) ? a.recommendedAmount || 0 : 0) + ((b.heldSunday || b.heldHoliday) ? b.recommendedAmount || 0 : 0)) * 100) / 100 } : {}), ...(hol ? { heldHoliday: hol } : {}) }
  }
  const d = d0; const sMin = s0; const eMin = end0
  const dow = d.getUTCDay() // 0 Sun … 6 Sat
  const totalH = (eMin - sMin) / 60
  const insideMin = overlapMinutes(sMin, eMin, RULE_WINDOW_START, RULE_WINDOW_END)
  const outsideH = ((eMin - sMin) - insideMin) / 60
  const h = (n: number) => n.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
  const r2 = (n: number) => Math.round(n * 100) / 100
  // Owner 28 Sep 2026: Petrus — public holiday pay applies Mon–Fri only. A public holiday on a Saturday or Sunday is
  // an ordinary Saturday/Sunday for him: the week still clears R3 840 (6 × R640), just spread over the 5 working days.
  const holiday = (kind === 'petrus' && (dow === 0 || dow === 6)) ? null : publicHolidayName(dateIso)
  if (holiday) {
    // Owner 2026-09-22 (rate rules v10): public holiday — recommended amount worked out, but HELD (amount 0)
    // until the office approves. The review shows the recommendation and the buttons.
    let rec = 0, rate = 0, text = ''
    if (kind === 'musicbus') { rec = r2((insideMin > 0 ? 750 : 0) + outsideH * MUSICBUS_HOLIDAY_EXTRA); rate = MUSICBUS_HOLIDAY_EXTRA; text = `Music Bus public holiday (${holiday}): ${insideMin > 0 ? 'R750 fixed 07–16' : 'no 07–16 time'}${outsideH > 0 ? ` + ${h(outsideH)} h outside 07–16 × R180` : ''}` }
    else if (kind === 'petrus') {
      // Owner 2026-09-23: the 07:00–07:30 meeting is deducted on a public holiday for everyone — Petrus too
      // (Heritage Day 06:30–14:00 = 7,5 h − 0,5 h = 7 h × R160 = R1 120, as approved).
      const meetingMinP = dow >= 1 && dow <= 5 ? overlapMinutes(sMin, eMin, MEETING_START, MEETING_END) : 0
      const paidHP = r2(totalH - meetingMinP / 60)
      rec = r2(paidHP * PETRUS_HOLIDAY_HOURLY); rate = PETRUS_HOLIDAY_HOURLY
      text = `Petrus public holiday (${holiday}): no fixed day — ${h(totalH)} h${meetingMinP > 0 ? ` − ${h(meetingMinP / 60)} h staff meeting 07:00–07:30 (unpaid) = ${h(paidHP)} h` : ''} × R160 (R80 × 2)`
    }
    else if (kind === 'warehouse') {
      // Owner 2026-09-23: "There's still a meeting deduction on a holiday. We always have a meeting." Mon–Fri holiday
      // in the warehouse: the 07:00–07:30 meeting comes off first, then × 2.
      const meetingMinH = dow >= 1 && dow <= 5 ? overlapMinutes(sMin, eMin, MEETING_START, MEETING_END) : 0
      const paidH = r2(totalH - meetingMinH / 60)
      rate = r2(WAREHOUSE_HOURLY * HOLIDAY_FACTOR); rec = r2(paidH * rate)
      text = `Warehouse public holiday (${holiday}): ${h(totalH)} h${meetingMinH > 0 ? ` − ${h(meetingMinH / 60)} h staff meeting 07:00–07:30 (unpaid) = ${h(paidH)} h` : ''} × R162,50 (R81,25 × 2)`
    }
    else if (kind === 'gardener') { rate = r2(GARDENER_HOURLY * HOLIDAY_FACTOR); rec = r2(totalH * rate); text = `Gardener House work public holiday (${holiday}): ${h(totalH)} h × R125 (R62,50 × 2)` }
    else if (kind === 'student' || kind === 'student_warehouse') {
      // Owner 24 Sep 2026: NO meeting deduction for the student — "his rate is far less than anyone else's".
      rate = r2(STUDENT_HOURLY * HOLIDAY_FACTOR); rec = r2(totalH * rate)
      text = `Student public holiday (${holiday}): ${h(totalH)} h × R100 (R50 × 2) — no meeting deduction`
    }
    else { rate = r2(VENUE_HOURLY * HOLIDAY_FACTOR); rec = r2(totalH * rate); text = `Venue/event public holiday (${holiday}): ${h(totalH)} h × R190 (R95 × 2)` }
    return { amount: 0, hourlyRate: rate, breakdown: `PUBLIC HOLIDAY — HELD for owner approval — recommended ${text} = ${fmtRand(rec)}; R0 until approved`, heldHoliday: holiday, recommendedAmount: rec, heldExtraHours: r2(totalH), baseAmount: 0 }
  }
  if (kind === 'student' || kind === 'student_warehouse') {
    // Owner 24 Sep 2026: Lebo R50/h any place, every clocked hour; Sunday ×1.5 (owner 28 Sep). NO 07:00–07:30 meeting deduction
    // ("because the wages are so little … his rate is far less than anyone else's").
    if (dow === 0) return { amount: r2(totalH * STUDENT_HOURLY * STUDENT_SUNDAY_FACTOR), hourlyRate: r2(STUDENT_HOURLY * STUDENT_SUNDAY_FACTOR), breakdown: `Student Sunday: ${h(totalH)} h × R75 (R50 × 1.5 — owner 28 Sep)` }
    if (kind === 'student') return { amount: r2(totalH * STUDENT_EVENT_HOURLY), hourlyRate: STUDENT_EVENT_HOURLY, breakdown: `Student at a venue/collection/setup: ${h(totalH)} h × R75 (owner 29 Sep — R50 is warehouse only)` }
    return { amount: r2(totalH * STUDENT_HOURLY), hourlyRate: STUDENT_HOURLY, breakdown: `Student warehouse: ${h(totalH)} h × R50 (no meeting deduction)` }
  }
  if (kind === 'gardener') {
    // Owner 24 Sep 2026: gardener House work is hourly R62,50; Sunday ×1.2 = R75/h like everyone else.
    if (dow === 0) return { amount: r2(totalH * GARDENER_HOURLY * SUNDAY_FACTOR), hourlyRate: r2(GARDENER_HOURLY * SUNDAY_FACTOR), breakdown: `Gardener House work Sunday: ${h(totalH)} h × R75 (R62,50 × 1.2)` }
    return { amount: r2(totalH * GARDENER_HOURLY), hourlyRate: GARDENER_HOURLY, breakdown: `Gardener House work: ${h(totalH)} h × R62,50` }
  }
  if (kind === 'musicbus') {
    if (dow === 0) return { amount: r2(totalH * 120), hourlyRate: 120, breakdown: `Music Bus Sunday: ${h(totalH)} h × R120` }
    const amt = (insideMin > 0 ? 750 : 0) + outsideH * 120
    return { amount: r2(amt), hourlyRate: 120, breakdown: `Music Bus: ${insideMin > 0 ? 'R750 fixed 07–16' : 'no 07–16 time'}${outsideH > 0 ? ` + ${h(outsideH)} h outside × R120` : ''}` }
  }
  if (kind === 'petrus') {
    // Owner 2026-09-22 (rate rules v6): SET DAY RATE R640,00 covering 06:00–16:00, Monday–Saturday,
    // paid in full whatever time he arrives inside the day (he only starts at 06:00).
    // Saturday: time before 06:00 / after 16:00 = R80/h, paid automatically.
    // Mon–Fri: time before 06:00 / after 16:00 = R55/h but NOT paid automatically — HELD and
    // flagged; the office approves it (R55/h offered) or sets another rate / R0.
    // SUNDAY: nothing automatic — the whole entry is HELD for the owner's approval (R640 day +
    // R80/h outside 06–16 offered as the recommendation); pays only when approved.
    const pInside = overlapMinutes(sMin, eMin, PETRUS_WINDOW_START, PETRUS_WINDOW_END)
    const pBeforeH = Math.max(0, Math.min(eMin, PETRUS_WINDOW_START) - sMin) / 60
    const pAfterH = Math.max(0, eMin - Math.max(sMin, PETRUS_WINDOW_END)) / 60
    const dayText = pInside > 0 ? 'R640 set day rate (06–16)' : 'no 06–16 time'
    const base = pInside > 0 ? PETRUS_DAY : 0
    const pOutsideH = pBeforeH + pAfterH
    if (dow === 0) {
      const rec = r2(base + pOutsideH * PETRUS_WEEKEND_EXTRA_RATE)
      return { amount: 0, hourlyRate: PETRUS_WEEKEND_EXTRA_RATE, breakdown: `Petrus Sunday: HELD for owner approval — recommended ${dayText}${pOutsideH > 0 ? ` + ${h(pOutsideH)} h outside 06–16 × R80` : ''} = ${fmtRand(rec)}; R0 until approved`, heldSunday: true, recommendedAmount: rec, heldExtraHours: r2(pOutsideH), heldBeforeHours: r2(pBeforeH), heldAfterHours: r2(pAfterH), baseAmount: base }
    }
    if (dow === 6) {
      const amt = base + pOutsideH * PETRUS_WEEKEND_EXTRA_RATE
      return { amount: r2(amt), hourlyRate: PETRUS_WEEKEND_EXTRA_RATE, breakdown: `Petrus Saturday: ${dayText}${pOutsideH > 0 ? ` + ${h(pOutsideH)} h outside 06–16 × R80` : ''}` }
    }
    const heldH = pOutsideH
    const heldParts = [pBeforeH > 0 ? `${h(pBeforeH)} h before 06:00` : '', pAfterH > 0 ? `${h(pAfterH)} h after 16:00` : ''].filter(Boolean).join(' + ')
    return { amount: r2(base), hourlyRate: PETRUS_EXTRA_RATE, breakdown: `Petrus weekday: ${dayText}${heldH > 0 ? ` + ${heldParts} HELD — office to approve and set the rate (R55/h offered)` : ''}`, ...(heldH > 0 ? { heldExtraHours: r2(heldH), heldBeforeHours: r2(pBeforeH), heldAfterHours: r2(pAfterH), baseAmount: r2(base) } : {}) }
  }
  // general staff — owner 2026-09-22 (rate rules v9): hourly by place, to the hour, every day;
  // Sunday ×1.2; Mon–Fri warehouse entries lose the 07:00–07:30 staff meeting (unpaid).
  if (kind === 'warehouse') {
    const rate = dow === 0 ? r2(WAREHOUSE_HOURLY * SUNDAY_FACTOR) : WAREHOUSE_HOURLY
    const meetingMin = dow >= 1 && dow <= 5 ? overlapMinutes(sMin, eMin, MEETING_START, MEETING_END) : 0
    const paidH = totalH - meetingMin / 60
    const meetTxt = meetingMin > 0 ? ` − ${h(meetingMin / 60)} h staff meeting 07:00–07:30 (unpaid, ${fmtRand(r2(meetingMin / 60 * rate))})` : ''
    return { amount: r2(paidH * rate), hourlyRate: rate, breakdown: dow === 0 ? `Warehouse Sunday: ${h(totalH)} h × R97,50 (R81,25 × 1.2)` : `Warehouse: ${h(totalH)} h${meetTxt}${meetingMin > 0 ? ` = ${h(paidH)} h` : ''} × R81,25` }
  }
  if (dow === 0) return { amount: r2(totalH * VENUE_HOURLY * SUNDAY_FACTOR), hourlyRate: r2(VENUE_HOURLY * SUNDAY_FACTOR), breakdown: `Venue/event Sunday: ${h(totalH)} h × R114 (R95 × 1.2)` }
  return { amount: r2(totalH * VENUE_HOURLY), hourlyRate: VENUE_HOURLY, breakdown: `Venue/event: ${h(totalH)} h × R95` }
}

function computeRuleDay(dateIso: string, segments: RuleSegment[]): RuleDayResult {
  // Owner rules 2026-09-15, applied per entry; the fixed day part (R750 / Petrus R650)
  // is granted ONCE per person per day; overlapping minutes are priced once.
  const d = parseProxyIsoDate(dateIso)
  const sunday = !!d && d.getUTCDay() === 0
  const notes: string[] = []
  const parts: string[] = []
  let insideMin = 0, outsideStdMin = 0, outsideMbMin = 0, ownRateAmount = 0, dayPart = 0, overtime = 0
  const covered: Array<[number, number]> = []
  let minS = Infinity, maxE = -Infinity
  const fmtT = (mins: number) => String(Math.floor((((mins % 1440) + 1440) % 1440) / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0')
  const ordered = segments.slice().sort((a, b) => (timeToMinutes(a.start) || 0) - (timeToMinutes(b.start) || 0))
  for (const seg of ordered) {
    const m = ruleSegmentMinutes(seg)
    if (!m) { notes.push('unreadable time ' + seg.start + '–' + seg.end); continue }
    minS = Math.min(minS, m.s); maxE = Math.max(maxE, m.e)
    const pieces = subtractCovered(m.s, m.e, covered)
    if (pieces.reduce((a, [x, y]) => a + (y - x), 0) < (m.e - m.s)) notes.push('overlapping entries counted once')
    covered.push([m.s, m.e])
    for (const [ps, pe] of pieces) {
      // Owner 24 Sep 2026: own-rate (gardener House) hours are ×1.2 on a Sunday like everyone else (R62,50 → R75).
      if (seg.kind === 'ownrate') { ownRateAmount += ((pe - ps) / 60) * seg.rate * (sunday ? SUNDAY_FACTOR : 1); if (sunday && !notes.includes('Sunday ×1.2 on own-rate hours')) notes.push('Sunday ×1.2 on own-rate hours'); continue }
      const kind: OwnerPayKind = seg.kind === 'musicbus' ? 'musicbus' : seg.kind === 'petrus' ? 'petrus' : seg.kind === 'warehouse' ? 'warehouse' : seg.kind === 'student' || seg.kind === 'student_warehouse' ? seg.kind : 'event'
      const priced = ownerPayForShift(dateIso, fmtT(ps), fmtT(pe), kind)
      if (!priced) continue
      const inside = overlapMinutes(ps, pe, RULE_WINDOW_START, RULE_WINDOW_END)
      insideMin += inside
      if (kind === 'musicbus') outsideMbMin += (pe - ps) - inside; else outsideStdMin += (pe - ps) - inside
      const fixed = /R750 fixed/.test(priced.breakdown) ? 750 : /R640 set day rate/.test(priced.breakdown) ? PETRUS_DAY : /R650 fixed/.test(priced.breakdown) ? 650 : 0
      const variable = priced.amount - fixed
      overtime += variable
      if (fixed) {
        if (!dayPart) dayPart = fixed
        else notes.push('second fixed day on the same date counted once')
      }
      parts.push(priced.breakdown)
    }
    if (seg.addAmount) { overtime += seg.addAmount; parts.push(seg.addLabel || ('office-approved extra ' + fmtRand(seg.addAmount))) }
  }
  const amount = Math.round((dayPart + overtime + ownRateAmount) * 100) / 100
  const fmtT2 = (mins: number) => fmtT(mins) + (mins >= 1440 ? ' (next day)' : '')
  const span = isFinite(minS) ? fmtT2(minS) + '–' + fmtT2(maxE) : ''
  if (parts.length) notes.unshift(parts.join(' · '))
  return { amount, insideMin, outsideStdMin, outsideMbMin, ownRateAmount, dayPart, overtime, sunday, span, notes: Array.from(new Set(notes)) }
}

function ruleBreakdownText(r: RuleDayResult) {
  const parts: string[] = []
  if (r.notes.length && !/^(overlapping|unreadable|second fixed)/.test(r.notes[0])) parts.push(r.notes[0])
  if (r.ownRateAmount > 0) parts.push(`own hourly rate = ${fmtRand(r.ownRateAmount)}`)
  return parts.join(' + ') || 'no priced entries'
}

type AdminPaidRow = { id: number, staff_id: number, display_name: string, work_date: string, start_time: string, end_time: string, hours_worked: number, amount: number, work_type: string, outlet_venue: string, area: string, event_name: string, work_description: string, payroll_week_start: string | null, missed_previous_week: number, overnight_confirmed: number, source_draft_id: number | null, manager_update_reason: string | null, hourly_rate_snapshot?: number | null }
type AdminDraftRow = { id: number, staff_id: number, display_name: string, work_date: string, start_time: string, end_time: string, outlet_venue: string, work_type: string, work_description: string, status: string, missed_previous_week: number }
type AdminReviewRow = { id: number, issue_key?: string, status: string, severity: string, staff_id: number, work_date: string, subject_source: string, subject_shift_id: number, compared_source?: string | null, compared_shift_id: number | null, compared_payroll_week_start?: string | null, compared_hours?: number | null, subject_snapshot_json?: string | null, compared_snapshot_json?: string | null, original_hours: number | null, previously_paid_hours: number | null, system_proposed_payable_hours: number | null, approved_payable_hours: number | null, decision_type: string | null, decision_reason: string | null, reviewed_by_name: string | null, issue_summary: string, warning_reason: string, system_snapshot_json: string | null }

// Combined per-person wage sheet (2026-09-14, owner's spec): for the payroll
// week in the page filter, ONE section per worker containing every paid shift
// (in-week AND real-date missed shifts), review flags on the row with the
// recommendation and reason, drafts still awaiting Final Submission, a link into
// that worker's app, and totals that include the missed shifts. Read-only.
async function buildAdminCombinedSheet(env: Bindings | undefined, weekStart: string, employeeFilter: string) {
  const db = env?.DB
  if (!db || !parseProxyIsoDate(weekStart)) return ''
  const weekEnd = proxyEndOfPayrollWeek(weekStart)

  const paidRes = await db.prepare(`SELECT w.id, w.staff_id, s.display_name, w.work_date, w.start_time, w.end_time, w.hours_worked,
        COALESCE(w.gross_wage, w.total_amount, 0) AS amount, w.work_type, w.outlet_venue, w.area, w.event_name, w.work_description,
        w.payroll_week_start, w.missed_previous_week, w.overnight_confirmed, w.source_draft_id, w.manager_update_reason, w.hourly_rate_snapshot
      FROM wage_shifts w JOIN wage_staff s ON s.id = w.staff_id
      WHERE (w.work_date BETWEEN ? AND ? AND (w.payroll_week_start IS NULL OR w.payroll_week_start = ?))
         OR (w.payroll_week_start = ? AND w.work_date < ?)
      ORDER BY s.display_name, w.work_date, w.start_time`).bind(weekStart, weekEnd, weekStart, weekStart, weekStart).all()
  let paid = (paidRes.results || []) as AdminPaidRow[]

  const draftRes = await db.prepare(`SELECT d.id, d.staff_id, s.display_name, d.work_date, d.start_time, d.end_time, d.outlet_venue, d.work_type, d.work_description, d.status, d.missed_previous_week
      FROM wage_shift_drafts d JOIN wage_staff s ON s.id = d.staff_id
      WHERE d.status = 'draft' AND d.final_shift_id IS NULL AND ((d.work_date BETWEEN ? AND ?) OR d.payroll_week_start = ? OR (d.missed_previous_week = 1 AND d.work_date >= date(?, '-7 days') AND d.work_date < ?)
        OR (? = 1 AND d.work_date < date(?, '-7 days')))
      ORDER BY s.display_name, d.work_date, d.start_time`).bind(weekStart, weekEnd, weekStart, weekStart, weekStart, weekStart === currentProxyPayrollWeekStart() ? 1 : 0, weekStart).all()
  let drafts = (draftRes.results || []) as AdminDraftRow[]
  // Owner 2026-09-22: a draft older than the capture window (before last Saturday) can never be
  // final-submitted — it must not linger. Shown red with a Delete button (current week view only).
  const captureStart = formatProxyIsoDate(new Date(parseProxyIsoDate(weekStart)!.getTime() - 7 * 86400000))
  // Owner 2026-09-23: on certain days (e.g. a public holiday with no set-ups) the crew is only expected until a set
  // time. Any entry claiming beyond it is flagged red so the office asks "what time did they really work until?".
  type PlannedEnd = { work_date: string, planned_end: string, note: string }
  let plannedEnds: Record<string, PlannedEnd> = {}
  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS wage_planned_hours (work_date TEXT PRIMARY KEY, planned_end TEXT NOT NULL, note TEXT, set_by TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`).run()
    const pe = await db.prepare(`SELECT work_date, planned_end, note FROM wage_planned_hours WHERE work_date BETWEEN date(?, '-7 days') AND ?`).bind(weekStart, weekEnd).all()
    for (const r of (pe.results || []) as PlannedEnd[]) plannedEnds[r.work_date] = r
  } catch (err) {}
  // Owner day rules for the week (owner 27 Sep 2026): forced place and staff off, by date.
  const dayRules: Record<string, OwnerDayRule> = {}
  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS wage_owner_day_rules (work_date TEXT PRIMARY KEY, force_kind TEXT, staff_off_json TEXT, note TEXT, set_by TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`).run()
    try { await db.prepare(`ALTER TABLE wage_owner_day_rules ADD COLUMN staff_start_json TEXT`).run() } catch (err) {}
    try { await db.prepare(`ALTER TABLE wage_owner_day_rules ADD COLUMN staff_end_json TEXT`).run() } catch (err) {}
    try { await db.prepare(`ALTER TABLE wage_owner_day_rules ADD COLUMN staff_windows_json TEXT`).run() } catch (err) {}
    const dr = await db.prepare(`SELECT work_date, force_kind, staff_off_json, staff_start_json, staff_end_json, staff_windows_json, note FROM wage_owner_day_rules WHERE work_date BETWEEN date(?, '-7 days') AND ?`).bind(weekStart, weekEnd).all()
    for (const r of (dr.results || []) as any[]) { let off: number[] = []; try { off = JSON.parse(r.staff_off_json || '[]').map(Number) } catch (err) {} let st: Record<number, string> = {}; try { st = JSON.parse(r.staff_start_json || '{}') } catch (err) {} let en: Record<number, string> = {}; try { en = JSON.parse(r.staff_end_json || '{}') } catch (err) {} dayRules[String(r.work_date)] = { work_date: String(r.work_date), force_kind: r.force_kind || null, staff_off: off, staff_start: st, staff_end: en, staff_windows: parseOwnerWindows(r.staff_windows_json), note: String(r.note || '') } }
  } catch (err) {}
  const offNameById: Record<number, string> = {}
  try { const ids = Array.from(new Set(Object.values(dayRules).flatMap((d) => [...d.staff_off, ...Object.keys(d.staff_start || {}).map(Number), ...Object.keys(d.staff_end || {}).map(Number), ...Object.keys(d.staff_windows || {}).map(Number)]))); if (ids.length) { const nr = await db.prepare(`SELECT id, display_name FROM wage_staff WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all(); for (const r of (nr.results || []) as any[]) offNameById[Number(r.id)] = String(r.display_name) } } catch (err) {}
  const applyDayRuleKind = (dateIso: string, kind: OwnerPayKind): OwnerPayKind => {
    const d = dayRules[dateIso]; if (!d?.force_kind) return kind
    if (d.force_kind === 'event' && (kind === 'warehouse' || kind === 'warehouse_or_event')) return 'event'
    if (d.force_kind === 'warehouse' && (kind === 'event' || kind === 'warehouse_or_event')) return 'warehouse'
    return kind
  }
  // Owner-amount lines (e.g. Thina R650 Heritage Day allowance, 28 Sep): no hours, 00:00–00:00 — no time checks.
  const isOwnerAmountLine = (r: { start_time: string, end_time: string, hours_worked?: number }) => Number(r.hours_worked || 0) === 0 && r.start_time === r.end_time
  // Owner 28 Sep 2026: "The owner was talking about the warehouse staff specifically, and venue staff — not music busses."
  // The day's finish time never applies to Music Bus entries (own route, own hours) or to Petrus (fixed day).
  const planEndApplies = (r: { staff_id?: number, work_type?: string, outlet_venue?: string }) => !/music\s*bus/i.test((r.work_type || '') + ' ' + (r.outlet_venue || '')) && Number(r.staff_id || 0) !== PETRUS_STAFF_ID
  const beyondPlanned = (r: { work_date: string, start_time: string, end_time: string, hours_worked?: number, staff_id?: number, work_type?: string, outlet_venue?: string }) => {
    if (isOwnerAmountLine(r) || !planEndApplies(r)) return null
    // A per-person window the owner set for this day (e.g. Sonop team 06:00–14:00) overrides the general finish time.
    if (r.staff_id && ownerWindowsFor(dayRules[r.work_date], r.staff_id).length) return null
    const p = plannedEnds[r.work_date]; if (!p) return null
    const e = timeToMinutes(r.end_time), pe = timeToMinutes(p.planned_end), st = timeToMinutes(r.start_time)
    if (e === null || pe === null || st === null) return null
    const end = e <= st ? e + 1440 : e
    return end > pe ? { ...p, overMin: end - pe } : null
  }
  const isStaleDraft = (d: AdminDraftRow) => d.work_date < captureStart
  // Owner 27 Sep: "I asked you to show notes for me for Sundays … the warehouse doesn't show the message." Every
  // owner note for the day — end time, forced place, staff off, per-person window — is shown ON THE ROW, for paid
  // rows AND drafts, with the clash against what the worker entered spelled out.
  const ownerNotesForRow = (r: { staff_id: number, work_date: string, start_time: string, end_time: string, work_type: string, outlet_venue?: string, hours_worked?: number }, isDraft: boolean) => {
    const out: string[] = []
    if (isOwnerAmountLine(r)) return ''
    const d = dayRules[r.work_date]; const pe = plannedEnds[r.work_date]
    const sM = timeToMinutes(r.start_time), eM = timeToMinutes(r.end_time)
    const box = (bg: string, fg: string, text: string) => `<div style="margin-top:3px;padding:4px 7px;border-radius:6px;background:${bg};color:${fg};font-size:11.5px;line-height:1.35">${text}</div>`
    if (d?.force_kind === 'event' && /warehouse/i.test((r.work_type || '') + ' ' + (r.outlet_venue || ''))) {
      if (r.staff_id === STUDENT_STAFF_ID) out.push(box('rgba(202,138,4,.22)', '#fde68a', `📌 <strong>OWNER NOTE ${escapeHtmlText(proxyLongDate(r.work_date))}:</strong> everyone at the venue rate today — <strong>except Lebo</strong>, who stays on his student rate (warehouse R50/h, venue R75/h, Sunday R75/h).`))
      else out.push(box('rgba(202,138,4,.22)', '#fde68a', `📌 <strong>OWNER NOTE ${escapeHtmlText(proxyLongDate(r.work_date))}:</strong> everyone at the <strong>VENUE rate</strong> today — this Warehouse entry ${isDraft ? 'will be' : 'is'} priced as venue (Sunday R114/h).`))
    }
    if (d?.staff_off?.includes(r.staff_id)) out.push(box('rgba(127,29,29,.35)', '#fecaca', `⛔ <strong>OWNER NOTE:</strong> this worker was marked <strong>OFF</strong> on ${escapeHtmlText(proxyLongDate(r.work_date))} — not allowed to claim. ${isDraft ? 'If he final-submits it is held at R0 for your decision.' : 'Held at R0 — see the red review.'}`))
    const wins = ownerWindowsFor(d, r.staff_id)
    const st = wins.length ? wins.map((w) => w.start).sort()[0] : '', en = wins.length ? wins.map((w) => w.end).sort().slice(-1)[0] : ''
    if (wins.length) {
      const winTxt = wins.map((w) => `<strong>${escapeHtmlText(w.start)}–${escapeHtmlText(w.end)}</strong>${w.place ? ' ' + escapeHtmlText(w.place) : ''}`).join(' and ')
      const ov = ownerWindowOverlap(r.start_time, r.end_time, wins)
      const dur = sM !== null && eM !== null ? (eM <= sM ? eM + 1440 : eM) - sM : 0
      if (ov.minutes <= 0) out.push(box('rgba(127,29,29,.5)', '#fee2e2', `🚫 <strong>OWNER NOTE — ENTIRELY OUTSIDE YOUR TIMES:</strong> you recorded him ${winTxt} on ${escapeHtmlText(proxyLongDate(r.work_date))}. This entry (${escapeHtmlText(r.start_time)}–${escapeHtmlText(r.end_time)}${r.work_type ? ', ' + escapeHtmlText(r.work_type) : ''}) falls <strong>completely outside</strong> those times — nothing of it is payable under your note. ${isDraft ? 'If he final-submits it is held at R0 with a red review for your decision.' : 'Check the red review.'}`))
      else if (ov.minutes < dur - 0.5) { const best = ov.pieces[0]; out.push(box('rgba(127,29,29,.35)', '#fecaca', `🕧 <strong>OWNER NOTE:</strong> you recorded him ${winTxt} on ${escapeHtmlText(proxyLongDate(r.work_date))}. He entered ${escapeHtmlText(r.start_time)}–${escapeHtmlText(r.end_time)} — <strong>${(( dur - ov.minutes) / 60).toFixed(2)} h of it is outside your times</strong>; only ${escapeHtmlText(best.start)}–${escapeHtmlText(best.end)} is payable. ${isDraft ? 'When he final-submits it is paid inside your times only, with a red review to override.' : 'Paid inside your times only — red review to override.'}`)) }
      else out.push(box('rgba(22,163,74,.2)', '#bbf7d0', `🕧 <strong>OWNER NOTE:</strong> you recorded him ${winTxt} on ${escapeHtmlText(proxyLongDate(r.work_date))}. He entered ${escapeHtmlText(r.start_time)}–${escapeHtmlText(r.end_time)} — inside your times ✔`))
    }
    // A per-person window (e.g. Taka garden 12:30–14:14) overrides the general finish time (e.g. warehouse 11:40).
    if (pe && !st && !en && eM !== null && timeToMinutes(pe.planned_end) !== null && planEndApplies(r)) {
      const over = eM > timeToMinutes(pe.planned_end)!
      out.push(box(over ? 'rgba(127,29,29,.35)' : 'rgba(22,163,74,.2)', over ? '#fecaca' : '#bbf7d0', `⏰ <strong>OWNER NOTE:</strong> work ended <strong>${escapeHtmlText(pe.planned_end)}</strong> on ${escapeHtmlText(proxyLongDate(r.work_date))}${pe.note ? ' (' + escapeHtmlText(pe.note) + ')' : ''}. He entered until ${escapeHtmlText(r.end_time)}${over ? ` — <strong>${((eM - timeToMinutes(pe.planned_end)!) / 60).toFixed(2)} h past your time</strong>. Ask what time he really finished.` : ' — within your time ✔'}`))
    }
    return out.join('')
  }

  if (employeeFilter && /^\d+$/.test(employeeFilter)) {
    const sid = Number(employeeFilter)
    paid = paid.filter((r) => r.staff_id === sid)
    drafts = drafts.filter((r) => r.staff_id === sid)
  }
  if (!paid.length && !drafts.length) return ''

  const staffIds = Array.from(new Set([...paid.map((r) => r.staff_id), ...drafts.map((r) => r.staff_id)]))
  const ph = staffIds.map(() => '?').join(',')
  // Owner 2026-09-22: a review that compares a draft with the PAID ROW THAT DRAFT BECAME is the entry
  // compared with itself (engine artefact after Final Submission) — void it, nothing was billed twice.
  try {
    await db.prepare(`UPDATE wage_payroll_reviews SET status = 'VOID', void_reason = 'Auto: the "other overlapping entry" is this entry itself — the draft became this paid row on Final Submission. Nothing was billed twice.', voided_by_name = 'system self-compare check', voided_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE status = 'OPEN' AND subject_source = 'draft' AND compared_source = 'shift' AND staff_id IN (${ph})
          AND EXISTS (SELECT 1 FROM wage_shift_drafts d WHERE d.id = wage_payroll_reviews.subject_shift_id AND d.final_shift_id = wage_payroll_reviews.compared_shift_id)`).bind(...staffIds).run()
  } catch (err) {}
  // Owner 2026-09-22: a review on a draft the worker has since deleted can never be decided — void it.
  try {
    await db.prepare(`UPDATE wage_payroll_reviews SET status = 'VOID', void_reason = 'Auto: the draft this review was about no longer exists (deleted by the worker or the office). Nothing to decide.', voided_by_name = 'system ghost-draft check', voided_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE status = 'OPEN' AND subject_source = 'draft' AND staff_id IN (${ph})
          AND NOT EXISTS (SELECT 1 FROM wage_shift_drafts d WHERE d.id = wage_payroll_reviews.subject_shift_id)`).bind(...staffIds).run()
  } catch (err) {}
  const revRes = await db.prepare(`SELECT id, issue_key, status, severity, staff_id, work_date, subject_source, subject_shift_id, compared_source, compared_shift_id, compared_payroll_week_start, original_hours, compared_hours, previously_paid_hours,
        system_proposed_payable_hours, approved_payable_hours, approved_start_time, approved_end_time, decision_type, decision_reason, reviewed_by_name, issue_summary, warning_reason, system_snapshot_json, subject_snapshot_json, compared_snapshot_json
      FROM wage_payroll_reviews WHERE staff_id IN (${ph}) AND status <> 'VOID' AND (work_date BETWEEN date(?, '-7 days') AND ?)`).bind(...staffIds, weekStart, weekEnd).all()
  const reviewsAll = (revRes.results || []) as AdminReviewRow[]
  // Live facts for the compared paid rows (amount / payroll they were paid in), so the overlap breakdown is current.
  type CmpRow = { id: number, work_date: string, start_time: string, end_time: string, hours_worked: number, amount: number, work_type: string, outlet_venue: string, area: string, work_description: string, payroll_week_start: string | null, source_draft_id: number | null }
  const cmpShiftIds = Array.from(new Set(reviewsAll.filter((v) => v.compared_shift_id && (v.compared_source || 'shift') === 'shift').map((v) => Number(v.compared_shift_id))))
  // Subject drafts are included too, so a draft that has since been final-submitted shows as its paid row.
  const cmpDraftIds = Array.from(new Set(reviewsAll.filter((v) => v.compared_shift_id && v.compared_source === 'draft').map((v) => Number(v.compared_shift_id)).concat(reviewsAll.filter((v) => v.subject_source === 'draft' && v.subject_shift_id).map((v) => Number(v.subject_shift_id)))))
  const cmpRows: Record<number, CmpRow> = {}          // by paid shift id
  const cmpRowsByDraft: Record<number, CmpRow> = {}   // by the draft id that became the paid row
  const sel = `SELECT id, work_date, start_time, end_time, hours_worked, COALESCE(gross_wage, total_amount, 0) amount, work_type, outlet_venue, area, work_description, payroll_week_start, source_draft_id FROM wage_shifts`
  for (let i = 0; i < cmpShiftIds.length; i += 50) {
    const chunk = cmpShiftIds.slice(i, i + 50)
    try { const cr = await db.prepare(`${sel} WHERE id IN (${chunk.map(() => '?').join(',')})`).bind(...chunk).all(); for (const r of (cr.results || []) as any[]) cmpRows[Number(r.id)] = r } catch (err) {}
  }
  for (let i = 0; i < cmpDraftIds.length; i += 50) {
    const chunk = cmpDraftIds.slice(i, i + 50)
    try { const cr = await db.prepare(`${sel} WHERE source_draft_id IN (${chunk.map(() => '?').join(',')})`).bind(...chunk).all(); for (const r of (cr.results || []) as any[]) cmpRowsByDraft[Number(r.source_draft_id)] = r } catch (err) {}
  }
  const weekOfDate = (iso: string) => { const d = parseProxyIsoDate(iso); return d ? formatProxyIsoDate(proxyStartOfPayrollWeek(d)) : null }
  const hoursBetween = (st: string, en: string) => { const a = timeToMinutes(st), b0 = timeToMinutes(en); if (a === null || b0 === null) return 0; const b = b0 <= a ? b0 + 1440 : b0; return (b - a) / 60 }
  const paidIds = new Set(paid.map((r) => r.id)), paidDraftIds = new Set(paid.map((r) => r.source_draft_id).filter(Boolean) as number[]), draftIds = new Set(drafts.map((d) => d.id))
  const reviews = reviewsAll.filter((v) => (v.subject_source === 'shift' && paidIds.has(v.subject_shift_id)) || (v.subject_source === 'draft' && (paidDraftIds.has(v.subject_shift_id) || draftIds.has(v.subject_shift_id))))


  // Cross-check source: everything paid to these workers on the missed real dates in EARLIER payrolls.
  const missedDates = Array.from(new Set(paid.filter((r) => r.work_date < weekStart).map((r) => r.work_date)))
  let prior: Array<{ id: number, staff_id: number, work_date: string, start_time: string, end_time: string, outlet_venue: string, payroll_week_start: string | null, work_type: string, hours_worked: number, amount: number }> = []
  if (missedDates.length) {
    const priorRes = await db.prepare(`SELECT id, staff_id, work_date, start_time, end_time, outlet_venue, payroll_week_start, work_type, hours_worked, COALESCE(gross_wage, total_amount, 0) AS amount FROM wage_shifts
        WHERE staff_id IN (${ph}) AND work_date IN (${missedDates.map(() => '?').join(',')}) AND (payroll_week_start IS NULL OR payroll_week_start < ?)`).bind(...staffIds, ...missedDates, weekStart).all()
    prior = (priorRes.results || []) as typeof prior
  }

  // Pay-rule check inputs: each worker's own hourly rates per work type + base rate/rule.
  const staffRes = await db.prepare(`SELECT id, hourly_rate, payroll_rule FROM wage_staff WHERE id IN (${ph})`).bind(...staffIds).all()
  const staffBase: Record<number, { hourly_rate: number, payroll_rule: string }> = {}
  for (const s of (staffRes.results || []) as Array<{ id: number, hourly_rate: number, payroll_rule: string }>) staffBase[s.id] = { hourly_rate: Number(s.hourly_rate || 0), payroll_rule: String(s.payroll_rule || '') }
  const ratesRes = await db.prepare(`SELECT staff_id, work_type, hourly_rate FROM wage_work_rates WHERE active = 1 AND staff_id IN (${ph})`).bind(...staffIds).all()
  const workRates: Record<string, number> = {}
  for (const r of (ratesRes.results || []) as Array<{ staff_id: number, work_type: string, hourly_rate: number }>) workRates[r.staff_id + '|' + r.work_type] = Number(r.hourly_rate || 0)
  // Owner 2026-09-23: the WAREHOUSE / VENUE buttons must show the DIFFERENCE when part of the day was already
  // paid in an earlier payroll ("only suggest paying the difference"). Load the earlier-payroll rows for the
  // days of every place-choice review, keyed by staff|date.
  const placeRevs = reviewsAll.filter((v) => /^(rate_choice_|crew_pattern\|)/.test(v.issue_key || '') && v.status === 'OPEN')
  const earlierPaidByDay: Record<string, PaidBeforeRow[]> = {}
  if (placeRevs.length) {
    const days = Array.from(new Set(placeRevs.map((v) => v.work_date)))
    for (let i = 0; i < days.length; i += 40) {
      const chunk = days.slice(i, i + 40)
      try {
        const er = await db.prepare(`SELECT w.id, w.staff_id, w.work_date, w.start_time, w.end_time, w.hours_worked, COALESCE(w.gross_wage, w.total_amount, 0) amount, COALESCE(w.hourly_rate_snapshot, 0) rate_paid, w.work_type, w.outlet_venue, w.area, w.work_description, w.payroll_week_start, w.source_draft_id, s.display_name, s.payroll_rule, s.hourly_rate
            FROM wage_shifts w JOIN wage_staff s ON s.id = w.staff_id
            WHERE w.staff_id IN (${ph}) AND w.work_date IN (${chunk.map(() => '?').join(',')}) AND w.work_date < ? AND (w.payroll_week_start IS NULL OR w.payroll_week_start < ?)`).bind(...staffIds, ...chunk, weekStart, weekStart).all()
        // "Earlier" = paid in a payroll BEFORE this one: the real date is before this week and the row was not
        // carried into this payroll as a missed shift.
        for (const r of (er.results || []) as any[]) { const k = r.staff_id + '|' + r.work_date; (earlierPaidByDay[k] ||= []).push(rowToPaid(r, String(r.display_name || ''), String(r.payroll_rule || ''), Number(workRates[r.staff_id + '|' + r.work_type] ?? r.hourly_rate ?? 0))) }
      } catch (err) {}
    }
  }
  const paidBeforeDeps = { db, weekStart, weekEnd, ownerPayKind, ownerPayForShift }

  // Bernie's recorded Warehouse / Event/Venue choices (review key rate_choice_warehouse_or_event|shift:ID).
  const rateChoiceByShift: Record<number, OwnerPayKind> = {}
  for (const v of reviewsAll) {
    const m = /^(?:rate_choice_warehouse_or_event|crew_pattern)\|shift:(\d+)$/.exec(v.issue_key || '')
    if (m && v.status === 'RESOLVED') rateChoiceByShift[Number(m[1])] = /^warehouse/i.test((v.decision_reason || '').trim()) ? 'warehouse' : /^garden/i.test((v.decision_reason || '').trim()) ? 'gardener' : 'event'
  }
  // Office decisions on Petrus weekday extra time (review key petrus_extra|shift:ID).
  const petrusExtraByShift: Record<number, { amount: number, label: string }> = {}
  for (const v of reviewsAll) {
    const m = /^(?:petrus_extra|public_holiday|staff_off|owner_start)\|shift:(\d+)$/.exec(v.issue_key || '')
    if (!m || v.status !== 'RESOLVED') continue
    try { const sn = JSON.parse(v.system_snapshot_json || '{}'); if (sn.approvedExtraAmount !== undefined) petrusExtraByShift[Number(m[1])] = { amount: Number(sn.approvedExtraAmount), label: sn.petrusSunday ? `${sn.publicHoliday ? 'Public holiday (' + sn.publicHoliday + ')' : 'Sunday'} ${Number(sn.approvedExtraAmount) > 0 ? 'approved ' + fmtRand(Number(sn.approvedExtraAmount)) : 'declined — R0'} by ${sn.decidedBy || 'office'} (#${v.id})` : `office approved ${Number(sn.extraHours || 0).toFixed(2)} h outside 06–16 × ${fmtRand(Number(sn.approvedRate || 0))} = ${fmtRand(Number(sn.approvedExtraAmount))} (#${v.id})` } } catch (err) {}
  }
  const ruleSegmentFor = (staffId: number, workType: string, start: string, end: string, wording = '', shiftId = 0, dateIso = ''): RuleSegment => {
    const wt = workType || ''
    let kind = ownerPayKind(staffId, wt, wording, staffBase[staffId]?.payroll_rule || 'hourly')
    if (dateIso) kind = applyDayRuleKind(dateIso, kind)
    if ((kind === 'warehouse_or_event' || kind === 'gardener' || kind === 'event' || kind === 'warehouse') && shiftId && rateChoiceByShift[shiftId]) kind = rateChoiceByShift[shiftId]
    if (kind === 'gardener') return { start, end, rate: workRates[staffId + '|' + wt] ?? GARDENER_HOURLY, kind: 'ownrate', label: wt }
    if (kind === 'student_warehouse') return { start, end, rate: STUDENT_HOURLY, kind, label: wt + ' (student warehouse R50/h)' }
    if (kind === 'student') return { start, end, rate: STUDENT_EVENT_HOURLY, kind, label: wt + ' (student venue R75/h)' }
    if (kind === 'musicbus') return { start, end, rate: 120, kind: 'musicbus', label: wt, ...(shiftId && petrusExtraByShift[shiftId] ? { addAmount: petrusExtraByShift[shiftId].amount, addLabel: petrusExtraByShift[shiftId].label } : {}) }
    if (kind === 'petrus') return { start, end, rate: PETRUS_EXTRA_RATE, kind: 'petrus', label: wt, ...(shiftId && petrusExtraByShift[shiftId] ? { addAmount: petrusExtraByShift[shiftId].amount, addLabel: petrusExtraByShift[shiftId].label } : {}) }
    const add = shiftId && petrusExtraByShift[shiftId] ? { addAmount: petrusExtraByShift[shiftId].amount, addLabel: petrusExtraByShift[shiftId].label } : {}
    if (kind === 'warehouse') return { start, end, rate: WAREHOUSE_HOURLY, kind: 'warehouse', label: wt, ...add }
    if (kind === 'warehouse_or_event') return { start, end, rate: VENUE_HOURLY, kind: 'event', label: (wt || 'Normal') + ' – rate choice pending (Warehouse or Venue/Event)', ...add }
    return { start, end, rate: VENUE_HOURLY, kind: 'event', label: wt, ...add }
  }
  const ruleApplies = (staffId: number) => (staffBase[staffId]?.payroll_rule || 'hourly') !== 'fixed_weekly'

  const reviewsForPaid = (r: AdminPaidRow) => reviews.filter((v) => (v.subject_source === 'shift' && v.subject_shift_id === r.id) || (v.subject_source === 'draft' && r.source_draft_id && v.subject_shift_id === r.source_draft_id))
  const reviewsForDraft = (d: AdminDraftRow) => reviews.filter((v) => v.subject_source === 'draft' && v.subject_shift_id === d.id)
  const dayName = (iso: string) => { const d = parseProxyIsoDate(iso); return d ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getUTCDay()] : '' }
  const pill = (text: string, bg: string, fg: string) => `<span style="display:inline-block;padding:3px 8px;border-radius:999px;background:${bg};color:${fg};font-weight:700;font-size:11.5px;line-height:1.3;margin:2px 4px 2px 0">${text}</span>`

  function decisionForm(v: AdminReviewRow, snap: any) {
    if (v.status !== 'OPEN') return ''
    if (snap?.petrusSunday) {
      const rec = Number(snap.recommendedAmount || 0), hrs = Number(snap.extraHours || 0)
      return `<form method="post" action="/wages-admin/petrus-extra" class="bw-review-decide" style="margin-top:6px;padding:8px;border-radius:8px;background:rgba(255,255,255,.05);font-size:12px">
      <input type="hidden" name="review_id" value="${v.id}">
      <input type="hidden" name="return_to" value="__RETURN__">
      <div style="margin-bottom:6px"><strong>${snap.ownerStart ? `🕧 You recorded ${escapeHtmlText(String(snap.employee || 'this worker'))} as there ${escapeHtmlText(String(snap.ownerStartTime || ''))}–${escapeHtmlText(String(snap.ownerEndTime || ''))} on this day. He entered ${escapeHtmlText(String(snap.startTime || ''))}–${escapeHtmlText(String(snap.endTime || ''))}, so he is paid ${escapeHtmlText(String(snap.ownerStartTime || ''))}–${escapeHtmlText(String(snap.ownerEndTime || ''))} (${fmtRand(Number(snap.baseAmount || 0))}). If his times are right after all, the difference is ${fmtRand(rec)}. Leave it, or override if something changed.` : snap.staffOff ? `⛔ You marked ${escapeHtmlText(String(snap.employee || 'this worker'))} OFF on this day — he was not allowed to claim, but he has entered a shift. Nothing is paid until you decide. If he did work: ${escapeHtmlText(snap.recommendedText || '')} = ${fmtRand(rec)}.` : snap.publicHoliday ? (Number(v.staff_id) === PETRUS_STAFF_ID ? `Public holiday — ${escapeHtmlText(snap.publicHoliday)}. Petrus: was he actually there? Nothing is paid until you decide. <strong>Approve public holiday rates</strong> = ${escapeHtmlText(snap.recommendedText || '')} = ${fmtRand(rec)}, or <strong>Approve fixed rate</strong> = his ordinary R640 day.` : `Public holiday — ${escapeHtmlText(snap.publicHoliday)}. Nothing is paid until you decide. Recommended: ${escapeHtmlText(snap.recommendedText || '')} = ${fmtRand(rec)}.`) : `Petrus worked on a Sunday — nothing is paid until you decide. Recommended: ${Number(snap.baseAmount || 0) > 0 ? 'R640 set day rate' : 'no 06–16 time'}${hrs > 0 ? ' + ' + hrs.toFixed(2) + ' h outside 06–16 × R80' : ''} = ${fmtRand(rec)}.`}</strong></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        <button type="submit" name="choice" value="offered" style="padding:5px 10px;border-radius:6px;border:0;background:#e2b93b;color:#111;font-weight:800;cursor:pointer">${snap.ownerStart ? 'OVERRIDE — he was there, add' : snap.staffOff ? 'He did work — approve' : snap.publicHoliday ? (Number(v.staff_id) === PETRUS_STAFF_ID ? 'Approve public holiday rates' : 'Approve public holiday') : 'Approve Sunday'} — ${fmtRand(rec)}</button>
        ${snap.publicHoliday && Number(v.staff_id) === PETRUS_STAFF_ID ? `<button type="submit" name="choice" value="fixed_day" style="padding:5px 10px;border-radius:6px;border:1px solid #e2b93b;background:transparent;color:#e2b93b;font-weight:800;cursor:pointer">Approve fixed rate — ${fmtRand(PETRUS_DAY)}</button>` : ''}
        <span style="display:inline-flex;align-items:center;gap:4px">Other amount: R<input type="number" name="custom_amount" step="0.01" min="0" style="width:90px;padding:3px 5px;border-radius:5px;border:1px solid rgba(255,255,255,.3);background:#111;color:#fff"> <button type="submit" name="choice" value="custom_amount" style="padding:5px 10px;border-radius:6px;border:1px solid #e2b93b;background:transparent;color:#e2b93b;font-weight:700;cursor:pointer">Approve this amount</button></span>
        <button type="submit" name="choice" value="zero" style="padding:5px 10px;border-radius:6px;border:1px solid rgba(255,255,255,.35);background:transparent;color:#fff;font-weight:700;cursor:pointer">${snap.ownerStart ? 'Keep ' + escapeHtmlText(String(snap.ownerStartTime || '')) + '–' + escapeHtmlText(String(snap.ownerEndTime || '')) + ' — nothing more' : snap.staffOff ? 'He was OFF — decline, R0' : 'Decline — R0'}</button>
      </div>
    </form>`
    }
    if (snap?.petrusExtra) {
      const hrs = Number(snap.extraHours || 0), offered = Number(snap.offeredRate || PETRUS_EXTRA_RATE)
      const parts = [Number(snap.beforeHours || 0) > 0 ? Number(snap.beforeHours).toFixed(2) + ' h before 06:00' : '', Number(snap.afterHours || 0) > 0 ? Number(snap.afterHours).toFixed(2) + ' h after 16:00' : ''].filter(Boolean).join(' and ')
      return `<form method="post" action="/wages-admin/petrus-extra" class="bw-review-decide" style="margin-top:6px;padding:8px;border-radius:8px;background:rgba(255,255,255,.05);font-size:12px">
      <input type="hidden" name="review_id" value="${v.id}">
      <input type="hidden" name="return_to" value="__RETURN__">
      <div style="margin-bottom:6px"><strong>Petrus: ${hrs.toFixed(2)} h outside 06:00–16:00 (${parts}) is held. The fixed day ${fmtRand(Number(snap.baseAmount || 0))} is paid. Office to approve and set the rate:</strong></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        <button type="submit" name="choice" value="offered" style="padding:5px 10px;border-radius:6px;border:0;background:#e2b93b;color:#111;font-weight:800;cursor:pointer">Approve at R${offered}/h — ${fmtRand(hrs * offered)}</button>
        <span style="display:inline-flex;align-items:center;gap:4px">Other rate: R<input type="number" name="custom_rate" step="0.01" min="0" style="width:70px;padding:3px 5px;border-radius:5px;border:1px solid rgba(255,255,255,.3);background:#111;color:#fff">/h <button type="submit" name="choice" value="custom" style="padding:5px 10px;border-radius:6px;border:1px solid #e2b93b;background:transparent;color:#e2b93b;font-weight:700;cursor:pointer">Approve at this rate</button></span>
        <button type="submit" name="choice" value="zero" style="padding:5px 10px;border-radius:6px;border:1px solid rgba(255,255,255,.35);background:transparent;color:#fff;font-weight:700;cursor:pointer">Not payable — R0</button>
      </div>
      <div style="margin-top:4px;opacity:.7">Only the ${hrs.toFixed(2)} h outside 06–16 is priced here; the R640 set day rate is not changed.</div>
    </form>`
    }
    if (snap?.rateChoice) {
      // Owner 2026-09-22: the office must be able to say WHICH PLACE — two unambiguous buttons, each with the
      // rate and the rand it produces. Works on paid rows (re-prices now) and drafts (applied on Final Submission).
      const isDraft = v.subject_source === 'draft'
      let sub: any = null; try { sub = v.subject_snapshot_json ? JSON.parse(v.subject_snapshot_json) : null } catch (err) {}
      const wd = sub?.workDate || v.work_date, st = sub?.startTime || '', en = sub?.endTime || ''
      const pw = st && en ? ownerPayForShift(wd, st, en, 'warehouse') : null
      const pv = st && en ? ownerPayForShift(wd, st, en, 'event') : null
      const workerSaid = sub?.workType ? `Worker selected “${escapeHtmlText(sub.workType)}”${sub.venue ? ` at “${escapeHtmlText(sub.venue)}”` : ''}.` : ''
      // Owner 2026-09-23: if part of this day was ALREADY PAID in an earlier payroll, each button shows the
      // DIFFERENCE (rate correction on the paid hours + the extra hours), with the working out — never the full day.
      const subjLiveId = isDraft ? (cmpRowsByDraft[Number(v.subject_shift_id)]?.id ?? null) : Number(v.subject_shift_id)
      const earlier = (earlierPaidByDay[v.staff_id + '|' + wd] || []).filter((p) => p.id !== subjLiveId && shiftsOverlap(st, en, p.start, p.end))
      let diffW: ReturnType<typeof priceAgainstPaid> = null, diffV: ReturnType<typeof priceAgainstPaid> = null
      if (earlier.length && st && en) {
        const subjRow = { id: v.subject_shift_id, staff_id: v.staff_id, work_date: wd, start_time: st, end_time: en, hours_worked: sub?.hours ?? null, amount: 0, work_type: sub?.workType || '', outlet_venue: sub?.venue || '', area: sub?.area || '', work_description: sub?.workDescription || '', payroll_week_start: weekStart, source_draft_id: null }
        const subj = rowToEntry(subjRow, isDraft ? 'draft' : 'shift', sub?.employee || '', staffBase[v.staff_id]?.payroll_rule || 'hourly', staffBase[v.staff_id]?.hourly_rate || 0)
        diffW = priceAgainstPaid(paidBeforeDeps, subj, earlier, 'warehouse'); diffV = priceAgainstPaid(paidBeforeDeps, subj, earlier, 'event')
      }
      const R2 = (n: number) => Math.round(n * 100) / 100
      const claimH = sub?.hours ? Number(sub.hours) : hoursBetween(st, en)
      // Owner 2026-09-23 — when part of the day was ALREADY PAID in an earlier payroll, the office sees ONE sum,
      // in the owner's words: "Paid last week … · 06:00–18:00 at a venue … · less the Garden · what I should pay",
      // and ONE approve button. Venue is the default when the Area names a venue (crew check said so);
      // a small link offers Warehouse instead.
      if (earlier.length && (diffW || diffV)) {
        const areaSaysVenue = snap?.crewKind === 'warehouse_with_area' || snap?.place === 'ambiguous_area'
        const primaryKind: 'event' | 'warehouse' = areaSaysVenue || !diffW ? 'event' : (snap?.majorityPlace === 'warehouse' ? 'warehouse' : 'event')
        const sumFor = (kind: 'event' | 'warehouse') => {
          const f = kind === 'event' ? diffV! : diffW!
          const placeWord = kind === 'event' ? 'at a venue' : 'in the warehouse'
          const rate = kind === 'event' ? VENUE_HOURLY : WAREHOUSE_HOURLY
          const paidLines = earlier.map((p) => `<tr><td style="padding:2px 8px 2px 0;color:#000">Paid last week &nbsp;<span style="font-weight:600;color:#1f1f1f">${escapeHtmlText(p.start)}–${escapeHtmlText(p.end)} · ${escapeHtmlText(p.venue || p.work_type || '—')} · ${p.hours.toFixed(2)} h × ${fmtRand(p.rate_paid)} · payroll ${escapeHtmlText(p.payroll_week_start || weekOfDate(p.work_date) || 'earlier')} · shift #${p.id}</span></td><td style="text-align:right;white-space:nowrap">${fmtRand(p.amount)}</td></tr>`).join('')
          const fullTxt = kind === 'event' ? `${claimH.toFixed(2)} h × ${fmtRand(rate)}` : `${claimH.toFixed(2)} h${f.fullAmount < R2(claimH * rate) ? ' − 0,5 h staff meeting' : ''} × ${fmtRand(rate)}`
          const paidWhat = Array.from(new Set(earlier.map((p) => p.venue || p.work_type || 'earlier'))).join('/')
          return `<table style="border-collapse:collapse;width:100%;font-size:12.5px;line-height:1.45;color:#000;font-weight:700">
            ${paidLines}
            <tr><td style="padding:6px 8px 2px 0;border-top:1px solid rgba(0,0,0,.25)">${escapeHtmlText(st)}–${escapeHtmlText(en)} ${placeWord} &nbsp;<span style="font-weight:600;color:#1f1f1f">${fullTxt}</span></td><td style="text-align:right;white-space:nowrap;padding-top:6px;border-top:1px solid rgba(0,0,0,.25)">${fmtRand(f.fullAmount)}</td></tr>
            <tr><td style="padding:2px 8px 2px 0">Less the ${escapeHtmlText(paidWhat)} already paid</td><td style="text-align:right;white-space:nowrap">− ${fmtRand(f.alreadyPaid)}</td></tr>
            <tr><td style="padding:5px 8px 0 0;border-top:2px solid #111;font-weight:800">WHAT YOU SHOULD PAY THIS WEEK</td><td style="text-align:right;white-space:nowrap;border-top:2px solid #111;font-weight:800;font-size:15px;padding-top:5px">${fmtRand(f.stillDue)}</td></tr>
          </table>`
        }
        const other: 'event' | 'warehouse' = primaryKind === 'event' ? 'warehouse' : 'event'
        const otherF = other === 'event' ? diffV : diffW
        return `<form method="post" action="/wages-admin/rate-choice" class="bw-review-decide" style="margin-top:6px;padding:10px;border-radius:8px;background:rgba(255,255,255,.05);font-size:12px">
      <input type="hidden" name="review_id" value="${v.id}">
      <input type="hidden" name="return_to" value="__RETURN__">
      <div style="font-weight:800;color:#fca5a5;margin-bottom:6px">ALREADY PAID for part of this day — ${primaryKind === 'event' ? 'he was at a venue' : 'he was in the warehouse'}${areaSaysVenue && sub?.area ? ` (Area: “${escapeHtmlText(sub.area)}”)` : ''}. Only the difference is paid.</div>
      <div style="background:${primaryKind === 'event' ? '#e2b93b' : '#93c5fd'};border-radius:8px;padding:8px 10px">${sumFor(primaryKind)}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px">
        <button type="submit" name="choice" value="${primaryKind}" style="padding:8px 16px;border-radius:8px;border:0;background:#16a34a;color:#fff;font-weight:800;font-size:13px;cursor:pointer">✔ APPROVE ${fmtRand((primaryKind === 'event' ? diffV! : diffW!).stillDue)} — ${primaryKind === 'event' ? 'VENUE R95/h' : 'WAREHOUSE R81,25/h'}</button>
        ${otherF ? `<button type="submit" name="choice" value="${other}" style="padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.35);background:transparent;color:#fff;cursor:pointer;font-size:11.5px" title="Use this only if he was ${other === 'event' ? 'at a venue' : 'in the warehouse'} instead">No — he was ${other === 'event' ? 'at a venue' : 'in the warehouse'} instead (${fmtRand(otherF.stillDue)})</button>` : ''}
      </div>
      <div style="opacity:.6;margin-top:5px">Recorded on review #${v.id} with your name. The row is set to the amount shown; what was paid earlier is not touched.${isDraft ? ' Applied when the worker final-submits.' : ''}</div>
    </form>`
      }
      const btn = (val: string, bg: string, label: string, full: OwnerPriced | null, stripRe: RegExp) =>
        `<button type="submit" name="choice" value="${val}" style="padding:6px 10px;border-radius:6px;border:0;background:${bg};color:#111;font-weight:800;cursor:pointer;text-align:left">${label}${full ? `<br><span style="font-weight:600">${fmtRand(full.amount)}</span> <span style="font-weight:400;opacity:.8">(${escapeHtmlText(full.breakdown.replace(stripRe, ''))})</span>` : ''}</button>`
      if (snap?.crewKind === 'garden_event_words') {
        // Owner 24 Sep 2026 (Takavaudza "Installing lights and garden work"): a gardener's House entry whose
        // wording sounds like EVENT work — the office must say GARDEN (R62,50/h) or VENUE / FUNCTION (R95/h).
        const pg = st && en ? ownerPayForShift(wd, st, en, 'gardener') : null
        return `<form method="post" action="/wages-admin/rate-choice" class="bw-review-decide" style="margin-top:6px;padding:8px;border-radius:8px;background:rgba(255,255,255,.05);font-size:12px">
      <input type="hidden" name="review_id" value="${v.id}">
      <input type="hidden" name="return_to" value="__RETURN__">
      <div style="margin-bottom:6px"><strong>Garden work or a venue job? ${workerSaid}${sub?.workDescription ? ` He wrote “${escapeHtmlText(sub.workDescription)}”.` : ''} Your click decides the place and the rate${isDraft ? ' — applied automatically when he final-submits' : ' — the row is re-priced now'}:</strong></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${btn('garden', '#86efac', 'GARDEN — R62,50/h (Sunday R75)', pg, /^Gardener House work(?: Sunday)?: /)}
        ${btn('event', '#e2b93b', 'VENUE / FUNCTION — R95/h (Sunday R114)', pv, /^Venue\/event(?: Sunday)?: /)}
      </div>
      <div style="opacity:.6;margin-top:4px">Recorded on review #${v.id} with your name and the place chosen.${isDraft ? ' Nothing is paid until the worker final-submits; the rate you chose is then used.' : ' The shift amount is set to the chosen place. Nothing else changes.'}</div>
    </form>`
      }
      return `<form method="post" action="/wages-admin/rate-choice" class="bw-review-decide" style="margin-top:6px;padding:8px;border-radius:8px;background:rgba(255,255,255,.05);font-size:12px">
      <input type="hidden" name="review_id" value="${v.id}">
      <input type="hidden" name="return_to" value="__RETURN__">
      <div style="margin-bottom:6px"><strong>Where was he? ${workerSaid} Your click decides the place and the rate${isDraft ? ' — applied automatically when he final-submits' : ' — the row is re-priced now'}:</strong></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${btn('warehouse', '#93c5fd', 'WAREHOUSE — R81,25/h', pw, /^Warehouse: /)}
        ${btn('event', '#e2b93b', 'VENUE — R95/h', pv, /^Venue\/event: /)}
      </div>
      <div style="opacity:.6;margin-top:4px">Recorded on review #${v.id} with your name and the place chosen. ${isDraft ? 'Nothing is paid until the worker final-submits; the rate you chose is then used, whatever work type he picked.' : 'The shift amount is set to the chosen place. Nothing else changes.'}</div>
    </form>`
    }
    if (snap?.paidBefore) {
      // Owner 2026-09-21: the system has done the working-out; one click approves the rand amount.
      const due = Number(snap.recommendedAmount || 0)
      return `<form method="post" action="/wages-admin/review-decision" class="bw-review-decide" style="margin-top:6px;padding:8px;border-radius:8px;background:rgba(255,255,255,.05);font-size:12px">
      <input type="hidden" name="review_id" value="${v.id}">
      <input type="hidden" name="return_to" value="__RETURN__">
      <input type="hidden" name="approved_hours" value="${Number(snap.extraHours || 0).toFixed(2)}">
      <input type="hidden" name="approved_amount" value="${due.toFixed(2)}">
      <input type="hidden" name="reason" value="${escapeHtmlText(snap.recommendedReason || 'Already paid check — approved as recommended')}">
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        <button type="submit" name="decision" value="approve_amount" style="padding:8px 14px;border-radius:8px;border:0;background:#e2b93b;color:#111;font-weight:800;font-size:13px;cursor:pointer">Approve as recommended — ${fmtRand(due)}</button>
        <button type="submit" name="decision" value="approve_zero" style="padding:6px 10px;border-radius:6px;border:1px solid rgba(255,255,255,.25);background:transparent;color:#fff;cursor:pointer" title="Nothing more is due on this entry">Nothing due — R0,00</button>
      </div>
      <details style="margin-top:6px" class="bw-pb-adjust" data-rate="${Number(snap.newRate || 0)}" data-corr="${Number(snap.rateCorrection || 0)}" data-extra="${Number(snap.extraHours || 0)}"><summary style="cursor:pointer;color:#fde68a;font-weight:700">I don't agree — change the hours (the system re-prices at the correct rate)</summary>
        <div style="margin-top:6px;padding:8px;border-radius:8px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12)">
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
            <label style="display:flex;align-items:center;gap:6px">Extra hours to pay <input type="number" step="0.25" min="0" name="custom_hours" value="${Number(snap.extraHours || 0).toFixed(2)}" class="bw-pb-hours" style="width:80px;padding:4px 6px;border-radius:6px;border:1px solid rgba(255,255,255,.2);background:#0f172a;color:#fff"> <span style="opacity:.7">× ${fmtRand(Number(snap.newRate || 0))}/h (${escapeHtmlText(String(snap.kindLabel || 'rate from the work type selected'))})</span></label>
            ${Number(snap.rateCorrection || 0) ? `<label style="display:flex;align-items:center;gap:6px"><input type="checkbox" name="include_rate_correction" value="1" class="bw-pb-corr" checked> Include the rate correction on the hours already paid (${fmtRand(Number(snap.rateCorrection))})</label>` : ''}
          </div>
          <div style="margin-top:6px;font-size:13px">System will pay: <strong class="bw-pb-total" style="color:#fde68a">${fmtRand(due)}</strong> <span class="bw-pb-breakdown" style="opacity:.7"></span></div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px">
            <input type="text" name="custom_reason" placeholder="Reason for the change (recorded with your name)" style="flex:1;min-width:220px;padding:4px 8px;border-radius:6px;border:1px solid rgba(255,255,255,.2);background:#0f172a;color:#fff">
            <button type="submit" name="decision" value="approve_custom_hours" style="padding:6px 12px;border-radius:6px;border:0;background:#e2b93b;color:#111;font-weight:800;cursor:pointer">Approve these hours</button>
          </div>
        </div>
      </details>
      <div style="opacity:.6;margin-top:4px">Records your decision on review #${v.id} with your name and time. The approved amount is paid in THIS payroll and shown as a correction line on the Excel; last week's paid row is not changed.</div>
    </form>`
    }
    const rec = v.system_proposed_payable_hours
    const recReason = snap?.recommendedReason || ''
    const orig = v.original_hours
    return `<form method="post" action="/wages-admin/review-decision" class="bw-review-decide" style="margin-top:6px;padding:8px;border-radius:8px;background:rgba(255,255,255,.05);font-size:12px">
      <input type="hidden" name="review_id" value="${v.id}">
      <input type="hidden" name="return_to" value="__RETURN__">
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        <label style="display:flex;align-items:center;gap:4px">Approve hours <input type="number" step="0.25" min="0" name="approved_hours" value="${rec !== null && rec !== undefined ? Number(rec).toFixed(2) : (orig !== null && orig !== undefined ? Number(orig).toFixed(2) : '')}" style="width:80px;padding:4px 6px;border-radius:6px;border:1px solid rgba(255,255,255,.2);background:#0f172a;color:#fff"></label>
        <input type="text" name="reason" placeholder="Reason (recorded with your name)" value="${escapeHtmlText(recReason)}" required style="flex:1;min-width:180px;padding:4px 8px;border-radius:6px;border:1px solid rgba(255,255,255,.2);background:#0f172a;color:#fff">
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
        <button type="submit" name="decision" value="approve" style="padding:5px 10px;border-radius:6px;border:0;background:#e2b93b;color:#111;font-weight:800;cursor:pointer">Record decision</button>
        ${orig !== null && orig !== undefined ? `<button type="submit" name="decision" value="approve_original" style="padding:5px 10px;border-radius:6px;border:1px solid rgba(255,255,255,.25);background:transparent;color:#fff;cursor:pointer">Pay as claimed (${Number(orig).toFixed(2)} h)</button>` : ''}
        <button type="submit" name="decision" value="dismiss" style="padding:5px 10px;border-radius:6px;border:1px solid rgba(255,255,255,.25);background:transparent;color:#fff;cursor:pointer">No issue – pay as claimed</button>
      </div>
      <div style="opacity:.6;margin-top:4px">Records your decision on review #${v.id} (status, hours, reason, your name, time). It does not change the paid shift itself — do that with the manager correction if hours must change.</div>
    </form>`
  }

  function reviewCell(list: AdminReviewRow[], withForm = true, editHtml = '') {
    if (!list.length) return '<span style="opacity:.45">—</span>'
    return list.map((v) => {
      let snap: any = null
      try { snap = v.system_snapshot_json ? JSON.parse(v.system_snapshot_json) : null } catch (err) {}
      const openRed = v.status === 'OPEN' && v.severity === 'red'
      const open = v.status === 'OPEN'
      const head = openRed ? pill('REVIEW – ACTION NEEDED', '#7f1d1d', '#fff') : open ? pill('REVIEW – open', '#b45309', '#fff') : pill('REVIEW – ' + escapeHtmlText(v.status), '#1f5f3a', '#fff')
      const rec = v.system_proposed_payable_hours !== null && v.system_proposed_payable_hours !== undefined
        ? `<div style="margin-top:3px"><strong>Recommended payable: ${Number(v.system_proposed_payable_hours).toFixed(2)} h</strong>${snap?.recommendedStart ? ' (' + escapeHtmlText(snap.recommendedStart) + '–' + escapeHtmlText(snap.recommendedEnd) + ')' : ''}${v.previously_paid_hours ? ' · already paid ' + Number(v.previously_paid_hours).toFixed(2) + ' h that day' : ''}</div>`
        : ''
      const reason = snap?.recommendedReason ? `<div style="margin-top:2px;opacity:.85">Reason to record: “${escapeHtmlText(snap.recommendedReason)}”</div>` : ''
      // Owner 2026-09-22: a decision can be changed — Reopen puts the review back to OPEN so the buttons show again.
      const reopenBtn = withForm && v.status === 'RESOLVED' ? `<form method="post" action="/wages-admin/reopen-review" style="display:inline" onsubmit="return confirm('Reopen review #${v.id}? Your previous decision is kept in the log and the buttons come back so you can decide again.')"><input type="hidden" name="review_id" value="${v.id}"><input type="hidden" name="return_to" value="__RETURN__"><button type="submit" style="margin-left:6px;padding:2px 8px;border-radius:6px;border:1px solid rgba(255,255,255,.35);background:transparent;color:#fff;font-size:11px;font-weight:700;cursor:pointer" title="Change this decision">↺ Reopen</button></form>` : ''
      const decided = (snap?.rateChoice || snap?.petrusExtra) && v.status !== 'OPEN'
        ? `<div style="margin-top:3px;color:#86efac"><strong>Decided: ${escapeHtmlText(v.decision_reason || v.status)}</strong>${v.reviewed_by_name ? ' by ' + escapeHtmlText(v.reviewed_by_name) : ''}${reopenBtn}</div>`
        : v.approved_payable_hours !== null && v.approved_payable_hours !== undefined
        ? `<div style="margin-top:3px;color:#86efac"><strong>Decided: ${Number(v.approved_payable_hours).toFixed(2)} h</strong>${v.reviewed_by_name ? ' by ' + escapeHtmlText(v.reviewed_by_name) : ''}${v.decision_reason ? ' — ' + escapeHtmlText(v.decision_reason) : ''}${reopenBtn}</div>`
        : (v.status !== 'OPEN' && v.decision_reason ? `<div style="margin-top:3px;color:#86efac"><strong>${escapeHtmlText(v.status)}</strong>${v.reviewed_by_name ? ' by ' + escapeHtmlText(v.reviewed_by_name) : ''} — ${escapeHtmlText(v.decision_reason)}${reopenBtn}</div>` : '')
      // Owner 2026-09-21: "already paid" review — full story, each line on its own row, amount in bold.
      if (snap?.paidBefore) {
        const lines: string[] = Array.isArray(snap.lines) ? snap.lines : [String(snap.humanReason || '')]
        const body = `<div style="margin-top:4px;padding:8px 10px;border-radius:8px;background:rgba(127,29,29,.18);border:1px solid rgba(252,165,165,.45)">
          <div style="font-weight:800;color:#fca5a5;margin-bottom:4px">${escapeHtmlText(snap.warningTitle || v.issue_summary || '')}</div>
          ${lines.map((l) => `<div style="margin:2px 0;${/^Still due|^Every hour|^What was paid/.test(l) ? 'font-weight:800;color:#fde68a' : /^•/.test(l) ? 'padding-left:10px' : ''}">${escapeHtmlText(l)}</div>`).join('')}
        </div>`
        const decidedAmt = v.status !== 'OPEN' ? `<div style="margin-top:3px;color:#86efac"><strong>Decided: ${snap.approvedAmount !== undefined ? fmtRand(Number(snap.approvedAmount)) : (v.approved_payable_hours !== null && v.approved_payable_hours !== undefined ? Number(v.approved_payable_hours).toFixed(2) + ' h' : v.status)}</strong>${v.reviewed_by_name ? ' by ' + escapeHtmlText(v.reviewed_by_name) : ''}${v.decision_reason ? ' — ' + escapeHtmlText(v.decision_reason) : ''}${reopenBtn}</div>` : ''
        return `<div id="bw-review-${v.id}" style="font-size:12px;line-height:1.4;margin-bottom:6px">${head}<span style="opacity:.6">#${v.id}</span>${body}${decidedAmt}${withForm ? decisionForm(v, snap) : ''}${editHtml}</div>`
      }
      // Owner 2026-09-22: an overlap review must SHOW the two entries side by side — what was billed
      // before (which payroll, hours, place, rand) versus this entry — and the exact overlapping hours.
      let overlapBox = ''
      if (v.compared_shift_id && /overlap|duplicate/i.test((v.issue_key || '') + ' ' + (v.warning_reason || ''))) {
        let sub: any = null, cmp: any = null
        try { sub = v.subject_snapshot_json ? JSON.parse(v.subject_snapshot_json) : null } catch (err) {}
        try { cmp = v.compared_snapshot_json ? JSON.parse(v.compared_snapshot_json) : null } catch (err) {}
        const cmpIsDraft = v.compared_source === 'draft'
        const live = cmpIsDraft ? cmpRowsByDraft[Number(v.compared_shift_id)] : cmpRows[Number(v.compared_shift_id)]
        const cStart = live?.start_time || cmp?.startTime || '', cEnd = live?.end_time || cmp?.endTime || '', cDate = live?.work_date || cmp?.workDate || v.work_date
        const cVenue = live?.outlet_venue || cmp?.venue || '', cWt = live?.work_type || cmp?.workType || 'Normal', cDesc = live?.work_description || cmp?.workDescription || ''
        const cHours = Number(live?.hours_worked ?? cmp?.hours ?? v.compared_hours ?? 0) || hoursBetween(cStart, cEnd), cAmt = live ? Number(live.amount || 0) : Number(cmp?.amount ?? 0)
        const cWeek = live?.payroll_week_start || cmp?.payrollWeekStart || (live ? (cDate >= weekStart ? weekStart : weekOfDate(cDate)) : null)
        const cRef = live ? `shift #${live.id}` : (cmpIsDraft ? `draft #${v.compared_shift_id} (not final-submitted)` : `shift #${v.compared_shift_id}`)
        const cPaidIn = !live ? 'not yet paid (still a draft)' : cWeek && cWeek < weekStart ? `PAID in payroll ${cWeek} → ${proxyEndOfPayrollWeek(cWeek)} (closed)` : `in THIS payroll (${weekStart} → ${weekEnd}, not yet paid)`
        const sStart = sub?.startTime || '', sEnd = sub?.endTime || '', sVenue = sub?.venue || '', sWt = sub?.workType || 'Normal', sDesc = sub?.workDescription || '', sHours = Number(sub?.hours ?? v.original_hours ?? 0) || hoursBetween(sStart, sEnd)
        const a = timeToMinutes(sStart), b0 = timeToMinutes(sEnd), c0 = timeToMinutes(cStart), d0 = timeToMinutes(cEnd)
        let ovText = 'times unreadable', ovH = 0, extraText = ''
        if (a !== null && b0 !== null && c0 !== null && d0 !== null) {
          const b = b0 <= a ? b0 + 1440 : b0, dd = d0 <= c0 ? d0 + 1440 : d0
          const os = Math.max(a, c0), oe = Math.min(b, dd)
          ovH = Math.max(0, oe - os) / 60
          const fm = (m: number) => String(Math.floor((m % 1440) / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0')
          ovText = ovH > 0 ? `${fm(os)}–${fm(oe)} = ${ovH.toFixed(2)} h overlap` : 'no overlapping minutes'
          const before = Math.max(0, c0 - a) / 60, after = Math.max(0, b - dd) / 60
          const parts = [before > 0 ? `${fm(a)}–${fm(Math.min(c0, b))} (${before.toFixed(2)} h) before the other entry` : '', after > 0 ? `${fm(Math.max(dd, a))}–${fm(b)} (${after.toFixed(2)} h) after it` : ''].filter(Boolean)
          extraText = parts.length ? parts.join(' + ') : 'none — this entry lies entirely inside the other one'
        }
        const isSelf = live && Number(live.source_draft_id) === Number(v.subject_shift_id) && v.subject_source === 'draft'
        const same = cDate === (sub?.workDate || v.work_date) && sStart === cStart && sEnd === cEnd && (sVenue || '').trim().toLowerCase() === (cVenue || '').trim().toLowerCase()
        const sDate = sub?.workDate || v.work_date
        const verdict = isSelf ? 'This is the SAME entry (the draft became this paid row) — nothing billed twice. No decision needed.'
          : cDate !== sDate ? `DIFFERENT DAYS: the other entry is ${cDate} (${dayName(cDate)}), this one is ${sDate} (${dayName(sDate)}). Same clock times, but not the same day — nothing billed twice. Recommended: pay as claimed (${sHours.toFixed(2)} h).`
          : same ? `Identical times and place — looks like a DUPLICATE. Recommended: approve 0 h on this entry (the other one already pays ${cHours.toFixed(2)} h).`
          : ovH > 0 ? `Recommended: approve only the hours NOT already covered — ${Math.max(0, sHours - ovH).toFixed(2)} h (${extraText}). The ${ovH.toFixed(2)} h overlap is already ${live ? 'billed on shift #' + live.id : 'claimed on draft #' + v.compared_shift_id}.`
          : 'No overlapping minutes — recommended: pay as claimed.'
        const line = (label: string, color: string, date: string, st: string, en: string, hrs: number, wt: string, venue: string, desc: string, money: string) => `<div style="margin:3px 0;padding:4px 6px;border-left:3px solid ${color};background:rgba(255,255,255,.04)"><div style="font-weight:800;color:${color}">${label}</div><div>${escapeHtmlText(dayName(date))} ${escapeHtmlText(date)} · <strong>${escapeHtmlText(st)}–${escapeHtmlText(en)}</strong> · ${hrs.toFixed(2)} h</div><div style="opacity:.9">${escapeHtmlText(wt)} · ${escapeHtmlText(venue)}${desc ? ' · ' + escapeHtmlText(desc) : ''}</div><div style="opacity:.9">${money}</div></div>`
        overlapBox = `<div style="margin-top:5px;padding:7px 9px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.14)">
          <div style="font-weight:800;margin-bottom:2px">What overlaps what</div>
          ${line(live ? 'ALREADY BILLED' : 'OTHER ENTRY', '#93c5fd', cDate, cStart, cEnd, cHours, cWt, cVenue, cDesc, `${live ? `<strong>${fmtRand(cAmt)}</strong> · ` : ''}${escapeHtmlText(cRef)} · ${escapeHtmlText(cPaidIn)}`)}
          ${line('THIS ENTRY', '#e2b93b', sDate, sStart, sEnd, sHours, sWt, sVenue, sDesc, v.subject_source === 'draft' ? (cmpRowsByDraft[Number(v.subject_shift_id)] ? `final-submitted → shift #${cmpRowsByDraft[Number(v.subject_shift_id)].id} in this payroll (${fmtRand(Number(cmpRowsByDraft[Number(v.subject_shift_id)].amount || 0))} on the row)` : 'draft — not yet final-submitted') : 'shift #' + v.subject_shift_id + ' in this payroll')}
          <div style="margin-top:4px"><strong>Overlap by the clock:</strong> ${escapeHtmlText(ovText)}${ovH > 0 && cDate === sDate ? `<br><strong>Not covered by the other entry:</strong> ${escapeHtmlText(extraText)}` : ''}</div>
          <div style="margin-top:4px;padding:5px 7px;border-radius:6px;background:rgba(253,230,138,.12);color:#fde68a;font-weight:700">${escapeHtmlText(verdict)}</div>
        </div>`
      }
      const summary = openRed ? '' : `<div style="opacity:.8">${escapeHtmlText((v.issue_summary || '').replace(/^Manual overlap review — [^—]+— /, 'Overlap check — '))}</div>`
      const detail = openRed ? `<div style="opacity:.9;margin-top:2px">${escapeHtmlText(snap?.humanReason || v.warning_reason || '')}</div>` : (open ? `<div style="opacity:.75;margin-top:2px">${escapeHtmlText((v.warning_reason || '').replace(/ Do not block staff entry.*$/i, ''))}</div>` : '')
      return `<div id="bw-review-${v.id}" style="font-size:12px;line-height:1.35;margin-bottom:6px">${head}<span style="opacity:.6">#${v.id}</span>${summary}${detail}${overlapBox}${rec}${reason}${decided}${withForm ? decisionForm(v, snap) : ''}${editHtml}</div>`
    }).join('')
  }

  // Owner-approved (2026-09-14): edit buttons that only LINK to the engine's own
  // manager-correction form (/admin/wages/shifts/:id/edit) — nothing new in the backend.
  const editHref = (shiftId: number) => `/admin/wages/shifts/${shiftId}/edit?from=${encodeURIComponent(weekStart)}&to=${encodeURIComponent(weekEnd)}&sort=employee`
  const editBtn = (shiftId: number, label = '✎ Edit shift') => `<a href="${editHref(shiftId)}" style="display:inline-block;margin-top:6px;padding:4px 9px;border-radius:7px;border:1px solid rgba(226,185,59,.6);color:#e2b93b;font-weight:700;font-size:12px;text-decoration:none;white-space:nowrap" title="Opens the manager correction form for this paid shift (asks for a reason; keeps the audit trail)">${label}</a>`
  // Owner 2026-09-22: office can remove an unsubmitted draft that should not be on the system (stale or wrong).
  const deleteDraftBtn = (draftId: number, workDate: string) => `<form method="post" action="/wages-admin/delete-draft" style="display:inline" onsubmit="return confirm('Delete this unsubmitted draft (${escapeHtmlText(workDate)})? It is removed from the worker\'s app and the dashboard. A backup is kept in the log.')"><input type="hidden" name="draft_id" value="${draftId}"><input type="hidden" name="return_to" value="__RETURN__"><button type="submit" style="display:inline-block;margin-top:6px;padding:4px 9px;border-radius:7px;border:1px solid rgba(252,165,165,.7);background:transparent;color:#fca5a5;font-weight:700;font-size:12px;cursor:pointer;white-space:nowrap" title="Remove this draft from the system">🗑 Delete draft</button></form>`
  const workerAppBtn = (_staffId: number, draftId: number, label = '✎ Edit shift') => `<a href="/wages-admin/edit-draft/${draftId}" target="_blank" rel="noopener" style="display:inline-block;margin-top:6px;padding:4px 9px;border-radius:7px;border:1px solid rgba(226,185,59,.6);color:#e2b93b;font-weight:700;font-size:12px;text-decoration:none;white-space:nowrap" title="Not final-submitted yet — opens this draft's edit page (as the office) in a new tab">${label}</a>`

  function missedCell(r: AdminPaidRow) {
    if (r.work_date >= weekStart) return '<span style="opacity:.45">—</span>'
    // Owner-amount line (no hours) from an earlier date — e.g. Thina R650 Heritage Day allowance (owner 28 Sep).
    if (isOwnerAmountLine(r)) return pill('OWNER AMOUNT – for ' + escapeHtmlText(proxyLongDate(r.work_date)), '#fef3c7', '#7c2d12') + `<div style="font-size:12px;opacity:.8;margin:2px 0 4px">Set by the owner as a rand amount (no hours) and paid in this payroll ${escapeHtmlText(weekStart)} to ${escapeHtmlText(weekEnd)}.</div><div>${editBtn(r.id)}</div>`
    const sameDay = prior.filter((p) => p.staff_id === r.staff_id && p.work_date === r.work_date)
    const clash = sameDay.filter((p) => shiftsOverlap(r.start_time, r.end_time, p.start_time, p.end_time))
    let check: string
    if (clash.length) check = pill('OVERLAP', '#fdecec', '#7f1d1d') + `<span style="font-size:12px">already paid ${clash.map((p) => escapeHtmlText(p.start_time + '–' + p.end_time) + ' (' + escapeHtmlText(p.outlet_venue) + ', payroll ' + escapeHtmlText(p.payroll_week_start || 'n/a') + ')').join('; ')}</span>`
    else if (sameDay.length) check = pill('CLEAR', '#e7f6ec', '#14532d') + `<span style="font-size:12px">worked ${sameDay.map((p) => escapeHtmlText(p.start_time + '–' + p.end_time)).join(', ')} that day (paid); these hours are outside those times</span>`
    else check = pill('CLEAR', '#e7f6ec', '#14532d') + `<span style="font-size:12px">nothing else paid for this day</span>`
    // Owner 28 Sep 2026: call it CATCH-UP, and always say what that means — "I can't read your mind."
    return pill('CATCH-UP – worked ' + escapeHtmlText(proxyLongDate(r.work_date)) + ' – ' + escapeHtmlText(r.work_description || ''), '#fdecec', '#7f1d1d')
      + `<div style="font-size:12px;opacity:.85;margin:2px 0 4px"><strong>What CATCH-UP means:</strong> he worked this on ${escapeHtmlText(proxyLongDate(r.work_date))}, which belongs to the <strong>previous payroll</strong> (already paid out). He only entered it afterwards, so it is paid now, in this payroll ${escapeHtmlText(weekStart)} to ${escapeHtmlText(weekEnd)}. The day was not missed — the entry was late.</div>` + check
      + `<div>${editBtn(r.id)}</div>`
  }

  const byStaff: Record<number, { name: string, paid: AdminPaidRow[], drafts: AdminDraftRow[] }> = {}
  paid.forEach((r) => { (byStaff[r.staff_id] = byStaff[r.staff_id] || { name: r.display_name, paid: [], drafts: [] }).paid.push(r) })
  drafts.forEach((d) => { (byStaff[d.staff_id] = byStaff[d.staff_id] || { name: d.display_name, paid: [], drafts: [] }).drafts.push(d) })
  const order = Object.keys(byStaff).map(Number).sort((a, b) => byStaff[a].name.localeCompare(byStaff[b].name))

  let gHours = 0, gAmount = 0, gShifts = 0, gMissedH = 0, gMissedA = 0, gDrafts = 0, gOpenReviews = 0, gRuleDays = 0, gRuleOver = 0, gRuleUnder = 0, gRuleAmount = 0, gAgreedH = 0, gAgreedA = 0, gAgreedPending = 0
  type RuleDayCheck = { staffId: number, name: string, date: string, paid: number, rule: RuleDayResult, diff: number, entries: string[], shiftIds: number[], priorIncluded: boolean }
  const ruleDiffsAll: RuleDayCheck[] = []
  const th = (t: string, extra = '') => `<th style="padding:8px 10px;text-align:left;color:#e2b93b;font-size:11px;text-transform:uppercase;letter-spacing:.06em;white-space:nowrap;${extra}">${t}</th>`
  const td = (t: string, extra = '') => `<td style="padding:8px 10px;vertical-align:top;${extra}">${t}</td>`

  const ruleDetailTop = (c: RuleDayCheck) => `<div style="font-size:12px;opacity:.9">Rule: ${escapeHtmlText(ruleBreakdownText(c.rule))}${c.rule.notes.length ? ' · ' + escapeHtmlText(c.rule.notes.join('; ')) : ''}<br>Entries paid: ${c.entries.map((e) => escapeHtmlText(e)).join(' · ')}${c.priorIncluded ? ' · <em>includes what was already paid for this real day in an earlier payroll</em>' : ''}</div>`

  // Owner 2026-09-23: "When we go through Monday, ask me: what did they work on the holiday?" Once the payroll has
  // moved past a public holiday whose hours the owner SET (planned end), the next dashboard shows every holiday row
  // and asks for the real end time, with under/over-paid worked out. Answer recorded on the row (manager correction).
  let followUpPanel = ''
  try {
    const prevHol = await db.prepare(`SELECT ph.work_date, ph.planned_end, ph.note FROM wage_planned_hours ph WHERE ph.work_date < ? AND ph.work_date >= date(?, '-14 days') ORDER BY ph.work_date`).bind(weekStart, weekStart).all()
    const holDays = (prevHol.results || []) as Array<{ work_date: string, planned_end: string, note: string }>
    if (holDays.length) {
      const blocks: string[] = []
      for (const hd of holDays) {
        const rowsRes = await db.prepare(`SELECT w.id, w.staff_id, s.display_name, s.payroll_rule, w.start_time, w.end_time, w.hours_worked, w.work_type, w.outlet_venue, w.area, w.work_description, COALESCE(w.gross_wage, w.total_amount, 0) amount, w.hourly_rate_snapshot rate, w.payroll_note FROM wage_shifts w JOIN wage_staff s ON s.id = w.staff_id WHERE w.work_date = ? AND COALESCE(w.event_name,'') <> 'Public holiday correction' AND COALESCE(w.work_description,'') NOT LIKE 'CORRECTION — public holiday%'
          AND NOT (COALESCE(w.hours_worked,0) = 0 AND w.start_time = w.end_time) AND COALESCE(s.payroll_rule,'hourly') <> 'fixed_weekly' ORDER BY s.display_name, w.start_time`).bind(hd.work_date).all()
        const hrows = (rowsRes.results || []) as any[]
        if (!hrows.length) continue
        const pending = hrows.filter((r) => !/HOLIDAY HOURS CONFIRMED/.test(r.payroll_note || ''))
        const done = hrows.length - pending.length
        const li = hrows.map((r) => {
          const confirmed = /HOLIDAY HOURS CONFIRMED/.test(r.payroll_note || '')
          const kind = ownerPayKind(r.staff_id, r.work_type, [r.outlet_venue, r.work_description].join(' '), r.payroll_rule)
          const paidAmt = Number(r.amount || 0)
          const opts = ['11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00'].filter((t) => timeToMinutes(t)! > timeToMinutes(r.start_time)!).map((t) => {
            const p = kind === 'fixed_weekly' ? null : ownerPayForShift(hd.work_date, r.start_time, t, kind === 'warehouse_or_event' ? 'warehouse' : kind)
            const amt = p ? Number(p.recommendedAmount || p.amount || 0) : (kind === 'gardener' ? Math.round((hoursBetween(r.start_time, t) * 62.5 * 2) * 100) / 100 : 0)
            const d = Math.round((amt - paidAmt) * 100) / 100
            // Owner 23 Sep: "Even if they worked less, I don't want anything to be done. Only if we underpaid them."
            const tail = t === r.end_time || Math.abs(d) < 0.005 ? ' (as paid — nothing to do)' : d > 0.004 ? ' — UNDERPAID, top-up +' + fmtRand(d) : ' — worked less, nothing recovered'
            return `<option value="${t}" ${t === r.end_time ? 'selected' : ''}>${t} → ${fmtRand(amt)}${tail}</option>`
          }).join('')
          return `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:6px 0;border-top:1px solid rgba(255,255,255,.08);font-size:12.5px;${confirmed ? 'opacity:.6' : ''}">
            <span style="flex:0 0 190px;font-weight:700">${escapeHtmlText(r.display_name)}</span>
            <span style="flex:0 0 auto">${escapeHtmlText(r.start_time)}–${escapeHtmlText(r.end_time)} · ${escapeHtmlText(r.outlet_venue)} · paid <strong>${fmtRand(Number(r.amount))}</strong></span>
            ${confirmed ? `<span style="color:#86efac;font-weight:700">✔ confirmed</span>` : `<form method="post" action="/wages-admin/confirm-holiday-hours" style="display:flex;gap:6px;align-items:center;margin:0"><input type="hidden" name="shift_id" value="${r.id}"><input type="hidden" name="return_to" value="__RETURN__"><label>Really worked until <select name="actual_end" style="padding:3px 6px;border-radius:6px;background:#0f172a;color:#fff;border:1px solid rgba(255,255,255,.25)">${opts}</select></label><button type="submit" style="padding:4px 10px;border-radius:6px;border:0;background:#16a34a;color:#fff;font-weight:800;cursor:pointer">Confirm &amp; re-price</button></form>`}
          </div>`
        }).join('')
        blocks.push(`<div style="margin-top:8px"><div style="font-weight:800">${escapeHtmlText(proxyLongDate(hd.work_date))} — public holiday, paid to ${escapeHtmlText(hd.planned_end)}${hd.note ? ' (' + escapeHtmlText(hd.note) + ')' : ''} — ${pending.length} to confirm, ${done} done</div>${li}</div>`)
      }
      if (blocks.length) followUpPanel = `<section id="bw-holiday-followup" style="margin:6px 0 14px;padding:10px 14px;border-radius:12px;background:rgba(127,29,29,.18);border:1px solid rgba(252,165,165,.6)">
        <div style="font-weight:800;color:#fca5a5;font-size:14px">⏰ Bernie — what time did they REALLY work until on the public holiday?</div>
        <div style="font-size:12.5px;opacity:.85;margin-top:2px">You set the end time before the day. Pick the real end time per person and press Confirm. <strong>If he worked MORE than paid</strong> the system adds the top-up (holiday rule: meeting deducted first, ×2) as a line in this payroll. <strong>If he worked less, or the same, nothing is done</strong> — the answer is only recorded on the row. Nothing changes until you press Confirm.</div>
        ${blocks.join('')}
      </section>`
    }
  } catch (err) {}

  // Owner 24 Sep 2026: "Lebo works differently as he's a student … keep showing me his wages from Thursday the
  // 24th going forward, with a Paid button at the bottom so I can push it when he's been paid and it disappears.
  // Sometimes he gets paid weekly, other times fortnightly or monthly." A running ledger of every Lebo shift from
  // 2026-09-24 that the owner has not yet marked PAID — across payroll weeks — with a Paid button per line and
  // one for the lot. Marking paid stamps the row (own_schedule_paid_at / by) and it drops off the list.
  let ownSchedulePanel = ''
  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS wage_own_schedule_staff (staff_id INTEGER PRIMARY KEY, from_date TEXT NOT NULL, note TEXT, set_by TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`).run()
    try { await db.prepare(`ALTER TABLE wage_shifts ADD COLUMN own_schedule_paid_at DATETIME`).run() } catch (err) {}
    try { await db.prepare(`ALTER TABLE wage_shifts ADD COLUMN own_schedule_paid_by TEXT`).run() } catch (err) {}
    try { await db.prepare(`ALTER TABLE wage_own_schedule_staff ADD COLUMN next_pay_date TEXT`).run() } catch (err) {}
    const os = await db.prepare(`SELECT o.staff_id, o.from_date, o.note, o.next_pay_date, s.display_name FROM wage_own_schedule_staff o JOIN wage_staff s ON s.id = o.staff_id ORDER BY s.display_name`).all()
    const blocks: string[] = []
    for (const o of (os.results || []) as Array<{ staff_id: number, from_date: string, note: string | null, next_pay_date: string | null, display_name: string }>) {
      const rs = await db.prepare(`SELECT id, work_date, start_time, end_time, hours_worked, hourly_rate_snapshot, COALESCE(gross_wage, total_amount, 0) amount, work_type, outlet_venue, work_description, payroll_week_start, manager_update_reason, own_schedule_paid_at
          FROM wage_shifts WHERE staff_id = ? AND work_date >= ? ORDER BY work_date, start_time, id`).bind(o.staff_id, o.from_date).all()
      const rows = (rs.results || []) as Array<{ id: number, work_date: string, start_time: string, end_time: string, hours_worked: number, amount: number, work_type: string, outlet_venue: string, work_description: string, payroll_week_start: string | null, manager_update_reason: string | null, own_schedule_paid_at: string | null }>
      const unpaid = rows.filter((r) => !r.own_schedule_paid_at)
      const paidCount = rows.length - unpaid.length
      const total = unpaid.reduce((a, r) => a + Number(r.amount || 0), 0)
      const firstName = escapeHtmlText(o.display_name.split(' ')[0])
      const openHold = (r: { id: number, amount: number, manager_update_reason: string | null }) => Number(r.amount) === 0 && !r.manager_update_reason
      const li = unpaid.length ? unpaid.map((r) => {
        const held = openHold(r)
        // Owner 24 Sep: show the hours actually PAID next to the hours clocked — the Mon–Fri 07:00–07:30 meeting is
        // not paid (warehouse), Saturday and Sunday have no meeting.
        const clocked = Number(r.hours_worked || 0)
        const rate = Number((r as any).hourly_rate_snapshot || 0)
        const paidH = rate > 0 && Number(r.amount) > 0 ? Math.round(Number(r.amount) / rate * 100) / 100 : clocked
        const meetingOff = paidH > 0 && clocked - paidH >= 0.24
        const hoursTxt = meetingOff ? `<strong>${paidH.toFixed(2)} h paid</strong><br><span style="font-size:11px;opacity:.75">${clocked.toFixed(2)} h clocked − ${(clocked - paidH).toFixed(2)} h meeting 07:00–07:30</span>` : `${clocked.toFixed(2)} h${rate ? ` × ${fmtRand(rate)}` : ''}`
        // Owner 27 Sep: "put a square so I can tick it to say it's being paid, because now it looks like everything's paid."
        return `<tr style="border-top:1px solid rgba(255,255,255,.08)">
          <td style="padding:4px 8px;white-space:nowrap;text-align:center">${held ? '<span title="held — decide the review first" style="opacity:.5">⛔</span>' : `<input type="checkbox" name="shift_id" value="${r.id}" form="bw-own-pay-form" style="width:20px;height:20px;cursor:pointer;accent-color:#16a34a" title="Tick when this shift has been paid to ${firstName}">`}</td>
          <td style="padding:4px 8px;white-space:nowrap"><strong>${escapeHtmlText(proxyLongDate(r.work_date))}</strong></td>
          <td style="padding:4px 8px;white-space:nowrap">${escapeHtmlText(r.start_time)}–${escapeHtmlText(r.end_time)} · ${hoursTxt}</td>
          <td style="padding:4px 8px">${escapeHtmlText(r.work_type || '')}${r.outlet_venue ? ' · ' + escapeHtmlText(r.outlet_venue) : ''}${r.work_description ? ' · <span style="opacity:.75">' + escapeHtmlText(r.work_description.slice(0, 60)) + '</span>' : ''}</td>
          <td style="padding:4px 8px;text-align:right;white-space:nowrap;font-weight:800;color:${held ? '#fca5a5' : '#fde68a'}">${fmtRand(Number(r.amount || 0))}${held ? '<br><span style="font-size:10.5px;font-weight:600">held — decide the review first</span>' : ''}</td>
          <td style="padding:4px 8px;white-space:nowrap"><span style="display:inline-block;padding:2px 8px;border-radius:999px;background:rgba(127,29,29,.45);color:#fecaca;font-size:11px;font-weight:800">NOT PAID</span></td>
        </tr>`
      }).join('') : `<tr><td colspan="6" style="padding:6px 8px;opacity:.75">Nothing unpaid — everything from ${escapeHtmlText(proxyLongDate(o.from_date))} has been marked paid.</td></tr>`
      const payable = unpaid.filter((r) => !openHold(r))
      const payBtn = payable.length ? `<form method="post" id="bw-own-pay-form" action="/wages-admin/own-schedule-paid" style="margin:0" onsubmit="var n=this.querySelectorAll('input[name=shift_id]:checked').length; if(!n){alert('Tick the square next to each shift that has been paid first.');return false;} return confirm('Mark the '+n+' ticked ${firstName} shift(s) as PAID? They will leave this list.')"><input type="hidden" name="return_to" value="__RETURN__"><button type="submit" style="padding:7px 14px;border-radius:8px;border:0;background:#16a34a;color:#fff;font-weight:800;cursor:pointer">✔ Mark the TICKED shifts as PAID</button></form>` : ''
      blocks.push(`<div style="margin-top:6px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><div style="font-weight:800">${escapeHtmlText(o.display_name)} — unpaid since ${escapeHtmlText(proxyLongDate(o.from_date))}${o.note ? ` <span style="opacity:.75;font-weight:500">(${escapeHtmlText(o.note)})</span>` : ''}</div><div style="font-size:12px;opacity:.75">${unpaid.length} NOT paid · ${paidCount} already marked paid</div></div>
        ${o.next_pay_date ? `<div style="margin-top:4px;padding:6px 10px;border-radius:8px;background:rgba(22,163,74,.18);border:1px solid rgba(134,239,172,.5);font-size:12.5px"><strong>💰 ONE PAYMENT DUE ${escapeHtmlText(proxyLongDate(o.next_pay_date).toUpperCase())}</strong> — everything he works until then accumulates here. On that day pay the TOTAL below, <strong>tick every square</strong>, then press <strong>Mark the TICKED shifts as PAID</strong>. Every clocked hour is paid — <strong>no 07:00–07:30 meeting deduction</strong> for him (owner 24 Sep: his rate is far lower than anyone else's).</div>` : ''}
        <table style="width:100%;border-collapse:collapse;font-size:12.5px;margin-top:4px"><thead><tr style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;opacity:.7"><th style="padding:2px 8px;text-align:center">Paid?</th><th style="padding:2px 8px;text-align:left">Day</th><th style="padding:2px 8px;text-align:left">Times</th><th style="padding:2px 8px;text-align:left">Work</th><th style="padding:2px 8px;text-align:right">Amount</th><th style="padding:2px 8px;text-align:left">Status</th></tr></thead><tbody>${li}</tbody>
        <tfoot><tr style="border-top:2px solid rgba(253,224,71,.5)"><td colspan="4" style="padding:6px 8px;font-weight:800">TOTAL STILL TO PAY ${firstName}</td><td style="padding:6px 8px;text-align:right;font-weight:900;font-size:15px;color:#fde68a">${fmtRand(total)}</td><td style="padding:6px 8px">${payBtn}</td></tr></tfoot></table>
      </div>`)
    }
    if (blocks.length) ownSchedulePanel = `<section id="bw-own-schedule" style="margin:6px 0 14px;padding:10px 14px;border-radius:12px;background:rgba(30,64,175,.18);border:1px solid rgba(147,197,253,.55)">
      <div style="font-weight:800;color:#bfdbfe;font-size:14px">🎓 Paid on his own schedule — running total until you press Paid</div>
      <div style="font-size:12px;opacity:.8;margin-top:2px">These shifts stay here across payroll weeks (weekly, fortnightly or monthly — whenever he is paid). Every line is <strong>NOT PAID</strong> until you say so: <strong>tick the square</strong> next to each shift the money has gone out for, then press <strong>Mark the TICKED shifts as PAID</strong>; they leave the list and the row is stamped with your name and the date. Nothing here changes the shift amounts — corrections still go through ✎ Edit shift and the reviews.</div>
      ${blocks.join('')}
    </section>`
  } catch (err) {}

  // Owner 28 Sep 2026: Petrus weekly guarantee panel — "You must always clear 3 840." Shows the 6 days Mon–Sat, what is
  // paid / drafted / missing, the guaranteed total vs what is in, and a button that adds the shortfall as an owner line.
  // Owner 30 Sep 2026: "The wage schedule ends this week on the 2nd of October, and all the wages need to go into the auditors
  // by the 30th. The rule is that they will submit for Thursday and Friday [in advance], and then your job next week is to
  // just deduct whatever they say they missed." → Thu/Fri submitted early is NORMAL, not a flag. On the NEXT week's dashboard
  // (and in the previous-week view) list every pre-submitted Thu/Fri row so the office can knock off anything not worked.
  // Owner 30 Sep 2026: "you need to triple-check this next week so that I don't get pulled again about the hours we've
  // paid. If someone claims more or less, we know exactly." → wage_paid_snapshot freezes every row exactly as it went to
  // the auditors (taken when the payroll Excel is downloaded, or with the Lock button). This panel compares the paid
  // snapshot against the live rows and shows the exact difference per person: changed, removed, or claimed afterwards.
  let paidCheckPanel = ''
  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS wage_paid_snapshot (week_start TEXT NOT NULL, shift_id INTEGER NOT NULL, staff_id INTEGER, display_name TEXT, work_date TEXT, start_time TEXT, end_time TEXT, hours REAL, rate REAL, amount REAL, outlet_venue TEXT, work_description TEXT, snapshot_by TEXT, snapshot_at DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (week_start, shift_id))`).run()
    const wsD = parseProxyIsoDate(weekStart)
    const prevWeek = wsD ? formatProxyIsoDate(new Date(wsD.getTime() - 7 * 86400000)) : ''
    const weeks = [weekStart, prevWeek].filter(Boolean)
    const blocks: string[] = []
    let flagged = 0
    for (const wk of weeks) {
      const wkEnd = proxyEndOfPayrollWeek(wk)
      const meta = await db.prepare(`SELECT COUNT(*) n, MAX(snapshot_at) at, MAX(snapshot_by) by, ROUND(SUM(amount),2) total FROM wage_paid_snapshot WHERE week_start = ?`).bind(wk).first<{ n: number, at: string, by: string, total: number }>()
      if (!meta || !Number(meta.n)) continue
      const diff = await db.prepare(`SELECT p.shift_id, p.display_name, p.work_date, p.start_time p_st, p.end_time p_en, p.hours p_h, p.amount p_amt, w.id w_id, w.start_time w_st, w.end_time w_en, w.hours_worked w_h, COALESCE(w.gross_wage, w.total_amount) w_amt, w.manager_update_reason mgr FROM wage_paid_snapshot p LEFT JOIN wage_shifts w ON w.id = p.shift_id WHERE p.week_start = ? AND (w.id IS NULL OR w.start_time != p.start_time OR w.end_time != p.end_time OR ABS(COALESCE(w.gross_wage, w.total_amount, 0) - p.amount) > 0.01) ORDER BY p.display_name, p.work_date`).bind(wk).all()
      const late = await db.prepare(`SELECT w.id, s.display_name, w.work_date, w.start_time, w.end_time, w.hours_worked, COALESCE(w.gross_wage, w.total_amount, 0) amt, w.outlet_venue, w.work_description, w.created_at FROM wage_shifts w JOIN wage_staff s ON s.id = w.staff_id WHERE w.work_date BETWEEN ? AND ? AND w.id NOT IN (SELECT shift_id FROM wage_paid_snapshot WHERE week_start = ?) ORDER BY s.display_name, w.work_date`).bind(wk, wkEnd, wk).all()
      const drows = (diff.results || []) as any[]
      const lrows = (late.results || []) as any[]
      flagged += drows.length + lrows.length
      const money = (n: any) => fmtRand(Number(n || 0))
      const dl = drows.map((r) => {
        const removed = r.w_id === null || r.w_id === undefined
        const d = removed ? -Number(r.p_amt) : Number(r.w_amt) - Number(r.p_amt)
        const col = d > 0 ? '#fca5a5' : (d < 0 ? '#86efac' : '#e5e7eb')
        return `<tr style="border-top:1px solid rgba(255,255,255,.08)"><td style="padding:4px 8px;font-weight:700">${escapeHtmlText(r.display_name)}</td><td style="padding:4px 8px;white-space:nowrap">${escapeHtmlText(proxyLongDate(r.work_date))}</td><td style="padding:4px 8px;white-space:nowrap">PAID ${escapeHtmlText(r.p_st)}–${escapeHtmlText(r.p_en)} · ${money(r.p_amt)}</td><td style="padding:4px 8px;white-space:nowrap">${removed ? '<span style="color:#fca5a5;font-weight:800">ROW REMOVED after paying</span>' : 'NOW ' + escapeHtmlText(r.w_st) + '–' + escapeHtmlText(r.w_en) + ' · ' + money(r.w_amt)}</td><td style="padding:4px 8px;text-align:right;white-space:nowrap;font-weight:800;color:${col}">${d > 0 ? '+' : ''}${money(d)}</td><td style="padding:4px 8px;font-size:11px;opacity:.8">${d > 0 ? 'claims MORE than paid — pay the difference only if approved' : (d < 0 ? 'claims LESS than paid — deduct next payroll' : '')}${r.mgr ? ' · ' + escapeHtmlText(String(r.mgr).slice(0, 90)) : ''}</td></tr>`
      }).join('')
      const ll = lrows.map((r) => `<tr style="border-top:1px solid rgba(255,255,255,.08)"><td style="padding:4px 8px;font-weight:700">${escapeHtmlText(r.display_name)}</td><td style="padding:4px 8px;white-space:nowrap">${escapeHtmlText(proxyLongDate(r.work_date))}</td><td style="padding:4px 8px;white-space:nowrap">NOT on the paid sheet</td><td style="padding:4px 8px;white-space:nowrap">CLAIMS ${escapeHtmlText(r.start_time)}–${escapeHtmlText(r.end_time)} · ${money(r.amt)} <span style="opacity:.7">${escapeHtmlText(r.outlet_venue || '')}</span></td><td style="padding:4px 8px;text-align:right;white-space:nowrap;font-weight:800;color:#fca5a5">+${money(r.amt)}</td><td style="padding:4px 8px;font-size:11px;opacity:.8">submitted ${escapeHtmlText(String(r.created_at).slice(0, 10))} after the sheet — CATCH-UP next payroll only if approved${editBtn ? ' ' + editBtn(r.id, '✎ Check') : ''}</td></tr>`).join('')
      const ok = !drows.length && !lrows.length
      blocks.push(`<div style="margin-top:${blocks.length ? 10 : 4}px"><div style="font-weight:800;font-size:13px;color:${ok ? '#86efac' : '#fde68a'}">${ok ? '✔' : '⚠'} Payroll ${escapeHtmlText(wk)} → ${escapeHtmlText(wkEnd)}: ${Number(meta.n)} rows locked · ${money(meta.total)} paid · locked ${escapeHtmlText(String(meta.at).slice(0, 16))} by ${escapeHtmlText(meta.by || 'office')}${ok ? ' — every live row still matches what was paid' : ' — ' + (drows.length + lrows.length) + ' difference' + (drows.length + lrows.length === 1 ? '' : 's')}</div>${ok ? '' : `<table style="width:100%;border-collapse:collapse;font-size:12.5px;margin-top:4px"><thead><tr style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;opacity:.7"><th style="padding:2px 8px;text-align:left">Worker</th><th style="padding:2px 8px;text-align:left">Day</th><th style="padding:2px 8px;text-align:left">What we paid</th><th style="padding:2px 8px;text-align:left">What the row says now</th><th style="padding:2px 8px;text-align:right">Difference</th><th style="padding:2px 8px;text-align:left">Action</th></tr></thead><tbody>${dl}${ll}</tbody></table>`}</div>`)
    }
    const lockForm = `<form method="post" action="/wages-admin/paid-snapshot" style="display:inline;margin:0" onsubmit="return confirm('Lock every row of payroll ${weekStart} exactly as it stands now as WHAT WAS PAID? (Downloading the payroll Excel does this automatically.)')"><input type="hidden" name="week_start" value="${weekStart}"><input type="hidden" name="return_to" value="__RETURN__"><button type="submit" style="padding:5px 10px;border-radius:8px;border:0;background:#1d4ed8;color:#fff;font-weight:800;cursor:pointer;font-size:12px">🔒 Lock what was paid (${escapeHtmlText(weekStart)})</button></form>`
    paidCheckPanel = `<section id="bw-paid-check" style="margin:6px 0 14px;padding:10px 14px;border-radius:12px;background:${flagged ? 'rgba(127,29,29,.18)' : 'rgba(22,163,74,.10)'};border:1px solid ${flagged ? 'rgba(252,165,165,.6)' : 'rgba(134,239,172,.45)'}">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><div style="font-weight:800;color:${flagged ? '#fca5a5' : '#86efac'};font-size:14px">🔎 Triple-check: what we PAID vs what the rows say now${flagged ? ' — ' + flagged + ' to look at' : ''}</div>${lockForm}</div>
      <div style="font-size:12.5px;opacity:.85;margin-top:2px"><strong>What this is:</strong> when the payroll Excel goes to the auditors every row is locked exactly as paid (times, hours, Rand). If anyone later claims more or less — or a row is changed, removed or added for a paid week — it shows here with the exact difference, so we know precisely what was paid and what is being claimed (owner 30 Sep 2026).</div>
      ${blocks.length ? blocks.join('') : '<div style="font-size:12.5px;margin-top:4px;opacity:.8">Nothing locked yet for this week or last week. Download the payroll Excel (locks automatically) or press Lock.</div>'}
    </section>`
  } catch (err) {}

  let preSubmitPanel = ''
  try {
    const ws = parseProxyIsoDate(weekStart)
    if (ws) {
      const dayIso = (offset: number) => formatProxyIsoDate(new Date(ws.getTime() + offset * 86400000))
      const thu = dayIso(5), fri = dayIso(6), wed = dayIso(4)
      const todayIso = formatProxyIsoDate(new Date())
      const cur = weekStart === currentProxyPayrollWeekStart()
      // Show while the week is running (from Wednesday, when pre-submission starts) and for the week just closed.
      const showFor = (cur && todayIso >= wed) || (!cur && weekStart === formatProxyIsoDate(new Date(parseProxyIsoDate(currentProxyPayrollWeekStart())!.getTime() - 7 * 86400000)))
      if (showFor) {
        const pr = await db.prepare(`SELECT w.id, w.staff_id, s.display_name, w.work_date, w.start_time, w.end_time, w.hours_worked, COALESCE(w.gross_wage, w.total_amount, 0) amount, w.outlet_venue, w.work_description, w.created_at, w.manager_update_reason FROM wage_shifts w JOIN wage_staff s ON s.id = w.staff_id WHERE w.work_date IN (?, ?) AND date(w.created_at) < w.work_date ORDER BY s.display_name, w.work_date`).bind(thu, fri).all()
        const rows = (pr.results || []) as Array<{ id: number, staff_id: number, display_name: string, work_date: string, start_time: string, end_time: string, hours_worked: number, amount: number, outlet_venue: string, work_description: string, created_at: string, manager_update_reason: string | null }>
        if (rows.length) {
          const total = rows.reduce((a, r) => a + Number(r.amount || 0), 0)
          const li = rows.map((r) => `<tr style="border-top:1px solid rgba(255,255,255,.08)">
            <td style="padding:4px 8px;font-weight:700">${escapeHtmlText(r.display_name)}</td>
            <td style="padding:4px 8px;white-space:nowrap">${escapeHtmlText(proxyLongDate(r.work_date))}</td>
            <td style="padding:4px 8px;white-space:nowrap">${escapeHtmlText(r.start_time)}–${escapeHtmlText(r.end_time)} · ${Number(r.hours_worked || 0).toFixed(2)} h</td>
            <td style="padding:4px 8px">${escapeHtmlText(r.outlet_venue || '')}${r.work_description ? ' · <span style="opacity:.75">' + escapeHtmlText(r.work_description.slice(0, 50)) + '</span>' : ''}</td>
            <td style="padding:4px 8px;text-align:right;white-space:nowrap;font-weight:800;color:#fde68a">${fmtRand(Number(r.amount || 0))}</td>
            <td style="padding:4px 8px;font-size:11px;opacity:.75;white-space:nowrap">submitted ${escapeHtmlText(String(r.created_at).slice(0, 10))}</td>
            <td style="padding:4px 8px;white-space:nowrap">${r.manager_update_reason ? '<span style="color:#86efac;font-size:11px">✔ checked</span>' : editBtn(r.id, '✎ Adjust / deduct')}</td>
          </tr>`).join('')
          preSubmitPanel = `<section id="bw-presubmit-check" style="margin:6px 0 14px;padding:10px 14px;border-radius:12px;background:rgba(30,58,138,.18);border:1px solid rgba(147,197,253,.5)">
            <div style="font-weight:800;color:#bfdbfe;font-size:14px">📅 Thursday / Friday submitted in advance — ${rows.length} shift${rows.length === 1 ? '' : 's'} · ${fmtRand(total)}</div>
            <div style="font-size:12.5px;opacity:.85;margin-top:2px"><strong>What this means:</strong> the payroll week closes on Friday and the wages go to the auditors on Wednesday the 30th, so the crew final-submit Thursday and Friday <strong>before</strong> they work them (owner rule, 30 Sep 2026). That is normal — not a red flag. <strong>${cur ? 'Next week' : 'This week'}, the office checks these against what actually happened</strong>: if anyone did not work, left early or was elsewhere, press <strong>✎ Adjust / deduct</strong> on that row and the difference is taken off. Rows already corrected show ✔ checked.</div>
            <table style="width:100%;border-collapse:collapse;font-size:12.5px;margin-top:6px"><thead><tr style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;opacity:.7"><th style="padding:2px 8px;text-align:left">Worker</th><th style="padding:2px 8px;text-align:left">Day</th><th style="padding:2px 8px;text-align:left">Times</th><th style="padding:2px 8px;text-align:left">Where</th><th style="padding:2px 8px;text-align:right">Paid</th><th style="padding:2px 8px;text-align:left">When</th><th style="padding:2px 8px"></th></tr></thead><tbody>${li}</tbody></table>
          </section>`
        }
      }
    }
  } catch (err) {}

  // Owner 30 Sep 2026 (Brian): "This rate fluctuates. You need to ask me every week what we are putting. You can't assume
  // it's going to be the same amount." Fixed-weekly staff flagged varies_weekly get NO amount until the owner types this
  // week's figure here. The panel asks every week; the Excel uses only the figure entered for that week.
  let weeklyAmountPanel = ''
  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS wage_fixed_weekly_amounts (staff_id INTEGER NOT NULL, week_start TEXT NOT NULL, amount REAL NOT NULL, set_by TEXT, note TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (staff_id, week_start))`).run()
    try { await db.prepare(`ALTER TABLE wage_staff ADD COLUMN varies_weekly INTEGER DEFAULT 0`).run() } catch (err) {}
    const vs = await db.prepare(`SELECT s.id, s.display_name, s.standard_weekly_amount, f.amount, f.set_by, f.note, f.created_at, (SELECT amount FROM wage_fixed_weekly_amounts p WHERE p.staff_id = s.id AND p.week_start < ? ORDER BY p.week_start DESC LIMIT 1) prev_amount FROM wage_staff s LEFT JOIN wage_fixed_weekly_amounts f ON f.staff_id = s.id AND f.week_start = ? WHERE s.active = 1 AND s.payroll_rule = 'fixed_weekly' AND COALESCE(s.varies_weekly, 0) = 1 ORDER BY s.display_name`).bind(weekStart, weekStart).all()
    const vrows = (vs.results || []) as Array<{ id: number, display_name: string, standard_weekly_amount: number, amount: number | null, set_by: string | null, note: string | null, created_at: string | null, prev_amount: number | null }>
    if (vrows.length) {
      const li = vrows.map((r) => `<tr style="border-top:1px solid rgba(255,255,255,.08)">
        <td style="padding:6px 8px;font-weight:800">${escapeHtmlText(r.display_name)}</td>
        <td style="padding:6px 8px">${r.amount !== null ? `<strong style="color:#86efac;font-size:15px">${fmtRand(Number(r.amount))}</strong> <span style="font-size:11px;opacity:.75">set by ${escapeHtmlText(r.set_by || 'office')} ${escapeHtmlText(String(r.created_at || '').slice(0, 10))}${r.note ? ' — ' + escapeHtmlText(r.note) : ''}</span>` : `<strong style="color:#fecaca">NOT SET for this week</strong> <span style="font-size:11px;opacity:.75">— the Excel shows R0,00 for him until you enter it${r.prev_amount !== null ? ' (last week was ' + fmtRand(Number(r.prev_amount)) + ')' : ''}</span>`}</td>
        <td style="padding:6px 8px;white-space:nowrap"><form method="post" action="/wages-admin/weekly-amount" style="display:flex;gap:6px;align-items:center;margin:0"><input type="hidden" name="staff_id" value="${r.id}"><input type="hidden" name="week_start" value="${weekStart}"><input type="hidden" name="return_to" value="__RETURN__">R <input type="number" name="amount" step="0.01" min="0" value="${r.amount !== null ? Number(r.amount) : ''}" placeholder="this week's amount" required style="width:120px;padding:5px 7px;border-radius:6px;border:1px solid rgba(255,255,255,.3);background:#111;color:#fff"> <input type="text" name="note" placeholder="reason (optional)" style="width:180px;padding:5px 7px;border-radius:6px;border:1px solid rgba(255,255,255,.2);background:#111;color:#fff"> <button type="submit" style="padding:6px 12px;border-radius:8px;border:0;background:${r.amount !== null ? '#374151' : '#16a34a'};color:#fff;font-weight:800;cursor:pointer">${r.amount !== null ? 'Change' : 'Set for this week'}</button></form></td>
      </tr>`).join('')
      const unset = vrows.filter((r) => r.amount === null).length
      weeklyAmountPanel = `<section id="bw-weekly-amount" style="margin:6px 0 14px;padding:10px 14px;border-radius:12px;background:${unset ? 'rgba(127,29,29,.18)' : 'rgba(22,163,74,.12)'};border:1px solid ${unset ? 'rgba(252,165,165,.6)' : 'rgba(134,239,172,.5)'}">
        <div style="font-weight:800;color:${unset ? '#fca5a5' : '#86efac'};font-size:14px">${unset ? '❓ Bernie — what is this week\'s amount?' : '✔ This week\'s fixed amounts are set'} (payroll ${escapeHtmlText(weekStart)} to ${escapeHtmlText(weekEnd)})</div>
        <div style="font-size:12.5px;opacity:.85;margin-top:2px"><strong>What this is:</strong> these people are paid a fixed weekly amount that <strong>changes from week to week</strong>. The system never assumes last week's figure — it asks you every week (owner 30 Sep 2026). Until you type the amount, the Excel carries R0,00 for them.</div>
        <table style="width:100%;border-collapse:collapse;font-size:12.5px;margin-top:6px"><tbody>${li}</tbody></table>
      </section>`
    }
  } catch (err) {}

  let petrusPanel = ''
  try {
    const ws = parseProxyIsoDate(weekStart)
    if (ws) {
      const dayIso = (offset: number) => formatProxyIsoDate(new Date(ws.getTime() + offset * 86400000))
      // Payroll week runs Sat..Fri; Petrus's 6 paid days are Mon..Sat = offsets 2,3,4,5,6 (Mon–Fri) and 0 (Sat).
      const days = [0, 2, 3, 4, 5, 6].map(dayIso).sort()
      const pr = await db.prepare(`SELECT id, work_date, start_time, end_time, hours_worked, COALESCE(gross_wage, total_amount, 0) amount, work_description, event_name FROM wage_shifts WHERE staff_id = ? AND work_date BETWEEN ? AND ? AND (payroll_week_start = ? OR payroll_week_start IS NULL) ORDER BY work_date, start_time`).bind(PETRUS_STAFF_ID, weekStart, weekEnd, weekStart).all()
      const prows = (pr.results || []) as Array<{ id: number, work_date: string, start_time: string, end_time: string, hours_worked: number, amount: number, work_description: string, event_name: string }>
      const pd = await db.prepare(`SELECT id, work_date, start_time, end_time FROM wage_shift_drafts WHERE staff_id = ? AND work_date BETWEEN ? AND ? AND final_shift_id IS NULL ORDER BY work_date`).bind(PETRUS_STAFF_ID, weekStart, weekEnd).all()
      const pdrafts = (pd.results || []) as Array<{ id: number, work_date: string, start_time: string, end_time: string }>
      const paidIn = prows.reduce((a, r) => a + Number(r.amount || 0), 0)
      const topUps = prows.filter((r) => r.event_name === 'Petrus weekly guarantee')
      const weekdayHoliday = days.filter((d) => publicHolidayName(d) && (parseProxyIsoDate(d)!.getUTCDay() >= 1 && parseProxyIsoDate(d)!.getUTCDay() <= 5))
      const weekendHoliday = days.filter((d) => publicHolidayName(d) && (parseProxyIsoDate(d)!.getUTCDay() === 0 || parseProxyIsoDate(d)!.getUTCDay() === 6))
      // Guarantee: R3 840; if a Mon–Fri holiday is priced on the holiday rule, that day's holiday amount replaces its R640.
      let guarantee = PETRUS_WEEK_GUARANTEE
      const holRows = prows.filter((r) => weekdayHoliday.includes(r.work_date) && r.event_name !== 'Petrus weekly guarantee')
      const holAmt = holRows.reduce((a, r) => a + Number(r.amount || 0), 0)
      if (holRows.length && holAmt > PETRUS_DAY) guarantee = PETRUS_WEEK_GUARANTEE - PETRUS_DAY * weekdayHoliday.length + holAmt
      const short = Math.round((guarantee - paidIn) * 100) / 100
      const missingDays = days.filter((d) => !prows.some((r) => r.work_date === d))
      const todayIso = formatProxyIsoDate(new Date())
      const cells = days.map((d) => {
        const rs = prows.filter((r) => r.work_date === d), dr = pdrafts.filter((x) => x.work_date === d)
        const hol = publicHolidayName(d), dow = parseProxyIsoDate(d)!.getUTCDay()
        const amt = rs.reduce((a, r) => a + Number(r.amount || 0), 0)
        const label = proxyLongDate(d).replace(/ 2026$/, '')
        let body: string, bg: string
        if (rs.length) { body = `<strong>${fmtRand(amt)}</strong><br><span style="font-size:11px;opacity:.8">${rs.map((r) => r.event_name === 'Petrus weekly guarantee' ? 'guarantee top-up' : escapeHtmlText(r.start_time + '–' + r.end_time)).join(', ')}</span>`; bg = 'rgba(22,163,74,.22)' }
        else if (dr.length) { body = `<strong>R640,00</strong><br><span style="font-size:11px;opacity:.8">draft ${escapeHtmlText(dr[0].start_time + '–' + dr[0].end_time)} — not final-submitted</span>`; bg = 'rgba(202,138,4,.25)' }
        else if (d >= todayIso) { body = `<span style="opacity:.6">R640,00<br><span style="font-size:11px">${d === todayIso ? 'today — he enters it at the end of the day' : 'still to come'}</span></span>`; bg = 'rgba(255,255,255,.04)' }
        else { body = `<strong style="color:#fecaca">nothing in</strong><br><span style="font-size:11px;opacity:.9">R640 still owed</span>`; bg = 'rgba(127,29,29,.35)' }
        const holTag = hol ? `<div style="font-size:10.5px;color:#fde68a;margin-top:2px">${escapeHtmlText(hol)}${dow === 0 || dow === 6 ? ' — weekend: no holiday pay, R640 day' : ' — holiday rule (' + (amt ? fmtRand(amt) : 'held for you') + ')'}</div>` : ''
        return `<div style="flex:1 1 120px;padding:6px 8px;border-radius:8px;background:${bg};font-size:12.5px"><div style="font-weight:800">${escapeHtmlText(label)}</div>${body}${holTag}</div>`
      }).join('')
      const pastMissing = missingDays.filter((d) => d < todayIso && !pdrafts.some((x) => x.work_date === d))
      const topUpBtn = short > 0.004 && pastMissing.length ? `<form method="post" action="/wages-admin/petrus-guarantee" style="margin:0" onsubmit="return confirm('Add ${fmtRand(short)} so Petrus clears ${fmtRand(guarantee)} this week? One owner line per missing day (${pastMissing.length}).')"><input type="hidden" name="week_start" value="${weekStart}"><input type="hidden" name="return_to" value="__RETURN__"><button type="submit" style="padding:6px 12px;border-radius:8px;border:0;background:#e2b93b;color:#111;font-weight:800;cursor:pointer">Top up the missing day${pastMissing.length > 1 ? 's' : ''} — ${fmtRand(Math.min(short, pastMissing.length * PETRUS_DAY))}</button></form>` : ''
      const state = short <= 0.004 ? `<strong style="color:#86efac">✔ clears ${fmtRand(guarantee)}</strong>` : `<strong style="color:#fecaca">${fmtRand(short)} short of ${fmtRand(guarantee)}</strong> — ${pdrafts.length ? pdrafts.length + ' draft' + (pdrafts.length > 1 ? 's' : '') + ' still to be final-submitted' : ''}${pastMissing.length ? (pdrafts.length ? '; ' : '') + pastMissing.length + ' day' + (pastMissing.length > 1 ? 's' : '') + ' with nothing entered' : ''}${days.some((d) => d >= todayIso) ? ' — week not finished yet' : ''}`
      petrusPanel = `<section id="bw-petrus-week" style="margin:6px 0 14px;padding:10px 14px;border-radius:12px;background:rgba(88,28,135,.18);border:1px solid rgba(216,180,254,.5)">
        <div style="font-weight:800;color:#e9d5ff;font-size:14px">🔒 Petrus — fixed weekly wage R3 840 (R640 × 6 days Mon–Sat)</div>
        <div style="font-size:12.5px;opacity:.85;margin-top:2px"><strong>What this means:</strong> Petrus is paid a fixed R640 a day, Monday to Saturday — R3 840 a week — whatever hours he enters. It is spread over 6 days only for UIF/VAT. He must always clear R3 840. The only time the week is more is a <strong>Mon–Fri public holiday</strong> priced on the holiday rule (like Heritage Day). A public holiday on a Saturday or Sunday adds nothing — the R3 840 is just spread over the 5 working days. Nothing changes unless the owner says so (owner 28 Sep 2026).</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${cells}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-top:8px;font-size:13px"><div>In this payroll so far: <strong>${fmtRand(paidIn)}</strong>${topUps.length ? ` (incl. ${topUps.length} guarantee top-up${topUps.length > 1 ? 's' : ''})` : ''} · ${state}${weekendHoliday.length ? ` · ${weekendHoliday.map((d) => escapeHtmlText(publicHolidayName(d) || '')).join(', ')} falls on the weekend — no extra` : ''}</div>${topUpBtn}</div>
      </section>`
    }
  } catch (err) {}

  const sections = order.map((sid) => {
    const g = byStaff[sid]
    const rows = g.paid.slice().sort((a, b) => (a.work_date + a.start_time).localeCompare(b.work_date + b.start_time))
    const hours = rows.reduce((a, r) => a + Number(r.hours_worked || 0), 0)
    const amount = rows.reduce((a, r) => a + Number(r.amount || 0), 0)
    const missed = rows.filter((r) => r.work_date < weekStart)
    const mH = missed.reduce((a, r) => a + Number(r.hours_worked || 0), 0)
    const mA = missed.reduce((a, r) => a + Number(r.amount || 0), 0)
    const openRev = rows.reduce((a, r) => a + reviewsForPaid(r).filter((v) => v.status === 'OPEN').length, 0) + g.drafts.reduce((a, d) => a + reviewsForDraft(d).filter((v) => v.status === 'OPEN').length, 0)
    gHours += hours; gAmount += amount; gShifts += rows.length; gMissedH += mH; gMissedA += mA; gDrafts += g.drafts.length; gOpenReviews += openRev

    // Pay-rule check: one calculation per real day, all of this person's entries on that
    // day joined (incl. what was already paid for a missed shift's real day in an earlier payroll).
    const ruleByDate: Record<string, RuleDayCheck> = {}
    if (ruleApplies(sid)) {
      const dates = Array.from(new Set(rows.map((r) => r.work_date)))
      for (const date of dates) {
        const dayRows = rows.filter((r) => r.work_date === date)
        const priorRows = date < weekStart ? prior.filter((p) => p.staff_id === sid && p.work_date === date) : []
        const segs = [...dayRows.map((r) => ruleSegmentFor(sid, r.work_type, r.start_time, r.end_time, [r.outlet_venue, r.event_name, r.work_description].join(' '), r.id, date)), ...priorRows.map((p) => ruleSegmentFor(sid, p.work_type, p.start_time, p.end_time, p.outlet_venue, 0, date))]
        const rule = computeRuleDay(date, segs)
        const paidTotal = dayRows.reduce((a, r) => a + Number(r.amount || 0), 0) + priorRows.reduce((a, p) => a + Number(p.amount || 0), 0)
        const diff = Math.round((paidTotal - rule.amount) * 100) / 100
        if (priorRows.length && Math.abs(diff) >= 0.5) {
          // Where does the difference sit? If the earlier payroll's own entries already differ
          // from the rule by the same amount, this week's missed-shift entry is right as an add-on.
          const priorOnly = computeRuleDay(date, priorRows.map((p) => ruleSegmentFor(sid, p.work_type, p.start_time, p.end_time, p.outlet_venue)))
          const priorPaid = priorRows.reduce((a, p) => a + Number(p.amount || 0), 0)
          const priorDiff = Math.round((priorPaid - priorOnly.amount) * 100) / 100
          if (Math.abs(diff - priorDiff) < 0.5) rule.notes.push(`the whole difference sits in the EARLIER payroll's entry (paid ${fmtRand(priorPaid)}, rule ${fmtRand(priorOnly.amount)}); this week's missed-shift entry is correct as an add-on`)
          else if (Math.abs(priorDiff) >= 0.5) rule.notes.push(`of this, ${priorDiff > 0 ? '+' : '\u2212'}${fmtRand(Math.abs(priorDiff))} sits in the earlier payroll's entry`)
        }
        const chk: RuleDayCheck = { staffId: sid, name: g.name, date, paid: paidTotal, rule, diff, shiftIds: dayRows.map((r) => r.id),
          entries: [...dayRows.map((r) => `${r.start_time}–${r.end_time} ${r.work_type || ''} ${fmtRand(r.amount)}`), ...priorRows.map((p) => `${p.start_time}–${p.end_time} ${p.work_type || ''} ${fmtRand(p.amount)} (paid in payroll ${p.payroll_week_start || 'n/a'})`)], priorIncluded: priorRows.length > 0 }
        ruleByDate[date] = chk
        if (Math.abs(diff) >= 0.5) { ruleDiffsAll.push(chk); gRuleDays++; gRuleAmount += diff; if (diff > 0) gRuleOver += diff; else gRuleUnder += -diff }
      }
    }
    const ruleDiffDays = Object.values(ruleByDate).filter((c) => Math.abs(c.diff) >= 0.5).sort((a, b) => a.date.localeCompare(b.date))
    const rulePill = (c: RuleDayCheck) => c.diff > 0 ? pill('RULE: paid ' + fmtRand(c.diff) + ' MORE than rule', '#7f1d1d', '#fff') : pill('RULE: paid ' + fmtRand(-c.diff) + ' LESS than rule', '#1e3a8a', '#fff')
    const ruleDetail = (c: RuleDayCheck) => `<div style="padding:6px 0;border-top:1px solid rgba(255,255,255,.08);font-size:12.5px"><strong>${escapeHtmlText(c.date)} (${dayName(c.date)})</strong> · day as one: ${escapeHtmlText(c.rule.span)} — <strong>paid ${fmtRand(c.paid)}</strong> vs <strong>rule ${fmtRand(c.rule.amount)}</strong> → ${rulePill(c)}<div style="opacity:.85;margin-top:2px">Rule: ${escapeHtmlText(ruleBreakdownText(c.rule))}${c.rule.notes.length ? ' · ' + escapeHtmlText(c.rule.notes.join('; ')) : ''}</div><div style="opacity:.7;margin-top:2px">Entries paid: ${c.entries.map((e) => escapeHtmlText(e)).join(' · ')}${c.priorIncluded ? ' · <em>includes what was already paid for this real day in an earlier payroll</em>' : ''}</div></div>`

    const paidTrs = rows.map((r) => {
      const isMissed = r.work_date < weekStart
      const revs = reviewsForPaid(r)
      const hasRed = revs.some((v) => v.status === 'OPEN' && v.severity === 'red')
      const ruleChk = ruleByDate[r.work_date]
      const ruleOff = !!ruleChk && Math.abs(ruleChk.diff) >= 0.5
      const rowBg = hasRed ? 'background:rgba(127,29,29,.18)' : ruleOff ? 'background:rgba(30,58,138,.14)' : isMissed ? 'background:rgba(226,185,59,.07)' : ''
      const flags = [
        isMissed ? `<span title="CATCH-UP: worked in the previous payroll (already paid out), entered late, paid in this payroll">${pill('CATCH-UP', '#fdecec', '#7f1d1d')}</span>` : '',
        hasRed ? pill('⚑ REVIEW', '#7f1d1d', '#fff') : revs.some((v) => v.status === 'OPEN') ? pill('⚑ review', '#b45309', '#fff') : '',
        r.overnight_confirmed ? pill('next day', '#1e3a8a', '#fff') : '',
        r.manager_update_reason ? pill('corrected', '#1f5f3a', '#fff') : '',
        (() => { const bp = beyondPlanned(r); return bp ? pill('⏰ CLAIMED PAST ' + escapeHtmlText(bp.planned_end), '#7f1d1d', '#fff') : '' })(),
        ownerNotesForRow(r, false),
      ].join('')
      return `<tr style="border-top:1px solid rgba(255,255,255,.08);${rowBg}">
        ${td(escapeHtmlText(g.name), 'font-weight:700;white-space:nowrap')}
        ${td(`<strong>${escapeHtmlText(r.work_date)}</strong><br><span style="opacity:.75">${escapeHtmlText(dayName(r.work_date))}</span>`, 'white-space:nowrap')}
        ${td(flags || '<span style="opacity:.45">—</span>')}
        ${td(escapeHtmlText(r.outlet_venue) + (r.area ? '<br><span style="opacity:.7">' + escapeHtmlText(r.area) + '</span>' : ''))}
        ${td(escapeHtmlText(r.event_name || ''))}
        ${td(escapeHtmlText(r.work_description || ''))}
        ${td(escapeHtmlText(r.start_time) + '–' + escapeHtmlText(r.end_time), 'white-space:nowrap')}
        ${td(escapeHtmlText(r.work_type || ''))}
        ${td((() => {
          // Owner 2026-09-23: "7 to 7:30 is a meeting, so that can't be 9 hours." Show the PAID hours, with the clocked
          // hours underneath, whenever the amount is on fewer hours than were clocked (warehouse meeting, R0 rows).
          const clocked = Number(r.hours_worked || 0), amt = Number(r.amount || 0), rate = Number((r as any).hourly_rate_snapshot || 0)
          if (amt === 0 && clocked > 0) return `<strong>0.00</strong><br><span style="opacity:.6;font-size:11px">${clocked.toFixed(2)} clocked · R0</span>`
          if (rate > 0 && amt > 0) { const paidH = Math.round(amt / rate * 100) / 100; if (Math.abs(paidH - clocked) >= 0.24 && paidH < clocked) return `<strong>${paidH.toFixed(2)}</strong><br><span style="opacity:.6;font-size:11px">${clocked.toFixed(2)} clocked − ${(clocked - paidH).toFixed(2)} meeting</span>` }
          return clocked.toFixed(2)
        })(), 'text-align:right;white-space:nowrap')}
        ${td(fmtRand(r.amount), 'text-align:right;white-space:nowrap;font-weight:700')}
        ${td(missedCell(r), 'min-width:240px')}
        ${td((revs.length ? reviewCell(revs, true, editBtn(r.id)) : editBtn(r.id)) + (r.manager_update_reason ? `<div style="font-size:12px;color:#86efac">Corrected: ${escapeHtmlText(r.manager_update_reason)}</div>` : ''), 'min-width:260px')}
        ${td(editBtn(r.id, '✎'), 'text-align:center;white-space:nowrap')}
      </tr>`
    }).join('')

    const draftTrs = g.drafts.map((d) => {
      const revs = reviewsForDraft(d)
      const isMissed = d.work_date < weekStart || d.missed_previous_week === 1
      return `<tr style="border-top:1px dashed rgba(255,255,255,.12);opacity:.85">
        ${td(escapeHtmlText(g.name), 'font-weight:700;white-space:nowrap')}
        ${td(`<strong>${escapeHtmlText(d.work_date)}</strong><br><span style="opacity:.75">${escapeHtmlText(dayName(d.work_date))}</span>`, 'white-space:nowrap')}
        ${td(pill('NOT FINAL-SUBMITTED', '#374151', '#fff') + (isMissed ? `<span title="CATCH-UP: worked in the previous payroll (already paid out), entered late, paid in this payroll once final-submitted">${pill('CATCH-UP', '#fdecec', '#7f1d1d')}</span>` : '') + (revs.some((v) => v.status === 'OPEN') ? pill('⚑ review', '#b45309', '#fff') : '') + ownerNotesForRow({ staff_id: sid, work_date: d.work_date, start_time: d.start_time, end_time: d.end_time, work_type: d.work_type, outlet_venue: d.outlet_venue }, true))}
        ${td(escapeHtmlText(d.outlet_venue))}
        ${td('')}
        ${td(escapeHtmlText(d.work_description || ''))}
        ${td(escapeHtmlText(d.start_time) + '–' + escapeHtmlText(d.end_time), 'white-space:nowrap')}
        ${td(escapeHtmlText(d.work_type || ''))}
        ${(() => { const dec = revs.filter((v) => v.status === 'RESOLVED').sort((a, b) => b.id - a.id)[0]; let ds: any = null; try { ds = dec?.system_snapshot_json ? JSON.parse(dec.system_snapshot_json) : null } catch (err) {}
          if (ds?.paidBefore && ds.approvedAmount !== undefined) return td(`<span style="color:#86efac;font-weight:700">${Number(dec.approved_payable_hours || 0).toFixed(2)} h extra</span>`, 'text-align:right;white-space:nowrap') + td(`<span style="color:#86efac;font-weight:700">${fmtRand(Number(ds.approvedAmount))}</span><div style="font-size:11px;opacity:.7">approved · pays when final-submitted</div>`, 'text-align:right;white-space:nowrap')
          return td('<span style="opacity:.5">not paid</span>', 'text-align:right;white-space:nowrap') + td('<span style="opacity:.5">R0,00</span>', 'text-align:right;white-space:nowrap') })()}
        ${td((isStaleDraft(d)
          ? pill('STALE DRAFT – ' + escapeHtmlText(proxyLongDate(d.work_date)) + ' is before the capture window (' + escapeHtmlText(captureStart) + ')', '#7f1d1d', '#fff') + `<div style="font-size:12px;opacity:.9;margin-top:3px">Cannot be final-submitted any more. If this day was paid in an earlier payroll it must be removed; if it was genuinely never paid, tell the office and it is paid as a correction. ${deleteDraftBtn(d.id, d.work_date)}</div>`
          : isMissed ? pill('CATCH-UP – worked ' + escapeHtmlText(proxyLongDate(d.work_date)) + ' – ' + escapeHtmlText(d.work_description || ''), '#fdecec', '#7f1d1d') + `<div style="font-size:12px;opacity:.85"><strong>What CATCH-UP means:</strong> worked on ${escapeHtmlText(proxyLongDate(d.work_date))} in the <strong>previous payroll</strong> (already paid out), entered late. Saved temporarily by the worker; it will be paid in this payroll once Final Submission is pressed.</div>` : '<div style="font-size:12px;opacity:.8">Saved temporarily by the worker; not yet final-submitted, so not yet in the payroll.</div>') + `<div>${workerAppBtn(sid, d.id)} ${isStaleDraft(d) ? '' : deleteDraftBtn(d.id, d.work_date)}</div>`)}
        ${td(revs.length ? reviewCell(revs, true, workerAppBtn(sid, d.id)) : workerAppBtn(sid, d.id), 'min-width:260px')}
        ${td(workerAppBtn(sid, d.id, '✎'), 'text-align:center;white-space:nowrap')}
      </tr>`
    }).join('')

    const openLink = `<a href="/wages/login?staff=${sid}" target="_blank" rel="noopener" style="display:inline-block;padding:5px 10px;border-radius:8px;background:#e2b93b;color:#111;font-weight:800;font-size:12px;text-decoration:none;margin-left:10px">Open ${escapeHtmlText(g.name.split(' ')[0])}'s worker app ↗</a>`

    // AGREED figures (owner's request 2026-09-14): what the person is owed after
    // the office's recorded review decisions. Paid rows without a review keep
    // their paid figures; rows with a decided review take the approved hours.
    // Amount for adjusted hours is priced with the owner's pay rule on the
    // approved window when known, otherwise proportionally (marked ≈). Display only.
    let agreedH = 0, agreedA = 0, agreedApprox = false, agreedChanged = 0
    const personHasOpen = openRev > 0
    rows.forEach((r) => {
      // Place clicks (rate choice / crew pattern) and Petrus/holiday add-ons change the ROW itself, not the hours.
      const decided = reviewsForPaid(r).filter((v) => v.status === 'RESOLVED' && v.approved_payable_hours !== null && v.approved_payable_hours !== undefined && !/^(rate_choice_|petrus_extra|public_holiday|crew_pattern\|)/.test(v.issue_key || '')).sort((a, b) => b.id - a.id)[0]
      const paidH = Number(r.hours_worked || 0), paidA = Number(r.amount || 0)
      // Owner 2026-09-23: an OWNER CORRECTION on the row is the final word — the green figure shows the row as corrected.
      if (!decided || r.manager_update_reason) { agreedH += paidA === 0 ? 0 : paidH; agreedA += paidA; return }
      const ah = Number(decided.approved_payable_hours)
      // "Already paid" review decided as a RAND amount: that amount is what this entry pays.
      let dsnap: any = null; try { dsnap = decided.system_snapshot_json ? JSON.parse(decided.system_snapshot_json) : null } catch (err) {}
      if (dsnap?.paidBefore && dsnap.approvedAmount !== undefined) { agreedH += ah; agreedA += Number(dsnap.approvedAmount); if (Math.abs(Number(dsnap.approvedAmount) - paidA) >= 0.01) agreedChanged++; return }
      agreedH += ah
      if (Math.abs(ah - paidH) < 0.01) { agreedA += paidA; return }
      agreedChanged++
      if (ah <= 0) return
      let snap: any = null
      try { snap = decided.system_snapshot_json ? JSON.parse(decided.system_snapshot_json) : null } catch (err) {}
      const st = (decided as any).approved_start_time || snap?.recommendedStart, en = (decided as any).approved_end_time || snap?.recommendedEnd
      if (st && en && timeToMinutes(st) !== null && timeToMinutes(en) !== null && ruleApplies(sid)) {
        agreedA += computeRuleDay(r.work_date, [ruleSegmentFor(sid, r.work_type, st, en, [r.outlet_venue, r.event_name, r.work_description].join(' '), r.id, r.work_date)]).amount
      } else {
        // Owner 2026-09-22 (Givemore 17 Sep): partial hours are priced at the row's own hourly rule —
        // WAREHOUSE / VENUE click honoured — as the LAST `ah` hours of the entry (same as the Excel sheet).
        const placeRv = reviewsForPaid(r).filter((v) => /^(rate_choice_|crew_pattern\|)/.test(v.issue_key || '') && v.status === 'RESOLVED' && /chosen/i.test(v.decision_reason || '')).sort((a, b) => b.id - a.id)[0]
        const baseKind = applyDayRuleKind(r.work_date, ownerPayKind(sid, r.work_type, [r.outlet_venue, r.event_name, r.work_description].join(' '), staffBase[sid]?.payroll_rule || 'hourly'))
        const kindP: OwnerPayKind = placeRv ? (/^warehouse/i.test((placeRv.decision_reason || '').trim()) ? 'warehouse' : 'event') : (baseKind === 'warehouse_or_event' ? 'event' : baseKind)
        const s0 = timeToMinutes(r.start_time), e0 = timeToMinutes(r.end_time)
        let priced: OwnerPriced | null = null
        if (s0 !== null && e0 !== null && ruleApplies(sid)) {
          const e = e0 <= s0 ? e0 + 1440 : e0; const ns = Math.max(s0, e - Math.round(ah * 60))
          const stP = String(Math.floor((ns % 1440) / 60)).padStart(2, '0') + ':' + String(ns % 60).padStart(2, '0')
          priced = ownerPayForShift(r.work_date, stP, r.end_time, kindP)
        }
        if (priced) agreedA += priced.amount
        else if (paidH > 0) { agreedA += Math.round(paidA * (ah / paidH) * 100) / 100; agreedApprox = true }
      }
    })
    // Owner 2026-09-22: an "already paid" review approved as a rand amount on a DRAFT (not yet
    // final-submitted) is money Bernie has approved for this payroll — show it now, not R0.
    let draftApprovedA = 0, draftApprovedH = 0, draftApprovedN = 0
    g.drafts.forEach((d) => {
      const dec = reviewsForDraft(d).filter((v) => v.status === 'RESOLVED').sort((a, b) => b.id - a.id)[0]
      if (!dec) return
      let ds: any = null; try { ds = dec.system_snapshot_json ? JSON.parse(dec.system_snapshot_json) : null } catch (err) {}
      if (ds?.paidBefore && ds.approvedAmount !== undefined) { draftApprovedA += Number(ds.approvedAmount); draftApprovedH += Number(dec.approved_payable_hours || 0); draftApprovedN++ }
    })
    agreedH += draftApprovedH; agreedA += draftApprovedA
    gAgreedH += agreedH; gAgreedA += agreedA; if (personHasOpen) gAgreedPending++
    // Green text directly to the right of the yellow claimed figure (owner's spec):
    // "Admin approved: X hours · RY". Display only.
    const agreedHtml = (rows.length || draftApprovedN)
      ? (personHasOpen
        ? `<span style="color:#fbbf24;font-weight:700;margin-left:12px" title="The approved figure shows once every open review for this person has a recorded decision">Admin approved: ${openRev} review${openRev === 1 ? '' : 's'} still open</span>`
        : `<span style="color:#86efac;font-weight:700;margin-left:12px" title="Claimed hours less what your resolved reviews took off">Admin approved: ${agreedH.toFixed(2)} hours · ${agreedApprox ? '≈' : ''}${fmtRand(agreedA)}</span>${draftApprovedN ? `<span style="color:#86efac;margin-left:8px;font-size:12px">(includes ${fmtRand(draftApprovedA)} approved on ${draftApprovedN} entr${draftApprovedN === 1 ? 'y' : 'ies'} awaiting Final Submission)</span>` : ''}`)
      : ''
    const personOpenReviews = [...rows.flatMap((r) => reviewsForPaid(r)), ...g.drafts.flatMap((d) => reviewsForDraft(d))].filter((v) => v.status === 'OPEN')
    const personReviewsHtml = personOpenReviews.length
      ? `<div id="bw-person-reviews-${sid}" style="display:none;margin:8px 0 4px;padding:10px 12px;border-radius:10px;background:rgba(180,83,9,.12);border:1px solid rgba(180,83,9,.5)"><div style="font-weight:800;color:#f59e0b;margin-bottom:6px">Open reviews for ${escapeHtmlText(g.name)} — ${personOpenReviews.length}</div>${personOpenReviews.map((v) => {
          const subj = v.subject_source === 'shift' ? rows.find((r) => r.id === v.subject_shift_id) : rows.find((r) => r.source_draft_id === v.subject_shift_id)
          const dr = !subj && v.subject_source === 'draft' ? g.drafts.find((d) => d.id === v.subject_shift_id) : null
          const line = subj ? `${escapeHtmlText(subj.work_date)} (${dayName(subj.work_date)}) ${escapeHtmlText(subj.start_time)}–${escapeHtmlText(subj.end_time)} · ${escapeHtmlText(subj.outlet_venue)} · ${Number(subj.hours_worked || 0).toFixed(2)} h · ${fmtRand(subj.amount)}` : dr ? `${escapeHtmlText(dr.work_date)} (${dayName(dr.work_date)}) ${escapeHtmlText(dr.start_time)}–${escapeHtmlText(dr.end_time)} · ${escapeHtmlText(dr.outlet_venue)} · not final-submitted` : escapeHtmlText(v.work_date)
          return `<div style="padding:6px 0;border-top:1px solid rgba(255,255,255,.08)"><div style="font-size:12.5px;margin-bottom:2px"><strong>${line}</strong></div>${reviewCell([v])}</div>`
        }).join('')}</div>`
      : ''
    const personRuleHtml = '' // Owner 2026-09-23: pay-rule check retired
    const ruleSummaryPill = '' // Owner 2026-09-23: pay-rule check retired
    const flagsSummary = ruleSummaryPill + (openRev ? `<a href="#" onclick="var b=document.getElementById('bw-person-reviews-${sid}');if(b){b.style.display=b.style.display==='none'?'block':'none'}return false" style="text-decoration:none">${pill('⚑ ' + openRev + ' open review' + (openRev === 1 ? '' : 's') + ' ▾', '#b45309', '#fff')}</a>` : '') + (missed.length ? pill(missed.length + ' missed shift' + (missed.length === 1 ? '' : 's') + ' · ' + mH.toFixed(2) + ' h · ' + fmtRand(mA), '#fdecec', '#7f1d1d') : '') + (g.drafts.length ? pill(g.drafts.length + ' not final-submitted', '#374151', '#fff') : '')
    return `<tr><td colspan="13" style="padding:14px 10px 6px;border-top:2px solid rgba(226,185,59,.5)">
        <span style="color:#e2b93b;font-weight:800;text-transform:uppercase;font-size:11px;letter-spacing:.06em;margin-right:8px">Name</span><strong style="font-size:15px">${escapeHtmlText(g.name)}</strong>
        <span style="color:#e2b93b;font-weight:700;margin-left:10px" title="Final-submitted and paid (before review decisions)">${hours.toFixed(2)} hours · ${fmtRand(amount)}</span>${agreedHtml}${openLink}<div style="margin-top:6px">${flagsSummary}</div>${personReviewsHtml}${personRuleHtml}</td></tr>
      ${paidTrs}${draftTrs}
      <tr><td colspan="13" style="padding:6px 10px 12px;color:#e2b93b;font-weight:700">Subtotal for ${escapeHtmlText(g.name)} — ${rows.length} paid shift${rows.length === 1 ? '' : 's'} · ${hours.toFixed(2)} h · ${fmtRand(amount)}${rows.length && !personHasOpen ? ` <span style="color:#86efac">· agreed after reviews ${agreedH.toFixed(2)} h · ${agreedApprox ? '≈' : ''}${fmtRand(agreedA)}</span>` : ''}${missed.length ? ` <span style="opacity:.85">(includes ${missed.length} missed: ${mH.toFixed(2)} h · ${fmtRand(mA)})</span>` : ''}${g.drafts.length ? ` <span style="opacity:.7">· ${g.drafts.length} still awaiting Final Submission (not counted)</span>` : ''}</td></tr>`
  }).join('')

  const filterNote = employeeFilter && /^\d+$/.test(employeeFilter) ? ' — one employee selected' : ''
  return `<section id="bw-combined-sheet" class="card" style="margin:14px 0;padding:16px 18px;border-radius:14px;border:1px solid rgba(226,185,59,.45)">
    <h2 style="margin:0 0 4px">Wage sheet — combined (${escapeHtmlText(weekStart)} to ${escapeHtmlText(weekEnd)})${filterNote}</h2>
    <div id="bw-catchup-legend" style="margin:0 0 10px;padding:8px 12px;border-radius:10px;background:rgba(127,29,29,.14);border:1px solid rgba(252,165,165,.45);font-size:12.5px"><strong style="color:#fecaca">CATCH-UP</strong> = a shift the worker did in a <strong>previous payroll week</strong> (that payroll has already been paid out) but only entered afterwards. It is paid now, in this payroll, and shows the <strong>real date worked</strong>. The system checks it against what was already paid for that day (OVERLAP / CLEAR) so no hour is paid twice. The day was not missed — the entry was late.</div>
    <p style="margin:0 0 10px;opacity:.8">Every worker with anything in this payroll, all their shifts together: in-week shifts <strong>and</strong> catch-ups paid this week (shown at their real date), review flags with the recommended figure and the reason to record, and shifts still waiting for Final Submission. Totals here <strong>include</strong> missed shifts, so they are the true payroll figures. Use the worker-app link on each name to open that person's own page and edit or final-submit for them.</p>
    ${(() => {
      const allOpen = reviews.filter((v) => v.status === 'OPEN' && staffIds.includes(v.staff_id)).sort((a, b) => (a.severity === 'red' ? 0 : 1) - (b.severity === 'red' ? 0 : 1) || (byStaff[a.staff_id]?.name || '').localeCompare(byStaff[b.staff_id]?.name || '') || a.work_date.localeCompare(b.work_date))
      if (!allOpen.length) return `<div style="margin:6px 0 12px;padding:8px 12px;border-radius:10px;background:rgba(20,83,45,.25);color:#86efac;font-weight:700">No open reviews for this payroll week.</div>`
      const lines = allOpen.map((v) => {
        const grp = byStaff[v.staff_id]
        const subj = grp ? (v.subject_source === 'shift' ? grp.paid.find((r) => r.id === v.subject_shift_id) : grp.paid.find((r) => r.source_draft_id === v.subject_shift_id)) : undefined
        const dr = grp && !subj && v.subject_source === 'draft' ? grp.drafts.find((d) => d.id === v.subject_shift_id) : undefined
        const what = subj ? `${escapeHtmlText(subj.start_time)}–${escapeHtmlText(subj.end_time)} · ${escapeHtmlText(subj.outlet_venue)} · ${Number(subj.hours_worked || 0).toFixed(2)} h · ${fmtRand(subj.amount)}` : dr ? `${escapeHtmlText(dr.start_time)}–${escapeHtmlText(dr.end_time)} · ${escapeHtmlText(dr.outlet_venue)} · not final-submitted` : ''
        const red = v.severity === 'red'
        const recTxt = v.system_proposed_payable_hours !== null && v.system_proposed_payable_hours !== undefined ? ` → recommend <strong>${Number(v.system_proposed_payable_hours).toFixed(2)} h</strong>` : ''
        return `<div style="display:flex;gap:8px;align-items:flex-start;padding:5px 0;border-top:1px solid rgba(255,255,255,.08);font-size:12.5px">
          <span style="flex:0 0 auto">${red ? pill('ACTION', '#7f1d1d', '#fff') : pill('check', '#b45309', '#fff')}</span>
          <div style="flex:1"><strong>${escapeHtmlText(grp?.name || ('staff ' + v.staff_id))}</strong> · ${escapeHtmlText(v.work_date)} (${dayName(v.work_date)}) · ${what}${recTxt}
            <span style="opacity:.6"> #${v.id}</span>
            <a href="#" onclick="var b=document.getElementById('bw-top-review-${v.id}');if(b){b.style.display=b.style.display==='none'?'block':'none'}return false" style="margin-left:8px;color:#e2b93b;font-weight:700">Open ▾</a>
            <div id="bw-top-review-${v.id}" style="display:none;margin-top:4px">${reviewCell([v])}</div>
          </div></div>`
      }).join('')
      return `<section id="bw-open-reviews" style="margin:6px 0 14px;padding:10px 14px;border-radius:12px;background:rgba(180,83,9,.10);border:1px solid rgba(180,83,9,.55)">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><div style="font-weight:800;color:#f59e0b">⚑ Open reviews — ${allOpen.length} (${allOpen.filter((v) => v.severity === 'red').length} need action)</div><a href="#" onclick="var b=document.getElementById('bw-open-reviews-list');b.style.display=b.style.display==='none'?'block':'none';return false" style="color:#e2b93b;font-weight:700;font-size:12px">show / hide list</a></div>
        <div id="bw-open-reviews-list" style="margin-top:6px">${lines}</div>
      </section>`
    })()}
    ${'' /* Owner 2026-09-23: pay-rule check retired — hourly/daily rules are in place; reviews carry the decisions. */}
    ${(() => {
      // Owner 24 Sep 2026: "Put a note in the system that everyone at the warehouse worked until 13:00 on Saturday
      // 26 Sep, so when they start putting their hours in we can triple-check it." Every planned end for a day in
      // THIS payroll week is shown here as a standing reminder; entries past it carry the red ⏰ pill on the row.
      const days = Object.values(plannedEnds).filter((p) => p.work_date >= weekStart && p.work_date <= weekEnd).sort((a, b) => a.work_date.localeCompare(b.work_date))
      const ruleDays = Object.values(dayRules).filter((d) => d.work_date >= weekStart && d.work_date <= weekEnd).sort((a, b) => a.work_date.localeCompare(b.work_date))
      if (!days.length && !ruleDays.length) return ''
      const li = days.map((p) => {
        const rowsThatDay = paid.filter((r: AdminPaidRow) => r.work_date === p.work_date)
        const over = rowsThatDay.filter((r: AdminPaidRow) => beyondPlanned(r))
        const state = rowsThatDay.length ? `${rowsThatDay.length} entr${rowsThatDay.length === 1 ? 'y' : 'ies'} in so far · <strong style="color:${over.length ? '#fca5a5' : '#86efac'}">${over.length ? over.length + ' claim past ' + escapeHtmlText(p.planned_end) + ' — see the ⏰ pill on the row' : 'none past ' + escapeHtmlText(p.planned_end)}</strong>` : 'no entries in yet'
        return `<li style="margin:3px 0"><strong>${escapeHtmlText(proxyLongDate(p.work_date))} — work ended ${escapeHtmlText(p.planned_end)}</strong>${p.note ? ` <span style="opacity:.8">(${escapeHtmlText(p.note)})</span>` : ''}<br><span style="font-size:12px">${state}</span></li>`
      }).join('')
      const ruleLi = ruleDays.map((d) => {
        const offNames = d.staff_off.map((id) => offNameById[id] || ('staff ' + id))
        const rowsThatDay = paid.filter((r: AdminPaidRow) => r.work_date === d.work_date)
        const offClaims = rowsThatDay.filter((r: AdminPaidRow) => d.staff_off.includes(r.staff_id))
        const parts: string[] = []
        if (d.force_kind === 'event') parts.push(`<strong>everyone at the VENUE rate</strong> (R95/h · Sunday R114/h) — Warehouse ticks are re-priced as venue automatically`)
        if (d.force_kind === 'warehouse') parts.push(`<strong>everyone at the WAREHOUSE rate</strong>`)
        const winIds = Array.from(new Set([...Object.keys(d.staff_start || {}), ...Object.keys(d.staff_end || {}), ...Object.keys(d.staff_windows || {})].map(Number)))
        for (const sid of winIds) { const wins = ownerWindowsFor(d, sid); const claims = rowsThatDay.filter((r: AdminPaidRow) => r.staff_id === sid); const outside = claims.some((r: AdminPaidRow) => { const s0 = timeToMinutes(r.start_time)!, e0 = timeToMinutes(r.end_time)!; return ownerWindowOverlap(r.start_time, r.end_time, wins).minutes < (e0 <= s0 ? e0 + 1440 : e0) - s0 - 0.5 }); parts.push(`<strong>${escapeHtmlText(offNameById[sid] || ('staff ' + sid))} only ${wins.map((w) => escapeHtmlText(w.start + '–' + w.end + (w.place ? ' ' + w.place : ''))).join(' and ')}</strong> — paid inside those times whatever he enters${claims.length ? (outside ? ' <span style="color:#fca5a5;font-weight:800">⚠ he entered time outside it — capped, red review to override</span>' : ' <span style="color:#86efac">— his entry is inside the window</span>') : ' <span style="opacity:.75">— no entry from him yet</span>'}`) }
        if (offNames.length) parts.push(`<strong>OFF — not allowed to claim:</strong> ${offNames.map(escapeHtmlText).join(', ')}${offClaims.length ? ` <span style="color:#fca5a5;font-weight:800">⚠ ${offClaims.length} of them entered a shift anyway — held at R0, see the red review</span>` : ' <span style="color:#86efac">— no claims from them so far</span>'}`)
        return `<li style="margin:3px 0"><strong>${escapeHtmlText(proxyLongDate(d.work_date))}</strong> — ${parts.join(' · ')}${d.note ? ` <span style="opacity:.8">(${escapeHtmlText(d.note)})</span>` : ''}<br><span style="font-size:12px">${rowsThatDay.length ? rowsThatDay.length + ' entr' + (rowsThatDay.length === 1 ? 'y' : 'ies') + ' in so far' : 'no entries in yet'}</span></li>`
      }).join('')
      return `<section id="bw-planned-end-note" style="margin:6px 0 12px;padding:9px 14px;border-radius:12px;background:rgba(202,138,4,.15);border:1px solid rgba(253,224,71,.55)">
        <div style="font-weight:800;color:#fde68a;font-size:13.5px">📌 Owner's notes for this week</div>
        <ul style="margin:4px 0 0 16px;padding:0;font-size:12.5px">${ruleLi}${li}</ul>
        <div style="font-size:11.5px;opacity:.7;margin-top:4px">Any entry that runs past the set time is flagged red <strong>⏰ CLAIMED PAST</strong> on the row. Ask the worker what time he really finished and use ✎ Edit shift to correct.</div>
      </section>`
    })()}
    ${followUpPanel}
    ${ownSchedulePanel}
    ${weeklyAmountPanel}
    ${paidCheckPanel}
    ${petrusPanel}
    ${preSubmitPanel}
    <div style="display:flex;gap:18px;flex-wrap:wrap;margin:6px 0 12px;font-size:13px">
      <div><span style="opacity:.7">Paid shifts</span><br><strong style="font-size:18px">${gShifts}</strong></div>
      <div><span style="opacity:.7">Total hours</span><br><strong style="font-size:18px">${gHours.toFixed(2)}</strong></div>
      <div><span style="opacity:.7">Total wages (incl. catch-ups)</span><br><strong style="font-size:18px;color:#e2b93b">${fmtRand(gAmount)}</strong></div>
      <div><span style="opacity:.7">Agreed after reviews</span><br><strong style="font-size:18px;color:${gAgreedPending ? '#fbbf24' : '#86efac'}">${gAgreedH.toFixed(2)} h · ${fmtRand(gAgreedA)}</strong>${gAgreedPending ? `<span style="font-size:12px;opacity:.85"> · ${gAgreedPending} person${gAgreedPending === 1 ? '' : 's'} with open reviews (their paid figures used meanwhile)</span>` : ''}</div>
      <div><span style="opacity:.7" title="Catch-ups: shifts worked in the previous payroll (already paid out), entered late, paid in this payroll">of which CATCH-UPS</span><br><strong style="font-size:18px">${gMissedH.toFixed(2)} h · ${fmtRand(gMissedA)}</strong></div>
      <div><span style="opacity:.7">Open reviews</span><br><strong style="font-size:18px;color:${gOpenReviews ? '#fca5a5' : '#86efac'}">${gOpenReviews}</strong></div>
      <div><span style="opacity:.7">Awaiting Final Submission</span><br><strong style="font-size:18px">${gDrafts}</strong></div>
    </div>
    <div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr>${th('Name')}${th('Date / day')}${th('Flags')}${th('Outlet / venue')}${th('Event')}${th('Description')}${th('Time worked')}${th('Work type')}${th('Hours', 'text-align:right')}${th('Amount', 'text-align:right')}${th('Missed shift detail & cross-check')}${th('Review / correction')}${th('Edit')}</tr></thead>
      <tbody>${sections}</tbody>
      <tfoot><tr style="border-top:2px solid rgba(226,185,59,.6);font-weight:800"><td colspan="8" style="padding:12px 10px">GRAND TOTAL (incl. catch-ups) — ${gShifts} paid shifts</td><td style="padding:12px 10px;text-align:right">${gHours.toFixed(2)}</td><td style="padding:12px 10px;text-align:right;color:#e2b93b;font-size:15px">${fmtRand(gAmount)}</td><td colspan="3" style="padding:12px 10px;opacity:.8">Missed shifts included: ${gMissedH.toFixed(2)} h · ${fmtRand(gMissedA)}</td></tr></tfoot>
    </table></div>
  </section>`
}

class AdminMissedPaidInjector {
  constructor(private html: string) {}
  element(element: Element) {
    // Fallback position (top of <main>) if the engine's wage-sheet card is not found.
    if (this.html) element.prepend(this.html, { html: true })
  }
}

// Places the combined sheet exactly where the engine's own "Wage sheet" card
// is, and hides the engine's card (its totals exclude missed shifts). Done in
// the browser because the card has no stable id.
class AdminCombinedPlacementInjector {
  element(element: Element) {
    element.append(`<script>
(function(){
  // Owner 2026-09-21: "already paid" review — typing extra hours re-prices live at the entry's rate.
  function rand(n){ n=Math.round(n*100)/100; var s=n.toFixed(2).replace('.',','); return 'R'+s.replace(/\\\\B(?=(\\\\d{3})+(?!\\\\d))/g,' '); }
  function wirePb(){
    document.querySelectorAll('details.bw-pb-adjust').forEach(function(d){
      if(d.dataset.bwWired) return; d.dataset.bwWired='1';
      var rate=parseFloat(d.dataset.rate||'0'), corr=parseFloat(d.dataset.corr||'0');
      var hrs=d.querySelector('.bw-pb-hours'), cb=d.querySelector('.bw-pb-corr'), tot=d.querySelector('.bw-pb-total'), br=d.querySelector('.bw-pb-breakdown');
      function calc(){ var h=parseFloat(hrs&&hrs.value||'0'); if(!(h>=0)) h=0; var ex=Math.round(h*rate*100)/100; var inc=cb?cb.checked:false; var t=ex+(inc?corr:0); if(tot) tot.textContent=rand(t); if(br) br.textContent=' = '+h.toFixed(2)+' h × '+rand(rate)+' = '+rand(ex)+(inc?' + rate correction '+rand(corr):''); }
      if(hrs){ hrs.addEventListener('input',calc); hrs.addEventListener('change',calc); } if(cb) cb.addEventListener('change',calc); calc();
    });
  }
  document.addEventListener('DOMContentLoaded', wirePb); setTimeout(wirePb, 300); setTimeout(wirePb, 1500);
  function place(){
    var mine=document.getElementById('bw-combined-sheet'); if(!mine||mine.dataset.bwPlaced) return;
    var heads=Array.prototype.slice.call(document.querySelectorAll('h1,h2,h3,.card-title'));
    var h=heads.find(function(x){ return /^\\s*wage sheet\\s*$/i.test((x.textContent||'')); });
    if(!h) return;
    var card=h.closest('section.card, .card, section'); if(!card||card===mine||card.contains(mine)) return;
    card.parentNode.insertBefore(mine, card);
    card.style.display='none'; card.setAttribute('data-bw-engine-sheet-hidden','1');
    mine.dataset.bwPlaced='1';
    try{ var ex=document.querySelector('a[href*="/admin/wages/export.xlsx"]'); if(ex&&!document.getElementById('bw-payroll-xlsx')){ var q=(ex.getAttribute('href').split('?')[1]||''); var b=document.createElement('a'); b.id='bw-payroll-xlsx'; b.className=ex.className; b.href='/wages-admin/payroll.xlsx?'+q; b.textContent='Download Payroll Excel (new)'; b.title='Sat\u2013Fri + Missed Shifts block, approved hours, no bonus columns'; b.style.marginLeft='6px'; ex.parentNode.insertBefore(b, ex.nextSibling); ex.textContent='Export Excel (old rules \u2013 reference only)'; ex.className=ex.className.replace('btn-gold','btn-outline'); } }catch(e){}
    var link=document.createElement('a'); link.href='#'; link.textContent='Show the engine\u2019s original wage sheet (in-week shifts only)'; link.style.cssText='display:inline-block;margin:8px 0;font-size:12px;opacity:.7;color:inherit';
    link.onclick=function(e){ e.preventDefault(); card.style.display=''; link.remove(); };
    mine.appendChild(link);
  }
  try{place()}catch(e){}
  document.addEventListener('DOMContentLoaded',function(){try{place()}catch(e){}});
  setTimeout(function(){try{place()}catch(e){}},300);
})();
</script>`, { html: true })
  }
}

class TextReplaceInjector {
  constructor(private value: string) {}
  element(element: Element) {
    element.setInnerContent(this.value)
  }
}

// Stamps the REAL logged-in worker (resolved from the session cookie) onto
// <html data-bw-session-staff="N"> so the page enhancer never has to guess
// from remembered IDs or URL tags.
class SessionStaffStampInjector {
  constructor(private staffId: number) {}
  element(element: Element) {
    if (this.staffId > 0) element.setAttribute('data-bw-session-staff', String(this.staffId))
    else element.removeAttribute('data-bw-session-staff')
  }
}

async function buildMissedPaidSection(env: Bindings | undefined, staffId: number) {
  const db = env?.DB
  if (!db || !staffId) return null
  const weekStart = currentProxyPayrollWeekStart()
  const weekEnd = proxyEndOfPayrollWeek(weekStart)
  const rows = await db.prepare(`SELECT id, work_date, start_time, end_time, outlet_venue, work_description, hours_worked
      FROM wage_shifts WHERE staff_id = ? AND payroll_week_start = ? AND work_date < ? ORDER BY work_date, start_time`)
    .bind(staffId, weekStart, weekStart).all()
  const shifts = (rows.results || []) as Array<{ id: number, work_date: string, start_time: string, end_time: string, outlet_venue: string, work_description: string, hours_worked: number }>
  const inWeek = await db.prepare(`SELECT COALESCE(SUM(hours_worked),0) AS h, COUNT(*) AS n FROM wage_shifts WHERE staff_id = ? AND work_date BETWEEN ? AND ?`)
    .bind(staffId, weekStart, weekEnd).first<{ h: number, n: number }>()
  const missedHours = shifts.reduce((sum, r) => sum + Number(r.hours_worked || 0), 0)
  const totalHours = Number(inWeek?.h || 0) + missedHours
  const totalCount = Number(inWeek?.n || 0) + shifts.length
  if (!shifts.length) return { html: '', totalHours, totalCount, missedHours }
  const cards = shifts.map((r) => `
        <article class="shift"><div class="row"><div><div class="shift-title">${escapeHtmlText(r.outlet_venue)}</div><div class="muted small">${escapeHtmlText(r.work_date)} · ${escapeHtmlText(r.start_time)}–${escapeHtmlText(r.end_time)}</div><div class="muted small">Catch-up (worked last payroll week, entered late, paid this payroll) · ${Number(r.hours_worked || 0).toFixed(2)} h</div></div><strong>${Number(r.hours_worked || 0).toFixed(2)} h</strong></div><div class="pill">Submitted — locked</div><div class="pill bw-missed-detail">MISSED SHIFT – actual date ${escapeHtmlText(proxyLongDate(r.work_date))} – ${escapeHtmlText(r.work_description)}</div></article>`).join('')
  const html = `
    <section class="card bw-missed-paid" data-bw-missed-paid="1"><h2>Catch-up shifts from last week — paid in this payroll</h2><p class="muted">A catch-up is a shift you worked in last week's payroll (already paid out) but only entered afterwards. These show the real date worked and are paid in this payroll week (${weekStart} to ${weekEnd}). Do not enter them again.</p>${cards}</section>`
  return { html, totalHours, totalCount, missedHours }
}


// Server-side work-type enforcement (2026-09-14). Identified from the login
// cookie, never from the page, so a cached/stale page on any device cannot
// submit a work type the worker is not allowed to bill.
const STAFF_ALLOWED_WORK_TYPES: Record<number, string[]> = {
  1: ['House/Garden', 'Warehouse Team'],
  2: ['House/Garden', 'Warehouse Team'],
  3: ['Normal'],
  4: ['Normal', 'Warehouse Team'],
  5: ['Music Bus', 'Normal'],
  6: ['Normal'],
  7: ['Music Bus', 'Normal'],
  8: ['Normal'],
  9: ['Normal'],
  10: ['Normal'],
  11: ['Normal'],
  12: ['Music Bus', 'Normal'],
  13: ['Normal'],
  14: ['Normal'],
  15: ['Music Bus', 'Normal'],
  16: ['Normal'],
}

function allowedWorkTypesFor(staffId: number) {
  return STAFF_ALLOWED_WORK_TYPES[staffId] || ['Normal']
}


// Every Cloudflare Pages deployment stays reachable forever on its own
// <hash>.bw-productions.pages.dev address and keeps serving the code it was
// built with. A worker on a bookmarked old address gets yesterday's proxy
// (no date conversion, hidden errors). Send worker pages on any hash address
// to the live domain. The wages engine's own hash (ORIGIN) is never proxied
// here, and the named preview alias stays usable for testing.
const LIVE_WORKER_HOST = 'bwprodsystem.co.za'
function redirectStaleHostIfNeeded(incomingUrl: URL, method: string): Response | null {
  if (method !== 'GET' && method !== 'HEAD') return null
  if (!/^[0-9a-f]{8}\.bw-productions\.pages\.dev$/i.test(incomingUrl.hostname)) return null
  if (!(incomingUrl.pathname === '/wages' || incomingUrl.pathname.startsWith('/wages/'))) return null
  const target = 'https://' + LIVE_WORKER_HOST + incomingUrl.pathname + incomingUrl.search
  return new Response(null, { status: 302, headers: { location: target, 'cache-control': 'no-store, no-cache, must-revalidate, max-age=0', pragma: 'no-cache', expires: '0' } })
}

async function proxyRequest(c: any) {
  const incomingUrl = new URL(c.req.url)
  const upstreamUrl = new URL(incomingUrl.pathname + incomingUrl.search, ORIGIN)
  const staleHostRedirect = redirectStaleHostIfNeeded(incomingUrl, (c.req.raw.method || 'GET').toUpperCase())
  if (staleHostRedirect) return staleHostRedirect
  rewritePreviousPayrollGetRequest(incomingUrl, upstreamUrl)

  let method = (c.req.raw.method || 'GET').toUpperCase()

  // Safety net (2026-09-14, seen on Patrick's phone): a Final Submission POST
  // that lands on /final-check instead of /final-submit is answered by the
  // engine with a redirect to the ADMIN /login. Treat it as the real
  // final-submit: rewrite the path and body here, then let it flow through the
  // normal final-submit handling below (Saturday parking, real-date restore,
  // error checking) exactly as if the button on the confirmation page was pressed.
  let finalCheckRedirectFix = false
  // Owner 28 Sep 2026 (told several times): NO "Final Shift Check" page. Pressing FINAL SUBMISSION on a shift must
  // final-submit it, full stop. The worker's button is a GET link to /final-check — the proxy treats that GET exactly
  // like the confirmation POST: it performs the final-submit itself (three engine yes-answers filled in) and the
  // worker lands back on the shift list with the result. The engine's check page is never shown.
  const finalCheckGetMatch = (method === 'GET' || method === 'HEAD') && !/[?&]bw_show_check=1/.test(incomingUrl.search) ? incomingUrl.pathname.match(/^\/wages\/drafts\/(\d+)\/final-check\/?$/) : null
  const finalCheckPostMatch = method === 'POST' ? incomingUrl.pathname.match(/^\/wages\/drafts\/(\d+)\/final-check\/?$/) : (finalCheckGetMatch || null)
  if (finalCheckPostMatch) {
    finalCheckRedirectFix = true
    incomingUrl.pathname = '/wages/drafts/' + finalCheckPostMatch[1] + '/final-submit'
    upstreamUrl.pathname = incomingUrl.pathname
    const fixedBody = new URLSearchParams({ time_correct: 'yes', end_time_correct: 'yes', information_complete: 'yes' }).toString()
    const h = new Headers(c.req.raw.headers); h.delete('content-length'); h.set('content-type', 'application/x-www-form-urlencoded;charset=UTF-8')
    c.req.raw = new Request(c.req.raw.url.replace(/\/final-check(\/)?(\?|$)/, '/final-submit$2'), { method: 'POST', headers: h, body: fixedBody })
  }
  if (finalCheckRedirectFix) method = 'POST'

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
  // NOTE (2026-09-14): the proxy must NEVER short-circuit worker saves or Final
  // Submission. Only the upstream wages app creates paid wage_shifts rows
  // (hours, overtime, Sunday rates, amounts). Direct DB writes produced
  // "submitted" drafts with no paid shift and 0.00 hours on the dashboard.
  // Previous-payroll dates are instead converted (see rewriteMissedShiftSubmission)
  // into the format upstream accepts and forwarded normally.
  void isProxyFormPost

  const upstreamHeaders = rewriteRequestHeaders(c.req.raw.headers, incomingUrl, upstreamUrl)

  // Work-type enforcement on every save (server side).
  if (method === 'POST' && isProxyFormPost && /^\/wages\/drafts(?:\/\d+)?\/?$/.test(incomingUrl.pathname) && c.env?.DB) {
    try {
      const peek = await c.req.raw.clone().formData()
      const submittedType = normalizeProxyFieldValue(peek.get('work_type'))
      const staffId = await staffIdFromWageSession(c.env, c.req.raw.headers.get('cookie') || '')
      if (staffId && submittedType) {
        const allowed = allowedWorkTypesFor(staffId)
        if (!allowed.some((t) => t.toLowerCase() === submittedType.toLowerCase())) {
          const back = incomingUrl.pathname === '/wages/drafts' ? '/wages/shift/new' : incomingUrl.pathname + '/edit'
          const msg = 'Work type "' + submittedType + '" is not available for you. Your options are: ' + allowed.join(', ') + '. Please refresh the page and choose again.'
          await captureWagesDebug(c.env, { request_path: incomingUrl.pathname + incomingUrl.search, request_method: 'POST', original_payload_json: JSON.stringify({ staff_id: String(staffId), work_type: submittedType }), rewritten_payload_json: '{}', rewrite_applied: 0, response_status: 302, response_location: back, response_error_text: 'work type rejected: ' + submittedType })
          return new Response(null, { status: 302, headers: { location: back + '?error=' + encodeURIComponent(msg), 'cache-control': 'no-store, no-cache, must-revalidate, max-age=0', pragma: 'no-cache', expires: '0' } })
        }
      }
    } catch (err) {}
  }

  // Real-date restore bookkeeping (see restoreRealDateForMissedShift).
  let realDateRestore: { staffId: number, realDateIso: string, startTime: string, endTime: string, draftIdHint: number } | null = null
  if (method === 'POST' && isProxyFormPost && /^\/wages\/drafts(?:\/\d+)?\/?$/.test(incomingUrl.pathname)) {
    try {
      const peek = await c.req.raw.clone().formData()
      const realIso = normalizeProxyFieldValue(peek.get('bw_actual_work_date')) || normalizeProxyFieldValue(peek.get('work_date'))
      const realDate = parseProxyIsoDate(realIso)
      const captureDate = parseProxyIsoDate(currentProxyPayrollWeekStart())
      if (realDate && captureDate && realDate.getTime() < captureDate.getTime()) {
        const idMatch = incomingUrl.pathname.match(/^\/wages\/drafts\/(\d+)/)
        const staffId = await staffIdFromWageSession(c.env, c.req.raw.headers.get('cookie') || '')
        realDateRestore = {
          staffId,
          realDateIso: realIso,
          startTime: normalizeProxyFieldValue(peek.get('start_time')),
          endTime: normalizeProxyFieldValue(peek.get('end_time')),
          draftIdHint: idMatch ? Number(idMatch[1]) : 0,
        }
      }
    } catch (err) {}
  }
  const finalSubmitMatch = method === 'POST' ? incomingUrl.pathname.match(/^\/wages\/drafts\/(\d+)\/final-submit\/?$/) : null

  // Calendar window guard (owner rule 2026-09-15): last payroll's Saturday → this payroll's Friday.
  if (method === 'POST' && c.env?.DB) {
    const saveMatch = incomingUrl.pathname.match(/^\/wages\/drafts(?:\/(\d+))?\/?$/)
    if (saveMatch && /application\/x-www-form-urlencoded|multipart\/form-data/i.test(c.req.raw.headers.get('content-type') || '')) {
      try {
        const fd = await c.req.raw.clone().formData()
        const iso = normalizeProxyFieldValue(fd.get('bw_actual_work_date')) || normalizeProxyFieldValue(fd.get('bw_visible_work_date')) || normalizeProxyFieldValue(fd.get('work_date'))
        const err = proxyWorkDateWindowError(iso)
        // Owner 2026-09-23: a NEW draft that is the same date + start + end as a draft this worker already has (or as a
        // paid row for those hours) is a double-tap — do not create it; send him to the existing one.
        if (!err && !saveMatch[1]) {
          try {
            const staffId = await staffIdFromWageSession(c.env, c.req.raw.headers.get('cookie') || '')
            const st = normalizeProxyFieldValue(fd.get('start_time')).slice(0, 5), en = normalizeProxyFieldValue(fd.get('end_time')).slice(0, 5)
            if (staffId && iso && st && en) {
              const dupD = await c.env.DB.prepare(`SELECT id, status FROM wage_shift_drafts WHERE staff_id = ? AND work_date = ? AND substr(start_time,1,5) = ? AND substr(end_time,1,5) = ? ORDER BY id DESC LIMIT 1`).bind(staffId, iso, st, en).first<{ id: number, status: string }>()
              const dupS = dupD ? null : await c.env.DB.prepare(`SELECT id FROM wage_shifts WHERE staff_id = ? AND work_date = ? AND substr(start_time,1,5) = ? AND substr(end_time,1,5) = ? AND COALESCE(gross_wage, total_amount, 0) > 0 LIMIT 1`).bind(staffId, iso, st, en).first<{ id: number }>()
              if (dupD || dupS) {
                const msg = dupD && dupD.status === 'draft'
                  ? 'This shift (' + proxyLongDate(iso) + ' ' + st + '–' + en + ') is ALREADY SAVED — it was not lost. Open it below and press Final Submission once.'
                  : 'This shift (' + proxyLongDate(iso) + ' ' + st + '–' + en + ') has ALREADY been submitted' + (dupS ? ' and is in the payroll' : '') + '. It was not entered again. If you worked different hours that day, enter only the different hours.'
                await captureWagesDebug(c.env, { request_path: incomingUrl.pathname, request_method: 'POST', original_payload_json: JSON.stringify({ staff_id: staffId, work_date: iso, start: st, end: en, existing_draft: dupD?.id || null, existing_shift: dupS?.id || null }), rewritten_payload_json: '{}', rewrite_applied: 1, response_status: 302, response_location: 'duplicate-save-block', response_error_text: msg })
                return new Response(null, { status: 302, headers: { location: '/wages/me?error=' + encodeURIComponent(msg), 'cache-control': 'no-store' } })
              }
            }
          } catch (e2) {}
        }
        if (err) {
          await captureWagesDebug(c.env, { request_path: incomingUrl.pathname, request_method: 'POST', original_payload_json: JSON.stringify({ work_date: iso }), rewritten_payload_json: '{}', rewrite_applied: 1, response_status: 302, response_location: 'window-refused', response_error_text: err })
          const back = saveMatch[1] ? '/wages/drafts/' + saveMatch[1] + '/edit' : '/wages/shift/new'
          return new Response(null, { status: 302, headers: { location: back + '?error=' + encodeURIComponent(err), 'cache-control': 'no-store' } })
        }
      } catch (err) {}
    }
    if (finalSubmitMatch) {
      try {
        const staffId = await staffIdFromWageSession(c.env, c.req.raw.headers.get('cookie') || '')
        const d = staffId ? await c.env.DB.prepare(`SELECT work_date, status FROM wage_shift_drafts WHERE id = ? AND staff_id = ?`).bind(Number(finalSubmitMatch[1]), staffId).first<{ work_date: string, status: string }>() : null
        // A draft parked on the Saturday by a concurrent request is fine; use our real-date table when present.
        let iso = d?.work_date || ''
        if (d && d.status === 'draft') {
          await ensureRealDateTable(c.env)
          const rd = await c.env.DB.prepare(`SELECT real_date FROM wage_draft_real_dates WHERE draft_id = ?`).bind(Number(finalSubmitMatch[1])).first<{ real_date: string }>()
          if (rd?.real_date) iso = rd.real_date
        }
        // Owner 2026-09-23 (Joshua Wed 23 Sep ×2, John 17 Sep ×2, Sat 13 Sep re-claimed): a worker may not
        // final-submit a SECOND entry for the same day whose times fall inside an entry already paid to him
        // (this payroll or an earlier one). The office is told which row already covers it.
        if (d && d.status === 'draft' && iso && staffId) {
          const full = await c.env.DB.prepare(`SELECT start_time, end_time, outlet_venue FROM wage_shift_drafts WHERE id = ?`).bind(Number(finalSubmitMatch[1])).first<{ start_time: string, end_time: string, outlet_venue: string }>()
          const same = full ? await c.env.DB.prepare(`SELECT id, start_time, end_time, outlet_venue, payroll_week_start FROM wage_shifts WHERE staff_id = ? AND work_date = ? AND COALESCE(gross_wage, total_amount, 0) > 0`).bind(staffId, iso).all() : { results: [] }
          const a = full ? timeToMinutes(full.start_time) : null, b0 = full ? timeToMinutes(full.end_time) : null
          if (a !== null && b0 !== null) {
            const b = b0 <= a ? b0 + 1440 : b0
            const dup = ((same.results || []) as any[]).find((p) => { const c0 = timeToMinutes(p.start_time), d0 = timeToMinutes(p.end_time); if (c0 === null || d0 === null) return false; const dd = d0 <= c0 ? d0 + 1440 : d0; return a >= c0 && b <= dd })
            if (dup) {
              const msg = 'Not final-submitted: you have ALREADY been paid for ' + proxyLongDate(iso) + ' ' + dup.start_time + '–' + dup.end_time + ' (' + (dup.outlet_venue || '') + (dup.payroll_week_start && dup.payroll_week_start < currentProxyPayrollWeekStart() ? ', payroll ' + dup.payroll_week_start : ', this payroll') + '). This entry ' + full!.start_time + '–' + full!.end_time + ' falls inside those hours. If you worked EXTRA hours that day, edit this entry to only the extra hours (e.g. 16:00–20:00). If it is a mistake, delete it. Ask the office if unsure.'
              await captureWagesDebug(c.env, { request_path: incomingUrl.pathname, request_method: 'POST', original_payload_json: JSON.stringify({ draft_id: Number(finalSubmitMatch[1]), work_date: iso, start: full!.start_time, end: full!.end_time, covered_by_shift: dup.id }), rewritten_payload_json: '{}', rewrite_applied: 1, response_status: 302, response_location: 'duplicate-block', response_error_text: msg })
              return new Response(null, { status: 302, headers: { location: '/wages/me?error=' + encodeURIComponent(msg), 'cache-control': 'no-store' } })
            }
          }
        }
        const err = d ? proxyWorkDateWindowError(iso) : null
        if (err) {
          await captureWagesDebug(c.env, { request_path: incomingUrl.pathname, request_method: 'POST', original_payload_json: JSON.stringify({ work_date: iso }), rewritten_payload_json: '{}', rewrite_applied: 1, response_status: 302, response_location: 'window-refused', response_error_text: err })
          return new Response(null, { status: 302, headers: { location: '/wages/me?error=' + encodeURIComponent('Not final-submitted: ' + err), 'cache-control': 'no-store' } })
        }
      } catch (err) {}
    }
  }

  // A draft stored with its REAL (previous-week) date would be rejected by
  // upstream's lock check on final-check / final-submit / edit. Park it on the
  // current Saturday for the duration of this one request, then restore.
  let parkedDraft: { draftId: number, staffId: number, realDateIso: string, startTime: string, endTime: string } | null = null
  // Real date to DISPLAY on edit / final-check pages. Set whenever the draft is a
  // previous-week (missed) shift — including when another request has it parked
  // on the Saturday at this very moment — so a worker never sees the Saturday.
  let displayRealDate: { staffId: number, realDateIso: string } | null = null
  const draftStepMatch = incomingUrl.pathname.match(/^\/wages\/drafts\/(\d+)\/(final-check|final-submit|edit)\/?$/)
  if (draftStepMatch && c.env?.DB) {
    try {
      const draftId = Number(draftStepMatch[1])
      const staffId = await staffIdFromWageSession(c.env, c.req.raw.headers.get('cookie') || '')
      if (staffId) {
        const d = await c.env.DB.prepare(`SELECT work_date, start_time, end_time, status, missed_previous_week, payroll_note FROM wage_shift_drafts WHERE id = ? AND staff_id = ?`).bind(draftId, staffId).first<{ work_date: string, start_time: string, end_time: string, status: string, missed_previous_week: number, payroll_note: string | null }>()
        const captureWeekStart = currentProxyPayrollWeekStart()
        const realDate = parseProxyIsoDate(d?.work_date || '')
        const captureDate = parseProxyIsoDate(captureWeekStart)
        let realIso: string | null = null
        if (d && d.status === 'draft' && realDate && captureDate && realDate.getTime() < captureDate.getTime()) {
          realIso = d.work_date
          // Remember the real date in our own table (the engine never touches it), so a
          // concurrent request that finds the draft parked still knows the real date.
          await ensureRealDateTable(c.env)
          await c.env.DB.prepare(`INSERT INTO wage_draft_real_dates (draft_id, staff_id, real_date, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
              ON CONFLICT(draft_id) DO UPDATE SET real_date = excluded.real_date, updated_at = CURRENT_TIMESTAMP`).bind(draftId, staffId, realIso).run()
        } else if (d && d.status === 'draft' && d.work_date === captureWeekStart && d.missed_previous_week === 1) {
          // Parked by a concurrent request right now: take the real date from our table.
          await ensureRealDateTable(c.env)
          const rd = await c.env.DB.prepare(`SELECT real_date FROM wage_draft_real_dates WHERE draft_id = ? AND staff_id = ?`).bind(draftId, staffId).first<{ real_date: string }>()
          if (rd?.real_date && rd.real_date < captureWeekStart) realIso = rd.real_date
        }
        if (d && realIso) {
          await c.env.DB.prepare(`UPDATE wage_shift_drafts SET work_date = ?, missed_previous_week = 1 WHERE id = ? AND staff_id = ? AND status = 'draft'`).bind(captureWeekStart, draftId, staffId).run()
          parkedDraft = { draftId, staffId, realDateIso: realIso, startTime: d.start_time, endTime: d.end_time }
          displayRealDate = { staffId, realDateIso: realIso }
        }
      }
    } catch (err) {}
  }

  const { upstreamRequest, debugCapture } = await buildUpstreamRequest(c, incomingUrl, upstreamUrl, upstreamHeaders)

  let upstreamResponse: Response
  const restoreParked = async () => {
    if (!parkedDraft) return
    // Always restore the real date on the draft (and on the paid shift if one was just created).
    try { await restoreRealDateForMissedShift(c.env, parkedDraft.staffId, parkedDraft.realDateIso, parkedDraft.startTime, parkedDraft.endTime, parkedDraft.draftId) } catch (err) {
      try { await c.env.DB.prepare(`UPDATE wage_shift_drafts SET work_date = ? WHERE id = ? AND staff_id = ?`).bind(parkedDraft.realDateIso, parkedDraft.draftId, parkedDraft.staffId).run() } catch (err2) {}
    }
  }
  try {
    upstreamResponse = await fetch(upstreamRequest)
    // Concurrency guard: if another request for the same draft restored the real
    // date between our parking and the engine's read, the engine answers with its
    // "payroll week locked" redirect. Park again and retry once (GET pages only).
    if (parkedDraft && ['GET', 'HEAD'].includes(method) && upstreamResponse.status === 302 && /already been paid and is locked/i.test(decodeURIComponent(upstreamResponse.headers.get('location') || ''))) {
      await c.env!.DB.prepare(`UPDATE wage_shift_drafts SET work_date = ?, missed_previous_week = 1 WHERE id = ? AND staff_id = ? AND status = 'draft'`).bind(currentProxyPayrollWeekStart(), parkedDraft.draftId, parkedDraft.staffId).run()
      const retry = await buildUpstreamRequest(c, incomingUrl, upstreamUrl, upstreamHeaders)
      upstreamResponse = await fetch(retry.upstreamRequest)
    }
  } finally {
    await restoreParked()
  }

  // After upstream ACCEPTED (302 without error) put the real date back.
  const upstreamLocation = upstreamResponse.headers.get('location') || ''
  if (finalCheckRedirectFix) {
    await captureWagesDebug(c.env, { request_path: incomingUrl.pathname + incomingUrl.search + ' (was final-check POST)', request_method: 'POST', original_payload_json: '{"note":"final-check POST treated as final-submit"}', rewritten_payload_json: '{}', rewrite_applied: 1, response_status: upstreamResponse.status, response_location: upstreamLocation, response_error_text: '' })
    if (/\/login/.test(upstreamLocation) || (upstreamResponse.status === 302 && /[?&]error=/.test(upstreamLocation) === false && !/\/wages\/me/.test(upstreamLocation))) {
      // No check page any more (owner 28 Sep): send the worker back to his shift list with the error.
      const back = '/wages/me?error=' + encodeURIComponent('Final Submission did not go through — please press FINAL SUBMISSION on that shift again.')
      if (parkedDraft) { /* restore handled in finally above */ }
      return new Response(null, { status: 302, headers: { location: back, 'cache-control': 'no-store' } })
    }
  }
  const upstreamAccepted = upstreamResponse.status === 302 && !/[?&]error=/.test(upstreamLocation)
  const adminEditMatch = method === 'POST' ? incomingUrl.pathname.match(/^\/admin\/wages\/shifts\/(\d+)\/edit\/?$/) : null
  if (upstreamAccepted && adminEditMatch && c.env?.DB) {
    try {
      const admin = await adminUserFromCookie(c.req.raw.headers.get('cookie') || '')
      const extra = await repriceAfterManagerEdit(c.env, Number(adminEditMatch[1]), admin?.name || 'office')
      if (extra) {
        const loc = new URL(upstreamLocation, incomingUrl.origin)
        loc.searchParams.set('msg', (loc.searchParams.get('msg') || 'Shift saved.') + extra)
        const h = new Headers(upstreamResponse.headers); h.set('location', loc.pathname + loc.search)
        upstreamResponse = new Response(null, { status: 302, headers: h })
      }
    } catch (err) {
      await captureWagesDebug(c.env, { request_path: incomingUrl.pathname, request_method: 'POST', original_payload_json: '{}', rewritten_payload_json: '{}', rewrite_applied: 0, response_status: upstreamResponse.status, response_location: upstreamLocation, response_error_text: 'reprice after manager edit failed: ' + describeProxyError(err) })
    }
  }
  if (upstreamAccepted && realDateRestore && !realDateRestore.staffId) {
    await captureWagesDebug(c.env, { request_path: incomingUrl.pathname + incomingUrl.search, request_method: 'POST', original_payload_json: JSON.stringify(realDateRestore), rewritten_payload_json: '{}', rewrite_applied: 1, response_status: upstreamResponse.status, response_location: upstreamLocation, response_error_text: 'real-date restore skipped: no staff session resolved' })
  }
  if (upstreamAccepted && realDateRestore?.staffId) {
    try { await restoreRealDateForMissedShift(c.env, realDateRestore.staffId, realDateRestore.realDateIso, realDateRestore.startTime, realDateRestore.endTime, realDateRestore.draftIdHint) } catch (err) {
      await captureWagesDebug(c.env, { request_path: incomingUrl.pathname + incomingUrl.search, request_method: 'POST', original_payload_json: JSON.stringify(realDateRestore), rewritten_payload_json: '{}', rewrite_applied: 1, response_status: upstreamResponse.status, response_location: upstreamLocation, response_error_text: 'real-date restore failed: ' + describeProxyError(err) })
    }
  }
  if (upstreamAccepted && finalSubmitMatch && c.env?.DB && !parkedDraft) {
    // Final Submission of a missed draft: the paid wage_shifts row was just created
    // from the draft. Carry the draft's real date onto it.
    try {
      const draftId = Number(finalSubmitMatch[1])
      const staffId = await staffIdFromWageSession(c.env, c.req.raw.headers.get('cookie') || '')
      const d = await c.env.DB.prepare(`SELECT work_date, missed_previous_week, payroll_week_start, work_description, start_time, end_time FROM wage_shift_drafts WHERE id = ? AND staff_id = ?`).bind(draftId, staffId).first<{ work_date: string, missed_previous_week: number, payroll_week_start: string | null, work_description: string | null, start_time: string, end_time: string }>()
      const captureDate = parseProxyIsoDate(currentProxyPayrollWeekStart())
      const realFromDate = parseProxyIsoDate(d?.work_date || '')
      const realIso = (realFromDate && captureDate && realFromDate.getTime() < captureDate.getTime()) ? d!.work_date : realDateFromMarker(d?.work_description || '')
      if (d && staffId && realIso) await restoreRealDateForMissedShift(c.env, staffId, realIso, d.start_time, d.end_time, draftId)
    } catch (err) {
      await captureWagesDebug(c.env, { request_path: incomingUrl.pathname, request_method: 'POST', original_payload_json: '{}', rewritten_payload_json: '{}', rewrite_applied: 1, response_status: upstreamResponse.status, response_location: upstreamLocation, response_error_text: 'real-date restore (final) failed: ' + describeProxyError(err) })
    }
  }
  // B&W rate rules (owner 2026-09-15): the engine has just created the paid row for this
  // draft with its old formula. Re-price THAT ROW ONLY under the owner rules and stamp
  // calculation_version = 4. Historical rows, drafts, dates, hours, venues untouched.
  if (upstreamAccepted && finalSubmitMatch && c.env?.DB) {
    try { await applyOwnerRatesToFinalSubmission(c.env, Number(finalSubmitMatch[1]), c.req.raw.headers.get('cookie') || '') } catch (err) {
      await captureWagesDebug(c.env, { request_path: incomingUrl.pathname, request_method: 'POST', original_payload_json: '{}', rewritten_payload_json: '{}', rewrite_applied: 1, response_status: upstreamResponse.status, response_location: upstreamLocation, response_error_text: 'owner-rate recalculation failed: ' + describeProxyError(err) })
    }
  }
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

  if (displayRealDate && method === 'GET' && contentType.includes('text/html') && upstreamResponse.status === 200) {
    // The page upstream rendered shows the parked Saturday; show the real date instead.
    const bodyText = await upstreamResponse.text()
    const saturday = currentProxyPayrollWeekStart()
    const swapped = bodyText
      .split(saturday + ' · ').join(displayRealDate.realDateIso + ' · ')
      .split('value="' + saturday + '"').join('value="' + displayRealDate.realDateIso + '"')
    headers.delete('content-length')
    const swappedResponse = new Response(swapped, { status: 200, statusText: upstreamResponse.statusText, headers })
    const rewriterSwap = new HTMLRewriter()
    if (displayRealDate.staffId) rewriterSwap.on('html', new SessionStaffStampInjector(displayRealDate.staffId))
    rewriterSwap.on('body', new WagesUiInjector())
    headers.set('cache-control', 'no-store, no-cache, must-revalidate, max-age=0')
    return rewriterSwap.transform(swappedResponse)
  }

  if (['GET', 'HEAD'].includes(c.req.raw.method) && contentType.includes('text/html')) {
    headers.set('cache-control', 'no-store, no-cache, must-revalidate, max-age=0')
    headers.set('pragma', 'no-cache')
    headers.set('expires', '0')
    headers.set('surrogate-control', 'no-store')
  }

  // Worker pages must never show the admin "403 — Not authorised" module page
  // (happens when the same browser also holds an admin login). Send the
  // worker back to the staff list instead.
  const isWorkerWagesPage = incomingUrl.pathname.startsWith('/wages') && !incomingUrl.pathname.startsWith('/wages/logout')
  if (upstreamResponse.status === 403 && c.req.raw.method === 'GET' && isWorkerWagesPage) {
    return new Response(null, {
      status: 302,
      headers: {
        location: '/wages',
        'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
        pragma: 'no-cache',
        expires: '0',
      },
    })
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
  if (path === '/wages/me' && upstreamResponse.status === 200 && c.env?.DB) {
    // Missed shifts stored with their REAL date fall outside the dashboard's
    // work_date window, so list them and correct the week total (the payroll
    // export already counts them by payroll_week_start).
    try {
      const staffId = await staffIdFromWageSession(c.env, c.req.raw.headers.get('cookie') || '')
      const section = staffId ? await buildMissedPaidSection(c.env, staffId) : null
      if (section && section.missedHours > 0) {
        rewriter.on('section.actions', new MissedPaidSectionInjector(section.html))
        rewriter.on('section.summary .big-number', new TextReplaceInjector(section.totalHours.toFixed(2)))
        rewriter.on('section.summary .row strong', new TextReplaceInjector(section.totalCount + ' submitted shifts'))
      }
    } catch (err) {}
  }
  if (needsWagesUi && c.env?.DB) {
    try {
      const sessionStaffId = await staffIdFromWageSession(c.env, c.req.raw.headers.get('cookie') || '')
      rewriter.on('html', new SessionStaffStampInjector(sessionStaffId))
    } catch (err) {}
  }
  if (needsWagesButton) rewriter.on('#topbar-actions', new DashboardButtonInjector())
  if (needsWagesButton) rewriter.on('main', new WagesHealthBannerInjector())
  if (needsWagesButton && upstreamResponse.status === 200 && c.env?.DB) {
    // Missed shifts paid in the payroll week shown by the page filter (?from=YYYY-MM-DD or YYYY/MM/DD).
    try {
      const fromRaw = (incomingUrl.searchParams.get('from') || incomingUrl.searchParams.get('week_start') || incomingUrl.searchParams.get('payroll_week_start') || '').replace(/\//g, '-')
      const fromDate = parseProxyIsoDate(fromRaw)
      const weekStart = fromDate ? formatProxyIsoDate(proxyStartOfPayrollWeek(fromDate)) : currentProxyPayrollWeekStart()
      const employeeFilter = (incomingUrl.searchParams.get('staff_id') || incomingUrl.searchParams.get('employee') || incomingUrl.searchParams.get('staff') || '').trim()
      // Owner 2026-09-21: "already paid" check — CURRENT (unpaid) payroll week ONLY, never a closed one.
      if (weekStart === currentProxyPayrollWeekStart()) { try { await runPaidBeforeCheck({ db: c.env.DB, weekStart, weekEnd: proxyEndOfPayrollWeek(weekStart), ownerPayKind, ownerPayForShift }) } catch (err) {} try { await runCrewPatternCheck({ db: c.env.DB, weekStart, weekEnd: proxyEndOfPayrollWeek(weekStart), ownerPayKind }) } catch (err) {} }
      const tableHtmlRaw = await buildAdminCombinedSheet(c.env, weekStart, employeeFilter)
      const cleanReturn = new URL(incomingUrl.toString()); cleanReturn.searchParams.delete('msg'); cleanReturn.searchParams.delete('error')
      const flashMsg = incomingUrl.searchParams.get('msg') || ''
      const flashErr = incomingUrl.searchParams.get('error') || ''
      const flash = flashErr ? `<div style="margin:10px 0;padding:10px 14px;border-radius:10px;background:#fdecec;color:#7f1d1d;font-weight:700">${escapeHtmlText(flashErr)}</div>`
        : flashMsg ? `<div style="margin:10px 0;padding:10px 14px;border-radius:10px;background:#e7f6ec;color:#14532d;font-weight:700">${escapeHtmlText(flashMsg)}</div>` : ''
      const tableHtml = (tableHtmlRaw ? flash + tableHtmlRaw : '').split('__RETURN__').join(escapeHtmlText(cleanReturn.pathname + cleanReturn.search))
      if (tableHtml) { rewriter.on('main', new AdminMissedPaidInjector(tableHtml)); rewriter.on('body', new AdminCombinedPlacementInjector()) }
    } catch (err) { try { await captureWagesDebug(c.env, { request_path: '/admin/wages (combined sheet FAILED)', request_method: 'GET', original_payload_json: JSON.stringify({ url: incomingUrl.toString() }), rewritten_payload_json: '', rewrite_applied: 0, response_status: 500, response_location: '', response_error_text: describeProxyError(err) }) } catch (e2) {} }
  }
  if (needsTeamInit) rewriter.on('body', new TeamPickerInitInjector())
  if (needsWagesUi) rewriter.on('body', new WagesUiInjector())
  return rewriter.transform(baseResponse)
}

// ---------------------------------------------------------------------------
// B&W PAYROLL EXCEL (owner spec 2026-09-15). Built from the database by the
// proxy: Sat…Fri + block 6 Missed Shifts (approved hours), no bonus columns,
// six tabs, formulas linked so a change on Wage Detail flows through. The
// engine's own /admin/wages/export.xlsx is untouched. Admin cookie required.
app.get('/wages-admin/payroll.xlsx', async (c) => {
  const db = c.env?.DB
  const admin = await adminUserFromCookie(c.req.raw.headers.get('cookie') || '')
  if (!db) return c.text('no database', 500)
  if (!admin) return new Response(null, { status: 302, headers: { location: '/login?next=' + encodeURIComponent('/admin/wages') } })
  const fromRaw = (c.req.query('from') || '').replace(/\//g, '-')
  const fromDate = parseProxyIsoDate(fromRaw)
  const weekStart = fromDate ? formatProxyIsoDate(proxyStartOfPayrollWeek(fromDate)) : currentProxyPayrollWeekStart()
  const weekEnd = proxyEndOfPayrollWeek(weekStart)
  try {
    if (weekStart === currentProxyPayrollWeekStart()) { try { await runPaidBeforeCheck({ db, weekStart, weekEnd, ownerPayKind, ownerPayForShift }) } catch (err) {} try { await runCrewPatternCheck({ db, weekStart, weekEnd, ownerPayKind }) } catch (err) {} }
    // Owner day rules (27 Sep 2026) — forced place per date — must reach the Excel pricing too.
    const dayRuleMap: Record<string, string | null> = {}
    try { const dr = await db.prepare(`SELECT work_date, force_kind FROM wage_owner_day_rules WHERE work_date BETWEEN date(?, '-7 days') AND ?`).bind(weekStart, weekEnd).all(); for (const r of (dr.results || []) as any[]) dayRuleMap[String(r.work_date)] = r.force_kind || null } catch (err) {}
    const dayRuleKind = (dateIso: string, kind: string) => { const f = dayRuleMap[dateIso]; if (!f) return kind; if (f === 'event' && (kind === 'warehouse' || kind === 'warehouse_or_event')) return 'event'; if (f === 'warehouse' && (kind === 'event' || kind === 'warehouse_or_event')) return 'warehouse'; return kind }
    const out = await buildPayrollWorkbook({ db, weekStart, weekEnd, ownerPayKind, ownerPayForShift, timeToMinutes, dayRuleKind })
    if (c.req.query('check') === '1') return c.json({ weekStart, weekEnd, ...out.checks })
    try { await takePaidSnapshot(db, weekStart, admin.name + ' (Excel download)') } catch (err) {}
    return new Response(out.bytes, { status: 200, headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': `attachment; filename="${out.filename}"`, 'cache-control': 'no-store' } })
  } catch (err) {
    return c.text('Could not build the payroll Excel: ' + describeProxyError(err), 500)
  }
})

app.get('/health', (c) => c.json({ status: 'ok', mode: 'safe-proxy', origin: ORIGIN }))
// Admin page self-report: the /admin/wages hide script posts the real DOM
// structure of the "Add a shift on behalf" block here so it can be inspected
// in wage_debug_capture without an admin login. Admin cookie required.
// ---------------------------------------------------------------------------
// Admin review decisions (2026-09-14). Records the office's decision on a
// wage_payroll_reviews row: status RESOLVED / DISMISSED, approved hours, the
// reason, the admin's name (from the verified bw_session cookie) and time.
// It NEVER changes wage_shifts — pay changes still go through the engine's
// manager correction. Same secret/HMAC scheme the engine uses for bw_session.
const ADMIN_SESSION_SECRET = 'bw-productions-session-secret-2024-change-in-prod'
async function adminUserFromCookie(cookieHeader: string): Promise<{ id: number, name: string, email: string, role: string } | null> {
  try {
    const m = (cookieHeader || '').match(/(?:^|;\s*)bw_session=([^;]*)/)
    if (!m) return null
    const token = decodeURIComponent(m[1])
    const [b64, sig] = token.split('.')
    if (!b64 || !sig) return null
    const enc = new TextEncoder()
    const key = await crypto.subtle.importKey('raw', enc.encode(ADMIN_SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const mac = await crypto.subtle.sign('HMAC', key, enc.encode(b64))
    const expected = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('')
    if (expected !== sig) return null
    const payload = JSON.parse(atob(b64))
    if (!payload || (payload.exp && payload.exp < Date.now())) return null
    return { id: Number(payload.id) || 0, name: String(payload.name || payload.email || 'Office'), email: String(payload.email || ''), role: String(payload.role || '') }
  } catch (err) { return null }
}

// Office edit of a NOT-final-submitted draft (owner-approved 2026-09-14).
// Only a logged-in admin may call this. It issues a short (2 h) worker session for
// that draft's owner — the same kind the worker gets after PIN login — and sends the
// office straight to the worker's own edit page for that draft. The edit itself is
// done by the engine's existing worker form; nothing new touches the draft here.
app.get('/wages-admin/edit-draft/:id', async (c) => {
  const admin = await adminUserFromCookie(c.req.raw.headers.get('cookie') || '')
  if (!admin) return c.redirect('/login?next=' + encodeURIComponent('/admin/wages'), 302)
  const db = c.env?.DB
  const draftId = Number(c.req.param('id'))
  if (!db || !draftId) return c.redirect('/admin/wages?error=' + encodeURIComponent('Draft not found.'), 302)
  const d = await db.prepare(`SELECT id, staff_id, status FROM wage_shift_drafts WHERE id = ?`).bind(draftId).first<{ id: number, staff_id: number, status: string }>()
  if (!d) return c.redirect('/admin/wages?error=' + encodeURIComponent('Draft #' + draftId + ' no longer exists.'), 302)
  if (d.status !== 'draft') return c.redirect('/admin/wages?error=' + encodeURIComponent('Draft #' + draftId + ' has already been final-submitted — use ✎ Edit on its paid row instead.'), 302)
  const raw = new Uint8Array(32); crypto.getRandomValues(raw)
  const token = btoa(String.fromCharCode(...raw)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
  await db.prepare(`INSERT INTO wage_sessions (staff_id, token_hash, expires_at) VALUES (?, ?, datetime('now', '+2 hours'))`).bind(d.staff_id, hex).run()
  await captureWagesDebug(c.env, { request_path: '/wages-admin/edit-draft/' + draftId, request_method: 'GET', original_payload_json: JSON.stringify({ admin: admin.name, staff_id: d.staff_id }), rewritten_payload_json: '{}', rewrite_applied: 1, response_status: 302, response_location: '/wages/drafts/' + draftId + '/edit', response_error_text: '' })
  const headers = new Headers({ location: '/wages/drafts/' + draftId + '/edit?bw_staff_id=' + d.staff_id + '&office=1', 'cache-control': 'no-store' })
  headers.append('set-cookie', 'bw_wage_session=' + token + '; Path=/wages; HttpOnly; SameSite=Lax; Max-Age=7200; Secure')
  return new Response(null, { status: 302, headers })
})

// Owner 2026-09-15: Bernie chooses Warehouse or Event/Venue for a paid shift whose wording
// said "warehouse" but whose work type was not Warehouse. Records the choice on the review
// and re-prices ONLY that shift under the chosen rule (rate rules v4). Nothing else changes.
app.post('/wages-admin/rate-choice', async (c) => {
  const db = c.env?.DB
  const admin = await adminUserFromCookie(c.req.raw.headers.get('cookie') || '')
  const back = (v: string) => new Response(null, { status: 302, headers: { location: v, 'cache-control': 'no-store' } })
  if (!db) return c.text('no database', 500)
  if (!admin) return back('/login?next=' + encodeURIComponent('/admin/wages'))
  let form: FormData
  try { form = await c.req.raw.formData() } catch (err) { return back('/admin/wages?error=' + encodeURIComponent('Could not read the rate choice form.')) }
  const reviewId = Number(normalizeProxyFieldValue(form.get('review_id')))
  const choice = normalizeProxyFieldValue(form.get('choice'))
  const returnTo = normalizeProxyFieldValue(form.get('return_to')) || '/admin/wages'
  const safeReturn = /^\/admin\/wages(\?|$)/.test(returnTo) ? returnTo : '/admin/wages'
  const sep = safeReturn.includes('?') ? '&' : '?'
  if (!reviewId || !['warehouse', 'event', 'garden'].includes(choice)) return back(safeReturn + sep + 'error=' + encodeURIComponent('Invalid rate choice.'))
  try {
    const rv = await db.prepare(`SELECT id, status, issue_key, subject_source, subject_shift_id, staff_id, original_hours, system_snapshot_json FROM wage_payroll_reviews WHERE id = ?`).bind(reviewId).first<{ id: number, status: string, issue_key: string, subject_source: string, subject_shift_id: number, staff_id: number, original_hours: number | null, system_snapshot_json: string | null }>()
    if (!rv || !/^(rate_choice_warehouse_or_event|crew_pattern)\|(shift|draft):/.test(rv.issue_key || '')) return back(safeReturn + sep + 'error=' + encodeURIComponent('Review #' + reviewId + ' is not a rate-choice review.'))
    if (rv.status !== 'OPEN') return back(safeReturn + sep + 'msg=' + encodeURIComponent('Review #' + reviewId + ' was already ' + rv.status + '.'))
    if (rv.subject_source === 'draft') {
      // Owner 2026-09-22: the office decides the PLACE on a draft. Recorded now with the rate; applied to
      // the paid row the moment the worker final-submits (see applyOwnerRatesToFinalSubmission).
      const dr = await db.prepare(`SELECT id, work_date, start_time, end_time, work_type, outlet_venue FROM wage_shift_drafts WHERE id = ? AND staff_id = ?`).bind(rv.subject_shift_id, rv.staff_id).first<{ id: number, work_date: string, start_time: string, end_time: string, work_type: string, outlet_venue: string }>()
      const dk: OwnerPayKind = choice === 'warehouse' ? 'warehouse' : choice === 'garden' ? 'gardener' : 'event'
      const dp = dr ? ownerPayForShift(dr.work_date, dr.start_time, dr.end_time, dk) : null
      const labelD = choice === 'warehouse' ? 'WAREHOUSE — R81,25/h' : choice === 'garden' ? 'GARDEN — R62,50/h' : 'VENUE — R95/h'
      let snapD: any = {}; try { snapD = JSON.parse(rv.system_snapshot_json || '{}') } catch (err) {}
      snapD.placeDecision = dk; snapD.placeDecidedBy = admin.name; snapD.placeAmountIfSubmitted = dp?.amount ?? null; snapD.placeBreakdown = dp?.breakdown || ''
      const reasonD = labelD + ' chosen by ' + admin.name + ' for draft #' + rv.subject_shift_id + (dp ? ' — will pay ' + fmtRand(dp.amount) + ' when final-submitted (' + dp.breakdown + ')' : '') + (dr && !dr.work_type.toLowerCase().includes('warehouse') && choice === 'warehouse' ? ' — worker selected "' + (dr.work_type || 'Normal') + '"; office overrides to Warehouse' : '') + (dr && dr.work_type.toLowerCase().includes('warehouse') && choice === 'event' ? ' — worker selected "Warehouse Team"; office overrides to Venue' : '')
      await db.prepare(`UPDATE wage_payroll_reviews SET status = 'RESOLVED', decision_type = 'approve_original', decision_reason = ?, approved_payable_hours = ?, system_snapshot_json = ?, reviewed_by_user_id = ?, reviewed_by_name = ?, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'OPEN'`)
        .bind(reasonD, rv.original_hours, JSON.stringify(snapD), admin.id || null, admin.name, reviewId).run()
      await captureWagesDebug(c.env, { request_path: '/wages-admin/rate-choice (draft)', request_method: 'POST', original_payload_json: JSON.stringify({ review_id: reviewId, draft_id: rv.subject_shift_id, choice, by: admin.name }), rewritten_payload_json: JSON.stringify({ amount_if_submitted: dp?.amount ?? null, breakdown: dp?.breakdown || '' }), rewrite_applied: 1, response_status: 302, response_location: safeReturn, response_error_text: '' })
      return back(safeReturn + sep + 'msg=' + encodeURIComponent('Review #' + reviewId + ': ' + labelD + ' recorded by ' + admin.name + ' for the draft. The rate is applied automatically when the worker final-submits' + (dp ? ' (' + fmtRand(dp.amount) + ')' : '') + '.') + '#bw-review-' + reviewId)
    }
    const row = await db.prepare(`SELECT id, staff_id, work_date, start_time, end_time, total_amount, gross_wage, payroll_week_start FROM wage_shifts WHERE id = ? AND staff_id = ?`).bind(rv.subject_shift_id, rv.staff_id).first<{ id: number, staff_id: number, work_date: string, start_time: string, end_time: string, total_amount: number, gross_wage: number, payroll_week_start: string | null }>()
    if (!row) return back(safeReturn + sep + 'error=' + encodeURIComponent('Paid shift #' + rv.subject_shift_id + ' for review #' + reviewId + ' no longer exists.'))
    const kind: OwnerPayKind = choice === 'warehouse' ? 'warehouse' : choice === 'garden' ? 'gardener' : 'event'
    let priced = ownerPayForShift(row.work_date, row.start_time, row.end_time, kind)
    if (!priced) return back(safeReturn + sep + 'error=' + encodeURIComponent('Could not price shift #' + row.id + ' — times unreadable.'))
    const before = before0(row)
    const label = choice === 'warehouse' ? 'Warehouse' : choice === 'garden' ? 'Garden' : 'Event/Venue'
    // Owner 2026-09-23: if part of this day was already paid in an EARLIER payroll, the row pays only the
    // DIFFERENCE at the chosen place (rate correction on the paid hours + the extra hours). Earlier row untouched.
    let diffNote = ''
    try {
      const wk = row.payroll_week_start || currentProxyPayrollWeekStart()
      const er = await db.prepare(`SELECT w.id, w.staff_id, w.work_date, w.start_time, w.end_time, w.hours_worked, COALESCE(w.gross_wage, w.total_amount, 0) amount, COALESCE(w.hourly_rate_snapshot, 0) rate_paid, w.work_type, w.outlet_venue, w.area, w.work_description, w.payroll_week_start, w.source_draft_id, s.display_name, s.payroll_rule, s.hourly_rate
          FROM wage_shifts w JOIN wage_staff s ON s.id = w.staff_id WHERE w.staff_id = ? AND w.work_date = ? AND w.id <> ? AND w.work_date < ? AND (w.payroll_week_start IS NULL OR w.payroll_week_start < ?)`).bind(row.staff_id, row.work_date, row.id, wk, wk).all()
      const earlier = ((er.results || []) as any[]).filter((p) => shiftsOverlap(row.start_time, row.end_time, p.start_time, p.end_time)).map((p) => rowToPaid(p, String(p.display_name || ''), String(p.payroll_rule || ''), Number(p.hourly_rate || 0)))
      if (earlier.length) {
        const full = await db.prepare(`SELECT w.*, COALESCE(w.gross_wage, w.total_amount, 0) amount, s.display_name, s.payroll_rule, s.hourly_rate FROM wage_shifts w JOIN wage_staff s ON s.id = w.staff_id WHERE w.id = ?`).bind(row.id).first<any>()
        const subj = rowToEntry(full, 'shift', String(full?.display_name || ''), String(full?.payroll_rule || 'hourly'), Number(full?.hourly_rate || 0))
        const f = priceAgainstPaid({ db, weekStart: wk, weekEnd: proxyEndOfPayrollWeek(wk), ownerPayKind, ownerPayForShift }, subj, earlier, kind)
        if (f) {
          const ovTxt = earlier.map((p) => p.start + '–' + p.end).join(', ')
          const paidPlace = Array.from(new Set(earlier.map((p) => p.work_type || p.venue || 'earlier'))).join('/')
          const paidRate = earlier.length === 1 ? earlier[0].rate_paid : (f.overlapHours ? Math.round(f.alreadyPaid / f.overlapHours * 100) / 100 : 0)
          const shouldHave = Math.round((f.alreadyPaid + f.rateCorrection) * 100) / 100
          const rateNum = kind === 'warehouse' ? WAREHOUSE_HOURLY : VENUE_HOURLY
          diffNote = ' DIFFERENCE ONLY: Paid last week ' + ovTxt + ' ' + paidPlace + ' ' + f.overlapHours.toFixed(2) + ' h × ' + fmtRand(paidRate) + ' = ' + fmtRand(f.alreadyPaid) + ' (' + earlier.map((p) => 'shift #' + p.id + ', payroll ' + (p.payroll_week_start || 'earlier')).join('; ') + '); ' + row.start_time + '–' + row.end_time + (kind === 'event' ? ' at a venue' : ' in the warehouse') + ' = ' + fmtRand(f.fullAmount) + ' (' + fmtRand(rateNum) + '/h); less the ' + paidPlace + ' already paid ' + fmtRand(f.alreadyPaid) + '; TO PAY THIS WEEK ' + fmtRand(f.stillDue)
          priced = { ...priced, amount: f.stillDue, breakdown: priced.breakdown + ' →' + diffNote }
        }
      }
    } catch (err) {}
    const note = 'Rate rules 2026-09-15: ' + label + ' chosen by ' + admin.name + ' (review #' + reviewId + ', was ' + fmtRand(before) + '): ' + priced.breakdown
    await db.prepare(`UPDATE wage_shifts SET total_amount = ?, gross_wage = ?, hourly_rate_snapshot = ?, calculation_version = ?,
          payroll_note = CASE WHEN COALESCE(payroll_note,'') = '' THEN ? ELSE payroll_note || ' | ' || ? END, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND staff_id = ?`).bind(priced.amount, priced.amount, priced.hourlyRate, OWNER_RATE_RULES_VERSION, note, note, row.id, row.staff_id).run()
    let snapS: any = {}; try { snapS = JSON.parse(rv.system_snapshot_json || '{}') } catch (err) {}
    snapS.placeDecision = kind; snapS.placeDecidedBy = admin.name; snapS.rowAmountAfter = priced.amount; if (diffNote) { snapS.differenceOnly = 1; snapS.differenceText = diffNote.trim() }
    // The difference already settles the overlap with the earlier payment — hour-based overlap / already-paid
    // reviews on this same entry are superseded (kept, marked VOID with the reason).
    if (diffNote) {
      try {
        await db.prepare(`UPDATE wage_payroll_reviews SET status = 'VOID', void_reason = ?, voided_by_name = ?, voided_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id <> ? AND staff_id = ? AND status IN ('OPEN','RESOLVED') AND (issue_key LIKE 'paid_before|%' OR issue_key LIKE 'manual_overlap_review|%' OR warning_kind IN ('previous_payroll_duplicate','duplicate_shift','time_location_conflict'))
              AND ((subject_source = 'shift' AND subject_shift_id = ?) OR (subject_source = 'draft' AND subject_shift_id = (SELECT source_draft_id FROM wage_shifts WHERE id = ?)))`)
          .bind('Superseded by review #' + reviewId + ' (' + label + ' — difference only): shift #' + row.id + ' now pays ' + fmtRand(priced.amount) + ' =' + diffNote, admin.name, reviewId, row.staff_id, row.id, row.id).run()
      } catch (err) {}
    }
    await db.prepare(`UPDATE wage_payroll_reviews SET status = 'RESOLVED', decision_type = 'approve_original', decision_reason = ?, system_snapshot_json = ?, reviewed_by_user_id = ?, reviewed_by_name = ?, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'OPEN'`)
      .bind(label + ' rate chosen — shift #' + row.id + ' ' + fmtRand(before) + ' → ' + fmtRand(priced.amount) + ' (' + priced.breakdown + ')', JSON.stringify(snapS), admin.id || null, admin.name, reviewId).run()
    await captureWagesDebug(c.env, { request_path: '/wages-admin/rate-choice', request_method: 'POST', original_payload_json: JSON.stringify({ review_id: reviewId, shift_id: row.id, choice, before, by: admin.name }), rewritten_payload_json: JSON.stringify({ amount: priced.amount, rate: priced.hourlyRate, breakdown: priced.breakdown }), rewrite_applied: 1, response_status: 302, response_location: safeReturn, response_error_text: '' })
    return back(safeReturn + sep + 'msg=' + encodeURIComponent('Review #' + reviewId + ': ' + label + ' chosen by ' + admin.name + '. Shift #' + row.id + ' ' + fmtRand(before) + ' → ' + fmtRand(priced.amount) + (diffNote ? ' — difference only, earlier payment not touched.' : '') + ' (' + priced.breakdown + ').') + '#bw-review-' + reviewId)
  } catch (err) {
    return back(safeReturn + sep + 'error=' + encodeURIComponent('Could not record the rate choice: ' + describeProxyError(err)))
  }
})

// Owner 2026-09-22: office decision on Petrus weekday time outside 06:00–16:00.
// Adds the approved rand amount to the paid shift (the R640 day already there stays).
app.post('/wages-admin/petrus-extra', async (c) => {
  const db = c.env?.DB
  const admin = await adminUserFromCookie(c.req.raw.headers.get('cookie') || '')
  const back = (to: string) => c.redirect(to, 303)
  if (!db) return back('/admin/wages?error=' + encodeURIComponent('Database not available.'))
  if (!admin) return back('/login?next=' + encodeURIComponent('/admin/wages'))
  let form: FormData
  try { form = await c.req.raw.formData() } catch (err) { return back('/admin/wages?error=' + encodeURIComponent('Could not read the Petrus extra-time form.')) }
  const reviewId = Number(normalizeProxyFieldValue(form.get('review_id')))
  const choice = normalizeProxyFieldValue(form.get('choice'))
  const customRate = Number(normalizeProxyFieldValue(form.get('custom_rate')) || 0)
  const customAmount = Number(normalizeProxyFieldValue(form.get('custom_amount')) || 0)
  const returnTo = normalizeProxyFieldValue(form.get('return_to')) || '/admin/wages'
  const safeReturn = /^\/admin\/wages(\?|$)/.test(returnTo) ? returnTo : '/admin/wages'
  const sep = safeReturn.includes('?') ? '&' : '?'
  if (!reviewId || !['offered', 'custom', 'custom_amount', 'zero', 'fixed_day'].includes(choice)) return back(safeReturn + sep + 'error=' + encodeURIComponent('Invalid Petrus extra-time decision.'))
  if (choice === 'custom' && !(customRate > 0)) return back(safeReturn + sep + 'error=' + encodeURIComponent('Type the rate per hour before clicking "Approve at this rate".') + '#bw-review-' + reviewId)
  if (choice === 'custom_amount' && !(customAmount > 0)) return back(safeReturn + sep + 'error=' + encodeURIComponent('Type the amount before clicking "Approve this amount".') + '#bw-review-' + reviewId)
  try {
    const rv = await db.prepare(`SELECT id, status, issue_key, subject_shift_id, staff_id, original_hours, system_snapshot_json FROM wage_payroll_reviews WHERE id = ?`).bind(reviewId).first<{ id: number, status: string, issue_key: string, subject_shift_id: number, staff_id: number, original_hours: number | null, system_snapshot_json: string | null }>()
    if (!rv || !/^(petrus_extra|public_holiday|staff_off|owner_start)\|shift:/.test(rv.issue_key || '')) return back(safeReturn + sep + 'error=' + encodeURIComponent('Review #' + reviewId + ' is not a Petrus extra-time / public-holiday / staff-off review.'))
    if (rv.status !== 'OPEN') return back(safeReturn + sep + 'msg=' + encodeURIComponent('Review #' + reviewId + ' was already ' + rv.status + '.'))
    let snap: any = {}
    try { snap = JSON.parse(rv.system_snapshot_json || '{}') } catch (err) { snap = {} }
    const hrs = Number(snap.extraHours || 0)
    const sunday = !!snap.petrusSunday
    const rate = choice === 'zero' ? 0 : choice === 'custom' ? Math.round(customRate * 100) / 100 : Number(snap.offeredRate || PETRUS_EXTRA_RATE)
    const extra = sunday
      ? (choice === 'zero' ? 0 : choice === 'fixed_day' ? PETRUS_DAY : choice === 'custom_amount' ? Math.round(customAmount * 100) / 100 : Number(snap.recommendedAmount || 0))
      : Math.round(hrs * rate * 100) / 100
    const row = await db.prepare(`SELECT id, staff_id, total_amount, gross_wage FROM wage_shifts WHERE id = ? AND staff_id = ?`).bind(rv.subject_shift_id, rv.staff_id).first<{ id: number, staff_id: number, total_amount: number, gross_wage: number }>()
    if (!row) return back(safeReturn + sep + 'error=' + encodeURIComponent('Paid shift #' + rv.subject_shift_id + ' for review #' + reviewId + ' no longer exists.'))
    const before = before0(row)
    const after = Math.round((before + extra) * 100) / 100
    const label = sunday
      ? (choice === 'zero' ? (snap.ownerStart ? 'Owner times ' + snap.ownerStartTime + '–' + (snap.ownerEndTime || '') + ' stand — extra hours not paid' : snap.staffOff ? 'Marked OFF — declined, R0' : snap.publicHoliday ? 'Public holiday declined — R0' : 'Sunday declined — R0') : (snap.ownerStart ? 'Owner OVERRIDE — worker\'s times accepted, added ' : snap.staffOff ? 'Marked OFF but owner confirms he worked — approved ' : snap.publicHoliday ? (choice === 'fixed_day' ? 'Public holiday (' + snap.publicHoliday + ') — owner chose the FIXED day rate, not holiday rates — ' : 'Public holiday (' + snap.publicHoliday + ') approved at holiday rates — ') : 'Sunday approved — ') + fmtRand(extra) + (choice === 'custom_amount' ? ' (owner amount)' : choice === 'fixed_day' ? ' (fixed R640 day)' : ' (as recommended)'))
      : choice === 'zero' ? 'Not payable — R0' : hrs.toFixed(2) + ' h outside 06–16 × ' + fmtRand(rate) + '/h = ' + fmtRand(extra)
    const note = (snap.ownerStart ? 'Owner start time' : snap.staffOff ? 'Staff OFF day' : snap.publicHoliday ? 'Public holiday (' + snap.publicHoliday + ')' : 'Petrus ' + (sunday ? 'Sunday' : 'extra time')) + ' decided by ' + admin.name + ' (review #' + reviewId + '): ' + label + ' — shift ' + fmtRand(before) + ' → ' + fmtRand(after)
    snap.approvedRate = rate; snap.approvedExtraAmount = extra; snap.decidedBy = admin.name
    if (extra > 0) {
      await db.prepare(`UPDATE wage_shifts SET total_amount = ?, gross_wage = ?, payroll_note = CASE WHEN COALESCE(payroll_note,'') = '' THEN ? ELSE payroll_note || ' | ' || ? END, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND staff_id = ?`).bind(after, after, note, note, row.id, row.staff_id).run()
    }
    await db.prepare(`UPDATE wage_payroll_reviews SET status = 'RESOLVED', decision_type = ?, decision_reason = ?, approved_payable_hours = ?, reviewed_by_user_id = ?, reviewed_by_name = ?, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, system_snapshot_json = ? WHERE id = ? AND status = 'OPEN'`)
      .bind(extra > 0 ? 'approve_adjusted' : 'already_paid_r0', label, extra > 0 ? (sunday ? Number(rv.original_hours || 0) : hrs) : 0, admin.id || null, admin.name, JSON.stringify(snap), reviewId).run()
    await captureWagesDebug(c.env, { request_path: '/wages-admin/petrus-extra', request_method: 'POST', original_payload_json: JSON.stringify({ review_id: reviewId, shift_id: row.id, choice, custom_rate: customRate, before, by: admin.name }), rewritten_payload_json: JSON.stringify({ rate, hours: hrs, extra, after }), rewrite_applied: 1, response_status: 302, response_location: safeReturn, response_error_text: '' })
    return back(safeReturn + sep + 'msg=' + encodeURIComponent('Review #' + reviewId + ': ' + label + ' by ' + admin.name + '. Shift #' + row.id + ' ' + fmtRand(before) + ' → ' + fmtRand(after) + '.') + '#bw-review-' + reviewId)
  } catch (err) {
    return back(safeReturn + sep + 'error=' + encodeURIComponent('Could not record the Petrus extra-time decision: ' + describeProxyError(err)))
  }
})

// Owner 2026-09-22: delete an unsubmitted draft. Office only. Backed up to wage_debug_capture; reviews on it voided.
// Owner 2026-09-23: next-week confirmation of public-holiday end times. Re-prices the row at the confirmed end
// (holiday rule: meeting deducted first, ×2; gardener day-rate ×2 pro rata; Petrus R160/h) and records
// under / over-payment against what was paid. The difference lands in THIS payroll as the row's new amount is
// only the correction? No — the holiday row belongs to the closed payroll; we record the correction as a NEW
// correction row in the current payroll so the closed payroll is untouched.
// Owner 24 Sep 2026: mark a shift (or several) of an own-schedule worker (Lebo) as PAID by the owner. Stamps
// own_schedule_paid_at / by on wage_shifts; the line leaves the running ledger on the dashboard. Nothing else
// changes — amounts, reviews and the payroll Excel are untouched. Logged in wage_debug_capture.
// Owner 28 Sep 2026: Petrus weekly guarantee — adds an owner line of R640 for each Mon–Sat day of the payroll week that has
// nothing paid and no draft, so the week clears R3 840. Idempotent per day (event_name 'Petrus weekly guarantee').
// Owner 30 Sep 2026: this week's amount for a fixed-weekly worker whose pay varies (Brian). One row per staff per week.
async function takePaidSnapshot(db: D1Database, weekStart: string, by: string) {
  const weekEnd = proxyEndOfPayrollWeek(weekStart)
  await db.prepare(`CREATE TABLE IF NOT EXISTS wage_paid_snapshot (week_start TEXT NOT NULL, shift_id INTEGER NOT NULL, staff_id INTEGER, display_name TEXT, work_date TEXT, start_time TEXT, end_time TEXT, hours REAL, rate REAL, amount REAL, outlet_venue TEXT, work_description TEXT, snapshot_by TEXT, snapshot_at DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (week_start, shift_id))`).run()
  await db.prepare(`INSERT OR REPLACE INTO wage_paid_snapshot (week_start, shift_id, staff_id, display_name, work_date, start_time, end_time, hours, rate, amount, outlet_venue, work_description, snapshot_by, snapshot_at)
    SELECT ?, w.id, w.staff_id, s.display_name, w.work_date, w.start_time, w.end_time, w.hours_worked, w.hourly_rate_snapshot, COALESCE(w.gross_wage, w.total_amount, 0), w.outlet_venue, w.work_description, ?, CURRENT_TIMESTAMP
    FROM wage_shifts w JOIN wage_staff s ON s.id = w.staff_id WHERE w.work_date BETWEEN ? AND ?`).bind(weekStart, by, weekStart, weekEnd).run()
  const n = await db.prepare(`SELECT COUNT(*) n, ROUND(SUM(amount),2) total FROM wage_paid_snapshot WHERE week_start = ?`).bind(weekStart).first<{ n: number, total: number }>()
  return { rows: Number(n?.n || 0), total: Number(n?.total || 0) }
}

// Owner 30 Sep 2026: lock what was paid so next week's claims can be checked against it exactly.
app.post('/wages-admin/paid-snapshot', async (c) => {
  const db = c.env?.DB
  const admin = await adminUserFromCookie(c.req.raw.headers.get('cookie') || '')
  if (!db) return c.text('no database', 500)
  if (!admin) return new Response(null, { status: 302, headers: { location: '/login?next=' + encodeURIComponent('/admin/wages') } })
  const form = await c.req.formData()
  const weekStart = String(form.get('week_start') || '')
  const returnTo = String(form.get('return_to') || '/admin/wages')
  const safeReturn = returnTo.startsWith('/admin/wages') ? returnTo : '/admin/wages'
  const sep = safeReturn.includes('?') ? '&' : '?'
  const back = (u: string) => new Response(null, { status: 303, headers: { location: u } })
  if (!parseProxyIsoDate(weekStart)) return back(safeReturn + sep + 'error=' + encodeURIComponent('Bad week.') + '#bw-paid-check')
  try {
    const r = await takePaidSnapshot(db, weekStart, admin.name)
    return back(safeReturn + sep + 'msg=' + encodeURIComponent('Locked ' + r.rows + ' rows (' + fmtRand(r.total) + ') as PAID for payroll ' + weekStart + ' by ' + admin.name + '.') + '#bw-paid-check')
  } catch (err) {
    return back(safeReturn + sep + 'error=' + encodeURIComponent('Could not lock: ' + describeProxyError(err)) + '#bw-paid-check')
  }
})

app.post('/wages-admin/weekly-amount', async (c) => {
  const db = c.env?.DB
  const admin = await adminUserFromCookie(c.req.raw.headers.get('cookie') || '')
  const back = (v: string) => new Response(null, { status: 302, headers: { location: v, 'cache-control': 'no-store' } })
  if (!db) return c.text('no database', 500)
  if (!admin) return back('/login?next=' + encodeURIComponent('/admin/wages'))
  let form: FormData
  try { form = await c.req.raw.formData() } catch (err) { return back('/admin/wages?error=' + encodeURIComponent('Could not read the form.')) }
  const staffId = Number(normalizeProxyFieldValue(form.get('staff_id')))
  const weekStart = normalizeProxyFieldValue(form.get('week_start'))
  const amount = Number(normalizeProxyFieldValue(form.get('amount')))
  const note = normalizeProxyFieldValue(form.get('note')) || ''
  const returnTo = normalizeProxyFieldValue(form.get('return_to')) || '/admin/wages'
  const safeReturn = /^\/admin\/wages(\?|$)/.test(returnTo) ? returnTo : '/admin/wages'
  const sep = safeReturn.includes('?') ? '&' : '?'
  if (!staffId || !parseProxyIsoDate(weekStart) || !(amount >= 0)) return back(safeReturn + sep + 'error=' + encodeURIComponent('Type the amount for this week.') + '#bw-weekly-amount')
  try {
    const st = await db.prepare(`SELECT display_name FROM wage_staff WHERE id = ? AND payroll_rule = 'fixed_weekly'`).bind(staffId).first<{ display_name: string }>()
    if (!st) return back(safeReturn + sep + 'error=' + encodeURIComponent('Not a fixed-weekly worker.'))
    await db.prepare(`INSERT INTO wage_fixed_weekly_amounts (staff_id, week_start, amount, set_by, note) VALUES (?, ?, ?, ?, ?) ON CONFLICT(staff_id, week_start) DO UPDATE SET amount = excluded.amount, set_by = excluded.set_by, note = excluded.note, created_at = CURRENT_TIMESTAMP`).bind(staffId, weekStart, Math.round(amount * 100) / 100, admin.name, note).run()
    await captureWagesDebug(c.env, { request_path: '/wages-admin/weekly-amount', request_method: 'POST', original_payload_json: JSON.stringify({ staff_id: staffId, week_start: weekStart, amount, note, by: admin.name }), rewritten_payload_json: '{}', rewrite_applied: 1, response_status: 302, response_location: safeReturn, response_error_text: '' })
    return back(safeReturn + sep + 'msg=' + encodeURIComponent(st.display_name + ': ' + fmtRand(amount) + ' set for payroll week ' + weekStart + ' by ' + admin.name + '.') + '#bw-weekly-amount')
  } catch (err) {
    return back(safeReturn + sep + 'error=' + encodeURIComponent('Could not save: ' + describeProxyError(err)))
  }
})

app.post('/wages-admin/petrus-guarantee', async (c) => {
  const db = c.env?.DB
  const admin = await adminUserFromCookie(c.req.raw.headers.get('cookie') || '')
  const back = (v: string) => new Response(null, { status: 302, headers: { location: v, 'cache-control': 'no-store' } })
  if (!db) return c.text('no database', 500)
  if (!admin) return back('/login?next=' + encodeURIComponent('/admin/wages'))
  let form: FormData
  try { form = await c.req.raw.formData() } catch (err) { return back('/admin/wages?error=' + encodeURIComponent('Could not read the form.')) }
  const weekStart = normalizeProxyFieldValue(form.get('week_start'))
  const returnTo = normalizeProxyFieldValue(form.get('return_to')) || '/admin/wages'
  const safeReturn = /^\/admin\/wages(\?|$)/.test(returnTo) ? returnTo : '/admin/wages'
  const sep = safeReturn.includes('?') ? '&' : '?'
  const ws = parseProxyIsoDate(weekStart)
  if (!ws) return back(safeReturn + sep + 'error=' + encodeURIComponent('Bad week.'))
  try {
    const dayIso = (offset: number) => formatProxyIsoDate(new Date(ws.getTime() + offset * 86400000))
    const weekEnd = dayIso(6)
    const days = [0, 2, 3, 4, 5, 6].map(dayIso).sort()
    const todayIso = formatProxyIsoDate(new Date())
    const have = await db.prepare(`SELECT work_date FROM wage_shifts WHERE staff_id = ? AND work_date BETWEEN ? AND ?`).bind(PETRUS_STAFF_ID, weekStart, weekEnd).all()
    const drafts = await db.prepare(`SELECT work_date FROM wage_shift_drafts WHERE staff_id = ? AND work_date BETWEEN ? AND ? AND final_shift_id IS NULL`).bind(PETRUS_STAFF_ID, weekStart, weekEnd).all()
    const haveSet = new Set(((have.results || []) as any[]).map((r) => String(r.work_date))), draftSet = new Set(((drafts.results || []) as any[]).map((r) => String(r.work_date)))
    const missing = days.filter((d) => d < todayIso && !haveSet.has(d) && !draftSet.has(d))
    if (!missing.length) return back(safeReturn + sep + 'msg=' + encodeURIComponent('Petrus: nothing to top up — every day has an entry or a draft.') + '#bw-petrus-week')
    for (const d of missing) {
      await db.prepare(`INSERT INTO wage_shifts (staff_id, work_date, outlet_venue, area, event_name, work_description, start_time, end_time, hours_worked, normal_hours, hourly_rate_snapshot, base_rate_snapshot, total_amount, normal_amount, gross_wage, entered_by, entered_by_type, manager_update_reason, work_type, calculation_version, missed_previous_week, payroll_week_start, payroll_note)
          VALUES (?, ?, 'Warehouse', 'Highbury', 'Petrus weekly guarantee', ?, '00:00', '00:00', 0, 0, 0, 0, ?, ?, ?, ?, 'manager', ?, 'Normal', ?, 0, ?, ?)`)
        .bind(PETRUS_STAFF_ID, d, 'Fixed day R640 — Petrus weekly guarantee (R640 × 6 = R3 840, owner 28 Sep 2026). No entry from him for this day.', PETRUS_DAY, PETRUS_DAY, PETRUS_DAY, admin.name, 'Owner rule 28 Sep 2026: Petrus always clears R3 840 a week (R640 × Mon–Sat). Day added by ' + admin.name + ' because nothing was entered.', OWNER_RATE_RULES_VERSION, weekStart, 'PETRUS WEEKLY GUARANTEE — R640 fixed day added for ' + d + ' by ' + admin.name + ' (owner 28 Sep 2026). Do not re-price.').run()
    }
    await captureWagesDebug(c.env, { request_path: '/wages-admin/petrus-guarantee', request_method: 'POST', original_payload_json: JSON.stringify({ week_start: weekStart, days: missing, by: admin.name }), rewritten_payload_json: '{}', rewrite_applied: 1, response_status: 302, response_location: safeReturn, response_error_text: '' })
    return back(safeReturn + sep + 'msg=' + encodeURIComponent('Petrus: R640 added for ' + missing.map((d) => proxyLongDate(d)).join(', ') + ' by ' + admin.name + ' — week now clears the guarantee.') + '#bw-petrus-week')
  } catch (err) {
    return back(safeReturn + sep + 'error=' + encodeURIComponent('Could not top up: ' + describeProxyError(err)))
  }
})

app.post('/wages-admin/own-schedule-paid', async (c) => {
  const db = c.env?.DB
  const admin = await adminUserFromCookie(c.req.raw.headers.get('cookie') || '')
  const back = (v: string) => new Response(null, { status: 302, headers: { location: v, 'cache-control': 'no-store' } })
  if (!db) return c.text('no database', 500)
  if (!admin) return back('/login?next=' + encodeURIComponent('/admin/wages'))
  let form: FormData
  try { form = await c.req.raw.formData() } catch (err) { return back('/admin/wages?error=' + encodeURIComponent('Could not read the form.')) }
  const ids = Array.from(new Set(form.getAll('shift_id').flatMap((v) => String(normalizeProxyFieldValue(v) || '').split(',')).map((x) => Number(x.trim())).filter((n) => n > 0)))
  const returnTo = normalizeProxyFieldValue(form.get('return_to')) || '/admin/wages'
  const safeReturn = /^\/admin\/wages(\?|$)/.test(returnTo) ? returnTo : '/admin/wages'
  const sep = safeReturn.includes('?') ? '&' : '?'
  if (!ids.length) return back(safeReturn + sep + 'error=' + encodeURIComponent('Tick the squares next to the shifts that have been paid, then press the button.') + '#bw-own-schedule')
  try {
    const done: string[] = []; let total = 0
    for (const id of ids) {
      const r = await db.prepare(`SELECT w.id, w.staff_id, w.work_date, w.start_time, w.end_time, COALESCE(w.gross_wage, w.total_amount, 0) amount, w.own_schedule_paid_at, s.display_name FROM wage_shifts w JOIN wage_staff s ON s.id = w.staff_id WHERE w.id = ? AND w.staff_id IN (SELECT staff_id FROM wage_own_schedule_staff)`).bind(id).first<{ id: number, staff_id: number, work_date: string, start_time: string, end_time: string, amount: number, own_schedule_paid_at: string | null, display_name: string }>()
      if (!r || r.own_schedule_paid_at) continue
      const stamp = ' | PAID to worker (own schedule) by ' + admin.name + ' on ' + new Date().toISOString().slice(0, 10) + ' — ' + fmtRand(Number(r.amount || 0))
      await db.prepare(`UPDATE wage_shifts SET own_schedule_paid_at = CURRENT_TIMESTAMP, own_schedule_paid_by = ?, payroll_note = COALESCE(payroll_note,'') || ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(admin.name, stamp, id).run()
      done.push('#' + id + ' ' + r.work_date + ' ' + fmtRand(Number(r.amount || 0))); total += Number(r.amount || 0)
      await captureWagesDebug(c.env, { request_path: '/wages-admin/own-schedule-paid', request_method: 'POST', original_payload_json: JSON.stringify({ shift_id: id, staff_id: r.staff_id, by: admin.name }), rewritten_payload_json: JSON.stringify({ amount: r.amount, work_date: r.work_date }), rewrite_applied: 1, response_status: 302, response_location: safeReturn, response_error_text: '' })
    }
    if (!done.length) return back(safeReturn + sep + 'msg=' + encodeURIComponent('Nothing to mark — already paid or not an own-schedule worker.') + '#bw-own-schedule')
    return back(safeReturn + sep + 'msg=' + encodeURIComponent('Marked PAID by ' + admin.name + ': ' + done.join('; ') + (done.length > 1 ? ' — total ' + fmtRand(total) : '')) + '#bw-own-schedule')
  } catch (err) {
    return back(safeReturn + sep + 'error=' + encodeURIComponent('Could not mark paid: ' + String((err as Error)?.message || err)))
  }
})

app.post('/wages-admin/confirm-holiday-hours', async (c) => {
  const db = c.env?.DB
  const admin = await adminUserFromCookie(c.req.raw.headers.get('cookie') || '')
  const back = (v: string) => new Response(null, { status: 302, headers: { location: v, 'cache-control': 'no-store' } })
  if (!db) return c.text('no database', 500)
  if (!admin) return back('/login?next=' + encodeURIComponent('/admin/wages'))
  let form: FormData
  try { form = await c.req.raw.formData() } catch (err) { return back('/admin/wages?error=' + encodeURIComponent('Could not read the form.')) }
  const shiftId = Number(normalizeProxyFieldValue(form.get('shift_id')))
  const actualEnd = normalizeProxyFieldValue(form.get('actual_end'))
  const returnTo = normalizeProxyFieldValue(form.get('return_to')) || '/admin/wages'
  const safeReturn = /^\/admin\/wages(\?|$)/.test(returnTo) ? returnTo : '/admin/wages'
  const sep = safeReturn.includes('?') ? '&' : '?'
  if (!shiftId || !/^\d{2}:\d{2}$/.test(actualEnd)) return back(safeReturn + sep + 'error=' + encodeURIComponent('Pick a time.'))
  try {
    const r = await db.prepare(`SELECT w.*, s.display_name, s.payroll_rule, COALESCE(w.gross_wage, w.total_amount, 0) amount FROM wage_shifts w JOIN wage_staff s ON s.id = w.staff_id WHERE w.id = ?`).bind(shiftId).first<any>()
    if (!r) return back(safeReturn + sep + 'error=' + encodeURIComponent('Shift #' + shiftId + ' not found.'))
    if (/HOLIDAY HOURS CONFIRMED/.test(r.payroll_note || '')) return back(safeReturn + sep + 'msg=' + encodeURIComponent('Shift #' + shiftId + ' was already confirmed.'))
    if (/^CORRECTION — public holiday/.test(String((r as any).work_description || ''))) return back(safeReturn + sep + 'msg=' + encodeURIComponent('Shift #' + shiftId + ' is itself a holiday top-up line — confirm the original row, not the correction.'))
    const kind = ownerPayKind(r.staff_id, r.work_type, [r.outlet_venue, r.work_description].join(' '), r.payroll_rule)
    let should = 0, text = ''
    if (kind === 'gardener') { const h = Math.max(0, (timeToMinutes(actualEnd)! - timeToMinutes(r.start_time)!) / 60); should = Math.round(h * 62.5 * 2 * 100) / 100; text = `gardener ${h.toFixed(2)} h × R62,50 × 2` }
    else { const p = ownerPayForShift(r.work_date, r.start_time, actualEnd, kind === 'warehouse_or_event' ? 'warehouse' : kind); should = Number(p?.recommendedAmount ?? p?.amount ?? 0); text = (p?.breakdown || '').replace(/^PUBLIC HOLIDAY — HELD for owner approval — recommended /, '').replace(/; R0 until approved$/, '') }
    const paid = Number(r.amount || 0), diff = Math.round((should - paid) * 100) / 100
    // Owner 23 Sep 2026: "Even if they worked less, I don't want anything to be done. I only want something to be
    // done if we underpaid them." → a top-up line ONLY when diff > 0; worked-less is recorded on the row, no recovery.
    const verdict = Math.abs(diff) < 0.01 ? 'paid correctly — nothing to do' : diff > 0 ? 'UNDERPAID by ' + fmtRand(diff) + ' — top-up added' : 'worked less than paid (' + fmtRand(-diff) + ') — owner rule: nothing recovered, recorded only'
    const note = ' | HOLIDAY HOURS CONFIRMED by ' + admin.name + ' ' + new Date().toISOString().slice(0, 10) + ': really worked ' + r.start_time + '–' + actualEnd + ' (paid as ' + r.start_time + '–' + r.end_time + ', ' + fmtRand(paid) + '); should be ' + text + ' = ' + fmtRand(should) + ' → ' + verdict
    await db.prepare(`UPDATE wage_shifts SET payroll_note = COALESCE(payroll_note,'') || ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(note, shiftId).run()
    let corr = ''
    if (diff >= 0.01) {
      // Top-up row in the CURRENT payroll (the holiday payroll is closed). Never negative (owner rule).
      const wk = currentProxyPayrollWeekStart()
      await db.prepare(`INSERT INTO wage_shifts (staff_id, work_date, outlet_venue, area, event_name, work_description, start_time, end_time, hours_worked, normal_hours, hourly_rate_snapshot, base_rate_snapshot, total_amount, normal_amount, gross_wage, entered_by, entered_by_type, manager_update_reason, work_type, calculation_version, missed_previous_week, payroll_week_start, payroll_note)
          VALUES (?, ?, ?, ?, 'Public holiday correction', ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, 'manager', ?, ?, 10, 1, ?, ?)`)
        .bind(r.staff_id, r.work_date, r.outlet_venue, r.area, 'CORRECTION — public holiday ' + r.work_date + ': really worked until ' + actualEnd + ' (paid to ' + r.end_time + ')', r.start_time, actualEnd, Number(r.hourly_rate_snapshot || 0), Number(r.hourly_rate_snapshot || 0), diff, diff, diff, admin.name, 'Holiday hours confirmed by ' + admin.name + ': ' + verdict + ' on shift #' + shiftId, r.work_type, wk, 'Correction line for shift #' + shiftId + ' (' + r.work_date + ' public holiday). Paid ' + fmtRand(paid) + ' for ' + r.start_time + '–' + r.end_time + '; really ' + r.start_time + '–' + actualEnd + ' = ' + fmtRand(should) + '. ' + verdict + '.').run()
      corr = ' A top-up line of ' + fmtRand(diff) + ' was added to this payroll.'
    } else if (diff <= -0.01) {
      corr = ' Nothing was deducted (your rule: only underpayments are corrected).'
    }
    await captureWagesDebug(c.env, { request_path: '/wages-admin/confirm-holiday-hours', request_method: 'POST', original_payload_json: JSON.stringify({ shift_id: shiftId, actual_end: actualEnd, paid, should, diff, by: admin.name }), rewritten_payload_json: '{}', rewrite_applied: 1, response_status: 302, response_location: safeReturn, response_error_text: '' })
    return back(safeReturn + sep + 'msg=' + encodeURIComponent(r.display_name + ' ' + r.work_date + ': really worked until ' + actualEnd + ' — ' + verdict + ' (paid ' + fmtRand(paid) + ', should be ' + fmtRand(should) + ').' + corr))
  } catch (err) {
    return back(safeReturn + sep + 'error=' + encodeURIComponent('Could not confirm: ' + describeProxyError(err)))
  }
})

app.post('/wages-admin/delete-draft', async (c) => {
  const db = c.env?.DB
  const admin = await adminUserFromCookie(c.req.raw.headers.get('cookie') || '')
  const back = (to: string) => c.redirect(to, 303)
  if (!db) return back('/admin/wages?error=' + encodeURIComponent('Database not available.'))
  if (!admin) return back('/login?next=' + encodeURIComponent('/admin/wages'))
  let form: FormData
  try { form = await c.req.raw.formData() } catch (err) { return back('/admin/wages?error=' + encodeURIComponent('Could not read the delete form.')) }
  const draftId = Number(normalizeProxyFieldValue(form.get('draft_id')))
  const returnTo = normalizeProxyFieldValue(form.get('return_to')) || '/admin/wages'
  const safeReturn = /^\/admin\/wages(\?|$)/.test(returnTo) ? returnTo : '/admin/wages'
  const sep = safeReturn.includes('?') ? '&' : '?'
  if (!draftId) return back(safeReturn + sep + 'error=' + encodeURIComponent('No draft id.'))
  try {
    const d = await db.prepare(`SELECT d.*, s.display_name FROM wage_shift_drafts d JOIN wage_staff s ON s.id = d.staff_id WHERE d.id = ?`).bind(draftId).first<any>()
    if (!d) return back(safeReturn + sep + 'error=' + encodeURIComponent('Draft #' + draftId + ' no longer exists.'))
    if (d.final_shift_id || d.status !== 'draft') return back(safeReturn + sep + 'error=' + encodeURIComponent('Draft #' + draftId + ' was already final-submitted (paid shift #' + d.final_shift_id + ') — use the manager correction on the paid shift instead.'))
    await captureWagesDebug(c.env, { request_path: '/wages-admin/delete-draft', request_method: 'POST', original_payload_json: JSON.stringify(d), rewritten_payload_json: JSON.stringify({ deleted_by: admin.name }), rewrite_applied: 1, response_status: 303, response_location: safeReturn, response_error_text: '' })
    await db.prepare(`UPDATE wage_payroll_reviews SET status = 'VOID', void_reason = ?, voided_by_name = ?, voided_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE subject_source = 'draft' AND subject_shift_id = ? AND status = 'OPEN'`).bind('Draft #' + draftId + ' (' + d.work_date + ') deleted by ' + admin.name, admin.name, draftId).run()
    try { await db.prepare(`DELETE FROM wage_draft_real_dates WHERE draft_id = ?`).bind(draftId).run() } catch (err) {}
    await db.prepare(`DELETE FROM wage_shift_drafts WHERE id = ? AND status = 'draft' AND final_shift_id IS NULL`).bind(draftId).run()
    return back(safeReturn + sep + 'msg=' + encodeURIComponent('Draft #' + draftId + ' (' + d.display_name + ', ' + d.work_date + ' ' + d.start_time + '–' + d.end_time + ') deleted by ' + admin.name + '. It no longer shows for the worker or the office; a copy is kept in the log.'))
  } catch (err) {
    return back(safeReturn + sep + 'error=' + encodeURIComponent('Could not delete draft #' + draftId + ': ' + describeProxyError(err)))
  }
})

// Owner 2026-09-22: change a decision. Puts a RESOLVED review back to OPEN; the previous decision is
// kept in the log and in the review's decision history note. If the decision had added rand to a paid
// row (Petrus extra / public holiday / rate choice / already-paid amount), that add-on is reversed so
// the new decision starts from the base amount.
app.post('/wages-admin/reopen-review', async (c) => {
  const db = c.env?.DB
  const admin = await adminUserFromCookie(c.req.raw.headers.get('cookie') || '')
  const back = (to: string) => c.redirect(to, 303)
  if (!db) return back('/admin/wages?error=' + encodeURIComponent('Database not available.'))
  if (!admin) return back('/login?next=' + encodeURIComponent('/admin/wages'))
  let form: FormData
  try { form = await c.req.raw.formData() } catch (err) { return back('/admin/wages?error=' + encodeURIComponent('Could not read the reopen form.')) }
  const reviewId = Number(normalizeProxyFieldValue(form.get('review_id')))
  const returnTo = normalizeProxyFieldValue(form.get('return_to')) || '/admin/wages'
  const safeReturn = /^\/admin\/wages(\?|$)/.test(returnTo) ? returnTo : '/admin/wages'
  const sep = safeReturn.includes('?') ? '&' : '?'
  try {
    const rv = await db.prepare(`SELECT * FROM wage_payroll_reviews WHERE id = ?`).bind(reviewId).first<any>()
    if (!rv) return back(safeReturn + sep + 'error=' + encodeURIComponent('Review #' + reviewId + ' not found.'))
    if (rv.status !== 'RESOLVED') return back(safeReturn + sep + 'error=' + encodeURIComponent('Review #' + reviewId + ' is ' + rv.status + ' — only a decided (RESOLVED) review can be reopened.'))
    let snap: any = {}; try { snap = JSON.parse(rv.system_snapshot_json || '{}') } catch (err) {}
    await captureWagesDebug(c.env, { request_path: '/wages-admin/reopen-review', request_method: 'POST', original_payload_json: JSON.stringify(rv), rewritten_payload_json: JSON.stringify({ reopened_by: admin.name }), rewrite_applied: 1, response_status: 303, response_location: safeReturn, response_error_text: '' })
    // Reverse a rand add-on placed on the paid row by the previous decision.
    let reversed = ''
    if (rv.subject_source === 'shift' && (snap.petrusExtra || snap.publicHoliday) && Number(snap.approvedExtraAmount || 0) > 0) {
      const row = await db.prepare(`SELECT id, total_amount, gross_wage FROM wage_shifts WHERE id = ?`).bind(rv.subject_shift_id).first<{ id: number, total_amount: number, gross_wage: number }>()
      if (row) {
        const before = Number(row.gross_wage ?? row.total_amount ?? 0), after = Math.round((before - Number(snap.approvedExtraAmount)) * 100) / 100
        await db.prepare(`UPDATE wage_shifts SET total_amount = ?, gross_wage = ?, payroll_note = COALESCE(payroll_note,'') || ' | Review #' || ? || ' reopened by ' || ? || ': previous add-on ' || ? || ' reversed (' || ? || ' → ' || ? || ')', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(after, after, reviewId, admin.name, fmtRand(Number(snap.approvedExtraAmount)), fmtRand(before), fmtRand(after), row.id).run()
        reversed = ' Previous ' + fmtRand(Number(snap.approvedExtraAmount)) + ' add-on reversed on shift #' + row.id + '.'
      }
    }
    const history = (snap.decisionHistory || []) as any[]
    history.push({ at: new Date().toISOString(), by: rv.reviewed_by_name, decision_type: rv.decision_type, decision_reason: rv.decision_reason, approved_payable_hours: rv.approved_payable_hours, approvedAmount: snap.approvedAmount, approvedExtraAmount: snap.approvedExtraAmount, placeDecision: snap.placeDecision, reopened_by: admin.name })
    for (const k of ['approvedAmount', 'approvedExtraAmount', 'approvedRate', 'decidedBy', 'placeDecision', 'placeDecidedBy', 'placeAmountIfSubmitted', 'placeBreakdown', 'customHours', 'customExtraAmount', 'customIncludeCorrection']) delete snap[k]
    snap.decisionHistory = history
    await db.prepare(`UPDATE wage_payroll_reviews SET status = 'REOPENED', decision_type = NULL, decision_reason = NULL, approved_payable_hours = NULL, approved_start_time = NULL, approved_end_time = NULL, reviewed_by_user_id = NULL, reviewed_by_name = NULL, reviewed_at = NULL, system_snapshot_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(JSON.stringify(snap), reviewId).run()
    await db.prepare(`UPDATE wage_payroll_reviews SET status = 'OPEN' WHERE id = ?`).bind(reviewId).run()
    return back(safeReturn + sep + 'msg=' + encodeURIComponent('Review #' + reviewId + ' reopened by ' + admin.name + ' — decide again below. Previous decision (' + (rv.decision_reason || rv.decision_type || '') + ') is kept in the log.' + reversed) + '#bw-review-' + reviewId)
  } catch (err) {
    return back(safeReturn + sep + 'error=' + encodeURIComponent('Could not reopen review #' + reviewId + ': ' + describeProxyError(err)))
  }
})

app.post('/wages-admin/review-decision', async (c) => {
  const db = c.env?.DB
  const admin = await adminUserFromCookie(c.req.raw.headers.get('cookie') || '')
  const back = (v: string) => new Response(null, { status: 302, headers: { location: v, 'cache-control': 'no-store' } })
  if (!db) return c.text('no database', 500)
  if (!admin) return back('/login?next=' + encodeURIComponent('/admin/wages'))
  let form: FormData
  try { form = await c.req.raw.formData() } catch (err) { return back('/admin/wages?error=' + encodeURIComponent('Could not read the decision form.')) }
  const reviewId = Number(normalizeProxyFieldValue(form.get('review_id')))
  const decision = normalizeProxyFieldValue(form.get('decision'))
  const reason = normalizeProxyFieldValue(form.get('reason')).slice(0, 500)
  const hoursRaw = normalizeProxyFieldValue(form.get('approved_hours'))
  const returnTo = normalizeProxyFieldValue(form.get('return_to')) || '/admin/wages'
  const safeReturn = /^\/admin\/wages(\?|$)/.test(returnTo) ? returnTo : '/admin/wages'
  const sep = safeReturn.includes('?') ? '&' : '?'
  if (!reviewId || !['approve', 'approve_original', 'dismiss', 'approve_amount', 'approve_zero', 'approve_custom_amount', 'approve_custom_hours'].includes(decision)) return back(safeReturn + sep + 'error=' + encodeURIComponent('Invalid review decision.'))
  // Owner 2026-09-21: "already paid" reviews are approved as a RAND AMOUNT (the system worked it out).
  if (decision === 'approve_amount' || decision === 'approve_zero' || decision === 'approve_custom_amount' || decision === 'approve_custom_hours') {
    try {
      const row = await db.prepare(`SELECT id, status, original_hours, system_snapshot_json FROM wage_payroll_reviews WHERE id = ?`).bind(reviewId).first<{ id: number, status: string, original_hours: number | null, system_snapshot_json: string | null }>()
      if (!row) return back(safeReturn + sep + 'error=' + encodeURIComponent('Review #' + reviewId + ' not found.'))
      if (row.status !== 'OPEN') return back(safeReturn + sep + 'msg=' + encodeURIComponent('Review #' + reviewId + ' was already ' + row.status + '.'))
      let snap: any = {}; try { snap = row.system_snapshot_json ? JSON.parse(row.system_snapshot_json) : {} } catch (err) {}
      let amount = Number(snap.recommendedAmount || 0), why = String(snap.recommendedReason || 'Already paid check')
      if (decision === 'approve_zero') { amount = 0; why = 'Nothing more due — already paid' }
      if (decision === 'approve_custom_amount') {
        amount = Number(normalizeProxyFieldValue(form.get('custom_amount')))
        const cr = normalizeProxyFieldValue(form.get('custom_reason')).slice(0, 500)
        if (!Number.isFinite(amount) || amount < 0) return back(safeReturn + sep + 'error=' + encodeURIComponent('Amount must be a number (0 or more) for review #' + reviewId + '.'))
        if (!cr) return back(safeReturn + sep + 'error=' + encodeURIComponent('Please give a reason for the different amount on review #' + reviewId + '.'))
        why = cr
      }
      let hours = amount === 0 ? 0 : Number(snap.extraHours || 0)
      if (decision === 'approve_custom_hours') {
        // Owner 2026-09-21: Bernie types the EXTRA hours; the system re-prices at the entry's own rate
        // (same rule the flag used) and adds the rate correction on the already-paid hours if ticked.
        hours = Number(normalizeProxyFieldValue(form.get('custom_hours')))
        const cr = normalizeProxyFieldValue(form.get('custom_reason')).slice(0, 500)
        if (!Number.isFinite(hours) || hours < 0) return back(safeReturn + sep + 'error=' + encodeURIComponent('Extra hours must be a number (0 or more) for review #' + reviewId + '.'))
        if (!cr) return back(safeReturn + sep + 'error=' + encodeURIComponent('Please give a reason for changing the hours on review #' + reviewId + '.'))
        const includeCorr = normalizeProxyFieldValue(form.get('include_rate_correction')) === '1' && Number(snap.rateCorrection || 0) > 0
        const rate = Number(snap.newRate || 0)
        const extraAmt = Math.round(hours * rate * 100) / 100
        amount = Math.round((extraAmt + (includeCorr ? Number(snap.rateCorrection) : 0)) * 100) / 100
        snap.customHours = hours; snap.customExtraAmount = extraAmt; snap.customIncludeCorrection = includeCorr
        why = cr + ' — ' + hours.toFixed(2) + ' h extra × ' + fmtRand(rate) + ' = ' + fmtRand(extraAmt) + (includeCorr ? ' + rate correction ' + fmtRand(Number(snap.rateCorrection)) : '')
      }
      snap.approvedAmount = amount
      const decisionType = amount === 0 ? 'already_paid_r0' : (Math.abs(amount - Number(snap.recommendedAmount || 0)) < 0.005 ? 'approve_adjusted' : 'approve_adjusted')
      await db.prepare(`UPDATE wage_payroll_reviews SET status = 'RESOLVED', decision_type = ?, decision_reason = ?, approved_payable_hours = ?, system_snapshot_json = ?, reviewed_by_user_id = ?, reviewed_by_name = ?, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'OPEN'`)
        .bind(decisionType, why + ' — approved amount ' + fmtRand(amount), hours, JSON.stringify(snap), admin.id || null, admin.name, reviewId).run()
      await captureWagesDebug(c.env, { request_path: '/wages-admin/review-decision', request_method: 'POST', original_payload_json: JSON.stringify({ review_id: reviewId, decision, approved_amount: amount, approved_hours: hours, by: admin.name }), rewritten_payload_json: '{}', rewrite_applied: 0, response_status: 302, response_location: safeReturn, response_error_text: '' })
      return back(safeReturn + sep + 'msg=' + encodeURIComponent('Review #' + reviewId + ' resolved by ' + admin.name + ': ' + fmtRand(amount) + ' approved (' + hours.toFixed(2) + ' h extra). Paid in this payroll as a correction line; nothing else changed.') + '#bw-review-' + reviewId)
    } catch (err) {
      return back(safeReturn + sep + 'error=' + encodeURIComponent('Could not record the decision: ' + describeProxyError(err)))
    }
  }
  if (!reason) return back(safeReturn + sep + 'error=' + encodeURIComponent('Please give a reason for review #' + reviewId + '.'))
  try {
    const row = await db.prepare(`SELECT id, status, original_hours, previously_paid_hours, system_proposed_payable_hours FROM wage_payroll_reviews WHERE id = ?`).bind(reviewId).first<{ id: number, status: string, original_hours: number | null, previously_paid_hours: number | null, system_proposed_payable_hours: number | null }>()
    if (!row) return back(safeReturn + sep + 'error=' + encodeURIComponent('Review #' + reviewId + ' not found.'))
    if (row.status !== 'OPEN') return back(safeReturn + sep + 'msg=' + encodeURIComponent('Review #' + reviewId + ' was already ' + row.status + '.'))
    // Engine vocabulary (DB CHECK constraints): status OPEN/REOPENED/RESOLVED/VOID;
    // decision_type approve_original / approve_adjusted / approve_additional_hours_only / already_paid_r0 / reject.
    let approvedHours: number | null = null
    const status = 'RESOLVED'
    let decisionType = 'approve_original'
    if (decision === 'approve_original') { approvedHours = row.original_hours; decisionType = 'approve_original' }
    else if (decision === 'approve') {
      const h = Number(hoursRaw)
      if (!Number.isFinite(h) || h < 0) return back(safeReturn + sep + 'error=' + encodeURIComponent('Approved hours must be a number (0 or more) for review #' + reviewId + '.'))
      approvedHours = h
      if (h === 0) decisionType = 'already_paid_r0'
      else if (row.original_hours !== null && Math.abs(Number(row.original_hours) - h) < 0.001) decisionType = 'approve_original'
      else if (row.previously_paid_hours !== null && Number(row.previously_paid_hours) > 0) decisionType = 'approve_additional_hours_only'
      else decisionType = 'approve_adjusted'
    } else { approvedHours = row.original_hours; decisionType = 'approve_original' } // "Dismiss – no issue": pay as claimed, recorded as such
    await db.prepare(`UPDATE wage_payroll_reviews SET status = ?, decision_type = ?, decision_reason = ?, approved_payable_hours = ?, reviewed_by_user_id = ?, reviewed_by_name = ?, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'OPEN'`)
      .bind(status, decisionType, reason, approvedHours, admin.id || null, admin.name, reviewId).run()
    await captureWagesDebug(c.env, { request_path: '/wages-admin/review-decision', request_method: 'POST', original_payload_json: JSON.stringify({ review_id: reviewId, decision, approved_hours: approvedHours, reason, by: admin.name }), rewritten_payload_json: '{}', rewrite_applied: 0, response_status: 302, response_location: safeReturn, response_error_text: '' })
    const msg = 'Review #' + reviewId + ' resolved by ' + admin.name + ': ' + (approvedHours === null ? 'as claimed' : Number(approvedHours).toFixed(2) + ' h') + ' (' + decisionType.replace(/_/g, ' ') + '). The paid shift itself is unchanged — use the manager correction if the hours must change.'
    return back(safeReturn + sep + 'msg=' + encodeURIComponent(msg) + '#bw-review-' + reviewId)
  } catch (err) {
    return back(safeReturn + sep + 'error=' + encodeURIComponent('Could not record the decision: ' + describeProxyError(err)))
  }
})

app.post('/wages-admin-ui-log', async (c) => {
  try {
    const cookie = c.req.raw.headers.get('cookie') || ''
    if (!/bw_session=/.test(cookie)) return c.json({ ok: false }, 401)
    const body = await c.req.raw.text()
    await captureWagesDebug(c.env, { request_path: '/admin/wages (ui-report)', request_method: 'POST', original_payload_json: body.slice(0, 4000), rewritten_payload_json: '{}', rewrite_applied: 0, response_status: 200, response_location: '', response_error_text: 'on-behalf block report' })
  } catch (err) {}
  return c.json({ ok: true })
})

app.get('/wages-version', (c) => c.json({ version: WAGES_UI_VERSION }, 200, { 'cache-control': 'no-store, no-cache, must-revalidate, max-age=0', pragma: 'no-cache', expires: '0' }))

// Wages integrity self-check. Read-only. Reports any "blank" submission
// (status='submitted' with no paid wage_shifts row) so the problem of
// 2026-09-14 can never sit unnoticed again. Also shows guard triggers exist.
app.get('/wages-health', async (c) => {
  const db = c.env?.DB
  if (!db) return c.json({ status: 'error', reason: 'no database binding' }, 500)
  try {
    const guards = await db.prepare(`SELECT count(*) AS n FROM sqlite_master WHERE type='trigger' AND name IN ('wage_shift_drafts_block_blank_submit_insert','wage_shift_drafts_block_blank_submit_update')`).first<{ n: number }>()
    const blanks = await db.prepare(`SELECT d.id, d.staff_id, s.display_name, d.work_date, d.start_time, d.end_time, d.submitted_at
      FROM wage_shift_drafts d LEFT JOIN wage_staff s ON s.id = d.staff_id
      WHERE d.status = 'submitted' AND d.final_shift_id IS NULL AND d.submitted_at >= '2026-09-12'
      ORDER BY d.id`).all()
    const orphanPaid = await db.prepare(`SELECT count(*) AS n FROM wage_shifts w
      WHERE w.source_draft_id IS NOT NULL AND w.created_at >= '2026-09-12'
        AND NOT EXISTS (SELECT 1 FROM wage_shift_drafts d WHERE d.id = w.source_draft_id AND d.final_shift_id = w.id)`).first<{ n: number }>()
    const lastPaid = await db.prepare(`SELECT max(created_at) AS t FROM wage_shifts`).first<{ t: string }>()
    const blankRows = (blanks.results || []) as Array<Record<string, unknown>>
    const ok = (guards?.n || 0) === 2 && blankRows.length === 0
    return c.json({
      status: ok ? 'ok' : 'ATTENTION',
      checked_at: new Date().toISOString(),
      guard_triggers_installed: (guards?.n || 0) === 2,
      blank_submissions_this_payroll: blankRows.length,
      blank_submission_rows: blankRows,
      paid_shifts_without_matching_draft_this_payroll: orphanPaid?.n || 0,
      last_paid_shift_created_at: lastPaid?.t || null,
      meaning: ok
        ? 'Every submitted shift this payroll has a paid shift record behind it. Blank submissions are blocked at database level.'
        : 'A submitted shift exists with no paid record, or the database guard is missing. Investigate before payroll.',
    }, ok ? 200 : 503)
  } catch (err) {
    return c.json({ status: 'error', reason: String((err as Error)?.message || err) }, 500)
  }
})
app.post('/field/ai-extract', handleAiExtract)
app.all('*', proxyRequest)

export default app
