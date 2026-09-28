import { useMemo, useState } from "react";
import { appliedStatusLabels, buildLogRows, effectSourceRefs, humanizeId, movementRows, resolveStatus, statusRefsFor, statusTooltipLines, totalsRows } from "../../../shared/presenters.js";
import { EffectSourceRef } from "../../../shared/effect-source-ref.js";
import { fmt } from "../../../shared/format.js";
import type { LogEventView, SessionView, StatusInfoView, EffectSourceInfoView } from "../../../shared/engine-types.js";

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
  effectDefs?: Record<string, EffectSourceInfoView>;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const cat = props.ev.actionType === "status_tick" ? "tick" : props.ev.supportAttack ? "support" : props.ev.fixedDamage !== undefined || props.ev.statusTick ? "fixed" : "action";
  const cls = `event cat-${cat}`;
  const actor = props.ev.actorName ?? humanizeId(props.ev.unit);
  const ability = props.ev.abilityName ?? humanizeId(props.ev.action);
  const lvl = props.ev.abilityLevel !== undefined ? ` Lv.${props.ev.abilityLevel}` : "";
  const tgt = props.ev.targetName ?? humanizeId(props.ev.target);
  const applied = appliedStatusLabels(props.ev.statusesApplied, props.catalog);
  const expiredNames = [...new Set(props.ev.statusesExpired)].map((id) => props.catalog[id]?.name ?? humanizeId(id));
  const refRows = statusRefsFor(props.ev);
  const chips = (statuses: { id: string; name: string }[]) => (
    <>
      {statuses.map((s, i) => (
        <span key={s.id}>
          {i > 0 ? ", " : null}
          <StatusChip statusId={s.id} catalog={props.catalog} />
        </span>
      ))}
    </>
  );
  return (
    <>
      <button
        className={`${cls}${props.selected ? " selected" : ""}`}
        onClick={() => {
          setOpen((o) => !o);
          props.onSelect(props.index);
        }}
      >
        <span className="glyph">{GLYPH[cat]}</span>
        T{props.ev.round} A{props.ev.turn} {actor} Used {ability}
        {lvl} -&gt; {tgt} For <span className="dmg">{props.ev.finalDamage} Damage</span>
        {props.ev.critical ? <span className="crit"> CRIT</span> : null}
        {props.ev.supportAttack ? " [support]" : null}
        {applied.buffs.length > 0 ? (
          <>
            {" "}Buffs Gained: {chips(applied.buffs)}.
          </>
        ) : null}
        {applied.debuffs.length > 0 ? (
          <>
            {" "}
            {applied.debuffs.length > 1 ? "Debuffs applied" : "Debuff applied"}: {chips(applied.debuffs)}.
          </>
        ) : null}
        {expiredNames.length > 0 ? ` Expired: ${expiredNames.join(", ")}.` : null}
      </button>
      {open && (
        <div className="event-detail">
          <table>
            <tbody>
              {detailFields(props.ev).map(([label, value]) => {
                const refRow = refRows.find((r) => r.label === label);
                // effectSources render as interactive references (same interaction pattern as
                // the status chips); a blank/unresolvable list falls back to the raw value.
                const effectLabels = label === "effectSources" ? effectSourceRefs(props.ev) : [];
                const effectRefsArr = props.ev.effectSourceRefs ?? [];
                return (
                  <tr key={label}>
                    <td>{label}</td>
                    <td>
                      {refRow ? (
                        refRow.refs.map((r, i) => (
                          <StatusChip key={i} statusId={r.statusId} source={r.source} stacks={r.stacks} catalog={props.catalog} />
                        ))
                      ) : effectLabels.length > 0 ? (
                        effectLabels.map((source, i) => (
                          <EffectSourceRef key={i} label={source} sourceRef={effectRefsArr[i]} defs={props.effectDefs} />
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
 * Hover tooltip for a status reference. Content comes ONLY from the PLAYER-FACING catalog
 * (engine registry via main): `description` = engine `playerDescription`, plus structured
 * Duration/Stacks/Activation/Cleansing rows. The internal `note`/documentation field is
 * never shipped to the renderer. Unknown ids render as plain text and never fabricate content.
 */
function StatusChip(props: { statusId: string; source?: string; stacks?: number; catalog: Record<string, StatusInfoView> }): JSX.Element {
  const tip = statusTooltipLines(resolveStatus(props.statusId, props.catalog));
  if (!tip) return <>{props.statusId}</>;
  return (
    <span className="status-chip" tabIndex={0} aria-label={`status ${tip.name}`}>
      {tip.name}
      {props.stacks !== undefined ? ` (${props.stacks})` : ""}
      <span className="tooltip">
        <b>{tip.name}</b> <span className="muted">[{tip.category}]</span>
        {tip.lines.map((line) => (
          <span key={line} className="tooltip-row">{line}</span>
        ))}
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
            effectDefs={props.session.effectSourceCatalog}
          />
        ))}
      </div>
    </div>
  );
}