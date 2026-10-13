# Elemental Tiles — design + slice plan (2026)

**Status: PLAN ONLY — nothing here is implemented.** The tile *rules* are owned by
`docs/research.md` §3.23 (Burn family, `[SOURCE]`, Not Tested). This document owns the **engine
design and the slice breakdown**. It is the tile-system counterpart to `docs/grid.md` (which owns
the *terrain* facts: size, height, blocked, ladders, movement).

Evidence statuses used below are exactly: **Validated** / **Mathematically Proven** / **Not Tested**.

---

## 1. Why this is the hard one

Every other Vector slice (V4's 1–12) added *vocabulary* to an existing system: a new trigger, a new
targeting mode, a new gate. Tiles are the first thing that needs a **new subsystem with its own
state machine** — per-tile identity, levels, versions, fusion, duration, and three new trigger
kinds. It is comparable in size to the whole V4 vocabulary effort, not a slice of it.

---

## 2. Evidence — and the two risks that matter

**Source.** `https://dandegate.net/guides/gfl2s-new-tile-mechanics` (author **B Botzu**, published
2026-04-04, updated 2026-09-07). A **community guide**, not an official data page — its own footer
says it "reflects the author's opinions". **Source hierarchy level 5 (secondary/community).**

**Risk 1 — CN-only, names may change.** The guide states the feature is **CN-only** and that
**names are subject to change** on global release. The simulator targets global. So every Burn tile
*name* (Incineration, Flashover II/III, Scalding Vapors, …) is provisional.

**Risk 2 — no in-game observation, and no automated test is possible yet.** Nothing here is
`Validated`. Effect *names* were independently resolved from the site's own effect records (by
UUID), which is stronger than prose transcription, but the *rules* remain the guide's.

**What I re-verified this session:** three of the ten effect UUIDs resolve against the live API
(`71b3f790… → Overburn`, `a55cd12e… → Conflagration`, `174c1af6… → Combustion`). The site exposes
**no** tile endpoint (`/api/tiles` and `/api/tile-effects` are 404) — the rules exist only as the
guide.

---

## 3. What the engine has today (verified)

| Piece | State |
|---|---|
| `GridState` terrain | `heights`, `blocked`, `enemyTiles` — **all static**, set at `buildGrid` |
| Per-tile *effect* storage | **none** — `GridConfig` carries no tile-effect field |
| Unit → tile | `grid.placements.get(unitId)` for **allies**; the **dummy is NOT in placements** (it is `grid.boss`); grid enemies are in `enemyUnits[].coord` |
| Tile → unit | `grid.allyTiles` (allies only) |
| Area geometry | `areaTiles` / `allyIdsInArea` / `AreaShape` (2026, §3.32) — **reusable for tile generation areas** |
| Turn hooks | `endOfOwnTurn`, `endOfRound`, `ownActionStart` tick — exist, but none is tile-scoped |
| Weakness | `weaknessElements` set ONCE at construction from `DummyConfig` — **not mutable at runtime** |
| Stability damage | `applyStabilityDamage` exists |
| The 10 tile-effect statuses | **1 of 10 exists** (`overburn`). **9 missing**: Conflagration, Combustion, Combustion II, Stability Loss I, Frozen, Damp, Paralysis, Congestion, Meltdown |

---

## 4. What is genuinely missing (the gap inventory)

These are the items to go over one by one.

| # | Gap | Why it blocks |
|---|---|---|
| **M1** | **Tile identity + storage** — no per-tile record of element / level / version / duration | Nothing downstream can be expressed |
| **M2** | **Unit-on-tile query** — incl. the boss/dummy special case | Every trigger and gate needs "who is standing here" |
| **M3** | **Tile generation + targeting** — "generates tiles within N tiles of the target" | The entry point for every tile clause |
| **M4** | **Tile lifecycle** — duration (3 rounds on upgrade/fusion), expiry, Lv3 "refresh only" | Tiles must expire or the field saturates |
| **M5** | **Tile Upgrade** — same element onto an existing tile → Lv2 → Lv3, keeping bonuses | The base progression |
| **M6** | **Versioning** — Allied / Enemy / Neutral, set by the last generator | Determines WHO a tile affects |
| **M7** | **Polyphase Fusion** — two fusible elements → fusion tile; priority over base; not overwritten by a third element; either element levels it; fusing onto an upgraded tile starts at that level | The most intricate rule set |
| **M8** | **Tile triggers** — (a) on generation, (b) "units that **remain on the area after ending their action**", (c) "**for every 3 times** they take Burn damage" | The tile rules are entirely trigger-driven |
| **M9** | **Tile-gated effects** — FK5 *"while on a Burn tile, damage taken −20%"*; Perception Block *"immune to debuffs inflicted by Burn tiles"* | Needs M1 + M2 |
| **M10** | **Runtime weakness application** — tiles *"apply Burn weakness"*, but `weaknessElements` is immutable today | Changes the damage path |
| **M11** | **The 9 missing statuses** | "Applies Overburn + Conflagration" cannot be expressed |
| **M12** | **Vector's clauses end-to-end** — FK1, FK5, Perception Block L1/V5, Overheat Combustion V5, Smolder, Searing Finale | The payoff |

**Important — this IS observable in the MVP** (unlike holder-side area targeting, §3.33): the dummy
sits at `boss.center`, and tiles generate "within N tiles of the **target**" — so the dummy can
stand on a generated tile. Tile effects are therefore **testable** without needing enemy groups.

---

## 5. The model as built (T1, 2026)

**Status: IMPLEMENTED** (`src/model/grid.ts` `TileEffect`; `src/engine/grid.ts` `GridState.tiles`).
The draft below was revised during implementation — see the two marked changes.

```ts
export interface TileEffect {
  elements: Element[];        // 1 = base tile, 2 = fusion tile (order not significant)
  level: 1 | 2 | 3;           // Tile-Upgrade stage
  durationLeft: number;       // live countdown (lifecycle: T4)
  initialRounds: number;      // ← REVISED: fresh-generation duration (source: "2 turns")
  resetRounds: number;        // ← REVISED: upgrade/fusion reset duration (source: "resets to 3 rounds")
  version: "allied" | "enemy" | "neutral";  // set by the LAST generator
  generatedBy: string;        // unitId that generated last
}

// GridState gains:
tiles: Map<string, TileEffect>;   // tileKey -> effect; absent = plain terrain
```

**Change 1 — duration became TWO values.** The draft had a single `durationLeft` seeded from one
constant. The evidence contradicts itself by one round: generation clauses say tiles last *"2
turns"* (Searing Finale, FK1) while the transformation layer says duration *"resets to **3
rounds**"* on every upgrade or fusion. Rather than pick a winner, both are stored — `initialRounds`
for generation, `resetRounds` for upgrade/fusion. The conflict is **Not Tested** (decision 1, §7)
and neither reading is silently chosen.

**Change 2 — `elements` is a LIST, not a single element + level.** Forced by *"fusion tiles … are
**not** overwritten by a third element"* (§3.23.1): "last element wins" is wrong, so the record
must be able to hold two. `level` remains separate and orthogonal.

`elements` as a list handles base and fusion uniformly, and the display *name* is derived from
(element set, level) — so the CN name risk (Risk 1) stays in **data**, not in the engine.

---

## 6. Slice plan

Each slice follows the established workflow (Evidence → Document → Test → Implement → Commit) and
is **vocabulary or mechanism only** unless stated. Sizes are indicative.

| Slice | Delivers | Gap(s) | Open question |
|---|---|---|---|
| **T1** | `TileEffect` + `GridState.tiles` (storage + identity). No generation, no triggers. **✅ DONE 2026 — see §10.** | M1 | Model shape (§5). **✅ DECIDED** — full model, plus a **two-duration** split (see §10). |
| **T2** | Unit-on-tile query: allies, the **boss/dummy** (footprint-aware), grid enemies. Pure. | M2 | — |
| **T3** | Tile generation + area targeting (reuses `AreaShape`; numeric ⇒ diamond). Duration init. | M3 | ✅ RESOLVED — generation uses `initialRounds` (2); upgrade/fusion resets to `resetRounds` (3) |
| **T4** | Lifecycle: round-end ticking, expiry, Lv3 "refresh only". | M4 | — |
| **T5** | Tile Upgrade: same element onto an existing tile → level up, bonuses kept. | M5 | — |
| **T6** | Versioning (Allied / Enemy / Neutral). | M6 | **Only Allied is reachable** — no enemy generator exists. Model all three anyway? |
| **T7** | Polyphase Fusion: priority, third-element behaviour, either-element levelling, fuse-onto-upgraded. | M7 | Scope: Burn fusions only, or all? |
| **T8** | The three tile triggers (on-generation / end-of-action-on-tile / every-3-Burn-hits counter). | M8 | The counter is per-unit-per-tile state — where does it live? |
| **T9** | Tile-gated effects: "while on a tile" query + gates (FK5 −20%, Burn-tile immunity). | M9 | — |
| **T10** | Runtime weakness application (tile-applied Burn weakness). | M10 | **Mutate `weaknessElements` or compute at hit time?** (see §7) |
| **T11** | The 9 missing statuses. | M11 | Each needs its OWN evidence — the guide names them but does not fully define them |
| **T12** | Vector's clauses end-to-end (FK1, FK5, PB L1/V5, OC V5, Smolder, Searing Finale). | M12 | Depends on T1–T11 |

**Suggested order:** T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9 → T10 → T11 → T12. Each is
independently committable and leaves the suite green; T11 could be split per-status if needed.

---

## 7. Decisions that are the project owner's (not inferable from evidence)

1. **Scope of the transformation layer.** `research.md` §3.23 deliberately covers **Burn-related
   tiles only**. Do we build the *general* layer (all 5 elements + every fusion) or **Burn-only**
   (matching the existing evidence and Vector's kit)?
2. **Tile model shape.** Full model (§5: elements + level + version + duration + generator), or a
   minimal one sized to Vector's clauses only?
3. **Weakness application (M10).** Tiles "apply Burn weakness". Two options:
   - **mutate** the unit's `weaknessElements` while it stands on the tile (simple, but add/remove
     on every tile enter/exit, and it touches a stat the panel owns);
   - **compute at hit time** from the attacker/target's tile (no mutation, but every weakness read
     site must consult tiles).
4. **CN naming risk.** Build on the CN names now (accepting a future rename), or hold the named
   *statuses* (T11) until global?
5. **Is the feature live in global?** The guide says CN-only. If tiles do not exist on global, the
   whole subsystem models something unplayable — which would make it a **deferral** like G14, not
   an implementation.

---

## 8. Non-goals (explicitly out of scope for the plan)

- Non-Burn tiles and non-Burn fusions (matching `research.md` §3.23's declared scope) — unless
  decision 1 says otherwise.
- Terrain LOS / height interactions beyond the existing `docs/grid.md` facts.
- Enemy-side generators (there are none in the MVP, so Enemy/Neutral versions are unexercisable).
- Tile rendering in the UI (this document is engine-only; UI is a separate concern).

---

## 9. Related documents

- `docs/research.md` **§3.23** — the tile RULES (Burn family), `[SOURCE]`, Not Tested. **Owning doc.**
- `docs/research.md` **§3.32** — `AreaShape` / `areaTiles` (reusable for generation areas).
- `docs/research.md` **§3.33** — holder-side area targeting (DEFERRED; different problem).
- `docs/grid.md` — terrain facts this builds on.
- `docs/dolls/vector.md` **G1, G9, G13** — the per-kit gaps tiles would close; **§7.1** — her
  status inventory.

---

## 10. Implementation record

### T1 / M1 — tile identity + storage — **DONE 2026**

**Delivered.** `TileEffect` (`src/model/grid.ts`) and `GridState.tiles: Map<string, TileEffect>`
(`src/engine/grid.ts`, initialised empty in `buildGrid`). **Storage and identity only** — no
generation, no upgrade, no fusion, no triggers, no duration ticking (those are T3+). The chosen
boundary was deliberately the smallest that lets later slices build on a reviewed model.

**Decisions taken (project owner, 2026-10-10):**
1. **Full model** — element set + level + version + generator + duration (not a minimal shape sized
   to Vector alone).
2. **Two duration values** — `initialRounds` (generation, source *"2 turns"*) and `resetRounds`
   (upgrade/fusion, source *"resets to 3 rounds"*). The sources conflict by one round; **both are
   kept so neither is silently chosen**, and the conflict is recorded Not Tested.
3. **`elements` as a list** — forced by *"fusion tiles … are not overwritten by a third element"*;
   "last element wins" cannot express that.

**Where it lives, and why.** On the **runtime** `GridState`, not `GridConfig`. `GridConfig` holds
STATIC terrain (`highTiles`, `blockedTiles`, `ladders`, `moves`) fixed at build time; tile effects
are created and destroyed mid-fight, so they belong with `allyTiles`/`enemyStatuses` (the other
mutable runtime maps). Keyed by the existing `tileKey(x,y)` convention. The type lives in
`model/grid.ts` alongside the other grid value types, matching how `ActiveStatus` lives in
`model/runtime.ts`.

**No UI change needed** — verified: the UI mirrors only `GridConfigView` (the static config), never
`GridState`, so nothing there referenced tiles.

**Tests:** `src/test/tiles.test.ts` (11) — empty map on build; `tileKey` keying; the map is
PER-GRID-STATE (not a shared/module-level map); tiles are independent of static terrain; base (1
element) vs fusion (2 elements) expressible; all three levels and all three versions; the generator
is recorded; **the two durations are independent and settable to different values** (the exact
failure that collapsing them would cause); `durationLeft` is a live counter distinct from either
constant; **a scope guard asserting NO tile-rule functions exist yet**; and a guard that slice 9's
`AreaShape` vocabulary is intact (tiles will reuse it for generation areas).

**Evidence status:** none of this is `Validated`. The *rules* remain `[SOURCE]` (community guide,
hierarchy level 5) per `research.md` §3.23; M1 adds only structure, covered by tests. Engine
**783 pass / 0 fail**; CLI output byte-identical (14,581 / 7 actions).

**Next:** T2 / M2 — the unit-on-tile query, which must handle three cases (allies via `allyTiles`,
the **boss/dummy** via `boss.center` — it is NOT in `placements` — and grid enemies via
`enemyUnits[].coord`).
