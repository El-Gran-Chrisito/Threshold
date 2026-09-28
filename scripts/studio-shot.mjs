// Marketing picture of a branded client presentation: node scripts/studio-shot.mjs public/shots
// Uses the example home with an example studio brand (preview on :4173).
import { chromium } from 'playwright'
const out = process.argv[2] ?? 'public/shots'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
await page.goto('http://localhost:4173/')
await page.evaluate(() => {
  const c = document.createElement('canvas')
  c.width = 360
  c.height = 110
  const g = c.getContext('2d')
  g.fillStyle = '#1f3b36'
  g.fillRect(0, 0, 360, 110)
  g.fillStyle = '#f2e9dc'
  g.font = '600 40px Georgia, serif'
  g.fillText('Oak & Line', 28, 58)
  g.font = '500 20px sans-serif'
  g.fillText('ARCHITECTURE STUDIO', 30, 90)
  localStorage.clear()
  localStorage.setItem('threshold:welcomed', '1')
  localStorage.setItem('threshold:lowq', '0')
  localStorage.setItem('threshold:brand', JSON.stringify({ company: 'Oak & Line Studio', contact: 'studio@oakline.example', logo: c.toDataURL('image/png') }))
})
await page.reload()
await page.waitForTimeout(1500)
await page.evaluate(() => {
  const st = window.__threshold.store
  st.getState().apply((p) => ({ ...p, name: 'Harbour View House', client: 'The Garcia family' }))
  st.setState({ presenting: true })
})
await page.waitForTimeout(25000)
await page.screenshot({ path: `${out}/studio.jpg`, type: 'jpeg', quality: 82 })
await browser.close()
