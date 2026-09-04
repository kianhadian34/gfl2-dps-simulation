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

Confidence levels: **CONFIRMED** (primary/official source, or independently reproduced in-game) · **PROBABLE** (one reliable secondary source, or strong corroboration) · **UNCERTAIN** (conflicting or ambiguous evidence) · **UNKNOWN** (not found — nothing invented).

---

## 1. Executive summary

What we know with high confidence, in one paragraph:

1. **Damage pipeline** — `final = ceil( base × defense_ratio × (1 + Σ additive bonuses) × phase × weakness × reductions × crit )`, where `defense_ratio = ATK/(1+DEF/ATK)`, all damage bonuses (self buffs, target vulnerability) are **additive in one bracket** (**no generic Confectance damage bonus — U10 disproven 2026-09-03**), phase countering is ×1.2/×0.8, each exploited weakness is +10% with the factor **additive across weaknesses: `1 + 0.10 × #exploited`** (Burn ×1.10; Burn + AR ammo ×1.20 — U20 confirmed in-game 2026-09-03, see §3.5), and the result is ceiling-rounded. **Crit multiplier = the attacker's Crit DMG stat** (e.g. ×1.20 at 120%), applied to the *unrounded* damage before the final ceiling round (CONFIRMED in-game 2026-09-03 — see §3.3). Reproduced against real in-game numbers (Reddit test: `1213/(1+194/1213) × 1 × 1.1 = 1150.4 → 1151` in game).
2. **Stability (稳态) is a fully separate resource** from HP: per-hit fixed stability damage (independent of ATK/DEF/crit), break at 0 → "Exposed" state with a damage-taken window; **recovery timing CONFIRMED in-game (2026-09-03): stability is restored exactly 2 turns after the break (break Turn N → restored Turn N+2, back to max)** — see §3.7.
3. **There are no ACC/EVA stats in GFL2.** Against a stationary, uncovered dummy, attacks always hit; there is no miss mechanic and no "Glancing" (擦伤) mechanic in the live formula — a beta-era 擦伤 claim was removed (see §3.6 / U2 tombstone).
4. **Kit structure is fixed data**: 1 basic attack + 2 actives + 1 ultimate + 1 passive, all with explicit %-of-ATK multipliers. Cooldowns are small integers (0/1/2…). Confectance (导染) is an event-driven resource (e.g. Qiongjiu gains **+1 per damage event**, ultimate costs **3**), **not** a `damage × m` formula.
5. **Keys (固键)** are 4 tables (fixed/common/expansion/affinity keys), not a strict "3-branch" model.
6. **Default 1 main action per actor per turn**; basic attack vs skill is an exclusive choice; extra hits come from support/extra actions that do not consume the main action.
7. **Recommended dummy defaults**: no official dummy stats exist → make them **configurable**; recommended defaults `DEF 0, stability 0, no cover, no weaknesses, no phase` (pure `ceil(ATK × multiplier × bonuses × crit)` baseline).
8. **Scope rule (updated)**: the MVP target is **always No Cover**; **Stability + Exposed are mandatory MVP mechanics**; **Cover is explicitly deferred** — cover damage reductions (35/30/25/20% by cover type) and the stability-cover 60% reduction are recorded for later use but are **not** part of the MVP, so no cover-dependent term ever fires.
9. **Fixed Damage (U21)** — an absolute component computed from the caster's stats (e.g., **Overburn = 10% of the effect applier's ATK**), added **after** the normal multiplicative chain with its **own ceiling**; never scaled by damage buffs, weakness, phase, reductions, DEF, or crit. CONFIRMED in-game: Overburn at 1958 ATK → 195.8 → **196**, unchanged by Burn immunity and by Qiongjiu's +20% No-Cover bonus (see §3.1, §4 U21).
8. **English wikis (Prydwen, Fandom, Game8) are currently unusable** — Prydwen has no GFL2 section (404), Fandom wiki does not exist. The reachable, citable sources are BWIKI (zh), IOPWiki, gfl2.help, DotGG, and game data dumps. See [Source map](#2-source-map).

---

## 2. Source map

| Source | What it provided | Reachability (2026-09-03) |
|---|---|---|
| `wiki.biligame.com/gf2/伤害算法` (BWIKI damage algorithm) | Formula structure, additive bonus rule, phase ×1.2/×0.8, crit ×1.5, panel formula, tested numbers | ✅ reachable |
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
phase     = 1.2 (counter) | 0.8 (countered) | 1.0 (neutral) # 属性克制
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

**Confidence** — CONFIRMED (reproduced against an exact in-game number). `DEF:ATK = 1:1` halves damage; `2:1` → 1/3. A beta-era "flat ATK − DEF" description exists on old mechanic pages but is contradicted by the live-server reproduction; treat it as legacy. Enemies in early chapters have DEF ≈ 190–194 (two samples); 60-level enemy DEF magnitudes are UNKNOWN ("thousands" is unrealistic; hundreds realistic).

**Implementation interpretation** — `mitigated = raw × finalATK/(finalATK + finalDEF)` counting post-buff/debuff defense. Dummy default `DEF = 0` (term degrades to 1.0) with full configurability.

**Unknowns** — live DEF tables for level-60 enemies/dummies; skills that subtract flat panel DEF (rare cases) — data-model them as DEF modifiers, not formula changes.

### 3.3 Critical hits

**Mechanic** — Crit rate source and crit damage multiplier.

**Source** — **In-game validation 2026-09-03 (Qiongjiu, Lv.60 V6)**; older references: `wiki.biligame.com/gf2/伤害算法` ("目前暴击伤害的修正为固定的1.5倍" — pre-validation text, superseded); character stat panels (base crit damage 120%); Reddit 1hgw4zn; IOPWiki GFL2_Combat.

**Confirmed in-game dataset** (dummy DEF 5000, no cover, no ammo weakness, Burn weakness only; Qiongjiu Basic is Physical → no weakness applies; no break; no buffs; CDMG 120%):

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
5. **Crit DMG scales linearly beyond 120% (U19 CDMG half — RESOLVED 2026-09-03)**: raising CDMG 120.0% → 123.5% changed the Basic crit 635 → 654, matching `ceil(pre × 1.235)` exactly — **multiplier = 1 + Crit DMG**, applied before the final ceiling. Crit-RATE sources/caps remain a separate open item (U19 remainder).

**Implementation interpretation** — `critMult = 1 + critDmg` (attacker's Crit DMG stat) applied inside the pipeline before `ceil`; the engine **derives it from character data** (`UnitState.critDmg`) — no hardcoded default remains. `configOverrides.critMultiplier` is retained **solely as a test-only alternative hypothesis**.

**Confirmed (2026-09-03, in-game passive text — U19 Crit-Rate half)** — Crit Rate has a **100% effective cap**; overflow above 100% is discarded **unless the attacking character's own passive converts it** (never a global rule). Confirmed passive wording: *"When dealing damage, if critical rate of this attack exceeds 100%, every 1% of overflow critical rate is converted to 1% critical damage."* — threshold 100%, ratio 1:1, no stated cap, applied to the attack's final Crit Rate. Engine implements it data-driven via PassiveEffect `excess_crit_conversion` (`threshold`/`ratio`/optional `cap`); converted Crit DMG feeds the same confirmed `1 + Crit DMG` multiplier.

**Unknowns (U19 remainder)** — which characters carry such a passive and their exact parameters (any ratio ≠ 1:1 or a conversion cap); how Crit Rate is raised past 100% (sources, e.g. attachments); numeric damage-level confirmation of the conversion (rule is **text-confirmed**, not yet damage-measured in-game); anti-crit mechanics (PvP — out of scope anyway). (CDMG linearity is CONFIRMED to the tested 123.5% — U19 CDMG half resolved.)

### 3.4 Phase countering (属性克制)

**Mechanic** — 6-element counter wheel: 物理/physical, 燃烧/burn, 电导/electric, 冷凝/ice, 酸蚀/acid, 浊刻/decay.

**Source** — `wiki.biligame.com/gf2/伤害算法` (tested table, e.g. 114 vs 95 → ×1.2, 76 vs 95 → ×0.8).

**Confidence** — CONFIRMED (tested data groups).

**Implementation interpretation** — phase attribute on attack and target; `counter → ×1.2`, `countered → ×0.8`, else 1.0. Phase is a **separate multiplicative factor from weakness exploit**. Dummy default: no phase (neutral).

**Unknowns** — a rumored newer "Resonance" phase extension (2026 news, unverified).

### 3.5 Weakness exploit (弱点)

**Mechanic** — Attacking a target's *exposed* weakness (weapon-type or phase weakness).

**Source** — `iopwiki.com/wiki/GFL2_Combat`; Reddit 1hgw4zn.

**Confidence** — CONFIRMED (multi-source): each exploited weakness → +10% damage **and** +2 stability damage, with the weakness factor **additive across exploited weaknesses: `1 + 0.10 × count`** (U20, in-game 2026-09-03). **Burn weakness ×1.10** and **Burn + Assault Rifle ammo ×1.20** confirmed in-game — see dataset below.

**Confirmed in-game dataset (2026-09-03, Burn weakness)** — Attacker: Qiongjiu Lv.60 V6, Retired OTs-14 R1 Lv.2, no keys, ATK **1958**, CDMG 120%, no damage buffs (no Damage Up II). Target: Drone – Blaze Master Lv.60, DEF **5000**, stability 65/65, **Burn weakness**, Unaffiliated/Mechanicals, **No Cover**. Attack: Common Rail Lv.2 (Burn, 150% ATK). Observed: non-crit **1091** (repeated 1091, 1091, 1091); crit **1310** (1091, 1310, 1091, 1091).

```
base  = 1958 × 1.50 × (1958/(1958+5000)) ≈ 826.48
bracket = 1 + 0.10 (passive no-cover) + 0.10 (V6) = 1.20        # V6 (椎体) bonus NOT yet in character data — passed explicitly in the regression
normal = ceil(826.48 × 1.20 × 1.10 [Burn weakness]) = 1091      # ×1.10 is a separate factor, outside the additive DMG bucket
crit   = ceil(826.48 × 1.20 × 1.10 × 1.20 [CDMG]) = 1310        # CDMG ×1.20 applied before the final ceil (re-confirms §3.3)
twoWk  = ceil(826.48 × 1.20 × 1.20 [Burn + Assault Rifle ammo]) = 1191   # U20: 1 + 0.10×2, additive (multiplicative 1.21 → 1201 ruled out)
```

Confirmations: (1) Burn weakness multiplier is **×1.10**; (2) folding the weakness into the additive bracket instead (`1.30`) yields `1075 ≠ 1091` — **weakness is NOT part of the additive +DMG bucket**; (3) independently re-confirms CDMG = ×1.20 applied before the final ceiling; (4) **no effect is attributed to Overburn** (it contributed nothing here); (5) the target had stability 65/65 and it did **not** modify damage on this No-Cover target (Stability never alters damage absent Cover — see §3.7); (6) **U20 — two weaknesses are ADDITIVE: Burn only → 1091, Burn + Assault Rifle ammo → 1191** (`factor = 1 + 0.10 × count`; multiplicative ×1.21 would give 1201 ≠ 1191, ruled out).

**Implementation interpretation** — `weaknessFactor = 1 + 0.10 × (#matched weaknesses)` (additive across weaknesses, a separate factor from the additive DMG bucket); `stabDamage += 2 per matched weakness`. A hit that drops stability to 0 is computed at the pre-break damage level (i.e. the break hit does not benefit from stability reduction — Cover-scope detail). Configurable per dummy.

**Unknowns** — partial-match (exploiting only some of a target's weaknesses) is implied by the count-based rule and implemented by counting matched weaknesses, but not separately in-game-tested; simultaneous phase+weakness interaction (independent factors) UNKNOWN until the phase wheel is populated.

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
- Break duration `breakRound = 2`: **UNCERTAIN** (CN beta value; re-check on live).
- **Stability-cover reduction** (60% when stability > 0 in cover): CONFIRMED as a rule, but it is a **Cover mechanic — explicitly DEFERRED**; it never applies in the MVP because the target is **always No Cover** (the term is 1.0).
- **Recovery timing — CONFIRMED in-game (2026-09-03)**: stability broken during turn N is **restored on turn N+2** (exactly 2 turns later), restored to max. Model as a **2-turn recovery delay**. The Exposed damage-% (U3) is **not** derived from this observation and remains unverified.

**MVP scope (updated)** — **Stability and Exposed are mandatory mechanics**: stability damage per hit, break at 0, the Exposed damage-taken window (duration U4, multiplier U3, both config), and recovery (U6, config). Cover-dependent parts of the stability system (the 60% cover reduction) are **deferred** with Cover.

**Boss-domain scope (U5)** — This simulator is a **No-Cover boss DPS simulator**; Cover is permanently out of scope. Two SEPARATE concepts must not be conflated:

- **A. Generic Cover/Stability damage reduction (general formula) — OUT OF SCOPE.** The 60% stability-cover reduction, cover-reduction interplay, and the break-hit cover nuances require Cover; the target is always No Cover so they never apply (the engine has no cover term). In-game evidence (Blaze Master at 65/65 Stability) shows **no universal** No-Cover Stability damage reduction.
- **B. Boss-specific Stability-dependent passive damage reduction — IN SCOPE and CONFIRMED/IMPLEMENTED (2026-09-03).** Confirmed in-game boss passive tooltip: *"When stability is greater than 0 points, damage taken is reduced by 80%."* → **incoming damage × 0.20 while Stability > 0**; at Stability = 0 the condition is inactive. The engine implements this generically and data-driven (no boss ID hardcoded):
  - **Data model:** `DummyConfig.passives` on the boss/target + passive effect `{ kind: "conditional_damage_modifier", scope: "taken", when: "target.stabilityAboveZero", mode: "multiplicative", value: 0.2 }` (additive mode also supported), folded into the target's incoming-damage reduction chain. Different bosses define their own values/conditions via data.
  - **Break transition:** the condition is evaluated on the target's **pre-hit** state, so the stability-breaking attack is still reduced while stability > 0 at evaluation time. The sources establish no special break-hit rule for passives — none is invented.
  - **Broken state:** Stability = 0 → condition false → no reduction, until the confirmed U6 2-turn recovery restores Stability (the reduction returns on recovery).
  - **Fixed Damage:** the passive does not reduce fixed components — consistent with U21 (fixed damage bypasses the normal-chain reduction factors). The fixed-vs-boss-passive interaction is not separately in-game-tested; documented per U21 behavior.
  - **Boss-tooltip secondary effects** (Deep Freeze application, preventing stability restoration during the break, restoring stability after 2 turns) are **outside generic U5 scope** and not implemented.
  - **U3 remains separate:** this passive establishes no generic Exposed/post-break damage multiplier.

**Implementation interpretation**

```
stab_damage = skill.stabDamage + (2 × #weaknesses exploited)
target.stability -= stab_damage
if target.stability <= 0 and not already exposed:
    apply Exposed buff for breakRound turns (config, default 2)
    → damage-taken multiplier on target (config, default ??? → must be tested)
recovery: 2-turn delay after break (STABILITY_RECOVERY_DELAY = 2, CONFIRMED U6) → stability restored to max + Exposed ends
```

(The former "stability reduction term becomes 0 while exposed" step is part of the **deferred Cover** mechanic — not modeled in the MVP.)

Attacker stability is irrelevant to the attacker's own damage output (CONFIRMED) → do not feed it into damage; only read the *target's* exposed flag.

**Unknowns** — exposed damage-% (U3) and live break duration (U4, beta 2); per-unit max stability and exact per-skill stability damage; whether stability damage continues against an already-exposed target; AoE/multi-segment stability splitting. (Recovery timing U6 is CONFIRMED; the confirmed test restored stability to max — general "partial restore" behavior is not implied.)

### 3.8 Stats and stat scaling

**Mechanic** — Panel attributes and the panel formula.

**Source** — BWIKI character pages (Qiongjiu 琼玖, Sharkry 夏克里, Suomi 索米, Lightning 闪电) and `/gf2/伤害算法`.

**Confidence** — Attribute list CONFIRMED; no ACC/EVA stats exist (CONFIRMED — site-wide index has none); panel formula CONFIRMED: `finalATK = (small ATK sources summed) × (1 + Σ big ATK% bonuses)` (same for DEF/HP%).

Attributes: ATK (攻击), HP (生命), DEF (防御), Stability Index (稳态指数), Crit Rate (暴击), Crit DMG (暴击伤害, panel base 120%), ATK%/HP%/DEF% (attack/life/defense %, "big stats"), Stability Damage Reduction % (稳态减伤), 行动力 movement (grid/round), 攻击范围 attack range (grids), weaknesses (弱点).

Level-60 base magnitudes (CONFIRMED, 2024 BWIKI data): Qiongjiu `ATK 119→1224, HP 233→2494, DEF 65→695, stability 9, crit 20%, cdmg 120%`; Suomi ATK 837 / HP 2298 / DEF 725. With weapon + helix, an endgame DPS panels ~2000–3200 ATK, ~700–1100 DEF, ~3000–6000 HP (reasonable projection, PROBABLE).

**Implementation interpretation** — store base stats + additive flat (small) sources + percentage (big) modifiers; compute panel at init once per sim: `flat × (1 + pct)`.

**Unknowns** — current live level cap (60 vs 70 on CN, 2025+); complete small-ATK source list per doll.

### 3.9 Weapons and calibration (校准/调校)

**Mechanic** — Weapon ATK adds (as a "small" stat) to the character panel; skill-effect calibration is separate.

**Source** — BWIKI `/gf2/武器`, Qiongjiu page (signature 金石奏).

**Confidence** — CONFIRMED: weapon value at proficiency N = `ceil(lvl1_value × coefficient / 1000)`, level-60 coefficient 18.4; calibration has 6 stages and improves the weapon's *skill effect*, not its white stats. Examples: 金石奏 53 → 369 ATK @60 (+15% ATK% sub-stat); standard blues ~200–260 ATK @60, elites ~350–450 (range PROBABLE).

**Implementation interpretation** — `weapon.atk` (small stat) + `weapon.subStats` (e.g. ATK% 15%) + `weapon.skillLevel` from calibration; feed into panel formula.

**Unknowns** — exact per-rarity ranges; per-stage calibration values (read in-game).

### 3.10 Buffs / debuffs / status effects

**Mechanic** — Generic effect system with durations in turns, tiered variants, stacking, tick timing.

**Source** — BWIKI pages for Lightning, Klukai, Litta, Lorelei; `/gf2/伤害算法`.

**Confidence** —
- Containers CONFIRMED: buffs (攻击提升I +10%, II +15%; 防御提升II +30%; 减伤 60% 1 turn; 受疗 +50%; Concealment 掩护 −2 stab dmg/layer, max 3; Extra/Bonus Action effects), debuffs (攻击降低I −10%; 防御降低I −20%, II −30%; 易伤I +10% dmg taken; Terror; Taunt; Lure; Stun; DoTs: 溢火 burn — caster's 10% ATK fixed dmg at action end, 强酸倾压 acid — 12% ATK per layer, +12%/layer, max 10, refresh on apply, un-dispellable).
- Durations in «X turns» and «X big rounds» exist (big round = player phase + enemy phase): CONFIRMED. DoT/end-of-action timings exist: CONFIRMED. **Which exact tick point decrements a duration (own turn start / round end) is UNKNOWN.**
- Same-tier reapplication behavior (refresh vs stack) UNKNOWN; stacking caps explicitly defined in skill text (e.g. max 3/8/10) CONFIRMED.
- All damage-side bonuses are additive (§3.1): CONFIRMED.
- "不可驱散" (un-dispellable) flag exists: CONFIRMED.
- Official control-type set: taunt/evasion/lure/stun: CONFIRMED (out of MVP scope, but note).

**Implementation interpretation** — generic `Status` records: `id, stacks, maxStacks, duration (big-rounds), tickAt (actionEnd|roundEnd|ownTurnStart), instanceKey (caster), purgeable, statMods[], dmgMods[], stabilityMods[], hooks[]`. DoT fixed damage uses caster ATK at cast time and does **not** crit or use DEF (fixed-damage branch). Duration model default for MVP: decrement on the owner's own action (per-own-turn cycle), configurable.

**Unknowns** — tick point; refresh-vs-stack for same-tier applies; full element-DoT definitions for electric/ice/decay (only burn & acid are textually documented).

### 3.11 Skills: kit structure, multipliers, cooldowns

**Mechanic** — Fixed kit: 1 basic attack + 2 active skills + 1 ultimate + 1 passive; every skill has an explicit % of ATK (or fixed damage); cooldowns are small integers.

**Source** — IOPWiki Qiongjiu; gfl2.help; DotGG Qiongjiu; BWIKI character pages.

**Confidence** — Kit structure CONFIRMED (three sources agree verbatim; Wikipedia battle-mechanics outline agrees). Multipliers CONFIRMED per skill (Qiongjiu: basic 80% phys + 2 stab; Common Rail 150% burn, cd 1; Guide to Victory 110% burn AoE, Overburn 2 turns, cd 1; support attack 90% + 2 stab). Cooldown values 0/1/2 CONFIRMED; **decrement timing CONFIRMED in-game (2026-09-03)**: a CD-N skill requires **N full turns to pass after its cast turn** — CD-1 cast Turn N → unavailable Turn N+1 → available Turn N+2 (NOT "available next turn").

**Implementation interpretation** — slot model `basicAttack, active1, active2, ultimate, passive`, each with `multiplier | fixedDamage, typeTag, cooldown, confectanceCost, stabDamage, range, aoe, appliedStatuses, hooks`. Cooldown model (CONFIRMED): cooldown = number of full turns to wait **after the cast turn**; engine default `cooldownModel = "nextOwnTurnEnd"` implements exactly this (cd+1 effective; countdown at end of the actor's own turns). The alternative "usable next turn" (`endOfOwnTurn`) remains selectable for testing only.

**Unknowns** — a real base-skill "Cooldown 3" example (research only surfaced 0/1/2; CD-2 keys exist but no base-skill CD-3 seen) — the N-full-turns shape is confirmed for CD-1 and expected to generalize; per-character kit variations (some dolls differ from the 1/2/1/1 shape).

### 3.12 Confectance (导染 / Confectance Index)

**Mechanic** — Pips above the HP bar; generated by events (damage, kills, skills — **per skill text**), spent on skills/ultimates; gains/costs settled after the event.

**Source** — IOPWiki Qiongjiu (`skill_cost: 3`; passive +1 Confectance per damage event); gfl2.help / DotGG (cost 3, fixed key +3 at battle start); BWIKI `/gf2/导染指数` (beta, 2021-07 一测; also claimed a damage bonus of 0% below 100, +5%/10 pts, cap +50% @200 — **obsolete; disproven in the current game, see Confidence/U10**); IOPWiki GFL2_Combat.

**Confidence** — Event-driven, per-skill-text generation CONFIRMED (a `damage × m` proportion is **rejected** by data). Cost values are per-skill (3; some ultimates consume ALL). **Max capacity and battle-start value CONFIRMED in-game (2026-09-03, Qiongjiu no keys): start 3, max 6**; Pressing the Momentum cost **3** (confirmed). **No passive Confectance damage bonus — DISPROVEN in-game (2026-09-03, U10)**: Qiongjiu's damage was unchanged across rising Confectance Index values over repeated attacks; the beta "+5% damage per 10 Confectance, up to +50%" claim came from a one-test-era BWIKI page and is **not** a current-game mechanic. Confectance is modeled purely as a **resource**; its combat effects come only from specific character/skill/passive mechanics that explicitly check, gain, or consume it.

**Implementation interpretation** — `confectance: int` on each unit; event hooks (`onDamageDealt`, `onKill`, `onSkillCast`, custom per skill) define gains; casting subtracts cost **after** the skill fully resolves. **No generic Confectance damage bonus is modeled** (U10 disproven); Confectance affects combat only through explicit data-driven gains, costs, and interactions.

**Unknowns** — per-doll gain tables (outside Qiongjiu's confirmed +1 per damage event), kill bonus. (U10 — generic Confectance damage bonus: **DISPROVEN**, not modeled.) (Cap 6 and battle-start 3 are CONFIRMED for Qiongjiu with no keys; engine defaults updated — overrides remain available for alternative testing.)

### 3.13 Keys (固键)

**Mechanic** — Four key tables: Fixed (专属, doll-specific, several equippable; Qiongjiu has 6, e.g. FK1 +3 Confectance at battle start, FK3 DEF Down II on support hit), Common (shared pool, stat + conditional effect, e.g. crit+5% / +7% dmg on others' turns), Expansion (1 per doll, playstyle-changing: support attack becomes burning +15% vs burning), Affinity (bond-5, three pure stat keys).

**Source** — IOPWiki Qiongjiu / Common_Keys; DotGG Qiongjiu.

**Confidence** — Taxonomy and examples CONFIRMED; the "3-branch select" model is PROBABLY not current; **max equippable fixed keys (screenshots suggest 3 slots) UNKNOWN**.

**Implementation interpretation** — `fixedKeys[]` (equipped set, each with stat terms + effect hooks), `commonKey`, `expansionKey` (skill modifier switch), `affinityKeys[]` (pure stat terms).

**Unknowns** — live slot count; helix unlock costs; version-evidence of any 3-branch structure.

### 3.14 Passives and out-of-turn attacks (支援/额外行动)

**Mechanic** — Action Support (support attack, e.g. Qiongjiu: ally single-target hit in range → 1 support attack 90% ATK + 2 stab, max 3/round, does **not** consume action or Confectance, **cannot be triggered by another support attack**), Emergency Support, Interception (before being hit), Counterattack (after being hit), Extra Action (a full extra action; some dolls).

**Source** — IOPWiki GFL2_Combat / Qiongjiu; gfl2.help; Gamerant (Tololo extra action).

**Confidence** — Categories and Qiongjiu-specific rules CONFIRMED; per-doll quotas/conditions PROBABLE; exact trigger-verification sequencing UNKNOWN.

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

**Implementation interpretation** — recommended defaults: `DEF 0, HP 1e9, stability 0, weaknesses [], phase neutral, cover none`. With `stability 0`, the stability-reduction term (§3.7) can never fire, so its unknown rule does not block correctness.

**Unknowns** — everything about the "real" in-game dummy → covered by the in-game test plan.

### 3.17 Out-of-scope confirmations

- Cover — **explicitly DEFERRED** (not modeled in the MVP; the target is always No Cover). Research-recorder values for later: cover damage reductions 35/30/25/20% by cover type, and the stability-cover 60% reduction (§3.7). High ground, flanking, movement: also not modeled (MVP).
- "Nixie / 交换机" skill: **no evidence any such skill type exists** in any reachable source — do not model it. If the user meant something specific, it needs clarification.
- No ACC/EVA, no miss vs the dummy (§3.8).
- Attacker stability never affects offense (§3.7).

---

## 4. Uncertainty register

Every mechanic that is still uncertain, with impact and resolution path. **None of these should be hardcoded as facts in the engine — all are config defaults pending the in-game test plan (§5).**

**Removed entry (tombstone, NOT an active uncertainty):** U2 — Glancing (擦伤): **REMOVED 2026-09-03**. Originated from 一测/first closed-beta BWIKI material ("擦伤" ⇒ final × 0.1). No current-game evidence; absent from the established live damage formula (GFL2 Damage Formula Translation, Reddit live reproduction, IOPWiki); never observed in any in-game validation; removed from the simulator rather than treated as an unresolved live mechanic. Historical detail preserved in §3.6. **No other U-IDs were renumbered.**

| # | Mechanic | Confidence | Sim impact | Resolution |
|---|---|---|---|---|
| U1 | ~~Crit multiplier: ×1.5 vs ×(1 + 20% panel)~~ → **RESOLVED 2026-09-03**: multiplier = Crit DMG stat (×1.20 at 120%), applied to unrounded damage before final ceil; the 1956/1958 ATK control test discriminates the ordering (see §3.3) | ~~UNCERTAIN~~ → **CONFIRMED (in-game)** | Was up to 33% skew | ✅ resolved by in-game test — engine default `critMultiplier` still 1.5 pending approved engine change (scenario override `configOverrides.critMultiplier` → use 1.2) |
| U3 | Exposed damage-% after stability break | UNKNOWN | Big skew on break turns | Stability test |
| U4 | Break duration (beta `breakRound=2`) | UNCERTAIN | Break window length | Stability test |
| U5 | Per-unit max stability & per-skill stab damage values; **boss-specific Stability-conditional passive damage reduction — CONFIRMED & IMPLEMENTED (2026-09-03, in-game boss tooltip: −80% taken while stability > 0 → ×0.20)** | values: CONFIRMED examples / UNKNOWN table; boss-passive mechanic **RESOLVED** (generic, data-driven) | Stability pacing + boss damage | boss-passive: implemented via `DummyConfig.passives` + conditional taken modifier (see §3.7, `boss-stability.test.ts`); per-unit values still from per-skill record / `PotRooms/GFL2_Data` |
| U6 | ~~Stability recovery timing~~ → **CONFIRMED 2026-09-03**: restored exactly 2 turns after the break (break Turn N → restored Turn N+2), restored to max | ~~UNKNOWN~~ → **CONFIRMED (timing)** | Was long-sim drift | ✅ resolved — engine models the 2-turn delay (`STABILITY_RECOVERY_DELAY = 2`); Exposed damage-% (U3) remains open |
| U7 | Buff duration tick point (own turn start vs round end) | UNKNOWN | Buff expiry timing | Buff timer test |
| U8 | Same-tier status reapply: refresh vs stack | UNKNOWN | Stack math | Reapply test |
| U9 | ~~Confectance cap & battle-start value~~ → **RESOLVED 2026-09-03**: battle start **3** (no keys), max **6**; +1 per Basic damage event; Pressing the Momentum cost **3** | ~~UNKNOWN~~ → **CONFIRMED (in-game, Qiongjiu no keys)** | Ultimate timing | ✅ resolved — engine defaults start 3 / max 6; gains & cost are data-driven; overrides (confectanceMax/Start) remain for alternative testing. U10 closed (generic Confectance damage bonus disproven — no multiplier) |
| U10 | ~~Confectance damage-bonus table (beta +5%/10pts, cap +50%)~~ → **NOT PRESENT / DISPROVEN 2026-09-03**: Qiongjiu's damage unchanged across rising Confectance over repeated attacks; the claim was beta-only (BWIKI `/gf2/导染指数`, 一测 era) and is removed. Confectance is a **resource** (MVP) — effects only via explicit character/skill/passive data | ~~UNCERTAIN (beta only)~~ → **DISPROVEN (current Qiongjiu/MVP)** | Was damage curve | ✅ closed — no generic multiplier exists or will be added; modeling as a pure resource |
| U11 | ~~Cooldown decrement timing (use-turn counted?)~~ → **CONFIRMED 2026-09-03**: CD-N waits N full turns after the cast turn — CD-1 cast T1 → unavailable T2 → available T3 (NOT "next turn") | ~~UNCERTAIN~~ → **CONFIRMED (in-game)** | Skill cadence | ✅ resolved — engine default `cooldownModel = "nextOwnTurnEnd"`; alternative `endOfOwnTurn` selectable for testing only |
| U12 | Auto-battle AI priority | UNKNOWN | Whole-sim fidelity | Auto-battle recording; default is a labeled model assumption |
| U13 | Live level cap & endgame stat magnitudes | UNKNOWN (2024 data) | Absolute numbers | In-game panel read |
| U14 | Enemy/dummy DEF magnitudes | UNKNOWN | Defense term scale | Dummy DEF test |
| U15 | Weakness partial-match & phase×weakness interaction | UNKNOWN/UNCERTAIN | Edge-case damage | Weakness test |
| U16 | Element DoTs (electric/ice/decay) full definitions | UNKNOWN | DoT modeling | Skill doc read (deferred — not required for first dolls) |
| U17 | "Resonance" phase extension (2026) | UNKNOWN | Future-proofing | Watch patch notes; not in MVP |
| U18 | "Nixie/交换机" term | UNKNOWN (no evidence) | — | Needs user clarification, not code |
| U19 | ~~CDMG linearity beyond 120% + Crit-Rate cap/overflow~~ → **CDMG half RESOLVED 2026-09-03** (linear: 120.0% → ×1.20 (crit 635), 123.5% → ×1.235 (crit 654×4); multiplier = 1 + Crit DMG, before final ceil); **Crit-Rate half CONFIRMED 2026-09-03 (passive text)**: effective CR caps at 100%; overflow is discarded unless a character passive converts it (1:1, data-driven `excess_crit_conversion`) | CDMG **CONFIRMED** (in-game) / CR cap + overflow **CONFIRMED** (passive text) / CR sources & per-character params UNKNOWN | Crit-damage scaling + crit frequency | ✅ CDMG: engine derives `1 + critDmg`. ✅ CR overflow: engine applies the 100% cap and converts overflow only via per-character passive data. Remainder: CR sources (attachments), non-1:1 ratio / cap characters, numeric damage confirmation |
| U20 | ~~Multi-weakness stacking (multiplicative vs additive)~~ → **RESOLVED 2026-09-03**: weakness factor is **additive across exploited weaknesses**: `1 + 0.10 × count` — 1 weakness ×1.10 (Burn → 1091); 2 weaknesses ×1.20 (Burn + Assault Rifle ammo → 1191); multiplicative ×1.21 ruled out (would give 1201 ≠ 1191) | ~~UNKNOWN~~ → **CONFIRMED (in-game)** | Multi-weakness damage | ✅ resolved — engine `weaknessFactor = 1 + 0.10 × #exploited`, count-driven and generic; regression tests added |
| U21 | ~~Fixed damage: through-chain vs post-chain~~ → **RESOLVED (behavior) 2026-09-03**: Fixed Damage is **post-chain with its own ceil** — Overburn = 10% of applier ATK: 1958 × 0.10 = 195.8 → observed **196**; unchanged by Burn immunity (weakness factor) and by the +20% No-Cover Damage Done (damage-buff factor). Engine's old fixed branch (scaling fixed by additive/phase/weakness/reduction) was a **latent contradiction — corrected**: `finalDamage = ceil(normalChain) + ceil(fixed)`; fixed component kept separate (ev.fixedDamage) | CONFIRMED (in-game: ATK-derived value, weakness & damage-buff immunity, own ceil) / SOURCE-SUPPORTED (untested in-game): DEF/crit/phase/reduction bypass | Fixed Damage handling | ✅ resolved (behavior) — engine bypasses all chain factors; `percentOfAtk` data model deferred (schema uses absolute `SkillDef.fixedDamage`); regression tests added |

---

## 5. In-game test plan (blocking values that cannot be verified online)

Procedure sketches — all trivially runnable on a stationary target (existing training modes or a low-HP enemy) at known stats. Record values back into config/data, not code constants.

1. **Dummy DEF** — hit a dummy with a known-ATK doll using a known-multiplier basic attack, record non-crit, no-buff damage, solve for DEF: `DEF = ATK×(raw/final − 1)`. If DEF ≈ 0, keep default.
2. **Crit** — ✅ **RESOLVED (2026-09-03)**: multiplier = Crit DMG stat, **linear** (×1.20 at 120% → Basic crit 635; ×1.235 at 123.5% → crit 654), applied before final ceil, never from the rounded normal hit (see §3.3 dataset and the 1956/1958/123.5% cases). ✅ **Crit-Rate cap + overflow conversion confirmed (passive text)**: effective CR caps at 100%; overflow converts 1:1 only via a character-specific passive. Remainder (U19): CR sources (attachments), any non-1:1 ratio/cap characters, and a numeric damage-level confirmation of the conversion.
3. **Stability per hit & +2 per weakness** — watch the hexagon bar with known stab-damage skills; confirm per-hit values and weakness bonus; confirm stability damage ignores DEF.
4. **Exposed state** — break stability, measure damage-taken % (U3 — still open). **Recovery timing already CONFIRMED (2026-09-03): 2-turn delay → restored to max**; watch whether the damage step-down matches that exactly.
5. **Buff timers** — apply ATK Up, observe expiry relative to caster's next turn vs round end; re-apply same tier → refresh or stack?
6. **Cooldowns** — ✅ **RESOLVED 2026-09-03**: CD-N waits N full turns after the cast turn (CD-1: cast T1 → unavailable T2 → available T3). Optional follow-up: confirm the same shape on a CD-2 skill.
7. **Confectance** — ✅ **RESOLVED 2026-09-03**: battle start 3 (no keys), max 6, +1 per damage event, Pressing the Momentum cost 3. Remainder: per-doll gains (other characters), kill bonus. (U10 generic Confectance damage bonus: **DISPROVEN 2026-09-03** — not modeled.)
8. **Glancing** — ✅ **REMOVED 2026-09-03** (U2 — beta artifact; see §3.6 tombstone) — not a live mechanic; no in-game test required.
9. **Auto-battle AI** — record the action sequence of a 4-doll team on auto vs a dummy; compare to `ultimate > active > basic`.
10. **Per-doll data capture** — for each doll added to the sim: full skill texts (multiplier, type, cd, cost, stab, statuses, keys) from the in-game panel.

---

## 6. MVP numeric defaults (single source of truth for the engine)

Only CONFIRMED values become defaults; everything else is a **config key** (documented, off until in-game-verified).

| Setting | Default | Status |
|---|---|---|
| Defense term | `ATK/(1+DEF/ATK)` | CONFIRMED |
| Crit multiplier | `1 + Crit DMG stat` (×1.20 at 120%; linear — confirmed at 123.5% → ×1.235), applied to unrounded damage before final ceil | **CONFIRMED in-game** (U1 + U19 CDMG half, 2026-09-03). Engine derives `1 + critDmg` from attacker data (no hardcoded default); `configOverrides.critMultiplier` = test-only alternative |
| Phase counter | `×1.2 / ×0.8 / 1.0` | CONFIRMED |
| Weakness exploit | factor = `1 + 0.10 × #exploited weaknesses` (+2 stab each) — separate factor, outside the additive DMG bucket, **additive across weaknesses** | CONFIRMED (in-game: Burn ×1.10; Burn + AR ammo ×1.20 — U20 2026-09-03) |
| Stability-cover reduction (60%, stable + in cover) | **Cover mechanic — DEFERRED**; MVP target always No Cover → term never fires (1.0) | — |
| Exposed window | `2` rounds, dmg-% `UNKNOWN → config` | U3/U4 |
| Stability recovery | **2-turn delay after break → restore to max** (`STABILITY_RECOVERY_DELAY = 2`); Exposed damage-% from config (U3 UNVERIFIED) | **CONFIRMED** (timing + restore-to-max, in-game 2026-09-03) |
| Buff duration units | big-rounds; tick at own action (config) | U7 |
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
| 属性克制 | Phase countering |
| 支援攻击 | Action Support |
| 额外行动 | Extra Action |
| 擦伤 | Glancing — *(removed beta-era term — see §3.6 / U2 tombstone)* |
| 大回合 | Big round (player phase + enemy phase) |