const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcher', {
  getProjectPath: () => ipcRenderer.invoke('get-project-path'),
  selectProject: () => ipcRenderer.invoke('select-project'),
  checkEnv: () => ipcRenderer.invoke('check-env'),
  checkDeps: () => ipcRenderer.invoke('check-deps'),
  startFrontend: () => ipcRenderer.invoke('start-frontend'),
  startBackend: () => ipcRenderer.invoke('start-backend'),
  stopFrontend: () => ipcRenderer.invoke('stop-frontend'),
  stopBackend: () => ipcRenderer.invoke('stop-backend'),
  getStatus: () => ipcRenderer.invoke('get-status'),
  minimize: () => ipcRenderer.invoke('window-minimize'),
  close: () => ipcRenderer.invoke('window-close'),
  onLog: (callback) => ipcRenderer.on('log', (_, data) => callback(data)),
  onProcessExit: (callback) => ipcRenderer.on('process-exit', (_, data) => callback(data)),
});
