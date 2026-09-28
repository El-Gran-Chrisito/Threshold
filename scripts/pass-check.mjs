// Checks plan lifecycle screens: the Build Pass offer, a pass near its end, a pass that has ended, and a finished trial.
// Usage: node scripts/pass-check.mjs <file with two keys: ending-soon, ended> <out dir>
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const [soon, ended] = readFileSync(process.argv[2], 'utf8').trim().split('\n')
const out = process.argv[3] || '.'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const errors = []
async function open(key, width = 1280, extra = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 860 }, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('http://localhost:4174/')
  await page.evaluate(([k, x]) => {
    localStorage.setItem('threshold:welcomed', '1')
    if (k) localStorage.setItem('threshold:license', k)
    for (const [a, b] of Object.entries(x)) localStorage.setItem(a, b)
  }, [key, extra])
  await page.reload()
  await page.waitForTimeout(1200)
  return page
}
let p = await open(null)
await p.click('.plan-badge')
console.log('free: pass offer', await p.locator('.pass-offer h3').textContent(), '| link', await p.locator('.pass-offer a').getAttribute('href'))
await p.locator('.sheet.paywall').screenshot({ path: `${out}/pass-free.png` })
await p.context().close()
p = await open(soon)
console.log('ending soon badge:', await p.locator('.plan-badge').textContent())
await p.click('.plan-badge')
console.log('ending soon fine print:', (await p.locator('.paywall-fine').first().textContent()).replace(/\s+/g, ' '))
console.log('ending soon offers pass:', await p.locator('.pass-offer').count())
await p.context().close()
p = await open(ended, 420)
console.log('ended badge:', await p.locator('.plan-badge').textContent())
await p.click('.plan-badge')
console.log('ended title:', await p.locator('#paywall-title').textContent())
console.log('ended trial button:', await p.locator('.paywall-trial').count())
await p.locator('.sheet.paywall').screenshot({ path: `${out}/pass-ended-phone.png` })
await p.context().close()
p = await open(null, 1280, { 'threshold:trial': String(Date.now() - 9 * 86_400_000) })
console.log('trial ended: sheet open', await p.locator('.sheet.paywall').count(), '| title:', await p.locator('#paywall-title').textContent().catch(() => '-'))
await p.reload()
await p.waitForTimeout(1200)
console.log('trial ended, next visit: sheet open', await p.locator('.sheet.paywall').count())
await p.context().close()
console.log(errors.join('\n') || 'no errors')
await browser.close()
