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

**Risk 1 — feature existence CONFIRMED on global; only the NAMES are provisional.** The guide
states the feature is **CN-only** and that **names are subject to change** on global release; the
simulator targets global. **RESOLVED (project owner, 2026, direct in-game evidence — source
hierarchy level 1): the tile feature IS live in global.** So the subsystem models playable global
content — it is **not** a CN-only curiosity and **not** a deferral (contrast G14, §7 decision 5).
What stays provisional is the **naming alone**: the guide's tile/effect names are CN, and the
global names may differ (§7 decision 4). That is exactly why names live in **data** and the engine
stores only the element set + level, deriving any display name from those.

**Risk 2 — no in-game observation of the RULES, and no automated test of them is possible yet.**
Nothing here is `Validated`. Effect *names* were independently resolved from the site's own effect
records (by UUID), which is stronger than prose transcription, but the *rules* remain the guide's.
The confirmation that the feature exists on global (Risk 1) is an observation of **existence only**
— it validates no value below, and the absence of a tile endpoint on the source site means the rules
still rest on the guide alone.

**What I re-verified this session:** three of the ten effect UUIDs resolve against the live API
(`71b3f790… → Overburn`, `a55cd12e… → Conflagration`, `174c1af6… → Combustion`). The site exposes
**no** tile endpoint (`/api/tiles` and `/api/tile-effects` are 404) — the rules exist only as the
guide.

---

## 3. What the engine had BEFORE the tile work (baseline, verified)

This is the starting point the plan was drawn against. Slices **T1–T3** have since added tile
storage, the unit-on-tile query and generation — see **§10** for what actually exists now, which
supersedes the rows below where they differ (`Per-tile effect storage`, `Unit → tile`, `Tile →
unit`).

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
| **M2** | **Unit-on-tile query** — incl. the boss/dummy special case. **✅ DONE (T2) — see §10.** | Every trigger and gate needs "who is standing here" |
| **M3** | **Tile generation + targeting** — "generates tiles within N tiles of the target". **✅ DONE (T3) — see §10.** | The entry point for every tile clause |
| **M4** | **Tile lifecycle** — duration (first creation 2 → subsequent additions reset to 3, level-capped), expiry, Lv3 "refresh only". **✅ DONE (T4) — see §10.** | Tiles must expire or the field saturates |
| **M5** | **Tile Upgrade** — same element onto an existing tile → Lv2 → Lv3, keeping bonuses. **✅ DONE (T5) — see §10.** | The base progression |
| **M6** | **Versioning** — Allied / Enemy / Neutral, set by the last generator. **✅ DONE (T6) — see §10.** | Determines WHO a tile affects |
| **M7** | **Polyphase Fusion** — two fusible elements → fusion tile; priority over base; not overwritten by a third element; either element levels it; fusing onto an upgraded tile starts at that level. **✅ DONE — MERGED INTO T5 (project owner, 2026) — see §10.** | The most intricate rule set |
| **M8** | **Tile triggers** — (a) on generation, (b) "units that **remain on the area after ending their action**", (c) "**for every 3 times** they take Burn damage". **(b) ✅ DONE (T8); (a) and (c) NOT built — see §10.** | The tile rules are entirely trigger-driven |
| **M9** | **Tile-gated effects** — FK5 *"while on a Burn tile, damage taken −20%"*; Perception Block *"immune to debuffs inflicted by Burn tiles"*. **✅ DONE (T9) — the "while on a tile" query + BOTH gate shapes; Vector's VALUES wait on B4. See §10.** | Needs M1 + M2 |
| **M10** | **Runtime weakness application** — tiles *"apply Burn weakness"*, but `weaknessElements` is immutable today | Changes the damage path |
| **M11** | **The 9 missing statuses** — **investigated (T11): all nine are now DEFINED in the source; 3 are expressible and defined, 6 are blocked on MISSING MECHANICS (not evidence).** | "Applies Overburn + Conflagration" cannot be expressed |
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
  initialRounds: number;      // duration for the FIRST tile created at a position (rule step 1: 2)
  resetRounds: number;        // duration every SUBSEQUENT addition resets it to (steps 2–3: 3)
  version: "allied" | "enemy" | "neutral";  // set by the LAST generator
  generatedBy: string;        // unitId that generated last
}

// GridState gains:
tiles: Map<string, TileEffect>;   // tileKey -> effect; absent = plain terrain
```

**Change 1 — duration became TWO values.** The draft had a single `durationLeft` seeded from one
constant. The model now stores **two**, because the game uses **two for two different events** —
formerly read as a one-round conflict, but **clarified as a rule by the project owner
(2026-10-10)**:

1. The **first** tile created at a position uses its **initial generation duration** → `initialRounds`
   (**2 turns**) — the *"lasting for 2 turns"* in the Searing Finale / FK1 clauses.
2. Whenever **another** tile effect is added at that **same position**, the tile **upgrades by one
   level** (up to Level 3) and its duration **resets** → `resetRounds` (**3 turns**).
3. Further additions to a **Level 3** tile do **NOT** level it, but **still reset** its duration
   to 3.

So the two values answer different events and must never be collapsed into one. The upgrade/level
mechanics themselves are slices **T5/T7**; T1 only stores the values they consume.

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
| **T2** | Unit-on-tile query: allies, the **boss/dummy** (footprint-aware), grid enemies. Pure. **✅ DONE 2026 — see §10.** | M2 | — (none: the plan's "footprint-aware" scope settled it) |
| **T3** | Tile generation + area targeting (reuses `AreaShape`; numeric ⇒ diamond). Duration init. **✅ DONE 2026 — see §10.** | M3 | ✅ RESOLVED — generation uses `initialRounds` (2); upgrade/fusion resets to `resetRounds` (3) |
| **T4** | Lifecycle: round-end ticking, expiry, Lv3 "refresh only". **✅ DONE 2026 — see §10.** | M4 | — (scope split: T4 owns the CLOCK, T5 owns LEVELLING — see §10) |
| **T5** | Tile Upgrade **+ Polyphase Fusion** (merged — see §10): same element → level up (cap 3); fusible pair → fusion preserving level; fusion tile protected from a third element; non-fusible → replace (base) / protect (upgraded); every addition resets duration. **✅ DONE 2026 — see §10.** | M5 + M7 | ✅ RESOLVED — all four branches implemented from the guide's upgrade text + its **Polyphase Fusion List**; the non-fusible REPLACEMENT's level/duration is the one inference (§7 decision 7) |
| **T6** | Versioning (Allied / Enemy / Neutral): named `TileVersion` + `tileVersionFor` deriving the version from the generator's SIDE (`placements` → allied, `enemyUnits` → enemy), with an explicit override for a non-unit (terrain) generator. **✅ DONE 2026 — see §10.** | M6 | ✅ RESOLVED — derive from the generator's side, keeping the explicit override (owner decision 9). What a version DOES is T8/T9 |
| **T7** | ~~Polyphase Fusion~~ **ABSORBED INTO T5** (project owner, 2026): the upgrade and fusion rules share one core and one call site, so splitting them would have meant writing the addition rule twice. Nothing of its own remains. | — | — |
| **T8** | The three tile triggers. **Trigger (b) — "remain on the area after ending their action" — ✅ DONE 2026 (see §10); (a) on-generation damage and (c) the every-3-Burn-hits counter are NOT built and are recorded gaps.** | M8 | ✅ RESOLVED for (b): scope = data-driven mechanism; the counter (c) is per-UNIT on the unit's own state (owner decision 10) — deferred with (c) itself |
| **T9** | Tile-gated effects: the "while on a tile" query (`tileElementsUnderOccupant`) + both gate shapes — FK5's `KeyDef.damageReductionWhileOnTile` and the `PassiveEffect { kind: "tile_debuff_immunity" }`. **✅ DONE 2026 — see §10.** | M9 | ✅ RESOLVED — mechanism now, Vector's values wait on her registration (B4); owner decision 13 |
| **T10** | Runtime weakness application (tile-applied Burn weakness). | M10 | **Mutate `weaknessElements` or compute at hit time?** (see §7) |
| **T11** | The 9 missing tile-effect statuses. **✅ PARTIALLY DONE 2026 — see §10.** The three the engine can express **without inventing a mechanic** are defined (Conflagration, Combustion, Combustion II), which **empties the Burn tile's `pendingStatusIds`**. The other six are **blocked on missing mechanics**, each recorded with its exact block. | M11 | ✅ RESOLVED — do NOT invent mechanics to force them; define what the engine supports and record the rest (owner decision 12) |
| **T12** | Vector's clauses end-to-end (FK1, FK5, PB L1/V5, OC V5, Smolder, Searing Finale). | M12 | Depends on T1–T11 |

**Suggested order:** T1 → T2 → T3 → T4 → **T5 (incl. fusion; T7 absorbed)** → T6 → T8 → T9 → T10 →
T11 → T12. Each is independently committable and leaves the suite green; T11 could be split
per-status if needed.
---

## 7. Decisions that are the project owner's (not inferable from evidence)

1. **Scope of the transformation layer.** `research.md` §3.23 deliberately covers **Burn-related
   tiles only**. Do we build the *general* layer (all 5 elements + every fusion) or **Burn-only**
   (matching the existing evidence and Vector's kit)?
   **→ PARTIALLY ANSWERED 2026 (T5):** the guide's **Polyphase Fusion List** establishes the complete
   **pair membership** (8 pairs; §3.23.4), so `isFusiblePair` covers all five elements rather than
   Burn-only. The remaining sliver of this decision is the **per-pair EFFECT TEXT** for the four
   non-Burn pairs (a recorded gap, `research.md` §3.23.4) — the engine needs it only when a slice
   applies tile effects (T9/T11).
2. ~~**Tile model shape.** Full model (§5: elements + level + version + duration + generator), or a
   minimal one sized to Vector's clauses only?~~ — **✅ DECIDED 2026-10-10: FULL model.** The
   **two-duration rule** is also settled (initial generation 2 → subsequent additions reset to 3,
   level-capped at 3), so it is no longer an open question.
3. **Weakness application (M10).** Tiles "apply Burn weakness". Two options:
   - **mutate** the unit's `weaknessElements` while it stands on the tile (simple, but add/remove
     on every tile enter/exit, and it touches a stat the panel owns);
   - **compute at hit time** from the attacker/target's tile (no mutation, but every weakness read
     site must consult tiles).
4. **CN naming risk.** Build on the CN names now (accepting a future rename), or hold the named
   *statuses* (T11) until global?
5. ~~**Is the feature live in global?** The guide says CN-only. If tiles do not exist on global, the
   whole subsystem models something unplayable — which would make it a **deferral** like G14, not
   an implementation.~~ — **✅ RESOLVED 2026 (project owner, direct in-game evidence — hierarchy
   level 1): the tile feature IS live in global.** T3 onward is real implementation, not a deferral.
   This removes the "unplayable" risk only — it does **not** validate the tile *rules*, which remain
   `[SOURCE]`/Not Tested (Risk 2), and it does not settle the naming (decision 4).

6. **Do tiles generate on impassable terrain (blocked tiles / the boss footprint) — and can tiles be
   generated on a tile that already has one?** The source says *"generates … tiles within a N-tile
   radius"* and does not restrict by terrain. **T3 takes the no-invention default: generate on every
   in-bounds tile of the area, with NO terrain filter**; the occupied-tile half was **answered by T5**
   (an occupied tile goes through the addition rule — upgraded/fused/replaced/protected). Whether
   generation should skip impassable terrain is **Not Tested** — flagged rather than guessed.

7. **What does a NON-FUSIBLE replacement produce?** The guide implies replacement (*"a tile that has
   been upgraded is also protected from being replaced by new elemental tiles that cannot fuse"*)
   but never states the result. **✅ DECIDED 2026 (project owner):** the tile becomes the **incoming
   element at Lv1, with its duration reset to 3** (an addition at that position). This is an
   **inference, not a source value → Not Tested.** The FUSIBLE pairs involved are NOT inferred —
   they are transcribed from the guide's Polyphase Fusion List (§3.23.4).

8. **Should T7 remain a separate slice?** — **✅ ANSWERED 2026 (project owner): no.** Fusion was
   **merged into T5**, because the upgrade and fusion rules share one core and one call site;
   splitting them would have meant implementing the addition rule twice. T7 is absorbed.

9. **Where does a tile's VERSION come from?** The source ties it to *"the source that created the
   tile"*, but the engine has no affiliation field on `UnitState` — it models sides **structurally**
   (`grid.placements` = allied, `grid.enemyUnits` + the boss = enemy). Options were: derive it from the
   generator's side; keep it purely caller-supplied data; or derive it strictly with no override.
   **✅ DECIDED 2026 (project owner): derive it from the generator's side (`tileVersionFor`), KEEPING
   the explicit `spec.version` override.** The override exists because the source allows a **terrain
   effect** to create tiles — a generator that is not a placed unit at all, and which is `"neutral"`.
   A strict no-override derivation could not express that at all. The boss has **no id** and so is not
   derivable; if it ever generates, the caller states the version. An unknown id derives **nothing**
   (the caller falls back to `"allied"`), so no affiliation is ever invented for a unit the grid does
   not know — and T6 changes no pre-T6 outcome.

10. **T8's scope, and where the "every 3 Burn hits" counter lives.** The three triggers were to be
    built together, but **T8 applies statuses and 9 of the 10 named tile-effect statuses do not exist**
    (`applyStatus` throws on an unknown id). **✅ DECIDED 2026 (project owner):** build the trigger
    **MECHANISM + trigger (b)**, data-driven, **populated with Overburn only**; the undefined statuses
    stay a **T11** gap. Triggers **(a)** and **(c)** are deferred with reasons. For **(c)**, the counter
    lives **per-UNIT on the unit's own state**, not in a per-tile map — *"for every 3 times they take
    Burn damage"* is about the UNIT, and it carries no tile dimension.
11. **Tile effects on the ENEMY that owns them (holder-side) — still deferred.** Unchanged from
    `docs/research.md` §3.33 / `docs/dolls/vector.md` G14: the MVP has no enemy-side neighbours, so
    Overburn's *"allies within 1 tile"* and Overheat Combustion's area clauses remain **DEFERRED** and
    are NOT part of T8.

12. **T11 — how far to push the nine statuses?** All nine ARE defined in the source (T11 fetched
    their `effectDetails`), but only three map onto mechanics the engine already has. **✅ DECIDED 2026
    (project owner): implement the currently-expressible subset and record the rest as blocked with
    reasons — do NOT invent mechanics to force them.** Defining Stability Loss I (taken-side Stability
    modifier), Frozen (mobility), Damp (healing-received), Congestion (heal-blocked) or Paralysis
    (a denial variant that also blocks BASIC attacks) would each be a new engine feature with its own
    semantics, and Meltdown needs an incoming-skill-type gate the engine deliberately lacks. These are
    engine-capability gaps, **not** evidence gaps — so re-investigation will not unblock them.

13. **T9 — whose data, and where do the two gates live?** Both T9 clauses are **Vector's** (FK5 is a
    Fixed Key; the immunity is a Perception Block passive), but **Vector is not registered** (backlog
    B4) and a partial registration would approximate her kit — which the project rules forbid.
    **✅ DECIDED 2026 (project owner):** build the **MECHANISM** (the *"while on a tile"* query plus
    **both** gate shapes) and exercise it with **fixtures**; **Vector's VALUES wait on B4**. Shapes:
    FK5's reduction goes on a **new `KeyDef` field** (`damageReductionWhileOnTile`), following the
    FK2/FK3/FK4/FK6 precedent of one explicit key field per key; the immunity goes on a
    **`PassiveEffect` kind** (`tile_debuff_immunity`), matching that it IS a passive.

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
2. **Two duration values** — `initialRounds` (**2**) for the FIRST tile created at a position, and
   `resetRounds` (**3**) for every SUBSEQUENT addition there. This was first read as a one-round
   source conflict; the project owner **clarified it as a rule** (two values for two different
   events — see §5 Change 1, and `research.md` §3.23.1). Kept as two fields so they can never be
   collapsed.
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

**Tests:** `src/test/tiles.test.ts` (12) — empty map on build; `tileKey` keying; the map is
PER-GRID-STATE (not a shared/module-level map); tiles are independent of static terrain; base (1
element) vs fusion (2 elements) expressible; all three levels and all three versions; the generator
is recorded; **the two durations are independent and belong to two different EVENTS** (the exact
failure that collapsing them would cause); **`level` is capped at 3, so the rule that additions at
Level 3 cannot level a tile is representable**; `durationLeft` is a live counter distinct from
either constant; **a scope guard asserting NO tile-rule functions exist yet**; and a guard that
slice 9's `AreaShape` vocabulary is intact (tiles will reuse it for generation areas).

**Evidence status:** none of this is `Validated`. The *rules* remain `[SOURCE]` (community guide,
hierarchy level 5) per `research.md` §3.23; M1 adds only structure, covered by tests. Engine
**783 pass / 0 fail**; CLI output byte-identical (14,581 / 7 actions).

### T2 / M2 — unit-on-tile query — **DONE 2026**

**Delivered** (pure helpers in `src/engine/grid.ts`, vocabulary type in `src/model/grid.ts`):
- `TileOccupant` = `{kind:"ally",unitId}` | `{kind:"enemy",unitId}` | `{kind:"boss"}` — identity
  only, no position, and the boss deliberately has **no id** (`BossPlacement` has none).
- `occupantsOnTiles(state, tiles)` — the primitive: distinct occupants on any of a tile set.
- `occupantsAtTile(state, tile)` and `occupantsInArea(state, origin, shape, radius)` — thin
  wrappers over it (the latter reuses `areaTiles`, so areas share the targeting vocabulary).
- `tilesOccupiedBy(state, occ)` — the reverse direction.

**The three cases, and why one query covers them.** Allies live in `placements`/`allyTiles` (1×1),
grid enemies in `enemyUnits[].coord` (1×1 props), and the **boss in neither** — it is
`boss.center` + footprint. The boss case is the entire reason the slice exists: a `placements`-only
lookup misses the dummy, and the dummy is the only enemy the MVP is observable against
(`docs/dolls/vector.md`; §4 above). A dedicated test pins that a placements-only scan fails.

**Decisions/choices (and their basis):**
1. **Footprint-aware, not center-only.** The boss reports on **every** footprint tile, matching the
   tiles `buildGrid` marks `enemyTiles`. This is the plan's approved wording ("footprint-aware"),
   and it is what "who is standing on this tile" means physically for a 3×3 body.
2. **Occupancy ≠ range origin.** Explicitly kept separate: occupancy spans the footprint, while the
   range origin stays the **center** tile (`unitDistance`). Tests assert both at once so neither can
   drift into the other.
3. **Sets, not a single value.** `occupantsAtTile` returns an **array**. "One unit per tile" is a
   core rule (`docs/grid.md`), so a well-formed grid yields at most one; the array exists so a
   malformed config (overlapping `enemyUnits`, which `buildGrid` does not reject) reports the truth
   rather than hiding an occupant behind an **invented precedence**. No validation was added —
   `buildGrid`'s checks are unchanged, since T2 is a query slice.
4. **No mutation of the grid**, and no new validation — pure reads only.

**Out of scope, deliberately.** Whether a tile *effect* considers a unit "standing on" a
non-center footprint tile is **not** decided here — that is T8/T9's rule question and is flagged
there. T2 answers geography only.

**Tests:** `src/test/tile-occupancy.test.ts` (18) — the three cases; the boss found despite not
being in `placements` (the named regression); footprint-awareness (all nine tiles, and one tile
outside is empty); 1×1 boss = center only; out-of-bounds yields nothing; `tilesOccupiedBy` forward
and reverse incl. unknown ids; de-duplication of the boss across footprint tiles; stable ordering;
`occupantsInArea` diamond vs 3×3 (the shape changes the answer); out-of-bounds area; and purity
(no tiles created, no state mutated). A **mutation check** confirmed the footprint tests genuinely
fail when the boss is treated as center-only (3 tests failed), then were reverted.

**Evidence status:** none of this is `Validated` — it is pure geometry over the existing model, so
no game rule is asserted. The tile RULES remain `[SOURCE]` / Not Tested (`research.md` §3.23).
Engine **802 pass / 0 fail**; CLI output byte-identical (14,581 / 7 actions).

### T3 / M3 — tile generation + area targeting — **DONE 2026**

**Unblocked first.** §7 decision 5 was the gate on all tile *behaviour*: the guide said the feature
was CN-only, so modelling it risked building a subsystem nobody could play (a G14-style deferral).
**The project owner confirmed (2026, direct in-game evidence — hierarchy level 1) that the tile
feature IS live in global.** Decision 5 is therefore resolved: T3+ is real implementation. Note
what this does *not* do — it confirms the feature EXISTS on global; it leaves every rule VALUE at
`[SOURCE]`/Not Tested, and it does not settle the CN naming (decision 4).

**Delivered** in a NEW module `src/engine/tiles.ts` — deliberately the tile counterpart of
`stability.ts` (a focused runtime-subsystem module), keeping the split clean: `model/grid.ts` owns
the `TileEffect` value type, `engine/grid.ts` owns the state + pure geometry, and `engine/tiles.ts`
owns the rules that CHANGE that state.
- `TILE_INITIAL_ROUNDS = 2` / `TILE_RESET_ROUNDS = 3` / `TILE_BASE_LEVEL = 1`.
- `TileGenerationSpec` — `{ origin, shape, radius, elements, generatedBy, version? }`.
- `generateTiles(state, spec): GridCoord[]` — creates a tile on every **in-bounds** tile of the
  area, seeding each with the initial duration, and **returns the tiles it created**.

**Decisions/choices (and their basis):**
1. **A new module, not `grid.ts`.** `grid.ts`'s exports are pure (geometry/construction); generation
   MUTATES `state.tiles`. `stability.ts` / `cooldowns.ts` / `resources.ts` already establish the
   pattern of a focused runtime module. Side benefit: T1's scope guard (which asserts `grid.js` has
   no tile-rule functions) stays green and stays meaningful.
2. **Areas reuse `AreaShape` / `areaTiles`** (slice 9's vocabulary) unchanged — no second geometry
   path. Which shape an effect uses stays DATA per the resolved default (`numeric ⇒ diamond`,
   `NxN ⇒ square`); the engine asserts neither, so the [SOURCE] provenance is not laundered into a
   hard-coded assumption.
3. **Initial duration only.** Generation writes `initialRounds` (2) into `durationLeft` and stores
   `resetRounds` (3) untouched for the upgrade slices — the two values stay two values, per the
   owner's duration RULE. Generation never writes 3.
4. **An occupied tile is left UNTOUCHED.** The *"another tile effect is added at that same position
   → upgrade a level + reset duration"* clause belongs to the **upgrade** slice (T5). T3 pinning
   "untouched" is the slice boundary made explicit and testable — **T5 will replace that
   expectation** when it implements the clause (the test says so in its name).
5. **No terrain filter** (no invention). The source restricts generation by the AREA only, so
   generation lands on blocked tiles and on the boss footprint alike. Whether it *should* skip
   impassable terrain is unstated → recorded as §7 **decision 6**, **Not Tested**.
6. **Empty `elements` throws.** A tile's element set IS its identity (1 = base, 2 = fusion); an
   empty set has no meaning, so it is rejected at the boundary — matching `buildGrid`'s
   validate-and-throw style. The element array is **copied** in, so the tile cannot alias a caller's
   array.
7. **`version` defaults to `"allied"`** — the only version reachable in the MVP (no enemy generator;
   §8 non-goals) — but is overridable so T6 needs no signature change.

**Tests:** `src/test/tile-generation.test.ts` (18) — radius-0 = the origin; a numeric area is a
5-tile DIAMOND and `NxN` a 9-tile SQUARE (and the shape genuinely changes the set); duration init
= 2 with `resetRounds` stored as 3; level = 1; version default + override; provenance; 1-element vs
2-element tiles; the element list is copied (no aliasing); only-created is returned and generation
accumulates per state; the **T3 boundary** (an existing tile untouched); out-of-bounds creates
nothing; an edge-clipped diamond drops its off-grid arms; **no terrain filter** on blocked tiles or
the boss footprint; empty elements throws; the constants are 2/3; and a **scope guard** asserting no
upgrade/fusion/lifecycle/trigger functions exist in `engine/tiles.js` yet. A **mutation check**
(seed `resetRounds` as the new tile's duration; drop the occupied-tile guard) failed exactly the
duration and boundary tests, then was reverted.

**Evidence status:** the feature's existence is confirmed on global (**level 1**), but the **rules
are still `[SOURCE]`/Not Tested** — generation's shape/radius semantics and the absence of a terrain
rule are the guide's, not observed. Engine **820 pass / 0 fail**; CLI output byte-identical
(14,581 / 7 actions).

### T4 / M4 — the lifecycle (tile clock) — **DONE 2026**

**Delivered** in `src/engine/tiles.ts`:
- `resetTileDuration(effect)` — sets `durationLeft` to the tile's OWN `resetRounds` (3). This is the
  duration half of the layer's *"resets to 3 rounds"* on a subsequent addition, and at **Lv3** it is
  the entire *"only refreshes duration"* case.
- `tickTiles(state): string[]` — the end-of-round clock: decrements every tile's `durationLeft`,
  removes the ones that reach 0, and returns the **keys that expired**. Call it from `endOfRound`,
  exactly as `endOfRoundStability` is (it is NOT wired into the round loop yet — see below).

**Scope — the CLOCK, not the WHO.** The slice boundary decided here is the important part:

1. **T4 owns TIME; T5 owns LEVELLING.** The layer's clause is *"upgrades one level **and** its
   duration resets"* — two halves with different evidence. `resetTileDuration` ships the time half
   alone, explicitly, so T5 composes `reset + level bump` instead of rewriting duration logic. This
   also keeps T4 entirely free of the element-matching question (*"the **same** element"* levels a
   tile), which belongs to T5's evidence — so nothing here guesses at it.
2. **No `applyEffects` callback.** `tickTiles` never decides **who** a tile affects. Applying the
   tile's debuffs is the trigger slices (T8: *"remain on the area after ending their action"*; T9:
   *"while on a tile"*). Adding a callback now would invent a signature for a rule that is not yet
   established. T8 can take the tile's occupants at its own call site via `occupantsAtTile` (T2).
3. **Round-scoped clock** (like `endOfRoundStability`), not holder-action-scoped: a tile is
   terrain with its own clock, and every duration the source states is in *turns/rounds*.
4. **Copy-then-delete** (`[...state.tiles]`) so the loop stays correct when a future `applyEffects`
   mutates the same map — no reliance on `Map` iteration-under-deletion semantics.

**NOT wired into the simulation turn loop — deliberately.** Ticks + expiry are meaningless until a
tile can *do* something (T8), and a tile applied by nothing expiring changes no damage number. Wiring
it now would add unexercisable code with no test able to observe it end-to-end. It becomes observable
in the same slice that gives tiles an effect.

**Tests:** `src/test/tile-lifecycle.test.ts` (16) — one tick = one round; the full initial lifetime
(generate → 1 tick alive → 1 tick expired, i.e. **exactly 2 rounds**); removal from the map at 0;
`tickTiles` returning only the keys that expired THIS tick; empty map; **independent expiry**; the
refresh setting `durationLeft` to 3; the refresh being driven by the tile's own `resetRounds` field
(not a hard-coded 3) — **mutation-checked**; the refresh prolonging life across the tick that would
have killed the tile; the reset **not** changing the level; the **Lv3 "only refreshes duration"**
case; refresh on a **fusion** tile without disturbing its element set; the tick touching only the tile
map (placements/allyTiles/terrain untouched); the tick creating nothing; and a scope guard asserting
T4's two functions exist while T5/T7/T8's do not. A second **mutation check** (off-by-one expiry)
failed 8 tests, then was reverted. T3's scope guard was **advanced deliberately** — `tickTiles` moved
from its "must not exist" list to being positively asserted by T4.

**Evidence status:** the **clock itself is `[SOURCE]`/Not Tested** — that a tile's duration counts
down by rounds, and that expiry removes the tile, is the guide's statement, not an in-game
observation. Engine **836 pass / 0 fail**; CLI output byte-identical (14,581 / 7 actions).

**Next:** T6 / M6 — versioning semantics (Allied / Enemy / Neutral), then T8 (the triggers).

### T5 / M5 (+ M7) — Tile Upgrade + Polyphase Fusion — **DONE 2026**

**Scope change first.** The project owner directed that fusion be **pulled forward into T5** rather
than left for T7: the upgrade and fusion rules share one core (*"generate onto the same tile"*) and
one call site, so splitting them would have meant writing the addition rule twice. **M7/T7 is
absorbed**; the slice plan reflects it.

**Evidence — a re-transcription of the source found MORE than the repo had recorded.** The guide has
a **"Polyphase Fusion List"** and a **replacement-protection clause** that the earlier pass missed:
- **8 fusible pairs**, not 4: the four Burn pairs *plus* `Corrosion+Hydro`, `Electric+Hydro`,
  `Electric+Corrosion`, `Freeze+Hydro`. Only **Electric+Freeze** and **Corrosion+Freeze** are NOT
  listed (i.e. not fusible) — the previous "7 of 10, missing Corrosion+Freeze / Electric+Freeze"
  note undercounted the pairs. Recorded in `research.md` §3.23.4/§3.23.6.
- *"A tile that has been **upgraded** is also **protected from being replaced** by new elemental
  tiles that cannot fuse with the base element."* — implies a **non-upgraded base tile CAN be
  replaced**, a case nothing in the repo previously covered.
- The four non-Burn pairs' **effect text** is a **recorded gap** (pair membership is authoritative;
  the effects are not transcribed because nothing yet needs them — engine stores only element set +
  level).

**Delivered** (`src/engine/tiles.ts`):
- `FUSIBLE_PAIRS` + `isFusiblePair(a, b)` — the guide's list as **data**, order-insensitive,
  like-with-like excluded (that is an upgrade).
- `TILE_MAX_LEVEL = 3`.
- `TileAdditionOutcome` (`created` | `upgraded` | `fused` | `replaced` | `protected`) and
  `TileAdditionResult { tile, outcome }`.
- `applyTileAddition(effect, spec)` — **the rule, in evaluation order**:
  1. **shared element → LEVEL UP** (cap 3; at Lv3 only the clock refreshes). This is also how a
     **fusion** tile levels: *"either of the original fused elements can be used"* — a shared element
     is exactly that, so one branch covers both.
  2. **fusion tile → PROTECTED**: *"won't be overwritten if there is an attempt to generate a third
     element"*. Its own elements still level it (case 1), so disjoint elements do nothing.
  3. **fusible pair → FUSION**, carrying BOTH elements and **PRESERVING the level** (*"the resulting
     fusion tile will start at the existing tile's upgrade level"* — fusion neither resets the level
     nor grants a free one).
  4. **disjoint + non-fusible** → **upgraded ⇒ PROTECTED**, **base ⇒ REPLACED** (incoming element,
     Lv1 — the owner decision, §7 decision 7).
  **Every** mutation resets the duration (the `resetTileDuration` T4 exposed — T5 composes it, never
  re-implements it) and records `generatedBy`/`version` (the guide: the version *"can be changed
  depending on the last unit that generated"*).
- `generateTiles` now **returns `TileAdditionResult[]`** and routes occupied positions through
  `applyTileAddition`. Empty positions still create base tiles at the initial duration.

**Choices:**
1. **One core function, two rule paths.** Upgrade and fusion are branches of `applyTileAddition`, not
   two exported functions — matching the merge decision and keeping one place where "generate onto an
   occupied tile" is defined.
2. **Fusion preserves the level deliberately** (not reset, not +1): the source is explicit, and both
   wrong readings are mutation-checked.
3. **Replacement's Lv1 + duration 3 is an INFERENCE** (owner decision 7) and is marked as such in
   code + docs — the only non-source value in this slice. The pair table is NOT inferred.
4. **Element order kept deterministic** (existing element first). Order is *not significant*
   (`TileEffect` doc), but the engine must not depend on caller order.
5. **`generateTiles`' contract changed** (occupied tiles are now acted on; a richer return type).
   This **supersedes T3's slice boundary**, whose "left untouched" test was rewritten to pin the new
   contract. No other T3/T4 guarantee was touched; nothing was weakened to make T5 pass.

**Tests:** `src/test/tile-upgrade.test.ts` (28) — the 8 fusible pairs order-insensitively; the two
non-pairs not fusible; like-with-like never fusible; level-up Lv1→Lv2→Lv3 with the cap; Lv3 refresh;
duration reset on every path; fusion carrying both elements; **fusion preserving the level** (Lv2 base
→ Lv2 fusion) and starting at Lv1 from a base; **either** fused element levelling to Lv3; a fusion
tile **protected** from a third element; order determinism; **non-fusible replacement** on a base tile
(both non-pairs) vs **protection** on an upgraded one (Lv2 and Lv3); replacement producing a
single-element base tile that can then level; per-tile outcomes across an area; empty positions still
creating with the initial duration; and a scope guard (T6/T8 still absent). **Mutation checks:**
fusion resetting the level → **6 failures**; protecting every tile instead of only upgraded ones →
**4 failures**; both reverted. T3's superseded boundary test was rewritten (test count unchanged).

**Evidence status:** all four rule branches are `[SOURCE]` (guide, level 5) / **Not Tested**; the
replacement's level/duration is an **inference** (owner decision 7). Engine **864 pass / 0 fail**;
CLI output byte-identical (14,581 / 7 actions).

**Next:** T8 / M8 — the three tile triggers (on-generation / end-of-action-on-tile / every-3-Burn-hits
counter), which is where tiles start changing damage and where wiring `tickTiles` into the turn loop
becomes testable.

### T6 / M6 — versioning — **DONE 2026**

**Scope.** The version says which **side** a tile's effects land on (*"These correspond to the source
that created the tile"*, *"set by whichever unit last generated onto the tile"* — §3.23.1). T5 already
implemented the *update* semantics (every mutating addition re-stamps `version`; `protected` leaves it
alone), so T6's work is the **vocabulary** and **how a version is determined**. What a version
*actually does* (*"Enemy versions swap which units are targeted; neutral versions apply all
effects"*) is **applying** the tile's debuffs — the trigger slices' job (T8/T9) — so T6 determines the
label and stops.

**Delivered:**
- `model/grid.ts`: the named **`TileVersion`** type (`"allied" | "enemy" | "neutral"`) + **`TILE_VERSIONS`**,
  and `TileEffect.version`/`TileGenerationSpec.version` now use it (one vocabulary, no inline unions).
- `engine/tiles.ts`: **`tileVersionFor(grid, generatorId)`** — derives the version from the generator's
  **side**, reading the engine's existing structural split rather than inventing an affiliation field:
  a **placed ally** (`grid.placements`) → `"allied"`; a **grid enemy** (`grid.enemyUnits`) → `"enemy"`;
  an **unknown id** → `undefined` (no affiliation invented). Plus the private
  **`resolveVersion(state, spec)`** = `spec.version ?? tileVersionFor(...) ?? "allied"`, now the single
  place the version is decided — used by the create path and all three mutating paths in
  `applyTileAddition` (which therefore takes `state`).

**Choices (owner decision 9):**
1. **Derive from the generator's side** — the most faithful reading of *"corresponds to the source"*,
   and it reuses structure the engine already has. An `affiliation` field on `UnitState` was NOT added:
   the engine deliberately has none, and inventing one to serve tiles would be mechanics invention.
2. **Keep the explicit `spec.version` override.** The source allows a **terrain effect** to create
   tiles — a generator that is not a placed unit at all and cannot be derived. A strict no-override
   derivation could not express it. This is also what makes `"neutral"` reachable.
3. **Unknown id ⇒ no derivation.** The caller falls back to `"allied"`, which is exactly T3–T5's
   behaviour, so **T6 changes no existing outcome** (proved: the whole pre-T6 suite passes untouched).
4. **The boss is not derivable** — `BossPlacement` carries no id (`TileOccupant` doc), and T6 does not
   synthesise one.
5. **`"enemy"` is modeled but unreachable in play** (no enemy generator exists; §8 non-goals). It is
   exercised by tests rather than by combat — the same treatment as the other model-all-three
   decisions.

**Tests:** `src/test/tile-versioning.test.ts` (16) — the three-version vocabulary; an ally generator →
allied and a grid enemy → enemy; unknown id derives nothing and falls back to allied; the **boss is
not derivable** (no id is invented for it, checked against several guesses); derivation reads structure
not name (two ids differing only by collection); the explicit override (incl. overriding an id that
WOULD derive differently, and each of the three values); the **last generator wins** in both
directions; **every** mutating path re-stamps the version; a **protected** tile keeps its version AND
provenance; a fusion tile re-stamps when levelled by a fused element; an area generation stamps the
same version on all 9 tiles; and a scope guard (no trigger/effect-application functions). **Mutation
checks:** dropping the enemy branch → **7 failures**; ignoring the override → **3 failures**; both
reverted. T5's scope guard was **advanced deliberately** (`tileVersionFor` moved from "must not exist"
to positively asserted by T6).

**Evidence status:** `[SOURCE]`/Not Tested — the feature exists on global (level 1), but *which*
version a generator produces is the guide's rule. Engine **880 pass / 0 fail**; CLI byte-identical
(14,581 / 7 actions).

### T8 / M8 — tile triggers: **trigger (b)**, the tile-effect data table, and the loop wiring — **DONE 2026**

**Scope (project owner decision 10).** The three triggers were inventoried; only **(b)** is built.
The blocker is real and was found by investigation, not assumption: **T8 applies STATUSES, and 9 of
the 10 named tile-effect statuses do not exist** (`overburn` is the only one), while `applyStatus`
**throws** on an unknown id. A literal "all three triggers" slice would therefore have required
inventing the nine undefined statuses — which the project rules forbid. So T8 delivers the
**mechanism + trigger (b), data-driven, populated with Overburn only**, and records the rest as gaps.

**Delivered:**
- **`src/data/tile-effects.ts` (new)** — the tile-effect **DATA** table: which statuses a tile applies,
  keyed by the tile's element set (order-insensitive) + level via `tileEffectKey`/`tileEffectsFor`.
  This is source CONTENT, deliberately separate from the (generic, element-only) tile RULES. Only the
  Burn tile is recorded. Each entry lists `applies` (statuses which EXIST — only `overburn`) plus
  **`pendingStatusIds`** — the source's other named statuses (Conflagration / Combustion /
  Combustion II) recorded as **explicit, machine-visible gaps** rather than silently dropped.
  An unrecorded (element set, level) returns `undefined` ⇒ **apply nothing**, which is the state of
  every fusion tile and every non-Burn tile today.
- **`engine/tiles.ts`**: `tileAppliesToUnit(version, targetIsAlly)` — T6's deferred *"what a version
  DOES"* (allied → enemies, enemy → allies, neutral → everyone); `tileEffectSource(effect)` — a
  provenance label derived from element set + level (never a CN name); and
  **`applyTileEffectsOnActionEnd(state, unit, isAlly)`** — trigger (b). It reuses **T2's**
  footprint-aware occupancy query, applies each distinct tile effect once, and passes the status's
  **applier**.
- **`simulation.ts` wiring**: the trigger fires in `endOfOwnTurn` (the point the source names) and
  **`tickTiles` is now wired into `endOfRound`** — T4's clock, which shipped unwired because it was
  unobservable. `tickTiles` + expiry now actually run.
- **`GridConfig.initialTiles` (scripted scenario seed)** — see the wiring note below.

**The APPLIER rule (found by a failing end-to-end test, and a real gap).** The source's fixed damage
is *"equal to X% of the **applier's** ATK"*, and the engine's fixed-damage path returns early when a
status has **no applier** (`if (!applier) return`). So a tile-inflicted status needs one: the applier
is the unit that **generated** the tile (`effect.generatedBy`). If that id names no real allied unit
(a scripted/terrain generator), the status is still applied but its applier-ATK damage is **inert** —
**no ATK is invented**. This surfaced only because the first end-to-end test asserted real damage;
the unit-level test had passed while the loop silently did nothing.

**WIRING — made testable, and why that mattered.** A **mutation check** (commenting out the trigger
call) initially **broke no test**: the wiring was correct but **unobservable**, because nothing could
put a tile on the grid during a simulation — no skill/passive generates tiles yet and no scenario
seed existed. Per the project owner, `GridConfig.initialTiles` was added: a **scripted, deterministic
scenario affordance mirroring the existing `GridConfig.moves`** — explicitly **NOT a game mechanic**
(no rule says a battlefield starts with tiles) and labelled as such in the type. Each entry creates a
tile exactly as generation would (elements, level, initial duration, version, optional `generatedBy`).
Re-running the same mutation now **fails** the end-to-end test, so the wiring is genuinely covered.
Consequently `TILE_INITIAL_ROUNDS`/`TILE_RESET_ROUNDS` moved to `model/grid.ts` (re-exported by
`engine/tiles.ts`) to avoid a `grid → tiles` import cycle.

**Choices:**
1. **Data table in `data/`, not the engine** — the rules are generic; *what a Burn tile debuffs you
   with* is content. Keeps the CN-name risk (§7 decision 4) in data.
2. **`pendingStatusIds` rather than silent omission** — the gap is recorded where the data lives.
3. **Applier = the tile's generator**, resolved only to a real allied unit (no invented ATK).
4. **One application per distinct tile effect** — a 3×3 boss straddling nine same-type tiles applies
   once, not nine times.
5. **`initialTiles` is a test/scenario affordance**, stated plainly in its doc so no future reader
   mistakes it for a mechanic.

**NOT built (recorded gaps, not oversights):** **trigger (a)** on-generation damage (needs the
damage-application side of generation, and the fusion tiles that use it are unrecorded); **trigger
(c)** *"for every 3 times they take Burn damage"* (needs a Burn-damage event stream and its counter);
the **9 undefined statuses** (**T11**); every **fusion tile's** applied-status set; and the *"applies
Burn weakness"* clause of every tile (**T10** — `weaknessElements` is immutable today).

**Tests:** `src/test/tile-triggers.test.ts` (23) — the version targeting rule (allied/enemy/neutral
against both sides); the data table's keying, order-insensitivity and per-level durations; the pending
statuses are genuinely undefined while every `applies` entry resolves in the registry; unrecorded
tiles apply nothing; trigger (b) end-to-end on the dummy; the 2-round duration; TILE provenance; a
unit off-tile; allied-does-not-debuff-ally vs enemy-does; neutral affecting both; **footprint-aware**
firing from a non-center footprint tile; **single application** across nine same-type tiles;
unrecorded-tile inertness; **an end-to-end simulation** (dummy stands on a seeded Burn tile, Overburn
damage appears as status ticks — the test that covers the WIRING); a no-tiles control; tile
**tick/expiry** across a 6-turn run; and a scope guard for (a)/(c). **Mutation checks:** trigger wiring
removed → **1 failure** (the end-to-end test — this is the check that previously passed silently);
neutral targeting neutered → **2 failures**; both reverted.

**Evidence status:** the clause is `[SOURCE]` (community guide, level 5) / **Not Tested**. Engine
**903 pass / 0 fail**; CLI byte-identical (14,581 / 7 actions).

**Next:** T9 / M9 (tile-gated effects) — or T10 (runtime weakness), which are independent.

### T11 / M11 — the missing tile-effect statuses — **PARTIALLY DONE 2026** (3 defined, 6 blocked)

**The evidence problem dissolved; an ENGINE problem remains.** The plan warned each status *"needs its
OWN evidence — the guide names them but does not fully define them"*, predicting a stall. It did not
stall: **T11 re-fetched the same primary records the name-resolution used** (`dandegate.net/effects/<uuid>`,
what the guide's `[effect:…]` tokens resolve to) and extracted their **`effectDetails`** — so **all nine
now have real definitions** (`research.md` §3.23.2 carries them verbatim).

What actually blocks six of them is that the engine **lacks the mechanic**, not the definition.

**Defined (3) — expressible with EXISTING mechanics, no invention:**
| Status | Definition | Mapped to |
|---|---|---|
| **Conflagration** | Burn damage taken +20% | `damage_modifier {scope:"taken", mode:"additive", whenElement:["burn"]}` |
| **Combustion** | on gain + action end: self (+ allies within 2 tiles) take fixed dmg **15%** of inflictor ATK, **max 3 stacks**, cannot be dispelled | `fixed_damage {percentOfAtk:0.15, applies:["onApply","onTick"]}`, `maxStacks:3`, `purgeable:false` |
| **Combustion II** | same at **3-tile radius**, **20%**, **max 5 stacks** | `percentOfAtk:0.2`, `maxStacks:5` |

This **empties the Burn tile's `pendingStatusIds`** — the gap T8 recorded, closed.

**Blocked (6) — recorded with their exact block, NOT half-implemented (owner decision 12):**
| Status | Block |
|---|---|
| **Stability Loss I** | *"Stability damage taken is increased by 1 point"* — no **taken-side** Stability modifier exists (`stability_damage_bonus` is dealt-side only) |
| **Frozen** | *"Movement is decreased by 1 tile"* — no mobility mechanic at all (Movement Up I is already RECORDED-ONLY for the same reason); its 2-stack conversion target **Frigid** is also unmodeled |
| **Damp** | *"Reduces healing received by 40%"* — no healing-received modifier; converts to Congestion |
| **Paralysis** | *"disallows the use of **basic attacks and** active skills"* — `deny_skills` blocks only active/ult, and **extending it would change Overheat's established semantics** (which denies active skills only) |
| **Congestion** | *"Cannot be healed"* — no heal-blocked mechanic |
| **Meltdown** | *"if this unit takes damage from a **basic attack or active skill**"* — no **incoming-skill-type** gate (`whenCategory` distinguishes AoE/targeted, not basic/active) |

**Two numeric/behavioural points the source leaves OPEN — flagged, not invented:**
1. **Does Combustion's fixed damage scale per stack?** The record states the **cap** (3 / 5) and never
   the **scaling**. The engine's `fixed_damage` applies its percentage **once** regardless of stacks, so
   that reading is kept (an engine change here would also touch Overburn's validated fixed damage).
   Recorded in each status's `deferredNote`.
2. **The holder-side area portion** (*"self AND all allies within a 2/3-tile radius"*) is **DEFERRED**
   (§3.33 / **G14**) exactly like Overburn's analogous clause — the MVP has no enemy-side neighbours and
   no enemy-side damage sink, so it is unobservable. The **self** portion is modelled; the area portion
   is recorded in `deferredNote`.

**Choices:**
1. **`element`, but NO `phase`.** The records tag these `[Burn, Debuff]` and say *"Considered a Burn
   debuff"* — that is a **classification** (`element`), NOT the in-game-validated status→Phase
   relationship that `phase` marks (only Overburn→Burn has one). Populating `phase` would invent a
   Phase Strike interaction.
2. **`purgeable` follows the text exactly**: Combustion/Combustion II are *"cannot be dispelled"* ⇒
   `false`; Conflagration says no such thing ⇒ `true` (matching the existing convention that only
   textually un-cleansable statuses are `false`).
3. **Blocked statuses are NOT defined at all** — a scope-guard test asserts their absence, so a future
   session cannot quietly add a half-implementation.
4. **`verified: false` on all three.** The field's contract (`src/model/types.ts`) is that unverified
   values are **surfaced (warnings)** rather than silently assumed. These come from the community
   database's records, **not our own in-game observation**, so they declare themselves unverified —
   matching `extra_command`'s precedent (also "NOT in-game validated"). Marking them `true` would have
   silently claimed validation. **Caught and corrected during this slice's own review** — the first
   draft had `verified: true`, and the test that was supposed to guard it did not actually assert the
   flag; both were fixed and the flag is now mutation-checked.

**Tests:** `src/test/tile-statuses.test.ts` (15) — the three exist as Burn debuffs; **no `phase` is
invented** (while Overburn's stays); Conflagration's exact effect shape; **its +20% applies to a Burn
hit and NOT to phase-less/Hydro ones, exercised through the real `additiveTakenBonus` path the damage
code uses**; Combustion/Combustion II percentages, tick points, caps and un-dispellability; the
stack-scaling question is recorded in `deferredNote`; the holder-side area clause is recorded with its
owning deferral; registry resolution; **`verified: false` asserted on all three (with Overburn as the
`true` control)**; every Burn level applies its full set with **nothing pending**; an end-to-end tile
application carrying tile provenance; and a scope guard for the six blocked ids. **Mutation checks:**
Conflagration magnitude 0.2→0.3 → **2 failures**; Combustion II percentage 0.2→0.3 → **1 failure**;
Combustion `verified` false→true → **1 failure**; all reverted. The existing `count-by-classification`
affiliation guard was **updated deliberately** (its list pins exactly which statuses carry a
source-stated classification, and the three now legitimately do).

**Evidence status:** `[SOURCE]` (community database records, level 5) / **Not Tested** — stronger
provenance than the guide's prose, but still not our own in-game observation. Engine **919 pass /
0 fail**; CLI byte-identical (14,581 / 7 actions).

**Next:** T9 / M9 (tile-gated effects) or T10 (runtime weakness) — both independent. The six blocked
statuses need **engine mechanics**, so they are a mechanism backlog, not a re-investigation task.

### T9 / M9 — tile-gated effects — **DONE 2026** (mechanism; Vector's values wait on B4)

**Scope (owner decision 13).** Both T9 clauses are **Vector's** — FK5 is a Fixed Key, the immunity is a
Perception Block passive — and **Vector is not registered** (backlog B4). A partial registration would
approximate her kit, which the rules forbid. So T9 ships the **MECHANISM** and exercises it with
**fixtures**; her VALUES land with B4.

**Delivered:**
- **`tileElementsUnderOccupant(grid, occ)`** (`engine/grid.ts`) — the *"while on a tile"* query: which
  tile ELEMENTS an occupant stands on. Reuses T2's footprint-aware `tilesOccupiedBy`, so a 3×3 boss
  reports the union across its tiles. **Deliberately VERSION-AGNOSTIC** — it answers *"what is
  underfoot"*, not *"is this unit being affected"*; version targeting stays at the application site
  (`tileAppliesToUnit`). Folding the two together would make every future *"while on"* clause
  side-dependent.
- **`hasTileDebuffImmunity(unit, tileElements)`** (`engine/tiles.ts`) — the **source-property** gate
  for Perception Block Lv.1 clause 1, reading a new **`PassiveEffect { kind: "tile_debuff_immunity";
  elements }`**. Consulted in `applyTileEffectsOnActionEnd` **after** the version gate, so it only ever
  blocks a tile that would have debuffed the holder.
- **`keyTileTakenReduction(unit, tileElements)`** (`engine/tiles.ts`) — FK5's taken-side reduction,
  reading a new **`KeyDef.damageReductionWhileOnTile { value, elements }`**, resolved through the
  established **equipped-key** pattern and multiplied into the **existing** `red` term of the taken
  chain (no separate bucket). Wired at the one call site (`targetPassiveTakenMods`).

**Choices:**
1. **Two different shapes, because they are two different things.** A KEY's effect belongs in key data
   (one explicit field per key — the FK2/FK3/FK4/FK6 precedent), and an IMMUNITY that IS a passive
   belongs on `PassiveEffect`. The `displacementImmunityWhenStatuses` idiom was NOT reused: that gate
   is *holder-status-conditioned*, whereas this one is **source-conditioned** (the debuff came from a
   tile), so it is enforced at the tile-application site instead.
2. **Both gates are DATA** — element lists and magnitudes are declared, never hardcoded, so no element
   or value is assumed.
3. **Immunity is declared, never assumed** — no passive, no tile underfoot, or an empty element list
   ⇒ not immune.

**HONEST LIMIT — FK5's gate is INERT end to end in the MVP** (stated in code + docs, not hidden):
`dealDamageHit` only ever targets the training **dummy** (which carries no Fixed Keys), and the one
path where a **doll** takes damage (`applyReactiveDamage`) subtracts raw HP **without** consulting the
taken-reduction chain. It therefore becomes live the moment a doll can be a damage target — the same
honest state as skill denial vs bosses (`research.md` §3.31). It is tested **directly** instead.
The **immunity IS observable**, because the dummy can carry the passive and tiles can debuff it — and
that path is covered end to end.

**Tests:** `src/test/tile-gated-effects.test.ts` (22) — the query's basics, empty answers, footprint
union, de-duplication, **version-agnosticism** and purity; the immunity predicate (element match,
ANY-match, list-as-set, declared-not-assumed cases); **the immunity END TO END** (an immune holder
takes nothing from a neutral Burn tile that DOES debuff a non-immune holder — the paired control);
element-specificity; the gate-ordering guard (an allied tile is skipped by VERSION, not credited to the
immunity); FK5's ×0.8; off-tile / wrong-element / unequipped cases; magnitude and element lists as DATA;
multiple keys multiplying; and guards that **no production data references either gate yet** and that
**Vector remains unregistered** (B4 owns her values). **Mutation checks:** immunity never matching →
**1 failure** (the end-to-end test); FK5's sign flipped (reduce → add) → **4 failures**; both reverted.

**Evidence status:** both clauses are `[SOURCE]` (Vector's kit record, from the community guide) /
**Not Tested**. Engine **941 pass / 0 fail**; CLI byte-identical (14,581 / 7 actions) — **no behaviour
change**, as expected for a mechanism whose only consumer is unregistered.

**Next:** T10 / M10 (runtime weakness application), then T12 (Vector's clauses end-to-end, which needs
her registered).
