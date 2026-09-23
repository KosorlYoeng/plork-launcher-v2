export interface LauncherConfig {
  environment: "development" | "production";
  apiBaseUrl: string;
  channel: string;
  gamePath: string;
  clientPath: string;
  autoUpdate: boolean;
}

export interface GameInstallation {
  source: "steam" | "epic" | "rockstar-default" | "rockstar-registry" | "manual";
  installPath: string;
  executablePath: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  username: string | null;
}

export type UpdateEventStatus =
  | "checking"
  | "up-to-date"
  | "downloading"
  | "verifying"
  | "complete"
  | "error";

export interface UpdateProgressEvent {
  status: UpdateEventStatus;
  file?: string;
  filesCompleted: number;
  filesTotal: number;
  bytesDownloaded: number;
  bytesTotal: number;
  message?: string;
}

export interface ServerStatus {
  online: boolean;
  players: number;
  maxPlayers: number;
  version: string | null;
}
