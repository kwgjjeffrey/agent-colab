'use strict'
const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('colabHost', {
  isElectron: true,
  openExternal: url => ipcRenderer.invoke('host:open-external', url),
  choosePath: options => ipcRenderer.invoke('host:choose-path', options),
  onDeepLink: callback => {
    const listener = (_event, urls) => callback(urls)
    ipcRenderer.on('host:deep-link', listener)
    return () => ipcRenderer.removeListener('host:deep-link', listener)
  },
  showAndFocus: () => ipcRenderer.invoke('host:show-and-focus'),
  markUiReady: () => ipcRenderer.send('host:ui-ready')
})
