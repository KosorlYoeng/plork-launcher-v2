export const IpcChannels = {
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
  updateProgress: "update:progress",
} as const;
