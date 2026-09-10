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
  background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%) !important;
  color: #fff !important;
  border: 0 !important;
  box-shadow: 0 10px 24px rgba(109, 40, 217, 0.22) !important;
  transition: transform .15s ease, box-shadow .15s ease, background .15s ease !important;
}
.bw-add-shift-btn:hover,
.bw-add-shift-btn:focus-visible,
.bw-add-shift-btn:active,
.bw-add-shift-btn.bw-is-selected {
  background: linear-gradient(135deg, #14b8a6 0%, #0f766e 100%) !important;
  color: #fff !important;
  box-shadow: 0 12px 28px rgba(15, 118, 110, 0.28) !important;
  transform: translateY(-1px);
}
.bw-save-temp-btn {
  background: #fff !important;
  border: 2px solid #8b6914 !important;
  color: #8b6914 !important;
}
.bw-miss-shift-btn {
  background: #fff1f1 !important;
  border: 2px solid #d65a5a !important;
  color: #9d1c1c !important;
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
@media (max-width: 560px) {
  .bw-final-submit-panel__row { align-items: stretch; }
  .bw-final-submit-go, .bw-last-payroll-btn { width: 100% !important; }
}
</style>
<script>
(function () {
  if (window.__bwWagesEnhancerLoaded) return
  window.__bwWagesEnhancerLoaded = true

  const DASHBOARD_PATH = '/'
  const WAGES_HOME_PATH = '/wages'
  const LOGOUT_PATH = '/wages/logout'

  const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim()
  const elementText = (el) => normalize(el?.textContent || (el instanceof HTMLInputElement ? el.value : ''))
  const actionElements = () => Array.from(document.querySelectorAll('a, button, input[type="submit"], input[type="button"]'))
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
    const cleaned = normalize(value).replace(/\//g, '-')
    const match = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!match) return null
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
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

  function ensureReturnToDashboard() {
    const topnav = ensureTopNav()
    if (!topnav) return

    const signOutLink = actionElements().find((el) => textMatches(el, /^sign out$/i))
    if (signOutLink) {
      if (signOutLink instanceof HTMLInputElement) signOutLink.value = 'Return to Dashboard'
      else signOutLink.textContent = 'Return to Dashboard'
      signOutLink.classList.add('bw-return-dashboard')
      if (signOutLink instanceof HTMLAnchorElement) signOutLink.href = DASHBOARD_PATH
      if (once(signOutLink, 'ReturnDash')) {
        signOutLink.addEventListener('click', (event) => {
          event.preventDefault()
          void logoutThenRedirect(DASHBOARD_PATH)
        })
      }
      return
    }

    if (!topnav.querySelector('.bw-return-dashboard')) {
      const link = document.createElement('a')
      link.href = DASHBOARD_PATH
      link.className = 'bw-return-dashboard'
      link.textContent = 'Return to Dashboard'
      link.addEventListener('click', (event) => {
        const onWagesPage = window.location.pathname.startsWith('/wages')
        if (!onWagesPage) return
        event.preventDefault()
        void logoutThenRedirect(DASHBOARD_PATH)
      })
      topnav.appendChild(link)
    }
  }

  function fixSwitchPerson() {
    actionElements().forEach((el) => {
      if (!textMatches(el, /^‹?\s*switch person$/i)) return
      if (el instanceof HTMLAnchorElement) el.href = WAGES_HOME_PATH
      if (!once(el, 'SwitchPerson')) return
      el.addEventListener('click', (event) => {
        event.preventDefault()
        void logoutThenRedirect(WAGES_HOME_PATH)
      })
    })
  }

  function decorateButtons() {
    actionElements().forEach((el) => {
      const text = elementText(el)
      if (/^add( a)? shift$/i.test(text)) {
        el.classList.add('bw-add-shift-btn')
        if (once(el, 'AddShiftState')) {
          const markSelected = () => el.classList.add('bw-is-selected')
          const clearSelected = () => el.classList.remove('bw-is-selected')
          el.addEventListener('click', markSelected)
          el.addEventListener('focus', markSelected)
          el.addEventListener('blur', clearSelected)
        }
      }
      if (/save shift temporarily/i.test(text)) el.classList.add('bw-save-temp-btn')
      if (/miss(ed)? shift/i.test(text)) el.classList.add('bw-miss-shift-btn')
    })
  }

  function moveAddShiftNearSaveTemporary() {
    const addButton = actionElements().find((el) => /^add( a)? shift$/i.test(elementText(el)))
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

  function unlockPayrollWeekPicker() {
    const labels = Array.from(document.querySelectorAll('label')).filter((label) => /view payroll week/i.test(elementText(label)))
    labels.forEach((label) => {
      const container = label.parentElement || label.closest('.period-filter') || label.parentElement
      const field = container?.querySelector('input') || document.querySelector('input[type="date"], input[name*="week" i], input[id*="week" i]')
      if (!field) return
      field.disabled = false
      field.readOnly = false
      field.removeAttribute('max')
      field.removeAttribute('min')

      const filter = field.closest('.period-filter') || container
      if (!filter || filter.querySelector('.bw-period-tools')) return

      const viewButton = Array.from(filter.querySelectorAll('button, a, input[type="submit"]')).find((el) => /view week/i.test(elementText(el)))
      const tools = document.createElement('div')
      tools.className = 'bw-period-tools'
      const lastWeekButton = document.createElement('button')
      lastWeekButton.type = 'button'
      lastWeekButton.className = 'btn btn-outline bw-last-payroll-btn'
      lastWeekButton.textContent = 'Last payroll'
      lastWeekButton.addEventListener('click', () => {
        const current = parseFlexibleDate(field.value) || parseFlexibleDate(field.getAttribute('value') || '') || new Date()
        const previous = new Date(current.getTime())
        previous.setUTCDate(previous.getUTCDate() - 7)
        field.value = formatForInput(previous, field.type !== 'date' && field.value.includes('/'))
        if (viewButton instanceof HTMLInputElement) viewButton.click()
        else viewButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      tools.appendChild(lastWeekButton)
      filter.appendChild(tools)
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
    ensureReturnToDashboard()
    fixSwitchPerson()
    decorateButtons()
    moveAddShiftNearSaveTemporary()
    unlockPayrollWeekPicker()
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

async function proxyRequest(c: any) {
  const incomingUrl = new URL(c.req.url)
  const upstreamUrl = new URL(incomingUrl.pathname + incomingUrl.search, ORIGIN)
  const upstreamHeaders = new Headers(c.req.raw.headers)
  upstreamHeaders.set('host', new URL(ORIGIN).host)
  upstreamHeaders.set('x-forwarded-host', incomingUrl.host)
  upstreamHeaders.set('x-forwarded-proto', incomingUrl.protocol.replace(':', ''))

  const upstreamRequest = new Request(upstreamUrl.toString(), {
    method: c.req.raw.method,
    headers: upstreamHeaders,
    body: ['GET', 'HEAD'].includes(c.req.raw.method) ? undefined : c.req.raw.body,
    redirect: 'manual',
  })

  const upstreamResponse = await fetch(upstreamRequest)
  const headers = rewriteHeaders(upstreamResponse, incomingUrl.origin)
  const baseResponse = new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers,
  })

  const contentType = headers.get('content-type') || ''
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
