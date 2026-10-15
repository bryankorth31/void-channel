// VOIDtv HQ, the desktop app. It starts the HQ server from the void-channel repo (scripts/hq.js)
// inside this process and shows it in its own window, with a tray icon so it can sit in the
// background. The repo location is remembered in the app's config; the builder scripts and the
// catalog stay where they are, so a git pull updates HQ without reinstalling the app.
const { app, BrowserWindow, Tray, Menu, shell, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

const PORT = 8780;
const ICON = path.join(__dirname, 'build', 'icon.png');
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

let win = null, tray = null;
function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 900, minHeight: 600, backgroundColor: '#07080c', title: 'VOIDtv HQ', icon: ICON,
    autoHideMenuBar: true, webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.loadURL(`http://127.0.0.1:${PORT}/`);
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(`http://127.0.0.1:${PORT}/`)) { e.preventDefault(); if (/^https?:\/\//i.test(url)) shell.openExternal(url); } });
  win.on('close', (e) => { if (!app.quitting) { e.preventDefault(); win.hide(); } });
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
  const menu = () => Menu.buildFromTemplate([
    { label: 'Open HQ', click: () => { win.show(); win.focus(); } },
    { label: 'Open in browser', click: () => shell.openExternal(`http://localhost:${PORT}/`) },
    { type: 'separator' },
    { label: 'Start with Windows', type: 'checkbox', enabled: app.isPackaged, checked: app.getLoginItemSettings({ args: ['--hidden'] }).openAtLogin, click: (m) => { app.setLoginItemSettings({ openAtLogin: m.checked, args: ['--hidden'] }); tray.setContextMenu(menu()); } },
    { type: 'separator' },
    { label: 'Quit HQ (jobs keep running)', click: () => { app.quitting = true; app.quit(); } },
  ]);
  tray.setToolTip('VOIDtv HQ');
  tray.setContextMenu(menu());
  tray.on('click', () => { if (win.isVisible()) win.focus(); else win.show(); });
}

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });
app.on('window-all-closed', () => { /* stays in the tray */ });
app.whenReady().then(async () => {
  const repo = await findRepo();
  if (!repo) return;
  try { await startServer(repo); } catch (e) { dialog.showErrorBox('VOIDtv HQ could not start', e.message); app.quit(); return; }
  createWindow();
  createTray();
  if (process.argv.includes('--hidden')) win.hide();
});
