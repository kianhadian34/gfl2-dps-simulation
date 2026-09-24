import { useRef, useState } from "react";
import { useSession } from "../../shared/use-sim.js";
import { buildScenario, DEFAULT_SETUP, SetupStore, type SetupState } from "../../shared/setup.js";
import { loadSetup, saveSetup } from "../../shared/persist.js";
import { SetupScreen } from "./setup/SetupScreen.js";
import { DebugView } from "./debug/DebugView.js";
import type { ScenarioView } from "../../shared/engine-types.js";

/**
 * ONE app window: Simulation Setup screen → Simulation/Debug view (Grid, Combat Log,
 * Rotation panels inside the same window, sharing the single authoritative session).
 *
 * Setup state is owned HERE (one authoritative SetupStore for the application session):
 * returning from the Debug view reopens Setup with the exact configuration the user last
 * entered/ran — never a reset to DEFAULT_SETUP. Session results never overwrite it.
 *
 * PERSISTENCE (2026): the setup is additionally cached in localStorage on every change and
 * restored on app start, so the user's equipment/rotation survives restarts — no need to
 * re-enter everything for the next simulation run.
 */
export function App(): JSX.Element {
  const { session, error, run, openScenario } = useSession();
  const [view, setView] = useState<"setup" | "debug">("setup");
  const storeRef = useRef<SetupStore | null>(null);
  const initial = loadSetup(window.localStorage) ?? DEFAULT_SETUP;
  if (!storeRef.current) storeRef.current = new SetupStore(initial);
  const [setup, setSetup] = useState<SetupState>(storeRef.current.get());

  const commitSetup = (next: SetupState): void => {
    storeRef.current!.set(next);
    saveSetup(window.localStorage, next);
    setSetup(next);
  };

  const start = async (scenario: ScenarioView): Promise<void> => {
    await run(scenario);
    setView("debug");
  };

  return view === "setup" ? (
    <SetupScreen
      setup={setup}
      onChange={commitSetup}
      error={error}
      onStart={start}
      onOpenScenario={openScenario}
    />
  ) : (
    <DebugView session={session} error={error} onReset={() => setView("setup")} onOpenScenario={openScenario} />
  );
}

export { buildScenario };