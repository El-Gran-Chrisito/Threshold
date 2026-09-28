// Text contrast check (WCAG AA: 4.5:1, or 3:1 for large text) over the main
// screens in light and dark themes. Prints each failing text once.
// Usage: node scripts/ui-contrast.mjs
import { chromium } from 'playwright'
const base = process.env.BASE || 'http://localhost:4173/'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined })

function audit() {
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/)
    if (!m) return null
    const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number)
    return { r, g, b, a }
  }
  const lum = ({ r, g, b }) => {
    const f = (v) => {
      v /= 255
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const mix = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 })
  const background = (el) => {
    const layers = []
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e)
      if (cs.backgroundImage !== 'none' && !cs.backgroundImage.startsWith('linear-gradient')) return null // pictures: skip
      const c = parse(cs.backgroundColor)
      if (c && c.a > 0) {
        layers.push(c)
        if (c.a >= 1) break
      }
    }
    let bg = { r: 255, g: 255, b: 255, a: 1 }
    for (const l of layers.reverse()) bg = mix(l, bg)
    return bg
  }
  const out = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent.trim()
    if (!text) continue
    const el = n.parentElement
    if (!el || el.closest('svg, canvas, [aria-hidden="true"]')) continue
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > innerHeight) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue
    let hidden = false
    for (let e = el; e; e = e.parentElement) if (Number(getComputedStyle(e).opacity) < 0.5) hidden = true
    if (hidden || el.disabled || el.closest('[disabled], .is-quiet')) continue
    const fg = parse(cs.color)
    const bg = background(el)
    if (!fg || !bg) continue
    const f = mix(fg, bg)
    const [a, b] = [lum(f), lum(bg)].sort((x, y) => y - x)
    const ratio = (a + 0.05) / (b + 0.05)
    const size = parseFloat(cs.fontSize)
    const bold = Number(cs.fontWeight) >= 700
    const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5
    if (ratio < need) out.push(`${ratio.toFixed(2)} < ${need} | ${size}px | ${el.tagName.toLowerCase()}.${[...el.classList].join('.')} | ${text.slice(0, 50)}`)
  }
  return [...new Set(out)]
}

const failures = new Set()
for (const scheme of ['light', 'dark']) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: scheme })
  await page.goto(base)
  await page.waitForTimeout(1000)
  const run = async (label) => {
    await page.waitForTimeout(400)
    for (const f of await page.evaluate(audit)) failures.add(`${scheme} ${label}: ${f}`)
  }
  await run('welcome')
  await page.click('text=Explore the example home')
  await page.evaluate(() => window.__threshold.store.getState().setView('plan'))
  await run('plan')
  for (const tab of ['Catalog', 'Paint', 'Levels', 'Budget', 'Project', 'Ask']) {
    await page.locator(`.panel-tabs >> text=${tab}`).click()
    await run(`panel ${tab}`)
  }
  await page.locator('.panel-tabs >> text=Edit').click()
  await page.evaluate(() => {
    const s = window.__threshold.store.getState()
    const l = s.project.levels.find((x) => x.id === s.levelId)
    s.select({ kind: 'room', id: l.rooms[0].id })
  })
  await run('room')
  await page.click('.plan-badge')
  await run('plans sheet')
  await page.keyboard.press('Escape')
  await page.click('button[aria-label="Help and shortcuts"]')
  await run('help')
  // The marketing page, scrolled through a screen at a time.
  await page.goto(base + 'home.html')
  await page.waitForTimeout(800)
  const height = await page.evaluate(() => document.documentElement.scrollHeight)
  for (let y = 0; y < height; y += 800) {
    await page.evaluate((top) => window.scrollTo(0, top), y)
    await run(`marketing @${y}`)
  }
  await page.close()
}
console.log(failures.size ? [...failures].join('\n') : 'no contrast failures')
await browser.close()
