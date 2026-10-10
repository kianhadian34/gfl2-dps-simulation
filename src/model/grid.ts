/**
 * GRID / POSITIONING — core spatial data model (2026).
 *
 * The 15×15 battlefield is the entire playable area; boundaries are impassable.
 * This module ONLY provides spatial facts (position, distance, occupancy, height,
 * movement legality). It performs NO combat logic — damage/effects/triggers stay in
 * the existing engine, which consumes these facts.
 *
 * Evidence statuses (exactly one of Validated / Mathematically Proven / Not Tested):
 *  - All grid/distance/movement/height/ladder items here are recorded in docs/grid.md;
 *    direct in-game observations = Validated; derived arithmetic = Mathematically
 *    Proven; everything below marked UNRESOLVED is Not Tested and deliberately unimplemented.
 */

/** 15×15 battlefield. */
export const GRID_SIZE = 15;

import type { Element } from "./types.js";

export interface GridCoord {
  x: number;
  y: number;
}

export type TileHeight = "ground" | "high";

/** Exactly two height levels (confirmed); ground is default. */
export const TILE_HEIGHTS: TileHeight[] = ["ground", "high"];

/**
 * AREA SHAPE (2026) — the tile-shape vocabulary an area/radius effect selects on. TWO shape
 * FAMILIES exist, because the game uses two different metrics and the source text reflects both:
 *
 * - `"manhattan"` / a DIAMOND — tiles whose Manhattan distance (|dx|+|dy|) is ≤ `radius`. At
 *   `radius: 1` this is the origin plus the 4 ORTHOGONAL neighbours (5 tiles).
 * - `"square"` / a CHEBYSHEV block — tiles whose Chebyshev distance (max(|dx|,|dy|)) is ≤
 *   `radius`. At `radius: 1` this is a full **3×3** block (9 tiles).
 *
 * WHICH ONE TO USE IS DECIDED BY THE SOURCE WORDING (resolved 2026 from the game's own range-map
 * targeting diagrams; `docs/research.md` §3.32):
 *   - numeric areas — *"within N tiles"*, *"N-tile radius"*, *"N-tile area"* ⇒ **`manhattan`**
 *   - `NxN` areas — *"3×3"*, *"9×9"* ⇒ **`square`**
 * This is a documented default backed by direct UI evidence, but its provenance is a community
 * database, so the strict project state remains **Not Tested** pending our own in-game check.
 *
 * Only these two shapes are modeled — do not invent others.
 */
export type AreaShape = "manhattan" | "square";

/** The area shapes the engine models (Manhattan diamond, Chebyshev square). */
export const AREA_SHAPES: AreaShape[] = ["manhattan", "square"];

/**
 * A ladder connects a ground tile to an adjacent high-ground tile. Being on a tile
 * adjacent (Manhattan 1) to the ground end lets a unit climb at cost 1 Mobility.
 * Only this confirmed ladder behavior is modeled (Not Tested: any additional ladder
 * rules — do not invent).
 */
export interface LadderSpec {
  ground: GridCoord;
  high: GridCoord;
}

/**
 * Placement of a single unit (doll) on the grid. Normal units occupy 1×1 tiles.
 * Only high-ground access via a ladder end is confirmed; tile height is derived from
 * the configured tile/height owner.
 */
export interface UnitPlacement {
  unitId: string;
  coord: GridCoord;
  /** Height of the tile the unit stands on ("ground" default). */
  height?: TileHeight;
}

/** Boss (dummy) placement: stationary, normally 3×3 with a center tile. */
export interface BossPlacement {
  /** Center tile of the boss footprint (range calculations use the center). */
  center: GridCoord;
  /** Footprint side length; the MVP supports 1×1 and the confirmed 3×3 boss. */
  footprintSide: 1 | 3;
  height?: TileHeight;
}

/**
 * Impassable tiles (terrain only — enemy/boss tiles are und a separate occupancy
 * constraint handled by the grid builder).
 */
export interface BlockedTile {
  coord: GridCoord;
}

/**
 * Scripted movement sequence (deterministic, NO movement AI): one optional move per
 * unit per round, applied BEFORE that unit's main action. Action → move is impossible
 * by construction (moves are only ever applied pre-action). A unit may move and then
 * voluntarily end its turn without acting (endTurnWithoutAction).
 */
export interface GridMove {
  unitId: string;
  round: number;
  to: GridCoord;
  endTurnWithoutAction?: boolean;
}

export interface GridConfig {
  size: number; // must be exactly 15
  units: UnitPlacement[];
  boss: BossPlacement;
  /**
   * Additional single-tile ENEMY targets on the grid (Fixed Key 4: Point of Vulnerability line
   * validation; MVP the training dummy is the boss enemy). Each is a 1×1 enemy with its own
   * DEF/stability/element weaknesses — hit by line attacks only; no statuses, no AWU.
   */
  enemyUnits?: Array<{
    unitId: string;
    coord: GridCoord;
    hp: number;
    defense: number;
    stability: number;
    weaknesses?: Element[];
    weaknessTags?: string[];
  }>;
  /** Terrain: tiles elevated to High Ground (default Ground). */
  highTiles?: GridCoord[];
  ladders?: LadderSpec[];
  blockedTiles?: BlockedTile[];
  /** Optional per-round scripted movements (validated against the grid). */
  moves?: GridMove[];
}