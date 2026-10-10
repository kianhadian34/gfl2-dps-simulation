# Vector — Doll Source Record

**Doll id:** `vector`
**Source:** `https://dandegate.net/dolls/vector` (Dandegate.net, accessed 2026-10-09)
**Status of this document:** **SOURCE DATA — DOCUMENTED, NOT IMPLEMENTED.** Nothing in this file
has been implemented in the engine. **Base stats (§3) are `Validated`** (an in-game character-sheet
read, same standard as Qiongjiu's); **every behavior claim is `Not Tested`**. See §7.

This is a **per-doll source record**: what the authoritative source states, transcribed faithfully
and labelled. It does not replace `docs/research.md` (mechanics) or
`docs/validation-checklist.md` (validation status); it feeds them.

---

## 1. READ THIS FIRST

### 1.1 Evidence discipline

Every claim below carries one of these classes (see `docs/project.md` §6 legend):

- **[GAME]** — directly observed in-game (the strongest class; e.g. the user-provided character
  sheet in §3).
- **[SOURCE]** — authoritative source/tooltip/screenshot text (an authoritative *input*, NOT a
  validation state). Everything in this document is `[SOURCE]` unless stated otherwise.
- **[UNKNOWN]** — not stated by the source, or ambiguous. **Must not be invented.**

**On validation:** reading a stat off the in-game character sheet is **`Validated`** under this
project's standard — that is exactly how Qiongjiu's own base stats are labelled
(`src/data/qiongjiu.ts`: "VALIDATED CHARACTER BASE STATS … in-game character sheet"). So **Vector's
base stats (§3) are `Validated`**. Everything else in this file — every *behavior* claim about her
kit — is **`Not Tested`**, because no Vector behavior has been tested in-game. Do not let the
validated *stats* imply a validated *kit*.

### 1.2 What this means for implementation

This record establishes **what the game states**. Before any of it can be implemented it must pass
through the normal workflow (`docs/project.md` §3.5): **Evidence → Document → Test → In-Game
Validation → Implement → Commit**. Where Vector's kit depends on a mechanic the engine does not
model, that is recorded as a gap here (§7) — **not** resolved by invention.

### 1.3 Provenance of every number here

Transcribed from the site's own embedded structured data (`__dehydratedState`), not from rendered
prose, so the values are the site's raw record:

- Doll / skills: `https://dandegate.net/dolls/vector/skills` (also `/fortification`)
- Keys: `https://dandegate.net/dolls/vector/keys`
- Signature weapon: embedded in the doll record (also `/weapons#banshee-s-whisper`)

---

## 2. Identity and classification [SOURCE]

| Field | Value |
|---|---|
| Name | **Vector** |
| Internal id (this repo, proposed) | `vector` |
| Rarity | **Elite** |
| Class | **Support** |
| Phase | **Burn** |
| Ammo Types | **Light Ammo** |
| Signature Weapon | **Banshee's Whisper** (`/weapons/banshee-s-whisper`) |
| Stability Gauge | **10** |
| Movement | **6** |
| Introduction | "A regularly pessimistic Doll. However, as the leader of H.I.D.E 404's Team B, Vector will absolutely push through and endure till the very last moment with her teammates in the face of adversity, no matter how depressing the outcomes of her calculations." |

**Mapping notes for this repo (proposed, not implemented):**
`class: "support"` (`DollClass`), `phase: "burn"` (engine `Element`), `mobility: 6`
(`CharacterDef.mobility`), `weaponType` — Vector's signature weapon is a **Submachine Gun**, so the
engine `WeaponType` would be `"smg"` (`WeaponType` union) — see §7 for why this needs care.

### 2.1 Passive identity in the source's own parsing

Vector's **Basic Attack declares Phase "Physical"** and **Ammo "Light Ammo"** — i.e. a *phase-less*
attack in this repo's vocabulary (`element: null`, `ammoType: "light_ammo"`). This matches the
established Qiongjiu precedent (Basic = `element: null` + an ammo type). **Do not** map "Physical"
onto an engine `Element` — the repo has no `physical` element (`docs/project.md` §3, taxonomy rule).

### 2.2 Remolding Pattern (Pattern Remolder) [SOURCE]

From the doll record's `remoldingPattern`:

| Field | Value |
|---|---|
| Core slot totals required | `bulwark: 1`, `support: 4`, `sentinel: 1`, `vanguard: 0` |
| Stat boosts at Remolder 60 | **HP +651**, **ATK +224**, **DEF +245** |
| Doll Core | `Support Core` |

This corresponds to the repo's existing per-character Remolder fields:
`remolderFlat: { atk: 224, hp: 651, def: 245 }` and `remolderSetBonuses` (requirement totals
witch/bulwark/vanguard/support/sentinel). **The set-bonus definitions are not in this source** —
see §7.

---

## 3. Base stats — `Validated` [in-game character sheet]

An in-game character-sheet read is **`Validated`** under the project standard (the same basis as
Qiongjiu's own base stats in `src/data/qiongjiu.ts`). Source: user-provided screenshot, 2026-10-09,
plus the user's statement that base Crit Rate is 20% for all characters.

| Field | Value | Basis |
|---|---|---|
| `hp` | **1819** | in-game sheet (Attributes) |
| `atk` | **748** | in-game sheet |
| `def` | **569** | in-game sheet |
| `stability` | **10** | Dandegate `stabilityGauge: 10` (corroborated: sheet is Vector's) |
| `critRate` | **0.2** (20%) | user-provided: base Crit Rate is **20% for ALL characters** |
| `critDmg` | **0.2** (120% displayed) | user-provided: same as Qiongjiu (`critDmg 0.2` = the displayed "120% Crit DMG"; the multiplier is `1 + critDmg`) |
| `mobility` | **6** | in-game sheet ("Movement Speed: 6 tiles"), corroborating Dandegate `movement: 6` |

**Sanity check against Qiongjiu** (the only other real character): Qiongjiu (sentinel) 802 ATK /
1893 HP / 528 DEF; Vector (support) **748 / 1819 / 569** — distinct, plausible, and consistent with
a different class. Recorded as **data**, not derived from Qiongjiu.

**Proposed `CharacterDef.base` (data only, not implemented):**
```ts
base: { atk: 748, hp: 1819, def: 569, stability: 10, critRate: 0.2, critDmg: 0.2 }
```

**Note on the class:** Vector is a **Support** doll, so the permanent Dispatch system would grant
her the Support class flat — `support: { atk: 183, hp: 618, def: 240 }` (`src/data/dispatch.ts`) —
folded through the ONE panel path exactly as Qiongjiu's sentinel dispatch is. That is the engine's
existing behavior for any real character and needs no per-doll work.

---

## 4. Skills (5) [SOURCE]

Violent source text is transcribed verbatim (tag strip only). `Lv.1` is the base; `Lv.2`/`Lv.3` are
Fortification-upgraded variants (see §5 for the Fortification map).

### 4.1 Depressive Mentality — Basic Attack

| Field | Value |
|---|---|
| Type / tags | Basic Attack / Targeted |
| Phase | **Physical** (phase-less) |
| Ammo | **Light Ammo** |
| Stability damage | **3** |
| Cooldown | — |
| Confectance cost | — |
| Range / Eff. Area | **7** / Target |
| Levels | **Lv.1 only** (no L2/L3 — Basic is never upgraded, matching the repo rule) |

> Selects 1 target within 7 tiles, dealing Physical damage equal to **80%** of attack.

**Note:** Vector's Basic deals **Stability 3**, whereas Qiongjiu's Basic deals Stability 2. Unlike
Qiongjiu, the source states an explicit **1.0× nothing** — only 80% of ATK is stated (no second
effect).

### 4.2 Dead End Meltdown — Skill 1 (Active)

| Field | Value |
|---|---|
| Type / tags | Active / Targeted / Debuff |
| Phase | **Burn** |
| Ammo | **Light Ammo** |
| Stability damage | **3** |
| Cooldown | **1 turn** |
| Confectance cost | — (not stated; the skill *grants* Confectance, see below) |
| Range / Eff. Area | **7** / Target |
| Levels | Lv.1 (base), **Lv.2 = Fortification V3** |

**Lv.1 [SOURCE]:**
> Selects 1 enemy target within 7 tiles and deals Burn damage equal to **120%** of attack to it. If
> the target has any **Burn type debuffs**, also deals **fixed damage equal to 50% of attack** to
> all enemy targets within **3 tiles** of the target and applies **Overburn** for **2 turns**.
> Vector gains **2 points** of Confectance Index.

**Lv.2 upgrade (V3) [SOURCE] — the source states the delta, not re-tabulated values:**
> Damage Multiplier is increased by **30%** and fixed damage multiplier is increased by **30%**.
> Burn debuffs are no longer needed to deal fixed damage, and **Overheat Combustion** is
> additionally applied for **2 turns**. Vector gains **2 more points** of Confectance Index.

Working through the stated deltas at Lv.2 (arithmetic on the source's own numbers — **a derivation,
not an observation**): damage **120% → 150%** and fixed damage **50% → 80%**; the fixed-damage
condition (target has a Burn debuff) is **removed**; Overburn 2t **plus** Overheat Combustion 2t;
Confectance gain **2 → 4**. *The Lv.2 tab renders exactly these values, which corroborates the
reading* — but treat the delta text, not this arithmetic, as the source of truth.

### 4.3 Portent of Doom — Skill 2 (Active)

| Field | Value |
|---|---|
| Type / tags | Active / Targeted / Debuff |
| Phase | **Burn** |
| Ammo | **none** in the structured record (`ammoTypes: "[]"`) — see §7 |
| Stability damage | **3** |
| Cooldown | **1 turn** |
| Range / Eff. Area | **7** / Target |
| Levels | Lv.1 (base), **Lv.2 = Fortification V4** |

**Lv.1 [SOURCE]:**
> Selects 1 enemy target within 7 tiles, applies **Smolder** for **2 turns**, and deals Burn damage
> equal to **100%** of attack to them. Vector gains **2 points** of Confectance Index.

**Lv.2 upgrade (V4) [SOURCE]:**
> Damage multiplier is increased by **30%**. **Smolder** gains a new effect: Each **Burn debuff
> increases damage taken by 3%**. Applies **Overheat** for **1 turn**. Vector gains **2 more
> points** of Confectance Index.

Derived at Lv.2: damage **100% → 130%**; Confectance gain **2 → 4**; plus the Smolder upgrade,
Overheat 1t. (**Source typo preserved:** the original reads "convectance Index" — the intended
"Confectance Index" is clear from every other occurrence.)

### 4.4 Searing Finale — Skill 3 (Ultimate)

| Field | Value |
|---|---|
| Type / tags | Ultimate / **AoE** / Tile / Buff |
| Phase | **Burn** |
| Ammo | none (`ammoTypes: "[]"`) |
| Stability damage | **1** |
| Cooldown | **4 turns** |
| Range / Eff. Area | **7** / **7** |
| Levels | Lv.1 (base), **Lv.2 = V2**, **Lv.3 = V6** |

**Lv.1 [SOURCE]:**
> Selects a tile within 7 tiles, dealing **AoE Burn damage equivalent to 60%** of attack to all
> enemy units within **7 tiles** of the target tile, and generates **Incineration** tiles, lasting
> for **2 turns**. Applies **Accelerant** to all allied units, lasting for **2 turns**. Vector gains
> **Extra Command**.

**"Extra Command" — IMPLEMENTED 2026.** It is an **extra main action** in the same unit-turn (no
movement) — the `extra_command` status carrying the generic `extra_action` effect. Full semantics,
implementation and unknowns: `docs/research.md` **§3.24**. Note this clause needs **no tile system**,
so it is implementable ahead of V3.

**Lv.2 upgrade (V2) [SOURCE]:**
> The effect of **Accelerant** changes: When dealing **Burn damage**, damage is increased by **20%**.
> Applies **Blazing Assault II** to all allied units for **2 turns**. Cleanses **2 debuffs** from all
> allied units.

**Lv.3 upgrade (V6) [SOURCE]:**
> **Accelerant** gains new effects: When dealing Burn damage, **critical damage is increased by
> 15%** and **every Burn buff increases damage dealt by 5%**. Vector gains **Apathetic Resistance**,
> lasting for **2 turns**.

**"Apathetic Resistance" — IMPLEMENTED 2026.** Crit DMG **+25% for 2 turns**, un-cleansable — the
`apathetic_resistance` status. Note the V6 line also raises **Accelerant's own** crit damage by 15%
(an Accelerant upgrade, not this buff); the Burn-buff count-scaling it needs is now **DONE 2026**
(`docs/research.md` §3.29 — Accelerant itself is still undefined).
Full semantics: `docs/research.md` **§3.25**. This clause needs **no tile system**, so it is
implementable ahead of V3.

**Note the Ultimate here IS damaging** (60% AoE) — it is *not* a buff-only ultimate like Qiongjiu's.
It carries an explicit Burn phase, a Stability value (1), and a cooldown (4).

### 4.5 Perception Block — Passive

| Field | Value |
|---|---|
| Type / tags | Passive / Debuff |
| Levels | Lv.1 (base), **Lv.2 = V1**, **Lv.3 = V5** |

**Lv.1 [SOURCE] — four clauses:**
> 1. Immune to negative effects inflicted by **Burn tiles**.
> 2. Before dealing **Burn damage**, if the target has **Overburn**, applies **Overheat Combustion**
>    on the target for **2 turns**.
> 3. At the **start of the battle**, increases the number of all of **Support Attacks dealing Burn
>    damage** by **1**.
> 4. At the **start of the turn**, if **Confectance Index is at maximum**, Vector consumes **all**
>    points of Confectance Index to increase **attack by 10%** until the end of the round.

**Lv.2 upgrade (V1) [SOURCE]:**
> **Overheat Combustion** gains a new effect: **Burn damage taken is increased by 30%**, fixed damage
> area is increased to **3x3**. the number of all Support Attacks dealing Burn damage is increased by
> **1**.

**Lv.3 upgrade (V5) [SOURCE]:**
> **Overheat Combustion** gains new effects: At the **end of the action**, generates **Incineration**
> tiles within **1 tile**; **fixed damage multiplier is increased by 10%**. At the start of the turn,
> for **each point of Confectance Index above the maximum**, further increases the attack by **10%**,
> up to **20%**.

**"Above the maximum" — RESOLVED [GAME]: the 2 EXTRA V5 slots.** The phrase does **not** mean the
normal gauge exceeds 6. Per the user (2026-10-09), at **V5** Vector gains **2 Confectance Index slots
separate from her usual 6**, and those 2 extra slots are exactly what clause 5 counts (+10% for 1,
+20% for 2). **U9's cap of 6 is unchanged.** Full explanation in the RESOLVED note after the clause
list below.

**Lv.3 full clause list (from the Lv.3 tab) [SOURCE] — note clause 3 reads "by 2" at Lv.3:**
> 1. Immune to debuffs inflicted by Burn tiles.
> 2. Before dealing Burn damage, if the target has Overburn, applies Overheat Combustion for 2 turns.
> 3. At the start of the battle, increases the number of all of Support Attacks dealing Burn damage
>    by **2**.
> 4. At the start of the turn, if Confectance Index is at maximum, Vector consumes all points of
>    Confectance Index to increase attack by 10% until the end of the round.
> 5. For **each point** of Confectance Index **above the maximum**, further increases the attack by
>    **10%**, up to **20%**. This effect lasts until the end of the round.

**RESOLVED — clause 5 ("above the maximum"): a SEPARATE 2-slot resource granted at V5.**
[GAME — user-provided in-game evidence, source hierarchy level 1; user statement 2026-10-09]

**How it works (user-provided, definitive):** when Vector is at **Fortification 5** (which raises
her passive to **Lv.3** — see §5), she gains **2 extra Confectance Index slots that are SEPARATE
from her normal 6.** At V5 she therefore has the usual 6 **plus** those 2, and the 2 extra slots are
what clause 5 reads: **they determine whether she gets the extra +10% or +20% ATK.** Per the user,
*"that's its whole functionality."*

**This does NOT contradict U9.** U9's cap of **6 applies to the normal gauge and is unchanged** —
the extra slots are a **distinct, Vector-only, V5-gated resource**, not the ordinary gauge exceeding
its cap. No U9 evidence is falsified or reinterpreted.

**Resulting model (for implementation):**

| Extra slots filled (V5 only) | Clause 5 bonus |
|---|---|
| 0 | none (clause 4's +10% still applies while the normal gauge is at 6) |
| 1 | **+10%** |
| 2 | **+20%** (the stated ceiling) |

This matches clause 5's own text — *"for each point … above the maximum, further increases the
attack by 10%, up to 20%"* — with **1 point → +10%** and **2 points → +20%** the natural reading.
**The per-point arithmetic is derived from the user's explanation + the source text, not from a
controlled test** — a controlled run would move it from user-provided evidence to `Validated`, but
the mechanic itself is no longer open.

**Implementation (IMPLEMENTED 2026 — engine capability):** the engine now models this GENERICALLY. A
`turn_start_confectance_drain` `PassiveEffect` (`atkPct` + `extraSlots` + `perExtraSlotAtkPct`) fires at
the holder's own turn start; `UnitState.extraConfectance` / `extraConfectanceMax` is a SECOND pool that
`gainConfectance` fills from gains beyond `confectanceMax`; the granted ATK% is round-scoped
(`UnitState.roundAtkPct`, cleared each round) and folded into the existing in-combat ATK% bucket.
**`confectanceMax` stays 6 (U9)** — the extras are a separate pool, never a raised cap. Covered by
`src/test/confectance-drain.test.ts` (8 tests). Semantics confirmed with the user (2026-10-09): overflow
fills the extras; clause 5 is additive on clause 4 ⇒ **0/1/2 filled extras = +10%/+20%/+30%**; the drain
consumes both pools. **Vector's own values are still data to be set on her passive** (§7 G4b) — the
capability exists, her kit does not.

**Incidental finding (factual, from the code):** the existing at-max condition is written
`beforeConfectance >= state.config.confectanceMax` (`src/engine/simulation.ts:790`) — **`>=`, not
`==`**. Recorded so a future session does not have to re-derive it.

**READING CAUTION (recorded, not resolved):** the V1 delta says Support-Attack count "+1" while the
Lv.3 tab renders **2** (Lv.1's 1 + the V1 delta's 1). This is consistent with **cumulative**
upgrades (the repo's established model), but the two texts must not be read as contradictory
without checking the Lv.2 tab directly. Marked for verification, not assumed. (See §7.)

**In-repo precedent:** clause 4 is identical in shape to Qiongjiu's "at-max Confectance" hook, but
Vector's **consumes all points** to grant **+10% ATK for the rest of the round** — a different
mechanism from Qiongjiu's Ultimate-cost branch. It does not exist in the engine today.

---

## 5. Fortification map [SOURCE]

The source lists **Fortification (6/6)**. Each raises exactly one ability (the repo's
`fortificationMap` shape: `{ v, ability, toLevel }`):

| V | Ability | To level | Source text (verbatim, condensed) |
|---|---|---|---|
| **V1** | Passive (Perception Block) | Lv.2 | Overheat Combustion gains: Burn damage taken +30%, fixed damage area 3x3; Support Attack count +1 |
| **V2** | Skill 3 (Searing Finale) | Lv.2 | Accelerant changes: Burn damage +20%; applies Blazing Assault II to all allies 2t; cleanses 2 debuffs from all allies |
| **V3** | Skill 1 (Dead End Meltdown) | Lv.2 | Damage +30% and fixed damage +30%; Burn debuff no longer required for fixed damage; also applies Overheat Combustion 2t; +2 more Confectance |
| **V4** | Skill 2 (Portent of Doom) | Lv.2 | Damage +30%; Smolder gains "each Burn debuff increases damage taken by 3%"; applies Overheat 1t; +2 more Confectance |
| **V5** | Passive (Perception Block) | Lv.3 | Overheat Combustion gains: end of action → Incineration tiles within 1 tile; fixed damage multiplier +10%; per point of Confectance above max → +10% attack, up to 20% |
| **V6** | Skill 3 (Searing Finale) | Lv.3 | Accelerant gains: on Burn damage, critical damage +15%; every Burn buff → damage dealt +5%; Vector gains Apathetic Resistance 2t |

**Proposed `fortificationMap` (data only, not implemented):**
`V1→passive Lv2 · V2→ultimate Lv2 · V3→active1 Lv2 · V4→active2 Lv2 · V5→passive Lv3 · V6→ultimate Lv3`

**Note the ordering differs from Qiongjiu's** (Qiongjiu: V1→active1, V2→active2, V3→passive,
V4→ult Lv2, V5→ult Lv3, V6→passive Lv3). Each character's map is its own data — do not copy
Qiongjiu's ordering.

---

## 6. Keys (9) [SOURCE]

### 6.1 Fixed Keys (6)

| # | Id (proposed) | Name | Level | Effect (verbatim) |
|---|---|---|---|---|
| FK1 | `vector_fk1_hospice_care` | Hospice Care | 20 | If **Dead End Meltdown** kills its main target, generates **Incineration** tiles within **3 tiles** of the target for **2 turns**. |
| FK2 | `vector_fk2_splattering_pessimism` | Splattering Pessimism | 20 | Gains **3 points** of Confectance Index at the **start of the battle**. |
| FK3 | `vector_fk3_dispassionate_support` | Dispassionate Support | 30 | **Before the attack**, cleanses **2 buffs** from the enemy target. |
| FK4 | `vector_fk4_proliferating_despair` | Proliferating Despair | 30 | Before dealing damage to a **large target** with an **active attack**, additionally deals 1 instance of **fixed damage equal to 15%** of attack. |
| FK5 | `vector_fk5_unfortunate_jinx` | Unfortunate Jinx | 40 | While on a **Burn tile**, damage taken is reduced by **20%**. At the **end of the action**, Vector restores **2 points** of stability index and **10%** of max HP. |
| FK6 | `vector_fk6_negative_motivation` | Negative Motivation | 40 | When an enemy unit within range is inflicted with **Overburn**, launches **Emergency Support**, dealing **Burn damage equal to 60%** of attack and **1 point** of stability damage. Triggers **once per turn**. *(The **trigger** is now engine-supported — `onEnemyStatusApplied` §3.30; the numbers are Vector's data)* |

**Direct precedents in the engine (comparisons only — Vector's versions are their own data):**
- FK2 mirrors Qiongjiu's FK1 Concentration (`battleStartEffects` +3 Confectance) exactly in shape.
- FK3 is a cleanse-before-attack — but **2 buffs from the enemy target**, whereas Qiongjiu's FK2
  cleanses **1** dispellable buff and is scoped to the **Support Action**. Different scope/count.
- FK6 is a **new support-attack trigger** ("when an enemy is inflicted with Overburn") — the engine's
  only support trigger today is "an ally deals targeted damage" (`onAllySingleTargetHit`).
- FK1/FK4/FK5 depend on **tiles / large targets / damage-taken reduction / stability restore**,
  several of which the engine does not model (§7).

### 6.2 Affinity Key — Tragedy Preview [SOURCE]

| Field | Value |
|---|---|
| Id (proposed) | `vector_affinity_tragedy_preview` |
| Unlock | **Affinity Level 5** |
| Attributes | **Crit Rate 3%** · **Attack Boost 3%** · **Health Boost 3%** |

**Note the shape difference from Qiongjiu's Warm as Jade:** Qiongjiu's key grants *Crit DMG / ATK /
HP* percentages (with a documented Lv9 pair and a foreign-key generic bonus). Vector's key grants
**Crit Rate** (not Crit DMG) — the repo's `AffinityKeyDef.levels` currently models
`{ critDmg, atk, hp }` only, so **Crit Rate is a new field** for that structure. Whether a Lv9 entry
exists is **[UNKNOWN]** from this source (only the Lv5 unlock is listed). See §7.

### 6.3 Common Key — Death Knell [SOURCE]

| Field | Value |
|---|---|
| Id (proposed) | `vector_common_death_knell` |
| Level | 40 |
| Stats | **Attack Boost 5%** |
| Secondary effect | At the **start of the turn**, if **any enemy unit has any Burn debuffs**, attack is increased by **8%**. |

**Note for the Common Key model:** the source lists exactly **one** stat (`Attack Boost 5%`). The
repo's model says the **first** slot is fixed and **later slots are player-chosen**; a key
declaring one stat is representable, but whether Death Knell has more slots is **[UNKNOWN]** here.
The secondary effect is a **conditional turn-start ATK buff** — not one of the two executed
secondary shapes the engine supports today (executed `stat` vs recorded `status`/`passive`).

### 6.4 Expansion Key — Depression Empathy [SOURCE]

| Field | Value |
|---|---|
| Id (proposed) | `vector_exp_depression_empathy` |
| Level | 60 |
| Effect | After making an **active attack**, the cooldown for the Ultimate skill **Searing Finale** is reduced by **1 turn**. When ally units perform a **support attack that deals Burn damage**, gains **1 point** of Confectance Index and heals all ally units on the battlefield for HP equal to **15%** of attack. Can trigger up to **4 times per turn**. |

**This is a cooldown-reduction + ally-heal mechanic** — neither exists in the engine today
(Qiongjiu's Ruined Gem is an element override + target-status bonus). See §7.

---

## 7. Implementation gaps — mechanics this kit needs that the engine does NOT model

Recorded so implementation is **scoped honestly** rather than approximated. None of these is
"implement anyway"; each is its own evidence/design step.

| # | Mechanic Vector needs | Engine status | Where |
|---|---|---|---|
| G1 | **Burn tiles / Incineration tiles** (a ground-tile effect that persists, deals Burn, and grants immunity/effects) | **Not modeled.** Grid has terrain/height only; no tile effects. **The tile rules themselves are now documented** (Burn family only) in `docs/research.md` §3.23 — a community-guide transcription, `Not Tested`. | `src/engine/grid.ts`, `docs/grid.md`, `docs/research.md` §3.23 |
| G2 | **The 8 undefined statuses Vector's kit needs** — see the authoritative inventory in **§7.1** | **Not defined.** Only `overburn` and `blazing_assault_ii` of her 10 referenced effects exist. Each needs a definition **and** several need new engine vocabulary — the full mapping is in §7.1. | `src/data/statuses.ts`, `src/model/types.ts` |
| ~~G3~~ | ~~"consumes ALL Confectance at max to gain +10% ATK for the round"~~ | **IMPLEMENTED (2026)** — generic `PassiveEffect` kind `turn_start_confectance_drain` (`atkPct`), fired at the holder's own turn start and granted as a **round-scoped** `UnitState.roundAtkPct` folded into the existing in-combat ATK% bucket. | `src/model/types.ts`, `src/engine/simulation.ts`, `src/engine/statuses.ts` |
| ~~G4~~ | ~~Turn-start "at max Confectance" trigger~~ | **IMPLEMENTED (2026)** — `applyTurnStartConfectanceDrain` runs at each unit's turn start; the pre-existing `onCastAtMaxConfectance` hook (Ultimate-scoped) is untouched. | `src/engine/simulation.ts` |
| ~~G4b~~ | ~~The 2 EXTRA Confectance slots (V5-only, separate from the normal 6)~~ | **IMPLEMENTED (2026)** — `UnitState.extraConfectance` / `extraConfectanceMax` (a SECOND pool); `gainConfectance` routes gains beyond `confectanceMax` into it. **`confectanceMax` is unchanged (U9)**. Clause 5 = additive per FILLED extra slot ⇒ **+10/+20/+30% for 0/1/2**. Values are data (`extraSlots`, `perExtraSlotAtkPct`), still to be set on Vector's own passive. | `src/engine/resources.ts`, `src/engine/state.ts`, `src/model/types.ts` |
| G5 | **Fixed damage equal to 50%/80% of ATK to an AoE area around the target** (conditional on a Burn debuff) | **Partly modeled.** `fixedDamage` exists (absolute) and `percentOfAtk` exists for *statuses*; an ability-sourced **percent-of-ATK fixed AoE** is new. | `src/engine/damage.ts`, `simulation.ts` |
| G6 | **Support Attacks that "deal Burn damage"** as a distinct category (Vector *increases their count*) | **Not modeled.** Qiongjiu's support is phase-less; "count of Support Attacks dealing Burn damage" is a new concept. *(Distinct from slice 7, which added the **enemy-status TRIGGER** for a Support Action — §3.30 — not a Burn-damage classification of support hits.)* | `src/engine/simulation.ts` |
| G7 | **Cooldown reduction** (Expansion Key: −1 turn on an Ultimate) | **Not modeled.** `setCooldown` only sets absolute values. | `src/engine/cooldowns.ts` |
| G8 | **Allied healing** (Expansion Key heals all allies; FK5 self-heals + stability restore) | **Not modeled** (the engine is attacker + target only; `heal` exists for the holder). | `src/engine/statuses.ts` |
| G9 | **Damage-taken reduction while standing on a tile** (FK5) | **Not modeled** (no tiles; `damage_reduction` exists but not tile-gated). | — |
| G10 | **"Large target"** classification (FK4) | **Not modeled** (the boss 3×3 footprint exists on the grid; no "large target" flag on the dummy). | `src/model/types.ts` |
| G11 | **Cleansing buffs *from the enemy target* before the attack** (FK3, ×2) | **Partly modeled.** `cleanseDispellable` + `supportActionCleanse` exist but are Support-scoped and cleanse **1**. | `src/engine/statuses.ts` |
| G12 | **Crit Rate on an Affinity Key** | **Not modeled** — `AffinityKeyDef.levels` is `{ critDmg, atk, hp }`. | `src/model/types.ts` |
| G13 | **Ultimate that is AoE + tile-generating + ally-buff** | Partly — AoE exists (`damageCategory: "aoe"`); tile generation (G1) and multi-ally buffs are new. | — |

**Also open (data, not mechanics):**
- **Base stats** — **RESOLVED** (§3): HP 1819 / ATK 748 / DEF 569 / Stability 10 / Crit Rate 20% /
  Crit DMG 120% / Movement 6. All six `CharacterDef.base` fields are now populated from direct
  in-game evidence.
- **Vector's `weaponType`** — signature weapon is a **Submachine Gun**, so `"smg"`; but the Apex
  Chassis component recorded in this repo is gated on `weaponType: "ar"` ("Damage dealt by AR
  Dolls"), so Vector would **not** match it. That is correct behavior, recorded here to prevent a
  wrong assumption later.
- **Portent of Doom's ammo** — the structured record shows **no ammo type** while its sibling
  actives show Light Ammo. Qiongjiu's Guide to Victory has an analogous "Burn phase, no ammo"
  record, so this is plausible; **verify** rather than assume either way.
- **`remolderSetBonuses` for Vector** — the source gives only the category *totals*, not the set
  bonus definitions.

### 7.1 Status / effect inventory (V4) — authoritative

**Provenance.** Vector's pages (`/dolls/vector/skills`, `/keys`) reference exactly **10 effect IDs**.
Each was resolved against the site's own effect record — `https://dandegate.net/effects/<uuid>`,
whose embedded `effectDetails` carries the **main text plus every upgrade variant** (`mainDetails` +
`upgrades[] { upgradeName, upgradeDetails }`). So the text below is the **site's structured record**,
not prose transcription. Source class: **secondary (community database)** — hierarchy level 5.
**Everything here is `[SOURCE]` / `Not Tested`.**

| # | Effect | Tags | In repo? | Definition (site record) |
|---|---|---|---|---|
| 1 | **Overburn** | Burn/Debuff | ✅ `overburn` | fixed dmg **10%** of applier ATK, on gain + at action end, to the holder *and allies within 1 tile* |
| 2 | **Blazing Assault II** | Attack/Buff/Burn | ✅ `blazing_assault_ii` | **ATK +15%** |
| 3 | **Overheat Combustion** | Burn/Debuff | ❌ *(its **tick point** is supported — `ownActionStart` §3.27; its **"all allied units within a 1-tile area"** clause needs AREA targeting, which `all_allies` (§3.28) does **not** provide — that is the whole team, not a 1-tile radius)* | fixed dmg **20%** of applier ATK, on gain + **at the start of the holder's action**, to the holder *and allies within a 1-tile area* · **V1:** *Burn damage taken* **+30%**, area → **3×3** · **V5:** Burn dmg taken +30%, area 3×3, **30%**, and **at action end generates Incineration tiles within 1 tile** |
| 4 | **Smolder** | Burn/Debuff | ❌ *(its **V4 count clause** "for every Burn debuff, damage taken +3%" is now **supported** — `damage_modifier.perMatching` §3.29; its tile generation is not)* | **on taking Burn damage** → generates **Incineration tiles within 3 tiles**, 2 turns (cannot be cleansed) · **V4:** *for every Burn debuff*, **damage taken +3%** |
| 5 | **Overheat** | Burn/Debuff | ❌ | **"Command Prohibition, disallows the use of active skills."** |
| 6 | **Accelerant** | Attack/Buff/Burn | ❌ *(its **V6 count clause** "per Burn buff, damage dealt +5%" is now **supported** — `damage_modifier.perMatching` §3.29; its fixed-damage instance is not. NOTE: its **Burn affiliation** is now declared as `StatusDef.element` on other statuses, not on Accelerant itself — Accelerant is still undefined)* | *Burn damage dealt* **+10%**, plus 1 instance of **fixed dmg 20% of ATK** (cannot be cleansed) · **V2:** **+30%** · **V6:** *per Burn buff* **+5% dealt**, **+30%**, **crit dmg +15%**, fixed 20% |
| 7 | **Extra Command** | — | **✅ `extra_command` (IMPLEMENTED 2026)** | "Commands other than movement can be executed." — an **extra main action** in the same unit-turn, no movement |
| 8 | **Emergency Support** | — | ❌ *(its **trigger** — "when an enemy gains a status" — is now **supported**: `support_attack.trigger: "onEnemyStatusApplied"` §3.30; the status itself is not defined)* | "Performs a Support Attack." |
| 9 | **Apathetic Resistance** | Attack/Buff | **✅ `apathetic_resistance` (IMPLEMENTED 2026)** | **Crit damage +25%**, 2 turns (cannot be cleansed) |
| 10 | **Incineration** | Burn/Debuff | ❌ | the **Burn tile**: Burn weakness; applies **Overburn + Conflagration** to enemies remaining in the area at action end, 2 turns |

**Score: 2 of 10 existed; 4 of 10 now exist** (`overburn`, `blazing_assault_ii`, `extra_command` and
`apathetic_resistance` — the last two IMPLEMENTED 2026; see `docs/research.md` §3.24/§3.25).

#### Two record corrections this inventory forces

1. **`Overheat Combustion` is a real, distinct effect** (Burn/Debuff, uuid `e64fa51b`) — **not**
   Overburn, Conflagration, or Combustion. This **resolves** the V3-era open question ("Vector's
   Overheat Combustion does not appear in the Burn-tile text"): it is a separate game effect, not a
   tile effect.
2. **`Overheat` is a THIRD distinct effect** (uuid `7d900a53`) — and it is **skill denial**. The
   V3-era reading of Skill 2 Lv.2 as "Applies Overheat" is correct; it is **not** an abbreviation of
   Overheat Combustion.

#### The capability gaps, by kind (nothing here is implemented)

**a) Data-only definitions: none.** Every missing status needs something the union cannot express.

**b) Small, reusable vocabulary additions:**

| Gap | Engine today | Needed by |
|---|---|---|
| ~~**`critDmg` on `stat_modifier`**~~ | ~~stats are `atk \| def \| hp \| critRate` only~~ — **DONE 2026** | ~~Apathetic Resistance~~; **still needed by Accelerant V6** (+15% Crit DMG) |
| ~~**Per-element gate on a damage modifier**~~ | ~~`damage_modifier.whenPhase` is only *phase vs phase-less*; only `stack_tier_modifier.when.element` is per-element~~ — **DONE 2026** (`whenElement`, both scopes + both modes; `docs/research.md` §3.26) | ~~Overheat Combustion V1 (Burn dmg *taken* +30%)~~; ~~Accelerant (*dealt* +10%)~~ — **the gate is done; those statuses still need other pieces** (see below) |
| ~~**Start-of-action status tick**~~ | ~~`tickAt` is `ownActionEnd \| roundEnd` only~~ — **DONE 2026** (`ownActionStart`, a third point; `docs/research.md` §3.27) | ~~Overheat Combustion (fires at the holder's action **start**)~~ — **the tick point is done; that status still needs other pieces** (see below) |
| ~~**Count-by-classification scaling** ("for every Burn debuff/buff")~~ | ~~no such scaling exists~~ — **DONE 2026** (`damage_modifier.perMatching` + `StatusDef.element`; `docs/research.md` §3.29) | ~~Smolder V4 (+3% taken per Burn debuff); Accelerant V6 (+5% dealt per Burn buff)~~ — **the scaling is done; both statuses still need their other pieces** (Smolder needs tile generation; Accelerant needs its fixed-damage instance). Both clauses are **Not Tested** (the self-counting question in §3.29 is open) |
| ~~**Support-trigger vocabulary**~~ | ~~the only trigger is `onAllySingleTargetHit`~~ — **DONE 2026** (`trigger: "onEnemyStatusApplied"` + `statusId`, a separate union member; `docs/research.md` §3.30). The old wording claiming an *event bus* with `onDebuffApplied`/`onUnitAttacked` was **doc drift** — no bus ever existed; §3.14 is corrected | ~~Emergency Support / FK6~~ — **the trigger is done; Emergency Support itself is still undefined, and FK6's numbers are Vector's data** |
| ~~**All-allies status targeting**~~ | ~~`StatusApplySpec.target` is `self \| target`~~ — **DONE 2026** (`all_allies`, every team member incl. the caster; `docs/research.md` §3.28) | ~~Ultimate applies Accelerant + Blazing Assault II to **all allies**~~ — **the targeting is done; those statuses still need their own definitions** (Accelerant needs the Burn-dealt gate + a fixed instance; Blazing Assault II already exists) |

**c) Genuinely new mechanics:**

| Gap | Needed by |
|---|---|
| **Skill denial / "Command Prohibition"** — nothing blocks ability use; `pickAction` needs a gate | Overheat |
| **Per-attack extra fixed-damage instance** (not a status tick) | Accelerant |

**Resolved in this batch (no longer gaps):**
- ~~**`critDmg` on `stat_modifier`**~~ — **IMPLEMENTED 2026**: added to the stat union and routed
  through the ONE `statModifier` path into the confirmed `1 + Crit DMG` multiplier. Unblocked
  **Apathetic Resistance**. See `docs/research.md` §3.25.
- ~~**Per-element gate on a damage modifier**~~ — **IMPLEMENTED 2026**: `damage_modifier.whenElement`
  (an OR-list, `null` = phase-less), honored on the DEALT and TAKEN scopes and on both modes.
  `docs/research.md` §3.26. **This unblocks the element GATE only** — Accelerant and Overheat
  Combustion still need the other pieces listed above/below.
- ~~**Start-of-action status tick**~~ — **IMPLEMENTED 2026**: `tickAt: "ownActionStart"` (a third
  point; turn starts → effect fires → the unit acts). Fired for team units AND the dummy's pass-turn
  so target-side debuffs tick too. `docs/research.md` §3.27. **Overheat Combustion still needs its
  all-allies/area targeting** before it is definable.
- ~~**All-allies status targeting**~~ — **IMPLEMENTED 2026**: `StatusApplySpec.target: "all_allies"`
  = every member of the allied team INCLUDING the caster (the enemy/dummy is never included). Used by
  the Ultimate's "Applies Accelerant to all allied units". `docs/research.md` §3.28. **The statuses
  themselves still need defining.**
- ~~**Apathetic Resistance** (Crit DMG +25%, 2 turns)~~ — **IMPLEMENTED 2026** as the
  `apathetic_resistance` status. `docs/research.md` §3.25.
- ~~**Extra Command** (extra main actions)~~ — **IMPLEMENTED 2026** via the `extra_action` status
  effect and an action loop. `docs/research.md` §3.24. *(The **wider** additional-action /
  enemy-turn topic remains out of MVP scope — `docs/validation-checklist.md` §2.)*

**d) V3-coupled (tiles) — belongs to V3, not V4:** **Incineration** itself, plus the
tile-*generation* clauses of Smolder and Overheat Combustion V5. Vector's tiles also apply
**Conflagration**, **Combustion**, and **Combustion II** — three further undefined statuses that are
tile-side (`docs/research.md` §3.23).

#### Design decisions recorded (V4, decided with the user 2026-10-09)

- **Element gate:** add a **proper `whenElement`** to `damage_modifier` (dealt + taken), mirroring the
  existing `whenPhase` / `whenCategory` gates — **not** folding it into `stack_tier_modifier`. (The
  latter *can* express an element-gated flat bonus via a single-tier `tiers` map, but that kind is a
  per-stack tier table; using it for a flat modifier would be an abuse.) — **DONE 2026**:
  `damage_modifier.whenElement` is implemented (both scopes + both modes). `docs/research.md` §3.26.
- **Scope:** **documentation first** — record this evidence before implementing anything. (The
  implementation slices then proceed one vocabulary addition at a time.)
- **Already-available note for future implementation:** `StatusDef.phase` (an element attribute) exists
  and Overburn carries `phase: "burn"`, but it is consumed **only** by the attachment-set Phase Strike
  gate — it is *not* a general element gate for modifiers. Do not conflate the two.

---

## 8. Assets — downloaded and placed (NOT wired)

23 files were taken from the site's CDN (`cdn.dandegate.net`); **19 were placed** into the repo's
asset tree (18 character files + 1 weapon) following the existing Qiongjiu conventions. The other 4
were the site's generic class/phase/ammo icons, which this repo already has its own copies of and
were therefore not placed. **They are placed but NOT wired** — `assets.ts`
(`KNOWN_ENTITY_IDS` / `SUPPLIED_ASSET_FILES`) and the UI were **not** touched (wiring is an
implementation step and is out of scope for this documentation task).

```
ui/src/renderer/public/assets/characters/vector/
├── portrait/vector-avatar.webp
├── fixed-keys/vector-fixedkey1-hospice-care.webp … vector-fixedkey6-negative-motivation.webp
├── affinity-keys/vector-affinitykey-tragedy-preview.webp
├── expansion-keys/vector-expansionkey-depression-empathy.webp
├── skills/vector-basic-depressive-mentality.webp
├── skills/vector-sk1-dead-end-meltdown.webp
├── skills/vector-sk2-portent-of-doom.webp
├── skills/vector-ultimate-searing-finale.webp
├── skills/vector-passive-perception-block.webp
└── artwork/vector-chibi.webp · vector-card.webp
             · vector-skin-vivi-sometimes-hides-her-molotovs.webp · vector-skin-molotov-bunny.webp

ui/src/renderer/public/assets/weapons/banshees-whisper/7ec114d902964b08664a2b2790533ca3.webp
```

Per `ui/docs/assets.md` the canonical identifier is the **engine entity id**; the weapon file keeps
the CDN hash name because that is the existing convention for `weapons/jinshizou/`
(`64111d2dacf250a428ca4639dece164e.webp`). **The skill-icon → skill mapping was verified from the
site's structured data, not inferred from order.**

---

## 9. Signature Weapon — Banshee's Whisper [SOURCE]

| Field | Value |
|---|---|
| Name | **Banshee's Whisper** |
| Rarity | Elite |
| Weapon Type | **Submachine Gun** |
| Primary attribute | **Attack 348** |
| Secondary attribute | **Attack Boost 15%** |
| Trait | "Gains 1 random buff for 1 turn if the user has full HP at the start of the action." |

**Effect [SOURCE]:**
> Prior to an allied unit's attack, if the target has any **Burn Debuffs**, the damage dealt is
> increased by **10%/12%/14%/16%/18%/20%**; if **Burn damage** is dealt, increases by another
> **10%/12%/14%/16%/18%/20%**. If the target has **Overheat Combustion**, damage dealt by targeted
> Support Attacks increases by **5%**.

**Imprint [SOURCE]:**
> Damage dealt to **URNC units** is increased by **2.5%**. If the target has any Burn debuffs, this
> is further increased by **2.5%**.

**Repo mapping notes (proposed, not implemented):**
- The **Trait** is the *identical shape* to Golden Melody's trait in this repo
  (`WeaponDef.trait: { statusIds, durationRounds }` — "1 random buff, 1 turn, at full HP"). The
  trait **pool** for this weapon is not in the source.
- The **Imprint** matches the repo's owner-gated `WeaponDef.imprint` shape
  (`{ targetType, bonus, noCoverBonus }`) but the two conditions differ: this one is
  **"target is a URNC unit"** + **"target has any Burn debuff"**, not "…+ target not in Cover".
  The repo's shape would need a different second condition — recorded as a shape gap, not forced.
- The max-level weapon ATK is **348**; the repo's `WeaponDef` wants `atkLvl1`/`atkLvl60`, of which
  only one value is given here.

---

## 10. Summary — what is ready and what is not

**Ready as data:** identity/classification, **base stats (§3 — resolved)**, the 5-skill kit with
per-level source text, the 6-entry Fortification map, the 9 keys, the Remolder flats, the signature
weapon.

**Blocking (must be resolved before implementation):**

1. ~~**Base stats** (§3) — in-game character sheet required.~~ **RESOLVED 2026-10-09.**
2. **New statuses** (G2) — **6 of Vector's 10 referenced effects remain undefined** (`overburn`,
   `blazing_assault_ii`, `extra_command`, and now `apathetic_resistance` exist); the authoritative
   inventory, their upgrade variants, and the exact capability gaps are recorded in **§7.1**.
   Remaining vocabulary needs: **none** — the reusable set is complete. What remains is one
   genuinely new mechanic (skill denial) and the V3-coupled tile clauses.
   *(The **per-element gate**, the **start-of-action tick**, **all-allies targeting**,
   **count-by-classification scaling** and the **enemy-status support trigger** are now DONE — §7.1.)*
3. **Untile/tile mechanics** (G1, G9) — Burn/Incineration tiles are foundational to Vector's kit
   and the engine has no tile system.
4. ~~**Turn-start "at max Confectance" drain** and **the 2 extra V5 slots** (G3, G4, G4b)~~ —
   **ENGINE IMPLEMENTED + TESTED 2026** (`turn_start_confectance_drain`; a separate extra-slot pool;
   a round-scoped `roundAtkPct`). Not Vector-specific: her own values become **data** on her passive
   when her kit is written. See §4.5.
5. **Weapon-mechanic shape gaps** (§9) — Imprint target-type/condition, weapon atk endpoints.

**What remains for Vector is her kit data** (passive/tiles/statuses/weapon) — the V2 capability itself
is done. **V4's evidence is now documented (§7.1); nothing is implemented.**

**Vector's base stats are `Validated`; nothing else here is.** The base stats are an in-game
character-sheet read (`Validated` under the project standard, the same basis as Qiongjiu's own base
stats) — but a validated *stat* is not a validated *behavior*, and no Vector *behavior* has been
tested. Everything about how her kit behaves in the simulation remains `Not Tested` until tested
under the project standard.
