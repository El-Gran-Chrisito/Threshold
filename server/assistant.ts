/**
 * The design assistant for the hosted app: paying customers' requests go
 * to the Claude API with the site owner's key. Inside Claude the app uses
 * the viewer's own Claude instead, and never calls this.
 *
 *   POST /assistant  { prompt, image?: { mediaType, data } }  -> { json }
 *   Authorization: License THR1...
 *
 * Errors come back as { code, message } with the same codes the app shows
 * for the in-Claude assistant: rate_limited, invalid_json, refused,
 * prompt_too_large, image_rejected, upstream_error.
 */

type Fetch = typeof fetch

export interface AssistantEnv {
  ANTHROPIC_API_KEY?: string
  /** Defaults to claude-sonnet-5. */
  ASSISTANT_MODEL?: string
  /** Requests per customer per day (default 60). Needs the DESIGNS store to count. */
  ASSISTANT_DAILY_LIMIT?: string
}

export interface AssistantRequest {
  prompt: string
  image?: { mediaType: string; data: string } | null
}

export type AssistantError = { ok: false; status: number; code: string; message: string }
export type AssistantResult = { ok: true; json: unknown } | AssistantError

const MAX_PROMPT = 200_000
const MAX_IMAGE_B64 = 7_000_000
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

const SYSTEM = 'You edit home designs for the Threshold app. Answer with one JSON object and nothing else: no prose before or after it, no code fences.'

/** The first complete JSON object in a reply, allowing for stray fences or text. */
export function parseJsonReply(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  try {
    return JSON.parse(t)
  } catch {
    const start = t.indexOf('{')
    const end = t.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(t.slice(start, end + 1))
    throw new Error('no json')
  }
}

export function checkRequest(body: Record<string, unknown>): AssistantRequest | AssistantError {
  const prompt = typeof body.prompt === 'string' ? body.prompt : ''
  if (!prompt.trim()) return { ok: false, status: 400, code: 'upstream_error', message: 'Missing request' }
  if (prompt.length > MAX_PROMPT) return { ok: false, status: 413, code: 'prompt_too_large', message: 'Request too large' }
  const img = body.image as { mediaType?: unknown; data?: unknown } | null | undefined
  if (img) {
    if (typeof img.mediaType !== 'string' || !IMAGE_TYPES.includes(img.mediaType) || typeof img.data !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(img.data.slice(0, 200)))
      return { ok: false, status: 400, code: 'image_rejected', message: 'Unsupported image' }
    if (img.data.length > MAX_IMAGE_B64) return { ok: false, status: 413, code: 'image_rejected', message: 'Image too large' }
    return { prompt, image: { mediaType: img.mediaType, data: img.data } }
  }
  return { prompt, image: null }
}

export async function askClaude(env: AssistantEnv, req: AssistantRequest, fetchImpl: Fetch): Promise<AssistantResult> {
  if (!env.ANTHROPIC_API_KEY) return { ok: false, status: 501, code: 'not_configured', message: 'The assistant is not set up on this site' }
  const content = [
    ...(req.image ? [{ type: 'image', source: { type: 'base64', media_type: req.image.mediaType, data: req.image.data } }] : []),
    { type: 'text', text: req.prompt },
  ]
  let res: Response
  try {
    res = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: env.ASSISTANT_MODEL || 'claude-sonnet-5', max_tokens: 16000, system: SYSTEM, messages: [{ role: 'user', content }] }),
    })
  } catch {
    return { ok: false, status: 502, code: 'upstream_error', message: 'Could not reach Claude' }
  }
  if (res.status === 429 || res.status === 529) return { ok: false, status: 429, code: 'rate_limited', message: 'Busy, try again soon' }
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    if (/prompt is too long|too many tokens/i.test(detail)) return { ok: false, status: 413, code: 'prompt_too_large', message: 'Request too large' }
    if (/image/i.test(detail)) return { ok: false, status: 400, code: 'image_rejected', message: 'Image not accepted' }
    return { ok: false, status: 502, code: 'upstream_error', message: 'Claude returned an error' }
  }
  const data = (await res.json()) as { stop_reason?: string; content?: Array<{ type: string; text?: string }> }
  if (data.stop_reason === 'refusal') return { ok: false, status: 422, code: 'refused', message: 'Declined' }
  const text = (data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('')
  try {
    return { ok: true, json: parseJsonReply(text) }
  } catch {
    return { ok: false, status: 422, code: 'invalid_json', message: 'The answer was not a list of changes' }
  }
}
