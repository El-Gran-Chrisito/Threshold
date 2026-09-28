// Makes a PDF plan set in the browser with a paid key and saves it for inspection.
// Usage: node scripts/plan-set-check.mjs <key file> <out.pdf> [example]
// With "example": no studio brand, and the cover uses a full-width 3D corner view.
// public/shots/set-*.jpg are pages 1, 2 and 5 of the "example" output, rendered at 100 dpi.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const key = readFileSync(process.argv[2], 'utf8').trim().split('\n')[0]
const out = process.argv[3] || 'plan-set.pdf'
const example = process.argv[4] === 'example'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const errors = []
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', acceptDownloads: true })
const page = await ctx.newPage()
page.on('pageerror', (e) => errors.push(e.message))
await page.goto('http://localhost:4174/')
await page.evaluate(([k, ex]) => {
  localStorage.setItem('threshold:welcomed', '1')
  localStorage.setItem('threshold:license', k)
  if (!ex) localStorage.setItem('threshold:brand', JSON.stringify({ company: 'Oak & Line Studio', contact: 'hello@oakline.example · 555 0142', logo: null }))
}, [key, example])
await page.reload()
await page.waitForTimeout(1500)
await page.evaluate((ex) => {
  const st = window.__threshold.store
  st.getState().setView(ex ? '3d' : 'split')
  if (ex) st.setState({ cutaway: false, showRoof: true, viewFrom: { dir: 'corner', seq: st.getState().viewFrom.seq + 1 } })
}, example)
await page.waitForTimeout(example ? 6000 : 2500)
await page.click('.panel-tabs >> text=Project')
const t0 = Date.now()
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('button:has-text("Save plan set")')])
await dl.saveAs(out)
console.log('saved', dl.suggestedFilename(), 'in', Date.now() - t0, 'ms')
console.log(errors.join('\n') || 'no errors')
await browser.close()
