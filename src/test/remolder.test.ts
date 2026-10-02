import { test } from "node:test";
import assert from "node:assert/strict";
import { createState } from "../engine/state.js";
import { remolderGatesMatch } from "../engine/remolder.js";
import { additiveTakenBonus, multiplicativeTakenMods } from "../engine/statuses.js";
import { DummyConfig, RemolderEffectGates, Scenario, RemolderBuffDef } from "../model/types.js";
import { QIONGJIU } from "../data/qiongjiu.js";
import { REGISTRY } from "../data/registry.js";
import { QIONGJIU_SET_BONUSES } from "../data/remolder.js";
import { makeAlly } from "./helpers.js";
import { simulateScenario } from "../simulate.js";

/**
 * PATTERN REMOLDER (2026) — focused engine tests.
 * Buff VALUE tables here are test-synthetics (production tables come from source material);
 * the SYSTEM (clamping, totals, set activation, Unity strongest, modifier integration,
 * battle-start allied %) is what these tests prove.
 */

const dummy: DummyConfig = { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 0, stability: 65, weaknesses: [], phase: null, cover: "none" };

function qjScenario(extra: Partial<Scenario["team"][number]> = {}, buffSet: RemolderBuffDef[] = []): Scenario {
  return {
    version: 1,
    seed: 7,
    turns: 1,
    team: [{ characterId: "qiongjiu", rotation: ["basic"], equippedFixedKeys: [], ...extra }],
    dummy,
    ...(buffSet.length > 0 ? { remolderBuffSet: buffSet } : {}),
  };
}

// --- Test-only buff definitions (synthetic values) --------------------------------
const BUFF = (id: string, name: string, category: "bulwark" | "vanguard" | "support" | "sentinel", maxLevel: number, effects: Record<number, any[]>): RemolderBuffDef => ({
  id,
  name,
  category,
  maxLevel,
  effects,
});
const SENT_ATK_BOOST = BUFF("test_sent_atk", "Sentinel Attack Boost (test)", "sentinel", 3, {
  1: [{ kind: "stat_pct", stat: "atk", value: 0.01 }],
  2: [{ kind: "stat_pct", stat: "atk", value: 0.02 }],
  3: [{ kind: "stat_pct", stat: "atk", value: 0.03 }],
});
const SENT_CRIT = BUFF("test_sent_crit", "Critical Boost (test)", "sentinel", 2, {
  1: [{ kind: "crit_rate", value: 0.05 }],
  2: [{ kind: "crit_rate", value: 0.1 }],
});
const VG = BUFF("test_vg", "Vanguard filler (test)", "vanguard", 15, Object.fromEntries(Array.from({ length: 15 }, (_, i) => [i + 1, [{ kind: "stat_pct", stat: "def", value: 0 }]])) as Record<number, any[]>);
const BW = BUFF("test_bw", "Bulwark filler (test)", "bulwark", 15, Object.fromEntries(Array.from({ length: 15 }, (_, i) => [i + 1, [{ kind: "stat_pct", stat: "def", value: 0 }]])) as Record<number, any[]>);
const SF = BUFF("test_sf", "Sentinel filler (test)", "sentinel", 15, Object.fromEntries(Array.from({ length: 15 }, (_, i) => [i + 1, [{ kind: "stat_pct", stat: "def", value: 0 }]])) as Record<number, any[]>);
const DEALT_FLAT = BUFF("test_dealt", "Dealt +5% (test)", "sentinel", 2, {
  1: [{ kind: "additive_dealt", value: 0.05 }],
  2: [{ kind: "additive_dealt", value: 0.1, gates: { element: ["burn"] } }],
});
const TAKEN_RED = BUFF("test_taken", "Taken -5% phys+phase (test)", "bulwark", 1, {
  1: [{ kind: "multiplicative_taken", value: 0.05, gates: { element: [null], anyPhase: true } }],
});
const UNI = BUFF("test_uni", "Attack Unity (test)", "support", 5, Object.fromEntries(
  Array.from({ length: 5 }, (_, i) => [
    i + 1,
    [{ kind: "unity", label: "attack_unity_test", stat: "atk", target: "all_allies" }, { kind: "stat_pct", stat: "atk", value: (i + 1) * 0.01 }],
  ]),
) as Record<number, any[]>);

// A) Qiongjiu Remolder flat stats ----------------------------------------------
test("A1: Qiongjiu's Lv.60 Remolder flat stats are 252/651/224, separate from base", () => {
  assert.deepEqual(QIONGJIU.remolderFlat, { atk: 252, hp: 651, def: 224 });
  assert.equal(QIONGJIU.base.atk, 802, "base untouched (no merge)");
  const u = createState(qjScenario(), REGISTRY, new Set()).units[0];
  assert.equal(u.panelAtk, 1285, "802 base + 231 dispatch + 252 Remolder flat, always active");
  assert.equal(u.hp, 3063, "1893 + 519 + 651");
  assert.equal(u.defStat, 974, "528 + 222 + 224");
  assert.deepEqual(u.remolder?.flat, { atk: 252, hp: 651, def: 224 }, "source kept for provenance");
});
test("A2: controlled fixture members exclude the Remolder flat (panel contract)", () => {
  const u = createState(qjScenario({ applyDispatchStats: false }), REGISTRY, new Set()).units[0];
  assert.equal(u.panelAtk, 802, "fixture panel = base only (no dispatch, no Remolder flat)");
});

// B) Clamping / level semantics ---------------------------------------------------
test("B1: buff levels clamp to max; level 0 inactive; exact table value at level", () => {
  const u = createState(qjScenario({ remolderBuffs: { test_sent_atk: 99 } }, [SENT_ATK_BOOST]), REGISTRY, new Set()).units[0];
  assert.deepEqual(u.remolder?.activeBuffs, [{ buffId: "test_sent_atk", level: 3, category: "sentinel" }], "99 clamped to max 3");
  assert.equal(u.panelAtk, Math.ceil(1285 * 1.03), "level-3 table value +3%");
  const u2 = createState(qjScenario({ remolderBuffs: { test_sent_atk: 0 } }, [SENT_ATK_BOOST]), REGISTRY, new Set()).units[0];
  assert.deepEqual(u2.remolder?.activeBuffs, [], "level 0 = inactive (flat source still present)");
});
test("B2: unknown buff / missing level rejected loudly (never silently approximated)", () => {
  assert.throws(() => createState(qjScenario({ remolderBuffs: { nope: 1 } }), REGISTRY, new Set()), /unknown buff "nope"/);
  const MISS = BUFF("test_gap", "Gap (test)", "sentinel", 3, { 1: [{ kind: "crit_rate", value: 0.1 }] });
  assert.throws(() => createState(qjScenario({ remolderBuffs: { test_gap: 2 } }, [MISS]), REGISTRY, new Set()), /level 2 has no effect table/);
});

// C) Category totals --------------------------------------------------------------
test("C1: category totals sum active (clamped) levels per category", () => {
  const sc = qjScenario({ remolderBuffs: { test_sent_atk: 5, test_sent_crit: 1, test_vg: 2 } }, [SENT_ATK_BOOST, SENT_CRIT, VG]);
  const u = createState(sc, REGISTRY, new Set()).units[0];
  assert.deepEqual(u.remolder?.categoryTotals, { bulwark: 0, vanguard: 2, support: 0, sentinel: 4 }, "sentinel = 3(clamped)+1, vanguard = 2");
});

// D) Set Bonus activation -----------------------------------------------------------
test("D1: all six QJ Set Bonuses active simultaneously when requirements are met", () => {
  const sc = qjScenario({ remolderBuffs: { test_sf: 15, test_vg: 9, test_bw: 5 } }, [SENT_ATK_BOOST, SF, VG, BW]);
  const u = createState(sc, REGISTRY, new Set()).units[0];
  assert.deepEqual(u.remolder?.activeSetBonusIds, QIONGJIU_SET_BONUSES.map((s) => s.id), "Embryo..Blossom all qualify together");
  assert.ok(u.remolder!.modifiers.some((m) => m.sourceId === "qiongjiu_set_embryo"), "Embryo support +5% modifier present");
});
test("D2: partial requirements activate only qualifying bonuses (Embryo alone)", () => {
  const sc = qjScenario({ remolderBuffs: { test_sf: 4, test_vg: 2 } }, [SENT_ATK_BOOST, SF, VG]);
  const u = createState(sc, REGISTRY, new Set()).units[0];
  assert.deepEqual(u.remolder?.activeSetBonusIds, ["qiongjiu_set_embryo"], "Vanguard 2 + Sentinel 4 → only Embryo");
});

// E) Unity strongest-level resolution ------------------------------------------------
// E) Unity strongest-level resolution (CONFIRMED in-game 2026) -----------------------
function teamSc(team: Scenario["team"], buffSet: RemolderBuffDef[]): Scenario {
  return { version: 1, seed: 7, turns: 1, team, dummy, remolderBuffSet: buffSet };
}
// Helper: build a state with per-id ally base ATK for the "highest attack" selection.
function uniState(team: Scenario["team"], atkById: Record<string, number>) {
  return createState(
    teamSc(team, [UNI]),
    { ...REGISTRY, getCharacter: (id: string) => (id in atkById ? makeAlly(id, atkById[id]) : REGISTRY.getCharacter(id)) },
    new Set(),
  );
}
const uniMember = (id: string, level: number): Scenario["team"][number] => ({ characterId: id, rotation: ["basic"], equippedFixedKeys: [], applyDispatchStats: false, remolderBuffs: { test_uni: level } });

test("E1: a single Unity source grants its level once to allies (owner excluded)", () => {
  const st = uniState(
    [{ characterId: "qiongjiu", rotation: ["basic"], equippedFixedKeys: [] }, uniMember("allyA", 5)],
    { allyA: 1000 },
  );
  const [qj, ally] = st.units;
  assert.equal(ally.panelAtk, 1000, "owner is not self-buffed");
  assert.equal(qj.panelAtk, 1350, "ally's Lv5 Unity (+5%) reaches Qiongjiu exactly once: ceil(1285×1.05)");
});

test("E2: higher Unity level defeats lower level (higher wins, lower ignored)", () => {
  const st = uniState(
    [{ characterId: "qiongjiu", rotation: ["basic"], equippedFixedKeys: [] }, uniMember("allyA", 5), uniMember("allyB", 3)],
    { allyA: 1000, allyB: 900 },
  );
  const [qj] = st.units;
  assert.equal(qj.panelAtk, 1350, "receives Lv5 (+5%), NOT Lv3 (+3%), NOT the sum (+8%): ceil(1285×1.05)");
});

test("E3: multiple lower-level Unity sources are all ignored", () => {
  const st = uniState(
    [{ characterId: "qiongjiu", rotation: ["basic"], equippedFixedKeys: [] }, uniMember("allyA", 2), uniMember("allyB", 4), uniMember("allyC", 1)],
    { allyA: 1000, allyB: 900, allyC: 800 },
  );
  const [qj] = st.units;
  assert.equal(qj.panelAtk, 1337, "only the highest (Lv4 = +4%) applies: ceil(1285×1.04) — the Lv2/Lv1 sources are ignored");
});

test("E4: two or more sources tied at the highest level → exactly ONE active effect", () => {
  const st = uniState(
    [{ characterId: "qiongjiu", rotation: ["basic"], equippedFixedKeys: [] }, uniMember("allyA", 5), uniMember("allyB", 5), uniMember("allyC", 3)],
    { allyA: 1000, allyB: 900, allyC: 800 },
  );
  const [qj] = st.units;
  assert.equal(qj.panelAtk, 1350, "the single winning Lv5 instance applies once: ceil(1285×1.05)");
});

test("E5: tied Unity sources do NOT stack additively (duplicate Lv5 ≠ +10%)", () => {
  const st = uniState(
    [{ characterId: "qiongjiu", rotation: ["basic"], equippedFixedKeys: [] }, uniMember("allyA", 5), uniMember("allyB", 5)],
    { allyA: 1000, allyB: 900 },
  );
  const [qj, a, b] = st.units;
  assert.equal(qj.panelAtk, 1350, "NOT 1285×1.10=1414: duplicate Lv5 instances do not combine");
  assert.equal(a.panelAtk, 1000, "tied Lv5 owner is a claimer → not self-buffed");
  assert.equal(b.panelAtk, 900, "the other tied Lv5 owner is also a claimer → not self-buffed");
});

// F) Modifier integration into EXISTING buckets ---------------------------------------
test("F1: additive_dealt enters the same DMG% bucket (basic hit +5%)", () => {
  // Same seeded run, deterministic, no crit (critRate forced 0): panel 1285 → 1028 × 0.8 base.
  const mk = (withBuff: boolean) =>
    simulateScenario(
      qjScenario(
        { remolderBuffs: withBuff ? { test_dealt: 1 } : {}, baseStatOverrides: { critRate: 0 } },
        [DEALT_FLAT],
      ),
      REGISTRY,
    );
  const d1 = mk(false).log[0].finalDamage;
  const d2 = mk(true).log[0].finalDamage;
  assert.equal(d1, 1131, "ceil(1028 × 1.10 No-Cover)");
  assert.equal(d2, 1183, "ceil(1028 × 1.15) — Remolder +5% in the SAME additive bucket");
});
test("F2: multiplicative_taken enters the existing reduction chain (phys+phase −5%)", () => {
  const sc = qjScenario({ remolderBuffs: { test_taken: 1 } }, [TAKEN_RED]);
  const st = createState(sc, REGISTRY, new Set());
  for (const el of [null, "burn", "freeze"] as const) {
    const { red } = multiplicativeTakenMods(st.units[0], st.statusRegistry, false, el);
    assert.equal(red, 0.95, `-5% taken for element ${String(el)} (physical + any phase)`);
  }
});
test("F3: crit-rate buff folds through the existing crit system", () => {
  const u = createState(qjScenario({ remolderBuffs: { test_sent_crit: 2 } }, [SENT_CRIT]), REGISTRY, new Set()).units[0];
  assert.ok(Math.abs(u.critRate - 0.3) < 1e-9, "0.2 base + 0.1 Remolder crit-rate (existing crit system) — got " + u.critRate);
});
test("F4: QJ Set Bonuses render modifiers with source identity (provenance)", () => {
  const sc = qjScenario({ remolderBuffs: { test_sf: 15, test_vg: 9, test_bw: 5 } }, [SENT_ATK_BOOST, SF, VG, BW]);
  const u = createState(sc, REGISTRY, new Set()).units[0];
  const sprout = u.remolder!.modifiers.find((m) => m.sourceId === "qiongjiu_set_sprout");
  assert.ok(sprout, "Sprout (burn dealt +5%) resolved");
  assert.deepEqual(sprout!.effect, { kind: "additive_dealt", value: 0.05, gates: { element: ["burn"] } });
});

// G) Conditional gates (unit-level) ---------------------------------------------------
test("G1: gate matching rejects non-qualifying events", () => {
  const gates: RemolderEffectGates = { actions: "support", category: "targeted", targetExposed: true, element: ["burn"], anyPhase: true };
  const g: RemolderEffectGates = { element: ["burn"] };
  assert.equal(remolderGatesMatch(gates, { element: "burn", supportAttack: true, targetExposed: true, isAoE: false }), true, "burn support hit on exposed targeted target");
  assert.equal(remolderGatesMatch(gates, { element: "burn", supportAttack: true, targetExposed: true, isAoE: true }), false, "AoE fails category gate");
  assert.equal(remolderGatesMatch(gates, { element: "burn", supportAttack: true, targetExposed: false, isAoE: false }), false, "unexposed fails target gate");
  assert.equal(remolderGatesMatch(gates, { element: "freeze", supportAttack: true, targetExposed: true, isAoE: false }), true, "anyPhase OR: a different phase element still qualifies");
  assert.equal(remolderGatesMatch(g, { element: "burn", supportAttack: true, targetExposed: true, isAoE: false }), true, "listed element qualifies");
  assert.equal(remolderGatesMatch(g, { element: null, supportAttack: true, targetExposed: true, isAoE: false }), false, "physical fails an element-only gate");
  assert.equal(remolderGatesMatch(gates, { element: "burn", supportAttack: false, targetExposed: true, isAoE: false }), false, "non-support fails actions gate");
});

// H) Battle-start allied % (Blossom) --------------------------------------------------
test("H1: Blossom start-of-battle — top-2 allied highest-ATK units +3%, owner excluded, once", () => {
  const sc = teamSc(
    [
      { characterId: "qiongjiu", rotation: ["basic"], equippedFixedKeys: [], remolderBuffs: { test_sf: 15, test_vg: 9, test_bw: 5 } },
      { characterId: "allyA", rotation: ["basic"], equippedFixedKeys: [], applyDispatchStats: false },
      { characterId: "allyB", rotation: ["basic"], equippedFixedKeys: [], applyDispatchStats: false },
    ],
    [SF, VG, BW],
  );
  const st = createState(sc, { ...REGISTRY, getCharacter: (id: string) => (id === "allyA" ? makeAlly("allyA", 1000) : id === "allyB" ? makeAlly("allyB", 900) : REGISTRY.getCharacter(id)) }, new Set());
  const [qj, a, b] = st.units;
  assert.ok(qj.remolder!.activeSetBonusIds.includes("qiongjiu_set_blossom"), "Blossom active");
  assert.equal(qj.panelAtk, Math.ceil(1285 * 1.08), "Bud self +8% (its own set bonus) but NOT Blossom (+3% is allied-only)");
  assert.equal(a.panelAtk, 1030, "allyA top-2 → +3% once");
  assert.equal(b.panelAtk, 927, "allyB top-2 → +3% once");
});