/**
 * "Find it" links on the shopping list: a store search for each line.
 * By default they search Google Shopping. Set VITE_SHOP_URL (and optionally
 * VITE_SHOP_URLS per group) to your affiliate search links to earn a
 * commission on what people buy; see docs/MONETIZATION.md.
 */
import type { TakeoffGroup, TakeoffLine } from '../model/takeoff'

const env = import.meta.env as Record<string, string | undefined>

export const DEFAULT_SHOP_URL = 'https://www.google.com/search?tbm=shop&q={q}'

export interface ShopConfig {
  /** Search link with {q} where the words go. */
  url: string
  /** Per-group links, e.g. paint from one store and furniture from another. */
  byGroup: Partial<Record<TakeoffGroup, string>>
  /** True when the links may earn a commission (they must then say so). */
  affiliate: boolean
}

function parseGroups(raw: string | undefined): Partial<Record<TakeoffGroup, string>> {
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Partial<Record<TakeoffGroup, string>>
  } catch {
    return {}
  }
}

export const shopConfig: ShopConfig = {
  url: env.VITE_SHOP_URL || DEFAULT_SHOP_URL,
  byGroup: parseGroups(env.VITE_SHOP_URLS),
  affiliate: !!(env.VITE_SHOP_URL || env.VITE_SHOP_URLS),
}

/** The named colour in "Linen" or "#E4E1DA (close to Linen)". */
function colourWord(s: string): string {
  const close = s.match(/close to ([^)]+)\)/)
  if (close) return close[1]
  return s.startsWith('#') ? '' : s
}

/** Words a store search understands for one shopping-list line, or null when there is nothing to buy. */
export function shopQuery(l: TakeoffLine): string | null {
  switch (l.group) {
    case 'Paint': {
      const kind = l.detail.startsWith('Ceilings') ? 'ceiling' : l.detail.startsWith('Exterior') ? 'exterior' : 'interior'
      return `${colourWord(l.item)} ${kind} paint`.trim()
    }
    case 'Flooring':
      return `${l.item} flooring`
    case 'Wall finishes':
      return l.item
    case 'Trim':
      return `${l.item} trim`
    case 'Roofing':
      return `${l.item} roofing`
    case 'Doors & windows':
      if (/arch/i.test(l.item)) return null
      return `${l.item} ${l.detail}`.replace(/×/g, 'x').replace(/["″]/g, ' in').replace(/\s+/g, ' ').trim()
    case 'Furniture & fixtures':
      return l.item
  }
  return null
}

export function shopUrl(l: TakeoffLine, cfg: ShopConfig = shopConfig): string | null {
  const q = shopQuery(l)
  if (!q) return null
  const template = cfg.byGroup[l.group] || cfg.url
  return template.includes('{q}') ? template.replace('{q}', encodeURIComponent(q)) : null
}
