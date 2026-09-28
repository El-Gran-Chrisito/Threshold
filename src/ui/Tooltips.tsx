/**
 * Styled tooltips for any element with data-tip (and optional data-tip-key
 * for a keyboard shortcut, data-tip-side for where it sits). One tooltip
 * for the whole app, positioned from the element's box, so it is never
 * clipped by a scrolling toolbar. Shows after a short pause on hover, or
 * straight away on keyboard focus; any click hides it.
 */
import { useEffect, useState } from 'react'

type Side = 'right' | 'left' | 'bottom' | 'top'

interface Tip {
  text: string
  keys?: string
  side: Side
  x: number
  y: number
}

const GAP = 10

function place(el: HTMLElement): Tip | null {
  const text = el.dataset.tip
  if (!text) return null
  const r = el.getBoundingClientRect()
  const side = (el.dataset.tipSide as Side) || 'bottom'
  const at: Record<Side, [number, number]> = {
    right: [r.right + GAP, r.top + r.height / 2],
    left: [r.left - GAP, r.top + r.height / 2],
    bottom: [r.left + r.width / 2, r.bottom + GAP],
    top: [r.left + r.width / 2, r.top - GAP],
  }
  const [x, y] = at[side]
  return { text, keys: el.dataset.tipKey, side, x, y }
}

export function Tooltips() {
  const [tip, setTip] = useState<Tip | null>(null)
  useEffect(() => {
    // Touch screens have no hover; their controls carry visible labels.
    if (window.matchMedia?.('(hover: none)').matches) return
    let timer = 0
    let current: HTMLElement | null = null
    const hide = () => {
      window.clearTimeout(timer)
      current = null
      setTip(null)
    }
    const over = (e: Event) => {
      const el = (e.target as Element | null)?.closest?.<HTMLElement>('[data-tip]') ?? null
      if (el === current) return
      window.clearTimeout(timer)
      current = el
      setTip(null)
      if (el) timer = window.setTimeout(() => current === el && setTip(place(el)), 400)
    }
    const focus = (e: FocusEvent) => {
      const el = (e.target as Element | null)?.closest?.<HTMLElement>('[data-tip]') ?? null
      if (!el || !el.matches(':focus-visible')) return
      current = el
      setTip(place(el))
    }
    document.addEventListener('mouseover', over)
    document.addEventListener('focusin', focus)
    document.addEventListener('focusout', hide)
    document.addEventListener('pointerdown', hide, true)
    document.addEventListener('keydown', hide, true)
    window.addEventListener('scroll', hide, true)
    window.addEventListener('blur', hide)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('mouseover', over)
      document.removeEventListener('focusin', focus)
      document.removeEventListener('focusout', hide)
      document.removeEventListener('pointerdown', hide, true)
      document.removeEventListener('keydown', hide, true)
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('blur', hide)
    }
  }, [])
  if (!tip) return null
  return (
    <div className={`tooltip is-${tip.side}`} role="tooltip" style={{ left: tip.x, top: tip.y }}>
      <span>{tip.text}</span>
      {tip.keys && (
        <span className="tooltip-keys">
          {tip.keys.split(' ').map((k) => (
            <kbd key={k}>{k}</kbd>
          ))}
        </span>
      )}
    </div>
  )
}
