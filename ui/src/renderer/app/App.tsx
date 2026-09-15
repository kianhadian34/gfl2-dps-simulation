import { useRef, useState } from "react";
import { useSession } from "../../shared/use-sim.js";
import { buildScenario, DEFAULT_SETUP, SetupStore, type SetupState } from "../../shared/setup.js";
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
 */
export function App(): JSX.Element {
  const { session, error, run, openScenario } = useSession();
  const [view, setView] = useState<"setup" | "debug">("setup");
  const storeRef = useRef<SetupStore | null>(null);
  if (!storeRef.current) storeRef.current = new SetupStore(DEFAULT_SETUP);
  const [setup, setSetup] = useState<SetupState>(storeRef.current.get());

  const commitSetup = (next: SetupState): void => {
    storeRef.current!.set(next);
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