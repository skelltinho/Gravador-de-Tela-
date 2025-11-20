const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  getStoreValue: (key) => ipcRenderer.invoke('getStoreValue', key),
  setStoreValue: (key, value) => ipcRenderer.invoke('setStoreValue', key, value)
})