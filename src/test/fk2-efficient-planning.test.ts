import { test } from "node:test";
import assert from "node:assert/strict";
import { createState } from "../engine/state.js";
import { applyStatus, cleanseDispellable } from "../engine/statuses.js";
import { simulateScenario } from "../simulate.js";
import { REGISTRY } from "../data/registry.js";
import { abilities, customRegistry, makeAlly, scenario } from "./helpers.js";
import type { CharacterDef, SkillDefVariant } from "../model/types.js";

/**
 * FIXED KEY 2 — Efficient Planning (VALIDATED in-game 2026):
 * "Before Support Action, cleanse 1 buff from the target."
 *  - Happens immediately BEFORE the Support Action damage.
 *  - Removes exactly 1 dispellable target buff (StatusDef.purgeable); nothing when none.
 *  - Priority across several qualifying buffs is UNSPECIFIED (existing status-list order only —
 *    no invented rule). Implemented via the generic `cleanseDispellable` + `KeyDef.supportActionCleanse`.
 */

/** Ally whose basic applies N purgeable BUFFS (damage_up_ii / fixed_dmg_buff) to the dummy. */
function buffAlly(count: 1 | 2): CharacterDef {
  const base = makeAlly("ally", 900);
  const statuses: Array<{ statusId: string; durationRounds: number; target: "target" }> = [
    ...(count >= 1 ? [{ statusId: "damage_up_ii", durationRounds: 3, target: "target" as const }] : []),
    ...(count >= 2 ? [{ statusId: "fixed_dmg_buff", durationRounds: 3, target: "target" as const }] : []),
  ];
  const basic: SkillDefVariant = {
    id: "ally_basic", name: "Ally Hit", type: "basic", element: null, multiplier: 1.0, stabDamage: 1, cooldown: 0, confectanceCost: 0, appliesStatuses: statuses,
  };
  const noop: SkillDefVariant = { ...basic, id: "ally_noop", multiplier: 0, appliesStatuses: undefined };
  return {
    ...base,
    id: "ally",
    skills: abilities({ basic, active1: noop, active2: noop, ultimate: noop }),
  };
}

function fk2Run(count: 1 | 2, withKey: boolean) {
  const team = [
    { characterId: "ally", rotation: ["basic", "basic"], equippedFixedKeys: [] },
    { characterId: "qiongjiu", rotation: ["basic", "basic"], equippedFixedKeys: withKey ? ["qiongjiu_fk2_efficient_planning"] : [] },
  ];
  // Ally first: its basic applies the buff(s) on round 1, which Qiongjiu's triggered Support Action then sees.
  const r = simulateScenario(
    {
      version: 1, seed: 7, turns: 2,
      team: team as never,
      dummy: { id: "d", name: "d", hp: 999999999, defense: 5000, stability: 65, weaknesses: [], phase: null, cover: "none" },
    },
    customRegistry({ ally: buffAlly(count) }),
  );
  const support = r.log.find((e) => e.supportAttack)!;
  return { support, r };
}

test("Fixed Key 2: with a dispellable buff on the target, exactly 1 is cleansed before Support Action damage", () => {
  const { support } = fk2Run(1, true);
  assert.ok(support, "Qiongjiu's Support Action fired");
  assert.ok((support.finalDamage ?? 0) > 0, "Support Action damage still occurs");
  const cleansed = support.statusesExpired ?? [];
  assert.deepEqual(cleansed, ["damage_up_ii"], "the dispellable buff was cleansed exactly once (before the support hit)");
});

test("Fixed Key 2: only 1 buff is removed even when multiple dispellable buffs are present (priority unspecified)", () => {
  const { support } = fk2Run(2, true);
  const cleansed = support.statusesExpired ?? [];
  assert.equal(cleansed.length, 1, "exactly one buff removed, never more");
  assert.ok(["damage_up_ii", "fixed_dmg_buff"].includes(cleansed[0]), "the removed buff is one of the present dispellable buffs (which one is unspecified)");
});

test("Fixed Key 2: without the key, no buff is cleansed and the Support Action is unchanged", () => {
  const { support } = fk2Run(2, false);
  assert.ok((support.finalDamage ?? 0) > 0, "Support Action still occurs");
  assert.deepEqual(support.statusesExpired ?? [], [], "no cleanse without Fixed Key 2");
  assert.deepEqual(support.statusesApplied ?? [], [], "no unexpected status applications");
});

test("Fixed Key 2: with no dispellable buff on the target, the Support Action proceeds normally and nothing is cleansed", () => {
  // Ally applies only Support Boost I to the dummy (purgeable: false) — NOT dispellable.
  const base = makeAlly("ally", 900);
  const basic: SkillDefVariant = {
    id: "ally_basic", name: "Ally Hit", type: "basic", element: null, multiplier: 1.0, stabDamage: 1, cooldown: 0, confectanceCost: 0,
    appliesStatuses: [{ statusId: "support_boost_i", durationRounds: 2, target: "target" }],
  };
  const noop: SkillDefVariant = { ...basic, id: "ally_noop", multiplier: 0, appliesStatuses: undefined };
  const ally = { ...base, id: "ally", skills: abilities({ basic, active1: noop, active2: noop, ultimate: noop }) };
  const r = simulateScenario(
    {
      version: 1, seed: 7, turns: 2,
      team: [
        { characterId: "ally", rotation: ["basic", "basic"], equippedFixedKeys: [] },
        { characterId: "qiongjiu", rotation: ["basic", "basic"], equippedFixedKeys: ["qiongjiu_fk2_efficient_planning"] },
      ] as never,
      dummy: { id: "d", name: "d", hp: 999999999, defense: 5000, stability: 65, weaknesses: [], phase: null, cover: "none" },
    },
    customRegistry({ ally }),
  );
  const support = r.log.find((e) => e.supportAttack)!;
  assert.ok((support.finalDamage ?? 0) > 0, "Support Action proceeds normally");
  assert.deepEqual(support.statusesExpired ?? [], [], "non-dispellable statuses are never cleansed");
});

test("cleanseDispellable: removes only purgeable statuses, exactly N at a time, unspecified order", () => {
  const st = createState(scenario({ turns: 1 }), customRegistry({}), new Set());
  applyStatus(st, st.dummy, { statusId: "damage_up_ii", durationRounds: 3 }); // purgeable buff
  applyStatus(st, st.dummy, { statusId: "fixed_dmg_buff", durationRounds: 3 }); // purgeable buff
  applyStatus(st, st.dummy, { statusId: "overburn", durationRounds: 2 }); // purgeable (dispellable debuff)
  applyStatus(st, st.dummy, { statusId: "support_boost_i", durationRounds: 3 }); // purgeable: false → never cleansed
  const purgeableIds = new Set(["damage_up_ii", "fixed_dmg_buff", "overburn"]);
  assert.equal(cleanseDispellable(st.dummy, st.statusRegistry, 0).length, 0);
  const one = cleanseDispellable(st.dummy, st.statusRegistry, 1);
  assert.equal(one.length, 1);
  assert.ok(one.every((id) => purgeableIds.has(id)), "the removed status is always a dispellable one (which one is unspecified)");
  assert.ok(st.dummy.statuses.some((s) => s.statusId === "support_boost_i"), "the non-dispellable status always survives");
  const rest = cleanseDispellable(st.dummy, st.statusRegistry, 5);
  assert.equal(rest.length, 2, "exactly the remaining two dispellable statuses are removed");
  assert.ok(st.dummy.statuses.every((s) => s.statusId === "support_boost_i"), "only the non-dispellable status remains");
});

