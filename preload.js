const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: (cfg) => ipcRenderer.invoke('set-config', cfg),
  getImage: (petName) => ipcRenderer.invoke('get-image', petName),
  getAIConfig: () => ipcRenderer.invoke('get-ai-config'),
  setAIConfig: (cfg) => ipcRenderer.invoke('set-ai-config', cfg),
  chat: (msg) => ipcRenderer.invoke('ai-chat', msg),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  openSettings: () => ipcRenderer.invoke('open-settings'),
  dragMove: (pos) => ipcRenderer.send('drag-move', pos),

  getHistory: () => ipcRenderer.invoke('get-chat-history'),
  appendHistory: (entry) => ipcRenderer.invoke('append-chat-history', entry),

  getPetList: () => ipcRenderer.invoke('get-pet-list'),
  pickAndAddPet: (name) => ipcRenderer.invoke('pick-and-add-pet', name),
  deletePet: (name) => ipcRenderer.invoke('delete-pet', name),

  onConfigChanged: (cb) => {
    const h = (_e, c) => cb(c);
    ipcRenderer.on('config-changed', h);
    return () => ipcRenderer.removeListener('config-changed', h);
  },
});
