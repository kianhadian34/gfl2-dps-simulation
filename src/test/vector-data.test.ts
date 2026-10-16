import { test } from "node:test";
import assert from "node:assert/strict";
import { REGISTRY } from "../data/registry.js";
import { VECTOR } from "../data/vector.js";
import { STATUS_DEFS } from "../data/statuses.js";
import { simulateScenario } from "../simulate.js";
import type { Scenario } from "../model/types.js";

/**
 * VECTOR — registration data (2026, slice B4).
 *
 * These tests pin WHAT IS REGISTERED and, just as importantly, **WHAT IS DELIBERATELY NOT**. Her kit
 * is implemented as the honest subset: every blocked clause is recorded (in `deferredNote`s and the
 * passive's per-level notes) and **never approximated**. The tests below assert both sides, so a
 * future session cannot quietly fill a gap with an invented mechanic — nor silently drop a recorded
 * one.
 *
 * Evidence: base stats are `Validated` (in-game character sheet); everything else is `[SOURCE]` /
 * **Not Tested** (`docs/dolls/vector.md`).
 */

// ============================================================ identity & stats (Validated)

test("B4: Vector is registered, with her in-game identity", () => {
  assert.ok(REGISTRY.getCharacter("vector"), "resolvable via the registry");
  assert.equal(VECTOR.id, "vector");
  assert.equal(VECTOR.name, "Vector");
  assert.equal(VECTOR.class, "support", "Support class (source identity record)");
  assert.equal(VECTOR.weaponType, "smg", "signature weapon Banshee's Whisper is a Submachine Gun");
  assert.equal(VECTOR.phase, "burn");
});

test("B4: her VALIDATED base stats are exactly the in-game sheet values", () => {
  assert.deepEqual(VECTOR.base, { atk: 748, hp: 1819, def: 569, stability: 10, critRate: 0.2, critDmg: 0.2 });
  assert.equal(VECTOR.mobility, 6, "Movement Speed 6");
  // Crit Rate/DMG are displayed values: 20% and 120% (critDmg 0.2 = the `1 + critDmg` multiplier).
});

test("B4: Remolder flats are her own (never copied from Qiongjiu)", () => {
  assert.deepEqual(VECTOR.remolderFlat, { atk: 224, hp: 651, def: 245 });
  // The source gives only category TOTALS, not set-bonus definitions — so the field is ABSENT
  // rather than invented.
  assert.equal(VECTOR.remolderSetBonuses, undefined, "no set-bonus definitions in the source — not invented");
});

test("B4: her Fortification map is her OWN ordering (differs from Qiongjiu's)", () => {
  assert.deepEqual(VECTOR.fortificationMap, [
    { v: 1, ability: "passive", toLevel: 2 },
    { v: 2, ability: "ultimate", toLevel: 2 },
    { v: 3, ability: "active1", toLevel: 2 },
    { v: 4, ability: "active2", toLevel: 2 },
    { v: 5, ability: "passive", toLevel: 3 },
    { v: 6, ability: "ultimate", toLevel: 3 },
  ]);
});

// ============================================================ skills: the modelable halves

test("B4: Basic is COMPLETE — 80% ATK, Physical (phase-less), Light Ammo, Stability 3", () => {
  const basic = VECTOR.skills.basic.levels[1];
  assert.equal(basic.element, null, "Physical = explicit PHASE-LESS (not an absent attribute)");
  assert.equal(basic.ammoType, "light_ammo");
  assert.equal(basic.multiplier, 0.8);
  assert.equal(basic.stabDamage, 3, "Vector's Basic deals Stability 3 (Qiongjiu's deals 2)");
  assert.equal(basic.deferredNote, undefined, "Basic has no missing clauses");
});

test("B4: Skill 1 carries its damage multipliers and RECORDS its missing clauses", () => {
  assert.equal(VECTOR.skills.active1!.levels[1].multiplier, 1.2, "120% at Lv.1");
  assert.equal(VECTOR.skills.active1!.levels[2].multiplier, 1.5, "V3: +30% ⇒ 150%");
  assert.match(VECTOR.skills.active1!.levels[1].deferredNote!, /fixed damage/i, "records the missing fixed-damage AoE");
  assert.match(VECTOR.skills.active1!.levels[1].deferredNote!, /Confectance/i, "records the missing Confectance grant");
  assert.match(VECTOR.skills.active1!.levels[2].deferredNote!, /Overheat Combustion/, "V3's undefined status is named");
});

test("B4: Skill 2 carries its multipliers, leaves ammo ABSENT (the open question), and records its gaps", () => {
  assert.equal(VECTOR.skills.active2!.levels[1].multiplier, 1.0, "100% at Lv.1");
  assert.equal(VECTOR.skills.active2!.levels[2].multiplier, 1.3, "V4: +30% ⇒ 130%");
  // The source's structured record shows NO ammo type while its siblings show Light Ammo — an open
  // question, so it is left ABSENT rather than assumed either way.
  assert.equal(VECTOR.skills.active2!.levels[1].ammoType, undefined, "no ammo attribute — the source is ambiguous");
  assert.match(VECTOR.skills.active2!.levels[1].deferredNote!, /Smolder/, "records the undefined key status");
});

test("B4: the Ultimate carries AoE damage + Extra Command, and records its missing pieces", () => {
  const ult = VECTOR.skills.ultimate!.levels[1];
  assert.equal(ult.multiplier, 0.6, "60% AoE");
  assert.equal(ult.damageCategory, "aoe");
  assert.equal(ult.cooldown, 4);
  assert.ok(ult.appliesStatuses!.some((s) => s.statusId === "extra_command" && s.target === "self"), "grants Extra Command to self");
  assert.match(ult.deferredNote!, /Incineration tiles/, "records the missing tile generation");
  assert.match(ult.deferredNote!, /Accelerant/, "records the undefined ally-buff status");
});

test("B4: the Ultimate's V2/V6 levels wire ONLY the statuses that EXIST", () => {
  const v2 = VECTOR.skills.ultimate!.levels[2];
  const v6 = VECTOR.skills.ultimate!.levels[3];
  assert.deepEqual(v2.appliesStatuses!.map((s) => s.statusId), ["extra_command", "blazing_assault_ii"], "V2 adds Blazing Assault II to ALL allies");
  assert.equal(v2.appliesStatuses![1].target, "all_allies", "the all-allies targeting exists (research §3.28)");
  assert.deepEqual(v6.appliesStatuses!.map((s) => s.statusId), ["extra_command", "blazing_assault_ii", "apathetic_resistance"], "V6 adds Apathetic Resistance to self");
});

test("B4: EVERY status Vector's data references actually EXISTS in the registry", () => {
  // The hard invariant behind 'never approximate': a referenced id that does not resolve would make
  // `applyStatus` THROW at runtime.
  const defined = new Set(STATUS_DEFS.map((s) => s.id));
  const referenced = [
    ...Object.values(VECTOR.skills).flatMap((a) => Object.values(a!.levels)).flatMap((l) => (l.appliesStatuses ?? []).map((s) => s.statusId)),
  ];
  assert.ok(referenced.length > 0, "she does reference some statuses");
  for (const id of referenced) assert.ok(defined.has(id), `${id} is defined`);
});

// ============================================================ the passive: clauses in and out

test("B4: Perception Block's modelable clauses are wired (immunity + the at-max drain)", () => {
  const effects = VECTOR.passive.effects;
  assert.deepEqual(
    effects.find((e) => e.kind === "tile_debuff_immunity"),
    { kind: "tile_debuff_immunity", elements: ["burn"] },
    "clause 1 — immune to Burn-tile debuffs",
  );
  assert.deepEqual(
    effects.find((e) => e.kind === "turn_start_confectance_drain"),
    { kind: "turn_start_confectance_drain", atkPct: 0.1 },
    "clause 4 — +10% at max Confectance (Lv.1 has none of V5's extra slots)",
  );
});

test("B4: V5's 2 extra Confectance slots appear ONLY at passive Lv.3 (clause 5)", () => {
  const lv3 = VECTOR.passive.levels![3];
  const drain = lv3.find((e) => e.kind === "turn_start_confectance_drain");
  assert.deepEqual(drain, { kind: "turn_start_confectance_drain", atkPct: 0.1, extraSlots: 2, perExtraSlotAtkPct: 0.1 });
  assert.equal(VECTOR.passive.levels![1], undefined, "no Lv.2 entry is invented — only the resolved levels exist");
});

test("B4: the passive RECORDS its two unmodeiled clauses (Overheat Combustion, the Burn support count)", () => {
  const notes = VECTOR.passive.deferredNotes!;
  assert.match(notes[1], /Overheat Combustion/, "clause 2's undefined status is named");
  assert.match(notes[1], /Support Attack/, "clause 3's missing classification is named");
  assert.match(notes[3], /\+2 Support Attacks/, "Lv.3's raised support count is recorded");
});

// ============================================================ keys: wired vs recorded-only

test("B4: FK2 grants 3 Confectance at battle start (Qiongjiu's FK1 shape)", () => {
  const fk2 = VECTOR.fixedKeys.find((k) => k.id === "vector_fk2_splattering_pessimism")!;
  assert.deepEqual(fk2.battleStartEffects, [{ resource: "confectance", amount: 3 }]);
  assert.equal(fk2.deferredNote, undefined, "fully modelled");
});

test("B4: FK5 wires the tile reduction (−20% on a Burn tile) and records its missing half", () => {
  const fk5 = VECTOR.fixedKeys.find((k) => k.id === "vector_fk5_unfortunate_jinx")!;
  assert.deepEqual(fk5.damageReductionWhileOnTile, { value: 0.2, elements: ["burn"] });
  assert.match(fk5.deferredNote!, /end of the action/i, "the end-of-action stability/HP restore is recorded as missing");
});

test("B4: FK1/FK3/FK4/FK6 are RECORDED-ONLY, each with its concrete reason", () => {
  const byId = (id: string) => VECTOR.fixedKeys.find((k) => k.id === id)!;
  for (const id of ["vector_fk1_hospice_care", "vector_fk3_dispassionate_support", "vector_fk4_proliferating_despair", "vector_fk6_negative_motivation"]) {
    assert.ok(byId(id).deferredNote, `${id} carries a deferredNote`);
  }
  assert.match(byId("vector_fk1_hospice_care").deferredNote!, /TILE GENERATION|kill/i, "FK1: needs tile generation + an unkillable dummy");
  assert.match(byId("vector_fk3_dispassionate_support").deferredNote!, /SUPPORT ACTIONS/i, "FK3: wrong scope/count for the existing cleanse");
  assert.match(byId("vector_fk4_proliferating_despair").deferredNote!, /large target/i, "FK4: no large-target classification");
  assert.match(byId("vector_fk6_negative_motivation").deferredNote!, /Emergency Support/, "FK6: its payload status is undefined");
});

test("B4: NONE of the six Fixed Keys claims to be verified", () => {
  for (const k of VECTOR.fixedKeys) assert.equal(k.verified, false, `${k.id} is [SOURCE], not validated`);
});

// ============================================================ she SIMULATES

test("B4: Vector runs a real simulation and produces her own damage", () => {
  const run = (rotation: Scenario["team"][number]["rotation"]) =>
    simulateScenario(
      {
        version: 1,
        seed: 1,
        turns: 3,
        team: [{ characterId: "vector", rotation, applyDispatchStats: false }],
        dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 500, stability: 65, weaknesses: [], phase: null, cover: "none" },
      },
      REGISTRY,
    );

  const r = run(["basic", "active1", "active2"]);
  assert.equal(r.byCharacter.length, 1);
  assert.equal(r.byCharacter[0].id, "vector", "the damage is attributed to her");
  assert.ok(r.totals.damage > 0, `she deals damage (${r.totals.damage})`);
  assert.equal(r.totals.actions, 3, "one action per round");
});

test("B4: her Basic resolves against the confirmed damage formula (no weapon, no dispatch)", () => {
  // ATK 748, target DEF 500, no weakness: ceil(748²/1248 × 0.8) = ceil(448.3 × 0.8) = 359.
  const r = simulateScenario(
    {
      version: 1,
      seed: 1,
      turns: 1,
      team: [{ characterId: "vector", rotation: ["basic"], applyDispatchStats: false }],
      dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 500, stability: 65, weaknesses: [], phase: null, cover: "none" },
    },
    REGISTRY,
  );
  assert.equal(r.log[0].finalDamage, 359, "the formula reproduces exactly with her registered ATK");
});

test("B4: her Ultimate grants Extra Command, which yields an EXTRA main action", () => {
  const r = simulateScenario(
    {
      version: 1,
      seed: 1,
      turns: 1,
      team: [{ characterId: "vector", rotation: ["ultimate", "basic"], applyDispatchStats: false }],
      dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 500, stability: 65, weaknesses: [], phase: null, cover: "none" },
    },
    REGISTRY,
  );
  // The Ultimate (1 action) + the Extra Command it grants (1 more) = 2 actions in the same turn.
  assert.equal(r.totals.actions, 2, "Extra Command IS consumed as an extra main action");
});
