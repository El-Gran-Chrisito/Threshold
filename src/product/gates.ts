/** Checks run at the moment someone reaches for a paid feature. */
import { listSaved } from '../store/persistence'
import { can, requireFeature } from './entitlements'
import { FREE_LIMITS } from './plans'

/** Free keeps a few designs; starting another asks to upgrade (or to delete one). */
export function canStartNewDesign(): boolean {
  if (can('unlimited-designs') || listSaved().length < FREE_LIMITS.designs) return true
  return requireFeature('unlimited-designs')
}

/** Free exports carry a small mark in the corner of 3D images. */
export function watermarked(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = src.width
  c.height = src.height
  const ctx = c.getContext('2d')!
  ctx.drawImage(src, 0, 0)
  const s = Math.max(14, Math.round(c.width / 70))
  ctx.font = `700 ${s}px system-ui, -apple-system, 'Segoe UI', sans-serif`
  const text = 'Made with Threshold · Free'
  const w = ctx.measureText(text).width
  const pad = s * 0.6
  ctx.fillStyle = 'rgba(15, 25, 28, 0.55)'
  ctx.fillRect(c.width - w - pad * 3, c.height - s - pad * 3, w + pad * 2, s + pad * 2)
  ctx.fillStyle = '#ffffff'
  ctx.textBaseline = 'top'
  ctx.fillText(text, c.width - w - pad * 2, c.height - s - pad * 2)
  return c
}
