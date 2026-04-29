const { contextBridge, ipcRenderer } = require('electron');

function exposeElectronApi() {
  if (!contextBridge || typeof contextBridge.exposeInMainWorld !== 'function') {
    throw new Error('contextBridge is unavailable (contextIsolation must be enabled)');
  }

  contextBridge.exposeInMainWorld('electronAPI', {
    launchGame: (username) => ipcRenderer.send('start-minecraft', username),
    onLaunchError: (callback) => ipcRenderer.on('launch-error', (_event, message) => callback(message)),
    onLaunchStarted: (callback) => ipcRenderer.on('launch-started', (_event, message) => callback(message)),
    onLaunchProgress: (callback) => ipcRenderer.on('launch-progress', (_event, payload) => callback(payload)),
    onLaunchReady: (callback) => ipcRenderer.on('launch-ready', (_event, payload) => callback(payload)),
    onGameState: (callback) => ipcRenderer.on('game-state', (_event, payload) => callback(payload)),
    subscribeGameState: () => ipcRenderer.send('subscribe-game-state'),
    getGameState: () => ipcRenderer.invoke('get-game-state'),
    checkJava: () => ipcRenderer.invoke('check-java'),
    installJava21: () => ipcRenderer.invoke('install-java-21'),
    ensureModpackUpdated: () => ipcRenderer.invoke('ensure-modpack-updated'),
    onModpackUpdateProgress: (callback) =>
      ipcRenderer.on('modpack-update-progress', (_event, payload) => callback(payload)),
    getMclcLog: () => ipcRenderer.invoke('get-mclc-log'),
    clearMclcLog: () => ipcRenderer.invoke('clear-mclc-log'),
    onMclcLogLine: (callback) => ipcRenderer.on('mclc-log-line', (_event, payload) => callback(payload))
  });
}

module.exports = {
  exposeElectronApi
};
