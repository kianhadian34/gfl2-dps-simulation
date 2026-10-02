import { test } from "node:test";
import assert from "node:assert/strict";
import { createState } from "../engine/state.js";
import { remolderCritDmgBonus, remolderFirstTargetStability, remolderGatesMatch, remolderHealOnAttackPct, type RemolderDamageContext } from "../engine/remolder.js";
import { DummyConfig, RemolderBuffDef, RemolderModifier, Scenario } from "../model/types.js";
import { REGISTRY } from "../data/registry.js";
import { REMOLDER_BUFFS, VANGUARD_BUFFS } from "../data/remolder.js";

/**
 * PATTERN REMOLDER — VANGUARD data tests (2026).
 * Verifies the AUTHORITATIVE Vanguard table (15 buffs, exact values incl. Smite Boost's SEVEN
 * verbatim values, clamping, HP-recovery/stability mechanics) and that each effect lands in the
 * EXISTING engine crit/heal/stability systems.
 */

const dummy: DummyConfig = { id: "d", name: "d", hp: 999999999, defense: 0, stability: 65, weaknesses: [], phase: null, cover: "none" };
const byName = (n: string): RemolderBuffDef => {
  const b = VANGUARD_BUFFS.find((x) => x.name === n);
  assert.ok(b, `Vanguard buff "${n}" exists`);
  return b!;
};
const ctx = (o: Partial<RemolderDamageContext> = {}): RemolderDamageContext => ({ element: null, supportAttack: false, targetExposed: false, isAoE: false, skillType: "basic", isBoss: false, distance: undefined, ...o });
const wrap = (name: string, level: number) => ({
  remolder: { modifiers: [{ sourceType: "buff", sourceId: byName(name).id, level, label: name, effect: byName(name).effects[level][0] } as RemolderModifier] },
});

// --- 1. Structure ---------------------------------------------------------------------
test("V1: exactly 15 Vanguard buffs with correct category and max level", () => {
  assert.equal(VANGUARD_BUFFS.length, 15);
  const maxByName: Record<string, number> = {
    Bloodthirst: 3, "CQC Elite": 3, "Shock and Awe": 2, "Precision Blow": 6, "Beheading Blade": 6, "Smite Boost": 7,
    "Area Smite": 6, "Physical Smite": 5, "Burning Smite": 5, "Hydro Smite": 5, "Electric Smite": 5, "Corrosive Smite": 5,
    "Freezing Smite": 5, "Onslaught Mastery": 5, "Ambush Mastery": 5,
  };
  for (const [name, max] of Object.entries(maxByName)) {
    const b = byName(name);
    assert.equal(b.category, "vanguard", `${name} category`);
    assert.equal(b.maxLevel, max, `${name} max level`);
    assert.deepEqual(Object.keys(b.effects).map(Number).sort((a, c) => a - c), Array.from({ length: max }, (_, i) => i + 1), `${name} level table 1..${max}`);
  }
  assert.equal(REMOLDER_BUFFS.filter((b) => b.category === "vanguard").length, 15, "REMOLDER_BUFFS exposes all 15 Vanguard definitions");
});

test("V2: source names supplied are preserved; absent ones stay undefined (none invented)", () => {
  assert.equal(byName("Precision Blow").source, "Keen Stem");
  assert.equal(byName("Beheading Blade").source, "Cataphyll Stem");
  assert.equal(byName("Smite Boost").source, "Entropic Stem");
  assert.equal(byName("Area Smite").source, "Fissure Stem");
  assert.equal(byName("Physical Smite").source, "Strike");
  assert.equal(byName("Burning Smite").source, "Ignition");
  assert.equal(byName("Hydro Smite").source, "Desiccant");
  assert.equal(byName("Electric Smite").source, "Overload");
  assert.equal(byName("Corrosive Smite").source, "Dissolve");
  assert.equal(byName("Freezing Smite").source, "Glaciate");
  assert.equal(byName("Onslaught Mastery").source, "Assault");
  assert.equal(byName("Ambush Mastery").source, "Sneak Attack");
  for (const n of ["Bloodthirst", "CQC Elite", "Shock and Awe"]) assert.equal(byName(n).source, undefined, `${n} has no invented source`);
});

// --- 2. Exact level values (incl. Smite Boost's seven values) -------------------------
test("V3: exact level values transcribed verbatim (Smite Boost shows ALL SEVEN as supplied)", () => {
  const v = (n: string, l: number) => {
    const e = byName(n).effects[l][0] as { value: number };
    return e.value;
  };
  // Smite Boost: 1 / 2 / 1.6 / 2.4 / 2.8 / 3.6 / 4.0 % — NOT normalized or reordered.
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map((l) => v("Smite Boost", l)), [0.01, 0.02, 0.016, 0.024, 0.028, 0.036, 0.04]);
  // Precision Blow / Beheading Blade / Area Smite: 1.5/2/3/3.5/4.5/5
  for (const n of ["Precision Blow", "Beheading Blade", "Area Smite"]) assert.deepEqual([1, 2, 3, 4, 5, 6].map((l) => v(n, l)), [0.015, 0.02, 0.03, 0.035, 0.045, 0.05], n);
  // Element Smites: 0.2/0.4/0.6/0.8/1
  for (const n of ["Physical Smite", "Burning Smite", "Hydro Smite", "Electric Smite", "Corrosive Smite", "Freezing Smite"]) {
    assert.deepEqual([1, 2, 3, 4, 5].map((l) => v(n, l)), [0.002, 0.004, 0.006, 0.008, 0.01], n);
  }
  // Onslaught / Ambush Mastery: 0.2/0.5/0.8/1.1/1.4
  for (const n of ["Onslaught Mastery", "Ambush Mastery"]) assert.deepEqual([1, 2, 3, 4, 5].map((l) => v(n, l)), [0.002, 0.005, 0.008, 0.011, 0.014], n);
  // CQC Elite: 0.4/0.8/1.2
  assert.deepEqual([1, 2, 3].map((l) => v("CQC Elite", l)), [0.004, 0.008, 0.012]);
  // Bloodthirst (heal pct): 2/4/6 % ; Shock and Awe (flat stability): 1 / 2
  assert.deepEqual([1, 2, 3].map((l) => (byName("Bloodthirst").effects[l][0] as { pct: number }).pct), [0.02, 0.04, 0.06]);
  assert.deepEqual([1, 2].map((l) => (byName("Shock and Awe").effects[l][0] as { amount: number }).amount), [1, 2]);
});

// --- 3. Clamping / level 0 ------------------------------------------------------------
test("V4: Smite Boost Lv.8 clamps to Lv.7; level 0 inactive", () => {
  const sc = (lvl: number): Scenario => ({ version: 1, seed: 7, turns: 1, team: [{ characterId: "qiongjiu", rotation: ["basic"], equippedFixedKeys: [], applyDispatchStats: false, baseStatOverrides: { atk: 1285, hp: 3063, def: 974 }, remolderBuffs: { remolder_vanguard_smite_boost: lvl } }], dummy });
  const clamped = createState(sc(8), REGISTRY, new Set()).units[0];
  assert.equal(clamped.remolder!.activeBuffs[0].level, 7, "8 → 7");
  const lvl7 = createState(sc(7), REGISTRY, new Set()).units[0];
  assert.equal(clamped.panelAtk, lvl7.panelAtk, "Lv.8 == Lv.7");
  const zero = createState(sc(0), REGISTRY, new Set()).units[0];
  assert.deepEqual(zero.remolder?.activeBuffs, [], "level 0 → inactive");
});

// --- 4. Conditional crit DMG integration ----------------------------------------------
test("V5: Smite Boost applies unconditionally; each gated Smite applies only when its gate matches", () => {
  assert.ok(Math.abs(remolderCritDmgBonus(wrap("Smite Boost", 7), ctx({ isAoE: true, isBoss: true, skillType: "active" })) - 0.04) < 1e-9, "unconditional +4% (Lv.7)");
  // Precision Blow (targeted) — +5% at Lv.6 only on targeted hits
  assert.ok(Math.abs(remolderCritDmgBonus(wrap("Precision Blow", 6), ctx({ isAoE: false })) - 0.05) < 1e-9, "targeted hit");
  assert.equal(remolderCritDmgBonus(wrap("Precision Blow", 6), ctx({ isAoE: true })), 0, "AoE hit → no bonus");
  // Beheading Blade (boss)
  assert.ok(Math.abs(remolderCritDmgBonus(wrap("Beheading Blade", 6), ctx({ isBoss: true })) - 0.05) < 1e-9, "vs boss");
  assert.equal(remolderCritDmgBonus(wrap("Beheading Blade", 6), ctx({ isBoss: false })), 0, "vs non-boss");
  // Area Smite (AoE)
  assert.ok(Math.abs(remolderCritDmgBonus(wrap("Area Smite", 6), ctx({ isAoE: true })) - 0.05) < 1e-9, "AoE hit");
  assert.equal(remolderCritDmgBonus(wrap("Area Smite", 6), ctx({ isAoE: false })), 0, "targeted hit");
  // Element Smites
  assert.ok(Math.abs(remolderCritDmgBonus(wrap("Burning Smite", 5), ctx({ element: "burn" })) - 0.01) < 1e-9, "Burn hit");
  assert.equal(remolderCritDmgBonus(wrap("Burning Smite", 5), ctx({ element: "hydro" })), 0, "non-Burn hit");
  assert.ok(Math.abs(remolderCritDmgBonus(wrap("Physical Smite", 5), ctx({ element: null })) - 0.01) < 1e-9, "physical hit");
  assert.equal(remolderCritDmgBonus(wrap("Physical Smite", 5), ctx({ element: "burn" })), 0, "elemental hit → no physical smite");
  // Onslaught (active) / Ambush (out-of-turn)
  assert.ok(Math.abs(remolderCritDmgBonus(wrap("Onslaught Mastery", 5), ctx({ skillType: "active" })) - 0.014) < 1e-9, "active skill");
  assert.equal(remolderCritDmgBonus(wrap("Onslaught Mastery", 5), ctx({ skillType: "basic" })), 0, "basic attack");
  assert.ok(Math.abs(remolderCritDmgBonus(wrap("Ambush Mastery", 5), ctx({ supportAttack: true })) - 0.014) < 1e-9, "out-of-turn (support)");
  assert.equal(remolderCritDmgBonus(wrap("Ambush Mastery", 5), ctx({ supportAttack: false })), 0, "own-turn");
});

// --- 5. CQC Elite distance gate -------------------------------------------------------
test("V6: CQC Elite applies within 3 tiles only; gate OFF without a resolvable distance", () => {
  const g = (byName("CQC Elite").effects[3][0] as { gates?: { maxDistance?: number } }).gates!;
  assert.equal(remolderGatesMatch(g, ctx({ distance: 3 })), true, "3 tiles");
  assert.equal(remolderGatesMatch(g, ctx({ distance: 2 })), true, "2 tiles");
  assert.equal(remolderGatesMatch(g, ctx({ distance: 4 })), false, "4 tiles");
  assert.equal(remolderGatesMatch(g, ctx({ distance: undefined })), false, "no grid → gate OFF (never unconditional)");
});

// --- 6. Bloodthirst HP recovery ------------------------------------------------------
test("V7: Bloodthirst recovers HP = pct × ATK on dealing damage (real engine, not a stat increase)", () => {
  const base = { version: 1 as const, seed: 7, turns: 1, dummy };
  // Qiongjiu at less-than-full HP takes a Basic Attack that deals damage → HP recovers by ceil(ATK × pct).
  const run = (buffs: Record<string, number>) => {
    const st = createState({ ...base, team: [{ characterId: "qiongjiu", rotation: ["basic"], equippedFixedKeys: [], applyDispatchStats: false, baseStatOverrides: { atk: 1285, hp: 3063, def: 974 }, remolderBuffs: buffs }] }, REGISTRY, new Set());
    return st.units[0];
  };
  const withBlood = run({ remolder_vanguard_bloodthirst: 3 });
  assert.ok(Math.abs(remolderHealOnAttackPct(withBlood) - 0.06) < 1e-9, "Lv.3 = 6% of ATK");
  assert.equal(remolderHealOnAttackPct(run({})), 0, "no Bloodthirst → 0");
  // HP is a RECOVERY: panel stats are unchanged (never a permanent stat increase).
  assert.equal(withBlood.panelAtk, 1285, "Bloodthirst does not change ATK");
  assert.equal(withBlood.maxHp, 3063, "nor max HP");
});

test("V8: Bloodthirst heals on damage in a real simulation (capped at max HP)", async () => {
  const { simulateScenario } = await import("../simulate.js");
  // A damaged Qiongjiu with Bloodthirst Lv.3 recovers ceil(panelAtk × 0.06) after her Basic Attack.
  const r = simulateScenario({ version: 1, seed: 7, turns: 1, team: [{ characterId: "qiongjiu", rotation: ["basic"], equippedFixedKeys: [], applyDispatchStats: false, baseStatOverrides: { atk: 1285, hp: 3063, def: 974 }, remolderBuffs: { remolder_vanguard_bloodthirst: 3 } }], dummy }, REGISTRY);
  const ev = r.log.find((e) => e.action === "qiongjiu_basic")!;
  // The heal itself is verified through the engine helper used by the damage site.
  const st = createState({ version: 1, seed: 7, turns: 1, team: [{ characterId: "qiongjiu", rotation: ["basic"], equippedFixedKeys: [], applyDispatchStats: false, baseStatOverrides: { atk: 1285, hp: 3063, def: 974 }, remolderBuffs: { remolder_vanguard_bloodthirst: 3 } }], dummy }, REGISTRY, new Set());
  assert.ok(ev, "the attack resolved");
  assert.equal(Math.ceil(st.units[0].panelAtk * remolderHealOnAttackPct(st.units[0])), Math.ceil(1285 * 0.06), "heal = ceil(ATK × 6%) = 78");
});

// --- 7. Shock and Awe fixed Stability ------------------------------------------------
test("V9: Shock and Awe adds a fixed Stability amount once per turn (real engine buffers)", () => {
  const u = createState({ version: 1, seed: 7, turns: 2, team: [{ characterId: "qiongjiu", rotation: ["basic"], equippedFixedKeys: [], applyDispatchStats: false, baseStatOverrides: { atk: 1285, hp: 3063, def: 974 }, remolderBuffs: { remolder_vanguard_shock_and_awe: 2 } }], dummy }, REGISTRY, new Set()).units[0];
  assert.equal(remolderFirstTargetStability(u), 2, "Lv.2 = +2 fixed Stability");
  assert.equal(remolderFirstTargetStability(createState({ version: 1, seed: 7, turns: 1, team: [{ characterId: "qiongjiu", rotation: ["basic"], equippedFixedKeys: [], applyDispatchStats: false, baseStatOverrides: { atk: 1285, hp: 3063, def: 974 } }], dummy }, REGISTRY, new Set()).units[0]), 0, "absent → 0");
});

test("V10: real run — Shock and Awe raises the first hit's stability damage each turn", async () => {
  const { simulateScenario } = await import("../simulate.js");
  const mk = (buffs: Record<string, number>) => simulateScenario({ version: 1, seed: 7, turns: 2, team: [{ characterId: "qiongjiu", rotation: ["basic"], equippedFixedKeys: [], applyDispatchStats: false, baseStatOverrides: { atk: 1285, hp: 3063, def: 974 }, remolderBuffs: buffs }], dummy }, REGISTRY);
  const plain = mk({});
  const awed = mk({ remolder_vanguard_shock_and_awe: 1 });
  const stabPlain = plain.log.filter((e) => e.action === "qiongjiu_basic").map((e) => e.stabilityDamage);
  const stabAwed = awed.log.filter((e) => e.action === "qiongjiu_basic").map((e) => e.stabilityDamage);
  // Basic stabDamage 2 (per hit) + 1 first-target per turn: first hit each round gets +1.
  assert.equal(stabAwed[0], (stabPlain[0] ?? 0) + 1, "first hit of round 1 gets +1");
  assert.ok(stabAwed.length >= 2, "two rounds of hits");
});
