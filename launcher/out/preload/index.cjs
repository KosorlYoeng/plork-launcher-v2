"use strict";
const electron = require("electron");
const IpcChannels = {
  getConfig: "config:get",
  updateConfig: "config:update",
  login: "auth:login",
  logout: "auth:logout",
  getAuthState: "auth:state",
  detectGame: "game:detect",
  validateGamePath: "game:validate",
  selectInstallation: "game:select",
  checkForUpdates: "update:check",
  getServerStatus: "server:status",
  updateProgress: "update:progress"
};
const { contextBridge, ipcRenderer } = electron;
const api = {
  getConfig: () => ipcRenderer.invoke(IpcChannels.getConfig),
  updateConfig: (patch) => ipcRenderer.invoke(IpcChannels.updateConfig, patch),
  login: (username, password) => ipcRenderer.invoke(IpcChannels.login, username, password),
  logout: () => ipcRenderer.invoke(IpcChannels.logout),
  getAuthState: () => ipcRenderer.invoke(IpcChannels.getAuthState),
  detectGame: () => ipcRenderer.invoke(IpcChannels.detectGame),
  validateGamePath: (path) => ipcRenderer.invoke(IpcChannels.validateGamePath, path),
  selectInstallation: (installation) => ipcRenderer.invoke(IpcChannels.selectInstallation, installation),
  checkForUpdates: () => ipcRenderer.invoke(IpcChannels.checkForUpdates),
  onUpdateProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on(IpcChannels.updateProgress, listener);
    return () => ipcRenderer.removeListener(IpcChannels.updateProgress, listener);
  },
  getServerStatus: () => ipcRenderer.invoke(IpcChannels.getServerStatus)
};
contextBridge.exposeInMainWorld("mzzplork", api);
