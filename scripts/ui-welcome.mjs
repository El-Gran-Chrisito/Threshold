// The welcome sheet on desktop and phone, light and dark.
// Usage: FONT_CACHE=<dir> node scripts/ui-welcome.mjs <out dir>
import { chromium } from 'playwright'
import { serveLocalFonts } from './local-fonts.mjs'
const out = process.argv[2]
const base = process.env.BASE || 'http://localhost:4173/'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined })
for (const [name, viewport, colorScheme] of [
  ['desktop', { width: 1440, height: 900 }, 'light'],
  ['desktop-dark', { width: 1440, height: 900 }, 'dark'],
  ['phone', { width: 390, height: 844 }, 'light'],
]) {
  const page = await browser.newPage({ viewport, colorScheme, deviceScaleFactor: 2 })
  await serveLocalFonts(page)
  await page.goto(base)
  await page.waitForTimeout(1200)
  const box = await page.locator('.sheet.welcome').boundingBox()
  await page.screenshot({ path: `${out}/welcome-${name}.png`, clip: box ? { x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 8), width: Math.min(viewport.width, box.width + 16), height: Math.min(viewport.height, box.height + 16) } : undefined })
  await page.close()
}
await browser.close()
