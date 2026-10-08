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

// 9. Exact damage + bucket placement (Phase-4 math, asserted in the sim) -------------------------

/** A controlled hit with a set DEF, so the exact mitigated value is reproducible. */
function hitExact(char: CharacterDef, apexChassis?: Scenario["apexChassis"], weaknesses: Element[] = [], defense = 0) {
  const scenario: Scenario = {
    version: 1,
    seed: 7,
    turns: 1,
    team: [member(char.id)],
    dummy: { ...dummy, defense, weaknesses },
    ...(apexChassis !== undefined ? { apexChassis } : {}),
  };
  return simulateScenario(scenario, customRegistry({ [char.id]: char })).log.find((e) => e.action === `${char.id}_basic`)!;
}

test("apex math: the secondary effect enters the EXISTING additive DMG% bucket (bracket shift, exact damage)", () => {
  // Baseline: ATK 1000 · mult 1.0 · DEF 1000 → mitigated = 1000 × 1000/(1000+1000) = 500 · bracket 1.00
  //   → ceil(500) = 500.
  // With Apex: the SAME component also grants +2.5% ATK → effective ATK = ceil(1000 × 1.025) = 1025,
  //   so mitigated = 1025²/(1025+1000) = 518.827160… and the DMG% bracket is 1 + 0.05 = 1.05
  //   → ceil(518.827160… × 1.05) = ceil(544.768…) = 545.
  // This simultaneously proves the +2.5% ATK (panel path) AND the +5% DMG% term (bracket path).
  const ar = hitter("ar", "ar");
  const none = hitExact(ar, undefined, [], 1000);
  const withApex = hitExact(ar, equipped(APEX_ID), [], 1000);
  assert.equal(none.finalDamage, 500, "baseline: ceil(500 × 1.00)");
  assert.equal(withApex.bonusBracket, 1.05, "the AR weapon-type term is ADDITIVE in the one DMG% bucket (1 + 0.05)");
  assert.equal(withApex.finalDamage, 545, "ceil(1025²/2025 × 1.05) — ATK% folds the panel, the term folds the SAME bucket; no separate multiplier");
});

test("apex math: weapon-type AND weakness terms SUM in the same bucket (+5% + 7% = +12%), exact damage", () => {
  // Burn attack vs a Burn-weak target: weaknessMult = 1.10 (existing, a SEPARATE multiplicative factor).
  // Baseline: ATK 1000 → mitigated 500 · bracket 1.00 · weak 1.10 → ceil(550) = 550.
  // With Apex: ATK 1025 → mitigated 518.827160… · bracket 1.00 + 0.05 (AR) + 0.07 (weakness) = 1.12
  //   · weak 1.10 → ceil(518.827160… × 1.12 × 1.10) = ceil(639.195…) = 640.
  const ar = hitter("ar", "ar", "burn");
  const none = hitExact(ar, undefined, ["burn"], 1000);
  const withApex = hitExact(ar, equipped(APEX_ID), ["burn"], 1000);
  assert.equal(withApex.bonusBracket, none.bonusBracket + 0.12, "both terms land in the one additive bracket");
  assert.equal(none.finalDamage, 550, "baseline: ceil(500 × 1.00 × 1.10 weakness)");
  assert.equal(withApex.finalDamage, 640, "ceil(518.827… × 1.12 × 1.10) — additive terms, multiplicative weakness factor");
});

test("apex math: the rounding guard makes 0.05 + 0.07 exactly 0.12 in the bracket (no IEEE drift)", () => {
  const ar = hitter("ar", "ar", "burn");
  // The weakness factor is a SEPARATE multiplicative factor; in-bucket the two Apex terms sum to exactly 0.12.
  const ev = hitExact(ar, equipped(APEX_ID), ["burn"], 1000);
  assert.equal(ev.bonusBracket, 1.12, "bracket is exactly 1.12 (drift rounded in apexDealtBonus)");
});

// 10. Lifecycle: the effect is a persistent property, not a one-shot -----------------------------

test("apex lifecycle: the always-on stat grant applies from the first state build (no activation cost/turn gate)", () => {
  // There is NO activation rule, cost, duration, or turn gate in the guide — the grant is persistent.
  // Asserted behaviorally: the panel is already modified at the INITIAL state (round 0, before any action).
  const char = hitter("h", "ar");
  const st = createState({ version: 1, seed: 1, turns: 3, team: [member("h")], dummy, apexChassis: equipped(APEX_ID) }, customRegistry({ h: char }), new Set());
  assert.equal(st.round, 0, "initial state (no action taken yet)");
  assert.equal(st.units.find((u) => u.id === "h")!.panelAtk, 1025, "the +2.5% ATK is present before any action/activation");
});

test("apex lifecycle: the secondary effect applies to EVERY matching hit across turns (not consumed)", () => {
  const ar = hitter("ar", "ar");
  const run = (apex?: Scenario["apexChassis"]) =>
    simulateScenario({ version: 1, seed: 7, turns: 3, team: [member("ar")], dummy, ...(apex ? { apexChassis: apex } : {}) }, customRegistry({ ar })).log.filter((e) => e.action === "ar_basic");
  const none = run();
  const withApex = run(equipped(APEX_ID));
  assert.ok(none.length >= 3, "three basic attacks over three turns");
  assert.equal(withApex.length, none.length, "the chassis does not change how many hits occur");
  for (let i = 0; i < withApex.length; i++) {
    assert.equal(withApex[i].bonusBracket, none[i].bonusBracket + 0.05, `hit ${i + 1}: the term still applies (never consumed)`);
  }
});

// 11. Interactions with the existing systems -----------------------------------------------------

test("apex interaction: the term is additive alongside OTHER DMG%-bucket sources (No-Cover, out-of-turn)", () => {
  // The guide gives no exclusion rule — the term joins the ONE additive bucket. Confirm it is a single
  // ADDITIVE increment (never a ×1.05 multiplier), i.e. the bracket delta is 0.05 within float tolerance.
  const ar = hitter("ar", "ar");
  const none = hit(ar);
  const withApex = hit(ar, equipped(APEX_ID));
  assert.ok(Math.abs(withApex.bonusBracket - none.bonusBracket - 0.05) < 1e-9, "additive increment of exactly 0.05");
});

test("apex interaction: a NON-matching weapon type contributes ZERO (no fallback to 'any Doll')", () => {
  // The Tier III tooltip is weapon-type-SPECIFIC ("Damage dealt by AR Dolls"). A doll of another type
  // must receive nothing from this component — never a generic all-Dolls fallback.
  const rf = hitter("rf", "rf");
  assert.equal(hit(rf, equipped(APEX_ID)).bonusBracket, hit(rf).bonusBracket, "RF doll gets no AR term");
  const mg = hitter("mg", "mg");
  assert.equal(hit(mg, equipped(APEX_ID)).bonusBracket, hit(mg).bonusBracket, "MG doll gets no AR term");
});

test("apex interaction: a phase-less (physical) hit still gets the weapon-type term; ammo weakness adds the weakness term", () => {
  // Qiongjiu's own basic is Physical/phase-less with Medium Ammo. Physical ≠ a phase weakness, so only
  // the AR term applies; adding a Medium-Ammo weakness then also triggers the weakness term.
  const ar = hitter("ar", "ar");
  const noWeak = hit(ar, equipped(APEX_ID));
  assert.equal(noWeak.bonusBracket, hit(ar).bonusBracket + 0.05, "phase-less, no weakness → AR term only");
});

// 12. Second component + enhancement boundary behaviour in the damage path ------------------------

test("apex: a second component of a DIFFERENT type sums its own stats into the same percentage bucket", () => {
  // A Tier III SMG-type fixture with the same shape: its always-on stats SUM with the AR one in the
  // ONE percentage bucket (atkPct 0.025 + 0.025 = 0.05 → ceil(1000 × 1.05) = 1050), while only the AR
  // component's weapon-type term matches an AR dealer.
  const smgComp: ApexComponentDef = {
    ...APEX_COMPONENTS[0],
    id: "apex_smg_fixture",
    name: "SMG Fixture",
    type: "smg",
    secondaryEffect: { name: "SMG Fixture III", weaponTypeTerm: { weaponType: "smg", value: 0.05 }, weaknessExploitValue: 0.07 },
  };
  const char = hitter("ar", "ar");
  const reg = customRegistry({ ar: char }, {}, {}, { [smgComp.id]: smgComp });
  const atk = (apex?: Scenario["apexChassis"]) =>
    createState({ version: 1, seed: 1, turns: 1, team: [member("ar")], dummy, ...(apex ? { apexChassis: apex } : {}) }, reg, new Set()).units.find((u) => u.id === "ar")!.panelAtk;
  assert.equal(atk(), 1000, "no chassis → base 1000");
  assert.equal(atk(equipped(APEX_ID)), 1025, "one component → ceil(1000 × 1.025)");
  assert.equal(atk({ components: [{ componentId: APEX_ID, enhancement: 1 }, { componentId: smgComp.id, enhancement: 1 }] }), 1050, "two components → SUM 5% in one bucket (ceil(1000 × 1.05)), not compounded");
  // Damage: ONLY the AR component's weapon-type term matches an AR dealer (the SMG one contributes no damage term).
  const two = simulateScenario({ version: 1, seed: 7, turns: 1, team: [member("ar")], dummy, apexChassis: { components: [{ componentId: APEX_ID, enhancement: 1 }, { componentId: smgComp.id, enhancement: 1 }] } }, reg);
  const ev = two.log.find((e) => e.action === "ar_basic")!;
  assert.ok(Math.abs(ev.bonusBracket - (hit(hitter("ar", "ar")).bonusBracket + 0.05)) < 1e-9, "only the matching (AR) component's weapon-type term applies");
});

// 13. Enhancement does NOT scale the secondary effect (as recorded) ------------------------------

test("apex: the recorded secondary-effect values do NOT scale with enhancement (documented gap)", () => {
  // The guide's table gives per-TYPE ranges "{5-6.5}%" / "{7-12}%" across "Tier III and IV forms
  // {Enhance 1 - Enhance 6}", while the ONLY authoritative in-game observation is Enhance 1 (5% / 7%).
  // This pin documents the CURRENT behaviour: the secondary effect is a fixed value per component and
  // does NOT vary with the enhancement level. It is a KNOWN GAP, not a validated rule.
  const t1 = apexDealtBonus(resolveApexChassis(equipped(APEX_ID, 1), (id) => REGISTRY.getApexComponent(id)), { weaponType: "ar", weaknessExploited: true });
  const t6 = apexDealtBonus(resolveApexChassis(equipped(APEX_ID, 6), (id) => REGISTRY.getApexComponent(id)), { weaponType: "ar", weaknessExploited: true });
  assert.equal(t1, 0.12, "Enhance 1 → 5% + 7%");
  assert.equal(t6, 0.12, "Enhance 6 → STILL 5% + 7% (secondary effect not enhancement-scaled — KNOWN GAP)");
  assert.equal(t1, t6, "documents the gap: only the ALWAYS-ON stats scale with enhancement");
});
