import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(path.resolve(here, '../package.json'))
const WebSocket = require('ws')
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9333
const BASE = 'http://localhost:4175'
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(here, 'chrome-profile')}`, '--window-size=1680,1048', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let wsUrl
for (let i = 0; i < 40 && !wsUrl; i++) {
  try {
    const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json())
    wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl
  } catch {}
  if (!wsUrl) await sleep(400)
}
const ws = new WebSocket(wsUrl, { perMessageDeflate: false })
await new Promise((r) => ws.on('open', r))
let id = 0
const pending = new Map()
const logs = []
ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString())
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  if (m.method) logs.push('EVT ' + m.method + ' ' + JSON.stringify(m.params).slice(0,160));
  if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.type + ': ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300))
  if (m.method === 'Runtime.exceptionThrown') logs.push('EXC: ' + JSON.stringify(m.params.exceptionDetails).slice(0, 500))
  if (m.method === 'Fetch.requestPaused') {
    const url = m.params.request.url
    const local = url.startsWith(BASE) || url.startsWith('data:') || url.startsWith('blob:')
    send(local ? 'Fetch.continueRequest' : 'Fetch.failRequest', { requestId: m.params.requestId, ...(local ? {} : { errorReason: 'BlockedByClient' }) })
    if (!local) logs.push('BLOCKED ' + url.slice(0, 120))
  }
})
function send(method, params = {}) {
  return new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })) })
}
await send('Page.enable')
await send('Runtime.enable')
await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] })
const nav = await send('Page.navigate', { url: BASE + '/' + (process.argv[2] || 'login') });
logs.push('NAV ' + JSON.stringify(nav).slice(0,300));
await sleep(7000)
const r = await send('Runtime.evaluate', { expression: `JSON.stringify({text: document.body.innerText.slice(0,900), errs: window.__tourErrors, rootLen: (document.getElementById('root')||{}).innerHTML?.length})`, returnByValue: true })
console.log(r.result.result.value)
console.log('--- logs ---')
console.log(logs.slice(0, 40).join('\n'))
ws.close()
chrome.kill()
process.exit(0)