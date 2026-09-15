import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { REGISTRY } from "../data/registry.js";
import type { Scenario } from "../model/types.js";

/**
 * Regression: Medium Ammo weakness must contribute exactly the established single-weakness
 * factor (1 + 0.10 × 1 = 1.10) — applied ONCE, in the separate ammo dimension
 * (dummy.weaknessTags vs phase weaknessElements). A manual test reported ~1.74× damage from
 * the Medium Ammo checkbox; the current path provably yields 1.10 (QJ Basic uses medium_ammo,
 * so a Medium Ammo weakness is one match → weaknessExploited ["medium_ammo"] → factor 1.10).
 */

function scenarioWith(ammoTags: string[]): Scenario {
  return {
    version: 1,
    seed: 7,
    turns: 1,
    team: [{ characterId: "qiongjiu", rotation: ["basic"], equippedFixedKeys: [] }],
    dummy: {
      id: "training_dummy",
      name: "Training Dummy",
      hp: 999999999,
      defense: 5000,
      stability: 6,
      weaknesses: [], // no phase weaknesses
      weaknessTags: ammoTags as never,
      phase: null,
      cover: "none",
    },
  };
}

function basicEvent(tags: string[]) {
  const r = simulateScenario(scenarioWith(tags), REGISTRY);
  return r.log.find((e) => e.action === "qiongjiu_basic")!;
}

test("ammo weakness: Medium Ammo = exactly ONE weakExploit that is SCORED", () => {
  const none = basicEvent([]);
  const medium = basicEvent(["medium_ammo"]);
  console.log(`no-weakness final=${none.finalDamage} (crit=${String(none.critical)}) | medium final=${medium.finalDamage}`);

  // Same attack inputs in both runs — only the ammo dimension differs.
  assert.equal(none.attackerAtk, medium.attackerAtk);
  assert.equal(none.targetDef, medium.targetDef);
  assert.equal(none.critical, medium.critical);
  assert.deepEqual(none.weaknessExploited, [], "no weaknesses selected → no exploit");
  assert.deepEqual(medium.weaknessExploited, ["medium_ammo"], "single ammo match → exactly ONE exploited weakness");
  assert.equal(medium.phaseMult, 1, "ammo weakness is NOT a phase/phaseMult interaction");

  // The established single-weakness factor is 1 + 0.10 × 1 = 1.10, applied once. The final
  // damage values are ceiling-rounded per hit, so allow a small tolerance for that rounding —
  // a genuine double application would show ≈1.21 and the reported ≈1.74 is not reachable.
  const ratio = medium.finalDamage / none.finalDamage;
  assert.ok(Math.abs(ratio - 1.1) < 0.005, `expected ≈1.10 for one ammo weakness, got ${ratio}`);
});

test("ammo weakness: two ammo tags matching (medium + shotgun impossible for QJ basic) never multiply twice", () => {
  // QJ Basic is medium_ammo: even if the dummy lists extra tags, only the matching one counts.
  const multi = basicEvent(["medium_ammo", "shotgun_ammo"]);
  const single = basicEvent(["medium_ammo"]);
  assert.equal(multi.finalDamage, single.finalDamage, "non-matching ammo tags must not add weaknesses");
  assert.deepEqual(multi.weaknessExploited, ["medium_ammo"]);
});