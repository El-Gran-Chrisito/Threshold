import { describe, expect, it } from 'vitest'
import { DEFAULT_SHOP_URL, shopQuery, shopUrl } from './shop'
import { takeoff, type TakeoffLine } from '../model/takeoff'
import { buildTemplate } from '../model/templates'

const line = (group: TakeoffLine['group'], item: string, detail = ''): TakeoffLine => ({ group, item, detail, qty: '1', where: '' })

describe('store links for the shopping list', () => {
  it('turns lines into store searches', () => {
    expect(shopQuery(line('Paint', 'Linen', 'Interior walls · 491 sq ft, 2 coats'))).toBe('Linen interior paint')
    expect(shopQuery(line('Paint', '#E4E1DA (close to Linen)', 'Ceilings · 20 sq ft'))).toBe('Linen ceiling paint')
    expect(shopQuery(line('Flooring', 'White oak planks'))).toBe('White oak planks flooring')
    expect(shopQuery(line('Doors & windows', 'Door', `2' 6" × 6' 8"`))).toBe(`Door 2' 6 in x 6' 8 in`)
    expect(shopQuery(line('Doors & windows', 'Archway', `4' × 6'`))).toBeNull()
  })

  it('uses the group link first, then the main link', () => {
    const cfg = { url: 'https://shop.example/s?k={q}&tag=t-20', byGroup: { Paint: 'https://paint.example/find?q={q}' }, affiliate: true }
    expect(shopUrl(line('Paint', 'Navy', 'Interior walls'), cfg)).toBe('https://paint.example/find?q=Navy%20interior%20paint')
    expect(shopUrl(line('Furniture & fixtures', 'Three-seat sofa'), cfg)).toBe('https://shop.example/s?k=Three-seat%20sofa&tag=t-20')
    expect(shopUrl(line('Trim', 'Baseboard'), { url: 'https://no-placeholder.example', byGroup: {}, affiliate: false })).toBeNull()
  })

  it('links almost every line of a real design', () => {
    const lines = takeoff(buildTemplate('family'))
    const cfg = { url: DEFAULT_SHOP_URL, byGroup: {}, affiliate: false }
    const linked = lines.filter((l) => shopUrl(l, cfg))
    expect(linked.length).toBeGreaterThan(lines.length * 0.8)
  })
})
