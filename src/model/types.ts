// Data model — mirrors docs/schemas.md. Fields/values marked `verified: false`
// are UNVERIFIED in research (docs/research.md §4) and are surfaced in
// SimulationResult.warnings instead of being silently assumed.

import type { GridConfig } from "./grid.js";

// FINAL Global-release element vocabulary (2026): exactly five PHASE elements.
// ice→freeze and acid→corrosion were renames; hydro was added; `physical` and `decay`
// are REMOVED from the element vocabulary — "Physical" is represented by the Ammo
// Weakness dimension (AmmoType), and Decay is not part of the project taxonomy.
// Attacks without a phase element carry `element: null` (phase-less = physical-ammo attacks).
export type Element = "burn" | "hydro" | "freeze" | "electric" | "corrosion";

/** Main-action slots in a user-defined fixed rotation. */
export type ActionSlot = "basic" | "active1" | "active2" | "ultimate";

/** All ability slots incl. the support (out-of-turn) ability and the passive — a Fortification can upgrade any of them. */
export type AbilitySlot = ActionSlot | "support" | "passive";

/** Damage-source category used for results aggregation (docs/schemas.md §10). */
export type SourceKind = "basic" | "active" | "ultimate" | "passive";

/**
 * Per-calibration WEAPON EFFECT data (Golden Melody, SOURCE FACTS 2026): calibration changes
 * ONLY the weapon Effect — never the max-level base stats. Values drive the engine GENERICALLY
 * (no per-calibration branches). C1 Damage Dealt (+10%) and C1 Charging (+10%/stack) are
 * combat-VALIDATED (975 / 1434); other calibrations are documented source facts consumed by the
 * same generic path (no separate combat validation required, per the evidence).
 */
export interface WeaponCalibrationDef {
  /** Damage Dealt +% (all attacks) — additive in the existing DMG% bucket. */
  damageDealt?: number;
  /** Charging-style per-gain weapon-effect counter: +Support Action damage per stack (additive, support-scoped); each qualifying buff GAIN grants `stacksPerGain` stacks (the calibration "Activations" count — C1–C4: 1, C5–C6: 2); total clamped to `maxStacks`; one stack consumed per Support Action. */
  charging?: { perStackValue: number; maxStacks: number; stacksPerGain?: number };
}

export interface WeaponDef {
  id: string;
  name: string;
  rarity: "standard" | "elite";
  /** Known ATK at proficiency 1 and 60. Exact per-level curve is UNVERIFIED (research §3.9) — linear interpolation for other levels. */
  atkLvl1: number;
  atkLvl60: number;
  level: number;
  /**
   * Equipped calibration level (1–6). ABSENT = NO weapon Effect (the established pre-weapon
   * validations were all observed without the calibration Effect active — preserved as the
   * default). Setting a level activates ONLY that calibration's Effect values generically.
   */
  calibrationLevel?: number;
  /** Per-calibration Effect data (1–6). Absent = the weapon has no Effect/calibration mechanic. */
  calibrations?: Record<number, WeaponCalibrationDef>;
  /**
   * The Doll that OWNS this weapon (data-only, 2026) — used by owner-gated weapon mechanics
   * (the Imprint). Generic: the engine compares the damage dealer's character id against this
   * value; it never hardcodes a character. Absent = no owner gating.
   */
  ownerCharacterId?: string;
  /**
   * Imprint (weapon concept, 2026): an OWNER-ONLY damage bonus that is ADDITIVE in the existing
   * DMG% bucket — `bonus` against targets whose Race/Type includes `targetType`, plus
   * `noCoverBonus` when the target is not protected by Cover (both conditions can stack).
   */
  imprint?: { targetType: string; bonus: number; noCoverBonus: number };
  /**
   * Trait (weapon concept, VALIDATED in-game 2026): at the END of the holder's own action,
   * if the holder is at FULL HP, exactly ONE random buff is granted from `statusIds`
   * (uniform 1/N selection via the deterministic seeded RNG — no weights/priorities) for
   * `durationRounds` turns. Data-driven; the engine hook is generic, never character-specific.
   */
  trait?: { statusIds: string[]; durationRounds: number };
  subStats: { stat: "pctAtk" | "pctHp" | "pctDef"; value: number }[];
}

export interface StatusApplySpec {
  statusId: string;
  /** Human-readable provenance of who grants this effect (ability/passive/key/status + level), e.g. "Common Rail Lv.1". */
  source?: string;
  /** Applied duration in rounds — omit to use the status definition's own duration (permanent for durationRounds: null). */
  durationRounds?: number;
  stacks?: number;
  /** Where the status lands. Default "target". */
  target?: "self" | "target";
  /** Source of the application (for applier-ATK fixed damage / later source rules). Optional; captures id + ATK at cast time. */
  applier?: { id: string; atk: number };
}

/**
 * Complete behavior definition of an ability AT ONE LEVEL (this is the shape
 * previously called `SkillDef`, preserved field-for-field). A higher level is a
 * FULL variant — it may change math, add hits/effects, alter durations,
 * resources, cooldowns, Stability, targeting/AoE, triggers, or anything else.
 * No numeric modifier is implied: the variant IS the behavior at that level.
 */
export interface SkillDefVariant {
  id: string;
  name: string;
  type: "basic" | "active" | "ultimate" | "support";
  /**
   * DAMAGE CATEGORY (2026): "targeted" | "aoe" per the authoritative in-game skill class
   * (e.g. Guide to Victory = AoE). Target SELECTION (e.g. "first enemy within 8 tiles in
   * the selected direction") is a separate concept and is NOT modeled. Descriptive except
   * for VALIDATED DEF-ignore statuses (2026): Domain Penetration I ignores part of the
   * target's DEF only on `damageCategory === "aoe"` hits — the ONLY engine consumer.
   * Absent = not AoE. Only set when the repo has authoritative evidence for the category.
   */
  damageCategory?: "targeted" | "aoe";
  /**
   * VALIDATED CONDITIONAL CRIT (2026, Guide to Victory V2): if the TARGET already carries
   * this status at attack resolution, this attack's Critical Rate is +100% (guaranteed crit
   * for THIS attack only — never a permanent Crit Rate change). Absent = no such condition.
   * Data-driven and generic; only set when the repo has validated evidence.
   */
  guaranteedCritWhenHasStatus?: string;
  /** Optional level-specific player-facing tooltip (2026): the in-game description for THIS level.
 *  Absent → callers fall back to the ability's top-level `playerDescription` (Lv1/fallback text).
 *  Same contract as `playerDescription` — never internal documentation/evidence. */
  playerDescription?: string;
  /** Direction of a cardinal-ray ability (Guide to Victory, VALIDATED screenshot/tooltip 2026). Diagonal directions are NOT valid. */
  /**
   * GUIDE TO VICTORY targeting (VALIDATED 2026, screenshot + tooltip): select one cardinal
   * direction, trace up to `effectiveArea` tiles along it from the caster, and the FIRST
   * enemy encountered is the target (stop after the first enemy; no diagonal directions).
   * `range` (1) is the authoritative displayed Range; the ray length is `effectiveArea` (8).
   * Does NOT change damage/stability/weakness/crit — selection only. Absent = default
   * single-dummy targeting (no grid interaction).
   */
  targetingCardinalRay?: { direction: "up" | "down" | "left" | "right"; range: 1; effectiveArea: 8 };
  /**
   * DECLARATIVE RANGE (tiles, Manhattan distance) — NEW 2026, DATA-ONLY for the MVP:
   * the value is recorded per ability/level, but the MVP has NO engine range/positioning
   * consumer (no out-of-range check exists; targets are assumed in range). Qiongjiu's
   * Support Action declares `range: 8` — an explicit MVP MODELING DECISION/ASSUMPTION,
   * NOT an in-game-validated number. Do not add range-resolution logic in the MVP.
   */
  range?: number;
  element: Element | null;
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
  /**
   * NEW (2026) — statuses applied to the SUPPORT target immediately BEFORE Qiongjiu's/future
   * dolls' Support Action resolves (V4 Vulnerable I: applied on the existing Steady Plan support
   * trigger, before the support hit — so the target already carries them when the Support Action
   * resolves). Generic, data-driven; read from the RESOLVED ultimate variant. Independent of the
   * at-max-Confectance branch.
   */
  beforeSupportStatuses?: StatusApplySpec[];
  /** Generic ultimate hook: effects applied only when cast while Confectance is at cap (research §3.12). */
  onCastAtMaxConfectance?: {
    supportQuotaBonus?: number;
    extraStatuses?: StatusApplySpec[];
  };
  /**
   * NEW (2026) — V5 Damage Up II: statuses applied by the SUPPORT OWNER's resolved ultimate
   * BEFORE an eligible ally's damaging main action triggers the owner's Support Action (the
   * existing Steady Plan trigger; NO new trigger). `owner` lands on the support owner (Qiongjiu),
   * `triggeringAlly` lands on the ally whose action triggers the support — both BEFORE the ally's
   * action resolves so the triggering attack and the ensuing Support Action both benefit. 1-turn /
   * holder own-turn-end duration via the existing generic status system. Independent of Confectance.
   */
  beforeSupportTrigger?: { owner?: StatusApplySpec[]; triggeringAlly?: StatusApplySpec[] };
  /**
   * NEW (2026) — V1 skill-specific killing-blow statuses (Common Rail Lv2: +30% Support Boost
   * variant): applied to SELF immediately when THIS skill's hit delivers the killing blow
   * (target reduced from >0 to 0 HP on this hit). Generic and data-driven — never triggered by
   * "any enemy died" from another skill/unit.
   */
  onKillStatuses?: StatusApplySpec[];
  /** Authoritative higher-level text recorded but NOT executable yet (engine limitation) — the variant's fields above are the executable portion. */
  deferredNote?: string;
}

/** Deprecated alias of `SkillDefVariant` (pre-levels name); kept for imports, prefer SKillDefVariant. */
export type SkillDef = SkillDefVariant;

/**
 * One ability across its levels. Identity lives here (`id`/`name`/`type`);
 * `levels` maps an ability level to its COMPLETE `SkillDefVariant`.
 * Invariants: level 1 always exists in data except for abilities whose current
 * definition lives at a validated higher level (baseline rule, engine `resolveSkill`);
 * Basic Attack is level-1 only (engine clamps it to 1 regardless of Fortification level).
 */
export interface AbilityDef {
  id: string;
  name: string;
  type: SkillDefVariant["type"];
  levels: Record<number, SkillDefVariant>;
  /**
   * PLAYER-FACING tooltip text (2026): a clean, concise gameplay description of the ability.
   * Same contract as StatusDef.playerDescription — never internal documentation/evidence.
   */
  playerDescription?: string;
}

/**
 * One Fortification → one ability upgrade with an EXPLICIT resulting level.
 * "Fortification 3 increases Ability X from Lv1 to Lv2" = { v: 3, ability: "X", toLevel: 2 }.
 * Levels are never inferred by counting Fortifications — the explicit toLevel wins.
 */
export interface FortificationUpgrade {
  /** Fortification index, 1-based (e.g. 3). */
  v: number;
  ability: AbilitySlot;
  /** Resulting ability level after this Fortification (e.g. 2). */
  toLevel: number;
}

export type PassiveEffect =
  | { kind: "resource_gain"; resource: "confectance"; amount: number; on: "onDamageDealt" }
  | {
      kind: "conditional_damage_modifier";
      /** "dealt" = on the unit's own attacks (attacker); "taken" = on incoming damage (boss/target passives, U5). */
      scope: "dealt" | "taken";
      mode: "additive" | "multiplicative";
      value: number;
      /** Condition evaluated against the receiving target unit. "always" = unconditional (e.g. Steady Plan Lv2 Support Action +10%). */
      when: "target.noCover" | "target.stabilityAboveZero" | "always";
      /** NEW (2026) — default "all": "support" restricts a dealt bonus to Support Actions only (generic, reusable by any character). Ignored on taken side. */
      actions?: "all" | "support";
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
       * NEW (2026) — "after Support Action" status application (Steady Plan Lv2/Lv3: Overburn 2r).
       * Apply the status to the SUPPORT target whenever a Support Action is performed
       * (generic — no extra damage-on-the-support-hit requirement; the support fires only via
       * the generic qualifying-damage trigger flow).
       */
      kind: "after_support_status";
      statusId: string;
      durationRounds?: number;
      stacks?: number;
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
       * exploits `weaknessTag` (an authoritative ammo category) AND its element
       * is in `requiresElements` (AWU: phase-less attacks only — `[null]`;
       * Phase/elemental exploits do not advance stacks unless later validated
       * otherwise). The first exploit applies `firstGain` stacks, every
       * subsequent exploit adds `gainPerEvent`, capped at `maxStacks`.
       * Data-driven — the 2/1/5 progression lives here, not in the damage
       * formula. `statusId` must be a stackable target status.
       */
      kind: "grant_stacks_on_weakness_exploit";
      weaknessTag: AmmoType;
      statusId: string;
      firstGain: number;
      gainPerEvent: number;
      maxStacks: number;
      requiresElements?: (Element | null)[];
    };

/**
 * STRUCTURED provenance of one damage-modifier source contributing to a hit (2026, additive).
 * Produced in `dealDamageHit` alongside the display `effectSources` labels, index-aligned and
 * deduplicated by label. Carries stable ids so a consumer (UI) can resolve the real source
 * definition without parsing the display label. `label` is the EXACT existing display label.
 */
export type EffectSourceRef =
  | { kind: "status"; statusId: string; label: string }
  | {
      kind: "passive";
      characterId: string;
      passiveId: string;
      level: number;
      v?: number;
      label: string;
    }
  | {
      kind: "ability";
      characterId: string;
      abilityId: string;
      slot: AbilitySlot;
      level: number;
      v?: number;
      label: string;
    }
  | {
      kind: "weapon";
      weaponId: string;
      /** Equipped calibration level of the weapon (1–6) whose Effect contributed. */
      calibration: number;
      label: string;
    }
  | { kind: "target"; label: string };

export interface PassiveDef {
  id: string;
  name: string;
  effects: PassiveEffect[];
  /**
   * Level-indexed passive effect lists (Fortification can upgrade the passive,
   * e.g. Steady Plan V3→Lv2, V6→Lv3). When present, the resolved level's list
   * wins; `effects` remains the engine baseline (level 1 or lowest available).
   */
  levels?: Record<number, PassiveEffect[]>;
  /**
   * PLAYER-FACING tooltip text (2026): a clean, concise gameplay description of the passive.
   * Same contract as StatusDef.playerDescription — never internal documentation/evidence.
   */
  playerDescription?: string;
  /**
   * Level-specific player-facing tooltips (2026): exact in-game passive text per level (e.g.
   * Steady Plan Lv2/Lv3). Absent level → callers fall back to `playerDescription` (Lv1/fallback).
   */
  levelDescriptions?: Record<number, string>;
  /** Per-level authoritative text that is NOT executable by the engine (recorded faithfully, deferred). */
  deferredNotes?: Record<number, string>;
}

export interface KeyDef {
  id: string;
  name: string;
  verified: boolean;
  /** Battle-start Confectance grants (FK1 Concentration). Keys without one use []. */
  battleStartEffects: { resource: "confectance"; amount: number }[];
  /**
   * Fixed Key / key behavior (VALIDATED 2026, FK2 Efficient Planning): number of dispellable
   * target BUFFS cleansed immediately BEFORE each of the holder's Support Actions (1 = FK2).
   * 0/absent = no support-cleansing. Selection priority when several buffs qualify is the
   * existing status-list order (unspecified by evidence — no priority rule is invented).
   */
  supportActionCleanse?: number;
  /**
   * Fixed Key 3: Targeted Training (VALIDATED in-game 2026) — "While in Support Mode, applies
   * Defense Down II to the target for 1 turn BEFORE the allied unit's attack." Data-driven:
   * when the key's holder is ready to support (Support Mode) and an ALLIED unit commands a hit
   * against the support target, this status is applied FIRST (before the allied damage
   * resolves). Reuses the existing generic DEF stat-modifier status; no other effect.
   */
  alliedAttackDefDown?: { statusId: string; durationRounds: number };
  /**
   * Fixed Key 4: Point of Vulnerability (VALIDATED in-game 2026) — equipping it modifies the
   * holder's Guide to Victory: the cardinal line CONTINUES through enemies (all enemies within
   * the 8-tile direction take damage); the FIRST enemy receives 100% of normal Guide damage,
   * EVERY subsequent enemy receives exactly 30% less (`secondary = ceil(normal × 0.70)`).
   */
  pointOfVulnerabilityLine?: boolean;
  /**
   * Fixed Key 5: Necessary Adjustments (VALIDATED in-game 2026) — "When a phase weakness is
   * exploited using Common Rail, gains Blazing Assault II for 2 turns." Data-driven self-statuses
   * applied BEFORE the triggering skill's damage resolves (the hit already uses the +15% ATK —
   * validated 2000 → 2300 → 1435). Only PHASE weaknesses trigger the gain; ammo-only exploits
   * never do; `ability` restricts the trigger to the named skill (Common Rail = active1).
   */
  phaseWeaknessExploitStatuses?: { ability: AbilitySlot; statuses: StatusApplySpec[] };
  /**
   * Fixed Key 6: Steadiness (VALIDATED in-game 2026) — "While under the effect of Support Boost,
   * gain immunity to displacement effects applied by enemy units." Data-driven CONDITION: when
   * the holder has the key equipped AND any status whose id is listed here is active (Support
   * Boost I, the +30% Support Boost I variant, and Support Boost II all satisfy it), the holder
   * is immune to enemy-applied displacement. Read-only — the gate never consumes, alters,
   * extends, or refreshes Support Boost (no effect on SB I/II damage or activation). The MVP has
   * no enemy displacement applier; this gate is where one would be checked (boundary).
   */
  displacementImmunityWhenStatuses?: string[];
  /**
   * Expansion Key — Ruined Gem (VALIDATED in-game 2026): while equipped, the holder's SUPPORT
   * ACTION resolves with this EFFECTIVE element instead of the base skill's element. The base
   * support-skill element (qiongjiu_support.element null = Physical/phase-less) is left unchanged;
   * the override applies only on the support resolution path, never to other abilities.
   */
  supportElementOverride?: Element;
  /**
   * Expansion Key — Ruined Gem (VALIDATED in-game 2026): on SUPPORT ACTIONS only, when the
   * target currently has `statusId` (Overburn = the Burn debuff), add `value` to the existing
   * additive dealt-DMG bucket (same bucket as No-Cover/Damage Up II/Out-of-Turn; no separate
   * multiplier). Never applies to own-turn attacks; no duration/stacking/activation beyond this.
   */
  supportTargetStatusDealtBonus?: { statusId: string; value: number };
  /** In-game tooltip text, recorded verbatim from the panel. */
  description?: string;
  /** Set when the key's behavior is recorded but NOT implemented by the engine (see reason). */
  deferredNote?: string;
}

/**
 * Affinity Key (bond) — pure stat bonuses that apply when the character equips
 * their OWN Affinity Key at a given Affinity Level. Recorded as data; engine
 * consumption is deferred (bonuses affect the panel, and Crit Damage is not a
 * `stat_modifier` stat). Only the levels present in `levels` are defined —
 * intermediates are NOT assumed or interpolated.
 */
export interface AffinityKeyDef {
  id: string;
  name: string;
  totalLevels: number;
  /** Fractional bonuses per Affinity Level (e.g. 0.045 = +4.5%). */
  levels: Record<number, { critDmg: number; atk: number; hp: number }>;
  /**
   * Generic bonus ANY doll receives from equipping SOMEONE ELSE's Affinity Key (VALIDATED
   * 2026): +3% flat — in GFL2 the universal affinity-key bonus is +3% ATK and +3% HP; the
   * owner's affinity LEVEL never upgrades a foreign key's bonus. Data-driven and overrideable.
   */
  genericBonus?: { atk?: number; hp?: number; critDmg?: number };
  verified: boolean;
  deferredNote?: string;
}
/**
 * STANDALONE character Affinity-LEVEL stat bonuses (2026, confirmed) — completely independent of
 * the equipped Affinity Key: Lv5 = none; Lv9 = ATK/HP/DEF +5%. Same exact-per-level representation
 * as Affinity Key levels (absent levels grant nothing, no interpolation; the simulator represents
 * the in-game Lv6 unlock state as Lv9). Folded through the existing Final Stat percentage paths.
 */
export interface AffinityLevelStats {
  atkPct?: number;
  hpPct?: number;
  defPct?: number;
}


/**
 * Common Key STAT BLOCK — kept EXPLICITLY SEPARATE from the optional secondary effect.
 * Each field is folded through the EXISTING generic stat infrastructure (game structure —
 * SOURCE FACT: Gold/Epic Keys grant 3 kinds of stats, Rare Keys grant 2; a key declares
 * exactly the stat fields it grants). Only the stat kinds evidenced by Strategic Negotiation
 * are represented here — extend this block (never with character-specific logic) when new
 * Common Key evidence arrives.
 */
export interface CommonKeyStats {
  atkPct?: number;
  critRate?: number;
  critDmg?: number;
  outOfTurnDmg?: number;
}

/** Stat kinds a Common Key may grant — derived from the canonical `CommonKeyStats` block. */
export type CommonKeyStat = keyof CommonKeyStats;

/**
 * Common Key edition taxonomy (AUTHORITATIVE game structure — SOURCE FACTS, 2026):
 * Gold Key (3 stats + secondary effect; 5★ Character Edition) · Epic Key — 4★ Character
 * Edition (3 stats + secondary effect) · Epic Key — Generic Edition (3 stats, no secondary) ·
 * Rare Key (2 stats, no secondary). Absent = unknown (never invented for a real key).
 */
export type CommonKeyEdition = "gold" | "epic4" | "epicGeneric" | "rare";

/**
 * OPTIONAL Common Key secondary effect — recorded DATA ONLY (2026): references the existing
 * generic primitives (status application via `StatusApplySpec` or a `PassiveEffect` shape),
 * but has NO engine consumer and NO trigger timing is invented. It must never be treated as
 * executable semantics today (same contract as the project's `deferredNote`).
 */
export interface CommonKeySecondaryEffect {
  /** Which existing primitive the secondary effect is built on (status application or passive effect). */
  type: "status" | "passive";
  /** Statuses the effect would apply — trigger timing NOT defined (recorded only, not executed). */
  statuses?: StatusApplySpec[];
  /** Passive-effect shape the secondary would use — timing NOT defined (recorded only, not executed). */
  passive?: PassiveEffect;
  /** Verbatim/summary of the secondary effect. */
  description?: string;
}

/**
 * A Common Key is a REUSABLE definition (game-wide system) — never embedded solely inside a
 * character. Definitions live in the Common Key registry (`src/data/common-keys.ts` /
 * `Registry.getCommonKey`) and may be character-specific (Character Edition) or generic.
 */
export interface CommonKeyDef {
  id: string;
  name: string;
  /** Structural edition taxonomy (Gold / Epic 4★ / Epic Generic / Rare). Absent = unknown (never invented). */
  edition?: CommonKeyEdition;
  /** Descriptive in-game type line (e.g. "Universal Key: Skill") — display metadata only, separate from the edition taxonomy; no behavior. */
  type?: string;
  /** Character association for Character Edition keys (data-only, e.g. the owning doll id); absent = generic key usable by any doll. Never consumed by combat logic. */
  characterScope?: string;
  /**
   * STAT BLOCK — independent of `secondaryEffect` (the two are never merged). A key grants
   * exactly the stat fields present (Gold/Epic: 3; Rare: 2). Folds via the existing generic
   * stat path.
   */
  stats: CommonKeyStats;
  /** Optional secondary effect — independent of `stats`; recorded data only (see CommonKeySecondaryEffect). No invented trigger timing or behavior. */
  secondaryEffect?: CommonKeySecondaryEffect;
  verified: boolean;
  description?: string;
}

export interface CharacterDef {
  id: string;
  name: string;
  /** Doll's own phase element (null = phase-less, e.g. physical-ammo dolls). */
  phase: Element | null;
  base: { atk: number; hp: number; def: number; stability: number; critRate: number; critDmg: number };
  // NOTE (2026): characters no longer carry a permanent equipped weapon — weapons are REUSABLE
  // definitions equipped per scenario via `ScenarioTeamMember.weaponId` (1 Weapon Slot) and
  // resolved through `Registry.getWeapon` (src/data/weapons.ts). Property removed from CharacterDef.
  skills: { basic: AbilityDef; active1: AbilityDef; active2: AbilityDef; ultimate: AbilityDef; support?: AbilityDef };
  passive: PassiveDef;
  fixedKeys: KeyDef[];
  /** Fortification → ability-level upgrades (V index → ONE ability, explicit resulting level
   *  — e.g. QJ's populated V1–V6 map). Absent = the character has no Fortification map. */
  fortificationMap?: FortificationUpgrade[];
  /** Expansion Key (1 per doll) — recorded data; engine behavior deferred. */
  expansionKey?: KeyDef;
  /**
   * STANDALONE character Affinity-LEVEL stat bonuses (2026, confirmed) — independent of the
   * equipped Affinity Key; exact-level map, absent levels grant nothing.
   */
  affinityLevelStats?: Record<number, AffinityLevelStats>;
  /** Affinity Key (bond) — recorded data; engine consumption deferred. */
  affinityKey?: AffinityKeyDef;
  // Common Keys are REUSABLE definitions — they live in the Common Key registry
  // (src/data/common-keys.ts / Registry.getCommonKey), NOT embedded in CharacterDef (2026).
  /**
   * GRID (2026): Mobility stat used by the core grid system (movement budget per turn).
   * Optional — absent means the unit cannot move; existing characters are unaffected.
   */
  mobility?: number;
}

export type StatusEffect =
  | { kind: "stat_modifier"; stat: "atk" | "def" | "hp" | "critRate"; mode: "flat" | "pct"; value: number }
  | {
      kind: "damage_modifier";
      scope: "dealt" | "taken";
      mode: "additive" | "multiplicative";
      value: number;
      /** NEW (2026) — default "all": "support" restricts a dealt bonus to Support Actions only (generic, reusable by any character). Ignored on taken side. */
      actions?: "all" | "support";
      /** NEW (2026) — optional target condition for a dealt bonus: "exposed" = only while the target is Exposed/Broken (Support Boost I's +10%). */
      whenTarget?: "exposed";
      /** NEW (2026) — optional damage-category gate for a DEALT bonus: "targeted" = only non-AoE hits (`targeted` = not `damageCategory === "aoe"`; Targeted Attack Boost I, +10%); "aoe" = only AoE hits. Absent = all (existing behavior). */
      whenCategory?: "aoe" | "targeted";
      /** NEW (2026) — optional phase gate for a DEALT bonus, using the EXISTING taxonomy (Phase attack = has an element, `element !== null`; phase-less = `element === null`): "phase" = only elemental hits (Phase Boost I, +10%); "phase_less" = only phase-less hits. Absent = all (existing behavior). No new element/category is invented. */
      whenPhase?: "phase" | "phase_less";
    }
  | { kind: "damage_reduction"; value: number; whenIncomingCategory?: "aoe" | "targeted" }
  | {
      /**
       * Defense ignore (Domain Penetration I, VALIDATED in-game tooltip 2026): the HOLDER's
       * damage mitigates against the target's DEF × (1 − value) — 20% for the Trait buff —
       * but ONLY on attacks whose `damageCategory === "aoe"` matches `aoe`. Applied inside
       * the existing defense term of the normal chain ONLY (never fixed damage / stability /
       * weakness / crit / reductions). No other conditions are invented.
       */
      kind: "def_ignore";
      value: number;
      aoe: boolean;
    }
  | {
      /**
       * HP restoration (Continuous Healing I, VALIDATED in-game tooltip 2026): at the
       * HOLDER's own action end — the standard `ownActionEnd` onTick phase, same timing
       * as status-sourced fixed damage — restores `percentOfMaxHp` of the holder's MAXIMUM
       * HP, capped so HP never exceeds max HP. `Math.ceil` rounding for non-integer amounts
       * is an unvalidated MVP model choice (consistent with the damage ceil convention; the
       * tooltip specifies no rounding). No other mechanics are invented (no overheal, no
       * heal on grant, no target healing, no Continuous Healing II behavior).
       */
      kind: "heal";
      percentOfMaxHp: number;
    }
  | {
      /**
       * Stability damage bonus (Stability Offensive I, VALIDATED in-game tooltip 2026):
       * adds a FLAT value to the HOLDER's attack TOTAL stability damage dealt (e.g. an
       * attack dealing 2 Stability becomes 3 with +1). Multiplies by stacks like the other
       * per-status bonuses. Affects Stability damage ONLY — never HP damage / DMG% / DEF /
       * weakness / crit / phase / reductions. No other mechanics are invented.
       */
      kind: "stability_damage_bonus";
      value: number;
    }
  | {
      /**
       * Status-sourced fixed damage (Overburn, validated 2026): absolute damage =
       * ceil(percentOfAtk × the EFFECT APPLIER's ATK captured at application time).
       * `applies`: "onApply" fires immediately when the status is newly applied;
       * "onTick" fires at each matching ownActionEnd tick (before expiry).
       * Data-driven — no per-status branch in the engine.
       */
      kind: "fixed_damage";
      percentOfAtk: number;
      applies: ("onApply" | "onTick")[];
    }
  | {
      /**
       * Stack-tier damage modifier (Ammo Weakness Upgrade, validated 2026):
       * value is a per-stack TIER lookup (non-linear), not `value × stacks`.
       * `tiers[stacks]` is used; stacks above the highest tier stay at the top
       * tier; stacks below the lowest tier contribute 0. `when.element` gates
       * the effect to specific attack elements (AWU: phase-less attacks only
       * — `[null]`; Phase damage bypasses it naturally; there is no AWU
       * special-case branch).
       */
      kind: "stack_tier_modifier";
      scope: "dealt" | "taken";
      mode: "additive";
      tiers: Record<number, number>;
      when?: { element: (Element | null)[] };
    }
  | {
      /**
       * Fixed DMG modifier chain (validated 2026), naming per the authoritative
       * source: "Fixed DMG Buffs" (applier-side, e.g. the validated +10% Fixed
       * DMG Key; source examples: Common Key - Source of Pride, Ultimate
       * Brilliance — not individually tested) and "Final DMG Reduction"
       * (holder/target-side, summed). Applies ONLY to fixed damage on the
       * UNROUNDED value before the final ceil:
       *   fixed = ceil(scaling × (1 + Σ Fixed DMG Buffs) × (1 − Σ Final DMG Reduction))
       * Ordinary Damage Increase/Reduction are separate buckets and never touch
       * fixed damage (validated: boss −80% ordinary DR and No-Cover +20% are
       * bypassed; Final DMG Reduction 60% and the +10% Fixed DMG Key apply).
       * NOTE: the earlier project label "Final DMG Increase" was reclassified
       * (2026) to the source term "Fixed DMG Buff"/"Fixed DMG Buffs" — there is
       * no separate "Final DMG Increase" mechanic.
       */
      kind: "fixed_dmg_modifier";
      mode: "buff" | "reduction";
      value: number;
    };

export interface StatusDef {
  id: string;
  name: string;
  category: "buff" | "debuff" | "state" | "upgrade";
  stackable: boolean;
  /**
   * Maximum stacks. ABSENT = unbounded (no observed cap — Support Boost I, VALIDATED 2026:
   * 4 stacks reached with none observed). Never invent a cap: set this only when validated.
   */
  maxStacks?: number;
  /** null = permanent until ticked/removed. */
  durationRounds: number | null;
  tickAt: "ownActionEnd" | "roundEnd";
  purgeable: boolean;
  effects: StatusEffect[];
  /**
   * PLAYER-FACING tooltip text (2026): a clean, concise gameplay description of what the
   * buff/status does for the player. This is the ONLY field the UI may render as tooltip
   * prose — `note` is internal documentation/evidence and is never exposed to the UI.
   * Do NOT copy validation history/sources/dates into this field.
   */
  playerDescription?: string;
  /**
   * NEW (2026) — consumption-of-use status (Support Boost I/II): the status is persistent
   * (no duration) and each qualifying damage event the status contributes to consumes ONE
   * STACK (stacks = activations); removed at 0. Absent = no such consumption (all others).
   */
  consumeOneOnUse?: boolean;
  /**
   * NEW (2026) — default true: additive dealt modifiers scale by `value × stacks`. Set false
   * for statuses whose stack count does NOT multiply the bonus (Support Boost I: stacks are
   * remaining activations only — VALIDATED 2026 that 1 and 2 stacks deal identical damage).
   * Only affects `damage_modifier {scope:"dealt", mode:"additive"}`.
   */
  scaleWithStacks?: boolean;
  /**
   * NEW (2026) — cross-buff relations (VALIDATED 2026 for Support Boost I/II):
   * `replaces` — applying this status REMOVES the listed statuses (SB II replaces SB I).
   * `blockedBy` — this status cannot be applied while ANY listed status is active (SB I is
   * blocked by SB II). Generic + data-driven; no other status uses them yet.
   */
  replaces?: string[];
  blockedBy?: string[];
  verified: boolean;
  note?: string;
  /** Authoritative text recorded but NOT executable by the engine yet (scope/condition/timing limitation) — presence means: do not treat the numeric effects as complete semantics. */
  deferredNote?: string;
}

/**
 * Ammo weakness categories (authoritative game terminology, 2026): Heavy Ammo, Medium Ammo,
 * Light Ammo, Melee, Shotgun Ammo. `melee` is a valid TARGET weakness category only — an attack
 * without an ammo-based category simply omits `ammoType` (which never matches).
 * `medium_ammo` represents Qiongjiu's Medium Ammo attacks ("Ammo Type: Medium" in-game).
 */
export type AmmoType = "heavy_ammo" | "medium_ammo" | "light_ammo" | "shotgun_ammo" | "melee";

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
  /**
   * Target Race/Type classification (2026) — a GENERIC target property (e.g. ["elid"]), not a
   * damage/element/weakness/ammo attribute and not an `isElid` flag. Used by owner-gated weapon
   * Imprints (`WeaponDef.imprint.targetType`). Absent = no race/type classification.
   */
  raceTypes?: string[];
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
  /**
   * Character Fortification level (V) for this run — default 0 (all abilities at
   * Level 1 or their baseline). Mappings are per-character `fortificationMap`
   * data; QJ's map is POPULATED (V1–V6, validated 2026).
   */
  fortificationLevel?: number;
}

export interface ScenarioTeamMember {
  characterId: string;
  rotation: ActionSlot[];
  equippedFixedKeys?: string[];
  /** Equipped Affinity Key (bond) — its OWNER decides which bonus applies (Warm as Jade, VALIDATED 2026). */
  affinityKeyId?: string;
  /** The doll's Affinity Level with the equipped key (exact levels only; 5 and 9 are defined, no interpolation). */
  affinityLevel?: number;
  /**
   * Equipped Common Key ids — up to 3 (3 Common Key Slots per character, game structure
   * SOURCE FACT). Fewer than 3 (0–2) is valid; the engine enforces the 3-key maximum.
   */
  commonKeyIds?: string[];
  /**
   * Equipped weapon id (1 Weapon Slot per character, 2026) — resolved via `Registry.getWeapon`
   * (reusable definitions in src/data/weapons.ts). ABSENT = NO weapon (no weapon ATK/sub-stats,
   * no weapon Effect — nothing is inherited from the character). Unknown ids are rejected with a
   * clear error.
   */
  weaponId?: string;
  /**
   * Calibration level of the EQUIPPED weapon (C1–C6 = 1–6, 2026) — part of the equipped weapon
   * configuration, NOT the character. Resolved against the weapon's `calibrations` data
   * (calibration changes ONLY the Effect; max-level base stats are untouched). ABSENT = fall
   * back to the weapon definition's own `calibrationLevel` (also absent = no Effect — the
   * established pre-calibration behavior). Invalid values (non-integer, <1, >6) and a
   * calibration without a `weaponId` are rejected with a clear error.
   */
  calibrationLevel?: number;
  /** Equipped Expansion Key id (e.g. Qiongjiu's Ruined Gem). Absent = no expansion-key behavior. */
  expansionKeyId?: string;
  /**
   * DEBUG / CONTROLLED-TESTING ONLY (2026): per-member replacement of the character's OWN
   * `CharacterDef.base` value for each supplied field — applied BEFORE weapon/equipment/
   * stat-modifier calculations. Absent fields keep the character's normal base value.
   * `computePanel()` remains the single calculation path (no second stat system, no duplicate
   * formula). Values are validated: finite and >= 0, or the scenario is rejected (never silently
   * clamped). Never mutates the registry `CharacterDef` — the override is per-scenario/per-member.
   */
  baseStatOverrides?: {
    atk?: number;
    hp?: number;
    def?: number;
    stability?: number;
    critRate?: number;
    critDmg?: number;
  };
}

export interface Scenario {
  version: number;
  seed: number;
  /** MVP simulation duration cap: integers 1–7 only (8+ rejected with a validation error, never clamped). */
  turns: number;
  team: ScenarioTeamMember[];
  dummy: DummyConfig;
  /** GRID (2026): optional 15×15 battlefield configuration. Absent ⇒ simulation runs without positions (unchanged). */
  grid?: GridConfig;
  configOverrides?: ConfigOverrides;
}