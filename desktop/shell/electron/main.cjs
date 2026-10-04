'use strict'
const path = require('node:path')
const fs = require('node:fs/promises')
const os = require('node:os')
const { spawn } = require('node:child_process')
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron')
const { ensureWindowsInstallation } = require('./windows-bootstrap.cjs')

let window
let pendingDeepLinks = []
const applicationRoot = process.platform === 'win32'
  ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'AgentColab')
  : path.join(os.homedir(), '.local', 'share', 'agent-colab')
const discoveryPath = process.env.COLAB_DISCOVERY_FILE || path.join(applicationRoot, 'discovery.json')
const logPath = path.join(applicationRoot, 'logs', 'electron-shell.log')
const installationGuide = 'https://github.com/kwgjjeffrey/agent-colab#install'

async function logFailure(error) {
  try {
    await fs.mkdir(path.dirname(logPath), { recursive: true })
    const message = error instanceof Error ? (error.stack || error.message) : String(error)
    await fs.appendFile(logPath, `[${new Date().toISOString()}] ${message}\n`, 'utf8')
  } catch {
    // Diagnostics must never replace the original startup error.
  }
}

function requestCoreStart() {
  if (process.platform !== 'win32') return
  // Setup owns service registration. The shell only asks Windows to start that registered task;
  // it does not duplicate Core configuration or become responsible for its lifecycle.
  try {
    const child = spawn('schtasks.exe', ['/Run', '/TN', 'AgentColabCore'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.unref()
  } catch {
    // Missing task is reported through the bounded discovery failure below.
  }
}

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
  requestCoreStart()
  window = new BrowserWindow({ width: 1280, height: 820, minWidth: 900, minHeight: 600, show: false,
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' } : {}),
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
async function reportStartupFailure(error) {
  await logFailure(error)
  const detail = `${error instanceof Error ? error.message : String(error)}\n\nDiagnostic log: ${logPath}`
  const result = await dialog.showMessageBox({
    type: 'error',
    title: 'Agent Colab could not start',
    message: 'Agent Colab could not finish local setup or start Local Core.',
    detail,
    buttons: ['Open troubleshooting guide', 'Close'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  })
  if (result.response === 0) await shell.openExternal(installationGuide)
  app.quit()
}

app.whenReady()
  .then(async () => {
    app.setAsDefaultProtocolClient('colab')
    await ensureWindowsInstallation({ dialog, applicationRoot, resourcesPath: process.resourcesPath })
    await createWindow()
  })
  .catch(reportStartupFailure)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (!window) createWindow() })

ipcMain.handle('host:open-external', (_event, url) => shell.openExternal(url))
ipcMain.handle('host:choose-path', async (_event, options) => {
  const properties = options?.directory === true
    ? ['openDirectory']
    : options?.directory === false
      ? ['openFile']
      : ['openFile', 'openDirectory']
  const result = await dialog.showOpenDialog(window, { title: options?.title, properties })
  return result.canceled ? null : result.filePaths[0] || null
})
ipcMain.handle('host:show-and-focus', () => { window.show(); window.focus() })
