import { test } from "node:test";
import assert from "node:assert/strict";
import { QIONGJIU } from "../data/qiongjiu.js";
import { REGISTRY } from "../data/registry.js";

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

test("FK4–FK6 record the exact behaviors but explicitly defer unimplemented engine mechanics (FK2/FK3/FK4/FK5 are implemented)", () => {
  const implemented = new Set(["qiongjiu_fk1_concentration", "qiongjiu_fk2_efficient_planning", "qiongjiu_fk3_targeted_training", "qiongjiu_fk4_point_of_vulnerability", "qiongjiu_fk5_necessary_adjustments", "qiongjiu_fk6_steadiness"]);
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
  // Fixed Key 5: Necessary Adjustments (VALIDATED 2026, Common Rail phase-weakness → Blazing Assault II): implemented.
  const fk5 = QIONGJIU.fixedKeys.find((k) => k.id === "qiongjiu_fk5_necessary_adjustments")!;
  assert.equal(fk5.deferredNote, undefined, "FK5 no longer deferred");
  assert.equal(fk5.phaseWeaknessExploitStatuses?.ability, "active1");
  assert.equal(fk5.phaseWeaknessExploitStatuses?.statuses[0].statusId, "blazing_assault_ii");
  // Fixed Key 6: Steadiness (VALIDATED 2026, Support-Boost-gated displacement immunity): implemented.
  const fk6 = QIONGJIU.fixedKeys.find((k) => k.id === "qiongjiu_fk6_steadiness")!;
  assert.equal(fk6.deferredNote, undefined, "FK6 no longer deferred");
  assert.deepEqual(fk6.displacementImmunityWhenStatuses, ["support_boost_i", "support_boost_i_30", "support_boost_ii"]);
});

test("Support Action range = 8 tiles — explicit MVP modeling decision, NOT an in-game-validated value", () => {
  const sup = QIONGJIU.skills.support!.levels[1];
  assert.equal(sup.range, 8, "Support Action range is 8 tiles (Manhattan) — MVP decision, not validated");
  // The MVP engine has NO range check: the value is declarative data only (in-range assumed),
  // so this pin documents the modeling choice without implying any engine behavior change.
});

test("Expansion Key Ruined Gem is recorded (VALIDATED 2026 facts) and now IMPLEMENTED (no deferral)", () => {
  // Validated in-game evidence (2026), recorded in docs and implemented: (1) Support Action
  // damage type changes from Physical/phase-less to Burn (`supportElementOverride`); (2) +15%
  // damage applies when the target has Overburn (`supportTargetStatusDealtBonus`); (3) additive
  // in the same DMG% bucket — direct match 934 (bucket 0.20+0.20+0.10+0.15 = 1.65 · Burn ×1.10).
  assert.equal(QIONGJIU.expansionKey?.id, "qiongjiu_exp_ruined_gem");
  assert.equal(QIONGJIU.expansionKey?.name, "Ruined Gem");
  assert.equal(QIONGJIU.expansionKey?.verified, true);
  assert.deepEqual(QIONGJIU.expansionKey?.battleStartEffects, []);
  assert.match(QIONGJIU.expansionKey?.description ?? "", /Burn/);
  assert.match(QIONGJIU.expansionKey?.description ?? "", /15%/);
  assert.equal(QIONGJIU.expansionKey?.supportElementOverride, "burn", "Support Action effective element becomes Burn while equipped (base support skill untouched)");
  assert.deepEqual(QIONGJIU.expansionKey?.supportTargetStatusDealtBonus, { statusId: "overburn", value: 0.15 }, "+15% vs Burn-debuff target, additive in the DMG% bucket");
  assert.equal(QIONGJIU.expansionKey?.deferredNote, undefined, "Ruined Gem no longer deferred (implemented)");
});

test("Affinity Key Warm as Jade: 9 levels, exactly levels 5 and 9 defined, no interpolation", () => {
  const af = QIONGJIU.affinityKey;
  assert.equal(af?.id, "qiongjiu_affinity_warm_as_jade");
  assert.equal(af?.name, "Warm as Jade");
  assert.equal(af?.totalLevels, 9);
  assert.deepEqual(Object.keys(af?.levels ?? {}).map(Number).sort(), [5, 9]);
  assert.deepEqual(af?.levels[5], { critDmg: 0.033, atk: 0.033, hp: 0.033 });
  assert.deepEqual(af?.levels[9], { critDmg: 0.045, atk: 0.045, hp: 0.045 });
  assert.equal(af?.deferredNote, undefined, "Warm as Jade no longer deferred (implemented)");
  assert.deepEqual(af?.genericBonus, { atk: 0.03, hp: 0.03 }, "foreign-key generic +3% stat bonus (ATK/HP) — VALIDATED 2026");
});

test("Common Key Strategic Negotiation: Universal Key: Skill with the validated +5%/+5%/+5%/+7% stats", () => {
  const ck = REGISTRY.getCommonKey("qiongjiu_common_strategic_negotiation")!;
  assert.equal(ck.id, "qiongjiu_common_strategic_negotiation");
  assert.equal(ck.name, "Strategic Negotiation");
  assert.equal(ck.type, "Universal Key: Skill");
  assert.equal(ck.verified, true);
  assert.ok(ck.description && ck.description.length > 0);
  assert.equal(ck.edition, undefined, "SN edition unknown — not invented");
  assert.deepEqual(ck.stats, { atkPct: 0.05, critRate: 0.05, critDmg: 0.05, outOfTurnDmg: 0.07 });
  assert.equal("commonKey" in QIONGJIU, false, "Common Keys are REUSABLE registry definitions — not embedded in CharacterDef (2026)");
});