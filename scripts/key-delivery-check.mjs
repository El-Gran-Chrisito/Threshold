// Checks license key delivery: emailed after checkout, "Email me my key", and copying the key for another device.
// Needs the fake license server on :4180 (with email) and a test build on :4174.
// Usage: node scripts/key-delivery-check.mjs <out dir>
import { chromium } from 'playwright'
const out = process.argv[2] || '.'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const errors = []
const mails = async () => Number(await (await fetch('http://localhost:4180/_mails')).text())
async function open(url) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('http://localhost:4174/')
  await page.evaluate(() => localStorage.setItem('threshold:welcomed', '1'))
  await page.goto(url)
  await page.waitForTimeout(2000)
  return page
}
const before = await mails()
let p = await open('http://localhost:4174/?checkout_session=cs_test_e2e')
console.log('after checkout:', await p.locator('.toast').textContent().catch(() => '-'), '| emails sent:', (await mails()) - before)
await p.click('.plan-badge')
await p.click('text=Use Threshold on another device')
const shown = await p.inputValue('#your-license-key')
const stored = await p.evaluate(() => localStorage.getItem('threshold:license'))
console.log('key shown matches stored:', shown === stored && shown.startsWith('THR1.'))
await p.locator('.sheet.paywall').screenshot({ path: `${out}/key-device.png` })
await p.context().close()

p = await open('http://localhost:4174/')
await p.click('.plan-badge')
await p.click('text=I have a license key')
await p.click('text=Email me my key')
await p.fill('#recover-email', 'new.buyer@example.com')
const b2 = await mails()
await p.click('button:has-text("Send key")')
await p.waitForTimeout(1200)
console.log('recover message:', await p.locator('.paywall-key .check-ok, .paywall-key .error').textContent(), '| emails sent:', (await mails()) - b2)
await p.locator('.paywall-key').screenshot({ path: `${out}/key-recover.png` })
await p.context().close()
console.log(errors.join('\n') || 'no errors')
await browser.close()
