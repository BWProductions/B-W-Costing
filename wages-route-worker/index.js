const ORIGIN = 'https://3c3bcb89.bw-productions.pages.dev'

class DashboardButtonInjector {
  element(element) {
    element.append(
      '<a class="btn btn-outline btn-sm" href="/"><i class="fas fa-gauge-high"></i> Dashboard</a>',
      { html: true },
    )
  }
}

class TeamPickerInitInjector {
  element(element) {
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

async function handleAiExtract(request, env) {
  try {
    const body = await request.json()
    const images = Array.isArray(body?.images) ? body.images : []
    const apiKey = (env.ANTHROPIC_API_KEY || '').trim()

    if (!apiKey) {
      return Response.json({ success: false, error: 'ANTHROPIC_API_KEY is not configured on this deployment.' }, { status: 500 })
    }
    if (!images.length) {
      return Response.json({ success: false, error: 'No images provided' }, { status: 400 })
    }

    const imageBlocks = images.map((dataUrl) => {
      const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
      if (!match) return null
      return {
        type: 'image',
        source: { type: 'base64', media_type: match[1], data: match[2] },
      }
    }).filter(Boolean)

    if (!imageBlocks.length) {
      return Response.json({ success: false, error: 'Images must be base64 data URLs.' }, { status: 400 })
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
        messages: [{ role: 'user', content: [...imageBlocks, { type: 'text', text: buildPrompt() }] }],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      return Response.json({ success: false, error: 'Claude API error: ' + err }, { status: 500 })
    }

    const aiResult = await response.json()
    const text = aiResult.content?.[0]?.text || ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return Response.json({ success: false, error: 'Could not parse AI response', raw: text }, { status: 500 })
    }

    const extracted = JSON.parse(jsonMatch[0])
    return Response.json({ success: true, data: extracted })
  } catch (err) {
    return Response.json({ success: false, error: err?.message || 'Unknown AI extract error' }, { status: 500 })
  }
}

function rewriteHeaders(response, browserOrigin) {
  const headers = new Headers(response.headers)
  const location = headers.get('location')
  if (location && location.startsWith(ORIGIN)) {
    headers.set('location', browserOrigin + location.slice(ORIGIN.length))
  }
  return headers
}

async function proxyRequest(request) {
  const incomingUrl = new URL(request.url)
  const upstreamUrl = new URL(incomingUrl.pathname + incomingUrl.search, ORIGIN)
  const upstreamHeaders = new Headers(request.headers)
  upstreamHeaders.set('host', new URL(ORIGIN).host)
  upstreamHeaders.set('x-forwarded-host', incomingUrl.host)
  upstreamHeaders.set('x-forwarded-proto', incomingUrl.protocol.replace(':', ''))

  const upstreamRequest = new Request(upstreamUrl.toString(), {
    method: request.method,
    headers: upstreamHeaders,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
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
  if (request.method !== 'GET' || !contentType.includes('text/html')) {
    return baseResponse
  }

  const path = incomingUrl.pathname
  const needsWagesButton = path === '/admin/wages'
  const needsTeamInit = path === '/field/preload' || path === '/field/delivery/new'
  if (!needsWagesButton && !needsTeamInit) {
    return baseResponse
  }

  const rewriter = new HTMLRewriter()
  if (needsWagesButton) rewriter.on('#topbar-actions', new DashboardButtonInjector())
  if (needsTeamInit) rewriter.on('body', new TeamPickerInitInjector())
  return rewriter.transform(baseResponse)
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/health') {
      return Response.json({ status: 'ok', mode: 'safe-proxy-worker', origin: ORIGIN })
    }
    if (url.pathname === '/field/ai-extract' && request.method === 'POST') {
      return handleAiExtract(request, env)
    }
    return proxyRequest(request)
  },
}
