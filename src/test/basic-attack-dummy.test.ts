import test from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { createState } from "../engine/state.js";
import { REGISTRY } from "../data/registry.js";
import { BASIC_ATTACK_DUMMY } from "../data/basic-attack-dummy.js";
import type { Scenario } from "../model/types.js";

/**
 * BASIC ATTACK DUMMY (2026) — minimal friendly team unit for testing.
 * Exactly one ability (Basic Attack, 80% ATK) through the NORMAL ability/damage pipeline;
 * participates in the normal turn system (team order + per-character rotation are the ONLY
 * authority over when it acts — no hidden timing, no dummy-specific support wiring). Its
 * normal attack triggers Qiongjiu's existing ally-hit support mechanics like any friendly unit.
 */

const TARGET = {
  id: "training_dummy",
  name: "Training Dummy",
  hp: 999999999,
  defense: 5000,
  stability: 100,
  weaknesses: [],
  phase: null,
  cover: "none",
};

function run(team: Array<{ characterId: string; rotation: string[] }>, turns = 1): ReturnType<typeof simulateScenario> {
  return simulateScenario(
    {
      version: 1,
      seed: 7,
      turns,
      team: team.map((m) => ({ characterId: m.characterId, rotation: m.rotation, equippedFixedKeys: [] })),
      dummy: TARGET,
    } as Scenario,
    REGISTRY,
  );
}

test("dummy: definition loads from the registry with the exact id/name and no extra systems", () => {
  const def = REGISTRY.getCharacter("basic_attack_dummy");
  assert.ok(def, "registered");
  assert.equal(def.name, "Basic Attack Dummy");
  assert.equal(def.id, "basic_attack_dummy");
  assert.equal(def.base.atk, 1000);
  assert.equal(def.affinityKey, undefined, "no affinity key");
  assert.equal(def.affinityLevelStats, undefined, "no affinity-level stats");
  assert.equal(def.expansionKey, undefined, "no expansion");
  assert.equal(def.fortificationMap, undefined, "no fortification map");
  assert.deepEqual(def.fixedKeys, [], "no fixed keys");
  assert.deepEqual(def.passive.effects, [], "no passive effects");
  assert.deepEqual(Object.keys(def.skills), ["basic"], "exactly one ability");
});

test("dummy: exactly one usable ability (basic) — active1/active2/ultimate/support are absent", () => {
  const st = createState(
    { version: 1, seed: 7, turns: 1, team: [{ characterId: "basic_attack_dummy", rotation: ["basic"], equippedFixedKeys: [] }], dummy: TARGET } as Scenario,
    REGISTRY,
    new Set(),
  );
  const u = st.units[0];
  assert.deepEqual(u.skills && Object.keys(u.skills).sort(), ["basic"]);
  assert.equal(u.skillLevels.basic, 1);
  assert.equal(defMissing(BASIC_ATTACK_DUMMY, "basic"), false);
});

function defMissing(def: typeof BASIC_ATTACK_DUMMY, slot: keyof typeof def.skills): boolean {
  return def.skills[slot] === undefined;
}

test("dummy: Basic Attack deals exactly 80% of the dummy's ATK through the normal damage pipeline (1000 ATK → 134 vs DEF 5000)", () => {
  const r = run([{ characterId: "basic_attack_dummy", rotation: ["basic"] }]);
  const ev = r.log.find((e) => e.action === "basic_attack_dummy_basic")!;
  assert.equal(ev.attackerAtk, 1000);
  assert.equal(ev.finalDamage, 134, "ceil(1000 × 0.8 × 1000/6000) = ceil(133.33) = 134");
  assert.equal(ev.critical, false, "no crit bonus");
});

test("dummy: acts only on its own rotation turn; a selected dummy with [basic] acts once per round", () => {
  const r = run([{ characterId: "basic_attack_dummy", rotation: ["basic", "basic"] }], 2);
  const basics = r.log.filter((e) => e.action === "basic_attack_dummy_basic");
  assert.equal(basics.length, 2, "one basic per round across 2 rounds");
  assert.ok(r.log.every((e) => e.action === "basic_attack_dummy_basic"), "nothing else happens — no auto/extra actions");
});

test("support interaction: a dummy Basic Attack (team[0]) triggers Qiongjiu's existing ally-hit support — no dummy-specific logic", () => {
  const r = run([
    { characterId: "basic_attack_dummy", rotation: ["basic"] },
    { characterId: "qiongjiu", rotation: ["basic"] },
  ]);
  const order = r.log.map((e) => e.action);
  assert.equal(order[0], "basic_attack_dummy_basic", "team order decides who acts first (dummy was selected first)");
  const support = r.log.find((e) => e.action === "qiongjiu_support");
  assert.ok(support, "Qiongjiu performed a Support Attack after the ally hit");
  assert.equal(support.supportAttack, true);
  assert.ok((support.finalDamage ?? 0) > 0, "support hit dealt damage");
  assert.deepEqual(support.effectSources??[].sort(), ["Steady Plan Lv.1"].sort(), "support fires via the normal Steady Plan passive");
  // The support hit is an OUT-OF-TURN event: verify the generic out-of-turn flag (not a dummy special case).
  assert.equal(support.supportAttack, true);
});

test("support interaction: order is user-controlled — with Qiongjiu first, HER action precedes the dummy's", () => {
  const r = run([
    { characterId: "qiongjiu", rotation: ["basic"] },
    { characterId: "basic_attack_dummy", rotation: ["basic"] },
  ]);
  const order = r.log.map((e) => e.action);
  assert.equal(order[0], "qiongjiu_basic", "Qiongjiu selected first acts first");
  assert.ok(order.indexOf("basic_attack_dummy_basic") > order.indexOf("qiongjiu_basic"), "dummy acts after on its own turn");
  assert.ok(r.log.some((e) => e.action === "qiongjiu_support"), "the later dummy hit still triggers Qiongjiu's support");
});

test("dummy: no dummy-specific support/passive wiring — its own attack never self-triggers (no support passive)", () => {
  const r = run([{ characterId: "basic_attack_dummy", rotation: ["basic"] }]);
  assert.deepEqual(r.log.filter((e) => e.supportAttack === true), [], "no support events from the dummy alone");
});