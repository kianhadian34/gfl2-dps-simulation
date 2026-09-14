# Grid / Positioning — Core Battlefield (2026)

The simulator's optional 15×15 battle grid. Spatial facts only — **damage, effects, and
triggers remain in the existing engine** (`src/engine/simulation.ts`), which consumes these
facts. The grid is a reusable foundation for later movement/range/Cover/AoE systems; none of
those future systems are implemented beyond what is listed here.

Evidence statuses use exactly one of **Validated** (in-game observations below),
**Mathematically Proven** (derived arithmetic), **Not Tested** (unresolved / deliberately
unimplemented).

## Confirmed core rules

### Grid (Validated / Mathematically Proven)
- Battlefield = **15×15 tiles**, the entire playable area (`GRID_SIZE = 15`); boundaries are impassable.
- One unit per tile; normal units occupy **1×1**; the boss occupies **3×3** with a **center tile**.
- The boss is a stationary enemy entity; its footprint tiles are enemy/impassable to units.
- A unit cannot be placed on the boss footprint (occupied terrain).

### Distance / range (Mathematically Proven from the confirmed rule)
- Skill range is a **diamond**: distance = **Manhattan** `|x1−x2|+|y1−y2|`.
- Range origin: the unit's own tile for 1×1; the **boss center tile** for 3×3.
- No Euclidean distance.

### Movement (Validated / Mathematically Proven)
- **Orthogonal = 1 Mobility, diagonal = 2** → movement cost ≡ Manhattan distance.
- A unit may move up to its Mobility; using less is allowed; exceeding is illegal.
- **Move happens BEFORE the action**; move → action works; **action → move is impossible**
  (moves are applied only at the pre-action point of the turn loop).
- A unit may move and voluntarily end its turn without acting.
- Allies may be **crossed**; a destination on an ally tile is illegal.
- Enemy/boss/blocked tiles are **impassable** (cannot enter or cross) — enemies are routed around.

### Height (implementation per confirmed source rules; combat effect Not Tested)
- Exactly two levels: **Ground** and **High Ground** (`highTiles`).
- **High Ground → Ground = the target counts as Exposed** for that attack (its Stability
  protection does not apply) — implemented and integrated into the EXISTING Exposed pipeline
  (no parallel damage calculation). **Evidence status: Not Tested** — the interaction is
  implemented from the confirmed rules but has NOT been in-game validated (no in-game test was
  performed; do not claim it as validated).
- Same-height attacks have no height effect (confirmed; no gameplay number tested).
- **Ground → High Ground: UNRESOLVED / Not Tested** — not implemented.
- Detailed terrain LOS: Not Tested — not built beyond the height facts.

### Ladders (Validated; any extra behavior Not Tested)
- A ladder is the only confirmed High Ground access; using it costs **1 Mobility** when adjacent.

## UNRESOLVED — deliberately NOT implemented
- Diagonal corner-squeezing around blocked/enemy tiles (plain 8-direction tiling; the squeeze
  cases are not modeled and not tested as known behavior).
- Ground → High Ground combat interaction.
- Detailed LOS rules for every terrain arrangement.
- Any height beyond Ground/High Ground.
- Unconfirmed movement modifiers; spacing beyond the occupied tile.

## Engine integration (single points)
- `SkillDefVariant`/`CharacterDef.mobility` — optional Movement budget (absent = cannot move).
- `Scenario.grid` — optional `GridConfig`; **absent ⇒ positions have no effect** (backward compatible).
- Pre-action scripted moves (`GridConfig.moves`) are legality-checked with the pure grid API and
  throw on any illegal move (deterministic; no movement AI).
- `dealDamageHit` takes an `exposedOverride` that the grid feeds from
  `attackHeightEffect(attackerHeight, targetHeight)` — High Ground → Ground **adds** Exposed;
  otherwise the normal broken-state Exposed rule governs (no shadowing).