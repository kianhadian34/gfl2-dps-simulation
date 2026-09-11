import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { REGISTRY } from "../data/registry.js";
import { customRegistry, makeAlly } from "./helpers.js";
import type { Scenario } from "../model/types.js";

/**
 * Support Boost I — ONE buff instance with TWO effects, VALIDATED in-game 2026 (538 & 883):
 *   +15% Support Action damage, +10% vs Exposed targets — BOTH Support-Action-scoped,
 *   persistent (no duration), stackable (stacks = activations), one Support Action consumes
 *   exactly one stack, cannot be cleansed. Source for Qiongjiu: Common Rail.
 */

const ALLY = makeAlly("sb_ally", 1000);

/** QJ FIRST so she casts Common Rail before the ally triggers her support each round. */
function supScenario(opts: { stability: number; turns?: number; allyRotation?: ("basic" | "ultimate")[]; qjRotation?: string[] }): Scenario {
  return {
    version: 1,
    seed: 7,
    turns: opts.turns ?? 3,
    team: [
      { characterId: "qiongjiu", rotation: (opts.qjRotation ?? ["active1", "basic", "basic"]) as ("active1" | "basic")[], equippedFixedKeys: [] },
      { characterId: "sb_ally", rotation: opts.allyRotation ?? ["basic"], equippedFixedKeys: [] },
    ],
    dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 5000, stability: opts.stability, weaknesses: [], phase: null, cover: "none" },
    configOverrides: { confectanceStart: 9 }, // keep ally ultimates castable when used (0-damage → never trigger support)
  };
}

const reg = customRegistry({ sb_ally: ALLY });
const supports = (r: ReturnType<typeof simulateScenario>) => r.log.filter((e) => e.supportAttack);

test("SB I: +15% applies to the Support Action only (r1 1.25 with SB; later 1.10; normal hits unaffected)", () => {
  const r = simulateScenario(supScenario({ stability: 0 }), reg);
  const sup = supports(r);
  // QJ acts first: Common Rail applies SB I before the ally's r1 hit → r1 support is buffed.
  assert.ok(Math.abs(sup[0].bonusBracket - 1.25) < 1e-9, `r1 (SB I) bracket ${sup[0].bonusBracket}`); // 1 + 0.10 + 0.15
  // The single stack was consumed by that support → later supports lose the bonus.
  assert.ok(Math.abs(sup[1].bonusBracket - 1.1) < 1e-9, `r2 (SB consumed) bracket ${sup[1].bonusBracket}`);
  const basic = r.log.find((e) => e.action === "qiongjiu_basic")!;
  assert.ok(Math.abs(basic.bonusBracket - 1.1) < 1e-9, `normal bracket ${basic.bonusBracket}`); // no support-scoped bonus
});

test("SB I: the +10% Exposed component requires an Exposed target and is Support-Action-scoped", () => {
  const notExposed = simulateScenario(supScenario({ stability: 0 }), reg);
  const exposed = simulateScenario(supScenario({ stability: 2 }), reg); // Common Rail stab 3 breaks it at r1 (QJ acts first)
  const e = supports(exposed);
  assert.ok(Math.abs(supports(notExposed)[0].bonusBracket - 1.25) < 1e-9);
  // r1 support is buffed AND the target is already Exposed → +0.10 more (1.35).
  assert.ok(Math.abs(e[0].bonusBracket - 1.35) < 1e-9, `exposed r1 support bracket ${e[0].bonusBracket}`);
  assert.ok(Math.abs(e[0].bonusBracket - supports(notExposed)[0].bonusBracket - 0.1) < 1e-9);
  // VALIDATED 538 analog: QJ Basic Attack vs an Exposed target receives NO +10% (bracket stays 1.10).
  const basic = exposed.log.find((e2) => e2.action === "qiongjiu_basic" && e2.round === 2)!;
  assert.ok(Math.abs(basic.bonusBracket - 1.1) < 1e-9, `Basic vs Exposed bracket ${basic.bonusBracket}`);
});

test("SB I: persistent — no duration expiry (survives rounds where no Support Action occurs)", () => {
  // r1: QJ Common Rail applies SB I; ally ultimate (0 damage) → no trigger. r2: same.
  // r3: ally basic triggers a support that STILL has SB I (never consumed) → 1.25.
  const r = simulateScenario(supScenario({ stability: 0, turns: 3, allyRotation: ["ultimate", "ultimate", "basic"] }), reg);
  const sup = supports(r);
  assert.equal(sup.length, 1, `expected one support at r3, got ${sup.length}`);
  assert.ok(Math.abs(sup[0].bonusBracket - 1.25) < 1e-9, `r3 bracket ${sup[0].bonusBracket}`);
});

test("SB I: stackable — each application adds one stack; stack count does NOT multiply damage; one Support Action consumes exactly one stack", () => {
  // QJ casts Common Rail at r1 (stack 1) and r3 (stack 2, CD-1 clear); ally uses 0-damage
  // ultimates r1–r3 (castable via confectanceStart 9) so nothing is consumed before r4.
  const r = simulateScenario(
    supScenario({
      stability: 0,
      turns: 5,
      allyRotation: ["ultimate", "ultimate", "ultimate", "basic", "basic"],
      qjRotation: ["active1", "basic", "active1", "basic", "basic"],
    }),
    reg,
  );
  const sup = supports(r);
  // VALIDATED 2026: 2 stacks deal the SAME damage modifier as 1 stack (1.10 + 0.15 = 1.25) —
  // stacks are activations only. The r4 support still consumes exactly ONE stack → 1 left.
  assert.ok(Math.abs(sup[0].bonusBracket - 1.25) < 1e-9, `2-stack support bracket ${sup[0].bonusBracket}`);
  // r5 support with the remaining stack is identical (1.25); consumes the last → expired.
  assert.ok(Math.abs(sup[1].bonusBracket - 1.25) < 1e-9, `1-stack support bracket ${sup[1].bonusBracket}`);
  assert.equal(sup[0].bonusBracket, sup[1].bonusBracket, "stack count must not change the damage modifier");
  assert.ok(sup[1].statusesExpired?.includes("support_boost_i"), `r5 expired ${JSON.stringify(sup[1].statusesExpired)}`);
});

test("SB I: Basic Attack never consumes it", () => {
  const r = simulateScenario(supScenario({ stability: 0, turns: 3 }), reg);
  const consumed = r.log.flatMap((e) => e.statusesExpired ?? []);
  assert.equal(consumed.filter((s) => s === "support_boost_i").length, 1, JSON.stringify(consumed));
  const pledge = r.log.filter((e) => e.action === "qiongjiu_basic");
  assert.equal(pledge.length, 2);
  assert.ok(pledge.every((e) => !(e.statusesExpired ?? []).includes("support_boost_i")));
});

test("SB I: both effects come from ONE status id with ONE source; model matches validated facts", () => {
  const def = REGISTRY.getStatus("support_boost_i")!;
  assert.deepEqual(
    def.effects,
    [
      { kind: "damage_modifier", scope: "dealt", mode: "additive", value: 0.15, actions: "support" },
      { kind: "damage_modifier", scope: "dealt", mode: "additive", value: 0.1, actions: "support", whenTarget: "exposed" },
    ],
    "one status id, two effects — not two buff instances",
  );
  assert.equal(def.consumeOneOnUse, true); // stacks = activations
  assert.equal(def.scaleWithStacks, false); // VALIDATED 2026: stack count does NOT multiply damage
  assert.equal(def.durationRounds, null); // persistent — no duration expiry
  assert.equal(def.stackable, true);
  assert.equal(def.purgeable, false); // cannot be cleansed
  const r = simulateScenario(supScenario({ stability: 0 }), reg);
  const apply = r.log.find((e) => e.action === "qiongjiu_common_rail")!;
  const applied = (apply.appliedSources ?? []).filter((s) => s.statusId === "support_boost_i");
  assert.equal(applied.length, 1, JSON.stringify(apply.appliedSources));
  assert.equal(applied[0].source, "Common Rail Lv.1");
  const sup = supports(r)[0]; // the buffed support hit
  assert.equal((sup.effectSources ?? []).filter((s) => s === "Common Rail Lv.1").length, 1, JSON.stringify(sup.effectSources));
});

test("SB I: existing damage calculations remain unchanged without the buff", () => {
  const r = simulateScenario(supScenario({ stability: 0, turns: 3 }), reg);
  // Once SB I is consumed (r1), later supports keep the canonical No-Cover-only bracket.
  const sup = supports(r);
  assert.ok(Math.abs(sup[1].bonusBracket - 1.1) < 1e-9, `post-consumption bracket ${sup[1].bonusBracket}`);
  const basic = r.log.find((e) => e.action === "qiongjiu_basic")!;
  assert.ok(Math.abs(basic.bonusBracket - 1.1) < 1e-9);
});