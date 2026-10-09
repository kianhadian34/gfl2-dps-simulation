import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildScenario,
  DEFAULT_SETUP,
  equipmentOf,
  remolderBuffsOf,
  setRemolderBuffLevel,
  clearRemolderBuffs,
  type SetupState,
} from "../src/shared/setup.js";
import {
  buildRemolderCatalog,
  buildRemolderSetBonusView,
  buildCharacterMetaView,
  remolderCategoryLabel,
  remolderCategoryTotal,
  remolderEffectLine,
  remolderLevelLines,
  remolderRequirementLine,
  remolderTotalLevels,
} from "../src/shared/lists.js";
import type { RemolderPreviewView } from "../src/shared/engine-types.js";

/**
 * PATTERN REMOLDER — SETUP UI DATA-LAYER TESTS (2026).
 *
 * The React control layer is a thin shell over the pure helpers in setup.ts / lists.ts. These tests
 * pin the UI behaviours: per-buff level selection (0 = clear, above-max clamps, field dropped when
 * empty), VERBATIM carry-through into the engine scenario, a catalog shaped from the ENGINE's own
 * `REMOLDER_BUFFS` (never a hard-coded id/name/value), engine-vocabulary effect lines, and an
 * ENGINE-INTEGRATION preview check (the UI's expected totals + Set-Bonus activation are produced by
 * the engine's `resolveRemolderUnit`).
 *
 * No engine math is duplicated here — the engine remolder tests (src/test/remolder*.test.ts) stay
 * authoritative for the resolution semantics.
 */

// ---------------------------------------------------------------------------
// ENGINE DATA (loaded from the built dist — the UI must derive everything from engine data)
// ---------------------------------------------------------------------------

interface EngineBuffDef {
  id: string;
  name: string;
  category: string;
  source?: string;
  maxLevel: number;
  effects: Record<number, Array<{ kind: string; value?: number }>>;
}
interface EngineSetBonusDef {
  id: string;
  name: string;
  remolderLevel: number;
  requires: { bulwark: number; vanguard: number; support: number; sentinel: number };
  effects: Array<{ kind: string }>;
}

async function engineRemolder(): Promise<{
  REMOLDER_BUFFS: EngineBuffDef[];
  QIONGJIU_SET_BONUSES: EngineSetBonusDef[];
  resolveRemolderUnit: (
    buffLevels: Record<string, number> | undefined,
    buffDefs: EngineBuffDef[],
    setBonusDefs: EngineSetBonusDef[] | undefined,
    flat: { atk?: number; hp?: number; def?: number } | undefined,
  ) => { categoryTotals: { bulwark: number; vanguard: number; support: number; sentinel: number }; activeSetBonusIds: string[]; activeBuffs: Array<{ buffId: string; level: number }> };
}> {
  const data = await import(new URL("../../../dist/data/remolder.js", import.meta.url).href);
  const eng = await import(new URL("../../../dist/engine/remolder.js", import.meta.url).href);
  return {
    REMOLDER_BUFFS: (data as { REMOLDER_BUFFS: never }).REMOLDER_BUFFS,
    QIONGJIU_SET_BONUSES: (data as { QIONGJIU_SET_BONUSES: never }).QIONGJIU_SET_BONUSES,
    resolveRemolderUnit: (eng as { resolveRemolderUnit: never }).resolveRemolderUnit,
  };
}

function setupWith(charOverrides: Record<string, unknown> = {}): SetupState {
  return {
    ...DEFAULT_SETUP,
    characters: [{ id: "qiongjiu", name: "Qiongjiu", selected: true, ...charOverrides }],
    rotations: { qiongjiu: ["basic"] },
  };
}

function scenarioMember(s: SetupState): Record<string, unknown> {
  return buildScenario(s).team[0] as unknown as Record<string, unknown>;
}

const ATK_BOOST = "remolder_sentinel_attack_boost"; // maxLevel 6, sentinel
const CRIT_BOOST = "remolder_sentinel_critical_boost"; // maxLevel 3, sentinel
const CQC = "remolder_vanguard_cqc_elite"; // maxLevel 3, vanguard

// ---------------------------------------------------------------------------
// MODEL — legacy shape + VERBATIM carry-through
// ---------------------------------------------------------------------------

test("remolder: a member with NO levels emits no `remolderBuffs` key (legacy shape intact)", () => {
  const m = scenarioMember(setupWith());
  assert.equal("remolderBuffs" in m, false, "no `remolderBuffs` key when nothing is selected");
});

test("remolder: selected levels serialize through buildScenario VERBATIM", () => {
  const s = setupWith({ equipment: { remolderBuffs: { [ATK_BOOST]: 4, [CQC]: 2 } } });
  assert.deepEqual(scenarioMember(s).remolderBuffs, { [ATK_BOOST]: 4, [CQC]: 2 });
});

test("remolder: the UI NEVER sends `remolderBuffSet` (the engine's production default owns the table)", () => {
  const s = setupWith({ equipment: { remolderBuffs: { [ATK_BOOST]: 1 } } });
  assert.equal("remolderBuffSet" in buildScenario(s), false, "the scenario must not override the engine buff table");
});

// ---------------------------------------------------------------------------
// HELPERS — level set / clear / clamp, per-character scope
// ---------------------------------------------------------------------------

test("remolder: setRemolderBuffLevel stores a level; level 0 removes the buff", () => {
  let s = setupWith();
  s = setRemolderBuffLevel(s, "qiongjiu", ATK_BOOST, 3, 6);
  assert.deepEqual(remolderBuffsOf(s.characters[0]), { [ATK_BOOST]: 3 });
  s = setRemolderBuffLevel(s, "qiongjiu", ATK_BOOST, 0, 6);
  assert.equal(equipmentOf(s.characters[0]).remolderBuffs, undefined, "removing the last buff drops the field entirely");
});

test("remolder: a level above maxLevel CLAMPS to max (the engine clamps too)", () => {
  const s = setRemolderBuffLevel(setupWith(), "qiongjiu", CRIT_BOOST, 99, 3);
  assert.equal(remolderBuffsOf(s.characters[0])[CRIT_BOOST], 3, "clamped to the engine maxLevel");
});

test("remolder: a negative level is treated as clear (never stored)", () => {
  let s = setRemolderBuffLevel(setupWith(), "qiongjiu", ATK_BOOST, 4, 6);
  s = setRemolderBuffLevel(s, "qiongjiu", ATK_BOOST, -2, 6);
  assert.equal(equipmentOf(s.characters[0]).remolderBuffs, undefined, "negative → removed");
});

test("remolder: multiple buffs coexist; clearing ONE keeps the others", () => {
  let s = setupWith();
  s = setRemolderBuffLevel(s, "qiongjiu", ATK_BOOST, 2, 6);
  s = setRemolderBuffLevel(s, "qiongjiu", CQC, 1, 3);
  s = setRemolderBuffLevel(s, "qiongjiu", ATK_BOOST, 0, 6);
  assert.deepEqual(remolderBuffsOf(s.characters[0]), { [CQC]: 1 });
});

test("remolder: unknown buff ids are NOT validated in the UI (carried VERBATIM — the engine rejects them)", () => {
  const s = setRemolderBuffLevel(setupWith(), "qiongjiu", "not_a_real_buff", 2, 5);
  assert.equal(remolderBuffsOf(s.characters[0])["not_a_real_buff"], 2, "the UI never silently drops/alters an id");
});

test("remolder: clearRemolderBuffs drops every level for that character", () => {
  let s = setupWith();
  s = setRemolderBuffLevel(s, "qiongjiu", ATK_BOOST, 2, 6);
  s = setRemolderBuffLevel(s, "qiongjiu", CQC, 1, 3);
  s = clearRemolderBuffs(s, "qiongjiu");
  assert.equal(equipmentOf(s.characters[0]).remolderBuffs, undefined);
});

test("remolder: levels are PER CHARACTER (setting one doll never touches another)", () => {
  let s: SetupState = {
    ...DEFAULT_SETUP,
    characters: [
      { id: "qiongjiu", name: "Qiongjiu", selected: true },
      { id: "other", name: "Other", selected: true },
    ],
    rotations: { qiongjiu: ["basic"], other: ["basic"] },
  };
  s = setRemolderBuffLevel(s, "qiongjiu", ATK_BOOST, 5, 6);
  assert.equal(remolderBuffsOf(s.characters[0])[ATK_BOOST], 5);
  assert.deepEqual(remolderBuffsOf(s.characters[1]), {}, "the other doll is untouched");
});

test("remolder: remolderBuffsOf is an empty record when the character has no levels", () => {
  assert.deepEqual(remolderBuffsOf(setupWith().characters[0]), {});
});

test("remolder: selections survive a SETUP PERSISTENCE round-trip (app restart)", async () => {
  const { loadSetup, saveSetup, SETUP_STORAGE_KEY } = await import("../src/shared/persist.js");
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  const s = setRemolderBuffLevel(setupWith(), "qiongjiu", ATK_BOOST, 4, 6);
  saveSetup(storage, s);
  const loaded = loadSetup(storage);
  assert.ok(loaded !== null, "the persisted setup reloads");
  assert.deepEqual(remolderBuffsOf(loaded!.characters[0]), { [ATK_BOOST]: 4 }, "Remolder levels survive the restart");
  assert.ok(store.has(SETUP_STORAGE_KEY), "stored under the versioned key");
});

test("remolder: remolderTotalLevels sums only ACTIVE (>0) levels", () => {
  assert.equal(remolderTotalLevels(undefined), 0);
  assert.equal(remolderTotalLevels({ a: 3, b: 2 }), 5);
  assert.equal(remolderTotalLevels({ a: 3, b: 0 }), 3, "a 0 contributes nothing");
});

// ---------------------------------------------------------------------------
// CATALOG — shaped from engine data; never a hard-coded id/name/value
// ---------------------------------------------------------------------------

test("catalog: 60 engine buffs across the 4 categories, 15 each, in display order", async () => {
  const { REMOLDER_BUFFS } = await engineRemolder();
  const cat = buildRemolderCatalog(REMOLDER_BUFFS as never);
  assert.equal(cat.buffs.length, 60, "the engine's production buff table");
  assert.deepEqual(cat.categories, ["bulwark", "vanguard", "support", "sentinel"], "display order");
  for (const c of cat.categories) assert.equal(cat.buffs.filter((b) => b.category === c).length, 15, `${c} has 15 buffs`);
});

test("catalog: every buff's maxLevel + level keys come from the engine (no interpolation, nothing invented)", async () => {
  const { REMOLDER_BUFFS } = await engineRemolder();
  const cat = buildRemolderCatalog(REMOLDER_BUFFS as never);
  for (const b of cat.buffs) {
    const def = REMOLDER_BUFFS.find((d) => d.id === b.id)!;
    assert.ok(def !== undefined, `${b.id} exists in the engine table`);
    assert.equal(b.name, def.name);
    assert.equal(b.maxLevel, def.maxLevel);
    assert.deepEqual(
      b.levels.map((l) => l.level),
      Object.keys(def.effects).map(Number).sort((x, y) => x - y),
      `${b.id}: exactly the engine's defined levels`,
    );
  }
});

test("catalog: level lines are ENGINE-sourced (spot-checks against the engine's own values)", async () => {
  const { REMOLDER_BUFFS } = await engineRemolder();
  const cat = buildRemolderCatalog(REMOLDER_BUFFS as never);
  const line = (id: string, level: number): string[] => cat.buffs.find((b) => b.id === id)!.levels.find((l) => l.level === level)!.lines;
  assert.deepEqual(line("remolder_sentinel_attack_boost", 1), ["ATK +0.8%"]);
  assert.deepEqual(line("remolder_sentinel_attack_boost", 6), ["ATK +3.6%"]);
  assert.deepEqual(line("remolder_sentinel_critical_boost", 3), ["Crit Rate +3.0%"]);
  assert.deepEqual(line("remolder_sentinel_burn_boost", 5), ["Damage dealt +1.4% (Burn)"]);
  assert.deepEqual(line("remolder_sentinel_physical_boost", 1), ["Damage dealt +0.2% (Physical)"]);
  assert.deepEqual(line("remolder_sentinel_thronebreaker", 1), ["Damage dealt +2.0% (vs boss)"]);
  assert.deepEqual(line("remolder_vanguard_smite_boost", 1), ["Crit DMG +1.0%"]);
  assert.deepEqual(line("remolder_support_ichor_resonance", 1), ["HP +0.2% of INITIAL ATK (flat)"]);
  assert.deepEqual(line("remolder_bulwark_annular_defense", 1), ["Damage taken −2.0% (AoE)"]);
});

test("catalog: the recorded SOURCE name is carried when the engine supplies one, absent otherwise", async () => {
  const { REMOLDER_BUFFS } = await engineRemolder();
  const cat = buildRemolderCatalog(REMOLDER_BUFFS as never);
  assert.equal(cat.buffs.find((b) => b.id === "remolder_sentinel_attack_boost")!.source, "Heaven Blossom", "engine source NAME");
  assert.equal(cat.buffs.find((b) => b.id === "remolder_sentinel_critical_boost")!.source, undefined, "no source → omitted (never invented)");
});

// ---------------------------------------------------------------------------
// EFFECT LINES — the engine's effect/gate vocabulary rendered for display
// ---------------------------------------------------------------------------

test("effect lines: representative engine kinds render as expected (values from the engine)", () => {
  assert.equal(remolderEffectLine({ kind: "stat_pct", stat: "atk", value: 0.036 }), "ATK +3.6%");
  assert.equal(remolderEffectLine({ kind: "additive_dealt", value: 0.05, gates: { actions: "support" } }), "Damage dealt +5.0% (Support Actions)");
  assert.equal(remolderEffectLine({ kind: "multiplicative_taken", value: 0.05, gates: { element: [null], anyPhase: true } }), "Damage taken −5.0% (Physical or Phase)");
  assert.equal(remolderEffectLine({ kind: "multiplicative_taken", value: 0.011, gates: { enemiesWithin3: { atLeast: 2 } } }), "Damage taken −1.1% (≥2 enemies within 3 tiles)");
  assert.equal(remolderEffectLine({ kind: "multiplicative_taken", value: 0.002, gates: { enemiesWithin3: { atLeast: 1, atMost: 1 } } }), "Damage taken −0.2% (exactly 1 enemy within 3 tiles)");
  assert.equal(remolderEffectLine({ kind: "crit_dmg_gated", value: 0.015, gates: { category: "targeted" } }), "Crit DMG +1.5% (Targeted)");
  assert.equal(remolderEffectLine({ kind: "additive_dealt", value: 0.004, gates: { minDistance: 6 } }), "Damage dealt +0.4% (distance > 6)");
  assert.equal(remolderEffectLine({ kind: "additive_dealt", value: 0.004, gates: { maxDistance: 3 } }), "Damage dealt +0.4% (distance ≤ 3)");
  assert.equal(remolderEffectLine({ kind: "additive_dealt", value: 0.002, gates: { skillTypes: ["active"] } }), "Damage dealt +0.2% (Active skills)");
  assert.equal(remolderEffectLine({ kind: "additive_dealt", value: 0.005, gates: { targetExposed: true } }), "Damage dealt +0.5% (vs Stability-broken target)");
  assert.equal(remolderEffectLine({ kind: "additive_dealt", value: 0.002, gates: { outOfTurn: true } }), "Damage dealt +0.2% (out-of-turn)");
  assert.equal(remolderEffectLine({ kind: "first_target_stability", amount: 2 }), "First damaged target each turn: Stability −2");
  assert.equal(remolderEffectLine({ kind: "heal_on_attack", pct: 0.02 }), "On dealing damage: recover 2.0% of ATK as HP");
  assert.equal(remolderEffectLine({ kind: "heal_end_of_action", pct: 0.005 }), "End of action: recover 0.5% of max HP");
  assert.equal(remolderEffectLine({ kind: "stability_recovery", amount: 1 }), "End of action: Stability +1");
  assert.equal(remolderEffectLine({ kind: "heal_bonus", value: 0.015 }), "Healing / shield dealt +1.5%");
  assert.equal(remolderEffectLine({ kind: "flat_atk_from_base_hp", pct: 0.002 }), "ATK +0.2% of INITIAL max HP (flat)");
  assert.equal(remolderEffectLine({ kind: "out_of_turn_dmg", value: 0.014 }), "Out-of-turn damage +1.4%");
  assert.equal(remolderEffectLine({ kind: "reactive_damage", pctOfMaxHp: 0.02, capAtAtk: true }), "On taking damage: deal 2.0% of own max HP back to the attacker (capped at 100% ATK)");
  assert.equal(remolderEffectLine({ kind: "ally_cleanse_stat_pct", atk: 0.01, hp: 0.01, durationRounds: 2 }), "On cleansing an ally: ATK +1.0% / HP +1.0% for 2 rounds");
  assert.equal(remolderEffectLine({ kind: "allied_stat_pct_battle_start", stat: "atk", value: 0.03, count: 2 }), "Battle start: the top-2 highest-ATK allied units gain ATK +3.0%");
});

test("effect lines: an UNRECOGNISED engine kind yields no line (never a fabricated one)", () => {
  assert.equal(remolderEffectLine({ kind: "some_future_kind" }), undefined);
});

test("effect lines: a Unity marker is paired with its same-level strength (NOT shown as a self stat)", () => {
  const unityLevel = [
    { kind: "unity", label: "hp_unity", stat: "hp" },
    { kind: "stat_pct", stat: "hp", value: 0.003 },
  ];
  assert.deepEqual(remolderLevelLines(unityLevel), ["Allied Unity: allies gain HP +0.3% (strongest level wins; does not stack)"]);
  const unityDealt = [
    { kind: "unity_dealt", label: "physical_unity", gates: { element: [null] } },
    { kind: "additive_dealt", value: 0.001, gates: { element: [null] } },
  ];
  assert.deepEqual(remolderLevelLines(unityDealt), ["Allied Unity: allies gain damage dealt +0.1% (Physical)"]);
});

test("effect lines: a level with an unpaired self-effect still shows it (only the Unity pair is folded)", () => {
  assert.deepEqual(remolderLevelLines([{ kind: "stat_pct", stat: "atk", value: 0.004 }, { kind: "stat_pct", stat: "hp", value: 0.004 }]), ["ATK +0.4%", "HP +0.4%"]);
});

test("labels: category labels + requirement lines come from the shared display vocabulary", () => {
  assert.equal(remolderCategoryLabel("bulwark"), "Bulwark");
  assert.equal(remolderCategoryLabel("vanguard"), "Vanguard");
  assert.equal(remolderCategoryLabel("weird"), "weird", "unknown id falls back to the raw id");
  assert.equal(remolderRequirementLine({ bulwark: 5, vanguard: 9, support: 0, sentinel: 15 }), "Bulwark 5 · Vanguard 9 · Sentinel 15", "zero requirements are omitted");
});

// ---------------------------------------------------------------------------
// SET BONUSES — per-character definitions shaped for display
// ---------------------------------------------------------------------------

test("set bonuses: buildRemolderSetBonusView keeps the engine requirements + builds effect lines", async () => {
  const { QIONGJIU_SET_BONUSES } = await engineRemolder();
  const embryo = buildRemolderSetBonusView(QIONGJIU_SET_BONUSES.find((s) => s.id === "qiongjiu_set_embryo")! as never);
  assert.equal(embryo.name, "Embryo");
  assert.equal(embryo.remolderLevel, 1);
  assert.deepEqual(embryo.requires, { bulwark: 0, vanguard: 2, support: 0, sentinel: 4 });
  assert.deepEqual(embryo.lines, ["Damage dealt +5.0% (Support Actions)"]);
});

test("set bonuses: CharacterMetaView carries the shaped Set Bonuses (the sim:listCharacters payload)", async () => {
  const { QIONGJIU_SET_BONUSES } = await engineRemolder();
  const v = buildCharacterMetaView({ id: "qiongjiu", name: "Qiongjiu", remolderSetBonuses: QIONGJIU_SET_BONUSES as never });
  assert.equal(v.remolderSetBonuses?.length, 6, "Qiongjiu's six tiers");
  assert.deepEqual(v.remolderSetBonuses?.map((s) => s.name), ["Embryo", "Seedling", "Sprout", "Shoot", "Bud", "Blossom"]);
  const blossom = v.remolderSetBonuses!.find((s) => s.name === "Blossom")!;
  assert.equal(blossom.remolderLevel, 60);
  assert.deepEqual(blossom.lines, ["Battle start: the top-2 highest-ATK allied units gain ATK +3.0%"]);
});

// ---------------------------------------------------------------------------
// ENGINE-INTEGRATION PREVIEW — the UI's expected shape comes from the ENGINE
// ---------------------------------------------------------------------------

test("preview: the ENGINE's resolveRemolderUnit produces the totals + active Set Bonuses the UI renders", async () => {
  const { REMOLDER_BUFFS, QIONGJIU_SET_BONUSES, resolveRemolderUnit } = await engineRemolder();
  // sentinel 4 (Attack Boost 1 + Critical Boost 3) + vanguard 2 ⇒ Embryo requirement (0/2/0/4) met.
  const plan = resolveRemolderUnit({ [ATK_BOOST]: 1, [CRIT_BOOST]: 3, [CQC]: 2 }, REMOLDER_BUFFS as never, QIONGJIU_SET_BONUSES as never, undefined);
  const preview: RemolderPreviewView = { categoryTotals: plan.categoryTotals, activeSetBonusIds: plan.activeSetBonusIds, activeBuffs: plan.activeBuffs.map((b) => ({ buffId: b.buffId, level: b.level })) };
  assert.deepEqual(preview.categoryTotals, { bulwark: 0, vanguard: 2, support: 0, sentinel: 4 });
  assert.ok(preview.activeSetBonusIds.includes("qiongjiu_set_embryo"), "Embryo activated by the engine");
  assert.ok(!preview.activeSetBonusIds.includes("qiongjiu_set_seedling"), "Seedling needs Bulwark 1 — not met");
  // The UI reads category totals straight off the engine preview (never recomputed).
  assert.equal(remolderCategoryTotal(preview, "sentinel"), 4);
  assert.equal(remolderCategoryTotal(preview, "bulwark"), 0);
  assert.equal(remolderCategoryTotal(undefined, "sentinel"), 0, "no preview yet → 0");
});

test("preview: the engine CLAMPS above-max levels (the UI's display totals agree with the engine)", async () => {
  const { REMOLDER_BUFFS, QIONGJIU_SET_BONUSES, resolveRemolderUnit } = await engineRemolder();
  const plan = resolveRemolderUnit({ [ATK_BOOST]: 99 }, REMOLDER_BUFFS as never, QIONGJIU_SET_BONUSES as never, undefined);
  assert.equal(plan.categoryTotals.sentinel, 6, "Attack Boost maxLevel 6");
  assert.ok(plan.activeBuffs.some((b) => b.buffId === ATK_BOOST && b.level === 6), "resolved level is the clamped one");
});

test("preview: the engine REJECTS an unknown buff id (the UI must rely on the engine for validation)", async () => {
  const { REMOLDER_BUFFS, resolveRemolderUnit } = await engineRemolder();
  assert.throws(() => resolveRemolderUnit({ not_a_real_buff: 1 }, REMOLDER_BUFFS as never, undefined, undefined), /unknown buff/i);
});

// ---------------------------------------------------------------------------
// END-TO-END STAT INCREASE (UI selection → buildScenario → engine panel)
//
// The user-facing claim under test: selecting a Remolder level actually CHANGES the doll's stats.
// These tests run the REAL path — setRemolderBuffLevel → buildScenario → createState — and pin the
// resulting live panel (and, for damage-side effects, the simulated total). Fixed values come from
// `DEFAULT_SETUP` (seed 7, turns 7) so every number here is deterministic.
// ---------------------------------------------------------------------------

interface EngineForE2E {
  createState: (scenario: unknown, registry: unknown, warnings: Set<string>) => { units: Array<Record<string, number>> };
  REGISTRY: unknown;
  simulateScenario: (scenario: unknown) => { totals: { damage: number } };
}

async function engineForE2E(): Promise<EngineForE2E> {
  const state = await import(new URL("../../../dist/engine/state.js", import.meta.url).href);
  const reg = await import(new URL("../../../dist/data/registry.js", import.meta.url).href);
  const sim = await import(new URL("../../../dist/simulate.js", import.meta.url).href);
  return {
    createState: (state as { createState: never }).createState,
    REGISTRY: (reg as { REGISTRY: never }).REGISTRY,
    simulateScenario: (sim as { simulateScenario: never }).simulateScenario,
  };
}

/** A 1-character Qiongjiu setup (no other equipment) with the given Remolder levels applied. */
function remolderSetup(entries: Array<[string, number, number]>): SetupState {
  let s: SetupState = {
    ...DEFAULT_SETUP,
    characters: [{ id: "qiongjiu", name: "Qiongjiu", selected: true }],
    rotations: { qiongjiu: ["basic", "active1", "active2", "ultimate"] },
  };
  for (const [id, lv, max] of entries) s = setRemolderBuffLevel(s, "qiongjiu", id, lv, max);
  return s;
}

type Panel = { atk: number; hp: number; def: number; cr: number; cd: number; dmg: number };

async function livePanel(entries: Array<[string, number, number]>): Promise<Panel> {
  const eng = await engineForE2E();
  const sc = buildScenario(remolderSetup(entries));
  const u = eng.createState(sc, eng.REGISTRY, new Set()).units[0];
  return { atk: u.panelAtk, hp: u.maxHp, def: u.defStat, cr: u.critRate, cd: u.critDmg, dmg: eng.simulateScenario(sc).totals.damage };
}

const ATK_B = "remolder_sentinel_attack_boost";
const HP_B = "remolder_bulwark_hp_boost";
const DEF_B = "remolder_bulwark_defense_boost";
const CR_B = "remolder_sentinel_critical_boost";

test("E2E: selecting a Remolder level RAISES the live panel ATK (stat_pct), monotonically", async () => {
  const base = await livePanel([]);
  assert.equal(base.atk, 1939, "baseline panel ATK with NO Remolder levels selected");
  const lv1 = await livePanel([[ATK_B, 1, 6]]);
  const lv3 = await livePanel([[ATK_B, 3, 6]]);
  const lv6 = await livePanel([[ATK_B, 6, 6]]);
  assert.equal(lv1.atk, 1952, "Attack Boost Lv1 (+0.8% ATK) → 1952");
  assert.equal(lv3.atk, 1974, "Attack Boost Lv3 (+2.2% ATK) → 1974");
  assert.equal(lv6.atk, 1996, "Attack Boost Lv6 (+3.6% ATK) → 1996");
  assert.ok(lv1.atk > base.atk && lv3.atk > lv1.atk && lv6.atk > lv3.atk, "monotonically increasing with level");
  // Exact math: flat 1589 × (1 + 0.22 base% + 0.036) = 1995.784 → ceil 1996.
  assert.equal(lv6.atk, Math.ceil(1589 * 1.256), "folds into the ONE panel path (flat × (1 + %)), pre-existing formula");
});

test("E2E: HP Boost + Defense Boost raise max HP / DEF on the live panel", async () => {
  const base = await livePanel([]);
  assert.equal(base.hp, 4162, "baseline max HP");
  assert.equal(base.def, 1315, "baseline DEF");
  assert.equal((await livePanel([[HP_B, 1, 6]])).hp, 4192, "HP Boost Lv1 → 4192");
  assert.equal((await livePanel([[HP_B, 6, 6]])).hp, 4296, "HP Boost Lv6 → 4296");
  assert.equal((await livePanel([[DEF_B, 1, 6]])).def, 1325, "Defense Boost Lv1 → 1325");
  assert.equal((await livePanel([[DEF_B, 6, 6]])).def, 1358, "Defense Boost Lv6 → 1358");
});

test("E2E: Critical Boost raises the live panel Crit Rate, and it feeds real crit rolls", async () => {
  const base = await livePanel([]);
  assert.equal(base.cr, 0.2, "baseline crit rate");
  // Crit Rate is a float sum (0.2 + 0.01), so compare with a tolerance rather than bit-exactly.
  assert.ok(Math.abs((await livePanel([[CR_B, 1, 3]])).cr - 0.21) < 1e-9, "Critical Boost Lv1 → +1% (0.21)");
  assert.ok(Math.abs((await livePanel([[CR_B, 3, 3]])).cr - 0.23) < 1e-9, "Critical Boost Lv3 → +3% (0.23)");
  // A chance stat only shifts damage when a roll falls in the new band, so scan seeds (the ENGINE's
  // seeded RNG — the panel change above is the deterministic proof).
  const eng = await engineForE2E();
  let moved = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const a = { ...buildScenario(remolderSetup([])), seed };
    const b = { ...buildScenario(remolderSetup([[CR_B, 3, 3]])), seed };
    if (eng.simulateScenario(a).totals.damage !== eng.simulateScenario(b).totals.damage) moved++;
  }
  assert.ok(moved > 0, `Crit Rate must be able to change damage across seeds (moved in ${moved}/40)`);
});

test("E2E: damage-side buffs raise the simulated total (the panel is unchanged)", async () => {
  const base = await livePanel([]);
  assert.equal(base.dmg, 5300, "baseline simulated total");
  // Element-gated / slot-gated / crit-DMG effects do NOT move the panel — they move DAMAGE.
  const phys = await livePanel([["remolder_sentinel_physical_boost", 5, 5]]);
  const smite = await livePanel([["remolder_vanguard_smite_boost", 7, 7]]);
  const ons = await livePanel([["remolder_sentinel_onslaught_stance", 5, 5]]);
  assert.equal(phys.dmg, 5313, "Physical Boost Lv5: +0.5% dealt → 5313");
  assert.equal(smite.dmg, 5355, "Smite Boost Lv7: +4% Crit DMG → 5355");
  assert.equal(ons.dmg, 5354, "Onslaught Stance Lv5: +1.8% on Active skills → 5354");
  for (const p of [phys, smite, ons]) assert.equal(p.atk, base.atk, "damage-side buffs leave the panel ATK untouched");
});

test("E2E: the ENGINE rejects an unknown Remolder buff id (the UI never validates ids itself)", async () => {
  const eng = await engineForE2E();
  const sc = buildScenario(remolderSetup([["not_a_real_buff", 2, 5]]));
  assert.throws(() => eng.createState(sc, eng.REGISTRY, new Set()), /unknown buff/i);
});

test("E2E: the LIVE PREVIEW agrees with the SIMULATION (same totals + active Set Bonuses)", async () => {
  const { REMOLDER_BUFFS, QIONGJIU_SET_BONUSES, resolveRemolderUnit } = await engineRemolder();
  const eng = await engineForE2E();
  const levels = { [ATK_B]: 1, [CR_B]: 3, [CQC]: 2 };
  // The preview IPC resolves exactly like createState does (same buff table, character set bonuses).
  const preview = resolveRemolderUnit(levels, REMOLDER_BUFFS as never, QIONGJIU_SET_BONUSES as never, undefined);
  const u = eng.createState(buildScenario(remolderSetup([[ATK_B, 1, 6], [CR_B, 3, 3], [CQC, 2, 3]])), eng.REGISTRY, new Set()).units[0];
  const sim = u.remolder as unknown as { categoryTotals: Record<string, number>; activeSetBonusIds: string[] };
  assert.deepEqual(preview.categoryTotals, sim.categoryTotals, "preview totals == simulation totals");
  assert.deepEqual([...preview.activeSetBonusIds].sort(), [...sim.activeSetBonusIds].sort(), "preview Set Bonuses == simulation Set Bonuses");
});

// ---------------------------------------------------------------------------
// SET BONUSES — activation driven by category totals (end-to-end through the engine)
// ---------------------------------------------------------------------------

test("E2E: Set Bonuses activate progressively as the category totals fill (Embryo → … → Blossom)", async () => {
  const { REMOLDER_BUFFS } = await engineRemolder();
  const eng = await engineForE2E();
  const sentinelMax = REMOLDER_BUFFS.filter((b) => b.category === "sentinel").map((b) => [b.id, b.maxLevel, b.maxLevel] as [string, number, number]);
  const bulwarkMax = REMOLDER_BUFFS.filter((b) => b.category === "bulwark").slice(0, 5).map((b) => [b.id, b.maxLevel, b.maxLevel] as [string, number, number]);
  const v9: Array<[string, number, number]> = [["remolder_vanguard_bloodthirst", 3, 3], ["remolder_vanguard_cqc_elite", 3, 3], ["remolder_vanguard_shock_and_awe", 2, 2], ["remolder_vanguard_precision_blow", 1, 6]];
  const setsOf = (entries: Array<[string, number, number]>): string[] => {
    const u = eng.createState(buildScenario(remolderSetup(entries)), eng.REGISTRY, new Set()).units[0];
    return (u.remolder as unknown as { activeSetBonusIds: string[] }).activeSetBonusIds;
  };
  assert.deepEqual(setsOf([]), [], "no levels → no Set Bonuses");
  assert.deepEqual(setsOf(sentinelMax), [], "Sentinel alone satisfies no requirement (Embryo needs Vanguard 2)");
  assert.deepEqual(setsOf([...sentinelMax, ["remolder_vanguard_cqc_elite", 2, 3]]), ["qiongjiu_set_embryo"], "Vanguard 2 + Sentinel 4 → Embryo");
  const all = setsOf([...sentinelMax, ...v9, ...bulwarkMax]);
  assert.deepEqual(all, ["qiongjiu_set_embryo", "qiongjiu_set_seedling", "qiongjiu_set_sprout", "qiongjiu_set_shoot", "qiongjiu_set_bud", "qiongjiu_set_blossom"], "all six qualify together");
});

// ---------------------------------------------------------------------------
// UNITY — a team grant: it lands on the ALLY, never on the owner
// ---------------------------------------------------------------------------

test("E2E: Unity grants its stat to the ALLY's live panel (and only with an ally present)", async () => {
  const eng = await engineForE2E();
  const two = (entries: Array<[string, number, number]>): SetupState => {
    const s = remolderSetup(entries);
    return {
      ...s,
      characters: [...s.characters, { id: "basic_attack_dummy", name: "Basic Attack Dummy", selected: true }],
      rotations: { ...s.rotations, basic_attack_dummy: ["basic"] },
    };
  };
  const units = (entries: Array<[string, number, number]>): Array<Record<string, number>> => eng.createState(buildScenario(two(entries)), eng.REGISTRY, new Set()).units;
  const base = units([]);
  const hpUnity = units([["remolder_support_hp_unity", 5, 5]]);
  assert.equal(hpUnity[1].maxHp - base[1].maxHp, 22, "HP Unity Lv5 raises the ALLY's max HP (+22)");
  assert.equal(hpUnity[0].maxHp, base[0].maxHp, "the OWNER is not a recipient (does not stack)");
  const atkUnity = units([["remolder_support_attack_unity", 5, 5]]);
  assert.equal(atkUnity[1].panelAtk - base[1].panelAtk, 11, "Attack Unity Lv5 raises the ALLY's panel ATK (+11)");
  // With NO ally there is nobody to grant to ⇒ no change at all (correct, not a bug).
  const solo = await livePanel([["remolder_support_attack_unity", 5, 5]]);
  assert.equal(solo.atk, (await livePanel([])).atk, "solo: Unity has no recipient");
});

// ---------------------------------------------------------------------------
// DOCUMENTED INERT SELECTION — must stay visible/honest, not silently "working"
// ---------------------------------------------------------------------------

test("E2E: Purification Feedback is RECORDED but has no engine consumer (documented gap, not a fake)", async () => {
  const base = await livePanel([]);
  const pf = await livePanel([["remolder_support_purification_feedback", 3, 3]]);
  assert.equal(pf.atk, base.atk, "its ATK effect is NOT applied (no ally-cleanse trigger exists in the engine)");
  assert.equal(pf.dmg, base.dmg, "no damage change either");
  assert.equal(pf.hp, base.hp, "no HP change");
});

// ---------------------------------------------------------------------------
// RENDERER — the Setup screen exposes the controls (presentation contract)
// ---------------------------------------------------------------------------

test("setup screen: a per-character Pattern Remolder section with steppers + engine-resolved preview", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const s = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../src/renderer/app/setup/SetupScreen.tsx"), "utf8");
  assert.ok(s.includes("Pattern Remolder <span"), "a labelled Pattern Remolder section exists");
  assert.ok(s.includes("remolder.categories.map"), "categories come from the engine catalog (not hard-coded)");
  assert.ok(s.includes("remolderBuffsIn(cat).map"), "each category's buffs come from the engine catalog");
  assert.ok(s.includes("setRemolderBuffLevel(props.setup, c.id, b.id, lv, b.maxLevel)"), "level pills flow through the shared helper with the engine maxLevel");
  assert.ok(s.includes("clearRemolderBuffs(props.setup, c.id)"), "a clear-all action");
  // Engine-sourced effect lines + the engine-resolved preview.
  assert.ok(s.includes("className=\"remolder-effect-line\""), "per-level effect lines are rendered");
  assert.ok(s.includes("remolderCategoryTotal(remolderPreviewFor, cat)"), "category totals come from the ENGINE preview");
  assert.ok(s.includes("activeSetBonusIds?.includes(set.id)"), "Set-Bonus activation comes from the ENGINE preview");
  assert.ok(s.includes("resolveRemolder(sels)"), "the preview is fetched over IPC from the engine");
  assert.ok(s.includes("listRemolderBuffs()"), "the buff catalog is fetched from the engine");
  // Category icons (2026): resolved BY ID from the asset registry, never a hardcoded path.
  assert.ok(s.includes("remolderCategoryAsset(cat)"), "the category icon resolves from the engine category id");
  assert.ok(s.includes("asset={remolderCategoryAsset(cat)}"), "the icon renders through AssetThumb (supplied/fallback/missing handled)");
  // The UI must not restate the values it renders.
  assert.ok(!s.includes("remolder_sentinel_attack_boost"), "no hard-coded buff id in the renderer");
  assert.ok(!s.includes("/assets/remolder-categories/"), "no hard-coded asset path in the renderer");
});
