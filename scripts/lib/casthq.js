// HQ starts Void Cast by itself (Bryan, 24 Nov 2026, with a picture of HQ's Void Cast area saying "Void Cast is not running. Double-click
// Void Cast on the desktop": "i ned this remedied and changed so i donyt have to hunt fpor the app on my desktop[ to turn thi son]").
//
// Void Cast is Bryan's private film viewer, in its own folder beside this one (void-cast), with its own server on this PC only
// (127.0.0.1:8801). Its desktop icon runs scripts\open.vbs there: start "node server.js" with no window when it is not answering, wait
// until it answers, open it in Edge. start() below does the first two steps the same way, from HQ, and opens no window: HQ shows Void
// Cast in its own area. Nothing in the void-cast folder is changed; the server it starts is the same one the icon starts, it keeps
// running after HQ closes, and it stops when the PC restarts, as before. The same pattern as the motion editor (scripts/lib/promos.js).
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

let deps = {}; // { nodeBin, cache, dir?, port? } from hq.js; dir and port are set only by the tests
const init = (d) => { deps = d || {}; };
const dirNow = () => deps.dir || process.env.VOID_CAST_DIR || path.join(__dirname, '..', '..', '..', 'void-cast');
const portNow = () => +(deps.port || process.env.VOID_CAST_PORT || 8801);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Up only when it is Void Cast that answers on the port: its ping says { ok: true, app: "void-cast" }.
const ping = () => new Promise((ok) => {
  const q = http.get({ host: '127.0.0.1', port: portNow(), path: '/api/ping', timeout: 1500 }, (r) => {
    let d = ''; r.on('data', (c) => { d += c; });
    r.on('end', () => { try { const j = JSON.parse(d); ok(r.statusCode === 200 && !!j && j.app === 'void-cast'); } catch (e) { ok(false); } });
  });
  q.on('error', () => ok(false)); q.on('timeout', () => { q.destroy(); ok(false); });
});

async function status() { return { up: await ping(), port: portNow(), here: fs.existsSync(path.join(dirNow(), 'server.js')) }; }

async function start() {
  if (await ping()) return status();
  const dir = dirNow();
  if (!fs.existsSync(path.join(dir, 'server.js'))) throw new Error('Void Cast is not where HQ looks for it on this PC (' + dir + ').');
  fs.mkdirSync(deps.cache, { recursive: true });
  const fd = fs.openSync(path.join(deps.cache, 'void-cast-server.log'), 'a');
  const nb = deps.nodeBin();
  const child = spawn(nb.bin, [path.join(dir, 'server.js')], { cwd: dir, env: { ...nb.env, VOID_CAST_PORT: String(portNow()) }, detached: true, stdio: ['ignore', fd, fd], windowsHide: true });
  child.unref();
  try { fs.closeSync(fd); } catch (e) { /* the child holds its own copy */ }
  for (let i = 0; i < 40; i++) { await sleep(250); if (await ping()) return status(); }
  throw new Error('Void Cast did not start. Its last words are in catalog/cache/void-cast-server.log (the Jobs tab shows the cache folder).');
}

module.exports = { init, status, start };
