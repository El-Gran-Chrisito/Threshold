import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
const out = process.argv[2]
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
page.on('pageerror', (e) => console.log('pageerror: ' + e.message))
await page.goto('http://localhost:4173/')
await page.waitForTimeout(800)
if (await page.$('.welcome')) await page.click('text=Explore the example home')
await page.click('.panel-tabs >> text=Project')
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('text=Save floor plan image')])
await dl.saveAs(`${out}/60-plan-export.png`)
console.log('saved', dl.suggestedFilename())
await browser.close()
