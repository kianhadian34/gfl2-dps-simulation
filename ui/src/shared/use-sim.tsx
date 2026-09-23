import { useEffect, useState } from "react";
import type { SessionView, WeaponView, CommonKeyListResult } from "./engine-types.js";

/**
 * Shared session state for the single application window. The main process owns the
 * authoritative session; this hook subscribes to it and exposes actions.
 * v0.1: no automatic simulation on launch — the Simulation Setup screen drives runs.
 */
export function useSession(): {
  session: SessionView | null;
  error: string | null;
  run: (scenario: SessionView["scenario"]) => Promise<SessionView>;
  openScenario: () => Promise<void>;
  listCharacters: () => Promise<Array<{ id: string; name: string; mobility?: number }>>;
  /** Engine-sourced weapon list (plumbing for future weapon/calibration controls). */
  listWeapons: () => Promise<WeaponView[]>;
  /** Engine-sourced Common Key list + 3-slot maximum (plumbing for future key controls). */
  listCommonKeys: () => Promise<CommonKeyListResult>;
} {
  const [session, setSession] = useState<SessionView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    window.sim
      .getSession()
      .then((s) => {
        if (alive && s) setSession(s);
      })
      .catch((e: unknown) => alive && setError(String(e)));
    window.sim.onSessionUpdate((s) => setSession(s));
    return () => {
      alive = false;
    };
  }, []);

  const run = async (scenario: SessionView["scenario"]): Promise<SessionView> => {
    setError(null);
    try {
      return await window.sim.run(scenario);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  };

  const openScenario = async (): Promise<void> => {
    setError(null);
    try {
      const s = await window.sim.openScenario();
      if (s) setSession(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const listCharacters = (): Promise<Array<{ id: string; name: string }>> => window.sim.listCharacters();

  const listWeapons = (): Promise<WeaponView[]> => window.sim.listWeapons();

  const listCommonKeys = (): Promise<CommonKeyListResult> => window.sim.listCommonKeys();

  return { session, error, run, openScenario, listCharacters, listWeapons, listCommonKeys };
}