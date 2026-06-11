// preload.cjs — the minimal privileged bridge. The web UI works in any browser;
// these extras light up only inside the Electron shell (folder picker for the
// Obsidian vault, native-menu actions).

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rhizome', {
  pickFolder: () => ipcRenderer.invoke('rhizome:pickFolder'),
  onAction: (cb) => ipcRenderer.on('rhizome:action', (_e, action) => cb(action)),
});
