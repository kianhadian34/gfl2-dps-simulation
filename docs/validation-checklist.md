# GFL2 Combat Simulator — Validation Checklist (MVP, Qiongjiu vs Training Dummy)

Status: validation mode · 2026-09-03 · Built from `docs/research.md` (§4 uncertainty register + §5 in-game test plan) against the implemented engine (commits `a8f69ca`, `99340e5`, `c2a1ba7`).

## Project-wide validation standard (AUTHORITATIVE — adopted 2026)

Every gameplay mechanic/claim has exactly ONE validation state:

- **`Validated`** — directly tested in-game under controlled conditions; the observed result provides evidence for the specific claim. Tooltips, code, plausibility, or a passing unit test do NOT make something Validated.
- **`Mathematically Proven`** — not necessarily tested at the exact state, but uniquely established by already-validated mechanics + authoritative data + a reproducible mathematical derivation that excludes plausible alternatives. Every such claim must reference its derivation. If multiple interpretations produce the same observation, it stays `Not Tested`.
- **`Not Tested`** — everything else (implementation exists, tooltip known, timing/stacking/consumption unknown, evidence insufficient). This is a legitimate state, not a failure.

Rules:
- Validation state is SEPARATE from implementation status (implemented + Not Tested, data-only + Not Tested, etc. are all valid combinations). Never infer validation from implementation.
- Record at the smallest meaningful claim level (e.g. Support Boost I: +15% Support Action damage — Not Tested; +10% vs Exposed — Not Tested; activates 1 time — Not Tested).
- Fortification/V6 limitation: lower-level relationships may be marked `Mathematically Proven` from V6 evidence only when the derivation uniquely establishes them; if cumulative and replacement readings both fit the observation, the mechanic stays `Not Tested`. Never invent lower-Fortification behavior. (A source fact that explicitly states a lower-level effect is an authoritative input and does NOT require a lower-Fortification gameplay test.)
- Proof ≠ consistency: if two models predict the same observed number, the mechanic is NOT proven.

### Source hierarchy (AUTHORITATIVE — adopted 2026)

Source authority and evidence status are separate dimensions. Authority ranks the *input's* legitimacy; evidence status ranks the claim's confidence. The six levels:

1. **Direct user-provided in-game evidence** — screenshots of tooltips, skill levels, Fortification upgrades, stat screens, combat results; explicit game information from the user. Establishes **what the game states**.
2. **Direct in-game testing** — controlled tests in the game. Establishes **what the game does**. If a test conflicts with a source fact, document the discrepancy and investigate; never silently replace either.
3. **Mathematically derived conclusions** — uniquely established from authoritative source facts + validated mechanics + reproducible calculation. A lower-investment gameplay state is NOT required when the available state and source data uniquely determine the conclusion (V6 is the primary experimental state for Qiongjiu because it is the available character state).
4. **Repository implementation** — data, engine, tests, simulator behavior: what the simulator models. Never game correctness by itself.
5. **Secondary/community sources** — discovery and hypothesis generation only.
6. **Assumptions/speculation** — always explicitly marked, never silently promoted to an established mechanic.

**Critical rule:** the absence of a gameplay test does NOT invalidate an explicit source fact. Source facts are authoritative inputs (usable in mathematical proofs) and are NOT a fourth evidence status; they establish what the game states, not that the behavior is gameplay-validated.

**General rank-inheritance rule (adopted 2026):** when a mechanic exists in multiple ranks, generic behavior established for ONE rank is **inherited by the other ranks** unless (a) the source explicitly changes that behavior, (b) the rank's effect structure differs, (c) a rank-specific value/mechanic needs separate validation, or (d) contradictory in-game evidence exists. Do NOT repeatedly test identical generic behavior for every rank. Example: Support Boost II inherits SB I's validated generic behavior (persistence/proc, stackability, no invented maximum, stacks = activations, one stack per Support Action, flat magnitude regardless of stack count, Support Action scope, Basic Attack unaffected/unconsuming, un-cleansable); SB II's rank-specific items are its **+30% Support Action damage (tooltip SOURCE FACT — no in-game combat number validated)** and its validated replacement/blocking/consumption interactions. No Support Boost III exists (source).

**Effect provenance & dedup (adopted 2026):** every active buff/effect carries a human-readable SOURCE (ability/passive/key/status + level + fortification tag, e.g. `Damage Up II (Source: Pressing the Momentum Lv.3 (V5))`, `Out-of-Turn Damage +10% (Source: Steady Plan Lv.2 (V3))`). The source that grants an effect and the resulting effect are distinct views of the SAME modifier — they must never be counted as two modifiers merely because both names appear (e.g. V3's "+10% Support Action damage" IS the Out-of-Turn Damage +10% line: one modifier). Before damage calculation, the engine inventories applicable effects, identifies their sources, deduplicates same-source representations, applies scope/timing, and then assigns them to damage buckets; provenance is exposed per event as `LogEvent.appliedSources` / `LogEvent.effectSources` (see `docs/schemas.md` §9).

**INTENTIONAL EXCEPTION — Ammo Weakness Upgrade (AWU):** AWU's target-side stack application deliberately uses the existing direct `applyStatus` path **without** a granting source (`grantStackOnWeaknessExploit` → `applyStatus`). AWU is an explicit exception to the effect-provenance requirement: it is a generic target-side upgrade (not a per-ability/key grant), so it carries no `source` label and does not record an `appliedSources` entry; its bucket contribution is attributed by its status name/definition. This is by design, NOT a provenance bug — do not "fix" it by threading a granting source. All other applying paths continue to record provenance as above.

**Mapping of the old labels (kept in the table below as metadata only):**
`CONFIRMED (in-game …)` → `Validated` · `CONFIRMED` from a primary/tooltip source alone → `Not Tested` (source-confirmed) · `UNVERIFIED`/`PROBABLE`/`UNCERTAIN` → `Not Tested` · `NOT IMPLEMENTED`/`REMOVED` → implementation/deferred status, not a validation state. Existing rows are intentionally NOT mass-upgraded; each claim's true state is given by the evidence descriptions in the rows and in §2.

Legacy legend (source-confidence + implementation metadata, NOT validation states): **CONFIRMED** = verified by a primary source or reproduced in-game during research · **UNVERIFIED** = research says so but the exact value/rule is not confirmed — must be overridable, never hardcoded as fact · **PROBABLE** = single reliable secondary source · **NOT IMPLEMENTED** = deliberately deferred, out of MVP scope.

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
| 6 | Weakness exploit: factor = **1 + 0.10 × #exploited weaknesses** (+2 stab each) — **additive across weaknesses**, separate factor (NOT in the additive DMG bucket); Burn ×1.10 → 1091 and **Burn + Medium ammo ×1.20 → 1191 confirmed in-game; multiplicative ×1.21 ruled out (U20 2026-09-03)** | CONFIRMED (in-game) | dummy `weaknesses` (count-driven; V6 no-cover +10% not yet in character data — passed explicitly in regression) | `damage.test.ts`, `stability.test.ts`, `weakness-validation.test.ts` |
| 7 | Critical multiplier = attacker's Crit DMG stat, **linear**: ×1.20 at 120% CDMG (Basic crit 635), ×1.235 at 123.5% (crit 654); applied to **unrounded** damage before final ceil. **Crit Rate: 100% effective cap; overflow converts 1:1 only via character-specific passive** ("every 1% of overflow critical rate is converted to 1% critical damage" — in-game passive text, 2026-09-03) | **CONFIRMED (in-game — U19 RESOLVED)**: engine derives `1 + critDmg`; universal 100% CR cap; overflow conversion via data-driven `excess_crit_conversion` passive (no global rule, no character-id logic); 1:1 ratio + non-1:1 + cap + no-passive paths **numerically locked** | `configOverrides.critMultiplier` = test-only alternative hypothesis; conversion params live in character passive data | `crit-validation.test.ts`, `critdmg-validation.test.ts`, `crit-overflow-validation.test.ts`. Data-population only remains: which characters carry such passives, exact params, CR-raising attachment sources |
| 8 | Glancing (擦伤) — **REMOVED 2026-09-03 (U2, beta artifact)** — no longer a modeled mechanic | REMOVED (tombstone) | — | research.md §3.6 / register tombstone |
| 9 | Ceiling rounding of final damage; crit applied to the underlying unrounded product (never to the rounded normal hit) | CONFIRMED (in-game 2026-09-03; ATK-1956 case discriminates 634 vs 635) | — | `damage.test.ts`, `crit-validation.test.ts` |
| 10 | Fixed-damage branch (no DEF, no crit) | PROBABLE | — | `damage.test.ts` |
| 11 | Stability as separate resource; per-hit fixed stability damage | CONFIRMED — **never alters damage on a No-Cover target** (in-game Burn test had 65/65 stability; formula matched with no stability term) | dummy `stability`, skill `stabDamage` (data) | `stability.test.ts` |
| 12 | Break → Exposed state | CONFIRMED (window): **U4 duration RESOLVED (fixed 2-turn recovery rule — broken through N/N+1, restored at START N+2)**; **U3 RESOLVED — no universal Exposed damage multiplier** | `configOverrides.exposedDurationRounds` (U4 testing knob only) | `config-override.test.ts`, `stability-recovery.test.ts` (U4 timing), `stability.test.ts` (U3 no-multiplier) |
| 13 | Stability recovery — **2-turn delay after break (break Turn N → restored Turn N+2), restore to max (U6 CONFIRMED 2026-09-03)**; no universal Exposed damage multiplier (U3 resolved) | CONFIRMED (timing) | engine `STABILITY_RECOVERY_DELAY = 2` | `stability-recovery.test.ts` |
| 14 | Panel formula `(Σ flat) × (1 + Σ pct)`; **in-combat `stat_modifier` status effects are now CONSUMED (2026): effective stat = (base + Σflat) × (1 + Σpct), ATK/HP/DEF rounded up, CritRate continuous — applied to attacker ATK/CritRate and defender DEF at hit time (`statModifier`, `dealDamageHit`); panel preserved when no modifiers; ATK Up II 1933 → 2223 validated; **DEF Down II 5000 → 3500 (def pct −30%) VALIDATED 2026** | CONFIRMED | — | `integration.test.ts` (panel), `stat-modifier-validation.test.ts` (consumption, DEF Down) |
| 15 | Weapon ATK at proficiency 60 (53 → 369) | CONFIRMED values; **per-level curve UNVERIFIED** (linear interp) | weapon `atkLvl1/atkLvl60/level` (data) | `integration.test.ts` |
| 16 | Buff/debuff statuses, durations in rounds | CONFIRMED (existence; durations big-rounds); **U7 RESOLVED 2026-09-03 (in-game, Attack Up II) — normal timed buffs tick at the recipient's action end; self-applied buffs tick at the end of the SAME casting action (VALIDATED 2026, Fortification Protocol / Positive Charge 3→2 — old same-action skip removed); U8 RESOLVED — same-tier reapplication refreshes the duration and does NOT add a stack** (statuses with their own timing/stacking text remain status-specific); **ATK Up family (I/II/III) VALIDATED 2026 — II = +15% ATK immediate, holder-action-end duration, higher tier REPLACES lower (not additive/coexisting)** | `configOverrides.statusOverrides.<id>.tickAt` / `.durationRounds` (alternative testing only now) | `status-timing.test.ts` (U7/U8 + self-applied lock), `config-override.test.ts` (alternative-tick knob) |
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
| 30 | Fixed Damage (U21) — **post-chain, independent ceil**: `ceil(normalChain) + ceil(fixed)`; bypasses DEF / damage-buff bracket / phase / weakness / ordinary reduction / crit; **Fixed DMG Buffs / Final DMG Reduction applied on the unrounded fixed value** (`(1+Σapplier buffs)×(1−Σholder red)` then ceil) at both fixed sites | **CONFIRMED (in-game: Overburn 196/195/78/153 series; immune to Burn weakness, +20% No-Cover, and ordinary 80% DR incl. the boss's −80% ordinary passive; Fixed DMG Buff (+10% key, reclassified 2026 from 'Final DMG Increase') and Final DMG Reduction 60% apply)**; DEF/crit/phase bypass and the fixed-DMG chain SOURCE+IN-GAME; fixed skill multiplier + other source-named Fixed DMG Buff examples SOURCE-SUPPORTED (unvalidated) | `SkillDef.fixedDamage` (absolute) + `fixed_dmg_modifier` status effect (`percentOfAtk` for statuses; modes `buff`/`reduction`) | `fixed-damage-validation.test.ts`, `final-dmg-validation.test.ts`, `overburn-validation.test.ts`, `boss-stability.test.ts` |
| 31 | No-Cover Stability behavior (U5 boss-domain) — **no universal No-Cover stability damage reduction** (Blaze Master 65/65 evidence; generic rule is Cover-gated and out of scope); **boss-specific stability-conditional passives IN SCOPE and implemented**: confirmed boss −80% taken while stability > 0 → ×0.20; inactive at Stability = 0; pre-hit break evaluation; reduction returns on U6 recovery; fixed damage bypasses it (U21); no universal Exposed multiplier (U3 resolved) | CONFIRMED (in-game boss passive) / implemented generically via `DummyConfig.passives` (no boss IDs) | `DummyConfig.passives` (U5) | `boss-stability.test.ts`, `stability.test.ts`, `stability-recovery.test.ts` |
| 32 | Ammo Weakness Upgrade system (2026, in-game) — **SEPARATE from the generic weakness multiplier** (§3.18): exploiting an Ammo weakness applies 2 stacks on the first exploit, +1 per subsequent exploit, max 5; **Physical-only** bonus: 2 stacks +7% · 3 stacks +11% · 4 stacks +17% · 5 stacks +25% (capped); **Phase attacks neither advance stacks nor receive the bonus (VALIDATED 2026)**; generic ×1.10/×1.20 still applies to Phase damage independently; not the generic weakness multiplier; Stability does not modify damage. Time-based expiry: NONE — VALIDATED (2026, persisted 6 skipped turns; modeled permanent). Unresolved: any explicit reset/removal mechanic (unobserved) | **VALIDATED in-game** (Qiongjiu Basic 616/636/665/704 non-crit progression + 529/654 no-ammo control; Burn+Ammo Phase control 1191×3 / 1470 crit @123.5% CDMG; shotgun 89→105/109/114/122) — **IMPLEMENTED** data-driven (target `upgrade` status + `stack_tier_modifier` + `grant_stacks_on_weakness_exploit` target passive + ammo weakness dimension `ammoType`/`weaknessTags`) | data (`statuses.ts`, `DummyConfig.passives`, `SkillDef.ammoType`) | `ammo-weakness-upgrade.test.ts` (progression, tiers, Physical gate, Phase control, data-driven trigger) |
| 33 | Phase damage + elemental weakness (U15b, 2026) — the generic weakness multiplier `1 + 0.10 × #matched element weaknesses` applies to Phase damage exactly as to Physical (1 matching element weakness → ×1.10; validated: Burn Common Rail 2233 no-weakness baseline vs 2340 with Burn weakness at different target DEF); no separate Phase-specific weakness mechanic; AWU remains Physical-only | CONFIRMED (in-game, 2026) | — (existing generic weakness path) | `phase-weakness-validation.test.ts` (baseline, ×1.10 separate-factor, AWU-out-of-Phase) |
| 34 | Weakness-matching counts + partial-match (U15a, 2026) — weakness factor = ADDITIVE matched count `1 + 0.10 × n`; element AND Ammo-tag matches count into the SAME factor; 1 matched → ×1.10 (Burn-only 1091, repeated 4×), 2 matched → ×1.20 (Burn+Ammo 1191 normal / 1470 crit @123.5% CDMG); **partial-match CONFIRMED — only matched weaknesses count (10 displayed, 2 matched → ×1.20 → 1207/1491/1207)**; AWU separate (Physical-only). Dummy-tool limitation only: zero-weakness Phase target and Ammo-only Phase target not testable | CONFIRMED (matched counts + partial-match, in-game 2026) | — (existing generic weakness path) | `weakness-matching-validation.test.ts` (1-weakness, 2-weakness, crit, factor independence), `partial-match-validation.test.ts` (many exposed / 2 matched / 1207/1491/1207) |
| 35 | Weakness stability damage (U15, 2026) — Total Stability Damage = Attack Base Stability Damage + (2 × # weaknesses exploited), where element AND Ammo-tag matches both count; generic across Physical/Phase, independent of the damage multiplier; AWU not mixed in. Validated: Basic 0-weak → 2 (65→63); Basic + Ammo → 4 (65→61); Common Rail + Burn → 5 (65→60); Common Rail + Burn+Ammo → 7 (65→58); Common Rail base 3 (data) | CONFIRMED (in-game, 2026) | skill `stabDamage` (base) + engine `2 × #exploited` | `weakness-stability.test.ts` (base, 1/2 exploited, Physical+Phase, AWU-separation) |
| 36 | **Fixed Damage vs FINAL DMG Reduction / FIXED DMG BUFFS — RESOLVED + IMPLEMENTED (2026):** Final DMG Reduction applies to fixed (1931×0.10×0.40 → 78) and Fixed DMG Buff applies (the validated +10% Fixed DMG Key, reclassified 2026 from the earlier "Final DMG Increase" label; 3471×0.10×1.10×0.40 → 153); the engine multiplies the UNROUNDED fixed value by the `fixed_dmg_modifier` (`buff`/`reduction`) chain at both fixed sites; ordinary Damage Reduction/Increase stay excluded (boss −80% ordinary passive bypassed). **Ownership confirmed (2026): Fixed DMG Buffs = buffs on the attacking unit/applier; Final DMG Reduction = buff on the target.** **Fixed-damage skill multiplier — DEFERRED:** no current mechanic uses it (not implemented). **Fixed-damage investigation CLOSED (2026) for all mechanics currently present in the game.** Other source-named Fixed DMG Buff examples — Common Key - Source of Pride / Ultimate Brilliance — are NOT individually in-game tested. **HP-scaling fixed damage (#3) — DEFERRED:** no currently existing character/effect uses HP-scaling fixed damage. **DEF-scaling fixed damage (#4) — VALIDATED 2026 (Winter's Wrath Lv.1):** uses the CASTING unit's DEF as the scaling stat, target DEF does not mitigate, rounds up — `ceil(source DEF × 0.50) = ceil(1489 × 0.50) = 745`. **Damage-dealt-scaling fixed damage (#5) — VALIDATED 2026 (Negative Charge):** uses the triggering attack's post-DEF, post-crit damage × the effect % (30%), then ceil — `ceil(383×0.30)=115` (non-crit), `ceil(666×0.30)=200` (crit). Engine representations for the scaling types are deferred until concrete effects are added to character data | CONFIRMED (in-game) + IMPLEMENTED (core); ownership CONFIRMED; Fixed DMG Buff bucket CONFIRMED (+10% key); #4 DEF-scaling + #5 damage-dealt-scaling CONFIRMED (behavior) | `fixed_dmg_modifier` effect (data) + `fixedDmgMods` (engine) | `final-dmg-validation.test.ts` (no-mod, reduction 78, buff+reduction 153, buff-only 213, ordinary-DR-excluded 78, No-Cover-ignored + non-crit, skill-sourced 40) |

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

- `npm test` → 174/174 pass (92 base + 7 U5 boss-Stability + 2 U7/U8 status-timing + 1 self-applied buff timing (2026) + 6 stat-modifier consumption incl. DEF Down II + 2 U14 boss-DEF + 10 Ammo Weakness Upgrade + 4 Phase-elemental-weakness U15b + 4 weakness-matching U15a + 1 AWU persistence + 5 weakness-stability U15 + 3 partial-match U15a + 2 Overburn validation + 7 final-DMG validation + 5 determinism/state-isolation (2026) + 1 multi-gain Confectance regression (2026) + 5 Qiongjiu key-data regression (2026) + 12 skill-level/Fortification regression (2026) + 8 Qiongjiu kit-sync regression (2026) − 1 premise-based 'phase countering ×1.2/×0.8' test removed 2026).
- CLI: 7-turn example and 4-turn rotation walkthrough verified by hand (see report).
- 8+ turns rejected with a clear error message (CLI + engine tests).

## 7. Exposed/Broken behavior — RESOLVED (U3 / U4 / U6)

All three Exposed-related uncertainties are resolved:

- **U4 (window duration)** — fixed 2-turn broken window (broken through N/N+1, restored at START N+2; U6-validated). `stability-recovery.test.ts`.
- **U6 (recovery)** — confirmed (2026-09-03): restored exactly 2 turns after the break, restored to max. `stability-recovery.test.ts`, `boss-stability.test.ts`.
- **U3 (damage modifier)** — **no universal Exposed/Broken damage multiplier exists**; the generic `exposedDamageMult` was removed from the engine. A Broken target with no character-specific Broken-target effect takes normal damage (`stability.test.ts` "U3 resolved…"). Any future "bonus vs Broken/Exposed" is a CHARACTER-specific mechanic modeled in that Doll's data.

## 8. Qiongjiu evidence states (project-wide standard, claim-level)

Conservative mapping under the project-wide standard (source authority and evidence status are separate). **Validated** = direct in-game observation (recorded in `docs/research.md` datasets). **Mathematically Proven** = derivation referenced. **Source fact** = tooltip/screenshot-stated (authoritative input, NOT a fourth evidence status — usable in proofs; absence of a gameplay test does not invalidate it). Everything else **Not Tested**.

| Claim | State | Basis (per rules) |
|---|---|---|
| Basic: 80% ATK multiplier | **Not Tested** | source text only (no numeric in-game reproduction) |
| Basic: Stability 2 / weakness +2 stab | **Validated** | U15 datasets (stability sequences, 65→58 etc.) |
| Common Rail Lv1: 150% ATK, stab 3 | **Validated** | U15a/U20 datasets (1091, 1191, 1207, 1491, 2233, 2340) |
| Common Rail Lv2: kill → SB I bonus 30% | **Not Tested** | tooltip; deferred |
| Guide Lv1: 110% ATK, stab 3, Overburn 2r | **Not Tested** | tooltip/source (AoE single-dummy untested in-game) |
| Guide Lv1: applies Overburn 2 turns | **Not Tested** | application text; Overburn *value* validated separately |
| Guide Lv2: +100% crit vs Overburn | **Not Tested** | tooltip; deferred |
| Overburn: 10% applier ATK, onApply + 2 ticks, own ceil, DR-bypass, Final-DMG chain | **Validated** | U21 datasets (196/195/78/153/594) |
| Ult Lv1: Confectance cost 3 | **Validated** | U9 in-game |
| Ult Lv1: +3 SB II / at-cap +1 stack & +1 Support Action | **Not Tested** | grants/at-cap behavior tooltip-derived, no direct in-game observation |
| Ult Lv2/V4: Vulnerable I applied on the existing Support Action trigger, BEFORE QJ's Support Action (1 turn; expires when the target finishes its turn; independent of Confectance / max-Confectance branch) | **Validated** (in-game 2026) | direct in-game testing; regression: below-max cast also applies it; present when the Support Action resolves (+10% taken in that hit); gone at the target's turn-end; MVP dummy is always No-Cover → unconditional application in-sim (no Cover system) |
| Steady Plan Lv1: +1 Confectance per damage | **Validated** | U9 in-game |
| Steady Plan Lv1: No-Cover +10% | **Source fact** (authoritative input); combined 1.20 total additionally **Validated** | tooltip states +10% vs No-Cover; U20/U15b brackets reproduce the combined 1.20 at V6 |
| Steady Plan Lv2 (V3): Support Action damage +10% (cumulative, retained at V6) | **Validated** | the 735/747/883 support-hit validations all include the Out-of-Turn/V3 +10% alongside No-Cover |
| Steady Plan Lv2 (V3): Overburn (2 turns) after each Support Action | **Validated** (timing only — in-game 2026) | observed sequence: Support Action → Support Action finishes → Overburn appears on target → one Overburn Fixed Damage instance (target had no Overburn beforehand); validates only the "after Support Action" application timing via the generic `after_support_status` effect — does NOT re-validate Overburn's established mechanics (Fixed Damage classification, damage calc, applier stats, immediate-application damage, holder-action-end ticks, 2-turn duration — validated separately) |
| Steady Plan Lv3 (V6): No-Cover **+20% TOTAL** (SINGLE component, per the V6 display) | **Source fact** (authoritative input) | the V6 screenshot displays one "20% No-Cover" value — NOT two +10% components and never +30%; observed V6 brackets reproduce 1.20 (1091/1191/992/1207/2233/2340) |
| Steady Plan Lv3 (V6): cumulative — retains V3 Support +10% and Overburn-after-Support | **Source fact** | V6 screenshot's complete accumulated text lists both alongside the 20% No-Cover; engine resolves the full cumulative set |
| Support Action: 90% ATK | **Not Tested** | source text (no in-game numeric); simulated value 0.9 |
| Support Action: Stability 2, max 3/round, no chain | **Not Tested** | source text (trigger/quota mechanics not in-game-reproduced) |
| Support Action: range requirement | **Not Tested** | unverified (checklist row 24) |
| Support Boost I: +15% Support Action damage (support-scoped) | **Validated** | in-game 883 (ATK 1977 support hit, factor 1.75 incl. SB I's two effects) |
| Support Boost I: +10% vs Exposed (same buff instance) | **Validated** | 883 (contribution) + **538** (Basic Attack vs Exposed → NO +10%) — both effects are Support-Action-scoped; requires an Exposed target |
| Support Boost I: both effects Support-Action-scoped | **Validated** | 538: Basic vs Exposed = `ceil(1977×0.80×(1977/6977)×1.20) = 538` (would be 583 if the +10% applied) |
| Support Boost I: one buff instance with two effects, source = Common Rail | **Validated** (883/538) + source fact | tooltip states one buff; engine holds one status id with two effects, applied once with the Common Rail source |
| Support Boost I: persistent — no duration | **Validated** | remains active indefinitely with no Support Action; Basic Attacks do not consume it |
| Support Boost I: stackable (each application +1 stack) | **Validated** | Skill 1 once → 1 stack; again → 2 stacks |
| Support Boost I: one Support Action consumes exactly ONE stack | **Validated** | 2 stacks → one supported hit → 1 stack; remaining stack applies to the next Support Action |
| Support Boost I: "activates 1 time" = per-stack (stacks = activations) | **Validated** | the two rows above directly establish per-stack consumption behavior |
| Support Boost I: stack count does NOT increase damage magnitude | **Validated** | SB I with 1 stack and with 2 stacks both deal 883 — the +15%/+10% apply once while ≥1 stack remains (stacks = remaining activations, never a multiplier) |
| Support Boost I: cannot be cleansed | **Source fact** | tooltip; engine flags `purgeable: false` (no cleanse mechanic exists in the MVP) |
| Support Boost I: no observed maximum stack count | **Validated** | 4 stacks reached over 7 turns with no cap observed; stacks are continually consumed. Engine: `maxStacks` ABSENT (unbounded); the unvalidated `maxStacks: 9` placeholder is REMOVED |
| SB I → SB II replacement | **Validated** | with SB I ×2, the Ultimate (SB II ×3) completely replaced it — all SB I stacks gone. IMPLEMENTED (`SB II.replaces = ["support_boost_i"]`; removals reported in `statusesExpired`) |
| SB II blocks SB I application (SB II priority) | **Validated** | with SB II ×3, the SB I-granting Skill applied NOTHING (SB II stayed ×3). IMPLEMENTED (`SB I.blockedBy = ["support_boost_ii"]`; blocked applications record no provenance) |
| Support Boost II: consumes exactly one stack per Support Action | **Validated** | SB II ×3 → one Support Action → ×2. IMPLEMENTED (`SB II.consumeOneOnUse = true`, reusing the generic mechanism) |
| Support Boost II: generic behavior inherited from SB I (persistence, stackable, no invented max, stacks = activations, flat magnitude, support scope, Basic unaffected, un-cleansable) | **Validated (inherited — rank-inheritance rule)** | no repeated SB II testing required; SB II data mirrors SB I (`durationRounds: null`, unbounded `maxStacks`, `scaleWithStacks: false`, `consumeOneOnUse`) |
| Support Boost II: +30% Support Action damage | **Source fact** | tooltip value; identical structure to SB I except 15%→30%; NO in-game combat number validated for SB II (do not claim one) |
| Support Boost II: +10% vs Exposed component | **Source fact (inherited)** | identical tooltip structure to SB I; behavior inherited; not separately combat-validated |
| Support Boost III | **Source fact (ABSENT)** | the game screenshot shows exactly two ranks; no SB III is modeled |
| Vulnerable I: +10% taken (V4 application) | **Validated** (2026) | V4 applies it BEFORE QJ's Support Action on the existing trigger; 1 turn — expires when the target finishes its turn; independent of Confectance; magnitude +10% enters the target's additive bracket (regression bracket 1.60); duration/stacking/cleansing beyond V4 1-turn usage unobserved |
| Damage Up II: +20% dealt (Ult Lv3/V5) | **Not Tested** | tooltip magnitude; V5 deferred (pre-ally timing absent) |
| Defense Down II: −30% DEF (via target stat modifier) | **Validated** | in-game 5000 → 3500 (2026) |
| Blazing Assault II | **Not Tested** | absent from data (FK5 reference only) |
| FK1: +3 Confectance battle start | **Not Tested** | source (no direct in-game numeric; U9 datasets were no-keys) |
| FK2–FK6, Ruined Gem, Warm as Jade | **Not Tested** | text only; deferred |
| Confectance cap 6 / start 3 / +1 per damage / cost 3 | **Validated** | U9 in-game |
| Ultimate-granted Support Boost II obeys SB persistence — the Ultimate imposes NO duration (stacks survive until consumed) | **Validated** (via established SB I/II persistence — rank-inherited, not a new mechanic) | SB I/II persistence already in-game validated (no-duration, stacks = activations); regression: unused ult-granted stack remains available after a round passes |
| Max-Confectance Ultimate: +1 SB II stack → **4 total** and +1 Support Action quota → **4 that same casting turn** | **Validated** (in-game 2026) — quota's same-turn restriction: engine-proven, not in-game claimed | both bonuses directly confirmed in-game; the +1 quota is restricted to the Ultimate-casting turn (NO carry-over; reset to the normal 3 at the next round start) — enforced by the simulator's per-round quota reset (`beginUnitRound`), no direct in-game observation of the reset is claimed; regression: 4 SB II stacks consumed by exactly 4 Supports that turn (no 5th), next round back to 3, normal turn still capped at 3 |
| Cooldown CD-N waits N full turns | **Validated** | U11 in-game |
| Stability recovery (2 turns, restore to max) | **Validated** | U6 in-game |
| Weakness factor 1 + 0.10 × n (additive, +2 stab each, partial-match, Phase-weakness applies) | **Validated** | U15a/U15b/U20 datasets |
| Crit multiplier = 1 + Crit DMG, cap 100%, overflow 1:1 conversion | **Validated** | U19 datasets |
| Fixed-damage chain & damage-dealt/DEF-scaling | **Validated** | U21 (ATK-sourced); damage-dealt/DEF-sourced validated 2026 (Negative Charge, Winter's Wrath) |
| AWU tiers (physical, 2→7%…5→25%, permanent) | **Validated** | §3.18 datasets |

**Note — V6 No-Cover (source-superseded):** the earlier "1 + 0.10 + 0.10 Mathematically Proven" split derivation is **superseded** by the authoritative V6 screenshot, which displays the No-Cover bonus as a SINGLE **+20% total** value (one component). Under the source hierarchy that displayed value is the **Source fact**; the observed V6 brackets reproduce the 1.20 total (1091/1191/992/1207/2233/2340), and the single-+20% interpretation (never two +10%, never +30%) is what the engine now represents — the split claim is dropped.