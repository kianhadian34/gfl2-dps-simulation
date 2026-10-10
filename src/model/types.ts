// Data model — mirrors docs/schemas.md. Fields/values marked `verified: false`
// are UNVERIFIED in research (docs/research.md §4) and are surfaced in
// SimulationResult.warnings instead of being silently assumed.

import type { AreaShape, GridConfig } from "./grid.js";

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
  /**
   * Where the status lands.
   * - `self`   — the ACTING unit.
   * - `target` — the resolving action's target (the enemy/dummy). DEFAULT.
   * - `all_allies` — EVERY member of the allied team (`state.units`), INCLUDING the acting unit
   *   (2026: Vector's Ultimate "Applies Accelerant to all allied units"). Same meaning as the
   *   Pattern Remolder `unity_dealt` target of the same name. The enemy/dummy is never included.
   * - `ally_area` — allied units whose PLACEMENT lies within an area around the acting unit
   *   (`allyArea`, below). Distinct from `all_allies`, which is the whole team regardless of
   *   position (2026: Overheat Combustion's "this unit and all allied units within a 1-tile area").
   *   REQUIRES a battle grid; see `allyArea`.
   */
  target?: "self" | "target" | "all_allies" | "ally_area";
  /**
   * REQUIRED when `target: "ally_area"` — the area AROUND THE ACTING UNIT whose placed allies
   * receive the status, inclusive of the acting unit's own tile. Modeled as a separate union-free
   * paired field for readability of the data; validated at apply time (a missing `allyArea` with
   * `target: "ally_area"` is an honest error, never a silent no-op).
   *
   * `shape`: `"manhattan"` (a diamond — "within a 1-tile area") or `"square"` (a Chebyshev block —
   * "area is increased to 3×3"). BOTH are modeled deliberately: the source text may use two
   * different metrics, and the per-effect choice is DATA, **Not Tested** (`docs/research.md`
   * §3.32). Neither is a claim about the real game.
   *
   * The recipient set counts PLACED units only. With NO battle grid the engine cannot evaluate an
   * area at all and THROWS (never a silent approximation) — consistent with the repo's other
   * honest-error cases.
   */
  allyArea?: { shape: AreaShape; radius: number };
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
  /**
   * Attack PHASE attribute. `null` = a phase-less PHYSICAL attack (a real attack that carries no
   * element); ABSENT = the ability has NO attack phase attribute at all — e.g. a buff-only Ultimate
   * with no damage component (`multiplier`/`fixedDamage` unset). An absent value MUST NOT be shown
   * as if it were a physical attack; damaging abilities declare it.
   */
  element?: Element | null;
  /** Ammo/weapon type of the attack (matches `DummyConfig.weaknessTags` — Ammo Weakness dimension, 2026). Absent = no ammo attribute. */
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
      /**
       * `onAllySingleTargetHit` — ANOTHER unit deals targeted damage to an enemy (the established
       * Qiongjiu trigger, VALIDATED in-game 2026). The acting unit itself is EXCLUDED.
       */
      trigger: "onAllySingleTargetHit";
    }
  | {
      kind: "support_attack";
      skillId: string;
      perRoundMax: number;
      chainable: boolean;
      /**
       * `onEnemyStatusApplied` — an ENEMY gains the status named by `statusId` (2026, Vector's FK6
       * "when an enemy unit within range is inflicted with Overburn"). A REFRESH of an
       * already-held status is not a new infliction and does NOT fire.
       *
       * Unlike `onAllySingleTargetHit`, this trigger names no applier, so it ALSO fires when the
       * HOLDER itself inflicted the status (confirmed with the project owner 2026-10-10): the
       * "another unit acted" rule belongs to the ally-hit trigger only.
       *
       * `statusId` is REQUIRED here — modeled as a separate union member so a missing status is a
       * compile error rather than a silently inert trigger.
       */
      trigger: "onEnemyStatusApplied";
      statusId: string;
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
    }
  | {
      /**
       * TURN-START CONFECTANCE DRAIN (2026, Vector's Perception Block Lv.1/Lv.3 — the passive's
       * clause 4 + clause 5). At the holder's OWN turn start, if the normal Confectance gauge is
       * at maximum, the holder CONSUMES the whole gauge and gains a round-scoped ATK% bonus.
       *
       * Extra slots (clause 5, Lv.3 only): `extraSlots` grants a SECOND Confectance pool SEPARATE
       * from `confectanceMax` — Confectance gains beyond the normal maximum flow into it (see
       * `gainConfectance`). Each FILLED extra slot adds `perExtraSlotAtkPct` on top of `atkPct`,
       * up to `extraSlots`.
       *
       * Levels come from the passive's own `levels` map (Lv.1 declares only `atkPct`; Lv.3 adds the
       * extra slots) — this kind carries NO level gate of its own.
       *
       * Evidence (Vector, 2026): clause 4 = +10% at max (Lv.1+); clause 5 = +10% per extra slot up
       * to +20% (Lv.3/V5), ADDITIVE on clause 4 ⇒ totals +10% / +20% / +30% for 0 / 1 / 2 filled
       * extra slots (user-provided in-game evidence, 2026-10-09). `confectanceMax` (U9, 6) is
       * UNCHANGED — the extras are a separate pool, never an overflow of the normal cap.
       */
      kind: "turn_start_confectance_drain";
      /** Round-scoped ATK% granted (fraction; 0.10 = +10%) when the gauge is at max at the holder's turn start. */
      atkPct: number;
      /** Number of EXTRA Confectance slots this grants (a pool separate from `confectanceMax`). Absent/0 = none. */
      extraSlots?: number;
      /** Round-scoped ATK% granted PER FILLED extra slot (additive on `atkPct`, capped at `extraSlots`). */
      perExtraSlotAtkPct?: number;
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
 * STANDALONE character Affinity-LEVEL FLAT stats (2026, confirmed) — a SEPARATE affinity flat
 * source, distinct from the Affinity percentage map (`AffinityLevelStats`) and from the equipped
 * Affinity Key. Keyed by Affinity Level, each present entry holds that level's PER-LEVEL
 * INCREASE for flat ATK/HP/DEF; the character's contribution at level N is the SUM of entries
 * 1..N ("apply the entries through that level" — cumulative). Absent levels add nothing (no
 * interpolation). The totals enter the SAME panel flat bucket as Dispatch / Remolder flats /
 * Neural Helix via the ONE panel path `finalStat(base + flat, pct)`.
 */
export interface AffinityFlatStats {
  atk?: number;
  hp?: number;
  def?: number;
}


/**
 * Common Key STAT BLOCK — kept EXPLICITLY SEPARATE from the optional secondary effect.
 * Each field is folded through the EXISTING generic stat infrastructure (game structure —
 * SOURCE FACT: Gold/Epic Keys grant 3 kinds of stats, Rare Keys grant 2; a key declares
 * exactly the stat fields it grants). `outOfTurnDmg` appears only in a key's SECONDARY EFFECT
 * (Strategic Negotiation's +7% "Effect"), NOT among the player-selectable stat kinds — see
 * `COMMON_KEY_SELECTABLE_STAT_KINDS`. Extend this block (never with character-specific logic)
 * when new Common Key evidence arrives.
 */
export interface CommonKeyStats {
  atkPct?: number;
  critRate?: number;
  critDmg?: number;
  hpPct?: number;
  defPct?: number;
  outOfTurnDmg?: number;
}

/** Stat kinds a Common Key may grant — derived from the canonical `CommonKeyStats` block. */
export type CommonKeyStat = keyof CommonKeyStats;

/**
 * A Common Key has up to 3 STAT SLOTS, IN ORDER (2026 CORRECTED model — SOURCE FACT):
 *  - slot #0 is the key's **FIXED** stat — `kind` is PRESENT (hardcoded on the key);
 *  - slots #1+ are **PLAYER-CHOSEN** — `kind` is ABSENT; the player selects the stat KIND at
 *    equip time, and this slot's `value` (fixed by the key, e.g. every stat is +5%) applies to
 *    whatever kind is chosen. The pool is the supported stat kinds (`CommonKeyStat`).
 * Absent `kind` therefore means "choosable", NOT "no stat".
 */
export interface CommonKeyStatSlot {
  /** The stat kind — PRESENT for the fixed slot (#0); ABSENT for a player-chosen slot (#1+). */
  kind?: CommonKeyStat;
  /** The value this slot grants (fixed by the key), applied to whatever kind occupies the slot. */
  value: number;
}

/**
 * Common Key edition taxonomy (AUTHORITATIVE game structure — SOURCE FACTS, 2026):
 * Gold Key (3 stats + secondary effect; 5★ Character Edition) · Epic Key — 4★ Character
 * Edition (3 stats + secondary effect) · Epic Key — Generic Edition (3 stats, no secondary) ·
 * Rare Key (2 stats, no secondary). Absent = unknown (never invented for a real key).
 */
export type CommonKeyEdition = "gold" | "epic4" | "epicGeneric" | "rare";

/**
 * OPTIONAL Common Key secondary effect (2026). When it carries a `stats` payload it is
 * EXECUTED (folded into the panel like a key stat — this is how Strategic Negotiation's +7% out-of-turn is
 * modeled). `status` / `passive` payloads remain RECORDED DATA ONLY — no trigger timing or
 * behavior is invented for them, and they must not be treated as executable today.
 */
export interface CommonKeySecondaryEffect {
  /** Which primitive the secondary effect is built on. "stat" = an executed panel-stat addition. */
  type: "status" | "passive" | "stat";
  /** Statuses the effect would apply — trigger timing NOT defined (recorded only, not executed). */
  statuses?: StatusApplySpec[];
  /** Passive-effect shape the secondary would use — timing NOT defined (recorded only, not executed). */
  passive?: PassiveEffect;
  /** Panel-stat additions the secondary effect grants — EXECUTED (folded into the panel). */
  stats?: CommonKeyStats;
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
   * ORDERED STAT SLOTS (2026 CORRECTED model). The FIRST slot is the key's FIXED (hardcoded)
   * stat — `kind` present. The remaining slots are PLAYER-SELECTABLE: `kind` is absent until the
   * player chooses one (from `CommonKeyStat`), and the slot's `value` (fixed by the key) applies
   * to whatever kind is chosen. Folds via the existing generic stat path.
   */
  stats: CommonKeyStatSlot[];
  /**
   * How many LEADING stat slots are fixed (hardcoded). Default 1 (the game rule: only the first
   * stat is hardcoded). Slots at index ≥ this are player-selectable.
   */
  fixedStatCount?: number;
  /** Optional secondary effect — independent of `stats`; recorded data only (see CommonKeySecondaryEffect). No invented trigger timing or behavior. */
  secondaryEffect?: CommonKeySecondaryEffect;
  verified: boolean;
  description?: string;
}

export type DollClass = "bulwark" | "vanguard" | "support" | "sentinel";

export interface CharacterDef {
  id: string;
  name: string;
  /**
   * DOLL CLASS (2026, dispatch_stat_buffs): the permanent global Dispatch stat system grants
   * EVERY doll a flat ATK/HP/DEF bonus by class — always present in real gameplay. Real
   * characters MUST declare their authoritative class (e.g. Qiongjiu "sentinel"); controlled
   * test fixtures still declare a class (mandatory) but opt out of dispatch per-membership via
   * `ScenarioTeamMember.applyDispatchStats: false`. NEVER set `undefined`.
   */
  class: DollClass;
  /**
   * DOLL WEAPON TYPE (2026): the doll's own gun class (Qiongjiu = "ar"). Data-only; used by
   * weapon-type-gated effects (Apex Component secondary effects such as "Damage dealt by AR
   * Dolls ..."). Optional — absent = the doll declares no weapon type, and any weapon-type-gated
   * effect simply never matches (never assumed).
   */
  weaponType?: WeaponType;
  /** Doll's own phase element (null = phase-less, e.g. physical-ammo dolls). */
  phase: Element | null;
  base: { atk: number; hp: number; def: number; stability: number; critRate: number; critDmg: number };
  // NOTE (2026): characters no longer carry a permanent equipped weapon — weapons are REUSABLE
  // definitions equipped per scenario via `ScenarioTeamMember.weaponId` (1 Weapon Slot) and
  // resolved through `Registry.getWeapon` (src/data/weapons.ts). Property removed from CharacterDef.
  /** Ability kit. `basic` is always required; active1/active2/ultimate/support are OPTIONAL — a
   *  minimal unit (e.g. the Friendly Dummy) may declare only `basic`. Engine paths that resolve
   *  abilities skip absent slots; `pickAction` treats an absent non-basic slot as unavailable (and
   *  falls back to basic per the existing rotation contract). Qiongjiu supplies all slots. */
  skills: { basic: AbilityDef; active1?: AbilityDef; active2?: AbilityDef; ultimate?: AbilityDef; support?: AbilityDef };
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
  /**
   * STANDALONE character Affinity-LEVEL FLAT stats (2026, confirmed) — a SEPARATE affinity FLAT
   * source, keyed by Affinity Level, each entry holding that level's PER-LEVEL flat ATK/HP/DEF
   * increase; the contribution at level N is the cumulative sum of entries 1..N. Enters the
   * shared panel flat bucket (same as Dispatch / Remolder flats / Neural Helix). Absent = none.
   */
  affinityFlatStats?: Record<number, AffinityFlatStats>;
  /** Affinity Key (bond) — recorded data; engine consumption deferred. */
  affinityKey?: AffinityKeyDef;
  // Common Keys are REUSABLE definitions — they live in the Common Key registry
  // (src/data/common-keys.ts / Registry.getCommonKey), NOT embedded in CharacterDef (2026).
  /**
   * GRID (2026): Mobility stat used by the core grid system (movement budget per turn).
   * Optional — absent means the unit cannot move; existing characters are unaffected.
   */
  mobility?: number;
  /**
   * PATTERN REMOLDER (2026, flower system): character-specific Lv.60 REMOLDER FLAT stats ?
   * a SEPARATE permanent flat source (ATK/HP/DEF), like dispatch_stat_buffs but per-character
   * (Qiongjiu: ATK +245 / HP +679 / DEF +224). NEVER merged into `base`. Absent = 0.
   * Always active; enters the ONE panel path: finalStat(base + flat, pct).
   */
  remolderFlat?: { atk?: number; hp?: number; def?: number };
  /**
   * PATTERN REMOLDER SET BONUSES (2026): per-character definitions (Qiongjiu: Embryo?Blossom).
   * Activation requires only the four category totals (Bulwark/Vanguard/Support/Sentinel) from
   * the character's OWN selected Remolder buff levels; ALL qualifying set bonuses are active
   * simultaneously; level-60 Remolder is always assumed. Effects carry explicit targeting and
   * "does not stack" semantics.
   */
  remolderSetBonuses?: RemolderSetBonusDef[];
  /**
   * NEURAL HELIX (2026) — an INDEPENDENT system (NOT Affinity, no levels). ONE static per-character
   * definition: flat ATK/HP/DEF (into the shared flat bucket) and ATK%/HP%/DEF% (into the shared
   * percentage buckets, stacked with the universal `NEURAL_HELIX_GLOBAL_PCT`). Never placed in an
   * Affinity structure; never merged into `base`. Absent = no character-specific contribution
   * (the universal +12% still applies to real characters).
   */
  neuralHelixStats?: NeuralHelixStats;
}

/**
 * NEURAL HELIX character-specific stats (2026): static flat + percentage contributions.
 * `atk/hp/def` are FLAT (added to the shared flat bucket); `atkPct/hpPct/defPct` are FRACTIONS
 * (e.g. 0.10 = +10%) added to the shared percentage buckets. Independent of Affinity and levels.
 */
export interface NeuralHelixStats {
  atk?: number;
  hp?: number;
  def?: number;
  atkPct?: number;
  hpPct?: number;
  defPct?: number;
}

export type RemolderCategory = "bulwark" | "vanguard" | "support" | "sentinel";

/**
 * PATTERN REMOLDER EFFECT GATES (2026): optional conditions evaluated against the CURRENT
 * damage/stat event, mirroring the existing engine gate vocabulary (support actions, damage
 * category, Exposed/Stability-Break target, attack element, out-of-turn). Absent gate = applies
 * always. Gates restrict; they never approximate missing mechanics silently.
 */
export interface RemolderEffectGates {
  /** Restrict to Support Actions only. */
  actions?: "support";
  /** Restrict to aoe / targeted attacks (damageCategory). */
  category?: "aoe" | "targeted";
  /** Restrict to hits on an Exposed / Stability-Break target. */
  targetExposed?: boolean;
  /** Restrict to hits with ANY of these attack elements (null = phase-less/physical). */
  element?: (Element | null)[];
  /** Restrict to hits with ANY phase element (element !== null) — used with `element` for OR-combined gates (e.g. Seedling: physical AND phase). */
  anyPhase?: boolean;
  /** Restrict to out-of-turn events (in the MVP, Support Actions — the only out-of-turn attacker). */
  outOfTurn?: boolean;
  /** Restrict to specific ability types (Sentinel "Onslaught Stance": damage dealt by active skills). */
  skillTypes?: ("basic" | "active" | "ultimate" | "support")[];
  /** Restrict to hits on a BOSS target (`DummyConfig.isBoss`; Sentinel "Thronebreaker"). */
  bossTarget?: boolean;
  /**
   * Restrict to hits whose attack-origin distance to the target is STRICTLY GREATER than this
   * many tiles (Sentinel "Headhunter": more than 6 tiles away). Requires a grid with a resolvable
   * distance; when the distance cannot be determined the gate does NOT match (never applied as an
   * unconditional bonus — no fake mechanics).
   */
  minDistance?: number;
  /**
   * Restrict to hits whose attack-origin distance to the target is AT MOST this many tiles
   * (Vanguard "CQC Elite": within 3 tiles). Requires a grid with a resolvable distance; when the
   * distance cannot be determined the gate does NOT match (never applied as an unconditional bonus).
   */
  maxDistance?: number;
  /**
   * Restrict by the number of ENEMY units within 3 tiles (Manhattan) of the AFFECTED unit
   * (Bulwark "Breakout Countermeasures" ≥ 2; "Lone Rider Countermeasures" exactly 1). Requires a
   * grid with a resolvable placement; with no grid / no count the gate does NOT match (never
   * treated as satisfying the condition).
   */
  enemiesWithin3?: { atLeast?: number; atMost?: number };
}

/**
 * PATTERN REMOLDER EFFECT (2026): expressed in the EXISTING engine vocabulary so effects enter
 * the existing buckets (additive DMG% dealt/taken, multiplicative damage taken, panel stat
 * percentages, crit, out-of-turn damage) — never a parallel stat/damage formula. Each effect
 * carries optional gates (above) and a source identity for future stat-source UI.
 */
export type RemolderEffect =
  | { kind: "additive_dealt"; value: number; gates?: RemolderEffectGates }
  | { kind: "additive_taken"; value: number; gates?: RemolderEffectGates }
  | { kind: "multiplicative_taken"; value: number; gates?: RemolderEffectGates }
  | { kind: "stat_pct"; stat: "atk" | "hp" | "def"; value: number }
  | { kind: "crit_rate"; value: number }
  | { kind: "crit_dmg"; value: number }
  | {
      /**
       * CONDITIONAL Crit-DMG (2026, Vanguard): adds `value` to the effective Crit DMG for the hit
       * ONLY when the gates match (targeted / AoE / boss / element / active-skill / out-of-turn /
       * distance). Enters the SAME confirmed crit multiplier (1 + Crit DMG) — no second crit path.
       */
      kind: "crit_dmg_gated";
      value: number;
      gates?: RemolderEffectGates;
    }
  | {
      /**
       * HP RECOVERY ON ATTACK (2026, Vanguard "Bloodthirst"): when the unit deals damage, it
       * recovers `pct` × the unit's effect-applier ATK (panel ATK), capped at max HP. A recovery
       * effect — NEVER a permanent stat increase. `Math.ceil` matches the engine's heal convention.
       */
      kind: "heal_on_attack";
      pct: number;
    }
  | {
      /**
       * FIRST DAMAGED TARGET PER TURN — fixed STABILITY damage (2026, Vanguard "Shock and Awe"):
       * the FIRST enemy unit the holder damages each round takes `amount` extra FIXED Stability
       * damage (once per turn). Stability only — never HP damage / DMG% / DEF / weakness / crit.
       */
      kind: "first_target_stability";
      amount: number;
    }
  | {
      /**
       * END-OF-ACTION HP RECOVERY (2026, Support "Life Recovery"): at the holder's own action end
       * (the existing `ownActionEnd` timing), restores `pct` × max HP, capped at max HP. Triggers
       * ONCE per turn. A recovery — never a max-HP / ATK stat increase.
       */
      kind: "heal_end_of_action";
      pct: number;
    }
  | {
      /**
       * END-OF-ACTION STABILITY RECOVERY (2026, Support "Equilibrium Recovery"): at the holder's
       * own action end, restores `amount` Stability, capped at max Stability. Triggers ONCE per
       * turn. Uses the EXISTING Stability value (no parallel Stability system).
       */
      kind: "stability_recovery";
      amount: number;
    }
  | {
      /**
       * FLAT HP FROM INITIAL ATK (2026, Support "Ichor Resonance"): adds `pct` × the character's
       * INITIAL ATTACK (`CharacterDef.base.atk`, before weapon/dispatch/Remolder/modifiers) as a
       * FLAT HP contribution to the panel. Initial Attack ≠ current panel Attack.
       */
      kind: "flat_hp_from_base_atk";
      pct: number;
    }
  | {
      /**
       * FLAT ATK FROM INITIAL MAX HP (2026, Support "Ichor Conversion"): adds `pct` × the
       * character's INITIAL max HP (`CharacterDef.base.hp`, before modifiers) as a FLAT ATK
       * contribution to the panel. Initial max HP ≠ current max HP.
       */
      kind: "flat_atk_from_base_hp";
      pct: number;
    }
  | {
      /**
       * HEALING/SHIELD BONUS (2026, Support "Healing Boost"): increases the healing the holder
       * APPLIES by `value` (multiplicative on the heal amount). Enters the heal pipeline ONLY —
       * never a damage / ATK / stat bucket. (Shields and healing of OTHER units are not modeled
       * by the engine — see the Support report.)
       */
      kind: "heal_bonus";
      value: number;
    }
  | {
      /**
       * UNITY — ALLIED DAMAGE (2026, Support physical/elemental Unity): the winner of the team
       * Unity resolution grants all allies `additive_dealt` for hits matching `gates` (element).
       * "Does not stack": strongest active level wins, ties → one instance (see resolveRemolderTeam).
       * Strength comes from the SAME level's `additive_dealt` (the level's value marker).
       */
      kind: "unity_dealt";
      label: string;
      gates?: RemolderEffectGates;
      target: "all_allies";
    }
  | {
      /**
       * ON-ALLY-CLEANSE STAT PCT (2026, Support "Purification Feedback"): after cleansing an
       * ALLIED unit's debuffs, the holder's ATK and max HP increase for `durationRounds`. The
       * engine has NO ally-debuff/cleanse-trigger model in the MVP (the generic cleanse targets
       * the dummy), so this effect is RECORDED but has no engine consumer (reported, not faked).
       */
      kind: "ally_cleanse_stat_pct";
      atk: number;
      hp: number;
      durationRounds: number;
    }
  | {
      /**
       * REACTIVE DAMAGE (2026, Bulwark "Lex Talionis"): when the holder TAKES damage, deals fixed
       * damage back to the attacker = `pctOfMaxHp` × the holder's max HP, capped at 100% of the
       * holder's ATK when `capAtAtk` (the source's cap: "cannot exceed 100% of this unit's
       * attack"). A SEPARATE reactive event — never additive damage, a taken modifier, or an ATK
       * buff. Fires only when the holder actually takes damage.
       */
      kind: "reactive_damage";
      pctOfMaxHp: number;
      capAtAtk: boolean;
    }
  | { kind: "out_of_turn_dmg"; value: number }
  | {
      /**
       * START-OF-BATTLE ALLIED STAT PCT (2026, e.g. Blossom): at battle start the
       * top-`count` ALLIED units with the highest ATK (owner excluded) gain `value` as a
       * percentage stat. "Does not stack": one application per source, strongest value wins.
       */
      kind: "allied_stat_pct_battle_start";
      stat: "atk" | "hp" | "def";
      value: number;
      select: "highest_attack";
      count: number;
    }
  | {
      /**
       * UNITY (2026) — CONFIRMED in-game (not an assumption): a global ALLIED effect supplied by
       * this buff's level. "Does not stack": every active instance of the same unity competes and
       * only the HIGHEST active LEVEL takes effect (lower levels are ignored). Equal-highest ties
       * resolve to exactly ONE instance (never combined) ⇒ one active instance per unity type.
       * `target: "all_allies"` grants that single winning instance to units that do NOT themselves
       * hold a winning instance (the strongest owner's teammates — a bond shared with allies).
       */
      kind: "unity";
      label: string;
      stat: "atk" | "hp" | "def";
      target: "all_allies";
    };

/** PATTERN REMOLDER BUFF DEFINITION (2026): global, shared by every character. */
export interface RemolderBuffDef {
  id: string;
  name: string;
  category: RemolderCategory;
  /**
   * Optional SOURCE NAME captured from the authoritative source (e.g. Sentinel "Attack Boost"
   * comes from heaven Blossom). Recorded data only — never consumed by the engine, never
   * invented (buff effects that have no known source name leave this absent; the source name is
   * NOT the buff's in-game name).
   */
  source?: string;
  /** Buffs are invalid above this level; supplied levels clamp to it. */
  maxLevel: number;
  /** Level → effects (exact table values from source material; only levels present are defined). */
  effects: Record<number, RemolderEffect[]>;
}

/** PATTERN REMOLDER SET BONUS (2026): per-character; requirement = category totals only. */
export interface RemolderSetBonusDef {
  id: string;
  name: string;
  /** Remolder tier (1/10/20/30/45/60 — engine always assumes level 60, so all are eligible). */
  remolderLevel: number;
  requires: { bulwark: number; vanguard: number; support: number; sentinel: number };
  /** Self-targeting or team-targeting per effect (see RemolderEffect gates/target). */
  effects: RemolderEffect[];
}

/**
 * RESOLVED REMOLDER MODIFIER (2026): a single implementable effect + source identity, stored
 * on UnitState.remolder.modifiers so the combat pipeline consumes it via the existing buckets
 * and the future UI can explain where it came from.
 */
export interface RemolderModifier {
  sourceType: "buff" | "set_bonus" | "unity";
  sourceId: string;
  level: number;
  label: string;
  effect: RemolderEffect;
}

// ---------------------------------------------------------------------------------------------
// WEAPON ATTACHMENT SYSTEM (2026) — SET DEFINITIONS (DATA STAGE ONLY; NOT consumed by the engine).
// Every weapon has 4 attachment slots (Muzzle / Sight / Foregrip / Underbarrel). Attachment Sets
// apply to the 3 non-Muzzle slots (Sight / Foregrip / Underbarrel); equipping 3 pieces of the same
// set activates its 3-piece bonus. ONLY the set definitions are modeled at this stage — no
// attachment inventory, stat rolls, rarity, generation, or Muzzle set participation (all
// UNCONFIRMED — see docs/research.md §3.19 / U22). Nothing here is consumed by the engine yet.
// ---------------------------------------------------------------------------------------------

/** Attachment slots an Attachment Set can apply to (the confirmed 3 non-Muzzle slots). */
export type AttachmentSetSlot = "sight" | "foregrip" | "underbarrel";

/**
 * ATTACHMENT SET BONUS GATES (2026): the EXISTING gate vocabulary (same semantics as
 * `RemolderEffectGates.element`) plus attachment-specific conditions that the current engine
 * cannot yet express. Absent gate = applies always. Gates restrict; they never approximate.
 */
export interface AttachmentSetGates {
  /** Restrict to hits with ANY of these attack elements (null = phase-less/physical). */
  element?: (Element | null)[];
  /**
   * Restrict to hits with ANY of these attack AMMO categories (the existing `AmmoType` dimension;
   * e.g. `["melee"]` = melee damage). Same reuse pattern as the `element` gate.
   */
  ammoType?: AmmoType[];
  /**
   * Restrict to damage dealt OUTSIDE the unit's own turn (Support Attacks, Interceptions,
   * Counterattacks, and other attacks from passive effects — the confirmed qualifying
   * categories; no additional category is invented). Same semantic as `RemolderEffectGates.outOfTurn`.
   */
  outOfTurn?: boolean;
  /** Restrict to aoe / targeted attacks (existing `damageCategory`). Same as `RemolderEffectGates.category`. */
  category?: "aoe" | "targeted";
  /** Restrict to specific ability types. Same as `RemolderEffectGates.skillTypes`. */
  skillTypes?: ("basic" | "active" | "ultimate" | "support")[];
  /**
   * ATTACHMENT-ONLY GATE (2026, "Phase Strike"): restrict to hits on a target carrying a
   * Phase-attribute DEBUFF (any phase element — the source does not specify one). The existing
   * gate vocabulary has no target-status/phase gate and `StatusDef` carries no element attribute,
   * so this condition is NOT evaluable by the engine yet — recorded DATA ONLY, engine consumption
   * DEFERRED. No other system may consume this field.
   */
  targetPhaseDebuff?: boolean;
  /**
   * ATTACHMENT-ONLY GATE (2026, "Summon Boost"): the bonus applies only while this unit's
   * PHYSICAL Summon is on the battlefield (a Summon creature which can be selected, has stats, and
   * takes up a tile in battle — the source's definition). The engine has NO Summon model, so this
   * condition is NOT evaluable yet — recorded DATA ONLY, engine consumption DEFERRED. No Summon
   * mechanics are invented to consume this field. No other system may consume this field.
   */
  physicalSummonOnBattlefield?: boolean;
  /**
   * ATTACHMENT-ONLY GATE (2026, "Double Strategy"): restrict to hits whose TARGET is (or is not)
   * near Cover. The engine has no Cover mechanic (MVP targets are always No Cover), so this
   * condition is NOT evaluable yet — recorded DATA ONLY, engine consumption DEFERRED. No Cover
   * detection is invented.
   */
  targetNearCover?: boolean;
  /**
   * ATTACHMENT-ONLY GATE (2026, "Phase Resonance"): restrict to an attack that exploits exactly
   * this many PHASE weaknesses (the source states "a phase weakness" / "two phase weaknesses";
   * the exact at-least vs exactly semantics are NOT confirmed — recorded verbatim). The engine
   * tracks exploited weaknesses for damage but exposes no phase-count gate, so this is NOT
   * evaluable yet — recorded DATA ONLY, engine consumption DEFERRED.
   */
  phaseWeaknessCount?: number;
  /**
   * ATTACHMENT-ONLY GATE (2026, "Shielded Recovery"): restrict to while the unit has a shield-type
   * effect. The engine has no shield mechanic, so this is NOT evaluable yet — recorded DATA ONLY,
   * engine consumption DEFERRED. No shield mechanics are invented.
   */
  hasShield?: boolean;
  /**
   * ATTACHMENT-ONLY GATE (2026, "Ally Support"): restrict to the use of a DEFENSE skill. The
   * engine has no defense-skill classification, so this is NOT evaluable yet — recorded DATA ONLY,
   * engine consumption DEFERRED.
   */
  defenseSkill?: boolean;
  /**
   * ATTACHMENT-ONLY GATE (2026, "Emergency Repair"): the trigger is an ALLIED unit's HP becoming
   * FULLY healed by an active skill. The engine has no ally-healing/full-heal model, so this is
   * NOT evaluable yet — recorded DATA ONLY, engine consumption DEFERRED. No healing mechanics are
   * invented.
   */
  allyFullHeal?: boolean;
}

/**
 * ATTACHMENT SET BONUS EFFECT (2026) — DATA STAGE. The damage-increase case reuses the EXISTING
 * `additive_dealt` vocabulary (the ONE additive DMG% bucket — there is NO separate
 * damage-increase bucket). Non-damage effects (Ultimate healing/shield, damage taken, healing
 * received, status grants, stability restore) are represented by their own dedicated kinds so they
 * are NOT silently converted into DMG%. Every kind here is DATA ONLY — the engine does not consume
 * attachment sets yet (see docs/research.md §3.19 / U22).
 */
export type AttachmentSetEffect =
  /** Existing additive DMG% bucket (same as `RemolderEffect.additive_dealt`). */
  | { kind: "additive_dealt"; value: number; gates?: AttachmentSetGates }
  /** Damage-TAKEN reduction (multiplicative), same semantics as the existing `damage_reduction`. */
  | { kind: "damage_reduction"; value: number; gates?: AttachmentSetGates }
  /** Healing RECEIVED increase (a non-damage effect — never a DMG% term). */
  | { kind: "healing_received"; value: number; gates?: AttachmentSetGates }
  /**
   * ULTIMATE EFFECT BOOST (2026, "Ultimate Pursuit"): increases the listed Ultimate-skill effect
   * kinds by `value`. The stack rule is recorded DATA ONLY (`perUse` gained after each Ultimate
   * use, `max` cap) — the exact stacking CALCULATION is NOT modeled/invented.
   */
  | {
      kind: "ultimate_effect_boost";
      value: number;
      appliesTo: ("damage" | "healing" | "shield")[];
      stack: { perUse: number; max: number };
      gates?: AttachmentSetGates;
    }
  /**
   * GRANT STATUS (2026): apply a named status. `statusName` is the source's displayed name —
   * referenced, NOT defined here (the status definition is NOT added by this data). `timing`
   * records "before the attack" vs "on skill use". DATA ONLY.
   */
  | {
      kind: "grant_status";
      statusName: string;
      durationRounds: number;
      target: "self" | "allies";
      timing?: "before_attack" | "on_skill";
      gates?: AttachmentSetGates;
    }
  /** RESTORE STABILITY (2026): restore `amount` Stability to `target`, at most `oncePerTurn`. DATA ONLY. */
  | { kind: "restore_stability"; amount: number; target: "allies"; oncePerTurn: boolean; gates?: AttachmentSetGates };

/**
 * WEAPON ATTACHMENT SET DEFINITION (2026) — DATA STAGE ONLY (not consumed by the engine yet).
 * Confirmed structure: a set applies to the Sight / Foregrip / Underbarrel slots, and equipping
 * 3 pieces of the same set activates the set's 3-piece bonus. A set may carry MULTIPLE effects
 * (e.g. Close Assault = unconditional + melee-conditional, both additive in the ONE DMG% bucket;
 * Double Strategy = a targeted branch + an AoE branch). `bonuses` is an array for that reason.
 * SET COEXISTENCE (CONFIRMED 2026): exactly ONE active set per character — different sets cannot
 * coexist or stack (the 3-piece bonus applies once). The Muzzle is NOT part of any set (unconfirmed).
 */
export interface AttachmentSetDef {
  id: string;
  name: string;
  /** Slots this set applies to — the confirmed non-Muzzle slots. */
  slots: AttachmentSetSlot[];
  /** Pieces required to activate the bonus (confirmed: 3). */
  pieces: number;
  /** The 3-piece bonus effects (damage terms use the ONE additive DMG% bucket; non-damage effects
   *  use their own dedicated kinds — never silently converted to DMG%). */
  bonuses: AttachmentSetEffect[];
  /**
   * CONSUMPTION AVAILABILITY (2026): `true` when the engine actually consumes this set's bonuses
   * (every gate is engine-evaluable). `false` = the set is defined data but INERT (one or more
   * gates are not engine-evaluable). The UI derives its selectable set list from this flag — it
   * never hard-codes set ids.
   */
  implemented: boolean;
}

// ---------------------------------------------------------------------------------------------
// WEAPON ATTACHMENT SYSTEM (2026) — USER-CONFIGURABLE CONFIGURATION CONTRACT (DATA STAGE ONLY).
// The user selects which stat KINDS each slot has; values are FIXED max-stat constants (no rolls).
// The active Attachment Set is a SEPARATE loadout-level selection (no per-slot set identity).
// NOT consumed by the engine yet (see docs/research.md §3.19 / U22).
// ---------------------------------------------------------------------------------------------

/** The confirmed 4 attachment slots (Muzzle is the only one that may use Crit Damage). */
export type AttachmentSlot = "muzzle" | "sight" | "foregrip" | "underbarrel";

/** The attachment stat KINDS a user can select (each maps to a fixed max-stat value + bucket). */
export type AttachmentStat =
  | "attack"
  | "attackBoost"
  | "health"
  | "healthBoost"
  | "defense"
  | "defenseBoost"
  | "critRate"
  | "critDamage";

/**
 * Per-slot selected stat kinds. An ABSENT or EMPTY slot array = an empty slot (contributes no
 * stats). Per-slot maxima and the Muzzle-only Crit Damage rule are enforced by
 * `validateAttachmentConfig` (src/data/attachments.ts).
 */
export interface AttachmentConfig {
  muzzle?: AttachmentStat[];
  sight?: AttachmentStat[];
  foregrip?: AttachmentStat[];
  underbarrel?: AttachmentStat[];
}

/**
 * LOADOUT-LEVEL attachment selection: the per-slot stat configuration AND the SEPARATE active
 * Attachment Set. The set is NOT stored per slot and does NOT affect stat selection — it is a
 * single loadout-level choice (docs/research.md §3.19, "Set selection model").
 */
export interface AttachmentLoadout {
  /** Per-slot selected stat kinds. Absent = no attachments. */
  attachments?: AttachmentConfig;
  /** The selected Attachment Set id (loadout-level, independent of the per-slot stats). */
  activeAttachmentSet?: string;
}

export type StatusEffect =
  | {
      kind: "stat_modifier";
      /**
       * `critRate` and `critDmg` are FRACTIONS (0.2 = 120% displayed), added by `flat` or scaled by
       * `pct` exactly like the other stats; they stay CONTINUOUS (the integer-panel rounding rule
       * applies to ATK/HP/DEF only). `critDmg` enters the confirmed crit multiplier `1 + Crit DMG`.
       */
      stat: "atk" | "def" | "hp" | "critRate" | "critDmg";
      mode: "flat" | "pct";
      value: number;
    }
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
      /**
       * NEW (2026) — optional PER-ELEMENT gate, on BOTH scopes (the same OR-list semantics as the
       * existing `AttachmentSetGates.element` / `RemolderEffectGates.element`: the hit's attack
       * element must be one of these; `null` in the list matches a PHASE-LESS hit). This is the
       * generic form of the per-element gate that previously existed only on
       * `stack_tier_modifier.when.element`. Absent = all elements (existing behavior).
       *
       * Needed by Vector's Burn clauses: Accelerant ("Burn damage dealt +10%", DEALT) and
       * Overheat Combustion V1 ("Burn damage taken +30%", TAKEN). No element is invented — the
       * values are the engine's existing `Element` union plus `null`.
       */
      whenElement?: (Element | null)[];
      /**
       * COUNT-BY-CLASSIFICATION scaling (2026) — "for every <element> <category>". The modifier's
       * `value` is multiplied by the number of statuses ACTIVE ON THE SAME UNIT as the one being
       * scanned that match this classification. Vector's clauses: Smolder V4 ("each Burn debuff
       * increases damage taken by 3%" — TAKEN side, so the count scans the TARGET's statuses) and
       * Accelerant V6 ("every Burn buff increases damage dealt by 5%" — DEALT side, so the count
       * scans the HOLDER's statuses). Both sides already scan "the unit's own statuses", so the
       * count is over that same unit — no new scanning target.
       *
       * Counted PER STATUS, never per stack (a 3-stack Burn debuff is ONE Burn debuff), matching
       * the wording "every Burn debuff". Element matches `StatusDef.element`; the classification
       * matches `StatusDef.category`. NO self-exclusion — the wording states no exception, so a
       * status that is itself classified Burn counts toward its own clause. Absent = no count
       * scaling (value applies once, existing behavior). Never inferred from ids or names.
       */
      perMatching?: { element: Element; category: "buff" | "debuff" };
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
    }
  | {
      /**
       * EXTRA COMMAND (2026, Vector's Searing Finale Lv.1 — "Vector gains Extra Command").
       * While the holder carries a status with this effect, it may perform ONE ADDITIONAL main
       * action after its current action, within the SAME unit-turn. Consumption is PER ACTION
       * (one extra action per stack): the engine consumes one instance each time it grants the
       * extra action, and the status is removed when no instance remains.
       *
       * Movement: the extra action is an ACTION ONLY — no move occurs during it (moves are applied
       * at the pre-action point of the turn loop, which runs once per unit-turn).
       *
       * No numeric value: the effect IS the grant. Data-driven; no character/skill ids anywhere.
       */
      kind: "extra_action";
    }
  | {
      /**
       * SKILL DENIAL — "Command Prohibition" (2026, Vector's Overheat: *"Command Prohibition,
       * disallows the use of active skills."*).
       *
       * While the holder carries a status with this effect it may not use ACTIVE skills or the
       * ULTIMATE — only the BASIC attack remains available. `slotAvailable` consults this, so a
       * denied unit genuinely loses those skills when it picks its action.
       *
       * IMMUNITY IS A LAW OF THE MECHANIC, NOT A DATA FLAG (project owner, 2026-10-10): denial
       * NEVER applies to a non-doll unit (the training dummy, grid line enemies) or to an
       * `isBoss` unit. It is enforced inside `skillDenied` — NOT declared per status — so no
       * future denial status can bypass it by omitting a field. Rationale: the simulator only
       * fights bosses/dummies, so a boss-effective denial would be both wrong and untestable
       * here; and in-fiction Command Prohibition does not work on bosses.
       *
       * Consequence (intended): denial is INERT on every current enemy, because enemies never
       * pick actions at all (the dummy takes a pass-turn; grid line enemies never act). The
       * mechanic still has REAL, testable behaviour when the status lands on a DOLL.
       *
       * No numeric value: the effect IS the denial. Data-driven; no character/skill ids.
       */
      kind: "deny_skills";
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
  /**
   * Duration tick point.
   * - `ownActionEnd` — the holder's action end (CONFIRMED default for normal timed buffs, U7).
   * - `roundEnd` — the end of the whole round (alternative/testing).
   * - `ownActionStart` — the holder's turn START, BEFORE it acts (2026: Overheat Combustion's
   *   "at the start of this unit's action" clause). Effects tied to this point fire first; the
   *   holder then takes its action.
   */
  tickAt: "ownActionEnd" | "roundEnd" | "ownActionStart";
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
  /**
   * PHASE ATTRIBUTE (2026, VALIDATED in-game for Overburn → Burn): the status's intrinsic Phase
   * element. `null`/absent = NON-elemental (no Phase attribute). Only statuses with an OBSERVED
   * attribute are populated (do not invent other status→Phase relationships). Consumed by the
   * generic attachment-set `targetPhaseDebuff` gate — a target "has a Phase attribute debuff" when
   * it carries an active status whose definition has a non-null `phase`.
   */
  phase?: Element | null;
  /**
   * ELEMENT AFFILIATION (2026) — the status's declared element CLASSIFICATION, distinct from
   * `phase` above. `phase` answers one narrow validated question ("is this a Phase-attribute
   * DEBUFF?", consumed by the Phase Strike gate); `element` is the broader element tag a status
   * carries regardless of buff/debuff direction — e.g. Blazing Assault II is an ATK BUFF that is
   * nonetheless a *Burn* status. Absent = no element affiliation (the default; do not invent one).
   *
   * Consumed by the generic count-by-classification scaling on `damage_modifier.perMatching`
   * ("for every Burn debuff …", "per Burn buff …"). Only populated where the source record
   * states the classification (Vector's status inventory Tags column, `docs/dolls/vector.md` §7.1).
   * Kept SEPARATE from `phase` on purpose: overloading `phase` for Burn buffs would change the
   * Phase Strike gate's meaning and regress it.
   */
  element?: Element | null;
}

/**
 * Ammo weakness categories (authoritative game terminology, 2026): Heavy Ammo, Medium Ammo,
 * Light Ammo, Melee, Shotgun Ammo. `melee` is a valid TARGET weakness category only — an attack
 * without an ammo-based category simply omits `ammoType` (which never matches).
 * `medium_ammo` represents Qiongjiu's Medium Ammo attacks ("Ammo Type: Medium" in-game).
 */
export type AmmoType = "heavy_ammo" | "medium_ammo" | "light_ammo" | "shotgun_ammo" | "melee";

/**
 * DOLL WEAPON TYPE (2026) — the 7 gun categories the game's weapon filter and the Apex Component
 * types are keyed to: Assault Rifle, Submachine Gun, Shotgun, Machine Gun, Sniper Rifle, Handgun,
 * Blade. This is the doll's OWN weapon class (Qiongjiu = "ar", evidenced by her signature weapon
 * Golden Melody being an Assault Rifle) — distinct from `DollClass` (bulwark/vanguard/support/
 * sentinel) and from `AmmoType`. Used by Apex Component secondary effects that are gated to a
 * weapon type ("Damage dealt by AR Dolls ...").
 */
export type WeaponType = "ar" | "smg" | "sg" | "mg" | "rf" | "hg" | "bld";

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
  /**
   * BOSS target flag (2026): the target is a boss unit. Data-driven target property (like
   * `raceTypes`) used by boss-gated modifiers (Pattern Remolder Sentinel "Thronebreaker").
   * Absent/false = ordinary target. Only set from authoritative evidence.
   */
  isBoss?: boolean;
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
  /** Duration tick point — CONFIRMED default for normal timed buffs: recipient's action end (`ownActionEnd`, U7, in-game 2026-09-03); override retained for alternative testing. `ownActionStart` = the holder's turn start, before it acts. */
  tickAt?: "ownActionEnd" | "roundEnd" | "ownActionStart";
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
   * PLAYER-CHOSEN stat kinds for the SELECTABLE slots of each equipped Common Key (2026). Keyed by
   * Common Key id → an ordered array of chosen stat kinds for that key's slots #1..#N (slot #0 is
   * the key's fixed stat and is NEVER listed here). A key whose selectable slots are unfilled
   * (missing/short array) contributes only its fixed stat. The engine validates: no entry for a
   * slot #0, kind must be a supported `CommonKeyStat`, array length ≤ the key's selectable-slot
   * count.
   */
  commonKeyStatChoices?: Record<string, CommonKeyStat[]>;
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
  /**
   * WEAPON ATTACHMENTS (2026): per-slot selected stat kinds for the equipped weapon's 4 attachment
   * slots. Absent/empty = no attachment stats. Values are the FIXED max-stat constants
   * (src/data/attachments.ts); the contract (per-slot maxima, uniqueness, Muzzle-only Crit Damage)
   * is enforced by `validateAttachmentConfig`. Folded into the EXISTING panel buckets — no new
   * damage formula/bucket. The active Attachment Set is a SEPARATE field (below); set EFFECTS are
   * not implemented yet.
   */
  attachments?: AttachmentConfig;
  /**
   * WEAPON ATTACHMENTS (2026): the selected ACTIVE Attachment Set id — a LOADOUT-LEVEL selection,
   * independent of the per-slot stats (no per-slot set identity; membership is never inferred from
   * stats). Recorded here for the future set-effect implementation; NOT consumed yet.
   */
  activeAttachmentSet?: string;
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
  /**
   * DEBUG-MODE AUTHORITATIVE OVERRIDES (2026): when `true`, every `baseStatOverrides` field is
   * the AUTHORITATIVE value for that stat — the permanent global `dispatch_stat_buffs` is NOT
   * added underneath an overridden stat (e.g. Debug ATK 1500 on a Sentinel stays 1500, no +231).
   * Stats WITHOUT an override still receive dispatch normally. This flag lives ONLY at the
   * Debug→scenario boundary (set by the Debug Mode UI); normal scenarios and engine math
   * fixtures that use `baseStatOverrides` as controlled inputs NEVER set it — their overrides
   * keep coexisting with dispatch (established, tested behavior).
   */
  overridesAuthoritative?: boolean;
  /**
   * TEST-ONLY FIXTURE SWITCH (2026): `applyDispatchStats: false` declares this member a
   * CONTROLLED MATH FIXTURE — it does NOT receive the permanent global `dispatch_stat_buffs`
   * system and its panel equals exactly finalStat(base + weapon flat, weapon pct). This is
   * explicit at the scenario boundary and NEVER used by real characters: production gameplay
   * (UI/buildScenario, real scenario data) leaves it absent, so dispatch is always applied.
   * It never alters `baseStatOverrides` or `CharacterDef.class` (both stay fully valid).
   */
  applyDispatchStats?: boolean;
  /**
   * PATTERN REMOLDER (2026): user-provided selected buff levels, buffId -> level.
   * Level 0 = inactive; levels above a buff''s max clamp; each buff has its own level/value table.
   * Not character-specific (same global definitions for every character). Buff definitions are
   * supplied via `Scenario.remolderBuffSet` (production data populates later).
   */
  remolderBuffs?: Record<string, number>;
  /**
   * PERMANENT COOKING STATS (2026): per-member toggle for the permanent flat ATK/DEF/HP bonus
   * (`PERMANENT_COOKING_STATS` — 15 ATK / 15 DEF / 30 HP). Absent/false = the bonus is NOT applied
   * (OFF by default). When true it enters the EXISTING flat bucket of the ONE panel path, summed
   * with the other permanent flat sources before percentage modifiers. Excluded by controlled math
   * fixtures (`applyDispatchStats: false`) like the other permanent sources, and suppressed on any
   * stat under a Debug-authoritative override.
   */
  permanentCookingStats?: boolean;
}

/**
 * APEX COMPONENT STAT BLOCK (2026) — the always-on stat grants of an Apex Component, folded through
 * the EXISTING generic stat infrastructure (no parallel stat system). `atkPct`/`hpPct`/`defPct` are
 * percentages (0.025 = +2.5%); `allElementBoost` is the game's All-Element Boost value (a FLAT
 * number, e.g. 75 — NOT a percentage). All-Element Boost is RECORDED but INERT: it only has a
 * damage meaning through the RESMult formula (enemy RES / RESPierce / RESShred / Venomfire), which
 * this engine does NOT model — so it never modifies damage here.
 */
export interface ApexComponentStats {
  atkPct?: number;
  hpPct?: number;
  defPct?: number;
  /** All-Element Boost (flat value). RECORDED ONLY — no damage effect until the RES system exists. */
  allElementBoost?: number;
}

/**
 * A weapon-type-gated damage term of an Apex Component's SECONDARY EFFECT (e.g. "Damage dealt by
 * AR Dolls is increased by 5%"). `value` is additive in the existing DMG% dealt bucket.
 */
export interface ApexSecondaryWeaponTypeTerm {
  weaponType: WeaponType;
  value: number;
}

/**
 * APEX COMPONENT SECONDARY EFFECT (2026). A component's second tooltip: a weapon-type-gated
 * damage term, plus an optional term that applies when the attack EXPLOITS A WEAKNESS. Both are
 * additive in the existing DMG% dealt bucket. "Exploits a weakness" follows the authoritative
 * formula `Weak = 1 + PhaseWeak + AmmoWeak` — an exploited PHASE weakness (element) OR an
 * exploited AMMO weakness both qualify.
 */
export interface ApexComponentSecondaryEffect {
  /** Display name, e.g. "Firepower Reconstruction III" (the tier suffix is part of the name). */
  name: string;
  /** Weapon-type-gated term — matches only when the dealer's `CharacterDef.weaponType` equals it. */
  weaponTypeTerm?: ApexSecondaryWeaponTypeTerm;
  /** Term applied when the hit exploits a weakness (phase OR ammo — see `Weak` formula). */
  weaknessExploitValue?: number;
}

/**
 * APEX COMPONENT definition (2026). Apex Components live in the Apex Chassis (up to 2 equipped per
 * scenario, at most ONE per `type`). Data is REUSABLE registry definitions, NOT embedded per doll.
 */
export interface ApexComponentDef {
  id: string;
  name: string;
  /**
   * The component TYPE (one of the 7, matching the 7 weapon types). Only ONE component of a given
   * type may be equipped at a time, regardless of tier.
   */
  type: WeaponType;
  /** Tier I–IV (roman numerals in-game). Tier III/IV grant ATK%/HP%/DEF%/All-Element Boost. */
  tier: 1 | 2 | 3 | 4;
  /** Max enhancement level (duplicates combine up to 5 times → Enhance 1..6). */
  maxEnhancement: number;
  /**
   * BASE stat grants at Enhance 1 (before the per-enhancement increment). Enhance N adds
   * `(N-1) × statIncrement`.
   */
  stats: ApexComponentStats;
  /** Per-enhancement increment applied to each stat (Tier III: 0.1% / +5; Tier IV: 0.2% / +10). */
  statIncrement: ApexComponentStats;
  secondaryEffect?: ApexComponentSecondaryEffect;
  verified: boolean;
}

/** One equipped Apex Component: the component id + its enhancement level (1..maxEnhancement). */
export interface EquippedApexComponent {
  componentId: string;
  /** Enhancement level (1 = base). Must be an integer in 1..the component's `maxEnhancement`. */
  enhancement: number;
}

/**
 * APEX CHASSIS configuration (2026) — SCENARIO-LEVEL (account-wide): the guide states Apex
 * Components are set on the HOC Formation and their stat bonuses apply to the dolls regardless of
 * the map, so one chassis serves the whole team. Up to 2 components, at most one per type.
 */
export interface ApexChassisConfig {
  components?: EquippedApexComponent[];
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
  /**
   * APEX CHASSIS (2026, Heavy Ordnance Corps — the ONE adapted part): SCENARIO-LEVEL (account-wide)
   * equipped Apex Components. Their always-on ATK%/HP%/DEF% apply to every team member, and their
   * secondary effects enter the existing DMG% dealt bucket. Absent = no Apex Chassis.
   */
  apexChassis?: ApexChassisConfig;
  /**
   * PER-ROUND ACTION ORDER (2026): optional map round → team character ids in the exact order
   * they act that round. Absent ⇒ the team (member) order is used every round. When present,
   * every entry must list every team member EXACTLY once (a permutation) — missing/duplicate
   * members are rejected with a clear error (no implicit skip; Pass is not a feature).
   */
  roundOrder?: Record<number, string[]>;
  /**
   * PATTERN REMOLDER (2026): GLOBAL buff definitions available to this scenario's team.
   * Production values are populated from source material later; engine tests inject synthetic
   * definitions here. Shared across all characters (single table, not per-character).
   */
  remolderBuffSet?: RemolderBuffDef[];
}