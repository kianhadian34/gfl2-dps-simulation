/**
 * Structural mirrors of the ENGINE contract (src/model/types.ts, src/model/runtime.ts,
 * src/model/grid.ts). These describe the JSON shapes that cross the IPC boundary.
 * They are presentation-side view types ONLY — the engine remains the single source of
 * behavior. Keep in sync with src/model/* when the engine contract changes.
 */

export type Element = "physical" | "burn" | "electric" | "ice" | "acid" | "decay";
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
  statusesExpired: string[];
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
  note?: string;
  durationRounds: number | null;
  stackable: boolean;
  maxStacks?: number;
  purgeable: boolean;
}

export interface SessionView {
  runId: string;
  scenario: ScenarioView;
  result: SimulationResultView;
  movements: MovementFactView[];
  facts: GridCellFactsView | null;
  /** Authoritative status catalog (built in main from the engine registry) for hover tooltips. */
  statuses?: Record<string, StatusInfoView>;
}