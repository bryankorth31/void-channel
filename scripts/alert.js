// ALERT: after the nightly doctor, tell Bryan when something needs him (B, 15 Nov 2026: "Yes, build those"). The rules are in
// scripts/lib/alertmsg.js: any red, a yellow that stayed three nights, one "all clear" after an alert; nothing on a quiet night.
//   node scripts/alert.js           decide from catalog/cache/health.json and send (the nightly runs this right after the doctor)
//   node scripts/alert.js --dry     print what would be sent; sends nothing, remembers nothing
//   node scripts/alert.js --test    send one test message through every channel that is on
// Where it goes:
//   - catalog/cache/alert.txt holds the latest message (HQ and anyone can read it), alert.log keeps every one sent;
//   - a Windows notification on this PC (it waits in the notification center if nobody is at the screen);
//   - your phone, only once you turn it on: VOID_ALERT_NTFY=https://ntfy.sh/<your-own-topic> in backend/.env, and the free ntfy app on the
//     phone subscribed to the same topic. Off until then; nothing leaves this PC.
// Settings in backend/.env (this script reads only VOID_ALERT_* lines): VOID_ALERT=off stops it, VOID_ALERT_TOAST=off stops the PC
// notification, VOID_ALERT_QUIET=tv:schedule,cache lists lights that never alert (default tv:schedule). docs/RUNBOOK.md, row alert.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const PROFILE = require('./lib/profile');
const { decide, DEFAULT_QUIET } = require('./lib/alertmsg');

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(PROFILE.catalogDir, 'cache');
const DRY = process.argv.includes('--dry'), TEST = process.argv.includes('--test');

function settings() {
  let text = ''; try { text = fs.readFileSync(path.join(ROOT, 'backend', '.env'), 'utf8'); } catch (e) { /* no env file */ }
  const out = {};
  for (const l of text.split(/\r?\n/)) { const m = /^(VOID_ALERT[A-Z_]*)=(.*)$/.exec(l.trim()); if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, ''); }
  return out;
}

function toast(title, body) {
  // Windows' own notification API through PowerShell 5.1; the text travels in environment variables, so no quoting can break it.
  const ps = "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null;" +
    "$t = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02);" +
    "$x = $t.GetElementsByTagName('text'); $x.Item(0).AppendChild($t.CreateTextNode($env:VT_TITLE)) > $null; $x.Item(1).AppendChild($t.CreateTextNode($env:VT_BODY)) > $null;" +
    "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe').Show([Windows.UI.Notifications.ToastNotification]::new($t))";
  const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { env: { ...process.env, VT_TITLE: title, VT_BODY: body.slice(0, 400) }, windowsHide: true, timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] });
  return r.status === 0 ? 'pc' : 'pc FAILED: ' + String(r.stderr || r.error || '').trim().split('\n')[0].slice(0, 120);
}

async function ntfy(url, title, body, urgent) {
  if (!/^https:\/\/[^\s/]+\/[\w-]{6,}$/.test(url)) return 'phone FAILED: VOID_ALERT_NTFY must look like https://ntfy.sh/<topic> (a topic of 6 or more letters, digits, - or _)';
  try {
    const r = await fetch(url, { method: 'POST', body, headers: { Title: title.replace(/[^\x20-\x7e]/g, ''), Priority: urgent ? 'high' : 'default', Tags: urgent ? 'red_circle' : 'tv' }, signal: AbortSignal.timeout(20000) });
    return r.ok ? 'phone' : 'phone FAILED: ' + r.status;
  } catch (e) { return 'phone FAILED: ' + String(e.message).slice(0, 80); }
}

async function main() {
  const S = settings();
  if (/^off$/i.test(S.VOID_ALERT || '') && !TEST) { console.log('alert: off (VOID_ALERT=off in backend/.env)'); return; }
  const quiet = S.VOID_ALERT_QUIET !== undefined ? S.VOID_ALERT_QUIET.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_QUIET;
  const stateFile = path.join(CACHE, 'alert-state.json');
  let msg;
  if (TEST) msg = { send: true, kind: 'test', title: 'VOIDtv: test alert', body: 'This is a test from scripts/alert.js. When something needs you after the nightly pass, the message arrives here.' };
  else {
    let health = null; try { health = JSON.parse(fs.readFileSync(path.join(CACHE, 'health.json'), 'utf8')); } catch (e) { /* none */ }
    if (!health) health = { checks: [{ id: 'doctor', level: 'red', msg: 'catalog/cache/health.json is missing or unreadable, so no light could be read', fix: 'Run node scripts/doctor.js (HQ > Overview > Run the doctor).' }] };
    let state = null; try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch (e) { /* first run */ }
    msg = decide(health, state, Date.now(), quiet);
    if (!DRY) fs.writeFileSync(stateFile, JSON.stringify(msg.state, null, 1));
  }
  if (DRY) { console.log(msg.send ? `would send (${msg.kind}):\n${msg.title}\n${msg.body}` : 'would send nothing: no light needs you'); return; }
  if (!msg.send) { fs.writeFileSync(path.join(CACHE, 'alert.txt'), `${new Date().toISOString()} nothing needs you\n`); console.log('alert: nothing needs you, nothing sent'); return; }
  const sent = [];
  if (!/^off$/i.test(S.VOID_ALERT_TOAST || '')) sent.push(toast(msg.title, msg.body));
  if (S.VOID_ALERT_NTFY) sent.push(await ntfy(S.VOID_ALERT_NTFY, msg.title, msg.body, msg.kind === 'red'));
  const stamp = new Date().toISOString();
  fs.writeFileSync(path.join(CACHE, 'alert.txt'), `${stamp} ${msg.title}\n${msg.body}\n`);
  fs.appendFileSync(path.join(CACHE, 'alert.log'), `${stamp} ${msg.kind} -> ${sent.join(', ') || 'file only'} :: ${msg.title}\n`);
  console.log(`alert: ${msg.title} -> ${sent.join(', ') || 'catalog/cache/alert.txt only'}`);
  if (sent.some((s) => /FAILED/.test(s))) process.exitCode = 1;
}
main();
