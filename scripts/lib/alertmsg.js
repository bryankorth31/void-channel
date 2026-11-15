// ALERT RULES: which doctor lights are worth telling Bryan about, and the message (B, 15 Nov 2026: "Yes, build those", the alert that
// comes to him). Found that day: the doctor had been red 21 nights running and nobody saw it, because the lights only show in HQ. So
// after the nightly doctor, scripts/alert.js sends one short message, and only when something needs him:
//   - any red light, every night until it is fixed;
//   - a yellow light that has stayed yellow on 3 nightly runs (one bad night is often gone the next);
//   - once, an "all clear" the first night after an alert when nothing needs him any more.
// Lights in the quiet list never alert (default: tv:schedule, which asks for more originals, a wish rather than a fault). Pure; tests in
// tests/alert.test.js. The state (when each light first left green, whether the last message was an alert) is kept by scripts/alert.js.

const YELLOW_HOURS = 47; // yellow on three runs of a daily pass: first seen at least two days ago
const DEFAULT_QUIET = ['tv:schedule'];

function decide(health, state, nowMs, quiet = DEFAULT_QUIET) {
  const prev = (state && state.since) || {};
  const since = {};
  const checks = (health && Array.isArray(health.checks)) ? health.checks : [];
  for (const c of checks) if (c.level !== 'green') since[c.id] = prev[c.id] || new Date(nowMs).toISOString();
  const mute = new Set(quiet);
  const needs = checks.filter((c) => !mute.has(c.id) && (c.level === 'red' || (c.level === 'yellow' && nowMs - Date.parse(since[c.id]) >= YELLOW_HOURS * 36e5)));
  const next = { since, alerted: needs.length > 0, at: new Date(nowMs).toISOString() };
  if (!needs.length) {
    if (state && state.alerted) return { send: true, kind: 'clear', title: 'VOIDtv: all clear', body: 'Nothing needs you. The lights that were red or yellow are fixed or quiet now. HQ > Overview has every light.', state: next };
    return { send: false, kind: 'none', state: next };
  }
  const reds = needs.filter((c) => c.level === 'red'), yellows = needs.filter((c) => c.level === 'yellow');
  const days = (c) => Math.max(0, Math.floor((nowMs - Date.parse(since[c.id])) / 864e5));
  const cut = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '...' : s; };
  const line = (c) => `${c.level.toUpperCase()} ${c.id}` + (days(c) ? ` (${days(c)} day${days(c) === 1 ? '' : 's'})` : '') + `: ${cut(c.msg, 180)}` + (c.fix ? `\n  Do: ${cut(c.fix, 260)}` : '');
  const parts = [];
  if (reds.length) parts.push(`${reds.length} red`);
  if (yellows.length) parts.push(`${yellows.length} yellow`);
  const body = [...reds, ...yellows].map(line).join('\n') + '\n\nHQ > Overview has every light; docs/RUNBOOK.md says what each one means and how to fix it by hand.';
  return { send: true, kind: reds.length ? 'red' : 'yellow', title: `VOIDtv needs you: ${parts.join(', ')}`, body, state: next };
}

module.exports = { decide, YELLOW_HOURS, DEFAULT_QUIET };
