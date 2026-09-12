import { Hono } from 'hono'

type Bindings = {
  ANTHROPIC_API_KEY?: string
}

const ORIGIN = 'https://3c3bcb89.bw-productions.pages.dev'

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
}
</style>
<script>
(function () {
  if (window.__bwWagesEnhancerLoaded) return
  window.__bwWagesEnhancerLoaded = true

  const DASHBOARD_PATH = '/admin/wages'
  const WAGES_HOME_PATH = '/wages'
  const LOGOUT_PATH = '/wages/logout'
  const CLAIM_WEEK_STORAGE_KEY = 'bwWagesClaimWeekStart'
  const MISSED_MODE_STORAGE_KEY = 'bwWagesMissedShiftMode'
  const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const FALLBACK_WORK_TYPE_OPTIONS = ['Normal', 'House', 'House/Garden', 'Warehouse Team', 'Team Assistance', 'Music Bus']
  const COMMON_VENUE_SUGGESTIONS = ['Warehouse', 'Garden', 'Work with the Team', 'House', 'Music Bus', 'Ellis Park', 'FNB Stadium', 'Loftus', 'Inanda Club', 'Supersport Park', 'SAB HQ', 'DHL Stadium']
  const STAFF_WORK_TYPE_PROFILES = [
    { ids: ['1'], names: ['givemore chifetete kuziwa', 'givemore'], options: ['House', 'Team Assistance'] },
    { ids: ['2'], names: ['takavaudza chokuda', 'takavaudza', 'takka'], options: ['House/Garden', 'Warehouse Team'] },
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

  function decorateButtons() {
    const onShiftEntryPage = actionElements().some((el) => /save shift temporarily/i.test(elementText(el)))

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
            if (window.__bwLaunchMode === 'missed') {
              setStoredMissedMode(true)
              window.__bwLaunchMode = ''
            } else {
              setStoredMissedMode(false)
            }
            markSelected()
          })
          el.addEventListener('focus', markSelected)
          el.addEventListener('blur', clearSelected)
        }
      }
      if (/save shift temporarily/i.test(text)) el.classList.add('bw-save-temp-btn')
      if (onShiftEntryPage && /miss(ed)? shift|missshift/i.test(text)) {
        el.classList.add('bw-miss-shift-btn')
        if (once(el, 'MissShiftMode')) {
          el.addEventListener('click', () => {
            setStoredMissedMode(true)
            document.documentElement.classList.add('bw-missed-mode')
            document.body.classList.add('bw-missed-mode')
            const pageHeading = document.querySelector('main h1, .shell h1, h1')
            if (pageHeading) pageHeading.textContent = 'Add a missed shift'
            const pageSubtitle = Array.from(document.querySelectorAll('main p, .shell p, p')).find((node) => /save it temporarily while you work|final submission|current shift|missed shift/i.test(elementText(node)))
            if (pageSubtitle) pageSubtitle.textContent = 'You are capturing a missed shift. Fill in the exact date worked and complete the details below.'
          })
        }
      }
    })
  }

  function ensureFrontPageMissShiftButton() {
    if (!isWagesHomePage()) {
      document.querySelectorAll('.bw-home-miss-shift-btn').forEach((node) => node.remove())
      document.querySelectorAll('.bw-home-shift-stack').forEach((node) => {
        if (!node.querySelector('.bw-home-miss-shift-btn') && !node.children.length) node.remove()
      })
      return
    }

    const addButton = visibleActionElements().find((el) => isAddShiftAction(elementText(el)) && !el.closest('form'))
    if (!addButton) return

    let stack = document.querySelector('.bw-home-shift-stack')
    if (!(stack instanceof HTMLElement)) {
      stack = document.createElement('div')
      stack.className = 'bw-home-shift-stack'
      addButton.parentElement?.insertBefore(stack, addButton)
      stack.appendChild(addButton)
    } else if (!stack.contains(addButton)) {
      stack.prepend(addButton)
    }

    let missButton = stack.querySelector('.bw-home-miss-shift-btn')
    if (!missButton) {
      missButton = document.createElement('button')
      missButton.type = 'button'
      missButton.className = 'btn bw-miss-shift-btn bw-home-miss-shift-btn'
      missButton.textContent = 'Add a missed shift'
      stack.appendChild(missButton)
    }

    if (!once(missButton, 'FrontPageMissShift')) return
    missButton.addEventListener('click', (event) => {
      event.preventDefault()
      setStoredMissedMode(true)
      if (addButton instanceof HTMLAnchorElement && addButton.href) {
        const targetUrl = new URL(addButton.href, window.location.origin)
        targetUrl.searchParams.set('bw_missed', '1')
        window.location.href = targetUrl.toString()
        return
      }
      window.__bwLaunchMode = 'missed'
      addButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
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

  function findPayrollWeekField() {
    const labels = Array.from(document.querySelectorAll('label')).filter((label) => elementText(label).toLowerCase() === 'view payroll week')
    for (const label of labels) {
      const container = label.parentElement || label.closest('.period-filter') || label.parentElement
      const field = container?.querySelector('input')
      if (field) return field
    }
    return document.querySelector('input[name="payroll_week_start"], input[id="payroll_week_start"], input[type="date"], input[name*="week"], input[id*="week"]')
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

  function resolveClaimWeekStart(field, hiddenField) {
    const current = parseFlexibleDate(field?.value || field?.getAttribute('value') || hiddenField?.value || getStoredClaimWeek()) || utcToday()
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
      const current = parseFlexibleDate(workDateField.value || workDateField.selectedOptions?.[0]?.textContent || '')
      const currentValue = current ? formatForInput(current, false) : ''
      const placeholderText = workDateField.dataset.bwPlaceholderText || 'Date worked — select exact date missed'
      workDateField.dataset.bwPlaceholderText = placeholderText
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
      workDateField.value = windowConfig.dates.some((entry) => entry.value === currentValue) ? currentValue : ''
      return
    }
    if (workDateField instanceof HTMLInputElement && workDateField.type === 'date') {
      workDateField.min = formatForInput(windowConfig.previousPayrollStart, false)
      workDateField.max = formatForInput(windowConfig.rangeEnd, false)
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

  function ensureVisibleWorkDateField(form, anchorField) {
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

    if (isVisibleWorkDateField(visibleField)) {
      if (visibleField instanceof HTMLInputElement && visibleField.type === 'date') {
        Array.from(form.querySelectorAll('select[name="work_date"], select[id="work_date"], select[id="work-date"]'))
          .filter((field) => field !== visibleField && isVisibleWorkDateField(field))
          .forEach((field) => {
            const previousLabel = field.previousElementSibling
            if (previousLabel && /date worked/i.test(elementText(previousLabel))) previousLabel.remove()
            field.remove()
          })
      }
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

  function emphasizeDateWorkedField(workDateField) {
    if (!workDateField) return
    workDateField.classList.add('bw-work-date-field')
    const wrapper = workDateField.closest('.bw-date-worked-wrap')
    if (wrapper) wrapper.classList.add('bw-field-shell')
  }

  function ensureMissedShiftHeading(scope, form, isActive) {
    const pageHeading = document.querySelector('main h1, .shell h1, h1')
    if (pageHeading) {
      pageHeading.textContent = isActive ? 'Add a missed shift' : 'Add a current shift'
    }

    const pageSubtitle = Array.from(document.querySelectorAll('main p, .shell p, p')).find((node) => /save it temporarily while you work|final submission|current shift|missed shift/i.test(elementText(node)))
    if (pageSubtitle) {
      pageSubtitle.textContent = isActive
        ? 'You are on the missed shift page. Fill in the exact date worked and complete the details below.'
        : 'Save it temporarily while you work, or continue to Final Submission when every detail is correct.'
    }

    let banner = form.querySelector('.bw-missed-mode-banner')
    if (isActive) {
      if (!banner) {
        banner = document.createElement('div')
        banner.className = 'bw-missed-mode-banner'
        banner.textContent = 'Missed shift page — select the date you missed'
        form.insertBefore(banner, form.firstChild)
      }
    } else if (banner) {
      banner.remove()
    }

    const textTargets = Array.from((scope || form).querySelectorAll('h1, h2, h3, h4, legend, .eyebrow, .title, .bw-missed-heading')).filter((node) => /miss ?shift|missshift/i.test(elementText(node)))
    textTargets.forEach((node) => {
      if (node === pageHeading) return
      if (isActive) return
      node.remove()
    })

    document.documentElement.classList.toggle('bw-missed-mode', !!isActive)
    document.body.classList.toggle('bw-missed-mode', !!isActive)
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

  function resolveStaffWorkTypeProfile(form) {
    const idFields = Array.from(form.querySelectorAll('input[name="staff_id"], input[name="person_id"], input[name="worker_id"], input[name="employee_id"], select[name="staff_id"], select[name="person_id"], select[name="worker_id"], select[name="employee_id"]'))
    const idValues = idFields.map((field) => normalize(field.value || field.getAttribute('value') || ''))
    for (const profile of STAFF_WORK_TYPE_PROFILES) {
      if (profile.ids.some((id) => idValues.includes(id))) return profile
    }

    const bodyText = elementText(document.body).toLowerCase()
    for (const profile of STAFF_WORK_TYPE_PROFILES) {
      if (profile.names.some((name) => bodyText.includes(name))) return profile
    }
    return null
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
      const select = buildSyncedSelect(form, originalField.name || 'work_type', originalField, options, 'Work type / role', 'Select work type')
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
    return buildSyncedSelect(form, 'work_type', anchorField, options, 'Work type / role', 'Select work type')
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
    const activePayrollWeekStart = resolveClaimWeekStart(payload.claimWeekField, payload.claimWeekHidden)
    const windowConfig = getMissedShiftWindow(activePayrollWeekStart)
    setStoredClaimWeek(activePayrollWeekStart)
    widenMissedShiftDateChoices(payload.workDateField, activePayrollWeekStart)
    rewriteMissedShiftRestrictionText(payload.scope, activePayrollWeekStart)

    const workDate = parseFlexibleDate(payload.workDateField.value || payload.workDateField.getAttribute('value') || '')
    const selectedClaimWeek = workDate && workDate.getTime() < windowConfig.currentPayrollStart.getTime()
      ? formatForInput(windowConfig.previousPayrollStart, false)
      : formatForInput(windowConfig.currentPayrollStart, false)
    payload.claimWeekHidden.value = selectedClaimWeek
    const isPrevious = !!(workDate && workDate.getTime() < windowConfig.currentPayrollStart.getTime())
    payload.previousPayrollHidden.value = isPrevious ? '1' : '0'

    const reviewBits = []
    if (payload.claimWeekHidden.value) reviewBits.push('Claimed against payroll week ' + payload.claimWeekHidden.value + '.')
    if (workDate) reviewBits.push('Exact work date ' + formatForInput(workDate, false) + '.')
    if (payload.venueField?.value) reviewBits.push('Venue ' + payload.venueField.value + '.')
    if (payload.workTypeField?.value) reviewBits.push('Work type / role ' + payload.workTypeField.value + '.')
    if (payload.descriptionField?.value) reviewBits.push('Description ' + payload.descriptionField.value + '.')
    if (payload.startField?.value || payload.endField?.value) reviewBits.push('Captured time ' + (payload.startField?.value || '??') + '-' + (payload.endField?.value || '??') + '.')
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

  function enhanceMissedShiftForms() {
    const claimWeekField = findPayrollWeekField()
    if (claimWeekField) {
      const syncStoredWeek = () => {
        const claimWeekStart = resolveClaimWeekStart(claimWeekField, null)
        if (claimWeekStart) setStoredClaimWeek(claimWeekStart)
      }
      if (once(claimWeekField, 'ClaimWeekPersist')) {
        claimWeekField.addEventListener('input', syncStoredWeek)
        claimWeekField.addEventListener('change', syncStoredWeek)
      }
      syncStoredWeek()
    }

    const pendingMissedMode = peekStoredMissedMode()

    Array.from(document.querySelectorAll('form')).forEach((form) => {
      removeBrokenMissedShiftPanel(form)
      if (!isMissedShiftForm(form) && !(pendingMissedMode && looksLikeShiftEntryForm(form))) return

      const scope = form.closest('.card, .form-card, .shift, section, article, div') || form
      const venueField = firstField(form, ['input[name="outlet_venue"]', 'input[name="venue_name"]', 'input[name="venue"]', 'input[id="outlet_venue"]', 'input[id="venue_name"]', 'input[id="venue"]'])
      const workDateBinding = ensureVisibleWorkDateField(form, venueField)
      const workDateField = workDateBinding.visibleField
      const descriptionField = firstField(form, ['textarea[name="work_description"]', 'input[name="work_description"]', 'textarea[name="details"]', 'input[name="details"]', 'textarea'])
      const rawWorkTypeField = firstField(form, ['select[name="work_type"]', 'input[name="work_type"]', 'select[name="role_worked"]', 'input[name="role_worked"]'])
      const workTypeField = restoreWorkTypeField(form, rawWorkTypeField, descriptionField || venueField || workDateField)
      const startField = firstField(form, ['input[name="start_time"]', 'input[name="start"]', 'input[id="start_time"]', 'input[id="start-time"]', 'input[type="time"]'])
      const endField = firstField(form, ['input[name="end_time"]', 'input[name="finish_time"]', 'input[name="finish"]', 'input[id="end_time"]', 'input[id="finish_time"]'])

      if (!workDateField || !startField || !endField) return

      const isMissedModeActive = isMissedShiftModeActive(scope, form)
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

      bindMissedShiftMetadata({
        form,
        scope,
        claimWeekField,
        claimWeekHidden,
        workDateField: workDateField || workDateHidden,
        venueField,
        workTypeField,
        descriptionField,
        startField,
        endField,
        previousPayrollHidden,
        reviewNoteHidden,
      })
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
    consumeMissedQueryFlag()
    removeStaffDashboardAccess()
    fixSwitchPerson()
    decorateButtons()
    document.querySelectorAll('.bw-home-miss-shift-btn').forEach((node) => node.remove())
    document.querySelectorAll('.bw-period-tools, .bw-last-payroll-btn').forEach((node) => node.remove())
    moveAddShiftNearSaveTemporary()
    unlockPayrollWeekPicker()
    enhanceMissedShiftForms()
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

async function proxyRequest(c: any) {
  const incomingUrl = new URL(c.req.url)
  const upstreamUrl = new URL(incomingUrl.pathname + incomingUrl.search, ORIGIN)
  const upstreamHeaders = rewriteRequestHeaders(c.req.raw.headers, incomingUrl, upstreamUrl)

  const upstreamRequest = new Request(upstreamUrl.toString(), {
    method: c.req.raw.method,
    headers: upstreamHeaders,
    body: ['GET', 'HEAD'].includes(c.req.raw.method) ? undefined : c.req.raw.body,
    redirect: 'manual',
  })

  const upstreamResponse = await fetch(upstreamRequest)
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
