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
- **Scenario** — one run: team selection (+builds: weapon, keys, calibration), dummy config, turn count, APL config, RNG seed, config overrides (e.g. `exposedDamageMult`).
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
| `damage` | The damage pipeline (§6) incl. crit, defense, weakness, glancing |
| `stability` | Stability damage, break/expose, recovery (**confirmed 2-turn delay after break → restore to max**, research U6) |
| `effects` | Generic effect engine: stat mods, damage mods, reductions, status apply/remove, resource gain, cooldown change, additional action, conditionals, fixed damage |
| `cooldowns` | Per-skill cooldown state + decrement timing (configurable tick) |
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
bonus      = 1 + Σ additiveBonuses                       (dmg-up, vuln, confectance bonus — one bracket)
phase      = 1.2 | 0.8 | 1.0
weakness   = ∏ 1.1 per exploited weakness                 (+2 stab per weakness, applied in stability module; ×1.10 confirmed in-game for Burn 2026-09-03 — multiplicative, OUTSIDE the additive bracket)
reduction  = (1 − stabilityReduction) × (1 − damageReduction)   (stabilityReduction is COVER-deferred → 1.0 in MVP; target always No Cover)
crit       = rng.roll(critRate) ? critMultiplier : 1.0   (confirmed value = 1 + Crit DMG stat, e.g. 1.20 at 120%; engine default still 1.5 pending approved change)
final      = ceil( mitigated × bonus × phase × weakness × reduction × crit )
glancing   = config.glanceChance ? ceil(final × 0.1) : final
```

Uncertain entries (U1, U2, U3…) are read from scenario config, not hardcoded. Modifier order within the pipeline is grouping-based (per research), so the engine documents the group order and does not claim a beta-era written order.

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
- Uncertainty-driven tests: a "config override" test per U-item proving the engine obeys the override (e.g. `exposedDamageMult` changes break-turn damage exactly).

---

## 11. Open decisions (user-owned, needed at implementation kickoff, not blocking these docs)

1. **Implementation language/runtime** — environment has Node 22; TypeScript is the natural fit (typed data model), but this is the user's call.
2. **First validation character(s)** — candidate: Qiongjiu (琼玖), whose full kit (multipliers, stab values, Confectance, keys, support rules) is documented at CONFIRMED level in `docs/research.md` and is the best first test case.
3. **Whether "auto-battle AI replication" or "user-defined rotation"** is the primary sim mode — APL defaults differ (`ultimate>active>basic` vs explicit rotation).

## 12. Future phases (deferred, per handoff §19)

Phase 6 optimization (compare builds/teams, search) and Phase 7 web UI are explicitly deferred until the engine is validated. Nothing in this architecture precludes them (engine/API boundary already isolates UI).