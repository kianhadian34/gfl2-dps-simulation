import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { REGISTRY } from "../data/registry.js";
import { customRegistry, makeAlly } from "./helpers.js";
import type { ActionSlot, ConfigOverrides, Scenario, StatusEffect } from "../model/types.js";

/**
 * Qiongjiu Common Rail V1 (VALIDATED in-game 2026):
 *   • The killing blow must be delivered by COMMON RAIL ITSELF (skill-specific) — not by any
 *     other skill/unit, and not merely because an enemy died in the sequence.
 *   • On that kill, Qiongjiu receives the +30% Support Boost variant ("Support Boost I" at +30%):
 *     Support Action damage +30% AND +10% vs Exposed, "Activates 1 time", cannot be cleansed,
 *     persistent (no invented duration), consumed per Support Action, flat magnitude,
 *     support-scoped — same family rules as normal SB I (+15%). Normal +15% SB I is NOT mutated.
 *
 * At fort 1 (V1): CR is Lv2 (150% Burn, still grants SB I +15% on cast, and onKill → +30% variant);
 * passive = Lv1 (No-Cover +0.10). Support brackets: no buff → 1.10 · normal SB I (+15%) → 1.25 ·
 * V1 +30% variant (single family buff) → 1.40 (never 1.55 = both magnitudes double-counted).
 */

const ALLY = makeAlly("cr_ally", 1000);

function sc(opts: { qjRotation: ActionSlot[]; allyRotation: ActionSlot[]; dummyHp: number; fort?: number; turns?: number }): Scenario {
  const cfg: ConfigOverrides = { fortificationLevel: opts.fort ?? 1, confectanceStart: 3 };
  return {
    version: 1,
    seed: 7,
    turns: opts.turns ?? 1,
    team: [
      { characterId: "qiongjiu", rotation: opts.qjRotation, equippedFixedKeys: [] },
      { characterId: "cr_ally", rotation: opts.allyRotation, equippedFixedKeys: [] },
    ],
    dummy: { id: "training_dummy", name: "Training Dummy", hp: opts.dummyHp, defense: 5000, stability: 6, weaknesses: [], phase: null, cover: "none" },
    configOverrides: cfg,
  };
}

const reg = customRegistry({ cr_ally: ALLY });
const supports = (r: ReturnType<typeof simulateScenario>) => r.log.filter((e) => e.supportAttack);

test("V1: Common Rail delivering the killing blow grants the +30% Support Boost variant (support bracket 1.40)", () => {
  const r = simulateScenario(sc({ qjRotation: ["active1"], allyRotation: ["basic"], dummyHp: 400 }), reg); // CR hit ~699 ≥ 400 → kill
  const rail = r.log.find((e) => e.action === "qiongjiu_common_rail")!;
  assert.equal(rail.killingBlow, true, "Common Rail itself must deliver the killing blow");
  const applied30 = (rail.appliedSources ?? []).filter((s) => s.statusId === "support_boost_i_30");
  assert.equal(applied30.length, 1, `CR kill must apply the +30% variant: ${JSON.stringify(rail.appliedSources)}`);
  // Family single-active: the +15% base applied by the same CR cast is REPLACED by the +30% (one buff, one source).
  assert.ok(rail.statusesExpired?.includes("support_boost_i"), "the +15% Normal SB I must be replaced by the +30% variant (one family buff)");
  const sup = supports(r)[0];
  assert.ok(Math.abs(sup.bonusBracket - 1.4) < 1e-9, `V1 support bracket ${sup.bonusBracket} (expected 1.40; 1.55 would mean double-counting both magnitudes)`);
});

test("V1: a NON-killing Common Rail applies NO +30% — the normal +15% Support Boost I still applies (1.25)", () => {
  const r = simulateScenario(sc({ qjRotation: ["active1"], allyRotation: ["basic"], dummyHp: 999999999 }), reg);
  const rail = r.log.find((e) => e.action === "qiongjiu_common_rail")!;
  assert.notEqual(rail.killingBlow, true, "no killing blow on a full-HP dummy");
  assert.equal((rail.appliedSources ?? []).some((s) => s.statusId === "support_boost_i_30"), false, "NO +30% variant without the CR killing blow");
  const sup = supports(r)[0];
  assert.ok(Math.abs(sup.bonusBracket - 1.25) < 1e-9, `normal SB I (+15%) support bracket ${sup.bonusBracket} (expected 1.25) — the +15% status is unchanged`);
});

test("V1 is SKILL-SPECIFIC: a killing blow from Basic Attack grants NO +30% variant", () => {
  const r = simulateScenario(sc({ qjRotation: ["basic"], allyRotation: ["basic"], dummyHp: 50, fort: 1 }), reg);
  const basic = r.log.find((e) => e.action === "qiongjiu_basic")!;
  assert.equal(basic.killingBlow, true, "Basic deals the kill here");
  assert.equal((basic.appliedSources ?? []).some((s) => s.statusId === "support_boost_i_30"), false, "Basic (no onKillStatuses) must NOT grant the V1 buff");
  const sup = supports(r)[0];
  assert.ok(Math.abs(sup.bonusBracket - 1.1) < 1e-9, `no-buff support bracket ${sup.bonusBracket} (expected 1.10)`);
});

test("V1 status shape: +30% Support Action + +10% Exposed, persistent, activation-consumed, flat, un-cleansable, unbounded", () => {
  const def = REGISTRY.getStatus("support_boost_i_30")!;
  assert.deepEqual(def.effects, [
    { kind: "damage_modifier", scope: "dealt", mode: "additive", value: 0.3, actions: "support" },
    { kind: "damage_modifier", scope: "dealt", mode: "additive", value: 0.1, actions: "support", whenTarget: "exposed" },
  ]);
  assert.equal(def.durationRounds, null, "persistent — no invented duration");
  assert.equal(def.consumeOneOnUse, true, "activates once per Support Action");
  assert.equal(def.scaleWithStacks, false, "stacks never scale magnitude");
  assert.equal(def.purgeable, false, "cannot be cleansed");
  assert.equal(def.maxStacks, undefined, "no invented stack cap");
  // The normal SB I (+15%) is untouched.
  const sb1 = REGISTRY.getStatus("support_boost_i")!;
  const first = sb1.effects[0] as Extract<StatusEffect, { kind: "damage_modifier" }>;
  assert.equal(first.value, 0.15, "normal Support Boost I remains +15%");
});

test("V1 activates/consumes correctly: one Support Action consumes the +(single) activation; the next has none", () => {
  const r = simulateScenario(sc({ qjRotation: ["active1", "basic"], allyRotation: ["basic", "basic"], dummyHp: 400, turns: 2 }), reg);
  const sups = supports(r);
  assert.equal(sups.length, 2);
  assert.ok(Math.abs(sups[0].bonusBracket - 1.4) < 1e-9, `first support (with V1) bracket ${sups[0].bonusBracket}`);
  assert.ok(sups[0].statusesExpired?.includes("support_boost_i_30"), "the single activation is consumed by the first Support Action");
  assert.ok(Math.abs(sups[1].bonusBracket - 1.1) < 1e-9, `second support (V1 consumed) bracket ${sups[1].bonusBracket}`);
});