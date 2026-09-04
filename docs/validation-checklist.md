# GFL2 Combat Simulator — Validation Checklist (MVP, Qiongjiu vs Training Dummy)

Status: validation mode · 2026-09-03 · Built from `docs/research.md` (§4 uncertainty register + §5 in-game test plan) against the implemented engine (commits `a8f69ca`, `99340e5`, `c2a1ba7`).

Legend: **CONFIRMED** = verified by a primary source or reproduced in-game during research · **UNVERIFIED** = research says so but the exact value/rule is not confirmed — must be overridable, never hardcoded as fact · **PROBABLE** = single reliable secondary source · **NOT IMPLEMENTED** = deliberately deferred, out of MVP scope.

**MVP scope constraint (2026-09-03):** the target is **always No Cover** (dummy `cover` fixed `"none"`); **Stability + Exposed are mandatory mechanics**; **Cover is explicitly deferred** — cover damage reductions (35/30/25/20%) and the stability-cover 60% reduction are recorded in research but never modeled.

---

## 1. Mechanic-by-mechanic checklist

| # | Mechanic | Status | Model knob (overrides) | Where tested |
|---|---|---|---|---|
| 1 | Damage pipeline: `raw → ATK/(1+DEF/ATK) → (1+Σ additive) → phase → weakness → reductions → crit → ceil` | CONFIRMED (formula reproduced: 1213 ATK, 194 DEF, ×1.1 → 1151) | — | `src/test/damage.test.ts` |
| 2 | Skill multiplier as % of final ATK | CONFIRMED (Qiongjiu 0.8/1.5/1.1/0.9) | — (data) | `src/data/qiongjiu.ts`, integration test |
| 3 | One additive bracket for all damage bonuses | CONFIRMED | — | `damage.test.ts` (1.35 bracket) |
| 4 | Defense term `ATK/(1+DEF/ATK)` | CONFIRMED | dummy `defense` | `damage.test.ts`, `stability.test.ts` |
| 5 | Phase countering ×1.2 / ×0.8 | CONFIRMED rule; **wheel relations UNVERIFIED** | not configurable (resolves neutral 1.0 + warning) | `damage.test.ts` (multipliers), warning in every run |
| 6 | Weakness exploit: factor = **1 + 0.10 × #exploited weaknesses** (+2 stab each) — **additive across weaknesses**, separate factor (NOT in the additive DMG bucket); Burn ×1.10 → 1091 and **Burn + AR ammo ×1.20 → 1191 confirmed in-game; multiplicative ×1.21 ruled out (U20 2026-09-03)** | CONFIRMED (in-game) | dummy `weaknesses` (count-driven; V6 no-cover +10% not yet in character data — passed explicitly in regression) | `damage.test.ts`, `stability.test.ts`, `weakness-validation.test.ts` |
| 7 | Critical multiplier = attacker's Crit DMG stat, **linear**: ×1.20 at 120% CDMG (Basic crit 635), ×1.235 at 123.5% (crit 654); applied to **unrounded** damage before final ceil. **Crit Rate: 100% effective cap; overflow converts 1:1 only via character-specific passive** ("every 1% of overflow critical rate is converted to 1% critical damage" — in-game passive text, 2026-09-03) | **CONFIRMED (in-game — U1 + U19 CDMG half; CR cap/overflow CONFIRMED via passive text)**: engine derives `1 + critDmg`; overflow via data-driven `excess_crit_conversion` passive (no global rule, no character-id logic) | `configOverrides.critMultiplier` = test-only alternative hypothesis; conversion params live in character passive data | `crit-validation.test.ts`, `critdmg-validation.test.ts`, `crit-overflow-validation.test.ts`; U19 remainder (CR sources, exact per-character params, numeric damage confirmation) OPEN |
| 8 | Glancing (擦伤) — **REMOVED 2026-09-03 (U2, beta artifact)** — no longer a modeled mechanic | REMOVED (tombstone) | — | research.md §3.6 / register tombstone |
| 9 | Ceiling rounding of final damage; crit applied to the underlying unrounded product (never to the rounded normal hit) | CONFIRMED (in-game 2026-09-03; ATK-1956 case discriminates 634 vs 635) | — | `damage.test.ts`, `crit-validation.test.ts` |
| 10 | Fixed-damage branch (no DEF, no crit) | PROBABLE | — | `damage.test.ts` |
| 11 | Stability as separate resource; per-hit fixed stability damage | CONFIRMED — **never alters damage on a No-Cover target** (in-game Burn test had 65/65 stability; formula matched with no stability term) | dummy `stability`, skill `stabDamage` (data) | `stability.test.ts` |
| 12 | Break → Exposed state | PROBABLE; **U3 damage-% UNKNOWN, U4 duration UNCERTAIN (beta 2)** | `configOverrides.exposedDamageMult`, `exposedDurationRounds` | `config-override.test.ts` (U3/U4) |
| 13 | Stability recovery — **2-turn delay after break (break Turn N → restored Turn N+2), restore to max (U6 CONFIRMED 2026-09-03)**; Exposed damage-% (U3) stays UNVERIFIED | CONFIRMED (timing) | engine `STABILITY_RECOVERY_DELAY = 2`; `configOverrides.exposedDamageMult` | `stability-recovery.test.ts` |
| 14 | Panel formula `(Σ flat) × (1 + Σ pct)` | CONFIRMED | — | `integration.test.ts` (panel) |
| 15 | Weapon ATK at proficiency 60 (53 → 369) | CONFIRMED values; **per-level curve UNVERIFIED** (linear interp) | weapon `atkLvl1/atkLvl60/level` (data) | `integration.test.ts` |
| 16 | Buff/debuff statuses, durations in rounds | CONFIRMED (existence); **U7 tick point UNKNOWN, U8 refresh-vs-stack UNKNOWN** | `configOverrides.statusOverrides.<id>.tickAt` / `.durationRounds` | `config-override.test.ts` (U7, duration) |
| 17 | Support Boost I/II per-stack additive value & duration | **UNVERIFIED** (data defaults 0.05/0.10, 1 round) | `configOverrides.statusOverrides.support_boost_i/ii.perStackValue/durationRounds` | `config-override.test.ts` |
| 18 | Overburn status | applied 2 rounds (CONFIRMED text); **effect values UNVERIFIED** (modeled with no effect + warning) | `configOverrides.statusOverrides.overburn.*` | warnings assert; applied in log |
| 19 | Skill cooldown values (0/1/2) + **U11 decrement CONFIRMED 2026-09-03: wait N full turns after the cast turn (CD-1: cast T1 → unavailable T2 → available T3)** | CONFIRMED | `configOverrides.cooldownModel` — default `nextOwnTurnEnd` (confirmed); `endOfOwnTurn` alternative selectable for testing only | `config-override.test.ts` (U11), `rotation.test.ts`, `cooldown-validation.test.ts` |
| 20 | Confectance: event-driven gains (−1/damage dealt), cost settled after cast | CONFIRMED | — | `confectance.test.ts` |
| 21 | Confectance max (6) & battle-start (3) values — **CONFIRMED in-game 2026-09-03 (no keys)**; +1 per damage event; ultimate cost 3 | CONFIRMED | engine defaults 3/6; `configOverrides.confectanceMax` / `confectanceStart` = alternative testing | `confectance-validation.test.ts`, `confectance.test.ts` |
| 22 | Confectance damage-bonus table — **NOT PRESENT / DISPROVEN 2026-09-03**: repeated in-game attacks showed damage unchanged across rising Confectance; the beta (+5%/10 pts, +50% cap) claim removed | DISPROVEN (current Qiongjiu/MVP) | none — Confectance modeled purely as a resource (no multiplier) | `confectance-validation.test.ts` |
| 23 | Keys: FK1 battle-start +3 Confectance | CONFIRMED | `equippedFixedKeys` | `confectance.test.ts` |
| 24 | Support attack: 90% ATK + 2 stab, max 3/round, no chain, no cost | CONFIRMED; **range assumption UNVERIFIED** (assumed in range) | ally team composition | `support.test.ts` |
| 25 | 1 main action/round; basic ⊻ skill; extra actions deferred | CONFIRMED | — | `rotation.test.ts`, integration |
| 26 | Fixed-rotation interpreter (cyclic priority) | model assumption (user-defined; not game-verified, U12 not used) | `team[].rotation` | `rotation.test.ts`, `validation-cap.test.ts` (manual walkthrough) |
| 27 | Determinism (seeded RNG; same inputs ⇒ identical log) | engine guarantee | `seed` | `determinism.test.ts` |
| 28 | Duration cap: 1–7 turns, 8+ rejected (never clamped) | validation rule | `turns` (validated) | `validation-cap.test.ts` |
| 29 | Combat log reproduces every action vs an in-game test | engine guarantee | — | `integration.test.ts` (attackerAtk/targetDef/bracket), `--log` |
| 30 | Fixed Damage (U21) — **post-chain, independent ceil**: `ceil(normalChain) + ceil(fixed)`; bypasses DEF / damage-buff bracket / phase / weakness / reduction / crit | **CONFIRMED (in-game: Overburn 196 = ceil(10% × 1958 ATK), immune to Burn weakness and +20% No-Cover buff)**; DEF/crit/phase/reduction bypass SOURCE-SUPPORTED (untested in-game) | absolute `SkillDef.fixedDamage` (percentOfAtk data model deferred) | `damage.test.ts`, `fixed-damage-validation.test.ts` |

## 2. NOT IMPLEMENTED (deliberately out of MVP scope)

APL/auto-AI (U12), movement/positioning, **Cover — explicitly deferred** (incl. cover damage reductions 35/30/25/20% and the stability-cover 60% reduction), maps, enemy turns/AI, phase-wheel table (U15-adjacent), DoT damage effects for unverified elements (U16), extra actions, status purge/removal, durations > 7 turns.

## 3. Every UNVERIFIED value that affects Qiongjiu's simulation — override coverage

| Value | Default | Override location | Warning surfaced |
|---|---|---|---|
| Crit multiplier (U1 + U19 CDMG half — RESOLVED) | derived `1 + Crit DMG` from attacker data (e.g. `1.2` at 120%, `1.235` at 123.5%) — **no hardcoded default** | `configOverrides.critMultiplier` (test-only alternative hypothesis) | warning only when an override is active |
| Exposed damage-% (U3) | 1.0 | `configOverrides.exposedDamageMult` | yes (when dummy can break) |
| Exposed duration (U4) | 2 | `configOverrides.exposedDurationRounds` | yes (when dummy can break) |
| Confectance max (U9 — RESOLVED) | 6 (confirmed) | `configOverrides.confectanceMax` | warn only when overridden |
| Confectance start (U9 — RESOLVED) | 3 (confirmed) | `configOverrides.confectanceStart` | warn only when overridden |
| Support Boost I/II value & duration | 0.05/0.10, 1r | `configOverrides.statusOverrides` | yes (note shows the override) |
| Status tick point (U7) | `ownActionEnd` | `configOverrides.statusOverrides.<id>.tickAt` | yes |
| Status applied duration (U8-adjacent) | per-skill data | `configOverrides.statusOverrides.<id>.durationRounds` | yes |
| Cooldown model (U11 — RESOLVED) | `nextOwnTurnEnd` (confirmed: wait N full turns after cast) | `configOverrides.cooldownModel` (alternative `endOfOwnTurn` for testing only) | warn only when the non-confirmed alternative is active |

All of these are honored by the engine **without engine code changes** — proofs in `src/test/config-override.test.ts`.

## 4. Manual walkthrough — fixed rotation (validation of behavior)

`examples/rotation-check.json` — 4 turns, rotation `["active1", "active2", "basic", "ultimate"]`:

```
Turn 1 → qiongjiu_common_rail        (Skill 1)
Turn 2 → qiongjiu_guide_to_victory   (Skill 2)
Turn 3 → qiongjiu_basic              (Basic)
Turn 4 → qiongjiu_pressing_momentum  (Ultimate — Confectance 6 ≥ cost 3)
```

## 5. Combat-log detail guarantee (per-action in-game comparison)

Every damaging `LogEvent` records: `round`, `turn`, `unit`, `action`, `attackerAtk`, `targetDef`, `baseDamage` (ATK × multiplier), `mitigatedDamage`, `additiveBlock` (`bonusBracket`), `phaseMult`, `weaknessExploited`, `reductionMult`, `critical`/`critMultiplier`, `stabilityDamage`, `targetStabilityAfter`, `exposed`, `finalDamage`, `confectance` before/after/cost, `cooldownAfter`, `statusesApplied`. This is sufficient to recompute any action by hand and diff it against an in-game screenshot/recording.

## 6. Validation evidence

- `npm test` → 90/90 pass (prior 92 − 2 Glancing tests removed).
- CLI: 7-turn example and 4-turn rotation walkthrough verified by hand (see report).
- 8+ turns rejected with a clear error message (CLI + engine tests).

## 7. Next smallest test — Exposed behavior (pins U3 / U4 / U6)

Engine-side Exposed mechanics are already covered (`stability.test.ts`, `config-override.test.ts` U3/U4: break → exposed flag, `exposedDamageMult` and `exposedDurationRounds` change post-break damage). What is still UNVERIFIED are the in-game **numbers**. The next smallest validation test (in-game, same methodology as the confirmed crit test):

1. **Setup** — Qiongjiu Lv.60 (record ATK & CDMG), dummy DEF (recorded) **No Cover**, no weaknesses, no buffs, Dummy Stability = small even number ≥ 2. Use Basic Attack (0.8 × ATK, physical, **stab 2** — known stability damage).
2. **Measure** — hit repeatedly while stability > 0; the hit that breaks stability still computes at pre-break level (research §3.5) → its damage is `D_pre`. Continue hitting while the dummy is Exposed → `D_post` (repeat ≥ 3×, no crits).
3. **Derive U3** — `exposedMult ≈ D_post/D_pre` comparing unrounded values (`ceil(pre × m)` pattern fit over several hits).
4. **Derive U4** — count rounds until damage returns to `D_pre` (window length; beta says 2).
5. **Derive U6 (recovery)** — ✅ **already CONFIRMED (2026-09-03)**: stability is restored exactly 2 turns after the break (restored to max, `STABILITY_RECOVERY_DELAY = 2`) — the remaining measurement is purely the **U3 damage-%**.
6. **Discriminator** — without break (stability higher than total stabbed damage), all hits must equal `D_pre`; the damage step-change must occur exactly at the break hit.

Result feeds `configOverrides.exposedDamageMult` / `exposedDurationRounds`, then a regression suite mirrors the crit one.