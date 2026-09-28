import { describe, expect, it } from 'vitest'
import { buildPdf, paperFor, pdfText } from './pdf'

const text = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join('')

describe('pdf writer', () => {
  it('writes one image page per page with a valid cross-reference table', async () => {
    const pixels = new Uint8Array(4 * 3 * 3).fill(255)
    const data = new Uint8Array(await new Response(new Blob([pixels]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer())
    const image = { width: 4, height: 3, filter: 'FlateDecode' as const, data }
    const paper = paperFor('imperial')
    const pdf = text(buildPdf([{ ...paper, image }, { ...paper, image }], { title: 'Lake cabin · plan set', date: new Date(Date.UTC(2026, 8, 28)) }))
    expect(pdf.startsWith('%PDF-1.4')).toBe(true)
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true)
    expect(pdf).toContain('/Count 2')
    expect(pdf).toContain('/MediaBox [0 0 792 612]')
    expect(pdf).toContain('/CreationDate (D:20260928000000Z)')
    // Every xref entry points at the start of its object.
    const xrefAt = Number(pdf.match(/startxref\n(\d+)/)![1])
    const rows = pdf.slice(xrefAt).split('\n').slice(3)
    const count = Number(pdf.match(/\/Size (\d+)/)![1])
    for (let n = 1; n < count; n++) expect(pdf.slice(Number(rows[n - 1].slice(0, 10)), Number(rows[n - 1].slice(0, 10)) + 10)).toMatch(new RegExp(`^${n} 0 obj`))
  })

  it('encodes any text in document info', () => {
    expect(pdfText('Aé')).toBe('<FEFF004100E9>')
    expect(paperFor('metric').name).toBe('A4')
  })
})
