// The page's one JSON loader (audit SP-006, SP-043).
//
// Why it exists: Cloudflare Pages answers a path it does not have with the home page and status 200, and the
// password gate answers every request with its own page once the cookie runs out. A plain fetch(...).json()
// then either throws on HTML or hangs the page for good. This function never hands back anything but parsed
// JSON, and when it cannot it throws one typed error the page can turn into a card.
//
// app.js inlines fetchJsonSource into the page, so the very same code runs in the browser and in
// tests/app-fetch.test.js (with a fake fetch). It must stay one self-contained function: no outside names
// except the browser globals fetch, setTimeout, clearTimeout and AbortController, and no line comments after
// code (scripts/site.js refuses a page whose script has them).
//
//   const data = await fetchJson(url, { check, tries, pause, timeout, fetch });
//
//   check    optional (data) => truthy when the data has the shape the caller needs; false counts as a parse failure
//   tries    how many attempts in all (default 2: one retry)
//   pause    ms to wait before a retry (default 600)
//   timeout  ms to give each attempt before calling it a network failure (default 15000)
//   fetch    a replacement for the global fetch (tests)
//
// The error it throws has: name 'FetchJsonError', kind, url, status (when there was an answer), gate.
//   kind 'html'     the answer was a web page: the home-page fallback for a missing file, or the password gate
//   kind 'network'  no answer, a timeout, a cut-off body, or an HTTP error status that was not a page
//   kind 'parse'    the body was not JSON, or not the shape check() wanted
//   gate            true when the page looks like the password gate (status 401, or a password field in the page)
async function fetchJson(url, o) {
  o = o || {};
  const doFetch = o.fetch || fetch;
  const tries = o.tries || 2;
  const pause = o.pause == null ? 600 : o.pause;
  const limit = o.timeout || 15000;
  const fail = (kind, msg, extra) => Object.assign(new Error(msg), { name: 'FetchJsonError', kind: kind, url: url }, extra || {});
  const read = async (n, ctl) => {
    const init = {};
    if (ctl) init.signal = ctl.signal;
    if (n > 0) init.cache = 'reload';
    let r;
    try { r = await doFetch(url, init); } catch (x) { throw fail('network', 'no answer from ' + url + ': ' + ((x && x.message) || x)); }
    const status = r.status;
    const type = String((r.headers && r.headers.get && r.headers.get('content-type')) || '').toLowerCase();
    let text;
    try { text = await r.text(); } catch (x) { throw fail('network', 'the answer from ' + url + ' was cut off', { status: status }); }
    if (type.indexOf('html') >= 0 || /^\s*<(!doctype|html|head|body)/i.test(text)) {
      throw fail('html', 'a web page came back instead of data from ' + url + ' (status ' + status + ')', { status: status, gate: status === 401 || /type=["']?password/i.test(text) });
    }
    if (!r.ok) throw fail('network', 'status ' + status + ' from ' + url, { status: status });
    let data;
    try { data = JSON.parse(text); } catch (x) { throw fail('parse', 'not valid JSON from ' + url, { status: status }); }
    if (o.check && !o.check(data)) throw fail('parse', 'unexpected shape of data from ' + url, { status: status });
    return data;
  };
  let last = null;
  for (let n = 0; n < tries; n++) {
    if (n > 0 && pause) await new Promise((done) => setTimeout(done, pause));
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    let timer = null;
    const clock = new Promise((resolve, stop) => { timer = setTimeout(() => { if (ctl) ctl.abort(); stop(fail('network', 'no answer from ' + url + ' in ' + limit + ' ms')); }, limit); });
    try { return await Promise.race([clock, read(n, ctl)]); } catch (e) { last = e && e.kind ? e : fail('network', 'could not read ' + url + ': ' + ((e && e.message) || e)); } finally { clearTimeout(timer); }
  }
  throw last;
}

module.exports = { fetchJson, fetchJsonSource: fetchJson.toString().replace(/\r\n/g, '\n') };
