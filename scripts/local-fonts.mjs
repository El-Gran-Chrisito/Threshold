// Serve Google Fonts to a Playwright page from a local cache, so screenshots
// use the app's real typefaces where the test browser cannot reach Google.
// Fill the cache first with curl (see scripts/ui-audit.mjs). FONT_CACHE
// points at it; without a cache the page keeps its fallback fonts.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'

export async function serveLocalFonts(page, dir = process.env.FONT_CACHE) {
  if (!dir || !existsSync(dir)) return false
  await page.route('https://fonts.googleapis.com/**', (route) => {
    const q = new URL(route.request().url()).search.slice(1)
    const file = `${dir}/css-${createHash('md5').update(`${decodeURIComponent(q)}\n`).digest('hex').slice(0, 10)}.css`
    if (!existsSync(file)) return route.fulfill({ status: 404, body: '' })
    route.fulfill({ status: 200, contentType: 'text/css', body: readFileSync(file, 'utf8') })
  })
  await page.route('https://fonts.gstatic.com/**', (route) => {
    const file = `${dir}/${route.request().url().replace('https://fonts.gstatic.com/', '').replace(/\//g, '_')}`
    if (!existsSync(file)) return route.fulfill({ status: 404, body: '' })
    route.fulfill({ status: 200, contentType: 'font/woff2', body: readFileSync(file), headers: { 'access-control-allow-origin': '*' } })
  })
  return true
}
