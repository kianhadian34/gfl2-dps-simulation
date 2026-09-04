import type { ActionSlot, CharacterDef, ConfigOverrides, Element, PassiveEffect, Scenario, SourceKind, StatusDef, StatusOverride } from "../model/types.js";
import type { ActiveStatus, LogEvent, ResolvedConfig } from "../model/runtime.js";
import { Rng } from "./rng.js";
import type { Registry } from "../data/registry.js";

/**
 * MVP simulation duration cap (validation mode): exactly 1–7 turns.
 * Reject anything outside — never clamp. Raising this later is a one-line
 * constant change; the engine itself is duration-agnostic.
 */
export const MAX_TURNS = 7;

/** Effective status definition: registry entry after config.statusOverrides are applied. */
export type EffectiveStatusDef = StatusDef & { effectiveDurationRounds?: number };

export const DEFAULT_CONFIG: ResolvedConfig = {
  critMultiplier: null, // derive 1 + attacker Crit DMG (confirmed U1 + U19 CDMG half); no hardcoded default
  exposedDurationRounds: 2, // U4 (CN beta value)
  confectanceMax: 6, // U9 CONFIRMED 2026-09-03 (in-game, Qiongjiu no keys)
  confectanceStart: 3, // U9 CONFIRMED 2026-09-03 (in-game, Qiongjiu no keys)
  statusOverrides: {},
  cooldownModel: "nextOwnTurnEnd", // U11 CONFIRMED 2026-09-03: wait N full turns after the cast turn (CD1: cast N → unavailable N+1 → available N+2)
};

export interface UnitState {
  kind: "doll" | "dummy";
  id: string;
  name: string;
  /** Dolls only (dummy has null). */
  def: CharacterDef | null;
  /** Passive effects of the unit (dolls: character passive; dummy/boss: DummyConfig.passives — U5). */
  passives: PassiveEffect[];
  /** Dummy-exposed elemental weaknesses (research §3.5). */
  weaknessElements: Element[];
  /** MVP: cover is always "none" (handoff §4); drives conditional no-cover bonuses. */
  cover: "none";
  /** Attack element of dolls / phase category of the dummy (research §3.4). */
  phase: Element | null;
  panelAtk: number;
  hp: number;
  maxHp: number;
  defStat: number;
  critRate: number;
  /** Crit DMG bonus (panel shows 100% + this), e.g. 0.2 → crit multiplier 1.2 (confirmed U1/U19). */
  critDmg: number;
  stability: number;
  maxStability: number;
  exposed: boolean;
  exposedRoundsLeft: number;
  confectance: number;
  cooldowns: Map<string, number>;
  statuses: ActiveStatus[];
  supportQuota: number;
  rotationList: ActionSlot[];
  rotationIndex: number;
  actionBudget: number;
  /** Confirmed recovery (U6): rounds left until stability is restored to max after a break (0 = none pending). */
  stabilityRecoveryRoundsLeft: number;
}

export interface Accumulators {
  actions: number;
  damage: number;
  byCharacter: Map<string, { damage: number; actions: number }>;
  bySource: Map<SourceKind, { damage: number; actions: number }>;
}

export interface SimulationState {
  seed: number;
  turns: number;
  round: number;
  rng: Rng;
  config: ResolvedConfig;
  units: UnitState[];
  dummy: UnitState;
  statusRegistry: Map<string, EffectiveStatusDef>;
  log: LogEvent[];
  warnings: Set<string>;
  /** Statuses applied during the current action — excluded from its own end-of-turn tick. */
  appliedThisAction: ActiveStatus[];
  accum: Accumulators;
}

/** Weapon ATK at the weapon's configured level (linear interpolation; exact curve UNVERIFIED, research §3.9). */
export function weaponAtk(def: CharacterDef): number {
  const w = def.weapon;
  if (w.level <= 1) return w.atkLvl1;
  if (w.level >= 60) return w.atkLvl60;
  const t = (w.level - 1) / (60 - 1);
  return Math.round(w.atkLvl1 + (w.atkLvl60 - w.atkLvl1) * t);
}

/** Panel formula: (Σ flat) × (1 + Σ pct) — CONFIRMED research §3.8. */
export function computePanel(def: CharacterDef): { atk: number; hp: number; def: number } {
  const weaponAtkBonus = weaponAtk(def);
  const pctAtk = def.weapon.subStats.filter((s) => s.stat === "pctAtk").reduce((a, s) => a + s.value, 0);
  const pctHp = def.weapon.subStats.filter((s) => s.stat === "pctHp").reduce((a, s) => a + s.value, 0);
  const pctDef = def.weapon.subStats.filter((s) => s.stat === "pctDef").reduce((a, s) => a + s.value, 0);
  return {
    atk: (def.base.atk + weaponAtkBonus) * (1 + pctAtk),
    hp: def.base.hp * (1 + pctHp),
    def: def.base.def * (1 + pctDef),
  };
}

export function resolveConfig(overrides: ConfigOverrides | undefined): ResolvedConfig {
  return {
    exposedDurationRounds: overrides?.exposedDurationRounds ?? DEFAULT_CONFIG.exposedDurationRounds,
    confectanceMax: overrides?.confectanceMax ?? DEFAULT_CONFIG.confectanceMax,
    confectanceStart: overrides?.confectanceStart ?? DEFAULT_CONFIG.confectanceStart,
    statusOverrides: overrides?.statusOverrides ?? {},
    cooldownModel: overrides?.cooldownModel ?? DEFAULT_CONFIG.cooldownModel,
    critMultiplier: overrides?.critMultiplier ?? null,
  };
}

/**
 * Build the effective status registry: base StatusDefs cloned with any
 * config.statusOverrides applied (per-stack damage value, tick point, and the
 * applied duration). The engine reads ONLY this map, so an uncertainty value
 * can be changed from a scenario without touching engine code.
 */
export function applyStatusOverrides(
  base: Map<string, StatusDef>,
  overrides: Record<string, StatusOverride>,
): Map<string, EffectiveStatusDef> {
  const out = new Map<string, EffectiveStatusDef>();
  for (const [id, def] of base) {
    const ov = overrides[id];
    if (!ov) {
      out.set(id, def);
      continue;
    }
    out.set(id, {
      ...def,
      effects:
        ov.perStackValue === undefined
          ? def.effects
          : def.effects.map((e) =>
              e.kind === "damage_modifier" && ov.perStackValue !== undefined ? { ...e, value: ov.perStackValue } : e,
            ),
      tickAt: ov.tickAt ?? def.tickAt,
      effectiveDurationRounds: ov.durationRounds,
    });
  }
  return out;
}

function makeDoll(def: CharacterDef, rotation: ActionSlot[], keys: string[], config: ResolvedConfig): UnitState {
  const panel = computePanel(def);
  let confectance = config.confectanceStart;
  for (const k of def.fixedKeys) {
    if (keys.includes(k.id)) {
      for (const eff of k.battleStartEffects) {
        if (eff.resource === "confectance") confectance += eff.amount;
      }
    }
  }
  confectance = Math.min(config.confectanceMax, Math.max(0, confectance));
  const supportMax = supportAttackQuota(def);
  return {
    kind: "doll",
    id: def.id,
    name: def.name,
    def,
    passives: def.passive.effects,
    weaknessElements: [],
    cover: "none",
    phase: def.phase,
    panelAtk: panel.atk,
    hp: panel.hp,
    maxHp: panel.hp,
    defStat: panel.def,
    critRate: def.base.critRate,
    critDmg: def.base.critDmg,
    stability: def.base.stability,
    maxStability: def.base.stability,
    exposed: false,
    exposedRoundsLeft: 0,
    confectance,
    cooldowns: new Map(),
    statuses: [],
    supportQuota: supportMax,
    rotationList: rotation,
    rotationIndex: 0,
    actionBudget: 0,
    stabilityRecoveryRoundsLeft: 0,
  };
}

function makeDummy(d: Scenario["dummy"]): UnitState {
  return {
    kind: "dummy",
    id: d.id,
    name: d.name,
    def: null,
    passives: (d.passives ?? []).flatMap((p) => p.effects),
    weaknessElements: d.weaknesses,
    cover: "none",
    phase: d.phase,
    panelAtk: 0,
    hp: d.hp,
    maxHp: d.hp,
    defStat: d.defense,
    critRate: 0,
    critDmg: 0,
    stability: d.stability,
    maxStability: d.stability,
    exposed: false,
    exposedRoundsLeft: 0,
    confectance: 0,
    cooldowns: new Map(),
    statuses: [],
    supportQuota: 0,
    rotationList: [],
    rotationIndex: 0,
    actionBudget: 0,
    stabilityRecoveryRoundsLeft: 0,
  };
}

/** Per-round support-attack quota from the doll's passive (0 if none). */
export function supportAttackQuota(def: CharacterDef): number {
  const eff = def.passive.effects.find((e) => e.kind === "support_attack");
  return eff && eff.kind === "support_attack" ? eff.perRoundMax : 0;
}

export function createState(scenario: Scenario, registry: Registry, warnings: Set<string>): SimulationState {
  if (scenario.version !== 1) throw new Error(`Unsupported scenario version: ${scenario.version}`);
  if (scenario.team.length === 0) throw new Error("Scenario team must not be empty");
  if (scenario.dummy.cover !== "none") throw new Error("MVP: dummy cover must be \"none\" (handoff §4)");
  if (!Number.isInteger(scenario.turns) || scenario.turns < 1 || scenario.turns > MAX_TURNS) {
    throw new Error(
      `Scenario turns must be an integer between 1 and ${MAX_TURNS} (MVP cap); got ${scenario.turns} — durations above ${MAX_TURNS} are rejected, not clamped`,
    );
  }
  for (const m of scenario.team) {
    if (m.rotation.length === 0) throw new Error(`Rotation for ${m.characterId} must not be empty`);
  }
  const config = resolveConfig(scenario.configOverrides);
  const units: UnitState[] = scenario.team.map((m) => {
    const def = registry.getCharacter(m.characterId);
    if (!def) throw new Error(`Unknown character: ${m.characterId}`);
    return makeDoll(def, m.rotation, m.equippedFixedKeys ?? [], config);
  });
  const dummy = makeDummy(scenario.dummy);
  return {
    seed: scenario.seed,
    turns: scenario.turns,
    round: 0,
    rng: new Rng(scenario.seed),
    config,
    units,
    dummy,
    statusRegistry: applyStatusOverrides(registry.getStatusMap(), config.statusOverrides),
    log: [],
    warnings,
    appliedThisAction: [],
    accum: {
      actions: 0,
      damage: 0,
      byCharacter: new Map(),
      bySource: new Map(),
    },
  };
}