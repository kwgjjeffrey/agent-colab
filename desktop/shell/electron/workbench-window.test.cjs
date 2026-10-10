const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const vm = require('node:vm')
const fs = require('node:fs')
const path = require('node:path')
test('Workbench opens in front, restores, reuses, and recreates without replacing main', async () => {
  const windows = []
  class Window extends EventEmitter {
    constructor() { super(); windows.push(this) }
    async loadURL(url) { this.url = url }
    isDestroyed() { return !!this.destroyed }
    isMinimized() { return !!this.minimized }
    restore() { this.minimized = false; this.restored = true }
    show() { this.visible = true }
    focus() { this.focused = true }
    close() { this.destroyed = true; this.emit('closed') }
  }
  const context = vm.createContext({ __dirname, URL, module: { exports: {} }, require(name) {
    return name === 'electron' ? { BrowserWindow: Window } : require(name)
  } })
  vm.runInContext(fs.readFileSync(path.join(__dirname,'workbench-window.cjs'),'utf8'),context)
  const main = { webContents: { getURL: () => 'http://localhost:1234/' } }
  const open = context.module.exports.workbenchOpener(() => main)
  await assert.rejects(open({ sender: {} }), /from Colab/)
  const event = { sender: main.webContents }
  await Promise.all([open(event),open(event)])
  assert.equal(windows.length,1)
  assert.equal(windows[0].url,'http://localhost:1234/operation-workbench/')
  assert.equal(windows[0].visible,true); assert.equal(windows[0].focused,true)
  windows[0].minimized = true; windows[0].focused = false
  await open(event)
  assert.equal(windows[0].restored,true); assert.equal(windows[0].focused,true)
  windows[0].close(); await open(event)
  assert.equal(windows.length,2); assert.equal(main.webContents.getURL(),'http://localhost:1234/')
})
