const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pastinha', {
  close: () => ipcRenderer.send('pastinha:close')
});
