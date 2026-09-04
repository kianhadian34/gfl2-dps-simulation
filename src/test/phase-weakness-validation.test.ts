import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { customRegistry } from "./helpers.js";
import type { CharacterDef, Element } from "../model/types.js";

// U15b — Phase damage + elemental weakness (validated in-game, 2026).
// The generic weakness multiplier (U20): 1 + 0.10 × matched weaknesses —
// applies to Phase damage EXACTLY as to Physical damage (one matching element
// weakness → ×1.10), independently of Ammo Weakness Upgrade (AWU), which
// remains Physical-only. No additional Phase-specific weakness mechanic exists.
//
// Validated Qiongjiu dataset (Common Rail Lv.2, Burn, 150% ATK, ATK 1958,
// CDMG 123.5%, Out-of-Turn Damage 11.5%, no cover, non-crit):
//   Test A — target WITHOUT Burn weakness (DEF 1133):  1958×1.5×(1958/3091)×1.20 = 2232.54 → 2233
//   Test B — target WITH Burn weakness (DEF 1286):     ×1.10 → 2339.96 → 2340
// The ×1.20 bracket is the no-cover + V6 bonus folded into the mirror character
// (same explicit-V6 approach as weakness-validation.test.ts / ammo-weakness-upgrade.test.ts).

const ATK = 1958;
const MULT = 1.5; // Common Rail

function makeBurnMirror(id: string, critRate = 0): CharacterDef {
  return {
    id,
    name: id,
    phase: "burn",
    base: { atk: ATK, hp: 1000, def: 100, stability: 6, critRate, critDmg: 0.235 },
    weapon: { id: `${id}_w`, name: "w", rarity: "standard", atkLvl1: 0, atkLvl60: 0, level: 60, subStats: [] },
    skills: {
      basic: { id: `${id}_burn`, name: "Burn", type: "basic", element: "burn", multiplier: MULT, stabDamage: 0, cooldown: 0, confectanceCost: 0 },
      active1: { id: `${id}_a1`, name: "-", type: "active", element: "burn", multiplier: 0, stabDamage: 0, cooldown: 1, confectanceCost: 0 },
      active2: { id: `${id}_a2`, name: "-", type: "active", element: "burn", multiplier: 0, stabDamage: 0, cooldown: 1, confectanceCost: 0 },
      ultimate: { id: `${id}_ult`, name: "-", type: "ultimate", element: "burn", multiplier: 0, stabDamage: 0, cooldown: 0, confectanceCost: 3 },
    },
    passive: {
      id: `${id}_passive`,
      name: "-",
      // 1.20 bracket = 0.10 passive no-cover + 0.10 V6 (folded explicitly, as validated).
      effects: [{ kind: "conditional_damage_modifier", scope: "dealt", mode: "additive", value: 0.2, when: "target.noCover" }],
    },
    fixedKeys: [],
  };
}

function burnRun(c: CharacterDef, def: number, weaknesses: Element[]) {
  return simulateScenario(
    {
      version: 1,
      seed: 11,
      turns: 1,
      team: [{ characterId: c.id, rotation: ["basic"], equippedFixedKeys: [] }],
      dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: def, stability: 0, weaknesses, phase: null, cover: "none" },
    },
    customRegistry({ [c.id]: c }),
  );
}

test("U15b Test A: Phase (Burn) damage with NO matching elemental weakness = 2233 baseline", () => {
  const ev = burnRun(makeBurnMirror("a"), 1133, []).log[0];
  assert.equal(ev.finalDamage, 2233); // ceil(1958×1.5×(1958/3091)×1.20) — exact validated baseline
  assert.deepEqual(ev.weaknessExploited, []);
  assert.ok(Math.abs(ev.bonusBracket - 1.2) < 1e-9, "bracket 1.20 (no-cover + V6), no weakness inside");
});

test("U15b Test B: Phase (Burn) damage WITH one matching elemental weakness = 2340 (×1.10)", () => {
  const ev = burnRun(makeBurnMirror("b"), 1286, ["burn"]).log[0];
  assert.equal(ev.finalDamage, 2340); // ceil(1958×1.5×(1958/3244)×1.20×1.10) — validated
  assert.deepEqual(ev.weaknessExploited, ["burn"]);
  // Formula identity from the logged inputs (not a ratio): weakness is a separate factor.
  const expected = Math.ceil(ev.mitigatedDamage! * ev.bonusBracket * 1.1);
  assert.equal(ev.finalDamage, expected);
});

test("U15b: the ×1.10 elemental weakness is a SEPARATE factor on Phase damage, not folded into the bracket", () => {
  const ev = burnRun(makeBurnMirror("c"), 1286, ["burn"]).log[0];
  // Folding the weakness into the additive bracket (1.20 + 0.10 = 1.30) must NOT reproduce 2340.
  assert.equal(Math.ceil(ev.mitigatedDamage! * 1.3), 2305);
  assert.notEqual(ev.finalDamage, 2305);
  assert.equal(ev.finalDamage, 2340);
});

test("U15b: AWU stays out of Phase damage — no stack advancement and no AWU term, even with the ammo context present", () => {
  const c = {
    ...makeBurnMirror("d"),
    skills: {
      ...makeBurnMirror("d").skills,
      basic: { id: "d_burn", name: "Burn", type: "basic" as const, element: "burn" as const, ammoType: "assault_rifle_ammo" as const, multiplier: MULT, stabDamage: 0, cooldown: 0, confectanceCost: 0 },
    },
  };
  const ev = simulateScenario(
    {
      version: 1,
      seed: 11,
      turns: 1,
      team: [{ characterId: c.id, rotation: ["basic"], equippedFixedKeys: [] }],
      dummy: {
        id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 0, stability: 0,
        weaknesses: ["burn"], weaknessTags: ["assault_rifle_ammo"], phase: null, cover: "none",
        passives: [{ id: "awu", name: "AWU trigger", effects: [{ kind: "grant_stacks_on_weakness_exploit", weaknessTag: "assault_rifle_ammo", statusId: "ammo_weakness_upgrade", firstGain: 2, gainPerEvent: 1, maxStacks: 5, requiresElements: ["physical"] }] }],
      },
    },
    customRegistry({ [c.id]: c }),
  ).log[0];
  assert.equal(ev.finalDamage, 4230); // 2937 × 1.20 bracket × 1.20 (burn + ammo generic) — no AWU tier
  assert.ok(Math.abs(ev.bonusBracket - 1.2) < 1e-9, "no AWU term in the bracket for a Phase hit");
  assert.ok(ev.upgradeStacks === undefined, "Phase Ammo exploit does NOT advance AWU");
});