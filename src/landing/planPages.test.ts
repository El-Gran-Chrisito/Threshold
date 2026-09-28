import { describe, expect, it } from 'vitest'
import { openLink, planPages } from './planPages'
import { LIBRARY } from '../model/library'

describe('plan library pages', () => {
  it('writes an index and one page per home with its plan, rooms and an app link', () => {
    const pages = planPages({ appPath: '/app', siteUrl: 'https://threshold.example' })
    expect(Object.keys(pages).length).toBe(LIBRARY.length + 1)
    for (const l of LIBRARY) {
      const html = pages[`plans/${l.id}.html`]
      expect(html).toContain(`<h1>${l.name.replace(/&/g, '&amp;')}</h1>`)
      expect(html).toContain('<polygon')
      expect(html).toContain(`href="/app#library=${l.id}"`)
      expect(html).toContain(`<link rel="canonical" href="https://threshold.example/plans/${l.id}.html" />`)
      expect(html).toMatch(/<tbody><tr>/)
    }
    for (const l of LIBRARY) expect(pages['plans/index.html']).toContain(`href="./${l.id}.html"`)
  })

  it('links to the app from /plans/ whether the app path is relative or absolute', () => {
    expect(openLink('./index.html', 'cottage')).toBe('../index.html#library=cottage')
    expect(openLink('/app', 'cottage')).toBe('/app#library=cottage')
    expect(openLink('https://x.example/app', 'loft')).toBe('https://x.example/app#library=loft')
  })
})
