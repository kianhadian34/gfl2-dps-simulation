import { test } from "node:test";
import assert from "node:assert/strict";
import { createState } from "../engine/state.js";
import { additiveDealtBonus, additiveTakenBonus, countMatchingStatuses, multiplicativeTakenMods } from "../engine/statuses.js";
import { customRegistry, scenario } from "./helpers.js";
import { STATUS_DEFS } from "../data/statuses.js";
import type { Element, StatusDef } from "../model/types.js";

/**
 * COUNT-BY-CLASSIFICATION SCALING (`damage_modifier.perMatching`) — added 2026.
 *
 * Vector's two clauses: Smolder V4 "each Burn debuff increases damage taken by 3%" (TAKEN side —
 * counts the TARGET's statuses) and Accelerant V6 "every Burn buff increases damage dealt by 5%"
 * (DEALT side — counts the HOLDER's statuses).
 *
 * NEITHER status is implemented here: the fixtures are synthetic and injected through the
 * registry, so this pins the VOCABULARY independently of Vector's kit data. The production status
 * table must stay free of these fixtures (asserted at the bottom).
 *
 * Classification is read from data only — `StatusDef.element` (affiliation) + `StatusDef.category`
 * (buff/debuff). `element` is deliberately SEPARATE from `phase` (see the Phase Strike gate test).
 */

const ctx = { supportAttack: false, targetExposed: false };

/** A synthetic status carrying an element affiliation + category, with no effects of its own. */
function tagStatus(id: string, element: Element | null, category: "buff" | "debuff"): StatusDef {
  return {
    id,
    name: id,
    category,
    stackable: true,
    durationRounds: null,
    tickAt: "ownActionEnd",
    purgeable: true,
    effects: [],
    ...(element ? { element } : {}),
    verified: false,
  };
}

/** The counting status: "per matching status, +`value`" on the given scope. */
function counting(
  id: string,
  scope: "dealt" | "taken",
  perMatching: { element: Element; category: "buff" | "debuff" } | undefined,
  value = 0.03,
  mode: "additive" | "multiplicative" = "additive",
): StatusDef {
  return {
    id,
    name: id,
    category: scope === "dealt" ? "buff" : "debuff",
    stackable: true,
    durationRounds: null,
    tickAt: "ownActionEnd",
    purgeable: true,
    effects: [{ kind: "damage_modifier", scope, mode, value, ...(perMatching ? { perMatching } : {}) }],
    verified: false,
  };
}

/** A state whose registry also serves the synthetic statuses (never production data). */
function stateWith(...fixtures: StatusDef[]) {
  const state = createState(scenario({ turns: 1 }), customRegistry({}), new Set());
  const map = new Map(state.statusRegistry);
  for (const f of fixtures) map.set(f.id, f);
  state.statusRegistry = map;
  return state;
}

const active = (statusId: string, stacks = 1) => ({ statusId, stacks, durationLeft: Infinity });

// ------------------------------------------------------------------ DEALT side

test("dealt: the bonus is value × the number of matching statuses on the HOLDER", () => {
  const state = stateWith(
    counting("cb_dealt", "dealt", { element: "burn", category: "buff" }),
    tagStatus("cb_burn_buff_a", "burn", "buff"),
    tagStatus("cb_burn_buff_b", "burn", "buff"),
  );
  const doll = state.units[0];
  doll.statuses = [active("cb_dealt")];
  assert.equal(additiveDealtBonus(doll, state.statusRegistry, null, ctx), 0, "no Burn buffs ⇒ 0");

  doll.statuses = [active("cb_dealt"), active("cb_burn_buff_a")];
  assert.equal(additiveDealtBonus(doll, state.statusRegistry, null, ctx), 0.03, "1 Burn buff ⇒ +3%");

  doll.statuses = [active("cb_dealt"), active("cb_burn_buff_a"), active("cb_burn_buff_b")];
  assert.equal(additiveDealtBonus(doll, state.statusRegistry, null, ctx), 0.06, "2 Burn buffs ⇒ +6%");
});

test("dealt: counted PER STATUS, never per stack", () => {
  const state = stateWith(
    counting("cb_dealt", "dealt", { element: "burn", category: "buff" }),
    tagStatus("cb_burn_buff_a", "burn", "buff"),
  );
  const doll = state.units[0];
  // ONE Burn buff at 3 stacks is still ONE Burn buff ("every Burn buff").
  doll.statuses = [active("cb_dealt"), active("cb_burn_buff_a", 3)];
  assert.equal(additiveDealtBonus(doll, state.statusRegistry, null, ctx), 0.03, "3 stacks of one buff ⇒ +3%, not +9%");
});

test("dealt: only the right element AND the right category count", () => {
  const state = stateWith(
    counting("cb_dealt", "dealt", { element: "burn", category: "buff" }),
    tagStatus("cb_burn_buff", "burn", "buff"), // counts
    tagStatus("cb_hydro_buff", "hydro", "buff"), // wrong element
    tagStatus("cb_burn_debuff", "burn", "debuff"), // wrong category
    tagStatus("cb_untagged_buff", null, "buff"), // no affiliation
  );
  const doll = state.units[0];
  doll.statuses = [active("cb_dealt"), active("cb_burn_buff"), active("cb_hydro_buff"), active("cb_burn_debuff"), active("cb_untagged_buff")];
  assert.equal(additiveDealtBonus(doll, state.statusRegistry, null, ctx), 0.03, "exactly one Burn buff");
});

test("dealt: the counting status counts ITSELF when it is itself classified Burn (literal reading)", () => {
  // The wording is "every Burn buff" with no exception. A counting status that is itself a Burn
  // buff therefore counts toward its own clause (Accelerant is "Attack/Buff/Burn" ⇒ +5% alone).
  const selfCounting: StatusDef = {
    ...counting("cb_self", "dealt", { element: "burn", category: "buff" }, 0.05),
    element: "burn",
  };
  const state = stateWith(selfCounting);
  const doll = state.units[0];
  doll.statuses = [active("cb_self")];
  assert.equal(additiveDealtBonus(doll, state.statusRegistry, null, ctx), 0.05, "self counts ⇒ +5%");
});

// ------------------------------------------------------------------ TAKEN side

test("taken: the bonus is value × the number of matching statuses on the TARGET", () => {
  const state = stateWith(
    counting("cb_taken", "taken", { element: "burn", category: "debuff" }),
    tagStatus("cb_burn_debuff_a", "burn", "debuff"),
    tagStatus("cb_burn_debuff_b", "burn", "debuff"),
  );
  const dummy = state.dummy;
  dummy.statuses = [active("cb_taken")];
  assert.equal(additiveTakenBonus(dummy, state.statusRegistry, null), 0, "no Burn debuffs ⇒ 0");

  dummy.statuses = [active("cb_taken"), active("cb_burn_debuff_a")];
  assert.equal(additiveTakenBonus(dummy, state.statusRegistry, null), 0.03, "1 Burn debuff ⇒ +3%");

  dummy.statuses = [active("cb_taken"), active("cb_burn_debuff_a"), active("cb_burn_debuff_b")];
  assert.equal(additiveTakenBonus(dummy, state.statusRegistry, null), 0.06, "2 Burn debuffs ⇒ +6%");
});

test("taken: counted PER STATUS, never per stack", () => {
  const state = stateWith(
    counting("cb_taken", "taken", { element: "burn", category: "debuff" }),
    tagStatus("cb_burn_debuff_a", "burn", "debuff"),
  );
  const dummy = state.dummy;
  dummy.statuses = [active("cb_taken"), active("cb_burn_debuff_a", 3)];
  assert.equal(additiveTakenBonus(dummy, state.statusRegistry, null), 0.03, "3 stacks of one debuff ⇒ +3%, not +9%");
});

test("taken: a Burn BUFF does not count toward 'every Burn debuff'", () => {
  const state = stateWith(
    counting("cb_taken", "taken", { element: "burn", category: "debuff" }),
    tagStatus("cb_burn_buff", "burn", "buff"),
  );
  const dummy = state.dummy;
  dummy.statuses = [active("cb_taken"), active("cb_burn_buff")];
  assert.equal(additiveTakenBonus(dummy, state.statusRegistry, null), 0, "category must match");
});

// ------------------------------------------------------- multiplicative branch

test("taken multiplicative: the count is honored too (never silently ignored)", () => {
  const state = stateWith(
    counting("cb_mult", "taken", { element: "burn", category: "debuff" }, 0.5, "multiplicative"),
    tagStatus("cb_burn_debuff_a", "burn", "debuff"),
    tagStatus("cb_burn_debuff_b", "burn", "debuff"),
  );
  const dummy = state.dummy;
  dummy.statuses = [active("cb_mult"), active("cb_burn_debuff_a")];
  assert.equal(multiplicativeTakenMods(dummy, state.statusRegistry).mult, 0.5, "1 ⇒ 0.5^1");
  dummy.statuses = [active("cb_mult"), active("cb_burn_debuff_a"), active("cb_burn_debuff_b")];
  assert.equal(multiplicativeTakenMods(dummy, state.statusRegistry).mult, 0.25, "2 ⇒ 0.5^2");
});

// ------------------------------------------------------------------- controls

test("control: WITHOUT perMatching the value applies once (existing behavior)", () => {
  const state = stateWith(
    counting("cb_plain", "taken", undefined, 0.03),
    tagStatus("cb_burn_debuff_a", "burn", "debuff"),
    tagStatus("cb_burn_debuff_b", "burn", "debuff"),
  );
  const dummy = state.dummy;
  dummy.statuses = [active("cb_plain"), active("cb_burn_debuff_a"), active("cb_burn_debuff_b")];
  assert.equal(additiveTakenBonus(dummy, state.statusRegistry, null), 0.03, "unscaled ⇒ +3% flat");
});

test("control: an empty match count yields 0, and stacks still multiply the base value", () => {
  const state = stateWith(
    counting("cb_stacks", "taken", { element: "burn", category: "debuff" }, 0.03),
    tagStatus("cb_burn_debuff_a", "burn", "debuff"),
  );
  const dummy = state.dummy;
  // Zero Burn debuffs on the target ⇒ the clause contributes nothing ("for every …" over an
  // empty set), regardless of the counting status's own stacks.
  dummy.statuses = [active("cb_stacks", 2)];
  assert.equal(additiveTakenBonus(dummy, state.statusRegistry, null), 0, "0 matches ⇒ +0%");

  // With one Burn debuff present, the existing stacks rule still multiplies the base value:
  // 2 stacks × +3% × 1 match = +6%.
  dummy.statuses = [active("cb_stacks", 2), active("cb_burn_debuff_a")];
  assert.equal(additiveTakenBonus(dummy, state.statusRegistry, null), 0.06, "2 stacks × 1 match ⇒ +6%");
});

// ---------------------------------------------------------------- the helper

test("countMatchingStatuses counts per status (not per stack) and matches element + category", () => {
  const state = stateWith(tagStatus("cb_burn_debuff_a", "burn", "debuff"), tagStatus("cb_burn_debuff_b", "burn", "debuff"));
  const dummy = state.dummy;
  dummy.statuses = [active("cb_burn_debuff_a", 4), active("cb_burn_debuff_b")];
  assert.equal(countMatchingStatuses(dummy, state.statusRegistry, { element: "burn", category: "debuff" }), 2, "2 statuses, despite 5 total stacks");
  assert.equal(countMatchingStatuses(dummy, state.statusRegistry, { element: "burn", category: "buff" }), 0, "category must match");
  assert.equal(countMatchingStatuses(dummy, state.statusRegistry, { element: "hydro", category: "debuff" }), 0, "element must match");
});

// ------------------------------------------------------------- production data

test("production data: `element` affiliation is declared only where the source states it", () => {
  const tagged = STATUS_DEFS.filter((s) => s.element != null).map((s) => s.id).sort();
  // Vector's inventory Tags column: Overburn = "Burn/Debuff"; Blazing Assault II = "Attack/Buff/Burn".
  // Nothing else has a source-stated classification — do not invent one.
  assert.deepEqual(tagged, ["blazing_assault_ii", "overburn"]);
});

test("production data: `element` is separate from `phase` (the Phase Strike gate is untouched)", () => {
  const blazing = STATUS_DEFS.find((s) => s.id === "blazing_assault_ii")!;
  assert.equal(blazing.element, "burn", "classified as Burn…");
  assert.equal(blazing.phase ?? null, null, "…but NOT a Phase-attribute debuff");
  const overburn = STATUS_DEFS.find((s) => s.id === "overburn")!;
  assert.equal(overburn.element, "burn");
  assert.equal(overburn.phase, "burn");
});

/** The synthetic fixtures must never leak into production data. */
test("the synthetic fixtures stay out of the production status table", () => {
  assert.ok(!STATUS_DEFS.some((s) => s.id.startsWith("cb_")), "no cb_* fixture in STATUS_DEFS");
});
