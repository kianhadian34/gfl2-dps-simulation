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
  /** Applied duration in rounds — omit to use the status definition's own duration (permanent for durationRounds: null). */
  durationRounds?: number;
  stacks?: number;
  /** Where the status lands. Default "target". */
  target?: "self" | "target";
}

export interface SkillDef {
  id: string;
  name: string;
  type: "basic" | "active" | "ultimate" | "support";
  element: Element;
  /** Ammo/weapon type of the attack (matches `DummyConfig.weaknessTags` — Ammo Weakness dimension, 2026). */
  ammoType?: AmmoType;
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
      /** "dealt" = on the unit's own attacks (attacker); "taken" = on incoming damage (boss/target passives, U5). */
      scope: "dealt" | "taken";
      mode: "additive" | "multiplicative";
      value: number;
      /** Condition evaluated against the receiving target unit. */
      when: "target.noCover" | "target.stabilityAboveZero";
    }
  | {
      kind: "support_attack";
      skillId: string;
      perRoundMax: number;
      chainable: boolean;
      trigger: "onAllySingleTargetHit";
    }
  | {
      /**
       * U19 Crit-Rate overflow conversion (CONFIRMED by in-game passive text, 2026-09-03):
       * effective Crit Rate caps at `threshold` (default 1.0 = 100%); every 1% of overflow
       * Crit Rate converts to 1% Crit DMG (ratio, default 1.0 — 1:1). `cap` optionally
       * limits the converted Crit DMG. Character-specific: a doll only gets this via its
       * own passive data — never a global rule.
       */
      kind: "excess_crit_conversion";
      threshold: number;
      ratio: number;
      cap?: number;
    }
  | {
      /**
       * Target-side stack trigger (Ammo Weakness Upgrade, validated 2026):
       * declared on the TARGET (DummyConfig.passives). Fires when an attack
       * exploits `weaknessTag` AND its element is in `requiresElements`
       * (AWU: physical-only — Phase/elemental exploits do not advance stacks
       * unless later validated otherwise). The first exploit applies
       * `firstGain` stacks, every subsequent exploit adds `gainPerEvent`,
       * capped at `maxStacks`. Data-driven — the 2/1/5 progression lives here,
       * not in the damage formula. `statusId` must be a stackable target status.
       */
      kind: "grant_stacks_on_weakness_exploit";
      weaknessTag: string;
      statusId: string;
      firstGain: number;
      gainPerEvent: number;
      maxStacks: number;
      requiresElements?: Element[];
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
  | { kind: "damage_reduction"; value: number }
  | {
      /**
       * Stack-tier damage modifier (Ammo Weakness Upgrade, validated 2026):
       * value is a per-stack TIER lookup (non-linear), not `value × stacks`.
       * `tiers[stacks]` is used; stacks above the highest tier stay at the top
       * tier; stacks below the lowest tier contribute 0. `when.element` gates
       * the effect to specific attack elements (AWU: physical only — Phase
       * damage bypasses it naturally; there is no AWU special-case branch).
       */
      kind: "stack_tier_modifier";
      scope: "dealt" | "taken";
      mode: "additive";
      tiers: Record<number, number>;
      when?: { element: Element[] };
    };

export interface StatusDef {
  id: string;
  name: string;
  category: "buff" | "debuff" | "state" | "upgrade";
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

/** Ammo/weapon-type weakness tags (project terminology: Assault Rifle Ammo, Shotgun Ammo). */
export type AmmoType = "assault_rifle_ammo" | "shotgun_ammo";

export interface DummyConfig {
  id: string;
  name: string;
  hp: number;
  defense: number;
  stability: number;
  /** Dummy-exposed elemental weaknesses (research §3.5) — matched against the attack element. */
  weaknesses: Element[];
  /** Dummy-exposed ammo/weapon-type weakness tags (Ammo Weakness Upgrade, 2026) — matched against the attack's ammo type. */
  weaknessTags?: AmmoType[];
  phase: Element | null;
  /** MVP: always "none" (handoff §4); also drives conditional no-cover bonuses. */
  cover: "none";
  /** Optional boss/target passives (U5): stability-conditional taken modifiers etc. — data-driven, per-boss values. */
  passives?: PassiveDef[];
}

/** Per-status override for UNVERIFIED values (docs/research.md §4 U7/U8 + status data). */
export interface StatusOverride {
  /** Per-stack value for additive/multiplicative damage effects (e.g. Support Boost I/II). */
  perStackValue?: number;
  /** Applied duration in rounds (overrides the skill's appliesStatuses.durationRounds). */
  durationRounds?: number;
  /** Duration tick point — CONFIRMED default for normal timed buffs: recipient's action end (`ownActionEnd`, U7, in-game 2026-09-03); override retained for alternative testing. */
  tickAt?: "ownActionEnd" | "roundEnd";
}

/** Every engine default that research left UNVERIFIED is overridable here (docs/architecture.md §1.5). */
export interface ConfigOverrides {
  /**
   * Test-only alternative crit multiplier. Default: the engine derives
   * 1 + Crit DMG from the attacker (confirmed in-game, U1 + U19 CDMG half).
   */
  critMultiplier?: number;
  exposedDurationRounds?: number; // default 2 — CN beta value (U4)
  confectanceMax?: number; // default 6 — UNVERIFIED (U9)
  confectanceStart?: number; // default 0 — UNVERIFIED (U9)
  /**
   * Override unverified per-status values: perStackValue (damage mods),
   * durationRounds (applied duration), tickAt (U7). Missing keys keep data defaults.
   */
  statusOverrides?: Record<string, StatusOverride>;
  /**
   * Cooldown decrement model (research U11 — CONFIRMED 2026-09-03):
   * a CD-N skill waits N full turns after its cast turn:
   *   "nextOwnTurnEnd" (DEFAULT): cast T1 → unavailable T2 → available T3 for CD-1.
   *   "endOfOwnTurn": alternative hypothesis ("usable next turn") — kept
   *   selectable for testing only.
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