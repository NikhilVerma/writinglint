#!/usr/bin/env node

const endpoint = process.argv[2] ?? 'http://127.0.0.1:9222';
const deadline = Date.now() + Number(process.env.SMOKE_TIMEOUT_MS ?? 60_000);

async function target() {
  const response = await fetch(`${endpoint}/json`);
  if (!response.ok) throw new Error(`DevTools endpoint returned ${response.status}`);
  const pages = await response.json();
  return pages.find((page) => page.type === 'page' && page.webSocketDebuggerUrl);
}

let page;
while (!page && Date.now() < deadline) {
  try { page = await target(); } catch {}
  if (!page) await new Promise((resolve) => setTimeout(resolve, 250));
}
if (!page) throw new Error('No browser page appeared at the DevTools endpoint.');

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let id = 0;
const pending = new Map();
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data);
  if (!message.id) return;
  pending.get(message.id)?.(message);
  pending.delete(message.id);
});
const send = (method, params = {}) => new Promise((resolve) => {
  const messageId = ++id;
  pending.set(messageId, resolve);
  socket.send(JSON.stringify({ id: messageId, method, params }));
});

await send('Runtime.enable');
const expression = `JSON.stringify({
  loading: document.querySelector('#bw-loading')?.className,
  message: document.querySelector('#bw-loadmsg')?.textContent,
  problems: document.querySelector('#bw-count')?.textContent,
  diagnostics: document.querySelectorAll('.bw-diag').length,
  textLength: document.querySelector('#bw-input')?.value.length
})`;

let state;
while (Date.now() < deadline) {
  const response = await send('Runtime.evaluate', { expression, returnByValue: true });
  state = JSON.parse(response.result.result.value);
  if (state.loading?.includes('done') || state.loading?.includes('error')) break;
  await new Promise((resolve) => setTimeout(resolve, 500));
}

socket.close();
console.log(JSON.stringify(state, null, 2));
if (!state?.loading?.includes('done') || state.diagnostics < 1 || state.textLength < 1) process.exitCode = 1;
