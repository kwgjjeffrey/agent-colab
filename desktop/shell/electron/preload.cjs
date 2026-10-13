'use strict'
const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('colabHost', {
  isElectron: true,
  setUnreadCount: count => ipcRenderer.invoke('host:set-unread-count', count),
  openWorkbench: () => ipcRenderer.invoke('host:open-workbench'),
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
