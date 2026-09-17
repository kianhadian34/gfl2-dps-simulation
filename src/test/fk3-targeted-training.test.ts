import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { QIONGJIU } from "../data/qiongjiu.js";
import { customRegistry, makeAlly } from "./helpers.js";

/**
 * FIXED KEY 3: Targeted Training (VALIDATED in-game 2026):
 * "While in Support Mode, applies Defense Down II to the target for 1 turn before the allied
 * unit's attack." Sequence: allied attack command → Defense Down II applied → allied attack
 * resolves (damage uses the reduced DEF). Reuses the existing generic DEF stat modifier
 * (stat_def_down_ii_pct, 5000 → 3500 validated). Support Mode (MVP representation) = the key
 * holder has the onAllySingleTargetHit support passive with remaining quota.
 *
 * Deterministic damage: ally ATK 1000, multiplier 1.0, no bracket (makeAlly has no bonuses).
 *  DEF 5000: ceil(1000 × 1000/6000) = 167 · DEF 3500: ceil(1000 × 1000/4500) = 223
 * (The holder uses id "qjf3" — the helper registry pins id "qiongjiu" to the real doll.)
 */

function run(link: { fk3: boolean; qjSupport: boolean; turns?: number; allyRotation?: string[] }) {
  const qj = structuredClone(QIONGJIU);
  qj.id = "qjf3";
  qj.passive = { ...qj.passive, effects: link.qjSupport ? qj.passive.effects : [], levels: undefined };
  const ally = makeAlly("ally", 1000);
  return simulateScenario(
    {
      version: 1, seed: 7, turns: link.turns ?? 1,
      team: [
        { characterId: "ally", rotation: (link.allyRotation ?? ["basic"]) as never, equippedFixedKeys: [] },
        { characterId: "qjf3", rotation: ["basic"], equippedFixedKeys: link.fk3 ? ["qiongjiu_fk3_targeted_training"] : [] },
      ] as never,
      dummy: { id: "d", name: "d", hp: 999999999, defense: 5000, stability: 65, weaknesses: [], phase: null, cover: "none" },
    },
    customRegistry({ ally, qjf3: qj }),
  );
}

test("Fixed Key 3: with the key + Support Mode, DEF Down II lands BEFORE the allied hit (3500 DEF, exact damage)", () => {
  const r = run({ fk3: true, qjSupport: true });
  const allyHit = r.log.find((e) => e.action === "ally_basic")!;
  assert.ok(allyHit.statusesApplied.includes("stat_def_down_ii_pct"), "Defense Down II applied before the allied attack");
  assert.equal(allyHit.targetDef, 3500, "5000 DEF → 3500 DEF (validated −30%)");
  assert.equal(allyHit.finalDamage, 223, "ceil(1000 × 1000/4500)");
});

test("Fixed Key 3: without the key the allied attack is unchanged (5000 DEF, 167 damage)", () => {
  const r = run({ fk3: false, qjSupport: true });
  const allyHit = r.log.find((e) => e.action === "ally_basic")!;
  assert.ok(!allyHit.statusesApplied.includes("stat_def_down_ii_pct"), "no DEF Down II without Fixed Key 3");
  assert.equal(allyHit.targetDef, 5000);
  assert.equal(allyHit.finalDamage, 167, "ceil(1000 × 1000/6000)");
});

test("Fixed Key 3: key equipped but holder NOT in Support Mode (no support passive) → no DEF Down II", () => {
  const r = run({ fk3: true, qjSupport: false });
  const allyHit = r.log.find((e) => e.action === "ally_basic")!;
  assert.ok(!allyHit.statusesApplied.includes("stat_def_down_ii_pct"), "no DEF Down II when the holder cannot support");
  assert.equal(allyHit.targetDef, 5000, "DEF unchanged");
  assert.equal(allyHit.finalDamage, 167);
});

test("Fixed Key 3: Defense Down II is declared 1 turn and re-applies before every qualifying allied attack", () => {
  // Data-driven duration: the FK3 spec declares exactly 1 turn.
  const fk3 = QIONGJIU.fixedKeys.find((k) => k.id === "qiongjiu_fk3_targeted_training")!;
  assert.ok(fk3.alliedAttackDefDown, "FK3 declares its DEF Down spec");
  assert.equal(fk3.alliedAttackDefDown!.durationRounds, 1, "Defense Down II lasts 1 turn");
  // In-sim: each qualifying allied attack (Support-Mode-ready holder) gets DEF Down II before
  // damage — both the round-1 and round-2 allied hits resolve at the reduced 3500 DEF.
  const r = run({ fk3: true, qjSupport: true, turns: 2, allyRotation: ["basic", "basic"] });
  const allyHits = r.log.filter((e) => e.action === "ally_basic");
  assert.equal(allyHits.length, 2);
  assert.ok(allyHits[0].statusesApplied.includes("stat_def_down_ii_pct"), "first qualifying attack sees DEF Down II applied");
  for (const h of allyHits) {
    // Every qualifying allied attack resolves against the reduced DEF (re-application refreshes
    // the existing instance, which the event records only for a fresh application).
    assert.equal(h.targetDef, 3500);
    assert.equal(h.finalDamage, 223);
  }
});