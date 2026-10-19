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
| **V1** | **Vector's panel + damage multipliers** (at V6 — §3) | Confirms her registration is arithmetically right, and gives the baseline every later Vector slice is measured against | Standard fixture; no tiles |
| **V2** | **Vector's weapon data** — the blue SMG (ATK +25, +1% dmg) | Makes her REAL build expressible; today `weapons.ts` holds one AR and no SMG, so her actual gear cannot enter the engine at all (§3.2, §3.4) | Its name + ATK Lv.1/Lv.60; a decision on the innate +1% |
| **V3** | **Vector's passive — Confectance behaviour** (clauses 4 & 5) | Her strongest non-tile mechanic; clause 5's 2 extra slots is user-provided level-1 evidence that has **never been observed**, and it silently changes her numbers (§3.1 Trap 3) | Confectance at/over max; V5 for clause 5. **ONLY THE +10% TIER IS REACHABLE — see §3.5** |
| **V4** | **Tile generation + duration** | Almost all of Vector's remaining kit AND every other tile slice depends on tiles behaving as modelled | A tile-generating effect (blocked — see §4) |
| **V5** | **Tile debuffs on a unit standing on one** (trigger (b)) | The applied-status sets; the Burn tile's real effect | V4 (tiles must exist) |
| **V6** | **Tile upgrade + fusion** | T5's whole rule set (the 8 fusible pairs, level preservation, replacement-vs-protection) | V4 |
| **V7** | **Tile weakness application** (T10) | Whether *"applies Burn weakness"* is real, and at what magnitude | V4 |
| **V8** | **The V4 applied semantics** — one clause at a time where observable (§4 lists which) | §3.24–§3.34's `[GAME]`-stated semantics | Varies; some are unobservable (§4) |
| **V9** | **Record the UNOBSERVABLE set** | Stops "Not Tested" being read as "testable later" | Nothing — a documentation slice |

**Notes on ordering.** V1–V3 first because they need no tiles and confirm Vector is correctly
registered — everything about her kit is measured against those numbers. **V2 was added when the real
build was supplied:** her gear cannot be expressed today, and no tile work can be validated against a
"real build" that the engine cannot load. V4 gates V5–V7. V8 is deliberately late because it is the
most heterogeneous. V9 is a documentation slice, not an observation.

**A note on the numbering.** These are named `V1..V9`; the tiles doc's `T1..T12` are a DIFFERENT
sequence (implementation slices). A slice id is only meaningful with its document.

---

## 3. Slice detail — V1: Vector's panel + damage multipliers

**Claim level:** per-number, not per-ability (checklist: *"record at the smallest meaningful claim
level"*).

**Why first:** her base stats are `Validated`, but that is a *stat* read. Whether the engine turns
them into the right **panel** and the right **damage** is `Not Tested`. Everything else about her kit
is measured against these numbers, so an error here would contaminate every later Vector slice.

### 3.0 STEP 1 — the PANEL (observe this first)

**Panel formula (one path, `Mathematically Proven`):**
`Final Stat = ceil((Initial + Σflat) × (1 + Σstat%))` — every flat source is summed **before** the
percentage multiply.

#### OBSERVED 2026 — the in-game panel, and what it proved

The owner supplied the live **View Details** panel for Vector (V6 · Affinity Lv5 · max Remolder ·
dispatch · Neural Helix · a blue SMG). Base Attributes tab:

| Stat | Basic Doll | Weapon | Neural Helix | Affinity | Dispatch Room | Remolding Pattern | **In-game total** |
|---|---|---|---|---|---|---|---|
| **Attack** | 748.00 | 25.00 | 432.73 | 106.00 | 183.00 | 224.00 | **1718.73** |
| **Defense** | 569.00 | — | 252.40 | 116.00 | 240.00 | 245.00 | **1422.40** |
| **Health** | 1819.00 | — | 945.79 | 280.00 | 618.00 | 651.00 | **4313.79** |

**Result 1 — the game's panel is a PURE ADDITIVE SUM with NO percentage.** Every total equals the sum
of its listed parts **to the cent** (`1718.73`, `1422.40`, `4313.79`); `total / Σparts = 1.000000`
exactly for all three. So the in-game Attack/Health/Defense shown in View Details is
**`Σ(parts)` with no multiplier applied at the panel level**. `Mathematically Proven`.

**Result 2 — the engine's flat folding is CONFIRMED, and the entire gap was three MISSING DATA
SOURCES.** The engine (base + dispatch + Remolder flat only) gave ATK 1155 · HP 3088 · DEF 1054. Each
gap is **exactly** the missing sources, to the cent:

| Stat | Engine | In-game | Gap | Helix + Affinity (+ weapon) | Verdict |
|---|---|---|---|---|---|
| ATK | 1155 | 1718.73 | **563.73** | 432.73 + 106 + 25 = **563.73** | exact |
| DEF | 1054 | 1422.40 | **368.40** | 252.40 + 116 = **368.40** | exact |
| HP | 3088 | 4313.79 | **1225.79** | 945.79 + 280 = **1225.79** | exact |

**This is not a formula error — it is data Vector's `CharacterDef` does not carry.** She has
`neuralHelixStats` **undefined** and no `affinityFlatStats`, plus the unknown weapon. Supplying those
three and re-running the ONE panel path reproduces the game:
`ceil(1718.73) = 1719` vs in-game 1718.73 (the game displays 2dp, the engine keeps its integer
convention — exactly Qiongjiu's established `3183` vs `3182.72`).

**Result 3 — her `Fighting Spirit` +1.8% is NOT in the in-game panel.** The plain sum matches exactly,
with no 1.8% applied. The engine's model folds Remolder `selfPct` during real play, so once her data is
entered the engine would produce `ceil(1718.73 × 1.018) = 1750`. **Documented discrepancy** — see the
open question in §3.0.1; **not silently resolved**.

**Result 4 — side effects on the existing model:**
- ~~**`NEURAL_HELIX_GLOBAL_PCT` (0.12) must NOT apply to Vector.**~~ **WITHDRAWN — see §3.0.1: the 12%
  DOES apply (`Defense Boost = 12.00%` exactly).** The mistake was comparing the engine's *effective*
  panel against the game's *flat-only* Attack display; the game keeps the two on separate tabs.
- **Defense has no `weaponFlat` field** in the damage/panel pipeline (the game lists no weapon line for
  DEF or Health, consistent with a weapon contributing ATK only), so the ATK-only weapon assumption
  holds.
- **The game displays 2-DECIMAL stat values**, preserving fractional flat contributions
  (`432.73`/`252.40`/`945.79`). The engine stores and consumes **integers** via `ceil`. Damage impact is
  **nil** (ATK 1719 vs 1718.73 → identical 352 damage at DEF 5000), so the integer convention is
  **adequate and retained** — but the exact hidden rounding is confirmed to be *display-only*, not a
  real game rounding step at this stage.

**Result 5 — the panel is a PERMANENT-SOURCE-ONLY view.** It shows Neural Helix, Affinity, Dispatch,
Remolding and Weapon, but **no Common Keys, Attachments, Apex Chassis, Cooking Stats or in-combat
buffs** — because the owner's build does not carry those ≥4★ systems yet. Important consequence: this
read confirms the flat-plus-bond arithmetic and **nothing about the percentage buckets**, which remain
validated only through Qiongjiu's attachment observation.

#### 3.0.1 The percentages — RESOLVED (and an earlier error of mine withdrawn)

**RESOLVED 2026 by the Special Attributes tab — and it CORRECTS an error I made above.** The earlier
reading treated the Basic Attributes tab in isolation and concluded "the game applies no percentage, so
the 12% must not apply to Vector". **That was wrong.** The **Special Attributes** tab shows the
percentages as their own stats:

| Stat | Value |
|---|---|
| Stability | **10.00** |
| Crit Rate | **20.00%** |
| Critical Damage | **120.00%** |
| **Attack Boost** | **17.00%** |
| **Defense Boost** | **12.00%** |
| **Health Boost** | **17.00%** |
| Mobility | **6** |
| **Stability Damage Reduction** | **60.00%** |

**`Defense Boost = 12%` is exactly `NEURAL_HELIX_GLOBAL_PCT`** — so the universal 12% **DOES** apply to
Vector. The earlier "+206 ATK error" claim is **withdrawn**.

**Why I got it wrong (recorded as a trap, because it will recur).** The engine's `panel ATK` is an
**EFFECTIVE** value — `Σflat × (1 + Σpct)`. The game's Basic Attributes `Attack` is **FLAT ONLY**; the
percentage appears as the separate `Attack Boost` stat. Comparing the engine's effective panel against
the game's flat-only Attack is an apples-to-oranges error. **Correct comparison:**
`engine panel ATK` ↔ `game Attack × (1 + Attack Boost)`, or flat-to-flat.

**Base stats CONFIRMED** by this tab, matching `src/data/vector.ts` exactly: Stability **10**,
Crit Rate **20%**, Crit DMG **120%**, Mobility **6**.

#### 3.0.2 The remaining ambiguity — two hypotheses, both arithmetically identical

**RESOLVED 2026 — there was never an ambiguity; I created it by misreading a word.** The owner
confirmed that **"max level remolding" means Remolder LEVEL 60** (the flat stat, already correct in her
record as `remolderFlat` 224 / 651 / 245 — matching the panel's own "Remolding Pattern" line). It does
**NOT** mean the Remolder flower/buff picks: **she has no `Fighting Spirit` at all.**

Therefore hypothesis **(a)** is the only one:

**`neuralHelixStats.atkPct = 0.05` / `hpPct = 0.05`** — Vector's own Helix percentage.
`Attack Boost 17% = 12% universal + 5% Helix`. Nothing else can supply the 5%.

The "set Fighting Spirit to Lv1 and re-read" test I proposed is **MOOT and withdrawn** — there is no
Fighting Spirit level to change. (Had I asked what "max level remolding" meant instead of assuming it
meant "all buffs at max", this would have been settled immediately.)

**The lesson, kept because it is a recurring failure mode:** "max level remolding" names the **Lv.60 flat
stat**; the flower/buff picks are a *separate* system with their own levels. Do not conflate them.
Either answer is fine; guessing is not, because it changes the value written into `neuralHelixStats`
and therefore her damage.

**A third possibility is EXCLUDED:** if FS were inside the 17% *and* also folded again by the engine's
real-play model, ATK% would be 18.8% → panel **2042** (over by 31). The game shows 17.0%, so
**double-counting is ruled out** — FS may contribute at most once.

#### 3.0.3 A stat the engine does NOT model: Stability Damage Reduction

The game shows **Stability Damage Reduction 60.00%** — the 稳态减伤 attribute listed in
`docs/research.md` §3.8. **The engine has no field for it** (only per-skill `stabDamage` and a
`stability_damage_bonus` status kind). It is **inert in the MVP** (dolls are never attacked; the dummy
is the only target), so this is a **recorded gap, not a live bug** — added to the unobservable set in
§4. Whether 60% is universal or Vector's own value is **`Not Tested`** (one character observed).

**Engine panel as currently modelled (NO helix, NO affinity, NO weapon):**

| Stat | Initial | Dispatch | Remolder flat | Σ flat | Σ % | **Engine panel** |
|---|---|---|---|---|---|---|
| **ATK** | 748 | 183 | 224 | 407 | +1.8% | **1176** |
| **HP** | 1819 | 618 | 651 | 1269 | +1.8% | **3144** |
| **DEF** | 569 | 240 | 245 | 485 | +0.0% | **1054** |

Derivations: `ceil((748+407) × 1.018) = 1176` · `ceil((1819+1269) × 1.018) = 3144` ·
`ceil((569+485) × 1.000) = 1054`.

**Note the trap in those numbers:** the engine's 1176 is *effective*, while the game's own Basic
Attributes Attack for this same reduced configuration would display **1155** (flat) with a separate
`Attack Boost 1.80%`. Do not compare them directly.

The **+1.8%** is `Fighting Spirit` (support Remolder) at **Lv6** = +1.8% ATK **and** +1.8% max HP —
one buff, both stats, arriving via `remolderPlan.selfPct` (folded separately from the flat bucket).
**Fortification V6 does not touch the panel at all** — it only raises ability levels.

**The weapon is now MEASURED, not hypothesised:** the in-game panel lists **Weapon 25.00 ATK** — the
`+25 flat attack` is the weapon's ATK contribution, and it carries **no HP/DEF lines**. `W = 25`,
giving panel ATK `ceil((1155 + 25) × 1.018) = 1202` under the engine's current model, or **1200**
(=`1155 + 25` + helix/affinity) under the observed additive model. Both are far below the observed
**1718.73** without Neural Helix + Affinity — which is exactly Result 2.

**What to report next:** the **Special Attributes** tab (Crit Rate / Crit DMG / Stability and any
ATK%/DMG% rows) — that is the one part of the panel this read does not cover, and it would settle
open question 1.

### 3.1 Your real configuration (the configuration to observe)
V6 Vector · Affinity Lv.5 · a blue SMG, ATK +25, +1% damage.

**Two facts change the plan, and one changes it for the better.**

**Fact 1 — the primitive test is DEF-free and weapon-free.** The engine's fidelity is best tested by
the **ratio between two of her own skills on the same target**, because enemy DEF cancels:

```
damage ∝ ATK²/(ATK + DEF) × multiplier
ratio(skill1 : basic) = multiplier(skill1) / multiplier(basic)     ← ATK and DEF both cancel
```

| Run | s1/basic (engine) | s2/basic (engine) | Theory |
|---|---|---|---|
| DEF 0 | 1.8731 | 1.6244 | 1.8750 / 1.6250 |
| DEF 5000 | 1.8846 | 1.6282 | 1.8750 / 1.6250 |
| DEF 50000 | 1.8889 | 1.6667 | 1.8750 / 1.6250 |

Converging on theory as rounding noise vanishes. **So the first observation needs NO weapon, NO
Remolder, NO dispatch, and needs the dummy DEF only roughly** — it isolates her multiplier table and
the fortification mapping, which are the load-bearing claims.

**Fact 2 — your exact build is NOT expressible yet.** Three parts of it cannot enter the engine
today, and must not be approximated:

| Your item | Status | Why |
|---|---|---|
| **Blue SMG, ATK +25** | **Cannot enter** | `weapons.ts` contains exactly **ONE** weapon (Golden Melody, an AR, Qiongjiu's). No SMG weapon definition exists. **No data entry is possible without the weapon's `atkLvl1`/`atkLvl60` numbers** |
| **"+1% damage"** | **Cannot enter** | `WeaponDef` models damage as a **Calibration Effect** (`calibrations[n].damageDealt`), applied only when `calibrationLevel` is set. There is **no innate weapon DMG% field** — but your +1% is a base property, not a calibration. Adding a field is an engine-vocabulary decision, not a data entry (see §3.4) |
| **"25 flat attack"** | **Ambiguous** | If it is the weapon's *ATK stat* (proficiency curve), it needs the two ATK numbers. Flat-ATK *sub-stats* do not exist — weapon sub-stats are **percentage-only** (`pctAtk`/`pctHp`/`pctDef`) |
| **Affinity Lv.5** | **No-op, correctly** | `AffinityLevelStats` for Lv5 is **"none"** (Lv9 = ATK/HP/DEF +5%), and Vector declares **no** `affinityLevelStats` at all. So Affinity 5 adds nothing — for her, *at any* level, which is itself worth checking against her in-game panel |
| **V6 fortification** | **Modelable** | Via `configOverrides.fortificationLevel: 6` — **not** on the team member (see the trap below) |

**Engine predicts at V6, no weapon / dispatch / Remolder, DEF 5000, no weaknesses, No Cover:**

`base = ATK²/(ATK + DEF) = 748²/5748 = 97.3389…`

| Action | Multiplier (V6) | Predicted | Derivation |
|---|---|---|---|
| Basic (Depressive Mentality) | 0.80 | **78** | `ceil(97.3389 × 0.80)` |
| Skill 1 (Dead End Meltdown) | **1.50** | **147** | `ceil(97.3389 × 1.50)` — V3 raised it 1.20 → 1.50 |
| Skill 2 (Portent of Doom) | **1.30** | **127** | `ceil(97.3389 × 1.30)` — V4 raised it 1.00 → 1.30 |

Ratios to check: **s1/basic ≈ 1.875**, **s2/basic ≈ 1.625**.

**TRAP 1 — CRIT (hit while computing these predictions).** Seed 1 showed Skill 1 at **141**, not 117:
not an engine error but a **crit** (`ceil(117.1 × 1.20) = 141`). A casual comparison would have
chased a nonexistent ~20% bug. The fixture is pinned to **`seed: 2`** (crit-free). Record whether each
observed hit crit.

**TRAP 2 — `fortificationLevel` is a `configOverrides` field, NOT a team-member field (hit while
computing these predictions).** Passing it in the team member is **silently ignored** — the first V6
probe returned exactly the V0 numbers (78/117/98) and looked like "fortification does nothing". The
correct placement is:

```json
"configOverrides": { "fortificationLevel": 6 }
```

Any validation scenario whose numbers come out identical to baseline should be **suspected of an
ignored field** before an engine bug is assumed.

**TRAP 3 — her passive fires, and it is easy to trigger by accident.** Perception Block at **L3**
(V5 grant) consumes Confectance at max for a round-scoped **+10% ATK**, or **+30%** once the two extra
V5 slots are filled. Confirmed in the engine: equipping **FK2** (+3 Confectance at battle start)
flipped Basic from **78 → 94** — the passive firing. **So the observation must state whether her
Confectance was at max, and whether FK2 was equipped.** Otherwise an honest observer reports 94 and
the comparison looks like a 20% engine error.

**What upgrades if it agrees:** Vector's Basic / Skill 1 / Skill 2 multipliers **at V6**, and the
fortification mapping's arithmetic — each recorded as one claim with the cited observation.
**What stays `Not Tested` regardless:** every clause missing from her kit (the `deferredNote`s) — those
are absent by design, not unvalidated.

### 3.2 The immediate ask (unblocks Fact 2)

**Please send three things and V1 becomes fully expressible as your real build:**

1. The blue SMG's **name**, plus **ATK at Lv.1 and Lv.60** (or its displayed ATK at proficiency 60).
2. Which stat the **"25 flat attack"** is — its base ATK, a sub-stat, or an attachment/calibration roll.
3. Whether **"+1% damage"** is an innate weapon property or a calibration roll. If innate, it needs a
   new data field (an engine-vocabulary decision, not something I will invent as a calibration).

**Cheaper alternative, if reading those is a nuisance:** just report her in-game **panel ATK** and her
**Basic-attack damage** on a known dummy. That validates the ratio test and pins the ATK/DEF
relationship immediately, and the weapon's internals can follow later.

### 3.3 What this configuration does NOT test, even when it agrees

- **Anything weapon-related** — no SMG data exists, so neither the +25 nor the +1% is exercised.
- **Anything Affinity-related** — Lv5 is a genuine no-op, so agreement here does **not** validate her
  Affinity handling. Re-test at **Lv9** (+5% ATK/HP/DEF) to get a signal.
- **Remolder / dispatch** — deliberately absent from the derivation.
- **Anything tile-related** — V3+.

### 3.4 Open question raised by this build (do not resolve by assumption)

Your **innate +1% weapon damage** has no home in `WeaponDef`. Two honest options, and the choice is
yours because it is an engine-vocabulary decision:

- **(a)** Add an innate `damageDealt?: number` to `WeaponDef`, folded into the existing additive DMG%
  bucket (reuses the calibration path's bucket — no new formula).
- **(b)** Declare it a calibration-only property and leave innate rolls unmodelled, recorded as such.

I will not silently do either, and I will not model the +1% as a calibration it is not.

---

## 3.5 Slice detail — V3: Vector's passive, clause 4 (the at-max Confectance drain)

**Claim level:** the isolated clause, not the passive.

**Why this slice looks different than planned.** The slice list expected V3 to cover **clauses 4 and
5** (+10% / +20% / +30%). Investigation before writing the setup found clause 5 **unreachable by
construction**, so this slice is deliberately the **+10% tier only**.

### 3.5.0 The reachability finding (verify this before expecting the upper tiers)

Her kit gains Confectance from her **skills** — Skill 1 and Skill 2 both state *"Vector gains 2 points
of Confectance Index"*. Those halves are **RECORDED-ONLY**: the engine's `resource_gain` is a
**PASSIVE** effect with `on: "onDamageDealt"` (`src/model/types.ts`, consumed at
`simulation.ts:774`), and **no skill-level Confectance grant exists**. Vector accordingly declares
**no `resource_gain` at all** (`src/data/vector.ts` — Qiongjiu's `+1 per damage event` lives in
*her* passive's text, not Vector's).

Consequences, all verified against the built engine:

1. Her gauge only ever holds its **battle-start** value: **3** by default, **6 (max)** with **FK2**.
2. Clause 4 therefore fires **once, on round 1**, and only with FK2 — after the drain the gauge sits
   at 0 for the rest of the run and there is no way to refill it.
3. Clause 5 counts points **above** max in the separate extra pool, which is filled only by gains
   that overflow past 6 — also impossible without those skill gains. So **+20% and +30% cannot be
   produced in the engine today**, and no in-game run can be compared against them.

**This is a recorded gap, not a modelling choice to work around.** Making clause 5 observable needs
skill-level Confectance gain implemented first; that is engine work, and this slice is evidence work.
Do not raise `confectanceMax` to fake a filled extra pool — U9 is settled and a guard test pins it.

### 3.5.1 Setup (identical to the VALIDATED V1 fixture — exactly one field differs)

Vector **V6** (`configOverrides.fortificationLevel: 6`) · **Affinity Lv5** · Neural Helix + Affinity
flats wired · weapon **Retired TMP** (`retired_tmp`, +25 ATK, innate +1%) · dispatch + Remolder flats ·
**no attachments, no Apex, no Cooking Stats** · **no Common Keys** · fixed keys **none / FK2 only**.

Rotation **`basic` only**, `turns: 1`, `seed: 2` (pins a **non-crit** hit — assert this, do not relax
it). Dummy: **DEF 5000**, stability 65, **no weaknesses**, phase `null`, No Cover.

Ready-to-run files (run both — the pair IS the slice):

```
examples/vector-v3-control.json     # no fixed keys      -> control
examples/vector-v3-clause4.json     # FK2 equipped       -> the clause
```

### 3.5.2 The claim, and why FK2 is the only lever

Clause 4 is *"at the start of the turn, if Confectance Index is at maximum, consumes all points … to
increase attack by 10% for the round"*. Given §3.5.0, **at maximum** on round 1 is reachable only via
FK2 (+3 at battle start → 3 + 3 = 6). Without FK2 the clause **must not fire**, and that is the
control: it protects the 356 already validated in V1 and rules out the clause firing unconditionally.

### 3.5.3 Engine prediction, with the derivation

Panel ATK **1718.73** at ATK% 17% (12% universal Neural Helix + 5% her own) ⇒ flat **1469**
(`1469 × 1.17 = 1718.73`). The engine's in-combat ATK% bucket is applied to the **final panel**:
`ceil(1469 × 1.17) = 1719`, then `ceil(1719 × 1.10) = 1891`.

| Run | ATK | Derivation | Predicted |
|---|---|---|---|
| **Control** (no keys) | 1719 | `ceil(1719²/6719 × 0.80 × 1.01)` | **356** *(already VALIDATED in V1 — this run re-confirms the control)* |
| **Clause 4** (FK2) | 1891 | `ceil(1891²/6891 × 0.80 × 1.01) = ceil(419.29)` | **420** |

The four outcomes the observation can produce, all rising out of the same 356 control — this is what
makes the slice discriminating rather than merely consistent:

| Model of *"increase attack by 10%"* | ATK | Damage |
|---|---|---|
| **In-combat ATK% on the final panel** (the engine) | 1891 | **420** |
| Merged into the permanent ATK% bucket (`1469 × 1.27`) | 1866 | 410 |
| +10% of **base** ATK only (`1719 + 75`) | 1794 | 383 |
| +10% as a **final damage** multiplier (`ceil(356 × 1.10)`) | 1719 | 392 |

**If the hit crits**, the clause-4 number becomes `ceil(419.29 × 1.20) = 504`. Record whether it
crit — seed 2 is chosen so it does not.

**What upgrades if it agrees:** clause 4's **+10% magnitude**, its **round-scoped window**, and the
**at-max precondition** each become one claim with the observation cited. Nothing about clause 5
upgrades — it was not exercised.

**What stays `Not Tested` even on agreement:** clause 5's +20%/+30% tiers (§3.5.0), her skill-sourced
Confectance gain, clauses 2 and 3, and every other recorded-only clause in `docs/dolls/vector.md` §11.

### 3.5.4 The one thing to watch (a real trap in this slice)

**Do not report the 420 as a +10% damage increase.** It is +10% **ATK**, which lifts damage by
**18%** (420/356) because the defense term moves with it. An observer expecting "+10% damage" would
read 420 as an error; it is the prediction.

### 3.5.5 OBSERVED 2026 — and it AGREED on both runs

The owner ran both and reported: **356 without FK2**, **420 with FK2**. Both match the prediction
exactly, and the control re-confirms V1.

**What that upgrades to `Validated`:**

| Claim | Evidence |
|---|---|
| Clause 4's magnitude is **+10% ATK** | 420 — the in-combat-ATK%-on-final-panel model. The three rejected readings would have produced **410** / **383** / **392** |
| The bonus is **round-scoped** and fires at the **holder's turn start** | the observed round-1 hit carries it |
| The **at-max precondition** is real | the control (gauge 3 < 6) did **not** fire — 356, unchanged |

**Pinned by an automated test:** `src/test/vector-data.test.ts` — the control and clause-4 cases assert
ATK 1719→356 and ATK 1891→420, with hard non-crit guards.

**NOT upgraded, and it must not be read as covered:** clause 5's **+20% / +30% tiers** (§3.5.0 — still
unreachable), her skill-sourced Confectance gain, clauses 2 and 3, and every other recorded-only clause
in `docs/dolls/vector.md` §11. The observation tested the **+10% tier only**.

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
| **Stability Damage Reduction** (稳态减伤, observed **60%** on Vector) | The engine has **no field** for it, and it is inert anyway: dolls are never attacked in the MVP (the dummy is the only target). A recorded gap, not a live bug |
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

- **V1 STEP 1 — the PANEL — COMPLETE and VALIDATED 2026.** The engine reproduces **every** number
exactly: effective **ATK 1718.73 / HP 4313.79 / DEF 1422.40** (HUD **1719 / 4314 / 1423**), and her
**Basic attack 356** at DEF 5000 non-crit with the +1% weapon. Full flat sources: base 748/1819/569 ·
weapon 25 · Helix 183/319/100 · Affinity Lv5 106/280/116 · Dispatch 183/618/240 · Remolding 224/651/245,
with **ATK 17% / HP 17% / DEF 12%**. Two separate game stats confirmed:
  - **Basic Attributes = FLAT only.** `ATK 1718.73 / HP 4313.79 / DEF 1422.40`, each **exactly** the sum
    of its listed parts (`total/Σparts = 1.000000`), and the engine's flat folding reproduces it once the
    three missing sources (Neural Helix, Affinity Lv5 flat, weapon 25) are supplied.
  - **Special Attributes = the percentage buckets, shown separately.** Stability **10** · CR **20%** ·
    CDMG **120%** · Mobility **6** · ATK Boost **17%** · DEF Boost **12%** · HP Boost **17%** ·
    Stability Damage Reduction **60%**.
  - **`Defense Boost = 12%` = `NEURAL_HELIX_GLOBAL_PCT` exactly** ⇒ the universal 12% **does** apply to
    Vector. **My earlier "+206 error" conclusion is WITHDRAWN** — it came from comparing the engine's
    *effective* panel against the game's *flat-only* Attack display. Base stats (10 / 20% / 120% / 6) all
    confirmed against `src/data/vector.ts`.
- **RESOLVED 2026 — V1 STEP 1 is COMPLETE and WIRED.** The owner clarified that **"max level
  remolding" means Remolder LEVEL 60** (the flat stat), **not** the Remolder flower/buff picks — she has
  no `Fighting Spirit` at all. So the residual **+5.0% ATK/HP is Neural Helix's own percentage**:
  `neuralHelixStats.atkPct = 0.05`, `hpPct = 0.05`, and **no ambiguity remains** (§3.0.2's two
  hypotheses collapse to one; the "15.60% vs 17.00%" test is **moot and withdrawn**).
  Her data is now in `src/data/vector.ts` and the engine reproduces **all six** observed stats:
  flat **1718.73 / 4313.79 / 1422.40** and percent **17% / 17% / 12%** ⇒ effective
  **ATK 2011 · HP 5048 · DEF 1594**.
- **STILL OPEN — the weapon.** The panel shows `Weapon 25.00`, but no `WeaponDef` exists for it.
  Owner has since NAMED it: **"Retired TMP"** — +25 flat ATK, weapon feature **+1% damage done**
  (the latter is a VALIDATION-ONLY modifier per the owner). **Not yet added to `weapons.ts`** — that,
  plus the owner decision on modelling an innate weapon damage% (§3.4), is outstanding.
- **V1 STEP 2 (damage) — SHELVED 2026 by the owner; focus moved to BASIC STATS.** Both damage fixtures
  (the (deleted) V1 fixture, the (deleted) real-build fixture) were **DELETED** at the
  owner's instruction. Do NOT recreate them without asking. Retained only as history: the engine
  predicted 451 / 844 / 732 (dispatch on, V6, no weapon) and the weapon-independent ratio test gives
  s1/basic ≈ 1.875, s2/basic ≈ 1.625. Owner-observed Basic hit: **356** at DEF 5000, V6, +1% weapon.
- **NEURAL HELIX — RESOLVED 2026 (the gene node table).** The earlier deletion was correct in
  PRINCIPLE (the View Details line is post-percentage) but wrong in EFFECT: the **GENE NODE TABLE**
  supplies the pre-percentage values — 6 nodes summing to **ATK 183 / HP 319 / DEF 100** with
  **atkPct 5%** and **hpPct 5%**. Entered, and **the engine now reproduces EVERY observed number
  exactly**: panel ATK 1718.73 · HP 4313.79 · DEF 1422.40 (HUD 1719 / 4314 / 1423) AND the Basic hit
  **356**. Pinned by 3 tests in `src/test/vector-data.test.ts`.
- **THE WEAPON — RESOLVED 2026.** "Retired TMP" added to `src/data/weapons.ts`: +25 flat ATK
  (`atkLvl1` = `atkLvl60` = 25, since only the summed value is known — no curve invented) and an
  **innate +1% damage** via a NEW `WeaponDef.innateDamageDealt` field, folded into the EXISTING
  additive DMG% bucket (no new formula, no new bucket). Independent of `calibrationLevel`.
  Owner note: the +1% is present during validations.
- **V2 (Vector's weapon data)** — **partially answered:** the panel gives the weapon's ATK contribution
  as **25 flat**, with **no HP/DEF lines**. Still needed: its identity and whether it carries
  **%ATK sub-stats / a calibration**, plus the owner decision on the innate **+1% damage** (§3.4).
- **V3 (her passive / Confectance) — CLAUSE 4 `Validated` IN-GAME 2026; clause 5 still unreachable.**
  **Observed: 356 without FK2, 420 with FK2** — both exactly as predicted, so **clause 4's +10% ATK,
  its round-scoped window and its at-max precondition are `Validated`**, and the control re-confirms
  V1's 356. The observation **discriminated**: the rejected models gave 410 / 383 / 392. Pinned by
  `src/test/vector-data.test.ts`. **Clause 5's +20%/+30% tiers were NOT tested and remain unreachable
  by construction** (§3.5.0): Vector declares no `resource_gain` and the engine has no skill-level
  Confectance grant, so her gauge never exceeds its battle-start value and the extra-slot pool cannot
  fill. Scenario files: `examples/vector-v3-control.json`, `examples/vector-v3-clause4.json`.
- V4–V9 — planned; detail is added per slice when we reach it (each slice's setup depends on the
  previous slice's outcome).

**Next action:** V1's observation, then reconcile. The single most useful supplementary number is her
in-game **panel ATK** — it pins the ATK/DEF relationship without needing the weapon's internals.

---

## 6. Related documents

- `docs/validation-checklist.md` — the **state register** (claim-level `Validated` /
  `Mathematically Proven` / `Not Tested`) and the authoritative standards. **Owning doc for states.**
- `docs/research.md` — mechanics; §3.23 (tile rules, `[SOURCE]`), §3.24–§3.34 (the V4 vocabulary).
- `docs/tiles.md` — the tile subsystem's design + slice record; §10 records what is built and what is
  blocked, and why.
- `docs/dolls/vector.md` — her source record + §11 (registered vs recorded-only).
- `docs/project.md` — §6 (evidence record), §8 (backlog).
