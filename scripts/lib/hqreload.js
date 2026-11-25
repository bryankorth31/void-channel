// HQ reloads itself after an update (Bryan, 24 Nov 2026: "Yes, build it").
//
// HQ is a page and a server program behind it. The page is read from the disk every time it is opened; the server program keeps
// the code it started with. So when a chat pushed a change to HQ, the page was new and the server was old until something restarted
// it: on 24 Nov the Void Cast area asked the server to start Void Cast and the old server answered "not found". Closing and opening
// HQ's window does not restart the server, and Bryan should not need a command for it.
//
// This file lets a running HQ see that the code it loaded is no longer the code on the disk, and hand over to a fresh copy of
// itself:
//   check()      which of the files this process loaded (under scripts/) have changed on disk since it loaded them
//   canReload()  whether a hand-over is safe now: not while a job HQ started is still running (its ending would be lost), not
//                when the new code does not even load (HQ keeps running the old code and says why), not inside the desktop app
//   reload()     stop answering, start "node scripts/hq.js" again with the same arguments (no window, detached), and leave
// hq.js calls check() when its page is opened and hands over before the page is drawn, so an opened HQ always runs today's code.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const hashOf = (f) => { try { return crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex'); } catch (e) { return 'gone'; } };
const statOf = (f) => { try { const s = fs.statSync(f); return s.size + ':' + Math.round(s.mtimeMs); } catch (e) { return 'gone'; } };

// o: root (the repo folder), entry (scripts/hq.js), args (what it was started with), nodeBin (), log (a file for the new copy's
// first words), busy () -> true while a job HQ started still runs, loaded () -> the files to watch (default: what this process
// has loaded from <root>/scripts), exit (code) (default process.exit; the tests pass their own).
function create(o) {
  const base = path.join(o.root, 'scripts') + path.sep;
  const loaded = o.loaded || (() => Object.keys(require.cache).filter((f) => f.startsWith(base) && !f.includes(path.sep + 'node_modules' + path.sep)));
  const seen = new Map(); // file -> { stat, hash } as it was when this process was first seen to have it
  const look = () => { for (const f of loaded()) if (!seen.has(f)) seen.set(f, { stat: statOf(f), hash: hashOf(f) }); };
  look();
  let last = { at: 0, out: { stale: false, files: [] } };

  // Changed means the bytes differ: a file that was only touched (same content, new time) is not a change.
  function check(now = Date.now()) {
    if (now - last.at < 2000) return last.out;
    look();
    const files = [];
    for (const [f, was] of seen) {
      const st = statOf(f);
      if (st === was.stat) continue;
      if (hashOf(f) === was.hash) { was.stat = st; continue; }
      files.push(path.relative(o.root, f).replace(/\\/g, '/'));
    }
    last = { at: now, out: { stale: files.length > 0, files: files.sort() } };
    return last.out;
  }

  // Does the code on disk load at all? A fresh process requires the entry file (which does not start a server when required) and
  // must end cleanly. A change that breaks HQ must never take the running HQ down with it.
  function loads() {
    const nb = o.nodeBin();
    const r = spawnSync(nb.bin, ['-e', 'require(process.argv[1])', o.entry], { cwd: o.root, env: nb.env, timeout: 30000, windowsHide: true, encoding: 'utf8' });
    if (r.status === 0) return { ok: true };
    const words = String(r.stderr || (r.error && r.error.message) || 'it did not finish loading').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return { ok: false, error: (words.find((l) => /Error/.test(l)) || words[0] || 'it did not load').slice(0, 300) };
  }

  function canReload() {
    if (o.inApp) return { ok: false, why: 'this HQ runs inside the VOIDtv HQ app: quit the app from its tray icon and open it again' };
    if (o.busy && o.busy()) return { ok: false, why: 'a job HQ started is still running; HQ loads its new code when you open it after the job ends' };
    const l = loads();
    if (!l.ok) return { ok: false, why: 'the new code does not load, so HQ keeps running the old code (' + l.error + ')', broken: true };
    return { ok: true };
  }

  // Hand over: stop answering, start the fresh copy, leave. The fresh copy waits for the port (HQ_RELOADED, see start() in hq.js).
  let going = false;
  function reload(server) {
    if (going) return; going = true;
    const nb = o.nodeBin();
    let fd = 'ignore';
    try { fs.mkdirSync(path.dirname(o.log), { recursive: true }); fd = fs.openSync(o.log, 'a'); } catch (e) { /* no log, still hand over */ }
    let sent = false;
    const go = () => {
      if (sent) return; sent = true;
      const child = spawn(nb.bin, [o.entry, ...(o.args || [])], { cwd: o.root, env: { ...nb.env, HQ_RELOADED: '1' }, detached: true, stdio: ['ignore', fd, fd], windowsHide: true });
      child.unref();
      setTimeout(() => (o.exit || process.exit)(0), 150);
    };
    try { server.close(go); if (server.closeAllConnections) server.closeAllConnections(); } catch (e) { go(); }
    setTimeout(go, 1500); // a connection that will not close must not keep the old HQ alive
  }

  return { check, loads, canReload, reload, state: () => { const c = check(); if (!c.stale) return { stale: false, files: [] }; const can = canReload(); return { stale: true, files: c.files, canReload: can.ok, why: can.why || '' }; } };
}

// The page a browser gets while HQ hands over: it waits for the fresh HQ to answer, then loads it. No address but HQ's own.
const WAIT_PAGE = '<!doctype html><meta charset="utf-8"><title>VOIDtv HQ</title><body style="margin:0;background:#07080c;color:#e9ecf5;font:16px system-ui,Segoe UI,sans-serif;display:grid;place-items:center;height:100vh">'
  + '<div style="text-align:center"><b style="font-size:20px">HQ is loading its new code</b><p style="color:#9aa3b8">A moment. This page opens HQ by itself.</p></div>'
  + '<script>let n=0;const t=setInterval(async()=>{n++;try{const r=await fetch("/api/reload",{cache:"no-store"});if(r.ok){const j=await r.json();if(!j.stale||!j.canReload||n>4){clearInterval(t);location.replace(location.href)}}}catch(e){}if(n>60){clearInterval(t);document.querySelector("p").textContent="HQ did not come back. Its last words are in catalog/cache/hq-reload.log."}},700)</script>';

module.exports = { create, WAIT_PAGE };
