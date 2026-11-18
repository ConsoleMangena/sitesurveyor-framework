import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(path.resolve(here, '../package.json'))
const WebSocket = require('ws')
// The profile is throwaway state; a stale service worker in it can serve the
// previous bundle and make the shots lie, so start every run clean.
const profileDir = path.join(here, 'nav-check-profile')
fs.rmSync(profileDir, { recursive: true, force: true })
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9335',
  `--user-data-dir=${profileDir}`,
  '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost',
  '--window-size=1280,900', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: 'ignore' })
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let page
for (let i = 0; i < 50; i++) {
  try {
    page = (await fetch('http://127.0.0.1:9335/json/list').then((r) => r.json())).find((item) => item.type === 'page')
    if (page?.webSocketDebuggerUrl) break
  } catch {}
  await sleep(200)
}
if (!page?.webSocketDebuggerUrl) throw new Error('Chrome page unavailable')
const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false })
await new Promise((resolve) => ws.on('open', resolve))
let nextId = 0
const rpc = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId
  const onMessage = (raw) => {
    const message = JSON.parse(raw.toString())
    if (message.id !== id) return
    ws.off('message', onMessage)
    message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result)
  }
  ws.on('message', onMessage)
  ws.send(JSON.stringify({ id, method, params }))
})
const evaluate = async (expression) => {
  const result = await rpc('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? 'Evaluation failed')
  return result.result.value
}
const waitFor = async (expression, timeoutMs = 20000) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return
    await sleep(200)
  }
  throw new Error(`Timed out waiting for ${expression}`)
}
const screenshot = async (name) => {
  const { data } = await rpc('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(path.join(here, `${name}.png`), Buffer.from(data, 'base64'))
}
try {
  await rpc('Page.enable')
  await rpc('Runtime.enable')
  await rpc('Page.navigate', { url: 'http://localhost:4175/market' })
  await waitFor("!!document.querySelector('.public-nav-more-toggle') && !!document.querySelector('.public-site-header')")
  // The account chip only renders once the workspace has mapped, so wait for it
  // instead of screenshotting a half-signed-in header.
  await waitFor("!!document.querySelector('[aria-label^=\"Open account menu\"]')", 30000)
  await sleep(400)
  await screenshot('nav-check-desktop')
  await rpc('Emulation.setDeviceMetricsOverride', { width: 1000, height: 900, deviceScaleFactor: 1, mobile: false })
  await screenshot('nav-check-1000')
  await rpc('Emulation.setDeviceMetricsOverride', { width: 900, height: 900, deviceScaleFactor: 1, mobile: false })
  await screenshot('nav-check-900')
  await rpc('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  await evaluate("document.querySelector('.public-nav-more-toggle').click()")
  await waitFor("!document.querySelector('#public-more-menu').hidden")
  await screenshot('nav-check-dropdown')
  await rpc('Emulation.setDeviceMetricsOverride', { width: 480, height: 900, deviceScaleFactor: 1, mobile: true })
  await rpc('Page.navigate', { url: 'http://localhost:4175/market' })
  await waitFor("!!document.querySelector('.public-nav-toggle')")
  await waitFor("!!document.querySelector('[aria-label^=\"Open account menu\"]')", 30000)
  await sleep(400)
  await evaluate("document.querySelector('.public-nav-toggle').click()")
  await waitFor("document.querySelector('#public-navigation') && !document.querySelector('#public-navigation').hidden")
  await screenshot('nav-check-mobile')
  console.log('Captured desktop, dropdown, and mobile disclosure')
} finally {
  ws.close()
  chrome.kill()
}
