import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { customRegistry } from "./helpers.js";
import type { CharacterDef } from "../model/types.js";

// Overburn — VALIDATED in-game (2026, docs/research.md §3.10):
//   "Upon gaining this effect and at the end of the action, the buff holder …
//   take[s] fixed damage equal to 10% of the effect applier's attack."
//   Sequence (applier ATK 1974 → 197.4 → 198 per trigger):
//     application:          198   (immediate on gain)
//     holder action-end #1: 198   (dummy pass-turn #1)
//     holder action-end #2: 198   (dummy pass-turn #2)
//     then Overburn expires — no third tick.
//   Total = 594. The dummy now takes a pass-turn each round (ownActionEnd ticks).

function makeApplier(id: string, atk: number): CharacterDef {
  return {
    id,
    name: id,
    phase: "burn",
    base: { atk, hp: 1000, def: 100, stability: 6, critRate: 0, critDmg: 0.2 },
    weapon: { id: `${id}_w`, name: "w", rarity: "standard", atkLvl1: 0, atkLvl60: 0, level: 60, subStats: [] },
    skills: {
      basic: { id: `${id}_basic`, name: "Hit", type: "basic", element: "physical", multiplier: 0, stabDamage: 0, cooldown: 0, confectanceCost: 0 },
      active1: {
        id: `${id}_apply`, name: "Apply", type: "active", element: "burn", multiplier: 0, stabDamage: 0, cooldown: 1, confectanceCost: 0,
        appliesStatuses: [{ statusId: "overburn", durationRounds: 2, target: "target" }],
      },
      active2: { id: `${id}_a2`, name: "-", type: "active", element: "burn", multiplier: 0, stabDamage: 0, cooldown: 1, confectanceCost: 0 },
      ultimate: { id: `${id}_ult`, name: "-", type: "ultimate", element: "burn", multiplier: 0, stabDamage: 0, cooldown: 0, confectanceCost: 3 },
    },
    passive: { id: `${id}_passive`, name: "-", effects: [] },
    fixedKeys: [],
  };
}

function run(atk: number) {
  const c = makeApplier("ob", atk);
  return simulateScenario(
    {
      version: 1,
      seed: 3,
      turns: 3,
      team: [{ characterId: c.id, rotation: ["active1", "basic", "basic"], equippedFixedKeys: [] }],
      dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 5000, stability: 0, weaknesses: [], phase: null, cover: "none" },
    },
    customRegistry({ [c.id]: c }),
  );
}

test("Overburn validated sequence: apply 198 → action-end ×2 ×198 → expires (no third tick)", () => {
  const r = run(1974);
  const ticks = r.log.filter((e) => e.statusTick);
  // Application (round 1) + holder action-end #1 (round 1) + holder action-end #2 (round 2).
  assert.deepEqual(ticks.map((e) => e.round), [1, 1, 2]);
  assert.deepEqual(ticks.map((e) => e.statusTick?.amount), [198, 198, 198]);
  assert.ok(ticks.every((e) => e.statusTick?.statusId === "overburn"));
  assert.ok(ticks.every((e) => e.actionType === "status_tick" && e.target === "training_dummy"));
  assert.equal(ticks.reduce((a, e) => a + e.finalDamage, 0), 594, "198 + 198 + 198 = 594 — exactly 3 instances");
  // No third holder action-end tick (expired after the second).
  assert.equal(r.log.filter((e) => e.statusTick?.statusId === "overburn").length, 3);
  // Aggregations stay consistent with the log (actions unchanged).
  assert.equal(r.totals.actions, 3);
  assert.equal(
    r.totals.damage,
    r.log.reduce((a, e) => a + e.finalDamage, 0),
  );
  assert.ok(r.bySource.some((s) => s.source === "passive" && s.damage === 594));
});

test("Overburn fixed damage scales with the APPLIER's ATK (1974 → 198; 1000 → 100)", () => {
  const high = run(1974).log.filter((e) => e.statusTick);
  const low = run(1000).log.filter((e) => e.statusTick);
  assert.equal(high[0].attackerAtk, 1974);
  assert.deepEqual(low.map((e) => e.statusTick?.amount), [100, 100, 100]); // ceil(1000 × 0.10) = 100
});