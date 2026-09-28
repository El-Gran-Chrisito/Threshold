// Split view at laptop widths, where the plan and 3D panes are narrow.
// Usage: FONT_CACHE=<dir> node scripts/ui-split.mjs <out dir>
import { chromium } from 'playwright'
import { serveLocalFonts } from './local-fonts.mjs'
const out = process.argv[2]
const base = process.env.BASE || 'http://localhost:4173/'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
for (const w of [1024, 1100, 1280]) {
  const page = await browser.newPage({ viewport: { width: w, height: 720 } })
  await serveLocalFonts(page)
  await page.goto(base)
  await page.evaluate(() => {
    localStorage.setItem('threshold:welcomed', '1')
    localStorage.setItem('threshold:lowq', '1')
  })
  await page.reload()
  await page.waitForTimeout(2500)
  const overlap = await page.evaluate(() => {
    const a = document.querySelector('.sun-time .num')?.getBoundingClientRect()
    const b = document.querySelector('.sun-day')?.getBoundingClientRect()
    const dock = document.querySelector('.sun-dock')?.getBoundingClientRect()
    const pane = document.querySelector('.view-3d')?.getBoundingClientRect()
    return { timeOverDay: !!a && !!b && a.right > b.left + 1, dockWider: !!dock && !!pane && (dock.left < pane.left - 1 || dock.right > pane.right + 1) }
  })
  console.log(`${w}px`, JSON.stringify(overlap))
  await page.screenshot({ path: `${out}/split-${w}.png` })
  await page.close()
}
await browser.close()
