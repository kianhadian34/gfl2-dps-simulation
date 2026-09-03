import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { computePanel, weaponAtk } from "../engine/state.js";
import { QJ } from "./helpers.js";

test("panel stats: weapon ATK adds to base, ATK% multiplies the flat sum (research §3.8)", () => {
  assert.equal(weaponAtk(QJ), 369); // 金石奏 60
  const panel = computePanel(QJ);
  assert.ok(Math.abs(panel.atk - (1224 + 369) * 1.15) < 1e-9, `panel.atk=${panel.atk}`);
  assert.equal(panel.def, 695);
  assert.equal(panel.hp, 2494);
});

test("integration: 7-round fixed rotation (MVP cap), all aggregations consistent, warnings surfaced", () => {
  const r = simulateScenario({
    version: 1,
    seed: 20260903,
    turns: 7,
    team: [{ characterId: "qiongjiu", rotation: ["ultimate", "active1", "active2", "basic"], equippedFixedKeys: ["qiongjiu_fk1_concentration"] }],
    dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 0, stability: 0, weaknesses: [], phase: null, cover: "none" },
  });

  // One main action per round (solo team, no supports).
  assert.equal(r.totals.actions, 7);
  assert.equal(r.log.length, 7);

  // Exact rotation execution: ultimate re-casts whenever Confectance (3) covers the cost.
  // FK1 start 3 → r1 ult (0); dmg gains +1: r2 1, r3 2, r4 3; r5 ult again…
  assert.deepEqual(
    r.log.map((e) => e.action),
    [
      "qiongjiu_pressing_momentum",
      "qiongjiu_common_rail",
      "qiongjiu_guide_to_victory",
      "qiongjiu_basic",
      "qiongjiu_pressing_momentum",
      "qiongjiu_common_rail",
      "qiongjiu_guide_to_victory",
    ],
  );

  // Aggregations must agree with the log.
  const logSum = r.log.reduce((a, e) => a + e.finalDamage, 0);
  assert.equal(r.totals.damage, logSum);
  assert.equal(r.byCharacter.length, 1);
  assert.equal(r.byCharacter[0].id, "qiongjiu");
  assert.equal(r.byCharacter[0].damage, logSum);
  assert.equal(r.byCharacter[0].actions, 7);
  const sourceSum = r.bySource.reduce((a, s) => a + s.damage, 0);
  assert.equal(sourceSum, logSum);
  assert.deepEqual(
    r.bySource.map((s) => s.source).sort(),
    ["active", "basic", "ultimate"],
  );

  // Log detail: every damaging action records its damage-pipeline inputs for
  // comparison against an in-game test (attacker ATK, target DEF, bracket…).
  for (const e of r.log) {
    if (e.action === "qiongjiu_pressing_momentum") continue; // no damage
    assert.equal(typeof e.attackerAtk, "number");
    assert.equal(typeof e.targetDef, "number");
    assert.equal(typeof e.bonusBracket, "number");
    assert.equal(typeof e.mitigatedDamage, "number");
  }

  // Determinism (explicit seed).
  const r2 = simulateScenario({
    version: 1,
    seed: 20260903,
    turns: 7,
    team: [{ characterId: "qiongjiu", rotation: ["ultimate", "active1", "active2", "basic"], equippedFixedKeys: ["qiongjiu_fk1_concentration"] }],
    dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 0, stability: 0, weaknesses: [], phase: null, cover: "none" },
  });
  assert.equal(JSON.stringify(r.log), JSON.stringify(r2.log));

  // Accuracy-first: the run must WARN about every unverified value it leans on.
  for (const needle of ["confectanceMax", "critMultiplier", "support_boost_ii", "support_boost_i", "cooldown model"]) {
    assert.ok(r.warnings.some((w) => w.includes(needle)), `expected a warning mentioning "${needle}"`);
  }
});

test("validation: unknown character and non-empty rotations are rejected", () => {
  assert.throws(() =>
    simulateScenario({
      version: 1,
      seed: 1,
      turns: 1,
      team: [{ characterId: "nobody", rotation: ["basic"] }],
      dummy: { id: "d", name: "d", hp: 1, defense: 0, stability: 0, weaknesses: [], phase: null, cover: "none" },
    }),
  );
  assert.throws(() =>
    simulateScenario({
      version: 1,
      seed: 1,
      turns: 1,
      team: [{ characterId: "qiongjiu", rotation: [] }],
      dummy: { id: "d", name: "d", hp: 1, defense: 0, stability: 0, weaknesses: [], phase: null, cover: "none" },
    }),
  );
});