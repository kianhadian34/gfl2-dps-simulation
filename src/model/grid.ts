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

/**
 * ELEMENTAL TILE EFFECT (2026, M1 — storage/identity ONLY; no rules yet).
 *
 * A **runtime** per-tile record: which element(s) the tile carries and how long it lasts. Sparse —
 * a tile with no entry is plain terrain. The tile RULES (generation, upgrade, fusion, triggers) are
 * owned by `docs/research.md` §3.23 and planned in `docs/tiles.md` (slices T3+); this type only
 * gives them somewhere to live.
 *
 * `elements` is a LIST, not a single element: a base tile has one, a **fusion tile** has two, and
 * fusion tiles are explicitly NOT overwritten by a third element (`§3.23.1`) — so "the last element
 * wins" is wrong and an element SET is required. The tile's display NAME is derived from
 * (element set, level) elsewhere, deliberately: the source names are CN-only and "subject to
 * change", so they stay OUT of the engine's data model.
 *
 * `level` is the Tile-Upgrade stage (Base → Lv2 → Lv3, §3.23.1). Values above 3 are not modeled.
 *
 * DURATION IS TWO SEPARATE VALUES — the RULE (project owner, 2026-10-10):
 *  - `initialRounds` — the duration a tile gets when it is FIRST created at a position.
 *  - `resetRounds`  — the duration every SUBSEQUENT tile effect added at that position resets it to.
 *
 * The full rule, as stated by the project owner:
 *   1. The first tile created at a position uses its **initial generation duration** (2 turns).
 *   2. Whenever ANOTHER tile effect is added at that same position, the tile **upgrades by one
 *      level** (up to Level 3) and its duration **resets to 3 turns**.
 *   3. Further additions to a **Level 3** tile do NOT increase its level, but STILL reset its
 *      duration to 3 turns.
 *
 * This is NOT a conflict between two sources — the two values describe two different EVENTS
 * (first creation vs subsequent interaction), which is exactly why they are two fields and must
 * never be collapsed into one. The upgrade/level mechanics themselves are slices T5/T7
 * (`docs/tiles.md`); this type only stores the values they consume.
 */
export interface TileEffect {
  /** 1 element = a base tile; 2 = a fusion tile. Order is not significant. */
  elements: Element[];
  /** Tile-Upgrade stage: 1 (base) → 2 → 3. Further additions at 3 do NOT increase it. */
  level: 1 | 2 | 3;
  /** Rounds remaining for this tile; ticks down and removes the entry at 0 (lifecycle: T4). */
  durationLeft: number;
  /** Duration when the tile is FIRST created at a position (rule step 1: 2 turns). */
  initialRounds: number;
  /** Duration every SUBSEQUENT tile effect resets it to (rule steps 2–3: 3 turns, level-capped or not). */
  resetRounds: number;
  /**
   * Which side the tile debuffs, set by whichever unit LAST generated onto it:
   * `"allied"` (debuffs enemies) / `"enemy"` (debuffs allies) / `"neutral"` (debuffs everyone).
   * The engine currently has no enemy generator, so only `"allied"` is reachable in the MVP — the
   * other two are modeled because the rule is unconditional (§3.23.1) and versioning is T6.
   */
  version: "allied" | "enemy" | "neutral";
  /** The unitId that generated onto this tile last (drives `version` and provenance). */
  generatedBy: string;
}

export interface GridConfig {
  size: number; // must be exactly 15
  units: UnitPlacement[];
  boss: BossPlacement;
  /**
   * Additional single-tile ENEMY targets on the grid — LINE-ATTACK PROPS (Fixed Key 4: Point of
   * Vulnerability; the MVP training dummy is the boss enemy). Each is a 1×1 enemy placed at a tile
   * and hit by cardinal line attacks only.
   *
   * They are **props, not combatants** (2026): the engine reads ONLY their POSITION, `defense` and
   * `weaknesses` — enough to resolve a hit. There is **no HP tracking, no stability, no death and
   * no removal**: a line enemy can never be damaged to 0 or break, so no such fields exist. They DO
   * carry statuses (per-enemy `GridState.enemyStatuses`, e.g. a secondary Guide target receiving
   * Overburn) — the earlier "no statuses" note here was stale and is corrected.
   *
   * Making them real combatants (HP/death/stability) is a recorded, deferred gap — it is also what
   * blocks holder-side area targeting (`docs/research.md` §3.33; `docs/dolls/vector.md` G14/G15).
   */
  enemyUnits?: Array<{
    unitId: string;
    coord: GridCoord;
    /** Per-enemy DEF for the hit (each line target has its own). */
    defense: number;
    /** Per-enemy element weaknesses (the hit's own weakness multiplier). */
    weaknesses?: Element[];
  }>;
  /** Terrain: tiles elevated to High Ground (default Ground). */
  highTiles?: GridCoord[];
  ladders?: LadderSpec[];
  blockedTiles?: BlockedTile[];
  /** Optional per-round scripted movements (validated against the grid). */
  moves?: GridMove[];
}