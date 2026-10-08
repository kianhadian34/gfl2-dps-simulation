import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { createState } from "../engine/state.js";
import { abilities, customRegistry, makeAlly } from "./helpers.js";
import { APEX_COMPONENTS } from "../data/apex-components.js";
import { REGISTRY } from "../data/registry.js";
import { apexDealtBonus, apexStatTotals, enhancedApexStats, resolveApexChassis } from "../engine/apex.js";
import type { ApexComponentDef, CharacterDef, Element, Scenario, SkillDefVariant, WeaponType } from "../model/types.js";

/**
 * APEX CHASSIS (2026) — the ONE adapted part of the Heavy Ordnance Corps system.
 *
 * SCOPE: up to 2 Apex Components equipped (scenario-level / account-wide), at most one per type,
 * each with an enhancement level 1..6. Their ALWAYS-ON stats fold into the existing percentage
 * buckets (ATK%/HP%/DEF%); All-Element Boost is RECORDED but INERT (it only acts through the
 * unmodeled RES system). Their SECONDARY EFFECT terms are additive in the existing DMG% dealt
 * bucket: a weapon-type-gated term (the dealer's own `CharacterDef.weaponType`) and a
 * weakness-exploit term (phase OR ammo — the authoritative `Weak = 1 + PhaseWeak + AmmoWeak`).
 *
 * All damage scenarios are CONTROLLED fixtures (applyDispatchStats:false + pinned base) so they do
 * NOT depend on Qiongjiu's live panel and do NOT touch any existing math oracle.
 */

const APEX_ID = "apex_firepower_reconstruction_iii";
const dummy = { id: "d", name: "d", hp: 999999999, defense: 0, stability: 0, weaknesses: [] as Element[], phase: null, cover: "none" as const };

/** A controlled single-hit doll (base 1000 ATK, mult 1.0, no crit) with a chosen weapon type. */
function hitter(id: string, weaponType: WeaponType | undefined, element: Element | null = null): CharacterDef {
  const base = makeAlly(id, 1000);
  const skill: SkillDefVariant = { id: `${id}_basic`, name: "Hit", type: "basic", element, multiplier: 1.0, stabDamage: 0, cooldown: 0, confectanceCost: 0 };
  const noop: SkillDefVariant = { ...skill, id: `${id}_noop`, multiplier: 0 };
  const def: CharacterDef = { ...base, id, name: id, skills: abilities({ basic: skill, active1: noop, active2: noop, ultimate: noop }) };
  if (weaponType !== undefined) def.weaponType = weaponType;
  return def;
}

const member = (id: string) => ({ characterId: id, applyDispatchStats: false, baseStatOverrides: { atk: 1000, hp: 1000, def: 300, critRate: 0, critDmg: 0 }, rotation: ["basic" as const], equippedFixedKeys: [] });
const equipped = (componentId: string, enhancement = 1) => ({ components: [{ componentId, enhancement }] });

/** Run a controlled single attacker with an optional Apex Chassis + target weakness config. */
function hit(char: CharacterDef, apexChassis?: Scenario["apexChassis"], targetWeaknesses: Element[] = []) {
  const scenario: Scenario = {
    version: 1,
    seed: 7,
    turns: 1,
    team: [member(char.id)],
    dummy: { ...dummy, weaknesses: targetWeaknesses },
    ...(apexChassis !== undefined ? { apexChassis } : {}),
  };
  return simulateScenario(scenario, customRegistry({ [char.id]: char })).log.find((e) => e.action === `${char.id}_basic`)!;
}

/** A controlled attacker whose basic attack carries a specific AMMO type (for ammo-weakness tests). */
function ammoHitter(id: string): CharacterDef {
  const base = makeAlly(id, 1000);
  const skill: SkillDefVariant = { id: `${id}_basic`, name: "Hit", type: "basic", element: null, multiplier: 1.0, stabDamage: 0, cooldown: 0, confectanceCost: 0, ammoType: "medium_ammo" };
  const noop: SkillDefVariant = { ...skill, id: `${id}_noop`, multiplier: 0, ammoType: undefined };
  return { ...base, id, name: id, weaponType: "ar", skills: abilities({ basic: skill, active1: noop, active2: noop, ultimate: noop }) };
}

// 1. Data -----------------------------------------------------------------------------------

test("apex data: the one evidenced component records its 4 stats + secondary effect faithfully", () => {
  const def = APEX_COMPONENTS.find((c) => c.id === APEX_ID)!;
  assert.ok(def, "the evidenced component is registered");
  assert.equal(def.name, "Elevation - Firepower Reconstruction");
  assert.equal(def.type, "ar", "type matches the AR weapon class (Firepower Reconstruction)");
  assert.equal(def.tier, 3);
  assert.equal(def.maxEnhancement, 6, "duplicates combine up to 5 times → Enhance 1..6");
  assert.deepEqual(def.stats, { atkPct: 0.025, hpPct: 0.025, defPct: 0.025, allElementBoost: 75 }, "screenshot values");
  assert.deepEqual(def.statIncrement, { atkPct: 0.001, hpPct: 0.001, defPct: 0.001, allElementBoost: 5 }, "Tier III increments");
  assert.equal(def.secondaryEffect?.name, "Firepower Reconstruction III");
  assert.deepEqual(def.secondaryEffect?.weaponTypeTerm, { weaponType: "ar", value: 0.05 });
  assert.equal(def.secondaryEffect?.weaknessExploitValue, 0.07);
  assert.equal(APEX_COMPONENTS.length, 1, "ONLY the one component we have authoritative data for is recorded");
});

// 2. Enhancement scaling ----------------------------------------------------------------------

test("apex enhancement: Enhance N adds (N-1) × increment (Tier III 2.5%→3.0%, 75→100)", () => {
  const def = APEX_COMPONENTS.find((c) => c.id === APEX_ID)!;
  assert.deepEqual(enhancedApexStats(def, 1), { atkPct: 0.025, hpPct: 0.025, defPct: 0.025, allElementBoost: 75 }, "Enhance 1 = base");
  assert.deepEqual(enhancedApexStats(def, 6), { atkPct: 0.03, hpPct: 0.03, defPct: 0.03, allElementBoost: 100 }, "Enhance 6 = the documented Tier III ceiling (3.0% / 100)");
});

// 3. Config validation ------------------------------------------------------------------------

test("apex config validation: max 2, one-per-type, enhancement range — rejected loudly", () => {
  const run = (apexChassis: Scenario["apexChassis"], apex?: Record<string, ApexComponentDef>) =>
    createState({ version: 1, seed: 1, turns: 1, dummy, team: [member("h")], apexChassis }, customRegistry({ h: hitter("h", "ar") }, {}, {}, apex), new Set());

  assert.doesNotThrow(() => run(equipped(APEX_ID)), "one component is valid");
  assert.throws(() => run({ components: [equipped(APEX_ID).components[0], equipped(APEX_ID).components[0], equipped(APEX_ID).components[0]] }), /at most 2/, "3 components rejected");
  // A second component of the SAME type is rejected (one-per-type), even at a different tier.
  const dupType: ApexComponentDef = { ...APEX_COMPONENTS[0], id: "apex_other_ar", tier: 4 };
  assert.throws(
    () => run({ components: [{ componentId: APEX_ID, enhancement: 1 }, { componentId: "apex_other_ar", enhancement: 1 }] }, { apex_other_ar: dupType }),
    /only ONE Apex Component of a given type/,
    "duplicate type rejected",
  );
  assert.throws(() => run({ components: [{ componentId: APEX_ID, enhancement: 7 }] }), /enhancement must be an integer in 1\.\.6/, "enhancement above max rejected");
  assert.throws(() => run({ components: [{ componentId: APEX_ID, enhancement: 0 }] }), /enhancement must be an integer in 1\.\.6/, "enhancement below 1 rejected");
  assert.throws(() => run({ components: [{ componentId: "apex_nope", enhancement: 1 }] }), /unknown Apex Component/, "unknown component id rejected");
});

test("apex resolver: returns the validated resolved components (def + enhancement)", () => {
  const resolved = resolveApexChassis(equipped(APEX_ID, 3), (id) => REGISTRY.getApexComponent(id));
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].def.id, APEX_ID);
  assert.equal(resolved[0].enhancement, 3);
  assert.deepEqual(resolveApexChassis(undefined, (id) => REGISTRY.getApexComponent(id)), [], "no chassis → no components");
});

// 4. Always-on stats --------------------------------------------------------------------------

test("apex stats: ATK%/HP%/DEF% fold into the panel; All-Element Boost is RECORDED but INERT", () => {
  const char = hitter("h", "ar");
  const state = (apexChassis?: Scenario["apexChassis"]) =>
    createState({ version: 1, seed: 1, turns: 1, dummy, team: [member("h")], ...(apexChassis ? { apexChassis } : {}) }, customRegistry({ h: char }), new Set()).units.find((u) => u.id === "h")!;
  const none = state();
  const withApex = state(equipped(APEX_ID));
  assert.equal(withApex.panelAtk, Math.ceil(none.panelAtk * 1.025), "+2.5% ATK folds via the Final Stat formula");
  assert.equal(withApex.maxHp, Math.ceil(none.maxHp * 1.025), "+2.5% HP folds");
  assert.equal(withApex.defStat, Math.ceil(none.defStat * 1.025), "+2.5% DEF folds");
  // All-Element Boost is recorded on the totals but has NO panel/damage representation.
  assert.equal(apexStatTotals(resolveApexChassis(equipped(APEX_ID), (id) => REGISTRY.getApexComponent(id))).allElementBoost, 75, "recorded");
});

test("apex stats are ACCOUNT-WIDE: every team member receives them", () => {
  const state = createState(
    { version: 1, seed: 1, turns: 1, team: [member("a"), member("b")], dummy, apexChassis: equipped(APEX_ID) },
    customRegistry({ a: hitter("a", "ar"), b: hitter("b", "ar") }),
    new Set(),
  );
  assert.equal(state.units.find((u) => u.id === "a")!.panelAtk, 1025, "member a: 1000 × 1.025");
  assert.equal(state.units.find((u) => u.id === "b")!.panelAtk, 1025, "member b: 1000 × 1.025");
});

test("apex enhancement raises the stat grants (Enhance 6 → 3.0% / All-Element 100)", () => {
  const lookup = (id: string) => REGISTRY.getApexComponent(id);
  const t1 = apexStatTotals(resolveApexChassis(equipped(APEX_ID, 1), lookup));
  const t6 = apexStatTotals(resolveApexChassis(equipped(APEX_ID, 6), lookup));
  assert.equal(t1.atkPct, 0.025);
  assert.equal(t6.atkPct, 0.03, "Enhance 6 → 3.0%");
  assert.equal(t6.allElementBoost, 100, "Enhance 6 → All-Element Boost 100 (recorded)");
});

// 5. Secondary effect — weapon-type clause ------------------------------------------------------

test("apex secondary: the AR weapon-type term applies to an AR doll and NOT to another type", () => {
  const ar = hitter("ar", "ar");
  const smg = hitter("smg", "smg");
  assert.equal(hit(ar, equipped(APEX_ID)).bonusBracket, hit(ar).bonusBracket + 0.05, "AR doll: +5% (weapon-type term)");
  assert.equal(hit(smg, equipped(APEX_ID)).bonusBracket, hit(smg).bonusBracket, "SMG doll: no AR term");
});

test("apex secondary: a doll with NO declared weapon type never matches the weapon-type term", () => {
  const untyped = hitter("untyped", undefined);
  assert.equal(hit(untyped, equipped(APEX_ID)).bonusBracket, hit(untyped).bonusBracket, "no weaponType → term never applies (never assumed)");
});

// 6. Secondary effect — weakness-exploit clause -------------------------------------------------

test("apex secondary: the weakness-exploit term applies on a PHASE weakness and on an AMMO weakness", () => {
  const ar = hitter("ar", "ar");
  // No weakness exploited: only the weapon-type term (+5%).
  assert.equal(hit(ar, equipped(APEX_ID)).bonusBracket, hit(ar).bonusBracket + 0.05, "no weakness → only the weapon-type term");
  // PHASE weakness exploited (burn): +5% weapon-type + 7% weakness.
  const phase = hit(hitter("ar", "ar", "burn"), equipped(APEX_ID), ["burn"]);
  const phaseNone = hit(hitter("ar", "ar", "burn"), undefined, ["burn"]);
  assert.equal(phase.bonusBracket, phaseNone.bonusBracket + 0.12, "phase weakness → +5% + 7% = +12%");
  // AMMO weakness exploited: the SAME +7% (authoritative `Weak = 1 + PhaseWeak + AmmoWeak`).
  const ammoChar = ammoHitter("ammo");
  const ammoNone = simulateScenario({ version: 1, seed: 7, turns: 1, team: [member("ammo")], dummy: { ...dummy, weaknessTags: ["medium_ammo"] as never } }, customRegistry({ ammo: ammoChar })).log.find((e) => e.action === "ammo_basic")!;
  const ammoWeak = simulateScenario(
    { version: 1, seed: 7, turns: 1, team: [member("ammo")], dummy: { ...dummy, weaknessTags: ["medium_ammo"] as never }, apexChassis: equipped(APEX_ID) },
    customRegistry({ ammo: ammoChar }),
  ).log.find((e) => e.action === "ammo_basic")!;
  assert.equal(ammoWeak.bonusBracket, ammoNone.bonusBracket + 0.12, "ammo weakness → +5% + 7% = +12%");
});

// 7. Unit-level: the pure helpers -----------------------------------------------------------------

test("apex pure helpers: apexDealtBonus applies only matching terms; unknown ids contribute nothing", () => {
  const lookup = (id: string) => REGISTRY.getApexComponent(id);
  const one = resolveApexChassis(equipped(APEX_ID), lookup);
  assert.equal(apexDealtBonus([], { weaponType: "ar", weaknessExploited: true }), 0, "no chassis → 0");
  assert.equal(apexDealtBonus(one, { weaponType: "ar", weaknessExploited: false }), 0.05, "AR, no weakness → 5%");
  assert.equal(apexDealtBonus(one, { weaponType: "ar", weaknessExploited: true }), 0.12, "AR + weakness → 12%");
  assert.equal(apexDealtBonus(one, { weaponType: undefined, weaknessExploited: true }), 0.07, "no weapon type → weakness term only");
  // An unknown component id is REJECTED by the resolver (never silently ignored at the config level).
  assert.throws(() => resolveApexChassis({ components: [{ componentId: "nope", enhancement: 1 }] }, lookup), /unknown Apex Component/);
  assert.equal(REGISTRY.getApexComponent(APEX_ID)?.tier, 3, "the registry resolves the data table");
});

// 8. Qiongjiu data -------------------------------------------------------------------------------

test("apex: Qiongjiu declares weaponType 'ar' (Golden Melody is an Assault Rifle)", async () => {
  const { QIONGJIU } = await import("../data/qiongjiu.js");
  assert.equal(QIONGJIU.weaponType, "ar");
});
