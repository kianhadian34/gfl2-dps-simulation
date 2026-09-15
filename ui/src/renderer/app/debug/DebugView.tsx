import { useState } from "react";
import type { SessionView } from "../../../shared/engine-types.js";
import { GridPanel } from "./GridPanel.js";
import { LogPanel } from "./LogPanel.js";
import { RotationPanel } from "./RotationPanel.js";

/**
 * SIMULATION / DEBUG VIEW — three internal panels inside the ONE window, sharing the
 * single authoritative session. Selection is shared React state (one tree, one session).
 */
export function DebugView(props: {
  session: SessionView | null;
  error: string | null;
  onReset: () => void;
  onOpenScenario: () => void;
}): JSX.Element {
  const [selected, setSelected] = useState<number | null>(null);
  const selectedEvent = props.session && selected != null ? props.session.result.log[selected] : undefined;

  return (
    <div className="app">
      <div className="toolbar">
        <button onClick={props.onReset}>← Setup</button>
        <button onClick={props.onOpenScenario}>Open…</button>
        <span className="muted">{props.session ? `run ${props.session.runId} · seed ${props.session.result.seed} · ${props.session.result.turns} turns · ${props.session.result.log.length} events` : "no session"}</span>
      </div>
      {props.error && <div className="error">{props.error}</div>}
      {props.session && (
        <div className="debug-panels">
          <div className="panel panel-grid">
            <h2>Grid</h2>
            <GridPanel session={props.session} selectedEvent={selectedEvent} />
          </div>
          <div className="panel panel-log">
            <h2>Combat Log</h2>
            <LogPanel session={props.session} selected={selected} onSelect={setSelected} />
          </div>
          <div className="panel panel-rotation">
            <h2>Rotation</h2>
            <RotationPanel session={props.session} selectedEvent={selectedEvent} onSelect={setSelected} />
          </div>
        </div>
      )}
    </div>
  );
}