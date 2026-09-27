import { chromium } from 'playwright'
const out = process.argv[2]
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined })
const errors = []
for (const [w, h, name, scheme] of [[1440, 900, 'desk', 'light'], [390, 844, 'phone', 'light'], [1440, 900, 'dark', 'dark']]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, colorScheme: scheme })
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`))
  page.on('requestfailed', (r) => { if (!r.url().includes('fonts.g')) errors.push(`${name}: failed ${r.url()}`) })
  await page.goto('http://localhost:4173/home.html')
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${out}/landing-${name}.png`, fullPage: name !== 'dark' })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  console.log(name, 'horizontal overflow:', overflow)
  await page.close()
}
console.log(errors.join('\n') || 'no errors')
await browser.close()
