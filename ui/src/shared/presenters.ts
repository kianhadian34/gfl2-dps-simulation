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

/**
 * Effect-source references on a log event, as interactive labels (engine `effectSources`).
 * Only usable, non-blank labels are surfaced; anything unresolvable/blank is dropped so the
 * caller keeps rendering the raw value as plain text (never fabricated metadata).
 */
export function effectSourceRefs(ev: LogEventView): string[] {
  return (ev.effectSources ?? []).filter((s): s is string => typeof s === "string" && s.trim().length > 0);
}

type EffectSourceRefView = import("./engine-types.js").EffectSourceRefView;
type EffectSourceInfoView2 = import("./engine-types.js").EffectSourceInfoView;

/**
 * Canonical catalog key for a structured effect-source ref (matches the main-process
 * `buildEffectSourceCatalog`). Returns undefined only for a malformed ref.
 */
export function effectSourceRefKey(ref: EffectSourceRefView | undefined): string | undefined {
  if (!ref) return undefined;
  switch (ref.kind) {
    case "status":
      return `status:${ref.statusId}`;
    case "passive":
      return ref.characterId && ref.passiveId ? `passive:${ref.characterId}:${ref.passiveId}` : undefined;
    case "ability":
      return ref.abilityId ? `ability:${ref.characterId}:${ref.abilityId}` : undefined;
    case "target":
      return "target";
  }
}

/**
 * Resolve a structured ref against the effect-source definition catalog (built in main from
 * the engine registry). Presentation-only: returns undefined when the ref is absent or the
 * definition cannot be resolved — the caller falls back to the display label, never fabricates.
 */
export function resolveEffectSource(
  ref: EffectSourceRefView | undefined,
  catalog: Record<string, EffectSourceInfoView2> | undefined,
): EffectSourceInfoView2 | undefined {
  if (!catalog) return undefined;
  const key = effectSourceRefKey(ref);
  return key ? catalog[key] : undefined;
}

export interface EffectSourceInfo {
  /** Display name parsed from the engine provenance label (falls back to the raw label). */
  readonly name: string;
  /** Ability/passive level when the label carries it ("Xxx Lv.N"). */
  readonly level?: number;
  /** Fortification rank when the label carries it ("(VN)" — e.g. V6). */
  readonly fortification?: number;
}

/**
 * Parse an engine effect-source provenance label (format from state.ts:
 * `"{Name} Lv.{level}"` with an optional `(V{rank})` suffix) into displayable parts.
 * Pure deterministic split of the already-available string — anything that does not match
 * (e.g. "Target passive (DummyConfig)", status names) is returned verbatim. Never invents
 * metadata; no internal notes.
 */
export function parseEffectSource(label: string): EffectSourceInfo {
  const m = /^(.+?) Lv\.(\d+)(?: \(V(\d+)\))?$/.exec(label.trim());
  if (!m) return { name: label.trim() };
  return {
    name: m[1],
    level: Number(m[2]),
    ...(m[3] !== undefined ? { fortification: Number(m[3]) } : {}),
  };
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

export type LogCategory = "action" | "support" | "damage" | "status" | "resource" | "fixed" | "tick" | "movement" | "round" | "pass";

/** Classify a single LogEvent for visual hierarchy (icons + text, never color alone). */
export function classifyEvent(ev: LogEventView): LogCategory {
  if (ev.actionType === "dummy_pass") return "pass";
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

/** Humanize an id for display ("basic_attack_dummy" → "Basic Attack Dummy", "damage_up_ii" → "Damage Up II"). */
export function humanizeId(id: string): string {
  return id
    .split("_")
    .map((w) => (/^(i|ii|iii|iv|v)$/i.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/** Interleave the training-dummy pass events into the main log: each round's pass row is inserted
 *  just BEFORE that round's final event (the target's action-end ticks), so the log reads
 *  "Training Dummy Used -> Nothing" immediately followed by the Overburn tick that explains it. */
export function interleavePasses(
  events: LogEventView[],
  passes: Array<{ round: number; turn: number; unit: string; actorName: string; action: string }>,
): LogEventView[] {
  if (passes.length === 0) return events;
  const byRound = new Map<number, typeof passes>();
  for (const p of passes) {
    const list = byRound.get(p.round) ?? [];
    list.push(p);
    byRound.set(p.round, list);
  }
  const passEvent = (p: { round: number; turn: number; unit: string; actorName: string; action: string }): LogEventView => ({
    round: p.round,
    turn: p.turn,
    unit: p.unit,
    action: p.action,
    actionType: "dummy_pass",
    target: "",
    source: "passive",
    supportAttack: false,
    weaknessExploited: [],
    phaseMult: 1,
    bonusBracket: 1,
    reductionMult: 1,
    finalDamage: 0,
    cooldownAfter: {},
    statusesApplied: [],
    statusesExpired: [],
    actorName: p.actorName,
    targetName: p.actorName,
  });
  const lastIndexPerRound = new Map<number, number>();
  events.forEach((ev, i) => lastIndexPerRound.set(ev.round, i));
  const out: LogEventView[] = [];
  events.forEach((ev, i) => {
    if (lastIndexPerRound.get(ev.round) === i) {
      for (const p of byRound.get(ev.round) ?? []) out.push(passEvent(p));
    }
    out.push(ev);
  });
  return out;
}

/** Split applied statuses into BUFFS vs DEBUFFS using the status catalog category (unknown → buff),
 *  deduplicated; keeps the status id (for hoverable chips) plus the display name. */
export function appliedStatusLabels(
  statusesApplied: string[],
  catalog: Record<string, { name?: string; category?: string }>,
): { buffs: { id: string; name: string }[]; debuffs: { id: string; name: string }[] } {
  const buffs: { id: string; name: string }[] = [];
  const debuffs: { id: string; name: string }[] = [];
  for (const id of [...new Set(statusesApplied)]) {
    const info = catalog[id];
    const label = { id, name: info?.name ?? humanizeId(id) };
    (info?.category === "debuff" ? debuffs : buffs).push(label);
  }
  return { buffs, debuffs };
}

function describeEvent(ev: LogEventView, category: LogCategory): string {
  const crit = ev.critical ? " CRIT" : "";
  const actor = ev.actorName ?? humanizeId(ev.unit);
  const ability = ev.abilityName ?? humanizeId(ev.action);
  const lvl = ev.abilityLevel !== undefined ? ` Lv.${ev.abilityLevel}` : "";
  const tgt = ev.targetName ?? humanizeId(ev.target);
  if (category === "tick") {
    const vTick = ev.statusTick;
    return `T${ev.round} A${ev.turn} ${actor}'s ${vTick ? humanizeId(vTick.statusId) : humanizeId(ev.action)} -> ${tgt} For ${ev.finalDamage} Damage.`;
  }
  if (category === "pass") {
    return `T${ev.round} A${ev.turn} ${actor} Used -> Nothing`;
  }
  if (ev.supportAttack) {
    const trigger = ev.triggerName ?? "Passive";
    const triggerLv = ev.triggerLevel !== undefined ? ` Lv.${ev.triggerLevel}` : "";
    return `T${ev.round} A${ev.turn} ${actor} Triggered ${trigger}${triggerLv} -> ${ability}${lvl} -> ${tgt} For ${ev.finalDamage} Damage${crit}.`;
  }
  return `T${ev.round} A${ev.turn} ${actor} Used ${ability}${lvl} -> ${tgt} For ${ev.finalDamage} Damage${crit}.`;
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
  push("unit", ev.actorName ? `${ev.actorName} (${ev.unit})` : `${humanizeId(ev.unit)} (${ev.unit})`);
  push("action", ev.abilityName ? `${ev.abilityName}${ev.abilityLevel !== undefined ? ` Lv.${ev.abilityLevel}` : ""} (${ev.action})` : ev.action);
  push("actionType", ev.actionType);
  push("target", ev.targetName ? `${ev.targetName} (${ev.target})` : `${humanizeId(ev.target)} (${ev.target})`);
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