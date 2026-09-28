// Touch targets on a phone: lists visible buttons, links and inputs smaller
// than 40 × 40 px (the common minimum is 44 on iOS, 48 on Android; 40 is
// what this app aims for in its dense panels).
// Usage: node scripts/ui-touch.mjs
import { chromium } from 'playwright'
const base = process.env.BASE || 'http://localhost:4173/'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
await page.goto(base)
await page.evaluate(() => {
  localStorage.setItem('threshold:welcomed', '1')
  localStorage.setItem('threshold:lowq', '1')
})
await page.reload()
await page.waitForTimeout(1500)
const small = new Map()
const check = async (label) => {
  await page.waitForTimeout(500)
  const found = await page.evaluate(() => {
    const out = []
    for (const el of document.querySelectorAll('button, a[href], input:not([type=hidden]), select, label.swatch, [role=tab], [role=radio]')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue
      if (getComputedStyle(el).visibility === 'hidden') continue
      if (el.closest('.sheet-backdrop') && !el.closest('.sheet')) continue
      if (r.width < 40 || r.height < 40) out.push(`${Math.round(r.width)}×${Math.round(r.height)} ${el.tagName.toLowerCase()}.${[...el.classList].join('.')} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}"`)
    }
    return out
  })
  for (const f of found) if (!small.has(f)) small.set(f, label)
}
await check('plan')
await page.locator('.panel-tabs >> text=Edit').click()
await check('panel open')
await page.evaluate(() => window.__threshold.store.getState().setView('3d'))
await page.waitForTimeout(1200)
await check('3d')
for (const [f, where] of small) console.log(`${where}: ${f}`)
console.log(small.size, 'small targets')
await browser.close()
