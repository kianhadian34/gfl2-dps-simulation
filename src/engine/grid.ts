/**
 * GRID — PURE spatial logic (2026). No combat logic lives here.
 *
 * Confirmed core rules (docs/grid.md):
 *  - 15×15 battlefield; boundaries impassable; one unit per tile.
 *  - Distance/range = Manhattan (|dx|+|dy|); skill range is a diamond.
 *  - Orthogonal movement = 1 Mobility, diagonal = 2 → cost ≡ Manhattan distance.
 *  - Allies may be crossed; enemy/boss/blocked tiles are impassable to movement.
 *  - Bosses are stationary, normally 3×3 with a center tile used for range.
 *  - Ladder access to High Ground costs 1 Mobility when adjacent.
 *  - High Ground → Ground target = Exposed. Ground → High Ground = UNRESOLVED (Not Tested, not implemented).
 *  - Corner-squeezing around obstacles is UNRESOLVED — modeled as plain 8-direction
 *    tiling, and the squeeze cases are NOT tested as known behavior.
 */

import {
  type ActiveStatus,
} from "../model/runtime.js";
import {
  type BossPlacement,
  type GridConfig,
  type GridCoord,
  type GridMove,
  GRID_SIZE,
  type TileHeight,
  type UnitPlacement,
} from "../model/grid.js";

export interface GridState {
  size: number;
  /** Tile height per coordinate; tiles without an owner default to "ground". */
  heights: Map<string, TileHeight>;
  /** Impassable terrain. */
  blocked: Set<string>;
  /** Enemy (boss) footprint tiles — impassable + not occupiable by units. */
  enemyTiles: Set<string>;
  /** Additional single-tile enemy targets (GridConfig.enemyUnits) — line-attack targets (FK4). */
  enemyUnits: NonNullable<GridConfig["enemyUnits"]>;
  /** Runtime per-enemy status store (FK4: secondary Guide targets receive Overburn via the generic system). */
  enemyStatuses: Map<string, ActiveStatus[]>;
  /** Occupied-by-ally tiles (1×1 units; crossed, never entered at the end). */
  allyTiles: Map<string, string>; // tileKey -> unitId
  placements: Map<string, UnitPlacement>; // unitId -> placement
  boss: BossPlacement;
  ladders: Map<string, { to: string }>; // from tileKey -> ladder edge (cost 1, both directions)
  /** Scripted per-round movements (deterministic; validated at application time). */
  moves: GridMove[];
}

export const tileKey = (x: number, y: number): string => `${x},${y}`;

export function inBounds(x: number, y: number, size = GRID_SIZE): boolean {
  return x >= 0 && y >= 0 && x < size && y < size;
}

export function manhattan(a: GridCoord, b: GridCoord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** Footprint tiles for a boss of side `side` centered at the given tile. */
export function bossFootprintTiles(center: GridCoord, side: 1 | 3): GridCoord[] {
  if (side === 1) return [{ x: center.x, y: center.y }];
  const tiles: GridCoord[] = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) tiles.push({ x: center.x + dx, y: center.y + dy });
  return tiles;
}

export function tileHeightAt(state: GridState, x: number, y: number): TileHeight {
  return state.heights.get(tileKey(x, y)) ?? "ground";
}

/** Distance between two units' range origins: unit tile for 1×1, boss CENTER tile for 3×3. */
export function unitDistance(a: GridCoord, b: GridCoord): number {
  return manhattan(a, b);
}

const ORTHO = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
const DIAG = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

function edgeCost(fromX: number, fromY: number, toX: number, toY: number, state: GridState): number {
  const ladder = state.ladders.get(tileKey(fromX, fromY));
  if (ladder && ladder.to === tileKey(toX, toY)) return 1; // using a ladder costs 1 (incl. descent, documented)
  return fromX !== toX && fromY !== toY ? 2 : 1; // diagonal 2, orthogonal 1
}

export function buildGrid(cfg: GridConfig): GridState {
  if (cfg.size !== GRID_SIZE) throw new Error(`grid size must be exactly ${GRID_SIZE} (got ${cfg.size})`);
  const state: GridState = {
    size: GRID_SIZE,
    heights: new Map(),
    blocked: new Set(),
    enemyTiles: new Set(),
    enemyUnits: cfg.enemyUnits ?? [],
    enemyStatuses: new Map((cfg.enemyUnits ?? []).map((u) => [u.unitId, [] as ActiveStatus[]])),
    allyTiles: new Map(),
    placements: new Map(),
    boss: cfg.boss,
    ladders: new Map(),
    moves: cfg.moves ?? [],
  };
  for (const e of state.enemyUnits) {
    if (!inBounds(e.coord.x, e.coord.y)) throw new Error(`enemy unit ${e.unitId} placed outside the grid`);
    state.enemyTiles.add(tileKey(e.coord.x, e.coord.y));
  }
  for (const u of cfg.units) {
    if (!inBounds(u.coord.x, u.coord.y)) throw new Error(`unit ${u.unitId} placed outside the grid`);
    state.placements.set(u.unitId, u);
    const k = tileKey(u.coord.x, u.coord.y);
    if (state.allyTiles.has(k)) throw new Error(`duplicate placement at ${k}`);
    state.allyTiles.set(k, u.unitId);
  }
  if (!inBounds(cfg.boss.center.x, cfg.boss.center.y)) throw new Error("boss center outside the grid");
  for (const t of bossFootprintTiles(cfg.boss.center, cfg.boss.footprintSide)) {
    const k = tileKey(t.x, t.y);
    if (!inBounds(t.x, t.y)) throw new Error("boss footprint exceeds grid boundaries");
    if (state.allyTiles.has(k)) throw new Error(`unit placed on the boss footprint (${t.x},${t.y}) — boss footprint is occupied/impassable terrain`);
    state.enemyTiles.add(k);
    state.heights.set(k, cfg.boss.height ?? "ground");
  }
  state.boss = cfg.boss;
  // Terrain heights come from `highTiles` (High Ground) — terrain property, not unit-derived.
  for (const t of cfg.highTiles ?? []) {
    if (!inBounds(t.x, t.y)) throw new Error("high tile outside the grid");
    state.heights.set(tileKey(t.x, t.y), "high");
  }
  for (const u of cfg.units) {
    const tileH = state.heights.get(tileKey(u.coord.x, u.coord.y)) ?? "ground";
    const unitH = u.height ?? "ground";
    if (tileH !== unitH) throw new Error(`unit ${u.unitId} height ${unitH} does not match tile height ${tileH} at (${u.coord.x},${u.coord.y})`);
  }
  for (const tile of cfg.blockedTiles ?? []) {
    if (!inBounds(tile.coord.x, tile.coord.y)) throw new Error("blocked tile outside the grid");
    state.blocked.add(tileKey(tile.coord.x, tile.coord.y));
  }
  for (const l of cfg.ladders ?? []) {
    if (manhattan(l.ground, l.high) !== 1) throw new Error("ladder ends must be adjacent (Manhattan 1)");
    const gk = tileKey(l.ground.x, l.ground.y);
    const hk = tileKey(l.high.x, l.high.y);
    if (tileHeightAt(state, l.ground.x, l.ground.y) === "high" || tileHeightAt(state, l.high.x, l.high.y) === "ground")
      throw new Error("ladder must connect a ground end to a high end");
    state.ladders.set(gk, { to: hk });
    state.ladders.set(hk, { to: gk });
  }
  state.moves = cfg.moves ?? [];
  return state;
}

const isImpassable = (state: GridState, x: number, y: number): boolean =>
  !inBounds(x, y, state.size) || state.blocked.has(tileKey(x, y)) || state.enemyTiles.has(tileKey(x, y));

/** All legal destinations within `mobility` from `from`. Ally tiles may be CROSSED but never entered. */
export function legalDestinations(state: GridState, from: GridCoord, mobility: number): Map<string, GridCoord> {
  const best = new Map<string, number>(); // tileKey -> cost
  const queue: { x: number; y: number; cost: number }[] = [{ x: from.x, y: from.y, cost: 0 }];
  best.set(tileKey(from.x, from.y), 0);
  while (queue.length) {
    const { x, y, cost } = queue.shift()!;
    const neighbors: { dx: number; dy: number }[] = [
      ...ORTHO.map(([dx, dy]) => ({ dx, dy })),
      ...DIAG.map(([dx, dy]) => ({ dx, dy })),
    ];
    for (const { dx, dy } of neighbors) {
      const nx = x + dx;
      const ny = y + dy;
      const nk = tileKey(nx, ny);
      if (isImpassable(state, nx, ny)) continue; // enemies/blocked/boundaries impassable (no squeeze modeling)
      const nc = cost + edgeCost(x, y, nx, ny, state);
      if (nc > mobility) continue;
      const prev = best.get(nk);
      if (prev !== undefined && prev <= nc) continue;
      best.set(nk, nc);
      queue.push({ x: nx, y: ny, cost: nc });
    }
  }
  const result = new Map<string, GridCoord>();
  for (const [k, cost] of best) {
    if (cost === 0) continue;
    if (state.allyTiles.has(k)) continue; // one unit per tile: occupied destination is illegal
    const [x, y] = k.split(",").map(Number);
    result.set(k, { x, y });
  }
  return result;
}

/** Shortest movement cost between two tiles (Infinity when unreachable). Movement ≡ Manhattan for legal routes. */
export function moveCost(state: GridState, from: GridCoord, to: GridCoord): number {
  const dests = legalDestinations(state, from, Infinity);
  const entry = dests.get(tileKey(to.x, to.y));
  return entry === undefined ? Infinity : manhattan(from, to);
}

/**
 * Confirmed height interaction: High Ground attacker vs Ground target → the target counts
 * as EXPOSED (its Stability protection does not apply for that attack). Same-height = none.
 * Ground → High Ground is UNRESOLVED / NOT TESTED → returns "none" (deliberately unimplemented).
 */
export function attackHeightEffect(attackerHeight: TileHeight, targetHeight: TileHeight): "exposed" | "none" {
  if (attackerHeight === "high" && targetHeight === "ground") return "exposed";
  return "none";
}

export type CardinalDirection = "up" | "down" | "left" | "right";

const CARDINAL_DELTA: Record<CardinalDirection, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

/** The four valid cardinal directions (Guide to Victory targeting, VALIDATED 2026). Diagonals are never valid. */
export const CARDINAL_DIRECTIONS = ["up", "down", "left", "right"] as const;

export function isCardinalDirection(d: string): d is CardinalDirection {
  return (CARDINAL_DIRECTIONS as readonly string[]).includes(d);
}

/**
 * GUIDE TO VICTORY targeting (VALIDATED 2026, screenshot + tooltip): trace up to
 * `effectiveArea` tiles from `from` along the cardinal `direction`; the FIRST enemy tile
 * encountered is the target (stop after the first enemy — never target enemies behind it).
 * Undefined when no enemy lies within the effective area (out-of-bounds also ends the ray).
 * Pure; diagonal directions are rejected defensively.
 */
export function resolveCardinalRayTarget(
  state: GridState,
  from: GridCoord,
  direction: CardinalDirection,
  effectiveArea: number,
): GridCoord | undefined {
  if (!isCardinalDirection(direction)) throw new Error(`invalid cardinal direction: ${String(direction)}`);
  const { dx, dy } = CARDINAL_DELTA[direction];
  for (let d = 1; d <= effectiveArea; d++) {
    const x = from.x + dx * d;
    const y = from.y + dy * d;
    if (!inBounds(x, y, state.size)) return undefined;
    if (state.enemyTiles.has(tileKey(x, y))) return { x, y };
  }
  return undefined;
}

/**
 * Fixed Key 4: Point of Vulnerability (VALIDATED in-game 2026) — the line CONTINUES through
 * enemies: collect EVERY enemy tile within `effectiveArea` tiles along the cardinal `direction`,
 * in ray order (nearest first). Diagonal directions are rejected defensively.
 */
export function resolveCardinalRayTargets(
  state: GridState,
  from: GridCoord,
  direction: CardinalDirection,
  effectiveArea: number,
): GridCoord[] {
  if (!isCardinalDirection(direction)) throw new Error(`invalid cardinal direction: ${String(direction)}`);
  const { dx, dy } = CARDINAL_DELTA[direction];
  const out: GridCoord[] = [];
  for (let d = 1; d <= effectiveArea; d++) {
    const x = from.x + dx * d;
    const y = from.y + dy * d;
    if (!inBounds(x, y, state.size)) break;
    if (state.enemyTiles.has(tileKey(x, y))) out.push({ x, y });
  }
  return out;
}