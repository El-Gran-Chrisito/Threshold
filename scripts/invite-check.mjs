// Checks invites end to end against the fake license server on :4180 and a test build on :4174
// built with VITE_INVITE_PROMO_CODE and VITE_INVITE_OFFER.
// A subscriber gets a link; a friend opens it, checkout links carry the code; the friend's
// purchase credits the subscriber once.
// Usage: node scripts/invite-check.mjs <out dir>
import { chromium } from 'playwright'
const out = process.argv[2] || '.'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const errors = []
const credits = async () => Number(await (await fetch('http://localhost:4180/_credits')).text())
async function ctx() {
  const c = await browser.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'block' })
  const page = await c.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('http://localhost:4174/')
  await page.evaluate(() => localStorage.setItem('threshold:welcomed', '1'))
  return page
}
// The subscriber.
const a = await ctx()
await a.goto('http://localhost:4174/?checkout_session=cs_test_e2e')
await a.waitForTimeout(2000)
await a.click('.plan-badge')
await a.click('text=Invite a friend')
await a.waitForSelector('#invite-link')
const link = await a.inputValue('#invite-link')
console.log('invite link:', link)
await a.locator('.sheet.paywall').screenshot({ path: `${out}/invite-box.png` })
await a.goto('about:blank')
// The friend.
const b = await ctx()
await b.goto(link.replace('http://localhost:4174/', 'http://localhost:4174/home.html'))
await b.waitForTimeout(800)
console.log('friend sees:', await b.locator('.invited').textContent().catch(() => '-'), '| address now:', b.url())
const buy = await b.locator('.plans a:has-text("Get Pro")').getAttribute('href')
console.log('Get Pro link:', buy)
const code = new URL(link).searchParams.get('invite')
const before = await credits()
await b.goto(`http://localhost:4174/?checkout_session=cs_friend_${code}`)
await b.waitForTimeout(2000)
console.log('friend after checkout:', await b.locator('.toast').textContent().catch(() => '-'), '| credits made:', (await credits()) - before)
await b.goto(`http://localhost:4174/?checkout_session=cs_friend_${code}`)
await b.waitForTimeout(1500)
console.log('same checkout again, credits made:', (await credits()) - before)
// The subscriber sees the count. Two WebGL pages at once starve a software renderer: close the friend's first.
await b.context().close()
await a.goto('http://localhost:4174/')
await a.waitForTimeout(1500)
await a.click('.plan-badge')
await a.click('text=Invite a friend')
await a.waitForTimeout(800)
console.log('subscriber sees:', await a.locator('.paywall-device .check-ok').textContent().catch(() => '-'))
console.log(errors.join('\n') || 'no errors')
await browser.close()
