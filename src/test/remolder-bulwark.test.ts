import { test } from "node:test";
import assert from "node:assert/strict";
import { createState } from "../engine/state.js";
import { buildGrid } from "../engine/grid.js";
import { remolderGatesMatch, remolderReductionBonus, type RemolderTakenContext } from "../engine/remolder.js";
import { applyReactiveDamage, enemiesWithin3 } from "../engine/simulation.js";
import { multiplicativeTakenMods } from "../engine/statuses.js";
import { DummyConfig, RemolderBuffDef, RemolderEffectGates, RemolderModifier, Scenario } from "../model/types.js";
import { REGISTRY } from "../data/registry.js";
import { REMOLDER_BUFFS, BULWARK_BUFFS } from "../data/remolder.js";

/**
 * PATTERN REMOLDER — BULWARK data tests (2026).
 * Verifies the AUTHORITATIVE Bulwark table (15 buffs, exact values/sources), the taken-damage
 * reductions (via the existing shared taken path), the enemy-count-within-3-tiles gates, and the
 * Lex Talionis reactive-damage event.
 */

const dummy: DummyConfig = { id: "d", name: "d", hp: 999999999, defense: 0, stability: 65, weaknesses: [], phase: null, cover: "none" };
const byName = (n: string): RemolderBuffDef => {
  const b = BULWARK_BUFFS.find((x) => x.name === n);
  assert.ok(b, `Bulwark buff "${n}" exists`);
  return b!;
};
const val = (n: string, level: number): number => {
  const e = byName(n).effects[level][0] as { value?: number; pct?: number; pctOfMaxHp?: number; amount?: number };
  return (e.value ?? e.pct ?? e.pctOfMaxHp ?? e.amount) as number;
};
function qj(buffs: Record<string, number>, extra: Partial<Scenario["team"][number]> = {}): Scenario {
  return { version: 1, seed: 7, turns: 1, team: [{ characterId: "qiongjiu", rotation: ["basic"], equippedFixedKeys: [], remolderBuffs: buffs, ...extra }], dummy };
}

// Shared: a unit carrying one synthetic taken-side modifier (the exact shape the pipeline reads).
const takenUnit = (gates: RemolderEffectGates, value = 0.1, kind: "multiplicative_taken" | "additive_taken" = "multiplicative_taken") => ({
  remolder: { modifiers: [{ sourceType: "buff", sourceId: "t", level: 1, label: "t", effect: { kind, value, gates } } as RemolderModifier] },
});
const tctx = (o: Partial<RemolderTakenContext> = {}): RemolderTakenContext => ({ element: null, isAoE: false, isBoss: false, distance: undefined, enemiesWithin3: undefined, ...o });

// B1 / B2 / B3 / B4 / B5 ----------------------------------------------------------------
test("B1: exactly 15 Bulwark buffs exist (registry holds all 60)", () => {
  assert.equal(BULWARK_BUFFS.length, 15);
  assert.equal(REMOLDER_BUFFS.filter((b) => b.category === "bulwark").length, 15);
  assert.equal(REMOLDER_BUFFS.length, 60, "15 Sentinel + 15 Vanguard + 15 Support + 15 Bulwark");
});

test("B2: all 15 are category bulwark", () => {
  for (const b of BULWARK_BUFFS) assert.equal(b.category, "bulwark", b.name);
});

test("B3: exact max levels", () => {
  const maxByName: Record<string, number> = {
    "Annular Defense": 6, "Pinpoint Defense": 6, "Lex Talionis": 3, "HP Boost": 6, "Defense Boost": 6,
    "Boss Countermeasures": 3, "Breakout Countermeasures": 5, "Lone Rider Countermeasures": 5, "Melee Countermeasures": 3,
    "Physical Resistance": 5, "Burn Resistance": 5, "Hydro Resistance": 5, "Electric Resistance": 5, "Freeze Resistance": 5, "Corrosion Resistance": 5,
  };
  for (const [name, max] of Object.entries(maxByName)) {
    const b = byName(name);
    assert.equal(b.maxLevel, max, `${name} max level`);
    assert.deepEqual(Object.keys(b.effects).map(Number).sort((a, c) => a - c), Array.from({ length: max }, (_, i) => i + 1), `${name} level table 1..${max}`);
  }
});

test("B4: exact level tables match the source", () => {
  // Annular Defense / Pinpoint Defense: 2/2.5/3.5/4/5/5.5 %
  for (const n of ["Annular Defense", "Pinpoint Defense"]) assert.deepEqual([1, 2, 3, 4, 5, 6].map((l) => val(n, l)), [0.02, 0.025, 0.035, 0.04, 0.05, 0.055], n);
  // Lex Talionis: 2/4/6 %
  assert.deepEqual([1, 2, 3].map((l) => val("Lex Talionis", l)), [0.02, 0.04, 0.06]);
  // HP Boost / Defense Boost: 0.8/1.2/2/2.4/3.2/3.6 %
  for (const n of ["HP Boost", "Defense Boost"]) assert.deepEqual([1, 2, 3, 4, 5, 6].map((l) => val(n, l)), [0.008, 0.012, 0.02, 0.024, 0.032, 0.036], n);
  // Boss Countermeasures: 0.4/0.8/1.2 %
  assert.deepEqual([1, 2, 3].map((l) => val("Boss Countermeasures", l)), [0.004, 0.008, 0.012]);
  // Breakout / Lone Rider Countermeasures: 0.2/0.5/0.8/1.1/1.4 %
  for (const n of ["Breakout Countermeasures", "Lone Rider Countermeasures"]) assert.deepEqual([1, 2, 3, 4, 5].map((l) => val(n, l)), [0.002, 0.005, 0.008, 0.011, 0.014], n);
  // Melee Countermeasures: 0.3/0.6/0.9 %
  assert.deepEqual([1, 2, 3].map((l) => val("Melee Countermeasures", l)), [0.003, 0.006, 0.009]);
  // All six Resistances: 0.2/0.4/0.6/0.8/1 %
  for (const n of ["Physical Resistance", "Burn Resistance", "Hydro Resistance", "Electric Resistance", "Freeze Resistance", "Corrosion Resistance"]) {
    assert.deepEqual([1, 2, 3, 4, 5].map((l) => val(n, l)), [0.002, 0.004, 0.006, 0.008, 0.01], n);
  }
});

test("B5: source names exact where supplied; absent where not (none invented)", () => {
  assert.equal(byName("Annular Defense").source, "Thousand-Strand Root");
  assert.equal(byName("Pinpoint Defense").source, "Marrow Root");
  assert.equal(byName("HP Boost").source, "Sanguine Root");
  assert.equal(byName("Defense Boost").source, "Stratified Root");
  assert.equal(byName("Breakout Countermeasures").source, "Lone Rider");
  assert.equal(byName("Lone Rider Countermeasures").source, "Eradication or Cull");
  assert.equal(byName("Physical Resistance").source, "Fortress");
  assert.equal(byName("Burn Resistance").source, "Fireproof");
  assert.equal(byName("Hydro Resistance").source, "Desiccant");
  assert.equal(byName("Electric Resistance").source, "Insulation");
  assert.equal(byName("Freeze Resistance").source, "Winterized");
  assert.equal(byName("Corrosion Resistance").source, "Antivenom");
  for (const n of ["Lex Talionis", "Boss Countermeasures", "Melee Countermeasures"]) assert.equal(byName(n).source, undefined, `${n} source not supplied`);
});

// B6 ------------------------------------------------------------------------------------
test("B6: level clamping (Lex Lv.4 → Lv.3; Annular Lv.7 → Lv.6) and level 0 inactive", () => {
  const lex = createState(qj({ remolder_bulwark_lex_talionis: 4 }), REGISTRY, new Set()).units[0];
  assert.equal(lex.remolder!.activeBuffs[0].level, 3, "Lex Lv.4 → Lv.3");
  const ann = createState(qj({ remolder_bulwark_annular_defense: 7 }), REGISTRY, new Set()).units[0];
  assert.equal(ann.remolder!.activeBuffs[0].level, 6, "Annular Lv.7 → Lv.6");
  const zero = createState(qj({ remolder_bulwark_hp_boost: 0 }), REGISTRY, new Set()).units[0];
  assert.deepEqual(zero.remolder?.activeBuffs ?? [], [], "level 0 inactive");
});

// B7 / B8 -------------------------------------------------------------------------------
test("B7: HP Boost integrates into max HP (existing stat pipeline)", () => {
  const u = createState(qj({ remolder_bulwark_hp_boost: 6 }), REGISTRY, new Set()).units[0];
  // Clean panel HP = 3063 (base 1893 + dispatch 519 + Remolder flat 651); +3.6% → ceil(3063×1.036).
  assert.equal(u.maxHp, Math.ceil(3063 * 1.036), "max HP scaled by +3.6%");
  assert.equal(u.hp, u.maxHp);
  assert.equal(u.panelAtk, 1285, "HP Boost does not change ATK");
});
test("B8: Defense Boost integrates into defense (existing stat pipeline)", () => {
  const u = createState(qj({ remolder_bulwark_defense_boost: 6 }), REGISTRY, new Set()).units[0];
  // Clean panel DEF = 974 (base 528 + dispatch 222 + Remolder flat 224); +3.6% → ceil(974×1.036).
  assert.equal(u.defStat, Math.ceil(974 * 1.036), "DEF scaled by +3.6%");
  assert.equal(u.panelAtk, 1285, "Defense Boost does not change ATK");
});

// B9 / B10 ------------------------------------------------------------------------------
test("B9: Annular Defense applies only to AoE incoming damage", () => {
  const unit = takenUnit({ category: "aoe" });
  assert.equal(remolderReductionBonus(unit, tctx({ isAoE: true })), 0.1, "AoE hit → applies");
  assert.equal(remolderReductionBonus(unit, tctx({ isAoE: false })), 0, "targeted hit → does NOT apply");
});
test("B10: Pinpoint Defense applies only to targeted incoming damage", () => {
  const unit = takenUnit({ category: "targeted" });
  assert.equal(remolderReductionBonus(unit, tctx({ isAoE: false })), 0.1, "targeted hit → applies");
  assert.equal(remolderReductionBonus(unit, tctx({ isAoE: true })), 0, "AoE hit → does NOT apply");
});

// B11 -----------------------------------------------------------------------------------
test("B11: Boss Countermeasures applies only against boss targets", () => {
  const unit = takenUnit({ bossTarget: true });
  assert.equal(remolderReductionBonus(unit, tctx({ isBoss: true })), 0.1, "boss → applies");
  assert.equal(remolderReductionBonus(unit, tctx({ isBoss: false })), 0, "non-boss → does NOT apply");
});

// B12 / B13 -----------------------------------------------------------------------------
test("B12: Physical Resistance applies only to Physical damage", () => {
  const unit = takenUnit({ element: [null] });
  assert.equal(remolderReductionBonus(unit, tctx({ element: null })), 0.1, "physical hit → applies");
  assert.equal(remolderReductionBonus(unit, tctx({ element: "burn" })), 0, "Burn hit → does NOT apply");
});
test("B13: each elemental Resistance applies only to its own element", () => {
  const pairs: [string, "burn" | "hydro" | "electric" | "freeze" | "corrosion"][] = [
    ["Burn Resistance", "burn"], ["Hydro Resistance", "hydro"], ["Electric Resistance", "electric"], ["Freeze Resistance", "freeze"], ["Corrosion Resistance", "corrosion"],
  ];
  for (const [name, el] of pairs) {
    const gates = (BULWARK_BUFFS.find((b) => b.name === name)!.effects[5][0] as { gates: RemolderEffectGates }).gates;
    const unit = takenUnit(gates);
    assert.equal(remolderReductionBonus(unit, tctx({ element: el })), 0.1, `${name} applies to a ${el} hit`);
    for (const other of ["burn", "hydro", "electric", "freeze", "corrosion"] as const) {
      if (other === el) continue;
      assert.equal(remolderReductionBonus(unit, tctx({ element: other })), 0, `${name} does NOT apply to a ${other} hit`);
    }
    assert.equal(remolderReductionBonus(unit, tctx({ element: null })), 0, `${name} does NOT apply to a physical hit`);
  }
});

// B14 -----------------------------------------------------------------------------------
test("B14: Melee Countermeasures applies when the attacker is within 3 tiles; OFF outside range / no grid", () => {
  const unit = takenUnit({ maxDistance: 3 });
  assert.equal(remolderReductionBonus(unit, tctx({ distance: 3 })), 0.1, "3 tiles → applies");
  assert.equal(remolderReductionBonus(unit, tctx({ distance: 1 })), 0.1, "1 tile → applies");
  assert.equal(remolderReductionBonus(unit, tctx({ distance: 4 })), 0, "4 tiles → does NOT apply");
  assert.equal(remolderReductionBonus(unit, tctx({ distance: undefined })), 0, "no grid → inactive (never unconditional)");
});

// B15 / B16 -----------------------------------------------------------------------------
const at = (x: number, y: number) => ({ x, y });
function gridWith(enemyCoords: { x: number; y: number }[]) {
  return buildGrid({
    size: 15,
    units: [{ unitId: "u", coord: at(2, 2) }],
    boss: { center: at(7, 7), footprintSide: 3 },
    enemyUnits: enemyCoords.map((coord, i) => ({ unitId: `e${i}`, coord, hp: 100, defense: 0, stability: 10 })),
  });
}
test("B15: Breakout Countermeasures — >=2 enemies within 3 tiles (enemy-count gate)", () => {
  const gate = { enemiesWithin3: { atLeast: 2 } } as RemolderEffectGates;
  // Real grid helper: 2 enemies at (2,3) and (3,2) → both within 3 tiles of the unit at (2,2).
  assert.equal(enemiesWithin3(gridWith([at(2, 3), at(3, 2)]), "u"), 2, "helper counts 2 enemies within 3 tiles");
  assert.equal(enemiesWithin3(gridWith([at(2, 3)]), "u"), 1, "helper counts 1 enemy");
  assert.equal(enemiesWithin3(gridWith([]), "u"), 0, "helper counts 0 enemies");
  // Gate matcher: fires at 2+, not at 0/1.
  assert.equal(remolderGatesMatch(gate, tctx({ enemiesWithin3: 2 }) as never), true, ">=2 → matches");
  assert.equal(remolderGatesMatch(gate, tctx({ enemiesWithin3: 3 }) as never), true, "3 → matches");
  assert.equal(remolderGatesMatch(gate, tctx({ enemiesWithin3: 1 }) as never), false, "1 → no match");
  assert.equal(remolderGatesMatch(gate, tctx({ enemiesWithin3: 0 }) as never), false, "0 → no match");
  assert.equal(remolderGatesMatch(gate, tctx({ enemiesWithin3: undefined }) as never), false, "no grid → no match");
  // Reduction aggregator: applies only when the count satisfies the gate.
  const unit = takenUnit(gate);
  assert.equal(remolderReductionBonus(unit, tctx({ enemiesWithin3: 2 })), 0.1, "2 enemies → applies");
  assert.equal(remolderReductionBonus(unit, tctx({ enemiesWithin3: 1 })), 0, "1 enemy → does NOT apply");
  assert.equal(remolderReductionBonus(unit, tctx({ enemiesWithin3: undefined })), 0, "no grid → does NOT apply");
});
test("B16: Lone Rider Countermeasures — exactly 1 enemy within 3 tiles", () => {
  const gate = { enemiesWithin3: { atLeast: 1, atMost: 1 } } as RemolderEffectGates;
  assert.equal(remolderGatesMatch(gate, tctx({ enemiesWithin3: 1 }) as never), true, "exactly 1 → matches");
  assert.equal(remolderGatesMatch(gate, tctx({ enemiesWithin3: 0 }) as never), false, "0 → no match");
  assert.equal(remolderGatesMatch(gate, tctx({ enemiesWithin3: 2 }) as never), false, "2 → no match");
  assert.equal(remolderGatesMatch(gate, tctx({ enemiesWithin3: undefined }) as never), false, "no grid → no match");
  const unit = takenUnit(gate);
  assert.equal(remolderReductionBonus(unit, tctx({ enemiesWithin3: 1 })), 0.1, "1 enemy → applies");
  assert.equal(remolderReductionBonus(unit, tctx({ enemiesWithin3: 2 })), 0, "2 enemies → does NOT apply");
});

// B17 / B18 / B19: Lex Talionis ----------------------------------------------------------
// A victim that takes damage retaliates = min(maxHP × pct, ATK). We control maxHP/ATK on a real
// UnitState to exercise both the percentage and the cap.
function lexVictim(level: number) {
  const st = createState(qj({ remolder_bulwark_lex_talionis: level }), REGISTRY, new Set());
  return { st, victim: st.units[0], attacker: st.units[0] === st.units[0] ? { ...st.units[0], id: "attacker", hp: 5000, maxHp: 5000, defStat: 0 } : st.units[0] };
}
test("B17: Lex Talionis retaliation uses max HP × percentage", () => {
  const { st, victim, attacker } = lexVictim(3); // Lv.3 = 6%
  victim.maxHp = 1000;
  victim.panelAtk = 100000; // cap does not bind
  const before = st.log.length;
  const dealt = applyReactiveDamage(st, victim, attacker, 500);
  assert.equal(dealt, 60, "retaliation = ceil(1000 × 6%) = 60");
  assert.equal(attacker.hp, 5000 - 60, "the attacker lost exactly the retaliation");
  assert.equal(st.log.length, before + 1, "one reactive event logged");
  const ev = st.log[st.log.length - 1];
  assert.equal(ev.action, "lex_talionis", "reactive event tagged");
  assert.equal(ev.unit, victim.id, "dealt BY the damaged unit");
  assert.equal(ev.target, "attacker", "against the attacker");
});
test("B18: Lex Talionis retaliation is capped at 100% of the affected unit's ATK", () => {
  const { st, victim, attacker } = lexVictim(3); // Lv.3 = 6%
  victim.maxHp = 1_000_000; // raw = 60,000
  victim.panelAtk = 100; // cap = 100
  const dealt = applyReactiveDamage(st, victim, attacker, 500);
  assert.equal(dealt, 100, "capped at 100% of ATK (100), not 60,000");
  assert.equal(attacker.hp, 5000 - 100);
});
test("B19: Lex Talionis does NOT trigger when no damage is actually taken", () => {
  const { st, victim, attacker } = lexVictim(3);
  victim.maxHp = 1000;
  victim.panelAtk = 100000;
  const before = st.log.length;
  const dealt = applyReactiveDamage(st, victim, attacker, 0);
  assert.equal(dealt, 0, "no damage taken → no retaliation");
  assert.equal(attacker.hp, 5000, "attacker untouched");
  assert.equal(st.log.length, before, "no event logged");
});

// B20 -----------------------------------------------------------------------------------
test("B20: multiple Bulwark modifiers coexist via the existing taken chain (matching reductions SUM, applied once)", () => {
  // AoE + Physical hit vs a unit with Annular Defense (2%) AND Physical Resistance (1%): BOTH
  // gate-qualify → the shared chain sums the reduction (2%+1%=3%) then applies it once → ×0.97.
  const st = createState(qj({ remolder_bulwark_annular_defense: 1, remolder_bulwark_physical_resistance: 5 }), REGISTRY, new Set());
  const u = st.units[0];
  const red = multiplicativeTakenMods(u, st.statusRegistry, true, null).red;
  assert.ok(Math.abs(red - 0.97) < 1e-9, `AoE physical → ×0.97 (0.02 + 0.01) (got ${red})`);
  // A TARGETED physical hit: Annular (AoE-only) drops out → only Physical Resistance (1%) → ×0.99.
  const redTargeted = multiplicativeTakenMods(u, st.statusRegistry, false, null).red;
  assert.ok(Math.abs(redTargeted - 0.99) < 1e-9, `targeted physical → ×0.99 only (got ${redTargeted})`);
  // An AoE Burn hit: Physical Resistance drops out → only Annular Defense (2%) → ×0.98.
  const redBurn = multiplicativeTakenMods(u, st.statusRegistry, true, "burn").red;
  assert.ok(Math.abs(redBurn - 0.98) < 1e-9, `AoE Burn → ×0.98 (got ${redBurn})`);
});
