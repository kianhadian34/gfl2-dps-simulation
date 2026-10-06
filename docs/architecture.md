# GFL2 Combat Simulator — Proposed Architecture (MVP)

Status: proposal, awaiting approval. Follows handoff §19–§21: accuracy-first, data-driven, engine independent of UI, nothing out-of-scope built "just in case".

---

## 1. Principles

1. **Data-driven combat.** Character behavior lives in game-data JSON (skills, effects, keys). The engine interprets effects generically — no `if character == "X"` anywhere.
2. **Engine ⊥ UI.** The combat engine is a pure library: `state in → actions → state out`. CLI and future web UI only render.
3. **Explicit simulation state.** All mutable values (HP, Stability, Confectance, cooldowns, buffs/debuffs, per-round counters) live in one `SimulationState`; nothing global.
4. **Explicit determinism.** A single injected RNG object (seeded) is the only randomness source. Same inputs + same seed ⇒ same result.
5. **Config over constants.** Every value the research could not confirm (U1–U18 in `docs/research.md`) is a scenario/config key with a documented default, never a magic constant in code.
6. **Accuracy-first.** Features are added only when they can be validated (§5). Out-of-scope mechanics (cover, movement, AI, enemy actions) are not modeled.
7. **No Cover in the MVP.** The target is **always No Cover** (dummy `cover` is fixed `"none"`). **Stability + Exposed are mandatory mechanics**; **Cover is explicitly deferred** — cover damage reductions and the stability-cover 60% reduction (§6) are never modeled, so no cover-dependent term can fire.

---

## 2. Layers (handoff §20)

```
                 CLI  /  Web UI (later)
                         │
                         ▼
                  Simulation API        ← scenario in, results out, no game knowledge
                         │
                         ▼
                   Combat Engine         ← pure, deterministic, UI-free
                    /            \
                   /              \
            Game Data (JSON)   Scenario (JSON)
                                   │
                              Training Dummy
```

- **Game Data** — static library of characters, weapons, skills, effects, statuses, keys (versioned JSON).
- **Scenario** — one run: team selection (+builds: weapon, keys, calibration), dummy config, turn count, APL config, RNG seed, config overrides (e.g. `exposedDurationRounds`).
- **Combat Engine** — runs the sim; emits a structured combat log + results. No formatting, no I/O (other than reading its inputs).
- **Simulation API** — thin facade: `simulate(scenario, gameData) → results`. CLI (`gfl2sim simulate scenario.json`) is a 20-line wrapper.
- **Web UI** — deferred to handoff Phase 7; never contains calculations.

---

## 3. Module breakdown (engine internals)

| Module | Responsibility |
|---|---|
| `state` | `SimulationState` + per-unit `CombatUnitState`; the only mutable world |
| `turns` | Round/action ordering, per-round counter resets, deterministic order |
| `actions` | Basic Attack / Active / Ultimate / Passive trigger / Support attack resolution |
| `damage` | The damage pipeline (§6) incl. crit, defense, weakness |
| `stability` | Stability damage, break/expose, recovery (**fixed 2-turn window: broken through N/N+1, restored at START N+2 — U4/U6, non-configurable**). No-Cover boss domain: no universal stability damage reduction (generic rule is Cover-scoped); **boss-specific stability-conditional passives implemented generically** via `DummyConfig.passives` (conditional taken modifiers, e.g. −80% while stability > 0 → ×0.20; research §3.7) |
| `effects` | Generic effect engine: stat mods, damage mods, reductions, status apply/remove, resource gain, cooldown change, additional action, conditionals, fixed damage |
| `cooldowns` | Per-skill cooldown state + decrement timing — **confirmed: wait N full turns after the cast turn** (default `nextOwnTurnEnd`; alternative `endOfOwnTurn` selectable for testing only) |
| `resources` | Confectance gauge, gains/costs (event-driven, per skill data) |
| `rng` | Seeded RNG object (split-mix like, injectable) |
| `apl` | Action-priority interpreter (§8) |
| `log` | Structured event records (§9) |
| `results` | Aggregations: total damage, dmg/round, dmg/action, per-character, per-source |

Deliberately **not** present: map, movement, cover (**explicitly deferred** — the target is always No Cover), high ground, AI, enemy turns, encounter logic.

---

## 4. Explicit simulation state (handoff §6)

```text
SimulationState
├── rng                (seeded, explicit)
├── turn               (big-round counter)
├── phase              (resolution phase, for tick ordering)
├── units[]            (player dolls, ordered; dummy is a unit of kind "dummy")
│     └── CombatUnitState
│           ├── hp / maxHp
│           ├── stability / maxStability / exposed
│           ├── confectance
│           ├── cooldowns { skillId → turnsRemaining }
│           ├── statuses[] (active buffs/debuffs + stacks + duration + caster)
│           ├── modifiers (resolved stat/damage multipliers snapshot per phase)
│           ├── perRoundCounters (e.g. supportAttacksLeft)
│           └── actionsThisTurn
├── pendingEvents      (queue: damage, status, resource, support-trigger…)
├── combatLog[]
└── results (accumulators)
```

Phases within a round (deterministic, fixed order — §7).

---

## 5. Action flow

1. APL picks the next action for the active unit (based on cooldowns, Confectance, buffs, targets).
2. Validate availability (cooldown 0, Confectance ≥ cost, action budget ≥ 1).
3. Resolve the action: **pre-hooks → damage/status application → post-hooks (e.g. Confectance gain, support-attack triggers) → subtract Confectance cost → apply cooldown → decrement action budget**.
4. Support attacks and other passive triggers enqueue through `pendingEvents` (fired after the current action, never recursively from another support attack).

---

## 6. Damage pipeline (from `docs/research.md` §3.1 — the only damage code path)

```text
raw        = unit.finalATK  × skill.multiplier          (or fixedDamage → separate branch)
mitigated  = raw × finalATK/(finalATK + finalDEF)
bonus      = 1 + Σ additiveBonuses                       (dmg-up, vuln — one bracket; no generic Confectance bonus — U10 disproven)
phase      = 1.0 (always)                                  (NO elemental counter wheel in GFL2 — corrected 2026, docs §3.4; weakness matching is the only element interaction)
weakness   = 1 + 0.10 × (# exploited weaknesses)   (+2 stab per weakness, applied in stability module; Burn ×1.10, Burn + AR ×1.20 confirmed in-game — U20; separate factor, outside the additive bracket)
reduction  = (1 − stabilityReduction) × (1 − damageReduction)   (stabilityReduction is COVER-deferred → 1.0 in MVP; target always No Cover)
crit       = rng.roll(effCritRate) ? (1 + effCritDmg) : 1.0   (effCritRate = min(CritRate, 100%); effCritDmg = Crit DMG + passive-driven 1:1 overflow conversion — U19 confirmed; CDMG linear: 1.20@120%, 1.235@123.5%; configOverrides.critMultiplier = test-only alternative)
final      = ceil( mitigated × bonus × weakness × reduction × crit )
fixed      = ceil(absolute fixed component)                  (U21: added POST-chain with its own ceil — never scaled by the chain; normal path unchanged)
total      = normalChainFinal + fixed                        (total game damage = ceil(normal) + ceil(fixed))
```

Uncertain entries (U4, U7, U8, U13, U14, U15…) are read from scenario config, not hardcoded; resolved unknowns are invariants (e.g. U3 — no universal Exposed multiplier). Modifier order within the pipeline is grouping-based (per research), so the engine documents the group order and does not claim a beta-era written order.

---

## 7. Turn loop (deterministic ordering)

```text
for round in 1..N:
    for each unit in teamOrder (APL/config):
        reset per-round counters (support quotas, actionsThisTurn = 1)
        while unit has action budget and APL yields an action:
            resolve action (see §5)            # event-driven: damages, statuses, resources
        end of unit's action phase → tick own-turn durations, cooldowns (config tick)
    end of round → round-end ticks (DoT if configured roundEnd, stability recovery)
```

The dummy never acts. All random draws go through `rng` in a fixed call order (draws only when needed → stable seeds).

---

## 8. APL (action priority)

- Built in as a small interpreter over skill predicates: `condition → action`, evaluated top-down.
- Default (documented as a model assumption, research U12):

```text
if ultimate available (Confectance ≥ cost)
    use ultimate
else if active skill available (cd 0, budget 1)
    use active (prefer active1, else active2)
else
    basic attack
```

- Extensible shape for later (research §12 of handoff), e.g.:

```json
{ "if": "dummy.hasStatus(\"burn\")", "then": "active1" },
{ "if": "ultimate.available",        "then": "ultimate" }
```

- MVP implementation: data-declared list of `{condition, action}`; conditions limited to a small whitelist (cooldown/confectance/status present).

---

## 9. Combat log & results

Every action appends a structured event (handoff §14):

```json
{ "turn": 4, "round": 2, "unit": "qiongjiu", "action": "common_rail",
  "target": "training_dummy",
  "baseDamage": 1200, "critical": true, "weakness": ["heavy_ammo"],
  "stabilityDamage": 5, "finalDamage": 1842,
  "confectance": { "before": 4, "after": 1 },
  "statusesApplied": ["overburn"], "statusesExpired": [] }
```

Results aggregate from the log (never recomputed): total damage, damage/full-team-round, damage/action, per-character and per-source (basic/active/ultimate/passive/support/DoT) breakdowns (handoff §15).

---

## 10. Determinism & testing

- `Scenario.seed` → engine RNG. Test suite asserts byte-identical logs for identical inputs (golden tests).
- Validation tests mirror handoff §17: fixed character/weapon/dummy configs with expected damage/stability values; expected numbers come **only** from in-game observation or confirmed formulas (`docs/research.md` §6) — SQLite-style fixture table. Where a value is UNKNOWN, tests assert the config slot is honored, not an invented number.
- Uncertainty-driven tests: a "config override" test per U-item proving the engine obeys the override (e.g. `exposedDurationRounds` changes the broken-window flag timing exactly).

---

## 11. Open decisions (user-owned, needed at implementation kickoff, not blocking these docs)

1. **Implementation language/runtime** — environment has Node 22; TypeScript is the natural fit (typed data model), but this is the user's call.
2. **First validation character(s)** — candidate: Qiongjiu (琼玖), whose full kit (multipliers, stab values, Confectance, keys, support rules) is documented at CONFIRMED level in `docs/research.md` and is the best first test case.
3. **Whether "auto-battle AI replication" or "user-defined rotation"** is the primary sim mode — APL defaults differ (`ultimate>active>basic` vs explicit rotation).

## 11a. Weapon Attachment system — discovery report (2026, DOCUMENTATION ONLY)

**Status:** discovery/documentation stage + **Attachment Set DEFINITIONS now recorded as data (2026)**. The confirmed structure lives in `docs/research.md` §3.19; the open questions are tracked as **U22** in `docs/research.md` §4. The 15 confirmed Attachment Sets are implemented as **DATA ONLY** — `AttachmentSetDef` (`src/model/types.ts`) + `src/data/attachment-sets.ts` + `src/test/attachment-sets.test.ts`. **The engine does NOT consume them** (no attachment inventory, stat rolls, rarity, generation, or Muzzle set participation). This section is the architectural assessment of where the system would integrate once its remaining rules/values are known.

**Where attachment-related functionality currently exists:** the **set definitions only** (`src/data/attachment-sets.ts`, `AttachmentSetDef` type, `attachment-sets.test.ts`). Everything else is absent. Prior to this, the only mentions were incidental notes that attachments are a future **Crit-Rate source** (`docs/research.md` §4 U19 / §5 item 2 — "CR-raising attachment sources").

**Attachment configuration model (CONFIRMED 2026, `docs/research.md` §3.19):** each weapon has **exactly 4 slots** (Muzzle / Sight / Foregrip / Underbarrel), each holding **at most ONE configuration**; **a slot may be empty** (no stats). **Attachment stats are USER-CONFIGURABLE** — the user selects which stats an attachment has (rather than the sim defining every combination), with **per-slot maxima** (Muzzle 4 / others 3) and **unique stats within an attachment**. **Muzzle is the only slot that can use Crit Damage**; the other three use the shared non-Crit-Damage pool. This means the data shape is a **per-slot list of selected stats**, not a library of pre-built attachment variants.

**Existing structures that would most likely be extended (assessment, not a decision):**
- **`WeaponDef`** (`src/model/types.ts`) — the weapon already owns `subStats` (`pctAtk`/`pctHp`/`pctDef`), `calibrations`, `ownerCharacterId`, `imprint`, `trait`. A `WeaponDef.attachments`-style block is one natural extension point.
- **`ScenarioTeamMember`** (`src/model/types.ts`) — the equip boundary today carries `weaponId`, `calibrationLevel`, `commonKeyIds`, `equippedFixedKeys`, `expansionKeyId`, `affinityKeyId`. Since attachment stats are **user-configurable per run**, a per-member per-slot field (e.g. `attachmentStats?: Partial<Record<slot, stat[]>>`) is the analogous extension. **The representation (embedded in `WeaponDef` vs per-member user selection) is NOT decided** — both fit the confirmed config model.
- **`Registry`** (`src/data/registry.ts`) — the confirmed model (user-selected stats, no pre-built variants) means a per-variant registry table is likely **not** needed; only the stat list + per-slot maxima are fixed data (which can live as constants).
- **`makeDoll` / `computePanel`** (`src/engine/state.ts`) — the ONE stat-aggregation path. Attachment **stat** contributions must fold here, into the existing **flat bucket** (`computePanel`'s flat args) or the existing **percentage buckets** (`atkPct`/`hpPct`/`defPct`), plus Crit Rate / Crit DMG (already panel stats). **Bucket assignment RESOLVED (in-game 2026, `docs/research.md` §3.19): flat stats (`Attack`/`Health`/`Defense`) → the flat bucket; `Boost (%)` stats → the percentage buckets.**
- **A set-bonus resolution step** — the closest existing analog is the Pattern Remolder **set-bonus** machinery (`RemolderSetBonusDef` + `resolveRemolderUnit`/`resolveRemolderTeam` in `src/engine/remolder.ts`), which already models "N items in a category → activate a set bonus" and a team-level grant pass. Attachment sets ("3 same-set attachments → bonus") are structurally similar and could reuse that pattern — **but the attachment set rules beyond the confirmed 3-piece activation are UNCONFIRMED**, so no reuse decision is made.

**What is already reusable:**
- The **single panel path** (`computePanel` + `finalStat`) and the **shared flat/percentage buckets** — attachment ATK/HP/DEF/Crit Rate/Crit DMG stats need no new stat math, only a new source folded into the existing buckets (the project has done this four times: Dispatch, Remolder flats, Neural Helix, Affinity flats).
- The **"separate permanent stat source" pattern** (`resolveNeuralHelixFlat` / `resolveAffinityFlat` — a resolver helper shared by the panel path and the Blossom raw-ATK basis, with consistent gating) — a ready template for a future `resolveAttachmentStats`.
- The **set-bonus activation pattern** (Remolder sets) as a structural reference for attachment sets.
- The **registry + reusable-definition pattern** (`CommonKeyDef`/`getCommonKey`, `WeaponDef`/`getWeapon`) if attachments are reusable definitions.
- The **debug-authoritative / controlled-fixture gating** contract (`applyDispatchStats`, `baseStatOverrides`, `overridesAuthoritative`) — a new permanent source must decide how it interacts with controlled math fixtures.

**Information still required before implementation can safely begin (blocking):**
1. **Set rules & values** — the set-bonus effect(s) beyond the confirmed 3-piece activation, how many sets exist, each set's membership, whether a set bonus stacks/can activate more than once, and whether attachments from different sets may coexist across the 4 slots.
2. **Stat semantics** — ✅ **RESOLVED (in-game 2026, `docs/research.md` §3.19):** the un-suffixed "Attack/Health/Defense" are **FLAT** (flat bucket); the "…Boost (%)" are **PERCENTAGE** (percentage buckets); Crit Rate / Crit DMG are the panel stats the engine already models.
3. **Values & ranges** — ✅ **RESOLVED (2026, `docs/research.md` §3.19):** the simulator uses **MAX-STAT attachments only** — Attack +72 · Attack Boost (%) +11.4% · Health +162 · Health Boost (%) +11.4% · Defense +48 · Defense Boost (%) +11.4% · Crit Rate +15% · Crit Damage (%) +15%. **Random rolls / stat ranges / sub-maximal values / roll generation are deliberately NOT modeled** (competitive-simulation scope decision).
4. **Rarity / tier system** — ✅ **N/A (2026):** NOT modeled — the simulator uses fixed max-stat attachments only; no rarity/tier system is represented.
5. **Generation/roll rules** — ✅ **N/A (2026):** NOT modeled — stats are **user-configured** (the user selects which stats an attachment has); no roll generation exists.
6. **Inventory/configuration model** — ✅ **RESOLVED (2026, `docs/research.md` §3.19):** 4 slots, one configuration per slot, **empty allowed** (no stats), user-selected **unique** stats, per-slot maxima (Muzzle 4 / others 3), Muzzle-only Crit Damage. **The remaining sub-question is the DATA REPRESENTATION** (embedded in `WeaponDef` vs a per-member user selection) — not the model itself.
7. **Stacking/interaction** — how attachment stats combine with the weapon's own `subStats`/Calibration/Effect/Trait/Imprint, and with the permanent stat systems (Dispatch/Remolder/Neural Helix/Affinity).
8. **Panel folding** — ✅ **RESOLVED (2026, `docs/research.md` §3.19):** each stat's bucket is confirmed (flat → flat bucket; `Boost (%)` → percentage buckets; Crit Rate / Crit DMG → panel crit stats). No new bucket is needed.
9. **Muzzle** — ✅ **RESOLVED (2026, `docs/research.md` §3.19):** the Muzzle is the **only** slot that can use Crit Damage (%) and is **excluded from Attachment Sets**; its Crit Damage enters the panel crit-DMG stat (additive).
10. **Evidence/validation plan** — ✅ **PARTIAL (2026):** flat-vs-% semantics + max values are validated (§3.19). Remaining: an in-game reading confirming the **folded panel delta** once folding is implemented (per Evidence → … → In-Game Validation).

**Architectural concerns:**
- **Ownership/representation model** — the confirmed **config model** (user-selected stats per slot) narrows this: the remaining decision is whether the per-slot selected stats are stored on the **weapon** or as a **per-member** user selection (the repo precedent — Common Keys are per-member selections, not character-embedded — suggests the per-member model, but it is not decided).
- **Set-bonus timing** — attachment set bonuses are evaluated per weapon/character; if they can be team-wide (like Remolder Unity grants), a team-level pass is needed; if strictly per-character, a per-unit pass suffices. UNCONFIRMED.
- **Fixture gating** — every existing permanent stat source has an explicit gating contract for controlled math tests; the attachment source must define its own (and the controlled-fixture suites must NOT be re-baselined by accident).
- **Crit-Rate interaction** — attachments are an expected Crit-Rate source; the engine already caps effective Crit Rate at 100% and converts overflow only via character passive data (U19), so attachment Crit Rate must flow through that existing cap, not a new one.
- **UI** — attachments add per-weapon selection UI (4 slots); the current Setup screen has a weapon detail card and slot/picker patterns that could host it, but this is out of scope until the data model is fixed. **Intended future UI behavior (high level, from the confirmed config model — NOT implemented):** each slot displays its available stats; selected stats are visibly enabled/checked; the UI prevents selecting more than the slot's maximum (Muzzle 4 / others 3) and prevents duplicate stats by construction; changing selections immediately changes the simulated attachment stats once implementation exists.

## 12. Future phases (deferred, per handoff §19)

Phase 6 optimization (compare builds/teams, search) and Phase 7 web UI are explicitly deferred until the engine is validated. Nothing in this architecture precludes them (engine/API boundary already isolates UI).