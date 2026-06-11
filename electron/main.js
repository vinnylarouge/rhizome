// main.js — the Rhizome Electron shell. The existing Node server runs unchanged
// as a utilityProcess (note-taking never depends on the window); the BrowserWindow
// is just a privileged client of http://127.0.0.1:<port>. The same URL stays
// reachable over the LAN for projectors and co-facilitators.

import { app, BrowserWindow, Menu, dialog, ipcMain, utilityProcess, shell } from 'electron';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');

let win = null;
let server = null;
let serverPort = 0;
let serverRestarts = 0;

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

const freePort = () =>
  new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });

function startServer(port) {
  server = utilityProcess.fork(path.join(REPO_ROOT, 'src', 'server.js'), [], {
    env: {
      ...process.env,
      PORT: String(port),
      RHIZOME_HOME: app.getPath('userData'),
    },
    stdio: 'inherit', // server logs land in the app's stdout (visible via Console.app / terminal launch)
  });
  server.on('exit', (code) => {
    if (app.isQuitting) return;
    // The server is crash-safe (atomic session writes), so a relaunch is cheap.
    if (serverRestarts++ < 3) {
      console.error(`[shell] server exited (${code}) — restarting`);
      startServer(port);
    } else {
      dialog.showErrorBox('Rhizome', 'The Rhizome server keeps crashing. Check the logs (run from a terminal to see them).');
    }
  });
}

async function waitForHealth(port, timeoutMs = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

const send = (action) => win?.webContents.send('rhizome:action', action);

function buildMenu() {
  const template = [
    {
      label: 'Rhizome',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: () => send('settings') },
        { label: 'Update from Git…', click: updateFromGit },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Session',
      submenu: [
        { label: 'New Session…', accelerator: 'CmdOrCtrl+N', click: () => send('new-session') },
        { label: 'Session Library', accelerator: 'CmdOrCtrl+L', click: () => send('library') },
        { type: 'separator' },
        { label: 'Search All Sessions', accelerator: 'CmdOrCtrl+K', click: () => send('search') },
        { label: 'Export to Obsidian', accelerator: 'CmdOrCtrl+E', click: () => send('obsidian') },
        { type: 'separator' },
        { label: 'Open on this network…', click: shareUrl },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Show the LAN URL (projector / colleague's browser) — the whole point of
// keeping an HTTP server inside the app.
function shareUrl() {
  const nets = Object.values(os.networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal);
  const urls = nets.map((n) => `http://${n.address}:${serverPort}`).join('\n') || '(no external interfaces found)';
  dialog.showMessageBox(win, {
    message: 'Open Rhizome from another device on this network',
    detail: urls + '\n\nAnyone on the network can view and take notes — Chatham House style.',
  });
}

// Update-from-git: run scripts/update.sh in Terminal so progress is visible.
// Uses the repo this app was built from (settings.repoPath overrides; unpackaged
// runs use the repo the source is in).
function updateFromGit() {
  let repo = REPO_ROOT;
  try {
    const settings = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'settings.json'), 'utf8'));
    if (settings.repoPath && fs.existsSync(settings.repoPath)) repo = settings.repoPath;
  } catch { /* settings optional */ }
  const script = path.join(repo, 'scripts', 'update.sh');
  if (!fs.existsSync(script)) {
    dialog.showErrorBox('Update from Git', `Couldn't find ${script}.\nSet "repoPath" in settings.json to your rhizome checkout.`);
    return;
  }
  dialog.showMessageBox(win, {
    message: 'Updating Rhizome',
    detail: 'A terminal window will pull, rebuild, reinstall and relaunch. This app will quit.',
    buttons: ['Update', 'Cancel'],
  }).then(({ response }) => {
    if (response !== 0) return;
    runScriptInTerminal(script);
    setTimeout(() => app.quit(), 500);
  });
}

// Run a shell script where the user can watch it: Terminal.app on macOS, the
// first available terminal emulator on Linux, headless (logged) as a last resort.
function runScriptInTerminal(script) {
  if (process.platform === 'darwin') {
    spawn('open', ['-a', 'Terminal', script], { detached: true });
    return;
  }
  const have = (cmd) => spawnSync('which', [cmd]).status === 0;
  const emulators = [
    ['x-terminal-emulator', ['-e', `bash "${script}"`]],
    ['gnome-terminal', ['--', 'bash', script]],
    ['konsole', ['-e', 'bash', script]],
    ['xterm', ['-e', 'bash', script]],
  ];
  for (const [cmd, args] of emulators) {
    if (have(cmd)) { spawn(cmd, args, { detached: true }); return; }
  }
  const log = path.join(app.getPath('userData'), 'update.log');
  const out = fs.openSync(log, 'a');
  spawn('bash', [script], { detached: true, stdio: ['ignore', out, out] }).unref();
  dialog.showMessageBox(win, { message: 'Updating in the background', detail: `No terminal emulator found — progress is logging to ${log}.` });
}

ipcMain.handle('rhizome:pickFolder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});

app.whenReady().then(async () => {
  serverPort = Number(process.env.PORT) || await freePort();
  startServer(serverPort);
  const up = await waitForHealth(serverPort);

  win = new BrowserWindow({
    width: 1680,
    height: 1050,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#0e0f13',
    title: 'Rhizome',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.on('closed', () => { win = null; });
  // External links (paper PDFs open in-window fine; anything else → browser)
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`http://127.0.0.1:${serverPort}`)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });

  buildMenu();
  if (up) {
    win.loadURL(`http://127.0.0.1:${serverPort}`);
  } else {
    dialog.showErrorBox('Rhizome', 'The embedded server did not come up within 15s. Run `npm run serve` in a terminal to see why.');
  }

  app.on('activate', () => { if (!win) app.emit('ready'); });
});

app.on('before-quit', () => { app.isQuitting = true; server?.kill(); });
app.on('window-all-closed', () => app.quit());
