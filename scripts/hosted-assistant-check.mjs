// Checks the design assistant outside Claude: a trial started online and a paid license both
// go through the license server (fake Claude reply on :4180), and the change lands in the design.
// Usage: node scripts/hosted-assistant-check.mjs <pro key file> <out dir>
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const key = readFileSync(process.argv[2], 'utf8').trim().split('\n')[0]
const out = process.argv[3] || '.'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const errors = []
async function open(k) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'block' })).newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('http://localhost:4174/')
  await page.evaluate((x) => {
    localStorage.setItem('threshold:welcomed', '1')
    if (x) localStorage.setItem('threshold:license', x)
  }, k)
  await page.reload()
  await page.waitForTimeout(1500)
  if (!k) {
    await page.click('.plan-badge')
    await page.click('button:has-text("Try Pro free")')
    await page.waitForTimeout(1500)
    console.log('trial: badge', await page.locator('.plan-badge').textContent(), '| signed trial key stored:', await page.evaluate(() => (localStorage.getItem('threshold:license') ?? '').startsWith('THR1.')))
  }
  await page.click('.panel-tabs >> text=Ask')
  await page.waitForTimeout(500)
  return page
}
let p
const colorOf = () => p.evaluate(() => {
  const s = window.__threshold.store.getState()
  const l = s.project.levels[0]
  const r = l.rooms.find((x) => x.name === 'Living room')
  return l.walls.filter((w) => w.colorA === '#2F3E55' || w.colorB === '#2F3E55').length + ' walls navy; room ' + (r ? 'found' : 'missing')
})
for (const who of ['trial', 'paid']) {
  p = await open(who === 'paid' ? key : null)
  const before = await colorOf()
  await p.fill('#ask-input', 'Paint the living room navy')
  await p.click('.panel-body button.btn-primary')
  await p.waitForTimeout(2500)
  console.log(who, '| before:', before, '| after:', await colorOf(), '| toast:', await p.locator('.toast').textContent().catch(() => '-'))
  if (who === 'paid') await p.locator('.panel-body').first().screenshot({ path: `${out}/hosted-assistant.png` })
  await p.context().close()
}
console.log(errors.join('\n') || 'no errors')
await browser.close()
