// Same ESM-interop caveat as src/main/index.ts — see the comment there.
import electron, { type IpcRendererEvent } from "electron";
const { contextBridge, ipcRenderer } = electron;
import { IpcChannels } from "../shared/ipc.js";
import type {
  AuthState,
  GameInstallation,
  LauncherConfig,
  ServerStatus,
  UpdateProgressEvent,
} from "../shared/types.js";

const api = {
  getConfig: (): Promise<LauncherConfig> => ipcRenderer.invoke(IpcChannels.getConfig),
  updateConfig: (patch: Partial<LauncherConfig>): Promise<LauncherConfig> =>
    ipcRenderer.invoke(IpcChannels.updateConfig, patch),

  login: (username: string, password: string): Promise<AuthState> =>
    ipcRenderer.invoke(IpcChannels.login, username, password),
  logout: (): Promise<AuthState> => ipcRenderer.invoke(IpcChannels.logout),
  getAuthState: (): Promise<AuthState> => ipcRenderer.invoke(IpcChannels.getAuthState),

  detectGame: (): Promise<GameInstallation[]> => ipcRenderer.invoke(IpcChannels.detectGame),
  validateGamePath: (path: string): Promise<GameInstallation | null> =>
    ipcRenderer.invoke(IpcChannels.validateGamePath, path),
  selectInstallation: (installation: GameInstallation): Promise<LauncherConfig> =>
    ipcRenderer.invoke(IpcChannels.selectInstallation, installation),

  checkForUpdates: (): Promise<unknown> => ipcRenderer.invoke(IpcChannels.checkForUpdates),
  onUpdateProgress: (callback: (event: UpdateProgressEvent) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, data: UpdateProgressEvent): void => callback(data);
    ipcRenderer.on(IpcChannels.updateProgress, listener);
    return () => ipcRenderer.removeListener(IpcChannels.updateProgress, listener);
  },

  getServerStatus: (): Promise<ServerStatus> => ipcRenderer.invoke(IpcChannels.getServerStatus),
};

contextBridge.exposeInMainWorld("mzzplork", api);

export type MzzPlorkApi = typeof api;
