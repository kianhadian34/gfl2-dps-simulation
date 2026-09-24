import type { SetupState } from "./setup.js";

/**
 * SETUP PERSISTENCE (2026) — the user's equipment/rotation configuration survives app restarts,
 * so a simulation run doesn't force re-entering everything: returning to setup reopens the exact
 * configuration. Plain localStorage round-trip of the SetupState; storage is injected so the
 * helpers stay testable in node (no window dependency).
 *
 * The schema is versioned in the KEY (`v1`): if a future setup shape changes, bump the key and
 * old entries are naturally ignored (parsed as null → DEFAULT_SETUP).
 */

export const SETUP_STORAGE_KEY = "gfl2-sim.setup.v1";

/** Minimal Storage-like surface the persistence needs (localStorage in the renderer). */
export interface SetupPersistence {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Minimal shape guard — enough to reject corrupt/mismatched payloads (deep validation is not needed:
 *  the existing equipment/validation helpers re-validate on use). */
function isSetupLike(v: unknown): v is SetupState {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.turns === "number" &&
    typeof o.seed === "number" &&
    typeof o.gridEnabled === "boolean" &&
    typeof o.debug === "object" &&
    o.debug !== null &&
    Array.isArray(o.characters) &&
    o.characters.every(
      (ch) =>
        typeof ch === "object" &&
        ch !== null &&
        typeof (ch as { id?: unknown }).id === "string" &&
        typeof (ch as { name?: unknown }).name === "string" &&
        typeof (ch as { selected?: unknown }).selected === "boolean",
    )
  );
}

/** Load the persisted setup; null when absent, corrupt, or from a different schema version. */
export function loadSetup(storage: Pick<SetupPersistence, "getItem">): SetupState | null {
  try {
    const raw = storage.getItem(SETUP_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isSetupLike(parsed) ? parsed : null;
  } catch {
    return null; // corrupt JSON / storage failure → caller falls back to DEFAULT_SETUP
  }
}

/** Persist the current setup (best-effort; quota/security failures are swallowed). */
export function saveSetup(storage: Pick<SetupPersistence, "setItem">, setup: SetupState): void {
  try {
    storage.setItem(SETUP_STORAGE_KEY, JSON.stringify(setup));
  } catch {
    // storage unavailable/full — persistence is best-effort, never crashes the app
  }
}

/** Forget the persisted setup (e.g. an explicit reset in the future). */
export function clearSetup(storage: Pick<SetupPersistence, "removeItem">): void {
  try {
    storage.removeItem(SETUP_STORAGE_KEY);
  } catch {
    // best-effort
  }
}