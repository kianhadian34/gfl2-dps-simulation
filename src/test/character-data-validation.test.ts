import { test } from "node:test";
import assert from "node:assert/strict";
import { createState } from "../engine/state.js";
import { DISPATCH_STAT_BUFFS } from "../data/dispatch.js";
import { NEURAL_HELIX_GLOBAL_PCT } from "../data/neural-helix.js";
import { REGISTRY, type Registry } from "../data/registry.js";
import type { CharacterDef, DummyConfig, Scenario, SkillDefVariant } from "../model/types.js";

/**
 * CHARACTER-DATA VALIDATION (2026) — a new character is added as DATA (docs/schemas.md §Notes), so
 * the engine must fail LOUDLY and ACTIONABLY when that data is wrong. These tests pin the boundary
 * checks that a character author hits first.
 *
 * Context: the dispatch-stat table (`DISPATCH_STAT_BUFFS`) is keyed by `CharacterDef.class`. Before
 * this check, an unknown class fell through to a cryptic
 * `Cannot read properties of undefined (reading 'atk')` — it was never a silent NaN, but it did not
 * name the offending character or the valid options.
 */

const dummy: DummyConfig = { id: "d", name: "d", hp: 1, defense: 0, stability: 0, weaknesses: [], phase: null, cover: "none" };

function ability(id: string, name: string): SkillDefVariant {
  return { id, name, type: "basic", element: null, multiplier: 1, stabDamage: 1, cooldown: 0, confectanceCost: 0 };
}

/** A minimal data-only character; `class` is deliberately loose so a bad value can be injected. */
function character(id: string, cls: string): CharacterDef {
  return {
    class: cls as CharacterDef["class"],
    id,
    name: id,
    phase: null,
    base: { atk: 500, hp: 1000, def: 200, stability: 5, critRate: 0, critDmg: 0.2 },
    skills: { basic: { id: `${id}_basic`, name: "Shot", type: "basic", levels: { 1: ability(`${id}_basic`, "Shot") } } },
    passive: { id: `${id}_passive`, name: "P", effects: [] },
    fixedKeys: [],
  };
}

/** Registry exposing exactly one character. */
function registryFor(def: CharacterDef | undefined): Registry {
  return {
    getCharacter: (id) => (id === def?.id ? def : undefined),
    getStatus: (id) => REGISTRY.getStatus(id),
    getStatusMap: () => REGISTRY.getStatusMap(),
    characterIds: () => (def ? [def.id] : []),
    getAffinityKey: (id) => REGISTRY.getAffinityKey(id),
    getCommonKey: (id) => REGISTRY.getCommonKey(id),
    getWeapon: (id) => REGISTRY.getWeapon(id),
    getApexComponent: (id) => REGISTRY.getApexComponent(id),
  };
}

function scenarioFor(characterId: string): Scenario {
  return { version: 1, seed: 1, turns: 1, team: [{ characterId, rotation: ["basic"], equippedFixedKeys: [] }], dummy };
}

test("data validation: an unknown class is rejected by name, listing the valid classes", () => {
  for (const bad of ["BULWARK_TYPO", "Sentinel", ""]) {
    assert.throws(
      () => createState(scenarioFor("x"), registryFor(character("x", bad)), new Set()),
      (e: Error) => e.message.includes(`unknown class "${bad}"`) && e.message.includes("bulwark | vanguard | support | sentinel"),
      `class ${JSON.stringify(bad)} must name itself and list the valid options`,
    );
  }
});

test("data validation: the unknown-class error names the CHARACTER (not just the class)", () => {
  assert.throws(
    () => createState(scenarioFor("newdoll"), registryFor(character("newdoll", "nope")), new Set()),
    /Character newdoll: unknown class "nope"/,
    "a character author must be able to find the bad data file from the message",
  );
});

test("data validation: all four real classes are accepted and resolve their dispatch stats", () => {
  for (const cls of ["bulwark", "vanguard", "support", "sentinel"] as const) {
    const st = createState(scenarioFor("x"), registryFor(character("x", cls)), new Set());
    // The ONE panel path: ceil((base + flat) × (1 + pct)). A real character receives its class's
    // dispatch flat AND the universal Neural Helix +12% (both permanent, both on by default).
    const expected = Math.ceil((500 + DISPATCH_STAT_BUFFS[cls].atk) * (1 + NEURAL_HELIX_GLOBAL_PCT));
    assert.equal(st.units[0].panelAtk, expected, `${cls}: dispatch + universal Neural Helix applied`);
  }
  assert.deepEqual(Object.keys(DISPATCH_STAT_BUFFS).sort(), ["bulwark", "sentinel", "support", "vanguard"], "exactly the four engine classes");
});

test("data validation: an unregistered character id is rejected by name", () => {
  assert.throws(() => createState(scenarioFor("ghost"), registryFor(character("x", "sentinel")), new Set()), /Unknown character: ghost/);
});

test("data validation: a new character with ONLY a basic skill runs (minimal valid data)", () => {
  const st = createState(scenarioFor("min"), registryFor(character("min", "sentinel")), new Set());
  assert.equal(
    st.units[0].panelAtk,
    Math.ceil((500 + DISPATCH_STAT_BUFFS.sentinel.atk) * (1 + NEURAL_HELIX_GLOBAL_PCT)),
    "a basic-only doll is a valid character",
  );
});
