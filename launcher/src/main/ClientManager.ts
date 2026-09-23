import type { GameInstallation } from "../shared/types.js";

/**
 * Install/validate/prepare/start the MzzPlork game client (plan §6
 * ClientManager). There is no MzzPlork client binary to start yet —
 * CitizenFX integration (Phase 3, `docs/plan.md`) is blocked on a
 * source-provenance decision the user hasn't made (see
 * docs/architecture/repository-audit.md). This stub exists so the rest of
 * the launcher (UI, IPC surface, ProcessManager) has a stable shape to call
 * against once a real client exists, rather than faking one.
 */
export class ClientManagerNotAvailableError extends Error {}

export class ClientManager {
  async start(_installation: GameInstallation): Promise<never> {
    throw new ClientManagerNotAvailableError(
      "No MzzPlork client is available yet — CitizenFX integration is blocked pending a source-provenance decision.",
    );
  }
}
