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
| 4 | Defense term `ATK/(1+DEF/ATK)` (= `ATK/(ATK+DEF)`); **U14 RESOLVED — current boss DEF CONFIRMED in-game: 5,001 (target DATA, not a universal constant; future boss rotations = data updates)** | CONFIRMED | dummy `defense` (per-target) | `damage.test.ts`, `stability.test.ts`, `boss-def-validation.test.ts` |
| 5 | Element/Phase counter wheel — **DOES NOT EXIST (corrected 2026)**: GFL2 has no ×1.2/×0.8 elemental counter relationships; weakness matching is the only element interaction (validated: +10% dmg, +2 stab per exploited weakness). Engine has no counter factor (`phaseMultiplier` always 1.0; the old "phase wheel not populated" warning was removed) | REMOVED (erroneous premise) | — | `damage.test.ts` (premise-based ×1.2/×0.8 test removed; weakness multipliers unchanged) |
| 6 | Weakness exploit: factor = **1 + 0.10 × #exploited weaknesses** (+2 stab each) — **additive across weaknesses**, separate factor (NOT in the additive DMG bucket); Burn ×1.10 → 1091 and **Burn + AR ammo ×1.20 → 1191 confirmed in-game; multiplicative ×1.21 ruled out (U20 2026-09-03)** | CONFIRMED (in-game) | dummy `weaknesses` (count-driven; V6 no-cover +10% not yet in character data — passed explicitly in regression) | `damage.test.ts`, `stability.test.ts`, `weakness-validation.test.ts` |
| 7 | Critical multiplier = attacker's Crit DMG stat, **linear**: ×1.20 at 120% CDMG (Basic crit 635), ×1.235 at 123.5% (crit 654); applied to **unrounded** damage before final ceil. **Crit Rate: 100% effective cap; overflow converts 1:1 only via character-specific passive** ("every 1% of overflow critical rate is converted to 1% critical damage" — in-game passive text, 2026-09-03) | **CONFIRMED (in-game — U19 RESOLVED)**: engine derives `1 + critDmg`; universal 100% CR cap; overflow conversion via data-driven `excess_crit_conversion` passive (no global rule, no character-id logic); 1:1 ratio + non-1:1 + cap + no-passive paths **numerically locked** | `configOverrides.critMultiplier` = test-only alternative hypothesis; conversion params live in character passive data | `crit-validation.test.ts`, `critdmg-validation.test.ts`, `crit-overflow-validation.test.ts`. Data-population only remains: which characters carry such passives, exact params, CR-raising attachment sources |
| 8 | Glancing (擦伤) — **REMOVED 2026-09-03 (U2, beta artifact)** — no longer a modeled mechanic | REMOVED (tombstone) | — | research.md §3.6 / register tombstone |
| 9 | Ceiling rounding of final damage; crit applied to the underlying unrounded product (never to the rounded normal hit) | CONFIRMED (in-game 2026-09-03; ATK-1956 case discriminates 634 vs 635) | — | `damage.test.ts`, `crit-validation.test.ts` |
| 10 | Fixed-damage branch (no DEF, no crit) | PROBABLE | — | `damage.test.ts` |
| 11 | Stability as separate resource; per-hit fixed stability damage | CONFIRMED — **never alters damage on a No-Cover target** (in-game Burn test had 65/65 stability; formula matched with no stability term) | dummy `stability`, skill `stabDamage` (data) | `stability.test.ts` |
| 12 | Break → Exposed state | CONFIRMED (window): **U4 duration RESOLVED (fixed 2-turn recovery rule — broken through N/N+1, restored at START N+2)**; **U3 RESOLVED — no universal Exposed damage multiplier** | `configOverrides.exposedDurationRounds` (U4 testing knob only) | `config-override.test.ts`, `stability-recovery.test.ts` (U4 timing), `stability.test.ts` (U3 no-multiplier) |
| 13 | Stability recovery — **2-turn delay after break (break Turn N → restored Turn N+2), restore to max (U6 CONFIRMED 2026-09-03)**; no universal Exposed damage multiplier (U3 resolved) | CONFIRMED (timing) | engine `STABILITY_RECOVERY_DELAY = 2` | `stability-recovery.test.ts` |
| 14 | Panel formula `(Σ flat) × (1 + Σ pct)` | CONFIRMED | — | `integration.test.ts` (panel) |
| 15 | Weapon ATK at proficiency 60 (53 → 369) | CONFIRMED values; **per-level curve UNVERIFIED** (linear interp) | weapon `atkLvl1/atkLvl60/level` (data) | `integration.test.ts` |
| 16 | Buff/debuff statuses, durations in rounds | CONFIRMED (existence; durations big-rounds); **U7 RESOLVED 2026-09-03 (in-game, Attack Up II) — normal timed buffs tick at the recipient's action end; U8 RESOLVED — same-tier reapplication refreshes the duration and does NOT add a stack** (statuses with their own timing/stacking text remain status-specific) | `configOverrides.statusOverrides.<id>.tickAt` / `.durationRounds` (alternative testing only now) | `status-timing.test.ts` (U7/U8), `config-override.test.ts` (alternative-tick knob) |
| 17 | Support Boost I/II per-stack additive value & duration | **UNVERIFIED** (data defaults 0.05/0.10, 1 round) | `configOverrides.statusOverrides.support_boost_i/ii.perStackValue/durationRounds` | `config-override.test.ts` |
| 18 | Overburn status — **VALIDATED 2026**: fixed damage = 10% of the EFFECT APPLIER's ATK (ceil); triggers immediately on gain, then at the end of EACH of the holder's next two actions (the target's pass-turn), then expires; sequence 198/198/198 = 594 @ 1974 applier ATK; applier-ATK scaling confirmed (1000 → 100) | CONFIRMED (in-game 2026); implemented via `fixed_damage` status effect (`onApply`/`onTick`) + applier capture | `configOverrides.statusOverrides.overburn.*` (alternative testing) | `overburn-validation.test.ts` (sequence, expiry, applier ATK), warnings assert |
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
| 31 | No-Cover Stability behavior (U5 boss-domain) — **no universal No-Cover stability damage reduction** (Blaze Master 65/65 evidence; generic rule is Cover-gated and out of scope); **boss-specific stability-conditional passives IN SCOPE and implemented**: confirmed boss −80% taken while stability > 0 → ×0.20; inactive at Stability = 0; pre-hit break evaluation; reduction returns on U6 recovery; fixed damage bypasses it (U21); no universal Exposed multiplier (U3 resolved) | CONFIRMED (in-game boss passive) / implemented generically via `DummyConfig.passives` (no boss IDs) | `DummyConfig.passives` (U5) | `boss-stability.test.ts`, `stability.test.ts`, `stability-recovery.test.ts` |
| 32 | Ammo Weakness Upgrade system (2026, in-game) — **SEPARATE from the generic weakness multiplier** (§3.18): exploiting an Ammo weakness applies 2 stacks on the first exploit, +1 per subsequent exploit, max 5; **Physical-only** bonus: 2 stacks +7% · 3 stacks +11% · 4 stacks +17% · 5 stacks +25% (capped); **Phase attacks neither advance stacks nor receive the bonus (VALIDATED 2026)**; generic ×1.10/×1.20 still applies to Phase damage independently; not the generic weakness multiplier; Stability does not modify damage. Time-based expiry: NONE — VALIDATED (2026, persisted 6 skipped turns; modeled permanent). Unresolved: any explicit reset/removal mechanic (unobserved) | **VALIDATED in-game** (Qiongjiu Basic 616/636/665/704 non-crit progression + 529/654 no-ammo control; Burn+Ammo Phase control 1191×3 / 1470 crit @123.5% CDMG; shotgun 89→105/109/114/122) — **IMPLEMENTED** data-driven (target `upgrade` status + `stack_tier_modifier` + `grant_stacks_on_weakness_exploit` target passive + ammo weakness dimension `ammoType`/`weaknessTags`) | data (`statuses.ts`, `DummyConfig.passives`, `SkillDef.ammoType`) | `ammo-weakness-upgrade.test.ts` (progression, tiers, Physical gate, Phase control, data-driven trigger) |
| 33 | Phase damage + elemental weakness (U15b, 2026) — the generic weakness multiplier `1 + 0.10 × #matched element weaknesses` applies to Phase damage exactly as to Physical (1 matching element weakness → ×1.10; validated: Burn Common Rail 2233 no-weakness baseline vs 2340 with Burn weakness at different target DEF); no separate Phase-specific weakness mechanic; AWU remains Physical-only | CONFIRMED (in-game, 2026) | — (existing generic weakness path) | `phase-weakness-validation.test.ts` (baseline, ×1.10 separate-factor, AWU-out-of-Phase) |
| 34 | Weakness-matching counts + partial-match (U15a, 2026) — weakness factor = ADDITIVE matched count `1 + 0.10 × n`; element AND Ammo-tag matches count into the SAME factor; 1 matched → ×1.10 (Burn-only 1091, repeated 4×), 2 matched → ×1.20 (Burn+Ammo 1191 normal / 1470 crit @123.5% CDMG); **partial-match CONFIRMED — only matched weaknesses count (10 displayed, 2 matched → ×1.20 → 1207/1491/1207)**; AWU separate (Physical-only). Dummy-tool limitation only: zero-weakness Phase target and Ammo-only Phase target not testable | CONFIRMED (matched counts + partial-match, in-game 2026) | — (existing generic weakness path) | `weakness-matching-validation.test.ts` (1-weakness, 2-weakness, crit, factor independence), `partial-match-validation.test.ts` (many exposed / 2 matched / 1207/1491/1207) |
| 35 | Weakness stability damage (U15, 2026) — Total Stability Damage = Attack Base Stability Damage + (2 × # weaknesses exploited), where element AND Ammo-tag matches both count; generic across Physical/Phase, independent of the damage multiplier; AWU not mixed in. Validated: Basic 0-weak → 2 (65→63); Basic + Ammo → 4 (65→61); Common Rail + Burn → 5 (65→60); Common Rail + Burn+Ammo → 7 (65→58); Common Rail base 3 (data) | CONFIRMED (in-game, 2026) | skill `stabDamage` (base) + engine `2 × #exploited` | `weakness-stability.test.ts` (base, 1/2 exploited, Physical+Phase, AWU-separation) |

## 2. NOT IMPLEMENTED (deliberately out of MVP scope)

APL/auto-AI (U12), movement/positioning, **Cover — explicitly deferred** (incl. cover damage reductions 35/30/25/20% and the stability-cover 60% reduction), maps, enemy turns/AI, DoT damage effects for unverified elements (U16), extra actions, status purge/removal, durations > 7 turns. (No phase-wheel table — the elemental counter-wheel premise was corrected/removed 2026, docs/research.md §3.4.)

## 3. Every UNVERIFIED value that affects Qiongjiu's simulation — override coverage

| Value | Default | Override location | Warning surfaced |
|---|---|---|---|
| Crit multiplier (U1 + U19 CDMG half — RESOLVED) | derived `1 + Crit DMG` from attacker data (e.g. `1.2` at 120%, `1.235` at 123.5%) — **no hardcoded default** | `configOverrides.critMultiplier` (test-only alternative hypothesis) | warning only when an override is active |
| Exposed multiplier (U3 — RESOLVED) | **none** — no universal Exposed/Broken damage modifier exists | removed from the engine (generic `exposedDamageMult` deleted); `exposed` remains queryable state | — |
| Exposed duration (U4 — RESOLVED) | fixed 2-turn broken/recovery window (non-configurable rule) | `configOverrides.exposedDurationRounds` retained solely for alternative-hypothesis testing | yes (when dummy can break; warns it is a CN-beta artifact) |
| Confectance max (U9 — RESOLVED) | 6 (confirmed) | `configOverrides.confectanceMax` | warn only when overridden |
| Confectance start (U9 — RESOLVED) | 3 (confirmed) | `configOverrides.confectanceStart` | warn only when overridden |
| Support Boost I/II value & duration | 0.05/0.10, 1r | `configOverrides.statusOverrides` | yes (note shows the override) |
| Status tick point (U7 — RESOLVED) | `ownActionEnd` — **normal timed buffs tick at the recipient's action end (CONFIRMED in-game, Attack Up II)** | `configOverrides.statusOverrides.<id>.tickAt` (alternative testing only) | yes — only when the knob deviates from the confirmed default |
| Status applied duration | per-skill data (refresh on same-tier reapply — U8 RESOLVED) | `configOverrides.statusOverrides.<id>.durationRounds` | yes |
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

- `npm test` → 131/131 pass (92 base + 7 U5 boss-Stability + 2 U7/U8 status-timing + 2 U14 boss-DEF + 10 Ammo Weakness Upgrade + 4 Phase-elemental-weakness U15b + 4 weakness-matching U15a + 1 AWU persistence + 5 weakness-stability U15 + 3 partial-match U15a + 2 Overburn validation − 1 premise-based 'phase countering ×1.2/×0.8' test removed 2026).
- CLI: 7-turn example and 4-turn rotation walkthrough verified by hand (see report).
- 8+ turns rejected with a clear error message (CLI + engine tests).

## 7. Exposed/Broken behavior — RESOLVED (U3 / U4 / U6)

All three Exposed-related uncertainties are resolved:

- **U4 (window duration)** — fixed 2-turn broken window (broken through N/N+1, restored at START N+2; U6-validated). `stability-recovery.test.ts`.
- **U6 (recovery)** — confirmed (2026-09-03): restored exactly 2 turns after the break, restored to max. `stability-recovery.test.ts`, `boss-stability.test.ts`.
- **U3 (damage modifier)** — **no universal Exposed/Broken damage multiplier exists**; the generic `exposedDamageMult` was removed from the engine. A Broken target with no character-specific Broken-target effect takes normal damage (`stability.test.ts` "U3 resolved…"). Any future "bonus vs Broken/Exposed" is a CHARACTER-specific mechanic modeled in that Doll's data.