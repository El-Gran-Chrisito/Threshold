/**
 * Public pages for the plan library, written at build time (vite.config.ts):
 * /plans/index.html and one page per ready-made home with its floor plan,
 * summary and room schedule, and a button that opens it in the app
 * (#library=<id>). Real content from the same data the app uses.
 */
import { LIBRARY, buildLibraryPlan, libraryBlurb, type LibraryPlan } from '../model/library'
import { miniPlanLayout } from '../model/miniplan'
import { homeSummary, roomSchedule } from '../model/schedule'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export interface PlanPageOptions {
  /** Where the app lives, as the marketing page links to it ('/app' when rewrites are set up). */
  appPath: string
  /** Absolute site address, for canonical links; empty for relative links only. */
  siteUrl?: string
}

function planSvg(l: LibraryPlan, height: number, labels: boolean): string {
  const layout = miniPlanLayout(buildLibraryPlan(l.id))
  if (!layout) return ''
  const floors = layout.floors
    .map(
      (f) =>
        `<g transform="translate(${Math.round(f.dx)} ${Math.round(f.dy)})">${f.rooms
          .map((r) => `<polygon points="${r.points}" fill="${r.fill}" stroke="currentColor" stroke-width="10" stroke-linejoin="round"><title>${esc(r.name)}</title></polygon>`)
          .join('')}${
          labels
            ? f.rooms
                .map((r) => {
                  // Size the name to the room; leave out names that cannot fit.
                  const size = Math.min(46, (r.w * 0.78) / Math.max(4, r.name.length * 0.62))
                  return size < 22 ? '' : `<text x="${r.cx}" y="${r.cy}" font-size="${Math.round(size)}" text-anchor="middle" dominant-baseline="middle" fill="#1c2226" font-weight="700">${esc(r.name)}</text>`
                })
                .join('')
            : ''
        }</g>`,
    )
    .join('')
  const names = labels ? `<figcaption>${layout.floors.map((f) => esc(f.name)).join(' · ')}</figcaption>` : ''
  return `<figure class="plan"><svg viewBox="${layout.viewBox}" height="${height}" role="img" aria-label="Floor plan of the ${esc(l.name)}">${floors}</svg>${names}</figure>`
}

/** The app link that opens a library home. Relative app paths are taken from /plans/. */
export function openLink(appPath: string, id: string): string {
  const base = appPath.startsWith('/') || /^https?:/.test(appPath) ? appPath : `../${appPath.replace(/^\.\//, '')}`
  return `${base}#library=${id}`
}

const CSS = `
:root{--paper:#eef1ee;--panel:#fff;--ink:#1c2226;--ink-2:#4f5b63;--line:#d5dcd8;--accent:#0b7a75;--accent-ink:#fff;--font:'Atkinson Hyperlegible Next','Atkinson Hyperlegible',system-ui,-apple-system,'Segoe UI',sans-serif;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--paper:#0f1517;--panel:#172023;--ink:#e4eae8;--ink-2:#a3afb2;--line:#2b363a;--accent:#3bbdb2;--accent-ink:#0b1a19;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.55 var(--font)}
.wrap{max-width:1040px;margin:0 auto;padding:0 20px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 0}
header a{color:var(--ink);text-decoration:none;font-weight:700}
.btn{display:inline-block;padding:11px 18px;border-radius:10px;background:var(--accent);color:var(--accent-ink);font-weight:800;text-decoration:none}
h1{font-size:clamp(30px,5vw,46px);line-height:1.1;margin:18px 0 8px;text-wrap:balance}
.lede{color:var(--ink-2);margin:0 0 6px;max-width:62ch}
.tag{display:inline-block;margin:6px 0 18px;padding:3px 10px;border-radius:999px;border:1px solid var(--line);font-size:14px;font-weight:700}
figure.plan{margin:0;padding:20px;background:var(--panel);border:1px solid var(--line);border-radius:14px;color:var(--ink)}
figure.plan svg{display:block;width:100%;max-width:100%;height:auto;max-height:380px}
figcaption{margin-top:10px;color:var(--ink-2);font-size:14px}
.cta{display:flex;flex-wrap:wrap;align-items:center;gap:12px 18px;margin:22px 0 32px}
.scroll{overflow-x:auto}table{width:100%;min-width:520px;border-collapse:collapse;font-size:15px;background:var(--panel);border:1px solid var(--line);border-radius:12px}
th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line)}thead th{font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-2)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px;margin:14px 0 40px}
.card{display:flex;flex-direction:column;gap:6px;padding:14px;background:var(--panel);border:1px solid var(--line);border-radius:14px;color:var(--ink);text-decoration:none}
.card figure.plan{padding:8px;border:0}.card strong{font-size:17px}.card span{color:var(--ink-2);font-size:14px}
h2{margin:36px 0 10px;font-size:24px}footer{padding:30px 0 40px;color:var(--ink-2);font-size:14px}
`

function shell(title: string, description: string, body: string, canonical: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
${canonical ? `<link rel="canonical" href="${esc(canonical)}" />` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:wght@400;700;800&display=swap" />
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
${body}
<footer>Threshold · Design your home in the browser, see it in 3D, walk through it. <a href="../home.html">Home</a> · <a href="./index.html">All plans</a></footer>
</div>
</body>
</html>
`
}

function header(o: PlanPageOptions): string {
  return `<header><a href="../home.html">Threshold</a><a class="btn" href="${esc(openLink(o.appPath, '').replace('#library=', ''))}">Open the app</a></header>`
}

function card(l: LibraryPlan): string {
  return `<a class="card" href="./${l.id}.html">${planSvg(l, 90, false)}<strong>${esc(l.name)}</strong><span>${esc(libraryBlurb(l))}</span><span>${esc(l.for)}</span></a>`
}

export function planPageHtml(l: LibraryPlan, o: PlanPageOptions): string {
  const p = buildLibraryPlan(l.id)
  const b = l.brief
  const title = `${l.name}: ${b.bedrooms} bed, ${b.bathrooms} bath house plan · Threshold`
  const description = `${l.name}, a ${homeSummary(p)} home plan: ${l.for.toLowerCase()}. Open it free in Threshold, change anything and walk through it in 3D.`
  const rows = roomSchedule(p)
    .map((r) => `<tr><td>${esc(r.floor)}</td><td>${esc(r.room)}</td><td>${esc(r.area)}</td><td>${esc(r.size)}</td><td>${esc(r.finish)}</td></tr>`)
    .join('')
  const others = LIBRARY.filter((x) => x.id !== l.id).map(card).join('')
  const body = `${header(o)}
<main>
<h1>${esc(l.name)}</h1>
<p class="lede">${esc(l.for)}. ${esc(homeSummary(p))}.</p>
<span class="tag">${esc(libraryBlurb(l))}${l.pro ? ' · Included with Pro' : ' · Free'}</span>
${planSvg(l, 380, true)}
<div class="cta"><a class="btn" href="${esc(openLink(o.appPath, l.id))}">Open this plan in Threshold</a><span>Furnished and styled. Move walls, change rooms and finishes, and walk through it in 3D.</span></div>
<h2>Rooms</h2>
<div class="scroll"><table><thead><tr><th>Floor</th><th>Room</th><th>Area</th><th>Size</th><th>Floor finish</th></tr></thead><tbody>${rows}</tbody></table></div>
<h2>More ready-made homes</h2>
<div class="grid">${others}</div>
</main>`
  return shell(title, description, body, o.siteUrl ? `${o.siteUrl.replace(/\/$/, '')}/plans/${l.id}.html` : '')
}

export function planIndexHtml(o: PlanPageOptions): string {
  const body = `${header(o)}
<main>
<h1>Ready-made house plans</h1>
<p class="lede">Furnished, styled homes to start from. Open one in Threshold and change anything: rooms, walls, finishes, furniture. Then see it in 3D and walk through it.</p>
<div class="grid">${LIBRARY.map(card).join('')}</div>
</main>`
  return shell('Ready-made house plans · Threshold', 'Ready-made house plans from cottages to five-bedroom family homes, furnished and styled. Open any of them in Threshold and change anything.', body, o.siteUrl ? `${o.siteUrl.replace(/\/$/, '')}/plans/` : '')
}

/** Every page as path → HTML. */
export function planPages(o: PlanPageOptions): Record<string, string> {
  return { 'plans/index.html': planIndexHtml(o), ...Object.fromEntries(LIBRARY.map((l) => [`plans/${l.id}.html`, planPageHtml(l, o)])) }
}
