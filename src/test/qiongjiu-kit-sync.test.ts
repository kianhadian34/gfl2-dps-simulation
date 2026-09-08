import { test } from "node:test";
import assert from "node:assert/strict";
import { createState } from "../engine/state.js";
import { REGISTRY } from "../data/registry.js";
import { QIONGJIU } from "../data/qiongjiu.js";
import { scenario } from "./helpers.js";

function qjState(fLevel: number) {
  return createState(scenario({ turns: 1, rotation: ["basic"], config: { fortificationLevel: fLevel } }), REGISTRY, new Set());
}

test("QJ Basic Attack is Level 1 at Fortification 0 and at V6 (never upgraded)", () => {
  assert.equal(qjState(0).units[0].skillLevels.basic, 1);
  assert.equal(qjState(6).units[0].skillLevels.basic, 1);
  assert.deepEqual(Object.keys(QIONGJIU.skills.basic.levels).map(Number), [1]); // Lv1 only
});

test("Common Rail Lv1 = 150% ATK / Stability 3 (authoritative), and V1 → Lv2 (deferred kill behavior, no multiplier change)", () => {
  const lv1 = QIONGJIU.skills.active1.levels[1];
  assert.equal(lv1.multiplier, 1.5);
  assert.equal(lv1.stabDamage, 3);
  assert.equal(lv1.element, "burn");
  assert.equal(qjState(0).units[0].skillLevels.active1, 1);
  assert.equal(qjState(1).units[0].skillLevels.active1, 2); // V1 → Common Rail Lv2
  const lv2 = QIONGJIU.skills.active1.levels[2];
  assert.equal(lv2.multiplier, 1.5); // no multiplier change at Lv2
  assert.match(lv2.deferredNote ?? "", /kill/);
});

test("Guide to Victory Lv1 Stability = 3 (corrected from 0), and V2 → Lv2 (deferred +100% crit vs Overburn)", () => {
  const lv1 = QIONGJIU.skills.active2.levels[1];
  assert.equal(lv1.stabDamage, 3);
  assert.equal(lv1.multiplier, 1.1);
  assert.equal(qjState(2).units[0].skillLevels.active2, 2); // V2 → Guide to Victory Lv2
  assert.match(QIONGJIU.skills.active2.levels[2].deferredNote ?? "", /critical rate/);
});

test("Steady Plan is level-aware (Lv1/Lv2/Lv3) with the V1–V6 Fortification map", () => {
  const map = QIONGJIU.fortificationMap ?? [];
  assert.deepEqual(map, [
    { v: 1, ability: "active1", toLevel: 2 },
    { v: 2, ability: "active2", toLevel: 2 },
    { v: 3, ability: "passive", toLevel: 2 },
    { v: 4, ability: "ultimate", toLevel: 2 },
    { v: 5, ability: "ultimate", toLevel: 3 },
    { v: 6, ability: "passive", toLevel: 3 },
  ]);
  const levels = QIONGJIU.passive.levels ?? {};
  assert.deepEqual(Object.keys(levels).map(Number).sort(), [1, 2, 3]);
});

test("V3 → Steady Plan Lv2 and V6 → Steady Plan Lv3 resolve the passive's effect list", () => {
  const res0 = qjState(0).units[0].passives;
  const res3 = qjState(3).units[0].passives;
  const res6 = qjState(6).units[0].passives;
  assert.equal(res0, QIONGJIU.passive.levels?.[1]); // V0 → Lv1 list
  assert.equal(res3, QIONGJIU.passive.levels?.[2]); // V3 → Lv2 list
  assert.equal(res6, QIONGJIU.passive.levels?.[3]); // V6 → Lv3 list
});

test("Steady Plan Lv3 carries a SECOND +10% No-Cover component (not collapsed); Lv2 defers its additions", () => {
  const lv1NoCover = (QIONGJIU.passive.levels?.[1] ?? []).filter((e) => e.kind === "conditional_damage_modifier" && e.when === "target.noCover").length;
  const lv3NoCover = (QIONGJIU.passive.levels?.[3] ?? []).filter((e) => e.kind === "conditional_damage_modifier" && e.when === "target.noCover").length;
  assert.equal(lv1NoCover, 1);
  assert.equal(lv3NoCover, 2); // Lv1 component + Lv3 component, kept separate
  assert.ok(QIONGJIU.passive.deferredNotes?.[2]?.includes("Overburn"));
  assert.ok(QIONGJIU.passive.deferredNotes?.[3]?.includes("10%"));
});

test("Ultimate: V4 → Lv2 and V5 → Lv3 (both deferred-annotated, same executable base as Lv1)", () => {
  assert.equal(qjState(4).units[0].skillLevels.ultimate, 2);
  assert.equal(qjState(5).units[0].skillLevels.ultimate, 3);
  assert.match(QIONGJIU.skills.ultimate.levels[2].deferredNote ?? "", /Vulnerable/);
  assert.match(QIONGJIU.skills.ultimate.levels[3].deferredNote ?? "", /Damage Up II/);
});

test("Vulnerable I = +10% damage taken, defense debuff; Damage Up II = +20% damage dealt, buff", () => {
  const vul = REGISTRY.getStatus("vulnerable_i");
  const dmgUp = REGISTRY.getStatus("damage_up_ii");
  assert.equal(vul?.category, "debuff");
  assert.deepEqual(vul?.effects, [{ kind: "damage_modifier", scope: "taken", mode: "additive", value: 0.1 }]);
  assert.equal(dmgUp?.category, "buff");
  assert.deepEqual(dmgUp?.effects, [{ kind: "damage_modifier", scope: "dealt", mode: "additive", value: 0.2 }]);
});