"use strict";
const node_path = require("node:path");
const electron = require("electron");
const promises = require("node:fs/promises");
const node_fs = require("node:fs");
const node_stream = require("node:stream");
const promises$1 = require("node:stream/promises");
const manifest = require("@mzzplork/manifest");
const node_child_process = require("node:child_process");
const node_util = require("node:util");
const DEFAULTS = {
  environment: "production",
  // Overridable for local development/testing against a non-production
  // backend, without hand-editing the persisted config file (plan §15).
  apiBaseUrl: process.env.MZZPLORK_API_BASE_URL ?? "https://api.mzzplork.example.com",
  channel: "stable",
  gamePath: "",
  clientPath: "",
  autoUpdate: true
};
class ConfigStore {
  constructor(filePath) {
    this.filePath = filePath;
  }
  filePath;
  cached = null;
  async load() {
    if (this.cached) {
      return this.cached;
    }
    try {
      const raw = await promises.readFile(this.filePath, "utf8");
      this.cached = { ...DEFAULTS, ...JSON.parse(raw) };
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
      this.cached = { ...DEFAULTS };
    }
    return this.cached;
  }
  async update(patch) {
    const current = await this.load();
    const next = { ...current, ...patch };
    await promises.mkdir(node_path.dirname(this.filePath), { recursive: true });
    await promises.writeFile(this.filePath, JSON.stringify(next, null, 2), "utf8");
    this.cached = next;
    return next;
  }
}
class SecureStorage {
  constructor(safeStorage2, filePath) {
    this.safeStorage = safeStorage2;
    this.filePath = filePath;
  }
  safeStorage;
  filePath;
  async saveRefreshToken(refreshToken) {
    if (!this.safeStorage.isEncryptionAvailable()) {
      throw new Error(
        "OS-level secure storage is unavailable; refusing to persist the refresh token in plaintext"
      );
    }
    const encrypted = this.safeStorage.encryptString(refreshToken);
    await promises.mkdir(node_path.dirname(this.filePath), { recursive: true });
    await promises.writeFile(this.filePath, encrypted);
  }
  async loadRefreshToken() {
    let encrypted;
    try {
      encrypted = await promises.readFile(this.filePath);
    } catch (error) {
      if (error.code === "ENOENT") {
        return null;
      }
      throw error;
    }
    if (!this.safeStorage.isEncryptionAvailable()) {
      return null;
    }
    try {
      return this.safeStorage.decryptString(encrypted);
    } catch {
      return null;
    }
  }
  async clear() {
    await promises.rm(this.filePath, { force: true });
  }
}
const GTA5_EXECUTABLE = "GTA5.exe";
const GTA5_DIR_NAME = "Grand Theft Auto V";
async function fileExists(path) {
  try {
    await promises.access(path, promises.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
function parseSteamLibraryPaths(vdf) {
  const paths = [];
  const pathLine = /"path"\s*"((?:[^"\\]|\\.)*)"/g;
  let match;
  while ((match = pathLine.exec(vdf)) !== null) {
    paths.push(match[1].replace(/\\\\/g, "\\"));
  }
  return paths;
}
class SteamGameDetector {
  constructor(steamRoot) {
    this.steamRoot = steamRoot;
  }
  steamRoot;
  source = "steam";
  async detect() {
    const libraryFoldersPath = node_path.join(this.steamRoot, "steamapps", "libraryfolders.vdf");
    let additionalLibraries = [];
    try {
      const vdf = await promises.readFile(libraryFoldersPath, "utf8");
      additionalLibraries = parseSteamLibraryPaths(vdf);
    } catch {
    }
    const libraries = [this.steamRoot, ...additionalLibraries];
    const results = [];
    for (const lib of libraries) {
      const installPath = node_path.join(lib, "steamapps", "common", GTA5_DIR_NAME);
      const executablePath = node_path.join(installPath, GTA5_EXECUTABLE);
      if (await fileExists(executablePath)) {
        results.push({ source: "steam", installPath, executablePath });
      }
    }
    return results;
  }
}
class EpicGameDetector {
  constructor(manifestsDir) {
    this.manifestsDir = manifestsDir;
  }
  manifestsDir;
  source = "epic";
  async detect() {
    let entries;
    try {
      entries = await promises.readdir(this.manifestsDir);
    } catch {
      return [];
    }
    const results = [];
    for (const entry of entries) {
      if (!entry.endsWith(".item")) {
        continue;
      }
      try {
        const raw = await promises.readFile(node_path.join(this.manifestsDir, entry), "utf8");
        const manifest2 = JSON.parse(raw);
        if (!manifest2.DisplayName?.toLowerCase().includes("grand theft auto v")) {
          continue;
        }
        if (!manifest2.InstallLocation || !manifest2.LaunchExecutable) {
          continue;
        }
        const executablePath = node_path.join(manifest2.InstallLocation, manifest2.LaunchExecutable);
        if (await fileExists(executablePath)) {
          results.push({
            source: "epic",
            installPath: manifest2.InstallLocation,
            executablePath
          });
        }
      } catch {
        continue;
      }
    }
    return results;
  }
}
class RockstarDefaultPathDetector {
  constructor(candidateRoots) {
    this.candidateRoots = candidateRoots;
  }
  candidateRoots;
  source = "rockstar-default";
  async detect() {
    const results = [];
    for (const root of this.candidateRoots) {
      const executablePath = node_path.join(root, GTA5_EXECUTABLE);
      if (await fileExists(executablePath)) {
        results.push({ source: "rockstar-default", installPath: root, executablePath });
      }
    }
    return results;
  }
}
const ROCKSTAR_REGISTRY_KEY = "SOFTWARE\\WOW6432Node\\Rockstar Games\\Grand Theft Auto V";
class RockstarRegistryDetector {
  constructor(readRegistryValue) {
    this.readRegistryValue = readRegistryValue;
  }
  readRegistryValue;
  source = "rockstar-registry";
  async detect() {
    if (process.platform !== "win32") {
      return [];
    }
    const installPath = await this.readRegistryValue(
      "HKLM",
      ROCKSTAR_REGISTRY_KEY,
      "InstallFolder"
    );
    if (!installPath) {
      return [];
    }
    const executablePath = node_path.join(installPath, GTA5_EXECUTABLE);
    if (!await fileExists(executablePath)) {
      return [];
    }
    return [{ source: "rockstar-registry", installPath, executablePath }];
  }
}
class GameDetector {
  constructor(strategies) {
    this.strategies = strategies;
  }
  strategies;
  async detect() {
    const all = (await Promise.all(this.strategies.map((s) => s.detect()))).flat();
    const seen = /* @__PURE__ */ new Set();
    const deduped = [];
    for (const installation of all) {
      if (seen.has(installation.installPath)) {
        continue;
      }
      seen.add(installation.installPath);
      deduped.push(installation);
    }
    return deduped;
  }
  /** Validates a user-provided (manual) game path. */
  async validate(installPath) {
    const executablePath = node_path.join(installPath, GTA5_EXECUTABLE);
    if (await fileExists(executablePath)) {
      return { source: "manual", installPath, executablePath };
    }
    return null;
  }
}
class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
  status;
}
class ApiClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }
  baseUrl;
  async request(path, init = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      // Only declare a JSON content-type when there's actually a body —
      // Fastify rejects a request that declares application/json but sends
      // an empty body (e.g. POST /client/session, which is header-only).
      headers: { ...init.body ? { "content-type": "application/json" } : {}, ...init.headers }
    });
    if (!response.ok) {
      let message = `Request to ${path} failed with status ${response.status}`;
      try {
        const body = await response.json();
        if (body.error) {
          message = body.error;
        }
      } catch {
      }
      throw new ApiError(message, response.status);
    }
    if (response.status === 204) {
      return void 0;
    }
    return await response.json();
  }
  login(username, password) {
    return this.request("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
  }
  refresh(refreshToken) {
    return this.request("/api/v1/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken })
    });
  }
  logout(refreshToken) {
    return this.request("/api/v1/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken })
    });
  }
  getLauncherLatest(channel) {
    return this.request(`/api/v1/launcher/latest?channel=${encodeURIComponent(channel)}`);
  }
  getClientLatest(channel) {
    return this.request(`/api/v1/client/latest?channel=${encodeURIComponent(channel)}`);
  }
  getClientManifest(channel) {
    return this.request(`/api/v1/client/manifest?channel=${encodeURIComponent(channel)}`);
  }
  getServerStatus() {
    return this.request("/api/v1/server/status");
  }
  createClientSession(accessToken) {
    return this.request("/api/v1/client/session", {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` }
    });
  }
}
const resolveSafeInstallPath = manifest.resolveSafePath;
class DownloadVerificationError extends Error {
}
function encodeManifestPath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}
async function compareLocalFiles(installDir, manifest$1) {
  const toDownload = [];
  const upToDate = [];
  for (const file of manifest$1.files) {
    const localPath = resolveSafeInstallPath(installDir, file.path);
    try {
      const localStat = await promises.stat(localPath);
      if (!localStat.isFile() || localStat.size !== file.size) {
        toDownload.push(file);
        continue;
      }
      const localHash = await manifest.hashFile(localPath);
      if (localHash === file.sha256) {
        upToDate.push(file);
      } else {
        toDownload.push(file);
      }
    } catch (error) {
      if (error.code === "ENOENT") {
        toDownload.push(file);
      } else {
        throw error;
      }
    }
  }
  return { toDownload, upToDate };
}
async function downloadOneFile(url, destPath, expected, fetchImpl, maxAttempts, onBytes) {
  const tmpPath = `${destPath}.tmp`;
  await promises.mkdir(node_path.dirname(destPath), { recursive: true });
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let startByte = 0;
    try {
      startByte = (await promises.stat(tmpPath)).size;
    } catch {
      startByte = 0;
    }
    try {
      if (startByte < expected.size) {
        const response = await fetchImpl(url, {
          headers: startByte > 0 ? { range: `bytes=${startByte}-` } : {}
        });
        if (response.status === 416) {
        } else if (response.status === 200 || response.status === 206) {
          const resumed = response.status === 206;
          const writeFromByte = resumed ? startByte : 0;
          if (!response.body) {
            throw new Error(`Download response for ${url} had no body`);
          }
          const nodeStream = node_stream.Readable.fromWeb(response.body);
          const writeStream = node_fs.createWriteStream(tmpPath, {
            flags: writeFromByte > 0 ? "a" : "w"
          });
          let bytesSoFar = writeFromByte;
          nodeStream.on("data", (chunk) => {
            bytesSoFar += chunk.length;
            onBytes?.(bytesSoFar);
          });
          await promises$1.pipeline(nodeStream, writeStream);
        } else {
          throw new Error(`Unexpected HTTP ${response.status} downloading ${url}`);
        }
      }
      const finalStat = await promises.stat(tmpPath);
      if (finalStat.size !== expected.size) {
        throw new DownloadVerificationError(
          `Downloaded size ${finalStat.size} for "${destPath}" does not match expected ${expected.size}`
        );
      }
      const actualHash = await manifest.hashFile(tmpPath);
      if (actualHash !== expected.sha256) {
        throw new DownloadVerificationError(`SHA-256 mismatch after download for "${destPath}"`);
      }
      await promises.rename(tmpPath, destPath);
      return;
    } catch (error) {
      lastError = error;
      if (error instanceof DownloadVerificationError) {
        await promises.rm(tmpPath, { force: true });
      }
      if (attempt === maxAttempts) {
        throw error;
      }
    }
  }
  throw lastError;
}
class UpdateManager {
  constructor(apiClient, options) {
    this.apiClient = apiClient;
    this.options = options;
  }
  apiClient;
  options;
  async update(channel, onProgress) {
    try {
      onProgress?.({
        status: "checking",
        filesCompleted: 0,
        filesTotal: 0,
        bytesDownloaded: 0,
        bytesTotal: 0
      });
      const manifest2 = await this.apiClient.getClientManifest(channel);
      const { toDownload } = await compareLocalFiles(this.options.installDir, manifest2);
      if (toDownload.length === 0) {
        onProgress?.({
          status: "up-to-date",
          filesCompleted: 0,
          filesTotal: 0,
          bytesDownloaded: 0,
          bytesTotal: 0
        });
        return manifest2;
      }
      const bytesTotal = toDownload.reduce((sum, file) => sum + file.size, 0);
      const fetchImpl = this.options.fetchImpl ?? fetch;
      const maxAttempts = this.options.maxAttemptsPerFile ?? 3;
      let bytesDownloaded = 0;
      let filesCompleted = 0;
      for (const file of toDownload) {
        const destPath = resolveSafeInstallPath(this.options.installDir, file.path);
        const url = `${this.options.baseDownloadUrl}/${encodeURIComponent(channel)}/${encodeManifestPath(file.path)}`;
        onProgress?.({
          status: "downloading",
          file: file.path,
          filesCompleted,
          filesTotal: toDownload.length,
          bytesDownloaded,
          bytesTotal
        });
        await downloadOneFile(url, destPath, file, fetchImpl, maxAttempts, (bytes) => {
          onProgress?.({
            status: "downloading",
            file: file.path,
            filesCompleted,
            filesTotal: toDownload.length,
            bytesDownloaded: bytesDownloaded + bytes,
            bytesTotal
          });
        });
        bytesDownloaded += file.size;
        filesCompleted += 1;
      }
      onProgress?.({
        status: "complete",
        filesCompleted,
        filesTotal: toDownload.length,
        bytesDownloaded,
        bytesTotal
      });
      return manifest2;
    } catch (error) {
      onProgress?.({
        status: "error",
        filesCompleted: 0,
        filesTotal: 0,
        bytesDownloaded: 0,
        bytesTotal: 0,
        message: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
}
class LauncherState {
  constructor(deps, config) {
    this.deps = deps;
    this.apiClient = new ApiClient(config.apiBaseUrl);
  }
  deps;
  apiClient;
  accessToken = null;
  username = null;
  async getConfig() {
    return this.deps.configStore.load();
  }
  async updateConfig(patch) {
    const next = await this.deps.configStore.update(patch);
    if (patch.apiBaseUrl) {
      this.apiClient = new ApiClient(next.apiBaseUrl);
    }
    return next;
  }
  getAuthState() {
    return { isAuthenticated: this.accessToken !== null, username: this.username };
  }
  /** Attempts to restore a session from a persisted refresh token — called once on launcher start. */
  async restoreSession() {
    const refreshToken = await this.deps.secureStorage.loadRefreshToken();
    if (!refreshToken) {
      return this.getAuthState();
    }
    try {
      const tokens = await this.apiClient.refresh(refreshToken);
      this.accessToken = tokens.accessToken;
      await this.deps.secureStorage.saveRefreshToken(tokens.refreshToken);
    } catch {
      await this.deps.secureStorage.clear();
    }
    return this.getAuthState();
  }
  async login(username, password) {
    const tokens = await this.apiClient.login(username, password);
    this.accessToken = tokens.accessToken;
    this.username = username;
    await this.deps.secureStorage.saveRefreshToken(tokens.refreshToken);
    return this.getAuthState();
  }
  async logout() {
    this.accessToken = null;
    this.username = null;
    await this.deps.secureStorage.clear();
    return this.getAuthState();
  }
  detectGame() {
    return this.deps.gameDetector.detect();
  }
  async validateGamePath(path) {
    const installation = await this.deps.gameDetector.validate(path);
    if (installation) {
      await this.selectInstallation(installation);
    }
    return installation;
  }
  /** Persists a chosen GTA V installation and, the first time, defaults `clientPath` alongside it. */
  async selectInstallation(installation) {
    const current = await this.getConfig();
    return this.deps.configStore.update({
      gamePath: installation.installPath,
      clientPath: current.clientPath || this.deps.defaultClientDir
    });
  }
  async checkForUpdates(onProgress) {
    const config = await this.getConfig();
    if (!config.clientPath) {
      throw new Error("No client install path configured — detect or select a GTA V install first");
    }
    const baseDownloadUrl = this.deps.baseDownloadUrlOverride ?? `${config.apiBaseUrl}/api/v1/client/files`;
    const updateManager = new UpdateManager(this.apiClient, {
      installDir: config.clientPath,
      baseDownloadUrl
    });
    return updateManager.update(config.channel, onProgress);
  }
  getServerStatus() {
    return this.apiClient.getServerStatus();
  }
}
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
function registerIpcHandlers(ipcMain2, state, webContents) {
  ipcMain2.handle(IpcChannels.getConfig, () => state.getConfig());
  ipcMain2.handle(IpcChannels.updateConfig, (_event, patch) => state.updateConfig(patch));
  ipcMain2.handle(
    IpcChannels.login,
    (_event, username, password) => state.login(username, password)
  );
  ipcMain2.handle(IpcChannels.logout, () => state.logout());
  ipcMain2.handle(IpcChannels.getAuthState, () => state.getAuthState());
  ipcMain2.handle(IpcChannels.detectGame, () => state.detectGame());
  ipcMain2.handle(
    IpcChannels.validateGamePath,
    (_event, path) => state.validateGamePath(path)
  );
  ipcMain2.handle(
    IpcChannels.selectInstallation,
    (_event, installation) => state.selectInstallation(installation)
  );
  ipcMain2.handle(
    IpcChannels.checkForUpdates,
    () => state.checkForUpdates((event) => {
      webContents.send(IpcChannels.updateProgress, event);
    })
  );
  ipcMain2.handle(IpcChannels.getServerStatus, () => state.getServerStatus());
}
const execFileAsync = node_util.promisify(node_child_process.execFile);
const readWindowsRegistryValue = async (hive, key, valueName) => {
  try {
    const { stdout } = await execFileAsync("reg", ["query", `${hive}\\${key}`, "/v", valueName]);
    const match = stdout.match(/REG_SZ\s+(.+)\r?$/m);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
};
function createDefaultGameDetectionStrategies() {
  if (process.platform !== "win32") {
    return [];
  }
  const programFiles = process.env["ProgramFiles"] ?? "C:\\Program Files";
  const programFilesX86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
  const programData = process.env["ProgramData"] ?? "C:\\ProgramData";
  return [
    new SteamGameDetector(node_path.join(programFilesX86, "Steam")),
    new EpicGameDetector(node_path.join(programData, "Epic", "EpicGamesLauncher", "Data", "Manifests")),
    new RockstarDefaultPathDetector([
      node_path.join(programFiles, "Rockstar Games", "Grand Theft Auto V"),
      node_path.join(programFilesX86, "Rockstar Games", "Grand Theft Auto V")
    ]),
    new RockstarRegistryDetector(readWindowsRegistryValue)
  ];
}
const { app, BrowserWindow, ipcMain, safeStorage } = electron;
async function createWindow() {
  const configStore = new ConfigStore(node_path.join(app.getPath("userData"), "config.json"));
  const config = await configStore.load();
  const secureStorage = new SecureStorage(
    safeStorage,
    node_path.join(app.getPath("userData"), "session.enc")
  );
  const gameDetector = new GameDetector(createDefaultGameDetectionStrategies());
  const state = new LauncherState(
    {
      configStore,
      secureStorage,
      gameDetector,
      baseDownloadUrlOverride: process.env.MZZPLORK_BASE_DOWNLOAD_URL,
      defaultClientDir: node_path.join(app.getPath("userData"), "client")
    },
    config
  );
  await state.restoreSession();
  const mainWindow = new BrowserWindow({
    width: 1024,
    height: 680,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: node_path.join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  registerIpcHandlers(ipcMain, state, mainWindow.webContents);
  mainWindow.once("ready-to-show", () => mainWindow.show());
  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await mainWindow.loadFile(node_path.join(__dirname, "../renderer/index.html"));
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
