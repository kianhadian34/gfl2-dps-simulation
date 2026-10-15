import { areaTiles, tileKey, type GridState } from "./grid.js";
import type { AreaShape, GridCoord, TileEffect } from "../model/grid.js";
import type { Element } from "../model/types.js";

/**
 * ELEMENTAL TILES — runtime operations (2026, slices T3+).
 *
 * The split across files is deliberate:
 *  - `model/grid.ts` — the tile's shape/identity (`TileEffect`), a value type.
 *  - `engine/grid.ts` — the `GridState.tiles` storage (T1/M1) and the pure GEOMETRY tile rules are
 *    read through (areas, occupancy — T2/M2 and slice 9's `areaTiles`).
 *  - **this module** — the tile RULES that CHANGE that state. Generation today; lifecycle (T4),
 *    upgrade (T5), fusion (T7) and triggers (T8) next. It is the tile analogue of `stability.ts`.
 *
 * The RULES are `[SOURCE]` — a community guide, hierarchy level 5 — and are **Not Tested**
 * (`docs/research.md` §3.23). The feature's *existence* on global IS confirmed by the project owner
 * (2026, direct in-game evidence — hierarchy level 1), but that confirms only that the subsystem is
 * playable, NOT its rule values. Nothing here is `Validated`.
 *
 * **Slice boundary:** generation only (T3/M3). Upgrade, fusion, ticking/expiry and every trigger
 * are NOT here — a scope guard in the tests asserts that.
 */

/**
 * The two durations of the owner-stated duration RULE (2026-10-10; `TileEffect` doc, §3.23.1): a
 * tile is given `TILE_INITIAL_ROUNDS` when it is **FIRST created** at a position, and every
 * **SUBSEQUENT** tile effect added there resets it to `TILE_RESET_ROUNDS`.
 *
 * TWO values for TWO different EVENTS — never collapse them into one. Generation uses only the
 * first; the second is stored on the tile for the upgrade slices (T5/T7) to consume.
 */
export const TILE_INITIAL_ROUNDS = 2;
export const TILE_RESET_ROUNDS = 3;

/** A freshly generated tile is always the BASE stage (§3.23.1 Lv1); level-ups are T5/T7. */
export const TILE_BASE_LEVEL = 1;

/**
 * What to generate and where. The element set IS the tile's identity (`TileEffect.elements`): one
 * element is a base tile, two is a fusion tile.
 */
export interface TileGenerationSpec {
  /** Area origin — the tile the generating effect lands on (areas are origin-inclusive). */
  origin: GridCoord;
  /**
   * Area SHAPE. Per the resolved default (§3.32 / `docs/grid.md`): **numeric** areas
   * (*"within N tiles"*) ⇒ `manhattan` (diamond); **`NxN`** areas ⇒ `square` (Chebyshev block).
   * The choice is DATA per effect — the engine asserts neither.
   */
  shape: AreaShape;
  radius: number;
  /** The tile's element set — must be NON-EMPTY: 1 element = base tile, 2 = fusion tile. */
  elements: Element[];
  /** The `unitId` that generated the tile (provenance; drives `version` in T6). */
  generatedBy: string;
  /**
   * Which side the tile debuffs. Defaults to `"allied"` — the ONLY version reachable in the MVP
   * (there is no enemy generator; see `docs/tiles.md` non-goals). T6 models the other two.
   */
  version?: "allied" | "enemy" | "neutral";
}

/**
 * Generate (create) elemental tiles across the AREA of `spec`; return the tiles CREATED (a caller —
 * trigger (T8) or test — can then act on exactly what was added, not on what was already there).
 *
 * Every **in-bounds** tile of the area is generated on, with **NO terrain filter**: the source
 * restricts generation by nothing but the area, so no filter is invented (§7 decision 6 — whether
 * generation should skip impassable terrain / the boss footprint is **Not Tested**).
 *
 * A tile that **already** carries an effect is left **untouched**. That case is governed by the
 * *"another tile effect is added at that same position → upgrade one level + reset duration"* rule,
 * which is the **upgrade** slice (T5) — not generation. Leaving it alone here is the slice boundary,
 * pinned by a test, NOT an oversight. T3 never writes a tile twice.
 *
 * MUTATES `state.tiles` — tile effects are runtime state, exactly like `allyTiles` (which the
 * engine also mutates in place), so generation is a state transition, not a pure query.
 */
export function generateTiles(state: GridState, spec: TileGenerationSpec): GridCoord[] {
  if (spec.elements.length === 0) throw new Error("a tile must carry at least one element");
  const version = spec.version ?? "allied";
  const created: GridCoord[] = [];
  for (const tile of areaTiles(spec.origin, spec.shape, spec.radius, state.size)) {
    const key = tileKey(tile.x, tile.y);
    if (state.tiles.has(key)) continue; // occupied → the upgrade rule (T5), not generation
    const effect: TileEffect = {
      elements: [...spec.elements], // copy: the tile must not alias the caller's array
      level: TILE_BASE_LEVEL,
      durationLeft: TILE_INITIAL_ROUNDS,
      initialRounds: TILE_INITIAL_ROUNDS,
      resetRounds: TILE_RESET_ROUNDS,
      version,
      generatedBy: spec.generatedBy,
    };
    state.tiles.set(key, effect);
    created.push(tile);
  }
  return created;
}
