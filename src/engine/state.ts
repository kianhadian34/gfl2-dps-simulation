import type { AbilityDef, AbilitySlot, ActionSlot, AmmoType, AttachmentConfig, CharacterDef, CommonKeyStat, ConfigOverrides, Element, PassiveEffect, Scenario, SkillDefVariant, SourceKind, StatusDef, StatusOverride, WeaponCalibrationDef, WeaponDef } from "../model/types.js";
import { buildGrid, type GridState } from "./grid.js";
import { finalStat } from "./stats.js";
import type { ActiveStatus, LogEvent, ResolvedConfig } from "../model/runtime.js";
import { Rng } from "./rng.js";
import type { Registry } from "../data/registry.js";
import { DISPATCH_STAT_BUFFS } from "../data/dispatch.js";
import { PERMANENT_COOKING_STATS } from "../data/cooking-stats.js";
import { REMOLDER_BUFFS } from "../data/remolder.js";
import { NEURAL_HELIX_GLOBAL_PCT } from "../data/neural-helix.js";
import { resolveAttachmentStats, validateAttachmentConfig } from "../data/attachments.js";
import { COMMON_KEY_SELECTABLE_STAT_KINDS } from "../data/common-keys.js";
import { apexStatTotals, resolveApexChassis, type ResolvedApexComponent } from "./apex.js";
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

/**
 * DEFAULT AFFINITY LEVEL (2026): every character sits at Affinity Level 5 unless the scenario
 * member supplies an EXPLICIT `affinityLevel` (an explicit value always wins — never overridden).
 * Level 5 is the game's standard default (in-game 2026), so characters automatically receive their
 * cumulative Lv.1–5 Affinity contributions (for Qiongjiu: +115 ATK / +292 HP / +108 DEF flat). This
 * is a GENERIC engine default — no character-specific logic; characters with no Affinity data are
 * unaffected. Applied at the ONE place the level is resolved (see `createState`), so the panel path
 * and the Blossom raw-ATK basis can never diverge.
 */
export const DEFAULT_AFFINITY_LEVEL = 5;

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
  /** BOSS target flag (2026): true when this unit is a boss (DummyConfig.isBoss); drives boss-gated modifiers (Sentinel "Thronebreaker"). */
  isBoss: boolean;
  /** Per-turn tracker for Vanguard "Shock and Awe" (2026): the round in which this unit last applied its first-target Stability bonus (−1 = never). */
  lastStabilityTurn: number;
  /** Per-turn trackers for Support once-per-turn recovery (2026): Life Recovery / Equilibrium Recovery (−1 = never). */
  lastHealTurn: number;
  lastStabilityRecoveryTurn: number;
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
   * PATTERN REMOLDER (2026): resolved per-unit state — flat source, active (clamped) buffs,
   * category totals, active Set Bonuses, resolved modifiers (existing buckets) and the
   * team-granted Unity / battle-start allied percentages — kept for provenance and the
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
  /**
   * WEAPON ATTACHMENTS (2026): the ACTIVE Attachment Set id (loadout-level selection). Consumed by
   * `attachmentSetDealtBonus` in the existing additive DMG% dealt bucket. Absent = no set bonus.
   */
  activeAttachmentSet?: string;
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
  /**
   * APEX CHASSIS (2026, scenario-level/account-wide): the RESOLVED equipped components, carried so
   * the damage path can consume their secondary effects. Empty = no Apex Chassis.
   */
  apexComponents: ResolvedApexComponent[];
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

/** Panel formula: Final Stat = ceil((Initial + Flat) × (1 + Stat%)) — formula Mathematically Proven; integer DISPLAY Validated; exact hidden rounding method Not Tested (stats.ts). `weapon` is the scenario-EQUIPPED weapon (null = none). `dispatchFlat` is the permanent global `dispatch_stat_buffs` by Class (src/data/dispatch.ts) — a SEPARATE flat source folded here BEFORE percentage modifiers; absent = no dispatch (two-arg callers unchanged, e.g. direct formula tests). `remolderFlat`/`neuralHelixFlat` are further SEPARATE flat sources (Pattern Remolder Lv.60 flats; Neural Helix), all summed into the SAME flat bucket. `affinityFlat` is the standalone Affinity-Level flat source (CharacterDef.affinityFlatStats), summed into that same bucket. */
export function computePanel(
  def: CharacterDef,
  weapon: WeaponDef | null,
  dispatchFlat?: { atk?: number; hp?: number; def?: number },
  remolderFlat?: { atk?: number; hp?: number; def?: number },
  neuralHelixFlat?: { atk?: number; hp?: number; def?: number },
  affinityFlat?: { atk?: number; hp?: number; def?: number },
  attachmentFlat?: { atk?: number; hp?: number; def?: number },
  cookingFlat?: { atk?: number; hp?: number; def?: number },
): { atk: number; hp: number; def: number } {
  const weaponAtkBonus = weaponAtk(weapon);
  const pctAtk = (weapon?.subStats ?? []).filter((s) => s.stat === "pctAtk").reduce((a, s) => a + s.value, 0);
  const pctHp = (weapon?.subStats ?? []).filter((s) => s.stat === "pctHp").reduce((a, s) => a + s.value, 0);
  const pctDef = (weapon?.subStats ?? []).filter((s) => s.stat === "pctDef").reduce((a, s) => a + s.value, 0);
  // Game-authoritative FINAL STAT rounding: the integer results feed every downstream consumer
  // (damage ATK/DEF, applier-ATK fixed damage, HP pools).
  return {
    atk: finalStat(def.base.atk, weaponAtkBonus + (dispatchFlat?.atk ?? 0) + (remolderFlat?.atk ?? 0) + (neuralHelixFlat?.atk ?? 0) + (affinityFlat?.atk ?? 0) + (attachmentFlat?.atk ?? 0) + (cookingFlat?.atk ?? 0), pctAtk),
    hp: finalStat(def.base.hp, (dispatchFlat?.hp ?? 0) + (remolderFlat?.hp ?? 0) + (neuralHelixFlat?.hp ?? 0) + (affinityFlat?.hp ?? 0) + (attachmentFlat?.hp ?? 0) + (cookingFlat?.hp ?? 0), pctHp),
    def: finalStat(def.base.def, (dispatchFlat?.def ?? 0) + (remolderFlat?.def ?? 0) + (neuralHelixFlat?.def ?? 0) + (affinityFlat?.def ?? 0) + (attachmentFlat?.def ?? 0) + (cookingFlat?.def ?? 0), pctDef),
  };
}

/**
 * NEURAL HELIX FLAT (2026): the character's static flat ATK/HP/DEF (CharacterDef.neuralHelixStats),
 * gated EXACTLY like the other permanent character/global flat sources — controlled math fixtures
 * (`applyDispatchStats === false`) exclude it, and Debug-authoritative overrides suppress it on
 * overridden stats. Extracted so the panel path and the raw-ATK basis used for team-order selection
 * (Blossom top-N) share ONE implementation and can never diverge.
 */
function resolveNeuralHelixFlat(
  def: CharacterDef,
  applyDispatchStats: boolean | undefined,
  overridesAuthoritative: boolean | undefined,
  baseStatOverrides: { atk?: number; hp?: number; def?: number; stability?: number; critRate?: number; critDmg?: number } | undefined,
): { atk: number; hp: number; def: number } {
  const base = { atk: def.neuralHelixStats?.atk ?? 0, hp: def.neuralHelixStats?.hp ?? 0, def: def.neuralHelixStats?.def ?? 0 };
  if (applyDispatchStats === false) return { atk: 0, hp: 0, def: 0 };
  if (overridesAuthoritative === true && baseStatOverrides) {
    return {
      atk: Object.prototype.hasOwnProperty.call(baseStatOverrides, "atk") ? 0 : base.atk,
      hp: Object.prototype.hasOwnProperty.call(baseStatOverrides, "hp") ? 0 : base.hp,
      def: Object.prototype.hasOwnProperty.call(baseStatOverrides, "def") ? 0 : base.def,
    };
  }
  return base;
}

/**
 * Debug-authoritative per-stat key test: an explicit `baseStatOverrides.<stat>` under
 * `overridesAuthoritative` makes that stat AUTHORITATIVE — the other permanent sources must not
 * alter it. Shared predicate so the Neural Helix FLAT and PERCENTAGE contributions suppress the
 * same stats consistently (Debug ATK override stays exactly 1500).
 */
function isAuthoritativelyOverridden(
  baseStatOverrides: { atk?: number; hp?: number; def?: number } | undefined,
  stat: "atk" | "hp" | "def",
  overridesAuthoritative: boolean | undefined,
): boolean {
  return overridesAuthoritative === true && baseStatOverrides !== undefined && Object.prototype.hasOwnProperty.call(baseStatOverrides, stat);
}

/**
 * AFFINITY-LEVEL FLAT (2026): the character's standalone Affinity-Level flat ATK/HP/DEF
 * (CharacterDef.affinityFlatStats), accumulated CUMULATIVELY through the active level (each
 * present entry is that level's PER-LEVEL increase; absent levels add nothing — no
 * interpolation). Gated EXACTLY like the other flat-bucket sources (Dispatch / Remolder flats /
 * Neural Helix): controlled math fixtures (`applyDispatchStats === false`) exclude it, and
 * Debug-authoritative overrides suppress it on overridden stats. Extracted so the panel path and
 * the raw-ATK basis (Blossom top-N) share ONE implementation and can never diverge.
 */
function resolveAffinityFlat(
  def: CharacterDef,
  level: number | undefined,
  applyDispatchStats: boolean | undefined,
  overridesAuthoritative: boolean | undefined,
  baseStatOverrides: { atk?: number; hp?: number; def?: number; stability?: number; critRate?: number; critDmg?: number } | undefined,
): { atk: number; hp: number; def: number } {
  const base = { atk: 0, hp: 0, def: 0 };
  if (level !== undefined) {
    for (let lv = 1; lv <= level; lv++) {
      const entry = def.affinityFlatStats?.[lv];
      if (!entry) continue;
      base.atk += entry.atk ?? 0;
      base.hp += entry.hp ?? 0;
      base.def += entry.def ?? 0;
    }
  }
  if (applyDispatchStats === false) return { atk: 0, hp: 0, def: 0 };
  if (overridesAuthoritative === true && baseStatOverrides) {
    return {
      atk: Object.prototype.hasOwnProperty.call(baseStatOverrides, "atk") ? 0 : base.atk,
      hp: Object.prototype.hasOwnProperty.call(baseStatOverrides, "hp") ? 0 : base.hp,
      def: Object.prototype.hasOwnProperty.call(baseStatOverrides, "def") ? 0 : base.def,
    };
  }
  return base;
}

/**
 * PERMANENT COOKING STATS FLAT (2026): a user-toggleable permanent flat ATK/DEF/HP bonus
 * (`PERMANENT_COOKING_STATS`), folded into the SAME flat bucket as the other permanent sources —
 * no second stat system. Gated EXACTLY like them: OFF unless the member enables it
 * (`permanentCookingStats === true`), excluded by controlled math fixtures
 * (`applyDispatchStats === false`), and suppressed on any stat under a Debug-authoritative override.
 */
function resolveCookingFlat(
  enabled: boolean | undefined,
  applyDispatchStats: boolean | undefined,
  overridesAuthoritative: boolean | undefined,
  baseStatOverrides: { atk?: number; hp?: number; def?: number; stability?: number; critRate?: number; critDmg?: number } | undefined,
): { atk: number; hp: number; def: number } {
  if (enabled !== true) return { atk: 0, hp: 0, def: 0 };
  if (applyDispatchStats === false) return { atk: 0, hp: 0, def: 0 };
  const full = PERMANENT_COOKING_STATS;
  if (overridesAuthoritative === true && baseStatOverrides) {
    return {
      atk: Object.prototype.hasOwnProperty.call(baseStatOverrides, "atk") ? 0 : full.atk,
      hp: Object.prototype.hasOwnProperty.call(baseStatOverrides, "hp") ? 0 : full.hp,
      def: Object.prototype.hasOwnProperty.call(baseStatOverrides, "def") ? 0 : full.def,
    };
  }
  return { atk: full.atk, hp: full.hp, def: full.def };
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
  commonKeyStatChoices: Record<string, CommonKeyStat[]> | undefined,
  expansionKeyId: string | undefined,
  weapon: WeaponDef | null,
  weaponCalibrationLevel: number | undefined,
  attachments: AttachmentConfig | undefined,
  activeAttachmentSet: string | undefined,
  apexStats: import("../model/types.js").ApexComponentStats | undefined,
  permanentCookingStats: boolean | undefined,
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
  // SUPPORT ICHOR (2026): flat HP from INITIAL ATK (Ichor Resonance) and flat ATK from INITIAL
  // max HP (Ichor Conversion) — flat contributions folded with the other Remolder flats, BEFORE
  // percentage modifiers. "Initial" = the character's base (after any per-member base override).
  const ichorFlat = {
    atk: remolderPlan.atkPctOfBaseHp * def.base.hp,
    hp: remolderPlan.hpPctOfBaseAtk * def.base.atk,
    def: 0,
  };
  const remolderFlatFull = {
    atk: remolderPlan.flat.atk + ichorFlat.atk,
    hp: remolderPlan.flat.hp + ichorFlat.hp,
    def: remolderPlan.flat.def + ichorFlat.def,
  };
  const remolderFlat =
    applyDispatchStats === false
      ? { atk: 0, hp: 0, def: 0 }
      : overridesAuthoritative === true
        ? (baseStatOverrides
            ? {
                atk: Object.prototype.hasOwnProperty.call(baseStatOverrides, "atk") ? 0 : remolderFlatFull.atk,
                hp: Object.prototype.hasOwnProperty.call(baseStatOverrides, "hp") ? 0 : remolderFlatFull.hp,
                def: Object.prototype.hasOwnProperty.call(baseStatOverrides, "def") ? 0 : remolderFlatFull.def,
              }
            : remolderFlatFull)
        : remolderFlatFull;
  // NEURAL HELIX FLAT (2026): a SEPARATE permanent per-character flat source (CharacterDef.
  // neuralHelixStats.atk/hp/def) summed into the SAME flat bucket via `computePanel`. Gating is
  // shared with the raw-ATK basis below via `resolveNeuralHelixFlat` (no duplicated logic).
  const neuralHelixFlat = resolveNeuralHelixFlat(def, applyDispatchStats, overridesAuthoritative, baseStatOverrides);
  // AFFINITY-LEVEL FLAT (2026): a SEPARATE per-character flat source (CharacterDef.
  // affinityFlatStats), accumulated cumulatively through the active Affinity Level and summed into
  // the SAME flat bucket. Same gating as the other flat sources (shared helper with the raw-ATK basis).
  const affinityFlat = resolveAffinityFlat(def, affinity?.level, applyDispatchStats, overridesAuthoritative, baseStatOverrides);
  // WEAPON ATTACHMENTS (2026): user-selected per-slot max-stat configuration folded into the SAME
  // existing buckets as every other stat source — flat → the flat bucket; % → the percentage
  // buckets; Crit Rate / Crit DMG → the existing panel crit stats. NO new bucket, NO damage-formula
  // change. (Set EFFECTS are NOT implemented here.) Attachments are EXPLICIT EQUIPMENT (like
  // `weaponId`/`commonKeyIds`) — absent = 0, so controlled math fixtures are unaffected; a fixture
  // that DOES set `attachments` observes them. Debug-authoritative overrides still suppress them on
  // overridden stats (an authoritative Debug ATK must not gain attachment ATK underneath it).
  const attach = resolveAttachmentStats(attachments);
  const attachFlat = {
    atk: isAuthoritativelyOverridden(baseStatOverrides, "atk", overridesAuthoritative) ? 0 : attach.flat.atk,
    hp: isAuthoritativelyOverridden(baseStatOverrides, "hp", overridesAuthoritative) ? 0 : attach.flat.hp,
    def: isAuthoritativelyOverridden(baseStatOverrides, "def", overridesAuthoritative) ? 0 : attach.flat.def,
  };
  const attachPct = {
    atk: isAuthoritativelyOverridden(baseStatOverrides, "atk", overridesAuthoritative) ? 0 : attach.pct.atk,
    hp: isAuthoritativelyOverridden(baseStatOverrides, "hp", overridesAuthoritative) ? 0 : attach.pct.hp,
    def: isAuthoritativelyOverridden(baseStatOverrides, "def", overridesAuthoritative) ? 0 : attach.pct.def,
  };
  const attachCrit = { critRate: attach.critRate, critDmg: attach.critDmg };
  // PERMANENT COOKING STATS FLAT (2026): user-toggleable permanent flat ATK/DEF/HP — folded into the
  // SAME flat bucket as the other permanent sources (no second stat system).
  const cookingFlat = resolveCookingFlat(permanentCookingStats, applyDispatchStats, overridesAuthoritative, baseStatOverrides);
  const panel = computePanel(def, weapon, dispatchFlat, remolderFlat, neuralHelixFlat, affinityFlat, attachFlat, cookingFlat);
  const aff = resolveAffinityBonus(def, affinity?.keyId, affinity?.level, registry);
  // Common Keys (generic architecture, 2026; CORRECTED stat-slot model 2026): REUSABLE
  // definitions resolved via the registry (max 3 — "3 Common Key Slots"; fewer allowed). A key
  // has ordered STAT SLOTS: slot #0 is its FIXED stat; slots after it are PLAYER-CHOSEN kinds
  // (`commonKeyStatChoices[keyId][i]`, value fixed by the key). A key's SECONDARY EFFECT may
  // carry an executed `stats` payload (e.g. Strategic Negotiation's +7% out-of-turn). All contributions SUM and fold
  // through the EXISTING generic stat path — ATK% via the Final Stat formula; Crit Rate / Crit DMG
  // additive; Out-of-Turn Damage is a panel stat consumed only by out-of-turn events. No
  // character-id logic: any doll may equip any common key.
  const commonStats: Partial<Record<CommonKeyStat, number>> = {};
  const addCommonStat = (stat: CommonKeyStat, value: number): void => {
    commonStats[stat] = (commonStats[stat] ?? 0) + value;
  };
  for (const keyId of commonKeyIds) {
    const commonDef = registry.getCommonKey(keyId);
    if (!commonDef) throw new Error(`Unknown common key: ${keyId}`);
    const choices = commonKeyStatChoices?.[keyId] ?? [];
    const fixedCount = commonDef.fixedStatCount ?? 1;
    commonDef.stats.forEach((slot, i) => {
      // Slot #0 (and any slot < fixedCount) is hardcoded; later slots use the player's chosen kind.
      // A fixed slot with a visible `kind` always applies; a SELECTABLE slot applies only when the
      // player chose a kind (data `kind` on a selectable slot is NOT consulted — the model forbids it).
      const kind = i < fixedCount ? slot.kind : choices[i - fixedCount];
      if (kind === undefined) return;
      addCommonStat(kind, slot.value);
    });
    // Executed secondary-effect stat payload (recorded `status`/`passive` variants are NOT executed).
    if (commonDef.secondaryEffect?.type === "stat" && commonDef.secondaryEffect.stats) {
      for (const [stat, value] of Object.entries(commonDef.secondaryEffect.stats)) {
        addCommonStat(stat as CommonKeyStat, value ?? 0);
      }
    }
  }
  // STANDALONE character Affinity-LEVEL stats (2026, confirmed): Lv5 none, Lv9 ATK/HP/DEF +5% —
  // independent of the equipped Affinity Key (exact level map; absent levels grant nothing).
  const levelStat = def.affinityLevelStats?.[affinity?.level ?? 0] ?? {};
  // NEURAL HELIX PERCENTAGE (2026): character-specific atkPct/hpPct/defPct + the UNIVERSAL
  // NEURAL_HELIX_GLOBAL_PCT, added into the EXISTING percentage buckets (same source: every real
  // character). Controlled fixtures exclude it exactly like the other permanent sources. Under the
  // Debug-authoritative contract, an explicitly overridden stat is AUTHORITATIVE — its Neural Helix
  // percentage is suppressed too (Debug ATK 1500 must stay exactly 1500, not 1500 × 1.22).
  const nhActive = applyDispatchStats !== false;
  const nhPct = {
    atkPct: nhActive && !isAuthoritativelyOverridden(baseStatOverrides, "atk", overridesAuthoritative) ? (def.neuralHelixStats?.atkPct ?? 0) + NEURAL_HELIX_GLOBAL_PCT : 0,
    hpPct: nhActive && !isAuthoritativelyOverridden(baseStatOverrides, "hp", overridesAuthoritative) ? (def.neuralHelixStats?.hpPct ?? 0) + NEURAL_HELIX_GLOBAL_PCT : 0,
    defPct: nhActive && !isAuthoritativelyOverridden(baseStatOverrides, "def", overridesAuthoritative) ? (def.neuralHelixStats?.defPct ?? 0) + NEURAL_HELIX_GLOBAL_PCT : 0,
  };
  // APEX CHASSIS always-on stats (2026, scenario-level/account-wide): ATK%/HP%/DEF% fold into the
  // EXISTING percentage buckets like every other permanent source. Under the Debug-authoritative
  // contract an explicitly overridden stat is AUTHORITATIVE, so its Apex percentage is suppressed
  // too (same rule as Neural Helix above). All-Element Boost is NOT folded anywhere — it is RECORDED
  // but INERT (it only acts through the unmodeled RES system; see src/engine/apex.ts).
  const apexAtkPct = !isAuthoritativelyOverridden(baseStatOverrides, "atk", overridesAuthoritative) ? (apexStats?.atkPct ?? 0) : 0;
  const apexHpPct = !isAuthoritativelyOverridden(baseStatOverrides, "hp", overridesAuthoritative) ? (apexStats?.hpPct ?? 0) : 0;
  const apexDefPct = !isAuthoritativelyOverridden(baseStatOverrides, "def", overridesAuthoritative) ? (apexStats?.defPct ?? 0) : 0;
  const atkPct = (commonStats.atkPct ?? 0) + aff.atk + (levelStat.atkPct ?? 0) + nhPct.atkPct + attachPct.atk + apexAtkPct + remolderPlan.selfPct.atk + remolderGrants.unityPct.atk + remolderGrants.alliedPct.atk;
  const hpPct = (commonStats.hpPct ?? 0) + aff.hp + (levelStat.hpPct ?? 0) + nhPct.hpPct + attachPct.hp + apexHpPct + remolderPlan.selfPct.hp + remolderGrants.unityPct.hp + remolderGrants.alliedPct.hp;
  const defPct = (commonStats.defPct ?? 0) + (levelStat.defPct ?? 0) + nhPct.defPct + attachPct.def + apexDefPct + remolderPlan.selfPct.def + remolderGrants.unityPct.def + remolderGrants.alliedPct.def;
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
    activeAttachmentSet,
    weaknessElements: [],
    weaknessTags: [],
    raceTypes: [],
    isBoss: false,
    lastStabilityTurn: -1,
    lastHealTurn: -1,
    lastStabilityRecoveryTurn: -1,
    cover: "none",
    phase: def.phase,
    // Affinity Key (Warm as Jade, VALIDATED): own-key levels fold into the panel via the proven
    // Final Stat formula (ceil((base+flat)×(1+pct))); CritDMG is ADDITIVE on the panel value and
    // feeds the existing crit-multiplier chain (no parallel stat system, damage formula untouched).
    panelAtk: atkPct > 0 ? finalStat(panel.atk, 0, atkPct) : panel.atk,
    hp: hpPct > 0 ? finalStat(panel.hp, 0, hpPct) : panel.hp,
    maxHp: hpPct > 0 ? finalStat(panel.hp, 0, hpPct) : panel.hp,
    defStat: defPct > 0 ? finalStat(panel.def, 0, defPct) : panel.def,
    critRate: def.base.critRate + (commonStats.critRate ?? 0) + remolderPlan.critRate + attachCrit.critRate,
    critDmg: def.base.critDmg + aff.critDmg + (commonStats.critDmg ?? 0) + remolderPlan.critDmg + attachCrit.critDmg,
    outOfTurnDmg: (commonStats.outOfTurnDmg ?? 0) + remolderPlan.outOfTurnDmg,
    // PATTERN REMOLDER (2026): full resolved state kept for combat consumption + provenance.
    remolder:
      remolderPlan.activeBuffs.length > 0 ||
      remolderPlan.activeSetBonusIds.length > 0 ||
      remolderPlan.flat.atk !== 0 ||
      remolderPlan.flat.hp !== 0 ||
      remolderPlan.flat.def !== 0 ||
      remolderPlan.modifiers.length > 0
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
    isBoss: d.isBoss === true,
    lastStabilityTurn: -1,
    lastHealTurn: -1,
    lastStabilityRecoveryTurn: -1,
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
    // COMMON KEY stat choices (2026): the player picks the KIND for each key's SELECTABLE slots
    // (slots after its fixed first one). Validate loudly — never silently drop a choice.
    if (m.commonKeyStatChoices) {
      for (const [keyId, choices] of Object.entries(m.commonKeyStatChoices)) {
        if (!(m.commonKeyIds ?? []).includes(keyId)) {
          throw new Error(`Team member ${m.characterId}: commonKeyStatChoices has an entry for "${keyId}" which is not equipped`);
        }
        const key = registry.getCommonKey(keyId);
        if (!key) throw new Error(`Team member ${m.characterId}: unknown common key: ${keyId}`);
        const fixedCount = key.fixedStatCount ?? 1;
        const selectable = key.stats.length - fixedCount;
        if (choices.length > selectable) {
          throw new Error(
            `Team member ${m.characterId}: key "${keyId}" has ${selectable} selectable stat slot(s); got ${choices.length} choice(s)`,
          );
        }
        for (const kind of choices) {
          if (!COMMON_KEY_SELECTABLE_STAT_KINDS.includes(kind)) {
            throw new Error(`Team member ${m.characterId}: key "${keyId}" — kind "${kind}" is not a selectable Common Key stat kind`);
          }
        }
        // NO DUPLICATES: the chosen kinds must differ from each other AND from the key's fixed stat
        // (all 3 stat kinds on a key must be different — 2026, user-confirmed).
        const fixedKinds = key.stats.slice(0, fixedCount).map((s) => s.kind).filter((k): k is CommonKeyStat => k !== undefined);
        const combined = [...fixedKinds, ...choices];
        if (new Set(combined).size !== combined.length) {
          throw new Error(
            `Team member ${m.characterId}: key "${keyId}" — the selectable stat kinds must differ from each other and from the fixed stat ("${fixedKinds.join(", ")}"); got ${choices.join(", ")}`,
          );
        }
      }
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
    // WEAPON ATTACHMENTS (2026): validate the per-slot configuration against the confirmed contract
    // (per-slot maxima, unique stats, Muzzle-only Crit Damage) — rejected loudly, never silently.
    const attachErrors = validateAttachmentConfig(m.attachments);
    if (attachErrors.length > 0) {
      throw new Error(`Team member ${m.characterId}: invalid attachment configuration — ${attachErrors.join("; ")}`);
    }
  }
  const config = resolveConfig(scenario.configOverrides);
  // PATTERN REMOLDER (2026): resolve every member's plan (clamp/totals/set activation) then
  // the team-level grants (Unity strongest, battle-start allied %) BEFORE makeDoll folds them
  // into the ONE panel path and the modifier buckets.
  const remolderBuffDefs = scenario.remolderBuffSet ?? REMOLDER_BUFFS;
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
    // Ichor (Support 2026) also contributes flat from the INITIAL base stats for the top-ATK selection.
    const ichor = { atk: remolderPlans[i].atkPctOfBaseHp * d.base.hp, hp: remolderPlans[i].hpPctOfBaseAtk * d.base.atk, def: 0 };
    // NEURAL HELIX flat ATK is part of the REAL panel basis, so it must also feed the raw-ATK basis
    // used for Blossom's top-N highest-ATK selection — same gating as the panel (`resolveNeuralHelixFlat`).
    const nhFlat = resolveNeuralHelixFlat(rd, m.applyDispatchStats, m.overridesAuthoritative, m.baseStatOverrides);
    // AFFINITY-LEVEL flat (2026) is likewise part of the real panel basis — same gating (`resolveAffinityFlat`).
    const affFlat = resolveAffinityFlat(rd, m.affinityLevel ?? DEFAULT_AFFINITY_LEVEL, m.applyDispatchStats, m.overridesAuthoritative, m.baseStatOverrides);
    // WEAPON ATTACHMENT flat (2026) is likewise part of the real panel basis — EXPLICIT EQUIPMENT
    // (absent = 0), same as the panel path; Debug-authoritative overrides suppress it per stat.
    // WEAPON ATTACHMENT flat (2026) is likewise part of the real panel basis — EXPLICIT EQUIPMENT
    // (absent = 0), NOT gated by the controlled-fixture switch (matching the panel path); a
    // Debug-authoritative override still suppresses it per stat.
    const attachFlatRaw = resolveAttachmentStats(m.attachments).flat;
    const aFlat =
      m.overridesAuthoritative === true && m.baseStatOverrides
        ? {
            atk: Object.prototype.hasOwnProperty.call(m.baseStatOverrides, "atk") ? 0 : attachFlatRaw.atk,
            hp: Object.prototype.hasOwnProperty.call(m.baseStatOverrides, "hp") ? 0 : attachFlatRaw.hp,
            def: Object.prototype.hasOwnProperty.call(m.baseStatOverrides, "def") ? 0 : attachFlatRaw.def,
          }
        : attachFlatRaw;
    let flat = { atk: aFlat.atk, hp: aFlat.hp, def: aFlat.def };
    if (m.applyDispatchStats !== false) {
      const df = DISPATCH_STAT_BUFFS[rd.class];
      // PERMANENT COOKING STATS flat (2026) is likewise part of the real panel basis — same gating.
      const ck = resolveCookingFlat(m.permanentCookingStats, m.applyDispatchStats, m.overridesAuthoritative, m.baseStatOverrides);
      flat = {
        atk: remolderPlans[i].flat.atk + ichor.atk + df.atk + nhFlat.atk + affFlat.atk + aFlat.atk + ck.atk,
        hp: remolderPlans[i].flat.hp + ichor.hp + df.hp + nhFlat.hp + affFlat.hp + aFlat.hp + ck.hp,
        def: remolderPlans[i].flat.def + ichor.def + df.def + nhFlat.def + affFlat.def + aFlat.def + ck.def,
      };
    }
    return computePanel(d, w, undefined, flat).atk;
  });
  const remolderGrants = resolveRemolderTeam(remolderPlans, remolderRawAtk);
  // APEX CHASSIS (2026, scenario-level/account-wide): resolve + validate the equipped components
  // ONCE for the whole team. The always-on ATK%/HP%/DEF% totals are shared by every member;
  // All-Element Boost is recorded but inert.
  const apexComponents = resolveApexChassis(scenario.apexChassis, (id) => registry.getApexComponent(id));
  const apexStats = apexStatTotals(apexComponents);
  // SUPPORT allied-damage Unity (2026): the winning instance is granted to the owner's allies as
  // `additive_dealt` modifiers (source "unity") — folded into each recipient's resolved modifiers
  // so the EXISTING dealt-bonus path consumes them (no parallel path).
  remolderPlans.forEach((plan, i) => {
    for (const grant of remolderGrants[i].unityDealt) plan.modifiers.push(grant);
  });
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
    return makeDoll(def, m.rotation, m.equippedFixedKeys ?? [], { keyId: m.affinityKeyId, level: m.affinityLevel ?? DEFAULT_AFFINITY_LEVEL }, m.commonKeyIds ?? [], m.commonKeyStatChoices, m.expansionKeyId, weapon, weaponCalibrationLevel, m.attachments, m.activeAttachmentSet, apexStats, m.permanentCookingStats, m.baseStatOverrides, m.applyDispatchStats, m.overridesAuthoritative, remolderPlans[i], remolderGrants[i], config, registry);
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
    apexComponents,
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
