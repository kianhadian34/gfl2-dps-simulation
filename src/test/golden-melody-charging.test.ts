import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { createState } from "../engine/state.js";
import { applyStatus } from "../engine/statuses.js";
import { QIONGJIU } from "../data/qiongjiu.js";
import { REGISTRY } from "../data/registry.js";
import { customRegistry, makeAlly } from "./helpers.js";
import type { CharacterDef, Scenario, WeaponDef } from "../model/types.js";
import type { UnitState } from "../engine/state.js";

/**
 * GOLDEN MELODY C1 — CHARGING +10% Support Action damage (VALIDATED in-game 2026, controlled 1434).
 *
 * Evidence (research.md §3.9): QJ ATK 2683 · Support Action 90% · target DEF 5000 · No Cover ·
 * no weakness · Golden Melody C1, additives: Golden Melody Damage Dealt +10% · Out-of-Turn +10% ·
 * No-Cover +20% · Damage Up II +20% · Charging +10% → bucket 1.70
 *   ceil(2414.7 × 2683/7683 × 1.70) = ceil(1433.51) = **1434**
 *
 * IMPLEMENTED (2026): Golden Melody's C1 calibration Effect is active via `calibrationLevel: 1`
 * (`damageDealt` +10% enters the additive DMG% bucket for every attack; the `charging` counter
 * contributes +10% per stack on Support Actions ONLY — same bucket, no separate formula).
 * Charging +1 is granted by the buff-gain trigger when QJ GAINS A BUFF — here the Ultimate's
 * generic V5 `beforeSupportTrigger` applies Damage Up II to QJ before the support, so 1 Charging
 * stack is present for the support hit (then 1 stack is consumed by the Support Action). The
 * test-local clone strips the Ultimate Lv3's `appliesStatuses` (SB II ×3) so the observed no-SB II
 * bucket is reproduced; production data is untouched.
 *
 * Harness notes: Qiongjiu mirror (ATK 2683, non-crit, plain weapon stats) with the Golden Melody
 * calibration data retained and C1 activated; V6 (No-Cover +20%, Out-of-Turn +10%); the ally's hit
 * triggers the Support Action.
 */

function qjgm(): CharacterDef {
  const q = structuredClone(QIONGJIU);
  q.id = "qjgm";
  q.base = { ...q.base, atk: 2683, critRate: 0, critDmg: 0 };
  // No weapon on the character (weapons are scenario-equipped, 2026): Golden Melody C1 is
  // supplied via the member's `weaponId` + the fixture registry below.
  // Test-local clone only: drop the Ultimate's SB II ×3 grant (and the at-max extra stack) so
  // the observed no-SB II support bucket is reproducible; keep V5's beforeSupportTrigger (DU2).
  q.skills.ultimate.levels[3] = {
    ...q.skills.ultimate.levels[3],
    appliesStatuses: undefined,
    onCastAtMaxConfectance: undefined,
  };
  return q;
}

/**
 * Golden Melody fixture for this test file: ZERO stat contribution (so the mirror's panel
 * ATK stays 2683) but the REGISTERED calibration data intact (C1–C6). No baked-in
 * `calibrationLevel` — calibration is supplied by the member's `calibrationLevel: 1`
 * (equipped-weapon configuration) and resolved against the weapon's data.
 */
const GOLDEN_MELODY: WeaponDef = {
  ...REGISTRY.getWeapon("jinshizou")!,
  atkLvl1: 0,
  atkLvl60: 0,
  subStats: [],
  // The 975/1434 oracle runs were validated WITHOUT a Trait contribution (the controlled
  // in-game runs' Trait buffs did not enter those numbers); the Trait pool is nulled out
  // here ONLY so this fixture reproduces the exact oracles. Trait behavior is covered
  // separately in golden-melody-trait.test.ts.
  trait: undefined,
};

function scenario(): Scenario {
  return {
    version: 1,
    seed: 7,
    turns: 1,
    team: [
      { characterId: "qjgm", rotation: ["ultimate"], equippedFixedKeys: [], weaponId: "jinshizou", calibrationLevel: 1 },
      { characterId: "gm_ally", rotation: ["basic"], equippedFixedKeys: [] },
    ] as never,
    dummy: {
      id: "training_dummy",
      name: "Training Dummy",
      hp: 999999999,
      defense: 5000,
      stability: 65,
      weaknesses: [], // no weakness exploited
      phase: null,
      cover: "none", // No Cover
    },
    configOverrides: { fortificationLevel: 6 }, // V6: No-Cover +20% total, Out-of-Turn +10%; Ult Lv3 (V5 DU2)
  };
}

test("Golden Melody C1 Charging (VALIDATED 1434): Support bucket 1.70 = 0.10 GM-DD + 0.10 OoT + 0.20 No-Cover + 0.20 DU2 + 0.10 Charging", () => {
  const r = simulateScenario(scenario(), customRegistry({ qjgm: qjgm(), gm_ally: makeAlly("gm_ally", 1000) }, {}, { jinshizou: GOLDEN_MELODY }));
  const ev = r.log.find((e) => e.supportAttack === true)!;
  assert.ok(ev, "Qiongjiu's Support Action fired");
  assert.equal(ev.attackerAtk, 2683, "panel ATK 2683 (plain mirror, no keys/weapon)");
  assert.equal(ev.critical, false, "controlled non-crit run");
  assert.equal((ev.weaknessExploited ?? []).length, 0, "no weakness exploited");
  assert.ok(
    Math.abs(ev.bonusBracket - 1.7) < 1e-9,
    `bucket 1 + 0.10 GM-DD + 0.10 OoT + 0.20 No-Cover + 0.20 DU2 + 0.10 Charging = 1.70 (got ${ev.bonusBracket}; pre-weapon engine supplies only NC+OoT+DU2 = 1.50)`,
  );
  assert.equal(ev.finalDamage, 1434, "ceil(2414.7 × 2683/7683 × 1.70) = ceil(1433.51) = 1434 — the observed in-game number");
});

test("Golden Melody C1 Damage Dealt +10% (VALIDATED 975): own-turn Basic bucket 1.30 = 0.10 GM-DD + 0.20 No-Cover", () => {
  // No ally, no statuses, no Support Action — QJ's own-turn Basic only; V6 supplies No-Cover
  // +20%; the Golden Melody calibration's Damage Dealt +10% is the only other additive term
  // (Charging is support-scoped and there are no buff gains → weaponCharges stays 0).
  const r = simulateScenario(
    {
      version: 1,
      seed: 7,
      turns: 1,
      team: [{ characterId: "qjgm", rotation: ["basic"], equippedFixedKeys: [], weaponId: "jinshizou", calibrationLevel: 1 }],
      dummy: {
        id: "training_dummy",
        name: "Training Dummy",
        hp: 999999999,
        defense: 5000,
        stability: 65,
        weaknesses: [], // no weakness exploited
        phase: null,
        cover: "none", // No Cover
      },
      configOverrides: { fortificationLevel: 6 }, // V6: No-Cover +20% total
    },
    customRegistry({ qjgm: qjgm() }, {}, { jinshizou: GOLDEN_MELODY }),
  );
  const ev = r.log.find((e) => e.action === "qiongjiu_basic")!;
  assert.equal(ev.attackerAtk, 2683, "panel ATK 2683 (plain mirror stats, Golden Melody C1 effect active)");
  assert.equal(ev.critical, false, "controlled non-crit run");
  assert.equal((ev.weaknessExploited ?? []).length, 0, "no weakness exploited");
  assert.ok(
    Math.abs(ev.bonusBracket - 1.3) < 1e-9,
    `bucket 1 + 0.20 No-Cover + 0.10 Golden Melody Damage Dealt = 1.30 (got ${ev.bonusBracket})`,
  );
  assert.equal(ev.finalDamage, 975, "ceil(2146.4 × 2683/7683 × 1.30) = ceil(974.41) = 975 — the observed in-game number");
});

/** State helper: Qiongjiu mirror with Golden Melody equipped at the given calibration level. */
function charger(calibrationLevel: number) {
  const st = createState(
    {
      version: 1,
      seed: 1,
      turns: 1,
      team: [{ characterId: "qjgm", rotation: ["basic"], equippedFixedKeys: [], weaponId: "jinshizou", calibrationLevel }],
      dummy: { id: "d", name: "d", hp: 999999999, defense: 5000, stability: 65, weaknesses: [], phase: null, cover: "none" },
    },
    customRegistry({ qjgm: qjgm() }, {}, { jinshizou: GOLDEN_MELODY }),
    new Set(),
  );
  return { st, u: st.units[0] };
}

const gainBuff = (st: ReturnType<typeof createState>, u: UnitState, statusId: string) => applyStatus(st, u, { statusId });

test("Activation count (C1): each DISTINCT buff gain grants 1 Charging stack; two gains accumulate to the C1 cap (2)", () => {
  const { st, u } = charger(1);
  gainBuff(st, u, "damage_up_ii");
  assert.equal(u.weaponCharges, 1, "C1: first gain → +1");
  // Re-applying the SAME buff is a refresh (U8), not a new gain — only a DISTINCT buff gain stacks.
  gainBuff(st, u, "damage_up_ii");
  assert.equal(u.weaponCharges, 1, "same-buff refresh does NOT grant another stack");
  gainBuff(st, u, "support_boost_ii");
  assert.equal(u.weaponCharges, 2, "C1: second distinct gain → 2 (accumulates to maxStacks)");
});

test("Activation count (C5/C6): each buff gain grants 2 Charging stacks", () => {
  const c5 = charger(5);
  gainBuff(c5.st, c5.u, "damage_up_ii");
  assert.equal(c5.u.weaponCharges, 2, "C5: one gain → +2");
  const c6 = charger(6);
  gainBuff(c6.st, c6.u, "damage_up_ii");
  assert.equal(c6.u.weaponCharges, 2, "C6: one gain → +2");
});

test("Activation count (C6): gains clamp at the calibration maxStacks (4)", () => {
  const { st, u } = charger(6);
  gainBuff(st, u, "damage_up_ii");
  gainBuff(st, u, "support_boost_ii");
  assert.equal(u.weaponCharges, 4, "2 distinct gains × 2 stacks = 4");
  gainBuff(st, u, "stat_crit_rate_flat_test");
  assert.equal(u.weaponCharges, 4, "clamped at maxStacks 4 — no over-stacking");
});

test("Activation count: multiple buff gains accumulate per configuration; each Support Action still consumes exactly 1 stack (1434 / 1434 / 1434)", () => {
  // r1: QJ ult → ally basic → V5 applies DU2 (a NEW buff gain → +1 stack) → Support#1 uses 1.
  // QJ's DU2 expires at her OWN r2 action end (validated V5 timing) → r2 ally basic re-gains
  // DU2 (fresh gain → +1) → Support#2 uses 1. r3 behaves like r2 → 1434 again.
  // The 1.70 bucket (with exactly ONE charging stack) each round is the proof: had a stack
  // NOT been consumed, r2 would carry the r1 stack + r2 gain → 2 stacks → bucket 1.90 → 1602.
  const r = simulateScenario(
    {
      version: 1,
      seed: 7,
      turns: 3,
      team: [
        { characterId: "qjgm", rotation: ["ultimate", "basic", "basic"], equippedFixedKeys: [], weaponId: "jinshizou", calibrationLevel: 1 },
        { characterId: "gm_ally", rotation: ["basic", "basic", "basic"], equippedFixedKeys: [] },
      ] as never,
      dummy: {
        id: "training_dummy",
        name: "Training Dummy",
        hp: 999999999,
        defense: 5000,
        stability: 65,
        weaknesses: [],
        phase: null,
        cover: "none",
      },
      configOverrides: { fortificationLevel: 6 },
    },
    customRegistry({ qjgm: qjgm(), gm_ally: makeAlly("gm_ally", 1000) }, {}, { jinshizou: GOLDEN_MELODY }),
  );
  const sup = r.log.filter((e) => e.supportAttack === true);
  assert.equal(sup.length, 3, "one Support Action per round");
  for (const s of sup) {
    assert.ok(Math.abs(s.bonusBracket - 1.7) < 1e-9, `bucket 1.70 with exactly one charging stack (got ${s.bonusBracket})`);
    assert.equal(s.finalDamage, 1434, "each round re-arms +1 then consumes exactly 1");
  }
});
