import { test } from "node:test";
import assert from "node:assert/strict";
import { createState } from "../engine/state.js";
import { remolderHealBonus, remolderHealEndOfActionPct, remolderStabilityRecovery, type RemolderDamageContext } from "../engine/remolder.js";
import { CharacterDef, DummyConfig, RemolderBuffDef, RemolderEffect, RemolderEffectGates, Scenario } from "../model/types.js";
import { REGISTRY } from "../data/registry.js";
import { QIONGJIU } from "../data/qiongjiu.js";
import { REMOLDER_BUFFS, SUPPORT_BUFFS } from "../data/remolder.js";
import { makeAlly } from "./helpers.js";
import { simulateScenario } from "../simulate.js";

/**
 * PATTERN REMOLDER — SUPPORT data tests (2026).
 * Verifies the AUTHORITATIVE Support table (15 buffs, exact values/sources), the stat/recovery
 * mechanics, Ichor flat-from-initial-stat, and the physical/elemental Unity resolution.
 */

const dummy: DummyConfig = { id: "d", name: "d", hp: 999999999, defense: 0, stability: 65, weaknesses: [], phase: null, cover: "none" };
const byName = (n: string): RemolderBuffDef => {
  const b = SUPPORT_BUFFS.find((x) => x.name === n);
  assert.ok(b, `Support buff "${n}" exists`);
  return b!;
};
const val = (n: string, level: number, idx = 0): number => {
  const e = byName(n).effects[level][idx] as { value?: number; pct?: number; amount?: number; atk?: number; hp?: number };
  return (e.value ?? e.pct ?? e.amount ?? e.atk) as number;
};
// CONTROLLED BASIS (2026): these tests prove Support math, so pin the character stat basis and
// switch OFF the permanent character/global stat sources (Dispatch/Remolder flats/Neural Helix).
// Support self-% and Unity still apply (they are the systems under test), so every original
// expected value is preserved independent of Qiongjiu's ever-changing live panel.
const QJ_CTRL = { applyDispatchStats: false, baseStatOverrides: { atk: 1285, hp: 3063, def: 974 } } as const;
function qj(buffs: Record<string, number>, extra: Partial<Scenario["team"][number]> = {}): Scenario {
  return { version: 1, seed: 7, turns: 1, team: [{ characterId: "qiongjiu", rotation: ["basic"], equippedFixedKeys: [], ...QJ_CTRL, remolderBuffs: buffs, ...extra }], dummy };
}

// S1 / S2 / S3 -------------------------------------------------------------------------
test("S1: exactly 15 Support buffs exist", () => {
  assert.equal(SUPPORT_BUFFS.length, 15);
  assert.equal(REMOLDER_BUFFS.filter((b) => b.category === "support").length, 15);
});

test("S2: every Support buff has category support and the correct max level", () => {
  const maxByName: Record<string, number> = {
    "Fighting Spirit": 6, "Healing Boost": 6, "Life Recovery": 3, "Equilibrium Recovery": 2, "Ichor Resonance": 5,
    "Ichor Conversion": 5, "Purification Feedback": 3, "HP Unity": 5, "Attack Unity": 5, "Physical Unity": 5,
    "Burn Unity": 5, "Hydro Unity": 5, "Electric Unity": 5, "Freeze Unity": 5, "Corrosion Unity": 5,
  };
  for (const [name, max] of Object.entries(maxByName)) {
    const b = byName(name);
    assert.equal(b.category, "support", `${name} category`);
    assert.equal(b.maxLevel, max, `${name} max level`);
    assert.deepEqual(Object.keys(b.effects).map(Number).sort((a, c) => a - c), Array.from({ length: max }, (_, i) => i + 1), `${name} level table 1..${max}`);
  }
});

test("S3: exact level/value tables and source names", () => {
  // Fighting Spirit: 0.4/0.6/1.0/1.2/1.6/1.8 % — BOTH atk and hp at each level.
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((l) => val("Fighting Spirit", l)), [0.004, 0.006, 0.01, 0.012, 0.016, 0.018]);
  assert.equal(byName("Fighting Spirit").effects[3][1].kind, "stat_pct");
  assert.equal((byName("Fighting Spirit").effects[3][0] as { stat: string }).stat, "atk");
  assert.equal((byName("Fighting Spirit").effects[3][1] as { stat: string }).stat, "hp");
  // Healing Boost: 1.5/2/3/3.5/4/5 %
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((l) => val("Healing Boost", l)), [0.015, 0.02, 0.03, 0.035, 0.04, 0.05]);
  // Life Recovery: 0.5/1/1.5 % ; Equilibrium Recovery: 1/2
  assert.deepEqual([1, 2, 3].map((l) => val("Life Recovery", l)), [0.005, 0.01, 0.015]);
  assert.deepEqual([1, 2].map((l) => val("Equilibrium Recovery", l)), [1, 2]);
  // Ichor Resonance / Conversion: 0.2/0.4/0.6/0.8/1.0 %
  for (const n of ["Ichor Resonance", "Ichor Conversion"]) assert.deepEqual([1, 2, 3, 4, 5].map((l) => val(n, l)), [0.002, 0.004, 0.006, 0.008, 0.01], n);
  // Purification Feedback: 1/2/3 %, 2-round duration
  assert.deepEqual([1, 2, 3].map((l) => val("Purification Feedback", l)), [0.01, 0.02, 0.03]);
  assert.equal((byName("Purification Feedback").effects[3][0] as { durationRounds: number }).durationRounds, 2);
  // Unity HP/Attack: 0.3/0.4/0.6/0.7/0.9 (value at index 1 — index 0 is the unity marker)
  for (const n of ["HP Unity", "Attack Unity"]) assert.deepEqual([1, 2, 3, 4, 5].map((l) => val(n, l, 1)), [0.003, 0.004, 0.006, 0.007, 0.009], n);
  for (const n of ["Physical Unity", "Burn Unity", "Hydro Unity", "Electric Unity", "Freeze Unity", "Corrosion Unity"]) assert.deepEqual([1, 2, 3, 4, 5].map((l) => val(n, l, 1)), [0.001, 0.003, 0.005, 0.007, 0.009], n);
  assert.equal(byName("Fighting Spirit").source, "Reverse-Thorned Leaf");
  assert.equal(byName("Healing Boost").source, "Dewdrop Leaf");
  assert.equal(byName("Ichor Resonance").source, "Immersion Therapy");
  assert.equal(byName("Ichor Conversion").source, "Bloodthirst");
  assert.equal(byName("HP Unity").source, "Matrix Leaf");
  assert.equal(byName("Attack Unity").source, "Emerald Leaf");
  assert.equal(byName("Physical Unity").source, "Potential Energy");
  assert.equal(byName("Burn Unity").source, "Ignition");
  assert.equal(byName("Hydro Unity").source, "Flood");
  assert.equal(byName("Electric Unity").source, "Electrified or Charge");
  assert.equal(byName("Freeze Unity").source, "Frost Halo");
  assert.equal(byName("Corrosion Unity").source, "Catalyst");
  for (const n of ["Life Recovery", "Equilibrium Recovery", "Purification Feedback"]) assert.equal(byName(n).source, undefined, `${n} source not supplied`);
});

// S4 -----------------------------------------------------------------------------------
test("S4: level clamping (Lv.8 → max) and level-0 inactivity for Support buffs", () => {
  const clamped = createState(qj({ remolder_support_fighting_spirit: 9 }), REGISTRY, new Set()).units[0];
  assert.equal(clamped.remolder!.activeBuffs[0].level, 6, "9 → 6");
  const zero = createState(qj({ remolder_support_fighting_spirit: 0 }), REGISTRY, new Set()).units[0];
  assert.deepEqual(zero.remolder?.activeBuffs ?? [], [], "level 0 inactive");
});

// S5 -----------------------------------------------------------------------------------
test("S5: Fighting Spirit increases BOTH Attack and max HP through the existing stat pipeline", () => {
  const u = createState(qj({ remolder_support_fighting_spirit: 4 }), REGISTRY, new Set()).units[0];
  // Lv.4 = +1.2% on a clean 1285 ATK / 3063 HP panel.
  assert.equal(u.panelAtk, Math.ceil(1285 * 1.012), "ATK scaled by +1.2%");
  assert.equal(u.hp, Math.ceil(3063 * 1.012), "max HP scaled by +1.2%");
});

// S6 -----------------------------------------------------------------------------------
test("S6: Healing Boost feeds the heal pipeline only (not ATK/HP/damage)", () => {
  const u = createState(qj({ remolder_support_healing_boost: 6 }), REGISTRY, new Set()).units[0];
  assert.ok(Math.abs(remolderHealBonus(u) - 0.05) < 1e-9, "Lv.6 = +5% healing");
  assert.equal(u.panelAtk, 1285, "Healing Boost does NOT change ATK");
  assert.equal(u.hp, 3063, "nor max HP");
  // It DOES scale a heal the holder applies: a Continuous Healing I status heals 10% maxHp × 1.05.
  const healTick = Math.ceil(u.maxHp * 0.1 * (1 + remolderHealBonus(u)));
  assert.equal(healTick, Math.ceil(3063 * 0.1 * 1.05), "heal = ceil(maxHp × 10% × 1.05)");
});

// S7 -----------------------------------------------------------------------------------
test("S7: Life Recovery heals at end of action, once per turn", () => {
  const u = createState(qj({ remolder_support_life_recovery: 2 }), REGISTRY, new Set()).units[0];
  assert.ok(Math.abs(remolderHealEndOfActionPct(u) - 0.01) < 1e-9, "Lv.2 = 1% of max HP");
  // Real 2-round run on the SAME controlled basis, restoring ceil(maxHp × 1%) at each action end.
  const r = simulateScenario({ version: 1, seed: 7, turns: 2, team: [{ characterId: "qiongjiu", rotation: ["basic"], equippedFixedKeys: [], ...QJ_CTRL, remolderBuffs: { remolder_support_life_recovery: 2 } }], dummy: { ...dummy, defense: 0 } }, REGISTRY);
  assert.ok(r.log.length > 0, "simulation ran");
  assert.equal(Math.ceil(u.maxHp * 0.01), 31, "recovery per turn = ceil(3063 × 0.01) = 31");
});

// S8 -----------------------------------------------------------------------------------
test("S8: Equilibrium Recovery restores Stability at end of action, once per turn", () => {
  const u = createState(qj({ remolder_support_equilibrium_recovery: 2 }), REGISTRY, new Set()).units[0];
  assert.equal(remolderStabilityRecovery(u), 2, "Lv.2 = 2 Stability");
});

// S9 / S10 -----------------------------------------------------------------------------
// Ichor's flat reads the character's INITIAL stat, which is intrinsic character data. Use a CONTROLLED
// stub character (explicit base, NO Remolder Lv.60 flat, NO Neural Helix, no affinity) so the ONLY
// variable between the control and the Ichor run is the Ichor support effect under test.
const ICHOR_STUB = {
  ...structuredClone(QIONGJIU),
  id: "qj_ichor_stub",
  base: { atk: 802, hp: 1893, def: 528, stability: 9, critRate: 0.2, critDmg: 0.2 },
  neuralHelixStats: undefined,
  remolderFlat: undefined,
  affinityKey: undefined,
  affinityLevelStats: undefined,
} as CharacterDef;
function ichorRun(buffs: Record<string, number>) {
  const reg = { ...REGISTRY, getCharacter: (id: string) => (id === "qj_ichor_stub" ? ICHOR_STUB : REGISTRY.getCharacter(id)) };
  return createState(
    { version: 1, seed: 7, turns: 1, team: [{ characterId: "qj_ichor_stub", rotation: ["basic"], equippedFixedKeys: [], remolderBuffs: buffs }], dummy },
    reg,
    new Set(),
  ).units[0];
}
test("S9: Ichor Resonance adds flat HP = pct × INITIAL ATK (not panel ATK)", () => {
  const ctrl = ichorRun({});
  const u = ichorRun({ remolder_support_ichor_resonance: 5 });
  // The stub carries NO character HP% — its only HP% is the universal 12% Neural Helix bonus. The
  // control panel is therefore ceil((base 1893 + dispatch HP 519) × 1.12) = 2702, and Ichor adds
  // 1% × INITIAL base ATK (802 × 1% = 8.02) into the SAME flat bucket before that 12%.
  assert.equal(ctrl.maxHp, Math.ceil((1893 + 519) * 1.12), "control panel = (base + dispatch) × 1.12");
  // Ichor's flat (1% × INITIAL base ATK 802 = 8.02) enters the flat bucket ceiled to 9, then the
  // panel applies the 12% HP%: ceil((1893 + 519 + 9) × 1.12) = 2712.
  assert.equal(u.maxHp, Math.ceil((1893 + 519 + Math.ceil(802 * 0.01)) * 1.12), "flat HP = ceil(1% × INITIAL base ATK 802) folded before the HP% bucket");
  assert.equal(u.panelAtk, ctrl.panelAtk, "ATK unaffected by Ichor Resonance");
});
test("S10: Ichor Conversion adds flat ATK = pct × INITIAL max HP (not current max HP)", () => {
  const ctrl = ichorRun({});
  const u = ichorRun({ remolder_support_ichor_conversion: 5 });
  // Control panel ATK = (base 802 + dispatch 231) × (1 + 12% global-NH ATK%) with no Remolder flat.
  // Ichor Conversion adds 1% × INITIAL base HP (1893 × 1% = 18.93) into that SAME flat bucket.
  assert.equal(ctrl.panelAtk, Math.ceil((802 + 231) * 1.12), "control panel ATK = (base + dispatch) × 1.12");
  // Ichor's flat (1% × INITIAL base HP 1893 = 18.93) enters the flat bucket ceiled to 19:
  // ceil((802 + 231 + 19) × 1.12) = 1179.
  assert.equal(u.panelAtk, Math.ceil((802 + 231 + Math.ceil(1893 * 0.01)) * 1.12), "flat ATK = ceil(1% × INITIAL base HP 1893) folded before the ATK% bucket");
  assert.equal(u.maxHp, ctrl.maxHp, "max HP unaffected by Ichor Conversion");
});
// S11 ----------------------------------------------------------------------------------
test("S11: Purification Feedback data — +ATK/+HP%, 2-round duration (trigger recorded, engine has no ally-cleanse hook)", () => {
  const e = byName("Purification Feedback").effects[3][0] as Extract<RemolderEffect, { kind: "ally_cleanse_stat_pct" }>;
  assert.equal(e.kind, "ally_cleanse_stat_pct");
  assert.equal(e.atk, 0.03);
  assert.equal(e.hp, 0.03);
  assert.equal(e.durationRounds, 2, "2-round duration");
  // Recorded for provenance (kept as a modifier) but not consumed by any engine path (unsupported).
  const u = createState(qj({ remolder_support_purification_feedback: 3 }), REGISTRY, new Set()).units[0];
  assert.ok(u.remolder!.modifiers.some((m) => m.effect.kind === "ally_cleanse_stat_pct"), "recorded with source identity");
  assert.equal(u.panelAtk, 1285, "no phantom permanent ATK (trigger cannot fire in the MVP)");
});

// S12–S16: Unity ----------------------------------------------------------------------
function uniTeam(buffs: Record<string, number>[], atk: Record<string, number>): ReturnType<typeof createState> {
  const team: Scenario["team"] = buffs.map((b, i) =>
    i === 0
      ? { characterId: "qiongjiu", rotation: ["basic"], equippedFixedKeys: [], ...QJ_CTRL, remolderBuffs: b }
      : { characterId: `ally${i}`, rotation: ["basic"], equippedFixedKeys: [], applyDispatchStats: false, remolderBuffs: b },
  );
  const reg = { ...REGISTRY, getCharacter: (id: string) => (id in atk ? makeAlly(id, atk[id]) : REGISTRY.getCharacter(id)) };
  return createState({ version: 1, seed: 7, turns: 1, team, dummy }, reg, new Set());
}

test("S12: HP/Attack Unity resolve through the existing Unity system to allies", () => {
  const st = uniTeam([{}, { remolder_support_attack_unity: 5 }], { ally1: 1000 });
  const [qj, ally] = st.units;
  assert.equal(ally.panelAtk, 1000, "claimer not self-buffed");
  assert.equal(qj.panelAtk, Math.ceil(1285 * 1.009), "QJ receives ally's Attack Unity Lv.5 (+0.9%)");
});

test("S13: higher Unity level defeats lower level", () => {
  const st = uniTeam([{}, { remolder_support_attack_unity: 3 }, { remolder_support_attack_unity: 5 }], { ally1: 1000, ally2: 900 });
  const [qj] = st.units;
  assert.equal(qj.panelAtk, Math.ceil(1285 * 1.009), "Lv.5 (+0.9%), not Lv.3 (+0.6%), not the sum");
});

test("S14: tied highest Unity levels do NOT stack (exactly one instance)", () => {
  const st = uniTeam([{}, { remolder_support_attack_unity: 5 }, { remolder_support_attack_unity: 5 }], { ally1: 1000, ally2: 900 });
  const [qj] = st.units;
  assert.equal(qj.panelAtk, Math.ceil(1285 * 1.009), "single Lv.5 instance (+0.9%), NOT +1.8%");
});

test("S15: elemental Unity affects only its own damage element", () => {
  const ctx = (element: "burn" | "hydro" | null): RemolderDamageContext => ({ element, supportAttack: false, targetExposed: false, isAoE: false, skillType: "basic", isBoss: false, distance: undefined });
  // An ally owns Burn Unity Lv.5; Qiongjiu receives it as a dealt modifier.
  const st = uniTeam([{}, { remolder_support_burn_unity: 5 }], { ally1: 1000 });
  const qj = st.units[0];
  const granted = qj.remolder!.modifiers.filter((m) => m.sourceType === "unity" && m.effect.kind === "additive_dealt");
  assert.equal(granted.length, 1, "QJ received exactly one granted damage-unity modifier");
  const gates = (granted[0].effect as { gates?: RemolderEffectGates }).gates!;
  assert.deepEqual(gates.element, ["burn"], "Burn Unity is gated to Burn damage only");
  void ctx;
});

test("S16: Physical Unity gates to physical (element null) only; Unity damage applies per element", () => {
  const st = uniTeam([{}, { remolder_support_physical_unity: 5 }], { ally1: 1000 });
  const granted = st.units[0].remolder!.modifiers.filter((m) => m.sourceType === "unity");
  assert.equal(granted.length, 1);
  assert.deepEqual((granted[0].effect as { gates?: RemolderEffectGates }).gates!.element, [null], "Physical Unity is gated to physical damage");
});
