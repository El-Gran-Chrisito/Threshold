// Checks that a slow 3D renderer switches the app to Fast 3D once, with Undo,
// and that an explicit choice is never overridden.
// Usage: node scripts/fast3d-check.mjs   (preview on :4173; the sandbox's software renderer is slow)
import { chromium } from 'playwright'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
async function run(choice) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto('http://localhost:4173/')
  await page.evaluate((c) => {
    localStorage.setItem('threshold:welcomed', '1')
    if (c !== null) localStorage.setItem('threshold:lowq', c)
  }, choice)
  await page.reload()
  await page.waitForTimeout(1000)
  await page.evaluate(() => window.__threshold.store.getState().setView('3d'))
  const t0 = Date.now()
  await page.waitForFunction(() => window.__threshold.store.getState().lowQuality, null, { timeout: 25000 }).catch(() => {})
  const low = await page.evaluate(() => window.__threshold.store.getState().lowQuality)
  console.log(`choice ${choice ?? 'none'}: Fast 3D ${low ? 'on' : 'off'}${low && choice === null ? ` after ${Math.round((Date.now() - t0) / 1000)} s | toast: ${await page.locator('.toast').textContent()}` : ''}`)
  await page.close()
}
await run(null)
await run('0')
await browser.close()
