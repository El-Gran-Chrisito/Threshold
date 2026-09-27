// Convert the single-file build into page content for a claude.ai artifact
// (the host supplies <!doctype>, <html>, <head> and <body>).
import { readFileSync, writeFileSync } from 'node:fs'
const [src, out] = process.argv.slice(2)
const html = readFileSync(src, 'utf8')
const title = html.match(/<title>[\s\S]*?<\/title>/)[0]
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1]
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1]
const links = [...head.matchAll(/<link[^>]+fonts\.googleapis\.com\/css2[^>]*>/g)].map((m) => m[0])
const styles = [...head.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map((m) => m[0])
const scripts = [...head.matchAll(/<script[^>]*>[\s\S]*?<\/script>/g)].map((m) => m[0])
const page = [title, ...links, ...styles, body.trim(), ...scripts].join('\n')
writeFileSync(out, page)
console.log(`wrote ${out} (${(page.length / 1024).toFixed(0)} KB)`)
