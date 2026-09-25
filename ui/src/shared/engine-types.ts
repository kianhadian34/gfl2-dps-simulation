/**
 * Structural mirrors of the ENGINE contract (src/model/types.ts, src/model/runtime.ts,
 * src/model/grid.ts). These describe the JSON shapes that cross the IPC boundary.
 * They are presentation-side view types ONLY — the engine remains the single source of
 * behavior. Keep in sync with src/model/* when the engine contract changes.
 */

export type Element = "burn" | "hydro" | "freeze" | "electric" | "corrosion";
export type ActionSlot = "basic" | "active1" | "active2" | "ultimate";
export type SourceKind = "basic" | "active" | "ultimate" | "passive" | "status" | "dummy";

export interface StatusApplySpecView {
  statusId: string;
  durationRounds?: number;
  stacks?: number;
  target?: "self" | "target";
  source?: string;
  applier?: { id: string; atk: number };
}

export interface DummyConfigView {
  id: string;
  name: string;
  hp: number;
  defense: number;
  stability: number;
  weaknesses: Element[];
  weaknessTags?: string[];
  phase: Element | null;
  cover: "none";
  passives?: Array<{ id: string; name: string; effects: unknown[] }>;
}

export interface ScenarioTeamMemberView {
  characterId: string;
  rotation: ActionSlot[];
  /** Fixed Keys — ids only; resolved + validated by the engine (existing representation preserved). */
  equippedFixedKeys?: string[];
  /** Equipped Affinity Key (bond) — its OWNER decides which bonus applies (engine `affinityKeyId`). */
  affinityKeyId?: string;
  /** The doll's Affinity Level with the equipped key (exact levels only; engine-defined). */
  affinityLevel?: number;
  /** Equipped Common Key ids — up to `maxCommonKeys` (3); fewer valid; engine-enforced. */
  commonKeyIds?: string[];
  /** Equipped weapon id (1 Weapon Slot) — resolved via the engine weapon registry (never duplicated here). */
  weaponId?: string;
  /** Calibration level of the EQUIPPED weapon (C1–C6 = 1–6); engine-validated. */
  calibrationLevel?: number;
  /** Equipped Expansion Key id (e.g. Qiongjiu's Ruined Gem). */
  expansionKeyId?: string;
  /** DEBUG/controlled-testing (2026): per-member replacement of the character's OWN base stats
   *  (applied BEFORE weapon/equipment/stat-modifier calculation; engine-validated, never clamped). */
  baseStatOverrides?: {
    atk?: number;
    hp?: number;
    def?: number;
    stability?: number;
    critRate?: number;
    critDmg?: number;
  };
}

export interface GridCoordView {
  x: number;
  y: number;
}

/** Engine-sourced weapon listing (built in main from src/data/weapons.ts — never duplicated here). */
/** Engine-sourced per-calibration Effect values (WeaponDef.calibrations — the data that actually changes with C1–C6). */
export interface WeaponCalibrationEffectView {
  damageDealt?: number;
  charging?: { perStackValue: number; maxStacks: number; stacksPerGain?: number };
}

export interface WeaponView {
  id: string;
  name: string;
  rarity: string;
  /** Max-level weapon ATK (lvl60) — calibration-independent (calibration changes ONLY the Effect). */
  atkLvl60: number;
  /** Weapon sub-stats (e.g. Attack Boost +15% = pctAtk 0.15) — authoritative WeaponDef data, calibration-independent. */
  subStats: Array<{ stat: "pctAtk" | "pctHp" | "pctDef"; value: number }>;
  /** Signature owner (owner-gated mechanics, e.g. the Imprint) — engine data. */
  ownerCharacterId?: string;
  /** Valid calibration levels (C1–C6 = 1–6) as engine-sourced numbers, ascending. */
  calibrations: number[];
  /** Per-calibration Effect values (C1–C6) — the numbers that DO change with the selected calibration. */
  calibrationEffects: Record<number, WeaponCalibrationEffectView>;
}

/** Engine-sourced Common Key listing (src/data/common-keys.ts — never duplicated here). */
export interface CommonKeyView {
  id: string;
  name: string;
  /** Character association (data-only; absent = generic key). */
  characterScope?: string;
  /** Stat block — exactly the fields the key grants (engine `CommonKeyDef.stats`, data-driven; absent = none). */
  stats?: { atkPct?: number; critRate?: number; critDmg?: number; outOfTurnDmg?: number };
  /** Secondary-effect description (engine `CommonKeyDef.secondaryEffect.description`; absent = none). */
  secondaryEffect?: string;
}

export interface CommonKeyListResult {
  items: CommonKeyView[];
  /** Engine-enforced 3-ClKey-Slot maximum (src/model/types.ts MAX_COMMON_KEYS). */
  maxCommonKeys: number;
}

/** Engine-sourced per-character key/member metadata (extends the legacy listCharacters shape). */
export interface FixedKeyView {
  id: string;
  name: string;
  /** Authoritative Fixed Key number — derived from the engine data id (`qiongjiu_fk<N>_…`). Absent when the id carries no number. */
  number?: number;
  /** Authoritative in-game tooltip text (engine `KeyDef.description`). Absent when the key data has none. */
  description?: string;
}
/** Engine-sourced initial base stats for DEBUG MODE (CharacterDef.base — NOT derived panel stats). */
export interface BaseStatsView {
  atk: number;
  hp: number;
  def: number;
  stability: number;
  critRate: number;
  critDmg: number;
}
/** Engine-sourced Affinity Key metadata (levels/generic bonus are the authoritative stat data). */
export interface AffinityKeyView {
  id: string;
  name: string;
  /** Exact affinity levels → stat block (engine `AffinityKeyDef.levels`; only recorded levels exist). */
  levels?: Record<number, { critDmg?: number; atk?: number; hp?: number }>;
  /** Foreign-key generic bonus (engine `genericBonus`; absent = none recorded). */
  genericBonus?: { atk?: number; hp?: number };
}

/** Engine-sourced Expansion Key metadata (its recorded tooltip is the effect source). */
export interface ExpansionKeyView {
  id: string;
  name: string;
  /** Authoritative in-game description (engine `KeyDef.description`); absent when the key has none. */
  description?: string;
}

export interface CharacterMetaView {
  id: string;
  name: string;
  mobility?: number;
  /** The character's OWN CharacterDef.base — DEBUG MODE initial values only (never panel/equipment-modified). */
  base?: BaseStatsView;
  /** Character's Fixed Keys (id + name + authoritative number/description) — selections are validated by the engine. */
  fixedKeys?: FixedKeyView[];
  /** Character's Expansion Key (e.g. Ruined Gem), when defined. */
  expansionKey?: ExpansionKeyView;
  /** Character's Affinity Key (bond), when defined. */
  affinityKey?: AffinityKeyView;
  /** STANDALONE character Affinity-LEVEL stat bonuses (engine `CharacterDef.affinityLevelStats` — exact
   *  level map; Lv5 = none, Lv9 = ATK/HP/DEF +5%). Independent of the equipped Affinity Key. */
  affinityLevelStats?: Record<number, { atkPct?: number; hpPct?: number; defPct?: number }>;
  /** Rotation abilities (engine `CharacterDef.skills` — basic/active1/active2/ultimate), used to show
   *  each ability's artwork + name in the Rotation builder. */
  skills?: { basic?: RotationSkillView; active1?: RotationSkillView; active2?: RotationSkillView; ultimate?: RotationSkillView };
}

/** Engine-sourced ability metadata for one rotation slot (the skill id feeds the asset resolver). */
export interface RotationSkillView {
  id: string;
  name: string;
}

export type TileHeight = "ground" | "high";

export interface UnitPlacementView {
  unitId: string;
  coord: GridCoordView;
  height?: TileHeight;
}

export interface BossPlacementView {
  center: GridCoordView;
  footprintSide: 1 | 3;
  height?: TileHeight;
}

export interface LadderView {
  ground: GridCoordView;
  high: GridCoordView;
}

export interface GridMoveView {
  unitId: string;
  round: number;
  to: GridCoordView;
  endTurnWithoutAction?: boolean;
}

export interface GridConfigView {
  size: number;
  units: UnitPlacementView[];
  boss: BossPlacementView;
  /** Additional single-tile enemy line targets (Fixed Key 4: Point of Vulnerability). */
  enemyUnits?: Array<{ unitId: string; coord: GridCoordView; hp: number; defense: number; stability: number; weaknesses?: Element[]; weaknessTags?: string[] }>;
  highTiles?: GridCoordView[];
  ladders?: LadderView[];
  blockedTiles?: { coord: GridCoordView }[];
  moves?: GridMoveView[];
}

export interface ScenarioView {
  version: number;
  seed: number;
  turns: number;
  team: ScenarioTeamMemberView[];
  dummy: DummyConfigView;
  grid?: GridConfigView;
  configOverrides?: Record<string, unknown>;
}

/** Full LogEvent mirror — the log window exposes EVERY field the engine emits. */
export interface LogEventView {
  round: number;
  turn: number;
  unit: string;
  action: string;
  actionType: "basic" | "active" | "ultimate" | "support" | "status_tick";
  target: string;
  source: SourceKind;
  supportAttack: boolean;
  baseDamage?: number;
  mitigatedDamage?: number;
  attackerAtk?: number;
  targetDef?: number;
  critical?: boolean;
  critMultiplier?: number;
  weaknessExploited: string[];
  phaseMult: number;
  bonusBracket: number;
  reductionMult: number;
  stabilityDamage?: number;
  targetStabilityAfter?: number;
  exposed?: boolean;
  finalDamage: number;
  killingBlow?: boolean;
  confectance?: { before: number; after: number; cost: number };
  cooldownAfter: Record<string, number>;
  statusesApplied: string[];
  appliedSources?: { statusId: string; source: string }[];
  effectSources?: string[];
  /** STRUCTURED provenance (2026): one ref per `effectSources` entry, label-aligned; mirrors the engine `EffectSourceRef` union. */
  effectSourceRefs?: EffectSourceRefView[];
  statusesExpired: string[];
  /** Fixed Key 4: 0-based Guide line position (0 = first/primary). */
  guideLineIndex?: number;
  /** Fixed Key 4: Guide line target after the first (70% of its normal damage). */
  guideLineSecondary?: boolean;
  upgradeStacks?: { statusId: string; stacks: number }[];
  statusTick?: { statusId: string; amount: number };
  fixedDamage?: number;
}

export interface SimulationResultView {
  seed: number;
  turns: number;
  totals: { damage: number; damagePerRound: number; damagePerAction: number; actions: number };
  byCharacter: Array<{ id: string; damage: number; actions: number }>;
  bySource: Array<{ source: string; damage: number; actions: number }>;
  warnings: string[];
  log: LogEventView[];
}

/** Engine-computed movement facts (computed in Electron main via src/engine/grid.ts only). */
export interface MovementFactView {
  round: number;
  unitId: string;
  from: GridCoordView;
  to: GridCoordView;
  cost: number;
  endTurnWithoutAction?: boolean;
}

/** Engine-computed grid facts (built in main via src/engine/grid.ts — renderer performs NO grid math). */
export interface GridCellFactsView {
  /** "x,y" -> tile facts */
  cells: Record<string, { height: TileHeight; blocked: boolean; boss: boolean }>;
  tokens: Array<{ unitId: string; coord: GridCoordView; height: TileHeight }>;
  bossCenter: GridCoordView;
  bossFootprintSide: 1 | 3;
  ladders: Array<{ ground: GridCoordView; high: GridCoordView }>;
  size: number;
}

export interface StatusInfoView {
  id: string;
  name: string;
  category: string;
  /** PLAYER-FACING tooltip text only (engine `playerDescription`). The internal `note` field is never shipped. */
  description?: string;
  durationRounds: number | null;
  stackable: boolean;
  maxStacks?: number;
  purgeable: boolean;
  /** Consumption-of-use status: each qualifying use consumes ONE stack (stacks = activations). */
  consumeOneOnUse?: boolean;
}

export interface SessionView {
  runId: string;
  scenario: ScenarioView;
  result: SimulationResultView;
  movements: MovementFactView[];
  facts: GridCellFactsView | null;
  /** Authoritative status catalog (built in main from the engine registry) for hover tooltips. */
  statuses?: Record<string, StatusInfoView>;
  /** Effect-source definition catalog (built in main from the engine registry) for the effect-source tooltips. */
  effectSourceCatalog?: Record<string, EffectSourceInfoView>;
}

/** Mirrors the engine `EffectSourceRef` discriminated union (see src/model/types.ts). */
export type EffectSourceRefView =
  | { kind: "status"; statusId: string; label: string }
  | { kind: "passive"; characterId: string; passiveId: string; level: number; v?: number; label: string }
  | { kind: "ability"; characterId: string; abilityId: string; slot: string; level: number; v?: number; label: string }
  | { kind: "target"; label: string };

/** Resolved player-facing definition behind an effect-source ref. */
export interface EffectSourceInfoView {
  name: string;
  /** Clean player-facing description when the definition provides one (playerDescription). */
  description?: string;
}