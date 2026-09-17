import { test } from "node:test";
import assert from "node:assert/strict";
import { QIONGJIU } from "../data/qiongjiu.js";

const FIXED_IDS = [
  "qiongjiu_fk1_concentration",
  "qiongjiu_fk2_efficient_planning",
  "qiongjiu_fk3_targeted_training",
  "qiongjiu_fk4_point_of_vulnerability",
  "qiongjiu_fk5_necessary_adjustments",
  "qiongjiu_fk6_steadiness",
];

test("Qiongjiu records all six Fixed Keys with panel names and descriptions", () => {
  assert.deepEqual(QIONGJIU.fixedKeys.map((k) => k.id), FIXED_IDS);
  assert.equal(QIONGJIU.fixedKeys[0].name, "Concentration (凝神)");
  assert.equal(QIONGJIU.fixedKeys[1].name, "Efficient Planning");
  assert.equal(QIONGJIU.fixedKeys[2].name, "Targeted Training");
  assert.equal(QIONGJIU.fixedKeys[3].name, "Point of Vulnerability");
  assert.equal(QIONGJIU.fixedKeys[4].name, "Necessary Adjustments");
  assert.equal(QIONGJIU.fixedKeys[5].name, "Steadiness");
  for (const k of QIONGJIU.fixedKeys) {
    assert.ok(k.description && k.description.length > 0, `${k.id} has a description`);
  }
});

test("FK1 Concentration grants +3 Confectance at battle start", () => {
  const fk1 = QIONGJIU.fixedKeys[0];
  assert.deepEqual(fk1.battleStartEffects, [{ resource: "confectance", amount: 3 }]);
  assert.equal(fk1.verified, true);
});

test("FK4–FK6 record the exact behaviors but explicitly defer unimplemented engine mechanics (FK2/FK3 are implemented)", () => {
  const implemented = new Set(["qiongjiu_fk1_concentration", "qiongjiu_fk2_efficient_planning", "qiongjiu_fk3_targeted_training", "qiongjiu_fk4_point_of_vulnerability"]);
  const deferred = QIONGJIU.fixedKeys.filter((k) => !implemented.has(k.id));
  for (const k of deferred) {
    assert.deepEqual(k.battleStartEffects, [], `${k.id} has no battle-start effect`);
    assert.ok(k.deferredNote && k.deferredNote.length > 0, `${k.id} documents its deferral`);
    assert.equal(k.verified, true);
  }
  // Fixed Key 2: Efficient Planning (VALIDATED 2026, cleanse-on-support): implemented.
  const fk2 = QIONGJIU.fixedKeys.find((k) => k.id === "qiongjiu_fk2_efficient_planning")!;
  assert.equal(fk2.deferredNote, undefined, "FK2 no longer deferred");
  assert.equal(fk2.supportActionCleanse, 1);
  // Fixed Key 3: Targeted Training (VALIDATED 2026, pre-allied-attack DEF Down II): implemented.
  const fk3 = QIONGJIU.fixedKeys.find((k) => k.id === "qiongjiu_fk3_targeted_training")!;
  assert.equal(fk3.deferredNote, undefined, "FK3 no longer deferred");
  assert.equal(fk3.alliedAttackDefDown?.statusId, "stat_def_down_ii_pct");
  assert.equal(fk3.alliedAttackDefDown?.durationRounds, 1);
  // Fixed Key 4: Point of Vulnerability (VALIDATED 2026, Guide line multi-target): implemented.
  const fk4 = QIONGJIU.fixedKeys.find((k) => k.id === "qiongjiu_fk4_point_of_vulnerability")!;
  assert.equal(fk4.deferredNote, undefined, "FK4 no longer deferred");
  assert.equal(fk4.pointOfVulnerabilityLine, true);
});

test("Expansion Key Ruined Gem is recorded with its deferral", () => {
  assert.equal(QIONGJIU.expansionKey?.id, "qiongjiu_exp_ruined_gem");
  assert.equal(QIONGJIU.expansionKey?.name, "Ruined Gem");
  assert.match(QIONGJIU.expansionKey?.description ?? "", /Burn/);
  assert.match(QIONGJIU.expansionKey?.description ?? "", /15%/);
  assert.ok(QIONGJIU.expansionKey?.deferredNote, "expansion key documents deferral (Burn damage type mutation + target-has-Burn-debuff condition)");
});

test("Affinity Key Warm as Jade: 9 levels, exactly levels 5 and 9 defined, no interpolation", () => {
  const af = QIONGJIU.affinityKey;
  assert.equal(af?.id, "qiongjiu_affinity_warm_as_jade");
  assert.equal(af?.name, "Warm as Jade");
  assert.equal(af?.totalLevels, 9);
  assert.deepEqual(Object.keys(af?.levels ?? {}).map(Number).sort(), [5, 9]);
  assert.deepEqual(af?.levels[5], { critDmg: 0.033, atk: 0.033, hp: 0.033 });
  assert.deepEqual(af?.levels[9], { critDmg: 0.045, atk: 0.045, hp: 0.045 });
  assert.ok(af?.deferredNote, "affinity key documents deferral of engine consumption");
});