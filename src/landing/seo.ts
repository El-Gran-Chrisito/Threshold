/**
 * What search engines and link previews read from the marketing page:
 * absolute preview image and address, and structured data for the product,
 * its prices and the FAQ. Added to home.html at build time (vite.config.ts).
 */
import { PASS, PLANS } from '../product/plans'
import { FAQ } from './faq'

const DESCRIPTION = 'Design your home in the browser: floor plans, furniture, finishes and a 3D walk-through on the street it will sit on. Free to start.'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const json = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c')

export function structuredData(siteUrl = ''): unknown[] {
  const url = siteUrl.replace(/\/$/, '')
  const offers = [
    ...PLANS.flatMap((p) =>
      p.monthly
        ? [
            { name: `${p.name} monthly`, price: p.monthly, duration: 'P1M' },
            { name: `${p.name} yearly`, price: p.yearly, duration: 'P1Y' },
          ]
        : [{ name: p.name, price: 0, duration: '' }],
    ).map((o) => ({
      '@type': 'Offer',
      name: o.name,
      price: String(o.price),
      priceCurrency: 'USD',
      ...(o.duration ? { priceSpecification: { '@type': 'UnitPriceSpecification', price: String(o.price), priceCurrency: 'USD', billingDuration: o.duration } } : {}),
    })),
    { '@type': 'Offer', name: PASS.name, price: String(PASS.price), priceCurrency: 'USD', description: PASS.blurb },
  ]
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Threshold',
      applicationCategory: 'DesignApplication',
      operatingSystem: 'Any (web browser)',
      description: DESCRIPTION,
      ...(url ? { url, image: `${url}/shots/street.jpg` } : {}),
      offers,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    },
  ]
}

/** Tags for the head of home.html. Without a site address, previews use relative paths. */
export function seoHead(siteUrl = ''): string {
  const url = siteUrl.replace(/\/$/, '')
  const tags = [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:image" content="${esc(url ? `${url}/shots/street.jpg` : 'shots/street.jpg')}" />`,
    `<meta property="og:image:width" content="1600" />`,
    `<meta property="og:image:height" content="1000" />`,
    `<meta property="og:image:alt" content="A two-storey home designed in Threshold, seen from across the street" />`,
  ]
  if (url) tags.push(`<link rel="canonical" href="${esc(`${url}/`)}" />`, `<meta property="og:url" content="${esc(`${url}/`)}" />`)
  for (const d of structuredData(url)) tags.push(`<script type="application/ld+json">${json(d)}</script>`)
  return tags.join('\n    ')
}

/** robots.txt and sitemap.xml for the hosted site. */
export function crawlFiles(siteUrl = '', extraPages: string[] = []): { robots: string; sitemap: string | null } {
  const url = siteUrl.replace(/\/$/, '')
  const robots = `User-agent: *\nAllow: /\nDisallow: /app\n${url ? `Sitemap: ${url}/sitemap.xml\n` : ''}`
  if (!url) return { robots, sitemap: null }
  const pages = ['/', '/legal/terms.html', '/legal/privacy.html', '/legal/refunds.html', ...extraPages]
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((p) => `  <url><loc>${esc(url + p)}</loc></url>`).join('\n')}\n</urlset>\n`
  return { robots, sitemap }
}
