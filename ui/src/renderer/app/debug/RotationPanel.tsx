import { useMemo } from "react";
import { rotationStates } from "../../../shared/presenters.js";
import type { LogEventView, SessionView } from "../../../shared/engine-types.js";

/**
 * ROTATION PANEL — shows exactly what the scripted rotation is doing: completed /
 * current / upcoming, derived ONLY from engine-observed log events. Support Actions
 * are represented below the panel header with selectable links.
 */
const STATE_GLYPH: Record<string, string> = { completed: "✓", current: "▶", upcoming: "○", skipped: "✗" };
const STATE_LABEL: Record<string, string> = { completed: "completed", current: "current", upcoming: "upcoming", skipped: "skipped" };

export function RotationPanel(props: {
  session: SessionView;
  selectedEvent?: LogEventView;
  onSelect: (i: number | null) => void;
}): JSX.Element {
  const members = useMemo(() => rotationStates(props.session.scenario, props.session.result.log), [props.session]);
  const selectedAction = props.selectedEvent?.action;

  return (
    <div className="rot-scroll">
      {members.map((m) => {
        const supports = props.session.result.log.filter((ev) => ev.supportAttack && ev.unit === m.characterId);
        return (
          <div className="member" key={m.characterId}>
            <div className="mname">
              {m.characterId} <span className="badge">{supports.length} support{supports.length === 1 ? "" : "s"}</span>
            </div>
            <ul className="rotation">
              {m.slots.map((s, i) => (
                <li key={i} className={s.action === selectedAction ? "current" : s.state}>
                  <span className="state" title={STATE_LABEL[s.state]}>
                    {STATE_GLYPH[s.state]}
                  </span>
                  <span>
                    {s.slot}
                    {s.action && s.action !== s.slot ? ` → ${s.action}` : ""}
                    {s.round !== undefined ? ` (R${s.round} T${s.turn})` : ""}
                  </span>
                </li>
              ))}
            </ul>
            {supports.map((ev, j) => (
              <div
                key={j}
                className="support-note"
                onClick={() => props.onSelect(props.session.result.log.indexOf(ev))}
              >
                ⇢ R{ev.round} Support Action — {ev.finalDamage} dmg
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}