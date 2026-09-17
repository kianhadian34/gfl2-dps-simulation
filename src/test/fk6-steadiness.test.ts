import { test } from "node:test";
import assert from "node:assert/strict";
import { displacementImmunityActive } from "../engine/simulation.js";
import { QIONGJIU } from "../data/qiongjiu.js";
import { STATUS_DEFS } from "../data/statuses.js";
import type { UnitState } from "../engine/state.js";
import type { KeyDef } from "../model/types.js";

/**
 * FIXED KEY 6: Steadiness (condition VALIDATED in-game 2026):
 * "While under the effect of Support Boost, gain immunity to displacement effects applied by
 * enemy units." "Under the effect of Support Boost" = any ACTIVE Support Boost buff — Support
 * Boost I, the +30% Support Boost I variant, and Support Boost II all satisfy the condition.
 * With an active Support Boost the holder is immune to enemy-applied displacement; without it
 * the immunity is off. The gate (`displacementImmunityActive`) is read-only: it never consumes,
 * alters, extends, or refreshes Support Boost. MVP boundary: there is no enemy displacement
 * applier yet — the gate is the condition such an application would check (no speculative
 * displacement infrastructure was added; tests pin the condition matrix directly).
 */

const FK6 = "qiongjiu_fk6_steadiness";

function holder(statuses: Array<{ statusId: string }>, equipped?: boolean): UnitState {
  const fk6 = QIONGJIU.fixedKeys.find((k) => k.id === FK6)!;
  return {
    id: "qjf6",
    equippedKeys: equipped ? [FK6] : [],
    statuses: statuses.map((s) => ({ statusId: s.statusId, stacks: 1, durationLeft: 1 })),
    def: { fixedKeys: [fk6] },
  } as unknown as UnitState;
}

test("FK6 + Support Boost I active → immune to enemy displacement", () => {
  assert.equal(displacementImmunityActive(holder([{ statusId: "support_boost_i" }], true)), true);
});

test("FK6 + Support Boost I (+30% variant) active → immune", () => {
  assert.equal(displacementImmunityActive(holder([{ statusId: "support_boost_i_30" }], true)), true);
});

test("FK6 + Support Boost II active → immune", () => {
  assert.equal(displacementImmunityActive(holder([{ statusId: "support_boost_ii" }], true)), true);
});

test("FK6 equipped but NO Support Boost → not immune (normal enemy displacement applies)", () => {
  assert.equal(displacementImmunityActive(holder([], true)), false);
  assert.equal(displacementImmunityActive(holder([{ statusId: "stat_def_down_ii_pct" }], true)), false, "unrelated buffs do not satisfy the condition");
});

test("FK6 NOT equipped + Support Boost active → not immune (normal enemy displacement applies)", () => {
  assert.equal(displacementImmunityActive(holder([{ statusId: "support_boost_i" }], false)), false);
  assert.equal(displacementImmunityActive(holder([{ statusId: "support_boost_ii" }], false)), false);
});

test("Support Boost consumed/removed → immunity is no longer active", () => {
  const active = holder([{ statusId: "support_boost_i" }], true);
  assert.equal(displacementImmunityActive(active), true);
  // SB I's own consumption semantics remove the buff when the last stack is used; the gate must
  // simply follow the buff's presence: with the status gone, immunity is gone too.
  const consumed: UnitState = { ...active, statuses: [] };
  assert.equal(displacementImmunityActive(consumed), false, "after the Support Boost is removed the immunity is off");
  const downgraded = holder([{ statusId: "support_boost_ii" }], true);
  assert.equal(displacementImmunityActive(downgraded), true);
  assert.equal(displacementImmunityActive({ ...downgraded, statuses: [] }), false);
});

test("FK6 data pins: all three Support Boost ids satisfy the condition; Support Boost definitions unchanged", () => {
  const fk6: KeyDef = QIONGJIU.fixedKeys.find((k) => k.id === FK6)!;
  assert.equal(fk6.deferredNote, undefined, "FK6 no longer deferred");
  assert.deepEqual(fk6.displacementImmunityWhenStatuses, ["support_boost_i", "support_boost_i_30", "support_boost_ii"]);
  assert.deepEqual(fk6.battleStartEffects, [], "FK6 adds no battle-start effect");
  // Support Boost I/II definitions are untouched (their damage effects and activation behavior):
  const sbI = STATUS_DEFS.find((s) => s.id === "support_boost_i")!;
  const sbI30 = STATUS_DEFS.find((s) => s.id === "support_boost_i_30")!;
  const sbII = STATUS_DEFS.find((s) => s.id === "support_boost_ii")!;
  for (const sb of [sbI, sbI30, sbII]) {
    assert.ok(sb.effects.length > 0, `${sb.id} keeps its effects (damage/activation unchanged)`);
    assert.equal(sb.purgeable, false, `${sb.id} un-cleansable (Support Boost behavior unchanged)`);
    assert.equal(sb.consumeOneOnUse, true, `${sb.id} consume-one-on-use unchanged`);
  }
});