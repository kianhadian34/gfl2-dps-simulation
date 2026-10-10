# GFL2 Mechanics Research — MVP (Training-Dummy Combat Simulator)

Status: research complete (2026-09-03) · Pre-implementation · Not all numbers are confirmed — see [Uncertainty Register](#4-uncertainty-register).

This document records every mechanic the MVP needs, in the format requested by the handoff:

```
Mechanic
Source
Confidence
Implementation interpretation
Unknowns
```

Confidence levels: **CONFIRMED** (primary/official source, or independently reproduced in-game) · **PROBABLE** (one reliable secondary source, or strong corroboration) · **UNCERTAIN** (conflicting or ambiguous evidence) · **UNKNOWN** (not found — nothing invented). — These are SOURCE-CONFIDENCE metadata, NOT validation states. The project-wide validation standard (exactly three states: `Validated` / `Mathematically Proven` / `Not Tested`, with evidence rules) is DEFINED in `docs/validation-checklist.md` §0 and is authoritative. "CONFIRMED (in-game …)" here corresponds to `Validated`; source-only "CONFIRMED" corresponds to `Not Tested` (source-confirmed).

---

## 1. Executive summary

What we know with high confidence, in one paragraph:

1. **Damage pipeline** — `final = ceil( base × defense_ratio × (1 + Σ additive bonuses) × weakness × reductions × crit )`, where `defense_ratio = ATK/(1+DEF/ATK)`, all damage bonuses (self buffs, target vulnerability) are **additive in one bracket** (**no generic Confectance damage bonus — U10 disproven 2026-09-03**), **no elemental counter wheel exists** (corrected 2026 — weakness matching is the only element interaction), each exploited weakness is +10% with the factor **additive across weaknesses: `1 + 0.10 × #exploited`** (Burn ×1.10; Burn + Medium ammo ×1.20 — U20 confirmed in-game 2026-09-03, see §3.5), and the result is ceiling-rounded. **Crit multiplier = the attacker's Crit DMG stat** (e.g. ×1.20 at 120%), applied to the *unrounded* damage before the final ceiling round (CONFIRMED in-game 2026-09-03 — see §3.3). Reproduced against real in-game numbers (Reddit test: `1213/(1+194/1213) × 1 × 1.1 = 1150.4 → 1151` in game).
2. **Stability (稳态) is a fully separate resource** from HP: per-hit fixed stability damage (independent of ATK/DEF/crit), break at 0 → "Exposed" state with a damage-taken window; **recovery timing CONFIRMED in-game (2026-09-03): stability is restored exactly 2 turns after the break (break Turn N → restored Turn N+2, back to max)** — see §3.7.
3. **There are no ACC/EVA stats in GFL2.** Against a stationary, uncovered dummy, attacks always hit; there is no miss mechanic and no "Glancing" (擦伤) mechanic in the live formula — a beta-era 擦伤 claim was removed (see §3.6 / U2 tombstone).
4. **Kit structure is fixed data**: 1 basic attack + 2 actives + 1 ultimate + 1 passive, all with explicit %-of-ATK multipliers. Cooldowns are small integers (0/1/2…). Confectance (导染) is an event-driven resource (e.g. Qiongjiu gains **+1 per damage event**, ultimate costs **3**), **not** a `damage × m` formula.
5. **Keys (固键)** are 4 tables (fixed/common/expansion/affinity keys), not a strict "3-branch" model.
6. **Default 1 main action per actor per turn**; basic attack vs skill is an exclusive choice; extra hits come from support/extra actions that do not consume the main action.
7. **Recommended dummy defaults**: no official dummy stats exist → make them **configurable**; recommended defaults `DEF 0, stability 0, no cover, no weaknesses, no phase` (pure `ceil(ATK × multiplier × bonuses × crit)` baseline).
8. **Scope rule (updated)**: the MVP target is **always No Cover**; **Stability + Exposed are mandatory MVP mechanics**; **Cover is explicitly deferred** — cover damage reductions (35/30/25/20% by cover type) and the stability-cover 60% reduction are recorded for later use but are **not** part of the MVP, so no cover-dependent term ever fires.
9. **Fixed Damage (U21)** — an absolute component computed from the caster's stats (e.g., **Overburn = 10% of the effect applier's ATK**), added **after** the normal multiplicative chain with its **own ceiling**; never scaled by damage buffs, weakness, phase, reductions, DEF, or crit. CONFIRMED in-game: Overburn at 1958 ATK → 195.8 → **196**, unchanged by Burn immunity and by Qiongjiu's +20% No-Cover bonus (see §3.1, §4 U21). **New (2026): fixed damage BYPASSES NORMAL Damage Reduction — Overburn with applier ATK 1949 = ceil(194.9) = 195 was unchanged by a target's 80% Damage Reduction effect (would be 195×0.20 = 39 if reduced); the boss's −80% 'damage taken' Stability passive is ordinary Damage Reduction and is likewise bypassed.** NOTE: ordinary "Damage Reduction" and "Final DMG Reduction" are SEPARATE mechanics — **Final DMG Reduction DOES apply to fixed damage** (1931×0.10×0.40 = 77.24 → 78) and **Fixed DMG Buff DOES apply** (the validated +10% Fixed DMG Key — reclassified 2026 from the earlier "Final DMG Increase" label; 3471×0.10×1.10×0.40 = 152.724 → 153); the engine implements this modifier chain at both fixed-damage sites (2026). Fixed DMG Buff bucket validated via the +10% key; other source-named examples (Common Key - Source of Pride / Ultimate Brilliance) are NOT individually in-game tested; a fixed-damage skill-multiplier term remains future/unvalidated.
8. **English wikis (Prydwen, Fandom, Game8) are currently unusable** — Prydwen has no GFL2 section (404), Fandom wiki does not exist. The reachable, citable sources are BWIKI (zh), IOPWiki, gfl2.help, DotGG, and game data dumps. See [Source map](#2-source-map).

---

## 2. Source map

| Source | What it provided | Reachability (2026-09-03) |
|---|---|---|
| `wiki.biligame.com/gf2/伤害算法` (BWIKI damage algorithm) | Formula structure, additive bonus rule, crit ×1.5 (superseded), panel formula, tested numbers; a claimed phase counter table (×1.2/×0.8) — **superseded 2026: no elemental counter wheel exists in GFL2** | ✅ reachable |
| `wiki.biligame.com/gf2/闪电, /琼玖, /可露凯, /莉塔拉, /罗蕾莱, /武器, /导染指数, /战斗玩法` | Buff/debuff texts, values, durations, stat panels, weapon scaling, cooldown/confectance examples | ✅ reachable (some pages are beta-era, flagged below) |
| Reddit `r/GirlsFrontline2/comments/1hgw4zn` (via pullpush.io archive) | **In-game reproduction** of the damage formula incl. defense term | ✅ reachable via archive API |
| `iopwiki.com/wiki/GFL2_Combat`, `/wiki/Qiongjiu`, `/wiki/Common_Keys` | Stability/weakness/cover rules, turns, support attacks, keys taxonomy | ✅ reachable |
| `gfl2.help/en/characters/Qiongjiu`, `dotgg.gg/girls-frontline-2-exilium/qiongjiu/` | Skill multipliers, cooldowns, Confectance costs, fixed-key list | ✅ reachable |
| Game data dumps: `66hh/GF2ExiliumData` (CN beta `BattleConfigData.json`, `BattleEffectData.json`), `PotRooms/GFL2_Data` (EN dump) | `breakRound=2`, `suppressToHurtId=20`, `StableHit` channel; full EN tables **not yet parsed** | ✅ reachable (shallow parse done) |
| `prydwen.gg/gfl2/*`, `girlsfrontline2.fandom.com`, `game8.co`, `wiki.gg`, Reddit direct, most search engines | — | ❌ unreachable (404 / JS-challenge / 403 / no page) |

---

## 3. Mechanics

### 3.1 Damage formula and order of operations

**Mechanic** — Full damage calculation for an attacking hit.

**Source** — `wiki.biligame.com/gf2/伤害算法`; Reddit 1hgw4zn (in-game reproduction); `iopwiki.com/wiki/GFL2_Combat`.

**Confidence** — CONFIRMED for the structure and every listed factor (defense term, additive bonuses, phase, weakness, crit, ceil); the *written* operator order from the beta-era formula image is PROBABLE (image not OCR-able). Mathematically the multiplicative factors commute, so order only matters for grouping.

**Implementation interpretation** (recommended, stable for the MVP):

```
raw       = finalATK × skillMultiplier                      # skill describes its own % of ATK
mitigated = raw × finalATK / (finalATK + finalDEF)          # ≡ ATK/(1+DEF/ATK); final = post buff/debuff values
bonus     = 1 + Σ additive_bonuses                          # ALL additive: own dmg-up, target vuln (no generic Confectance bonus — U10 disproven)
phase     = 1.0 (always)                  # NO elemental counter wheel (corrected 2026); weakness is the only element interaction
weakness  = 1 + 0.10 × (# exploited weaknesses)          # additive across weaknesses (U20); separate factor, outside the additive DMG bucket
reduction = (1 − stability_red) × (1 − dmg_red) × (1 − cover_red)   # dummy: cover_red = 0
crit      = 1 + critDmg (attacker's Crit DMG stat)          # e.g. ×1.20 at 120% CDMG (CONFIRMED in-game, §3.3)
final     = ceil( mitigated × bonus × phase × weakness × reduction × crit )   # crit applies to the UNROUNDED product
fixed     = ceil( absolute fixed component )                 # U21: post-chain, its own ceil — never scaled by the chain
final     = normalChainFinal + fixed                         # total game damage
```

All "damage dealt up" / "damage taken up" bonuses are **added together in one bracket first** (BWiki example: `1 + 20% + 50% + 30% + 50% = 250%` final multiplier). Damage *reductions* are multiplicative on top.

**Unknowns** — exact written operator order of the beta formula image; **DoT/fixed damage resolved (U21)**: Fixed Damage is post-chain with its own ceil and DoT ticks are fixed-damage-type events (percent-of-ATK values still per-effect data); remaining crit unknowns (crit-rate sources/caps, CDMG linearity beyond 120% — see §3.3).

### 3.2 Defense

**Mechanic** — How DEF reduces incoming damage.

**Source** — Reddit 1hgw4zn (in-game reproduction: ATK 1213 vs DEF 194 → `1213/(1+194/1213)`); `wiki.biligame.com/gf2/伤害算法`.

**Confidence** — CONFIRMED (reproduced against an exact in-game number). `DEF:ATK = 1:1` halves damage; `2:1` → 1/3. A beta-era "flat ATK − DEF" description exists on old mechanic pages but is contradicted by the live-server reproduction; treat it as legacy. Enemies in early chapters have DEF ≈ 190–194 (two samples). **The current tested boss displays DEF 5,001 (confirmed in-game, U14)** — target-specific data; earlier "thousands unrealistic" assumptions are superseded for this target; no universal level-60 DEF magnitude exists (each target's displayed DEF is used).

**Implementation interpretation** — `mitigated = raw × finalATK/(finalATK + finalDEF)` counting post-buff/debuff defense. Dummy default `DEF = 0` (term degrades to 1.0) with full configurability — boss/target DEF (`dummy.defense`) is per-target DATA; boss rotations change values, not engine code.

**Unknowns** — live DEF tables for OTHER enemies/dummies (data-population per target); skills that subtract flat panel DEF (rare cases) — data-model them as DEF modifiers, not formula changes.

### 3.3 Critical hits

**Mechanic** — Crit rate source and crit damage multiplier.

**Source** — **In-game validation 2026-09-03 (Qiongjiu, Lv.60 V6)**; older references: `wiki.biligame.com/gf2/伤害算法` ("目前暴击伤害的修正为固定的1.5倍" — pre-validation text, superseded); character stat panels (base crit damage 120%); Reddit 1hgw4zn; IOPWiki GFL2_Combat.

**Confirmed in-game dataset** (dummy DEF 5000, no cover, no ammo weakness, Burn weakness only; Qiongjiu Basic is phase-less ("Physical" in game wording) → no weakness applies; no break; no buffs; CDMG 120%):

| Qiongjiu ATK | Normal Basic | Critical Basic | Repetitions |
|---|---|---|---|
| 1956 | 529 | **634** | same values reproduced multiple times |
| 1958 (weapon Lv1→Lv2, weapon ATK 24, ATK 1956→1958) | 529 | **635** | both reproduced twice |
| 1958 (CDMG raised 120.0% → 123.5%) | 529 | **654** | 654, 654, 654, 654 |

Formula reproduction (ATK 1958): `1958 × 0.80 × (1958/(1958+5000)) × 1.20 ≈ 528.947` → normal `ceil = 529`; crit `528.947 × 1.20 ≈ 634.736 → ceil = 635`. Observed 529/635 ✔. The 1956 case is the *discriminating* case: `ceil(529 × 1.20) = 635`, but the game shows **634** — proving crit is computed from the underlying **unrounded** damage, then ceiled. This also independently re-validates the defense term `ATK/(1+DEF/ATK)`, the additive bracket (1 + 20% no-cover bonus), and ceiling rounding at DEF 5000.

**Confirmed conclusions (U1 — RESOLVED):**
1. **Crit multiplier = the displayed Crit Damage stat** — Qiongjiu at 120% CDMG → **×1.20**. Not a universal ×1.5 (the earlier BWIKI "fixed 1.5" statement is superseded).
2. Crit multiplication happens **before** final damage rounding.
3. Final damage is **ceiling-rounded after the full calculation**.
4. Crit damage is **NOT** derived from an already-rounded normal hit.
5. **Crit DMG scales linearly beyond 120% (U19 — RESOLVED 2026-09-03)**: raising CDMG 120.0% → 123.5% changed the Basic crit 635 → 654, matching `ceil(pre × 1.235)` exactly — **multiplier = 1 + Crit DMG**, applied before the final ceiling. Crit Rate (cap + overflow conversion) is also CONFIRMED — see the next two bullets.

**Implementation interpretation** — `critMult = 1 + critDmg` (attacker's Crit DMG stat) applied inside the pipeline before `ceil`; the engine **derives it from character data** (`UnitState.critDmg`) — no hardcoded default remains. `configOverrides.critMultiplier` is retained **solely as a test-only alternative hypothesis**.

**Confirmed (2026-09-03, in-game passive text — U19 Crit-Rate half)** — Crit Rate has a **100% effective cap** when determining whether an attack crits; overflow above 100% is discarded **unless the attacking character's own passive converts it** (never a global rule). Confirmed passive wording: *"When dealing damage, if critical rate of this attack exceeds 100%, every 1% of overflow critical rate is converted to 1% critical damage."* — threshold 100%, **ratio 1:1 (CONFIRMED)**, no stated cap, applied to the attack's final Crit Rate. Engine implements it data-driven via PassiveEffect `excess_crit_conversion` (`threshold`/`ratio`/optional `cap`); converted Crit DMG feeds the same confirmed `1 + Crit DMG` multiplier. The conversion, the non-1:1 ratio path, the optional cap, and the no-passive discard are all **numerically locked** by `crit-overflow-validation.test.ts` (finalDamage assertions).

**Distinction (kept separate, U19):** (A) the universal Crit system — Crit Rate decides whether the attack crits, effective Crit Rate caps at 100%; (B) character/passive-specific conversion — excess Crit Rate becomes Crit DMG **only** via a passive/effect that grants it (confirmed ratio 1:1); (C) Crit Damage — multiplier is `1 + Crit DMG`. These are NOT merged into a universal "overflow always converts" rule.

**Open items (U19 — DATA POPULATION for future characters, not unresolved mechanics):** which characters carry such a conversion passive and their exact parameters; how Crit Rate is raised past 100% (attachment/stat sources). (CDMG linearity CONFIRMED to the tested 123.5%; anti-crit mechanics are PvP — out of scope anyway.)

### 3.4 Element/Phase interactions — NO counter wheel (CORRECTED 2026)

**CORRECTION (validated in-game 2026):** GFL2 does **NOT** have an elemental/Phase counter wheel. There is **no** relationship such as "Burn counters X", "Phase A counters Phase B", or **×1.2 counter / ×0.8 countered** interactions between elements. The earlier §3.4 reading (a 6-element counter wheel with ×1.2/×0.8, sourced from a BWIKI table) was **erroneous/superseded** and is removed.

**The only relevant element interaction is weakness matching:** targets expose elemental weakness(es) and/or ammo-type weakness(es); an attack exploits whichever weaknesses it matches. Per exploited weakness: **+10% damage** and **+2 Stability Damage** (validated 2026 — §3.5, U15a/U15b, weakness-stability). No element is inherently strong/weak against another element.

**Model status** — no counter mechanic exists: the engine's `phaseMultiplier` is structurally present but always neutral (1.0); `DummyConfig.phase`/`CharacterDef.phase` remain as element identity data only. The once-"UNKNOWN" phase-wheel question is **REMOVED from the unresolved register** (premise invalid).

### 3.5 Weakness exploit (弱点)

**AUTHORITATIVE TAXONOMY (2026)**: Phase elements = Burn/Hydro/Freeze/Electric/Corrosion; Ammo weakness categories = heavy/medium/light/shotgun/melee. `ice`→`freeze`, `acid`→`corrosion` renames; `hydro` new; `decay` NOT part of the taxonomy; `physical` is NOT an element — older text below that says "Physical" (attacks/damage) is **historical/source wording** for *phase-less* attacks (element `null`); their weakness dimension is the Ammo Type. No Physical phase or ammo weakness exists.

**Mechanic** — Attacking a target's *exposed* weakness (weapon-type or phase weakness).

**Source** — `iopwiki.com/wiki/GFL2_Combat`; Reddit 1hgw4zn.

**Confidence** — CONFIRMED (multi-source): each exploited weakness → +10% damage **and** +2 stability damage, with the weakness factor **additive across exploited weaknesses: `1 + 0.10 × count`** (U20, in-game 2026-09-03). **Burn weakness ×1.10** and **Burn + Medium ammo ×1.20** confirmed in-game — see dataset below.

**Confirmed in-game dataset (2026-09-03, Burn weakness)** — Attacker: Qiongjiu Lv.60 V6, Retired OTs-14 R1 Lv.2, no keys, ATK **1958**, CDMG 120%, no damage buffs (no Damage Up II). Target: Drone – Blaze Master Lv.60, DEF **5000**, stability 65/65, **Burn weakness**, Unaffiliated/Mechanicals, **No Cover**. Attack: Common Rail Lv.2 (Burn, 150% ATK). Observed: non-crit **1091** (repeated 1091, 1091, 1091); crit **1310** (1091, 1310, 1091, 1091).

```
base  = 1958 × 1.50 × (1958/(1958+5000)) ≈ 826.48
bracket = 1 + 0.10 (passive no-cover) + 0.10 (V6) = 1.20        # V6 (椎体) bonus NOT yet in character data — passed explicitly in the regression
normal = ceil(826.48 × 1.20 × 1.10 [Burn weakness]) = 1091      # ×1.10 is a separate factor, outside the additive DMG bucket
crit   = ceil(826.48 × 1.20 × 1.10 × 1.20 [CDMG]) = 1310        # CDMG ×1.20 applied before the final ceil (re-confirms §3.3)
twoWk  = ceil(826.48 × 1.20 × 1.20 [Burn + Medium ammo]) = 1191   # U20: 1 + 0.10×2, additive (multiplicative 1.21 → 1201 ruled out)
```

Confirmations: (1) Burn weakness multiplier is **×1.10**; (2) folding the weakness into the additive bracket instead (`1.30`) yields `1075 ≠ 1091` — **weakness is NOT part of the additive +DMG bucket**; (3) independently re-confirms CDMG = ×1.20 applied before the final ceiling; (4) **no effect is attributed to Overburn** (it contributed nothing here); (5) the target had stability 65/65 and it did **not** modify damage on this No-Cover target (Stability never alters damage absent Cover — see §3.7); (6) **U20 — two weaknesses are ADDITIVE: Burn only → 1091, Burn + Medium ammo → 1191** (`factor = 1 + 0.10 × count`; multiplicative ×1.21 would give 1201 ≠ 1191, ruled out).

**Implementation interpretation** — `weaknessFactor = 1 + 0.10 × (#matched weaknesses)` (additive across weaknesses, a separate factor from the additive DMG bucket); `stabDamage += 2 per matched weakness`. A hit that drops stability to 0 is computed at the pre-break damage level (i.e. the break hit does not benefit from stability reduction — Cover-scope detail). Configurable per dummy.

**Generic weakness also applies to Phase damage (VALIDATED 2026)** — a Burn attack vs a target weak to both Burn and Ammo receives the normal ×1.20 two-weakness multiplier (independent of Stability; §3.7). This is DISTINCT from the Ammo Weakness Upgrade system — see §3.18 (a separate mechanic that never applies to Phase damage).

**Weakness-matching validation (U15a, in-game 2026):** the weakness factor is the ADDITIVE matched count `1 + 0.10 × matchedWeaknesses`, where BOTH element weaknesses and the Ammo weakness tag count into the same factor. Validated with Qiongjiu (ATK 1958, Common Rail Lv.2 = Burn AR, 150% ATK, non-crit unless noted, No Cover, target DEF 5000, Phase-compatible dummy):
- **Test A — two matched weaknesses (Burn element + Ammo tag):** normal **1191**, crit **1470** (123.5% CDMG), repeated consistently.
- **Test B — one matched weakness (Burn only):** normal **1091**, repeated 4×.
- Conclusion: 1 matched → ×1.10, 2 matched → ×1.20 — the additive count rule (U20) extends to mixed element+ammo matches; AWU remains separate (phase-less-only, §3.18).

**TESTING LIMITATION (NOT claimed as validated):** a zero-weakness Phase target and an Ammo-only Phase target are **not testable** with the available dummy tools (the Ammo-only configuration is Phase-damage immune). The engine's count rule implies those cases but they are NOT in-game-validated; do not treat them as confirmed.

**Partial-match — CONFIRMED/RESOLVED (in-game 2026, U15a):** only weaknesses actually **MATCHED/exploited by the attack** determine the multiplier — the target's TOTAL number of displayed weaknesses does NOT. Validated: target displays ~10 weaknesses (elemental + ammo types); QJ Common Rail (Burn + Assault Rifle Ammo) exploits ONLY 2 → **×1.20** (1207 normal / 1491 crit @123.5% CDMG / 1207 normal). Math (`1974 × 1.50 × (1974/(1974+5000)) × 1.20 × 1.20 ≈ 1206.9 → 1207`; unrounded ×1.235 ≈ 1490.5 → **1491**). The engine already implements this (counts only element-eq and ammo-tag matches). NOTE: the reproduced damages use **target DEF 5000** (a "1295" figure in the source notes is Qiongjiu's own DEF, not the target's — the pasted 'Target DEF: 1295' contradicts the observed values). Conclusion: 1 matched → ×1.10; 2 matched → ×1.20; exposed-but-unmatched weaknesses contribute nothing.

**Weakness stability damage (U15, in-game 2026):** every attack has its own base Stability Damage; each weakness the attack exploits adds +2 Stability Damage. Validated formula: **Total Stability Damage = Attack Base Stability Damage + (2 × # weaknesses exploited)** — element AND ammo-tag matches both count into `# exploited` (generic across phase-less/Phase, independent of the damage multiplier). Validated examples (QJ, target 65 Stability; Basic base 2, Common Rail Lv.2 base 3):
- Basic, 0 exploited → **2** (65 → 63).
- Basic, 1 Ammo exploited → **4** (65 → 61).
- Common Rail, 1 Burn exploited → **5** (65 → 60).
- Common Rail, 2 (Burn + Ammo) → **7** (65 → 58).
AWU is a separate phase-less-only damage mechanic and is NOT mixed into this stability calculation.

**Phase-damage elemental-weakness validation (U15b, in-game 2026):** the generic elemental weakness multiplier applies to Phase damage exactly as to phase-less attacks — one matching element weakness → ×1.10; no additional Phase-specific weakness mechanic exists. Validated with Qiongjiu (ATK 1958, Common Rail Lv.2 = Burn, 150% ATK, non-crit, No Cover, bracket ×1.20 no-cover+V6):
- **Test A — target WITHOUT Burn weakness (DEF 1133):** `1958 × 1.50 × (1958/(1958+1133)) × 1.20 = 2232.54 → 2233` — exact non-weakness baseline.
- **Test B — target WITH Burn weakness (DEF 1286):** same setup, ×1.10 → **2340**.
- Conclusion: elemental weakness contributes ×1.10 on Phase damage through the SAME generic count-driven rule (`1 + 0.10 × #matched`); AWU must NOT apply to Phase damage (it remains phase-less-only — §3.18); generic weakness matching stays responsible for this behavior.

**Unknowns** — U15a matched-count cases (1 vs 2 matched weaknesses incl. the Ammo tag → ×1.10/×1.20) and the partial-match edge (only matched weaknesses count) are RESOLVED (2026); phase×weakness for ELEMENT weakness matches is RESOLVED (U15b, 2026). Dummy-tool limitation only: a zero-weakness Phase target and an Ammo-only Phase target are NOT testable with the available dummies — the count rule implies those cases but they remain untested (documented limitation, not an unresolved mechanic). (No phase-WHEEL counter-relation exists — the counter-wheel premise was corrected/removed 2026, §3.4.)

### 3.6 Glancing (擦伤) — REMOVED (beta artifact)

**Status** — **REMOVED 2026-09-03 (U2 tombstone).** Glancing is NOT a current-game mechanic for this simulator.

**Origin** — a single BWIKI damage-algorithm line ("擦伤时最终伤害 = 向上取整{伤害 × 0.1}") from **一测 / first closed-beta** material (the same beta-era formula image that also carried the superseded crit ×1.5 claim).

**Evidence against** — absent from the established live damage formula (GFL2 Damage Formula Translation: `ATK × Defense × Skill × Crit × Weakness × Damage Buff × Stability/Cover Reduction + Fixed Damage`), from the Reddit live-server formula reproduction, and from IOPWiki; no current-game evidence ever produced a glancing hit in any of our validations; ~two years of gameplay never encountered it.

**Conclusion** — removed from the engine/config/tests rather than treated as an unresolved live mechanic. The dead `glanceChance` placeholder (default 0, no RNG effect) never affected any default simulation.

### 3.7 Stability system (稳态)

**Mechanic** — Second, fully separate resource bar (hexagon segments beside the HP bar). Per-hit fixed stability damage (not a damage-formula product), break at 0, temporary damage-taken window, recovery.

**Source** — IOPWiki GFL2_Combat; `66hh/GF2ExiliumData` beta `BattleConfigData.json` (`breakRound:2`, `suppressToHurtId:20`, `StableHit` effect channel); BWIKI character pages (per-skill stability values).

**Confidence** —
- Stability is an independent resource w/ its own hit channel, unaffected by ATK/DEF/crit: CONFIRMED.
- Stability values are per-skill constants (typical 1–3 per hit; e.g. Qiongjiu basic 2, support attack 2): CONFIRMED examples, general table UNKNOWN.
- Break → "Exposed" with damage-taken increase: PROBABLE; the **increase %** is UNKNOWN (buff id 20).
- **Break duration — RESOLVED 2026-09-03 (permanent rule)**: the broken/exposed window is fixed by the always-2-turn Stability recovery (U6, current-game validated): break on Turn N → broken through N and N+1 → Stability restored at the START of N+2. The beta `breakRound = 2` value is supporting historical evidence only. Non-configurable. (U4 = duration; **U3 = no universal damage multiplier — resolved; Broken/Exposed is pure state**.)
- **Stability-cover reduction** (60% when stability > 0 in cover): CONFIRMED as a rule, but it is a **Cover mechanic — explicitly DEFERRED**; it never applies in the MVP because the target is **always No Cover** (the term is 1.0).
- **Recovery timing — CONFIRMED in-game (2026-09-03)**: stability broken during turn N is **restored on turn N+2** (exactly 2 turns later), restored to max. Model as a **2-turn recovery delay**. There is **no universal Exposed damage multiplier** (U3 resolved — removed from the engine).

**MVP scope (updated)** — **Stability and Exposed are mandatory mechanics**: stability damage per hit, break at 0, the Exposed/Broken state (**duration U4 — fixed by the always-2-turn recovery rule, not configurable; NO universal damage multiplier — U3 resolved; Broken/Exposed is pure state**), and recovery (U6, fixed 2 turns). Cover-dependent parts of the stability system (the 60% cover reduction) are **deferred** with Cover.

**Boss-domain scope (U5)** — This simulator is a **No-Cover boss DPS simulator**; Cover is permanently out of scope. Two SEPARATE concepts must not be conflated:

- **A. Generic Cover/Stability damage reduction (general formula) — OUT OF SCOPE.** The 60% stability-cover reduction, cover-reduction interplay, and the break-hit cover nuances require Cover; the target is always No Cover so they never apply (the engine has no cover term). In-game evidence (Blaze Master at 65/65 Stability) shows **no universal** No-Cover Stability damage reduction.
- **B. Boss-specific Stability-dependent passive damage reduction — IN SCOPE and CONFIRMED/IMPLEMENTED (2026-09-03).** Confirmed in-game boss passive tooltip: *"When stability is greater than 0 points, damage taken is reduced by 80%."* → **incoming damage × 0.20 while Stability > 0**; at Stability = 0 the condition is inactive. The engine implements this generically and data-driven (no boss ID hardcoded):
  - **Data model:** `DummyConfig.passives` on the boss/target + passive effect `{ kind: "conditional_damage_modifier", scope: "taken", when: "target.stabilityAboveZero", mode: "multiplicative", value: 0.2 }` (additive mode also supported), folded into the target's incoming-damage reduction chain. Different bosses define their own values/conditions via data.
  - **Break transition:** the condition is evaluated on the target's **pre-hit** state, so the stability-breaking attack is still reduced while stability > 0 at evaluation time. The sources establish no special break-hit rule for passives — none is invented.
  - **Broken state:** Stability = 0 → condition false → no reduction, until the confirmed U6 2-turn recovery restores Stability (the reduction returns on recovery).
  - **Fixed Damage:** the passive does not reduce fixed components — consistent with U21. In-game 2026: the boss's −80% 'damage taken' passive is **ordinary Damage Reduction** (fixed bypasses it: Overburn 1949 → 195) and is distinct from **Final DMG Reduction**, which DOES reduce fixed damage (1931×0.10×0.40 → 78) — the engine implements the final-DMG modifier chain (2026).
  - **Boss-tooltip secondary effects** (Deep Freeze application, preventing stability restoration during the break, restoring stability after 2 turns) are **outside generic U5 scope** and not implemented.
  - **U3 resolved — no universal Exposed/Broken damage multiplier:** breaking a boss only ends its Stability-dependent passives (`stability > 0` false); any 'bonus vs Broken/Exposed' effect is a CHARACTER-specific mechanic to be modeled in that Doll's data.

**Implementation interpretation**

```
stab_damage = skill.stabDamage + (2 × #weaknesses exploited)
target.stability -= stab_damage
if target.stability <= 0 and not already exposed:
    apply Exposed buff (window duration fixed by the 2-turn recovery rule — U4 resolved, non-configurable)
    → no generic damage multiplier (U3 resolved — Broken/Exposed is pure state)
recovery: 2-turn delay after break (STABILITY_RECOVERY_DELAY = 2, CONFIRMED U6) → stability restored to max + Exposed ends
```

(The former "stability reduction term becomes 0 while exposed" step is part of the **deferred Cover** mechanic — not modeled in the MVP.)

Attacker stability is irrelevant to the attacker's own damage output (CONFIRMED) → do not feed it into damage; only read the *target's* exposed flag.

**Unknowns** — per-unit max stability and exact per-skill stability damage; whether stability damage continues against an already-exposed target; AoE/multi-segment stability splitting. (U3 resolved — no universal Exposed damage multiplier; U4 broken window RESOLVED — fixed 2-turn recovery; U6 recovery CONFIRMED; the confirmed test restored stability to max — general "partial restore" behavior is not implied.)

### 3.8 Stats and stat scaling

**Mechanic** — Panel attributes and the panel formula.

**Source** — BWIKI character pages (Qiongjiu 琼玖, Sharkry 夏克里, Suomi 索米, Lightning 闪电) and `/gf2/伤害算法`.

**Confidence** — Attribute list CONFIRMED; no ACC/EVA stats exist (CONFIRMED — site-wide index has none); panel formula CONFIRMED: `finalATK = (small ATK sources summed) × (1 + Σ big ATK% bonuses)` (same for DEF/HP%).

Attributes: ATK (攻击), HP (生命), DEF (防御), Stability Index (稳态指数), Crit Rate (暴击), Crit DMG (暴击伤害, panel base 120%), ATK%/HP%/DEF% (attack/life/defense %, "big stats"), Stability Damage Reduction % (稳态减伤), 行动力 movement (grid/round), 攻击范围 attack range (grids), weaknesses (弱点).

**Base Crit Rate = 20% for ALL characters** (user-provided in-game knowledge, 2026-10-09 — source
hierarchy level 1). The per-character `CharacterDef.base.critRate` remains explicit data (each doll
declares it) rather than an engine-wide default; this fact is what makes the declared value
predictable, not a reason to hardcode it. **Base Crit DMG is likewise uniform: the panel base is
120% (`critDmg 0.2`, multiplier `1 + critDmg`)** — confirmed for Qiongjiu (§3.3) and stated by the
user for Vector (`docs/dolls/vector.md` §3).

Level-60 base magnitudes (CONFIRMED, 2024 BWIKI data): Qiongjiu `ATK 119→1224, HP 233→2494, DEF 65→695, stability 9, crit 20%, cdmg 120%`; Suomi ATK 837 / HP 2298 / DEF 725. With weapon + helix, an endgame DPS panels ~2000–3200 ATK, ~700–1100 DEF, ~3000–6000 HP (reasonable projection, PROBABLE).

**Implementation interpretation** — store base stats + additive flat (small) sources + percentage (big) modifiers; compute panel at init once per sim: `flat × (1 + pct)`.

**Unknowns** — current live level cap (60 vs 70 on CN, 2025+); complete small-ATK source list per doll.

### 3.9 Weapons and calibration (校准/调校)

**Evidence basis (2026)** — authoritative: the **Golden Melody (金石奏)** screenshot and the evidence established in this conversation. Golden Melody is an **elite** weapon, the **signature weapon of Qiongjiu (琼玖)**, max-level **ATK 369**, **Attack Boost +15%**, **Calibration 6 levels**. **Weapon level/proficiency curves are OUT OF SCOPE — the simulator models MAX-LEVEL weapons only** (per-level intermediate values are neither modeled nor claimed).

**Structure (established conceptual model, 2026)** — a weapon is built from FOUR SEPARATE concepts:

```
Weapon
├── Max-level Stats        (ATK, Attack Boost sub-stat — feeding the panel only)
├── Effect                 (Calibration 1–6 — calibration changes ONLY the Effect)
├── Trait                  (separate from the Effect)
└── Imprint                (Owner-only — active ONLY when the owning Doll equips the weapon)
```

- **Calibration modifies the Effect only** — it NEVER changes the weapon's max-level base stats.
- **Imprint owner-gating applies to the Imprint only**, not automatically to the entire weapon.
- **Calibration level belongs to the EQUIPPED weapon configuration (2026):** `ScenarioTeamMember.weaponId` → `Registry.getWeapon` → the equipped `WeaponDef` → its `calibrationLevel` — NOT to `CharacterDef` (a character describes the doll, not her gear). The simulator models Golden Melody at **C1–C6**; all six Effect values are registered in `src/data/weapons.ts` and consumed generically.
- **Weapon mechanics are NOT assumed identical to Key mechanics** — Effect / Trait / Imprint are separate concepts; each is modeled on its own evidence (GOLDEN MelODY-specific behavior is data-scoped to this weapon; see evidence status below).

**Source** — Golden Melody screenshot (user-provided, 2026) + this conversation; historical: BWIKI `/gf2/武器`, Qiongjiu page (signature 金石奏).

**Golden Melody — Max-level Stats (source fact):** ATK **369** (max level); Attack Boost **+15%** (ATK% sub-stat). (Historical endpoints 53 → 369 retained in validation-checklist row 15; per-level curve NOT modeled.)

**Golden Melody — Effect by Calibration (SOURCE FACTS, tooltip screenshot 2026; C1's Damage Dealt additionally VALIDATED in-game — see below):**

| Calibration | Damage Dealt | Support Action Damage | Activations | Max stacks |
|---|---|---|---|---|
| C1 | +10% | +10% | 1 | 2 |
| C2 | +10% | +15% | 1 | 2 |
| C3 | +15% | +15% | 1 | 3 |
| C4 | +20% | +15% | 1 | 3 |
| C5 | +20% | +20% | 2 | 4 |
| C6 | +20% | +20% | 2 | 4 |

The Effect changes at the calibration boundary; the max-level base stats never change with calibration.

**Golden Melody — Charging (weapon EFFECT buff; VALIDATED in-game 2026):** Charging stacks are granted **when Qiongjiu GAINS A BUFF** — the trigger is NOT "end of Qiongjiu's action" (the earlier simplified wording "gains 1 stack at the end of Qiongjiu's action" is superseded; end-of-action matters ONLY because Golden Melody's Trait can grant a random buff at that point). Two distinct events:
- **A) Qiongjiu gains a buff** → **Charging +1** (immediate, subject to the current calibration's maximum stack limit).
- **B) Qiongjiu ends her action at full HP** → **Golden Melody Trait grants a random 1-turn buff** → that newly gained buff **also causes Charging +1**.

Confirmed trigger examples (direct in-game observations):
- Qiongjiu casts the **Ultimate** on her own turn → the Ultimate grants **Support Boost II** (a buff gain) → **immediately +1 Charging**.
- Qiongjiu finishes that Ultimate action **at full HP** → the **Trait** grants a random 1-turn buff (another buff gain) → **+1 Charging**. After that Ultimate turn she can therefore hold **+2 Charging stacks total** (1 from gaining SB II + 1 from gaining the Trait buff), capped at the calibration maximum.
- In the previously observed ally Support Action flow, Qiongjiu gains **Damage Up II** from her Ultimate passive during the action → that buff acquisition also grants **+1 Charging** before Qiongjiu attacks.

Preserved **validated** stack/consumption facts (C1): **+10% Support Action damage per stack**; **maximum 2 stacks at C1**; **Charging persists when unused**; **one Support Action consumes 1 Charging stack**; **cannot be cleansed**; stacks accumulate across actions up to the calibration maximum. Charging is a **weapon Effect buff — NOT the Support Boost status**: it behaves like the Support Boost family in stacking/consumption behavior but is a separate weapon mechanic unless future evidence proves otherwise. Only C1 behavior was directly observed; other calibrations' Charging values are not combat-observed. The **"buff gained → Charging stack" trigger is VALIDATED** by the observations above, but **not exhaustively tested for every possible buff** — do not claim universal coverage; no internal event-system implementation is invented.

**Golden Melody C1 — Damage Dealt +10% (VALIDATED in-game 2026, controlled test 975):** QJ ATK 2683 · Basic Fuse 80% · target DEF 5000 · No Cover · no weakness bonus · no other buffs/debuffs · non-crit · No-Cover +20% + Golden Melody Damage Dealt +10% → additive bucket 1.30.
- base = 2683 × 0.80 = 2146.4
- defense coefficient = 2683 / (2683 + 5000) = 0.34921
- post-DEF = 2146.4 × 0.34921 ≈ 749.55
- 749.55 × 1.30 = 974.41 → ceil = **975** ✓ (draft hand-calculation intermediates may round slightly differently; the observed final **975** reproduces exactly through the engine pipeline)
Conclusion: C1's +10% Damage Dealt **enters the existing additive DMG% bucket**. Do NOT generalize — this validates the displayed **Damage Dealt** effect only, not every Golden Melody effect.

**Golden Melody C1 — Charging Support Action damage +10% (VALIDATED in-game 2026, controlled test 1434):** QJ ATK 2683 · Support Action 90% ATK · target DEF 5000 · No Cover · no weakness exploited · Golden Melody C1 · observed **1434**. Active additive modifiers — Golden Melody passive Damage Dealt +10% · Out-of-Turn Damage +10% · No-Cover +20% · Damage Up II +20% · **Charging +10%** → bucket 1.70:
- base = 2683 × 0.90 = 2414.7
- defense coefficient = 2683 / (2683 + 5000) = 0.349212
- post-DEF = 2414.7 × 0.349212 ≈ 843.24
- 843.24 × 1.70 = 1433.51 → ceil = **1434** ✓
Conclusion: **Charging's +10% is an ADDITIVE DMG% modifier for Support Action damage** — it uses the existing additive DMG% bucket (NO separate damage formula or modifier bucket). This validates the **Charging mechanic itself**. **C2–C6 numerical values need NO separate combat validation** — the calibration evidence already documents those values and the engine must handle the selected calibration data generically. Nothing else about Golden Melody is speculated here.

**Golden Melody — Trait (SOURCE FACT — trigger condition; 13 OUTCOMES DIRECTLY OBSERVED in-game 2026):** if the weapon user has full HP at the end of the action, she gains a **random** buff, classified by the game as a buff, lasting **1 turn**. The **13 observed outcomes** (each 1 turn unless noted; displayed effects recorded verbatim, NOT generalized to an engine mechanic):

1. **Domain Penetration I** — AoE damage ignores 20% of target DEF.
2. **Critical Rate Boost I** — Critical Rate +10%.
3. **Continuous Healing I** — restores 10% of max HP at the end of the action.
4. **Defense Up I** — Defense +20%.
5. **Piercing I** — targeted damage ignores 20% of target DEF.
6. **Area Defense I** — AoE damage taken −10%.
7. **Targeted Attack Defense I** — targeted damage taken −10%.
8. **Stability Offensive I** — stability damage dealt +1.
9. **Targeted Attack Boost I** — targeted damage dealt +10% (cannot be cleansed).
10. **Coverage Boost I** — AoE damage dealt +10% (cannot be cleansed).
11. **Phase Boost I** — phase damage dealt +10%.
12. **Attack Up I** — Attack +10%.
13. **Movement Up I** — Mobility +1 tile.

These 13 outcomes are the **COMPLETE Trait pool — VALIDATED in-game (2026)**: **exactly 13**, all with **equal probability (1/13 each)**, and Golden Melody selects **exactly ONE** buff when the trigger occurs (it never selects multiple buffs). Selection is **uniform** — **no weights, priorities, or additional outcomes are invented**. The **selection itself is IMPLEMENTED** with the existing deterministic seeded RNG (`Rng.nextInt`, uniform 1/N): identical seeds ⇒ identical selections. Outcome **effects are executable only where the engine has a generic mechanic** — Domain Penetration I (+20% DEF ignore on AoE) and Piercing I (+20% DEF ignore on targeted damage) via `def_ignore`, Area Defense I (−10% damage taken from AoE attacks) and Targeted Attack Defense I (−10% damage taken from targeted attacks) via `damage_reduction` gated to the incoming category, Targeted Attack Boost I (+10% targeted damage dealt), Coverage Boost I (+10% AoE damage dealt) and Phase Boost I (+10% Phase damage dealt) via `damage_modifier` (additive DMG% bucket, gated), Stability Offensive I (+1 Stability damage dealt, via `stability_damage_bonus`), Continuous Healing I (+10% max HP at the holder's action end, via `heal`), Critical Rate Boost I (+10% Crit Rate), Defense Up I (+20% DEF) and Attack Up I (+10% ATK) via `stat_modifier`; the other **1 outcome (Movement Up I) is RECORDED-ONLY (`deferredNote`)** because the engine has no mobility mechanic — its displayed effect is documented verbatim and **no mechanic is invented** to force it. Do NOT invent additional outcomes or duplicate behavior; do NOT infer timing/implementation beyond what was directly observed.

**Golden Melody — Imprint, Qiongjiu (source fact; owner-gated):** "Increase damage dealt to ELIDs by 2.5%. If the target is not protected by Cover, increase it by an additional 2.5%." The Imprint is **ACTIVE ONLY when the weapon is used by the actual owning Doll — for Golden Melody, Qiongjiu**. If another Doll equips Golden Melody, the Imprint does not apply. No additional Imprint mechanics are generalized beyond this established owner-gating rule.

**Evidence status (2026):**
- **VALIDATED:** Golden Melody max-level ATK **369** and Attack Boost **+15%** (direct screenshot/source evidence); **calibration changes the Effect only**; **Charging exists with its observed C1 stack/consumption behavior**; **C1 Damage Dealt +10% enters the additive DMG% bucket** (controlled **975**); **C1 Charging +10% Support Action damage (additive DMG% bucket, controlled 1434)**; the **13 Trait outcomes directly observed**; **Imprint — VALIDATED in-game (2026):** Qiongjiu owning her signature Golden Melody activates the Imprint (+2.5% Damage Dealt vs ELID; an additional +2.5% when the target is also No Cover; total +5.0% on ELID + No Cover; additive in the existing Damage Dealt % bucket).
- **SOURCE / SCREENSHOT (Level-1 source facts):** Golden Melody structure and the displayed C1–C6 Effect values; the Trait trigger condition; the Imprint text and values.
- **NOT TESTED / UNKNOWN:** whether all 13 Trait outcomes share identical internal timing/implementation; the in-combat effects of the **1 RECORDED-ONLY Trait outcome (Movement Up I)** (its def documents the displayed effect with no engine mechanic — the selection/timing/duration are VALIDATED 2026); Golden Melody Support Action Damage values in combat **beyond C1** (C1's +10% is the validated Charging value; other calibrations need NO separate combat validation per the calibration evidence); full calibration behavior beyond the directly observed Charging/C1; the **Imprint Cover-side branch** (unrunnable — the MVP has no Cover; its ELID/No-Cover values are VALIDATED 2026); whether other weapons share the Effect/Trait/Imprint structure; any weapon rank/refinement mechanics not directly evidenced.
- **OUT OF SCOPE:** intermediate weapon level/proficiency ATK curves; any weapon-level interpolation.
- **Architecture status:** **Weapon identity & registry IMPLEMENTED (2026)** — weapons are REUSABLE `src/data/weapons.ts` definitions equipped via `ScenarioTeamMember.weaponId` (1 Weapon Slot per character) and resolved through `Registry.getWeapon` (unknown ids throw); the resolution chain is `weaponId → Registry.getWeapon() → equipped WeaponDef → calibrationLevel` — calibration belongs to the EQUIPPED weapon configuration, NOT `CharacterDef`. **Implemented:** max-level weapon modeling · Golden Melody calibration C1–C6 · Damage Dealt calibration · Charging · **Activations** (per qualifying buff gain: C1–C4 = 1 Charging stack, C5–C6 = 2; Max Stacks C1–C2 = 2, C3–C4 = 3, C5–C6 = 4; one Support Action consumes exactly 1 stack) · **Imprint** (additive DMG% bucket; applies to the existing damage paths; data-driven via `WeaponDef.ownerCharacterId` + `imprint`; **automatic signature-owner activation — OFF by default, activates when the equipped weapon's `ownerCharacterId` matches the dealer's character ID; no manual toggle exists**; requires the generic target Race/Type representation (`raceTypes` — ELID is a Race/Type VALUE, not a damage type/element/weakness/flag)). **MVP-deferred / untestable:** Cover (MVP targets are No Cover only) — therefore the Imprint's **Cover-side branch is documented but cannot currently be executed**. **IMPLEMENTED:** Golden Melody **Trait** — full-HP action-end trigger, exactly ONE uniform 1/13 selection via the deterministic seeded RNG, 1-turn buff; data-driven (`WeaponDef.trait` pool + generic `applyWeaponTrait` hook); 12 outcomes executable — **Domain Penetration I (20% DEF ignore on AoE, `def_ignore`)** · **Piercing I (20% DEF ignore on targeted damage, `def_ignore`)** · **Area Defense I (−10% damage taken from AoE, `damage_reduction`)** · **Targeted Attack Defense I (−10% damage taken from targeted, `damage_reduction`)** · **Targeted Attack Boost I (+10% targeted damage dealt, `damage_modifier` gated)** · **Coverage Boost I (+10% AoE damage dealt, `damage_modifier` gated)** · **Phase Boost I (+10% Phase damage dealt, `damage_modifier` phase-gated — existing taxonomy: element ≠ null)** · **Stability Offensive I (+1 Stability damage dealt, `stability_damage_bonus`)** · **Continuous Healing I (10% max HP at the holder's action end, `heal`)** + 3 via `stat_modifier` — 1 RECORDED-ONLY (`deferredNote`, Movement Up I — no invented mechanics).

(Historical: the older "`ceil(lvl1_value × coefficient / 1000)`" per-level formula claim (BWIKI, coefficient 18.4) is **relegated history**, not a modeled mechanic — curves are OUT OF SCOPE. Per-rarity ATK ranges ~200–260 blue / ~350–450 elite: **PROBABLE** historical note, no new evidence.)

**Implementation interpretation** — **IMPLEMENTED (2026, fully data-driven):** weapons are REUSABLE registry definitions equipped via `ScenarioTeamMember.weaponId` and resolved `→ Registry.getWeapon() → equipped WeaponDef → calibrationLevel`; **calibration is part of the EQUIPPED weapon configuration** (`WeaponDef.calibrationLevel` → per-calibration Effect; ABSENT = no Effect — pre-weapon validations preserved). The resolved calibration's **Damage Dealt** enters the existing additive DMG% bucket for every attack (975 validated) and its **Charging** counter contributes per-stack Support Action damage (support-scoped, same bucket — 1434 validated). **Charging is a weapon-effect CHARGE COUNTER** (not a status): gains stacks when the holder GAINS A BUFF, `stacksPerGain` per gain (**Activations**: C1–C4 = 1, C5–C6 = 2 — NOT a separate proc counter, cooldown, reset, or unknown mechanic), capped by the calibration's maxStacks, persists when unused, 1 consumed per Support Action, inherently un-cleansable. **Imprint IMPLEMENTED** — data-driven via `WeaponDef.ownerCharacterId` + `imprint` (target Race/Type `targetType` bonus + `noCoverBonus`), **automatic signature-owner activation**: OFF by default, activates when the equipped weapon's `ownerCharacterId` matches the dealer's character ID; NO manual activation switch; additive in the existing DMG% bucket; applies to all existing damage paths (normal, Support Action, out-of-turn). Generic target **Race/Type** (`DummyConfig.raceTypes`). **Trait IMPLEMENTED** — data-driven via `WeaponDef.trait`: a generic full-HP action-end hook grants exactly ONE uniform-random buff from the 13-outcome pool (`Rng.nextInt` — deterministic per seed), lasting 1 turn; executable effects where a generic mechanic exists **(Domain Penetration I: 20% DEF ignore on AoE and Piercing I: 20% DEF ignore on TARGETED damage — both `def_ignore` (aoe: true / aoe: false) in the defense term of the normal chain only; Area Defense I: −10% damage taken from AoE and Targeted Attack Defense I: −10% damage taken from TARGETED attacks — both `damage_reduction` gated to the incoming category (`"aoe"` / `"targeted"`); Targeted Attack Boost I: +10% TARGETED dealt, Coverage Boost I: +10% AoE dealt and Phase Boost I: +10% PHASE dealt — all `damage_modifier` (dealt additive) gated, in the existing DMG% bucket; Phase gate uses the EXISTING taxonomy (Phase = `element !== null`, no new element/category); Stability Offensive I: +1 Stability damage dealt — `stability_damage_bonus` added to the attack's TOTAL stability damage (stability only, never HP/DMG%/DEF/weakness/crit); Continuous Healing I: 10% max-HP restore at the holder's action end — `heal`; Crit Rate Boost I / Defense Up I / Attack Up I via `stat_modifier`)**; the other 1 outcome (Movement Up I — mobility) RECORDED-ONLY (documented, no invented mechanics).

**Unknowns** — whether all 13 Trait outcomes share identical internal timing/implementation; the in-combat effects of the 1 RECORDED-ONLY Trait outcome (Movement Up I — mobility; selection/timing/duration are VALIDATED 2026); Golden Melody Support Action Damage calibration values in combat; full calibration behavior beyond the observed C1/Charging; **Imprint Cover interaction** (Cover behavior remains unavailable in the current MVP — the Cover-side Imprint branch is documented but not executable on No-Cover targets; the ELID/No-Cover magnitudes are VALIDATED 2026); whether other elite weapons share the Effect/Trait/Imprint structure; any weapon rank/refinement mechanics not directly evidenced. Resolved unknowns are NOT re-opened (e.g. Activations/Max Stacks are established as `stacksPerGain` Charging stacks per qualifying buff gain; the Trait pool is established as the exact 13 uniform outcomes).

### 3.10 Buffs / debuffs / status effects

**Mechanic** — Generic effect system with durations in turns, tiered variants, stacking, tick timing.

**Source** — BWIKI pages for Lightning, Klukai, Litta, Lorelei; `/gf2/伤害算法`.

**Confidence** —
- Containers CONFIRMED: buffs (攻击提升I +10%, II +15%; 防御提升II +30%; 减伤 60% 1 turn; 受疗 +50%; Concealment 掩护 −2 stab dmg/layer, max 3; Extra/Bonus Action effects), debuffs (攻击降低I −10%; 防御降低I −20%, II −30%; 易伤I +10% dmg taken; Terror; Taunt; Lure; Stun; DoTs: 溢火 burn — caster's 10% ATK fixed dmg at action end, 强酸倾压 corrosion — 12% ATK per layer, +12%/layer, max 10, refresh on apply, un-dispellable).
- Durations in «X turns» and «X big rounds» exist (big round = player phase + enemy phase): CONFIRMED. DoT/end-of-action timings exist: CONFIRMED. **Tick point CONFIRMED for normal timed buffs (in-game 2026-09-03, Attack Up II): the duration is consumed at the END of the recipient's own action** (U7 RESOLVED — engine default `ownActionEnd`). Statuses with their own timing text remain status-specific (not claimed beyond the observed case).
- **ATK Up buff family (I / II / III) — VALIDATED in-game (2026):** a TIERED, EXCLUSIVE family (`ATK Up I < II < III`). ATK Up II = **+15% effective ATK**, applied IMMEDIATELY to the recipient (no delay to the recipient's next turn; clean QJ read 1933 → 2223 = `1933 × 1.15`, an earlier 1974 → 2268 reading was contaminated by a food buff and is discarded). Duration is consumed at the END of the buff HOLDER's own action (not the applier's, not global rounds) — matches the U7 model; example (2-turn buff): holder starts turn → still 2; finishes action → 1; next turn starts → still 1; finishes action → 0 → expires. Same-tier reapplication REFRESHES duration (U8). **Higher tier REPLACES lower tier — not additive, no coexistence.** Engine note (NOT implemented, documented): `StatusEffect.stat_modifier` is declared in the type union but is not applied by the engine (no effective-stat pass), and `applyStatus` has no cross-status tier-replacement logic — the recognized future steps for ATK Up data.
- **Same-tier reapplication CONFIRMED for normal cases (in-game 2026-09-03, Attack Up II): reapplying the same status tier REFRESHES the duration and does NOT add another stack** (U8 RESOLVED — engine default; non-stackable). Statuses whose text defines explicit stacking (e.g. max 3/8/10) remain governed by that text.
- All damage-side bonuses are additive (§3.1): CONFIRMED.
- "不可驱散" (un-dispellable) flag exists: CONFIRMED.
- Official control-type set: taunt/evasion/lure/stun: CONFIRMED (out of MVP scope, but note).

**Implementation interpretation** — generic `Status` records: `id, stacks, maxStacks, duration (big-rounds), tickAt (actionEnd|roundEnd|ownTurnStart), instanceKey (caster), purgeable, statMods[], dmgMods[], stabilityMods[], hooks[]`. DoT/status-sourced fixed damage uses the EFFECT APPLIER's ATK at cast time and does **not** crit or use DEF (fixed-damage branch) — **VALIDATED 2026 (Overburn: 10% of the applier's ATK, ceiled; triggers immediately on gain, then at the end of each of the HOLDER's next two actions, then expires — sequence 198/198/198 = 594 at 1974 ATK; fixed damage bypasses ordinary Damage Reduction — 1949 → 195 vs an 80% DR effect)**. Final DMG modifiers (validated 2026): fixed damage is multiplied by **(1 + Σ Fixed DMG Buffs) × (1 − Σ Final DMG Reduction)** on the UNROUNDED value, then ceiled — implemented (2026) at both fixed-damage sites (status-sourced `applyStatusFixedDamage` and skill-sourced absolute fixed via `rollHit`). **Ownership confirmed (2026): Fixed DMG Buffs are buffs on the attacking unit/applier (the validated +10% Fixed DMG Key); Final DMG Reduction is a buff on the target being attacked (visible on the target) — matching the engine's applier-side buff / holder-side reduction sourcing.** (Terminology reclassified 2026: the earlier project label "Final DMG Increase" is the source's "Fixed DMG Buff"/"Fixed DMG Buffs"; there is no separate Final DMG Increase mechanic.) Ordinary Damage Increase/Reduction never enter this product.. **Stat modifiers (2026, engine):** the declared `stat_modifier` effect (`atk | def | hp | critRate | critDmg`, `flat | pct`) is now CONSUMED: effective stat = `(base + Σflat) × (1 + Σpct)`, with ATK/HP/DEF rounded UP (validated ATK Up II: 1933 × 1.15 = 2222.95 → 2223) and the CRIT stats (`critRate`, `critDmg`) CONTINUOUS — the integer-panel rounding rule applies to ATK/HP/DEF only. Applied at hit time to the attacker's ATK/CritRate/**CritDmg** and the defender's DEF (`statModifier` in `src/engine/statuses.ts`, consumed in `dealDamageHit`). If no modifiers are active, the exact panel/base stat is preserved. HP is supported by the helper but currently has no combat consumer in the MVP. Fixed-damage applier ATK remains the panel value (per the source's "does not include conditional buffs"). **`critDmg` (added 2026 — Apathetic Resistance):** a Crit-DMG status enters the CONFIRMED crit multiplier `1 + Crit DMG` (U1/U19) through the same `statModifier` call — one more source in that stat, never a parallel crit path or a new bucket. The buff's Crit DMG is a FRACTION (`0.25` = +25%, the repo convention where `0.2` = the displayed 120%). **DEF Down II VALIDATED in-game (2026):** percentage DEF reduction is a `stat_modifier` (`def` pct, −30%): dummy DEF 5000 → 3500 = `5000 × (1 − 0.30)` — applied directly to the target's effective DEF (not a `damage_modifier: taken`/reduction mechanic); covered by `stat-modifier-validation.test.ts`. **Duration model (U7):** decrement at the recipient's own action end — CONFIRMED (in-game 2026-09-03); **self-applied buffs also tick at the END of the same casting action (VALIDATED 2026, Fortification Protocol / Positive Charge 3 → 2)**; the stationary target takes a minimal pass-turn each round so target-side `ownActionEnd` statuses tick naturally (§3.16).

**Unknowns** — status-specific timings/stacking beyond the observed default (statuses with their own tick/stacking text); full element-DoT definitions for the five phase elements (only burn & corrosion are textually documented).

**Vulnerable I & Damage Up II (added 2026, authoritative tooltips):** `vulnerable_i` = target-side damage taken +10% (`damage_modifier` scope `taken`, additive; category debuff — "considered a defense debuff"); `damage_up_ii` = source-side damage dealt +20% (scope `dealt`, additive; category buff). QJ applications: Pressing the Momentum Lv2/V4 applies Vulnerable I to the No-Cover target for 1 turn — **IMPLEMENTED & VALIDATED 2026** (applied on the existing Support Action trigger, immediately BEFORE Qiongjiu's Support Action; expires at the target's turn-end; independent of Confectance level); Lv3/V5 applies Damage Up II for 1 turn to Qiongjiu AND to the triggering allied unit BEFORE that ally's attack — **IMPLEMENTED & VALIDATED 2026** (the triggering attack and Qiongjiu's ensuing Support Action both benefit; the ally loses it at its own turn end, Qiongjiu at her next turn end; recipients exactly = Qiongjiu + triggering ally). Default Vulnerable durations beyond V4's 1-turn use, plus stacking and cleansing, are NOT established. **Support Boost I — ONE buff instance, TWO effects (VALIDATED 2026, 883 + 538):** source **Common Rail** (self-applied), scope **Support Action**, persistent (NO duration), stackable (each application +1 stack; stacks = activations), **cannot be cleansed**. Effects — both additive inside the **Damage Buff Factor** and both **Support-Action-scoped**: **+15% Support Action damage** and **+10% vs Exposed targets** (requires an Exposed/Broken target). VALIDATED in-game 2026: (1) **538** — QJ ATK 1977 Basic Attack vs an Exposed target with SB I active = `ceil(1977 × 0.80 × (1977/6977) × 1.20) = 538` — the +10% Exposed effect did **NOT** apply to a Basic Attack ⇒ **both effects are Support-Action-scoped**; (2) **883** — QJ ATK 1977 Support Action with SB I, Exposed target, DU2 +20% and OT/V3 +10%: `base = 504.18`, factor `1 + 0.20 + 0.20 + 0.10 + 0.15 + 0.10 = 1.75`, `504.18 × 1.75 = 882.32 → ceil 883` ✓ — both SB I effects contributed to one Support Action; (3) persistence — the buff remains active indefinitely when no Support Action occurs and Basic Attacks do not consume it; (4) stacking — Skill 1 twice → 2 stacks; (5) **one Support Action consumes exactly one stack** (2 → 1). "Activates 1 time" is therefore per-stack (stacks = activations), now validated behavior. **Stack count does NOT increase damage magnitude — VALIDATED (2026): SB I with 1 stack and with 2 stacks both dealt the same 883 on the Support Action**; the +15%/+10% apply once while ≥1 stack remains, and stacks merely represent remaining activations. **Support Boost II (rank 2, in-game screenshot source):** same tooltip STRUCTURE as SB I with the ONLY explicit difference being the Support Action damage value **+30% instead of +15%** (plus the identical +10% vs Exposed component); **+30% is now VALIDATED in-game 2026 by a DIRECT controlled combat number (1029):** QJ ATK 2000 · Support 90% · physical/phase-less · No Cover · target DEF 5000 Exposed with Vulnerable I · DU2 +20% · No-Cover +20% · SB II +30% · SB II +10% vs Exposed · Out-of-Turn +10% · Vulnerable +10% → additive bucket 2.00 → ceil(514.2857 × 2.00) = **1029**, reproduced exactly by the existing additive DMG% bucket (no separate multiplier); the +10% vs Exposed is discriminated by the same configuration without an Exposed target reproducing **978**; the Burn phase weakness does NOT apply (physical/phase-less Support Action). Under the project's **rank-inheritance rule** (validation-checklist.md §0), SB II inherits SB I's validated generic behavior: persistence, stackability with no invented maximum, stacks = activations, one stack per Support Action, flat magnitude regardless of stack count, Support Action scope, Basic Attack unaffected, un-cleansable. Rank-specific interactions VALIDATED 2026: SB II replaces SB I entirely and blocks SB I applications; SB II consumes exactly one stack per Support Action. **No Support Boost III exists (source).**

**Support Boost — stacking limit & cross-buff interactions (ALL VALIDATED in-game 2026):**
1. **SB I has NO observed maximum stack count** — over 7 turns, repeated applications reached 4 stacks with no cap observed; in normal play stacks are continually consumed by Support Actions. Engine representation: `maxStacks` ABSENT (= unbounded); the previous unvalidated `maxStacks: 9` placeholder is REMOVED. Do NOT invent a real cap.
2. **SB I → SB II replacement:** with SB I ×2, casting the Ultimate (grants SB II ×3) **completely replaced** the SB I stacks — all SB I disappeared → SB II ×3. IMPLEMENTED via `replaces: ["support_boost_i"]` on SB II (generic `applyStatus` removal; reported in `statusesExpired`).
3. **SB II priority BLOCKS SB I:** with SB II ×3, using the Skill that normally grants SB I ×1 applied **NOTHING** — no SB I appeared and SB II stayed ×3. **While SB II is active, SB I applications are blocked; SB II has priority.** IMPLEMENTED via `blockedBy: ["support_boost_ii"]` on SB I (blocked applications record no `statusesApplied`/`appliedSources`).
4. **SB II consumption:** with SB II ×3, one Support Action reduced it to ×2 — IMPLEMENTED via `consumeOneOnUse: true` on SB II (reuses the generic one-stack-per-Support-Action mechanism).
Only these replacement/blocking/consumption interactions are validated for SB II — no additional SB II damage semantics are inferred.

### 3.11 Skills: kit structure, multipliers, cooldowns

**Mechanic** — Fixed kit: 1 basic attack + 2 active skills + 1 ultimate + 1 passive; every skill has an explicit % of ATK (or fixed damage); cooldowns are small integers.

**Source** — IOPWiki Qiongjiu; gfl2.help; DotGG Qiongjiu; BWIKI character pages.

**Confidence** — Kit structure CONFIRMED (three sources agree verbatim; Wikipedia battle-mechanics outline agrees). Multipliers CONFIRMED per skill (Qiongjiu: basic 80% phys + 2 stab; Common Rail 150% burn, cd 1; Guide to Victory 110% burn AoE, Overburn 2 turns, cd 1; support attack 90% + 2 stab). Cooldown values 0/1/2 CONFIRMED; **decrement timing CONFIRMED in-game (2026-09-03)**: a CD-N skill requires **N full turns to pass after its cast turn** — CD-1 cast Turn N → unavailable Turn N+1 → available Turn N+2 (NOT "available next turn").

**Implementation interpretation** — slot model `AbilityDef` per ability (`basic, active1, active2, ultimate, support, passive`), each with **level-indexed complete variants** (`levels: { level → SkillDefVariant }`, where a `SkillDefVariant` is the full behavior definition: multiplier|fixedDamage, element, ammo, stab, cooldown, cost, statuses, at-max hook). **Skill levels & Fortifications (architected 2026):** every ability starts at Level 1; **Basic Attack is always Level 1** (never raised by Fortification); each Fortification raises ONE specific ability to an explicit `toLevel` (`CharacterDef.fortificationMap: { v, ability, toLevel }[]`); a higher level is a COMPLETE variant and may change math, hits, effects, durations, resources, cooldowns, Stability, targeting/AoE, or triggers. Resolution (`state.ts`): level = toLevel of the entry with highest `v ≤ run fortificationLevel` (never inferred by counting); an explicitly requested level with no variant FAILS clearly; **baseline rule**: an un-upgraded ability with only a higher level in data resolves to its lowest available variant. **QJ state (authoritative kit sync 2026):** Basic Lv1 only (80%/phase-less/**Medium Ammo**/stab2 — the game UI states "Ammo Type: Medium"; repo identifier `medium_ammo` — the former `assault_rifle_ammo` weapon-class label corrected as a terminology/data-model fix); **Common Rail Lv1 = 150% ATK / Burn / stab 3 / cd1 / self Support Boost I** (the earlier 'Lv2 = 150%' reading was a misplacement — corrected; Common Rail's SB I application imposes NO duration — stale `durationRounds: 1` overrides on the Lv1/Lv2 specs removed 2026, SB persistence applies), Lv2 (V1) +30% Support Boost variant — **IMPLEMENTED & VALIDATED in-game 2026**: the trigger requires the killing blow to be delivered by **Common Rail itself** (skill-specific — NOT any enemy death in the sequence, NOT another skill/unit); the screenshot shows "Support Boost I" with Support Action damage **+30%** (+10% vs Exposed retained, "Activates 1 time", cannot be cleansed). Modeled as a **distinct repo-internal status `support_boost_i_30`** (the exact in-game status id remains UNSPECIFIED — no authoritative data); it follows the established SB family rules (persistent, no invented duration, activation-consumed, flat magnitude, support-scoped, un-cleansable) and **replaces the +15% base** within the family so the two magnitudes are never counted as two modifiers (a representation edge, not separately in-game observed). The normal +15% Support Boost I definition is NOT mutated; the generic engine hook is `onKillStatuses` (killing-blow detection is transition-guarded: target HP >0 → 0 on that hit), **Guide to Victory Lv1 = 110% / Burn / stab 3** (corrected from 0), Lv2 (V2) +100% crit rate vs Overburn-inflicted targets — **IMPLEMENTED & VALIDATED in-game 2026** (tooltip + in-game always-critical vs an already-Overburned target; attack-scoped only, Lv1 unchanged — checklist row 38); **Pressing the Momentum** Lv1 executed (cost 3, SB II ×3, at-max +1 stack & +1 Support Action — **both at-max bonuses VALIDATED in-game 2026**: max-Confectance Ultimate grants **4 SB II stacks total** (3+1) and **+1 Support Action quota** (maximum 4 Support Actions in THAT SAME casting turn — the +1 quota itself is In-Game Validated; the restriction to the Ultimate-casting turn, i.e. NO carry-over — reset to the normal passive value of 3 at the start of the following round — is enforced by the simulator's per-round quota reset (`beginUnitRound` → `supportQuota = supportAttackQuota(passives)`), NOT claimed as a direct in-game observation). The Ultimate grants SB II and imposes NO duration: the established SB persistence rules apply (no expiry; stacks remain until consumed by Support Actions); corrected 2026 — an earlier `durationRounds: 1` on this application was an implementation error). **Skill classification (authoritative in-game screenshot): the Ultimate is BUFF/DEBUFF-ONLY — "Ultimate / Buff / Debuff", NO damage component and NO damage multiplier; the buff/debuff-only implementation is the correct representation (no multiplier to add).** Lv2 (V4) Vulnerable I — **IMPLEMENTED & VALIDATED in-game 2026**: within the EXISTING Steady Plan trigger sequence (`eligible ally damaging attack → Steady Plan Support trigger → V4 applies Vulnerable I to the target → Qiongjiu's Support Action`), V4 applies Vulnerable I to the No-Cover target immediately BEFORE Qiongjiu's Support Action resolves (so Vulnerable is present when the support lands); **1 turn — expires immediately when the target finishes its own turn (VALIDATED)**; **completely independent of Confectance level and of the max-Confectance Ultimate branch** (V4 does NOT sit behind `onCastAtMaxConfectance`; the max bonuses are separate: +1 SB II stack, +1 Support quota). MVP note: the dummy is always No-Cover, so in-sim application is unconditional (no Cover system); no new ally-attack trigger was added — Steady Plan owns the trigger; implemented generically via `beforeSupportStatuses` on the resolved ultimate variant), Lv3 (V5) Damage Up II — **IMPLEMENTED & VALIDATED in-game 2026**: within the EXISTING Steady Plan trigger sequence (`ally's turn begins → V5 applies Damage Up II (1 turn) to the triggering ally AND to Qiongjiu → ally performs their attack → existing Steady Plan Support trigger → Qiongjiu performs her Support Action`), V5 applies DU2 **BEFORE the triggering ally's attack** (so that attack benefits) and to Qiongjiu before her Support Action (so the Support benefits). Duration via the existing generic 1-turn holder/own-turn-end system: the **ally loses DU2 when it finishes its own turn**; **Qiongjiu keeps it through her Support Action and loses it when she finishes her own next turn (VALIDATED)**. Validated example: QJ ATK 1962 · Support 90% · DEF 5000 · No-Cover 0.20 + Out-of-Turn 0.10 + DU2 0.20 → `ceil(497.63 × 1.50) = 747`. Recipients are exactly Qiongjiu + the triggering ally (unrelated allies never receive it). Independent of Confectance / the max branch; no new trigger — the generic `beforeSupportTrigger` on the resolved ultimate variant rides the existing Steady Plan trigger); **Steady Plan is level-aware (CUMULATIVE, authoritative in-game screenshots 2026):** Lv1 = +1 Confectance per hit, No-Cover +10%, support trigger (90% ATK/2 stab/3 per turn); **Lv2/V3 = Lv1 + Support Action damage +10% + Overburn (2 turns) after each Support Action** — all EXECUTED; **Lv3/V6 = Lv2 retained + No-Cover as a SINGLE +20% TOTAL** (the V6 screenshot displays "20% No-Cover" as one value — NOT two +10% components, never +30%). Overburn-after-Support is implemented via the generic `after_support_status` passive effect — **VALIDATED in-game 2026 (timing only):** observed sequence `Support Action performed → Support Action finishes → Overburn appears on the target → one Overburn Fixed Damage instance` (target had no Overburn beforehand). This validates ONLY the Steady Plan application timing ("Support Action resolves → Overburn is applied"); it does NOT re-validate Overburn's established mechanics (Fixed Damage classification, damage calculation, applier-stat behavior, immediate-application damage, holder-action-end ticks, 2-turn duration — validated separately). **Evidence (source hierarchy):** the Lv1 +10% and Lv3 +20% total No-Cover values and the cumulative V3/V6 additions are **source facts** (screen tooltips; no lower-Fortification gameplay test required); the observed V6 brackets reproduce **1.20** (1091/1191/992/1207/2233/2340), corroborating the +20% total. **V6 is the authoritative experimental state for Qiongjiu because it is the available character state.** **fortificationMap populated**: V1→Common Rail Lv2, V2→Guide Lv2, V3→Steady Plan Lv2, V4→Ult Lv2, V5→Ult Lv3, V6→Steady Plan Lv3.

**Unknowns** — a real base-skill "Cooldown 3" example (research only surfaced 0/1/2; CD-2 keys exist but no base-skill CD-3 seen) — the N-full-turns shape is confirmed for CD-1 and expected to generalize; per-character kit variations (some dolls differ from the 1/2/1/1 shape).

**Attack phase/ammo attribute — present vs absent (2026 information fix):** `SkillDefVariant.element` is **optional**. `element: null` means the ability is a REAL attack with a **phase-less (Physical)** attribute; `element` **ABSENT** means the ability has **NO attack phase attribute at all** — e.g. the buff-only Ultimate (Pressing the Momentum), which has no damage component. The two are distinct and must never be conflated: an absent attribute MUST NOT be shown as a physical attack. Qiongjiu's Ultimate previously carried a bogus `element: "burn"` + `ammoType: "medium_ammo"` (copy-paste from the damaging abilities); those were **inert** (the engine only reads them inside `dealDamageHit`, reached solely when `multiplier`/`fixedDamage` is set) but mis-displayed the phase/ammo icons in the rotation UI — corrected by removing both (the engine normalizes with `skill.element ?? null` on the damage path; the UI shows each badge only when the attribute is present). **Same fix applied to Guide to Victory (2026):** it is a Burn PHASE attack (`element: "burn"` stays) but the game shows **NO Ammo Type** for it, so its bogus `ammoType: "medium_ammo"` (again copy-pasted) was removed from both levels. Guide's ammo attribute was likewise **inert** — no Qiongjiu passive is ammo-gated, and the Guide validation runs use only a Burn weakness (no ammo weakness), so removal is behavior-neutral (engine suite unchanged). `SkillDefVariant.ammoType` is optional and **absent = no ammo attribute**.

### 3.12 Confectance (导染 / Confectance Index)

**Mechanic** — Pips above the HP bar; generated by events (damage, kills, skills — **per skill text**), spent on skills/ultimates; gains/costs settled after the event.

**Source** — IOPWiki Qiongjiu (`skill_cost: 3`; passive +1 Confectance per damage event); gfl2.help / DotGG (cost 3, fixed key +3 at battle start); BWIKI `/gf2/导染指数` (beta, 2021-07 一测; also claimed a damage bonus of 0% below 100, +5%/10 pts, cap +50% @200 — **obsolete; disproven in the current game, see Confidence/U10**); IOPWiki GFL2_Combat.

**Confidence** — Event-driven, per-skill-text generation CONFIRMED (a `damage × m` proportion is **rejected** by data). Cost values are per-skill (3; some ultimates consume ALL). **Max capacity and battle-start value CONFIRMED in-game (2026-09-03, Qiongjiu no keys): start 3, max 6**; Pressing the Momentum cost **3** (confirmed). **No passive Confectance damage bonus — DISPROVEN in-game (2026-09-03, U10)**: Qiongjiu's damage was unchanged across rising Confectance Index values over repeated attacks; the beta "+5% damage per 10 Confectance, up to +50%" claim came from a one-test-era BWIKI page and is **not** a current-game mechanic. Confectance is modeled purely as a **resource**; its combat effects come only from specific character/skill/passive mechanics that explicitly check, gain, or consume it.

**Implementation interpretation** — `confectance: int` on each unit; event hooks (`onDamageDealt`, `onKill`, `onSkillCast`, custom per skill) define gains; **casting consumes the cost IMMEDIATELY on activation — before the action's damage/status/other effects resolve (VALIDATED in-game 2026)**; resource gains from damage/action effects are applied **after the action's hit/resolution**; **multiple independent gains from one action are all applied** (validated example: start 0, weakness-exploit +2 and element trigger +1 from one Hydro attack → 3; the mutual order of those gains is not observable and is not important). **No generic Confectance damage bonus is modeled** (U10 disproven); Confectance affects combat only through explicit data-driven gains, costs, and interactions.

**RESOLVED (2026-10-09, user-provided in-game evidence) — Confectance CAN go above 6, but as a
SEPARATE resource, never by raising the normal cap.** Raised by Vector's kit, whose passive (Lv.3,
gated on Fortification **V5**) states *"for each point of Confectance Index **above the maximum**,
further increases the attack by 10%, up to 20%"* (`docs/dolls/vector.md` §4.5). The mechanic:
at **V5** the doll gains **2 extra Confectance Index slots SEPARATE from the normal 6**; those 2
extra slots are what the clause counts (1 → +10%, 2 → +20%). **The normal gauge's cap remains 6 and
U9 is unchanged** — the extra slots are a distinct, character-and-Fortification-gated resource, not
an overflow of the ordinary gauge. **Never implement it by raising `confectanceMax`.** The engine
representation is **implemented** — see the block immediately below.
*(This is user-provided evidence — level 1 in the source hierarchy; a controlled run would move the
per-point arithmetic to `Validated`.)*

**IMPLEMENTED + TESTED (2026) — the generic turn-start Confectance drain.** The mechanic above is now
an engine capability, **fully data-driven with no character ids**:

- **`PassiveEffect` kind `turn_start_confectance_drain`** (`src/model/types.ts`): `atkPct` (round-scoped
  ATK% granted when the gauge is at max at the holder's OWN turn start), plus `extraSlots` and
  `perExtraSlotAtkPct` (the clause-5 clause — additive per FILLED extra slot, capped at `extraSlots`).
  **Leveling comes from the passive's own `levels` map** (Lv.1 declares only `atkPct`; Lv.3 adds the
  extra slots) — the kind carries no level gate of its own.
- **A SECOND resource** (`UnitState.extraConfectance` / `extraConfectanceMax`, resolved from the
  passive's `extraSlots`): `gainConfectance` (`src/engine/resources.ts`) now routes gains that exceed
  `confectanceMax` into it. **`confectanceMax` is NEVER raised** — U9 holds. `drainAllConfectance`
  empties both pools.
- **The trigger** (`applyTurnStartConfectanceDrain`, `src/engine/simulation.ts`) runs at each unit's
  turn start: at max ⇒ consume both pools ⇒ set the round-scoped ATK%. The bonus is **`UnitState.roundAtkPct`,
  cleared at every round start** ("until the end of the round") and folded into the **EXISTING in-combat
  ATK% bucket by `statModifier`** (`src/engine/statuses.ts`) — one more source in that bucket, never a
  parallel multiplier.

**Semantics settled with the user (2026-10-09, in-game evidence):** (1) **filling** — Confectance gains
beyond 6 flow into the extra slots (effective capacity 8 in two tiers); (2) **additive** — clause 5 is
on top of clause 4, so **0/1/2 filled extras give +10% / +20% / +30%**; (3) the drain consumes **both**
pools (the source says "consumes ALL points of Confectance Index", and clause 5 itself calls the extras
"points of Confectance Index above the maximum").

**Evidence status:** the *mechanism* is `[GAME]` (user-provided, source hierarchy level 1) and the
*engine implementation* is covered by automated tests (`src/test/confectance-drain.test.ts`, 8 tests:
clause 4, the below-max no-op, additive +10/20/30, the extra-pool cap, round-scoping, V-rank gating, the
U9 guard, and a no-effect control). **It is NOT in-game validated** — a controlled in-game run would
move the arithmetic from user-provided evidence to `Validated`.

**Unknowns** — per-doll gain tables (outside Qiongjiu's confirmed +1 per damage event), kill bonus. (U10 — generic Confectance damage bonus: **DISPROVEN**, not modeled.) (Cap 6 and battle-start 3 are CONFIRMED for Qiongjiu with no keys; engine defaults updated — overrides remain available for alternative testing.)

### 3.13 Keys (固键)

**Mechanic** — Four key tables: Fixed (专属, doll-specific, several equippable; Qiongjiu's six are recorded in `src/data/qiongjiu.ts` — FK1 Concentration +3 Confectance at battle start [IMPLEMENTED]; FK2 Efficient Planning [cleanses 1 buff before Support Action — IMPLEMENTED & VALIDATED in-game 2026: `KeyDef.supportActionCleanse` (1) through the generic `cleanseDispellable` removes exactly 1 dispellable target buff immediately before the Support Action (no invented selection priority); formerly deferred on 'no buff-purge mechanic' — resolved 2026]; FK3 Targeted Training [Defense Down II 1 turn before the allied unit's attack while in Support Mode — IMPLEMENTED & VALIDATED in-game 2026: `KeyDef.alliedAttackDefDown` applies DEF Down II (5000 → 3500) just before the triggering allied attack, reusing the generic stat-modifier status; formerly deferred on support-fires-after-hit ordering — resolved via a pre-attack hook]; FK4 Point of Vulnerability [Guide to Victory AoE 8 tiles, −30% to non-first targets — IMPLEMENTED & VALIDATED in-game 2026: `KeyDef.pointOfVulnerabilityLine` turns Guide into a cardinal 8-tile MULTI-TARGET line (first target 100%, subsequent `ceil × 0.70`); every target receives Guide's statuses incl. Overburn with per-target V2 crit]; FK5 Necessary Adjustments [Blazing Assault II 2 turns on phase-weakness exploit via Common Rail — IMPLEMENTED & VALIDATED in-game 2026: `KeyDef.phaseWeaknessExploitStatuses` (scoped to Common Rail / active1) applies `blazing_assault_ii` (+15% ATK, 2 turns) BEFORE the triggering hit — phase-weakness exploit only, 1435 reproduced]; FK6 Steadiness [displacement immunity under Support Boost — IMPLEMENTED & VALIDATED (condition in-game 2026): `KeyDef.displacementImmunityWhenStatuses` + `displacementImmunityActive` gate; MVP boundary: no enemy displacement applier exists — the gate is the condition any such application would check (no speculative infrastructure added)]), Common (3 Common Key Slots per character — game structure SOURCE FACT; REUSABLE registry definitions, NOT character-embedded — see the Common paragraph below), Expansion (1 per doll, playstyle-changing: Qiongjiu's Ruined Gem — **VALIDATED in-game 2026**: the Support Action damage type is CHANGED FROM Physical/phase-less TO Burn, and the +15% damage applies when the target is affected by Overburn (Burn debuff), ADDITIVE in the existing DMG% bucket — direct match ATK 2000 · Support 90% · DEF 5000 · bucket 0.20 No-Cover + 0.20 Damage Up II + 0.10 Out-of-Turn + 0.15 Ruined Gem = 1.65 · Burn ×1.10 → **934** (ceil(514.2857 × 1.65 × 1.10)); no duration/stacking/activation claims. Engine IMPLEMENTED (2026): `KeyDef.supportElementOverride` resolves the SUPPORT action's effective element as Burn while the key is equipped (a local effective-skill copy; the base `qiongjiu_support.element` null — Physical/phase-less — is never mutated, and Guide's active Burn element is unrelated), and `KeyDef.supportTargetStatusDealtBonus` adds +0.15 to the existing additive dealt-DMG bucket on support actions vs Overburn targets (own-turn attacks never receive it; no generic target-status infrastructure beyond the two key fields)., Affinity (bond-5: Qiongjiu's Warm as Jade — at Affinity 5: CD+3.3%/ATK+3.3%/HP+3.3%; at Affinity 9: CD+4.5%/ATK+4.5%/HP+4.5% [the earlier 5% Lv9 value was incorrect — confirmed 4.5%]; 9 levels total; Levels 6–8 NOT assumed/interpolated; applies only when equipping her OWN Affinity Key — **IMPLEMENTED & VALIDATED 2026**: ownership (own vs foreign) decides the bonus; own Lv5/Lv9 exact levels fold into the panel (CritDMG additive, ATK/HP via the proven Final Stat formula); a foreign key grants only the generic +3% (+3% ATK & HP) regardless of the holder's affinity level — **the foreign-affinity +3% stat bonus is VALIDATED 2026 (authoritative in-game knowledge)**; no interpolation). Common (REUSABLE registry definitions — **3 Common Key Slots** per character [game structure, SOURCE FACT; max 3 selected, fewer allowed]; four categories, all SOURCE FACTS with no invented rules — **Gold Key** [3 kinds of stats + secondary effect; 5★ Character Edition], **Epic Key — 4★ Character Edition** [3 kinds of stats + secondary effect], **Epic Key — Generic Edition** [3 kinds of stats, no secondary effect], **Rare Key** [2 kinds of stats, no secondary effect]; keys live in `src/data/common-keys.ts` and resolve via `Registry.getCommonKey` — NOT embedded in `CharacterDef`; edition is structural (`CommonKeyEdition`), stats live in an ordered `CommonKeyStatSlot[]` (CORRECTED 2026 — see below) kept explicitly SEPARATE from the optional `secondaryEffect`, secondary effects may be recorded data-only (`status`/`passive` primitives — no invented trigger timing) OR carry an EXECUTED `stat` payload folded into the panel; character association is data-only (`characterScope`), never combat logic). Qiongjiu's Strategic Negotiation — 3 STAT SLOTS (CORRECTED 2026): slot #0 Crit Rate +5% (FIXED/hardcoded — first in the in-game description), slots #1/#2 PLAYER-CHOSEN kinds (value fixed per key); plus the key's SECONDARY EFFECT Out-of-Turn Damage +7% [10% → 17% total on out-of-turn events]. **CORRECTED COMMON KEY MODEL (2026, user-confirmed): only the FIRST stat of a Common Key is hardcoded; the remaining stat slots are chosen by the PLAYER (the kind is chosen; the value is fixed by the key).** A key is modeled as an ordered `CommonKeyStatSlot[]` (`{ kind?, value }`) with `fixedStatCount` (default 1): slots index < `fixedStatCount` carry a data `kind` (fixed); later slots have NO `kind` and fold only when the player supplies one via `ScenarioTeamMember.commonKeyStatChoices[keyId]` (validated: kinds from the engine's player-selectable pool only, ≤ the selectable-slot count, equipped keys only, and NO DUPLICATES — the chosen kinds must differ from each other AND from the key's fixed stat). **PLAYER-SELECTABLE STAT POOL (2026, user-confirmed):** exactly five kinds, each granting a fixed **+5.0%** — **Crit Rate, Crit Damage (`critDmg`), Health Boost (`hpPct`), Defense Boost (`defPct`), Attack Boost (`atkPct`)** (`COMMON_KEY_SELECTABLE_STAT_KINDS`); Out-of-Turn Damage is deliberately NOT selectable — it is a key's EFFECT (secondary effect), not one of its stats. Health/Defense Boost fold into the existing `hpPct`/`defPct` panel buckets (the same generic Final Stat formula as the other percentage sources — no parallel stat system). **UI IMPLEMENTED 2026**: under each equipped key the setup screen renders a stat picker (engine-sourced pool via IPC) — fixed stat shown, pills for the five kinds, no duplicates, one pill per selectable slot. Strategic Negotiation's `+7%` out-of-turn is modeled as the key's executed SECONDARY EFFECT (`secondaryEffect.type: "stat"`, `stats: { outOfTurnDmg: 0.07 }`) rather than a 4th stat slot. **IMPLEMENTED & VALIDATED 2026** (migrated into the registry): normal stat increases folded at makeDoll via `commonKeyIds` + the player's `commonKeyStatChoices`; the secondary-effect `+7%` folds into the `outOfTurnDmg` panel stat consumed by the generic out-of-turn branch; edition UNKNOWN (not invented); the +7% out-of-turn is Strategic Negotiation's only validated secondary effect (its status/passive primitives are NOT validated — none invented); other common keys NOT in current scope). DIRECT in-game match (2026): Strategic Negotiation + V6 + DU2 → ATK 2082 · Support 90% · DEF 5000 · bucket 0.20 No-Cover + 0.20 Damage Up II + 0.17 Out-of-Turn = 1.57 → **865** (ceil(550.8686 × 1.57)) — directly validates the +7% Out-of-Turn Damage as additive in the same DMG% bucket as No-Cover and other applicable damage increases.

**Source** — IOPWiki Qiongjiu / Common_Keys; DotGG Qiongjiu.

**Confidence** — Taxonomy and examples CONFIRMED; the "3-branch select" model is PROBABLY not current; **max equippable fixed keys (screenshots suggest 3 slots) UNKNOWN**.

**Implementation interpretation** — `fixedKeys[]` (equipped set, each with stat terms + effect hooks); Common Keys are REUSABLE registry definitions (`src/data/common-keys.ts` / `Registry.getCommonKey`) — scenario team members reference them through `commonKeyIds` (3 Common Key Slots, max 3 selected, fewer allowed); `expansionKey` (skill modifier switch); Affinity Key is the singular `affinityKey` (pure stat terms; ownership — own vs foreign — decides the bonus).

**Unknowns** — live slot count; helix unlock costs; version-evidence of any 3-branch structure.

### 3.14 Passives and out-of-turn attacks (支援/额外行动)

**Mechanic** — Action Support (support attack, e.g. Qiongjiu: ally single-target hit in range → 1 support attack 90% ATK + 2 stab, max 3/round, does **not** consume action or Confectance, **cannot be triggered by another support attack**), Emergency Support, Interception (before being hit), Counterattack (after being hit), Extra Action (a full extra action; some dolls).

**Source** — IOPWiki GFL2_Combat / Qiongjiu; gfl2.help; Gamerant (Tololo extra action).

**Confidence** — Categories and Qiongjiu-specific rules CONFIRMED; per-doll quotas/conditions PROBABLE; exact trigger-verification sequencing UNKNOWN. **Support Action Stability & no-chaining — VALIDATED in-game (2026):** a Support Action deals **exactly 2 Stability damage**, and **a Support Action cannot trigger another Support Action** — validated example: one targeted attack can cause **3 eligible Dolls to perform Support Actions sequentially**, and those Support Actions do **not** recursively trigger more Support Actions. (Engine: `qiongjiu_support` stabDamage 2; `support_attack` `chainable: false`; covered by `support.test.ts`.) **Support Action range — MVP modeling decision (2026), NOT in-game validated: modeled as 8 tiles (`range: 8` declared on the support skill data); the MVP engine has no range/positioning check (in-range assumed).**

**Implementation interpretation** — event-bus: `onAllySingleTargetHit`, `onDebuffApplied`, `onUnitAttacked`, etc.; passives subscribe with per-round quota counters (reset each round); support attacks emit 0-cost attack events that are themselves **not** trigger sources (guard against chaining).

**Unknowns** — per-doll details; order between emergency support and support support on the same target.

### 3.15 Turn / action sequencing and APL

**Mechanic** — SRPG on a grid; each unit has 行动力 (movement) and 攻击范围 (range); default **1 main action** per unit per round; basic attack vs active skill is an exclusive choice on that action; extra hits only via support/extra actions; no speed/initiative documented — round-robin with player-chosen order.

**Source** — IOPWiki GFL2_Combat (Turns); BWIKI `战斗玩法` (beta); BWIKI character pages.

**Confidence** — 1 action/round + exclusive basic-vs-skill: CONFIRMED. Round-robin with free order: PROBABLE (structurally inferred, matches common knowledge). **Auto-battle AI priority: UNKNOWN (no documentation anywhere).** Community convention for "damage per turn" is per **full team round** — treat as the reporting convention (PROBABLE).

**Implementation interpretation** — round = full team sweep (each doll acts once, in configurable/APL order); per-round reset of per-round counters; metrics: `total damage`, `damage per full team round`, optionally `damage per action`. APL default `ultimate if available > active if available > basic attack`, marked as a **model assumption**, configurable.

**Unknowns** — real auto-AI behavior; whether AI withholds skills; movement AI (irrelevant: dummy stationary, no movement in MVP).

### 3.16 Training dummy

**Mechanic** — No official dummy stat sheet exists (searched; only combat-training tutorials exist). **The MVP target is ALWAYS No Cover** — the dummy's `cover` field is fixed to `"none"` and no cover mechanic can ever engage; the requested "cover always NONE" from the handoff is a hard constraint, not a configurable option.

**Confidence** — Dummy stats: UNKNOWN → fully configurable.

**Implementation interpretation** — recommended defaults: `DEF 0, HP 1e9, stability 0, weaknesses [], phase neutral, cover none`. With `stability 0`, the stability-reduction term (§3.7) can never fire, so its unknown rule does not block correctness. **Pass-turn lifecycle (added 2026):** the stationary dummy takes a minimal pass-turn each round (no attacks, no skills, no resource gains, no AI) so target-side `ownActionEnd` statuses — e.g. Overburn (§3.10) — tick and expire naturally; it is invisible when the dummy has no such statuses.

**Unknowns** — everything about the "real" in-game dummy → covered by the in-game test plan.

### 3.17 Out-of-scope confirmations

- Cover — **explicitly DEFERRED** (not modeled in the MVP; the target is always No Cover). Research-recorder values for later: cover damage reductions 35/30/25/20% by cover type, and the stability-cover 60% reduction (§3.7). High ground, flanking, movement: also not modeled (MVP).
- "Nixie / 交换机" skill: **no evidence any such skill type exists** in any reachable source — do not model it. If the user meant something specific, it needs clarification.
- No ACC/EVA, no miss vs the dummy (§3.8).
- Attacker stability never affects offense (§3.7).

### 3.18 Ammo Weakness Upgrade system (separate from generic weakness)

**Mechanic** — A stacking upgrade triggered by exploiting an **Ammo weakness**; it is a SEPARATE mechanic from the generic weakness multiplier (§3.5 / U20) and must not be conflated with it. Validated in-game (2026).

**Distinction (kept separate):**
- **Generic weakness effect** — each matched target weakness adds `1 + 0.10 × n` damage (1 → ×1.10, 2 → ×1.20); this generic multiplier **also applies to Phase damage** (e.g. a Burn + Ammo Phase attack vs a target weak to both Burn and Ammo receives the normal ×1.20).
- **Ammo Weakness Upgrade system** — triggered only by exploiting an **Ammo weakness**; the upgrade bonus affects **phase-less (physical-ammo) damage only**; **Phase damage does NOT receive it**.
- The upgrade is NOT the generic weakness multiplier. **Phase interaction VALIDATED (2026): a Phase Ammo exploit does NOT advance AWU stacks and does NOT receive the AWU bonus; only a qualifying Physical Ammo-weakness exploit advances stacks.** Generic weakness matching still applies to Phase damage independently.

**Trigger and stacks (VALIDATED in-game):**
- The **first** attack that exploits an Ammo weakness applies **2 stacks**.
- Each **subsequent** attack that exploits the Ammo weakness applies **+1 stack**.
- **Maximum 5 stacks**; at 5 stacks the bonus is capped and further Ammo-weakness exploits do not increase it.

**Upgrade damage bonus per stack tier (VALIDATED in-game, Physical damage only):**

| Stacks | DMG bonus |
|---|---|
| 2 | +7% |
| 3 | +11% |
| 4 | +17% |
| 5 (cap) | +25% |

**In-game validation — controlled Qiongjiu Basic test** (ATK 1958, Basic 80% Physical, dummy DEF 5000, No Cover, target has Ammo weakness, same buffs throughout; non-crit unless noted):

| Turn | Result | Note |
|---|---|---|
| T1 | **616** | 2 Ammo Upgrade stacks |
| T2 | 785 (critical) | 3 stacks — excluded from the non-crit progression |
| T3 | **665** | 4 stacks |
| T4 | **704** | 5 stacks |
| T5 | **704** | 5 stacks (capped) |
| T6 | **704** | 5 stacks (capped) |

Previously observed non-crit 3-stack result: **636**. Validated Physical damage progression: **2 stacks → 616 · 3 stacks → 636 (non-crit) · 4 stacks → 665 · 5 stacks → 704 · further attacks remain 704**.

**No-ammo control** — Qiongjiu Basic against a DEF 5000 dummy WITHOUT Ammo weakness: **529** non-crit, **654** crit. This confirms the changing 616/636/665/704 Physical values are associated with the Ammo Weakness Upgrade mechanic rather than with Stability. Stability itself does **not** directly modify damage (consistent with §3.7 — no universal No-Cover Stability reduction; this dataset establishes no Stability→damage link).

**Phase-damage control (independent)** — Qiongjiu Common Rail (Burn + Ammo) vs a target weak to both: **1191** non-crit at 65, 58, and 51 Stability; **1470** crit at 44 Stability, consistent with 123.5% Crit DMG. Conclusion: the Ammo Weakness Upgrade stacking bonus does **not** affect this Burn/Phase damage, while the normal generic two-weakness **×1.20** multiplier DOES apply to the Burn attack (independently of Stability).

**Phase interaction — VALIDATED (2026):**
- **Physical Ammo-weakness exploit** → advances AWU stacks **and** receives the AWU bonus.
- **Phase Ammo-weakness exploit** → does **NOT** advance AWU stacks and does **NOT** receive the AWU bonus.
- **Generic weakness matching still applies to Phase damage independently** (e.g. Burn + Ammo vs a target weak to both → the normal ×1.20 generic multiplier, unchanged by AWU; elemental weakness on Phase damage additionally validated 2026 — U15b, see §3.5).

**Persistence — VALIDATED in-game (2026):** AWU **never resets, is never removed, and persists indefinitely once gained**. Earlier evidence anchored this with **6 full skipped turns** (stacks remained with no expiration); an authoritative in-game validation now confirms the permanent behavior directly. Modeled as **indefinite/permanent** (`durationRounds: null` — the engine never ticks a permanent status); no duration timer is applied, and **no reset condition is invented** (there is no mechanic that removes or resets AWU).

**Implementation (IMPLEMENTED, data-driven):** damage placement is now VALIDATED — `base → generic weakness ×(1 + 0.10×n) → additive DMG% bucket (1 + no-cover + AWU tier …) → remaining pipeline → existing ceil`; the tier values are additive tenths (+7/+11/+17/+25) with the project's established ceiling producing the observed numbers exactly — no new rounding stage was introduced (the source's "DMG% is rounded up to a tenth" matches the tier granularity; nothing beyond the existing ceil is modeled). The engine implements AWU generically: the target carries a permanent `upgrade` status (`ammo_weakness_upgrade`, stackable, max 5) whose effects use a generic `stack_tier_modifier` (`tiers` + `when.element = [null]` (phase-less) — Phase damage bypasses naturally); a target-side passive trigger (`grant_stacks_on_weakness_exploit` on `DummyConfig.passives`, firstGain 2 / gainPerEvent 1 / maxStacks 5, requiresElements [null]) advances stacks on phase-less Ammo-weakness exploits; the Ammo weakness itself is a real data dimension (`SkillDef.ammoType` vs `DummyConfig.weaknessTags`) that also counts into the generic weakness multiplier. **Ammo weakness categories (authoritative game terminology, 2026):** `heavy_ammo` · `medium_ammo` · `light_ammo` · `shotgun_ammo` · `melee` — the only five categories; `melee` is currently a **target weakness category only** (an attack without ammo simply omits `ammoType`, which never matches); `medium_ammo` is Qiongjiu's attack category ("Ammo Type: Medium" in-game). All values are data — no character IDs, no 2/1/5 or tier logic in the formula.

**Remaining unknowns (NOT resolved, deliberately):** none regarding AWU persistence — **in-game VALIDATED (2026): AWU never resets, is never removed, and persists indefinitely once gained** (AWU has no reset/removal behavior; no such mechanic exists). (The ammo-weakness +2 stability bonus is now VALIDATED 2026 — see §3.5; it was removed from the unresolved list.)

---

### 3.19 Attachment system (weapon attachments)

**Status: IMPLEMENTED (stat folding + first set batch) — 2026.** This section records the weapon Attachment system: the **4 slots**, the **configuration model** (one configuration per slot, empty allowed, user-selected stats, per-slot maxima), the **stat pools**, the **stat semantics** (flat vs %), the **max stat values**, and the **15 set definitions** — of which **8 sets are engine-consumed** (see the set table below) and the other **7 remain INERT** (their attachment-only gates are not engine-evaluable). Attachment **stats** are folded into the existing panel buckets (`src/engine/state.ts`) and the **set bonuses** into the existing additive DMG% dealt bucket (`src/engine/attachment-sets.ts` → `dealDamageHit`). **Stat aggregation is now validated in-game end-to-end as a FULL MULTI-SLOT LOADOUT** (P1, 2026 — see below). **No stacking behavior, rarity system, stat ranges, or generation rules are invented.** See §4 (uncertainty register) and `docs/architecture.md` for what remains open.

**Attachment slots (CONFIRMED)** — every weapon has **4 attachment slots**:

1. **Muzzle**
2. **Sight**
3. **Foregrip**
4. **Underbarrel**

**Stat pools (CONFIRMED)** — the stat kinds an attachment can roll, by slot:

- **Sight, Underbarrel, Foregrip** can have:
  - Crit Rate
  - Attack
  - Attack Boost (%)
  - Health
  - Health Boost (%)
  - Defense
  - Defense Boost (%)
- **Muzzle** can have **all of the above**, plus:
  - **Crit Damage (%)** — the ONLY stat confirmed exclusive to the Muzzle.

**Attachment configuration model (CONFIRMED 2026):** each weapon has **exactly 4 attachment slots** (Muzzle / Sight / Foregrip / Underbarrel), each holding **at most ONE attachment configuration**.

- **A slot may be empty** — an empty slot provides **no stats**.
- **Only one configuration exists per slot** (no multiple attachments per slot).
- **Attachment stats are USER-CONFIGURABLE through the simulator.** Rather than defining every possible stat combination as separate data, the UI will present the **available stat list under each slot**, and the user **selects which stats that attachment has**. (This is a deliberate modeling choice that avoids per-combination definitions.)
- **Maximum selected stats per slot:** **Muzzle 4** · **Sight 3** · **Foregrip 3** · **Underbarrel 3**.
- **Stats must be UNIQUE within an attachment** — no duplicate Attack, Attack Boost, Defense, Defense Boost, etc.
- **Muzzle is the only slot that can use Crit Damage**; Sight / Foregrip / Underbarrel use the **shared non-Crit-Damage stat pool** (Crit Rate, Attack, Attack Boost, Health, Health Boost, Defense, Defense Boost).

**Intended future UI behavior (high level — NOT implemented):** each attachment slot displays its available stats; selected stats are visibly enabled/checked; the UI prevents selecting **more than the slot's maximum** (Muzzle 4 / others 3) and prevents **duplicate stats by construction**; changing selections should **immediately change the simulated attachment stats** once implementation exists. (UI is deferred — documented only.)

**Stat semantics (CONFIRMED in-game 2026 — the flat-vs-percentage blocker is RESOLVED):** the two stat types are distinct and now confirmed:

- **Attack → flat ATK** · **Health → flat HP** · **Defense → flat DEF** (the un-suffixed stats are FLAT).
- **Attack Boost (%) → ATK percentage** · **Health Boost (%) → HP percentage** · **Defense Boost (%) → DEF percentage** (the `Boost (%)` stats are PERCENTAGE).
- **Crit Rate → Crit Rate** (panel stat) · **Crit Damage (%) → Crit DMG** (panel stat, additive).

Flat stats enter the **existing flat bucket** (added BEFORE the percentage multiply); `Boost (%)` stats enter the **existing percentage buckets**. The naming semantics are uniform across ATK/HP/DEF — Health and Defense are NOT separately re-validated because the ATK pair establishes both stat TYPES.

**Validation evidence (in-game 2026, Qiongjiu, panel observations):**

| Attachment source | ATK before | ATK after | Conclusion |
|---|---|---|---|
| **Attack Boost (%)** +3% ATK | 1966 | **2014** | `Attack Boost (%)` is a PERCENTAGE ATK modifier |
| **Attack** +21 flat ATK | 1966 | **1992** | `Attack` is a FLAT ATK source entering the flat-stat calculation before percentage modifiers |

(The displayed panel values are rounded; the purpose of this validation was to establish the stat SEMANTICS/buckets, NOT to reverse-engineer the exact unrounded panel value.)

**Maximum stat values (CONFIRMED 2026):** the simulator models attachments at their **MAXIMUM stat values only**.

| Stat | Maximum value | Bucket |
|---|---:|---|
| Attack | **+72** | flat ATK |
| Attack Boost (%) | **+11.4%** | ATK % |
| Health | **+162** | flat HP |
| Health Boost (%) | **+11.4%** | HP % |
| Defense | **+48** | flat DEF |
| Defense Boost (%) | **+11.4%** | DEF % |
| Crit Rate | **+15%** | Crit Rate |
| Crit Damage (%) | **+15%** | Crit DMG |

**Competitive modeling decision (EXPLICIT, 2026):** attachment stats can roll randomly in-game, but the simulator **intentionally does NOT model random rolls, stat ranges, sub-maximal attachments, or roll generation**. It represents **fixed max-stat attachment configurations** only. This is a deliberate competitive-simulation scope decision, not a claim about how the game generates attachments.

**Defense max-value evidence (supplied 2026, recorded verbatim):** the examples `21 × 100% = 42`, `17 × 150% = 43`, `24 × 100% = 48` were provided to illustrate the game's percentage calculation/rounding behavior and to establish the **maximum Defense attachment value as +48**. (Recorded as supplied — the simulator does not model the underlying roll/rounding; only the resulting max +48 is used.)

No attachment RANGES, rarity/tier system, or roll/generation rules are recorded — the simulator deliberately does not model them.

**P1 FULL-LOADOUT AGGREGATION — VALIDATED IN-GAME (2026):** the ATK evidence directly above established the flat-vs-% stat **semantics qualitatively** (bucket direction only — the displayed panel values are rounded and do not arithmetically reproduce). A dedicated **full multi-slot loadout** test now validates the actual aggregation path end-to-end in-game:

- **Setup:** Qiongjiu V6 · Affinity Lv5 · a test weapon worth **+22 flat ATK** · **all four attachment slots equipped simultaneously** — Muzzle (Attack +72 · Crit Rate +15% · Crit Damage +15% · Attack Boost +11.4%) and Sight / Foregrip / Underbarrel (Attack +72 · Crit Rate +15% · Attack Boost +11.4%).
- **Observed panel:** ATK **3182.72** · DEF 1314.88 · HP 4161.92 · Stability 9.00 · Crit Rate **80.00%** · Crit DMG **135.00%**.
- **Exact math:** flat ATK = base 802 + weapon 22 + Dispatch 231 + Remolder 245 + Neural Helix 196 + Affinity Lv5 115 = **1611**; + attachment flat 72 × 4 = **288** → **1899**. ATK% = existing **22%** (NH 10% + universal 12%) + attachment 11.4% × 4 = **45.6%** → **67.6%**. Final ATK = `1899 × 1.676 = 3182.724` → observed **3182.72**. Crit Rate = 20% + 15% × 4 = **80%**; Crit DMG = 120% + 15% = **135%**.
- **What it establishes (STRONGER than the earlier single-stat checks):** four slots coexist; multiple stats coexist in one slot; **the same stat aggregates ACROSS slots** (flat ATK ×4, ATK% ×4, Crit Rate ×4); flat ATK and ATK% fold together; attachment Crit Rate / Crit DMG aggregate; attachment stats fold correctly with **ALL** existing permanent Qiongjiu stat systems; the full multi-slot configuration produces the expected live panel.
- **SCOPE (honest distinction):** it equips **NO HP / HP% / DEF / DEF%** stats, so those were **not individually observed** on the live panel (see the validation decision below). The in-game **"Burn Boost [3 items] 3/3"** display confirmed the SET was equipped/displayed, but **no damage was measured** — this is a STAT-PANEL validation, **NOT** a Burn Boost damage validation.
- **Engine representation:** the engine's integer panel is `ceil(1899 × 1.676) = 3183` (the observed 3182.72 is the game's 2-decimal display) — consistent with the engine's existing integer-panel convention for every other stat source.

Pinned by `src/test/attachment-full-loadout-validation.test.ts`.

**Validation decision (2026) — validate the MECHANISM, not one screenshot per stat:** the attachment **stat folding/aggregation mechanism is treated as IN-GAME VALIDATED.** Every attachment stat is explicitly mapped into the **same existing engine buckets** the permanent systems already use — flat `Attack`/`Health`/`Defense` → the flat bucket; `Attack Boost`/`Health Boost`/`Defense Boost` → the percentage buckets; `Crit Rate` → `critRate`; `Crit Damage` → `critDmg` — and the P1 test already validated the real **multi-slot aggregation + flat/percentage folding path end-to-end**. Repeating the same panel test for HP/DEF would be **redundant validation of the same established mechanism**, not of a new mechanic, so **no separate in-game screenshots are required** for HP / HP% / DEF / DEF%. Precise status:

- **Attachment stat folding/aggregation:** **IN-GAME VALIDATED** (P1 full loadout).
- **Directly observed stat examples on the live panel:** Attack, Attack Boost (%), Crit Rate, Crit Damage (%).
- **HP / HP% / DEF / DEF%:** validated **through the same already-validated stat-bucket/folding mechanism**; **NOT individually observed** in-game — do **not** claim a visual observation of these on the live panel.

**Attachment Sets (CONFIRMED)** — Attachment Sets apply to:

- **Sight**
- **Underbarrel**
- **Foregrip**

Equipping **3 attachments belonging to the same set** activates an **additional bonus** from that set.

**Set selection model (FINAL, CONFIRMED 2026):** set selection is **INDEPENDENT of the individual attachment stats**. The user does **NOT** assign a set identity to each attachment slot. Instead the user selects the **active Attachment Set for the loadout/simulation** — a separate loadout-level configuration on `ScenarioTeamMember` (alongside the per-slot stat selections). The selected set determines the active **3-piece set effect**; the individual slots only determine their selected stats. **Exactly ONE Attachment Set can be active per character at a time — different Attachment Sets cannot coexist or stack; the simulator models exactly one active set (CONFIRMED 2026).**

Consequences (CONFIRMED): **no `setId` on individual slots**, **no per-attachment set identity**, and set membership is **never inferred from the selected stats**. Empty attachment slots remain valid and provide no stats, independently of the set selection.

**Set coexistence / stacking (RESOLVED 2026):** exactly **ONE** Attachment Set can be active **per character** at a time — **different Attachment Sets cannot coexist or stack**; the simulator models exactly **one active set**. Because membership is **never inferred from the slots** (no per-slot set identity), there is **no duplicate-membership case**, and the single active set's 3-piece bonus applies **once** (a direct selection, not a piece count — so no multi-activation). *(This settles the earlier "NOT confirmed about sets" list; the set-bonus values/effects, the 15 sets + their membership, and the additive-bucket representation were confirmed separately — see the set table above.)*

**Muzzle and sets (CONFIRMED negative):** the Muzzle has **NOT** been confirmed to participate in attachment sets. **Do not assume it does.**

**Attachment Set definitions + consumption (2026 — 15 sets defined; 8 consumed):** the confirmed sets are recorded as data in `src/data/attachment-sets.ts` (`AttachmentSetDef` in `src/model/types.ts`). Each set applies to the 3 non-Muzzle slots (Sight / Foregrip / Underbarrel) and activates at **3 pieces**. The ACTIVE set is the loadout-level `ScenarioTeamMember.activeAttachmentSet`; **8 sets are now consumed by the engine** (`src/engine/attachment-sets.ts` → the EXISTING additive DMG% dealt bucket in `dealDamageHit`). Damage increases use the **EXISTING additive DMG% bucket** (`additive_dealt`) — there is **NO separate damage-increase bucket** (a set may carry multiple terms; Close Assault sums its two). **Non-damage effects use their own dedicated kinds** (Ultimate effect boost, damage-taken reduction, healing received, status grant, stability restore) — they are **never silently converted to DMG%**.

| Set | 3-piece bonus | Representation / gate | Status |
|---|---|---|---|
| Freeze Boost | +20% DMG% | `additive_dealt`; gate `element: ["freeze"]` | **Implemented + VALIDATED** (shared additive-DMG% mechanism; NOT individually observed — only **Burn Boost** is hard-checked across this family) |
| Burn Boost | +20% DMG% | `additive_dealt`; gate `element: ["burn"]` | **Implemented + IN-GAME VALIDATED** (direct 2457 test — the family's ONLY hard check) |
| Hydro Boost | +20% DMG% | `additive_dealt`; gate `element: ["hydro"]` | **Implemented + VALIDATED** (shared additive-DMG% mechanism; NOT individually observed — only **Burn Boost** is hard-checked across this family) |
| Corrosion Boost | +20% DMG% | `additive_dealt`; gate `element: ["corrosion"]` | **Implemented + VALIDATED** (shared additive-DMG% mechanism; NOT individually observed — only **Burn Boost** is hard-checked across this family) |
| Physical Boost | +20% DMG% | `additive_dealt`; gate `element: [null]` (Physical = phase-less) | **Implemented + VALIDATED** (shared additive-DMG% mechanism; NOT individually observed — only **Burn Boost** is hard-checked across this family) |
| Close Assault | **+12%** unconditional **plus +24% when the damage dealt is melee** (→ a melee dealer's total DMG% is **+36%**, one bucket) | two `additive_dealt`; melee term gate `ammoType: ["melee"]` | **Implemented — DEVELOPER-CONSIDERED VALIDATED** (NO direct in-game number; uses the SAME additive-DMG% bucket as the validated sets, so no separate in-game test is required or planned) |
| Tactical Calculus | +25% DMG% | `additive_dealt`; gate `outOfTurn: true` | **Implemented + RESOLVED** (in-game **tooltip**: +25% for Support Attacks / Interceptions / Counterattacks / passive-effect attacks outside the unit's turn; the shared additive-DMG%-bucket mechanism is already validated by Burn Boost / Phase Strike). Engine MVP consumes the Support-Action path only — the other out-of-turn categories are NOT modeled (and NOT claimed) |
| Phase Strike | +15% DMG% | `additive_dealt`; gate `targetPhaseDebuff` (a target status with a non-null Phase attribute) | **Implemented + IN-GAME VALIDATED** (generic; `overburn` → Burn is the validated example; see below) |
| Summon Boost | +20% DMG% (unit AND its physical Summon) | `additive_dealt`; gate `physicalSummonOnBattlefield` | **INERT / BLOCKED** (no Summon model) |
| Ultimate Pursuit | Ultimate damage/healing/shield effects +5%; +1 stack per Ultimate use, max 4 | `ultimate_effect_boost` (value 0.05, `appliesTo: [damage, healing, shield]`, `stack {perUse:1, max:4}`) | **INERT / BLOCKED** (Ultimate effect/stack infra not modeled) |
| Double Strategy | +10% targeted when target NOT near Cover; +10% AoE when target IS near Cover | two `additive_dealt`; gates `category` + `targetNearCover` | **INERT / BLOCKED** (no Cover detection) |
| Phase Resonance | phase-weakness exploit → grant **Phase Boost** 1 turn before the attack; two phase weaknesses → +10% DMG | `grant_status` (Phase Boost, referenced not defined) + `additive_dealt`; gates `skillTypes:["active"]` + `phaseWeaknessCount` | **INERT / BLOCKED** (no phase-count gate; Phase Boost undefined) |
| Emergency Repair | allied unit fully healed by an active skill → restore 2 Stability, once per turn | `restore_stability` (amount 2, `target:"allies"`, `oncePerTurn:true`); gate `allyFullHeal` | **INERT / BLOCKED** (no ally-heal model) |
| Ally Support | using a defense skill → apply **Area Defense II** to allies for 2 turns | `grant_status` (Area Defense II, referenced not defined, 2 turns, `target:"allies"`); gate `defenseSkill` | **INERT / BLOCKED** (no defense-skill classification; Area Defense II undefined) |
| Shielded Recovery | while the unit has a shield: −15% damage taken, +15% healing received | `damage_reduction` + `healing_received`; gate `hasShield` | **INERT / BLOCKED** (no shield mechanic) |

**In-game validation (2026, Burn Boost — direct):** Qiongjiu ATK **2898** · target DEF **5000** · Burn weakness **+10%** · Common Rail Lv.2 **150% ATK** (Burn) · No-Cover **+20%** · Burn Boost **+20%** → observed **2457**; the authoritative formula gives `2898 × 1.5 × (2898/(2898+5000)) × 1.40 × 1.10 = 2456.36 → 2457`. This validates **Burn Boost's +20% as an additive DMG% modifier alongside No-Cover** — the same data-driven additive mechanism, differing only by the elemental gate, validates the **Freeze / Hydro / Corrosion / Physical Boost** family (treated as VALIDATED; **only Burn Boost is hard-checked** against a direct in-game number — **no further per-element tests are planned**, the shared mechanism already covers them). **Close Assault** and **Tactical Calculus** use the same additive bucket within their gates. **Close Assault is DEVELOPER-CONSIDERED VALIDATED (no in-game number):** it has TWO parts — an unconditional **+12%** and a **+24%** that applies when the damage dealt is **melee** (so a melee dealer's total DMG% is **+36%**) — both in the ONE additive DMG% bucket, identical to the validated sets; **no separate in-game test is required**. **Tactical Calculus is RESOLVED (2026) by its in-game TOOLTIP** — "+25% damage for Support Attacks, Interceptions, Counterattacks, and passive-effect attacks outside the unit's turn" — together with this already-validated additive-DMG%-bucket mechanism; **no separate in-game damage test is required** (no redundant test re-proves the bucket). (These mechanism/unit tests validate the implemented additive-modifier behavior + the set values in the applicable gate — they do NOT isolate each element set independently.)

**In-game validation (2026, Phase Strike — direct):** Qiongjiu ATK **2388** · target DEF **5000** · Burn weakness **+10%** · Common Rail Lv.2 **150% ATK** (Burn) · No-Cover **+20%**. **Control (Burn WEAKNESS but NO Burn debuff):** `2388 × 1.5 × (2388/7388) × 1.20 × 1.10 = 1528.29 → 1529` — Phase Strike did **NOT** apply. **Test (target carries `overburn` + Damage Up II):** bucket `1.20 No-Cover + 0.20 DU2 + 0.15 Phase Strike = 1.55`; crit ×1.20 → `2388 × 1.5 × (2388/7388) × 1.55 × 1.20 × 1.10 = 2369.0 → 2369` (observed). Establishes: **Burn weakness alone does NOT trigger Phase Strike; an active Burn debuff DOES; the +15% is ADDITIVE in the existing DMG% bucket.**

**Overburn's Burn classification — DIRECT tooltip evidence (2026):** the in-game **Overburn tooltip explicitly states "Considered a Burn debuff."** This is the primary source for `overburn.phase = "burn"` — **stronger than inferring the classification from the damage behavior alone**. The two concepts are DISTINCT and must not be conflated:
- **`category: "debuff"`** — the engine's generic status category (buff / debuff / state / upgrade).
- **"Burn debuff"** — the game's **elemental / Phase classification** of the status (the Phase attribute).

**Phase Strike is triggered by a target having a debuff with a Phase attribute** — NOT specifically an "Overburn trigger." `overburn → Burn` is the **currently validated example** of that generic relationship. **Only the `overburn` → Burn (Phase) relationship is validated** — no other status→Phase attribute is populated (do not generalize to other elemental debuffs without evidence).

**Consumption status (2026):** **8 sets are engine-consumed** (Freeze/Burn/Hydro/Corrosion/Physical Boost, Close Assault, Tactical Calculus, **Phase Strike**) via `attachmentSetDealtBonus`; the other **7 sets are INERT** — their attachment-only gates (`physicalSummonOnBattlefield`, `targetNearCover`, `phaseWeaknessCount`, `allyFullHeal`, `defenseSkill`, `hasShield`) are **NOT engine-evaluable**, so `attachmentSetGatesMatch` returns false and the effect never applies (never applied unconditionally). **No Summon / Cover / shield / healing / phase-count / defense-skill mechanics are invented.** The `element` / `ammoType` / `outOfTurn` / `category` / `skillTypes` gates reuse the existing engine gate vocabulary, and `targetPhaseDebuff` is evaluated **generically** against the target's active statuses' `StatusDef.phase` attribute (any status with a non-null Phase attribute). **`Phase Boost` and `Area Defense II` are referenced by name only — their status definitions are NOT added.**

**Source** — user-provided CONFIRMED structure (2026) + the Burn Boost in-game validation above + the **Overburn tooltip screenshot (2026): "Considered a Burn debuff."**

**Explicitly NOT yet known (do not invent):** rarity/tier system; stat ranges (min/max per roll); generation/roll rules; how many attachments exist per slot; whether slots may be empty; whether an attachment is bound to a weapon/character or is a reusable definition; flat-vs-percentage semantics of the un-suffixed stat labels; how attachment stats fold into the existing panel (flat bucket vs percentage bucket). **Calibration / Effect / Trait / Imprint: NO interaction** — those are weapon DAMAGE-side modifiers, orthogonal to attachment PANEL stats (resolved; see the validation decision above).

**Source** — user-provided CONFIRMED structure (2026). The 9 set names + their 3-piece bonuses are user-confirmed; no in-game numeric evidence has been supplied yet, and no attachment stat values are recorded because none were given.

---

### 3.20 Apex Chassis (Heavy Ordnance Corps — partial adaptation)

**Status: ONE PART IMPLEMENTED (2026) — the Apex Chassis only.** The Heavy Ordnance Corps (HOCs) is a squad mechanic introduced with Frontier Conquest; this engine adapts **only the Apex Chassis** (user-directed scope). Everything else in HOCs — Armed Echelons (Active/Passive), HOC Rank + Base Components, the Core/Peripheral Battlefield split, HOC skills/Energy, Armed Echelon ammo grades, acquisition — is deliberately **NOT modeled** (see "Explicitly NOT modeled" below). Engine: `src/engine/apex.ts`; data: `src/data/apex-components.ts`; scenario field `Scenario.apexChassis`.

**Mechanic (SOURCE — dandegate.net HOCs primer, 2026):** in the **Apex Chassis** the Commander equips **up to 2 Apex Components** to increase the Dolls' stats or offer conditional buffs. Components come in **4 Tiers** (roman numerals I–IV) and **7 Types**; the 7 Types match the **7 weapon types** and the 7 Polyphase Tiles. **Only 1 Apex Component of a type may be equipped at a time**, even across tiers. **Tier III and IV offer ATK %, HP %, DEF %, and All-Element Boost.** Duplicate components **combine up to 5 times** to amplify effects (Enhance 1–6). Apex Component bonuses apply **regardless of whether the map uses HOCs** (account-wide — set on the HOC Formation).

**The 7 Apex types ↔ weapon types:** Lightweight Protocol (HG) · Blitz Stratagem (SMG) · Firepower Reconstruction (AR) · Hyperdimensional Vision (RF) · Zero Distance Contact (BLD) · Omnidirectional Strike (SG) · Rain of Lead (MG).

**RECORDED COMPONENT (the ONE with authoritative data, 2026 — player's own in-game screenshot):**
**"Elevation - Firepower Reconstruction"**, **Tier III** → **Attack Boost +2.5% · Health Boost +2.5% · Defense Boost +2.5% · All-Element Boost +75**, plus the **secondary effect** *"Firepower Reconstruction III"* (Lv.1): **"Damage dealt by AR Dolls is increased by 5%. If an attack exploits a weakness, damage dealt is increased by 7%."**
**Enhancement (SOURCE, guide):** Tier III ranges **2.5%→3.0%** (**+0.1%** per enhancement) and **75→100** (**+5** per enhancement); Tier IV ranges **2.5%→3.5%** (**+0.2%**) and **150→200** (**+10**). Both are exactly `Enhance 1 + 5 × increment`, confirming **Enhance 1–6**.

**Engine representation (IMPLEMENTED 2026):**
- `Scenario.apexChassis` is **SCENARIO-LEVEL (account-wide)** — one chassis serves the whole team, matching the guide's "HOC Formation" wording.
- **Always-on stats**: `atkPct` / `hpPct` / `defPct` fold into the EXISTING panel percentage buckets (same Final Stat formula — no parallel stat system), and are suppressed under the Debug-authoritative override exactly like the other permanent sources.
- **All-Element Boost is RECORDED but INERT**: it only has a damage meaning through the **RESMult** formula (`FinalRES = RES × RESShred`; needs enemy **RES**, **RESPierce** 150/250/600%, **RESShred** 90/80/60%, **Venomfire** 95%), which this engine does **NOT** model — so it never modifies damage here.
- **Secondary effect**: both terms are **additive in the EXISTING DMG% dealt bucket** (no separate multiplier). The **weapon-type term** matches only the dealer's OWN `CharacterDef.weaponType` (`"ar"` for Qiongjiu — evidenced by her signature weapon Golden Melody being an Assault Rifle); a doll with no declared weapon type never matches. The **weakness-exploit term** matches when the hit exploits a weakness, following the authoritative **`Weak = 1 + PhaseWeak + AmmoWeak`** — an exploited **phase** weakness OR an exploited **ammo** weakness both qualify (our `exploitedWeaknesses` already computes exactly that combined signal).
- **Validation (LOUD)**: at most 2 components; at most one per `type`; enhancement an integer in `1..maxEnhancement`; unknown component ids rejected — never silently dropped or clamped.

**Explicitly NOT modeled (do not invent):** the other 6 Apex types and Tiers I/II/IV (no data); the **Polyphase-Tile / All-Element-Boost RES subsystem** (no engine model); Armed Echelons / HOC Rank / Base Components / Peripheral Battlefield / HOC skills + Energy / Armed Echelon ammo grades; acquisition, inventory, and drop rates.

**UI IMPLEMENTED (2026):** the Setup screen renders a dedicated, **account-wide** Apex Chassis section (two slots) — a component picker reusing the existing card pattern, a per-slot enhancement slider (1..the component's max), and the component's stat + secondary-effect lines. The catalog comes from the engine over IPC (`sim:listApexComponents` → `buildApexCatalog`, `MAX_APEX_COMPONENTS`); the setup state carries `apexChassis` verbatim into `Scenario.apexChassis` (scenario-level, never per member), and selection flows through `setApexComponentAt` (one-per-type) / `setApexEnhancement`.

**VALIDATION PASS (2026) — findings and open questions:**
- **SECONDARY-EFFECT SCALING — UNRESOLVED (ambiguous guide).** The guide's per-type table gives the secondary-effect values as **RANGES** — Firepower Reconstruction Tier III: *"Damage dealt by AR Dolls increases by `{5-6.5}%`"* and *"If an attack exploits a weakness is increased by `{7-12}%`"* — and states the table covers *"their Tier III and IV forms {Enhance 1 - Enhance 6}"*. The ONLY authoritative in-game observation (the player's screenshot) is **Enhance 1 → 5% / 7%**. Two readings are possible: **(a)** the range spans Enhance 1–6 (so the values DO scale with enhancement), or **(b)** the range spans drop variance and the values are fixed per component. The engine currently implements **(b)** — the secondary effect is a fixed per-component value and does **NOT** scale with enhancement — while the always-on stats DO scale (the guide is explicit there: 2.5%→3.0% / 75→100). **This is a KNOWN GAP, not a validated rule**; it is pinned by a documented test (`apex: the recorded secondary-effect values do NOT scale with enhancement (documented gap)`) so the behavior cannot change silently. The in-game test that would resolve it: equip Firepower Reconstruction at Enhance 1 and Enhance 6 and compare the observed damage bonus.
- **CDMG — guide prose only, NO component data.** The guide says Apex Components "can increase the ATK %, HP %, DEF %, **CDMG**, and All-Element Boost", then adds *"Currently, Tier III and IV only offer ATK %, HP%, DEF %, and All-Element Boost"*. No recorded component grants CDMG, so `ApexComponentStats` deliberately omits a `critDmg` field (adding one would be speculative); it extends trivially if a CDMG component is ever evidenced.
- **Tier I/II — no stat list given.** The guide scopes the Tier III/IV stats; Tier I/II effects are not recorded (so Tier I/II components are absent from the data, not modeled as "empty").
- **`incrementLines` is exposed in the IPC payload but not rendered** in the Setup UI (the slider shows current/max instead). Harmless; noted for completeness.
- **Damage-path validation (engine-level):** the +5% AR term and the +7% weakness term both enter the **one** additive DMG% bucket; the weakness **factor** (×1.10) remains a separate multiplicative term — verified by exact-value assertions (see the test file).

**Source** — dandegate.net "Heavy Ordnance Corps Primer" (Apex Chassis section) + the player's own in-game Tier III component screenshot + the dandegate.net "Damage Formula" guide (`Weak`, `RESMult`).

---

### 3.21 Permanent Cooking Stats (user-toggleable permanent flat bonus)

**Status: IMPLEMENTED (2026) · VALIDATED (authority-backed 2026).** A simple permanent stat system,
switched on per character in the UI (**Permanent Cooking Stats → Enabled/Disabled**). Engine:
`src/data/cooking-stats.ts` + the `resolveCookingFlat` gate in `src/engine/state.ts`; scenario field
`ScenarioTeamMember.permanentCookingStats`.

**Values (VALIDATED — user's own authoritative confirmation, 2026):** **15 Attack · 15 Defense ·
30 Health** — FLAT values, not percentages.

**Engine representation (IMPLEMENTED 2026):**
- The bonus enters the **EXISTING flat bucket** of the ONE panel path (`computePanel`) — `Final Stat =
  ceil((Initial + Flat) × (1 + Stat%))` — summed with the other permanent flat sources (Dispatch /
  Remolder Lv.60 / Neural Helix / Affinity Level / Attachments) **BEFORE** percentage modifiers.
  There is **no second stat system and no separate formula**. It is a SEPARATE source — it never
  merges into `CharacterDef.base`.
- **OFF by default**: applied only when the member sets `permanentCookingStats: true`.
- **CONTROLLED math fixtures** (`applyDispatchStats: false`) **exclude** it, exactly like the other
  permanent sources — so every existing number-pinning oracle (865 / 975 / 1434 / …) is unaffected.
- **Debug-authoritative overrides** suppress it on any stat the user explicitly overrode (an
  overridden stat stays exactly as entered, with no cooking flat beneath it).
- Also folded into the **raw-ATK basis** used for Blossom's top-N highest-ATK selection, so that
  basis and the real panel can never diverge.
- **UI**: a per-character `Enable Permanent Cooking Stats` checkbox in the Setup screen, carried
  verbatim into `ScenarioTeamMember.permanentCookingStats`. While enabled, the bonus is shown as
  GREEN stat lines (`ATK +15 · HP +30 · DEF +15`), fetched from the ENGINE over IPC
  (`sim:getPermanentCookingStats`) — the UI never restates the numbers.

**Not claimed / not modeled:** the in-game *acquisition* of these stats (how cooking grants them),
any per-stat scaling, and any interaction with systems beyond the panel flat bucket.

**Validation status:** the **values** are **VALIDATED by the project owner's authority (2026)** — the
authoritative confirmation is the user's own, not an independent in-game screenshot recorded here.
The **engine behaviour** (flat-bucket folding before percentages, opt-in gating, controlled-fixture
exclusion, Debug-authoritative suppression) is **engine/test validated**.

**Source** — user's authoritative confirmation (2026).

---

### 3.22 Pattern Remolder — Setup UI (user-selectable buff levels)

**Status: IMPLEMENTED (2026). UI LAYER ONLY — the engine system was already implemented and is
UNCHANGED by this work.**

The Pattern Remolder ("flower system") engine (`src/engine/remolder.ts` + `src/data/remolder.ts`)
was already complete and consumed `ScenarioTeamMember.remolderBuffs` (buffId → level) against a
global buff table. The UI had no way to select levels, so the whole system was unreachable from the
app; this section documents the UI layer that exposes it.

**Engine contract (unchanged):**
- `ScenarioTeamMember.remolderBuffs?: Record<string, number>` — the per-character selected buff
  levels. **Level 0 = inactive**; levels above a buff's `maxLevel` **clamp**; an unknown buff id is
  **rejected** by the engine.
- `Scenario.remolderBuffSet?` — the global buff table. **Absent ⇒ the engine uses the production
  `REMOLDER_BUFFS`** (60 buffs: 15 Bulwark / 15 Vanguard / 15 Support / 15 Sentinel). The UI does
  **not** send this field — it relies on the engine default, so the UI can never disagree with the
  engine's own buff table.
- **Set Bonuses** activate automatically from the four category totals
  (`CharacterDef.remolderSetBonuses`, e.g. Qiongjiu's Embryo → Seedling → Sprout → Shoot → Bud →
  Blossom). Remolder level is always treated as 60, so all six are eligible. **The engine owns this
  activation rule**; the UI only displays the result.

**UI surface (IMPLEMENTED 2026):**
- A per-character **Pattern Remolder** section in the Setup screen: four category groups (Bulwark /
  Vanguard / Support / Sentinel), each listing that category's engine-defined buffs. Each buff shows
  its name, its recorded `source` name (when the engine supplies one), a **0..`maxLevel` level
  stepper**, and the **engine-sourced effect lines for the selected level** (e.g. `ATK +2.2%`). Every
  number is fetched from the engine over IPC — the UI never restates a value.
- A **live preview computed BY THE ENGINE**: `sim:resolveRemolder` calls the engine's existing
  `resolveRemolderUnit` and returns, per character, the four `categoryTotals` and the
  `activeSetBonusIds` for the current selection. The UI renders those directly — it does **NOT**
  reimplement the category-total or activation rule.
- Buff definitions are fetched once via `sim:listRemolderBuffs`, which serializes the engine's
  production `REMOLDER_BUFFS` (plus per-level effect lines). Set Bonus definitions ride the existing
  `sim:listCharacters` payload (`CharacterMetaView.remolderSetBonuses`, the same pattern as
  `affinityFlatStats`).

**Representation:** level selections are carried **VERBATIM** into
`ScenarioTeamMember.remolderBuffs`; the UI validates **no** numbers (the engine validates ids and
clamps levels). A character with **no** levels selected emits **no** `remolderBuffs` key, preserving
the exact legacy member shape.

**Not claimed / not modeled:** the in-game *flower-board* geometry/acquisition (which flower grants
which buff — that is the engine's `source` NAME, recorded data only), any inventory/cost/currency,
and any selection legality beyond "known buff id + level ≤ max". The UI presents the engine's
existing buff/level data only.

**Validation (2026) — the selection really moves the stats.** Verified end-to-end on the REAL path
(`setRemolderBuffLevel` → `buildScenario` → `createState` → live panel; seed 7, 7 turns, Qiongjiu,
no other equipment), pinned by `ui/test/remolder-setup.test.ts`:
- **Panel stats rise** — baseline ATK **1939** / HP **4162** / DEF **1315** / Crit Rate **20%** →
  Attack Boost Lv6 **1996** (+57), HP Boost Lv6 **4296** (+134), Defense Boost Lv6 **1358** (+43),
  Critical Boost Lv3 **23%** (+3%). Attack Boost Lv6 checks out arithmetically:
  `ceil(1589 × (1 + 0.22 + 0.036)) = ceil(1995.784) = 1996` — i.e. the buff enters the SAME flat×%
  panel chain (one stat path).
- **Damage-side buffs raise the simulated total** without touching the panel — Physical Boost Lv5
  **5300 → 5313**, Onslaught Stance Lv5 (Active) **→ 5354**, Smite Boost Lv7 (Crit DMG) **→ 5355**.
- **Set Bonuses activate progressively** — Sentinel alone ⇒ none; `+ Vanguard 2` ⇒ **Embryo**; full
  requirement totals ⇒ all six (**Embryo → Seedling → Sprout → Shoot → Bud → Blossom**).
- **Unity lands on the ALLY** — HP Unity Lv5 raises the ally's max HP **+22**, Attack Unity Lv5 the
  ally's panel ATK **+11**; the owner is never a recipient, and with **no** ally there is nobody to
  grant to (so a solo character correctly shows no change).
- **The live preview agrees with the simulation** — for the same selection the preview's
  `categoryTotals` + `activeSetBonusIds` equal the simulated unit's resolved plan.
- **Selections survive a restart** (the persisted setup round-trips `remolderBuffs`).
- **Engine rejects** an unknown buff id (the UI never validates ids itself).

**Known inert selection (recorded, NOT faked):** **Purification Feedback** (`ally_cleanse_stat_pct`)
is stored and displayed but has **no engine consumer** — the MVP has no ally-debuff/cleanse trigger,
so selecting it changes nothing (pinned by a test so the gap stays visible). The other buffs that
show no effect in a given run are **correctly gated**, not inert: element boosts/Smites need the
matching attack element, Thronebreaker/Beheading Blade need a boss target, Headhunter/CQC Elite/
Melee Countermeasures need a grid distance, the Bulwark taken-damage family needs the holder to be
hit, the Support recovery family is not damage, and the Unity family needs an ally present.

**Source** — engine data (`src/data/remolder.ts`, `src/engine/remolder.ts`) + a UI requirement (2026).

---

### 3.23 Elemental tiles — Burn family (2026, SOURCE — NOT implemented)

**Mechanic** — Ground-tile effects that persist on the battlefield and debuff units standing on
them, plus the 2026 **Tile Transformation** layer (Tile Upgrade + Polyphase Fusion).

**Source** — `https://dandegate.net/guides/gfl2s-new-tile-mechanics` ("Elemental Tile
Transformation", author **B Botzu**, published 2026-04-04, updated 2026-09-07). **This is a
community guide, not an official data page** — its own footer states it "reflects the author's
opinions" and "does not represent an official Dandegate.net position." It also states the feature
is **CN-only** and that **names are subject to change** on global release. Treat as **source
hierarchy level 5 (secondary/community)** for discovery; the effect names were independently
resolved from the site's own effect records (see below).

**Confidence** — **[SOURCE], Not Tested.** No in-game observation, no automated test. Every value
below is what the guide states.

**Scope of this section:** **Burn-related tiles only** (the base Burn tile and every fusion tile
that contains Burn). Non-Burn tiles and non-Burn fusions are **deliberately out of scope here** —
do not treat their absence as "no such tiles".

#### 3.23.1 The transformation layer (applies to all elemental tiles)

- **Tile Upgrade** — generating the **same** element onto an existing tile levels it up. **Three
  stages**: Base → Lv2 → Lv3. It **keeps the original bonuses** and either improves numbers or adds
  effects. At **Lv3**, further generation **only refreshes duration**.
- **Polyphase Fusion** — generating **two fusible base elements** onto the same tile produces a
  fusion tile carrying **partial effects of both**. Fusion tiles **take priority over base tiles**
  and are **not** overwritten by a third element. They also level to **Lv3**, and **either** fused
  element can level them. Fusing onto an **already-upgraded** tile starts at that tile's level.
- **Three versions:** **Allied** (debuffs enemies) / **Enemy** (debuffs allies) / **Neutral**
  (debuffs everyone), set by whichever unit last generated onto the tile. Enemy versions **swap
  which units are targeted**; neutral versions **apply all effects**.
- **Duration resets to 3 rounds** on every upgrade or fusion (note: the per-effect durations
  stated below are separate 2-turn status durations).

#### 3.23.2 Effect-name resolution (independently verified)

The guide renders effects as opaque `[effect:<uuid>]` tokens. The names below were resolved by
fetching each `https://dandegate.net/effects/<uuid>` record (the page title is the effect name) —
**not** guessed from context:

| Effect uuid | Name |
|---|---|
| `71b3f790-db3b-4188-a3d7-15fa9752b57a` | **Overburn** |
| `a55cd12e-7fd4-47c1-bddc-6e933f2a323a` | **Conflagration** |
| `174c1af6-3fc1-41aa-b4ec-48e5583baacb` | **Combustion** |
| `783df2a2-7606-4471-abbf-e49dcfb6e813` | **Combustion II** |
| `1e0dd817-2d72-4a4a-98d5-4acd6e11b8e5` | **Stability Loss I** |
| `d85addc9-1d0c-46cb-a37a-377dde1be0ae` | **Frozen** |
| `7dec35ce-d8cc-443e-8a4e-410233b3cda6` | **Damp** |
| `8cfe89a9-404a-42e5-9cc7-5bf57b070887` | **Paralysis** |
| `bba5e073-5719-4cc8-85d9-6de563caaa5e` | **Congestion** |
| `c3a3ce01-1487-4a69-bc3c-9c04aa8c26ec` | **Meltdown** |

**Note:** only **Overburn** of these exists in this repo (`src/data/statuses.ts`). The other nine
are **not defined** in the engine.

#### 3.23.3 Base Burn tile — "Incineration" → "Flashover II" → "Flashover III"

Allied version, verbatim (effect tokens resolved):

| Lv | Name | Effect |
|---|---|---|
| **Lv1** | **Incineration** | Applies **Burn weakness** to enemy units on the area. Applies **Overburn** and **Conflagration** to enemy units that remain on the area after ending their action, lasting **2 turns**. Considered a Burn tile. |
| **Lv2** | **Flashover II** | Applies **Burn weakness** … Applies **Overburn**, **Conflagration**, and **Combustion** … lasting **2 turns**. Considered a Burn tile. |
| **Lv3** | **Flashover III** | Applies **Burn weakness** … Applies **Overburn**, **Conflagration**, and **Combustion II** … lasting **2 turns**. Enemy units on the area **gain 1 stack of Combustion II and generate Flashover III tiles within a 3-tile radius around themselves for every 3 times they take Burn damage**, lasting for **3 turn**. Considered a Burn tile. |

**Upgrade deltas:** Lv2 adds **Combustion**; Lv3 upgrades it to **Combustion II** and adds the
self-propagation clause. The **Lv1 tile name is "Incineration"** — the same term Vector's kit uses
for the tiles her skills generate.

#### 3.23.4 Burn fusion tiles

| Pair | Name | Effect (Allied, verbatim with resolved names) |
|---|---|---|
| **Burn + Hydro** | **Scalding Vapors** | Inflicts **Burn and Hydro weakness** to enemy units in the area. Applies **Overburn**, **Conflagration**, and **Damp** to enemy units remaining in the area after their actions, lasting **2 turns**. When the tile is generated, deals **Burn damage and Hydro damage equal to 10% of the caster's ATK** to enemy units in the area. Can be triggered repeatedly when applying Burn or Hydro tiles, **up to 10 times per round by the same caster**. Considered a Fusion Tile. |
| **Burn + Corrosion** | **Venomfire** | Applies **Burn and Corrosion weakness** to enemy units in this area. Enemy units which end their turn in this area take **fixed damage equal to 50% of the inflictor's attack** and gain **Overburn**, **Conflagration**, and **Stability Loss I** for **2 turns**. When enemy units in this area take **Burn or Corrosion damage**, they and **all enemy units within 2 tiles** take **fixed damage equal to 10% of the inflictor's attack**. Considered a Fusion Tile. |
| **Burn + Freeze** | **Smoldering Suspire** | Applies **Burn and Freeze weakness** to enemy units in this area. Enemy units which end their action in this area gain **Overburn**, **Conflagration**, and **Frozen** to enemy units remaining in the area after their actions, lasting for **2 turns**, as well as taking **Burn damage and Freeze damage equal to 50% of the inflictor's attack**. Considered a Fusion Tile. |
| **Burn + Electric** *(CN only, unofficial TL)* | **Crackling Flare (震爆)** | Applies **Burn and Electric weakness** to enemy units on the area. Applies **Overburn** and **Conflagration** to enemy units that remain on the area after ending their action, lasting **2 turns**. When enemy units on this tile take **AoE damage**, they take **fixed damage equal to 30% of the inflictor's attack**; if that AoE damage is **Electric or Hydro**, increased to **60%**; **doubled against large targets**. Stability damage taken by enemy units on this area is **increased by 1 point**, and their **Stability Index recovery is reduced by 10%**. When the Stability index of allied units in this area is **greater than 0**, Stability damage taken is **reduced by 1 point**, and their **Burn and Electric Boost are increased by 15 points**. Considered a Fusion Tile. |

#### 3.23.5 Fusion Lv2 / Lv3 (Burn-containing fusions)

The guide's tabs carry the higher levels; transcribed as stated (Lv2 / Lv3 shown as deltas from Lv1
where the source repeats the base text):

**Scalding Vapors II (Lv2):** applies **Overburn**, **Conflagration**, **Combustion**, and
**Congestion** (2 turns); **restores HP equal to 5% of max HP to friendly units** remaining in the
area after their actions; generation damage **10% → 15% of the caster's ATK**; still **10×/round**.
**Scalding Vapors III (Lv3):** **Combustion II** + **Congestion** (2t); friendly HP restore
**5% → 8%**; generation damage **→ 20%**; **damage taken by enemy units in the area is increased by
15%**.

**Venomfire II (Lv2):** turn-end **fixed damage 50% → 150%**; gains **Overburn**, **Conflagration**,
**Combustion**, **Stability Loss I**, and **1 random debuff** (2t); the Burn/Corrosion-triggered
splash becomes **fixed 25% within 3 tiles** (was 10% within 2). **Venomfire III (Lv3):** turn-end
fixed damage **→ 300%**; **Combustion II**; splash **25% within 3 tiles**; **Burn and Corrosion
resistance of enemy units in this area is reduced by 5%**.

**Smoldering Suspire II (Lv2):** gains **Combustion**; Burn/Freeze damage **50% → 75%**; **mobility of
ally units in this area +1 tile** and they are **immune to Paralysis**. **Smoldering Suspire III
(Lv3):** **Combustion II** + **Meltdown**; damage **→ 100%**; **damage dealt by enemy units in this
area is reduced by 15%** and their **attack range is reduced by 3 tiles**; ally mobility **+2
tiles**, still **immune to Paralysis**.

**Crackling Flare II (Lv2):** gains **Combustion** and **Paralysis**; enemy **+1 → +2 Stability
damage taken**, recovery reduction **10% → 15%**; ally **Burn and Electric Boost 15 → 25 points**.
**Crackling Flare III (Lv3):** **Combustion II** + **Paralysis**; enemy **+3 Stability damage
taken**, recovery reduction **30%**; **if the unit is a Boss, their Stability Index recovery is
delayed by 1 turn**; ally Stability damage taken **−2 points**, **Burn and Electric Boost → 50
points**.

#### 3.23.6 What this section does NOT establish

- **No in-game validation.** Nothing here is `Validated`; all of it is `[SOURCE]` from a community
  guide.
- **Not implemented.** The engine has **no tile system at all** (`docs/grid.md` — terrain is
  height/blocked/ladder only; `GridConfig` carries no tile-effect field). Nothing above is modeled.
- **Non-Burn tiles and fusions** are out of scope for this section (see the scope note above).
- **The Burn-DEBUFF family is separate from Burn TILES.** Effects such as **Overburn**,
  **Overheat Combustion**, **Smolder**, and **Overheat** are game **status effects**, not tile
  effects — they are *applied by* skills/keys and some of them *generate* tiles. Their authoritative
  inventory (with upgrade variants and the engine gaps they need) is recorded per-character in
  **`docs/dolls/vector.md` §7.1**, not here — this section owns the **tile rules** only. Do not
  conflate the two.
- **"Burn and Electric Boost … points"** uses the same "Boost/points" vocabulary as the Apex
  All-Element Boost — the relationship between those is **[UNKNOWN]** here.
- **The guide covers 7 of the 10 phase pairs** (8 including the CN-only Burn+Electric);
  **Corrosion+Freeze** and **Electric+Freeze** are not listed.

---

### 3.24 Extra Command — extra main actions (2026, IMPLEMENTED + TESTED)

**Mechanic** — a unit may perform **additional main actions** in the same unit-turn when an effect
grants it ("Extra Command").

**Source** — Vector's **Searing Finale Lv.1** (*"Vector gains Extra Command"*); the effect's own
record (`dandegate.net/effects/c1feeb2a-…`) reads *"Commands other than movement can be executed."*
Semantics confirmed with the project owner (2026-10-09):
- the holder acts **again right after** its current action (e.g. Ultimate → then Skill 1, Skill 2, or
  Basic);
- the holder **CANNOT MOVE** during the extra action;
- **one extra action per stack** — the engine consumes one instance per extra action.

**Confidence** — the mechanic's semantics are `[GAME]`-confirmed by the project owner (source
hierarchy level 1); the **engine implementation** is covered by automated tests. **NOT in-game
validated** — a controlled in-game run would move it to `Validated`.

**Implementation interpretation** — data-driven and generic; **no character or skill ids**:
- **`StatusEffect` kind `extra_action`** (`src/model/types.ts`) — the effect IS the grant (no numeric
  value). Any status carrying it grants extra actions.
- **`StatusDef` `extra_command`** (`src/data/statuses.ts`) — `category: "state"`, `stackable: true`,
  `durationRounds: null` (no stated duration → none invented), effect `[{ kind: "extra_action" }]`.
  `category: "state"` is deliberate: it is an **action-economy** grant, not a stat/damage modifier,
  and the game's own record carries **no Attack/Buff tags** for it. A side effect that matters:
  `category: "buff"` is what triggers the weapon Charging counter, so a `"state"` classification
  correctly does **not** count Extra Command as a buff gain.
- **The turn loop** (`src/engine/simulation.ts`) now runs an **action loop**: `actionBudget` starts
  at **1** (one main action per unit-turn) and an extra action **adds 1** to it. The pre-existing
  `UnitState.actionBudget` field was previously set-but-never-read; it now drives this loop — no new
  state was added. `consumeExtraAction` removes one instance and the caller records it in the
  event's `statusesExpired` (the same consumption channel as Support Boost), so the log explains the
  follow-up action.
- **Movement is impossible in an extra action by construction**: the turn loop applies movement
  once, at the pre-action point of the unit-turn, before the action loop. No extra guard is needed.
- **The end-of-action tick runs ONCE per unit-turn, after ALL actions** — status durations,
  cooldowns and the weapon Trait all tick after the last action, so a 1-turn buff granted by the
  granting skill is still active for the extra action (pinned by a test).

**Unknowns / not claimed** — the **exact duration** of the Extra Command status (the source states
none; modeled as no duration rather than inventing one); whether it can be **cleansed** (the game's
records mark several Vector effects "cannot be cleansed" but **not** this one — the default
cleansable stands, pending evidence); whether it interacts with **movement modifiers** or
**out-of-turn** rules; whether an extra action can itself **grant** another extra action (the engine
allows it structurally — a chain would need evidence before being relied upon).

**Out of scope** — the wider "extra actions" topic in `docs/validation-checklist.md` §2 (that entry
covers enemy turns / additional-action systems generally); this section records only the
**Extra Command** grant, as implemented.

---

### 3.25 Apathetic Resistance — Crit DMG buff (2026, IMPLEMENTED + TESTED)

**Mechanic** — a self-buff that raises the holder's **Crit DMG by 25% for 2 turns**.

**Source** — Vector's **Searing Finale Lv.3 (V6)**: *"Vector gains Apathetic Resistance, lasting for
2 turns."* The game's own effect record (`dandegate.net/effects/8980f1fb-…`) reads: *"Critical damage
is increased by 25%. Considered a Buff, cannot be cleansed."* Duration (2 turns) and the value (25%)
additionally confirmed by the project owner (2026-10-09). Source class: secondary (community
database) + user-provided — **not in-game validated**.

**Confidence** — `[SOURCE]`/`[GAME]` for the values; the **engine implementation** is covered by
automated tests. **NOT in-game validated.**

**Implementation interpretation** — a plain `stat_modifier` on `critDmg`, which required extending
the stat union:
- **`critDmg` added to `StatusEffect`'s `stat_modifier` stat union** (`src/model/types.ts`), so any
  status can modify Crit DMG through the SAME generic stat path.
- **`statModifier`** (`src/engine/statuses.ts`) accepts `critDmg` and keeps it **CONTINUOUS** — the
  validated integer-panel rounding rule (ATK/HP/DEF) does **not** apply to the crit stats.
- **The crit resolution site** (`dealDamageHit`, `src/engine/simulation.ts`) now reads BOTH crit
  stats through `statModifier`, so the buff enters the **CONFIRMED** crit multiplier `1 + Crit DMG`
  (U1/U19) — one more source in that stat, **no parallel crit path, no new bucket**.
- **The status** (`src/data/statuses.ts`): `apathetic_resistance`, `category: "buff"`,
  `durationRounds: 2`, `purgeable: false` (the source states "cannot be cleansed" — an explicit
  immunity), effect `[{ kind: "stat_modifier", stat: "critDmg", mode: "flat", value: 0.25 }]`.

**Value convention** — Crit DMG is a FRACTION: `0.25` = the +25% the source states, matching the
repo's established `0.2` = the displayed "120% Crit DMG" (the multiplier is `1 + critDmg`).

**Duration timing** — the buff is **self-applied**, so the established, in-game-VALIDATED **U7
self-applied rule** governs (§3.10): it ticks at the END of the **same casting action**. With
`durationRounds: 2` it therefore covers the rest of the casting turn plus the holder's NEXT turn,
then expires. **This is inherited generic behaviour, not a re-derivation** — pinned by
`status-timing.test.ts` and exercised by `apathetic-resistance.test.ts`.

**Unknowns / not claimed** — **stacking** (the source states none; `stackable: false` with no
invented cap); whether the buff interacts with the **Crit-Rate overflow conversion** passive
(independent stats — no interaction is claimed); and any **cleansing** interaction beyond the stated
immunity.

---

### 3.26 Per-element gate on damage modifiers (`whenElement`) — 2026, IMPLEMENTED + TESTED

**Mechanic** — a `damage_modifier` may be restricted to hits of **specific attack elements**.

**Why it exists** — two of Vector's Burn clauses are element-gated damage modifiers:
**Accelerant** ("*Burn damage dealt* +10%", DEALT scope) and **Overheat Combustion V1** ("*Burn damage
taken* +30%", TAKEN scope). Before this, the ONLY per-element gate in the engine was
`stack_tier_modifier.when.element` — a per-stack tier table, which would have been an abuse for a
flat modifier.

**Implementation interpretation** — a new optional field on the `damage_modifier` union member
(`src/model/types.ts`):
```
whenElement?: (Element | null)[]
```
**Semantics — deliberately IDENTICAL to the existing element gates** (`AttachmentSetGates.element`,
`RemolderEffectGates.element`): an **OR-list**; the hit's attack element must be one of the listed
values; **`null` in the list matches a PHASE-LESS hit**. Absent = all elements (existing behavior
preserved).

**Consumed in three places** (`src/engine/statuses.ts`), so the gate is **never silently ignored**:
- `additiveDealtBonus` — the DEALT scope (Accelerant's shape)
- `additiveTakenBonus` — the TAKEN additive scope (Overheat Combustion V1's shape)
- `multiplicativeTakenMods` — the TAKEN multiplicative branch, honored for consistency: a declared
  `whenElement` applies regardless of `mode`

**What it reads** — the **attack's own element** (`SkillDefVariant.element`; `null` = phase-less), never
the target's weakness list. Element identity is the existing `Element` union
(`burn | hydro | freeze | electric | corrosion`) plus `null` — **no element or category is invented**.

**Evidence status** — this is an **engine vocabulary** addition, not a game mechanic: the values are
the engine's own taxonomy. Covered by `src/test/element-gate.test.ts` (9 tests: matching /
non-matching element, OR-lists, the `null` phase-less case, ungated controls on both scopes, the
multiplicative branch, an end-to-end damage check, and a guard that the synthetic fixtures never leak
into production data). **Neither Accelerant nor Overheat Combustion is implemented by this** — each
still needs other pieces; see `docs/dolls/vector.md` §7.1 for the exact remaining gaps.

---

### 3.27 Start-of-action status tick (`ownActionStart`) — 2026, IMPLEMENTED + TESTED

**Mechanic** — a status may fire its effects at the holder's **turn start**, BEFORE the holder moves
or acts.

**Ordering (project owner, 2026-10-09):**
```
turn starts  →  start-of-turn effect fires  →  the unit acts
```

**Source** — Vector's **Overheat Combustion**: *"Upon gaining this effect and at the start of this
unit's action, this unit and all allied units within a 1-tile area … take fixed damage equal to 20%
of the applier's attack."* The **status is NOT implemented here** — this section records only the
**tick point** that it needs.

**Implementation interpretation** — `StatusDef.tickAt` (and `StatusOverride.tickAt`) gained a third
value, `"ownActionStart"`, alongside the existing `ownActionEnd` (CONFIRMED default for normal timed
buffs, U7) and `roundEnd` (alternative/testing):
- **`tickStatuses`** (`src/engine/statuses.ts`) was **generalized**: it now matches
  `def.tickAt === at` directly instead of branching on a two-value pair, so the new point needs no
  special case and a status still fires at **exactly one** point (never two).
- **`applyStartOfActionStatusEffects`** (`src/engine/simulation.ts`) is the `onTick` handler for the
  new point — currently **status-sourced fixed damage only**. `heal` (Continuous Healing I) is an
  explicit ACTION-END effect and is deliberately **not** fired here.
- **Fired in two places**, both at a unit's own turn start, after `beginUnitRound` and **before**
  movement and the action:
  1. the team loop, per acting unit (`tickStatuses(state, doll, "ownActionStart", …)`);
  2. the **dummy's pass-turn** — the dummy's own turn starts before it passes, so **target-side**
     statuses (Overheat Combustion is applied to the *target*) tick there too. This mirrors the
     existing arrangement where the dummy's pass-turn exists so target-side `ownActionEnd` statuses
     tick naturally.
- **Duration decrements at the tick point**, so a 1-turn status is gone before the holder acts.

**Evidence status** — the *ordering* is `[GAME]` (project owner, source hierarchy level 1); the
*implementation* is covered by automated tests. **NOT in-game validated.** Covered by
`src/test/start-of-action-tick.test.ts` (8 tests: target-side tick, the before-the-action ordering,
1-turn expiry at the turn start, an `ownActionEnd` control, single-point exclusivity, a permanent
status never ticking, a direct `tickStatuses` unit check, and a guard that the synthetic fixtures
never leak into production data).

**Unknowns / not claimed** — whether any effect OTHER than fixed damage belongs at this tick point
(none is asserted); whether a start-of-action tick can **kill** the holder before it acts (the
damage is applied normally, but no death/action-cancellation rule is invented — the MVP has no
death handling); and any interaction with the unit's own **turn-start Confectance drain** beyond
their both occurring at the turn start.

---

### 3.28 All-allies status targeting (`target: "all_allies"`) — 2026, IMPLEMENTED + TESTED

**Mechanic** — a status application may target **every allied unit on the battlefield** rather than
a single recipient.

**Source** — Vector's **Searing Finale**: *"Applies **Accelerant** to all allied units, lasting for
2 turns"* (and its V2 upgrade: *"Applies **Blazing Assault II** to all allied units for 2 turns"*).
The statuses themselves are **NOT implemented here** — this section records the **targeting
vocabulary** they need.

**Implementation interpretation** — `StatusApplySpec.target` gained a third value,
`"all_allies"`, alongside `self` and `target` (default):
- **"All allies" = every member of the allied team (`state.units`), INCLUDING the acting unit.**
  `state.units` IS the allied side; the enemy/dummy lives in `state.dummy` and is **never** included.
  (Confirmed with the project owner, 2026-10-09.) The name matches the existing Pattern Remolder
  `unity_dealt` target of the same spelling.
- **`applySkillStatuses`** (`src/engine/simulation.ts`) resolves the recipient LIST for a spec —
  `[actor]` for `self`, `[target]` otherwise, or `state.units` for `all_allies` — and applies to
  each in turn. Per-recipient semantics are unchanged: blocked applications are still blocked,
  `replaces` still removes the listed statuses on that recipient, and an `onApply` fixed-damage
  effect still fires for each recipient that newly gained the status.
- **Reporting stays ONCE PER SPEC.** The log's `statusesApplied` / `appliedSources` /
  `statusesExpired` arrays carry **no unit attribution**, so the fan-out must not list the same id
  once per recipient. Two separate specs that apply the same status id still report twice (the
  established semantics — e.g. the at-max branch's extra Support Boost II stack).
- **The `beforeSupportStatuses` path** (`resolveSupportHit`) uses the **same** recipient rule, so a
  declared target is never silently ignored there either. *(Before 2026 that path always applied to
  the dummy and ignored `spec.target` entirely; the existing Qiongjiu V4 spec declares
  `target: "target"`, so its behaviour is unchanged.)*

**Evidence status** — the *semantics* are `[GAME]` (project owner, source hierarchy level 1); the
*implementation* is covered by automated tests. **NOT in-game validated.** Covered by
`src/test/all-allies-targeting.test.ts` (7 tests: the fan-out reaching every ally AND the caster,
`self` and `target` controls, a solo caster, once-per-spec reporting, team-size scaling, and a guard
that the synthetic fixtures never leak into production data).

**Unknowns / not claimed** — whether any Vector effect targets allies **other than** the whole team
(e.g. a range- or tile-limited ally set); how all-allies interacts with a **dead** ally (the MVP has
no death handling); and whether the two Ultimate statuses apply to the caster separately from
"Vector gains Extra Command" (the source lists them as distinct clauses — the engine does not
conflate them).

---

## 4. Uncertainty register

Every mechanic that is still uncertain, with impact and resolution path. **None of these should be hardcoded as facts in the engine — all are config defaults pending the in-game test plan (§5).**

**Removed entry (tombstone, NOT an active uncertainty):** U2 — Glancing (擦伤): **REMOVED 2026-09-03**. Originated from 一测/first closed-beta BWIKI material ("擦伤" ⇒ final × 0.1). No current-game evidence; absent from the established live damage formula (GFL2 Damage Formula Translation, Reddit live reproduction, IOPWiki); never observed in any in-game validation; removed from the simulator rather than treated as an unresolved live mechanic. Historical detail preserved in §3.6. **No other U-IDs were renumbered.**

| # | Mechanic | Confidence | Sim impact | Resolution |
|---|---|---|---|---|
| U1 | ~~Crit multiplier: ×1.5 vs ×(1 + 20% panel)~~ → **RESOLVED 2026-09-03**: multiplier = Crit DMG stat (×1.20 at 120%), applied to unrounded damage before final ceil; the 1956/1958 ATK control test discriminates the ordering (see §3.3) | ~~UNCERTAIN~~ → **CONFIRMED (in-game)** | Was up to 33% skew | ✅ resolved by in-game test — engine derives the crit multiplier as `1 + Crit DMG` per attacker (config default `critMultiplier: null`; no hardcoded 1.5). `configOverrides.critMultiplier` remains a test-only alternative hypothesis |
| U3 | ~~Exposed damage-% after stability break~~ → **RESOLVED 2026-09-03 — NO UNIVERSAL MODIFIER**: for the boss DPS simulator there is **no universal Exposed/Broken damage multiplier**. Breaking a boss makes `stability > 0` false, so Stability-dependent boss passives (U5) stop applying; the Broken/Exposed flag itself is **pure state** (U4 window, U5 condition, future character-specific Broken-target effects). Any "bonus vs Broken/Exposed" effect is a CHARACTER mechanic to be modeled in that Doll's data, not a generic multiplier. | ~~UNKNOWN~~ → **RESOLVED (no universal modifier)** | Was big skew on break turns | ✅ closed — generic `exposedDamageMult` removed from the engine; `exposed` remains queryable state (`LogEvent.exposed`) |
| U4 | ~~Break duration (beta `breakRound=2`)~~ → **RESOLVED 2026-09-03 (permanent simulator rule, current-game validated via U6)**: the broken/exposed window is governed by the ALWAYS-2-turn Stability recovery — break on Turn N → broken through the remainder of N and throughout N+1 → **Stability restored at the START of Turn N+2**. The beta `breakRound=2` datum is supporting historical evidence, not the primary justification. **U4 = window DURATION; U3 = NO universal damage MULTIPLIER (resolved — none exists)** — U4 establishes no Exposed damage magnitude. | ~~UNCERTAIN~~ → **CONFIRMED (current-game, via U6; fixed 2-turn recovery, non-configurable)** | Break window length | ✅ resolved — fixed 2-turn broken/recovery window; engine behavior verified by `stability-recovery.test.ts` and `boss-stability.test.ts`; no configurable recovery duration |
| U5 | Per-unit max stability & per-skill stab damage values; **boss-specific Stability-conditional passive damage reduction — CONFIRMED & IMPLEMENTED (2026-09-03, in-game boss tooltip: −80% taken while stability > 0 → ×0.20)** | values: CONFIRMED examples / UNKNOWN table; boss-passive mechanic **RESOLVED** (generic, data-driven) | Stability pacing + boss damage | boss-passive: implemented via `DummyConfig.passives` + conditional taken modifier (see §3.7, `boss-stability.test.ts`); per-unit values still from per-skill record / `PotRooms/GFL2_Data` |
| U6 | ~~Stability recovery timing~~ → **CONFIRMED 2026-09-03**: restored exactly 2 turns after the break (break Turn N → restored Turn N+2), restored to max | ~~UNKNOWN~~ → **CONFIRMED (timing)** | Was long-sim drift | ✅ resolved — engine models the 2-turn delay (`STABILITY_RECOVERY_DELAY = 2`); no universal Exposed damage multiplier (U3 resolved) |
| U7 | ~~Buff duration tick point (own turn start vs round end)~~ → **RESOLVED 2026-09-03 (in-game, Attack Up II)**: a normal timed buff's duration is consumed at the **END of the recipient's own action** — applied with N turns, unchanged before the recipient acts, −1 at the recipient's action end. Engine default `ownActionEnd`. **Self-applied buffs (VALIDATED in-game 2026, Fortification Protocol / Positive Charge)**: a unit's SELF-applied buff also ticks at the end of that same casting action (3 → 2); the old same-action skip was removed and is locked by `status-timing.test.ts`. Statuses with their own timing text remain status-specific. | ~~UNKNOWN~~ → **CONFIRMED (in-game)** | Buff expiry timing | ✅ resolved — engine default confirmed; `status-timing.test.ts`; alternative tick (`roundEnd`) stays a testing knob (`config-override.test.ts`). **`ownActionStart` added 2026** as a THIRD point for statuses whose own text ties them to the holder's turn start (Overheat Combustion) — it does not change the U7 default for normal timed buffs; `start-of-action-tick.test.ts` |
| U8 | ~~Same-tier status reapply: refresh vs stack~~ → **RESOLVED 2026-09-03 (in-game, Attack Up II)**: reapplying the SAME status tier while it is active **refreshes the duration and does NOT add another stack** (1 stack, 2 turns → reapply → still 1 stack, 2 turns). Engine default (refresh; stack only if the status is `stackable`). Statuses with explicit stacking text (max 3/8/10) remain governed by that text. | ~~UNKNOWN~~ → **CONFIRMED (in-game)** | Stack math | ✅ resolved — engine default confirmed; `status-timing.test.ts` |
| U9 | ~~Confectance cap & battle-start value~~ → **RESOLVED 2026-09-03**: battle start **3** (no keys), max **6**; +1 per Basic damage event; Pressing the Momentum cost **3** | ~~UNKNOWN~~ → **CONFIRMED (in-game, Qiongjiu no keys)** | Ultimate timing | ✅ resolved — engine defaults start 3 / max 6; gains & cost are data-driven; overrides (confectanceMax/Start) remain for alternative testing. U10 closed (generic Confectance damage bonus disproven — no multiplier) |
| U10 | ~~Confectance damage-bonus table (beta +5%/10pts, cap +50%)~~ → **NOT PRESENT / DISPROVEN 2026-09-03**: Qiongjiu's damage unchanged across rising Confectance over repeated attacks; the claim was beta-only (BWIKI `/gf2/导染指数`, 一测 era) and is removed. Confectance is a **resource** (MVP) — effects only via explicit character/skill/passive data | ~~UNCERTAIN (beta only)~~ → **DISPROVEN (current Qiongjiu/MVP)** | Was damage curve | ✅ closed — no generic multiplier exists or will be added; modeling as a pure resource |
| U11 | ~~Cooldown decrement timing (use-turn counted?)~~ → **CONFIRMED 2026-09-03**: CD-N waits N full turns after the cast turn — CD-1 cast T1 → unavailable T2 → available T3 (NOT "next turn") | ~~UNCERTAIN~~ → **CONFIRMED (in-game)** | Skill cadence | ✅ resolved — engine default `cooldownModel = "nextOwnTurnEnd"`; alternative `endOfOwnTurn` selectable for testing only |
| U12 | Auto-battle AI priority | UNKNOWN | Whole-sim fidelity | Auto-battle recording; default is a labeled model assumption |
| U13 | Live level cap & endgame stat magnitudes | UNKNOWN (2024 data) | Absolute numbers | In-game panel read |
| U14 | ~~Enemy/dummy DEF magnitudes~~ → **RESOLVED (mechanic + current data point)**: engine capability RESOLVED — target DEF is per-target configurable data (`dummy.defense`), applied via the confirmed factor `ATK/(ATK+DEF)` (the formula itself was already resolved separately). **Current boss DEF CONFIRMED in-game: 5,001** (displayed stat of the current tested target). Future boss rotations = **DATA POPULATION** (new `dummy.defense` per target — no engine change). An earlier validation target (Blaze Master) displayed DEF 5,000 and reproduced its observed damage (529/635/1091/1310/1191) — target-specific displays, **no universal boss DEF is implied** | ~~UNKNOWN~~ → **CONFIRMED (current target) / mechanics RESOLVED** | Defense term scale | ✅ resolved — `boss-def-validation.test.ts` pins the current boss's DEF 5,001 as data through the engine; no engine change |
| U15 | Weakness partial-match (U15a) & phase×weakness interaction (U15b) — **U15b RESOLVED 2026** (generic element weakness → ×1.10 on Phase damage: Burn Common Rail 2233 no-weak baseline → 2340 with Burn weakness; separate from AWU, no new Phase mechanic). **U15a RESOLVED 2026**: matched-count rule (1 → ×1.10, 2 → ×1.20; Burn-only → 1091 ×4; Burn + Ammo → 1191 / crit 1470 @123.5%; additive `1 + 0.10 × n`) AND the **partial-match edge** (only weaknesses MATCHED by the attack count; validated: ~10 displayed weaknesses, 2 matched → ×1.20 → 1207/1491/1207; see §3.5); **weakness Stability Damage validated 2026** (total = attack base + 2 × # exploited, element + ammo tag; see §3.5). (No phase-WHEEL counter-relation exists — premise corrected/removed 2026, §3.4.) | U15b **CONFIRMED (in-game)** / U15a matched-count + partial-match **CONFIRMED (in-game)** / weakness-stab **CONFIRMED (in-game)** | Edge-case damage | U15b: `phase-weakness-validation.test.ts` ✅; U15a counts: `weakness-matching-validation.test.ts` ✅; U15a partial-match: `partial-match-validation.test.ts` ✅; weakness-stab: `weakness-stability.test.ts` ✅ |
| U16 | Element DoTs (five phase elements) full definitions | UNKNOWN | DoT modeling | Skill doc read (deferred — not required for first dolls) |
| U17 | ~~"Resonance" phase extension (2026)~~ → **REMOVED (premise erroneous)**: the rumored extension was tied to the (nonexistent) elemental counter wheel; GFL2 has no counter wheel (corrected 2026, §3.4) — no such extension is pending | ~~UNKNOWN~~ → **REMOVED (invalid premise)** | — | — |
| U18 | "Nixie/交换机" term | UNKNOWN (no evidence) | — | Needs user clarification, not code |
| U19 | ~~CDMG linearity beyond 120% + Crit-Rate cap/overflow~~ → **RESOLVED 2026-09-03**: (C) **Crit multiplier = 1 + Crit DMG, linear** — 120.0% → ×1.20 (Basic crit 635), 123.5% → ×1.235 (crit 654×4), applied to unrounded damage before the final ceil; (A) **universal Crit system** — Crit Rate decides whether the attack crits, **effective Crit Rate caps at 100%**, overflow is discarded unless a character passive converts it; (B) **passive-specific conversion** — confirmed passive ("every 1% of overflow critical rate is converted to 1% critical damage"): threshold 100%, **ratio 1:1 CONFIRMED**, optional cap; data-driven `excess_crit_conversion` (no character IDs, never a global rule) | CDMG **CONFIRMED (in-game, numeric)** / CR cap + 1:1 conversion **CONFIRMED** (in-game passive text; conversion ratio additionally confirmed by testing) | Crit-damage scaling + crit frequency | ✅ resolved — engine derives `1 + critDmg` (no hardcoded default); applies the 100% cap and converts overflow only via per-character passive data; all paths numerically locked (`critdmg-validation.test.ts`, `crit-overflow-validation.test.ts`). Remaining items are DATA POPULATION only (which characters carry such passives + exact params, CR-raising attachment sources) — not unresolved mechanics |
| U20 | ~~Multi-weakness stacking (multiplicative vs additive)~~ → **RESOLVED 2026-09-03**: weakness factor is **additive across exploited weaknesses**: `1 + 0.10 × count` — 1 weakness ×1.10 (Burn → 1091); 2 weaknesses ×1.20 (Burn + Medium ammo → 1191); multiplicative ×1.21 ruled out (would give 1201 ≠ 1191) | ~~UNKNOWN~~ → **CONFIRMED (in-game)** | Multi-weakness damage | ✅ resolved — engine `weaknessFactor = 1 + 0.10 × #exploited`, count-driven and generic; regression tests added |
| U21 | ~~Fixed damage: through-chain vs post-chain~~ → **RESOLVED (behavior) 2026-09-03; FINAL-DMG MODIFIERS IMPLEMENTED 2026**: Fixed Damage is **post-chain with its own ceil** — Overburn = 10% of applier ATK: 1958 × 0.10 = 195.8 → observed **196**; unchanged by Burn immunity (weakness factor), the +20% No-Cover Damage Done (ordinary damage-buff factor), and (2026) ordinary **80% Damage Reduction** (Overburn 1949 → 195) including the boss's −80% 'damage taken' Stability passive (ordinary class — bypassed). **Final DMG Reduction DOES apply to fixed** (1931×0.10×0.40 = 77.24 → 78) and **Fixed DMG Buff DOES apply** (the validated +10% Fixed DMG Key, reclassified 2026 from the earlier "Final DMG Increase" label; 3471×0.10×1.10×0.40 = 152.724 → 153) — the engine multiplies the UNROUNDED fixed value by `(1 + Σ applier Fixed DMG Buffs) × (1 − Σ holder Final DMG Reduction)` before the ceil, at BOTH fixed sites (`applyStatusFixedDamage` + skill-sourced `rollHit`). Engine's old fixed branch (scaling fixed by ordinary additive/phase/weakness/reduction) was a **latent contradiction — corrected**. **Damage-dealt-scaling fixed damage — VALIDATED 2026 (Negative Charge):** uses the TRIGGERING attack's damage after DEF mitigation and crit, × the effect's % (30%), then ceil — `ceil(383 × 0.30) = 115` (non-crit), `ceil(666 × 0.30) = 200` (crit). **DEF-scaling fixed damage — VALIDATED 2026 (Winter's Wrath Lv.1):** uses the CASTING/SOURCE unit's DEF as the scaling stat, target DEF does not mitigate, rounds up — `ceil(source DEF × 0.50) = ceil(1489 × 0.50) = 745`. Only these established facts are claimed (not every modifier, conditional DEF source, or final-DMG interaction). **HP-scaling fixed damage — DEFERRED:** no currently existing character/effect uses HP-scaling fixed damage. **Fixed-damage skill multiplier — DEFERRED:** no current in-game mechanic uses it (not implemented) — with the Fixed DMG Buff bucket VALIDATED via the +10% key; source-named examples — Common Key - Source of Pride / Ultimate Brilliance — not individually in-game tested | CONFIRMED (in-game: ATK-derived value, weakness & ordinary damage-buff immunity, ordinary damage-reduction bypass incl. boss passive, own ceil, Fixed DMG Buff (+10% key) and Final DMG Reduction apply, damage-dealt scaling via Negative Charge, DEF-scaling via Winter's Wrath) / SOURCE-SUPPORTED (unvalidated): other source-named Fixed DMG Buff examples | Fixed Damage handling | ✅ resolved & implemented & CLOSED (2026) — fixed-DMG modifier chain data-driven (`fixed_dmg_modifier` `buff`/`reduction`, `fixedDmgMods`); `final-dmg-validation.test.ts`; `percentOfAtk` status model supported; damage-dealt + DEF-scaling documented (engine representations deferred until concrete effects are added to character data) |
| U22 | **Weapon Attachment system — structure + config + set model + stats CONFIRMED; 8 sets IMPLEMENTED + IN-GAME VALIDATED (incl. Phase Strike); 7 sets still INERT (2026)**: 4 slots (Muzzle / Sight / Foregrip / Underbarrel), each holding at most ONE user-configurable attachment configuration (empty slot = no stats); per-slot max selected stats Muzzle 4 / others 3; stats unique within an attachment; Muzzle is the only slot with Crit Damage (others use the shared non-Crit-Damage pool). Stat pools: Crit Rate, Attack, Attack Boost %, Health, Health Boost %, Defense, Defense Boost % (+ Crit Damage % on the Muzzle ONLY). **Set selection model (FINAL 2026): set selection is INDEPENDENT of the individual attachment stats — the user selects the loadout-level ACTIVE Attachment Set (`ScenarioTeamMember.activeAttachmentSet`); there is NO per-slot set identity and membership is NEVER inferred from selected stats.** **Exactly ONE active set per character — different sets cannot coexist or stack (RESOLVED 2026).** **15 confirmed sets recorded as DATA (`src/data/attachment-sets.ts`, `AttachmentSetDef`).** Damage terms use the EXISTING additive DMG% bucket (`additive_dealt`, NO separate bucket); non-damage terms use dedicated kinds and are NEVER converted to DMG%. **8 sets are now CONSUMED by the engine (`src/engine/attachment-sets.ts` → `dealDamageHit`'s `addDealt`) and IN-GAME VALIDATED:** Freeze/Burn/Hydro/Corrosion Boost (+20%, element gate — **only Burn Boost is hard-checked**; the rest share the mechanism), Physical Boost (+20%, phase-less), Close Assault (+12% unconditional / +24% when dealing melee damage → 36% for a melee dealer; **DEVELOPER-CONSIDERED VALIDATED — no in-game number**), Tactical Calculus (+25% — **RESOLVED by in-game tooltip**: Support Attacks / Interceptions / Counterattacks / out-of-turn passive attacks; engine MVP consumes the Support-Action path only — Interceptions/Counterattacks/passive attacks are NOT modeled and NOT claimed), **Phase Strike (+15% vs a target carrying a status whose `StatusDef.phase` is non-null — only `overburn` → Burn is populated/validated)**. Burn Boost directly validated (ATK 2898 · DEF 5000 · Burn weak ×1.10 · No-Cover 1.20 · Burn Boost 1.20 → 2457); Phase Strike directly validated (control 1529 without a Burn debuff; 2369 with `overburn` + DU2, crit); the elemental/physical family shares the same additive mechanism (**no further per-element tests planned**). **7 sets remain INERT** (their attachment-only gates are NOT engine-evaluable → `attachmentSetGatesMatch` returns false, never unconditional): Summon Boost (`physicalSummonOnBattlefield`), Double Strategy (`targetNearCover`), Phase Resonance (`phaseWeaknessCount` + Phase Boost undefined), Emergency Repair (`allyFullHeal`), Ally Support (`defenseSkill` + Area Defense II undefined), Shielded Recovery (`hasShield`), Ultimate Pursuit (Ultimate effect/stack infra). **Stat semantics RESOLVED in-game 2026:** flat vs % (QJ ATK 1966 → 2014 at +3% ATK Boost; 1966 → 1992 at +21 flat ATK — **QUALITATIVE, bucket direction only**; the rounded panel values do not arithmetically reproduce). **FULL-LOADOUT aggregation VALIDATED in-game 2026 (P1):** Qiongjiu V6 · Aff5 · test weapon +22 ATK · all 4 slots (Attack/Crit Rate/Attack Boost each; + Muzzle Crit Damage) → panel ATK **3182.72** (`1899 × 1.676 = 3182.724`; flat 1611 + 72×4 = 1899; ATK% 22% + 11.4%×4 = 67.6%), Crit Rate **80%**, Crit DMG **135%** — validates 4 coexisting slots, multi-stat slots, cross-slot aggregation, flat+% folding, Crit Rate/Crit DMG aggregation, and folding with ALL permanent systems; **HP / HP% / DEF / DEF% not individually observed but validated via the same already-validated stat-bucket/folding mechanism (no redundant per-stat screenshots required)**; **does NOT validate Burn Boost damage**. Pinned by `attachment-full-loadout-validation.test.ts`. **Max stat values RESOLVED 2026:** Attack +72 / Attack Boost (%) +11.4% / Health +162 / Health Boost (%) +11.4% / Defense +48 / Defense Boost (%) +11.4% / Crit Rate +15% / Crit Damage (%) +15%. **Configuration model RESOLVED 2026:** one config per slot, empty allowed, unique user-selected stats, per-slot maxima; MAX-STAT attachments only. **DATA REPRESENTATION RESOLVED 2026:** `ScenarioTeamMember` owns per-slot stat kinds AND `activeAttachmentSet`; fixed stat data as centralized constants; NO attachment catalog / Registry. **UNKNOWN (must NOT be invented):** the 7 complex sets' mechanics (Cover, Summon, shield, ally-heal, defense-skill, phase-count, Ultimate stacks); the referenced statuses **Phase Boost** / **Area Defense II** (not defined); the exact Ultimate-Pursuit stacking (**NO interaction with Calibration / Effect / Trait / Imprint** — orthogonal, damage-side vs panel stats); the future UI | **FIRST SET BATCH IMPLEMENTED + IN-GAME VALIDATED 2026; P1 FULL-LOADOUT STATS VALIDATED 2026** / complex sets INERT | Panel stats (ATK/HP/DEF/Crit Rate/Crit DMG) + set-bonus consumption (additive DMG% dealt) + non-damage effect hooks + UI | **8 sets consumed + validated; 7 sets inert (gates not evaluable); set coexistence RESOLVED (one active set per character, no stacking).** Blocked on: the complex sets' missing mechanics (each its own evidence step). **Remaining in-game backlog (the 8 consumed sets): NONE.** Burn Boost (direct 2457) + Phase Strike (control/test) are directly validated; Tactical Calculus is tooltip-resolved; Close Assault + the element boosts are **developer-considered validated** via the same shared additive-DMG% bucket (**no in-game number; no further tests planned**). **No HP/HP%/DEF/DEF% screenshots required** — the folding/aggregation mechanism is validated (P1) |

---

## 5. In-game test plan (blocking values that cannot be verified online)

Procedure sketches — all trivially runnable on a stationary target (existing training modes or a low-HP enemy) at known stats. Record values back into config/data, not code constants.

1. **Dummy DEF** — ✅ **current boss DEF CONFIRMED in-game: 5,001** (displayed stat; recorded as target data — `boss-def-validation.test.ts`). DEF is per-target data, never a universal constant: boss rotations change `dummy.defense`, not engine code. The solve-for-DEF procedure below remains available for OTHER targets: hit a dummy with a known-ATK doll using a known-multiplier basic attack, record non-crit, no-buff damage, solve for DEF: `DEF = ATK×(raw/final − 1)`. If DEF ≈ 0, keep default.
2. **Crit** — ✅ **RESOLVED (2026-09-03, U19)**: multiplier = Crit DMG stat, **linear** (×1.20 at 120% → Basic crit 635; ×1.235 at 123.5% → crit 654), applied before final ceil, never from the rounded normal hit (see §3.3 dataset and the 1956/1958/123.5% cases). ✅ **Crit-Rate cap + overflow conversion confirmed**: effective Crit Rate caps at 100% (universal); overflow converts to Crit DMG (confirmed ratio 1:1) **only** via a character-specific passive — engine `excess_crit_conversion`, all paths numerically locked (`crit-overflow-validation.test.ts`). Data-population follow-ups (not mechanic blockers): which characters carry such a passive, their exact parameters, and the CR-raising attachment sources.
3. **Stability per hit & +2 per weakness** — watch the hexagon bar with known stab-damage skills; confirm per-hit values and weakness bonus; confirm stability damage ignores DEF.
4. **Exposed state** — U4 window duration **RESOLVED (fixed 2-turn recovery: broken through N/N+1, restored at START of N+2)**; **U3 RESOLVED — no universal Exposed damage modifier exists**; nothing further to measure.
5. **Buff timers** — ✅ **RESOLVED 2026-09-03 (in-game, Attack Up II)**: a normal timed buff ticks DOWN at the **end of the recipient's own action** (U7), and reapplying the same tier **refreshes the duration without stacking** (U8). Optional follow-up: verify statuses whose text defines its own timing/stacking.
6. **Cooldowns** — ✅ **RESOLVED 2026-09-03**: CD-N waits N full turns after the cast turn (CD-1: cast T1 → unavailable T2 → available T3). Optional follow-up: confirm the same shape on a CD-2 skill.
7. **Confectance** — ✅ **RESOLVED 2026-09-03**: battle start 3 (no keys), max 6, +1 per damage event, Pressing the Momentum cost 3. Remainder: per-doll gains (other characters), kill bonus. (U10 generic Confectance damage bonus: **DISPROVEN 2026-09-03** — not modeled.)
8. **Glancing** — ✅ **REMOVED 2026-09-03** (U2 — beta artifact; see §3.6 tombstone) — not a live mechanic; no in-game test required.
9. **Auto-battle AI** — record the action sequence of a 4-doll team on auto vs a dummy; compare to `ultimate > active > basic`.
10. **Per-doll data capture** — for each doll added to the sim: full skill texts (multiplier, type, cd, cost, stab, statuses, keys) from the in-game panel.
11. **Apex Chassis — does the secondary effect scale with the enhancement level?** (VALIDATION PASS 2026, the ONE genuinely open Apex question.) The guide's per-type table gives secondary-effect values as ranges (`{5-6.5}%` weapon-type / `{7-12}%` weakness) over "Tier III and IV forms {Enhance 1 - Enhance 6}", while the only observation is Enhance 1 → 5% / 7%. **Smallest controlled test:** equip Firepower Reconstruction at **Enhance 1**, then at **Enhance 6**, and read the component's tooltip text at each level — if the displayed AR bonus reads **5% at Enhance 1 and 6.5% at Enhance 6** (and 7% → 12% for the weakness clause), the values DO scale and the current fixed-value model must change; if the text stays **5% / 7%** at both levels, the current model is correct. Reading the tooltip alone is sufficient — **no combat run needed** for this test. **Priority: HIGH** (it is the only reading of the guide that the engine currently resolves on an assumption).
12. **Apex Chassis — combat confirmation of the two secondary clauses (optional, distinct from the tooltip test).** The engine's *mechanism* (additive DMG% bucket, weapon-type gate, phase-or-ammo weakness gate) is already validated via shared engine evidence (attachment sets, Common Keys, the `Weak` formula) — so a full combat re-derivation is **NOT required**. If a direct observation is wanted anyway, the smallest useful one: an AR doll with Firepower Reconstruction equipped, attacking a **non-weak** target (expect the +5% weapon-type term only), then a **weak** target (expect +5% +7%), with all other DMG% sources disabled — the difference between the two brackets isolates the weakness term.

---

## 6. MVP numeric defaults (single source of truth for the engine)

Only CONFIRMED values become defaults; everything else is a **config key** (documented, off until in-game-verified).

| Setting | Default | Status |
|---|---|---|
| Defense term | `ATK/(1+DEF/ATK)` | CONFIRMED |
| Crit multiplier | `1 + Crit DMG stat` (×1.20 at 120%; linear — confirmed at 123.5% → ×1.235), applied to unrounded damage before final ceil | **CONFIRMED in-game** (U1 + U19 CDMG half, 2026-09-03). Engine derives `1 + critDmg` from attacker data (no hardcoded default); `configOverrides.critMultiplier` = test-only alternative |
| Element counter wheel | **DOES NOT EXIST** (corrected 2026) — weakness matching is the only element interaction; no ×1.2/×0.8 counter relationships; engine `phaseMultiplier` is always 1.0 | **REMOVED (erroneous premise)** |
| Weakness exploit | factor = `1 + 0.10 × #exploited weaknesses` (+2 stab each) — separate factor, outside the additive DMG bucket, **additive across weaknesses** | CONFIRMED (in-game: Burn ×1.10; Burn + Medium ammo ×1.20 — U20 2026-09-03) |
| Stability-cover reduction (60%, stable + in cover) | **Cover mechanic — DEFERRED**; MVP target always No Cover → term never fires (1.0) | — |
| Exposed window | fixed 2-turn broken-state window (U4); **no universal damage multiplier (U3)** | U4 ✅ / U3 ✅ |
| Stability recovery | **2-turn delay after break → restore to max** (`STABILITY_RECOVERY_DELAY = 2`); no universal Exposed damage multiplier (U3 resolved) | **CONFIRMED** (timing + restore-to-max, in-game 2026-09-03) |
| Buff duration units | big-rounds; **normal timed buffs tick at the recipient's action end** (`ownActionEnd`) — **self-applied buffs tick at the end of the SAME casting action (VALIDATED 2026)**; same-tier reapply refreshes duration without stacking | **CONFIRMED** (in-game 2026-09-03, Attack Up II — U7 + U8; Fortification Protocol 2026 for self-applied); tick point per-status overridable for testing |
| Bonus grouping | one additive bracket | CONFIRMED |
| Cooldown model | **wait N full turns after the cast turn** (CD-1: cast N → unavailable N+1 → available N+2) — engine default `cooldownModel = "nextOwnTurnEnd"` | **CONFIRMED** (in-game 2026-09-03, U11) |
| Confectance | start **3** / max **6** (CONFIRMED in-game); event gains per skill text (+1/damage for Qiongjiu); cost after cast (ult cost 3); **no generic damage bonus (U10 DISPROVEN)** — effects only via explicit data | U9 ✅ / U10 ✅ |
| Actions | 1 main action/round; basic ⊻ skill; support attacks free | CONFIRMED |
| APL | ultimate > active > basic (model assumption, configurable) | U12 |
| Dummy | `DEF 0, HP 1e9, stability 0, no cover, no weak, neutral phase` | config |
| Panel stats | `(Σ small) × (1 + Σ pct)` | CONFIRMED |

## 7. Terminology annex (CN → EN)

| CN | EN (community-localized; verify in client before fixing strings) |
|---|---|
| 普攻 / 基本攻击 | Basic Attack |
| 主动技能 | Active Skill |
| 致胜技能 / 大招 | Ultimate |
| 被动 | Passive |
| 固键 | Key (fixed 专属 / common 共通 / expansion 扩展 / affinity 好感) |
| 导染 (指数) | Confectance Index |
| 稳态 / 稳定性 | Stability / Steadiness |
| 稳态崩溃 / 破稳 | Stability Collapse / Exposed |
| 弱点 | Weakness |
| 属性克制 | ~~Phase countering~~ — **REMOVED (erroneous premise, corrected 2026): GFL2 has no elemental counter wheel; weakness matching is the only element interaction** |
| 支援攻击 | Action Support |
| 额外行动 | Extra Action |
| 擦伤 | Glancing — *(removed beta-era term — see §3.6 / U2 tombstone)* |
| 大回合 | Big round (player phase + enemy phase) |