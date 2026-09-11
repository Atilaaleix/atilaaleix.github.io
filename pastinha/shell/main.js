// A casca do Electron não tem lógica nenhuma, de propósito: ela abre uma janela
// e aponta para o servidor local. Trocar por Tauri ou por um WKWebView de 200
// linhas em Swift é um fim de semana, não uma reescrita.
import { app, BrowserWindow, globalShortcut, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../engine/config.js';
import { createServer } from '../engine/server.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const cfg = loadConfig();
let win;

function createWindow() {
  win = new BrowserWindow({
    width: 380, height: 560,
    x: undefined, y: undefined,
    frame: false, transparent: true, hasShadow: true,
    alwaysOnTop: true, resizable: true, fullscreenable: false,
    skipTaskbar: true,
    webPreferences: { preload: path.join(HERE, 'preload.cjs'), contextIsolation: true }
  });
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadURL(`http://127.0.0.1:${cfg.port}/`);
}

app.whenReady().then(() => {
  const { server } = createServer(cfg);
  server.listen(cfg.port, '127.0.0.1', () => {
    console.log(`[pastinha] motor em http://127.0.0.1:${cfg.port}`);
    createWindow();
  });

  // O ritual de chamar o bicho. Um gesto, não um menu.
  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    if (!win) return createWindow();
    if (win.isVisible()) win.hide();
    else { win.show(); win.focus(); win.webContents.executeJavaScript('document.querySelector("#search").focus()'); }
  });

  ipcMain.on('pastinha:close', () => win?.hide());
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});

app.on('window-all-closed', e => { /* o bicho não morre, só se esconde */ });
app.on('will-quit', () => globalShortcut.unregisterAll());
