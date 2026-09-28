import { useEffect, useId, useState, type ReactNode } from 'react'
import type { UnitSystem, WallFinish } from '../model/types'
import { formatLength, parseLength } from '../model/units'
import { WALL_FINISHES, type Swatch } from '../model/materials'

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="field-body">{children}</div>
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  )
}

/** Text box that shows a length in the project's units and accepts any notation. */
export function LengthInput({ value, units, onChange, bare, min = 0, id }: { value: number; units: UnitSystem; onChange: (cm: number) => void; bare?: 'ft' | 'in' | 'cm'; min?: number; id?: string }) {
  const [text, setText] = useState(formatLength(value, units))
  const [bad, setBad] = useState(false)
  const autoId = useId()
  useEffect(() => setText(formatLength(value, units)), [value, units])
  const commit = () => {
    const v = parseLength(text, units, bare)
    if (v === null || v < min) {
      setBad(true)
      setText(formatLength(value, units))
      setTimeout(() => setBad(false), 900)
      return
    }
    if (Math.abs(v - value) > 0.01) onChange(v)
    setText(formatLength(v, units))
  }
  return (
    <input
      id={id ?? autoId}
      className={`len-input${bad ? ' is-bad' : ''}`}
      value={text}
      inputMode="text"
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') {
          setText(formatLength(value, units))
          ;(e.target as HTMLInputElement).blur()
        }
      }}
      aria-invalid={bad}
    />
  )
}

export function NumberInput({ value, onChange, step = 1, min, max, suffix, id }: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; suffix?: string; id?: string }) {
  const [text, setText] = useState(String(round(value)))
  const autoId = useId()
  useEffect(() => setText(String(round(value))), [value])
  const commit = () => {
    let v = parseFloat(text)
    if (!Number.isFinite(v)) return setText(String(round(value)))
    if (min !== undefined) v = Math.max(min, v)
    if (max !== undefined) v = Math.min(max, v)
    if (v !== value) onChange(v)
    setText(String(round(v)))
  }
  return (
    <span className="num-input">
      <input
        id={id ?? autoId}
        value={text}
        inputMode="decimal"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'ArrowUp') {
            e.preventDefault()
            onChange(Math.min(max ?? Infinity, value + step))
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            onChange(Math.max(min ?? -Infinity, value - step))
          }
        }}
      />
      {suffix && <span className="num-suffix">{suffix}</span>}
    </span>
  )
}

function round(v: number) {
  return Math.round(v * 100) / 100
}

export function Swatches({ swatches, value, onChange, allowCustom = true, label, collapse }: { swatches: Swatch[]; value: string; onChange: (hex: string) => void; allowCustom?: boolean; label: string; collapse?: number }) {
  const id = useId()
  const current = swatches.findIndex((s) => s.hex.toLowerCase() === value.toLowerCase())
  // Long palettes can start as one row; the chosen colour always shows.
  const [open, setOpen] = useState(false)
  const short = collapse !== undefined && swatches.length > collapse + 1 && !open && current < collapse
  const shown = short ? swatches.slice(0, collapse) : swatches
  return (
    <div className="swatch-block">
      <div className="swatches" role="radiogroup" aria-label={label}>
        {shown.map((s) => (
          <button
            key={s.hex}
            type="button"
            role="radio"
            aria-checked={value.toLowerCase() === s.hex.toLowerCase()}
            className="swatch"
            style={{ background: s.hex }}
            title={s.name}
            aria-label={s.name}
            onClick={() => onChange(s.hex)}
          />
        ))}
        {allowCustom && (
          <label className="swatch swatch-custom" htmlFor={id} title="Custom colour">
            <input id={id} type="color" value={toHex(value)} onChange={(e) => onChange(e.target.value.toUpperCase())} aria-label="Custom colour" />
            <span aria-hidden>+</span>
          </label>
        )}
      </div>
      {collapse !== undefined && (
        <div className="swatch-meta">
          <span className="swatch-current">{current >= 0 ? swatches[current].name : `Custom ${value.toUpperCase()}`}</span>
          {swatches.length > collapse + 1 && current < collapse && (
            <button type="button" className="linklike" onClick={() => setOpen(!open)} aria-expanded={!short}>
              {short ? `${swatches.length - collapse} more colours` : 'Fewer colours'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function toHex(v: string) {
  return /^#[0-9a-f]{6}$/i.test(v) ? v : '#cccccc'
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: Array<{ value: T; label: string; icon?: ReactNode }>; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className={o.value === value ? 'is-on' : ''} onClick={() => onChange(o.value)}>
          {o.icon}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  )
}

export function Toggle({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; id?: string }) {
  const autoId = useId()
  return (
    <label className="toggle" htmlFor={id ?? autoId}>
      <input id={id ?? autoId} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden>
        <span className="toggle-thumb" />
      </span>
      <span>{label}</span>
    </label>
  )
}

/** A two-step delete: first click arms, second click confirms. */
export function ConfirmButton({ onConfirm, children, confirmText = 'Click again to confirm', className = '' }: { onConfirm: () => void; children: ReactNode; confirmText?: string; className?: string }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <button
      type="button"
      className={`${className} ${armed ? 'is-armed' : ''}`}
      onClick={() => {
        if (armed) {
          setArmed(false)
          onConfirm()
        } else setArmed(true)
      }}
    >
      {armed ? confirmText : children}
    </button>
  )
}

/** Wall finish chips. Picking a finish also suggests that finish's typical colour. */
export function FinishChips({ value, onChange, label }: { value: WallFinish | undefined; onChange: (f: WallFinish, suggested: string) => void; label: string }) {
  const v = value ?? 'paint'
  return (
    <div className="chip-wrap" role="radiogroup" aria-label={label}>
      {WALL_FINISHES.map((f) => (
        <button key={f.id} type="button" role="radio" aria-checked={v === f.id} className={`chip finish-chip${v === f.id ? ' is-on' : ''}`} onClick={() => onChange(f.id, f.base)}>
          <span className={`finish-dot fin-${f.id}`} style={{ background: f.base }} aria-hidden />
          {f.name}
        </button>
      ))}
    </div>
  )
}
