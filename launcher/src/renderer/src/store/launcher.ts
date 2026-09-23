import { defineStore } from "pinia";
import type {
  GameInstallation,
  LauncherConfig,
  ServerStatus,
  UpdateProgressEvent,
} from "../../../shared/types.js";

export const useLauncherStore = defineStore("launcher", {
  state: () => ({
    config: null as LauncherConfig | null,
    installations: [] as GameInstallation[],
    serverStatus: null as ServerStatus | null,
    updateProgress: null as UpdateProgressEvent | null,
    error: null as string | null,
  }),
  actions: {
    async loadConfig(): Promise<void> {
      this.config = await window.mzzplork.getConfig();
    },
    async updateConfig(patch: Partial<LauncherConfig>): Promise<void> {
      this.config = await window.mzzplork.updateConfig(patch);
    },
    async detectGame(): Promise<GameInstallation[]> {
      this.installations = await window.mzzplork.detectGame();
      return this.installations;
    },
    async selectInstallation(installation: GameInstallation): Promise<void> {
      this.config = await window.mzzplork.selectInstallation(installation);
    },
    async validateGamePath(path: string): Promise<GameInstallation | null> {
      const result = await window.mzzplork.validateGamePath(path);
      if (result) {
        await this.loadConfig();
      }
      return result;
    },
    async refreshServerStatus(): Promise<void> {
      this.serverStatus = await window.mzzplork.getServerStatus();
    },
    subscribeToUpdateProgress(): () => void {
      return window.mzzplork.onUpdateProgress((event) => {
        this.updateProgress = event;
      });
    },
    async checkForUpdates(): Promise<void> {
      this.error = null;
      try {
        await window.mzzplork.checkForUpdates();
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
        throw error;
      }
    },
  },
});
