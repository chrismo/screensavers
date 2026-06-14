#!/usr/bin/env node
// shot.mjs — no-deps headless-Chrome screenshot for the screensaver sketches.
// Loads a URL, collects console + uncaught exceptions + browser log errors via the
// DevTools Protocol, optionally evaluates an expression, then writes a PNG and
// prints a JSON report (consoleMsgs / exceptions / logErrors).
//
// Usage:
//   node tools/shot.mjs <url> <out.png> [waitMs] [evalExpr] [flags]
//
// [waitMs] = ms to wait after the page loads before capturing (default 2500). Bump it
//   for big extents so the static solve finishes — e.g. ~5000 at extent 1000.
//
// Flags (kept as --flags so the `node tools/shot.mjs` prefix stays allowlistable):
//   --size W,H      viewport size, forced exactly via CDP (default 1200,800); a square
//                   W=H gives a square field that fills the frame — bigger = more px/cell
//   --clip x,y,w,h  capture only this region, in CSS px measured from the TOP-LEFT of
//                   the image (0,0 = top-left, NOT the sketch's center; the spiral
//                   origin / cell 0,0 sits near the middle, ~W/2,H/2 full-window)
//   --scale N       device scale for the capture, e.g. 3 to zoom a --clip (default 1);
//                   output resolution only — does NOT shift clip coords (unlike --size)
//   --port N        remote-debugging port (default 9412)
//   --chrome <path> Chrome/Chromium binary (default: macOS Google Chrome)
//   --evalfile <p>  read the eval code from a file (real JS — loops/semicolons ok)
//                   instead of the inline [evalExpr] positional
//
// Examples:
//   node tools/shot.mjs "http://localhost:8000/knights/?nopanel=1" out.png
//   node tools/shot.mjs "http://localhost:8000/knights/" probe.png 1500 "console.log(VERSION)"
//   node tools/shot.mjs "http://localhost:8000/knights/?..." corner.png 3000 "" --size 3000,3000 --clip 2200,0,800,800 --scale 3
//
// evalExpr runs once after waitMs (probe state or drive the sketch). It must be a
// single expression — no statements/semicolons (wrap calls in a [a(), b()] array).

import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Split positionals from --flags (so the command prefix stays stable for allow rules).
const argv = process.argv.slice(2);

const USAGE = `usage: node tools/shot.mjs <url> <out.png> [waitMs] [evalExpr] [flags]

  [waitMs]        ms to wait after load before capturing (default 2500); bump it for
                  big extents so the static solve finishes — e.g. ~5000 at extent 1000
  [evalExpr]      a single JS expression run before capture (probe/drive the sketch)
  --size W,H      viewport size, forced exactly via CDP (default 1200,800); a square
                  W=H gives a square field that fills the frame — bigger = more px/cell
  --clip x,y,w,h  crop region in CSS px from the TOP-LEFT of the image (0,0 = top-left,
                  NOT the sketch's center; the spiral origin / cell 0,0 sits near the
                  middle, ~W/2,H/2 in a full-window render)
  --scale N       device scale for the capture, e.g. 3 to zoom a --clip (default 1);
                  output resolution only — does NOT shift clip coords (unlike --size)
  --port N        remote-debugging port (default 9412)
  --chrome <path> Chrome/Chromium binary
  --evalfile <p>  read eval code from a file (real JS) instead of [evalExpr]`;

if (argv.includes('-h') || argv.includes('--help')) { console.log(USAGE); process.exit(0); }

const flags = {};
const pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const eq = a.indexOf('=');
    if (eq >= 0) { flags[a.slice(2, eq)] = a.slice(eq + 1); }
    else { flags[a.slice(2)] = argv[i + 1]; i += 1; }
  } else { pos.push(a); }
}
const [url, outPng, waitMsArg, evalExpr] = pos;
if (!url || !outPng) { console.error(USAGE); process.exit(1); }
const waitMs = Number(waitMsArg || 2500);
const PORT = Number(flags.port || 9412);
const SIZE = flags.size || '1200,800';
const CLIP = flags.clip;                 // "x,y,w,h" CSS px
const SCALE = Number(flags.scale || 1);
const CHROME = flags.chrome || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// Fresh throwaway profile per run: a shared profile leaks cached state between runs
// (stale page/console), which can quietly contaminate a capture. Cleaned up on exit.
const profileDir = join(tmpdir(), `screensavers-shot-${process.pid}-${Date.now()}`);
// Forced viewport: headless --window-size is unreliable (window chrome eats height, and
// the inner size can be clamped), so the layout viewport ends up non-square and smaller
// than asked — which shifts every cell→pixel mapping and breaks saved --clip coords
// across Chrome versions. Override the metrics below so the viewport is EXACTLY W×H.
const [VW, VH] = SIZE.split(',').map(Number);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  '--force-device-scale-factor=1', `--window-size=${SIZE}`,
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profileDir}`,
  'about:blank',
], { stdio: 'ignore' });

let wsUrl = null;
for (let i = 0; i < 60; i++) {
  await sleep(250);
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json`);
    const targets = await r.json();
    const page = targets.find((t) => t.type === 'page');
    if (page?.webSocketDebuggerUrl) { wsUrl = page.webSocketDebuggerUrl; break; }
  } catch (e) { /* not up yet */ }
}
if (!wsUrl) { console.error('could not reach Chrome devtools'); chrome.kill('SIGKILL'); process.exit(2); }

const ws = new WebSocket(wsUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((resolve) => {
  const mid = ++id;
  pending.set(mid, resolve);
  ws.send(JSON.stringify({ id: mid, method, params }));
});

const consoleMsgs = [], exceptions = [], logErrors = [];

await new Promise((res) => { ws.onopen = res; });
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); return; }
  if (msg.method === 'Runtime.consoleAPICalled') {
    const text = (msg.params.args || []).map((a) => a.value ?? a.description ?? a.unserializableValue ?? '').join(' ');
    consoleMsgs.push(`[${msg.params.type}] ${text}`);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    const frames = (d.stackTrace?.callFrames || []).slice(0, 4)
      .map((f) => `${f.functionName || '(anon)'}@${(f.url || '').split('/').pop()}:${f.lineNumber + 1}`);
    exceptions.push((d.exception?.description || d.text || '') + (frames.length ? ' | ' + frames.join(' < ') : ''));
  } else if (msg.method === 'Log.entryAdded') {
    const e = msg.params.entry;
    if (e.level === 'error') logErrors.push(`[${e.source}] ${e.text}`);
  }
};

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
// Pin the layout viewport to exactly W×H (independent of window chrome / Chrome version)
// so a square --size gives a square viewport and saved --clip coords stay reproducible.
await send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
await sleep(waitMs);

const evalCode = flags.evalfile ? readFileSync(flags.evalfile, 'utf8') : evalExpr;
if (evalCode) {
  await send('Runtime.evaluate', { expression: evalCode });
  await sleep(120); // let one frame draw after the eval
}

let clip;
if (CLIP) {
  const [x, y, w, h] = CLIP.split(',').map(Number);
  clip = { x, y, width: w, height: h, scale: SCALE };
}
const shot = await send('Page.captureScreenshot', clip ? { format: 'png', clip } : { format: 'png' });
if (shot?.data) writeFileSync(outPng, Buffer.from(shot.data, 'base64'));

console.log(JSON.stringify({ url, outPng, wrotePng: !!shot?.data, consoleMsgs, exceptions, logErrors }, null, 2));

ws.close();
chrome.kill('SIGKILL');
await sleep(200);
try { rmSync(profileDir, { recursive: true, force: true }); } catch { /* best effort */ }
process.exit(0);
