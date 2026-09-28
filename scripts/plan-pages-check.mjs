// Checks the public plan library pages: layout at two widths, and that
// "Open this plan" opens the home in the app (free) or asks for Pro.
// Usage: node scripts/plan-pages-check.mjs <out dir>   (preview on :4173)
import { chromium } from 'playwright'
const out = process.argv[2] || '.'
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
for (const w of [1280, 390]) {
  const p = await (await b.newContext({ viewport: { width: w, height: 900 }, serviceWorkers: 'block' })).newPage()
  await p.goto('http://localhost:4173/plans/cottage.html')
  await p.waitForTimeout(500)
  await p.screenshot({ path: `${out}/plan-page-${w}.png`, fullPage: false })
  console.log(w, '| title:', await p.title(), '| overflow:', await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), '| cards:', await p.locator('.card').count())
  await p.context().close()
}
const errors = []
for (const id of ['cottage', 'farmhouse']) {
  const p = await (await b.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'block' })).newPage()
  p.on('pageerror', (e) => errors.push(e.message))
  await p.goto(`http://localhost:4173/plans/${id}.html`)
  await p.evaluate(() => localStorage.setItem('threshold:lowq', '1'))
  await p.click('text=Open this plan in Threshold')
  await p.waitForTimeout(2000)
  console.log(id, '| url:', p.url().replace('http://localhost:4173', ''), '| design:', await p.evaluate(() => window.__threshold.store.getState().project.name), '| paywall:', await p.locator('#paywall-title').textContent().catch(() => '-'), '| welcome:', await p.locator('.sheet.welcome').count())
  await p.context().close()
}
console.log(errors.join('\n') || 'no errors')
await b.close()
