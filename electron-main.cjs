/* eslint-disable */
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

// ---------- Logging ----------
const logDir = path.join(app.getPath('userData'), 'logs');
try { fs.mkdirSync(logDir, { recursive: true }); } catch (_) {}
const logFile = path.join(logDir, 'updater.log');
function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}`;
  try { fs.appendFileSync(logFile, line + '\n'); } catch (_) {}
  // eslint-disable-next-line no-console
  console.log(line);
}

// ---------- Settings persistence ----------
const settingsFile = path.join(app.getPath('userData'), 'updater-settings.json');
function readSettings() {
  try { return JSON.parse(fs.readFileSync(settingsFile, 'utf8')); } catch { return { autoUpdate: true }; }
}
function writeSettings(s) {
  try { fs.writeFileSync(settingsFile, JSON.stringify(s, null, 2)); } catch (e) { log('settings write failed', e.message); }
}

// ---------- AutoUpdater config ----------
autoUpdater.autoDownload = false;          // we decide based on setting
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.allowDowngrade = false;
autoUpdater.logger = { info: (m) => log('updater', m), warn: (m) => log('updater warn', m), error: (m) => log('updater error', m), debug: () => {} };

let mainWindow = null;
let updateState = { status: 'idle', version: app.getVersion(), progress: 0, error: null, info: null };

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try { mainWindow.webContents.send(channel, payload); } catch (_) {}
  }
}
function pushState(patch) {
  updateState = { ...updateState, ...patch };
  send('updater:state', updateState);
}

autoUpdater.on('checking-for-update', () => { log('Checking for update'); pushState({ status: 'checking', error: null }); });
autoUpdater.on('update-available', (info) => {
  log('Update available', info && info.version);
  pushState({ status: 'available', info });
  const settings = readSettings();
  if (settings.autoUpdate !== false) {
    autoUpdater.downloadUpdate().catch(err => { log('downloadUpdate err', err.message); pushState({ status: 'error', error: err.message }); });
  }
});
autoUpdater.on('update-not-available', (info) => { log('Update not available'); pushState({ status: 'not-available', info }); });
autoUpdater.on('error', (err) => { log('Updater error', err && err.message); pushState({ status: 'error', error: (err && err.message) || String(err) }); });
autoUpdater.on('download-progress', (p) => { pushState({ status: 'downloading', progress: Math.round(p.percent || 0) }); });
autoUpdater.on('update-downloaded', (info) => { 
  log('Update downloaded', info && info.version); 
  pushState({ status: 'downloaded', info, progress: 100 }); 
  
  if (mainWindow) {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: 'A new version has been downloaded. Do you want to restart and install it now?',
      buttons: ['Restart Now', 'Install Later']
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall(false, true);
      }
    });
  }
});

// ---------- IPC ----------
ipcMain.handle('updater:get-state', () => updateState);
ipcMain.handle('updater:get-version', () => app.getVersion());
ipcMain.handle('updater:get-settings', () => readSettings());
ipcMain.handle('updater:set-settings', (_e, s) => { const next = { ...readSettings(), ...s }; writeSettings(next); return next; });
ipcMain.handle('updater:check', async () => {
  try { const r = await autoUpdater.checkForUpdates(); return { ok: true, version: r && r.updateInfo && r.updateInfo.version }; }
  catch (e) { log('check failed', e.message); return { ok: false, error: e.message }; }
});
ipcMain.handle('updater:download', async () => {
  try { await autoUpdater.downloadUpdate(); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('updater:install', () => {
  log('Quit and install requested');
  setImmediate(() => { try { autoUpdater.quitAndInstall(false, true); } catch (e) { log('install err', e.message); } });
  return { ok: true };
});
ipcMain.handle('updater:open-logs', () => { shell.openPath(logFile); return logFile; });

// ---------- Window ----------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const indexPath = path.join(__dirname, 'dist', 'index.html');
  mainWindow.loadFile(indexPath).catch(err => log('loadFile err', err.message));
  mainWindow.removeMenu(); // Remove the default File/Edit/View menu
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  createWindow();
  // Defer update check until after window is up; never let it crash the app.
  setTimeout(() => {
    const settings = readSettings();
    if (settings.autoUpdate === false) { log('Auto-update disabled by user'); return; }
    if (!app.isPackaged) { log('Dev mode — skipping update check'); return; }
    autoUpdater.checkForUpdates().catch(err => { log('startup check failed (offline?)', err.message); pushState({ status: 'offline', error: err.message }); });
  }, 4000);

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// Global safety net — never crash on updater issues
process.on('uncaughtException', (e) => { log('uncaughtException', e && e.message); });
process.on('unhandledRejection', (e) => { log('unhandledRejection', (e && e.message) || String(e)); });
