/**
 * Pure presentation helpers. Framework-free and engine-free: they only classify and
 * arrange data already produced by the engine. No damage formulas, no status logic,
 * no grid math. All tests live in ui/test/presenters.test.ts.
 */
import type {
  LogEventView,
  ScenarioView,
  SimulationResultView,
  SessionView,
  StatusInfoView,
} from "./engine-types.js";
import { fmt } from "./format.js";

/**
 * Resolve a status id against the authoritative catalog (built in main from the engine
 * registry). Presentation-only: returns undefined for unknown ids — never fabricates content.
 */
export function resolveStatus(id: string, catalog: Record<string, StatusInfoView> | undefined): StatusInfoView | undefined {
  return catalog?.[id];
}

export interface StatusTooltip {
  readonly name: string;
  readonly category: string;
  /** Player-facing description (engine `playerDescription`). Never the internal `note`. */
  readonly description?: string;
  /** Ordered display rows — only fields that APPLY are present (no empty rows). */
  readonly lines: string[];
}

/**
 * Build the player-facing hover tooltip content for a status from the catalog ONLY.
 * - `description` comes exclusively from the engine `playerDescription` field.
 * - Duration / Stacks / Activation / Cleansing rows are derived from structured fields.
 * - Unknown ids return undefined (the caller renders plain text, never fabricated content).
 * - The internal `note`/evidence field is never part of the catalog, so it cannot leak here.
 */
export function statusTooltipLines(info: StatusInfoView | undefined): StatusTooltip | undefined {
  if (!info) return undefined;
  const lines: string[] = [];
  if (info.description) lines.push(info.description);
  lines.push(`Duration: ${info.durationRounds === null ? "Permanent" : `${info.durationRounds} turn(s)`}`);
  lines.push(
    info.stackable
      ? info.maxStacks !== undefined
        ? `Stacks: max ${info.maxStacks}`
        : "Stacks: unbounded"
      : "Stacks: not stackable",
  );
  if (info.consumeOneOnUse) lines.push("Activates 1 time — each use consumes one stack");
  lines.push(info.purgeable ? "Can be cleansed" : "Cannot be cleansed");
  return { name: info.name, category: info.category, description: info.description, lines };
}

/** Status-bearing LogEvent fields, resolved for the hover-tooltip UI (presentation-only). */
export function statusRefsFor(ev: LogEventView): Array<{ label: string; refs: Array<{ statusId: string; source?: string; stacks?: number }> }> {
  const rows: Array<{ label: string; refs: Array<{ statusId: string; source?: string; stacks?: number }> }> = [];
  if (ev.statusesApplied.length > 0) rows.push({ label: "statusesApplied", refs: ev.statusesApplied.map((id) => ({ statusId: id })) });
  if (ev.statusesExpired.length > 0) rows.push({ label: "statusesExpired", refs: ev.statusesExpired.map((id) => ({ statusId: id })) });
  if (ev.upgradeStacks && ev.upgradeStacks.length > 0)
    rows.push({ label: "upgradeStacks", refs: ev.upgradeStacks.map((u) => ({ statusId: u.statusId, stacks: u.stacks })) });
  if (ev.appliedSources && ev.appliedSources.length > 0)
    rows.push({ label: "appliedSources", refs: ev.appliedSources.map((s) => ({ statusId: s.statusId, source: s.source })) });
  if (ev.statusTick) rows.push({ label: "statusTick", refs: [{ statusId: ev.statusTick.statusId }] });
  return rows;
}

export type LogCategory = "action" | "support" | "damage" | "status" | "resource" | "fixed" | "tick" | "movement" | "round";

/** Classify a single LogEvent for visual hierarchy (icons + text, never color alone). */
export function classifyEvent(ev: LogEventView): LogCategory {
  if (ev.actionType === "status_tick") return "tick";
  if (ev.statusTick || ev.fixedDamage !== undefined) return "fixed";
  if (ev.supportAttack) return "support";
  return "action";
}

export interface EventRow {
  readonly index: number;
  readonly event: LogEventView;
  readonly category: LogCategory;
  readonly head: string;
  readonly detail: Array<{ label: string; value: string }>;
}

/** Build the full-fidelity combat log rows (one per event, expandable detail = EVERY field). */
export function buildLogRows(events: LogEventView[]): EventRow[] {
  return events.map((event, index) => {
    const category = classifyEvent(event);
    const head = describeEvent(event, category);
    return { index, event, category, head, detail: detailFields(event) };
  });
}

function describeEvent(ev: LogEventView, category: LogCategory): string {
  const tag = ev.supportAttack ? " [support]" : "";
  const crit = ev.critical ? " CRIT" : "";
  switch (category) {
    case "tick":
      return `R${ev.round} T${ev.turn} ${ev.unit}.${ev.action} → ${ev.target} (status tick)`;
    case "fixed":
      return `R${ev.round} T${ev.turn} ${ev.unit}.${ev.action} → ${ev.target}: ${ev.finalDamage} total${crit}${tag}`;
    default:
      return `R${ev.round} T${ev.turn} ${ev.unit}.${ev.action} → ${ev.target}: ${ev.finalDamage} dmg${crit}${tag}`;
  }
}

export function detailFields(ev: LogEventView): Array<{ label: string; value: string }> {
  const d: Array<{ label: string; value: string }> = [];
  const push = (label: string, value: unknown) => {
    const v = Array.isArray(value) ? (value.length > 0 ? JSON.stringify(value) : "—") : value === undefined || value === null ? "—" : String(value);
    d.push({ label, value: v });
  };
  // Numeric fields render through the max-2-decimal formatter (display-only; engine values untouched).
  const pushNumeric = (label: string, value: unknown) => d.push({ label, value: value === undefined || value === null ? "—" : fmt(value) });
  push("round", ev.round);
  push("turn", ev.turn);
  push("unit", ev.unit);
  push("action", ev.action);
  push("actionType", ev.actionType);
  push("target", ev.target);
  push("source", ev.source);
  push("supportAttack", ev.supportAttack);
  pushNumeric("baseDamage", ev.baseDamage);
  pushNumeric("mitigatedDamage", ev.mitigatedDamage);
  pushNumeric("attackerAtk", ev.attackerAtk);
  pushNumeric("targetDef", ev.targetDef);
  push("critical", ev.critical);
  pushNumeric("critMultiplier", ev.critMultiplier);
  push("weaknessExploited", ev.weaknessExploited);
  pushNumeric("phaseMult", ev.phaseMult);
  pushNumeric("bonusBracket", ev.bonusBracket);
  pushNumeric("reductionMult", ev.reductionMult);
  pushNumeric("stabilityDamage", ev.stabilityDamage);
  push("targetStabilityAfter", ev.targetStabilityAfter);
  push("exposed", ev.exposed);
  pushNumeric("finalDamage", ev.finalDamage);
  push("killingBlow", ev.killingBlow);
  push("confectance", ev.confectance ? `before ${fmt(ev.confectance.before)} → after ${fmt(ev.confectance.after)} (cost ${fmt(ev.confectance.cost)})` : "—");
  push("cooldownAfter", JSON.stringify(ev.cooldownAfter));
  push("statusesApplied", ev.statusesApplied);
  push("appliedSources", ev.appliedSources ?? []);
  push("effectSources", ev.effectSources ?? []);
  push("statusesExpired", ev.statusesExpired);
  push("upgradeStacks", ev.upgradeStacks ?? []);
  push("statusTick", ev.statusTick ? `${ev.statusTick.statusId}: ${fmt(ev.statusTick.amount)}` : "—");
  pushNumeric("fixedDamage", ev.fixedDamage);
  return d;
}

export type RotationSlotState = "completed" | "current" | "upcoming" | "skipped";

export interface RotationSlotView {
  slot: string;
  action?: string; // resolved action id when the engine executed it
  state: RotationSlotState;
  round?: number;
  turn?: number;
  note?: string;
}

export interface RotationMemberView {
  characterId: string;
  slots: RotationSlotView[];
}

/**
 * Reconstruct the scripted rotation states from the engine-observed log. States are
 * derived ONLY from what the engine executed (log events) — never invented.
 */
export function rotationStates(scenario: ScenarioView, log: LogEventView[]): RotationMemberView[] {
  const executedOrder = new Map<string, LogEventView[]>();
  for (const ev of log) {
    const list = executedOrder.get(ev.unit) ?? [];
    list.push(ev);
    executedOrder.set(ev.unit, list);
  }
  return scenario.team.map((member) => {
    const executed = executedOrder.get(member.characterId) ?? [];
    const lastExecuted = executed.length > 0 ? executed[executed.length - 1] : undefined;
    const slots: RotationSlotView[] = member.rotation.map((slot, i) => {
      // Per-unit execution order (from the log) parallels the rotation order: the i-th executed
      // action maps to the i-th rotation slot. Derived from engine-observed facts only.
      const ev = executed[i];
      if (ev) {
        return {
          slot,
          action: ev.action,
          state: ev === lastExecuted ? "current" : "completed",
          round: ev.round,
          turn: ev.turn,
        };
      }
      return { slot, action: slot, state: "upcoming" as const };
    });
    return { characterId: member.characterId, slots };
  });
}

/** Totals rows for the log header (engine-computed numbers only). */
export function totalsRows(result: SimulationResultView): Array<{ label: string; value: string }> {
  return [
    { label: "Total damage", value: Math.round(result.totals.damage).toLocaleString("en-US") },
    { label: "Per round", value: Math.round(result.totals.damagePerRound).toLocaleString("en-US") },
    { label: "Per action", value: Math.round(result.totals.damagePerAction).toLocaleString("en-US") },
    { label: "Actions", value: String(result.totals.actions) },
    { label: "Seed", value: String(result.seed) },
    { label: "Turns", value: String(result.turns) },
  ];
}

export interface MovementView {
  round: number;
  unitId: string;
  from: string;
  to: string;
  /** Display-formatted (max 2 decimals); the underlying engine cost stays numeric in the session. */
  cost: string;
  note: string;
}

/** Present engine-computed movement facts (already computed in main via src/engine/grid.ts). */
export function movementRows(session: SessionView): MovementView[] {
  return session.movements.map((m) => ({
    round: m.round,
    unitId: m.unitId,
    from: `${m.from.x},${m.from.y}`,
    to: `${m.to.x},${m.to.y}`,
    cost: fmt(m.cost),
    note: m.endTurnWithoutAction ? "moved, no action" : "move → action",
  }));
}