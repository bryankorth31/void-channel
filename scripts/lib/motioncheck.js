// Doctor probe for the motion editor (audit finding CF-005). Every request is harmless against an editor that has NOT been
// patched: the Host probe is a read, and the rest go to /api/theme/check, which only exists in the patched editor (an old
// editor answers 404 and the probe reports it). Nothing here ever posts to the route that saves a theme.
const http = require('http');

const send = (port, method, urlPath, headers, body) => new Promise((ok) => {
  const data = body == null ? '' : body;
  const req = http.request({ host: '127.0.0.1', port, path: urlPath, method, headers: { ...(data ? { 'content-length': Buffer.byteLength(data) } : {}), ...headers }, timeout: 4000 }, (res) => {
    res.resume();
    res.on('end', () => ok({ status: res.statusCode }));
  });
  req.on('timeout', () => { req.destroy(); ok({ error: 'timed out' }); });
  req.on('error', (e) => ok({ error: e.code || e.message }));
  req.end(data);
});

// probeMotion(port) -> { ok, detail, down? }. ok is true only when every refusal below happened and the good control passed.
async function probeMotion(port = 8221) {
  port = +port;
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { ok: false, detail: 'not a port: ' + port };
  const own = 'http://127.0.0.1:' + port;
  const json = { 'content-type': 'application/json', origin: own };
  const cases = [
    ['a foreign Host header', 'GET', '/api/spec', { host: 'evil.example' }, null, 403],
    ['a page from another port', 'POST', '/api/theme/check', { 'content-type': 'application/json', origin: 'http://127.0.0.1:1' }, '{}', 403],
    ['a text/plain body', 'POST', '/api/theme/check', { 'content-type': 'text/plain;x=application/json', origin: own }, '{}', 415],
    ['a colour containing "<"', 'POST', '/api/theme/check', json, '{"accent":"<"}', 400],
    ['a script tag as a colour', 'POST', '/api/theme/check', json, '{"accent":"</style><script src=//x/y></script>"}', 400],
    ['a font that is not in the list', 'POST', '/api/theme/check', json, '{"display":"x\'; } body { display: none"}', 400],
    ['a normal colour (control, must pass)', 'POST', '/api/theme/check', json, '{"accent":"#ff4fc8"}', 200],
  ];
  const answers = [];
  for (const [name, method, p, headers, body, want] of cases) answers.push({ name, want, ...(await send(port, method, p, headers, body)) });
  if (answers.every((a) => a.error === 'ECONNREFUSED')) return { ok: false, down: true, detail: 'nothing is listening on 127.0.0.1:' + port };
  const wrong = answers.filter((a) => a.status !== a.want);
  if (!wrong.length) return { ok: true, detail: 'motion editor on ' + port + ' refused a foreign Host, another port, text/plain and bad theme values' };
  return { ok: false, detail: 'motion editor on ' + port + ' answered wrongly: ' + wrong.map((a) => a.name + ' got ' + (a.status || a.error) + ', wanted ' + a.want).join('; ') };
}

module.exports = { probeMotion };
