import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { createState } from "../engine/state.js";
import { additiveDealtBonus, additiveTakenBonus, multiplicativeTakenMods } from "../engine/statuses.js";
import { customRegistry, scenario } from "./helpers.js";
import { STATUS_DEFS } from "../data/statuses.js";
import type { CharacterDef, Scenario, SkillDefVariant, StatusDef } from "../model/types.js";

/**
 * PER-ELEMENT GATE on `damage_modifier` (`whenElement`) — added 2026.
 *
 * The GENERIC form of the per-element gate that previously existed only on
 * `stack_tier_modifier.when.element`. Honored on BOTH scopes (dealt + taken) and on BOTH modes, so
 * a declared `whenElement` is never silently ignored.
 *
 * Motivated by Vector's Burn clauses — Accelerant ("Burn damage DEALT +10%") and Overheat
 * Combustion V1 ("Burn damage TAKEN +30%") — but NEITHER status is implemented here: the fixtures
 * are synthetic and injected through the registry, so this pins the VOCABULARY independently of
 * Vector's kit data. The production status table must stay free of these fixtures (asserted).
 *
 * The gate reads the ATTACK's element (the hit's own attribute) — never the target's weakness list.
 */

const ATK = 1000;

/** Synthetic dealt-side gate. */
function dealtGate(elements: (string | null)[] | undefined, value = 0.5): StatusDef {
  return {
    id: "we_dealt",
    name: "Dealt Gate (test)",
    category: "buff",
    stackable: false,
    maxStacks: 1,
    durationRounds: null,
    tickAt: "ownActionEnd",
    purgeable: true,
    effects: [{ kind: "damage_modifier", scope: "dealt", mode: "additive", value, ...(elements ? { whenElement: elements as never } : {}) }],
    verified: false,
  };
}

/** Synthetic taken-side gate (the Overheat Combustion V1 shape). */
function takenGate(elements: (string | null)[] | undefined, value = 0.3): StatusDef {
  return {
    id: "we_taken",
    name: "Taken Gate (test)",
    category: "debuff",
    stackable: false,
    maxStacks: 1,
    durationRounds: null,
    tickAt: "ownActionEnd",
    purgeable: true,
    effects: [{ kind: "damage_modifier", scope: "taken", mode: "additive", value, ...(elements ? { whenElement: elements as never } : {}) }],
    verified: false,
  };
}

/** Synthetic multiplicative taken gate (the "never silently ignored" case). */
function multGate(elements: (string | null)[] | undefined, value = 0.5): StatusDef {
  return {
    id: "we_mult",
    name: "Mult Gate (test)",
    category: "debuff",
    stackable: false,
    maxStacks: 1,
    durationRounds: null,
    tickAt: "ownActionEnd",
    purgeable: true,
    effects: [{ kind: "damage_modifier", scope: "taken", mode: "multiplicative", value, ...(elements ? { whenElement: elements as never } : {}) }],
    verified: false,
  };
}

/** A state whose registry ALSO serves the synthetic statuses (never production data). */
function stateWith(fixture: StatusDef) {
  const state = createState(scenario({ turns: 1 }), customRegistry({}), new Set());
  const map = new Map(state.statusRegistry);
  map.set(fixture.id, fixture);
  state.statusRegistry = map;
  return state;
}

const ctx = { supportAttack: false, targetExposed: false };

// ---------------------------------------------------------------- DEALT scope

test("dealt gate: applies to a matching element, not to a different one", () => {
  const state = stateWith(dealtGate(["burn"]));
  const doll = state.units[0];
  doll.statuses = [{ statusId: "we_dealt", stacks: 1, durationLeft: Infinity }];
  assert.equal(additiveDealtBonus(doll, state.statusRegistry, "burn", ctx), 0.5, "Burn matches");
  assert.equal(additiveDealtBonus(doll, state.statusRegistry, "hydro", ctx), 0, "Hydro does not");
  assert.equal(additiveDealtBonus(doll, state.statusRegistry, null, ctx), 0, "phase-less does not");
});

test("dealt gate: an OR-list matches any listed element", () => {
  const state = stateWith(dealtGate(["burn", "hydro"]));
  const doll = state.units[0];
  doll.statuses = [{ statusId: "we_dealt", stacks: 1, durationLeft: Infinity }];
  assert.equal(additiveDealtBonus(doll, state.statusRegistry, "burn", ctx), 0.5);
  assert.equal(additiveDealtBonus(doll, state.statusRegistry, "hydro", ctx), 0.5);
  assert.equal(additiveDealtBonus(doll, state.statusRegistry, "freeze", ctx), 0);
});

test("dealt gate: `null` in the list matches a PHASE-LESS attack only", () => {
  const state = stateWith(dealtGate([null]));
  const doll = state.units[0];
  doll.statuses = [{ statusId: "we_dealt", stacks: 1, durationLeft: Infinity }];
  assert.equal(additiveDealtBonus(doll, state.statusRegistry, null, ctx), 0.5, "phase-less matches");
  assert.equal(additiveDealtBonus(doll, state.statusRegistry, "burn", ctx), 0, "a Burn attack does not match null");
});

test("control: WITHOUT whenElement the dealt bonus applies to every element (existing behavior)", () => {
  const state = stateWith(dealtGate(undefined));
  const doll = state.units[0];
  doll.statuses = [{ statusId: "we_dealt", stacks: 1, durationLeft: Infinity }];
  for (const el of ["burn", "hydro", null] as const) {
    assert.equal(additiveDealtBonus(doll, state.statusRegistry, el, ctx), 0.5, `ungated applies to ${String(el)}`);
  }
});

// ---------------------------------------------------------------- TAKEN scope

test("taken gate: applies only when the INCOMING hit's element matches", () => {
  const state = stateWith(takenGate(["burn"]));
  const dummy = state.dummy;
  dummy.statuses = [{ statusId: "we_taken", stacks: 1, durationLeft: Infinity }];
  assert.equal(additiveTakenBonus(dummy, state.statusRegistry, "burn"), 0.3, "incoming Burn matches");
  assert.equal(additiveTakenBonus(dummy, state.statusRegistry, "hydro"), 0, "incoming Hydro does not");
  assert.equal(additiveTakenBonus(dummy, state.statusRegistry, null), 0, "incoming phase-less does not");
});

test("control: WITHOUT whenElement the taken bonus applies to every element", () => {
  const state = stateWith(takenGate(undefined));
  const dummy = state.dummy;
  dummy.statuses = [{ statusId: "we_taken", stacks: 1, durationLeft: Infinity }];
  for (const el of ["burn", "hydro", null] as const) {
    assert.equal(additiveTakenBonus(dummy, state.statusRegistry, el), 0.3);
  }
});

// ------------------------------------------------- MULTIPLICATIVE (not silently ignored)

test("the gate is honored on the multiplicative taken branch too (never silently ignored)", () => {
  const state = stateWith(multGate(["burn"]));
  const dummy = state.dummy;
  dummy.statuses = [{ statusId: "we_mult", stacks: 1, durationLeft: Infinity }];
  // value 0.5 multiplicative ⇒ a matching hit is ×0.5; a non-matching hit is unaffected (×1).
  assert.equal(multiplicativeTakenMods(dummy, state.statusRegistry, false, "burn").mult, 0.5, "Burn matches");
  assert.equal(multiplicativeTakenMods(dummy, state.statusRegistry, false, "hydro").mult, 1, "Hydro does not");
});

// ---------------------------------------------------------------- end-to-end

test("end-to-end: a Burn-gated dealt bonus changes damage on a Burn attack only", () => {
  const basic = (element: SkillDefVariant["element"]): SkillDefVariant => ({
    id: "we_basic",
    name: "we_basic",
    type: "basic",
    element,
    multiplier: 1.0,
    stabDamage: 0,
    cooldown: 0,
    confectanceCost: 0,
  });
  const doll = (element: SkillDefVariant["element"]): CharacterDef => {
    const b = basic(element);
    const grant: SkillDefVariant = {
      id: "we_grant",
      name: "we_grant",
      type: "active",
      element: null,
      multiplier: 0,
      stabDamage: 0,
      cooldown: 9,
      confectanceCost: 0,
      appliesStatuses: [{ statusId: "we_dealt", stacks: 1, target: "self" }],
    };
    return {
      id: "we_test",
      name: "T",
      class: "support",
      phase: element ?? null,
      base: { atk: ATK, hp: 1000, def: 0, stability: 0, critRate: 0, critDmg: 0 },
      skills: { basic: { id: b.id, name: b.name, type: b.type, levels: { 1: b } }, active1: { id: grant.id, name: grant.name, type: grant.type, levels: { 1: grant } } },
      passive: { id: "p", name: "-", effects: [] },
      fixedKeys: [],
    };
  };
  const run = (element: SkillDefVariant["element"]) => {
    const d = doll(element);
    const reg = customRegistry({ we_test: d });
    const map = new Map(reg.getStatusMap());
    map.set("we_dealt", dealtGate(["burn"]));
    const sc: Scenario = {
      version: 1,
      seed: 1,
      turns: 3,
      team: [{ characterId: "we_test", rotation: ["active1", "basic"], applyDispatchStats: false, equippedFixedKeys: [] }],
      dummy: { id: "training_dummy", name: "Dummy", hp: 999999999, defense: 0, stability: 0, weaknesses: [], phase: null, cover: "none" },
      configOverrides: {},
    };
    return simulateScenario(sc, { ...reg, getStatus: (id) => map.get(id), getStatusMap: () => map });
  };
  const burn = run("burn").log.find((e) => e.action === "we_basic")!;
  assert.equal(burn.finalDamage, 1500, "Burn attack: ceil(1000 × 1.5)");
  const hydro = run("hydro").log.find((e) => e.action === "we_basic")!;
  assert.equal(hydro.finalDamage, 1000, "Hydro attack: the Burn-gated bonus does not apply");
});

/** The synthetic fixtures must never leak into production data. */
test("the synthetic fixtures stay out of the production status table", () => {
  assert.ok(!STATUS_DEFS.some((s) => s.id.startsWith("we_")), "no we_* fixture in STATUS_DEFS");
});
