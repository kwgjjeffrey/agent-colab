const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const vm = require('node:vm')
const fs = require('node:fs')
const path = require('node:path')
test('macOS close and activation reuse the loaded renderer; Quit releases it', async () => {
  const app = new EventEmitter(); app.whenReady = () => new Promise(() => {})
  const windows = []
  class Window extends EventEmitter {
    constructor() { super(); this.webContents = new EventEmitter(); windows.push(this); this.loads = 0 }
    async loadURL() { this.loads++ }
    show() { this.visible = true }
    hide() { this.visible = false }
    focus() { this.focused = true }
    isDestroyed() { return false }
  }
  const context = vm.createContext({ __dirname, URL, setTimeout, process: { platform: 'darwin', env: { COLAB_UI_DEV_URL: 'http://localhost:1420' }, getuid: () => 501 }, require(name) {
    if (name === 'electron') return { app, BrowserWindow: Window, dialog: {}, ipcMain: { handle() {} }, shell: {} }
    if (name === './workbench-window.cjs') return { workbenchOpener: () => () => {} }
    if (name.includes('bootstrap')) return {}
    if (name === 'node:child_process') return { spawn: () => ({ unref() {} }) }
    return require(name)
  } })
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'main.cjs'), 'utf8'), context)
  await vm.runInContext('createWindow()', context)
  const window = windows[0]
  let prevented = false
  window.emit('close', { preventDefault() { prevented = true } })
  assert.equal(prevented, true); assert.equal(window.visible, false)
  app.emit('activate')
  assert.equal(window.visible, true); assert.equal(window.focused, true)
  assert.equal(windows.length, 1); assert.equal(window.loads, 1)
  app.emit('before-quit'); prevented = false
  window.emit('close', { preventDefault() { prevented = true } })
  assert.equal(prevented, false)
})
