import type { UnitSystem } from './types'

export const CM_PER_IN = 2.54
export const CM_PER_FT = 30.48
export const CM2_PER_FT2 = CM_PER_FT * CM_PER_FT

const FRACTIONS: Record<number, string> = { 0.25: '¼', 0.5: '½', 0.75: '¾' }

/** Format a length in cm for display. */
export function formatLength(cm: number, units: UnitSystem, opts: { compact?: boolean } = {}): string {
  if (!Number.isFinite(cm)) return '–'
  const sign = cm < 0 ? '-' : ''
  const abs = Math.abs(cm)
  if (units === 'metric') {
    if (abs < 100) return `${sign}${round(abs, 1)} cm`
    return `${sign}${round(abs / 100, 2).toFixed(2)} m`
  }
  // Imperial: nearest quarter inch.
  const totalIn = Math.round((abs / CM_PER_IN) * 4) / 4
  let feet = Math.floor(totalIn / 12)
  let inches = totalIn - feet * 12
  if (inches >= 12) {
    feet += 1
    inches -= 12
  }
  const whole = Math.floor(inches)
  const frac = FRACTIONS[round(inches - whole, 2)] ?? ''
  const inchStr = `${whole === 0 && frac ? '' : whole}${frac}"`
  if (feet === 0) return `${sign}${inchStr}`
  if (inches === 0) return `${sign}${feet}'`
  return opts.compact ? `${sign}${feet}'${inchStr}` : `${sign}${feet}' ${inchStr}`
}

/** Format an area given in cm². */
export function formatArea(cm2: number, units: UnitSystem): string {
  if (units === 'metric') return `${round(cm2 / 10000, 1)} m²`
  return `${Math.round(cm2 / CM2_PER_FT2).toLocaleString()} sq ft`
}

/** Convert an area in cm² to the display unit (m² or ft²). */
export function areaInUnits(cm2: number, units: UnitSystem): number {
  return units === 'metric' ? cm2 / 10000 : cm2 / CM2_PER_FT2
}

export function areaUnitLabel(units: UnitSystem): string {
  return units === 'metric' ? 'm²' : 'sq ft'
}

/**
 * Parse a user-typed length. Accepts feet/inches (12' 6", 12ft 6in, 12-6,
 * 6", 12.5'), metric (3.5m, 350cm, 3500mm) and bare numbers. A bare number is
 * read as `bare` units: 'ft' or 'in' in imperial, 'cm' in metric.
 * Returns centimetres, or null when the text is not a length.
 */
export function parseLength(input: string, units: UnitSystem, bare: 'ft' | 'in' | 'cm' = units === 'metric' ? 'cm' : 'ft'): number | null {
  const s = input.trim().toLowerCase().replace(/[’′]/g, "'").replace(/[”″]/g, '"').replace(/,/g, '.')
  if (!s) return null

  const num = '(\\d+(?:\\.\\d+)?|\\.\\d+)'
  let m: RegExpMatchArray | null

  // Metric with explicit unit
  if ((m = s.match(new RegExp(`^${num}\\s*(mm|cm|m)$`)))) {
    const v = parseFloat(m[1])
    return m[2] === 'mm' ? v / 10 : m[2] === 'cm' ? v : v * 100
  }

  // Feet and inches: 12' 6", 12ft 6in, 12' 6, 12'6 1/2"
  const ftPart = `${num}\\s*(?:'|ft|feet|foot)`
  const inPart = `(\\d+(?:\\.\\d+)?)?(?:\\s*(\\d+)\\/(\\d+))?\\s*(?:"|in|inch|inches)?`
  if ((m = s.match(new RegExp(`^${ftPart}\\s*(?:${inPart})?$`)))) {
    const feet = parseFloat(m[1])
    const inches = (m[2] ? parseFloat(m[2]) : 0) + (m[3] && m[4] ? parseInt(m[3]) / parseInt(m[4]) : 0)
    return feet * CM_PER_FT + inches * CM_PER_IN
  }

  // Inches only: 6", 6in, 6 1/2"
  if ((m = s.match(new RegExp(`^${num}(?:\\s+(\\d+)\\/(\\d+))?\\s*(?:"|in|inch|inches)$`)))) {
    const inches = parseFloat(m[1]) + (m[2] && m[3] ? parseInt(m[2]) / parseInt(m[3]) : 0)
    return inches * CM_PER_IN
  }

  // Dash notation 12-6 (feet-inches)
  if ((m = s.match(/^(\d+)\s*-\s*(\d+(?:\.\d+)?)$/))) {
    return parseInt(m[1]) * CM_PER_FT + parseFloat(m[2]) * CM_PER_IN
  }

  // Bare number
  if ((m = s.match(new RegExp(`^${num}$`)))) {
    const v = parseFloat(m[1])
    if (bare === 'ft') return v * CM_PER_FT
    if (bare === 'in') return v * CM_PER_IN
    return v
  }
  return null
}

/** A room length typed without a unit: feet in imperial; in metric, metres up to 50, else centimetres. */
function parseRoomLength(input: string, units: UnitSystem): number | null {
  const t = input.trim()
  if (units === 'metric' && /^\d+(?:[.,]\d+)?$/.test(t)) {
    const v = parseFloat(t.replace(',', '.'))
    return v <= 50 ? v * 100 : v
  }
  return parseLength(t, units)
}

/**
 * Parse a room size such as `12' x 14'`, `12x14`, `31'6" × 69'`, `3.6 x 4.2 m`
 * or `360 by 420 cm`. A unit written once at the end applies to both numbers.
 * Returns centimetres, or null.
 */
export function parseSize(input: string, units: UnitSystem): { a: number; b: number } | null {
  const parts = input
    .trim()
    .toLowerCase()
    .split(/\s*(?:×|\*|\bby\b|x(?![a-z]))\s*/)
    .filter(Boolean)
  if (parts.length !== 2) return null
  let [p, q] = parts
  const unit = q.match(/(mm|cm|m)$/)?.[1]
  if (unit && /^\d+(?:[.,]\d+)?$/.test(p.trim())) p = `${p}${unit}`
  const a = parseRoomLength(p, units)
  const b = parseRoomLength(q, units)
  return a && b && a > 0 && b > 0 ? { a, b } : null
}

/**
 * Parse a floor area such as `2,174 sq ft`, `2174`, `180 m²` or `180m2`.
 * A number with no unit is read in the design's units. Returns cm², or null.
 */
export function parseArea(input: string, units: UnitSystem): number | null {
  const s = input.trim().toLowerCase()
  const m = s.match(/^(\d[\d,]*(?:\.\d+)?|\d*\.\d+)\s*(.*)$/)
  if (!m) return null
  // A comma before exactly three digits groups thousands; otherwise it is a decimal comma.
  const raw = /,\d{3}(?!\d)/.test(m[1]) ? m[1].replace(/,/g, '') : m[1].replace(',', '.')
  const v = parseFloat(raw)
  if (!(v > 0)) return null
  const u = m[2].replace(/\.$/, '').trim()
  const sqft = /^(sq\.?\s*ft|sqft|ft2|ft²|sf|square\s+f(ee|oo)t)$/
  const sqm = /^(sq\.?\s*m|m2|m²|square\s+met(re|er)s?)$/
  if (!u) return units === 'metric' ? v * 10000 : v * CM2_PER_FT2
  if (sqft.test(u)) return v * CM2_PER_FT2
  if (sqm.test(u)) return v * 10000
  return null
}

/** Default snapping grid in cm: 6 inches or 10 cm. */
export function gridStep(units: UnitSystem): number {
  return units === 'imperial' ? CM_PER_IN * 6 : 10
}

/** Major grid lines: every 5 ft or every 1 m. */
export function majorGridStep(units: UnitSystem): number {
  return units === 'imperial' ? CM_PER_FT * 5 : 100
}

export function round(v: number, places = 0): number {
  const f = 10 ** places
  return Math.round(v * f) / f
}

export function formatMoney(v: number): string {
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}
