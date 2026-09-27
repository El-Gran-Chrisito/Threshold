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
