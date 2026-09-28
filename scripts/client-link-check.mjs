// Checks Studio client links: a designer copies one, a client opens it as a branded tour.
// Usage: node scripts/client-link-check.mjs <studio key file> <out dir>
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const key = readFileSync(process.argv[2], 'utf8').trim()
const out = process.argv[3] || '.'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const errors = []
const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write'] })
const a = await ctxA.newPage()
a.on('pageerror', (e) => errors.push(`designer: ${e.message}`))
await a.goto('http://localhost:4174/')
// A 300x100 orange logo, made in the page.
await a.evaluate((k) => {
  const c = document.createElement('canvas')
  c.width = 300
  c.height = 100
  const g = c.getContext('2d')
  g.fillStyle = '#c8551b'
  g.fillRect(0, 0, 300, 100)
  g.fillStyle = '#fff'
  g.font = 'bold 44px sans-serif'
  g.fillText('OAK & LINE', 16, 66)
  localStorage.setItem('threshold:welcomed', '1')
  localStorage.setItem('threshold:license', k)
  localStorage.setItem('threshold:brand', JSON.stringify({ company: 'Oak & Line Studio', contact: 'hello@oakline.example · 555 0142', logo: c.toDataURL('image/png') }))
}, key)
await a.reload()
await a.waitForTimeout(1200)
await a.evaluate(() => window.__threshold.store.getState().apply((p) => ({ ...p, name: 'Harbour View House', client: 'The Garcia family' })))
await a.click('.panel-tabs >> text=Project')
await a.evaluate(() => {
  const w = Clipboard.prototype.writeText
  Clipboard.prototype.writeText = function (t) {
    window.__copied = t
    return w.call(this, t)
  }
})
await a.click('button:has-text("Copy client link")')
await a.waitForFunction(() => window.__copied, null, { timeout: 10000 }).catch(() => {})
const link = await a.evaluate(() => window.__copied || '')
if (!link) {
  console.log('no link; plan badge:', await a.locator('.plan-badge').textContent(), '| toast:', await a.locator('.toast').textContent().catch(() => '-'), '| paywall:', await a.locator('.sheet.paywall').count())
  process.exit(1)
}
console.log('client link length:', link.length, '| starts', link.slice(0, 40))
await ctxA.close()

for (const [name, vp] of [['desktop', { width: 1280, height: 800 }], ['phone', { width: 390, height: 780 }]]) {
  const ctx = await browser.newContext({ viewport: vp, serviceWorkers: 'block' })
  const b = await ctx.newPage()
  b.on('pageerror', (e) => errors.push(`client ${name}: ${e.message}`))
  await b.goto(link)
  await b.waitForTimeout(4000)
  console.log(name, '| tour open:', await b.locator('.present').count(), '| title:', await b.locator('.present-card h1').textContent(), '| contact:', await b.locator('.present-contact').textContent().catch(() => '-'), '| logo:', await b.locator('.present-brand img').count(), '| made-with:', await b.locator('.present-made').count(), '| client:', await b.locator('.present-client').textContent().catch(() => '-'), '| url hash left:', await b.evaluate(() => location.hash.length))
  await b.screenshot({ path: `${out}/client-${name}.png` })
  if (name === 'desktop') {
    await b.click('.present-exit')
    await b.waitForTimeout(800)
    console.log('after explore: tour', await b.locator('.present').count(), '| view', await b.evaluate(() => window.__threshold.store.getState().view), '| design', await b.evaluate(() => window.__threshold.store.getState().project.name))
  }
  await ctx.close()
}
console.log(errors.join('\n') || 'no errors')
await browser.close()
