// HQ GUARD PROBE: asks a running HQ whether it still refuses what it must refuse (audit finding CF-004). It is meant to be
// called by the doctor's "local-servers" check; until that hook is added to scripts/doctor.js only the tests call it. Every
// probe goes to POST /api/ping, a route that does nothing, so a probe is harmless
// even when the guard it tests is broken. None of the three carries HQ's token, and each should be turned away for its own reason:
//   1. a page from another port (Origin http://127.0.0.1:1)               -> 403
//   2. a text/plain body that only mentions application/json              -> 415
//   3. a well-formed JSON call from HQ's own page address but no token    -> 401
// An HQ started before the CF-004 fix answers 404 to all three (it has no /api/ping), so the check goes red until HQ is
// restarted from the current scripts/hq.js. This module only talks to 127.0.0.1 and needs no secrets.
const http = require('http');

const post = (port, headers) => new Promise((ok) => {
  const req = http.request({ host: '127.0.0.1', port, path: '/api/ping', method: 'POST', headers: { 'content-length': 2, ...headers }, timeout: 4000 }, (res) => {
    res.resume();
    res.on('end', () => ok({ status: res.statusCode }));
  });
  req.on('timeout', () => { req.destroy(); ok({ error: 'timed out' }); });
  req.on('error', (e) => ok({ error: e.code || e.message }));
  req.end('{}');
});

// probe(port) -> { ok, detail, down? }. ok is true only when all three were refused with the right codes.
// down is true when nothing is listening on the port (HQ is not running; there is nothing to check).
async function probe(port) {
  port = +port;
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { ok: false, detail: 'not a port: ' + port };
  const own = 'http://127.0.0.1:' + port;
  const cases = [
    ['a page from another port', { origin: 'http://127.0.0.1:1', 'content-type': 'application/json' }, 403],
    ['a text/plain body', { origin: own, 'content-type': 'text/plain;x=application/json' }, 415],
    ['a call without the token', { origin: own, 'content-type': 'application/json' }, 401],
  ];
  const answers = [];
  for (const [name, headers, want] of cases) answers.push({ name, want, ...(await post(port, headers)) });
  if (answers.every((a) => a.error === 'ECONNREFUSED')) return { ok: false, down: true, detail: 'nothing is listening on 127.0.0.1:' + port };
  const wrong = answers.filter((a) => a.status !== a.want);
  if (!wrong.length) return { ok: true, detail: 'HQ on ' + port + ' refused another port (403), a text/plain body (415) and a call without the token (401)' };
  return { ok: false, detail: 'HQ on ' + port + ' did not refuse: ' + wrong.map((a) => a.name + ' got ' + (a.status || a.error) + ', wanted ' + a.want).join('; ') };
}

module.exports = { probe };
