import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { createState, effectiveAbilityLevel } from "../engine/state.js";
import { REGISTRY } from "../data/registry.js";
import { abilities, customRegistry, scenario } from "./helpers.js";
import type { AbilityDef, CharacterDef, ConfigOverrides, FortificationUpgrade, Scenario, SkillDefVariant } from "../model/types.js";

/** Wrap a flat skill as a level-1-only AbilityDef. */
function makeAbility(s: SkillDefVariant): AbilityDef {
  return { id: s.id, name: s.name, type: s.type, levels: { 1: s } };
}

const BASE = {
  id: "lc",
  name: "lc",
  phase: "physical" as const,
  base: { atk: 1000, hp: 1000, def: 100, stability: 6, critRate: 0, critDmg: 0.2 },
  weapon: { id: "lc_w", name: "w", rarity: "standard" as const, atkLvl1: 0, atkLvl60: 0, level: 60, subStats: [] },
  passive: { id: "lc_passive", name: "-", effects: [] as never[] },
  fixedKeys: [] as never[],
};

const PHYSICAL = "physical" as const;

/** active1 variants: Lv1 ×1.0, Lv2 ×2.0, Lv3 ×3.0 (Lv1+Lv3-only variant for the missing-level test). */
function active1Levels(levelsToInclude: number[]): Record<number, SkillDefVariant> {
  const all: Record<number, SkillDefVariant> = {
    1: { id: "lc_a1", name: "Lv1", type: "active", element: PHYSICAL, multiplier: 1.0, stabDamage: 0, cooldown: 0, confectanceCost: 0 },
    2: { id: "lc_a1", name: "Lv2", type: "active", element: PHYSICAL, multiplier: 2.0, stabDamage: 0, cooldown: 0, confectanceCost: 0 },
    3: { id: "lc_a1", name: "Lv3", type: "active", element: PHYSICAL, multiplier: 3.0, stabDamage: 0, cooldown: 0, confectanceCost: 0 },
  };
  const out: Record<number, SkillDefVariant> = {};
  for (const l of levelsToInclude) out[l] = all[l];
  return out;
}

function leveledChar(active1: Record<number, SkillDefVariant>, map?: FortificationUpgrade[]): CharacterDef {
  return {
    ...BASE,
    skills: {
      basic: makeAbility({ id: "lc_basic", name: "Hit", type: "basic", element: PHYSICAL, multiplier: 1.0, stabDamage: 0, cooldown: 0, confectanceCost: 0 }),
      active1: { id: "lc_a1", name: "Common", type: "active", levels: active1 },
      active2: makeAbility({ id: "lc_a2", name: "-", type: "active", element: PHYSICAL, multiplier: 0, stabDamage: 0, cooldown: 1, confectanceCost: 0 }),
      ultimate: makeAbility({ id: "lc_ult", name: "-", type: "ultimate", element: PHYSICAL, multiplier: 0, stabDamage: 0, cooldown: 0, confectanceCost: 3 }),
    },
    ...(map ? { fortificationMap: map } : {}),
  };
}

function sc(config?: ConfigOverrides): Scenario {
  return {
    version: 1,
    seed: 3,
    turns: 2,
    team: [{ characterId: "lc", rotation: ["active1", "active1"], equippedFixedKeys: [] }],
    dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 0, stability: 0, weaknesses: [], phase: null, cover: "none" },
    configOverrides: config ?? {},
  };
}

function levelsFor(def: CharacterDef, config?: ConfigOverrides) {
  const state = createState(sc(config), customRegistry({ lc: def }), new Set());
  return state.units[0].skillLevels;
}

test("Basic Attack remains Level 1 at Fortification 0", () => {
  const lv = levelsFor(leveledChar(active1Levels([1, 2, 3])));
  assert.equal(lv.basic, 1);
  assert.equal(lv.active1, 1);
});

test("Basic Attack stays Level 1 even at a high Fortification value", () => {
  const c = leveledChar(active1Levels([1, 2, 3]), [{ v: 7, ability: "basic", toLevel: 9 }]);
  const lv = levelsFor(c, { fortificationLevel: 9 });
  assert.equal(lv.basic, 1);
  assert.equal(lv.active1, 1); // a basic-only upgrade also doesn't touch other abilities
});

test("an ability with no applicable Fortification resolves to Level 1", () => {
  // The map raises ultimate to Lv2 (which exists at level 2 here) — active1 must stay Lv1.
  const c = leveledChar(active1Levels([1, 2, 3]), [{ v: 2, ability: "ultimate", toLevel: 2 }]);
  c.skills.ultimate = { ...c.skills.ultimate, levels: { 1: c.skills.ultimate.levels[1], 2: { ...c.skills.ultimate.levels[1] } } };
  assert.equal(levelsFor(c, { fortificationLevel: 2 }).active1, 1);
});

test("a Fortification explicitly changes an ability to Level 2", () => {
  const c = leveledChar(active1Levels([1, 2, 3]), [{ v: 3, ability: "active1", toLevel: 2 }]);
  assert.equal(levelsFor(c, { fortificationLevel: 3 }).active1, 2);
});

test("multiple Fortifications progressively change the same ability (V3 → Lv2, V5 → Lv3)", () => {
  const map: FortificationUpgrade[] = [
    { v: 3, ability: "active1", toLevel: 2 },
    { v: 5, ability: "active1", toLevel: 3 },
  ];
  const c = leveledChar(active1Levels([1, 2, 3]), map);
  assert.equal(levelsFor(c, { fortificationLevel: 3 }).active1, 2);
  assert.equal(levelsFor(c, { fortificationLevel: 5 }).active1, 3);
});

test("the resolver chooses the highest applicable V (V4 → Lv2, V5 → Lv3), never counts", () => {
  const map: FortificationUpgrade[] = [
    { v: 3, ability: "active1", toLevel: 2 },
    { v: 5, ability: "active1", toLevel: 3 },
  ];
  const c = leveledChar(active1Levels([1, 2, 3]), map);
  assert.equal(levelsFor(c, { fortificationLevel: 4 }).active1, 2);
  assert.equal(levelsFor(c, { fortificationLevel: 6 }).active1, 3);
});

test("an explicitly requested level that has no variant fails clearly", () => {
  const c = leveledChar(active1Levels([1, 3]), [{ v: 2, ability: "active1", toLevel: 2 }]);
  assert.throws(() => levelsFor(c, { fortificationLevel: 2 }), /requested level 2 has no variant/);
});

test("effectiveAbilityLevel returns the explicit toLevel; levels are never inferred by counting", () => {
  const c = leveledChar(active1Levels([1, 2, 3]), [{ v: 3, ability: "active1", toLevel: 2 }]);
  const cfg = { fortificationLevel: 4 } as never; // effectiveAbilityLevel only reads fortificationLevel
  assert.equal(effectiveAbilityLevel(c, "active1", cfg), 2);
});

test("resolved skill variants drive damage (Lv1 ×1.0 vs Lv2 ×2.0)", () => {
  const c = leveledChar(active1Levels([1, 2, 3]), [{ v: 3, ability: "active1", toLevel: 2 }]);
  const r0 = simulateScenario(sc({}), customRegistry({ lc: c }));
  const r2 = simulateScenario(sc({ fortificationLevel: 3 }), customRegistry({ lc: c }));
  const d0 = r0.log[0].finalDamage;
  const d2 = r2.log[0].finalDamage;
  assert.ok(Math.abs(d2 - 2 * d0) < 2, `Lv2 damage ${d2} ≈ 2× Lv1 damage ${d0}`);
});

test("resolved skills deterministic and isolated between simulations", () => {
  const c = leveledChar(active1Levels([1, 2, 3]), [{ v: 3, ability: "active1", toLevel: 2 }]);
  const a = simulateScenario(sc({ fortificationLevel: 3 }), customRegistry({ lc: c }));
  const b = simulateScenario(sc({ fortificationLevel: 3 }), customRegistry({ lc: c }));
  assert.equal(JSON.stringify(a.log), JSON.stringify(b.log));
  assert.deepEqual(a.totals, b.totals);
  simulateScenario(sc({}), customRegistry({ lc: c })); // interleave a different run
  const b2 = simulateScenario(sc({ fortificationLevel: 3 }), customRegistry({ lc: c }));
  assert.equal(JSON.stringify(b2.log), JSON.stringify(a.log));
});

test("fortificationLevel > 0 with empty map is warned, not silently assumed", () => {
  const c = leveledChar(active1Levels([1, 2, 3]));
  const r = simulateScenario(sc({ fortificationLevel: 3 }), customRegistry({ lc: c }));
  assert.ok(r.warnings.some((w) => w.includes("fortificationLevel")), r.warnings.join("; "));
});

test("Fortification resolution validation: V0/V2 → Lv1, V3 → Lv2 (Lv2 behavior actually used), deterministic", () => {
  // Character data: basic Lv1 (×1.0); active1 Lv1 (×1.0) vs Lv2 (×2.0) — clearly distinguishable.
  // Fortification map: exactly one upgrade — V3 → active1 → Lv2. Nothing else.
  const c = leveledChar(active1Levels([1, 2]), [{ v: 3, ability: "active1", toLevel: 2 }]);
  const run = (fLevel: number) => simulateScenario(sc({ fortificationLevel: fLevel }), customRegistry({ lc: c }));

  // Fortification state → effective ability level (runtime state inspection).
  const lv0 = levelsFor(c, { fortificationLevel: 0 });
  const lv2 = levelsFor(c, { fortificationLevel: 2 });
  const lv3 = levelsFor(c, { fortificationLevel: 3 });
  for (const lv of [lv0, lv2, lv3]) assert.equal(lv.basic, 1); // Basic stays Lv1 at all Fortification values
  assert.equal(lv0.active1, 1);
  assert.equal(lv2.active1, 1); // V2 < 3 → no applicable upgrade
  assert.equal(lv3.active1, 2);

  // Resolved SkillDefVariant → combat consumer must USE Lv2 behavior at V3, not merely report 2.
  // def=0, no crit, no passives: finalDamage = ceil(ATK × multiplier) → Lv1 ×1.0 = 1000, Lv2 ×2.0 = 2000.
  const r0 = run(0);
  const r2 = run(2);
  const r3 = run(3);
  assert.equal(r0.log[0].finalDamage, 1000);
  assert.equal(r2.log[0].finalDamage, 1000);
  assert.equal(r3.log[0].finalDamage, 2000); // the Level 2 variant is what dealt damage

  // Determinism: identical inputs → identical runs.
  const r3b = run(3);
  assert.equal(JSON.stringify(r3b.log), JSON.stringify(r3.log));
  assert.deepEqual(r3b.totals, r3.totals);
});

test("Qiongjiu: Common Rail resolves to Lv1 (authoritative 150%/Stability 3) at V0; Basic stays Lv1", () => {
  const state = createState(scenario({ turns: 1, rotation: ["basic"] }), REGISTRY, new Set());
  const levels = state.units[0].skillLevels;
  assert.equal(levels.basic, 1);
  assert.equal(levels.active1, 1); // V0 → Common Rail Lv1 (authoritative kit sync 2026)
  const skill = state.units[0].skills.active1;
  assert.equal(skill?.multiplier, 1.5); // Common Rail Lv1 = 150% ATK (screenshots)
  assert.equal(skill?.stabDamage, 3);
});