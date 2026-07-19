/* eslint-disable */
const { contextBridge, ipcRenderer } = require('electron');

const api = {
  getVersion: () => ipcRenderer.invoke('updater:get-version'),
  getState: () => ipcRenderer.invoke('updater:get-state'),
  getSettings: () => ipcRenderer.invoke('updater:get-settings'),
  setSettings: (s) => ipcRenderer.invoke('updater:set-settings', s),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  quitAndInstall: () => ipcRenderer.invoke('updater:install'),
  openLogs: () => ipcRenderer.invoke('updater:open-logs'),
  onState: (cb) => {
    const handler = (_e, state) => cb(state);
    ipcRenderer.on('updater:state', handler);
    return () => ipcRenderer.removeListener('updater:state', handler);
  },
};

contextBridge.exposeInMainWorld('desktopUpdater', api);
contextBridge.exposeInMainWorld('isDesktopApp', true);
