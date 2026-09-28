/**
 * A small PDF writer for pages that are each one picture: a JPEG
 * (DCTDecode) for photos, or raw RGB pixels compressed with zlib
 * (FlateDecode), which keeps line drawings sharp. Needs no fonts and no
 * library, so the plan set works offline and inside a single-file build.
 */

export interface PdfImage {
  width: number
  height: number
  filter: 'DCTDecode' | 'FlateDecode'
  data: Uint8Array
}

export interface PdfPage {
  /** Page size in points (1/72 inch). */
  widthPt: number
  heightPt: number
  image: PdfImage
}

/** Letter for feet and inches, A4 for metric; both landscape. */
export function paperFor(units: 'imperial' | 'metric'): { widthPt: number; heightPt: number; name: string } {
  return units === 'imperial' ? { widthPt: 792, heightPt: 612, name: 'Letter' } : { widthPt: 842, heightPt: 595, name: 'A4' }
}

function latin1(s: string): Uint8Array {
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff
  return out
}

/** Any text as a PDF string (UTF-16 with a byte-order mark, in hex). */
export function pdfText(s: string): string {
  let hex = 'FEFF'
  for (let i = 0; i < s.length; i++) hex += s.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase()
  return `<${hex}>`
}

function pdfDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `(D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z)`
}

export function buildPdf(pages: PdfPage[], info: { title?: string; author?: string; date?: Date } = {}): Uint8Array {
  const chunks: Uint8Array[] = []
  const offsets: number[] = []
  let length = 0
  const push = (x: string | Uint8Array) => {
    const b = typeof x === 'string' ? latin1(x) : x
    chunks.push(b)
    length += b.length
  }
  const obj = (n: number, ...body: Array<string | Uint8Array>) => {
    offsets[n] = length
    push(`${n} 0 obj\n`)
    body.forEach(push)
    push('\nendobj\n')
  }
  const fmt = (n: number) => String(Math.round(n * 100) / 100)

  push('%PDF-1.4\n%âãÏÓ\n')
  // 1 catalog, 2 page tree, 3 document info, then page, contents and image for each page.
  const first = 4
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>')
  obj(2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${first + i * 3} 0 R`).join(' ')}] /Count ${pages.length} >>`)
  const meta = [`/Producer ${pdfText('Threshold')}`, `/CreationDate ${pdfDate(info.date ?? new Date())}`]
  if (info.title) meta.push(`/Title ${pdfText(info.title)}`)
  if (info.author) meta.push(`/Author ${pdfText(info.author)}`)
  obj(3, `<< ${meta.join(' ')} >>`)
  pages.forEach((p, i) => {
    const n = first + i * 3
    const w = fmt(p.widthPt)
    const h = fmt(p.heightPt)
    obj(n, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${n + 2} 0 R >> >> /Contents ${n + 1} 0 R >>`)
    const draw = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`
    obj(n + 1, `<< /Length ${draw.length} >>\nstream\n`, draw, '\nendstream')
    const im = p.image
    obj(
      n + 2,
      `<< /Type /XObject /Subtype /Image /Width ${im.width} /Height ${im.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /${im.filter} /Length ${im.data.length} >>\nstream\n`,
      im.data,
      '\nendstream',
    )
  })
  const count = first + pages.length * 3
  const xref = length
  push(`xref\n0 ${count}\n0000000000 65535 f \n`)
  for (let i = 1; i < count; i++) push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`)
  push(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`)

  const out = new Uint8Array(length)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  return out
}
