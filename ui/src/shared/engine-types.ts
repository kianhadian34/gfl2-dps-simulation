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
  equippedFixedKeys?: string[];
}

export interface GridCoordView {
  x: number;
  y: number;
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