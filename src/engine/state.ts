import type { AbilityDef, AbilitySlot, ActionSlot, AmmoType, CharacterDef, CommonKeyStat, ConfigOverrides, Element, PassiveEffect, Scenario, SkillDefVariant, SourceKind, StatusDef, StatusOverride, WeaponCalibrationDef, WeaponDef } from "../model/types.js";
import { buildGrid, type GridState } from "./grid.js";
import { finalStat } from "./stats.js";
import type { ActiveStatus, LogEvent, ResolvedConfig } from "../model/runtime.js";
import { Rng } from "./rng.js";
import type { Registry } from "../data/registry.js";
import { DISPATCH_STAT_BUFFS } from "../data/dispatch.js";
import { resolveRemolderUnit, resolveRemolderTeam } from "./remolder.js";

/**
 * MVP simulation duration cap (validation mode): exactly 1–7 turns.
 * Reject anything outside — never clamp. Raising this later is a one-line
 * constant change; the engine itself is duration-agnostic.
 */
export const MAX_TURNS = 7;

/**
 * Common Key Slots per character (game structure — SOURCE FACT, 2026): every character has
 * 3 Common Key Slots. Enforced as a maximum; selecting FEWER (0–2) is always valid.
 */
export const MAX_COMMON_KEYS = 3;

/** Effective status definition: registry entry after config.statusOverrides are applied. */
export type EffectiveStatusDef = StatusDef & { effectiveDurationRounds?: number };

export const DEFAULT_CONFIG: ResolvedConfig = {
  critMultiplier: null, // derive 1 + attacker Crit DMG (confirmed U1 + U19 CDMG half); no hardcoded default
  exposedDurationRounds: 2, // U4 (CN beta value)
  confectanceMax: 6, // U9 CONFIRMED 2026-09-03 (in-game, Qiongjiu no keys)
  confectanceStart: 3, // U9 CONFIRMED 2026-09-03 (in-game, Qiongjiu no keys)
  statusOverrides: {},
  cooldownModel: "nextOwnTurnEnd", // U11 CONFIRMED 2026-09-03: wait N full turns after the cast turn (CD1: cast N → unavailable N+1 → available N+2)
  fortificationLevel: 0, // V0: all abilities resolve to Level 1 (or their validated baseline)
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
  /** Dummy-exposed ammo/weapon-type weakness tags (Ammo Weakness Upgrade, 2026). */
  weaknessTags: AmmoType[];
  /** Target Race/Type classification (2026, generic — e.g. ["elid"]); used by owner-gated weapon Imprints. Empty = none. */
  raceTypes: string[];
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
  /** Out-of-Turn Damage: additive % applied to damage dealt OUTSIDE the unit's own turn (in the MVP, Support Actions). Sits in the same additive bracket as the passive 10% (QJ) — Strategic Negotiation +7% → 1.17 validated. */
  outOfTurnDmg: number;
  /**
   * PATTERN REMOLDER (2026): resolved per-unit state ? flat source, active (clamped) buffs,
   * category totals, active Set Bonuses, resolved modifiers (existing buckets) and the
   * team-granted Unity / battle-start allied percentages ? kept for provenance and the
   * future stat-source UI. Absent field = no Remolder configured.
   */
  remolder?: {
    flat: { atk: number; hp: number; def: number };
    activeBuffs: { buffId: string; level: number; category: string }[];
    categoryTotals: { bulwark: number; vanguard: number; support: number; sentinel: number };
    activeSetBonusIds: string[];
    modifiers: import("../model/types.js").RemolderModifier[];
    unityPct: { atk: number; hp: number; def: number };
    alliedPct: { atk: number; hp: number; def: number };
  };
  /** Equipped Expansion Key id (Ruined Gem): drives the Support Action element override and the target-status dealt bonus. */
  expansionKeyId?: string;
  /** Weapon-effect charge counter (Golden Melody Charging, VALIDATED 2026): +1 per buff GAINED (capped by the calibration's maxStacks); 1 consumed per Support Action; persists when unused; inherently un-cleansable (weapon state, not a status). 0 = none. */
  weaponCharges: number;
  /** The scenario-EQUIPPED weapon (resolved from `ScenarioTeamMember.weaponId` via the registry; null = no weapon equipped). Never inherited from the character. */
  weapon: WeaponDef | null;
  /** EFFECTIVE weapon calibration level (C1–C6 = 1–6): the member's `calibrationLevel`, else the weapon def's own `calibrationLevel`; undefined = no calibration Effect. */
  weaponCalibrationLevel?: number;
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
  /** Resolved ability level per slot (Basic is always 1). Set once at construction. */
  skillLevels: Partial<Record<AbilitySlot, number>>;
  /** Resolved PASSIVE level (Fortification-raised passive, e.g. Steady Plan Lv.3 at V6). */
  passiveLevel: number;
  /** IDs of the Fixed Keys this unit has equipped (engine-wide; drives key-specific behavior like FK2's support cleanse). */
  equippedKeys: string[];
  /** Resolved SkillDefVariant per slot — the ONLY skill source consumers read. Computed once at construction. */
  skills: Partial<Record<AbilitySlot, SkillDefVariant>>;
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
  /** GRID (2026): spatial facts when the scenario provides a battle grid (absent = no positions). */
  grid?: GridState;
  statusRegistry: Map<string, EffectiveStatusDef>;
  log: LogEvent[];
  /** Explicit TRAINING-DUMMY pass-turn events (2026): separate channel so the main combat log
   *  stays unchanged; the UI interleaves a "Used -> Nothing" row before the target's ticks. */
  passEvents: Array<{ round: number; turn: number; unit: string; actorName: string; action: string }>;
  warnings: Set<string>;
  accum: Accumulators;
}

/** Weapon ATK at the weapon's configured level (linear interpolation; exact curve UNVERIFIED, research §3.9). Null (no equipped weapon) ⇒ 0. */
export function weaponAtk(weapon: WeaponDef | null): number {
  if (!weapon) return 0;
  const w = weapon;
  if (w.level <= 1) return w.atkLvl1;
  if (w.level >= 60) return w.atkLvl60;
  const t = (w.level - 1) / (60 - 1);
  return Math.round(w.atkLvl1 + (w.atkLvl60 - w.atkLvl1) * t);
}

/**
 * Resolved WEAPON EFFECT for the EQUIPPED calibration (Golden Melody, VALIDATED 2026).
 * Calibration changes ONLY the Effect — never the max-level base stats. `calibrationLevel`
 * ABSENT ⇒ NO weapon Effect (all established pre-weapon validations were observed without the
 * calibration Effect — that default is preserved). Generic: any equipped weapon that declares
 * `calibrations` gets the behavior; no character-specific logic.
 */
export function weaponCalibration(weapon: WeaponDef | null, selectedLevel?: number): WeaponCalibrationDef | undefined {
  if (!weapon || !weapon.calibrations) return undefined;
  const level = selectedLevel ?? weapon.calibrationLevel;
  if (level === undefined) return undefined;
  return weapon.calibrations[level];
}

/** Panel formula: Final Stat = ceil((Initial + Flat) × (1 + Stat%)) — formula Mathematically Proven; integer DISPLAY Validated; exact hidden rounding method Not Tested (stats.ts). `weapon` is the scenario-EQUIPPED weapon (null = none). `dispatchFlat` is the permanent global `dispatch_stat_buffs` by Class (src/data/dispatch.ts) — a SEPARATE flat source folded here BEFORE percentage modifiers; absent = no dispatch (two-arg callers unchanged, e.g. direct formula tests). */
export function computePanel(
  def: CharacterDef,
  weapon: WeaponDef | null,
  dispatchFlat?: { atk?: number; hp?: number; def?: number },
  remolderFlat?: { atk?: number; hp?: number; def?: number },
): { atk: number; hp: number; def: number } {
  const weaponAtkBonus = weaponAtk(weapon);
  const pctAtk = (weapon?.subStats ?? []).filter((s) => s.stat === "pctAtk").reduce((a, s) => a + s.value, 0);
  const pctHp = (weapon?.subStats ?? []).filter((s) => s.stat === "pctHp").reduce((a, s) => a + s.value, 0);
  const pctDef = (weapon?.subStats ?? []).filter((s) => s.stat === "pctDef").reduce((a, s) => a + s.value, 0);
  // Game-authoritative FINAL STAT rounding: the integer results feed every downstream consumer
  // (damage ATK/DEF, applier-ATK fixed damage, HP pools).
  return {
    atk: finalStat(def.base.atk, weaponAtkBonus + (dispatchFlat?.atk ?? 0) + (remolderFlat?.atk ?? 0), pctAtk),
    hp: finalStat(def.base.hp, (dispatchFlat?.hp ?? 0) + (remolderFlat?.hp ?? 0), pctHp),
    def: finalStat(def.base.def, (dispatchFlat?.def ?? 0) + (remolderFlat?.def ?? 0), pctDef),
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
    fortificationLevel: overrides?.fortificationLevel ?? DEFAULT_CONFIG.fortificationLevel,
  };
}

/**
 * Resolve an ability to its complete behavior at the given ability level.
 * Rules (approved skill-level/Fortification architecture):
 * - level = 1 baseline; non-basic abilities may be raised by the highest applicable
 *   Fortification upgrade (explicit toLevel; never inferred by counting).
 * - Basic Attack is ALWAYS level 1 regardless of Fortification level.
 * - An explicitly requested level with no variant fails clearly (Error).
 * - Migration baseline: an un-upgraded ability whose level 1 is not in data yet
 *   (e.g. Common Rail, where only the validated Lv2 exists) resolves to its
 *   LOWEST AVAILABLE level — preserving pre-levels behavior without inventing Lv1.
 */
export function resolveSkill(def: AbilityDef, level: number): SkillDefVariant {
  const explicit = def.levels[level];
  if (explicit) return explicit;
  if (level > 1) {
    throw new Error(`Ability ${def.id}: requested level ${level} has no variant (available: ${Object.keys(def.levels).join(", ")})`);
  }
  const lowest = Math.min(...Object.keys(def.levels).map(Number));
  if (!Number.isFinite(lowest)) {
    throw new Error(`Ability ${def.id}: no level variants defined`);
  }
  return def.levels[lowest];
}

/** Effective ability level given Fortification state (V). Basic is always 1. */
export function effectiveAbilityLevel(def: CharacterDef, slot: AbilitySlot, config: ResolvedConfig): number {
  if (slot === "basic") return 1;
  let level = 1;
  for (const f of def.fortificationMap ?? []) {
    if (f.ability === slot && f.v <= config.fortificationLevel && f.toLevel > level) {
      level = f.toLevel;
    }
  }
  return level;
}

/** Resolve every ability once for a doll; also marks the level for each slot. */
export function resolveAbilitySet(
  def: CharacterDef,
  config: ResolvedConfig,
): { skills: Partial<Record<AbilitySlot, SkillDefVariant>>; levels: Partial<Record<AbilitySlot, number>> } {
  const skills: Partial<Record<AbilitySlot, SkillDefVariant>> = {};
  const levels: Partial<Record<AbilitySlot, number>> = {};
  const slots = ["basic", "active1", "active2", "ultimate", "support"] as const;
  for (const slot of slots) {
    const ability = def.skills[slot];
    if (!ability) continue;
    const level = effectiveAbilityLevel(def, slot, config);
    skills[slot] = resolveSkill(ability, level);
    levels[slot] = level;
  }
  return { skills, levels };
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

/**
 * Affinity Key bonus resolution (Warm as Jade, VALIDATED in-game 2026, data-driven):
 * the OWNER of the equipped key decides which bonus applies — NOT the receiving doll's level.
 *  - Own key (keyId === def.affinityKey.id): exact `levels[level]` only (Lv5 +3.3%, Lv9 +4.5%).
 *    Levels without an entry (1–4, 6–8) grant NOTHING — no interpolation, no assumed values.
 *  - Foreign key: ONLY the key's `genericBonus` (+3% ATK/HP) applies; the holder's affinity
 *    level is IGNORED (a QJ at Lv9 with someone else's key still gets only +3%).
 * Returns fractional bonuses; callers fold them into the panel via the proven Final Stat formula.
 */
function resolveAffinityBonus(
  def: CharacterDef,
  keyId: string | undefined,
  level: number | undefined,
  registry: Registry,
): { atk: number; hp: number; critDmg: number } {
  if (!keyId) return { atk: 0, hp: 0, critDmg: 0 };
  if (def.affinityKey?.id === keyId) {
    const lv = def.affinityKey.levels[level ?? 0];
    if (!lv) return { atk: 0, hp: 0, critDmg: 0 }; // undefined level: no interpolation
    return { atk: lv.atk, hp: lv.hp, critDmg: lv.critDmg };
  }
  const foreign = registry.getAffinityKey(keyId);
  if (!foreign) throw new Error(`Unknown affinity key: ${keyId}`);
  return { atk: foreign.genericBonus?.atk ?? 0, hp: foreign.genericBonus?.hp ?? 0, critDmg: foreign.genericBonus?.critDmg ?? 0 };
}

function makeDoll(
  sourceDef: CharacterDef,
  rotation: ActionSlot[],
  keys: string[],
  affinity: { keyId?: string; level?: number } | undefined,
  commonKeyIds: string[],
  expansionKeyId: string | undefined,
  weapon: WeaponDef | null,
  weaponCalibrationLevel: number | undefined,
  baseStatOverrides: { atk?: number; hp?: number; def?: number; stability?: number; critRate?: number; critDmg?: number } | undefined,
  applyDispatchStats: boolean | undefined,
  overridesAuthoritative: boolean | undefined,
  remolderPlan: import("./remolder.js").RemolderUnitPlan,
  remolderGrants: import("./remolder.js").RemolderTeamGrants,
  config: ResolvedConfig,
  registry: Registry,
): UnitState {
  // DEBUG/controlled-testing (2026): per-member base-stat override merged into a LOCAL def
  // copy BEFORE any equipment/stat-modifier calculation. `computePanel` stays the ONE panel
  // path; the registry CharacterDef is never mutated.
  const def = baseStatOverrides ? { ...sourceDef, base: { ...sourceDef.base, ...baseStatOverrides } } : sourceDef;
  // DISPATCH (2026, permanent global system): real characters receive their Class's flat
  // ATK/HP/DEF automatically. `applyDispatchStats === false` marks a CONTROLLED MATH FIXTURE
  // (test-only, explicit at the scenario boundary); it never affects `baseStatOverrides` or
  // `def.class`, and production gameplay (field absent) always applies dispatch.
  // DEBUG-MODE AUTHORITATIVE OVERRIDES (2026): `overridesAuthoritative === true` makes each
  // supplied `baseStatOverrides` stat authoritative — dispatch is suppressed FOR THAT STAT
  // only (Debug ATK 1500 stays 1500); unoverridden stats still receive dispatch. This is the
  // Debug→scenario boundary contract, never the general fixture behavior (which coexists).
  const dispatchFlat =
    applyDispatchStats === false
      ? undefined
      : overridesAuthoritative === true
        ? baseStatOverrides
          ? {
              atk: Object.prototype.hasOwnProperty.call(baseStatOverrides, "atk") ? 0 : DISPATCH_STAT_BUFFS[def.class].atk,
              hp: Object.prototype.hasOwnProperty.call(baseStatOverrides, "hp") ? 0 : DISPATCH_STAT_BUFFS[def.class].hp,
              def: Object.prototype.hasOwnProperty.call(baseStatOverrides, "def") ? 0 : DISPATCH_STAT_BUFFS[def.class].def,
            }
          : DISPATCH_STAT_BUFFS[def.class]
        : DISPATCH_STAT_BUFFS[def.class];
  // PATTERN REMOLDER FLAT (2026): separate permanent flat source (CharacterDef.remolderFlat,
  // Lv.60). Debug-authoritative overrides suppress BOTH global flat sources on overridden stats.
  // Controlled math fixtures (applyDispatchStats === false) exclude BOTH permanent global,
  // character-level flat sources; Debug-authoritative overrides suppress both on overridden stats.
  const remolderFlat =
    applyDispatchStats === false
      ? { atk: 0, hp: 0, def: 0 }
      : overridesAuthoritative === true
        ? (baseStatOverrides
            ? {
                atk: Object.prototype.hasOwnProperty.call(baseStatOverrides, "atk") ? 0 : remolderPlan.flat.atk,
                hp: Object.prototype.hasOwnProperty.call(baseStatOverrides, "hp") ? 0 : remolderPlan.flat.hp,
                def: Object.prototype.hasOwnProperty.call(baseStatOverrides, "def") ? 0 : remolderPlan.flat.def,
              }
            : remolderPlan.flat)
        : remolderPlan.flat;
  const panel = computePanel(def, weapon, dispatchFlat, remolderFlat);
  const aff = resolveAffinityBonus(def, affinity?.keyId, affinity?.level, registry);
  // Common Keys (generic architecture, 2026): REUSABLE definitions resolved via the registry
  // (max 3 — "3 Common Key Slots"; fewer allowed). Stats from every selected key SUM and fold
  // through the EXISTING generic stat path — ATK% via the proven Final Stat formula; Crit Rate
  // and Crit DMG additive; Out-of-Turn Damage stored as a panel stat consumed only by
  // out-of-turn events. No character-id logic: any doll may equip any common key.
  const commonStats: Partial<Record<CommonKeyStat, number>> = {};
  for (const keyId of commonKeyIds) {
    const commonDef = registry.getCommonKey(keyId);
    if (!commonDef) throw new Error(`Unknown common key: ${keyId}`);
    for (const [stat, value] of Object.entries(commonDef.stats)) {
      commonStats[stat as CommonKeyStat] = (commonStats[stat as CommonKeyStat] ?? 0) + (value ?? 0);
    }
  }
  // STANDALONE character Affinity-LEVEL stats (2026, confirmed): Lv5 none, Lv9 ATK/HP/DEF +5% —
  // independent of the equipped Affinity Key (exact level map; absent levels grant nothing).
  const levelStat = def.affinityLevelStats?.[affinity?.level ?? 0] ?? {};
  const atkPct = (commonStats.atkPct ?? 0) + aff.atk + (levelStat.atkPct ?? 0) + remolderPlan.selfPct.atk + remolderGrants.unityPct.atk + remolderGrants.alliedPct.atk;
  const hpPct = aff.hp + (levelStat.hpPct ?? 0) + remolderPlan.selfPct.hp + remolderGrants.unityPct.hp + remolderGrants.alliedPct.hp;
  const defPct = (levelStat.defPct ?? 0) + remolderPlan.selfPct.def + remolderGrants.unityPct.def + remolderGrants.alliedPct.def;
  let confectance = config.confectanceStart;
  for (const k of def.fixedKeys) {
    if (keys.includes(k.id)) {
      for (const eff of k.battleStartEffects) {
        if (eff.resource === "confectance") confectance += eff.amount;
      }
    }
  }
  confectance = Math.min(config.confectanceMax, Math.max(0, confectance));
  const passiveLevel = effectiveAbilityLevel(def, "passive", config);
  const passiveEffectsList = resolvePassiveEffects(def, passiveLevel);
  const supportMax = supportAttackQuota(passiveEffectsList);
  const { skills, levels } = resolveAbilitySet(def, config);
  return {
    kind: "doll",
    id: def.id,
    name: def.name,
    def,
    skillLevels: levels,
    passiveLevel,
    skills,
    passives: passiveEffectsList,
    equippedKeys: keys.filter((k) => def.fixedKeys.some((f) => f.id === k)),
    weaknessElements: [],
    weaknessTags: [],
    raceTypes: [],
    cover: "none",
    phase: def.phase,
    // Affinity Key (Warm as Jade, VALIDATED): own-key levels fold into the panel via the proven
    // Final Stat formula (ceil((base+flat)×(1+pct))); CritDMG is ADDITIVE on the panel value and
    // feeds the existing crit-multiplier chain (no parallel stat system, damage formula untouched).
    panelAtk: atkPct > 0 ? finalStat(panel.atk, 0, atkPct) : panel.atk,
    hp: hpPct > 0 ? finalStat(panel.hp, 0, hpPct) : panel.hp,
    maxHp: hpPct > 0 ? finalStat(panel.hp, 0, hpPct) : panel.hp,
    defStat: defPct > 0 ? finalStat(panel.def, 0, defPct) : panel.def,
    critRate: def.base.critRate + (commonStats.critRate ?? 0) + remolderPlan.critRate,
    critDmg: def.base.critDmg + aff.critDmg + (commonStats.critDmg ?? 0) + remolderPlan.critDmg,
    outOfTurnDmg: (commonStats.outOfTurnDmg ?? 0) + remolderPlan.outOfTurnDmg,
    // PATTERN REMOLDER (2026): full resolved state kept for combat consumption + provenance.
    remolder:
      remolderPlan.activeBuffs.length > 0 ||
      remolderPlan.activeSetBonusIds.length > 0 ||
      remolderPlan.flat.atk !== 0 ||
      remolderPlan.flat.hp !== 0 ||
      remolderPlan.flat.def !== 0
        ? {
            flat: remolderPlan.flat,
            activeBuffs: remolderPlan.activeBuffs,
            categoryTotals: remolderPlan.categoryTotals,
            activeSetBonusIds: remolderPlan.activeSetBonusIds,
            modifiers: remolderPlan.modifiers,
            unityPct: remolderGrants.unityPct,
            alliedPct: remolderGrants.alliedPct,
          }
        : undefined,
    expansionKeyId,
    weaponCharges: 0,
    weapon,
    weaponCalibrationLevel,
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
    skillLevels: {},
    passiveLevel: 1,
    skills: {},
    passives: (d.passives ?? []).flatMap((p) => p.effects),
    equippedKeys: [],
    weaknessElements: d.weaknesses,
    weaknessTags: d.weaknessTags ?? [],
    raceTypes: d.raceTypes ?? [],
    cover: "none",
    phase: d.phase,
    panelAtk: 0,
    hp: d.hp,
    maxHp: d.hp,
    defStat: d.defense,
    critRate: 0,
    critDmg: 0,
    outOfTurnDmg: 0,
    weaponCharges: 0,
    weapon: null,
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
export function resolvePassiveEffects(def: CharacterDef, level: number): PassiveEffect[] {
  const levels = def.passive.levels;
  if (levels && Object.keys(levels).length > 0) {
    return levels[level] ?? levels[Math.min(...Object.keys(levels).map(Number))];
  }
  return def.passive.effects;
}

/** Fortification rank (V) that raised an ability to the given level (reverse lookup); undefined when none. */
export function fortificationV(def: CharacterDef, ability: AbilitySlot, toLevel: number): number | undefined {
  return (def.fortificationMap ?? []).find((f) => f.ability === ability && f.toLevel === toLevel)?.v;
}

/**
 * Human-readable provenance label for a passive-granted effect (2026):
 * "Steady Plan Lv.2 (V3)" — the fortification index comes from the character's
 * fortificationMap reverse lookup (which V raised the passive to this level).
 */
export function passiveSourceLabel(def: CharacterDef, level: number): string {
  const v = fortificationV(def, "passive", level);
  return `${def.passive.name} Lv.${level}${v !== undefined ? ` (V${v})` : ""}`;
}

/** Human-readable provenance label for an ability-granted effect (2026): "Common Rail Lv.1 (V1)". */
export function abilitySourceLabel(def: CharacterDef, slot: AbilitySlot, level: number): string {
  if (slot === "passive") return passiveSourceLabel(def, level);
  const ability = def.skills[slot];
  if (!ability) return `${slot} Lv.${level}`;
  const v = fortificationV(def, slot, level);
  return `${ability.name} Lv.${level}${v !== undefined ? ` (V${v})` : ""}`;
}

/** Number of support attacks the unit may perform per round (from the RESOLVED passive effects). */
export function supportAttackQuota(effects: PassiveEffect[]): number {
  const eff = effects.find((e) => e.kind === "support_attack");
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
    if ((m.commonKeyIds?.length ?? 0) > MAX_COMMON_KEYS) {
      throw new Error(
        `Team member ${m.characterId}: at most ${MAX_COMMON_KEYS} Common Keys may be equipped (3 Common Key Slots); got ${m.commonKeyIds?.length}`,
      );
    }
    // DEBUG/controlled-testing (2026): every supplied base-stat override must be a finite,
    // non-negative number — rejected loudly, never silently clamped.
    if (m.baseStatOverrides) {
      for (const [field, value] of Object.entries(m.baseStatOverrides)) {
        if (!Number.isFinite(value) || value < 0) {
          throw new Error(`Team member ${m.characterId}: baseStatOverrides.${field} must be a finite number >= 0 (got ${value})`);
        }
      }
    }
  }
  const config = resolveConfig(scenario.configOverrides);
  // PATTERN REMOLDER (2026): resolve every member's plan (clamp/totals/set activation) then
  // the team-level grants (Unity strongest, battle-start allied %) BEFORE makeDoll folds them
  // into the ONE panel path and the modifier buckets.
  const remolderBuffDefs = scenario.remolderBuffSet ?? [];
  const remolderPlans = scenario.team.map((m) => {
    const rd = registry.getCharacter(m.characterId);
    if (!rd) throw new Error(`Unknown character: ${m.characterId}`);
    return resolveRemolderUnit(m.remolderBuffs, remolderBuffDefs, rd.remolderSetBonuses, rd.remolderFlat);
  });
  const remolderRawAtk = scenario.team.map((m, i) => {
    const rd = registry.getCharacter(m.characterId);
    if (!rd) throw new Error(`Unknown character: ${m.characterId}`);
    let w: WeaponDef | null = null;
    if (m.weaponId !== undefined) {
      const wd = registry.getWeapon(m.weaponId);
      if (!wd) throw new Error(`Unknown weapon: ${m.weaponId}`);
      w = wd;
    }
    const d = m.baseStatOverrides ? { ...rd, base: { ...rd.base, ...m.baseStatOverrides } } : rd;
    let flat = { atk: 0, hp: 0, def: 0 };
    if (m.applyDispatchStats !== false) {
      const df = DISPATCH_STAT_BUFFS[rd.class];
      flat = {
        atk: remolderPlans[i].flat.atk + df.atk,
        hp: remolderPlans[i].flat.hp + df.hp,
        def: remolderPlans[i].flat.def + df.def,
      };
    }
    return computePanel(d, w, undefined, flat).atk;
  });
  const remolderGrants = resolveRemolderTeam(remolderPlans, remolderRawAtk);
  const units: UnitState[] = scenario.team.map((m, i) => {
    const def = registry.getCharacter(m.characterId);
    if (!def) throw new Error(`Unknown character: ${m.characterId}`);
    // WEAPON (2026): equipped via `ScenarioTeamMember.weaponId` (1 Weapon Slot) and resolved
    // through the registry — a character NEVER inherits a weapon from its definition. The
    // calibration level is part of the EQUIPPED weapon configuration: member `calibrationLevel`
    // (C1–C6 = 1–6, required to be an integer in range and to have a weaponId) else the weapon
    // def's own `calibrationLevel`.
    let weapon: WeaponDef | null = null;
    if (m.weaponId !== undefined) {
      const w = registry.getWeapon(m.weaponId);
      if (!w) throw new Error(`Unknown weapon: ${m.weaponId}`);
      weapon = w;
    }
    if (m.calibrationLevel !== undefined) {
      const lv = m.calibrationLevel;
      if (!Number.isInteger(lv) || lv < 1 || lv > 6) {
        throw new Error(`Invalid weapon calibrationLevel: ${lv} (valid: C1–C6 = 1–6)`);
      }
      if (!weapon) {
        throw new Error(`Team member ${m.characterId}: a weapon calibrationLevel requires a weaponId`);
      }
    }
    const weaponCalibrationLevel = m.calibrationLevel ?? weapon?.calibrationLevel;
    return makeDoll(def, m.rotation, m.equippedFixedKeys ?? [], { keyId: m.affinityKeyId, level: m.affinityLevel }, m.commonKeyIds ?? [], m.expansionKeyId, weapon, weaponCalibrationLevel, m.baseStatOverrides, m.applyDispatchStats, m.overridesAuthoritative, remolderPlans[i], remolderGrants[i], config, registry);
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
    grid: scenario.grid ? buildGrid(scenario.grid) : undefined,
    statusRegistry: applyStatusOverrides(registry.getStatusMap(), config.statusOverrides),
    log: [],
    passEvents: [],
    warnings,
    accum: {
      actions: 0,
      damage: 0,
      byCharacter: new Map(),
      bySource: new Map(),
    },
  };
}
