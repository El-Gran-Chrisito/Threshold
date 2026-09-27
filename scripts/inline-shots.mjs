// Replace shots/*.jpg references in a built page with data URIs (for one-file previews).
import { readFileSync, writeFileSync } from 'node:fs'
const [file, dir = 'public'] = process.argv.slice(2)
let html = readFileSync(file, 'utf8')
html = html.replace(/shots\/([a-z0-9-]+)\.jpg/g, (_, n) => `data:image/jpeg;base64,${readFileSync(`${dir}/shots/${n}.jpg`).toString('base64')}`)
writeFileSync(file, html)
console.log(`inlined images into ${file} (${(html.length / 1024).toFixed(0)} KB)`)
