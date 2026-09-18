import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { QIONGJIU } from "../data/qiongjiu.js";
import { customRegistry, makeAlly } from "./helpers.js";
import type { CharacterDef, Scenario } from "../model/types.js";

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
  // Plain weapon STATS (panel ATK == 2683) but Golden Melody's calibration Effect retained and C1
  // ACTIVATED (calibrationLevel: 1) — matches the validated controlled setup.
  q.weapon = { ...q.weapon, atkLvl1: 0, atkLvl60: 0, subStats: [], calibrationLevel: 1 };
  // Test-local clone only: drop the Ultimate's SB II ×3 grant (and the at-max extra stack) so
  // the observed no-SB II support bucket is reproducible; keep V5's beforeSupportTrigger (DU2).
  q.skills.ultimate.levels[3] = {
    ...q.skills.ultimate.levels[3],
    appliesStatuses: undefined,
    onCastAtMaxConfectance: undefined,
  };
  return q;
}

function scenario(): Scenario {
  return {
    version: 1,
    seed: 7,
    turns: 1,
    team: [
      { characterId: "qjgm", rotation: ["ultimate"], equippedFixedKeys: [] },
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
  const r = simulateScenario(scenario(), customRegistry({ qjgm: qjgm(), gm_ally: makeAlly("gm_ally", 1000) }));
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