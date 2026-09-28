import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const key = readFileSync(process.argv[2], 'utf8').trim()
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const errors = []
async function device(name) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' })).newPage()
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`))
  await page.goto('http://localhost:4174/')
  await page.evaluate(() => localStorage.setItem('threshold:welcomed', '1'))
  await page.reload()
  await page.waitForTimeout(800)
  await page.click('.plan-badge')
  await page.click('text=I have a license key')
  await page.fill('#license-key', key)
  await page.click('button:has-text("Activate")')
  await page.waitForTimeout(1500)
  return page
}
const a = await device('laptop')
await a.evaluate(() => {
  const st = window.__threshold.store.getState()
  st.apply((p) => ({ ...p, name: 'Lake cabin' }))
})
await a.waitForTimeout(3000)
console.log('laptop status:', await a.locator('.project-title .muted, .save-state').first().textContent().catch(() => '?'))
console.log('stored on server:', await (await fetch('http://localhost:4180/_count')).text())
await a.context().close()
const b = await device('phone')
await b.waitForTimeout(2500)
console.log('second device opens:', await b.evaluate(() => window.__threshold.store.getState().project.name))
console.log(errors.join('\n') || 'no errors')
await browser.close()
