import type { Manifest } from "@mzzplork/manifest";
import type { ServerStatus } from "../shared/types.js";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface VersionInfo {
  version: string;
  channel: string;
  build: number;
  publishedAt: string;
}

export interface LauncherVersionInfo extends VersionInfo {
  downloadUrl: string;
  sha256: string;
}

/**
 * Thin typed client for the Phase 1 backend's `/api/v1/*` routes (see
 * docs/protocol/authentication.md, docs/protocol/manifest.md). Runs only in
 * the launcher's main process — the renderer never calls this directly.
 */
export class ApiClient {
  constructor(private readonly baseUrl: string) {}

  private async request<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      // Only declare a JSON content-type when there's actually a body —
      // Fastify rejects a request that declares application/json but sends
      // an empty body (e.g. POST /client/session, which is header-only).
      headers: { ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
    });

    if (!response.ok) {
      let message = `Request to ${path} failed with status ${response.status}`;
      try {
        const body = (await response.json()) as { error?: string };
        if (body.error) {
          message = body.error;
        }
      } catch {
        // response body wasn't JSON — keep the default message
      }
      throw new ApiError(message, response.status);
    }

    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  login(username: string, password: string): Promise<IssuedTokens> {
    return this.request("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  }

  refresh(refreshToken: string): Promise<IssuedTokens> {
    return this.request("/api/v1/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    });
  }

  logout(refreshToken: string): Promise<void> {
    return this.request("/api/v1/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    });
  }

  getLauncherLatest(channel: string): Promise<LauncherVersionInfo> {
    return this.request(`/api/v1/launcher/latest?channel=${encodeURIComponent(channel)}`);
  }

  getClientLatest(channel: string): Promise<VersionInfo> {
    return this.request(`/api/v1/client/latest?channel=${encodeURIComponent(channel)}`);
  }

  getClientManifest(channel: string): Promise<Manifest> {
    return this.request(`/api/v1/client/manifest?channel=${encodeURIComponent(channel)}`);
  }

  getServerStatus(): Promise<ServerStatus> {
    return this.request("/api/v1/server/status");
  }

  createClientSession(accessToken: string): Promise<{ token: string; expiresIn: number }> {
    return this.request("/api/v1/client/session", {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
    });
  }
}
