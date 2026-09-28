import { describe, expect, it } from 'vitest'
import { crawlFiles, seoHead, structuredData } from './seo'
import { PASS } from '../product/plans'
import { FAQ } from './faq'

describe('search and preview data', () => {
  it('lists every price and every question', () => {
    const [app, faq] = structuredData('https://threshold.example/') as Array<Record<string, unknown>>
    const offers = app.offers as Array<{ name: string; price: string }>
    expect(offers.map((o) => o.name)).toEqual(['Free', 'Pro monthly', 'Pro yearly', 'Studio monthly', 'Studio yearly', PASS.name])
    expect(offers.find((o) => o.name === PASS.name)?.price).toBe(String(PASS.price))
    expect(app.url).toBe('https://threshold.example')
    expect((faq.mainEntity as unknown[]).length).toBe(FAQ.length)
  })

  it('uses absolute addresses only when the site address is known', () => {
    expect(seoHead('https://threshold.example')).toContain('content="https://threshold.example/shots/street.jpg"')
    expect(seoHead('https://threshold.example')).toContain('rel="canonical" href="https://threshold.example/"')
    expect(seoHead('')).not.toContain('canonical')
    expect(seoHead('')).not.toMatch(/<\/script>.*<\/script>.*<\/script>/s)
    expect(crawlFiles('').sitemap).toBeNull()
    expect(crawlFiles('https://threshold.example').robots).toContain('Sitemap: https://threshold.example/sitemap.xml')
  })
})
