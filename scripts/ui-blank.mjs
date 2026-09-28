// First screens after "Start from scratch" and "Plan from your needs".
// Usage: FONT_CACHE=<dir> node scripts/ui-blank.mjs <out dir>
import { chromium } from 'playwright'
import { serveLocalFonts } from './local-fonts.mjs'
const out = process.argv[2]
const base = process.env.BASE || 'http://localhost:4173/'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await serveLocalFonts(page)
await page.goto(base)
await page.evaluate(() => localStorage.setItem('threshold:lowq', '1'))
await page.reload()
await page.waitForTimeout(1200)
await page.click('text=Plan from your needs')
await page.waitForTimeout(600)
await page.screenshot({ path: `${out}/brief.png` })
await page.click('.welcome >> text=Back')
await page.waitForTimeout(300)
await page.click('text=Start from scratch')
await page.waitForTimeout(2500)
await page.screenshot({ path: `${out}/blank.png` })
await browser.close()
