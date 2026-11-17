import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(path.resolve(here, '../package.json'))
const WebSocket = require('ws')

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9333
const BASE = 'http://localhost:4175'
const OUT = path.resolve(here, '../../../paper/assets')

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(here, 'chrome-profile')}`,
  '--window-size=1680,1048',
  '--hide-scrollbars',
  '--force-device-scale-factor=1',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  'about:blank',
], { stdio: 'ignore' })
process.on('exit', () => { try { chrome.kill() } catch {} })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getPageWs() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json())
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) return page.webSocketDebuggerUrl
    } catch {}
    await sleep(400)
  }
  throw new Error('no CDP page target')
}

let id = 0
function rpc(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const mid = ++id
    const onMsg = (raw) => {
      const msg = JSON.parse(raw.toString())
      if (msg.id === mid) {
        ws.off('message', onMsg)
        msg.error ? reject(new Error(method + ': ' + JSON.stringify(msg.error))) : resolve(msg.result)
      }
    }
    ws.on('message', onMsg)
    ws.send(JSON.stringify({ id: mid, method, params }))
  })
}

async function evalJs(ws, expression) {
  const r = await rpc(ws, 'Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error('page eval: ' + JSON.stringify(r.exceptionDetails.exception?.description ?? r.exceptionDetails))
  return r.result.value
}

async function waitFor(ws, expr, timeout = 20000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    if (await evalJs(ws, expr)) return true
    await sleep(400)
  }
  throw new Error('timeout waiting for ' + expr)
}

async function clickAt(ws, expr) {
  const pt = await evalJs(ws, expr)
  if (!pt) throw new Error('no click target: ' + expr)
  await rpc(ws, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 })
  await rpc(ws, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 })
}

async function shot(ws, name) {
  const { data } = await rpc(ws, 'Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(path.join(OUT, `tour-${name}.png`), Buffer.from(data, 'base64'))
  const errs = await evalJs(ws, 'window.__tourErrors || []')
  console.log(name, 'errors:', JSON.stringify(errs))
}

const wsUrl = await getPageWs()
const ws = new WebSocket(wsUrl, { perMessageDeflate: false })
await new Promise((r) => ws.on('open', r))
await rpc(ws, 'Page.enable')
await rpc(ws, 'Runtime.enable')
await rpc(ws, 'Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] })
ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString())
  if (msg.method === 'Fetch.requestPaused') {
    const url = msg.params.request.url
    const local = url.startsWith(BASE) || url.startsWith('http://localhost:4175') || url.startsWith('data:') || url.startsWith('blob:')
    rpc(ws, local ? 'Fetch.continueRequest' : 'Fetch.failRequest', {
      requestId: msg.params.requestId,
      ...(local ? {} : { errorReason: 'BlockedByClient' }),
    }).catch(() => {})
  }
})
await rpc(ws, 'Emulation.setDeviceMetricsOverride', { width: 1680, height: 1048, deviceScaleFactor: 1, mobile: false })

async function go(url, waitExpr) {
  await rpc(ws, 'Page.navigate', { url: BASE + url })
  await waitFor(ws, waitExpr)
  await sleep(1200)
}

await go('/login', `document.body.innerText.includes('Welcome back to the field.')`)
await shot(ws, 'signin')

await go('/workspace?view=dashboard', `document.body.innerText.includes('Active projects')`)
await shot(ws, 'dashboard')

await go('/workspace?view=files', `document.body.innerText.includes('gweru-control-network-adjustment.pdf')`)
await shot(ws, 'files')

await clickAt(ws, `(() => {
  const rows = [...document.querySelectorAll('tr, [class*="row"], article, li, div')].filter(el => el.textContent.includes('gweru-control-network-adjustment.pdf') && el.querySelector('button'));
  const row = rows.sort((a,b) => a.textContent.length - b.textContent.length)[0];
  if (!row) return null;
  const btns = [...row.querySelectorAll('button, [role="button"]')];
  const b = btns[btns.length-1];
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width/2, y: r.y + r.height/2 };
})()`)
console.log('anchor trigger: kebab clicked')
await waitFor(ws, `[...document.querySelectorAll('[role="menuitem"]')].some(el => el.textContent.includes('File details'))`, 8000)
await clickAt(ws, `(() => {
  const el = [...document.querySelectorAll('[role="menuitem"]')].find(e => e.textContent.includes('File details'));
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width/2, y: r.y + r.height/2 };
})()`)
await waitFor(ws, `document.body.innerText.includes('Blockchain anchors') && document.body.innerText.includes('lamports')`, 12000)
await sleep(800)
await shot(ws, 'anchors')

await go('/workspace?view=assistant', `document.body.innerText.includes('42.9')`)
await shot(ws, 'assistant')

await go('/workspace?view=marketplace', `document.body.innerText.includes('Leica TS16 total station (hire)')`)
await shot(ws, 'marketplace')

await evalJs(ws, `[...document.querySelectorAll('[role="button"]')].find(el => el.textContent.includes('Leica TS16 total station (hire)')).click()`)
await waitFor(ws, `document.body.innerText.includes('Request Hire') && document.body.innerText.includes('Reflectorless 1000 m')`, 10000)
await sleep(800)
await shot(ws, 'market-detail')

await go('/workspace?view=billing&section=credits', `document.body.innerText.includes('SiteSurveyor credits') && document.body.innerText.includes('per credit')`)
await shot(ws, 'credits')

ws.close()
chrome.kill()
console.log('done')
process.exit(0)