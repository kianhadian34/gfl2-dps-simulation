import { areaTiles, tilesOccupiedBy, tileKey, type GridState } from "./grid.js";
import { applyStatus } from "./statuses.js";
import { tileEffectsFor, tileEffectKey } from "../data/tile-effects.js";
import type { AreaShape, GridCoord, TileEffect, TileOccupant, TileVersion } from "../model/grid.js";
import type { SimulationState, UnitState } from "./state.js";
import type { Element, KeyDef } from "../model/types.js";

/**
 * ELEMENTAL TILES — runtime operations (2026, slices T3+).
 *
 * The split across files is deliberate:
 *  - `model/grid.ts` — the tile's shape/identity (`TileEffect`), a value type.
 *  - `engine/grid.ts` — the `GridState.tiles` storage (T1/M1) and the pure GEOMETRY tile rules are
 *    read through (areas, occupancy — T2/M2 and slice 9's `areaTiles`).
 *  - **this module** — the tile RULES that CHANGE that state. Generation + upgrade + fusion (T3/T5),
 *    the lifecycle clock (T4) and versioning (T6); the triggers (T8) next. It is the tile analogue of
 *    `stability.ts`.
 *
 * The RULES are `[SOURCE]` — a community guide, hierarchy level 5 — and are **Not Tested**
 * (`docs/research.md` §3.23). The feature's *existence* on global IS confirmed by the project owner
 * (2026, direct in-game evidence — hierarchy level 1), but that confirms only that the subsystem is
 * playable, NOT its rule values. Nothing here is `Validated`.
 *
 * **Slice boundary:** generation, upgrade/fusion (T3 + T5), the lifecycle clock (T4) and version
 * DERIVATION (T6). What a version DOES — which units a tile's effects actually land on — belongs to
 * the trigger slices (T8/T9), so T6 determines the label and stops there.
 */

/**
 * The two durations of the owner-stated duration RULE (2026-10-10; `TileEffect` doc, §3.23.1): a
 * tile is given `TILE_INITIAL_ROUNDS` when it is **FIRST created** at a position, and every
 * **SUBSEQUENT** tile effect added there resets it to `TILE_RESET_ROUNDS`.
 *
 * TWO values for TWO different EVENTS — never collapse them into one. Generation uses only the
 * first; the second is stored on the tile for the upgrade/fusion paths to consume.
 *
 * DECLARED in `model/grid.ts` (so `buildGrid` can seed scripted tiles without an import cycle) and
 * RE-EXPORTED here, where the tile RULES live and document them.
 */
export { TILE_INITIAL_ROUNDS, TILE_RESET_ROUNDS } from "../model/grid.js";
import { TILE_INITIAL_ROUNDS, TILE_RESET_ROUNDS } from "../model/grid.js";

/** A freshly generated tile is always the BASE stage (§3.23.1 Lv1); level-ups are T5/T7. */
export const TILE_BASE_LEVEL = 1;

/** The highest Tile-Upgrade stage (§3.23.1: Base → Lv2 → Lv3; further additions only refresh). */
export const TILE_MAX_LEVEL = 3;

/**
 * POLYPHASE FUSION PAIRS (T5, 2026) — the base-element pairs that FUSE when generated onto the same
 * tile. **Evidence: the guide's own "Polyphase Fusion List"**, transcribed from the source
 * (`docs/research.md` §3.23.4). All five phases participate; **8 pairs are fusible** and the guide
 * lists exactly these (its earlier "7 of the 10" note undercounted — see `research.md` §3.23.4).
 *
 * The two pairs the guide does NOT list — **Electric+Freeze** and **Corrosion+Freeze** — are
 * therefore **NOT fusible** by this table. That is what the *"tiles that cannot fuse with the base
 * element"* clause in the replacement rule refers to.
 *
 * Pairs are UNORDERED and stored with each pair's two elements sorted alphabetically, so a lookup is
 * canonical. Kept as DATA here (not in `src/data/`) because it is tile-RULE data with no per-character
 * or per-scenario dimension, and it is the same for every fight — matching how the tile constants
 * above live here. Element order inside a tile's `elements` list is explicitly NOT significant
 * (`TileEffect` doc), which is what makes canonical lookup correct.
 */
const FUSIBLE_PAIRS: readonly (readonly [Element, Element])[] = [
  ["burn", "freeze"], // Smoldering Suspire
  ["burn", "hydro"], // Scalding Vapors
  ["burn", "electric"], // Crackling Flare (CN-only per the guide; the pair is still fusible)
  ["burn", "corrosion"], // Venomfire
  ["corrosion", "electric"],
  ["corrosion", "hydro"],
  ["electric", "hydro"],
  ["freeze", "hydro"],
];

/**
 * True when the two elements form a fusible pair (order-insensitive). A pair is fusible exactly when
 * the guide's Polyphase Fusion List contains it — no pair is inferred.
 */
export function isFusiblePair(a: Element, b: Element): boolean {
  if (a === b) return false; // like-with-like is an UPGRADE, not a fusion
  return FUSIBLE_PAIRS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

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
  /** The `unitId` that generated the tile (provenance; drives the derived `version`). */
  generatedBy: string;
  /**
   * Which side the tile debuffs — an EXPLICIT override. When ABSENT the version is **derived from the
   * generator's side** via `tileVersionFor` (T6): a generator in `grid.placements` is `"allied"` and
   * one in `grid.enemyUnits` is `"enemy"`. Provide this only for a generator that is not a placed unit
   * at all — e.g. a **terrain effect**, which the source explicitly allows to create tiles and which
   * is `"neutral"` (debuffs everyone) — or to be explicit in a test.
   */
  version?: TileVersion;
}

/**
 * Derive the tile VERSION from the SIDE of the unit that generated it — the source's *"correspond
 * to the source that created the tile"* rule (§3.23.1, T6/M6).
 *
 * The engine models sides **structurally**, not as a `UnitState` field: allies live in
 * `grid.placements`, grid enemies in `grid.enemyUnits`, and the boss is a separate stationary entity.
 * So this reads that structure rather than inventing an affiliation flag:
 *
 *  - a **placed ally** → `"allied"` (debuffs enemies);
 *  - a **grid enemy** → `"enemy"` (debuffs allies);
 *  - the **boss** — a `BossPlacement` with **no id** (`TileOccupant` doc) and no generator path in the
 *    MVP — therefore cannot be looked up here at all; if it ever generates, the caller states the
 *    version explicitly (`TileGenerationSpec.version`), which is the override's purpose.
 *
 * An UNKNOWN id (not a placed ally or a grid enemy) returns `undefined`, so the caller falls back to
 * the *"allied"* default rather than inventing an affiliation for a unit the grid does not know. That
 * fallback matches T3–T5's behaviour, so T6 changes no existing outcome.
 *
 * **Only `"allied"` is reachable in the MVP**: nothing but a player doll generates tiles, because
 * there is no enemy generator and no terrain generator (`docs/tiles.md` §8 non-goals). The `"enemy"`
 * branch is modeled because the rule is unconditional, and is exercised by tests rather than by play.
 *
 * **Not Tested** — that version follows the generator's side is the guide's statement, not observed.
 */
export function tileVersionFor(grid: GridState, generatorId: string): TileVersion | undefined {
  if (grid.placements.has(generatorId)) return "allied";
  if (grid.enemyUnits.some((e) => e.unitId === generatorId)) return "enemy";
  return undefined;
}

/** The version a spec resolves to: explicit override, else the generator's side, else `"allied"`. */
function resolveVersion(state: GridState, spec: TileGenerationSpec): TileVersion {
  return spec.version ?? tileVersionFor(state, spec.generatedBy) ?? "allied";
}

/** What generating onto a position DID — the outcome of the tile addition rule. */
export type TileAdditionOutcome =
  /** Nothing was there: a NEW base tile was created. */
  | "created"
  /** The generation SHARED an element with the tile → it levelled up (or, at Lv3, only the clock refreshed). */
  | "upgraded"
  /** A FUSIBLE different element → a Polyphase Fusion tile. */
  | "fused"
  /** A NON-FUSIBLE different element on a **non-upgraded** base tile → it replaced the tile. */
  | "replaced"
  /** The tile was **protected** and left unchanged (upgraded, or an existing fusion tile). */
  | "protected";

/** One tile the addition rule acted on, and what happened to it. */
export interface TileAdditionResult {
  tile: GridCoord;
  outcome: TileAdditionOutcome;
}

/**
 * Apply the tile addition rule to ONE tile that ALREADY carries an effect — *"generating … onto the
 * same tile"*. This is the shared core of **Tile Upgrade** and **Polyphase Fusion** (both **T5/M5**:
 * per the project owner, 2026, fusion was pulled forward into T5 rather than left for T7).
 *
 * The rule as the source states it (`docs/research.md` §3.23.1, §3.23.4), in evaluation order:
 *
 *  1. **A shared element → LEVEL UP.** *"The way to level up a tile is through continuing to generate
 *     new tiles of that element onto the same tile."* At **Lv3** it *"will just refresh its duration"*
 *     (the level is capped). This ALSO covers levelling a **fusion** tile by *"either of the original
 *     fused elements"* — a shared element is exactly that.
 *  2. **A fusion tile takes no third element.** *"won't be overwritten if there is an attempt to
 *     generate a third element on them."* Since only its own fused elements level it (case 1), any
 *     other element does nothing — `"protected"`.
 *  3. **A FUSIBLE pair → POLYPHASE FUSION.** The tile becomes a fusion tile carrying **BOTH**
 *     elements. The fusion **PRESERVES the tile's existing level**: *"If you attempt Polyphase Fusion
 *     on a tile that has already been Upgraded, the resulting fusion tile will start at the existing
 *     tile's upgrade level."* (So fusing costs no level and grants no free level — a Lv2 base tile
 *     fuses into a Lv2 fusion tile, which can then be upgraded twice more to Lv3.)
 *  4. **A different, NON-FUSIBLE element.** *"A tile that has been **upgraded** is also protected from
 *     being replaced by new elemental tiles that cannot fuse with the base element"* — so an
 *     **upgraded** tile (level ≥ 2) is `"protected"` and unchanged, while a **non-upgraded** one is
 *     `"replaced"`: it becomes the incoming element at Lv1.
 *
 * **Every** mutation (upgrade, fusion, replacement) then **resets the duration to 3** — *"Each time an
 * upgrade or fusion occurs, the tile's duration will be reset to 3 rounds"* — and updates
 * `generatedBy`/`version`, since the version *"can also be changed depending on the last unit that
 * generated the tile onto the area"* (trivial in the MVP: there is no non-allied generator yet; T6
 * deepens this).
 *
 * **Genuinely inferred (Not Tested, §7 decision 7):** the replacement's exact level/duration — the
 * guide implies replacement but never states its result (project owner chose **Lv1 + duration 3**).
 * The **fusible pairs** are NOT inferred: they come from the guide's own list (`FUSIBLE_PAIRS`).
 *
 * Mutates `effect` in place; the caller owns putting `key` back on the map.
 */
function applyTileAddition(state: GridState, effect: TileEffect, spec: TileGenerationSpec): TileAdditionOutcome {
  const incoming = spec.elements;
  const current = effect.elements;

  // 1) A shared element levels the tile — the general form of "generate that element onto the same
  //    tile", and the only way a fusion tile levels (either of its fused elements qualifies).
  if (incoming.some((e) => current.includes(e))) {
    if (effect.level < TILE_MAX_LEVEL) effect.level += 1; // at Lv3 this only refreshes the duration
    resetTileDuration(effect);
    effect.generatedBy = spec.generatedBy;
    effect.version = resolveVersion(state, spec);
    return "upgraded";
  }

  // 2) Past this point the elements are disjoint. A fusion tile is never overwritten by a third
  //    element, and only its own fused elements (case 1) level it — so nothing happens.
  if (current.length === 2) return "protected";

  // 3) Fusible → POLYPHASE FUSION, PRESERVING the current level ("start at the existing tile's
  //    upgrade level"). Both elements are carried; the original keeps its position for determinism
  //    (element ORDER is not significant — `TileEffect` doc).
  if (incoming.length === 1 && isFusiblePair(current[0], incoming[0])) {
    effect.elements = [current[0], incoming[0]];
    resetTileDuration(effect);
    effect.generatedBy = spec.generatedBy;
    effect.version = resolveVersion(state, spec);
    return "fused";
  }

  // 4) Different AND non-fusible: an UPGRADED tile is protected; a non-upgraded one is replaced.
  if (effect.level >= 2) return "protected";
  effect.elements = [...incoming]; // replace: becomes the incoming element…
  effect.level = TILE_BASE_LEVEL; // …at Lv1 (owner decision — the guide gives no level)
  resetTileDuration(effect); // and the addition resets the clock
  effect.generatedBy = spec.generatedBy;
  effect.version = resolveVersion(state, spec);
  return "replaced";
}

/**
 * Generate elemental tiles across the AREA of `spec`, applying the tile addition rule at each
 * position, and return what happened at every tile the call acted on (a caller — trigger (T8) or
 * test — can then act on exactly those).
 *
 * Every **in-bounds** tile of the area is generated on, with **NO terrain filter**: the source
 * restricts generation by nothing but the area, so no filter is invented (§7 decision 6 — whether
 * generation should skip impassable terrain / the boss footprint is **Not Tested**).
 *
 * An EMPTY position gets a new **base** tile (`TILE_BASE_LEVEL`, initial duration). An OCCUPIED
 * position goes through `applyTileAddition` — level up / fusion / replacement / protection. Note the
 * consequence: **`generateTiles` no longer leaves occupied tiles untouched** (it did in T3, before the
 * upgrade rule existed); the T3 "occupied tile" test was rewritten for T5.
 *
 * MUTATES `state.tiles` — tile effects are runtime state, exactly like `allyTiles` (which the
 * engine also mutates in place), so generation is a state transition, not a pure query.
 */
export function generateTiles(state: GridState, spec: TileGenerationSpec): TileAdditionResult[] {
  if (spec.elements.length === 0) throw new Error("a tile must carry at least one element");
  const version = resolveVersion(state, spec);
  const results: TileAdditionResult[] = [];
  for (const tile of areaTiles(spec.origin, spec.shape, spec.radius, state.size)) {
    const key = tileKey(tile.x, tile.y);
    const existing = state.tiles.get(key);
    if (existing) {
      results.push({ tile, outcome: applyTileAddition(state, existing, spec) });
      continue;
    }
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
    results.push({ tile, outcome: "created" });
  }
  return results;
}

// ------------------------------------------------------------------ T4 / M4: the lifecycle

/**
 * Reset a tile's remaining duration to `effect.resetRounds` (3) — the duration EVERY SUBSEQUENT tile
 * effect added at that position gives it (owner-stated duration RULE, steps 2–3; §3.23.1).
 *
 * Exposed as its own function because **"resets duration to 3" and "levels up" are SEPARATE halves**
 * of the layer's rule: this one is the time dimension (T4); the level dimension is the UPGRADE slice
 * (T5). T5 composes `resetTileDuration` with a level bump rather than rewriting the duration logic —
 * which also keeps T4 free of the element-matching question (*"the SAME element"* levels a tile)
 * that belongs to T5's evidence.
 *
 * Mutates the stored effect in place, like every other runtime write here.
 */
export function resetTileDuration(effect: TileEffect): void {
  effect.durationLeft = effect.resetRounds;
}

// ------------------------------------------------------------------ T8 / M8: tile triggers

/**
 * Does a tile with this VERSION affect a unit on a given side? This is the rule T6 deliberately left
 * unimplemented — *what a version DOES* (§3.23.1):
 *
 *  - `"allied"` → debuffs **enemies** (the MVP's enemy is the dummy/boss);
 *  - `"enemy"`  → *"swap which units are targeted"* → debuffs **allies**;
 *  - `"neutral"`→ *"apply all effects"* → affects **everyone**.
 *
 * `targetIsAlly` is the SIDE of the unit standing on the tile. Pure; no state.
 */
export function tileAppliesToUnit(version: TileVersion, targetIsAlly: boolean): boolean {
  if (version === "neutral") return true;
  return version === "allied" ? !targetIsAlly : targetIsAlly;
}

/** Provenance label for a tile-applied status. Derived from element set + level, never a CN name. */
export function tileEffectSource(effect: TileEffect): string {
  return `${[...effect.elements].sort().join("+")} tile Lv${effect.level}`;
}

/**
 * TILE-DEBUFF IMMUNITY (2026, T9/M9) — true when `unit` declares immunity to negative effects
 * inflicted by a tile carrying ANY of `tileElements`. Vector's Perception Block Lv.1 clause 1:
 * *"Immune to negative effects inflicted by Burn tiles."*
 *
 * Reads the unit's PASSIVES (`tile_debuff_immunity`) — a **SOURCE-property** gate, unlike the
 * holder-status-conditioned `displacementImmunityWhenStatuses` idiom. Pure predicate; exported so
 * the gate is testable directly and so a caller can ask the question without applying anything.
 *
 * An EMPTY element list, or a unit with no such passive, is not immune — immunity is declared, never
 * assumed (the same "never invent" rule the rest of the subsystem follows).
 */
export function hasTileDebuffImmunity(unit: UnitState, tileElements: Element[]): boolean {
  if (tileElements.length === 0) return false;
  return unit.passives.some(
    (p) => p.kind === "tile_debuff_immunity" && p.elements.some((e) => tileElements.includes(e)),
  );
}

/**
 * FK5's TAKEN-SIDE TILE REDUCTION (2026, T9/M9) — the multiplicative factor a unit's EQUIPPED FIXED
 * KEYS grant for standing on the tiles whose elements are `tileElements`. Vector's FK5: *"While on a
 * Burn tile, damage taken is reduced by 20%"* ⇒ `0.8`.
 *
 * The result multiplies into the EXISTING `red` term of the taken-reduction chain (never a separate
 * bucket), matching every other taken reduction. `value` is the reduction FRACTION (−20% ⇒ `0.2`),
 * the same convention as the `damage_reduction` status effect.
 *
 * A key applies only when it is EQUIPPED (`unit.equippedKeys` contains its id) — the established
 * Fixed-Key resolution pattern — and only when the declared `elements` intersect the tiles actually
 * stood on. Multiple qualifying keys multiply in declaration order (no cap is invented).
 *
 * Lives here, beside the other tile-gated helpers, because the gate is a **tile** query even though
 * its data is key data.
 *
 * **INERT IN THE MVP** (see `KeyDef.damageReductionWhileOnTile`): `dealDamageHit` targets only the
 * dummy, which has no Fixed Keys, and the only doll-damage path bypasses this chain. Pure and
 * directly testable regardless.
 */
export function keyTileTakenReduction(
  unit: UnitState,
  tileElements: Element[],
): number {
  let red = 1;
  if (tileElements.length === 0) return red;
  const keys: KeyDef[] = unit.def?.fixedKeys ?? [];
  for (const k of keys) {
    const spec = k.damageReductionWhileOnTile;
    if (!spec) continue;
    if (!(unit.equippedKeys ?? []).includes(k.id)) continue;
    if (!spec.elements.some((e) => tileElements.includes(e))) continue;
    red *= 1 - spec.value;
  }
  return red;
}

/**
 * TILE TRIGGER (b) — *"applies … to enemy units that **remain on the area after ending their
 * action**"* (§3.23.3). Call at the END of a unit's own action: it applies the effects of every tile
 * the unit is standing on, subject to the tile's version targeting rule above.
 *
 * `isAlly` is the CALLER's statement of which side the unit is on — the engine models sides
 * structurally (`state.units` are allies; the MVP's only non-ally `UnitState` is the dummy), so the
 * caller already knows, and passing it keeps this function pure of that lookup.
 *
 * Returns the status ids actually applied (empty when nothing applies), so a caller/test can observe
 * the trigger without re-deriving it.
 *
 * Deliberately NOT here (recorded as gaps, `docs/tiles.md` §10):
 *  - **trigger (a)** on-generation damage, and **trigger (c)** *"for every 3 times they take Burn
 *    damage"* — the latter has no Burn-damage event stream to count, and no defined statuses to grant.
 *
 * **Not Tested** — the clause is the guide's; nothing here is in-game validated.
 */
export function applyTileEffectsOnActionEnd(
  state: SimulationState,
  unit: UnitState,
  isAlly: boolean,
): string[] {
  const grid = state.grid;
  if (!grid) return [];
  // Reuse T2's reviewed occupancy query (footprint-aware for the boss) — never a placements-only scan.
  const occ: TileOccupant = isAlly ? { kind: "ally", unitId: unit.id } : { kind: "boss" };
  const applied: string[] = [];
  const appliedTiles = new Set<string>();
  for (const coord of tilesOccupiedBy(grid, occ)) {
    const effect = grid.tiles.get(tileKey(coord.x, coord.y));
    if (!effect) continue;
    if (!tileAppliesToUnit(effect.version, isAlly)) continue;
    // TILE-DEBUFF IMMUNITY (T9/M9): a holder that declares immunity to debuffs from tiles carrying
    // any of these elements takes NOTHING from this tile (Vector's Perception Block Lv.1). Checked
    // AFTER the version gate, so it only ever blocks a tile that WOULD have debuffed the holder.
    if (hasTileDebuffImmunity(unit, effect.elements)) continue;
    // One application per distinct tile EFFECT: a 3×3 boss can straddle the same tile type several
    // times, and re-applying would only refresh a duration that is already correct.
    const effectKey = tileEffectKey(effect.elements, effect.level);
    if (appliedTiles.has(effectKey)) continue;
    const data = tileEffectsFor(effect.elements, effect.level);
    if (!data) continue; // no recorded effects for this (element set, level) — apply nothing
    appliedTiles.add(effectKey);
    // APPLIER: the source's fixed damage is *"equal to X% of the applier's ATK"* — the applier of a
    // tile-inflicted status is the unit that GENERATED the tile (`effect.generatedBy`). Resolved only
    // when that id names a real allied unit; a scripted/terrain generator has no panel ATK, so the
    // status is applied with NO applier and its applier-ATK fixed damage is inert (no ATK is invented).
    const generator = state.units.find((u) => u.id === effect.generatedBy);
    const applier = generator ? { id: generator.id, atk: generator.panelAtk } : undefined;
    for (const s of data.applies) {
      if (applyStatus(state, unit, { statusId: s.statusId, durationRounds: s.durationRounds, source: tileEffectSource(effect), applier })) {
        applied.push(s.statusId);
      }
    }
  }
  return applied;
}

/**
 * End-of-ROUND tile lifecycle: tick every tile's duration down and remove the ones that reach 0.
 * Returns the tile keys that **expired** this round.
 *
 * Diagrammed rules this implements (§3.23.1):
 *  - a tile carries a duration (`TileEffect.durationLeft`) that counts rounds down;
 *  - at **Lv3**, further generation *"only refreshes duration"* — i.e. a tile is not immortal and not
 *    levelled forever, it just gets its clock reset (`resetTileDuration`, which T5 calls).
 *
 * The tick counts **rounds** (like `endOfRoundStability`), NOT the holder's own action — a tile is
 * battlefield terrain with its own clock, and every duration the source states is in *turns/rounds*.
 *
 * **`applyEffects` is deliberately absent.** What a tile DEBUFFS is the trigger slices' work: the
 * *"remain on the area after ending their action"* application is T8, and *"while on a tile"* gates
 * are T9. This slice owns the clock only — it never decides WHO a tile affects.
 *
 * Copy-then-delete: iterating a frozen snapshot keeps this correct if a future `applyEffects`
 * mutates the same map (T8), without relying on `Map` iteration semantics under deletion.
 *
 * The **clock itself is `[SOURCE]`/Not Tested** — that a tile's duration counts down by rounds, and
 * that a tile expires when it elapses, is the guide's statement, not observed in game.
 */
export function tickTiles(state: GridState): string[] {
  const expired: string[] = [];
  for (const [key, effect] of [...state.tiles]) {
    effect.durationLeft -= 1;
    if (effect.durationLeft <= 0) {
      state.tiles.delete(key);
      expired.push(key);
    }
  }
  return expired;
}
