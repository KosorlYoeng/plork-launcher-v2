import type { IpcMain, WebContents } from "electron";
import { IpcChannels } from "../shared/ipc.js";
import type { LauncherState } from "./state.js";
import type { GameInstallation } from "../shared/types.js";

/** Registers every renderer-facing IPC handler against a composed LauncherState. */
export function registerIpcHandlers(
  ipcMain: IpcMain,
  state: LauncherState,
  webContents: WebContents,
): void {
  ipcMain.handle(IpcChannels.getConfig, () => state.getConfig());
  ipcMain.handle(IpcChannels.updateConfig, (_event, patch) => state.updateConfig(patch));

  ipcMain.handle(IpcChannels.login, (_event, username: string, password: string) =>
    state.login(username, password),
  );
  ipcMain.handle(IpcChannels.logout, () => state.logout());
  ipcMain.handle(IpcChannels.getAuthState, () => state.getAuthState());

  ipcMain.handle(IpcChannels.detectGame, () => state.detectGame());
  ipcMain.handle(IpcChannels.validateGamePath, (_event, path: string) =>
    state.validateGamePath(path),
  );
  ipcMain.handle(IpcChannels.selectInstallation, (_event, installation: GameInstallation) =>
    state.selectInstallation(installation),
  );

  ipcMain.handle(IpcChannels.checkForUpdates, () =>
    state.checkForUpdates((event) => {
      webContents.send(IpcChannels.updateProgress, event);
    }),
  );

  ipcMain.handle(IpcChannels.getServerStatus, () => state.getServerStatus());
}
