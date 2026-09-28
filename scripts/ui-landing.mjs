// The marketing page, full length, on desktop and phone.
// Usage: FONT_CACHE=<dir> node scripts/ui-landing.mjs <out dir>
import { chromium } from 'playwright'
import { serveLocalFonts } from './local-fonts.mjs'
const out = process.argv[2]
const base = process.env.BASE || 'http://localhost:4173/'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined })
for (const [name, viewport, scale] of [['desktop', { width: 1440, height: 900 }, 1], ['phone', { width: 390, height: 844 }, 1]]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: scale })
  await serveLocalFonts(page)
  await page.goto(base + 'home.html')
  await page.waitForTimeout(1000)
  // Scroll through so lazy pictures load, then back to the top.
  for (let y = 0; y < (await page.evaluate(() => document.documentElement.scrollHeight)); y += 700) {
    await page.evaluate((top) => window.scrollTo(0, top), y)
    await page.waitForTimeout(120)
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(800)
  const h = await page.evaluate(() => document.documentElement.scrollHeight)
  console.log(name, 'page height', h, '| sideways scroll:', await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
  await page.screenshot({ path: `${out}/landing-${name}.png`, fullPage: true })
  await page.close()
}
await browser.close()
