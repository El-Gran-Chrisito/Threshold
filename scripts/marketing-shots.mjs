// Product screenshots for the landing page: FONT_CACHE=<dir> node scripts/marketing-shots.mjs public/shots
// (FONT_CACHE: see scripts/local-fonts.mjs; without it the shots use fallback fonts.)
import { chromium } from 'playwright'
import { serveLocalFonts } from './local-fonts.mjs'
const out = process.argv[2] ?? 'public/shots'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
await serveLocalFonts(page)
const shot = async (name, wait = 3500) => {
  await page.waitForTimeout(wait)
  await page.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 82 })
}
await page.goto('http://localhost:4173/')
// Full-quality 3D for the pictures, even if this machine renders slowly.
await page.evaluate(() => {
  localStorage.clear()
  localStorage.setItem('threshold:lowq', '0')
  // No onboarding checklist in the pictures.
  localStorage.setItem('threshold:onboarding', JSON.stringify({ done: [], dismissed: true }))
})
await page.reload()
await page.waitForTimeout(800)
await page.click('text=Explore the example home')
await page.waitForTimeout(1000)
await page.click('.view-switch >> text=3D')
await page.selectOption('#view-from', 'street')
await shot('street', 5000)
// Dusk: about 35 minutes after today's sunset, when windows and street lights glow.
await page.evaluate(() => {
  const s = window.__threshold.store.getState()
  const lat = (s.project.site.latitude ?? 40) * Math.PI / 180
  const dec = 23.44 * Math.sin(((360 / 365) * (s.sunDay - 81)) * Math.PI / 180) * Math.PI / 180
  const c = (Math.sin(-0.83 * Math.PI / 180) - Math.sin(lat) * Math.sin(dec)) / (Math.cos(lat) * Math.cos(dec))
  const set = 12 + Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI / 15
  window.__threshold.store.setState({ sunHour: Math.round((set + 0.6) * 4) / 4 })
})
await shot('night', 4500)
await page.fill('#sun-hour', '15')
await page.selectOption('#view-from', 'corner')
await page.click('.mode-seg >> text=Explode')
await shot('explode', 5000)
await page.click('.mode-seg >> text=Inside')
await shot('inside', 4500)
await page.click('.view-switch >> text=Walk')
await shot('walk', 4500)
await page.click('.view-switch >> text=Split')
await page.click('button:has-text("Budget")')
await page.click('text=Shopping list')
await shot('split', 4500)
await page.click('.view-switch >> text=2D')
await page.click('button:has-text("Edit")')
await shot('plan', 2000)
await browser.close()
console.log('done')
