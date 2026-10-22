// VOIDtv HQ, the desktop app. It starts the HQ server from the void-channel repo (scripts/hq.js)
// inside this process and shows it in its own window, with a tray icon so it can sit in the
// background. The repo location is remembered in the app's config; the builder scripts and the
// catalog stay where they are, so a git pull updates HQ without reinstalling the app.
const { app, BrowserWindow, Tray, Menu, shell, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const lab = require('./lab');

const PORT = 8780;
const ICON = path.join(__dirname, 'build', 'icon.png');
// On Windows the windows and the tray use the .ico: its 16 to 48 px frames are the site's own favicon frames, which stay
// sharp in the title bar, taskbar and tray where a shrunken 512 px picture would blur. If the .ico cannot be read, the
// PNG is used as before.
const ICO = path.join(__dirname, 'build', 'icon.ico');
const icoImage = () => { if (process.platform !== 'win32') return null; const ico = nativeImage.createFromPath(ICO); return ico.isEmpty() ? null : ico; };
const windowIcon = () => icoImage() || ICON;
const trayImage = () => icoImage() || nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 });
const CONFIG = path.join(app.getPath('userData'), 'config.json');
const loadCfg = () => { try { return JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch (e) { return {}; } };
const saveCfg = (c) => { fs.mkdirSync(path.dirname(CONFIG), { recursive: true }); fs.writeFileSync(CONFIG, JSON.stringify(c, null, 2)); };
const looksLikeRepo = (d) => !!d && fs.existsSync(path.join(d, 'scripts', 'hq.js')) && fs.existsSync(path.join(d, 'catalog'));

async function findRepo() {
  const c = loadCfg();
  if (looksLikeRepo(c.repo)) return c.repo;
  const guesses = [path.join(__dirname, '..'), path.join(__dirname, '..', '..'), path.join(app.getPath('home'), 'void-channel'), 'C:\\Users\\bryan\\void-channel'];
  for (const g of guesses) if (looksLikeRepo(g)) { saveCfg({ ...c, repo: g }); return g; }
  const r = await dialog.showOpenDialog({ title: 'Where is the void-channel folder?', properties: ['openDirectory'] });
  if (r.canceled || !looksLikeRepo(r.filePaths[0])) { dialog.showErrorBox('VOIDtv HQ', 'That folder does not contain scripts/hq.js and catalog/. Pick the void-channel repo folder.'); app.quit(); return null; }
  saveCfg({ ...c, repo: r.filePaths[0] });
  return r.filePaths[0];
}

const ping = () => new Promise((ok) => {
  const q = http.get({ host: '127.0.0.1', port: PORT, path: '/api/overview', timeout: 1500 }, (r) => { ok(r.statusCode === 200); r.resume(); });
  q.on('error', () => ok(false)); q.on('timeout', () => { q.destroy(); ok(false); });
});

async function startServer(repo) {
  if (await ping()) return 'already running';
  const hq = require(path.join(repo, 'scripts', 'hq.js'));
  try { await hq.start({ port: PORT }); return 'started'; } catch (e) { if (e.code === 'EADDRINUSE') return 'port in use'; throw e; }
}

let win = null, tray = null, labWin = null, labOpening = null, labFailedUrl = null, repoDir = null;
const isLab = (url) => String(url).startsWith(lab.LAB_ORIGIN + '/');
// A refused or aborted page load shows in the window itself; it must not become an error dialog from the main process.
const load = (w, url) => { w.loadURL(url).catch(() => {}); };

// The player lab in its own window (lab.js serves it). backgroundThrottling is off, so timers and drawing are not slowed
// when the window sits behind another one. An open window comes forward at once. Only a link to a particular lab page
// moves it, and it is reloaded only when its page failed to load (for example LAB.cmd's server was closed before it
// loaded). A live page is never reloaded from here: a running soak has everything it needs in memory. One open at a
// time: a second click while the first is still starting waits for it instead of making a second window.
function openLab(url) {
  if (!labOpening) labOpening = openLabNow(url).catch((e) => dialog.showErrorBox('The player lab could not open', String((e && e.message) || e))).finally(() => { labOpening = null; });
  return labOpening;
}
async function openLabNow(url) {
  const deep = isLab(url) && url !== lab.LAB_URL ? url : null;
  const live = () => labWin && !labWin.isDestroyed();
  if (live()) { labWin.show(); labWin.focus(); }
  // Make sure something serves the lab (HQ takes over the port here if LAB.cmd's server has gone away). A failure only
  // needs a dialog when there is no working lab page to look at.
  try { await lab.ensureServer(repoDir); } catch (e) { if (!live() || labFailedUrl) dialog.showErrorBox('The player lab could not start', e.message); return; }
  if (live()) {
    if (deep && labWin.webContents.getURL() !== deep) load(labWin, deep);
    else if (labFailedUrl) load(labWin, labFailedUrl);
    return;
  }
  const w = new BrowserWindow({
    width: 1366, height: 860, minWidth: 800, minHeight: 500, backgroundColor: '#07080c', title: 'voidtv.net player lab', icon: windowIcon(),
    autoHideMenuBar: true, webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  labWin = w;
  labFailedUrl = null;
  // Remember a main-page load that failed (not an aborted one), so the next open retries it; a page that really loads
  // clears it. Electron 44 fires did-finish-load after did-fail-load too (for the error page), so only did-navigate,
  // which an error page does not fire, may clear it (measured on 44.7.2, 19 Oct 2026: fail -102, finish, stop).
  w.webContents.on('did-fail-load', (e, code, desc, failedUrl, isMainFrame) => { if (labWin === w && isMainFrame && code !== -3) labFailedUrl = isLab(failedUrl) ? failedUrl : lab.LAB_URL; });
  w.webContents.on('did-navigate', () => { if (labWin === w) labFailedUrl = null; });
  load(w, deep || lab.LAB_URL);
  w.webContents.setWindowOpenHandler(({ url: u }) => { if (isLab(u)) load(w, u); else if (/^https?:\/\//i.test(u)) shell.openExternal(u); return { action: 'deny' }; });
  w.webContents.on('will-navigate', (e, u) => { if (!isLab(u)) { e.preventDefault(); if (/^https?:\/\//i.test(u)) shell.openExternal(u); } });
  w.on('closed', () => { if (labWin === w) { labWin = null; labFailedUrl = null; } });
}
function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 900, minHeight: 600, backgroundColor: '#07080c', title: 'voidtv.net HQ', icon: windowIcon(),
    autoHideMenuBar: true, webPreferences: { contextIsolation: true, sandbox: true },
  });
  // The page comes from HQ itself, so it carries HQ's per-start token (a meta tag the page sends back as X-HQ-Token) and
  // its calls arrive with Origin http://127.0.0.1:<port>, which HQ accepts. This window needs no token of its own.
  win.loadURL(`http://127.0.0.1:${PORT}/`).catch(() => {});
  win.webContents.on('did-fail-load', (e, code, desc, url, isMainFrame) => { if (isMainFrame && code !== -3) mainFailed = true; });
  win.webContents.on('did-navigate', () => { mainFailed = false; });
  // Links to the player lab open the lab window; other web links open in the browser.
  win.webContents.setWindowOpenHandler(({ url }) => { if (isLab(url)) openLab(url); else if (/^https?:\/\//i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(`http://127.0.0.1:${PORT}/`)) { e.preventDefault(); if (isLab(url)) openLab(url); else if (/^https?:\/\//i.test(url)) shell.openExternal(url); } });
  win.on('close', (e) => { if (!app.quitting) { e.preventDefault(); win.hide(); } });
}

// The server lives inside this process. If it stops answering (it died on 21 Oct while the app sat in the tray, so the
// icon only brought back a window pointing at nothing), the app restarts itself: a fresh process starts the server
// cleanly, which a second start in this one cannot promise. Checked on every open and once a minute.
let relaunching = false, mainFailed = false;
async function ensureUp(show) {
  if (relaunching) return;
  if (await ping()) {
    if (show) { if (mainFailed) load(win, `http://127.0.0.1:${PORT}/`); win.show(); win.focus(); }
    return;
  }
  relaunching = true;
  const visible = show || (win && win.isVisible());
  app.relaunch({ args: process.argv.slice(1).filter((a) => a !== '--hidden').concat(visible ? [] : ['--hidden']) });
  app.quitting = true;
  app.exit(0);
}

function createTray() {
  tray = new Tray(trayImage());
  const menu = () => Menu.buildFromTemplate([
    { label: 'Open HQ', click: () => ensureUp(true) },
    { label: 'Open in browser', click: () => shell.openExternal(`http://localhost:${PORT}/`) },
    { label: 'Open player lab', click: () => openLab() },
    { type: 'separator' },
    { label: 'Start with Windows', type: 'checkbox', enabled: app.isPackaged, checked: app.getLoginItemSettings({ args: ['--hidden'] }).openAtLogin, click: (m) => { app.setLoginItemSettings({ openAtLogin: m.checked, args: ['--hidden'] }); tray.setContextMenu(menu()); } },
    { type: 'separator' },
    { label: 'Quit HQ (jobs keep running)', click: () => { app.quitting = true; app.quit(); } },
  ]);
  tray.setToolTip('VOIDtv HQ');
  tray.setContextMenu(menu());
  tray.on('click', () => ensureUp(true));
}

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (win) ensureUp(true); });
app.on('window-all-closed', () => { /* stays in the tray */ });
app.whenReady().then(async () => {
  const repo = await findRepo();
  if (!repo) return;
  repoDir = repo;
  try { await startServer(repo); } catch (e) { dialog.showErrorBox('VOIDtv HQ could not start', e.message); app.quit(); return; }
  // The lab is served from the start, so its address works in Edge too without LAB.cmd. A failure here is quiet;
  // opening the lab retries and says what went wrong.
  lab.ensureServer(repo).catch(() => {});
  createWindow();
  createTray();
  if (process.argv.includes('--hidden')) win.hide();
  setInterval(() => ensureUp(false), 60000);
});
