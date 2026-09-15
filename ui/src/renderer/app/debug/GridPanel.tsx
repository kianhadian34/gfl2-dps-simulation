import { movementRows } from "../../../shared/presenters.js";
import type { LogEventView, SessionView } from "../../../shared/engine-types.js";

/**
 * GRID PANEL — pure presentation of ENGINE-computed spatial facts (session.facts).
 * No grid math here: heights/blocked/boss tiles/tokens come from the main process.
 */
export function GridPanel(props: { session: SessionView; selectedEvent?: LogEventView }): JSX.Element {
  const facts = props.session.facts ?? null;
  const actingUnit = props.selectedEvent?.unit;

  if (!facts) {
    return <p className="muted">This scenario has no grid configuration (grid toggle was off).</p>;
  }

  const cells: JSX.Element[] = [];
  for (let y = 0; y < facts.size; y++) {
    for (let x = 0; x < facts.size; x++) {
      const key = `${x},${y}`;
      const f = facts.cells[key];
      const token = facts.tokens.find((t) => t.coord.x === x && t.coord.y === y);
      const isLadderEnd = facts.ladders.some((l) => l.ground.x === x && l.ground.y === y);
      const isBossCenter = facts.bossCenter.x === x && facts.bossCenter.y === y;
      const classes = [
        "cell",
        f?.height === "high" ? "high" : "",
        f?.blocked ? "blocked" : "",
        f?.boss ? "boss" : "",
        isBossCenter ? "bossCenter" : "",
        isLadderEnd ? "ladderEnd" : "",
      ]
        .filter(Boolean)
        .join(" ");
      cells.push(
        <div key={key} className={classes} title={`(${x},${y}) ${f?.height ?? ""}`}>
          {token ? (
            <span className={`token${token.height === "high" ? " highground" : ""}${actingUnit === token.unitId ? " acting" : ""}`} title={token.unitId}>
              {token.unitId.slice(0, 1).toUpperCase()}
            </span>
          ) : isBossCenter ? (
            <span title="BOSS (3x3 footprint, center tile)">♛</span>
          ) : isLadderEnd ? (
            <span title="Ladder">⤒</span>
          ) : null}
        </div>,
      );
    }
  }

  return (
    <>
      <div className="board">{cells}</div>
      <div className="legend-panel">
        <span className="legend"><span className="swatch" style={{ background: "var(--bg-2)" }} /> Ground</span>
        <span className="legend"><span className="swatch" style={{ background: "#1f3a3f" }} /> High Ground</span>
        <span className="legend"><span className="swatch" style={{ background: "#26241c" }} /> Blocked</span>
        <span className="legend"><span className="swatch" style={{ background: "#3d1d24" }} /> Boss (3×3)</span>
        <span className="legend"><span className="swatch" style={{ background: "var(--accent)" }} /> Unit</span>
      </div>
      <h2>Movement (engine-computed)</h2>
      {props.session.movements.length === 0 ? (
        <p className="muted">No scripted moves in this scenario.</p>
      ) : (
        <table className="move-table">
          <tbody>
            {movementRows(props.session).map((m, i) => (
              <tr key={i}>
                <td className="muted">R{m.round}</td>
                <td>{m.unitId}</td>
                <td>{m.from} → {m.to}</td>
                <td>cost {m.cost}</td>
                <td className="muted">{m.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted">Select a combat-log event to highlight the acting unit.</p>
    </>
  );
}