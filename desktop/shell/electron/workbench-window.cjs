'use strict'
const { BrowserWindow } = require('electron')
const path = require('node:path')

function workbenchOpener(getMainWindow) {
  let workbench, loading
  return async event => {
    const main = getMainWindow()
    // Only the installed main renderer may request this fixed application page.
    if (!main || event.sender !== main.webContents) throw new Error('Workbench must be opened from Colab')
    if (!workbench || workbench.isDestroyed()) {
      const url = new URL('/operation-workbench/', main.webContents.getURL())
      if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Workbench requires Local Core')
      const child = new BrowserWindow({ width: 1280, height: 820, minWidth: 900, minHeight: 600, show: false, title: 'Operation Workbench',
        webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } })
      workbench = child
      child.on('closed', () => { if (workbench === child) { workbench = undefined; loading = undefined } })
      loading = child.loadURL(url.toString()).catch(error => { if (!child.isDestroyed()) child.close(); throw error })
    }
    await loading
    if (workbench.isMinimized()) workbench.restore()
    // WindowProxy.focus() focuses web content, not an existing native BrowserWindow.
    workbench.show()
    workbench.focus()
  }
}
module.exports = { workbenchOpener }
