// Drives verify-presets.html in headless Chrome against a vite dev server and
// prints the page's console output. Exits when the page logs VERIFY DONE.
import { spawn } from 'node:child_process'
import puppeteer from 'puppeteer-core'

const PORT = 5342
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort'], {
  cwd: new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'),
  stdio: ['ignore', 'pipe', 'pipe'],
})
vite.stderr.on('data', (d) => process.stderr.write(d))
for (let i = 0; ; i++) {
  try { await fetch(`http://localhost:${PORT}/`).then((r) => r.text()); break } catch {}
  if (i > 60) throw new Error('vite did not start')
  await new Promise((r) => setTimeout(r, 500))
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'shell',
  args: ['--no-sandbox', '--disable-gpu'],
})
const page = await browser.newPage()
let done = false
page.on('console', (msg) => {
  const text = msg.text()
  if (text.includes('[verify]')) {
    console.log(text.replace('[verify] ', ''))
    if (text.includes('VERIFY DONE')) done = true
  }
})
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message))

await page.goto(`http://localhost:${PORT}/verify-presets.html`, { waitUntil: 'load' })
const deadline = Date.now() + 30 * 60 * 1000
while (!done && Date.now() < deadline) await new Promise((r) => setTimeout(r, 1000))

await browser.close()
vite.kill()
process.exit(done ? 0 : 1)
