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

test("Steady Plan: No-Cover is +10% at Lv1/V3 and a SINGLE +20% total at V6 (cumulative); Lv2/Lv3 carry the support +10% + after-support Overburn", () => {
  const nc = (lv: number) => (QIONGJIU.passive.levels?.[lv] ?? []).filter((e) => e.kind === "conditional_damage_modifier" && e.when === "target.noCover");
  assert.equal(nc(1).length, 1);
  assert.equal((nc(1)[0] as { value: number }).value, 0.1);
  assert.equal(nc(2).length, 1);
  assert.equal((nc(2)[0] as { value: number }).value, 0.1);
  assert.equal(nc(3).length, 1); // SINGLE +20% TOTAL per the V6 screenshot (never two +10%, never +30%)
  assert.equal((nc(3)[0] as { value: number }).value, 0.2);
  // Cumulative V3/V6 additions are present at BOTH ranks (support +10% + after-support Overburn).
  for (const lv of [2, 3] as const) {
    const list = QIONGJIU.passive.levels?.[lv] ?? [];
    assert.equal(list.filter((e) => e.kind === "conditional_damage_modifier" && e.actions === "support").length, 1, `Lv${lv} support +10%`);
    const after = list.filter((e) => e.kind === "after_support_status" && e.statusId === "overburn" && e.durationRounds === 2);
    assert.equal(after.length, 1, `Lv${lv} after-support Overburn`);
  }
});

test("Ultimate: V4 → Lv2 (before-support Vulnerable I) and V5 → Lv3 (before-trigger Damage Up II) both IMPLEMENTED", () => {
  assert.equal(qjState(4).units[0].skillLevels.ultimate, 2);
  assert.equal(qjState(5).units[0].skillLevels.ultimate, 3);
  // V4: no longer a placeholder — declares the before-support Vulnerable I application.
  assert.equal(QIONGJIU.skills.ultimate.levels[2].deferredNote, undefined, "V4 deferredNote must be gone (implemented)");
  assert.deepEqual(QIONGJIU.skills.ultimate.levels[2].beforeSupportStatuses, [
    { statusId: "vulnerable_i", durationRounds: 1, target: "target" },
  ]);
  // V5: implemented — declares the before-trigger Damage Up II (owner + triggering ally), 1 turn.
  assert.equal(QIONGJIU.skills.ultimate.levels[3].deferredNote, undefined, "V5 deferredNote must be gone (implemented)");
  assert.deepEqual(QIONGJIU.skills.ultimate.levels[3].beforeSupportTrigger, {
    owner: [{ statusId: "damage_up_ii", durationRounds: 1 }],
    triggeringAlly: [{ statusId: "damage_up_ii", durationRounds: 1 }],
  });
});

test("Vulnerable I = +10% damage taken, defense debuff; Damage Up II = +20% damage dealt, buff", () => {
  const vul = REGISTRY.getStatus("vulnerable_i");
  const dmgUp = REGISTRY.getStatus("damage_up_ii");
  assert.equal(vul?.category, "debuff");
  assert.deepEqual(vul?.effects, [{ kind: "damage_modifier", scope: "taken", mode: "additive", value: 0.1 }]);
  assert.equal(dmgUp?.category, "buff");
  assert.deepEqual(dmgUp?.effects, [{ kind: "damage_modifier", scope: "dealt", mode: "additive", value: 0.2 }]);
});