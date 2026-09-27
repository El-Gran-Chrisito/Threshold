// Render the app icon to PNGs for the web app manifest: node scripts/make-icons.mjs
import { chromium } from 'playwright'
const svg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="512" height="512">
<rect width="32" height="32" fill="#0b7a75"/>
<g transform="translate(${pad} ${pad}) scale(${(32 - pad * 2) / 32})">
<path d="M4 28V14L16 4l12 10v14" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linejoin="round"/>
<path d="M12 28v-9h8v9" fill="#f2c14e"/>
<path d="M2 28h28" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round"/>
</g></svg>`
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined })
const page = await browser.newPage()
for (const [name, size, pad] of [['icon-192.png', 192, 4], ['icon-512.png', 512, 4], ['maskable-512.png', 512, 7], ['apple-touch-icon.png', 180, 4]]) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<body style="margin:0">${svg(pad).replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body>`)
  await page.screenshot({ path: `public/icons/${name}`, omitBackground: false })
}
await browser.close()
console.log('icons written')
