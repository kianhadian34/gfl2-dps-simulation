// Data model — mirrors docs/schemas.md. Fields/values marked `verified: false`
// are UNVERIFIED in research (docs/research.md §4) and are surfaced in
// SimulationResult.warnings instead of being silently assumed.

export type Element = "physical" | "burn" | "electric" | "ice" | "acid" | "decay";

/** Main-action slots in a user-defined fixed rotation. */
export type ActionSlot = "basic" | "active1" | "active2" | "ultimate";

/** Damage-source category used for results aggregation (docs/schemas.md §10). */
export type SourceKind = "basic" | "active" | "ultimate" | "passive";

export interface WeaponDef {
  id: string;
  name: string;
  rarity: "standard" | "elite";
  /** Known ATK at proficiency 1 and 60. Exact per-level curve is UNVERIFIED (research §3.9) — linear interpolation for other levels. */
  atkLvl1: number;
  atkLvl60: number;
  level: number;
  subStats: { stat: "pctAtk" | "pctHp" | "pctDef"; value: number }[];
}

export interface StatusApplySpec {
  statusId: string;
  durationRounds: number;
  stacks?: number;
  /** Where the status lands. Default "target". */
  target?: "self" | "target";
}

export interface SkillDef {
  id: string;
  name: string;
  type: "basic" | "active" | "ultimate" | "support";
  element: Element;
  /** Fraction of final ATK — used unless fixedDamage is set. */
  multiplier?: number;
  /** Absolute fixed-damage branch (no crit / no DEF) per research §3.10. */
  fixedDamage?: number;
  stabDamage: number;
  cooldown: number;
  confectanceCost: number;
  appliesStatuses?: StatusApplySpec[];
  /** Generic ultimate hook: effects applied only when cast while Confectance is at cap (research §3.12). */
  onCastAtMaxConfectance?: {
    supportQuotaBonus?: number;
    extraStatuses?: StatusApplySpec[];
  };
}

export type PassiveEffect =
  | { kind: "resource_gain"; resource: "confectance"; amount: number; on: "onDamageDealt" }
  | {
      kind: "conditional_damage_modifier";
      scope: "dealt";
      mode: "additive" | "multiplicative";
      value: number;
      when: "target.noCover";
    }
  | {
      kind: "support_attack";
      skillId: string;
      perRoundMax: number;
      chainable: boolean;
      trigger: "onAllySingleTargetHit";
    };

export interface PassiveDef {
  id: string;
  name: string;
  effects: PassiveEffect[];
}

export interface KeyDef {
  id: string;
  name: string;
  verified: boolean;
  battleStartEffects: { resource: "confectance"; amount: number }[];
}

export interface CharacterDef {
  id: string;
  name: string;
  phase: Element;
  base: { atk: number; hp: number; def: number; stability: number; critRate: number; critDmg: number };
  weapon: WeaponDef;
  skills: { basic: SkillDef; active1: SkillDef; active2: SkillDef; ultimate: SkillDef; support?: SkillDef };
  passive: PassiveDef;
  fixedKeys: KeyDef[];
}

export type StatusEffect =
  | { kind: "stat_modifier"; stat: "atk" | "def" | "hp" | "critRate"; mode: "flat" | "pct"; value: number }
  | {
      kind: "damage_modifier";
      scope: "dealt" | "taken";
      mode: "additive" | "multiplicative";
      value: number;
    }
  | { kind: "damage_reduction"; value: number };

export interface StatusDef {
  id: string;
  name: string;
  category: "buff" | "debuff" | "state";
  stackable: boolean;
  maxStacks: number;
  /** null = permanent until ticked/removed. */
  durationRounds: number | null;
  tickAt: "ownActionEnd" | "roundEnd";
  purgeable: boolean;
  effects: StatusEffect[];
  verified: boolean;
  note?: string;
}

export interface DummyConfig {
  id: string;
  name: string;
  hp: number;
  defense: number;
  stability: number;
  weaknesses: Element[];
  phase: Element | null;
  /** MVP: always "none" (handoff §4); also drives conditional no-cover bonuses. */
  cover: "none";
}

/** Per-status override for UNVERIFIED values (docs/research.md §4 U7/U8 + status data). */
export interface StatusOverride {
  /** Per-stack value for additive/multiplicative damage effects (e.g. Support Boost I/II). */
  perStackValue?: number;
  /** Applied duration in rounds (overrides the skill's appliesStatuses.durationRounds). */
  durationRounds?: number;
  /** Duration tick point (research U7). */
  tickAt?: "ownActionEnd" | "roundEnd";
}

/** Every engine default that research left UNVERIFIED is overridable here (docs/architecture.md §1.5). */
export interface ConfigOverrides {
  critMultiplier?: number; // default 1.5 (research §3.3)
  glanceChance?: number; // default 0 — trigger rule UNVERIFIED (U2)
  exposedDurationRounds?: number; // default 2 — CN beta value (U4)
  exposedDamageMult?: number; // default 1.0 — UNVERIFIED (U3)
  confectanceMax?: number; // default 6 — UNVERIFIED (U9)
  confectanceStart?: number; // default 0 — UNVERIFIED (U9)
  /**
   * Override unverified per-status values: perStackValue (damage mods),
   * durationRounds (applied duration), tickAt (U7). Missing keys keep data defaults.
   */
  statusOverrides?: Record<string, StatusOverride>;
  /**
   * Cooldown decrement model (research U11):
   * - "endOfOwnTurn": set at cast, decrement at end of own turn → cd-1 usable next round (default)
   * - "nextOwnTurnEnd": cd effectively +1 → cd-1 skips the next round
   */
  cooldownModel?: "endOfOwnTurn" | "nextOwnTurnEnd";
}

export interface ScenarioTeamMember {
  characterId: string;
  rotation: ActionSlot[];
  equippedFixedKeys?: string[];
}

export interface Scenario {
  version: number;
  seed: number;
  /** MVP simulation duration cap: integers 1–7 only (8+ rejected with a validation error, never clamped). */
  turns: number;
  team: ScenarioTeamMember[];
  dummy: DummyConfig;
  configOverrides?: ConfigOverrides;
}