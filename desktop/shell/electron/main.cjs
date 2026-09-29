'use strict'
const path = require('node:path')
const fs = require('node:fs/promises')
const os = require('node:os')
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron')

let window
let pendingDeepLinks = []
const applicationRoot = process.platform === 'win32'
  ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'AgentColab')
  : path.join(os.homedir(), '.local', 'share', 'agent-colab')
const discoveryPath = process.env.COLAB_DISCOVERY_FILE || path.join(applicationRoot, 'discovery.json')

async function localGuiUrl() {
  if (process.env.COLAB_LOCAL_GUI_URL) return process.env.COLAB_LOCAL_GUI_URL
  // The launcher reads the installation-scoped discovery identity once when creating a window
  // and trades its bearer for an HttpOnly cookie. Restart recovery belongs to the web GUI/Core;
  // Electron must not become an update prerequisite or run a discovery polling loop.
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const discovery = JSON.parse(await fs.readFile(discoveryPath, 'utf8'))
      const url = new URL('/bootstrap', discovery.endpoint)
      url.searchParams.set('token', discovery.bearer)
      return url.toString()
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  throw new Error(`Colab Local Core discovery is unavailable: ${discoveryPath}`)
}

async function createWindow() {
  window = new BrowserWindow({ width: 1280, height: 820, minWidth: 900, minHeight: 600, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } })
  // Electron is only a native bookmark for the independently installed Local
  // Core. Local Core owns the active GUI resources, so browser and App users
  // always see the same independently updatable GUI build.
  await window.loadURL(process.env.COLAB_UI_DEV_URL || await localGuiUrl())
  window.once('ready-to-show', () => window.show())
  window.webContents.on('did-finish-load', () => {
    if (pendingDeepLinks.length) window.webContents.send('host:deep-link', pendingDeepLinks.splice(0))
  })
}

app.on('open-url', (event, url) => {
  event.preventDefault()
  if (!url.startsWith('colab://')) return
  if (window) window.webContents.send('host:deep-link', [url]); else pendingDeepLinks.push(url)
})
app.whenReady().then(async () => { app.setAsDefaultProtocolClient('colab'); await createWindow() })
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (!window) createWindow() })

ipcMain.handle('host:open-external', (_event, url) => shell.openExternal(url))
ipcMain.handle('host:choose-path', async (_event, options) => {
  const result = await dialog.showOpenDialog(window, { title: options?.title, properties: [options?.directory ? 'openDirectory' : 'openFile'] })
  return result.canceled ? null : result.filePaths[0] || null
})
ipcMain.handle('host:show-and-focus', () => { window.show(); window.focus() })
