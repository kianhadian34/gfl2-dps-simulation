import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { applyWeaponTrait } from "../engine/simulation.js";
import { createState } from "../engine/state.js";
import { tickStatuses } from "../engine/statuses.js";
import { Rng } from "../engine/rng.js";
import { REGISTRY } from "../data/registry.js";
import type { Registry } from "../data/registry.js";
import { scenario } from "./helpers.js";
import type { SimulationState } from "../engine/state.js";
import type { Scenario } from "../model/types.js";

/**
 * GOLDEN MELODY TRAIT (VALIDATED in-game 2026):
 * - At the END of the holder's own action, if the holder is at FULL HP, exactly ONE random
 *   Trait buff is granted.
 * - Exactly 13 possible buffs, uniform 1/13 selection (NO weights/priorities invented).
 * - The selected buff lasts 1 turn.
 * - Selection uses the deterministic seeded RNG — identical seeds => identical picks.
 * - Data-driven: the pool lives on the weapon's `trait` field; the engine hook is generic.
 * - The 975/1434 oracle fixtures null the Trait OUT deliberately (their controlled runs had
 *   no Trait contribution) — the Trait itself is covered here.
 */

const TRAIT = REGISTRY.getWeapon("jinshizou")!.trait!;

/** The 13 documented outcomes — ids by convention, names pinned against the registry. */
const EXPECTED: Array<[string, string]> = [
  ["trait_domain_penetration_i", "Domain Penetration I"],
  ["trait_crit_rate_boost_i", "Critical Rate Boost I"],
  ["trait_continuous_healing_i", "Continuous Healing I"],
  ["trait_defense_up_i", "Defense Up I"],
  ["trait_piercing_i", "Piercing I"],
  ["trait_area_defense_i", "Area Defense I"],
  ["trait_targeted_attack_defense_i", "Targeted Attack Defense I"],
  ["trait_stability_offensive_i", "Stability Offensive I"],
  ["trait_targeted_attack_boost_i", "Targeted Attack Boost I"],
  ["trait_coverage_boost_i", "Coverage Boost I"],
  ["trait_phase_boost_i", "Phase Boost I"],
  ["trait_attack_up_i", "Attack Up I"],
  ["trait_movement_up_i", "Movement Up I"],
];

function makeState(seed: number, opts: { calibrationLevel?: number; hpOffset?: number } = {}): SimulationState {
  const st = createState(
    {
      ...scenario({ turns: 3, seed }),
      team: [
        {
          characterId: "qiongjiu",
          rotation: ["basic", "basic", "basic"],
          equippedFixedKeys: [],
          weaponId: "jinshizou",
          calibrationLevel: opts.calibrationLevel,
        },
      ],
    },
    REGISTRY,
    new Set(),
  );
  if (opts.hpOffset !== undefined) st.units[0].hp = st.units[0].maxHp - opts.hpOffset;
  return st;
}

function activeTraitIds(st: SimulationState): string[] {
  return st.units[0].statuses.filter((s) => s.statusId.startsWith("trait_")).map((s) => s.statusId);
}

test("pool pin: Golden Melody Trait = exactly 13 documented 1-turn buff outcomes", () => {
  assert.ok(TRAIT, "jinshizou declares a trait pool");
  assert.equal(TRAIT.statusIds.length, 13, "exactly 13 outcomes");
  assert.equal(new Set(TRAIT.statusIds).size, 13, "all unique");
  assert.equal(TRAIT.durationRounds, 1, "lasts 1 turn");
  for (const [id, name] of EXPECTED) {
    const def = REGISTRY.getStatus(id);
    assert.ok(def, `${id} registered`);
    assert.equal(def.name, name, `${id} name`);
    assert.equal(def.category, "buff");
    assert.equal(def.durationRounds, 1);
    assert.equal(def.tickAt, "ownActionEnd");
  }
  assert.deepEqual(
    [...TRAIT.statusIds].sort(),
    EXPECTED.map(([id]) => id).sort(),
    "pool == the validated documented set",
  );
});

test("full-HP action-end trigger: exactly ONE random Trait buff is granted", () => {
  const st = makeState(7);
  const u = st.units[0];
  const before = u.statuses.length;
  const pick = applyWeaponTrait(st, u);
  assert.ok(pick !== null, "granted at full HP");
  assert.ok(TRAIT.statusIds.includes(pick!), "pick belongs to the validated pool");
  assert.equal(u.statuses.length, before + 1, "exactly one status added");
  assert.deepEqual(activeTraitIds(st), [pick], "exactly one granted Trait buff");
  assert.equal(REGISTRY.getStatus(pick!)!.durationRounds, 1, "granted with the 1-turn duration");
});

test("no trigger when the holder is NOT at full HP", () => {
  const st = makeState(7, { hpOffset: 1 });
  assert.equal(applyWeaponTrait(st, st.units[0]), null, "no Trait at <100% HP");
  assert.equal(activeTraitIds(st).length, 0, "no Trait buff granted");
});

test("bounded uniform selection: every outcome represented, each ≈ 1/13 across seeds", () => {
  // Mechanical check of the uniform 1/N rule (VALIDATED in-game 2026): across a fixed seed
  // sweep, each of the 13 outcomes lands inside the expected 100 ± 3σ band (σ ≈ 9.6).
  const counts = new Array<number>(13).fill(0);
  for (let seed = 1; seed <= 1300; seed++) {
    const idx = new Rng(seed).nextInt(13);
    assert.ok(idx >= 0 && idx < 13, "index within [0, 13)");
    counts[idx]++;
  }
  for (let i = 0; i < 13; i++) {
    assert.ok(counts[i] >= 70 && counts[i] <= 130, `outcome ${EXPECTED[i][1]}: count ${counts[i]} outside 100±30 band`);
  }
});

test("the granted buff lasts exactly 1 turn (expires at the holder's next action end)", () => {
  const st = makeState(7);
  assert.ok(applyWeaponTrait(st, st.units[0]) !== null);
  assert.equal(activeTraitIds(st).length, 1);
  tickStatuses(st, st.units[0], "ownActionEnd");
  assert.equal(activeTraitIds(st).length, 0, "expired after one action end");
});

test("deterministic: identical seeds produce identical Trait picks", () => {
  const a = makeState(11);
  const b = makeState(11);
  assert.equal(applyWeaponTrait(a, a.units[0]), applyWeaponTrait(b, b.units[0]), "same pick from same seed");
  assert.deepEqual(activeTraitIds(a), activeTraitIds(b), "same granted status");
  assert.equal(new Rng(11).nextInt(13), new Rng(11).nextInt(13), "RNG-level determinism");
});

test("integration: the hook fires at end of the holder's OWN action in a full simulation", () => {
  // Proving the endOfOwnTurn hook end-to-end via a deterministic damage side-effect:
  // TEST-ONLY degenerate pool (uniform one-of-one — no invented outcome) grants
  // trait_attack_up_i (+10% ATK) after the round-1 action; the round-2 basic must then hit
  // HARDER than an identical no-Trait control run (same seed, crit-zero clone in both, so the
  // RNG-draw consumed by the pick cannot shift crits — chance() short-circuits at rate 0).
  const crit0: Registry = { ...REGISTRY, getCharacter: (id) => (id === "qiongjiu" ? { ...REGISTRY.getCharacter(id)!, base: { ...REGISTRY.getCharacter(id)!.base, critRate: 0 } } : REGISTRY.getCharacter(id)) };
  const sc: Scenario = {
    ...scenario({ turns: 2, seed: 7 }),
    team: [{ characterId: "qiongjiu", rotation: ["basic", "basic"], equippedFixedKeys: [], weaponId: "jinshizou" }],
  };
  const noTrait: Registry = { ...crit0, getWeapon: (id) => (id === "jinshizou" ? { ...REGISTRY.getWeapon(id)!, trait: undefined } : REGISTRY.getWeapon(id)) };
  const withTrait: Registry = { ...crit0, getWeapon: (id) => (id === "jinshizou" ? { ...REGISTRY.getWeapon(id)!, trait: { statusIds: ["trait_attack_up_i"], durationRounds: 1 } } : REGISTRY.getWeapon(id)) };
  const ctrl = simulateScenario(sc, noTrait);
  const tret = simulateScenario(sc, withTrait);
  const dmg = (r: typeof ctrl, i: number) => r.log.filter((e) => e.actionType === "basic")[i].finalDamage;
  assert.equal(dmg(ctrl, 0), dmg(tret, 0), "round-1 hit: Trait not yet granted (grant happens AFTER the action)");
  assert.ok(dmg(tret, 1) > dmg(ctrl, 1), "round-2 hit: +10% ATK Trait buff active (granted at round-1 action end)");
});

test("Trait buff gain feeds the Charging counter (buff-gain rule; C6 grants 2)", () => {
  // Validated interplay (2026): finishing an action at full HP grants the Trait buff, and a
  // buff GAIN is exactly what advances Charging (Golden Melody C1–C6 `stacksPerGain`).
  const st = makeState(7, { calibrationLevel: 6 });
  const u = st.units[0];
  const before = u.weaponCharges;
  assert.ok(applyWeaponTrait(st, u) !== null);
  assert.equal(u.weaponCharges, before + 2, "C6 stacksPerGain 2 from the Trait buff gain");
  assert.equal(activeTraitIds(st).length, 1);
});