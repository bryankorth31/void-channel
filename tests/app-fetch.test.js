// The show page's JSON loader (audit SP-006, SP-043). Run: node --test tests/app-fetch.test.js
// Everything here uses a fake fetch: no network, no browser. The same function text that goes into the page
// (scripts/lib/app-fetch.js, fetchJsonSource) is also run inside a bare vm context that has only the browser globals
// it may use, which proves the inlined copy does not lean on anything in the module.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { fetchJson, fetchJsonSource } = require('../scripts/lib/app-fetch');

const GATE = '<!doctype html><html><head><title>VOIDtv</title></head><body><form method="post"><input type="password" name="p"><button>enter</button></form></body></html>';
const HOME = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>VOIDtv</title></head><body><main id="main"></main></body></html>';

// A response like the browser's: ok, status, headers.get, text().
const reply = (status, type, body) => ({ ok: status >= 200 && status < 300, status, headers: { get: (k) => (String(k).toLowerCase() === 'content-type' ? type : null) }, text: async () => body });
// A fetch that answers from a script of replies (a function is called, a thrown/rejected value is a network failure) and records its calls.
const script = (...steps) => { const calls = []; const f = async (url, init) => { calls.push({ url, init }); const s = steps[Math.min(calls.length - 1, steps.length - 1)]; if (s instanceof Error) throw s; return typeof s === 'function' ? s(url, init) : s; }; f.calls = calls; return f; };
const fast = (f, extra) => Object.assign({ fetch: f, pause: 0 }, extra || {});

test('good JSON comes back parsed after one request', async () => {
  const f = script(reply(200, 'application/json', '{"slug":"a","seasons":[{"season":1,"episodes":[{"n":1}]}]}'));
  const d = await fetchJson('/data/shows/a.json', fast(f));
  assert.equal(d.slug, 'a');
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, '/data/shows/a.json');
  assert.equal(f.calls[0].init.cache, undefined, 'the first try may use the browser cache');
});

test('the home page with status 200 (what Pages sends for a missing file) is an html failure, tried twice', async () => {
  const f = script(reply(200, 'text/html; charset=utf-8', HOME));
  await assert.rejects(fetchJson('/data/shows/zz-check.json', fast(f)), (e) => {
    assert.equal(e.name, 'FetchJsonError');
    assert.equal(e.kind, 'html');
    assert.equal(e.status, 200);
    assert.equal(e.gate, false, 'the home page is not the password gate');
    assert.equal(e.url, '/data/shows/zz-check.json');
    return true;
  });
  assert.equal(f.calls.length, 2, 'one try and one retry, no more');
  assert.equal(f.calls[1].init.cache, 'reload', 'the retry skips the browser cache');
});

test('the password gate (expired cookie) is an html failure marked gate, whether it answers 401 or 200', async () => {
  const f401 = script(reply(401, 'text/html; charset=utf-8', GATE));
  await assert.rejects(fetchJson('/data/shows/a.json', fast(f401)), (e) => e.kind === 'html' && e.gate === true && e.status === 401);
  const f200 = script(reply(200, 'text/html', GATE));
  await assert.rejects(fetchJson('/data/shows/a.json', fast(f200)), (e) => e.kind === 'html' && e.gate === true && e.status === 200);
});

test('a page with the wrong content type is still caught by its first characters', async () => {
  const f = script(reply(200, 'text/plain', '  <!DOCTYPE html><html></html>'));
  await assert.rejects(fetchJson('/x.json', fast(f)), (e) => e.kind === 'html');
});

test('a network failure is retried once; a second failure is thrown as kind network', async () => {
  const f = script(new TypeError('Failed to fetch'));
  await assert.rejects(fetchJson('/x.json', fast(f)), (e) => e.kind === 'network' && /Failed to fetch/.test(e.message));
  assert.equal(f.calls.length, 2);
});

test('the single retry can succeed: a failure and then good JSON returns the data', async () => {
  const f = script(new TypeError('Failed to fetch'), reply(200, 'application/json', '{"ok":1}'));
  assert.deepEqual(await fetchJson('/x.json', fast(f)), { ok: 1 });
  assert.equal(f.calls.length, 2);
  const g = script(reply(200, 'text/html', HOME), reply(200, 'application/json', '[1,2]'));
  assert.deepEqual(await fetchJson('/y.json', fast(g)), [1, 2], 'a stale page from the cache is fixed by the retry');
});

test('an error status that is not a page is kind network and keeps the status', async () => {
  const f = script(reply(500, 'application/json', '{"error":"boom"}'));
  await assert.rejects(fetchJson('/x.json', fast(f)), (e) => e.kind === 'network' && e.status === 500);
  assert.equal(f.calls.length, 2);
});

test('a body that is not JSON is kind parse', async () => {
  const f = script(reply(200, 'application/json', '{"seasons": [1,'));
  await assert.rejects(fetchJson('/x.json', fast(f)), (e) => e.kind === 'parse');
  assert.equal(f.calls.length, 2);
});

test('JSON of the wrong shape (check says no) is kind parse, and check can pass on the retry', async () => {
  const check = (d) => !!d && Array.isArray(d.seasons) && d.seasons.length > 0;
  const f = script(reply(200, 'application/json', 'null'));
  await assert.rejects(fetchJson('/x.json', fast(f, { check })), (e) => e.kind === 'parse');
  const g = script(reply(200, 'application/json', '{"seasons":[]}'), reply(200, 'application/json', '{"seasons":[{}]}'));
  assert.deepEqual(await fetchJson('/y.json', fast(g, { check })), { seasons: [{}] });
});

test('a body that is cut off is kind network', async () => {
  const cut = { ok: true, status: 200, headers: { get: () => 'application/json' }, text: async () => { throw new TypeError('network error'); } };
  const f = script(cut);
  await assert.rejects(fetchJson('/x.json', fast(f)), (e) => e.kind === 'network');
});

test('a fetch that never answers is given up on after the time limit (kind network), and its request is aborted', async () => {
  const f = script((url, init) => new Promise(() => {}));
  const t0 = Date.now();
  await assert.rejects(fetchJson('/x.json', fast(f, { timeout: 30 })), (e) => e.kind === 'network' && /in 30 ms/.test(e.message));
  assert.ok(Date.now() - t0 < 3000);
  assert.equal(f.calls.length, 2);
  assert.ok(f.calls.every((c) => c.init.signal && c.init.signal.aborted), 'each timed-out request was aborted');
});

test('a reply that is not an object at all (a broken fetch) still ends as a typed error', async () => {
  const f = script(undefined);
  await assert.rejects(fetchJson('/x.json', fast(f)), (e) => e.name === 'FetchJsonError' && e.kind === 'network');
});

test('the text inlined into the page runs on its own, with only the browser globals', async () => {
  const f = script(reply(200, 'text/html', GATE));
  const ctx = vm.createContext({ fetch: f, setTimeout, clearTimeout, AbortController });
  const inlined = vm.runInContext('(' + fetchJsonSource + ')', ctx);
  await assert.rejects(inlined('/data/shows/a.json', { pause: 0 }), (e) => e.kind === 'html' && e.gate === true);
  assert.equal(f.calls.length, 2, 'it used the global fetch it was given');
  const g = script(reply(200, 'application/json', '{"a":1}'));
  const ctx2 = vm.createContext({ fetch: g, setTimeout, clearTimeout, AbortController });
  const got = await vm.runInContext('(' + fetchJsonSource + ')', ctx2)('/x.json');
  assert.equal(JSON.stringify(got), '{"a":1}');
});

test('the inlined text has no line comment after code and no end-of-script tag (scripts/site.js refuses a page that does)', () => {
  const stripped = (l) => l.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g, '');
  const bad = fetchJsonSource.split('\n').filter((l) => { const s = stripped(l); return !/^\s*\/\//.test(s) && /[^:]\/\//.test(s); });
  assert.deepEqual(bad, []);
  assert.ok(!/<\/script/i.test(fetchJsonSource));
  assert.ok(!fetchJsonSource.includes('\r'));
});
