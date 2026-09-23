import { join } from "node:path";
// Electron's built-in `electron` module only provides a default export when
// the main process runs as native ESM (this package is `"type": "module"`)
// — `import { app } from "electron"` fails at runtime with "does not
// provide an export named 'app'" even though it type-checks fine.
import electron from "electron";
const { app, BrowserWindow, ipcMain, safeStorage } = electron;
import { ConfigStore } from "./config.js";
import { SecureStorage } from "./SecureStorage.js";
import { GameDetector } from "./GameDetector.js";
import { LauncherState } from "./state.js";
import { registerIpcHandlers } from "./ipc.js";
import { createDefaultGameDetectionStrategies } from "./detectionDefaults.js";

async function createWindow(): Promise<void> {
  const configStore = new ConfigStore(join(app.getPath("userData"), "config.json"));
  const config = await configStore.load();

  const secureStorage = new SecureStorage(
    safeStorage,
    join(app.getPath("userData"), "session.enc"),
  );
  const gameDetector = new GameDetector(createDefaultGameDetectionStrategies());

  // The backend now serves client files itself (BE-007:
  // GET /api/v1/client/files/:channel/*), so by default LauncherState
  // derives the download URL from the *current* apiBaseUrl on every call
  // (see LauncherStateDeps.baseDownloadUrlOverride) — no separate CDN URL
  // needed unless this env var overrides it.
  const state = new LauncherState(
    {
      configStore,
      secureStorage,
      gameDetector,
      baseDownloadUrlOverride: process.env.MZZPLORK_BASE_DOWNLOAD_URL,
      defaultClientDir: join(app.getPath("userData"), "client"),
    },
    config,
  );
  await state.restoreSession();

  const mainWindow = new BrowserWindow({
    width: 1024,
    height: 680,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  registerIpcHandlers(ipcMain, state, mainWindow.webContents);

  mainWindow.once("ready-to-show", () => mainWindow.show());

  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  void createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
