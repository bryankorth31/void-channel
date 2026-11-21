// The phone controller's health check, for the doctor's "phones" light (docs/RUNBOOK.md). Bryan, 17 Oct 2026: every check
// must be one he can run from HQ "in the event of no lm access"; and 21 Nov 2026, on phones as game pads: "my overall
// desire of having these fully functional and working". What broke before, each of which this watches for:
// - the relay dropped a pad's messages past its limit in silence, and a dropped release left a button held (20 Nov 2026);
// - the room did not come back to the next page, and a phone connected on the shelf was lost when a game opened (21 Nov).
// It plays both parts itself against the live relay: a screen opens a game-pad room, a phone joins, the phone says 100
// states at 50 a second (the fastest the pad page ever speaks), the screen leaves and takes the room back as its next
// page would. No browser, no outside package, nothing kept. The direct phone-to-screen link is between two browsers on
// one Wi-Fi and cannot be checked from here: the pad's own top line says Direct or Relay (see the runbook).
'use strict';

const WAIT_MS = 8000;      // how long to wait for the relay to answer one step
const STATES = 100, GAP_MS = 20;
const SLOW_MS = 150;       // typical delay past this is worth a yellow
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One socket with what it heard kept in order, and a way to wait for a message.
function sock(url, origin) {
  return new Promise((ok) => {
    let ws;
    try { ws = new WebSocket(url, { headers: { origin } }); } catch (e) { return ok({ error: String(e.message || e) }); }
    const heard = [], waiting = [];
    const s = { ws, heard, closed: null, close() { try { ws.close(); } catch (e) { /* gone */ } },
      send(m) { try { ws.send(JSON.stringify(m)); } catch (e) { /* gone */ } },
      // The first message, from now on or already heard and not yet taken, that fits.
      next(fits, ms) {
        return new Promise((done) => {
          const i = heard.findIndex((m) => !m.taken && fits(m));
          if (i >= 0) { heard[i].taken = true; return done(heard[i]); }
          const w = { fits, done, t: setTimeout(() => { waiting.splice(waiting.indexOf(w), 1); done(null); }, ms === undefined ? WAIT_MS : ms) };
          waiting.push(w);
        });
      } };
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch (x) { return; }
      m.at = performance.now(); heard.push(m);
      const w = waiting.find((x) => x.fits(m));
      if (w) { m.taken = true; clearTimeout(w.t); waiting.splice(waiting.indexOf(w), 1); w.done(m); }
    };
    ws.onopen = () => ok(s);
    ws.onerror = () => ok({ error: 'the relay refused the connection' });
    ws.onclose = (e) => { s.closed = e.code; for (const w of waiting.splice(0)) { clearTimeout(w.t); w.done(null); } };
    setTimeout(() => ok({ error: 'the relay did not answer in ' + WAIT_MS / 1000 + ' s' }), WAIT_MS);
  });
}

// Run the check against a site (https://voidtv.net, or the local PLAY server). Answers plain numbers; classify() words them.
async function phoneCheck(site, opts) {
  const o = opts || {};
  const r = { site, opened: false, joined: false, sent: 0, arrived: 0, lost: null, least: null, median: null, most: null, handover: null, why: '' };
  if (typeof WebSocket === 'undefined') { r.why = 'this Node has no WebSocket of its own (Node 22 or newer has)'; r.cannot = true; return r; }
  const origin = site.replace(/\/+$/, ''), base = origin.replace(/^http/, 'ws');
  const open = [];
  try {
    const screen = await sock(base + '/api/room/open?kind=pad', origin);
    if (screen.error) { r.why = screen.error; return r; }
    open.push(screen);
    const room = await screen.next((m) => m.type === 'room');
    if (!room) { r.why = screen.closed ? 'the relay closed the screen\'s connection (code ' + screen.closed + ')' : 'the relay opened no room'; return r; }
    r.opened = true;
    const token = 'doctor' + Date.now().toString(36) + Math.random().toString(36).slice(2, 14).padEnd(12, '0');
    const phone = await sock(base + '/api/room/' + room.code + '/join?t=' + token, origin);
    if (phone.error) { r.why = 'a phone could not join: ' + phone.error; return r; }
    open.push(phone);
    const hello = await phone.next((m) => m.type === 'hello');
    if (!hello || !(await screen.next((m) => m.type === 'join'))) { r.why = 'a phone joined but the relay did not seat it'; return r; }
    r.joined = true;
    // 100 states at 50 a second; each carries its number, so the delay of each is its own.
    const sentAt = [];
    for (let i = 0; i < (o.states || STATES); i++) { sentAt[i] = performance.now(); phone.send({ type: 'pad', b: i % 2, n: i, v: 2 }); r.sent++; await sleep(GAP_MS); }
    await sleep(1500);
    const delays = screen.heard.filter((m) => m.msg && m.msg.type === 'pad' && Number.isInteger(m.msg.n)).map((m) => m.at - sentAt[m.msg.n]).sort((a, b) => a - b);
    r.arrived = delays.length; r.lost = r.sent - r.arrived;
    if (delays.length) { r.least = Math.round(delays[0]); r.median = Math.round(delays[delays.length >> 1]); r.most = Math.round(delays[delays.length - 1]); }
    // The screen goes to its next page: the room must wait for it and come back with the phone still in its seat.
    if (room.key) {
      screen.close();
      r.handover = false;
      if (await phone.next((m) => m.type === 'host-away')) {
        for (let n = 0; n < 8 && !r.handover; n++) {
          const next = await sock(base + '/api/room/open?kind=pad&code=' + room.code + '&key=' + encodeURIComponent(room.key), origin);
          if (next.error) { await sleep(400); continue; }
          open.push(next);
          const back = await next.next((m) => m.type === 'room', 3000);
          if (back && back.back && (await next.next((m) => m.type === 'join' && m.from === hello.seat, 3000)) && (await phone.next((m) => m.type === 'host-back', 3000))) r.handover = true;
          else { next.close(); await sleep(400); }
        }
      }
    }
  } catch (e) { r.why = String(e.message || e).split('\n')[0].slice(0, 120); }
  finally { for (const s of open) s.close(); }
  return r;
}

// Pure (tested): the light and its words from the numbers. The fix is always something Bryan can do by hand.
const DEPLOY = 'In your own terminal: cd play/rooms/worker, then npx wrangler deploy (the voidtv-rooms Worker; in Cloudflare the Pages project must have it bound as ROOMS).';
function classify(r) {
  if (r.cannot) return { level: 'yellow', msg: 'the phone controller check could not run: ' + r.why, fix: 'Update Node on this PC to 22 or newer, then run the doctor again.' };
  if (!r.opened || !r.joined) return { level: 'red', msg: 'phones cannot connect to a game: ' + (r.why || 'the relay did not answer'),
    fix: 'The Phone controller button will show no code, or a code no phone can join. Run the doctor once more in a minute (one miss can be the network). If it stays red, put the relay back. ' + DEPLOY };
  const speed = r.median === null ? '' : `${r.median} ms typical (${r.least} to ${r.most})`;
  if (r.lost > 0) return { level: 'yellow', msg: `the relay dropped ${r.lost} of ${r.sent} pad states at 50 a second` + (speed ? '; ' + speed : ''),
    fix: 'The relay on the live site is older than the site (a game pad is allowed 60 a second). A dropped state heals within a second, but a held button can stick that long. ' + DEPLOY };
  if (r.handover === false) return { level: 'yellow', msg: `the room did not come back to the next page: a phone connected on the shelf is lost when a game opens (${r.arrived} of ${r.sent} states arrived, ${speed})`,
    fix: 'Phones still work when connected from the game page itself (its Phone controller button). To mend the hand-over, deploy the relay again. ' + DEPLOY };
  if (r.median !== null && r.median > SLOW_MS) return { level: 'yellow', msg: `the relay is slow from this PC: ${speed}; ${r.arrived} of ${r.sent} states arrived`,
    fix: 'This is the trip from this PC to Cloudflare and back; run the doctor again in a few minutes. A phone on the same Wi-Fi as the screen uses its direct link and is not slowed by it: the pad\'s top line then says Direct.' };
  return { level: 'green', msg: `a room opened, a phone joined, ${r.arrived} of ${r.sent} pad states arrived at 50 a second, ${speed}` + (r.handover ? ', and the room came back to the next page' : '') };
}

module.exports = { phoneCheck, classify, STATES, SLOW_MS };

if (require.main === module) {
  // node scripts/lib/phonecheck.js [site]   the same check by hand, with its numbers
  phoneCheck(process.argv[2] || 'https://voidtv.net').then((r) => { const c = classify(r); console.log(c.level + '  ' + c.msg + (c.fix ? '\n  -> ' + c.fix : '')); console.log(JSON.stringify(r)); process.exit(c.level === 'red' ? 1 : 0); });
}
