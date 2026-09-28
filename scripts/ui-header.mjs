// The header and first screen at several phone and desktop widths.
// Usage: FONT_CACHE=<dir> node scripts/ui-header.mjs <out dir>
import { chromium } from 'playwright'
import { serveLocalFonts } from './local-fonts.mjs'
const out = process.argv[2]
const base = process.env.BASE || 'http://localhost:4173/'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined })
for (const w of [360, 390, 430, 768, 1280]) {
  const phone = w < 700
  const page = await browser.newPage({ viewport: { width: w, height: 800 }, deviceScaleFactor: 2, isMobile: phone, hasTouch: phone })
  await serveLocalFonts(page)
  await page.goto(base)
  await page.evaluate(() => localStorage.setItem('threshold:welcomed', '1'))
  await page.reload()
  await page.waitForTimeout(1200)
  const h = await page.$eval('.topbar', (e) => Math.round(e.getBoundingClientRect().height))
  const over = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  const clipped = await page.$$eval('.topbar button', (els) => els.filter((e) => e.getBoundingClientRect().right > innerWidth + 0.5).map((e) => e.getAttribute('aria-label') || e.textContent.trim()))
  console.log(`${w}px: header ${h}px tall, page scrolls sideways: ${over}, buttons past the edge: ${clipped.length ? clipped.join(', ') : 'none'}`)
  await page.screenshot({ path: `${out}/header-${w}.png`, clip: { x: 0, y: 0, width: w, height: Math.max(h, 60) + 8 } })
  await page.close()
}
await browser.close()
