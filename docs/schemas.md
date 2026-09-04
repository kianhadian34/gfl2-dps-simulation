# GFL2 Combat Simulator — Proposed Data Schemas (MVP)

Status: proposal, awaiting approval. Versioned JSON data; the engine only reads these shapes. All numeric fields whose values are UNKNOWN in research (`docs/research.md` §4/§6) are config/overridable, with defaults documented there.

Conventions:
- `id`: stable lowercase snake_case string, versioned per data pack (e.g. `qiongjiu`).
- Percentages stored as decimals (`0.15` = 15%). Multipliers as ratios (`1.5`).
- Damage terms: `multiplier` = fraction of final ATK; `fixedDamage` = absolute value (fixed-damage branch, no crit/DEF per research §3.10).
- All optional fields marked `?`.

---

## 1. Character

```json
{
  "id": "qiongjiu",
  "name": "Qiongjiu",
  "kind": "doll",
  "level": 60,
  "phase": "burn",
  "base": { "atk": 1224, "hp": 2494, "def": 695, "stability": 9, "critRate": 0.20, "critDmg": 0.20 },
  "growth": { "atkPerLevel": 20, "hpPerLevel": 40, "defPerLevel": 12 },
  "stats": {
    "pctAtk": 0, "pctHp": 0, "pctDef": 0,
    "extraFlatAtk": 0, "extraFlatHp": 0, "extraFlatDef": 0, "extraStabilityDamageReduction": 0
  },
  "weaknesses": ["heavy_ammo", "acid"],
  "weapon": { "id": "jinshizou", "level": 60, "calibration": 6 },
  "skills": { "basic": "qiongjiu_basic", "active1": "qiongjiu_common_rail", "active2": "qiongjiu_guide_to_victory", "ultimate": "qiongjiu_pressing_momentum", "passive": "qiongjiu_steady_plan" },
  "keys": { "fixed": ["qiongjiu_fk1", "qiongjiu_fk3", "qiongjiu_fk4"], "common": "strategic_negotiation", "expansion": "qiongjiu_ruined_gem", "affinity": ["qiongjiu_aff_atk"] }
}
```

- `critDmg` is the ⚠ config slot for research U1 (default behavior: single ×1.5 factor; `critDmg` only matters once U1 is resolved).
- `pctAtk` etc. feed the panel formula `(Σ flat) × (1 + Σ pct)` (research §3.8).

## 2. Weapon

```json
{
  "id": "jinshizou",
  "name": "Jinshizou",
  "rarity": "elite",
  "atkBase1": 53,
  "lvlCoefficient60": 18.4,
  "subStats": [{ "stat": "pctAtk", "value": 0.15 }],
  "skill": { "id": "jinshizou_skill", "calibrationStages": 6 }
}
```

Level value: `ceil(atkBase1 × coefficient/1000)` (research §3.9). Calibration raises the weapon skill level, not the white stats.

## 3. Skill

```json
{
  "id": "qiongjiu_basic",
  "name": "Fuse",
  "type": "basic",                    // basic | active | ultimate | passive | support
  "multiplier": 0.80,                 // fraction of final ATK
  "fixedDamage": null,
  "element": "physical",
  "range": 8, "aoe": false,
  "stabDamage": 2,
  "cooldown": 0,
  "confectanceCost": 0,
  "confectanceGain": null,            // explicit per-skill gain; null = none
  "appliesStatuses": [{ "status": "overburn", "duration": 2 }],
  "removesStatuses": [],
  "damageBonusSelf": 0,
  "hooks": []                          // passive hook ids this skill triggers (e.g. "support_attack_target")
}
```

Per skill type: `active1/active2` both `type: "active"`; ultimate `type: "ultimate"` (cost > 0 usually); passive is a `passive` block (below) rather than a direct damage skill when purely reactive.

## 4. Passive (reactive kit) — separate shape

```json
{
  "id": "qiongjiu_steady_plan",
  "triggers": ["onDamageDealt", "onAllySingleTargetHit"],
  "effects": [
    { "kind": "resource_gain", "resource": "confectance", "amount": 1 },
    { "kind": "conditional", "when": "target.noCover", "effect": { "kind": "damage_modifier", "additive": 0.10 } },
    { "kind": "support_attack", "skillRef": "qiongjiu_support", "perRoundMax": 3, "chainable": false }
  ]
}
```

`support_attack` emits a 0-cost attack (its own `qiongjiu_support` skill entry: 0.90 mult, +2 stab), consumes `perRoundMax` quota, never triggers other support attacks (research §3.14).

## 5. Effects (generic system, handoff §10)

`effect` union, discriminated on `kind`:

| kind | fields |
|---|---|
| `stat_modifier` | `stat (atk/hp/def/critRate/critDmg)`, `mode (flat|pct)`, `value` |
| `damage_modifier` | `additive` (goes in the one additive bracket) or `multiplicative` |
| `damage_reduction` | `value` (multiplicative) |
| `stability_modifier` | `mode (damage|reduction|flatCap)`, `value` |
| `status_application` | `statusId, duration, stacks, maxStacks, refreshOnApply, purgeable, tickAt` |
| `status_removal` | `purge (buffs|debuffs|all|statusId)`, `count` |
| `resource_gain` / `resource_cost` | `resource (confectance)`, `amount` or `all` |
| `cooldown_change` | `skillId, delta` |
| `additional_action` | `mode (extraAction|bonusAction)` |
| `fixed_damage` | `value` or `percentOfAtk` (DoT/溢火-style, no crit/DEF) |
| `conditional` | `when` (small predicate DSL: status present, cooldown 0, confectance ≥, hp <, target.noCover, **target.stabilityAboveZero — U5 boss passives**…), `effect` |
| `passive_trigger` | `event, skillRef, perRoundMax` (used for support/emergency/intercept/counter) |

Timing: every status carries `tickAt`: `ownActionEnd | roundEnd | ownTurnStart` — defaults to the research §3.10 recommended model, overridable per status until U7 is resolved in-game.

## 6. Status definitions (buffs / debuffs)

```json
{
  "id": "atk_up_ii",
  "name": "ATK Up II",
  "category": "buff",
  "stackable": false, "maxStacks": 1,
  "statMods": [{ "stat": "atk", "mode": "pct", "value": 0.15 }],
  "tickAt": "ownActionEnd", "purgeable": true
}
```

```json
{
  "id": "vuln_i",
  "name": "Vulnerable I",
  "category": "debuff",
  "tickAt": "ownActionEnd", "purgeable": true,
  "effect": { "kind": "damage_modifier", "additive": 0.10 }   // +10% damage taken, additive bracket
}
```

```json
{
  "id": "exposed",
  "name": "Exposed",
  "category": "state",
  "tickAt": "roundEnd", "purgeable": false,
  "effect": { "kind": "damage_modifier", "multiplicative": "@config.exposedDamageMult" },
  "suppresses": ["stabilityReduction"]
}
```

`exposed`: duration default 2 (research U4), damage multiplier from config (U3). DoT statuses (burn/acid) use `{ "kind": "fixed_damage", "percentOfAtk": 0.10, "tickAt": "actionEnd" }`.

## 7. Dummy (handoff §4)

```json
{
  "id": "training_dummy",
  "hp": 999999999,
  "defense": 0,
  "stability": 0,
  "weaknesses": [],
  "phase": null,
  "cover": "none"
}
```

All fields user-configurable except `cover` (always `"none"` in MVP). Stability recovery is a **confirmed fixed rule**, not a dummy option: broken stability is restored to max exactly 2 turns after the break (`STABILITY_RECOVERY_DELAY = 2`). Defaults per research §3.16/§3.7/§6.

## 8. Scenario (one simulation run)

```json
{
  "version": 1,
  "seed": 20260903,
  "turns": 7,
  "team": [
    { "character": { "$ref": "characters/qiongjiu.json" }, "build": { "weapon": { "id": "jinshizou", "level": 60, "calibration": 6 }, "keys": { "fixed": ["qiongjiu_fk1"], "common": "strategic_negotiation" }, "level": 60 } }
  ],
  "dummy": { "$ref": "dummies/training_dummy.json" },
  "apl": {
    "mode": "default",            // default | rotation | custom (list below)
    "rules": [
      { "condition": "ultimate.available", "action": "ultimate" },
      { "condition": "cooldown.any((s) => s.id==='qiongjiu_common_rail' && s.ready)", "action": "active1" },
      { "condition": "always", "action": "basic" }
    ]
  },
  "configOverrides": {            // research U-items: every engine default is overridable
    "critMultiplier": 1.5,
    "exposedDuration": 2,
    "exposedDamageMult": null,    // null = use data-dump value once verified; for MVP runs: set explicitly
    "confectanceMax": null, "confectanceStart": null,
    "cooldownModel": "endOfOwnTurn",              // U11: endOfOwnTurn | nextOwnTurnEnd
    "statusOverrides": {                          // U7/U8 + unverified status values
      "support_boost_ii": { "perStackValue": 0.1, "durationRounds": 1, "tickAt": "ownActionEnd" }
    },
    "buffTickModel": "ownActionEnd",
    "stabilityReduction": { "enabled": true, "damageMult": 0.4 }
  }
}
```

> **Duration cap (validation mode):** `turns` accepts integers **1–7** only
> (`MAX_TURNS = 7` in the engine). Anything outside — including 8+, 0,
> negatives, and non-integers — is **rejected with a validation error**, never
> clamped. The cap is a single constant in `src/engine/state.ts`, so it can be
> raised later without engine redesign. Fixed rotations operate normally within
> the 7-turn limit.

## 9. Combat log event (handoff §14)

```json
{
  "round": 2, "turn": 4, "unit": "qiongjiu", "action": "qiongjiu_common_rail", "actionType": "active",
  "target": "training_dummy",
  "baseDamage": 1200, "mitigatedDamage": 1100, "critical": true, "critMultiplier": 1.5,
  "weaknessExploited": ["heavy_ammo"], "phase": 1.0,
  "bonusBracket": 1.2, "reduction": 1.0,
  "stabilityDamage": 4, "targetStabilityAfter": 0, "exposed": true,
  "finalDamage": 1842,
  "confectance": { "before": 4, "after": 1, "cost": 3 },
  "cooldownAfter": { "qiongjiu_common_rail": 1 },
  "statusesApplied": [{ "id": "overburn", "stacks": 1, "duration": 2 }],
  "statusesExpired": []
}
```

## 10. Simulation results (handoff §15)

```json
{
  "turns": 10,
  "seed": 20260903,
  "totals": { "damage": 18342, "damagePerRound": 1834.2, "damagePerAction": 917.1, "actions": 20 },
  "byCharacter": [{ "id": "qiongjiu", "damage": 12481, "actions": 11 }],
  "bySource": [
    { "source": "basic", "damage": 2431 },
    { "source": "active", "damage": 10281 },
    { "source": "ultimate", "damage": 4923 },
    { "source": "passive", "damage": 707 }
  ],
  "summary": ["Turn 4 ... finalDamage 1842"],   // human-readable lines derived from the log
  "warnings": ["configOverrides.exposedDamageMult unset → Exposed damage bonus = default 0 (U3 pending in-game test)"]
}
```

`warnings` surfaces every UNKNOWN/UNCERTAIN value that was resolved from a model default rather than a verified value (research §4) — keeps accuracy-first honesty visible in every run.

## 11. Full example scenario (one self-contained file)

```json
{
  "version": 1,
  "seed": 1,
  "turns": 7,
  "team": [{
    "character": { "id": "qiongjiu", "level": 60, "base": { "atk": 1224, "hp": 2494, "def": 695, "stability": 9, "critRate": 0.2, "critDmg": 0.2 }, "phase": "burn" },
    "build": { "weapon": { "id": "jinshizou", "atkBase1": 53, "lvlCoefficient60": 18.4, "subStats": [{ "stat": "pctAtk", "value": 0.15 }] }, "keys": { "fixed": ["qiongjiu_fk1_concentration"] } },
    "skills": {
      "basic": { "id": "qiongjiu_basic", "multiplier": 0.8, "stabDamage": 2, "cooldown": 0, "element": "physical" },
      "active1": { "id": "qiongjiu_common_rail", "multiplier": 1.5, "stabDamage": 0, "cooldown": 1, "element": "burn" },
      "active2": { "id": "qiongjiu_guide_to_victory", "multiplier": 1.1, "stabDamage": 0, "cooldown": 1, "element": "burn", "appliesStatuses": [{ "status": "overburn", "duration": 2 }] },
      "ultimate": { "id": "qiongjiu_pressing_momentum", "multiplier": 0, "confectanceCost": 3, "cooldown": 0 },
      "passive": { "id": "qiongjiu_steady_plan", "triggers": ["onDamageDealt", "onAllySingleTargetHit"], "effects": [{ "kind": "resource_gain", "resource": "confectance", "amount": 1 }, { "kind": "support_attack", "skillRef": "qiongjiu_support", "perRoundMax": 3 }] },
      "qiongjiu_support": { "id": "qiongjiu_support", "multiplier": 0.9, "stabDamage": 2 }
    }
  }],
  "dummy": { "id": "training_dummy", "hp": 999999999, "defense": 0, "stability": 0, "weaknesses": [], "phase": null, "cover": "none" },
  "apl": { "mode": "default" },
  "configOverrides": { "critMultiplier": 1.5 }
}
```

---

## Notes for implementation

- Schemas are described here as JSON because game data should ship as JSON files (data-driven, handoff §5). The engine may instantiate typed classes (e.g. TypeScript interfaces) matching these shapes — no behavioral logic lives in the data layer.
- Additions for new characters must be **data-only**: a new character is 3 JSON files (character, weapon, skills/passive/keys) + status/effect definitions if it introduces new effects. A genuinely new effect kind is the only case that touches the engine (`effects` module), and it must be added with a test (handoff §17).
- Every UNKNOWN-sensitive field (`exposedDamageMult`, `confectanceMax`, `confectanceStart`, `critMultiplier`…) is expected to be pinned by the in-game test plan (`docs/research.md` §5) before data packs ship for real validation runs.