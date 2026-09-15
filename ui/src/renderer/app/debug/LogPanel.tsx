import { useMemo, useState } from "react";
import { buildLogRows, movementRows, resolveStatus, statusRefsFor, totalsRows } from "../../../shared/presenters.js";
import { fmt } from "../../../shared/format.js";
import type { LogEventView, SessionView, StatusInfoView } from "../../../shared/engine-types.js";

/**
 * COMBAT LOG PANEL — the primary debugging view. Full LogEvent fidelity: every engine
 * field is visible in the expandable detail; chronological; icon + text hierarchy.
 */
const GLYPH: Record<string, string> = { action: "▸", support: "⇢", damage: "✱", status: "✚", resource: "◆", fixed: "◈", tick: "↻", movement: "→" };

function Row(props: {
  ev: LogEventView;
  index: number;
  selected: boolean;
  onSelect: (i: number) => void;
  catalog: Record<string, StatusInfoView>;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const cat = props.ev.actionType === "status_tick" ? "tick" : props.ev.supportAttack ? "support" : props.ev.fixedDamage !== undefined || props.ev.statusTick ? "fixed" : "action";
  const cls = `event cat-${cat}`;
  const statuses = props.ev.statusesApplied.length > 0 ? ` <span class="plus">+${props.ev.statusesApplied.join(",")}</span>` : "";
  const expired = props.ev.statusesExpired.length > 0 ? ` <span class="expired">−${props.ev.statusesExpired.join(",")}</span>` : "";
  const refRows = statusRefsFor(props.ev);
  return (
    <>
      <button
        className={`${cls}${props.selected ? " selected" : ""}`}
        onClick={() => {
          setOpen((o) => !o);
          props.onSelect(props.index);
        }}
        dangerouslySetInnerHTML={{
          __html: `<span class="glyph">${GLYPH[cat]}</span>R${props.ev.round} T${props.ev.turn} ${props.ev.unit}.${props.ev.action} → ${props.ev.target} <span class="dmg">${props.ev.finalDamage} dmg</span>${props.ev.critical ? ' <span class="crit">CRIT</span>' : ""}${props.ev.supportAttack ? " [support]" : ""}${statuses}${expired}`,
        }}
      />
      {open && (
        <div className="event-detail">
          <table>
            <tbody>
              {detailFields(props.ev).map(([label, value]) => {
                const refRow = refRows.find((r) => r.label === label);
                return (
                  <tr key={label}>
                    <td>{label}</td>
                    <td>
                      {refRow ? (
                        refRow.refs.map((r, i) => (
                          <StatusChip key={i} statusId={r.statusId} source={r.source} stacks={r.stacks} catalog={props.catalog} />
                        ))
                      ) : (
                        value
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/**
 * Hover tooltip for a status reference. Content comes ONLY from the authoritative catalog
 * (engine registry via main) — unknown ids render as plain text and never fabricate content.
 */
function StatusChip(props: { statusId: string; source?: string; stacks?: number; catalog: Record<string, StatusInfoView> }): JSX.Element {
  const info = resolveStatus(props.statusId, props.catalog);
  if (!info) return <>{props.statusId}</>;
  const duration = info.durationRounds === null ? "permanent" : `${info.durationRounds} turn(s)`;
  const stacking = info.maxStacks !== undefined ? `max ${info.maxStacks}` : "unbounded";
  return (
    <span className="status-chip" tabIndex={0} aria-label={`status ${info.name}`}>
      {props.statusId}
      {props.stacks !== undefined ? ` (${props.stacks})` : ""}
      <span className="tooltip">
        <b>{info.name}</b> <span className="muted">[{info.category}]</span>
        {info.note && <span className="tooltip-note">{info.note}</span>}
        <span className="tooltip-row">Duration: {duration}</span>
        <span className="tooltip-row">Stacks: {info.stackable ? stacking : "not stackable"}</span>
        <span className="tooltip-row">Cleansing: {info.purgeable ? "can be cleansed" : "cannot be cleansed"}</span>
        {props.source && <span className="tooltip-row">Source: {props.source}</span>}
      </span>
    </span>
  );
}

function detailFields(ev: LogEventView): [string, string][] {
  const out: [string, string][] = [];
  const put = (k: keyof LogEventView | string, v: unknown) => out.push([String(k), v === undefined || v === null ? "—" : Array.isArray(v) ? (v.length ? JSON.stringify(v) : "[]") : String(v)]);
  // Numeric fields render through the max-2-decimal formatter (display-only; engine values untouched).
  const putN = (k: keyof LogEventView | string, v: unknown) => out.push([String(k), v === undefined || v === null ? "—" : fmt(v)]);
  putN("baseDamage", ev.baseDamage);
  putN("mitigatedDamage", ev.mitigatedDamage);
  putN("attackerAtk", ev.attackerAtk);
  putN("targetDef", ev.targetDef);
  put("critical", ev.critical);
  putN("critMultiplier", ev.critMultiplier);
  put("weaknessExploited", ev.weaknessExploited);
  putN("phaseMult", ev.phaseMult);
  putN("bonusBracket", ev.bonusBracket);
  putN("reductionMult", ev.reductionMult);
  putN("stabilityDamage", ev.stabilityDamage);
  put("targetStabilityAfter", ev.targetStabilityAfter);
  put("exposed", ev.exposed);
  putN("finalDamage", ev.finalDamage);
  put("killingBlow", ev.killingBlow);
  put("confectance", ev.confectance ? `before ${fmt(ev.confectance.before)} → after ${fmt(ev.confectance.after)} (cost ${fmt(ev.confectance.cost)})` : "—");
  put("cooldownAfter", JSON.stringify(ev.cooldownAfter));
  put("statusesApplied", ev.statusesApplied);
  put("appliedSources", ev.appliedSources);
  put("effectSources", ev.effectSources);
  put("statusesExpired", ev.statusesExpired);
  put("upgradeStacks", ev.upgradeStacks);
  put("statusTick", ev.statusTick ? `${ev.statusTick.statusId}: ${fmt(ev.statusTick.amount)}` : "—");
  putN("fixedDamage", ev.fixedDamage);
  return out;
}

export function LogPanel(props: { session: SessionView; selected: number | null; onSelect: (i: number | null) => void }): JSX.Element {
  const rows = useMemo(() => buildLogRows(props.session.result.log), [props.session]);
  const moves = useMemo(() => movementRows(props.session), [props.session]);

  return (
    <div className="log-scroll">
      <div className="totals">
        {totalsRows(props.session.result).map((t) => (
          <span key={t.label} className="kv">
            {t.label}: <b>{t.value}</b>
          </span>
        ))}
      </div>
      {props.session.result.warnings.length > 0 && (
        <div className="buff-list">
          <span className="w">⚠ Warnings (unverified values used):</span>
          <ul>
            {props.session.result.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      {moves.length > 0 && (
        <>
          <h2>Movement (engine-computed)</h2>
          {moves.map((m, i) => (
            <div key={i} className="event cat-movement">
              <span className="glyph">→</span>R{m.round} {m.unitId} {m.from} → {m.to} (cost {m.cost}) <span className="muted">{m.note}</span>
            </div>
          ))}
        </>
      )}
      <h2>Events</h2>
      <div className="events">
        {rows.map((row) => (
          <Row
            key={row.index}
            ev={row.event}
            index={row.index}
            selected={props.selected === row.index}
            onSelect={props.onSelect}
            catalog={props.session.statuses ?? {}}
          />
        ))}
      </div>
    </div>
  );
}