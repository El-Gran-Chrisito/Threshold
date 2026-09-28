/**
 * The assistant outside Claude: requests go through the license server
 * (server/assistant.ts), which checks the license and calls the Claude API.
 * Same shape as the in-Claude `sample` capability, so the panel treats both
 * the same way.
 */
import { productConfig } from '../product/config'
import { useEntitlements } from '../product/entitlements'
import { allows } from '../product/plans'

export interface SampleLike {
  json: <T>(input: string, options?: Record<string, unknown>) => Promise<T>
  limits: () => Promise<{ images?: { maxCount: number; mediaTypes: string[] } }>
}

/** Fit a picture within 1568 px (what the model reads best) and send it as JPEG. */
async function prepareImage(file: Blob): Promise<{ mediaType: string; data: string }> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject({ code: 'image_rejected', message: 'not an image' })
      img.src = url
    })
    const k = Math.min(1, 1568 / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(img.width * k))
    c.height = Math.max(1, Math.round(img.height * k))
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(img, 0, 0, c.width, c.height)
    return { mediaType: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.9).split(',')[1] }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function hostedAssistant(): SampleLike | null {
  const ent = useEntitlements.getState()
  const api = productConfig.licenseApi
  // A paid license or a server-signed trial key; a trial kept only in the browser has no key to check.
  if (!api || !ent.license || !ent.key || !allows(ent.plan, 'assistant')) return null
  const key = ent.key
  return {
    limits: async () => ({ images: { maxCount: 1, mediaTypes: ['image/jpeg', 'image/png', 'image/webp'] } }),
    json: async <T,>(prompt: string, options: Record<string, unknown> = {}): Promise<T> => {
      const signal = options.signal as AbortSignal | undefined
      const image = options.images instanceof Blob ? await prepareImage(options.images) : null
      let res: Response
      try {
        res = await fetch(`${api}/assistant`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `License ${key}` },
          body: JSON.stringify({ prompt, image }),
          signal,
        })
      } catch (e) {
        throw signal?.aborted || (e as Error)?.name === 'AbortError' ? { code: 'cancelled', message: 'cancelled' } : { code: 'upstream_error', message: 'Could not reach the server' }
      }
      const data = (await res.json().catch(() => ({}))) as { json?: T; code?: string; message?: string }
      if (!res.ok) throw { code: data.code ?? 'upstream_error', message: data.message ?? '' }
      return data.json as T
    },
  }
}
