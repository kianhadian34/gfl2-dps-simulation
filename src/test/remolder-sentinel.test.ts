import { test } from "node:test";
import assert from "node:assert/strict";
import { createState } from "../engine/state.js";
import { remolderDealtBonus, remolderGatesMatch } from "../engine/remolder.js";
import { DummyConfig, RemolderBuffDef, RemolderEffect, RemolderEffectGates, RemolderModifier, Scenario } from "../model/types.js";
import { QIONGJIU } from "../data/qiongjiu.js";
import { REGISTRY } from "../data/registry.js";
import { REMOLDER_BUFFS, SENTINEL_BUFFS } from "../data/remolder.js";

/**
 * PATTERN REMOLDER — SENTINEL data tests (2026).
 * Verifies the AUTHORITATIVE Sentinel buff table (15 buffs, exact values, clamping, category
 * totals, Set-Bonus activation) and that each effect lands in the EXISTING engine bucket/gate.
 * Synthetic fillers (Bulwark/Vanguard) are used ONLY to reach Set-Bonus requirements, because
 * those categories' tables are not supplied yet.
 */

const dummy: DummyConfig = { id: "d", name: "d", hp: 999999999, defense: 0, stability: 65, weaknesses: [], phase: null, cover: "none" };
const byName = (n: string): RemolderBuffDef => {
  const b = SENTINEL_BUFFS.find((x) => x.name === n);
  assert.ok(b, `Sentinel buff "${n}" exists`);
  return b!;
};
const eff = (n: string, level: number) => byName(n).effects[level][0];
function qj(buffs: Record<string, number>, extra: Partial<Scenario["team"][number]> = {}, buffSet?: RemolderBuffDef[]): Scenario {
  return {
    version: 1,
    seed: 7,
    turns: 1,
    team: [{ characterId: "qiongjiu", rotation: ["basic"], equippedFixedKeys: [], applyDispatchStats: false, baseStatOverrides: { atk: 1285, hp: 3063, def: 974 }, remolderBuffs: buffs, ...extra }],
    dummy,
    ...(buffSet ? { remolderBuffSet: buffSet } : {}),
  };
}

// --- 1. Structure: all 15 buffs, category, max level, source ------------------------
test("S1: exactly 15 Sentinel buffs with correct category and max level", () => {
  assert.equal(SENTINEL_BUFFS.length, 15);
  const maxByName: Record<string, number> = {
    "Attack Boost": 6, "Critical Boost": 3, "Physical Boost": 5, "Burn Boost": 5, "Hydro Boost": 5,
    "Electric Boost": 5, "Freeze Boost": 5, "Corrosion Boost": 5, Thronebreaker: 6, "Raid Stance": 5,
    "Onslaught Stance": 5, "Pinpoint Specialization": 6, "Area Specialization": 6, "Follow-Up Strike": 2, Headhunter: 3,
  };
  for (const [name, max] of Object.entries(maxByName)) {
    const b = byName(name);
    assert.equal(b.category, "sentinel", `${name} category`);
    assert.equal(b.maxLevel, max, `${name} max level`);
    assert.deepEqual(Object.keys(b.effects).map(Number).sort((a, c) => a - c), Array.from({ length: max }, (_, i) => i + 1), `${name} has a level table 1..${max}`);
  }
  assert.equal(REMOLDER_BUFFS.filter((x) => x.category === "sentinel").length, 15, "REMOLDER_BUFFS exposes all 15 Sentinel definitions");
});

test("S2: source names preserved where supplied; absent where not (none invented)", () => {
  assert.equal(byName("Attack Boost").source, "Heaven Blossom");
  assert.equal(byName("Thronebreaker").source, "Crownsayer Blossom");
  assert.equal(byName("Raid Stance").source, "Ambush");
  assert.equal(byName("Onslaught Stance").source, "Aggressive Attack");
  assert.equal(byName("Pinpoint Specialization").source, "Sepal Bloom");
  assert.equal(byName("Area Specialization").source, "Flameflower");
  assert.equal(byName("Physical Boost").source, "Ballistic Ammo");
  for (const n of ["Critical Boost", "Follow-Up Strike", "Headhunter"]) assert.equal(byName(n).source, undefined, `${n} has no invented source`);
});

// --- 2. Exact level values -----------------------------------------------------------
test("S3: exact level values (ATK / crit / element tables transcribed verbatim)", () => {
  // Attack Boost: +0.8/1.2/2.2/2.4/3.2/3.6
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((l) => (byName("Attack Boost").effects[l][0] as { value: number }).value), [0.008, 0.012, 0.022, 0.024, 0.032, 0.036]);
  // Critical Boost: +1/2/3
  assert.deepEqual([1, 2, 3].map((l) => (byName("Critical Boost").effects[l][0] as { value: number }).value), [0.01, 0.02, 0.03]);
  // Physical Boost: +0.2/0.5/0.8/1.1/1.4 (all element boosts share this table)
  for (const n of ["Physical Boost", "Burn Boost", "Hydro Boost", "Electric Boost", "Freeze Boost", "Corrosion Boost"]) {
    assert.deepEqual([1, 2, 3, 4, 5].map((l) => (byName(n).effects[l][0] as { value: number }).value), [0.002, 0.005, 0.008, 0.011, 0.014], n);
  }
  // Thronebreaker / Pinpoint / Area: +2/2.5/3.5/4/5/5.5
  for (const n of ["Thronebreaker", "Pinpoint Specialization", "Area Specialization"]) {
    assert.deepEqual([1, 2, 3, 4, 5, 6].map((l) => (byName(n).effects[l][0] as { value: number }).value), [0.02, 0.025, 0.035, 0.04, 0.05, 0.055], n);
  }
  // Raid/Onslaught: +0.2/0.6/1.1/1.4/1.8 ; Follow-Up: +0.5/1 ; Headhunter: +0.4/0.8/1.2
  for (const n of ["Raid Stance", "Onslaught Stance"]) assert.deepEqual([1, 2, 3, 4, 5].map((l) => (byName(n).effects[l][0] as { value: number }).value), [0.002, 0.006, 0.011, 0.014, 0.018], n);
  assert.deepEqual([1, 2].map((l) => (byName("Follow-Up Strike").effects[l][0] as { value: number }).value), [0.005, 0.01]);
  assert.deepEqual([1, 2, 3].map((l) => (byName("Headhunter").effects[l][0] as { value: number }).value), [0.004, 0.008, 0.012]);
});

// --- 3. Clamping + level 0 ------------------------------------------------------------
test("S4: Attack Boost Lv.7 clamps to Lv.6; level 0 is inactive", () => {
  const clamped = createState(qj({ remolder_sentinel_attack_boost: 7 }), REGISTRY, new Set()).units[0];
  assert.equal(clamped.remolder!.activeBuffs[0].level, 6, "7 → 6");
  assert.equal(clamped.panelAtk, 1332, "ceil(1285 × 1.036) = 1332 (Lv.6 value)");
  const lvl6 = createState(qj({ remolder_sentinel_attack_boost: 6 }), REGISTRY, new Set()).units[0];
  assert.equal(clamped.panelAtk, lvl6.panelAtk, "Lv.7 == Lv.6");
  const zero = createState(qj({ remolder_sentinel_attack_boost: 0 }), REGISTRY, new Set()).units[0];
  assert.deepEqual(zero.remolder?.activeBuffs, [], "level 0 → no active buffs");
  assert.equal(zero.panelAtk, 1285, "unchanged base panel");
});

// --- 4. Category totals with real Sentinel buffs -------------------------------------
test("S5: Sentinel category total sums the active clamped levels", () => {
  const u = createState(
    qj({ remolder_sentinel_attack_boost: 6, remolder_sentinel_thronebreaker: 6, remolder_sentinel_critical_boost: 3, remolder_sentinel_headhunter: 5 }),
    REGISTRY,
    new Set(),
  ).units[0];
  assert.equal(u.remolder!.categoryTotals.sentinel, 6 + 6 + 3 + 3, "6+6+3 + (Headhunter 5→3) = 18");
  assert.deepEqual({ ...u.remolder!.categoryTotals, sentinel: 0 }, { bulwark: 0, vanguard: 0, support: 0, sentinel: 0 }, "no other categories from Sentinel buffs");
});

// --- 5. Modifier integration ---------------------------------------------------------
test("S6: Attack Boost → existing ATK% bucket; Critical Boost → existing crit system", () => {
  const u = createState(qj({ remolder_sentinel_attack_boost: 6, remolder_sentinel_critical_boost: 3 }), REGISTRY, new Set()).units[0];
  assert.equal(u.panelAtk, 1332, "ATK% folds through the proven panel formula");
  assert.ok(Math.abs(u.critRate - (0.2 + 0.03)) < 1e-9, "crit rate 0.2 + 0.03 (existing crit system)");
});

test("S7: element boosts gate on the attack element (existing additive dealt bucket)", () => {
  const burn = eff("Burn Boost", 4); // +1.1%, element ["burn"]
  const phys = eff("Physical Boost", 4); // +1.1%, element [null]
  const wrap = (effect: RemolderEffect): { remolder: { modifiers: RemolderModifier[] } } => ({ remolder: { modifiers: [{ sourceType: "buff", sourceId: "x", level: 4, label: "t", effect }] } });
  const burnCtx = { element: "burn" as const, supportAttack: false, targetExposed: false, isAoE: false, skillType: "basic" as const, isBoss: false, distance: undefined };
  assert.equal(remolderDealtBonus(wrap(burn), burnCtx), 0.011, "Burn Boost applies to a Burn hit");
  assert.equal(remolderDealtBonus(wrap(burn), { ...burnCtx, element: "hydro" }), 0, "...and NOT to a Hydro hit");
  assert.equal(remolderDealtBonus(wrap(phys), { ...burnCtx, element: null }), 0.011, "Physical Boost applies to phase-less (physical) hits");
  assert.equal(remolderDealtBonus(wrap(phys), burnCtx), 0, "...and NOT to elemental hits");
});

test("S8: Sentinel gates — boss / out-of-turn / active-skill / targeted / AoE / exposed / distance", () => {
  const C = (o: Partial<Parameters<typeof remolderGatesMatch>[1]> = {}): Parameters<typeof remolderGatesMatch>[1] => ({ element: null, supportAttack: false, targetExposed: false, isAoE: false, skillType: "basic", isBoss: false, distance: undefined, ...o });
  const gatesOf = (n: string, l: number) => (eff(n, l) as { gates?: RemolderEffectGates }).gates;
  // Thronebreaker (boss)
  assert.equal(remolderGatesMatch(gatesOf("Thronebreaker", 6), C({ isBoss: true })), true, "vs boss");
  assert.equal(remolderGatesMatch(gatesOf("Thronebreaker", 6), C({ isBoss: false })), false, "vs non-boss");
  // Raid Stance (out-of-turn)
  assert.equal(remolderGatesMatch(gatesOf("Raid Stance", 5), C({ supportAttack: true })), true, "out-of-turn (support)");
  assert.equal(remolderGatesMatch(gatesOf("Raid Stance", 5), C({ supportAttack: false })), false, "own-turn");
  // Onslaught Stance (active skill)
  assert.equal(remolderGatesMatch(gatesOf("Onslaught Stance", 5), C({ skillType: "active" })), true, "active skill");
  assert.equal(remolderGatesMatch(gatesOf("Onslaught Stance", 5), C({ skillType: "basic" })), false, "basic attack");
  // Pinpoint (targeted) / Area (AoE)
  assert.equal(remolderGatesMatch(gatesOf("Pinpoint Specialization", 6), C({ isAoE: false })), true, "targeted hit");
  assert.equal(remolderGatesMatch(gatesOf("Pinpoint Specialization", 6), C({ isAoE: true })), false, "AoE hit");
  assert.equal(remolderGatesMatch(gatesOf("Area Specialization", 6), C({ isAoE: true })), true, "AoE hit");
  assert.equal(remolderGatesMatch(gatesOf("Area Specialization", 6), C({ isAoE: false })), false, "targeted hit");
  // Follow-Up Strike (Stability Break = exposed target)
  assert.equal(remolderGatesMatch(gatesOf("Follow-Up Strike", 2), C({ targetExposed: true })), true, "target in Stability Break");
  assert.equal(remolderGatesMatch(gatesOf("Follow-Up Strike", 2), C({ targetExposed: false })), false, "target not broken");
  // Headhunter (distance > 6)
  assert.equal(remolderGatesMatch(gatesOf("Headhunter", 3), C({ distance: 7 })), true, "7 tiles away");
  assert.equal(remolderGatesMatch(gatesOf("Headhunter", 3), C({ distance: 6 })), false, "exactly 6 tiles");
  assert.equal(remolderGatesMatch(gatesOf("Headhunter", 3), C({ distance: undefined })), false, "no grid → gate OFF (never unconditional)");
});

// --- 6. Set Bonus activation with real Sentinel buffs ---------------------------------
test("S9: Qiongjiu's six Set Bonuses activate from category totals driven by real Sentinel buffs", () => {
  // Synthetic Bulwark/Vanguard fillers (their real tables are not supplied yet).
  const filler = (id: string, cat: "bulwark" | "vanguard", maxLevel: number): RemolderBuffDef => ({
    id, name: id, category: cat, maxLevel,
    effects: Object.fromEntries(Array.from({ length: maxLevel }, (_, i) => [i + 1, [{ kind: "stat_pct", stat: "def", value: 0 }]])) as RemolderBuffDef["effects"],
  });
  const bw = filler("t_bw", "bulwark", 15);
  const vg = filler("t_vg", "vanguard", 15);
  // Sentinel total 15 from real buffs: Attack Boost 6 + Thronebreaker 6 + Critical Boost 3.
  const u = createState(
    qj(
      { remolder_sentinel_attack_boost: 6, remolder_sentinel_thronebreaker: 6, remolder_sentinel_critical_boost: 3, t_bw: 5, t_vg: 9 },
      {},
      [...SENTINEL_BUFFS, bw, vg],
    ),
    REGISTRY,
    new Set(),
  ).units[0];
  assert.equal(u.remolder!.categoryTotals.sentinel, 15);
  assert.deepEqual(u.remolder!.activeSetBonusIds, ["qiongjiu_set_embryo", "qiongjiu_set_seedling", "qiongjiu_set_sprout", "qiongjiu_set_shoot", "qiongjiu_set_bud", "qiongjiu_set_blossom"], "all six active together");
});

// --- 7. Provenance -------------------------------------------------------------------
test("S10: active Sentinel buffs carry id/level/category for provenance", () => {
  const u = createState(qj({ remolder_sentinel_burn_boost: 3 }), REGISTRY, new Set()).units[0];
  assert.deepEqual(u.remolder!.activeBuffs, [{ buffId: "remolder_sentinel_burn_boost", level: 3, category: "sentinel" }]);
  assert.ok(QIONGJIU.remolderSetBonuses && QIONGJIU.remolderSetBonuses.length === 6, "Qiongjiu still exposes 6 Set Bonuses");
});
