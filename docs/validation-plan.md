# Validation Plan — the post-MVP work (2026)

**Owning document for the ORDER of in-game validation.** It is deliberately separate from
`docs/validation-checklist.md`, which stays the pure **state register** (what is `Validated` /
`Mathematically Proven` / `Not Tested`, per claim). This file owns the **slices**: what to observe, in
what order, with what setup, and what the engine currently predicts.

**The states are defined in `docs/validation-checklist.md` §"Project-wide validation standard" and
`docs/research.md`. Do not restate them here — link.**

---

## 0. How a slice works

Every slice follows the same loop. **I can do steps 1, 3 and 5; only you can do step 4.**

1. **Setup** — I produce the exact in-game configuration (character state, target, action) and a
   ready-to-run scenario file, so the setup is reproducible rather than remembered.
2. **Predict** — I compute what the ENGINE currently predicts, with the hand-derivation shown
   (`ceil(base × multiplier × …)`). A prediction without a derivation is not usable — the whole point
   is to compare a specific number.
3. **Record the question** — the smallest meaningful claim level (checklist §"Record at the smallest
   meaningful claim level"), so a partially-confirmed mechanic is recorded as partial.
4. **Observe in-game** — your step. Screenshot / recording / stated number.
5. **Reconcile** — I diff observation vs prediction and record the outcome in the states register:
   **agree** ⇒ the claims upgrade (with the evidence cited); **disagree** ⇒ a documented discrepancy,
   investigated, **never silently resolved** (checklist source-hierarchy rule).

**Controls are mandatory.** Each slice names its control (e.g. non-crit vs crit, with/without the
element) because a single number cannot discriminate between two models — the standard requires a
contrast that rules the alternatives out.

**Slices are ordered by BLOCKING POWER**, not by size: earlier slices unblock later ones.

---

## 1. The headline situation

The **original MVP is essentially fully validated** — every U-item (U1–U22) is closed and Qiongjiu's
kit, the damage pipeline, weakness, crit, stability, AWU, keys, weapons and attachments are
`Validated` / `Mathematically Proven`. **All unvalidated work is what was added SINCE**, in three
blocks:

| Block | Built by | Evidence today |
|---|---|---|
| **Elemental tiles** | T1–T11 (`docs/tiles.md`) | **`[SOURCE]` level 5 throughout.** The duration RULE is the project owner's level-1 statement, but no tile behaviour has been observed |
| **Vector's kit** | B4 (`docs/dolls/vector.md`, `src/data/vector.ts`) | **Base stats `Validated`** (in-game character sheet); **every behaviour `Not Tested`** |
| **The V4 vocabulary** | rework slices 1–13 (`docs/research.md` §3.24–§3.34) | Semantics are `[GAME]` (project-owner statements = level-1 *inputs*); **no claim is in-game *tested***. Several mechanisms have no reachable trigger in the MVP (see §4) |

---

## 2. Slice list

`V` = a validation slice. Ordered to front-load blocking power.

| # | Slice | What it unblocks | Needs |
|---|---|---|---|
| **V1** | **Vector's panel + damage multipliers** | Confirms her registration is arithmetically right, and gives the baseline every later Vector slice is measured against | Standard fixture; no tiles |
| **V2** | **Vector's passive — Confectance behaviour** (clauses 4 & 5) | Her strongest non-tile mechanic; clause 5's 2 extra slots is user-provided level-1 evidence that has **never been observed** | Confectance at/over max; V5 for clause 5 |
| **V3** | **Tile generation + duration** | Almost all of Vector's remaining kit AND every other tile slice depends on tiles behaving as modelled | A tile-generating effect (see §3 opening note) |
| **V4** | **Tile debuffs on a unit standing on one** (trigger (b)) | The applied-status sets; the Burn tile's real effect | V3 (tiles must exist) |
| **V5** | **Tile upgrade + fusion** | T5's whole rule set (the 8 fusible pairs, level preservation, replacement-vs-protection) | V3 |
| **V6** | **Tile weakness application** (T10) | Whether *"applies Burn weakness"* is real, and at what magnitude | V3 |
| **V7** | **The V4 applied semantics** — one clause at a time where observable (§4 lists which) | §3.24–§3.34's `[GAME]`-stated semantics | Varies; some are unobservable (§4) |
| **V8** | **Record the UNOBSERVABLE set** | Stops "Not Tested" being read as "testable later" | Nothing — a documentation slice |

**Notes on ordering.** V1–V2 first because they need no tiles and confirm Vector is correctly
registered — everything about her kit is measured against those numbers. V3 gates V4–V6 (a tile must
exist before its behaviour can be checked). V7 is deliberately last among the *observable* work
because it is the most heterogeneous. V8 is a documentation slice, not an observation.

---

## 3. Slice detail — V1: Vector's panel + damage multipliers

**Claim level:** per-number, not per-ability (checklist: *"record at the smallest meaningful claim
level"*).

**Why first:** her base stats are `Validated`, but that is a *stat* read. Whether the engine turns
them into the right **panel** and the right **damage** is `Not Tested`. Everything else about her kit
is measured against these numbers, so an error here would contaminate every later Vector slice.

**Setup (no weapon, no dispatch, no Remolder — the cleanest isolation):**
- Team: Vector, rotation `["basic", "active1", "active2"]`, `applyDispatchStats: false`
- Target: training dummy, **DEF 5000**, stability high enough never to break, **no weaknesses**, No Cover
- **CRIT MUST BE SUPPRESSED** — see the Control note below; her base Crit Rate is 20%

**Engine predicts (derivation shown):**

`base = ATK²/(ATK + DEF) = 748²/5748 = 97.3389…`

| Action | Multiplier | Predicted | Derivation |
|---|---|---|---|
| Basic (Depressive Mentality) | 0.80 | **78** | `ceil(97.3389 × 0.80)` |
| Skill 1 (Dead End Meltdown) | 1.20 | **117** | `ceil(97.3389 × 1.20)` |
| Skill 2 (Portent of Doom) | 1.00 | **98** | `ceil(97.3389 × 1.00)` |

**CONTROL — this is the trap, and it actually happened while computing these predictions.** Seed 1
showed Skill 1 at **141**, not 117 — because that hit **crit** (`ceil(117.1 × 1.20) = 141`). A casual
comparison would have looked like a ~20% engine error and sent us chasing a non-existent bug.

**Therefore the fixture is pinned to `seed: 2`**, which produces the clean non-crit run:
`78 · 117 · 98` (total **293**). `examples/vector-validation-v1.json` ships with that seed. If a
different seed is used, the observation must still be a **known non-crit** hit (or a known crit with
the ×1.2 multiplier applied explicitly) — record which it was.

**What upgrades if it agrees:** Vector's Basic / Skill 1 / Skill 2 multipliers, and her registration's
panel arithmetic — each recorded as one claim with the cited observation.
**What stays `Not Tested` regardless:** every clause missing from her kit (the `deferredNote`s) — those
are absent by design, not unvalidated.

---

## 4. The UNOBSERVABLE set — record, do not chase

These **cannot** be `Validated` with the current MVP, by construction. They are NOT "pending": there
is no test that could ever pass. Recording them explicitly stops a future session from treating them
as a to-do.

| Item | Why unobservable |
|---|---|
| **FK5's tile damage reduction** | The damage path only ever targets the **dummy**, which carries no Fixed Keys; the doll-damage path bypasses the taken-reduction chain. Wired, tested directly, and **inert end to end** |
| **Burn-tile debuff immunity** (Perception Block clause 1) | Only bites against an **enemy/neutral** tile that would debuff the holder — and normal play has no enemy tile generator (only the scripted `GridConfig.initialTiles` seed) |
| **Skill denial's boss immunity** | An engine LAW; denial is inert against every enemy the simulator fights (bosses/dummies) |
| **Triggers (a) and (c)** | (a) needs an on-generation damage hook; (c) needs a Burn-damage event counter. Neither is implemented |
| **The 6 blocked T11 statuses** | Stability Loss I, Frozen, Damp, Paralysis, Congestion, Meltdown — each needs an engine mechanic that does not exist |
| **Vector's recorded-only clauses** | skill-level tile generation, skill Confectance gain, ability-sourced percent-of-ATK fixed damage, multi-enemy targeting, Emergency Support, "large target" (FK4), FK1/FK3, clauses 2–3, the 3 non-fixed keys, the signature weapon — each named with its block in her `deferredNote`s |
| **Holder-side (enemy-side) area targeting** | DEFERRED (G14) — no enemy-side neighbours and no enemy-side damage sink |
| **Cover** | Explicitly out of MVP scope (target is always No Cover) |
| **U12 auto-AI / U13 level cap / U16 element DoTs / U18 "Nixie"** | Open in the U-register; U12 is a labelled model assumption, U18 needs a term clarified rather than code |

**Rule:** if an item here ever gains the mechanic it needs, it MOVES to the slice list — it does not
become retroactively testable.

---

## 5. Status

- **V1 (Vector's panel + damage multipliers)** — planned, not yet observed.
- V2–V8 — planned; detail is added per slice when we reach it (each slice's setup depends on the
  previous slice's outcome).

**Next action:** run V1's observation, then reconcile.

---

## 6. Related documents

- `docs/validation-checklist.md` — the **state register** (claim-level `Validated` /
  `Mathematically Proven` / `Not Tested`) and the authoritative standards. **Owning doc for states.**
- `docs/research.md` — mechanics; §3.23 (tile rules, `[SOURCE]`), §3.24–§3.34 (the V4 vocabulary).
- `docs/tiles.md` — the tile subsystem's design + slice record; §10 records what is built and what is
  blocked, and why.
- `docs/dolls/vector.md` — her source record + §11 (registered vs recorded-only).
- `docs/project.md` — §6 (evidence record), §8 (backlog).
