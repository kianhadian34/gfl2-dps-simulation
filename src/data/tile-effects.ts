import type { Element } from "../model/types.js";

/**
 * TILE-EFFECT DATA TABLE (2026, T8/M8) — which STATUSES a tile applies to a unit standing on it.
 *
 * This is **DATA**, deliberately separate from the tile RULES (`engine/tiles.ts`, which owns
 * generation/upgrade/fusion/versioning/lifecycle). The rules are generic and element-only; *what a
 * Burn tile debuffs you with* is source content, so it lives here and is keyed by the tile's
 * **element set + level** exactly as the tile stores them.
 *
 * ## What this table does NOT do
 * - It does **not** define the statuses. Every entry references a status that must already exist in
 *   `src/data/statuses.ts`, and `applyStatus` THROWS on an unknown id — deliberately, so a missing
 *   definition can never silently no-op.
 * - It does **not** cover the whole game. Only the Burn tile is recorded, because that is the only
 *   tile whose APPLIED STATUSES the repo has evidence for. **`overburn` is the only one of the ten
 *   named tile-effect statuses that exists in the engine**; the other nine (Conflagration,
 *   Combustion, Combustion II, Stability Loss I, Frozen, Damp, Paralysis, Congestion, Meltdown) are
 *   **undefined** — a recorded gap owned by slice **T11** (`docs/tiles.md`).
 *
 * ## Evidence status — [SOURCE], Not Tested
 * The applied-status sets below are transcribed from the community guide's Burn tile text (§3.23.3):
 *   - Lv1 Incineration: *"Applies Overburn and Conflagration to enemy units that remain on the area
 *     after ending their action, lasting 2 turns."*
 *   - Lv2 Flashover II: adds **Combustion**.
 *   - Lv3 Flashover III: **Combustion II** replaces Combustion (+ the self-propagation clause).
 * Because 8 of the 10 named statuses are undefined, the recorded sets list ONLY the statuses that
 * actually exist today (`overburn`), and the omitted ones are named in `pendingStatusIds` so the gap
 * is explicit and machine-visible rather than silently dropped. **Nothing is invented.**
 *
 * The fusion tiles' applied-status sets (Scalding Vapors → Damp, Venomfire → Stability Loss I,
 * Smoldering Suspire → Frozen, …) are likewise **not** recorded yet — every one of them needs an
 * undefined status, and their pair membership is already in `research.md` §3.23.4. They are recorded
 * as a gap too, NOT as "no such effects".
 */

/** One status a tile applies, and for how many rounds. */
export interface TileAppliedStatus {
  statusId: string;
  /** Duration in rounds, as the source states it (*"lasting 2 turns"*). */
  durationRounds: number;
}

/** The effects a given tile applies to a unit that qualifies for the tile's trigger. */
export interface TileEffectData {
  /**
   * Statuses applied to a qualifying unit. Contains ONLY statuses that exist in the engine — the
   * rest are named in `pendingStatusIds`.
   */
  applies: TileAppliedStatus[];
  /**
   * Statuses the SOURCE says this tile applies but which are **not defined in the engine yet**
   * (slice T11). Recorded so the gap is explicit; these are never applied (applying one would throw).
   */
  pendingStatusIds: string[];
}

const BURN_TILE_LV1: TileEffectData = {
  // Source: "Applies Overburn and Conflagration ... lasting 2 turns." Conflagration is undefined.
  applies: [{ statusId: "overburn", durationRounds: 2 }],
  pendingStatusIds: ["conflagration"],
};

const BURN_TILE_LV2: TileEffectData = {
  // Source: Lv1 + Combustion. Both Conflagration and Combustion are undefined.
  applies: [{ statusId: "overburn", durationRounds: 2 }],
  pendingStatusIds: ["conflagration", "combustion"],
};

const BURN_TILE_LV3: TileEffectData = {
  // Source: Conflagration + Combustion II. Both undefined. (Flashover III's every-3-Burn-damage
  // self-propagation clause is trigger (c), which is NOT implemented — see docs/tiles.md §10.)
  applies: [{ statusId: "overburn", durationRounds: 2 }],
  pendingStatusIds: ["conflagration", "combustion_ii"],
};

/**
 * The recorded tile-effect sets, keyed by the tile's element set **canonicalised** (elements sorted,
 * joined by `+`) and its LEVEL. A tile whose key is absent applies **nothing** — an honest "no data"
 * rather than a guess, which is the state of every fusion tile today.
 */
const TILE_EFFECTS: Record<string, TileEffectData> = {
  "burn:1": BURN_TILE_LV1,
  "burn:2": BURN_TILE_LV2,
  "burn:3": BURN_TILE_LV3,
};

/** Canonical key: element set (order-insensitive, matching `TileEffect.elements`) + level. */
export function tileEffectKey(elements: Element[], level: number): string {
  return `${[...elements].sort().join("+")}:${level}`;
}

/**
 * The effects a tile applies, or `undefined` when the repo has recorded none for that
 * (element set, level). A caller must treat `undefined` as **"apply nothing"** — never as "invent
 * something". Fusion tiles and every non-Burn tile are in this state today.
 */
export function tileEffectsFor(elements: Element[], level: number): TileEffectData | undefined {
  return TILE_EFFECTS[tileEffectKey(elements, level)];
}
