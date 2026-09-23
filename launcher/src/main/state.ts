import { ApiClient } from "./ApiClient.js";
import type { ConfigStore } from "./config.js";
import type { SecureStorage } from "./SecureStorage.js";
import type { GameDetector } from "./GameDetector.js";
import { UpdateManager } from "./UpdateManager.js";
import type { AuthState, GameInstallation, LauncherConfig, UpdateProgressEvent } from "../shared/types.js";

export interface LauncherStateDeps {
  configStore: ConfigStore;
  secureStorage: SecureStorage;
  gameDetector: GameDetector;
  /** Base URL manifest files are downloaded from — see the Phase 2 plan's documented backend gap (BE-007). */
  baseDownloadUrl: string;
  /**
   * Where the MzzPlork client itself gets installed — distinct from
   * `gamePath` (the GTA V install, owned by Steam/Epic/Rockstar). Used as
   * the default for `clientPath` the first time a game install is
   * selected, so `checkForUpdates` always has somewhere to install into
   * without the user having to separately configure it.
   */
  defaultClientDir: string;
}

/**
 * Composes the launcher's main-process services (ApiClient, SecureStorage,
 * GameDetector, UpdateManager) and holds the in-memory session (access
 * token — never persisted; refresh token — persisted encrypted via
 * SecureStorage). IPC handlers in src/main/ipc/* are thin wrappers around
 * this class's methods.
 */
export class LauncherState {
  private apiClient: ApiClient;
  private accessToken: string | null = null;
  private username: string | null = null;

  constructor(private readonly deps: LauncherStateDeps, config: LauncherConfig) {
    this.apiClient = new ApiClient(config.apiBaseUrl);
  }

  async getConfig(): Promise<LauncherConfig> {
    return this.deps.configStore.load();
  }

  async updateConfig(patch: Partial<LauncherConfig>): Promise<LauncherConfig> {
    const next = await this.deps.configStore.update(patch);
    if (patch.apiBaseUrl) {
      this.apiClient = new ApiClient(next.apiBaseUrl);
    }
    return next;
  }

  getAuthState(): AuthState {
    return { isAuthenticated: this.accessToken !== null, username: this.username };
  }

  /** Attempts to restore a session from a persisted refresh token — called once on launcher start. */
  async restoreSession(): Promise<AuthState> {
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

  async login(username: string, password: string): Promise<AuthState> {
    const tokens = await this.apiClient.login(username, password);
    this.accessToken = tokens.accessToken;
    this.username = username;
    await this.deps.secureStorage.saveRefreshToken(tokens.refreshToken);
    return this.getAuthState();
  }

  async logout(): Promise<AuthState> {
    this.accessToken = null;
    this.username = null;
    await this.deps.secureStorage.clear();
    return this.getAuthState();
  }

  detectGame(): Promise<GameInstallation[]> {
    return this.deps.gameDetector.detect();
  }

  async validateGamePath(path: string): Promise<GameInstallation | null> {
    const installation = await this.deps.gameDetector.validate(path);
    if (installation) {
      await this.selectInstallation(installation);
    }
    return installation;
  }

  /** Persists a chosen GTA V installation and, the first time, defaults `clientPath` alongside it. */
  async selectInstallation(installation: GameInstallation): Promise<LauncherConfig> {
    const current = await this.getConfig();
    return this.deps.configStore.update({
      gamePath: installation.installPath,
      clientPath: current.clientPath || this.deps.defaultClientDir,
    });
  }

  async checkForUpdates(onProgress?: (event: UpdateProgressEvent) => void) {
    const config = await this.getConfig();
    if (!config.clientPath) {
      throw new Error("No client install path configured — detect or select a GTA V install first");
    }
    const updateManager = new UpdateManager(this.apiClient, {
      installDir: config.clientPath,
      baseDownloadUrl: this.deps.baseDownloadUrl,
    });
    return updateManager.update(config.channel, onProgress);
  }

  getServerStatus() {
    return this.apiClient.getServerStatus();
  }
}
