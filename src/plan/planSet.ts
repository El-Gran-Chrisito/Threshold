/**
 * The plan set: one PDF to print or send to a builder. A cover with a 3D
 * view and the home's summary, a floor plan sheet for every floor, the room
 * schedule, and the shopping list. Pages are drawn on canvases at 200 dpi
 * and packed by the small writer in pdf.ts.
 */
import type { Project } from '../model/types'
import type { Brand } from '../product/brand'
import { hasBrand } from '../product/brand'
import { homeSummary, roomSchedule } from '../model/schedule'
import { TAKEOFF_GROUPS, takeoff } from '../model/takeoff'
import { budget } from '../model/budget'
import { formatMoney } from '../model/units'
import { planCanvas } from './exportPlan'
import { buildPdf, paperFor, type PdfImage, type PdfPage } from './pdf'

const DPI = 200
const INK = '#1c2226'
const INK_2 = '#56626a'
const RULE = '#d5dadd'
const ACCENT = '#0b7a75'

export interface PlanSetOptions {
  /** What is on screen in 3D, for the cover. Without it the cover shows the first floor plan. */
  cover3d?: HTMLCanvasElement | null
  brand?: Brand | null
  /** Include the shopping list pages. */
  shopping?: boolean
}

interface Sheet {
  id: string
  title: string
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void | Promise<void>
  photo?: boolean
}

function font(weight: number, px: number): string {
  const family = typeof document !== 'undefined' ? getComputedStyle(document.body).fontFamily || 'sans-serif' : 'sans-serif'
  return `${weight} ${px}px ${family}`
}

/** Shorten text with an ellipsis until it fits. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1)
  return `${t}…`
}

function contain(sw: number, sh: number, bw: number, bh: number) {
  const k = Math.min(bw / sw, bh / sh)
  return { w: sw * k, h: sh * k }
}

async function encode(canvas: HTMLCanvasElement, photo: boolean): Promise<PdfImage> {
  if (photo) {
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', 0.9))
    return { width: canvas.width, height: canvas.height, filter: 'DCTDecode', data: new Uint8Array(await blob.arrayBuffer()) }
  }
  const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
  const rgb = new Uint8Array(canvas.width * canvas.height * 3)
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    rgb[j] = data[i]
    rgb[j + 1] = data[i + 1]
    rgb[j + 2] = data[i + 2]
  }
  const zipped = new Blob([rgb]).stream().pipeThrough(new CompressionStream('deflate'))
  return { width: canvas.width, height: canvas.height, filter: 'FlateDecode', data: new Uint8Array(await new Response(zipped).arrayBuffer()) }
}

/** A table that flows over as many pages as it needs. */
function tablePages(
  idPrefix: string,
  title: string,
  columns: Array<{ label: string; share: number }>,
  rows: Array<{ cells: string[]; heading?: boolean }>,
  perPage: number,
): Sheet[] {
  const pages: Sheet[] = []
  for (let start = 0, n = 1; start < rows.length || n === 1; start += perPage, n++) {
    const slice = rows.slice(start, start + perPage)
    const count = Math.max(1, Math.ceil(rows.length / perPage))
    pages.push({
      id: `${idPrefix}-${n}`,
      title: count > 1 ? `${title} (${n} of ${count})` : title,
      draw: (ctx, w) => {
        const m = 0.5 * DPI
        const top = 1.05 * DPI
        const rowH = (DPI * 0.19) | 0
        ctx.fillStyle = INK
        ctx.font = font(700, 48)
        ctx.fillText(count > 1 ? `${title} · ${n} of ${count}` : title, m, 0.62 * DPI)
        const inner = w - 2 * m
        let x = m
        ctx.font = font(700, 26)
        ctx.fillStyle = INK_2
        const xs = columns.map((c) => {
          const at = x
          x += inner * c.share
          return at
        })
        columns.forEach((c, i) => ctx.fillText(c.label.toUpperCase(), xs[i], top))
        ctx.fillStyle = INK
        ctx.fillRect(m, top + 12, inner, 3)
        slice.forEach((r, k) => {
          const y = top + 12 + rowH * (k + 1)
          if (r.heading) {
            ctx.font = font(700, 30)
            ctx.fillStyle = ACCENT
            ctx.fillText(r.cells[0], m, y - 10)
          } else {
            ctx.font = font(400, 28)
            ctx.fillStyle = INK
            r.cells.forEach((c, i) => ctx.fillText(fit(ctx, c, inner * columns[i].share - 18), xs[i], y - 10))
          }
          ctx.fillStyle = RULE
          ctx.fillRect(m, y + 2, inner, 2)
        })
      },
    })
    if (start + perPage >= rows.length) break
  }
  return pages
}

export async function planSetPdf(project: Project, opts: PlanSetOptions = {}): Promise<Blob> {
  const paper = paperFor(project.units)
  const W = Math.round((paper.widthPt / 72) * DPI)
  const H = Math.round((paper.heightPt / 72) * DPI)
  const brand = opts.brand && hasBrand(opts.brand) ? opts.brand : null
  const date = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
  const levels = project.levels.filter((l) => l.rooms.length || l.walls.length)

  const sheets: Sheet[] = []
  levels.forEach((level, i) => {
    sheets.push({
      id: `A-${i + 1}`,
      title: `${level.name} plan`,
      draw: async (ctx, w, h) => {
        const m = 0.35 * DPI
        const plan = await planCanvas(project, level, Math.round(w - 2 * m), { brand })
        const s = contain(plan.width, plan.height, w - 2 * m, h - 2 * m - 0.2 * DPI)
        ctx.drawImage(plan, (w - s.w) / 2, m, s.w, s.h)
      },
    })
  })

  const schedule = roomSchedule(project)
  sheets.push(
    ...tablePages(
      'S',
      'Room schedule',
      [
        { label: 'Floor', share: 0.14 },
        { label: 'Room', share: 0.22 },
        { label: 'Area', share: 0.12 },
        { label: 'Size', share: 0.2 },
        { label: 'Floor finish', share: 0.22 },
        { label: 'Ceiling', share: 0.1 },
      ],
      schedule.map((r) => ({ cells: [r.floor, r.room, r.area, r.size, r.finish, r.ceiling] })),
      Math.floor((H - 1.75 * DPI) / (DPI * 0.19)),
    ),
  )

  if (opts.shopping) {
    const lines = takeoff(project)
    const rows: Array<{ cells: string[]; heading?: boolean }> = []
    for (const g of TAKEOFF_GROUPS) {
      const gl = lines.filter((l) => l.group === g)
      if (!gl.length) continue
      rows.push({ cells: [g], heading: true })
      rows.push(...gl.map((l) => ({ cells: [l.item, l.qty, l.detail, l.where] })))
    }
    sheets.push(
      ...tablePages(
        'M',
        'Shopping list',
        [
          { label: 'Item', share: 0.3 },
          { label: 'Amount', share: 0.14 },
          { label: 'Detail', share: 0.3 },
          { label: 'Where', share: 0.26 },
        ],
        rows,
        Math.floor((H - 1.75 * DPI) / (DPI * 0.19)),
      ),
    )
  }

  const cover: Sheet = {
    id: 'G-0',
    title: 'Cover',
    photo: true,
    draw: async (ctx, w, h) => {
      const m = 0.5 * DPI
      ctx.fillStyle = ACCENT
      ctx.font = font(700, 26)
      ctx.fillText('PLAN SET', m, m + 20)
      ctx.fillStyle = INK
      ctx.font = font(700, 76)
      ctx.fillText(fit(ctx, project.name, w - 2 * m), m, m + 110)
      ctx.fillStyle = INK_2
      ctx.font = font(400, 34)
      const est = budget(project).total
      ctx.fillText(fit(ctx, `${homeSummary(project)}${est > 0 ? ` · rough cost estimate ${formatMoney(est)}` : ''}`, w - 2 * m), m, m + 165)

      // The picture: what is on screen in 3D, or the first floor plan.
      const boxY = m + 205
      const boxH = h - boxY - 1.15 * DPI
      const boxW = w - 2 * m
      if (opts.cover3d && opts.cover3d.width > 0) {
        // Fill the box with the middle of the 3D view.
        const src = opts.cover3d
        const k = Math.max(boxW / src.width, boxH / src.height)
        const sw = boxW / k
        const sh = boxH / k
        ctx.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, m, boxY, boxW, boxH)
        ctx.strokeStyle = RULE
        ctx.lineWidth = 3
        ctx.strokeRect(m, boxY, boxW, boxH)
      } else if (levels[0]) {
        const pic = await planCanvas(project, levels[0], 1800, { brand: null })
        const s = contain(pic.width, pic.height, boxW, boxH)
        ctx.drawImage(pic, (w - s.w) / 2, boxY, s.w, s.h)
      }

      // Who drew it, and what is inside.
      const baseY = h - 0.85 * DPI
      ctx.fillStyle = INK
      ctx.fillRect(m, baseY - 20, w - 2 * m, 3)
      let tx = m
      if (brand?.logo) {
        const img = new Image()
        await new Promise<void>((resolve) => {
          img.onload = () => resolve()
          img.onerror = () => resolve()
          img.src = brand.logo!
        })
        if (img.width) {
          const s = contain(img.width, img.height, 360, 110)
          ctx.drawImage(img, m, baseY + 8, s.w, s.h)
          tx = m + s.w + 30
        }
      }
      ctx.fillStyle = INK
      ctx.font = font(700, 32)
      ctx.fillText(brand ? brand.company || ' ' : 'Drawn with Threshold', tx, baseY + 42)
      ctx.fillStyle = INK_2
      ctx.font = font(400, 26)
      ctx.fillText(brand?.contact || date, tx, baseY + 82)
      if (brand?.contact) ctx.fillText(date, tx, baseY + 116)
      // Sheet index: short columns of three, left to right from the middle.
      const list = [`${cover.id}  Cover`, ...sheets.map((s) => `${s.id}  ${s.title}`)]
      const cols = Math.ceil(list.length / 3)
      const colW = Math.min(480, (w * 0.56 - m) / cols)
      const x0 = w - m - colW * cols
      ctx.fillStyle = INK_2
      ctx.font = font(700, 22)
      ctx.fillText('SHEETS', x0, baseY + 24)
      ctx.font = font(400, 24)
      list.forEach((t, i) => ctx.fillText(fit(ctx, t, colW - 24), x0 + Math.floor(i / 3) * colW, baseY + 60 + (i % 3) * 32))
    },
  }

  const all = [cover, ...sheets]
  const pages: PdfPage[] = []
  for (let i = 0; i < all.length; i++) {
    const sheet = all[i]
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, W, H)
    ctx.textBaseline = 'alphabetic'
    await sheet.draw(ctx, W, H)
    if (i > 0) {
      // Sheet number and page count in the bottom corner.
      ctx.fillStyle = INK_2
      ctx.font = font(400, 24)
      ctx.textAlign = 'right'
      ctx.fillText(`${sheet.id} · ${sheet.title} · ${project.name} · page ${i + 1} of ${all.length}`, W - 0.35 * DPI, H - 0.25 * DPI)
      ctx.textAlign = 'left'
    }
    pages.push({ widthPt: paper.widthPt, heightPt: paper.heightPt, image: await encode(c, !!sheet.photo) })
  }
  const pdf = buildPdf(pages, { title: `${project.name} plan set`, author: brand?.company || undefined })
  return new Blob([pdf as Uint8Array<ArrayBuffer>], { type: 'application/pdf' })
}
